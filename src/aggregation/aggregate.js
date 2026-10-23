// Numerical multi-model consensus aggregation.
// Pure functions — no network, no I/O — easy to unit test.
//
// Consensus daily high/low = MEDIAN of all valid ELIGIBLE per-model daily
// values after alias de-duplication.  Highs and lows are aggregated
// independently; a model may contribute to one and not the other.
//
// Counts kept distinct:
//   - n_configured    : feeds in the registry (all 15 targets)
//   - n_successful    : feeds returning any valid numeric value for a
//                       (location, date, variable)
//   - n_contributors  : independent contributors after alias dedup
//                       (this is the consensus "model count")

import { ALIAS_GROUPS } from "../models.js";

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
    const successful = []; // model ids with valid numeric value at this index
    const vals = [];
    for (const s of kept) {
      const v = s.values[i];
      valuesByModel[s.modelId] = v ?? null;
      if (typeof v === "number" && Number.isFinite(v)) {
        vals.push(v);
        successful.push(s.modelId);
      }
    }
    vals.sort((a, b) => a - b);
    const n = vals.length;
    if (n === 0) {
      return { date, consensus: null, n, n_successful: successful.length,
               n_configured: modelSeries.length,
               min: null, max: null, iqr: null,
               valuesByModel, dropped: dropped.map((d) => ({...d, date})), qc_status: "all_missing" };
    }
    const { q1, q3 } = quartiles(vals);
    const consensus = medianOfSorted(vals);
    return {
      date,
      consensus: round1(consensus),
      n,                                             // independent contributors after dedup
      n_successful: successful.length,               // successful feeds (before dedup, valid at this index)
      n_configured: modelSeries.length,
      min: round1(vals[0]),
      max: round1(vals[vals.length - 1]),
      iqr: round1(q3 - q1),
      valuesByModel,
      dropped: dropped.map((d) => ({...d, date})),
      qc_status: n < 3 ? "few_models" : "ok",
    };
  });
}

function round1(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  return Math.round(x * 10) / 10;
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
    // union of contributors across hi and lo, but also report per-variable n
    const hiContribs = new Set(Object.entries(hi.valuesByModel).filter(([, v]) => v != null).map(([k]) => k));
    const loContribs = new Set(Object.entries(lo.valuesByModel).filter(([, v]) => v != null).map(([k]) => k));
    const allContribs = new Set([...hiContribs, ...loContribs]);
    const dropped = [...hi.dropped, ...lo.dropped].filter((v, i, arr) => arr.findIndex((x) => x.modelId === v.modelId && x.duplicateOf === v.duplicateOf) === i);
    return {
      date: d,
      tmax: {
        consensus: hi.consensus, n: hi.n, n_successful: hi.n_successful,
        min: hi.min, max: hi.max, iqr: hi.iqr, valuesByModel: hi.valuesByModel,
        qc_status: hi.qc_status,
      },
      tmin: {
        consensus: lo.consensus, n: lo.n, n_successful: lo.n_successful,
        min: lo.min, max: lo.max, iqr: lo.iqr, valuesByModel: lo.valuesByModel,
        qc_status: lo.qc_status,
      },
      n_contributing: allContribs.size,  // independent contributors (either hi or lo)
      n_contributing_hi: hiContribs.size,
      n_contributing_lo: loContribs.size,
      n_successful: hi.n_successful + lo.n_successful,
      n_configured: hi.n_configured,
      dropped_duplicates: dropped,
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
