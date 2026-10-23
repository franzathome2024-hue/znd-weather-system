#!/usr/bin/env python3
"""Fetch the latest NOAA/CIRA AIWP Pangu-Weather IFS and GraphCast IFS 2-m
temperature reforecasts from the public S3 bucket and write a compact static
JSON file consumed by the Cloudflare Worker at runtime.

Why this exists
---------------
The NetCDF/HDF5 files on noaa-oar-mlwp-data are 2–3 GB each (global grids). A
Cloudflare Worker cannot download and decode them per request and cannot use
native NetCDF/HDF tooling at runtime. This script:

  1. Lists the anonymous S3 bucket to pick the two most recent 00Z and 12Z
     initializations for each model.
  2. Uses HTTP Range requests via h5py to read 2-m temperature for a tight
     Zamboanga del Norte bounding box (plus 27 exact LGU grid cells) directly
     from the remote NetCDF without downloading the whole file.
  3. Converts Kelvin to Celsius, aligns forecast lead times to Asia/Manila
     calendar days (D0 = today PH time), computes daily tmax/tmin from the
     6-hourly samples.
  4. Writes the result as a static JSON document under public/data/ so the
     Worker can read it with a plain fetch() and merge the model traces into
     the per-location forecast bundles.
  5. Saves machine-readable verification fixtures under docs/verification/.

Run with:
    python3 scripts/fetch-aiwp.py              # fetch + write JSON
    python3 scripts/fetch-aiwp.py --dry-run    # inspect only, don't write

The script is designed to be run manually before `npm run deploy` (or wired up
to a build step). It does NOT run inside the Worker. It requires h5py + numpy.

Public, anonymous, no-AWS-credentials access:
  https://noaa-oar-mlwp-data.s3.amazonaws.com/
  PANG_v100_IFS/<YYYY>/<mmdd>/PANG_v100_IFS_<YYYYmmddhh>_f000_f240_06.nc
  GRAP_v100_IFS/<YYYY>/<mmdd>/GRAP_v100_IFS_<YYYYmmddhh>_f000_f240_06.nc

License / attribution
---------------------
- NOAA/CIRA AIWP archive: U.S. Government work (NOAA), publicly redistributed.
  Citation: Radford et al. 2025, BAMS, https://doi.org/10.1175/BAMS-D-24-0057.1
- Pangu-Weather weights: CC BY-NC-SA 4.0 (non-commercial). The archive is
  operated by NOAA; the model itself is non-commercial per its authors.
  We surface this in the UI and do not treat it as independent consensus.
- GraphCast (operational) weights on the AIWP archive reflect Google DeepMind
  GraphCast; redistribution terms on the original checkpoint remain BY-NC-SA
  4.0 (non-commercial) per the metadata currently packaged with the model
  (see docs/verification/aiwp-notes-2026-10-23.md). Surface for non-commercial
  attribution only, excluded from independent consensus.
"""
import argparse
import datetime as dt
import io
import json
import os
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

import h5py
import numpy as np

REPO = Path(__file__).resolve().parent.parent
PUBLIC_DATA = REPO / "public" / "data"
DOCS_VERIF = REPO / "docs" / "verification"

BUCKET = "noaa-oar-mlwp-data"
BASE_URL = f"https://{BUCKET}.s3.amazonaws.com"

# AIWP uses a fixed 0.25° global lat/lon grid, latitude N→S.
DLAT = 0.25
DLON = 0.25

# Tight Zamboanga del Norte bbox for extracting PH regional values.
# We still read point values at the exact LGU grid cells; this bbox is used
# to sanity-check coverage and provide a few extra neighbour cells.
ZN_BBOX = {"lat_s": 7.2, "lat_n": 8.8, "lon_w": 121.9, "lon_e": 123.7}

