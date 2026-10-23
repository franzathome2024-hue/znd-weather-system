// Numerical multi-model consensus aggregation.
// Pure functions — no network, no I/O — easy to unit test.
//
// The consensus daily high/low for each (location, date) is the MEDIAN of all
// valid per-model daily max / min temperatures.  Highs and lows are aggregated
// independently (they can come from different models).
//
// Missing values (null/undefined/NaN) are dropped before computing median,
// spread, IQR, etc. We NEVER fabricate replacement values.

/**
 * Compute the median of a sorted numeric array.
 * @param {number[]} sorted - sorted copy (asc)
 */
export function medianOfSorted(sorted) {
  if (!sorted || sorted.length === 0) return null;
  const n = sorted.length;
  if (n % 2 === 1) return sorted[(n - 1) / 2];
  return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

/**
 * Compute first and third quartiles using the linear-interpolation method
 * (same as Numpy/Excel QUARTILE.EXC approximation — for v0.1 we use Type 7).
 * @param {number[]} sorted
 */
export function quartiles(sorted) {
  if (!sorted || sorted.length === 0) return { q1: null, q3: null };
  if (sorted.length === 1) return { q1: sorted[0], q3: sorted[0] };
  const q = (p) => {
    // p in [0,1]
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
  };
  return { q1: q(0.25), q3: q(0.75) };
}

/**
 * Aggregate per-model daily values for a single (location, variable).
 * @param {Array<{modelId: string, values: Array<number|null>}>} modelSeries
 *   e.g. [{ modelId: "ecmwf_ifs", values: [30.2, 28.3, ...] }, ...]
 *   `values[i]` is the value for forecast-day index i; null means missing.
 * @param {string[]} dates - ISO date strings aligned with values[i].
 * @returns {Array<{date: string, consensus: number|null, n: number,
 *                  min: number|null, max: number|null, iqr: number|null,
 *                  valuesByModel: Object<string, number|null>}>}
 */
export function aggregateDaily(modelSeries, dates) {
  if (!modelSeries || modelSeries.length === 0) {
    return dates.map((d) => ({
      date: d, consensus: null, n: 0, min: null, max: null, iqr: null,
      valuesByModel: {}, qc_status: "no_models",
    }));
  }

  // Detect duplicates across model series (identical arrays for every day
  // where both have a value) and keep only the first-seen.
  const seen = new Map(); // serialized-array -> modelId
  const deduped = [];
  for (const s of modelSeries) {
    const key = JSON.stringify(s.values);
    if (seen.has(key)) continue;
    seen.set(key, s.modelId);
    deduped.push(s);
  }

  return dates.map((date, i) => {
    const valuesByModel = {};
    const vals = [];
    for (const s of deduped) {
      const v = s.values[i];
      valuesByModel[s.modelId] = v ?? null;
      if (typeof v === "number" && Number.isFinite(v)) vals.push(v);
    }
    vals.sort((a, b) => a - b);
    const n = vals.length;
    if (n === 0) {
      return { date, consensus: null, n: 0, min: null, max: null, iqr: null,
               valuesByModel, qc_status: "all_missing" };
    }
    const { q1, q3 } = quartiles(vals);
    const consensus = medianOfSorted(vals);
    return {
      date,
      consensus: round1(consensus),
      n,
      min: round1(vals[0]),
      max: round1(vals[vals.length - 1]),
      iqr: round1(q3 - q1),
      valuesByModel,
      qc_status: n < 3 ? "few_models" : "ok",
    };
  });
}

function round1(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  return Math.round(x * 10) / 10;
}

/**
 * Build a full per-location forecast bundle from per-model daily max/min values.
 *
 * @param {Object} opts
 * @param {string} opts.locationId
 * @param {Array<{modelId: string, tmax: number[], tmin: number[], runInit?: string}>} opts.perModel
 *   Arrays aligned with opts.dates (ISO date strings in Asia/Manila local day).
 * @param {string[]} opts.dates
 * @param {string} opts.retrievedAt - ISO timestamp of fetch completion (UTC).
 * @returns {{locationId: string, dates: string[], days: Object[], perModel: Object[], retrievedAt: string}}
 */
export function buildLocationForecast({ locationId, perModel, dates, retrievedAt }) {
  const tmaxSeries = perModel.map((m) => ({ modelId: m.modelId, runInit: m.runInit || null, values: m.tmax }));
  const tminSeries = perModel.map((m) => ({ modelId: m.modelId, runInit: m.runInit || null, values: m.tmin }));

  const tmaxAgg = aggregateDaily(tmaxSeries, dates);
  const tminAgg = aggregateDaily(tminSeries, dates);

  const days = dates.map((d, i) => {
    const hi = tmaxAgg[i];
    const lo = tminAgg[i];
    // model contributors for hi/lo may differ — n is the number of models
    // that contributed *either* a valid hi OR lo for this day, as a simple
    // "valid contributing models" count, and we also report per-variable n.
    const contributors = new Set([
      ...Object.entries(hi.valuesByModel).filter(([, v]) => v != null).map(([k]) => k),
      ...Object.entries(lo.valuesByModel).filter(([, v]) => v != null).map(([k]) => k),
    ]);
    return {
      date: d,
      tmax: hi,
      tmin: lo,
      n_contributing: contributors.size,
      // Spread is max range across hi and lo as a simple "disagreement" indicator.
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
    perModel: perModel.map((m) => ({ modelId: m.modelId, runInit: m.runInit || null })),
    retrievedAt,
    version: "znd-weather-v0.1",
  };
}

function worstQc(a, b) {
  const rank = { ok: 0, few_models: 1, all_missing: 2, no_models: 3 };
  return (rank[a] > rank[b] ? a : b);
}
