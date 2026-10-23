// Structured model registry for ZND Weather v0.1.
//
// Every entry follows the required schema so that configured-feed count,
// successful-feed count, and independent-consensus-contributor count can be
// reported separately and audited.
//
// availabilityStatus values:
//   "verified"              — endpoint tested at Dipolog (8.59°N,123.34°E) on
//                             the verification date; returned usable daily
//                             tmax/tmin values and is eligible for consensus
//                             (subject to alias de-duplication).
//   "returned_nulls"        — API accepted the model ID but daily tmax/tmin
//                             were all null for PH/Dipolog (coverage issue,
//                             suspension, or provider outage — documented).
//   "unsupported_by_provider" — the provider does not recognize the model ID.
//   "access_restricted"     — model data exists but requires paid/registered
//                             access we do not have credentials for.
//   "excluded_by_design"    — model is an aggregate/blend of other feeds we
//                             already include, or a different-resolution
//                             variant of the same NWP centre's deterministic
//                             output (would double-count).
//   "self_host_impractical" — model requires GPU inference + heavy initial-
//                             condition pipeline that cannot run on
//                             Cloudflare Workers and isn't economical for v0.1.
//   "license_incompatible"  — available but non-commercial / BY-NC-SA terms
//                             block the intended deployment path.
//
// productType values:
//   "deterministic_nwp", "ai_deterministic", "ensemble_mean", "blend",
//   "aggregate", "ai_self_host"