MODELS = {
    "pangu_ifs": {
        "prefix": "PANG_v100_IFS",
        "file_pattern": "PANG_v100_IFS_{init:%Y%m%d%H}_f000_f240_06.nc",
        "short_label": "Pangu-Weather IFS",
        "native_res_km": 28,
        "product_type": "ai_deterministic",
        "license": "CC BY-NC-SA 4.0 (non-commercial; NOAA/CIRA AIWP redistribution)",
        "attribution": "Pangu-Weather (Bi et al., Nature 2023) via NOAA/CIRA AIWP archive (Radford et al. 2025, BAMS). Public S3: noaa-oar-mlwp-data.s3.amazonaws.com.",
        "consensus_eligible": False,
        "alias_group": "pangu_ifs",
        "exclusion_reason": "Non-commercial weights (BY-NC-SA 4.0); surfaced for transparency/attribution but excluded from the independent-consensus median so the system can remain deployable into non-commercial and public-facing contexts without ambiguity.",
    },
    "graphcast_ifs": {
        "prefix": "GRAP_v100_IFS",
        "file_pattern": "GRAP_v100_IFS_{init:%Y%m%d%H}_f000_f240_06.nc",
        "short_label": "GraphCast IFS",
        "native_res_km": 28,
        "product_type": "ai_deterministic",
        "license": "CC BY-NC-SA 4.0 (non-commercial per checkpoint metadata; NOAA/CIRA AIWP redistribution)",
        "attribution": "GraphCast Operational (Lam et al., Science 2023; Google DeepMind) via NOAA/CIRA AIWP archive (Radford et al. 2025, BAMS). Public S3: noaa-oar-mlwp-data.s3.amazonaws.com.",
        "consensus_eligible": False,
        "alias_group": "graphcast_ifs",
        "exclusion_reason": "Non-commercial weights (BY-NC-SA 4.0); surfaced for transparency/attribution but excluded from the independent-consensus median.",
    },
}

