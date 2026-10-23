# AIWP (NOAA/CIRA) Pangu- & GraphCast-IFS integration notes — 2026-10-23

## Decision
Integrated **both** NOAA/CIRA AIWP `PANG_v100_IFS` (Pangu-Weather IFS) and
`GRAP_v100_IFS` (GraphCast IFS) 2-m temperature traces into the Zamboanga
del Norte weather system, but as **non-consensus reference traces only**
because both model weights are released under **CC BY-NC-SA 4.0**
(non-commercial). Surfaces with a visible "AI ref · non-commercial" badge
and full attribution in the models panel. The existing Open-Meteo
independent-consensus median (ECMWF IFS / ICON / GFS / AIGFS / UKMO /
ARPEGE / GEM / JMA / GFS013) is **not modified**.

## Why pre-processing (no live reads)
The global NetCDFs are 2–3 GB each. A Cloudflare Worker cannot:
  - Download that per request,
  - Use native NetCDF/HDF tooling (h5py/netCDF4) — no native libs in Workers,
  - Issue dozens of HTTP Range reads against HDF5 B-trees within CPU/memory limits.

So the approach is:
  1. A Python build-time script `scripts/fetch-aiwp.py` lists `s3://noaa-oar-mlwp-data/`,
     picks the most recent 00/12Z init per model, opens each NetCDF over HTTP Range
     (custom `HTTPRangeFile` + h5py, no full download), extracts **nearest-grid-point**
     2-m temperature for all 27 ZN LGUs at every 6-h lead (41 leads, 0–240 h),
     aggregates 6-hourly samples into **PHT-calendar-day tmax/tmin**, and writes
     `public/data/aiwp-t2-zamboanga.json` (~83 KB at build).
  2. At runtime, the Worker fetches that static JSON via its ASSETS binding and
     merges per-location values into each day's `valuesByModel` via
     `src/aiwp.js::mergeAiwpIntoBundle()`. Values are never used to recompute
     the consensus median.
  3. If the static file is missing, stale, or fails to load, `bundle.aiwp`
     carries the error and the rest of the bundle is served unchanged.

## Verification on 2026-10-22T12Z init (fetched 2026-10-23 ~06:30 UTC)
Dipolog PHT-calendar-day tmax/tmin (°C):

| Date       | Pangu IFS hi/lo | GraphCast IFS hi/lo |
|------------|-----------------|---------------------|
| 2026-10-23 | 29.0 / 26.5     | 28.7 / 25.7         |
| 2026-10-24 | 28.5 / 26.5     | 27.7 / 25.8         |
| 2026-10-25 | 28.9 / …        | 28.3 / …            |

Values are physically plausible tropical 2-m temperatures, converted from Kelvin
(K→°C) only after verifying `t2.units == 'K'` and `t2.long_name == '2 metre
temperature'`. Missing/spin-up values (f000 for GraphCast at lead=0, which is
fill 9.97e36) are filtered to `null`.

Grid confirmed: 0.25° global, lat 90→-90 N→S, lon 0→359.75; 41 leads 0–240 h at
6-h step; init cadence 00Z/12Z daily; publication latency ~8 h post-init
(00Z file ~08:22Z, 12Z file ~20:22Z). PH bbox extract footprint per init is
~526 KB; 14-in rolling window ~7.2 MB; current 1-init LGU-only extract is 83 KB.

## Licence call (non-consensus)
  - **Pangu-Weather weights**: CC BY-NC-SA 4.0; README explicitly states
    "The commercial use of these models is forbidden." Verified from
    https://github.com/198808xc/Pangu-Weather README (line: "BY-NC-SA 4.0").
  - **GraphCast checkpoint metadata** as currently packaged on the AIWP archive
    still declares CC BY-NC-SA 4.0. Google DeepMind's August 6, 2026
    relicensure to CC BY 4.0 applies to the new WeatherNext Graph repository
    (weathernext), not to the v1.0 GraphCast checkpoint redistributed here;
    we therefore keep GraphCast non-commercial-labelled until the checkpoint
    metadata shipped on noaa-oar-mlwp-data is updated.
  - The **NOAA/CIRA archive itself** is U.S. Government work, publicly
    redistributed with citation: Radford et al. 2025, BAMS
    (https://doi.org/10.1175/BAMS-D-24-0057.1).

Because the existing app is deployed publicly via Cloudflare Workers and the
licence text for both models prohibits commercial use without a clear path to
classify the deployment, we:
  - Mark both models `consensusEligible: false`.
  - Surface them with an explicit "AI ref · non-commercial" badge and
    attribution/licence text in the model table.
  - Keep them out of ALIAS_GROUPS dedup and out of MODEL_API_IDS (which feeds
    Open-Meteo).

## Files added/modified
  - `scripts/fetch-aiwp.py`            — pre-processing script (HTTP Range → JSON)
  - `src/providers/aiwp.js`            — static-extract loader + date-axis parser
  - `src/aiwp.js`                      — bundle merge (valuesByModel + metadata)
  - `src/models.js`                    — two new registry entries `static_extract`,
                                         `AIWP_MODEL_IDS`, `AIWP_STALE_HOURS`,
                                         IMPLEMENTED_MODELS now includes
                                         static-extract entries but MODEL_API_IDS
                                         filters to Open-Meteo feeds only.
  - `src/worker/index.js`              — AIWP merge applied after every cache hit
                                         and fresh pipeline run; ASSETS binding
                                         used to serve the static JSON.
  - `public/app.js`, `public/styles.css` — UI badge + styling for non-consensus rows.
  - `public/data/aiwp-t2-zamboanga.json` — build output (~83 KB, not 2+ GB global file)
  - `docs/verification/aiwp-fetch-2026-10-23.json` — verification fixture
  - `test/aiwp.test.js`, `test/aiwp-e2e.test.js` — unit + e2e tests.

## Tests
`npm test` → 62 passing, 0 failing (14 pre-existing + 48 existing + 2 new AIWP
suites — after the added tests; net +2 test files, +2 test cases counted).

## How to refresh the static extract
```
python3 scripts/fetch-aiwp.py        # ~60 s, writes public/data/aiwp-t2-zamboanga.json
python3 scripts/fetch-aiwp.py --dry-run   # inspect listing only
npm test                              # validate
npm run build                         # no-op but confirms frontend bundles
# Deploy: wrangler deploy (gated behind existing review flow, not auto-deployed)
```

## Operational caveats
  - NOT real-time — publication latency ≈ 8 h and the extract is refreshed only
    when a deployer (or future CI cron) re-runs `scripts/fetch-aiwp.py`. The
    bundle's `aiwp.stale` flag becomes true when the static file is older
    than `AIWP_STALE_HOURS` (36 h).
  - National PH overlay is **not** generated from these AIWP extracts (LGU
    points only in the static file). Extending the pre-process to a PH-wide
    0.25° grid (~526 KB/init) is a straightforward follow-up; deferred to
    keep this PR minimal.
  - If only one model's file is present on a given day (the other still
    uploading), the script returns whichever it found and marks the missing
    model `available: false` — pipeline degrades gracefully.
