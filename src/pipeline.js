// End-to-end forecast pipeline: fetch all locations -> parse -> aggregate ->
// build a province-wide forecast bundle suitable for the API/frontend, with
// PER-LOCALITY last-known-good merge against any previously cached bundle.
//
// Designed to run inside a Cloudflare Worker, with a pluggable KV-like storage
// interface for durable caching. A partial or total failure must NEVER erase
// previously valid data for a location.

import { LOCATIONS } from "./locations.js";
import { IMPLEMENTED_MODELS, MODEL_REGISTRY } from "./models.js";
import { fetchOpenMeteo, parseOpenMeteoResponse } from "./providers/open-meteo.js";
import { buildLocationForecast } from "./aggregation/aggregate.js";

const CACHE_VERSION = "znd-forecast-v0.2";
const DEFAULT_CACHE_TTL_S = 60 * 60 * 4; // 4 hours (cron refreshes hourly; 4h upper bound)

/**
 * Validate a per-location bundle. A bundle is considered "usable" if it has a
// non-empty dates array, a days array of the same length, and at least one
// non-null consensus tmax OR tmin on at least one day. A completely-null
// response (e.g. a provider outage) counts as a fetch failure, not a
// successful forecast.
 */
export function isValidLocBundle(loc) {
  if (!loc || loc.error) return false;
  if (!Array.isArray(loc.dates) || loc.dates.length === 0) return false;
  if (!Array.isArray(loc.days) || loc.days.length !== loc.dates.length) return false;
  let anyUsable = false;
  for (const d of loc.days) {
    if (!d) return false;
    if ((d.tmax && typeof d.tmax.consensus === "number") ||
        (d.tmin && typeof d.tmin.consensus === "number")) {
      anyUsable = true; break;
    }
  }
  return anyUsable;
}

/**
 * Fetch one location and return either a usable bundle or a structured failure.
 */
async function fetchOne(loc, { days, baseUrl, fetchFn, timeoutMs, maxRetries }) {
  const started = Date.now();
  const res = await fetchOpenMeteo({
    lat: loc.lat, lon: loc.lon, days, baseUrl, fetchFn,
    timeoutMs, maxRetries,
  });
  if (!res.ok) {
    return { ok: false, locationId: loc.id, error: res.error, retries: res.retries, latencyMs: Date.now() - started };
  }
  let parsed;
  try {
    parsed = parseOpenMeteoResponse(res.data);
  } catch (e) {
    return { ok: false, locationId: loc.id, error: `parse error: ${e.message}`, retries: res.retries, latencyMs: Date.now() - started };
  }
  if (!parsed.dates || parsed.dates.length === 0) {
    return { ok: false, locationId: loc.id, error: "empty date axis in response", retries: res.retries, latencyMs: Date.now() - started };
  }
  const bundle = buildLocationForecast({
    locationId: loc.id, perModel: parsed.perModel, dates: parsed.dates,
    retrievedAt: new Date().toISOString(),
  });
  bundle.fetchMeta = { latencyMs: Date.now() - started, retries: res.retries };
  if (!isValidLocBundle(bundle)) {
    return { ok: false, locationId: loc.id, error: "all-null response (no usable temperatures)", retries: res.retries, latencyMs: Date.now() - started };
  }
  return { ok: true, bundle };
}

/**
 * Merge a freshly fetched set of location results with any previously cached
 * bundle. Preserves last-known-good data for failed/invalid localities, with
 * stale=true and the original successful retrieval time.
 */
export function mergeWithCached(newBundle, cachedBundle) {
  const cachedByLoc = new Map();
  if (cachedBundle && Array.isArray(cachedBundle.locations)) {
    for (const l of cachedBundle.locations) {
      if (l && l.locationId && isValidLocBundle(l)) cachedByLoc.set(l.locationId, l);
    }
  }
  const merged = { ...newBundle, locations: [], summary: { ...newBundle.summary } };
  const preserved = [];
  const freshErrors = [];
  let successCount = 0;
  for (const loc of LOCATIONS) {
    const fresh = (newBundle.locations || []).find((l) => l && l.locationId === loc.id);
    if (fresh && !fresh.error && isValidLocBundle(fresh)) {
      merged.locations.push(fresh);
      successCount++;
      continue;
    }
    // Fresh fetch failed or invalid — try to use cached last-known-good
    const cached = cachedByLoc.get(loc.id);
    const errMsg = fresh?.error || "no data";
    freshErrors.push({ locationId: loc.id, error: errMsg });
    if (cached) {
      // Preserve cached but mark stale
      const staleCopy = JSON.parse(JSON.stringify(cached));
      staleCopy.stale = true;
      staleCopy.preservedFromCache = true;
      staleCopy.fetchError = errMsg;
      merged.locations.push(staleCopy);
      preserved.push(loc.id);
      successCount++; // count as "has data" (stale)
    } else {
      // No prior data — record as unavailable (never invent values)
      merged.locations.push({
        locationId: loc.id,
        error: errMsg,
        unavailable: true,
        days: [], dates: [],
      });
    }
  }
  merged.summary.successfulLocations = successCount;
  merged.summary.failedLocations = merged.locations.filter((l) => l.error || l.unavailable).length;
  merged.summary.preservedFromCache = preserved;
  merged.summary.errors = freshErrors;
  merged.partialRefresh = preserved.length > 0 && freshErrors.length > 0;
  // fullOutage = zero fresh successes AND no usable data was recovered from cache.
  // If cache preserved some localities, we aren't fully dark.
  const freshSuccessCount = newBundle.summary.successfulLocations || 0;
  merged.fullOutage = freshSuccessCount === 0 && preserved.length === 0;
  merged.zeroFreshSuccesses = freshSuccessCount === 0;
  return merged;
}

