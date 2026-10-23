import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateDaily, buildLocationForecast } from "../src/aggregation/aggregate.js";

test("alias de-duplication removes gfs013 when identical to gfs_seamless", () => {
  const dates = ["2026-01-01"];
  const series = [
    { modelId: "ecmwf_ifs",         values: [30.0] },
    { modelId: "icon_global",       values: [34.0] },
    { modelId: "gfs_seamless",      values: [32.0] },
    { modelId: "gfs013",            values: [32.0] }, // same alias group, same value -> deduped
    { modelId: "ncep_aigfs025",     values: [30.0] },
    { modelId: "ukmo_seamless",     values: [32.0] },
    { modelId: "arpege_world",      values: [34.0] },
    { modelId: "gem_global",        values: [32.0] },
    { modelId: "jma_gsm",           values: [30.0] },
    { modelId: "ecmwf_aifs025_single", values: [29.0] },
  ];
  const out = aggregateDaily(series, dates);
  // n_raw should be 9, n_after_trim 9 — gfs013 dropped before weighting
  assert.equal(out[0].n_raw, 9, `expected 9 independent contributors after GFS dedup, got ${out[0].n_raw}`);
  assert.equal(out[0].n, 9, `expected 9 contributors after outlier trim, got ${out[0].n}`);
  assert.equal(out[0].consensusMethod, "weighted_mean");
  // Weighted mean of [e=1.5, i=1.0, g=1.0, a=1.5, u=1.5, a=1.0, g=1.0, j=1.0, aifs=0.5]
  //   = (1.5*30 + 1*34 + 1*32 + 1.5*30 + 1.5*32 + 1*34 + 1*32 + 1*30 + 0.5*29) / (1.5+1+1+1.5+1.5+1+1+1+0.5)
  //   = (45+34+32+45+48+34+32+30+14.5) / 10.0 = 314.5/10 = 31.45 -> rounds to 31.5
  assert.equal(out[0].consensus, 31.5);
  // dropped records should mention gfs013 duplicate of gfs_seamless
  const drop = out[0].dropped.find((d) => d.modelId === "gfs013");
  assert.ok(drop, "expected gfs013 in dropped list");
  assert.equal(drop.duplicateOf, "gfs_seamless");
});

test("non-identical alias-group members are NOT deduped (keep independent signal)", () => {
  const dates = ["2026-01-01"];
  const series = [
    { modelId: "gfs_seamless", values: [32.0] },
    { modelId: "gfs013",       values: [33.0] }, // different — keep both
  ];
  const out = aggregateDaily(series, dates);
  assert.equal(out[0].n, 2, "different values within an alias group should both be kept");
});

test("separate hi/lo contributor counts can differ", () => {
  const dates = ["2026-01-01"];
  const perModel = [
    { modelId: "ecmwf_ifs",   tmax: [30.0], tmin: [25.0] },
    { modelId: "icon_global", tmax: [34.0], tmin: [null] }, // only contributes to hi
    { modelId: "gfs_seamless",tmax: [32.0], tmin: [24.0] },
  ];
  const bundle = buildLocationForecast({
    locationId: "test", perModel, dates, retrievedAt: new Date().toISOString(),
  });
  const d = bundle.days[0];
  assert.equal(d.tmax.n, 3, "tmax contributors should be 3");
  assert.equal(d.tmin.n, 2, "tmin contributors should be 2 (icon_global has null tmin)");
  assert.equal(d.n_contributing_hi, 3);
  assert.equal(d.n_contributing_lo, 2);
});

test("ICON aliases (icon_global, icon_seamless, dwd_icon) collapse to one contributor", () => {
  const dates = ["2026-01-01"];
  const series = [
    { modelId: "icon_global",   values: [34.0] },
    { modelId: "icon_seamless", values: [34.0] },
    { modelId: "dwd_icon",      values: [34.0] },
  ];
  const out = aggregateDaily(series, dates);
  assert.equal(out[0].n, 1, "three ICON aliases with identical values should collapse to 1 contributor");
});
