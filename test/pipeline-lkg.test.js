// Regression tests for Priority 1 (per-locality last-known-good preservation).
//
// These tests run the pipeline against a mock fetchFn + mock KV store to
// validate failure handling without touching the network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidLocBundle, mergeWithCached, runPipeline } from "../src/pipeline.js";
import { MODEL_API_IDS } from "../src/models.js";
import { LOCATIONS as _LOCATIONS } from "../src/locations.js";
const LOC_IDS = _LOCATIONS.map((l) => l.id);

// Build a minimal valid per-locality bundle with tmax=LO, tmin=HI consensus
function makeValidLoc(id, tmax = 31, tmin = 25, prefix = "") {
  return {
    locationId: id,
    dates: ["2026-10-23","2026-10-24","2026-10-25"],
    days: [
      { tmax: { consensus: tmax, n: 8, min: tmax-2, max: tmax+2, iqr: 2, valuesByModel: {}, qc_status: "ok" },
        tmin: { consensus: tmin, n: 8, min: tmin-2, max: tmin+2, iqr: 2, valuesByModel: {}, qc_status: "ok" },
        qc_status: "ok", n_contributing: 8, n_contributing_hi: 8, n_contributing_lo: 8 },
      { tmax: { consensus: tmax+1, n: 8, min: tmax-1, max: tmax+2, iqr: 2, valuesByModel: {}, qc_status: "ok" },
        tmin: { consensus: tmin+1, n: 8, min: tmin-1, max: tmin+2, iqr: 2, valuesByModel: {}, qc_status: "ok" },
        qc_status: "ok", n_contributing: 8, n_contributing_hi: 8, n_contributing_lo: 8 },
      { tmax: { consensus: tmax+2, n: 8, min: tmax, max: tmax+3, iqr: 2, valuesByModel: {}, qc_status: "ok" },
        tmin: { consensus: tmin+2, n: 8, min: tmin, max: tmin+3, iqr: 2, valuesByModel: {}, qc_status: "ok" },
        qc_status: "ok", n_contributing: 8, n_contributing_hi: 8, n_contributing_lo: 8 },
    ],
    perModel: [],
    retrievedAt: prefix ? `${prefix}${new Date().toISOString()}` : new Date().toISOString(),
    version: "znd-weather-v0.1",
  };
}

// Build an all-null per-locality bundle (no usable consensus)
function makeNullLoc(id) {
  return {
    locationId: id,
    dates: ["2026-10-23","2026-10-24","2026-10-25"],
    days: [
      { tmax: { consensus: null, n: 0 }, tmin: { consensus: null, n: 0 }, qc_status: "all_missing" },
      { tmax: { consensus: null, n: 0 }, tmin: { consensus: null, n: 0 }, qc_status: "all_missing" },
      { tmax: { consensus: null, n: 0 }, tmin: { consensus: null, n: 0 }, qc_status: "all_missing" },
    ],
    perModel: [],
    retrievedAt: new Date().toISOString(),
    version: "znd-weather-v0.1",
  };
}

test("isValidLocBundle — rejects empty/malformed/all-null bundles", () => {
  assert.equal(isValidLocBundle(null), false);
  assert.equal(isValidLocBundle(undefined), false);
  assert.equal(isValidLocBundle({ error: "oops" }), false);
  assert.equal(isValidLocBundle({ dates: [], days: [] }), false);
  assert.equal(isValidLocBundle(makeNullLoc("x")), false);
});

test("isValidLocBundle — accepts a bundle with at least one usable consensus day", () => {
  assert.equal(isValidLocBundle(makeValidLoc("dipolog")), true);
});

test("mergeWithCached — full fresh success overwrites locations", () => {
  const fresh = {
    locations: LOC_IDS.map((id) => makeValidLoc(id, 32, 24, "fresh-")),
    summary: { totalLocations: 27, successfulLocations: 27, failedLocations: 0, errors: [] },
  };
  const cached = {
    locations: LOC_IDS.map((id) => makeValidLoc(id, 29, 22, "cached-")),
  };
  const out = mergeWithCached(fresh, cached);
  assert.equal(out.locations.length, 27);
  // Fresh should win on a successful fetch
  assert.equal(out.locations[0].days[0].tmax.consensus, 32);
  assert.equal(out.partialRefresh, false);
  assert.deepEqual(out.summary.preservedFromCache, []);
});

