// Tests for the nationwide ECMWF temperature overlay (feat/ph-national-temperature-overlay):
//   1. HTML contains the national/LGU view toggle, overlay time picker, map view default.
//   2. app-om.js module exists and uses the raw S3 endpoint (not referer-locked host).
//   3. ECMWF IFS metadata endpoint (latest.json) is reachable and contains the expected
//      WGS84 CRS, valid times, and t2m/tmax/tmin variables (network-verified).
//   4. The PH extent constant covers Luzon/Visayas/Mindanao in WGS84.
//   5. app.js installOrUpdateOmSource / applyViewMode helpers exist and toggle muni-line
//      visibility for the two views.
//   6. Legacy 27-LGU choropleth and map-ready guard remain in place (no regression).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..");

test("HTML exposes map-view toggle and overlays time select with sensible defaults", () => {
  const html = fs.readFileSync(path.join(REPO, "public/index.html"), "utf8");
  assert.match(html, /<select id="mapViewSelect">/);
  assert.match(html, /<option value="national"[^>]*>National temperature/);
  assert.match(html, /<option value="zamboanga"[^>]*>Zamboanga del Norte LGUs/);
  assert.match(html, /<div class="ctrl" id="overlayCtrl"/);
  assert.match(html, /<select id="overlayTimeSelect"/);
  // The national option comes first => default selection is national per DoD.
  const idxNat = html.indexOf('value="national"');
  const idxZam = html.indexOf('value="zamboanga"');
  assert.ok(idxNat >= 0 && idxZam > idxNat, "National option must be first (default)");
  // Overlay warning container present for graceful degradation
  assert.match(html, /id="warnOverlay"/);
  // Attribution block exists
  assert.match(html, /class="map-attribution/);
});

test("app-om.js uses the raw S3 endpoint (no referer-lock) and exports window.omOverlay", () => {
  const src = fs.readFileSync(path.join(REPO, "public/app-om.js"), "utf8");
  assert.match(src, /https:\/\/openmeteo\.s3\.amazonaws\.com\/data_spatial/);
  // Must NOT use the referer-locked data-spatial.open-meteo.com host in the actual
  // fetch/build URLs. Comments referencing it are acceptable. We strip // line
  // comments before matching to avoid false positives on explanatory notes.
  const stripped = src.replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(stripped, /https?:\/\/data-spatial\.open-meteo\.com/, "must use S3 endpoint for fetches");
  assert.match(src, /window\.omOverlay\s*=/);
  assert.match(src, /buildSource/);
  assert.match(src, /pickValidTime/);
  assert.match(src, /addMapboxProtocolSupport/);
  assert.match(src, /\/vendor\/omdl\/index\.mjs/);
});

test("vendored Open-Meteo weather-map-layer files are present under public/vendor/omdl/", () => {
  const dir = path.join(REPO, "public/vendor/omdl");
  for (const f of ["index.mjs", "om_file_format.web.wasm", "worker.js", "om_file_format.web.mjs"]) {
    assert.ok(fs.existsSync(path.join(dir, f)), `missing vendored file: ${f}`);
  }
});

test("ECMWF IFS latest.json metadata is reachable and exposes t2m/tmax/tmin in WGS84", async () => {
  const r = await fetch("https://openmeteo.s3.amazonaws.com/data_spatial/ecmwf_ifs/latest.json?variable=temperature_2m");
  assert.equal(r.status, 200, "ECMWF IFS t2m metadata must be HTTP 200");
  const t2m = await r.json();
  assert.equal(t2m.completed, true, "t2m run must be completed");
  assert.ok(Array.isArray(t2m.valid_times) && t2m.valid_times.length >= 24,
    "must have at least 24 valid hourly times");
  assert.match(t2m.crs_wkt, /WGS\s*84/i, "CRS must declare WGS 84");
  assert.match(t2m.crs_wkt, /Reduced Gaussian Grid/i, "must be reduced Gaussian grid");

  const [rmax, rmin] = await Promise.all([
    fetch("https://openmeteo.s3.amazonaws.com/data_spatial/ecmwf_ifs/latest.json?variable=temperature_2m_max").then(x => x.json()),
    fetch("https://openmeteo.s3.amazonaws.com/data_spatial/ecmwf_ifs/latest.json?variable=temperature_2m_min").then(x => x.json()),
  ]);
  assert.equal(rmax.completed, true, "tmax run completed");
  assert.equal(rmin.completed, true, "tmin run completed");
  assert.ok(rmax.valid_times.length >= 10, "tmax must have multi-step forecast (>1d)");
  assert.ok(rmin.valid_times.length >= 10, "tmin must have multi-step forecast (>1d)");
});

test("PH extent covers Luzon, Visayas, and Mindanao in WGS84 [lon,lat]", () => {
  const appJs = fs.readFileSync(path.join(REPO, "public/app.js"), "utf8");
  const m = appJs.match(/const PH_EXTENT = \[\[([-\d.]+),\s*([-\d.]+)\],\s*\[([-\d.]+),\s*([-\d.]+)\]\]/);
  assert.ok(m, "PH_EXTENT must be defined");
  const w = parseFloat(m[1]), s = parseFloat(m[2]), e = parseFloat(m[3]), n = parseFloat(m[4]);
  // Lon range must span from west of Palawan (116.5ish) to east of Mindanao coast (~127).
  assert.ok(w <= 117 && e >= 126.5, "lon span covers Palawan→PH east coast");
  // Lat range must cover from Sulu/Tawi-Tawi (~4.5N) to Batanes (~21N).
  assert.ok(s <= 5.5 && n >= 20.5, "lat span covers Tawi-Tawi→Batanes");
  assert.ok(w < e && s < n, "extent must be valid SW->NE");
});

test("app.js declares view-mode state, omOverlay install/apply/remove helpers", () => {
  const src = fs.readFileSync(path.join(REPO, "public/app.js"), "utf8");
  assert.match(src, /view:\s*"national"/);
  assert.match(src, /overlaySourceId:\s*"om-temp"/);
  assert.match(src, /function addNationalOverlay\(/);
  assert.match(src, /function installOrUpdateOmSource\(/);
  assert.match(src, /function removeOmSource\(/);
  assert.match(src, /function applyViewMode\(/);
  assert.match(src, /function flyToView\(/);
  assert.match(src, /function syncOverlayTimeOptions\(/);
});

test("applyViewMode hides muni-fill/muni-line in national view and restores them in LGU view", () => {
  // Structural check: applyViewMode sets muni-fill/muni-line visibility to 'none' when
  // state.view === 'national' and 'visible' otherwise. Also ensures national view
  // invokes installOrUpdateOmSource and LGU view invokes removeOmSource.
  const src = fs.readFileSync(path.join(REPO, "public/app.js"), "utf8");
  assert.match(src, /toggle\("muni-fill",\s*isNational\s*\?\s*"none"\s*:\s*"visible"\)/);
  assert.match(src, /toggle\("muni-line",\s*isNational\s*\?\s*"none"\s*:\s*"visible"\)/);
  assert.match(src, /if\s*\(isNational\)\s*\{\s*\n\s*installOrUpdateOmSource/);
  assert.match(src, /\} else \{\s*\n\s*removeOmSource/);
});

test("national mode does not fabricate missing data — fixed legend 20°C–38°C, transparent no-data comment", () => {
  const src = fs.readFileSync(path.join(REPO, "public/app.js"), "utf8");
  assert.match(src, /const lo = 20,\s*hi = 38/);
  assert.match(src, /No-data:\s*transparent/);
  assert.match(src, /Bilinear resampling on display only/);
});

test("renderSources() attributes ECMWF/Open-Meteo CC BY 4.0 and discloses LGU Voronoi as approximate", () => {
  const src = fs.readFileSync(path.join(REPO, "public/app.js"), "utf8");
  assert.match(src, /ECMWF IFS/);
  assert.match(src, /CC BY 4\.0/);
  assert.match(src, /Voronoi approximation/);
  assert.match(src, /NOT official administrative boundaries/);
});

test("legacy 27-LGU map ready guard and Voronoi geo are still present (no regression)", () => {
  const src = fs.readFileSync(path.join(REPO, "public/app.js"), "utf8");
  assert.match(src, /function geoBounds\(/);
  assert.match(src, /function featureIdByLoc\(/);
  assert.match(src, /municipalities/);
  assert.match(src, /mapLayersInstalled/);
  const geo = JSON.parse(fs.readFileSync(path.join(REPO, "public/data/zamboanga_del_norte_approx.geojson"), "utf8"));
  assert.equal(geo.features.length, 27);
});

test("app.js never references the referer-locked data-spatial.open-meteo.com host", () => {
  const src = fs.readFileSync(path.join(REPO, "public/app.js"), "utf8");
  assert.doesNotMatch(src, /data-spatial\.open-meteo\.com/, "app.js must use S3 or not hardcode a raster host");
});
