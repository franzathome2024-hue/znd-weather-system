#!/usr/bin/env node
// Generate a license-safe Voronoi (nearest-neighbor) approximation of the
// Zamboanga del Norte municipal polygons (WGS 84 / CRS84, [lon, lat]).
//
// Method:
//   1. Rasterize nearest-centroid cells on a lon/lat grid.
//   2. For each cell on a municipality's boundary, add the four edges where the
//      neighbor is outside (or on the grid edge) to a directed segment map.
//   3. Walk the segments greedily (at each corner, pick the next outgoing
//      edge that turns most sharply to the right — right-hand wall follower)
//      to form closed outer rings.
//   4. Emit GeoJSON with explicit "NOT official" disclaimers.
//
// Deterministic; no external dependencies.
//
// Conventions:
//   - Cell (r,c) sits between integer corners (c, r) .. (c+1, r+1).
//   - Corner (cc, rr) maps to (LON_MIN + cc*STEP, LAT_MIN + rr*STEP).
//   - Directions for edges starting at corner (cc,rr):
//       0 = EAST  (right):  (cc,  rr) -> (cc+1, rr)
//       1 = SOUTH (down):   (cc,  rr) -> (cc,   rr+1)
//       2 = WEST  (left):   (cc,  rr) -> (cc-1, rr)
//       3 = NORTH (up):     (cc,  rr) -> (cc,   rr-1)
//   - Edges are stored clockwise around each cell so the polygon interior is
//     on the right side of the edge when traversed in its direction.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOCATIONS } from "../src/locations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");

const LAT_MIN = 6.70;
const LAT_MAX = 9.20;
const LON_MIN = 121.40;
const LON_MAX = 124.20;
const PAD = 3; // cells of padding on every side (outside labeled as -1)

const STEP = 0.012; // ~1.3 km cells

const baseNLat = Math.round((LAT_MAX - LAT_MIN) / STEP) + 1;
const baseNLon = Math.round((LON_MAX - LON_MIN) / STEP) + 1;
const nLat = baseNLat + 2 * PAD;
const nLon = baseNLon + 2 * PAD;
console.error(`grid ${baseNLon} x ${baseNLat} + ${PAD}-cell pad => ${nLon} x ${nLat} = ${nLon * nLat} cells`);

// Build label grid over base raster, then wrap with PAD rows/cols of -1.
const baseLabel = Array.from({ length: baseNLat }, () => new Int32Array(baseNLon).fill(-1));
for (let r = 0; r < baseNLat; r++) {
  const lat = LAT_MIN + r * STEP;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  for (let c = 0; c < baseNLon; c++) {
    const lon = LON_MIN + c * STEP;
    let bestI = -1, bestD = Infinity;
    for (let i = 0; i < LOCATIONS.length; i++) {
      const loc = LOCATIONS[i];
      const dlat = lat - loc.lat;
      const dlon = (lon - loc.lon) * cosLat;
      const d = dlat * dlat + dlon * dlon;
      if (d < bestD) { bestD = d; bestI = i; }
    }
    baseLabel[r][c] = bestI;
  }
}
const label = Array.from({ length: nLat }, () => new Int32Array(nLon).fill(-1));
for (let r = 0; r < baseNLat; r++) {
  for (let c = 0; c < baseNLon; c++) label[r + PAD][c + PAD] = baseLabel[r][c];
}
// Remove small 4-connected "noise" components (< MIN_COMPONENT_CELLS) that can
// arise from grid discretization of the plate-carree Voronoi. The main
// Voronoi cell for a municipality always contains thousands of cells;
// isolated 1-6 cell specks are discretization artifacts and would produce
// spurious tiny polygons if traced.
const MIN_COMPONENT_CELLS = 8;
{
  const visited = new Uint8Array(nLat * nLon);
  for (let r = 0; r < nLat; r++) {
    for (let c = 0; c < nLon; c++) {
      if (visited[r * nLon + c]) continue;
      const v = label[r][c];
      if (v < 0) { visited[r * nLon + c] = 1; continue; }
      // BFS
      const stack = [[r, c]];
      const cells = [];
      visited[r * nLon + c] = 1;
      while (stack.length) {
        const [cr, cc] = stack.pop();
        cells.push([cr, cc]);
        const nbrs = [[cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]];
        for (const [nr, nc] of nbrs) {
          if (nr < 0 || nr >= nLat || nc < 0 || nc >= nLon) continue;
          if (visited[nr * nLon + nc]) continue;
          if (label[nr][nc] !== v) continue;
          visited[nr * nLon + nc] = 1;
          stack.push([nr, nc]);
        }
      }
      if (cells.length < MIN_COMPONENT_CELLS) {
        for (const [cr, cc] of cells) label[cr][cc] = -1;
      }
    }
  }
}
// The (r,c) -> lon/lat conversion now needs to account for PAD: a cell at
// padded (r,c) maps to LAT_MIN + (r-PAD)*STEP, LON_MIN + (c-PAD)*STEP.

function k(cc, rr, d) { return cc * 100000 + rr * 10 + d; }

// End corner after moving in direction d from (cc, rr).
function endCorner(cc, rr, d) {
  switch (d) {
    case 0: return [cc + 1, rr];
    case 1: return [cc, rr + 1];
    case 2: return [cc - 1, rr];
    case 3: return [cc, rr - 1];
  }
}

// For clockwise-walled interior on the right, at each cell we add:
//   - north edge (dir 0) starting (c, r) if r===0 or cell (r-1,c) is outside
//   - east  edge (dir 1) starting (c+1, r) if c is last or cell (r,c+1) is outside
//   - south edge (dir 2) starting (c+1, r+1) if r is last or cell (r+1,c) is outside
//   - west  edge (dir 3) starting (c, r+1) if c===0 or cell (r,c-1) is outside

