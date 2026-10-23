// Cloudflare Worker entry point for znd-weather-system.
//
// Responsibilities:
//   - Serve static frontend assets from the /public directory (bound via ASSETS).
//   - Expose JSON API routes:
//       GET /api/forecast        -> full province bundle (reads KV cache; refreshes if stale)
//       GET /api/forecast/raw    -> same, force-fresh
//       GET /api/locations       -> the 27 locations + coordinates
//       GET /api/models          -> implemented vs unavailable model matrix
//       GET /api/bulletin        -> plain-text Bisaya bulletin
//       GET /api/healthz         -> health, cache status, version
//       POST /api/scheduler/run  -> admin (shared-secret gated) manual trigger
//   - On the scheduled() cron handler, refresh cache (no publishing by default).
//
// Security:
//   - No API keys are required for v0.1 (Open-Meteo is keyless at non-commercial volumes).
//   - Facebook publishing is OFF by default and requires a secret + explicit enable flag.
//   - Secrets are read from env, never hardcoded.
//   - Per-locality last-known-good preservation ensures failed/partial fetches do not wipe data.
//   - A simple in-memory + KV refresh lock prevents concurrent refreshes from clobbering newer data.

import { runPipeline } from "../pipeline.js";
import { LOCATIONS } from "../locations.js";
import { IMPLEMENTED_MODELS, UNAVAILABLE_MODELS, OPEN_METEO_ATTRIBUTION, MODEL_REGISTRY, FEED_COUNTS } from "../models.js";
import { generateBisayaBulletin } from "../bulletin/bisaya.js";
import { mergeAiwpIntoBundle } from "../aiwp.js";

const CACHE_VERSION = "znd-forecast-v0.2";
const REFRESH_LOCK_KEY = "znd:forecast:refresh-lock";
const REFRESH_LOCK_TTL_S = 60 * 10; // 10 minutes — refresh must complete well within this
const DEFAULT_STALE_HOURS = 8;
const DEFAULT_CACHE_TTL_S = 60 * 60 * 4;

function cacheKeyFor(days) {
  return `${CACHE_VERSION}:days${days}`;
}
function staleMs(env) {
  return 1000 * 60 * 60 * clamp(parseInt(env?.STALE_AFTER_HOURS || String(DEFAULT_STALE_HOURS), 10) || DEFAULT_STALE_HOURS, 1, 72);
}
function requestTimeout(env) {
  return clamp(parseInt(env?.REQUEST_TIMEOUT_MS || "15000", 10) || 15000, 2000, 60000);
}
function maxRetries(env) {
  return clamp(parseInt(env?.MAX_RETRIES_PER_REQUEST || "2", 10) || 2, 0, 5);
}
function forecastDays(env) {
  return clamp(parseInt(env?.FORECAST_DAYS || "7", 10) || 7, 1, 16);
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// In-memory refresh lock (process-local). KV lock protects across Workers.
let inMemoryRefreshRunning = null; // promise of in-flight refresh

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, ctx);
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not Found", { status: 404, headers: corsHeaders() });
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      const days = forecastDays(env);
      try {
        // In scheduled() there is no incoming request URL; fall back to a
        // synthetic origin. ASSETS.fetch resolves the path against /public.
        await refreshForecast(env, { reason: "scheduled", days, assetBase: "https://aiwp-assets.local/" });
      } catch (e) {
        console.error("scheduled refresh failed:", e);
      }
    })());
  },
};

