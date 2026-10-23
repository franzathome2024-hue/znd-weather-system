// Load the pre-processed NOAA/CIRA AIWP static extract and merge its Pangu +
// GraphCast traces into a forecast bundle produced by runPipeline().
//
// This is a *post-processing* step that adds non-consensus reference traces
// (valuesByModel + per-model metadata) for the two AI models. It does NOT
// change the multi-model consensus median — AIWP models are labelled as
// non-commercial and excluded from the median by consensusEligible=false, in
// line with their BY-NC-SA 4.0 weight licences.

import { fetchAiwpExtract, parseAiwpExtract } from "./providers/aiwp.js";
import { IMPLEMENTED_MODELS } from "./models.js";

/**
 * Decorate a bundle in-place with AIWP traces.
 *
 * @param {Object} bundle - forecast bundle returned by runPipeline()
 * @param {Object} opts
 * @param {typeof fetch} [opts.fetchFn] - fallback fetch (tests)
 * @param {(req: Request)=>Promise<Response>} [opts.assetsFetch] - CF Workers ASSETS binding
 * @param {string} [opts.origin] - origin for constructing same-origin asset URL
 * @param {string} [opts.assetPath] - override for static file path
 */
export async function mergeAiwpIntoBundle(bundle, { fetchFn, assetsFetch, origin, assetPath } = {}) {
  const out = {
    available: false,
    stale: true,
    error: null,
    fetchedAt: null,
    models: [],
  };
  try {
    if (!bundle || !Array.isArray(bundle.locations)) {
      out.error = "no bundle to merge into";
      bundle.aiwp = out;
      return bundle;
    }
    const sample = bundle.locations.find((l) => Array.isArray(l.dates) && l.dates.length);
    const dates = sample?.dates || [];
    const res = await fetchAiwpExtract({
      fetchFn: fetchFn || globalThis.fetch?.bind(globalThis),
      assetUrl: assetPath || "/data/aiwp-t2-zamboanga.json",
      assetsFetch, origin,
    });
    if (!res.ok) {
      out.error = res.error || "unknown load error";
      bundle.aiwp = out;
      return bundle;
    }
    const parsed = parseAiwpExtract(res.data, dates);
    out.fetchedAt = res.data?.fetchedAt || null;
    out.stale = !!parsed.stale;
    out.available = parsed.models.some((m) => m.available);
    if (!Array.isArray(bundle.perModelMeta)) bundle.perModelMeta = [];
    for (const m of parsed.models) {
      out.models.push({
        modelId: m.modelId,
        shortLabel: m.shortLabel,
        available: m.available,
        stale: m.stale,
        consensusEligible: m.consensusEligible,
        attribution: m.attribution,
        license: m.license,
        init_utc: m.init_utc,
        age_h: m.age_h,
        exclusionReason: m.exclusionReason,
      });
      if (m.available) {
        const traces = m.tracesByLoc || {};
        for (const loc of bundle.locations) {
          if (loc.unavailable || loc.error) continue;
          const t = traces[loc.locationId];
          if (!t) continue;
          for (let di = 0; di < (loc.days || []).length; di++) {
            const day = loc.days[di];
            if (!day) continue;
            day.tmax = day.tmax || { valuesByModel: {}, consensus: null, n: 0, min: null, max: null, iqr: null };
            day.tmin = day.tmin || { valuesByModel: {}, consensus: null, n: 0, min: null, max: null, iqr: null };
            day.tmax.valuesByModel = day.tmax.valuesByModel || {};
            day.tmin.valuesByModel = day.tmin.valuesByModel || {};
            const tv = t.tmax[di];
            if (typeof tv === "number" && Number.isFinite(tv)) day.tmax.valuesByModel[m.modelId] = tv;
            const sv = t.tmin[di];
            if (typeof sv === "number" && Number.isFinite(sv)) day.tmin.valuesByModel[m.modelId] = sv;
          }
        }
      }
      bundle.perModelMeta.push({
        modelId: m.modelId,
        shortLabel: m.shortLabel,
        nativeResKm: m.nativeResKm,
        attribution: m.attribution,
        license: m.license,
        consensusEligible: m.consensusEligible,
        aliasGroup: m.aliasGroup,
        exclusionReason: m.exclusionReason,
        source: "aiwp_static_extract",
        status: m.stale ? "stale" : (m.available ? "ok" : "missing"),
        init_utc: m.init_utc,
      });
    }
  } catch (e) {
    out.error = e.message || String(e);
  }
  bundle.aiwp = out;
  return bundle;
}
