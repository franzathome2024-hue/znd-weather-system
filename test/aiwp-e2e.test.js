// Quick e2e-style test: simulate Worker invocation of /api/forecast with an
// in-memory cache that contains a minimal Open-Meteo bundle, and confirm
// that AIWP traces get merged in.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Build minimal env
async function makeEnv() {
  const aiwpJson = await readFile(new URL("../public/data/aiwp-t2-zamboanga.json", import.meta.url), "utf8");
  const mem = new Map();
  const bundle = JSON.parse(aiwpJson);
  // Build a 7-day skeleton for all 27 locations
  const dates = ["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28"];
  const locations = bundle.locations.map((loc) => ({
    locationId: loc.id, name: loc.id, lat: loc.lat, lon: loc.lon, type: "municipality",
    dates,
    days: dates.map((d) => ({
      date: d,
      tmax: { valuesByModel: { ecmwf_ifs: 30.0 }, consensus: 30.0, n: 1, min: 29, max: 31, iqr: 0.5, dropped_duplicates: [] },
      tmin: { valuesByModel: { ecmwf_ifs: 24.5 }, consensus: 24.5, n: 1, min: 24, max: 25, iqr: 0.3, dropped_duplicates: [] },
    })),
  }));
  const skeleton = {
    version: "znd-forecast-v0.2", completedAt: new Date().toISOString(),
    summary: { totalLocalities: locations.length, successful: locations.length },
    locations, perModelMeta: [],
  };
  mem.set("znd-forecast-v0.2:days7", JSON.stringify(skeleton));
  // Patch dynamic import of worker — but easier: call mergeAiwpIntoBundle directly.
  return { mem, aiwpJson, skeleton, dates };
}

test("AIWP merge adds Pangu + GraphCast traces to cached bundle and sets aiwp metadata", async () => {
  const { skeleton, dates } = await makeEnv();
  const aiwpJson = JSON.parse(await readFile(new URL("../public/data/aiwp-t2-zamboanga.json", import.meta.url), "utf8"));
  const { mergeAiwpIntoBundle } = await import("../src/aiwp.js");
  const fakeFetch = async () => ({ ok: true, status: 200, json: async () => aiwpJson });
  await mergeAiwpIntoBundle(skeleton, { fetchFn: fakeFetch });
  assert.equal(skeleton.aiwp.available, true, "aiwp should be available");
  assert.equal(skeleton.aiwp.stale, false, "fresh fixture should not be stale");
  assert.equal(skeleton.aiwp.models.length, 2);
  const dip = skeleton.locations.find((l) => l.locationId === "dipolog");
  const day = dip.days[1]; // 2026-10-23 PHT
  assert.ok(day.tmax.valuesByModel.pangu_ifs != null || day.tmax.valuesByModel.graphcast_ifs != null,
    "expected at least one AIWP model value for Dipolog on 2026-10-23");
  // Consensus MUST be unchanged (30.0)
  assert.equal(day.tmax.consensus, 30.0, "consensus must not be affected by AIWP traces");
  // perModelMeta should list AIWP models with consensusEligible=false
  const aiwpMeta = skeleton.perModelMeta.filter((m) => ["pangu_ifs", "graphcast_ifs"].includes(m.modelId));
  assert.equal(aiwpMeta.length, 2);
  for (const m of aiwpMeta) assert.equal(m.consensusEligible, false);
});