# -------- HTTP range file for h5py --------
class HTTPRangeFile:
    """Read-only binary file-like backed by HTTP Range requests."""
    def __init__(self, url):
        self.url = url
        req = urllib.request.Request(url, method="HEAD")
        with urllib.request.urlopen(req, timeout=30) as r:
            self.size = int(r.headers["Content-Length"])
        self.pos = 0
    def seekable(self): return True
    def seek(self, pos, whence=0):
        if whence == 0: self.pos = pos
        elif whence == 1: self.pos += pos
        elif whence == 2: self.pos = self.size + pos
        self.pos = max(0, min(self.pos, self.size))
        return self.pos
    def tell(self): return self.pos
    def read(self, n=-1):
        if n is None or n < 0: n = self.size - self.pos
        n = int(min(n, self.size - self.pos))
        if n <= 0: return b""
        req = urllib.request.Request(
            self.url,
            headers={"Range": f"bytes={self.pos}-{self.pos+n-1}", "User-Agent": "znd-weather/0.1 aiwp-fetch"},
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        self.pos += len(data)
        return data

# -------- S3 listing --------
def s3_list(prefix):
    out = []
    marker = None
    while True:
        url = f"{BASE_URL}/?list-type=2&prefix={urllib.parse.quote(prefix)}&max-keys=1000"
        if marker:
            url += f"&continuation-token={urllib.parse.quote(marker)}"
        with urllib.request.urlopen(url, timeout=30) as r:
            xml = r.read()
        root = ET.fromstring(xml)
        ns = "{http://s3.amazonaws.com/doc/2006-03-01/}"
        for c in root.findall(f"{ns}Contents"):
            key = c.findtext(f"{ns}Key")
            lm = c.findtext(f"{ns}LastModified")
            sz = int(c.findtext(f"{ns}Size"))
            out.append((key, lm, sz))
        if root.findtext(f"{ns}IsTruncated") == "true":
            marker = root.findtext(f"{ns}NextContinuationToken")
        else:
            break
    return out

def pick_latest_inits(prefix, max_age_h=28):
    """Return sorted recent init datetimes (00Z/12Z) within last max_age_h hours.

    The file naming is MMMP_vNNN_IFS/YYYY/mmdd/<file> for init hh in {00,12}.
    We look through the last few day prefixes and pick the newest files that
    exist.
    """
    now = dt.datetime.now(dt.timezone.utc)
    # Walk back over the past 3 calendar days to find inits.
    inits = []
    for days_back in range(0, 4):
        day = now - dt.timedelta(days=days_back)
        for hh in ("12", "00"):  # check 12Z first (more recent for today/yesterday)
            day_prefix = f"{prefix}/{day:%Y}/{day:%m%d}/"
            # List this day; we cache the listing per day to save round-trips.
            for key, lm, sz in s3_list(day_prefix):
                fname = key.rsplit("/", 1)[-1]
                # fname matches e.g. PANG_v100_IFS_2026102212_f000_f240_06.nc
                if "_f000_f240_06.nc" not in fname:
                    continue
                try:
                    init_str = fname.split("_")[-2].split("_")[0][:-10]  # e.g. 2026102212
                    # safer: parse the block before _f000
                    stem = fname[: fname.index("_f000")]
                    init_str = stem[-10:]
                    init_dt = dt.datetime.strptime(init_str, "%Y%m%d%H").replace(tzinfo=dt.timezone.utc)
                except Exception:
                    continue
                age_h = (now - init_dt).total_seconds() / 3600
                if age_h <= max_age_h:
                    inits.append((init_dt, key, sz, lm))
    # Sort newest first, dedupe by init datetime (00Z/12Z present/absent)
    inits.sort(key=lambda x: x[0], reverse=True)
    seen = set(); out = []
    for init_dt, key, sz, lm in inits:
        if init_dt in seen: continue
        seen.add(init_dt); out.append((init_dt, key, sz, lm))
    return out

# -------- Reading NetCDF over HTTP Range --------
def latlon_to_idx(lat, lon):
    # Grid: lat 90..-90 step -0.25, lon 0..359.75 step 0.25
    i_lat = int(round((90.0 - lat) / DLAT))
    # Lon in 0..360
    lon360 = lon % 360
    i_lon = int(round(lon360 / DLON))
    return i_lat, i_lon

def read_aiwp_file(url, locations):
    """Open a NetCDF over HTTP Range and extract t2 at LGU points + lead times."""
    f = HTTPRangeFile(url)
    with h5py.File(f, "r") as ds:
        lat = ds["latitude"][:]
        lon = ds["longitude"][:]
        t2v = ds["t2"]
        units = bytes(t2v.attrs["units"]).decode() if isinstance(t2v.attrs.get("units"), bytes) else str(t2v.attrs.get("units", ""))
        assert units.lower() == "k", f"expected t2 units Kelvin, got {units!r}"
        time_var = ds["time"]
        time_vals = time_var[:]  # seconds since epoch
        time_units = bytes(time_var.attrs["units"]).decode()
        # Epoch from attrs — "seconds since 1970-1-1"
        epoch = dt.datetime(1970, 1, 1, tzinfo=dt.timezone.utc)
        leads = [epoch + dt.timedelta(seconds=int(s)) for s in time_vals]
        # Indices for each location
        loc_indices = []
        for loc in locations:
            ila, ilo = latlon_to_idx(loc["lat"], loc["lon"])
            ila = max(0, min(ila, len(lat)-1))
            ilo = max(0, min(ilo, len(lon)-1))
            loc_indices.append((loc["id"], ila, ilo, float(lat[ila]), float(lon[ilo])))
        # For each lead time, read a scalar for every LGU.
        # t2 shape is (lead, lat, lon). h5py's fancy indexing triggers chunk reads
        # (each lead is a chunk, so this makes one byte-range GET per lead).
        per_loc = {lid: [] for lid, *_ in loc_indices}
        grid_meta = []
        for li, valid_dt in enumerate(leads):
            for lid, ila, ilo, glat, glon in loc_indices:
                v = float(t2v[li, ila, ilo])
                # NaN/inf and HDF5 fill values indicate missing data (e.g. first
                # lead time at init before model has spun up, or land-mask).
                is_bad = not np.isfinite(v) or v > 400 or v < 100
                per_loc[lid].append({
                    "valid_utc": valid_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "t2_k": None if is_bad else v,
                    "t2_c": None if is_bad else round(v - 273.15, 2),
                })
            grid_meta.append({"lead_idx": li, "valid_utc": valid_dt.strftime("%Y-%m-%dT%H:%M:%SZ")})
        return {
            "shape": list(t2v.shape),
            "chunks": list(t2v.chunks),
            "units": units,
            "leads_utc": [d.strftime("%Y-%m-%dT%H:%M:%SZ") for d in leads],
            "per_loc": per_loc,
            "grid_meta": {
                "lat_range": [float(lat[0]), float(lat[-1])],
                "lon_range": [float(lon[0]), float(lon[-1])],
                "dlat": DLAT, "dlon": DLON,
                "loc_grid_points": [
                    {"id": lid, "lat_idx": ila, "lon_idx": ilo, "grid_lat": glat, "grid_lon": glon}
                    for lid, ila, ilo, glat, glon in loc_indices
                ],
            },
        }

# -------- Aggregate to daily tmax/tmin in PHT --------
def daily_aggregate(leads_utc, t2_c_series):
    """Given a list of 6-hourly valid_utc strings and corresponding Celsius t2
    values, compute per-PHT-day tmax/tmin arrays aligned to Asia/Manila dates
    (UTC+8). 24h accumulated max/min uses 00,06,12,18 UTC = 08,14,20,02+1d PHT,
    which is one calendar day's weather in PH time."""
    pht = dt.timezone(dt.timedelta(hours=8))
    by_day = {}  # date -> list of (time, t2_c)
    for vstr, tv in zip(leads_utc, t2_c_series):
        dv = dt.datetime.strptime(vstr, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc).astimezone(pht)
        d = dv.date().isoformat()
        by_day.setdefault(d, []).append(tv)
    days = sorted(by_day.keys())
    out = {}
    for d in days:
        vals = [v for v in by_day[d] if v is not None]
        if not vals:
            out[d] = {"tmax": None, "tmin": None, "n": 0}
            continue
        out[d] = {
            "tmax": round(max(vals), 2),
            "tmin": round(min(vals), 2),
            "n": len(vals),
        }
    return out

def model_trace(model_meta, per_loc_reading, fetched_at):
    """Transform raw h5py reading into per-location daily series."""
    per_loc = {}
    for loc_id, samples in per_loc_reading["per_loc"].items():
        leads = per_loc_reading["leads_utc"]
        t2_c = [s["t2_c"] for s in samples]
        per_loc[loc_id] = daily_aggregate(leads, t2_c)
    return {
        "init_utc": model_meta["init_utc"],
        "init_file": model_meta["init_file"],
        "file_size_bytes": model_meta["file_size"],
        "file_last_modified": model_meta["file_last_modified"],
        "units_source": model_meta["units_source"],
        "native_grid": per_loc_reading["grid_meta"],
        "leads_utc": per_loc_reading["leads_utc"],
        "per_loc_daily": per_loc,
        "attribution": model_meta["attribution"],
        "license": model_meta["license"],
        "shortLabel": model_meta["short_label"],
        "nativeResKm": model_meta["native_res_km"],
        "consensusEligible": model_meta["consensus_eligible"],
        "aliasGroup": model_meta["alias_group"],
        "exclusionReason": model_meta["exclusion_reason"],
        "retrievedAt": fetched_at,
    }

def run(dry_run=False, init_hours=28):
    # Lazy import of LOCATIONS to keep the script standalone.
    sys.path.insert(0, str(REPO / "src"))
    import importlib.util
    spec = importlib.util.spec_from_file_location("locations_mod", REPO / "src" / "locations.js")
    # locations.js is ES module JS, not Python. Read the JSON literal out of it instead.
    import re
    loc_text = (REPO / "src" / "locations.js").read_text(encoding="utf-8")
    # We only need id/lat/lon. Parse a simpler JS subset using regex on LOCATIONS entries.
    entries = []
    entry_re = re.compile(r'\{\s*id:\s*"([^"]+)"[^}]*?lat:\s*([0-9.+-]+)[^}]*?lon:\s*([0-9.+-]+)', re.S)
    for m in entry_re.finditer(loc_text):
        entries.append({"id": m.group(1), "lat": float(m.group(2)), "lon": float(m.group(3))})
    assert len(entries) == 27, f"expected 27 LGUs parsed, got {len(entries)}"
    LOCATIONS = entries
    fetched_at = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    out = {
        "version": "aiwp-v0.1",
        "description": "NOAA/CIRA AIWP reforecasts (Pangu-Weather IFS, GraphCast IFS) 2-m temperature for Zamboanga del Norte LGUs.",
        "fetchedAt": fetched_at,
        "source": {
            "bucket": f"s3://{BUCKET}",
            "docsUrl": "https://registry.opendata.aws/aiwp/",
            "cite": "Radford et al. 2025, BAMS, https://doi.org/10.1175/BAMS-D-24-0057.1",
            "caveat": "Pre-processed static extract; not real-time. Values are nearest-grid-point 2-m temperature, bilinear interpolation between grid cells is display-only. 6-hourly samples aggregated to PHT calendar-day tmax/tmin.",
        },
        "grid": {"lat_step": DLAT, "lon_step": DLON, "shape_per_lead": [721, 1440]},
        "models": {},
        "locations": [{"id": l["id"], "lat": l["lat"], "lon": l["lon"]} for l in LOCATIONS],
    }
    for model_id, meta in MODELS.items():
        print(f"\n=== {meta['short_label']} ({model_id}) ===")
        print("Listing recent inits …")
        inits = pick_latest_inits(meta["prefix"], max_age_h=init_hours)
        if not inits:
            print("  (no recent init found; marking unavailable)")
            out["models"][model_id] = {
                "shortLabel": meta["short_label"],
                "available": False,
                "reason": f"No init files younger than {init_hours}h in {meta['prefix']}/.",
                "nativeResKm": meta["native_res_km"],
                "attribution": meta["attribution"],
                "license": meta["license"],
            }
            continue
        # Pick the most recent init
        init_dt, key, sz, lm = inits[0]
        url = f"{BASE_URL}/{key}"
        print(f"  Latest init: {init_dt:%Y-%m-%d %H}Z  file={key}  size={sz/1e9:.2f} GB  last_mod={lm}")
        if dry_run:
            out["models"][model_id] = {
                "available": True,
                "init_utc": init_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "init_file": key,
                "dryRun": True,
                "nativeResKm": meta["native_res_km"],
                "attribution": meta["attribution"],
                "license": meta["license"],
            }
            continue
        print(f"  Reading remote NetCDF over HTTP Range (t2 only, 27 LGUs) …")
        meta_for_trace = {
            "init_utc": init_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "init_file": key,
            "file_size": sz,
            "file_last_modified": lm,
            "units_source": "K",
            "short_label": meta["short_label"],
            "native_res_km": meta["native_res_km"],
            "attribution": meta["attribution"],
            "license": meta["license"],
            "consensus_eligible": meta["consensus_eligible"],
            "alias_group": meta["alias_group"],
            "exclusion_reason": meta["exclusion_reason"],
        }
        reading = read_aiwp_file(url, LOCATIONS)
        out["models"][model_id] = {
            "available": True,
            **model_trace(meta_for_trace, reading, fetched_at),
        }
        # Sanity: Dipolog t2 should be ~295–308 K (22–35 °C) at all leads
        samples = out["models"][model_id]["per_loc_daily"].get("dipolog", {})
        print(f"  Dipolog daily: {json.dumps(samples)[:200]}")

    out_path = PUBLIC_DATA / "aiwp-t2-zamboanga.json"
    if not dry_run:
        PUBLIC_DATA.mkdir(parents=True, exist_ok=True)
        DOCS_VERIF.mkdir(parents=True, exist_ok=True)
        with out_path.open("w", encoding="utf-8") as f:
            json.dump(out, f, indent=2, ensure_ascii=False)
        # Verification fixture
        fixture_path = DOCS_VERIF / f"aiwp-fetch-{dt.datetime.now(dt.timezone.utc):%Y-%m-%d}.json"
        with fixture_path.open("w", encoding="utf-8") as f:
            json.dump({
                "fetchedAt": fetched_at,
                "models": {m: {k: v for k, v in d.items() if k != "per_loc_daily"} for m, d in out["models"].items()},
            }, f, indent=2)
        print(f"\nWrote {out_path.relative_to(REPO)}  ({out_path.stat().st_size/1024:.1f} KB)")
        print(f"Wrote fixture {fixture_path.relative_to(REPO)}")
    else:
        print("\n(dry-run: no files written)")
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--init-hours", type=int, default=28, help="Max init age to accept (hours)")
    args = ap.parse_args()
    run(dry_run=args.dry_run, init_hours=args.init_hours)

if __name__ == "__main__":
    main()