test("mergeWithCached — per-locality LKG: one failed location preserves its cached data and marks it stale", () => {
  const fresh = {
    locations: LOC_IDS.map((id) =>
      id === "dipolog"
        ? { locationId: "dipolog", error: "HTTP 500", days: [], dates: [] }
        : makeValidLoc(id, 32, 24, "fresh-")),
    summary: { totalLocations: 27, successfulLocations: 26, failedLocations: 1, errors: [] },
  };
  const cached = {
    locations: LOC_IDS.map((id) => makeValidLoc(id, 29, 22, "cached-")),
  };
  const out = mergeWithCached(fresh, cached);
  const dipolog = out.locations.find((l) => l.locationId === "dipolog");
  assert.ok(dipolog, "Dipolog entry must exist");
  assert.equal(dipolog.stale, true, "preserved entry must be marked stale");
  assert.equal(dipolog.preservedFromCache, true);
  assert.equal(dipolog.days[0].tmax.consensus, 29, "preserved tmax from cache");
  assert.equal(typeof dipolog.fetchError, "string", "fetchError must be recorded");
  // Other localities should be fresh
  const dapitan = out.locations.find((l) => l.locationId === "dapitan");
  assert.equal(dapitan.days[0].tmax.consensus, 32);
  assert.equal(dapitan.stale, undefined);
  assert.ok(out.partialRefresh);
  assert.ok(out.summary.preservedFromCache.includes("dipolog"));
});

test("mergeWithCached — all-null fresh response is treated as failure, LKG preserved", () => {
  // Simulate a provider returning all-null daily values (like ACCESS-G currently does)
  const nullLoc = makeNullLoc("dipolog");
  // isValidLocBundle should reject it, so merge treats as failure
  assert.equal(isValidLocBundle(nullLoc), false);
  const fresh = {
    locations: [nullLoc, ...LOC_IDS.slice(1).map((id) => makeValidLoc(id, 32, 24))],
    summary: { totalLocations: 27, successfulLocations: 26, failedLocations: 1 },
  };
  const cached = { locations: LOC_IDS.map((id) => makeValidLoc(id, 30, 23)) };
  const out = mergeWithCached(fresh, cached);
  const dipolog = out.locations.find((l) => l.locationId === "dipolog");
  assert.equal(dipolog.stale, true);
  assert.equal(dipolog.days[0].tmax.consensus, 30);
});

test("mergeWithCached — total outage with no cache returns zeroFreshSuccesses with error entries", () => {
  const fresh = {
    locations: LOC_IDS.map((id) => ({ locationId: id, error: "network down", days: [], dates: [] })),
    summary: { totalLocations: 27, successfulLocations: 0, failedLocations: 27, errors: [] },
  };
  const out = mergeWithCached(fresh, null);
  assert.equal(out.zeroFreshSuccesses, true, "zero fresh successes must be flagged");
  assert.equal(out.locations.length, 27);
  for (const l of out.locations) {
    assert.equal(l.unavailable, true);
    assert.equal(Array.isArray(l.days), true);
    assert.equal(l.days.length, 0);
  }
});

test("runPipeline — total outage does NOT overwrite cache (LKG served stale)", async () => {
  const stored = {};
  const store = makeMemoryStore(stored);
  const priorCache = makeCached27Bundle();
  await store.put("znd-forecast-v0.2:days3", JSON.stringify(priorCache), { expirationTtl: 3600 });

  const badFetch = async () => { throw new Error("network down"); };

  const out = await runPipeline({
    fetchFn: badFetch, store, days: 3, baseUrl: "http://invalid", timeoutMs: 500, maxRetries: 0,
  });
  // Zero fresh successes; all localities served from stale LKG
  assert.equal(out.zeroFreshSuccesses, true, "zero fresh successes must be flagged");
  assert.equal(out.fromCache, true, "bundle should come from cache");
  assert.equal(out.stale, true);
  // Each locality should have preserved stale data (since cache was seeded)
  const dipolog = out.locations.find((l) => l.locationId === "dipolog");
  assert.ok(dipolog);
  assert.equal(dipolog.preservedFromCache, true);
  // Cache must NOT have been overwritten (we never write on zero fresh successes)
  const after = JSON.parse(await store.get("znd-forecast-v0.2:days3"));
  assert.equal(after.summary.successfulLocations, 27, "cache must still hold the prior valid bundle");
});