export const MODEL_REGISTRY = [
  // --- 1. ECMWF IFS HRES 00Z/12Z ---
  {
    targetLabel: "ECMWF IFS HRES 00Z/12Z",
    provider: "Open-Meteo (redistributes ECMWF)",
    endpoint: "https://api.open-meteo.com/v1/forecast",
    requestedModelId: "ecmwf_ifs",
    verifiedProduct: "ECMWF IFS high-resolution deterministic (≈9 km / 0.125°), redistributed via Open-Meteo. IMPORTANT QUALIFICATION: Open-Meteo's free Forecast API does not serve the operational ~9 km ECMWF IFS HRES at native latency. Per Open-Meteo docs the `ecmwf_ifs` identifier on the free API maps to their best-available ECMWF deterministic surface product (which at times has been the 0.25° / 0.2° regridded version or a lower-latency subset); latency reflects Open-Meteo ingest (~6-7 h post-run), not raw ECMWF dissemination. Label 'ECMWF (Open-Meteo, ~9 km class)' in the UI and do not claim real-time HRES 00Z/12Z access.",
    productType: "deterministic_nwp",
    nativeResolution: "≈9 km",
    geographicCoverage: "Global",
    availabilityStatus: "verified",
    evidence: {
      verificationDate: "2026-10-23",
      point: "Dipolog City (8.5872, 123.3408)",
      requestVariables: "daily=temperature_2m_max,temperature_2m_min; timezone=Asia/Manila; forecast_days=3",
      httpStatus: 200,
      sampleTmaxFirst3: [30.1, 28.2, 29.9],
      sampleTminFirst3: [24.9, 24.5, 23.9],
      fixturePath: "docs/verification/open-meteo-models-2026-10-23.json",
      docsUrl: "https://open-meteo.com/en/docs (Weather models: ECMWF IFS 9km / 0.25°)",
      docsCheckedAt: "2026-10-23",
    },
    lastVerifiedAt: "2026-10-23T02:11:00Z",
    lastSuccessfulRun: null,
    license: "CC-BY 4.0 (non-commercial via Open-Meteo); underlying ECMWF output redistribution via Open-Meteo",
    attributionRequirements: "Attribute 'ECMWF' and 'Open-Meteo.com'. Open-Meteo free tier: non-commercial only, <10,000 calls/day, <5,000/hour, <600/minute.",
    consensusEligible: true,
    aliasGroup: "ecmwf_ifs_hires", // distinct from ecmwf_ifs025
    exclusionReason: null,
  },
  // --- 2. ECMWF AIFS ---
  {
    targetLabel: "ECMWF AIFS",
    provider: "Open-Meteo (redistributes ECMWF AIFS)",
    endpoint: "https://api.open-meteo.com/v1/forecast",
    requestedModelId: "ecmwf_aifs025_single",
    verifiedProduct: "ECMWF Artificial Intelligence Forecasting System, 0.25° single member",
    productType: "ai_deterministic",
    nativeResolution: "≈28 km (0.25°)",
    geographicCoverage: "Global",
    availabilityStatus: "verified",
    evidence: {
      verificationDate: "2026-10-23",
      point: "Dipolog City (8.5872, 123.3408)",
      sampleTmaxFirst3: [29.0, 28.2, 28.3],
      sampleTminFirst3: [27.1, 26.3, 26.2],
      fixturePath: "docs/verification/open-meteo-models-2026-10-23.json",
      docsUrl: "https://open-meteo.com/en/docs (Weather models: ECMWF AIFS 0.25° Single)",
    },
    lastVerifiedAt: "2026-10-23T02:11:00Z",
    lastSuccessfulRun: null,
    license: "CC-BY 4.0 (non-commercial via Open-Meteo)",
    attributionRequirements: "Attribute 'ECMWF AIFS' and 'Open-Meteo.com'.",
    consensusEligible: true,
    aliasGroup: "ecmwf_aifs",
    exclusionReason: null,
  },
  // --- 3. ICON (DWD ICON Global) ---
  {
    targetLabel: "ICON",
    provider: "Open-Meteo (redistributes DWD)",
    endpoint: "https://api.open-meteo.com/v1/forecast",
    requestedModelId: "icon_global",
    verifiedProduct: "DWD ICON global deterministic (~13 km). NOTE: `icon_global`, `icon_seamless`, and `dwd_icon` all returned byte-identical Tmax/Tmin series at Dipolog (seamless aliases). We pick `icon_global` as the canonical id and drop the others as aliases.",
    productType: "deterministic_nwp",
    nativeResolution: "≈13 km",
    geographicCoverage: "Global",
    availabilityStatus: "verified",
    evidence: {
      verificationDate: "2026-10-23",
      point: "Dipolog City",
      sampleTmaxFirst3: [34.1, 33.4, 31.8],
      sampleTminFirst3: [25.1, 24.4, 24.6],
      aliasesTestedAndDeduped: ["icon_seamless","dwd_icon"],
      fixturePath: "docs/verification/open-meteo-models-2026-10-23.json",
      docsUrl: "https://open-meteo.com/en/docs (DWD ICON Global)",
    },
    lastVerifiedAt: "2026-10-23T02:11:00Z",
    lastSuccessfulRun: null,
    license: "CC-BY 4.0 (non-commercial via Open-Meteo); DWD Open Data is freely available (https://opendata.dwd.de/)",
    attributionRequirements: "Attribute 'DWD ICON' and 'Open-Meteo.com'.",
    consensusEligible: true,
    aliasGroup: "dwd_icon_global",
    exclusionReason: null,
  },
  // --- 4. AICON ---
  {
    targetLabel: "AICON",
    provider: "DWD (direct open-data) / Open-Meteo (candidate)",
    endpoint: "https://opendata.dwd.de/weather/nwp/  (investigated; see evidence)",
    requestedModelId: null,
    verifiedProduct: "DWD AICON (AI-ICON) — AI model output from DWD. Not yet exposed via the Open-Meteo Forecast API (tested IDs: `aicon`, `aicon_global`, `dwd_aicon`, `icon_ai` — all return HTTP 400). Open-Meteo GitHub issue #2069 ('Incorporate Additional AI Models') lists AICON as requested but not yet integrated. DWD's own public GRIB tree at opendata.dwd.de/weather/nwp currently lists `icon/` (deterministic ICON) in documented locations, but we did not locate a stable documented `aicon/` GRIB directory for live daily global temperature fields with confirmed redistribution rights on the DWD site, and the source.coop mirror referenced in community posts is third-party with unclear license/operational guarantees.",
    productType: "ai_deterministic",
    nativeResolution: null,
    geographicCoverage: "Believed global, but live PH coverage not yet retrievable via a verified authorized endpoint",
    availabilityStatus: "unsupported_by_provider",
    evidence: {
      investigationDate: "2026-10-23",
      openMeteoTestedIds: ["aicon","aicon_global","dwd_aicon","icon_ai"],
      openMeteoHttpStatus: 400,
      openMeteoError: "Invalid value: Cannot initialize MultiDomains from invalid String value",
      docsUrl: "https://www.dwd.de/EN/ourservices/nwp_forecast_data/nwp_forecast_data.html ; https://github.com/open-meteo/open-meteo/issues/2069",
      docsCheckedAt: "2026-10-23",
    },
    lastVerifiedAt: "2026-10-23T02:11:00Z",
    lastSuccessfulRun: null,
    license: "DWD Open Data terms (GeoNutzV / CC-BY compatible) — once located",
    attributionRequirements: "Will require DWD attribution when integrated.",
    consensusEligible: false,
    exclusionReason: "No free, documented, operational point-forecast endpoint located. Tested aliases rejected by Open-Meteo. Direct GRIB path not confirmed stable / T_2M daily-ready for PH at this time.",
  },
  // --- 5. GFS (NCEP GFS) ---
  {
    targetLabel: "GFS",
    provider: "Open-Meteo (redistributes NCEP)",
    endpoint: "https://api.open-meteo.com/v1/forecast",
    requestedModelId: "gfs_seamless",
    verifiedProduct: "NCEP GFS — Open-Meteo seamless blend (combines GFS with shorter-range regional products where applicable). `gfs_seamless` and `gfs013` returned byte-identical daily series at Dipolog on the verification run; de-duplicated so only one is counted.",
    productType: "deterministic_nwp",
    nativeResolution: "≈22 km seamless (0.13° native grid available as `gfs013`)",
    geographicCoverage: "Global",
    availabilityStatus: "verified",
    evidence: {
      verificationDate: "2026-10-23",
      sampleTmaxFirst3: [31.9, 26.0, 31.4],
      sampleTminFirst3: [24.8, 23.9, 23.3],
      aliasesTested: ["gfs013 (identical series at verification point)", "gfs025 (all nulls)"],
      fixturePath: "docs/verification/open-meteo-models-2026-10-23.json",
      docsUrl: "https://open-meteo.com/en/docs (NCEP GFS Seamless / GFS 0.13°)",
    },
    lastVerifiedAt: "2026-10-23T02:11:00Z",
    lastSuccessfulRun: null,
    license: "CC-BY 4.0 (non-commercial via Open-Meteo); NCEP GFS is U.S. government work (public domain)",
    attributionRequirements: "Attribute 'NCEP GFS' and 'Open-Meteo.com'.",
    consensusEligible: true,
    aliasGroup: "ncep_gfs",
    exclusionReason: null,
  },
  // --- 6. AIGFS ---
  {
    targetLabel: "AIGFS",
    provider: "Open-Meteo (redistributes NCEP AIGFS)",
    endpoint: "https://api.open-meteo.com/v1/forecast",
    requestedModelId: "ncep_aigfs025",
    verifiedProduct: "NCEP AI-GFS (AIGFS) 0.25°, AI-post-processed GFS. Note: NOAA's operational GraphCast-based system (AIGEFS, Project EAGLE) went operational Dec 2025; the `ncep_aigfs025` product on Open-Meteo is the AI-GFS entry available through that channel.",
    productType: "ai_deterministic",
    nativeResolution: "≈28 km (0.25°)",
    geographicCoverage: "Global",
    availabilityStatus: "verified",
    evidence: {
      verificationDate: "2026-10-23",
      sampleTmaxFirst3: [30.0, 27.3, 29.1],
      sampleTminFirst3: [24.3, 23.7, 23.7],
      fixturePath: "docs/verification/open-meteo-models-2026-10-23.json",
      docsUrl: "https://open-meteo.com/en/docs (NCEP AIGFS 0.25°)",
    },
    lastVerifiedAt: "2026-10-23T02:11:00Z",
    lastSuccessfulRun: null,
    license: "CC-BY 4.0 (non-commercial via Open-Meteo)",
    attributionRequirements: "Attribute 'NCEP AIGFS' and 'Open-Meteo.com'.",
    consensusEligible: true,
    aliasGroup: "ncep_aigfs",
    exclusionReason: null,
  },
  // --- 7. UKMO ---
  {
    targetLabel: "UKMO",
    provider: "Open-Meteo (redistributes UK Met Office)",
    endpoint: "https://api.open-meteo.com/v1/forecast",
    requestedModelId: "ukmo_seamless",
    verifiedProduct: "UK Met Office Global 10 km (seamless). The id `ukmo_global10` is NOT recognized by the API; the global feed is exposed as `ukmo_seamless`.",
    productType: "deterministic_nwp",
    nativeResolution: "≈10 km",
    geographicCoverage: "Global",
    availabilityStatus: "verified",
    evidence: {
      verificationDate: "2026-10-23",
      sampleTmaxFirst3: [32.3, 32.1, 30.4],
      sampleTminFirst3: [24.8, 25.2, 24.7],
      rejectedIds: ["ukmo_global10"],
      fixturePath: "docs/verification/open-meteo-models-2026-10-23.json",
      docsUrl: "https://open-meteo.com/en/docs (UK Met Office Seamless/Global 10km)",
    },
    lastVerifiedAt: "2026-10-23T02:11:00Z",
    lastSuccessfulRun: null,
    license: "CC-BY 4.0 (non-commercial via Open-Meteo)",
    attributionRequirements: "Attribute 'UK Met Office' and 'Open-Meteo.com'.",
    consensusEligible: true,
    aliasGroup: "ukmo_global",
    exclusionReason: null,
  },
  // --- 8. ARPEGE ---
  {
    targetLabel: "ARPEGE",
    provider: "Open-Meteo (redistributes Météo-France)",
    endpoint: "https://api.open-meteo.com/v1/forecast",
    requestedModelId: "arpege_world",
    verifiedProduct: "Météo-France ARPEGE World (variable resolution; ~36 km over the Philippines).",
    productType: "deterministic_nwp",
    nativeResolution: "≈36 km (variable; ~5 km over France)",
    geographicCoverage: "Global",
    availabilityStatus: "verified",
    evidence: {
      verificationDate: "2026-10-23",
      sampleTmaxFirst3: [34.3, 32.6, 29.5],
      sampleTminFirst3: [27.7, 27.1, 27.0],
      fixturePath: "docs/verification/open-meteo-models-2026-10-23.json",
      docsUrl: "https://open-meteo.com/en/docs (Météo-France ARPEGE World)",
    },
    lastVerifiedAt: "2026-10-23T02:11:00Z",
    lastSuccessfulRun: null,
    license: "CC-BY 4.0 (non-commercial via Open-Meteo)",
    attributionRequirements: "Attribute 'Météo-France ARPEGE' and 'Open-Meteo.com'.",
    consensusEligible: true,
    aliasGroup: "meteo_france_arpege",
    exclusionReason: null,
  },
  // --- 9. GEM ---
  {
    targetLabel: "GEM",
    provider: "Open-Meteo (redistributes ECCC)",
    endpoint: "https://api.open-meteo.com/v1/forecast",
    requestedModelId: "gem_global",
    verifiedProduct: "ECCC GEM (Global Environmental Multiscale) deterministic global, ~25 km.",
    productType: "deterministic_nwp",
    nativeResolution: "≈25 km",
    geographicCoverage: "Global",
    availabilityStatus: "verified",
    evidence: {
      verificationDate: "2026-10-23",
      sampleTmaxFirst3: [32.5, 30.1, 30.4],
      sampleTminFirst3: [25.5, 24.6, 24.7],
      fixturePath: "docs/verification/open-meteo-models-2026-10-23.json",
      docsUrl: "https://open-meteo.com/en/docs (ECCC GEM Global)",
    },
    lastVerifiedAt: "2026-10-23T02:11:00Z",
    lastSuccessfulRun: null,
    license: "CC-BY 4.0 (non-commercial via Open-Meteo)",
    attributionRequirements: "Attribute 'ECCC GEM' and 'Open-Meteo.com'.",
    consensusEligible: true,
    aliasGroup: "eccc_gem",
    exclusionReason: null,
  },
  // --- 10. ACCESS-G ---
  {
    targetLabel: "ACCESS-G",
    provider: "Open-Meteo (bom_access_global) / BOM direct (registered)",
    endpoint: "https://api.open-meteo.com/v1/forecast  (bom_access_global); https://www.bom.gov.au/nwp/doc/access/NWPData.shtml (direct)",
    requestedModelId: "bom_access_global",
    verifiedProduct: "BOM ACCESS-G is a global ≈12–15 km deterministic model (APS4, 00Z/06Z/12Z/18Z out to +240h). Open-Meteo's BOM API page currently notes: 'BOM is currently upgrading its key platforms and services. During this process, open-data delivery has been temporarily suspended.' Our verification confirmed all null tmax/tmin at Dipolog (consistent with the BOM open-data outage, NOT a geographic coverage failure). Direct BOM access requires a Registered User subscription via FTP (fees may apply); it is not a free open endpoint.",
    productType: "deterministic_nwp",
    nativeResolution: "≈12 km (ACCESS-G) / ≈33 km (ACCESS-GE)",
    geographicCoverage: "Global (covers Philippines)",
    availabilityStatus: "returned_nulls",
    evidence: {
      verificationDate: "2026-10-23",
      pointsTested: ["Dipolog City (8.5872,123.3408)", "Sydney AU (-33.87,151.21)"],
      globalNullFinding: "Confirmed 2026-10-23: bom_access_global returns all-null daily tmax/tmin even for Sydney, Australia — NOT a Philippines coverage gap. Consistent with Open-Meteo's notice that BOM open-data delivery has been temporarily suspended during platform upgrades.",
      dipologSampleTmaxFirst3: [null, null, null],
      dipologSampleTminFirst3: [null, null, null],
      sydneySampleTmaxFirst3: [null, null, null],
      sydneySampleTminFirst3: [null, null, null],
      openMeteoBomNotice: "https://open-meteo.com/en/docs/bom-api ('open-data delivery has been temporarily suspended')",
      bomDirect: "https://www.bom.gov.au/nwp/doc/access/NWPData.shtml (registered users FTP, subscription fees may apply)",
      rejectedIds: ["access_global12 returned HTTP 400 from Open-Meteo"],
      fixturePath: "docs/verification/open-meteo-models-2026-10-23.json",
      docsCheckedAt: "2026-10-23",
    },
    lastVerifiedAt: "2026-10-23T02:11:00Z",
    lastSuccessfulRun: null,
    license: "BOM data is available to Registered Users; not a CC-BY free redistribution feed via Open-Meteo during the outage.",
    attributionRequirements: "Will require BOM attribution and registered access if/when direct integration is added.",
    consensusEligible: false,
    exclusionReason: "Open-Meteo BOM feed currently suspended (BOM platform upgrade), returns all-null daily values at Dipolog. Direct BOM access requires registration/subscription; deferred past v0.1 to stay within authorized free-data constraints.",
  },
  // --- 11. MULTI-GLOBAL ---
  {
    targetLabel: "MULTI-GLOBAL",
    provider: "Open-Meteo (internal blend alias, not an independent centre)",
    endpoint: null,
    requestedModelId: null,
    verifiedProduct: "'MULTI-GLOBAL' is Open-Meteo's own internal multi-model blend (a view label on Meteologix), not a distinct NWP product. We compute our own transparent median consensus over independent eligible models instead.",
    productType: "aggregate",
    nativeResolution: null,
    geographicCoverage: null,
    availabilityStatus: "excluded_by_design",
    evidence: {
      investigationDate: "2026-10-23",
      notes: "Not a separate model; including it would double-count models already in our eligible set.",
    },
    lastVerifiedAt: "2026-10-23T02:11:00Z",
    lastSuccessfulRun: null,
    license: null,
    attributionRequirements: null,
    consensusEligible: false,
    exclusionReason: "Not an independent NWP product — it is the kind of blend this system replaces with a transparent median over audited contributors.",
  },
  // --- 12. JMA ---
  {
    targetLabel: "JMA",
    provider: "Open-Meteo (redistributes JMA)",
    endpoint: "https://api.open-meteo.com/v1/forecast",
    requestedModelId: "jma_gsm",
    verifiedProduct: "JMA Global Spectral Model (GSM), ≈20 km.",
    productType: "deterministic_nwp",
    nativeResolution: "≈20 km",
    geographicCoverage: "Global",
    availabilityStatus: "verified",
    evidence: {
      verificationDate: "2026-10-23",
      sampleTmaxFirst3: [29.9, 29.6, 28.7],
      sampleTminFirst3: [25.2, 25.2, 25.0],
      fixturePath: "docs/verification/open-meteo-models-2026-10-23.json",
      docsUrl: "https://open-meteo.com/en/docs (JMA GSM / JMA Seamless)",
    },
    lastVerifiedAt: "2026-10-23T02:11:00Z",
    lastSuccessfulRun: null,
    license: "CC-BY 4.0 (non-commercial via Open-Meteo)",
    attributionRequirements: "Attribute 'JMA GSM' and 'Open-Meteo.com'.",
    consensusEligible: true,
    aliasGroup: "jma_gsm",
    exclusionReason: null,
  },
  // --- 13. GFS 0.125° ---
  {
    targetLabel: "GFS 0.125°",
    provider: "Open-Meteo (redistributes NCEP)",
    endpoint: "https://api.open-meteo.com/v1/forecast",
    requestedModelId: "gfs013",
    verifiedProduct: "NCEP GFS on the native 0.125°–0.13° grid. At Dipolog on the verification run, `gfs013` returned byte-identical daily Tmax/Tmin to `gfs_seamless`, so it is flagged as a same-product alias and NOT double-counted in consensus. Retained in the registry because the user explicitly requested it and because de-duplication is visible/auditable.",
    productType: "deterministic_nwp",
    nativeResolution: "≈13 km (0.125°–0.13°)",
    geographicCoverage: "Global",
    availabilityStatus: "verified",
    evidence: {
      verificationDate: "2026-10-23",
      sampleTmaxFirst3: [31.9, 26.0, 31.4],
      sampleTminFirst3: [24.8, 23.9, 23.3],
      identicalTo: "gfs_seamless (at verification point; de-duplicated before consensus)",
      rejectedIds: ["gfs025 returned all nulls"],
      fixturePath: "docs/verification/open-meteo-models-2026-10-23.json",
    },
    lastVerifiedAt: "2026-10-23T02:11:00Z",
    lastSuccessfulRun: null,
    license: "CC-BY 4.0 (non-commercial via Open-Meteo); NCEP GFS is U.S. public domain",
    attributionRequirements: "Attribute 'NCEP GFS 0.13°' and 'Open-Meteo.com'.",
    consensusEligible: true, // tracked, but alias-de-duplication removes it when identical to gfs_seamless
    aliasGroup: "ncep_gfs",
    exclusionReason: "Byte-identical to `gfs_seamless` at Dipolog on 2026-10-23; de-duplication logic will drop it from consensus whenever identical to another eligible member, but will keep it if values diverge on a given day.",
  },
  // --- 14. GRAPHCAST IFS ---
  {
    targetLabel: "GRAPHCAST IFS",
    provider: "Google DeepMind WeatherNext (Google Cloud/Earth Engine public datasets) ; ECMWF ai-models (runs third-party AI models)",
    endpoint: "Google Cloud gs://weathernext public buckets (WeatherNext Graph deprecated 2026-07-15, succeeded by WeatherNext 2); local self-hosting via github.com/google-deepmind/graphcast",
    requestedModelId: null,
    verifiedProduct: "Google DeepMind GraphCast / WeatherNext is a 0.25°, 6-hourly, 10-day deterministic GNN forecast model. ECMWF stopped daily external third-party AI chart runs (Pangu/GraphCast/Aurora/FourCastNet) in May 2026 after an IFS 50r1 upgrade degraded their performance ('increasingly out of date' per ECMWF). Open-Meteo does not currently expose GraphCast output via its free Forecast API. Self-hosting requires: GPU (A100/V100-class), ERA5/HRES initial conditions downloaded from ECMWF (which itself requires access/attribution), JAX/XLA runtime, ≈several GB weights + normalization, and a multi-step autoregressive loop per forecast cycle.",
    productType: "ai_self_host",
    nativeResolution: "0.25° (~28 km), 13 or 37 pressure levels",
    geographicCoverage: "Global",
    availabilityStatus: "self_host_impractical",
    evidence: {
      investigationDate: "2026-10-23",
      weightsLicense: "CC BY 4.0 per Google's 6 August 2026 notice (replaces prior CC BY-NC-SA 4.0 in checkpoint metadata per community report)",
      openMeteoAvailability: "No GraphCast product listed on Open-Meteo deterministic Forecast API",
      ecmwfStatus: "https://www.ecmwf.int/en/about/media-centre/aifs-blog/2026/farewell-external-ai-models (May 2026)",
      selfHost: "https://github.com/google-deepmind/graphcast (code+weights on Google Cloud Bucket; requires ERA5 input)",
      noaaAigefs: "NOAA AIGEFS is NCEP's operational GraphCast-based system (Dec 2025), but outputs are not exposed as a free point-forecast API",
      computeRequirements: "GPU inference (~1–10 s on A100 for 10-day global forecast, but preprocessing and initial-condition ingest are multi-hour pipeline steps outside a Worker runtime)",
    },
    lastVerifiedAt: "2026-10-23T02:11:00Z",
    lastSuccessfulRun: null,
    license: "CC BY 4.0 (model weights); ERA5/HRES inputs from ECMWF subject to their own licensing/attribution",
    attributionRequirements: "Google DeepMind GraphCast/WeatherNext attribution + ECMWF input attribution.",
    consensusEligible: false,
    exclusionReason: "No free point-forecast API available; ECMWF dropped external daily runs; self-hosting requires GPU infrastructure + ERA5/HRES ingest pipeline that cannot run on Cloudflare Workers and is out of operational scope for v0.1.",
  },
  // --- 15. PANGU IFS ---
  {
    targetLabel: "PANGU IFS",
    provider: "Huawei Cloud (official) ; ECMWF ai-models-panguweather",
    endpoint: "https://github.com/198808xc/Pangu-Weather",
    requestedModelId: null,
    verifiedProduct: "Huawei Pangu-Weather (3D Earth-specific transformer, 24h autoregressive model, 10-day lead, ~1.4 s per 24 h global forecast on one V100). ECMWF ran Pangu daily alongside GraphCast but also dropped it May 2026 ('neutral impact, increasingly out of date').",
    productType: "ai_self_host",
    nativeResolution: "0.25° (~28 km)",
    geographicCoverage: "Global",
    availabilityStatus: "license_incompatible",
    evidence: {
      investigationDate: "2026-10-23",
      weightsLicense: "CC BY-NC-SA 4.0 — 'The commercial use of these models is forbidden.' (per https://github.com/198808xc/Pangu-Weather and ecmwf-lab/ai-models-panguweather README)",
      ecmwfStatus: "https://www.ecmwf.int/en/about/media-centre/aifs-blog/2026/farewell-external-ai-models (May 2026)",
      selfHost: "Requires GPU + ERA5/HRES initial conditions; multi-step inference at 1h/3h/6h/24h cadence per the four-model design",
      openMeteoAvailability: "Not exposed via Open-Meteo deterministic Forecast API",
    },
    lastVerifiedAt: "2026-10-23T02:11:00Z",
    lastSuccessfulRun: null,
    license: "CC BY-NC-SA 4.0 (NON-COMMERCIAL ONLY, share-alike)",
    attributionRequirements: "Attribution to Huawei Cloud Pangu-Weather; BY-NC-SA 4.0 compliance.",
    consensusEligible: false,
    exclusionReason: "Weights are CC BY-NC-SA 4.0 (commercial use forbidden); v0.1 is built to be deployable into production (which could become commercial if served to a wide audience with ads/subscriptions). Also requires GPU + ECMWF initial-condition pipeline out of Workers scope.",
  },
];

