// Cloudflare Worker entry point for znd-weather-system.
//
// Responsibilities:
//   - Serve static frontend assets from the /public directory (bound via ASSETS).
//   - Expose JSON API routes:
//       GET /api/forecast        -> full province bundle (refreshes if stale)
//       GET /api/forecast/raw    -> same, force-fresh (skips cache)
//       GET /api/locations       -> the 27 locations + coordinates
//       GET /api/models          -> implemented vs unavailable model matrix
//       GET /api/bulletin        -> plain-text Bisaya bulletin (today)
//       GET /api/bulletin?day=N  -> day offset N (0=today,1=tomorrow,...)
//       POST /api/scheduler/run  -> admin (shared-secret gated) manual trigger
//   - On the scheduled() cron handler, refresh the cache (no publishing by default).
//
// Security:
//   - No API keys are required for v0.1 (Open-Meteo is keyless at non-commercial volumes).
//   - Facebook publishing is OFF by default and requires a secret + explicit enable flag.
//   - Secrets are read from env, never hardcoded.

import { runPipeline } from "../pipeline.js";
import { LOCATIONS } from "../locations.js";
import { IMPLEMENTED_MODELS, UNAVAILABLE_MODELS, OPEN_METEO_ATTRIBUTION, MODEL_REGISTRY, FEED_COUNTS } from "../models.js";
import { generateBisayaBulletin } from "../bulletin/bisaya.js";

function cacheKeyFor(days) {
  return `znd:forecast:v0.1:days${days}`;
}
function staleMs(env) {
  return 1000 * 60 * 60 * (parseInt(env?.STALE_AFTER_HOURS || "8", 10) || 8);
}
function requestTimeout(env) {
  return parseInt(env?.REQUEST_TIMEOUT_MS || "15000", 10);
}
function maxRetries(env) {
  return parseInt(env?.MAX_RETRIES_PER_REQUEST || "2", 10);
}
function forecastDays(env) {
  return Math.min(Math.max(parseInt(env?.FORECAST_DAYS || "7", 10) || 7, 1), 16);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // --- API routes ---
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, ctx);
    }

    // --- Static assets (frontend) ---
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not Found", { status: 404, headers: corsHeaders() });
  },

  async scheduled(controller, env, ctx) {
    // Hourly cron: refresh forecast cache. We do NOT publish to Facebook
    // unless FACEBOOK_PUBLISH_ENABLED === "true" AND a successful test post
    // has been explicitly configured.
    ctx.waitUntil(refreshForecast(env, { scheduled: true }));
  },
};

async function handleApi(request, env, ctx) {
  const url = new URL(request.url);
  try {
    if (url.pathname === "/api/locations") {
      return json({ locations: LOCATIONS, bounds: { minLat: 7.2, maxLat: 8.8, minLon: 122.0, maxLon: 123.7 } });
    }
    if (url.pathname === "/api/models") {
      return json({
        implemented: IMPLEMENTED_MODELS.map((m) => ({
          id: m.id, shortLabel: m.shortLabel, label: m.label, centre: m.centre,
          priority: m.priority, nativeResKm: m.nativeResKm,
          license: m.license, attribution: m.attribution,
          aliasGroup: m.aliasGroup, evidence: m.evidence,
        })),
        unavailable: UNAVAILABLE_MODELS,
        registry: MODEL_REGISTRY.map((m) => ({
          targetLabel: m.targetLabel, provider: m.provider,
          endpoint: m.endpoint, requestedModelId: m.requestedModelId,
          productType: m.productType, nativeResolution: m.nativeResolution,
          geographicCoverage: m.geographicCoverage, availabilityStatus: m.availabilityStatus,
          consensusEligible: m.consensusEligible, exclusionReason: m.exclusionReason,
          lastVerifiedAt: m.lastVerifiedAt,
          license: m.license, attributionRequirements: m.attributionRequirements,
        })),
        feedCounts: FEED_COUNTS,
        attribution: OPEN_METEO_ATTRIBUTION,
      });
    }
    if (url.pathname === "/api/forecast" || url.pathname === "/api/forecast/raw") {
      const force = url.searchParams.get("force") === "1" || url.pathname === "/api/forecast/raw";
      const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || String(forecastDays(env)), 10), 1), 16);
      const bundle = await getForecast(env, ctx, { force, days });
      return json(bundle);
    }
    if (url.pathname === "/api/bulletin") {
      const day = Math.min(Math.max(parseInt(url.searchParams.get("day") || "0", 10), 0), 6);
      const bundle = await getForecast(env, ctx, { force: false, days: 7 });
      const text = generateBisayaBulletin(bundle, day);
      return new Response(text, {
        headers: { "content-type": "text/plain; charset=utf-8", ...corsHeaders() },
      });
    }
    if (url.pathname === "/api/scheduler/run" && request.method === "POST") {
      if (!await isAuthorized(request, env)) {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders() });
      }
      const bundle = await refreshForecast(env, { manual: true });
      return json({ ok: true, summary: bundle.summary, completedAt: bundle.completedAt });
    }
    if (url.pathname === "/api/healthz") {
      return json({ ok: true, version: "znd-weather-v0.1", t: new Date().toISOString() });
    }
    return new Response("Not Found", { status: 404, headers: corsHeaders() });
  } catch (e) {
    return json({ error: e.message || String(e) }, { status: 500 });
  }
}

async function getForecast(env, ctx, { force = false, days = 7 } = {}) {
  const store = env.FORECAST_CACHE; // KV binding (optional)
  const key = cacheKeyFor(days);

  if (!force && store) {
    try {
      const cached = await store.get(key);
      if (cached) {
        const parsed = JSON.parse(cached);
        const ageMs = Date.now() - new Date(parsed.completedAt || parsed.startedAt || 0).getTime();
        if (ageMs <= staleMs(env)) {
          parsed.fromCache = true;
          parsed.stale = false;
          return parsed;
        }
        parsed.fromCache = true;
        parsed.stale = true;
        if (ctx && typeof ctx.waitUntil === "function") {
          ctx.waitUntil(refreshForecast(env, { reason: "stale", days }).catch((e) => console.error("background refresh failed:", e)));
        }
        return parsed;
      }
    } catch (_) { /* fall through */ }
  }

  return await refreshForecast(env, { reason: force ? "force" : "cold", days });
}

async function refreshForecast(env, _opts = {}) {
  const store = env.FORECAST_CACHE;
  const baseUrl = env.OPEN_METEO_BASE_URL || undefined;
  const days = _opts.days || forecastDays(env);
  const bundle = await runPipeline({
    fetchFn: globalThis.fetch.bind(globalThis),
    store: store ? {
      get: (k) => store.get(k),
      put: (k, v, opts) => store.put(k, v, opts),
    } : undefined,
    days, baseUrl, force: true,
    timeoutMs: requestTimeout(env),
    maxRetries: maxRetries(env),
  });
  return bundle;
}

async function isAuthorized(request, env) {
  if (env.ADMIN_SECRET) {
    const auth = request.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    return timingSafeEqual(token, env.ADMIN_SECRET);
  }
  // If no ADMIN_SECRET is configured, deny by default.
  return false;
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

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
