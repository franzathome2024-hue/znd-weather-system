// NOAA/CIRA AIWP reforecast provider (Pangu-Weather IFS, GraphCast IFS).
//
// These are NOT fetched live per-request — the global NetCDF files are 2–3 GB
// each and cannot be decoded inside a Cloudflare Worker. Instead a build-time
// script (scripts/fetch-aiwp.py) issues HTTP Range reads against the public
// S3 bucket, extracts 2-m temperature for the 27 Zamboanga del Norte LGUs at
// every 6-hour lead for the most recent 00Z/12Z initialisation, aggregates
// 6-hourly samples to PHT-calendar-day tmax/tmin, and writes a compact static
// JSON document to /public/data/aiwp-t2-zamboanga.json. This function loads
// that JSON (served via Workers Assets) and formats the values as additional
// per-model traces that pipeline.mergeWithAiwp() merges into each location's
// per-model daily values.
//
// The two models (Pangu IFS, GraphCast IFS) are **not** added to the
// independent-consensus median — their released weight licences are
// CC BY-NC-SA 4.0 (non-commercial), so we surface them as labelled
// non-commercial reference traces only. Attribution is shown in the source
// panel.
//
// If the JSON is missing or stale (older than STALE_HOURS), we return
// available=false and the pipeline silently drops those traces — the Open-Meteo
// consensus still works.

import { AIWP_MODEL_IDS, AIWP_STALE_HOURS } from "../models.js";

const AIWP_PATH = "/data/aiwp-t2-zamboanga.json";

/**
 * @param {Object} opts
 * @param {typeof fetch} [opts.fetchFn]
 * @param {string} [opts.assetUrl] - override for the static file URL
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>}
 */
export async function fetchAiwpExtract({ fetchFn = globalThis.fetch, assetUrl = AIWP_PATH, assetsFetch = null, origin = null } = {}) {
  try {
    let res;
    // When an ASSETS binding is available and we have an origin, build a
    // same-origin Request for the /data/... path so Workers Static Assets
    // serves the file. Otherwise fall back to a relative/absolute fetch.
    if (assetsFetch && origin) {
      const url = new URL(assetUrl, origin).toString();
      res = await assetsFetch(new Request(url));
    } else {
      res = await fetchFn(assetUrl, { cache: "no-cache" });
    }
    if (!res.ok) return { ok: false, error: `AIWP extract HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: `AIWP extract load failed: ${e.message || String(e)}` };
  }
}

/**
 * Align the AIWP static extract to the date axis produced by Open-Meteo for
 * this bundle. AIWP uses Asia/Manila calendar days directly (the precomputed
 * per-loc_daily keys are YYYY-MM-DD in PHT).
 *
 * @param {Object} extract - parsed /data/aiwp-t2-zamboanga.json
 * @param {string[]} dates - date axis in 'YYYY-MM-DD' PHT (from Open-Meteo)
 * @returns {{models: Array<{modelId: string, label: string, perLoc: Object, available: boolean, stale: boolean, attribution: string, license: string, consensusEligible: boolean, aliasGroup: string|null, exclusionReason: string|null}>}}
 */
export function parseAiwpExtract(extract, dates) {
  const fetchedAt = extract?.fetchedAt ? new Date(extract.fetchedAt) : null;
  const age_h = fetchedAt ? (Date.now() - fetchedAt.getTime()) / 3_600_000 : Infinity;
  const stale = age_h > AIWP_STALE_HOURS;
  const models = [];
  for (const modelId of AIWP_MODEL_IDS) {
    const m = extract?.models?.[modelId];
    const available = !!m?.available && !!m?.per_loc_daily;
    const perLoc = available ? m.per_loc_daily : {};
    models.push({
      modelId,
      shortLabel: m?.shortLabel || modelId,
      nativeResKm: m?.nativeResKm || 28,
      attribution: m?.attribution || "",
      license: m?.license || "",
      consensusEligible: !!m?.consensusEligible,
      aliasGroup: m?.aliasGroup || null,
      exclusionReason: m?.exclusionReason || null,
      init_utc: m?.init_utc || null,
      init_file: m?.init_file || null,
      file_last_modified: m?.file_last_modified || null,
      available,
      stale: stale || !available,
      age_h: isFinite(age_h) ? Math.round(age_h * 10) / 10 : null,
      perLoc,
      // Produce a per-location (tmax,tmin) array aligned to `dates` so callers
      // can zip it with Open-Meteo per-model traces easily.
      tracesByLoc: buildTraces(perLoc, dates),
    });
  }
  return { models, stale };
}

function buildTraces(perLoc, dates) {
  const out = {};
  for (const [locId, daily] of Object.entries(perLoc || {})) {
    const tmax = []; const tmin = [];
    for (const d of dates) {
      const entry = daily?.[d];
      tmax.push((entry && typeof entry.tmax === "number") ? entry.tmax : null);
      tmin.push((entry && typeof entry.tmin === "number") ? entry.tmin : null);
    }
    out[locId] = { tmax, tmin };
  }
  return out;
}
