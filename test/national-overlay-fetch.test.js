// Regression tests for the national-overlay fetch configuration.
//
// Root cause of the 2026-10-23 deployed failure: app-om.js passed
// `cache: 'no-cors'` to fetch(). 'no-cors' is not a valid RequestCache value —
// it's a RequestMode — so the browser threw a TypeError before even issuing
// the request, and the overlay never initialized. S3 actually sends
// Access-Control-Allow-Origin: * so plain CORS mode works.
//
// These tests lock in correct fetch options, verify S3 CORS headers, and
// exercise the graceful-failure path when HTTP is non-2xx / JSON is bad.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..");

test("app-om.js does not pass invalid cache:'no-cors' to fetch (the bug)", () => {
  const src = fs.readFileSync(path.join(REPO, "public/app-om.js"), "utf8");
  // The invalid pattern that shipped:
  assert.doesNotMatch(
    src,
    /cache\s*:\s*['"]no-cors['"]/,
    "fetch() must not be called with cache: 'no-cors' — 'no-cors' is a mode, not a cache enum",
  );
  // Must explicitly use a valid cache mode and default CORS mode for the
  // metadata fetch so we can read the JSON.
  assert.match(src, /cache\s*:\s*['"]no-cache['"]/, "expected cache: 'no-cache' for metadata revalidation");
  assert.match(src, /mode\s*:\s*['"]cors['"]/, "expected mode: 'cors' (S3 returns ACAO:*)");
});

test("app-om.js does not use mode:'no-cors' anywhere (it yields opaque responses we cannot json() parse)", () => {
  const src = fs.readFileSync(path.join(REPO, "public/app-om.js"), "utf8");
  const stripped = src.replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(
    stripped,
    /mode\s*:\s*['"]no-cors['"]/,
    "must not use no-cors mode for JSON metadata fetch",
  );
});

test("Open-Meteo S3 endpoint returns permissive CORS and JSON content-type (live)", async () => {
  const r = await fetch(
    "https://openmeteo.s3.amazonaws.com/data_spatial/ecmwf_ifs/latest.json?variable=temperature_2m",
    { cache: "no-cache", mode: "cors", headers: { "Origin": "https://example.com" } },
  );
  assert.equal(r.status, 200);
  assert.ok(
    /\*/.test(r.headers.get("access-control-allow-origin") || ""),
    "S3 must allow cross-origin reads (ACAO: *), otherwise we would need a Worker proxy",
  );
  assert.match(r.headers.get("content-type") || "", /application\/json/);
  const j = await r.json();
  assert.equal(j.completed, true);
  assert.ok(Array.isArray(j.valid_times) && j.valid_times.length > 0);
});

test("non-2xx metadata response is caught and surfaced as overlayError (graceful failure, no crash)", async () => {
  // Dynamic import of app-om.js not trivial in Node (workers/WASM), so we
  // assert the error-handling structure statically: init() catches fetch
  // failures, sets overlay.error, and a #warnOverlay element exists in HTML.
  const src = fs.readFileSync(path.join(REPO, "public/app-om.js"), "utf8");
  assert.match(src, /overlay\.error\s*=/);
  assert.match(src, /catch\s*\(e\)\s*\{[^}]*overlay\.error/);
  const html = fs.readFileSync(path.join(REPO, "public/index.html"), "utf8");
  assert.match(html, /id="warnOverlay"/, "warning banner must exist in DOM");
  // app.js must call showOverlayWarn and not throw into render()
  const appjs = fs.readFileSync(path.join(REPO, "public/app.js"), "utf8");
  assert.match(appjs, /function showOverlayWarn/);
  assert.match(appjs, /showOverlayWarn\(/);
  assert.match(appjs, /state\.overlayError/);
});

test("malformed latest.json would propagate as a rejected promise from fetchJsonCached (in-memory cache does not store errors)", async () => {
  // Stub-free verification: if fetch throws, the promise rejects, but we
  // never store rejected promises into metaCache in the success path. The
  // code is `const p = fetch(...).then(...)` without a .catch before
  // metaCache.set, so transient failures stay un-cached (retries on next
  // call will refetch). We assert that shape here.
  const src = fs.readFileSync(path.join(REPO, "public/app-om.js"), "utf8");
  assert.match(src, /metaCache\.set\(url,\s*p\)/);
  // Confirm the `.then` is attached directly (no .catch swallowing errors
  // into the cache).
  assert.match(src, /fetch\(url,\s*\{[^}]*\}\)\.then\(async\s*\(r\)\s*=>/);
});

test("overlay tile fetches also go through CORS via the OM library to the S3 endpoint (no referer-lock, no proxy)", () => {
  const appom = fs.readFileSync(path.join(REPO, "public/app-om.js"), "utf8");
  // Must build om:// URLs pointing at S3 (not data-spatial.open-meteo.com).
  assert.match(appom, /https:\/\/openmeteo\.s3\.amazonaws\.com\/data_spatial/);
  assert.match(appom, /om:\/\/\$\{url\}/, "raster source must use om:// protocol (in-browser fetch via OM library)");
  const stripped = appom.replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(stripped, /https?:\/\/data-spatial\.open-meteo\.com/, "must not use referer-locked host");
  // No Worker proxy path for raster tiles in this codebase (no /api/omtiles).
  const appjs = fs.readFileSync(path.join(REPO, "public/app.js"), "utf8");
  assert.doesNotMatch(appjs, /\/api\/(om|tile|raster)/);
  assert.doesNotMatch(appom, /\/api\/(om|tile|raster)/);
});

test("om:// URL construction passes time= parameter but does NOT strip the variable= filter", () => {
  const src = fs.readFileSync(path.join(REPO, "public/app-om.js"), "utf8");
  // Ensure base URLs carry ?variable=temperature_2m{,_max,_min} and time is
  // appended with &time= (not ?time=) so the variable filter survives.
  assert.match(src, /variable=temperature_2m(?!_max|_min)/);
  assert.match(src, /variable=temperature_2m_max/);
  assert.match(src, /variable=temperature_2m_min/);
  assert.match(src, /const sep = base\.includes\('\?'\) \? '&' : '\?'/);
  assert.match(src, /\$\{sep\}time=\$\{encodeURIComponent\(validTimeIso\)\}/);
});
