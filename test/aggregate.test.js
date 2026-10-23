import { test } from "node:test";
import assert from "node:assert/strict";
import { medianOfSorted, quartiles, aggregateDaily, buildLocationForecast } from "../src/aggregation/aggregate.js";

test("medianOfSorted — odd and even lengths", () => {
  assert.equal(medianOfSorted([1, 2, 3]), 2);
  assert.equal(medianOfSorted([1, 2, 3, 4]), 2.5);
  assert.equal(medianOfSorted([5]), 5);
  assert.equal(medianOfSorted([]), null);
});

test("quartiles — small arrays", () => {
  const { q1, q3 } = quartiles([1, 2, 3, 4, 5]);
  assert.ok(q1 < 3 && q3 > 3);
  assert.equal(quartiles([7]).q1, 7);
  assert.equal(quartiles([7]).q3, 7);
});

test("aggregateDaily — median consensus across multiple models, drops nulls", () => {
  const dates = ["2026-01-01", "2026-01-02"];
  const series = [
    { modelId: "A", values: [30, 28] },
    { modelId: "B", values: [32, 26] },
    { modelId: "C", values: [34, null] },  // one null on day 2
    { modelId: "D", values: [null, null] }, // all null
  ];
  const out = aggregateDaily(series, dates);
  assert.equal(out.length, 2);
  // Day 1: values [30,32,34] -> median 32, min 30, max 34, n=3
  assert.equal(out[0].n, 3);
  assert.equal(out[0].consensus, 32);
  assert.equal(out[0].min, 30);
  assert.equal(out[0].max, 34);
  // Day 2: values [28,26] (C null, D null) -> median 27, n=2
  assert.equal(out[1].n, 2);
  assert.equal(out[1].consensus, 27);
  assert.equal(out[1].qc_status, "few_models");
});

test("aggregateDaily — deduplicates identical series (avoid double-counting aliases)", () => {
  const dates = ["2026-01-01"];
  const series = [
    { modelId: "gfs_seamless", values: [30] },
    { modelId: "gfs013",      values: [30] }, // identical -> deduped
    { modelId: "ecmwf_ifs",   values: [32] },
  ];
  const out = aggregateDaily(series, dates);
  assert.equal(out[0].n, 2, "gfs013 should be deduped against gfs_seamless");
  assert.equal(out[0].consensus, 31);
});

test("buildLocationForecast — full day record shape and median hi/lo can come from different models", () => {
  const dates = ["2026-01-01", "2026-01-02"];
  // Model 1 warm days: hi=33 lo=27 ; Model 2 cool days: hi=29 lo=23
  // -> median hi=31, median lo=25
  const perModel = [
    { modelId: "WARM", tmax: [33, 31], tmin: [27, 26] },
    { modelId: "COOL", tmax: [29, 28], tmin: [23, 22] },
  ];
  const bundle = buildLocationForecast({
    locationId: "test", perModel, dates, retrievedAt: new Date("2026-01-01T00:00:00Z").toISOString(),
  });
  assert.equal(bundle.locationId, "test");
  assert.equal(bundle.days.length, 2);
  const d0 = bundle.days[0];
  assert.equal(d0.tmax.consensus, 31);
  assert.equal(d0.tmin.consensus, 25);
  assert.equal(d0.n_contributing, 2);
});

test("aggregateDaily — no models at all returns qc_status no_models", () => {
  const out = aggregateDaily([], ["2026-01-01"]);
  assert.equal(out[0].qc_status, "no_models");
  assert.equal(out[0].n, 0);
  assert.equal(out[0].consensus, null);
});

test("aggregateDaily — all-missing values returns all_missing", () => {
  const out = aggregateDaily([{ modelId: "A", values: [null] }], ["2026-01-01"]);
  assert.equal(out[0].qc_status, "all_missing");
});
