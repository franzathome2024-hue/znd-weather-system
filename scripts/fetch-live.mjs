// Live API sanity check: fetches all 27 Zamboanga del Norte locations from
// Open-Meteo and prints a compact summary. Useful for manual verification.
//
// Usage: node scripts/fetch-live.mjs
//
// This does NOT run inside the Worker — it's a plain Node ESM script for
// operators; it reuses the same provider + aggregation code so that the
// numbers you see here match exactly what /api/forecast returns.

import { LOCATIONS } from "../src/locations.js";
import { MODELS } from "../src/models.js";
import { fetchOpenMeteo, parseOpenMeteoResponse } from "../src/providers/open-meteo.js";
import { buildLocationForecast } from "../src/aggregation/aggregate.js";

const DAYS = parseInt(process.env.FORECAST_DAYS || "3", 10);
const baseUrl = process.env.OPEN_METEO_BASE_URL || "https://api.open-meteo.com/v1/forecast";

console.log(`znd-weather-system live fetch — ${LOCATIONS.length} locations, ${DAYS} days, ${MODELS.length} models.`);
console.log(`Endpoint: ${baseUrl}\n`);

const results = [];
let failures = 0;

for (const loc of LOCATIONS) {
  const r = await fetchOpenMeteo({
    lat: loc.lat, lon: loc.lon, days: DAYS, baseUrl,
    fetchFn: globalThis.fetch,
    maxRetries: 1, timeoutMs: 15000,
  });
  if (!r.ok) {
    failures++;
    console.log(`  ✗ ${loc.name.padEnd(28)} ${r.error}`);
    results.push({ loc, ok: false });
    continue;
  }
  const { dates, perModel } = parseOpenMeteoResponse(r.data);
  const bundle = buildLocationForecast({
    locationId: loc.id, perModel, dates, retrievedAt: new Date().toISOString(),
  });
  const today = bundle.days[0];
  const hi = today?.tmax?.consensus;
  const lo = today?.tmin?.consensus;
  const n = today?.n_contributing;
  console.log(`  ✓ ${loc.name.padEnd(28)} ${lo!=null?lo.toFixed(1):'—'}° – ${hi!=null?hi.toFixed(1):'—'}°  (${n} models, ${Math.round(r.latencyMs)}ms)`);
  results.push({ loc, ok: true, bundle });
  await new Promise((r) => setTimeout(r, 120));
}

const ok = results.filter((r) => r.ok).length;
console.log(`\n${ok}/${LOCATIONS.length} locations fetched successfully (${failures} failures).`);
process.exit(failures > 0 ? 1 : 0);
