import test from "node:test";
import assert from "node:assert/strict";
import { robustWeightedMean, medianOfSorted } from "../src/aggregation/aggregate.js";

test("robustWeightedMean falls back to median when fewer than MIN_FOR_WEIGHTED points", () => {
  const out = robustWeightedMean([{modelId:"a", v: 30}, {modelId:"b", v: 32}]);
  assert.equal(out.method, "median");
  assert.equal(out.consensus, 31);
});

test("robustWeightedMean trims extreme outliers and computes weighted mean on remainder", () => {
  // One extreme value (40) against a tight cluster [29..31] should be trimmed
  // because MAD-based sigma flags it > 2.5σ from the median.
  const out = robustWeightedMean([
    {modelId:"ecmwf_ifs", v: 30},
    {modelId:"icon_global", v: 31},
    {modelId:"gfs_seamless", v: 30},
    {modelId:"ncep_aigfs025", v: 29},
    {modelId:"ukmo_seamless", v: 30},
    {modelId:"arpege_world", v: 31},
    {modelId:"gem_global", v: 29},
    {modelId:"jma_gsm", v: 30},
    {modelId:"gfs013", v: 40},  // outlier (~10° from the cluster)
  ]);
  assert.equal(out.method, "weighted_mean");
  assert.equal(out.n_after_trim, 8, `expected 8 after trim, got ${out.n_after_trim}`);
  assert.ok(out.trimmed.some((t) => t.modelId === "gfs013"), "gfs013 should be trimmed as outlier");
  // Cluster consensus ≈ 30.0 regardless of weights (cluster is symmetric around 30)
  assert.ok(Math.abs(out.consensus - 30.0) < 0.2, `consensus ${out.consensus} should be near 30`);
});

test("weights apply correctly: higher-weight centre pulls consensus toward its value", () => {
  // Three models: PAGASA (w=2.5) at 33, ECMWF (w=1.5) at 30, aifs (w=0.5) at 27.
  // Weighted = (2.5*33 + 1.5*30 + 0.5*27)/(2.5+1.5+0.5) = (82.5+45+13.5)/4.5 = 141/4.5 = 31.333 -> 31.3
  const out = robustWeightedMean([
    {modelId:"pagasa_provincial", v: 33},
    {modelId:"ecmwf_ifs", v: 30},
    {modelId:"ecmwf_aifs025_single", v: 27},
  ]);
  assert.equal(out.method, "weighted_mean");
  assert.equal(out.consensus, 31.3);
});

test("single point returns median (the value itself)", () => {
  const out = robustWeightedMean([{modelId:"a", v: 29.5}]);
  assert.equal(out.method, "median");
  assert.equal(out.consensus, 29.5);
});
