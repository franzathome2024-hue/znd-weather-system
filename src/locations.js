// All 27 LGUs of Zamboanga del Norte with verified coordinates.
// Coordinate source preference: Wikipedia (Wikidata) municipality coordinates,
// which represent the municipal/town center (poblacion). Cross-checked with
// philatlas.com and Open-Meteo geocoding. Each point is a REPRESENTATIVE POINT,
// not a complete municipal-area forecast; mountainous/coastal barangays may
// differ significantly from the town-center forecast.
//
// Fields:
//   id         - stable slug used in URLs / storage keys
//   name       - Display name (Bisaya/English common form)
//   type       - "city" | "municipality"
//   lat, lon   - WGS-84 decimal degrees, poblacion/municipal center
//   elev_m     - approximate town-center elevation in metres (best-effort, from
//                Open-Meteo / philatlas; null if unknown)
//   source     - provenance note for the coordinate

export const LOCATIONS = [
  { id: "dipolog",   name: "Dipolog City",   type: "city",         lat: 8.5872, lon: 123.3408, elev_m: 49,  source: "Wikipedia (poblacion)" },
  { id: "dapitan",   name: "Dapitan City",   type: "city",         lat: 8.6561, lon: 123.4227, elev_m: 10,  source: "Open-Meteo geocoding / Wikipedia cross-check" },

  { id: "baliguian", name: "Baliguian",      type: "municipality", lat: 7.8094, lon: 122.1444, elev_m: null,source: "Open-Meteo geocoding (poblacion)" },
  { id: "godod",     name: "Godod",          type: "municipality", lat: 8.0014, lon: 122.8438, elev_m: null,source: "Wikipedia (8°00'05\"N 122°50'38\"E)" },
  { id: "gutalac",   name: "Gutalac",        type: "municipality", lat: 7.9825, lon: 122.4047, elev_m: null,source: "Open-Meteo geocoding (poblacion)" },
  { id: "jose-dalman", name: "Jose Dalman",  type: "municipality", lat: 8.4428, lon: 123.0219, elev_m: 74,  source: "Wikipedia (Ponot poblacion)" },
  { id: "kalawit",   name: "Kalawit",        type: "municipality", lat: 7.9080, lon: 122.5236, elev_m: 118, source: "Wikipedia (poblacion)" },
  { id: "katipunan", name: "Katipunan",      type: "municipality", lat: 8.5140, lon: 123.2829, elev_m: null,source: "Open-Meteo geocoding (poblacion)" },
  { id: "la-libertad", name: "La Libertad",  type: "municipality", lat: 8.4670, lon: 123.5266, elev_m: 172, source: "Wikipedia (municipal center)" },
  { id: "labason",   name: "Labason",        type: "municipality", lat: 8.0692, lon: 122.5217, elev_m: null,source: "Open-Meteo geocoding (poblacion)" },
  { id: "leon-postigo", name: "Leon B. Postigo", type: "municipality", lat: 8.1514, lon: 122.9244, elev_m: 9, source: "Wikipedia (Bacungan poblacion; fka Leon T. Postigo)" },
  { id: "liloy",     name: "Liloy",          type: "municipality", lat: 8.1144, lon: 122.6594, elev_m: null,source: "Open-Meteo geocoding (poblacion)" },
  { id: "manukan",   name: "Manukan",        type: "municipality", lat: 8.5333, lon: 123.1000, elev_m: null,source: "Open-Meteo geocoding (poblacion)" },
  { id: "mutia",     name: "Mutia",          type: "municipality", lat: 8.4308, lon: 123.4706, elev_m: null,source: "Open-Meteo geocoding (poblacion)" },
  { id: "pinan",     name: "Piñan",          type: "municipality", lat: 8.4815, lon: 123.4462, elev_m: null,source: "Open-Meteo geocoding (poblacion; New Piñan)" },
  { id: "polanco",   name: "Polanco",        type: "municipality", lat: 8.5329, lon: 123.3617, elev_m: null,source: "Open-Meteo geocoding (poblacion)" },
  { id: "roxas",     name: "Pres. Manuel A. Roxas", type: "municipality", lat: 8.5196, lon: 123.2277, elev_m: 34, source: "Wikipedia (poblacion)" },
  { id: "rizal",     name: "Rizal",          type: "municipality", lat: 8.5272, lon: 123.5517, elev_m: 40,  source: "Wikipedia (municipal center)" },
  { id: "salug",     name: "Salug",          type: "municipality", lat: 8.1147, lon: 122.7833, elev_m: null,source: "Open-Meteo geocoding (poblacion)" },
  { id: "sergio-osmena", name: "Sergio Osmeña Sr.", type: "municipality", lat: 8.3003, lon: 123.5083, elev_m: 528, source: "Wikipedia (Sibulan poblacion)" },
  { id: "siayan",    name: "Siayan",         type: "municipality", lat: 8.2667, lon: 123.1000, elev_m: null,source: "Open-Meteo geocoding (poblacion)" },
  { id: "sibuco",    name: "Sibuco",         type: "municipality", lat: 7.2911, lon: 122.0656, elev_m: null,source: "Open-Meteo geocoding (poblacion)" },
  { id: "sibutad",   name: "Sibutad",        type: "municipality", lat: 8.6131, lon: 123.4797, elev_m: 123, source: "Wikipedia (poblacion)" },
  { id: "sindangan", name: "Sindangan",      type: "municipality", lat: 8.2376, lon: 122.9974, elev_m: null,source: "Open-Meteo geocoding (poblacion)" },
  { id: "siocon",    name: "Siocon",         type: "municipality", lat: 7.7061, lon: 122.1353, elev_m: null,source: "Open-Meteo geocoding (poblacion)" },
  { id: "sirawai",   name: "Sirawai",        type: "municipality", lat: 7.5853, lon: 122.1406, elev_m: 88,  source: "Wikipedia (poblacion)" },
  { id: "tampilisan", name: "Tampilisan",    type: "municipality", lat: 8.0167, lon: 122.6833, elev_m: null,source: "Open-Meteo geocoding (poblacion)" },
];

// Sanity check
if (LOCATIONS.length !== 27) {
  throw new Error(`Expected 27 Zamboanga del Norte LGUs, got ${LOCATIONS.length}`);
}

export const LOCATION_BY_ID = Object.fromEntries(LOCATIONS.map(l => [l.id, l]));

// Province geographic bounds (for map framing)
export const PROVINCE_BOUNDS = {
  minLat: 7.2,
  maxLat: 8.8,
  minLon: 122.0,
  maxLon: 123.7,
};
