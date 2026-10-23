import test from "node:test";
import assert from "node:assert/strict";
import { pagasaPerModelTraces } from "../src/providers/pagasa.js";

test("pagasaPerModelTraces aligns dates correctly and returns perModel entry", () => {
  const fake = {
    ok: true,
    issuedAt: "2026-10-23T09:00:00Z",
    source: "PAGASA test fixture",
    provinceName: "Zamboanga del Norte, Zamboanga Peninsula",
    days: [
      { date: "2026-10-23", tmax: 33, tmin: 26 },
      { date: "2026-10-24", tmax: 35, tmin: 26 },
      { date: "2026-10-25", tmax: 34, tmin: 25 },
    ],
  };
  const dates = ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"];
  const { available, perModel } = pagasaPerModelTraces(fake, dates);
  assert.equal(available, true);
  assert.equal(perModel.length, 1);
  const pm = perModel[0];
  assert.equal(pm.modelId, "pagasa_provincial");
  assert.equal(pm.status, "ok");
  assert.deepEqual(pm.tmax, [33, 35, 34, null]);
  assert.deepEqual(pm.tmin, [26, 26, 25, null]);
});

test("pagasaPerModelTraces degrades gracefully with malformed input", () => {
  const r = pagasaPerModelTraces({ ok: false, error: "x" }, []);
  assert.equal(r.available, false);
  const r2 = pagasaPerModelTraces(null, []);
  assert.equal(r2.available, false);
});