async function handleApi(request, env, ctx) {
  const url = new URL(request.url);
  try {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (url.pathname === "/api/locations") {
      return json({ locations: LOCATIONS, bounds: { minLat: 7.0, maxLat: 9.0, minLon: 121.8, maxLon: 124.0 } });
    }
    if (url.pathname === "/api/models") {
      return json({
        implemented: IMPLEMENTED_MODELS.map((m) => ({
          id: m.id, shortLabel: m.shortLabel, label: m.label, centre: m.centre,
          priority: m.priority, nativeResKm: m.nativeResKm,
          license: m.license, attribution: m.attribution,
          aliasGroup: m.aliasGroup, evidence: m.evidence,
          consensusEligible: m.consensusEligible, exclusionReason: m.exclusionReason,
          source: m.source,
          lastVerifiedAt: m.lastVerifiedAt,
        })),
        unavailable: UNAVAILABLE_MODELS,
        registry: MODEL_REGISTRY.map((m) => ({
          targetLabel: m.targetLabel, provider: m.provider,
          endpoint: m.endpoint, requestedModelId: m.requestedModelId,
          productType: m.productType, nativeResolution: m.nativeResolution,
          geographicCoverage: m.geographicCoverage, availabilityStatus: m.availabilityStatus,
          consensusEligible: m.consensusEligible, exclusionReason: m.exclusionReason,
          lastVerifiedAt: m.lastVerifiedAt, lastSuccessfulRun: m.lastSuccessfulRun,
          license: m.license, attributionRequirements: m.attributionRequirements,
        })),
        feedCounts: FEED_COUNTS,
        attribution: OPEN_METEO_ATTRIBUTION,
      });
    }
    if (url.pathname === "/api/forecast" || url.pathname === "/api/forecast/raw") {
      const force = url.searchParams.get("force") === "1" || url.pathname === "/api/forecast/raw";
      const days = clamp(parseInt(url.searchParams.get("days") || String(forecastDays(env)), 10) || forecastDays(env), 1, 16);
      const bundle = await getForecast(env, ctx, { force, days, assetBase: url.origin });
      return json(bundle);
    }
    if (url.pathname === "/api/bulletin") {
      const day = clamp(parseInt(url.searchParams.get("day") || "0", 10) || 0, 0, 6);
      const bundle = await getForecast(env, ctx, { force: false, days: 7, assetBase: url.origin });
      const text = generateBisayaBulletin(bundle, day);
      return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8", ...corsHeaders() } });
    }
    if (url.pathname === "/api/scheduler/run" && request.method === "POST") {
      if (!await isAuthorized(request, env)) {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders() });
      }
      const bundle = await refreshForecast(env, { reason: "manual", days: forecastDays(env) });
      return json({ ok: true, summary: bundle.summary, completedAt: bundle.completedAt,
                    partialRefresh: bundle.partialRefresh, fullOutage: bundle.fullOutage });
    }
    if (url.pathname === "/api/healthz") {
      const cache = await readCache(env, forecastDays(env));
      const hasKv = !!env.FORECAST_CACHE;
      const age = cache?.completedAt ? Date.now() - new Date(cache.completedAt).getTime() : null;
      return json({
        ok: true, version: CACHE_VERSION, t: new Date().toISOString(),
        persistentCache: hasKv ? "enabled" : "disabled (in-memory only; data not durable across restarts)",
        kvBindingConfigured: hasKv,
        hasCachedForecast: !!cache,
        cacheAgeMs: age,
        cacheStale: age != null ? age > staleMs(env) : null,
        facebookPublishingEnabled: env.FACEBOOK_PUBLISH_ENABLED === "true",
        environment: env.ENVIRONMENT || "production",
      });
    }
    return new Response("Not Found", { status: 404, headers: corsHeaders() });
  } catch (e) {
    return json({ error: e.message || String(e) }, { status: 500 });
  }
}

async function readCache(env, days) {
  const store = env.FORECAST_CACHE;
  if (!store) return null;
  try {
    const raw = await store.get(cacheKeyFor(days));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) { return null; }
}

async function getForecast(env, ctx, { force = false, days = 7, assetBase = null } = {}) {
  // 1) If KV exists, try to read cached.
  const cached = await readCache(env, days);
  const hasKv = !!env.FORECAST_CACHE;
  const mergeAiwp = async (b) => {
    try {
      await mergeAiwpIntoBundle(b, {
        assetsFetch: env.ASSETS?.fetch ? env.ASSETS.fetch.bind(env.ASSETS) : null,
        origin: assetBase,
        fetchFn: globalThis.fetch?.bind(globalThis),
      });
    } catch (e) { b.aiwp = { available: false, stale: true, error: String(e?.message || e), models: [], fetchedAt: null }; }
    return b;
  };

  if (!force && cached) {
    const ageMs = Date.now() - new Date(cached.completedAt || cached.startedAt || 0).getTime();
    if (ageMs <= staleMs(env)) {
      cached.fromCache = true;
      cached.stale = false;
      cached.persistentCacheUsed = hasKv;
      return await mergeAiwp(cached);
    }
    // Stale: return cached immediately, refresh in background
    cached.fromCache = true;
    cached.stale = true;
    cached.persistentCacheUsed = hasKv;
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(refreshForecast(env, { reason: "stale", days, assetBase }).catch((e) => console.error("background refresh failed:", e)));
    }
    return await mergeAiwp(cached);
  }

  // No cached value (or force): run refresh
  return await refreshForecast(env, { reason: force ? "force" : "cold", days, assetBase });
}

