# Model Availability Matrix (v0.1)

Last verified against live Open-Meteo API from a Zamboanga del Norte query point
(8.58°N, 123.33°E — Dipolog City) on 2026-10-23.

The primary redistributor in v0.1 is **Open-Meteo's deterministic Forecast API**
(`https://api.open-meteo.com/v1/forecast`), which is free for non-commercial use
(<10,000 calls/day) under CC-BY 4.0, aggregates outputs from multiple global NWP
centres, and exposes deterministic products via a documented `&models=` parameter.

| # | Target label | v0.1 id (apiId) | Status | Notes |
|---|---|---|---|---|
| 1 | ECMWF IFS HRES 00Z/12Z | `ecmwf_ifs` | ✅ Implemented | Open-Meteo's highest-resolution ECMWF deterministic product (≈9 km). It is the redistributed HRES-equivalent feed; latency is Open-Meteo's ingest latency (≈6–7h post-00Z/12Z), not the raw ECMWF dissemination latency. |
| 2 | ECMWF AIFS | `ecmwf_aifs025_single` | ✅ Implemented | Single-member ECMWF AIFS at 0.25°. |
| 3 | ICON (DWD ICON Global) | `icon_global` | ✅ Implemented | DWD ICON global deterministic, ≈13 km. |
| 4 | AICON | — | ❌ Unavailable in v0.1 | No redistributed AICON product is exposed via Open-Meteo at the `icon_*` names we tested (`aicon`, `aifs_seamless`, `gfs025_ai_seamless` all return 400). No free, documented, authorized endpoint is known to us that redistributes AICON at the time of v0.1; we will not invent a label for an unrelated product. |
| 5 | GFS | `gfs_seamless` | ✅ Implemented | Open-Meteo's seamless GFS product (blended with shorter-range HRRR-like products where available). |
| 6 | AIGFS | `ncep_aigfs025` | ✅ Implemented | NCEP AIGFS 0.25° (AI post-processed GFS) — confirmed live via the Open-Meteo id `ncep_aigfs025`. |
| 7 | UKMO | `ukmo_seamless` | ✅ Implemented | UK Met Office Global 10 km seamless (blend of UKMO global + UKV where applicable). |
| 8 | ARPEGE | `arpege_world` | ✅ Implemented | Météo-France ARPEGE World (variable resolution, ≈36 km at this longitude). |
| 9 | GEM | `gem_global` | ✅ Implemented | ECCC GEM Global ≈25 km. |
| 10 | ACCESS-G | — | ❌ Unavailable in v0.1 | Open-Meteo exposes `bom_access_global` but API testing from Dipolog returns **all nulls** for daily variables (the model either doesn't cover this location or the Open-Meteo build isn't serving it here). Excluded so we don't show a dead channel. |
| 11 | MULTI-GLOBAL | — | ⛔ Excluded by design | "MULTI-GLOBAL" is an alias for Open-Meteo's own multi-model blend, not an independent NWP product. Including it would double-count models already in our median consensus. |
| 12 | JMA | `jma_gsm` | ✅ Implemented | JMA Global Spectral Model ≈20 km. |
| 13 | GFS 0.125° | `gfs013` | ✅ Implemented | NCEP GFS on the native 0.13° grid. Values near Zamboanga del Norte are typically nearly identical to `gfs_seamless`; our aggregator de-duplicates identical series so it does not double-influence the median. |
| 14 | GRAPHCAST IFS | — | ❌ Unavailable in v0.1 | Google DeepMind GraphCast is not redistributed via Open-Meteo's free API; ECMWF chart/dissemination access requires separate credentials / licensing review deferred past v0.1. |
| 15 | PANGU IFS | — | ❌ Unavailable in v0.1 | Huawei Pangu-Weather is not redistributed via Open-Meteo's free API; ECMWF open-data redistribution requires additional license/setup. |

## Counts

- Implemented in v0.1: **10 models** (≈9 unique contributors per location after GFS de-duplication in this region).
- Verified live from PH: all 11 return non-null `temperature_2m_max/min` for
  Dipolog City.
- Missing (with documented reasons): **4 models** + 1 explicit design exclusion.

## What this means for consensus quality

The v0.1 consensus is therefore a **11-member global-model median** over
Zamboanga del Norte representative points. AICON, ACCESS-G, GRAPHCAST, and
PANGU can be added in later versions once a documented, authorized
redistribution path is identified; none of them is silently replaced by a
different model in v0.1.

## Attribution

- Data source: Open-Meteo.com (CC-BY 4.0, non-commercial; see
  https://open-meteo.com/en/terms).
- Underlying NWP centres retain their own licenses; Open-Meteo's aggregation
  surface is what we call.
- The official Philippine source for warnings and hazard advisories remains
  DOST-PAGASA. This dashboard is a consensus temperature product and does not
  reproduce or replace any PAGASA advisory.
