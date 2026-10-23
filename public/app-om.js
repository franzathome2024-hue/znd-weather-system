// Registers the Open-Meteo custom `om://` raster protocol with our vendored
// MapLibre GL JS. Loaded as an ES module so @openmeteo/weather-map-layer can
// resolve its WASM/worker via import.meta.url (both files live next to this
// module under /vendor/omdl/). Exposes helpers on window.omOverlay for the
// non-module app.js to drive the national temperature overlay.
import { addMapboxProtocolSupport, closestModelRun } from '/vendor/omdl/index.mjs';

const OM_S3 = 'https://openmeteo.s3.amazonaws.com/data_spatial';
const MODEL = 'ecmwf_ifs';
// Public S3 endpoint is NOT referer-locked (data-spatial.open-meteo.com is).
const T2M_URL = `${OM_S3}/${MODEL}/latest.json?variable=temperature_2m`;
const TMAX_URL = `${OM_S3}/${MODEL}/latest.json?variable=temperature_2m_max`;
const TMIN_URL = `${OM_S3}/${MODEL}/latest.json?variable=temperature_2m_min`;

const overlay = {
  ready: false,
  error: null,
  factory: null, // addMapboxProtocolSupport return value (createRasterSource)
  meta: {
    model: 'ECMWF IFS',
    nativeResKm: 9,
    license: 'CC BY 4.0',
    provider: 'Open-Meteo',
    crs: 'WGS84 (EPSG:4326) reduced-Gaussian O1280',
    vars: {},
  },
};

async function init() {
  try {
    // Wait for the global maplibregl (synchronously loaded before us).
    let tries = 0;
    while (!window.maplibregl && tries < 50) {
      await new Promise((r) => setTimeout(r, 20));
      tries++;
    }
    if (!window.maplibregl) throw new Error('maplibregl not found on window');
    const support = addMapboxProtocolSupport({ addProtocol: window.maplibregl.addProtocol });
    overlay.factory = support;
    // Pre-fetch metadata to discover valid_times for the time-picker.
    const [t2m, tmax, tmin] = await Promise.all([
      fetchJsonCached(T2M_URL),
      fetchJsonCached(TMAX_URL),
      fetchJsonCached(TMIN_URL),
    ]);
    overlay.meta.vars.temperature_2m = summarizeMeta(t2m, 'temperature_2m');
    overlay.meta.vars.temperature_2m_max = summarizeMeta(tmax, 'temperature_2m_max');
    overlay.meta.vars.temperature_2m_min = summarizeMeta(tmin, 'temperature_2m_min');
    overlay.ready = true;
  } catch (e) {
    console.warn('[om-overlay] init failed:', e);
    overlay.error = e.message || String(e);
  }
}

function summarizeMeta(j, variable) {
  const vt = Array.isArray(j?.valid_times) ? j.valid_times : [];
  return {
    reference_time: j.reference_time || null,
    last_modified_time: j.last_modified_time || null,
    completed: !!j.completed,
    validTimes: vt,
    variable,
  };
}

// Simple in-memory cache for latest.json metadata (does not survive reload,
// but avoids repeat fetches while the page is up).
const metaCache = new Map();
async function fetchJsonCached(url) {
  if (metaCache.has(url)) return metaCache.get(url);
  const p = fetch(url, { cache: 'no-cors' }).then(async (r) => {
    if (!r.ok) throw new Error(`metadata ${url} HTTP ${r.status}`);
    return r.json();
  });
  metaCache.set(url, p);
  return p;
}

// Build the MapLibre raster source descriptor for a given variable and ISO
// valid time. The OM protocol reads `time=` (and optionally `level=`) query
// parameters on the om:// URL to select the frame; tileTemplate resolution is
// handled entirely by the library.
function buildSource(variable = 'temperature_2m', validTimeIso = null) {
  if (!overlay.factory) throw new Error('om protocol not initialised');
  let base;
  if (variable === 'temperature_2m_max') base = TMAX_URL;
  else if (variable === 'temperature_2m_min') base = TMIN_URL;
  else base = T2M_URL;
  // The library parses the query string of the om:// URL for `time` / `level`
  // and passes them through to the binary chunk fetcher.
  const sep = base.includes('?') ? '&' : '?';
  const url = validTimeIso ? `${base}${sep}time=${encodeURIComponent(validTimeIso)}` : base;
  return overlay.factory.createRasterSource(`om://${url}`, {
    tileSize: 512,
    minzoom: 0,
    maxzoom: 12,
  });
}

window.omOverlay = {
  init,
  get state() { return overlay; },
  buildSource,
  // Build URL for a given day offset. For Tmax we pick the first 3-hourly step
  // AFTER noon Philippine time (12:00 PHT = 04:00Z) and prefer the
  // 3-hourly-max variable; for Tmin we pick the post-midnight (20:00Z prior day
  // through 00:00Z) min. Falling back to instantaneous temperature_2m when the
  // aggregate is unavailable is deliberately NOT done — that would be lying.
  pickValidTime(varKey, phDate /* 'YYYY-MM-DD' */, validTimes) {
    if (!validTimes?.length) return null;
    // validTimes are ISO in UTC ending with 'Z'
    const day = phDate;
    // tmax_window: 12:00-15:00 PHT = 04:00-07:00Z same day
    if (varKey === 'tmax') {
      // temperature_2m_max is a 3-hourly "max over preceding 3 hours" field,
      // so the 06:00Z step covers 03-06Z = 11-14 PHT daytime heating.
      return validTimes.find((v) => v.startsWith(day) && v.endsWith('T06:00Z'))
        || validTimes.find((v) => v.startsWith(day) && v.endsWith('T09:00Z'))
        || validTimes.find((v) => v.startsWith(day));
    }
    if (varKey === 'tmin') {
      // Overnight min 02:00 PHT = 18:00Z prior day covers 15-18Z = 23-02 PHT
      const prev = prevDay(day);
      return validTimes.find((v) => v.startsWith(day) && v.endsWith('T00:00Z'))
        || validTimes.find((v) => v.startsWith(prev) && v.endsWith('T21:00Z'))
        || validTimes.find((v) => v.startsWith(day));
    }
    // temperature_2m (instant) — pick 14:00 PHT = 06:00Z as "afternoon"
    return validTimes.find((v) => v.startsWith(day) && v.endsWith('T06:00Z'))
      || validTimes.find((v) => v.startsWith(day));
  },
};

function prevDay(yyyymmdd) {
  const d = new Date(yyyymmdd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

init();