async function acquireLock(env) {
  const store = env.FORECAST_CACHE;
  // Always acquire the in-memory lock (single-isolate dedup).
  if (inMemoryRefreshRunning) return { acquired: false, promise: inMemoryRefreshRunning, inMemory: true };
  let kvAcquired = false;
  if (store && store.put) {
    try {
      // KV put-if-not-exists isn't directly available; we use a short TTL and
      // tolerate a tiny race window — Worker isolates usually serialize cron.
      // We write a lock value that contains our random nonce + timestamp.
      const existing = await store.get(REFRESH_LOCK_KEY).catch(() => null);
      if (existing) {
        try {
          const info = JSON.parse(existing);
          if (info && info.until > Date.now()) return { acquired: false, inMemory: false, kv: true };
        } catch { /* stale / malformed lock; overwrite */ }
      }
      const nonce = Math.random().toString(36).slice(2);
      await store.put(REFRESH_LOCK_KEY, JSON.stringify({ nonce, until: Date.now() + REFRESH_LOCK_TTL_S * 1000 }), { expirationTtl: REFRESH_LOCK_TTL_S });
      kvAcquired = true;
    } catch (_) { kvAcquired = false; }
  }
  const assetBase = _opts?.assetBase || null;
  const promise = (async () => {
    try {
      const bundle = await runPipeline({
        fetchFn: globalThis.fetch.bind(globalThis),
        store: storeFromEnv(env),
        days: forecastDays(env),
        baseUrl: env.OPEN_METEO_BASE_URL || undefined,
        timeoutMs: requestTimeout(env),
        maxRetries: maxRetries(env),
        force: true,
      });
      try {
        await mergeAiwpIntoBundle(bundle, {
          assetsFetch: env.ASSETS?.fetch ? env.ASSETS.fetch.bind(env.ASSETS) : null,
          origin: assetBase,
          fetchFn: globalThis.fetch?.bind(globalThis),
        });
      } catch (e) { bundle.aiwp = { available: false, stale: true, error: String(e?.message || e), models: [], fetchedAt: null }; }
      return bundle;
    } finally {
      if (kvAcquired && env.FORECAST_CACHE?.delete) {
        try { await env.FORECAST_CACHE.delete(REFRESH_LOCK_KEY); } catch (_) {}
      }
      inMemoryRefreshRunning = null;
    }
  })();
  inMemoryRefreshRunning = promise;
  return { acquired: true, promise };
}

async function refreshForecast(env, _opts = {}) {
  const days = _opts.days || forecastDays(env);
  const assetBase = _opts.assetBase || null;
  const mergeAiwp = async (b) => {
    try {
      await mergeAiwpIntoBundle(b, {
        assetsFetch: env.ASSETS?.fetch ? env.ASSETS.fetch.bind(env.ASSETS) : null,
        origin: assetBase,
        fetchFn: globalThis.fetch?.bind(globalThis),
      });
    } catch (e) { b.aiwp = { available: false, stale: true, error: String(e?.message || e), models: [], fetchedAt: null }; }
    return b;
  };
  const lock = await acquireLock(env);
  if (!lock.acquired && lock.promise) {
    try { return await lock.promise; }
    catch (e) {
      const cached = await readCache(env, days);
      if (cached) { cached.stale = true; cached.fromCache = true; return mergeAiwp(cached); }
      throw e;
    }
  }
  if (!lock.acquired) {
    const cached = await readCache(env, days);
    if (cached) {
      cached.fromCache = true; cached.stale = true; cached.lockContended = true;
      return mergeAiwp(cached);
    }
    await sleep(500);
    return refreshForecast(env, { ..._opts, reason: _opts.reason + ":lock-retry" });
  }
  return await lock.promise;
}

function storeFromEnv(env) {
  const s = env.FORECAST_CACHE;
  if (!s) return undefined;
  return {
    get: (k) => s.get(k),
    put: (k, v, opts) => s.put(k, v, opts),
  };
}

async function isAuthorized(request, env) {
  if (!env.ADMIN_SECRET) return false;
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return timingSafeEqual(token, env.ADMIN_SECRET);
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCode(i);
  return diff === 0;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function json(obj, { status = 200 } = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
  };
}