/**
 * Run the pipeline. If a previous cached bundle exists in store, use it as a
 * base for per-locality last-known-good preservation.
 *
 * @param {Object} opts
 * @param {typeof fetch} [opts.fetchFn]
 * @param {{get?: Function, put?: Function}} [opts.store]
 * @param {number} [opts.days]
 * @param {string} [opts.baseUrl]
 * @param {boolean} [opts.force=false]
 * @param {number} [opts.timeoutMs]
 * @param {number} [opts.maxRetries]
 * @param {boolean} [opts.allowCacheMerge=true] - set false for tests that want raw fresh behavior
 */
export async function runPipeline({ fetchFn, store, days = 7, baseUrl, force = false, timeoutMs, maxRetries, allowCacheMerge = true } = {}) {
  const cacheKey = `${CACHE_VERSION}:days${days}`;
  let cached = null;
  if (allowCacheMerge && store && store.get) {
    try {
      const raw = await store.get(cacheKey);
      if (raw) cached = JSON.parse(raw);
    } catch (_) { cached = null; }
  }

  const startedAt = new Date().toISOString();
  const results = [];
  let totalLatency = 0;

  for (let i = 0; i < LOCATIONS.length; i++) {
    const loc = LOCATIONS[i];
    const fr = await fetchOne(loc, { days, baseUrl, fetchFn, timeoutMs, maxRetries });
    if (fr.ok) {
      results.push(fr.bundle);
      totalLatency += fr.bundle.fetchMeta?.latencyMs || 0;
    } else {
      results.push({ locationId: loc.id, error: fr.error, days: [], dates: [], fetchMeta: { latencyMs: fr.latencyMs, retries: fr.retries } });
    }
    if (i < LOCATIONS.length - 1) await sleep(150);
  }

  const completedAt = new Date().toISOString();
  const freshBundle = {
    version: CACHE_VERSION,
    province: "Zamboanga del Norte",
    timezone: "Asia/Manila",
    startedAt,
    completedAt,
    models: IMPLEMENTED_MODELS.map((m) => ({
      id: m.id, label: m.shortLabel, centre: m.centre, nativeResKm: m.nativeResKm,
    })),
    modelRegistry: MODEL_REGISTRY.map((m) => ({
      targetLabel: m.targetLabel, availabilityStatus: m.availabilityStatus,
      productType: m.productType, consensusEligible: m.consensusEligible,
      exclusionReason: m.exclusionReason, provider: m.provider,
      requestedModelId: m.requestedModelId, nativeResolution: m.nativeResolution,
    })),
    locations: results,
    summary: {
      totalLocations: LOCATIONS.length,
      successfulLocations: results.filter((r) => !r.error).length,
      failedLocations: results.filter((r) => r.error).length,
      totalLatencyMs: totalLatency,
      errors: results.filter((r) => r.error).map((r) => ({ locationId: r.locationId, error: r.error })),
    },
    fromCache: false,
  };

  // Always run merge — even with no cache, mergeWithCached normalizes failure
  // markers, sets fullOutage/zeroFreshSuccesses flags, and ensures every
  // LOCATIONS entry is present in the output.
  const finalBundle = mergeWithCached(freshBundle, cached);
  finalBundle.completedAt = completedAt;
  finalBundle.startedAt = startedAt;

  // Count how many locations actually succeeded in THIS fetch (before LKG
  // preservation). This drives the cache-write policy: we only write the
  // cache when at least one fresh success occurs, so a total outage never
  // overwrites a previously valid cache.
  const freshSuccessCount = freshBundle.summary.successfulLocations;

  if (store && store.put && freshSuccessCount > 0) {
    try {
      // Strip runtime-only flags before caching
      const toCache = JSON.parse(JSON.stringify(finalBundle));
      toCache.fromCache = false;
      await store.put(cacheKey, JSON.stringify(toCache), { expirationTtl: DEFAULT_CACHE_TTL_S });
      finalBundle.cachePersisted = true;
    } catch (e) {
      finalBundle.summary.cacheWriteError = e.message || String(e);
      finalBundle.cachePersisted = false;
    }
  } else if (freshSuccessCount === 0 && cached) {
    // Total outage: do not overwrite cache; explicitly mark returned bundle as cached+stale.
    finalBundle.fromCache = true;
    finalBundle.stale = true;
    finalBundle.cachePersisted = true;
    // If there were zero fresh successes AND cache gave us back data for some
    // localities, we still serve that data (stale); fullOutage means zero
    // fresh successes, not zero usable data.
    finalBundle.fullOutage = finalBundle.summary.successfulLocations === 0;
  }

  return finalBundle;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
