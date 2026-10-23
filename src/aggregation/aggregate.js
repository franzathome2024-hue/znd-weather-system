// Numerical multi-model consensus aggregation.
// Pure functions — no network, no I/O — easy to unit test.
//
// Consensus daily high/low = TRIMMED INVERSE-MAD WEIGHTED MEAN of all valid
// ELIGIBLE per-model daily values after alias de-duplication.
//
// Why weighted over plain median: the user requested weighting and it's
// justified: PAGASA is the domestic official guidance (highest weight, 2.5),
// ECMWF IFS/UKMO/NCEP-AIGFS are premier global centres (1.5), other national
// centres carry 1.0, experimental AI (ECMWF AIFS) carries 0.5, and the
// non-commercial NOAA/CIRA AIWP traces are excluded from consensus entirely
// (consensusEligible=false). Median remains available as consensusFallback
// and is used whenever weighted input is too sparse.
//
// Robustness: before weighting we drop values outside
// median ± OUTLIER_K * MAD (median absolute deviation), where MAD is
// rescaled by 1.4826 to match Gaussian sigma. OUTLIER_K=2.5 keeps the trim
// gentle — it only rejects the obvious outliers (e.g. GFS vs everyone else on
// a given day). At least 3 surviving values are required for the weighted
// mean; with 1–2 values we fall back to the median.
//
// Highs and lows are aggregated independently; a model may contribute to one
// and not the other.
//
// Counts kept distinct:
//   - n_configured    : feeds in the registry
//   - n_successful    : feeds returning any valid numeric value for a
//                       (location, date, variable)
//   - n_contributors  : independent contributors after alias dedup AND
//                       outlier trimming (this is the consensus "model count")
//   - n_after_trim    : contributors retained after outlier trim
//   - consensusMethod : "weighted_mean" | "median" | null
//   - weightsApplied  : map of modelId -> weight actually used (post-trim)

import { ALIAS_GROUPS, IMPLEMENTED_MODELS } from "../models.js";

const OUTLIER_K = 2.5; // multiples of rescaled MAD; ~2.5 sigma for Gaussian
const MIN_FOR_WEIGHTED = 3;

const WEIGHT_BY_ID = new Map();
for (const m of IMPLEMENTED_MODELS) {
  if (m.consensusEligible && m.consensusWeight != null) {
    WEIGHT_BY_ID.set(m.id, Number(m.consensusWeight));
  }
}
function weightFor(modelId) {
  return WEIGHT_BY_ID.get(modelId) || 1.0;
}