test("runPipeline — partial outage: successful localities update, failed ones preserve LKG", async () => {
  const stored = {};
  const store = makeMemoryStore(stored);
  const priorCache = makeCached27Bundle();
  await store.put("znd-forecast-v0.2:days3", JSON.stringify(priorCache), { expirationTtl: 3600 });

  // fetch fails for Dipolog/Dapitan by lat matching; all other localities return valid data.
  const failLats = new Set([8.5872, 8.6561]);
  const fetchFn = async (urlStr) => {
    const url = new URL(urlStr);
    const lat = parseFloat(url.searchParams.get("latitude"));
    if (failLats.has(lat)) throw new Error("500");
    return makeMultiModelResponse(url.searchParams.get("forecast_days"));
  };

  const out = await runPipeline({
    fetchFn, store, days: 3, baseUrl: "http://test", timeoutMs: 1000, maxRetries: 0,
  });
  const dipolog = out.locations.find((l) => l.locationId === "dipolog");
  const dapitan = out.locations.find((l) => l.locationId === "dapitan");
  const sindangan = out.locations.find((l) => l.locationId === "sindangan");
  assert.equal(dipolog.preservedFromCache, true);
  assert.equal(dipolog.stale, true);
  assert.equal(dapitan.preservedFromCache, true);
  // sindangan fresh (not failed)
  assert.equal(sindangan.preservedFromCache, undefined);
  assert.equal(sindangan.stale, undefined);
  assert.ok(sindangan.days[0].tmax.consensus != null);
  assert.equal(out.partialRefresh, true);
  // Cache must be written (partial success) and must contain preserved stale entries
  const after = JSON.parse(await store.get("znd-forecast-v0.2:days3"));
  assert.ok(after);
  const afterDipolog = after.locations.find((l) => l.locationId === "dipolog");
  assert.equal(afterDipolog.preservedFromCache, true);
});

test("runPipeline — cache is versioned (v0.2) and does not read old v0.1 keys", async () => {
  const stored = {};
  const store = makeMemoryStore(stored);
  await store.put("znd-forecast-v0.1:days3", JSON.stringify({ version: "znd-forecast-v0.1", locations: [] }), {});
  const fetchFn = async () => { throw new Error("network down"); };
  // With no valid v0.2 cache and total fetch failure, every location is unavailable
  const out = await runPipeline({ fetchFn, store, days: 3, baseUrl: "http://x", timeoutMs: 200, maxRetries: 0 });
  assert.equal(out.zeroFreshSuccesses, true);
  assert.equal(out.locations.every((l) => l.unavailable), true,
    "With no v0.2 cache and total failure, every locality must be marked unavailable; v0.1 cache must be ignored");
});

test("mergeWithCached — never invents data for uncached failed localities", () => {
  const fresh = {
    locations: LOC_IDS.map((id) => ({ locationId: id, error: "fail", days: [], dates: [] })),
    summary: { totalLocations: 27, successfulLocations: 0, failedLocations: 27 },
  };
  const out = mergeWithCached(fresh, null);
  assert.equal(out.locations.length, 27);
  for (const l of out.locations) {
    assert.equal(l.unavailable, true);
    assert.equal(l.days.length, 0);
  }
});

// ---------- helpers ----------

function makeMemoryStore(store) {
  return {
    get: async (k) => store[k] ?? null,
    put: async (k, v, _opts) => { store[k] = String(v); },
  };
}

function makeCached27Bundle() {
  return {
    version: "znd-forecast-v0.2",
    province: "Zamboanga del Norte",
    timezone: "Asia/Manila",
    startedAt: new Date(Date.now() - 3600_000).toISOString(),
    completedAt: new Date(Date.now() - 3600_000).toISOString(),
    locations: LOC_IDS.map((id) => makeValidLoc(id, 30, 23, "cached-")),
    summary: { totalLocations: 27, successfulLocations: 27, failedLocations: 0, errors: [] },
  };
}

// Minimal multi-model Open-Meteo-shaped response for a single location.
// Returns all MODEL_API_IDS with per-suffix keys producing valid temperatures.
function makeMultiModelResponse(daysStr) {
  const days = parseInt(daysStr || "3", 10);
  const today = new Date();
  const dates = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().slice(0,10));
  }
  const daily = { time: dates };
  for (const mid of MODEL_API_IDS) {
    daily[`temperature_2m_max_${mid}`] = dates.map(() => 32 + Math.random() * 0.2);
    daily[`temperature_2m_min_${mid}`] = dates.map(() => 24 + Math.random() * 0.2);
  }
  return {
    ok: true,
    json: async () => ({ daily }),
  };
}
