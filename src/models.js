// Model roster for v0.1.
//
// Source of truth: we use Open-Meteo's free, documented Forecast API
// (https://open-meteo.com/en/docs) as the data provider because it aggregates
// deterministic outputs from multiple global NWP centres behind a single
// documented, no-key-required (CC-BY 4.0 / non-commercial / <10k calls/day)
// endpoint. We do NOT scrape Meteologix or any protected interface, and we do
// NOT silently substitute a different product under a requested label.
//
// Model IDs below have been verified against the live API from a Zamboanga del
// Norte query point (see docs/model-availability-matrix.md).  Some models in
// the user-specified target roster are unavailable in v0.1: see
// `UNAVAILABLE` below with the reason for each.
//
// Each entry:
//   id           - stable internal id (matches Open-Meteo parameter suffix)
//   apiId        - value to pass in Open-Meteo &models=
//   label        - human-readable label used in UI / bulletin
//   centre       - producing NWP centre
//   priority     - lower = listed first in UI (per user-specified order where available)
//   nativeResKm  - approximate native grid resolution (best-effort)
//   updateCycle  - typical update cadence as of 2026
//   notes        - caveats / attribution notes

export const MODELS = [
  {
    id: "ecmwf_ifs",
    apiId: "ecmwf_ifs",
    label: "ECMWF IFS (9 km, HRES-like)",
    centre: "ECMWF",
    priority: 1,
    nativeResKm: 9,
    updateCycle: "00Z/12Z; ~6–7h post-run",
    notes: "Open-Meteo's highest-resolution ECMWF deterministic product served as 'ecmwf_ifs'. It is Open-Meteo's HRES-equivalent (9 km) feed; it is not the raw 00Z/12Z ECMWF dissemination at publication latency, but a redistributed high-resolution run. Attribution: European Centre for Medium-Range Weather Forecasts via Open-Meteo.",
  },
  {
    id: "ecmwf_aifs025_single",
    apiId: "ecmwf_aifs025_single",
    label: "ECMWF AIFS (0.25° single member)",
    centre: "ECMWF (AI)",
    priority: 2,
    nativeResKm: 28,
    updateCycle: "~00Z/12Z, AI model",
    notes: "ECMWF's Artificial Intelligence Forecasting System. Attribution: ECMWF / Open-Meteo.",
  },
  {
    id: "icon_global",
    apiId: "icon_global",
    label: "DWD ICON Global",
    centre: "DWD (Germany)",
    priority: 3,
    nativeResKm: 13,
    updateCycle: "00Z/06Z/12Z/18Z",
    notes: "Deterministic ICON global run from DWD. Attribution: DWD / Open-Meteo.",
  },
  {
    id: "gfs_seamless",
    apiId: "gfs_seamless",
    label: "NCEP GFS Seamless",
    centre: "NCEP (USA)",
    priority: 5,
    nativeResKm: 22,
    updateCycle: "00Z/06Z/12Z/18Z",
    notes: "Open-Meteo seamless blend of GFS with shorter-range regional products; we include it because this is the GFS most users see, and additionally request the native 0.13° grid separately.",
  },
  {
    id: "ncep_aigfs025",
    apiId: "ncep_aigfs025",
    label: "NCEP AIGFS (AI, 0.25°)",
    centre: "NCEP (AI)",
    priority: 6,
    nativeResKm: 28,
    updateCycle: "AI post-processed of GFS",
    notes: "NCEP AI-GFS product served via Open-Meteo as 'ncep_aigfs025'.",
  },
  {
    id: "ukmo_seamless",
    apiId: "ukmo_seamless",
    label: "UK Met Office Global (seamless)",
    centre: "UKMO (UK)",
    priority: 7,
    nativeResKm: 10,
    updateCycle: "00Z/12Z",
    notes: "UK Met Office deterministic global (10 km) via Open-Meteo seamless blend.",
  },
  {
    id: "arpege_world",
    apiId: "arpege_world",
    label: "Météo-France ARPEGE World",
    centre: "Météo-France",
    priority: 8,
    nativeResKm: 36,
    updateCycle: "00Z/06Z/12Z/18Z",
    notes: "ARPEGE global (variable resolution; ~36 km over the Philippines).",
  },
  {
    id: "gem_global",
    apiId: "gem_global",
    label: "ECCC GEM Global",
    centre: "ECCC (Canada)",
    priority: 9,
    nativeResKm: 25,
    updateCycle: "00Z/12Z",
    notes: "Global Environmental Multiscale (GEM) deterministic.",
  },
  {
    id: "jma_gsm",
    apiId: "jma_gsm",
    label: "JMA GSM",
    centre: "JMA (Japan)",
    priority: 12,
    nativeResKm: 20,
    updateCycle: "00Z/06Z/12Z/18Z",
    notes: "Japan Meteorological Agency Global Spectral Model.",
  },
  {
    id: "gfs013",
    apiId: "gfs013",
    label: "NCEP GFS 0.13° (native grid)",
    centre: "NCEP (USA)",
    priority: 13,
    nativeResKm: 13,
    updateCycle: "00Z/06Z/12Z/18Z",
    notes: "Native-resolution (0.125° / ~13 km) GFS grid. Returned values are very close to 'gfs_seamless' for this region; retained because the user explicitly requested GFS 0.125°.",
  },
];

// Models from the target roster that CANNOT be included in v0.1 and why.
// This list is part of the project record: we do not silently replace models.
export const UNAVAILABLE_MODELS = [
  {
    label: "AICON",
    reason: "No redistributed AICON (AI-ICON) product is exposed through the Open-Meteo deterministic API at the 'icon_*' model names we tested, and no other free, documented public endpoint currently redistributes it. Excluded to avoid fabricating a label.",
  },
  {
    label: "ACCESS-G (BOM)",
    reason: "Open-Meteo exposes 'bom_access_global' but API testing from a Zamboanga del Norte query point (8.58 N, 123.33 E) returns nulls for all daily variables (model does not appear to cover / is not served for this location on the current Open-Meteo build). Excluded to avoid presenting a dead channel.",
  },
  {
    label: "MULTI-GLOBAL",
    reason: "'MULTI-GLOBAL' is an alias for Open-Meteo's own multi-model blend on Meteologix, not an independent NWP centre product. Including it would double-count models already in our ensemble. The median consensus computed by this system replaces any such built-in blend.",
  },
  {
    label: "GRAPHCAST (IFS)",
    reason: "Google DeepMind GraphCast forecasts are not redistributed via Open-Meteo's free deterministic Forecast API; redistribution requires either ECMWF's Chart/Dissemination access or a separate Google partnership that requires credentials we do not have in v0.1.",
  },
  {
    label: "PANGU-Weather (IFS)",
    reason: "Huawei Pangu-Weather deterministic output is not redistributed via Open-Meteo's free deterministic API. ECMWF makes it available via their open-data / charts under specific licensing, but integrating it requires a separate fetch + license review deferred past v0.1.",
  },
];

// Open-Meteo sometimes returns identical time series for two model ids in a
// given region (e.g. gfs_seamless vs gfs013). For consensus calculations we
// should not count duplicates as two independent members. The pairs below are
// detected post-fetch: if two models produce byte-identical Tmax/Tmin arrays
// for all days at a location, only the higher-priority one is kept.
export const DUPLICATE_RESOLUTION_PAIRS = [
  ["gfs_seamless", "gfs013"],
];

// Attribution text required by Open-Meteo CC-BY 4.0 (non-commercial)
export const OPEN_METEO_ATTRIBUTION = "Weather data by Open-Meteo.com (CC-BY 4.0, non-commercial; attribution to individual NWP centres above)";
