import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseAiwpExtract } from "../src/providers/aiwp.js";
import { mergeAiwpIntoBundle } from "../src/aiwp.js";
import { MODEL_REGISTRY, AIWP_MODEL_IDS } from "../src/models.js";

test("AIWP static extract parses and aligns to date axis", async () => {
  const raw = JSON.parse(await readFile(new URL("../public/data/aiwp-t2-zamboanga.json", import.meta.url), "utf8"));
  const dates = ["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28"];
  const { models, stale } = parseAiwpExtract(raw, dates);
  assert.equal(models.length, 2);
  for (const m of models) {
    assert.equal(AIWP_MODEL_IDS.includes(m.modelId), true);
    assert.equal(m.consensusEligible, false, `${m.modelId} must be non-consensus`);
    assert.equal(m.aliasGroup, m.modelId);
    if (m.available) {
      const dip = m.tracesByLoc?.dipolog;
      assert.ok(dip, `${m.modelId} missing dipolog traces`);
      assert.equal(dip.tmax.length, dates.length);
      assert.equal(dip.tmin.length, dates.length);
      // 2026-10-23 PHT values should be valid tropical range (after filling)
      assert.ok(dip.tmax[1] == null || (dip.tmax[1] >= 20 && dip.tmax[1] <= 40), `${m.modelId} tmax[1] out of range: ${dip.tmax[1]}`);
      assert.ok(dip.tmin[1] == null || (dip.tmin[1] >= 18 && dip.tmin[1] <= 32), `${m.modelId} tmin[1] out of range: ${dip.tmin[1]}`);
    }
  }
  // Staleness threshold: fixture is very recent at build time, but in
  // test runs we only require that stale is a boolean.
  assert.equal(typeof stale, "boolean");
});

test("mergeAiwpIntoBundle adds valuesByModel entries without mutating consensus", async () => {
  const raw = JSON.parse(await readFile(new URL("../public/data/aiwp-t2-zamboanga.json", import.meta.url), "utf8"));
  const dates = ["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28"];
  const fakeFetch = async (url) => ({
    ok: true, status: 200, json: async () => raw,
  });
  const bundle = {
    locations: [
      { locationId: "dipolog", name: "Dipolog", dates,
        days: dates.map((d) => ({
          date: d,
          tmax: { valuesByModel: { ecmwf_ifs: 30.0 }, consensus: 30.0, n: 1 },
          tmin: { valuesByModel: { ecmwf_ifs: 24.5 }, consensus: 24.5, n: 1 },
        })) },
    ],
    perModelMeta: [],
  };
  await mergeAiwpIntoBundle(bundle, { fetchFn: fakeFetch });
  assert.ok(bundle.aiwp, "aiwp block should be present");
  const day1 = bundle.locations[0].days[1];
  // Existing ECMWF IFS value preserved
  assert.equal(day1.tmax.valuesByModel.ecmwf_ifs, 30.0);
  // At least one AIWP model should appear (if data present)
  const aiwpIds = Object.keys(day1.tmax.valuesByModel).filter((k) => AIWP_MODEL_IDS.includes(k));
  assert.ok(aiwpIds.length >= 1, `expected at least one AIWP id in valuesByModel, got ${Object.keys(day1.tmax.valuesByModel)}`);
  // Consensus value NOT modified by AIWP addition
  assert.equal(day1.tmax.consensus, 30.0);
  // perModelMeta contains AIWP models flagged non-consensus
  const aiwpMeta = bundle.perModelMeta.filter((m) => AIWP_MODEL_IDS.includes(m.modelId));
  assert.ok(aiwpMeta.length >= 1);
  for (const m of aiwpMeta) assert.equal(m.consensusEligible, false);
});

test("mergeAiwpIntoBundle degrades gracefully when fetch fails", async () => {
  const fakeFetch = async () => { throw new Error("network down"); };
  const bundle = { locations: [{ locationId: "dipolog", dates: [], days: [] }], perModelMeta: [] };
  await mergeAiwpIntoBundle(bundle, { fetchFn: fakeFetch });
  assert.equal(bundle.aiwp.available, false);
  assert.ok(bundle.aiwp.error);
});

test("MODEL_REGISTRY flags both AIWP entries as static_extract (not Open-Meteo feeds)", () => {
  for (const id of AIWP_MODEL_IDS) {
    const m = MODEL_REGISTRY.find((r) => r.requestedModelId === id);
    assert.ok(m, `expected registry entry for ${id}`);
    assert.equal(m.availabilityStatus, "static_extract", `${id} should be static_extract, not a live Open-Meteo feed`);
    assert.equal(m.consensusEligible, false);
  }
});
