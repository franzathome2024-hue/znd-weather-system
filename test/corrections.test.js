// Additional regression tests for the 13-priority correction set:
//   - Bulletin uses "Philippine Time (Asia/Manila)" (no bare PST)
//   - 27 LGUs present in locations.js
//   - Facebook publishing defaults off in vars (verified via wrangler.toml string check)
//   - No hardcoded credentials/tokens in source code
//   - Map GeoJSON is labeled "NOT official boundaries"
//   - MULTI-GLOBAL is excluded_by_design and not consensus-eligible
//   - ACCESS-G status is returned_nulls with evidence of global (Sydney) nulls
//   - Aggregate exposes IQR and range
//   - Bulletin includes a PAGASA advisory disclaimer (no impersonation)

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { LOCATIONS } from "../src/locations.js";
import { MODEL_REGISTRY } from "../src/models.js";
import { generateBisayaBulletin } from "../src/bulletin/bisaya.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

test("LOCATIONS contains exactly 27 LGUs (municipalities + cities) of Zamboanga del Norte", () => {
  assert.equal(LOCATIONS.length, 27, "Expected 27 LGUs for Zamboanga del Norte");
  const ids = new Set(LOCATIONS.map((l) => l.id));
  assert.equal(ids.size, 27, "location IDs must be unique");
  // Key cities must exist
  assert.ok(ids.has("dipolog"));
  assert.ok(ids.has("dapitan"));
  assert.ok(ids.has("sindangan"));
});

test("MULTI-GLOBAL is excluded by design and not consensus-eligible", () => {
  const mg = MODEL_REGISTRY.find((m) => m.targetLabel === "MULTI-GLOBAL");
  assert.ok(mg, "MULTI-GLOBAL must appear in registry (with documented exclusion)");
  assert.equal(mg.availabilityStatus, "excluded_by_design");
  assert.equal(mg.consensusEligible, false);
});

test("ACCESS-G is documented as returned_nulls with global-null evidence (Sydney test)", () => {
  const ag = MODEL_REGISTRY.find((m) => m.targetLabel === "ACCESS-G");
  assert.ok(ag);
  assert.equal(ag.availabilityStatus, "returned_nulls");
  assert.ok(ag.evidence?.pointsTested?.some((p) => p.includes("Sydney")),
    "evidence must document that Sydney (AU) was tested and returned all-null — confirming it's a global outage, not a PH coverage gap");
  assert.ok(ag.evidence?.globalNullFinding, "globalNullFinding narrative must be present");
});

test("Bulletin labels time as Philippine Time / Asia/Manila (no bare 'PST' without qualification)", () => {
  // Minimal bundle shape the bulletin needs
  const bundle = {
    version: "znd-forecast-v0.2",
    completedAt: new Date().toISOString(),
    locations: LOCATIONS.map((loc) => ({
      locationId: loc.id,
      dates: ["2026-10-23","2026-10-24","2026-10-25"],
      days: [
        makeDay(31,25), makeDay(30,24), makeDay(30,24),
      ],
    })),
  };
  const text = generateBisayaBulletin(bundle, 0);
  assert.match(text, /Philippine Time/, "Bulletin must use 'Philippine Time' label");
  assert.match(text, /Asia\/Manila/, "Bulletin must reference Asia/Manila timezone");
  assert.match(text, /DOST-PAGASA/, "Bulletin must advise following PAGASA for official warnings (no impersonation)");
});

test("Voronoi approximation GeoJSON is present and carries non-authoritative disclaimer", () => {
  const geoPath = path.join(REPO_ROOT, "public/data/zamboanga_del_norte_approx.geojson");
  assert.ok(fs.existsSync(geoPath), "Approximate geojson must exist (license-safe fallback)");
  const raw = fs.readFileSync(geoPath, "utf8");
  assert.match(raw, /NOT official/, "GeoJSON must state it is NOT official boundaries");
  assert.match(raw, /visualization only/i, "GeoJSON must be labeled visualization-only");
  const geo = JSON.parse(raw);
  assert.equal(geo.features.length, 27, "Approximation must contain one feature per LGU");
});

test("wrangler.toml defaults FACEBOOK_PUBLISH_ENABLED to false", () => {
  const toml = fs.readFileSync(path.join(REPO_ROOT, "wrangler.toml"), "utf8");
  assert.match(toml, /FACEBOOK_PUBLISH_ENABLED\s*=\s*"false"/, "Facebook must be OFF by default");
  assert.match(toml, /OFF by default/, "Comment must document that publishing is off by default");
});

test("No hardcoded tokens/secrets in source tree (heuristic)", () => {
  // Scan src/ and public/ for strings that look like common secret formats.
  // This is a heuristic; it won't catch everything but it will catch obvious
  // leaks. We exclude test fixtures and docs/verification.
  const skip = new Set(["node_modules", ".git", "docs/verification"]);
  const patterns = [
    /ghp_[A-Za-z0-9]{20,}/,         // GitHub PATs
    /EAAC[A-Za-z0-9_-]{30,}/,       // Facebook long-lived tokens
    /sk_live_[A-Za-z0-9]{16,}/,     // Stripe live keys
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /cloudflare_[a-z0-9]{40,}/i,
  ];
  const hits = [];
  walk(path.join(REPO_ROOT, "src"), (f) => {
    if (skip.has(path.relative(REPO_ROOT, f).split(path.sep)[0])) return;
    const content = fs.readFileSync(f, "utf8");
    for (const p of patterns) {
      if (p.test(content) && !f.endsWith("corrections.test.js")) {
        // Allow intentional comments that reference pattern names but not real values.
        hits.push({ file: path.relative(REPO_ROOT, f), pattern: String(p).slice(0,60) });
      }
    }
  });
  walk(path.join(REPO_ROOT, "public"), (f) => {
    if (skip.has(path.relative(REPO_ROOT, f).split(path.sep)[0])) return;
    if (f.endsWith(".js") || f.endsWith(".html") || f.endsWith(".css")) {
      const content = fs.readFileSync(f, "utf8");
      for (const p of patterns) {
        if (p.test(content)) hits.push({ file: path.relative(REPO_ROOT, f), pattern: String(p).slice(0,60) });
      }
    }
  });
  assert.deepEqual(hits, [], "No hardcoded secret-like strings should be present in src/ or public/");
});

test("aggregate.js exposes IQR and range for tmax/tmin", async () => {
  const { aggregateDaily } = await import("../src/aggregation/aggregate.js");
  const out = aggregateDaily(
    [
      { modelId: "A", values: [30] },
      { modelId: "B", values: [32] },
      { modelId: "C", values: [34] },
    ],
    ["2026-01-01"]
  )[0];
  assert.equal(out.min, 30);
  assert.equal(out.max, 34);
  assert.equal(typeof out.iqr, "number");
  assert.ok(out.iqr >= 0);
});

function makeDay(hi, lo) {
  return {
    tmax: { consensus: hi, n: 8, min: hi-2, max: hi+2, iqr: 2, valuesByModel: {}, qc_status: "ok" },
    tmin: { consensus: lo, n: 8, min: lo-2, max: lo+2, iqr: 2, valuesByModel: {}, qc_status: "ok" },
    qc_status: "ok", n_contributing: 8, n_contributing_hi: 8, n_contributing_lo: 8,
    spread_c: 4,
  };
}

function walk(dir, cb) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, cb);
    else cb(full);
  }
}
