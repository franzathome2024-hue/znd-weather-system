import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOpenMeteoResponse } from "../src/providers/open-meteo.js";

// Open-Meteo with timezone=Asia/Manila returns `daily.time` as LOCAL calendar
// dates (YYYY-MM-DD) aligned to PST midnight. That means the first array index
// is the current PST day — not UTC day. Our provider must preserve those dates
// verbatim; downstream aggregation treats them as local-day keys.

test("parseOpenMeteoResponse — dates are preserved as local PST calendar days returned by the API", () => {
  // Minimal synthetic response that mimics Open-Meteo's shape.
  const fake = {
    latitude: 8.58,
    longitude: 123.33,
    timezone: "Asia/Manila",
    daily: {
      time: ["2026-10-23", "2026-10-24", "2026-10-25"],
      "temperature_2m_max_ecmwf_ifs": [30.2, 28.3, 29.9],
      "temperature_2m_min_ecmwf_ifs": [25.0, 24.5, 24.0],
      "temperature_2m_max_icon_global": [34.2, 33.4, 31.9],
      "temperature_2m_min_icon_global": [25.1, 24.5, 24.7],
    },
  };
  const { dates, perModel } = parseOpenMeteoResponse(fake);
  assert.deepEqual(dates, ["2026-10-23", "2026-10-24", "2026-10-25"]);
  const ecmwf = perModel.find((m) => m.modelId === "ecmwf_ifs");
  assert.ok(ecmwf, "ecmwf_ifs model expected in parsed output");
  assert.deepEqual(ecmwf.tmax, [30.2, 28.3, 29.9]);
  assert.deepEqual(ecmwf.tmin, [25.0, 24.5, 24.0]);
  assert.equal(ecmwf.status, "ok");
  // A model that we request but that the response doesn't include for some
  // reason must be recorded as nulls rather than silently dropped.
  const missingModel = perModel.find((m) => m.modelId === "gem_global");
  assert.ok(missingModel, "all requested models must appear in output");
  assert.equal(missingModel.status, "missing_in_response");
  assert.deepEqual(missingModel.tmax, [null, null, null]);
});

test("parseOpenMeteoResponse — all-null model channel marked all_null", () => {
  const fake = {
    timezone: "Asia/Manila",
    daily: {
      time: ["2026-10-23"],
      "temperature_2m_max_bom_access_global": [null],
      "temperature_2m_min_bom_access_global": [null],
    },
  };
  // Our MODELS list includes bom_access_global? No — actually we REMOVED it
  // because it returns all nulls for PH. But parseOpenMeteoResponse iterates
  // MODELS; if a model's id isn't in the response at all it's 'missing_in_response';
  // if its arrays are present but all null it's 'all_null'. We use a hack:
  // simulate by adding a synthetic key through reusing existing models list —
  // here we test that the null-aware logic works by spying on a known-present
  // model's arrays. We'll just test that for a real-model id with nulls, the
  // status becomes all_null by temporarily constructing the minimal case.
  const fake2 = {
    timezone: "Asia/Manila",
    daily: {
      time: ["2026-10-23"],
      "temperature_2m_max_ecmwf_ifs": [null],
      "temperature_2m_min_ecmwf_ifs": [null],
    },
  };
  const { perModel } = parseOpenMeteoResponse(fake2);
  const m = perModel.find((x) => x.modelId === "ecmwf_ifs");
  assert.equal(m.status, "all_null");
});