// Alias groups for deterministic de-duplication: if, for a given location/date,
// two models in the same group produce byte-identical tmax OR tmin arrays,
// the lower-priority id (later in this list) is dropped from consensus for
// that variable.
export const ALIAS_GROUPS = {
  ecmwf_ifs_hires: ["ecmwf_ifs"],
  ecmwf_aifs: ["ecmwf_aifs025_single"],
  dwd_icon_global: ["icon_global", "icon_seamless", "dwd_icon"], // prefer icon_global
  ncep_gfs: ["gfs_seamless", "gfs013"],                         // prefer gfs_seamless
  ncep_aigfs: ["ncep_aigfs025"],
  ukmo_global: ["ukmo_seamless"],
  meteo_france_arpege: ["arpege_world"],
  eccc_gem: ["gem_global"],
  jma_gsm: ["jma_gsm"],
  // knmi_seamless was tested and returned byte-identical ECMWF IFS output
  // (KNMI Seamless blends ECMWF). It is NOT in our eligible set because it
  // is a blend, not an independent centre. It is not added to the registry
  // as a configured feed.
};

// Lists for the pipeline / UI
export const IMPLEMENTED_MODELS = MODEL_REGISTRY
  .filter((m) => m.availabilityStatus === "verified" && m.consensusEligible)
  .map((m) => ({
    id: m.requestedModelId,
    apiId: m.requestedModelId,
    label: m.verifiedProduct.split(",")[0].split("(")[0].trim(),
    shortLabel: m.targetLabel,
    centre: m.provider.split("(")[0].trim().replace("Open-Meteo", "").replace(/redistributes/,"").trim() || m.provider,
    priority: MODEL_REGISTRY.indexOf(m) + 1,
    nativeResKm: parseResolutionKm(m.nativeResolution),
    updateCycle: null,
    attribution: m.attributionRequirements,
    aliasGroup: m.aliasGroup,
    license: m.license,
    evidence: m.evidence,
  }));