function addEdge(map, cc, rr, d) {
  const key = k(cc, rr, d);
  if (map.has(key)) return;
  map.set(key, { cc, rr, d });
}

function buildEdges(i) {
  const m = new Map();
  for (let r = 0; r < nLat; r++) {
    for (let c = 0; c < nLon; c++) {
      if (label[r][c] !== i) continue;
      if (r === 0 || label[r - 1][c] !== i) addEdge(m, c, r, 0);
      if (c === nLon - 1 || label[r][c + 1] !== i) addEdge(m, c + 1, r, 1);
      if (r === nLat - 1 || label[r + 1][c] !== i) addEdge(m, c + 1, r + 1, 2);
      if (c === 0 || label[r][c - 1] !== i) addEdge(m, c, r + 1, 3);
    }
  }
  return m;
}

// At corner (cc, rr) we just arrived by finishing an edge going direction incoming.
// We want the next outgoing edge at (cc, rr) that turns rightmost while staying
// on the boundary. The available outgoing directions are those with an edge
// starting at (cc, rr). Among those, choose the one with the smallest clockwise
// turn from the incoming direction, i.e. the direction that maximizes the right
// turn. Relative turn angles (clockwise positive):
//   right-turn    = (out - in - 1) mod 4 == 0     → out = (in + 1) mod 4
//   straight      = (out - in) mod 4 == 0        → out = in
//   left-turn     = (out - in + 1) mod 4 == 0    → out = (in + 3) mod 4
//   u-turn        = (out - in - 2) mod 4 == 0    → out = (in + 2) mod 4
// Prefer right > straight > left > u-turn.
function pickOutgoing(map, cc, rr, incoming) {
  const order = [(incoming + 1) % 4, incoming, (incoming + 3) % 4, (incoming + 2) % 4];
  for (const d of order) {
    if (map.has(k(cc, rr, d))) return d;
  }
  return -1;
}

function findStartKey(map, i) {
  // Find the topmost then leftmost cell of municipality i and return its
  // north edge if present, otherwise east/south/west as fallbacks. The
  // topmost cell is guaranteed to sit on the outer boundary after the
  // small-component cleanup above.
  for (let r = 0; r < nLat; r++) {
    for (let c = 0; c < nLon; c++) {
      if (label[r][c] !== i) continue;
      if (map.has(k(c, r, 0))) return k(c, r, 0);
      if (map.has(k(c + 1, r, 1))) return k(c + 1, r, 1);
      if (map.has(k(c + 1, r + 1, 2))) return k(c + 1, r + 1, 2);
      if (map.has(k(c, r + 1, 3))) return k(c, r + 1, 3);
      return null;
    }
  }
  return null;
}

function traceRing(map, startKey) {
  const ring = [];
  let e = map.get(startKey);
  if (!e) return null;
  map.delete(startKey);
  ring.push(toLonLat(e.cc, e.rr));
  ring.push(toLonLat(...endCorner(e.cc, e.rr, e.d)));
  let [cc, rr] = endCorner(e.cc, e.rr, e.d);
  let incoming = e.d;
  let safety = 0;
  while (safety++ < 200000) {
    const nd = pickOutgoing(map, cc, rr, incoming);
    if (nd < 0) break;
    const nKey = k(cc, rr, nd);
    map.delete(nKey);
    [cc, rr] = endCorner(cc, rr, nd);
    ring.push(toLonLat(cc, rr));
    incoming = nd;
    if (nKey === startKey) break;
  }
  return ring;
}

function toLonLat(cc, rr) {
  return [
    +(LON_MIN + (cc - PAD) * STEP).toFixed(5),
    +(LAT_MIN + (rr - PAD) * STEP).toFixed(5),
  ];
}

function buildPolygonFor(i) {
  const edges = buildEdges(i);
  if (edges.size === 0) return null;
  const rings = [];
  // Outer ring.
  let sk = findStartKey(edges, i);
  if (!sk) return null;
  const outer = traceRing(edges, sk);
  if (!outer || outer.length < 4) return null;
  rings.push(outer);
  // Holes / remaining disconnected edges (rare for Voronoi but handle).
  while (edges.size > 0) {
    // Pick any remaining key to start a new ring.
    const k0 = edges.keys().next().value;
    const hole = traceRing(edges, k0);
    if (hole && hole.length >= 4) rings.push(hole);
  }
  return rings;
}

const features = [];
for (let i = 0; i < LOCATIONS.length; i++) {
  const loc = LOCATIONS[i];
  const rings = buildPolygonFor(i);
  if (!rings) { console.error("no polygon for", loc.id); continue; }
  features.push({
    type: "Feature",
    properties: {
      id: loc.id,
      name: loc.name,
      type: loc.type,
      centroidLon: loc.lon,
      centroidLat: loc.lat,
      disclaimer: "NOT an official administrative boundary. Voronoi approximation for visualization only.",
    },
    geometry: { type: "Polygon", coordinates: rings },
  });
}

const fc = {
  type: "FeatureCollection",
  name: "zamboanga_del_norte_voronoi_approximation",
  crs: "urn:ogc:def:crs:OGC:1.3:CRS84",
  attribution: "Generated 2026-10-23; NOT official administrative boundaries. Visualization-only Voronoi approximation from verified municipal-centroid coordinates. Replace with authoritative PSA/OSM/PH-GOV polygons before publication use.",
  features,
};

const outPath = path.join(REPO, "public/data/zamboanga_del_norte_approx.geojson");
fs.writeFileSync(outPath, JSON.stringify(fc));
console.error(`wrote ${outPath}: ${features.length} features, ${fs.statSync(outPath).size} bytes`);
