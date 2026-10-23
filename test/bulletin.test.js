import { test } from "node:test";
import assert from "node:assert/strict";
import { generateBisayaBulletin } from "../src/bulletin/bisaya.js";
import { LOCATIONS } from "../src/locations.js";
import { MODELS } from "../src/models.js";

// Build a minimal synthetic bundle with deterministic data so we can assert
// the bulletin contains key structural elements without inventing values.
function makeSyntheticBundle({ tempBase = 30, spread = 2, failSome = false } = {}) {
  const dates = ["2026-10-23", "2026-10-24"];
  const locations = LOCATIONS.map((loc, i) => {
    const fail = failSome && i < 3;
    if (fail) {
      return { locationId: loc.id, error: "synthetic", days: [], dates };
    }
    // All models agree on a value (consensus = tempBase +/- i/5), small spread.
    const tmax = tempBase + (i % 5) * 0.3;
    const tmin = tmax - 6 + spread * 0.2;
    const perModel = MODELS.map((m) => ({ modelId: m.id, tmax: dates.map(() => tmax), tmin: dates.map(() => tmin) }));
    return buildFakeLoc(loc.id, dates, perModel);
  });
  return {
    version: "znd-weather-v0.1",
    province: "Zamboanga del Norte",
    timezone: "Asia/Manila",
    startedAt: new Date("2026-10-23T01:00:00Z").toISOString(),
    completedAt: new Date("2026-10-23T01:00:30Z").toISOString(),
    models: MODELS,
    locations,
    summary: { totalLocations: 27, successfulLocations: failSome ? 24 : 27, failedLocations: failSome ? 3 : 0, totalLatencyMs: 100, errors: [] },
  };
}

function buildFakeLoc(locationId, dates, perModel) {
  const days = dates.map((d, i) => {
    const hiVals = perModel.map((m) => m.tmax[i]);
    const loVals = perModel.map((m) => m.tmin[i]);
    const med = (arr) => { const s = [...arr].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; };
    const hi = med(hiVals), lo = med(loVals);
    return {
      date: d,
      tmax: { consensus: hi, n: hiVals.filter(v=>v!=null).length, min: Math.min(...hiVals), max: Math.max(...hiVals), iqr: 0, valuesByModel: Object.fromEntries(perModel.map((m)=>([m.modelId, m.tmax[i]]))), qc_status: "ok" },
      tmin: { consensus: lo, n: loVals.filter(v=>v!=null).length, min: Math.min(...loVals), max: Math.max(...loVals), iqr: 0, valuesByModel: Object.fromEntries(perModel.map((m)=>([m.modelId, m.tmin[i]]))), qc_status: "ok" },
      n_contributing: perModel.length,
      spread_c: Math.max(Math.max(...hiVals)-Math.min(...hiVals), Math.max(...loVals)-Math.min(...loVals)),
      qc_status: "ok",
    };
  });
  return { locationId, dates, days, perModel: perModel.map((m)=>({modelId:m.modelId})), retrievedAt: new Date().toISOString() };
}

test("Bisaya bulletin contains required structural elements and no invented rain talk", () => {
  const b = generateBisayaBulletin(makeSyntheticBundle(), 0);
  // Required header
  assert.ok(b.startsWith("PANAHON KARONG ADLAWA | ZAMBOANGA DEL NORTE"), "must start with required header");
  // Cities must be listed
  assert.match(b, /Dipolog City/, "must list Dipolog City");
  assert.match(b, /Dapitan City/, "must list Dapitan City");
  // A sample municipality
  assert.match(b, /Sindangan/, "must list Sindangan");
  assert.match(b, /Siocon/, "must list Siocon");
  // PAGASA disclaimer
  assert.match(b, /DOST-PAGASA/i, "must include PAGASA disclaimer");
  // Source attribution
  assert.match(b, /Open-Meteo/i, "must mention source");
  // Must NOT fabricate rain probabilities — there should be no "tsansa sa ulan"
  // or specific numeric percentages.
  assert.doesNotMatch(b, /\b\d{1,3}%\b/, "must not invent percentage probabilities");
  // Last successful update timestamp present (PST)
  assert.match(b, /PST/, "must show last update in PST");
});

test("Bulletin mentions missing-data locations when some fail", () => {
  const b = generateBisayaBulletin(makeSyntheticBundle({ failSome: true }), 0);
  assert.match(b, /walay datos|wala pa'y kompletong datos/, "must warn about missing data when locations fail");
});

test("Bulletin contains all 27 location lines (cities + municipalities)", () => {
  const b = generateBisayaBulletin(makeSyntheticBundle(), 0);
  // Count bullet lines starting with "•"
  const bullets = b.split("\n").filter((l) => l.startsWith("•"));
  assert.ok(bullets.length >= 27, `expected at least 27 bullet location lines, got ${bullets.length}`);
});