export function medianOfSorted(sorted) {
  if (!sorted || sorted.length === 0) return null;
  const n = sorted.length;
  if (n % 2 === 1) return sorted[(n - 1) / 2];
  return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

export function quartiles(sorted) {
  if (!sorted || sorted.length === 0) return { q1: null, q3: null };
  if (sorted.length === 1) return { q1: sorted[0], q3: sorted[0] };
  const q = (p) => {
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
  };
  return { q1: q(0.25), q3: q(0.75) };
}

// Median absolute deviation (rescaled to Gaussian sigma ≈ 1.4826 * MAD).
export function madRescaled(sorted, median) {
  if (!sorted || sorted.length === 0) return null;
  const devs = sorted.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = medianOfSorted(devs);
  return mad * 1.4826;
}

/**
 * Robust weighted mean:
 *   1. Compute median of retained values.
 *   2. Compute rescaled MAD.
 *   3. Drop values further than OUTLIER_K * sigma from the median.
 *   4. If >= MIN_FOR_WEIGHTED remain, compute weighted mean with per-model
 *      consensusWeight; otherwise return the median.
 * @param {Array<{modelId:string, v:number}>} points
 * @returns {{consensus:number|null, method:string, used:Array<{modelId:string,v:number,w:number}>, trimmed:Array<{modelId:string,v:number,reason:string}>, n_after_trim:number, n_before_trim:number}}
 */
export function robustWeightedMean(points) {
  if (!points || points.length === 0) return { consensus: null, method: "none", used: [], trimmed: [], n_after_trim: 0, n_before_trim: 0 };
  const vals = points.map((p) => p.v).sort((a, b) => a - b);
  const med = medianOfSorted(vals);
  const sigma = madRescaled(vals, med) ?? 0;
  const used = []; const trimmed = [];
  for (const p of points) {
    const w = weightFor(p.modelId);
    if (sigma > 0 && Math.abs(p.v - med) > OUTLIER_K * sigma) {
      trimmed.push({ modelId: p.modelId, v: p.v, reason: `outlier_>${OUTLIER_K}sigma` });
    } else {
      used.push({ modelId: p.modelId, v: p.v, w });
    }
  }
  const n_before_trim = points.length;
  const n_after_trim = used.length;
  if (n_after_trim >= MIN_FOR_WEIGHTED) {
    let wsum = 0; let vsum = 0;
    for (const u of used) { wsum += u.w; vsum += u.w * u.v; }
    return { consensus: round1(vsum / wsum), method: "weighted_mean", used, trimmed, n_after_trim, n_before_trim };
  }
  // Fallback: median of the untrimmed set (robust against small n).
  return { consensus: round1(med), method: "median", used: points.map((p)=>({...p, w: weightFor(p.modelId)})), trimmed: [], n_after_trim: n_before_trim, n_before_trim };
}

// Build a set of "primary" model IDs across alias groups; primaries are the
// FIRST id listed in each ALIAS_GROUPS array. When two models in the same
// group produce byte-identical arrays for a given variable at a given
// location, all non-primary members are dropped.
const PRIMARY_BY_GROUP = {};
const GROUP_OF = {};
for (const [group, ids] of Object.entries(ALIAS_GROUPS)) {
  PRIMARY_BY_GROUP[group] = ids[0];
  for (const id of ids) GROUP_OF[id] = group;
}

function dedupeSeries(modelSeries) {
  // Returns {kept: [...series], dropped: [{modelId, reason, duplicateOf}]}
  const kept = [];
  const dropped = [];
  // Track a key per alias group — when a non-primary arrives with the same
  // serialized values as the already-seen primary, it is dropped.
  const seenByGroup = new Map(); // groupId -> {primaryId, key}

  for (const s of modelSeries) {
    const group = GROUP_OF[s.modelId];
    const primary = group ? PRIMARY_BY_GROUP[group] : null;
    const key = JSON.stringify(s.values);
    if (group) {
      if (s.modelId === primary) {
        seenByGroup.set(group, { primaryId: s.modelId, key });
        kept.push(s);
        continue;
      }
      // Non-primary: if primary already in this group with same key, drop.
      const seen = seenByGroup.get(group);
      if (seen && seen.key === key) {
        dropped.push({ modelId: s.modelId, reason: "alias_duplicate", duplicateOf: seen.primaryId });
        continue;
      }
      // If values differ (or primary not yet seen), keep it — model is
      // actually contributing different information today.
      kept.push(s);
      continue;
    }
    kept.push(s);
  }
  return { kept, dropped };
}

/**
 * Aggregate per-model daily values for a single (location, variable).
 * @param {Array<{modelId: string, values: Array<number|null>}>} modelSeries
 * @param {string[]} dates
 * @returns per-day records with consensus, n contributors, min, max, iqr,
 *          valuesByModel, dropped, qc_status.
 */
export function aggregateDaily(modelSeries, dates) {
  if (!modelSeries || modelSeries.length === 0) {
    return dates.map((d) => ({
      date: d, consensus: null, n: 0, n_successful: 0, n_configured: modelSeries?.length ?? 0,
      min: null, max: null, iqr: null,
      valuesByModel: {}, dropped: [], qc_status: "no_models",
    }));
  }

  const { kept, dropped } = dedupeSeries(modelSeries);

  return dates.map((date, i) => {
    const valuesByModel = {};
    const successful = [];
    const points = []; // {modelId, v} for valid numeric values post-dedup
    for (const s of kept) {
      const v = s.values[i];
      valuesByModel[s.modelId] = v ?? null;
      if (typeof v === "number" && Number.isFinite(v)) {
        points.push({ modelId: s.modelId, v });
        successful.push(s.modelId);
      }
    }
    const vals = points.map((p) => p.v).sort((a, b) => a - b);
    const n = points.length;
    if (n === 0) {
      return { date, consensus: null, n, n_successful: successful.length,
               n_configured: modelSeries.length,
               min: null, max: null, iqr: null,
               consensusMethod: null, weightsApplied: {},
               valuesByModel, dropped: dropped.map((d) => ({...d, date})), qc_status: "all_missing" };
    }
    const { q1, q3 } = quartiles(vals);
    const wm = robustWeightedMean(points);
    const weightsApplied = {};
    for (const u of wm.used) weightsApplied[u.modelId] = round3(u.w);
    return {
      date,
      consensus: wm.consensus,
      consensusMethod: wm.method,
      consensusN: wm.n_after_trim,
      n: wm.n_after_trim,                         // contributors after trim (convention: "consensus n")
      n_raw: wm.n_before_trim,                    // contributors after dedup, before trim
      n_successful: successful.length,
      n_configured: modelSeries.length,
      min: round1(vals[0]),
      max: round1(vals[vals.length - 1]),
      iqr: round1(q3 - q1),
      outlierTrimmed: wm.trimmed.map((t) => ({ ...t, date })),
      weightsApplied,
      valuesByModel,
      dropped: dropped.map((d) => ({...d, date})),
      qc_status: wm.n_after_trim < 3 ? "few_models" : "ok",
    };
  });
}

function round1(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  return Math.round(x * 10) / 10;
}
function round3(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  return Math.round(x * 1000) / 1000;
}

/**
 * Build a full per-location forecast bundle from per-model daily max/min.
 */
export function buildLocationForecast({ locationId, perModel, dates, retrievedAt }) {
  const tmaxSeries = perModel.map((m) => ({ modelId: m.modelId, runInit: m.runInit || null, values: m.tmax }));
  const tminSeries = perModel.map((m) => ({ modelId: m.modelId, runInit: m.runInit || null, values: m.tmin }));

  const tmaxAgg = aggregateDaily(tmaxSeries, dates);
  const tminAgg = aggregateDaily(tminSeries, dates);

  const days = dates.map((d, i) => {
    const hi = tmaxAgg[i];
    const lo = tminAgg[i];
    // Contributors after outlier trim (per variable) + union for location total
    const hiContribs = new Set(Object.keys(hi.weightsApplied || {}));
    const loContribs = new Set(Object.keys(lo.weightsApplied || {}));
    const allContribs = new Set([...hiContribs, ...loContribs]);
    const dropped = [...(hi.dropped||[]), ...(lo.dropped||[])].filter((v, i, arr) => arr.findIndex((x) => x.modelId === v.modelId && x.duplicateOf === v.duplicateOf) === i);
    const trimmed = [...(hi.outlierTrimmed||[]), ...(lo.outlierTrimmed||[])];
    return {
      date: d,
      tmax: {
        consensus: hi.consensus, n: hi.n, n_raw: hi.n_raw, n_successful: hi.n_successful,
        min: hi.min, max: hi.max, iqr: hi.iqr,
        consensusMethod: hi.consensusMethod, weightsApplied: hi.weightsApplied,
        valuesByModel: hi.valuesByModel,
        qc_status: hi.qc_status,
      },
      tmin: {
        consensus: lo.consensus, n: lo.n, n_raw: lo.n_raw, n_successful: lo.n_successful,
        min: lo.min, max: lo.max, iqr: lo.iqr,
        consensusMethod: lo.consensusMethod, weightsApplied: lo.weightsApplied,
        valuesByModel: lo.valuesByModel,
        qc_status: lo.qc_status,
      },
      n_contributing: allContribs.size,
      n_contributing_hi: hiContribs.size,
      n_contributing_lo: loContribs.size,
      n_successful: hi.n_successful + lo.n_successful,
      n_configured: hi.n_configured,
      dropped_duplicates: dropped,
      outlier_trimmed: trimmed,
      spread_c: round1(Math.max(
        (hi.max ?? -Infinity) - (hi.min ?? Infinity),
        (lo.max ?? -Infinity) - (lo.min ?? Infinity),
      )),
      qc_status: worstQc(hi.qc_status, lo.qc_status),
    };
  });

  return {
    locationId,
    dates,
    days,
    perModel: perModel.map((m) => ({ modelId: m.modelId, runInit: m.runInit || null, status: m.status })),
    retrievedAt,
    version: "znd-weather-v0.1",
  };
}

function worstQc(a, b) {
  const rank = { ok: 0, few_models: 1, all_missing: 2, no_models: 3 };
  return (rank[a] > rank[b] ? a : b);
}
