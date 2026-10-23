// Regression tests for the UI bug fixes (2026-10-23):
//   1. Map init guards against duplicate source/layer registration on style
//      reload; app.js exposes guard helpers.
//   2. Tables use table-layout:fixed and colgroups for aligned columns.
//   3. Approximation GeoJSON is CRS84 [lon,lat], has 27 features, all with
//      disclaimer properties and valid polygons enclosing their centroid.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..");

test("approximation GeoJSON has 27 valid polygons and each contains its centroid", () => {
  const raw = fs.readFileSync(path.join(REPO, "public/data/zamboanga_del_norte_approx.geojson"), "utf8");
  const gj = JSON.parse(raw);
  assert.equal(gj.type, "FeatureCollection");
  assert.equal(gj.features.length, 27, "Must contain one polygon per LGU");
  for (const f of gj.features) {
    assert.equal(f.geometry.type, "Polygon");
    assert.ok(Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length >= 1);
    const ring = f.geometry.coordinates[0];
    assert.ok(ring.length >= 4, `Polygon for ${f.properties.id} must have ≥4 vertices`);
    // Closed ring
    assert.deepEqual(ring[0], ring[ring.length - 1]);
    // All coords are [lon, lat] in expected Philippine range
    for (const [lon, lat] of ring) {
      assert.ok(lon > 120 && lon < 125, `lon ${lon} out of PH range (${f.properties.id})`);
      assert.ok(lat > 5 && lat < 12, `lat ${lat} out of PH range (${f.properties.id})`);
    }
    // Disclaimer present
    assert.match(f.properties.disclaimer || "", /NOT an official/);
    // Centroid falls inside polygon
    const inside = pointInRing([f.properties.centroidLon, f.properties.centroidLat], ring);
    assert.ok(inside, `Centroid for ${f.properties.id} must be inside its polygon`);
  }
});

test("GeoJSON coordinates are in [lon,lat] order (CRS84) — SW corner < NE corner", () => {
  const gj = JSON.parse(fs.readFileSync(path.join(REPO, "public/data/zamboanga_del_norte_approx.geojson"), "utf8"));
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  (function walk(node) {
    if (Array.isArray(node)) {
      if (typeof node[0] === "number") {
        const [lon, lat] = node;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
      } else {
        for (const child of node) walk(child);
      }
    } else if (node && typeof node === "object") {
      if (node.coordinates) walk(node.coordinates);
      else if (node.geometry) walk(node.geometry);
      else if (node.features) for (const f of node.features) walk(f);
    }
  })(gj);
  assert.ok(minLon < maxLon, "lon bounds valid");
  assert.ok(minLat < maxLat, "lat bounds valid");
  // Province should be centered around ~8.25°N, 123°E, so confirm bounds
  // include the known Dipolog/Sindangan/Baliguian range.
  assert.ok(minLat < 7.5 && maxLat > 8.6, "latitude span must cover ZN");
  assert.ok(minLon < 122.2 && maxLon > 123.5, "longitude span must cover ZN");
});

test("HTML tables declare colgroups for fixed-layout column alignment", () => {
  const html = fs.readFileSync(path.join(REPO, "public/index.html"), "utf8");
  // Both tables should contain <colgroup> blocks so header/body widths align.
  assert.match(html, /<table id="allTable"[\s\S]*?<colgroup>[\s\S]*?<\/colgroup>/,
    "All-locations table must have a colgroup");
  assert.match(html, /<table id="modelTable"[\s\S]*?<colgroup>[\s\S]*?<\/colgroup>/,
    "Per-model table must have a colgroup");
});

test("CSS uses table-layout:fixed on tables for aligned columns", () => {
  const css = fs.readFileSync(path.join(REPO, "public/styles.css"), "utf8");
  assert.match(css, /table-layout:\s*fixed/, "tables must use fixed layout");
});

test("app.js map init guards style load with installed flag and exposes mapReady", () => {
  const js = fs.readFileSync(path.join(REPO, "public/app.js"), "utf8");
  assert.match(js, /let mapLayersInstalled/, "must track layer installation to avoid duplicates");
  assert.match(js, /style\.load/, "must listen for style.load for reload safety");
  assert.match(js, /getSource\("municipalities"\)/, "must check source existence before adding");
  assert.match(js, /getLayer\("muni-fill"\)/, "must check layer existence before adding");
  assert.match(js, /fill-opacity[^}]*0\.55/, "choropleth fill-opacity should be ~0.55 for translucent basemap");
});

// ---------- helpers ----------
function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