// The API uses model IDs in the order defined here.
export const MODEL_API_IDS = IMPLEMENTED_MODELS.map((m) => m.apiId);

// Legacy alias: MODELS is used throughout the older v0.1 pipeline code.
export const MODELS = IMPLEMENTED_MODELS;

export const UNAVAILABLE_MODELS = MODEL_REGISTRY
  .filter((m) => m.availabilityStatus !== "verified")
  .map((m) => ({
    label: m.targetLabel,
    reason: `${m.availabilityStatus}: ${m.exclusionReason || ""}`,
    status: m.availabilityStatus,
    provider: m.provider,
  }));

export const OPEN_METEO_ATTRIBUTION =
  "Weather data by Open-Meteo.com (CC-BY 4.0, non-commercial free tier: <10,000 calls/day, <5,000/hour, <600/min). " +
  "Commercial use requires an Open-Meteo API subscription. " +
  "Underlying NWP centres: ECMWF, DWD ICON, NCEP GFS, UK Met Office, Météo-France ARPEGE, ECCC GEM, JMA GSM.";

function parseResolutionKm(s) {
  if (!s) return null;
  const m = String(s).match(/(\d+)\s*km/);
  return m ? parseInt(m[1], 10) : null;
}

// Counters for UI/reporting
export const FEED_COUNTS = {
  configured: MODEL_REGISTRY.length,
  verifiedEligible: IMPLEMENTED_MODELS.length,
  // independent consensus contributors per (location, date, variable) is
  // computed live in aggregateDaily after alias de-duplication.
};
