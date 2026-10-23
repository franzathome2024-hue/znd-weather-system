// End-to-end forecast pipeline: fetch all locations -> parse -> aggregate ->
// build a province-wide forecast bundle suitable for the API/frontend.
//
// Designed to run inside a Cloudflare Worker (fetch or scheduled), with a
// pluggable KV-like storage interface for durable caching of the last
// successful forecast.

import { LOCATIONS } from "./locations.js";
import { MODELS } from "./models.js";
import { fetchOpenMeteo, parseOpenMeteoResponse } from "./providers/open-meteo.js";
import { buildLocationForecast } from "./aggregation/aggregate.js";

const FORECAST_TTL_MS_DEFAULT = 1000 * 60 * 55; // cache for ~55min; hourly cron refreshes

/**
 * Run the pipeline for all 27 locations.
 * @param {Object} opts
 * @param {typeof fetch} [opts.fetchFn]
 * @param {{get?: Function, put?: Function}} [opts.store] - KV-like cache with
 *        get(key) -> Promise<string|null>, put(key, value, {expirationTtl}) -> Promise.
 *        If omitted, no caching is done (used by tests / dry-runs).
 * @param {number} [opts.days]
 * @param {string} [opts.baseUrl]
 * @param {boolean} [opts.force=false] - ignore cached value even if present
 */
export async function runPipeline({ fetchFn, store, days = 7, baseUrl, force = false, timeoutMs, maxRetries } = {}) {
  const cacheKey = `znd:forecast:v0.1:days${days}`;
  if (!force && store && store.get) {
    const cached = await store.get(cacheKey).catch(() => null);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.locations && Array.isArray(parsed.locations)) {
          parsed.fromCache = true;
          return parsed;
        }
      } catch (_) { /* fall through to refetch */ }
    }
  }

  const startedAt = new Date().toISOString();
  const results = [];
  const errors = [];
  let totalLatency = 0;

  // Open-Meteo rate limits: keep a small sequential wait between requests
  // to stay well below non-commercial limits (under 10k/day easily).
  for (let i = 0; i < LOCATIONS.length; i++) {
    const loc = LOCATIONS[i];
    const res = await fetchOpenMeteo({
      lat: loc.lat, lon: loc.lon, days, baseUrl, fetchFn,
      timeoutMs, maxRetries,
    });
    totalLatency += res.latencyMs;
    if (!res.ok) {
      errors.push({ locationId: loc.id, error: res.error, retries: res.retries });
      // Record the failure but don't fabricate data; downstream will mark the
      // location as missing/stale for this run.
      results.push({
        locationId: loc.id,
        error: res.error,
        days: [],
        dates: [],
      });
      continue;
    }
    const { dates, perModel } = parseOpenMeteoResponse(res.data);
    const bundle = buildLocationForecast({
      locationId: loc.id,
      perModel,
      dates,
      retrievedAt: new Date().toISOString(),
    });
    bundle.fetchMeta = { latencyMs: res.latencyMs, retries: res.retries };
    results.push(bundle);
    if (i < LOCATIONS.length - 1) await sleep(150); // gentle pacing
  }

  const successful = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);
  const completedAt = new Date().toISOString();

  const bundle = {
    version: "znd-weather-v0.1",
    province: "Zamboanga del Norte",
    timezone: "Asia/Manila",
    startedAt,
    completedAt,
    models: MODELS.map((m) => ({ id: m.id, label: m.label, centre: m.centre, nativeResKm: m.nativeResKm })),
    locations: results,
    summary: {
      totalLocations: LOCATIONS.length,
      successfulLocations: successful.length,
      failedLocations: failed.length,
      totalLatencyMs: totalLatency,
      errors,
    },
    fromCache: false,
  };

  if (store && store.put && successful.length > 0) {
    try {
      await store.put(cacheKey, JSON.stringify(bundle), { expirationTtl: Math.floor(FORECAST_TTL_MS_DEFAULT / 1000) });
    } catch (e) {
      // Non-fatal: cache miss on next call is acceptable.
      bundle.summary.cacheWriteError = e.message || String(e);
    }
  }

  return bundle;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
