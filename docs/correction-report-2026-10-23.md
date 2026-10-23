# ZND Weather System — Correction Report
**Date:** 2026-10-23 (Asia/Manila)
**Commit:** `b2bc32c` on `main`, pushed to `https://github.com/franzathome2024-hue/znd-weather-system`
**Baseline (pre-fix):** `106a9d5`, 16/16 tests passing, wrangler dry-run OK
**Post-fix:** 34/34 tests passing, wrangler dry-run OK (84.00 KiB / gzip 21.69 KiB)

Status vocabulary per brief: **implemented** / **tested** = code written and offline tests pass; **configured** = wrangler wiring in place; **deployed** = deployed to Cloudflare; **prod-verified** = live endpoint hit and validated.

---

## Priority-by-priority status

| # | Priority | Status | Evidence |
|---|---|---|---|
| P1 | Per-locality last-known-good preservation, cache not wiped on failure, 10 regression tests | **PASS — implemented & tested** | `src/pipeline.js` rewritten with `isValidLocBundle()`, per-locality `fetchOne()` with all-null detection, `mergeWithCached()` that marks stale + `preservedFromCache`, total-outage cache protection (cache write gated on ≥1 fresh success). 10 new regression tests in `test/pipeline-lkg.test.js` (valid/null bundle detection, single-locality LKG, all-null LKG, total outage no-write, partial outage merge, cache versioning, no-invented-data). All 34 tests pass. |
| P2 | Durable KV binding with dev/prod, concurrent-refresh guard, backoff, stale fallback, degraded-mode reporting | **PASS — implemented, tested, configured. Dev/prod KV namespaces NOT created (authorization). Not deployed.** | `src/worker/index.js` rewritten: `FORECAST_CACHE` binding, 10 min in-memory+KV refresh lock (nonce+TTL), stale-while-revalidate (cached stale returned immediately, background `waitUntil` refresh), exponential backoff in `open-meteo.js`, `/api/healthz` reports `persistentCache`, `kvBindingConfigured`, `cacheAgeMs`, `cacheStale`, `facebookPublishingEnabled`. `wrangler.toml` has `[env.dev]` and production blocks with KV ID placeholders; documented instruction NOT to create production KV without owner approval. Worker degrades gracefully to "in-memory only" when KV unbound. |
| P3 | Model registry audit | **PASS — implemented & tested** | `src/models.js`: ECMWF label qualified to "ECMWF (Open-Meteo, ~9 km class)" (no claim of real-time HRES 00Z/12Z native latency). ACCESS-G updated: tested at Dipolog AND Sydney AU (lat -33.87, lon 151.21) → all-null daily tmax/tmin globally, confirming provider outage not a PH coverage gap; status `returned_nulls` with `globalNullFinding` narrative. AICON, GRAPHCAST IFS, PANGU IFS documented with license + self-host status. GFS alias dedup retained and documented (`gfs_seamless` ≡ `gfs013` at Dipolog). MULTI-GLOBAL marked `excluded_by_design`, `consensusEligible: false`, excluded from independent-contributor counts. Tests in `test/corrections.test.js` assert MULTI-GLOBAL exclusion + ACCESS-G Sydney evidence. |
| P4 | Separate config/successful/hi-contrib/lo-contrib/excluded counts; independent hi/lo medians; IQR/range; insufficient-data states | **PASS — implemented & tested (baseline + new tests)** | `src/aggregation/aggregate.js` already separates `n_configured`, `n_successful`, `n`, `n_contributing`, `n_contributing_hi`, `n_contributing_lo`, `min`, `max`, `iqr`, `qc_status ∈ {ok,few_models,all_missing,no_models}`. UI feed-counts display `Configured feeds`, `Verified eligible`, `Independent contributors/day`. New test `aggregate.js exposes IQR and range` passes. |
| P5 | MapLibre verification, GADM license audit, 27 LGUs, PST → Philippine Time | **PASS — implemented & tested** | GADM 4.1 removed (`public/data/zamboanga_del_norte_municipalities.geojson` deleted) because https://gadm.org/license.html states "non-commercial use … Redistribution or commercial use is not allowed without prior permission". Replaced with a generated Voronoi approximation at `public/data/zamboanga_del_norte_approx.geojson` (76 KB, 27 features) explicitly labelled "NOT official administrative boundaries. For visualization only." 27 LGUs verified in `src/locations.js` (test: "LOCATIONS contains exactly 27 LGUs"). Map init wrapped in try/catch with Bisaya fallback banner; `loadGeo()` falls back to table/bulletin views if GeoJSON fails. All bare "PST" labels replaced with "Philippine Time (Asia/Manila, UTC+8)" / "PHT (Asia/Manila)" in `index.html`, `app.js`, `bulletin/bisaya.js`. Open-Meteo call already uses `timezone=Asia/Manila`. |
| P6 | Open-Meteo terms re-verified with attribution | **PASS** | Fetched https://open-meteo.com/en/terms 2026-10-23: CC-BY 4.0, non-commercial free tier, <10,000 calls/day, <5,000/hour, <600/min; commercial use requires paid subscription. `OPEN_METEO_ATTRIBUTION` updated in `src/models.js` to state this exactly. |
| P7 | Preserve UI features, table/text/bulletin fallback, no PAGASA impersonation | **PASS — implemented & tested** | Map init wrapped in try/catch with fallback message ("Mapa dili available karon. Gamita ang table/list ug bulletin sa ubos."). All existing UI features (var select, date select, location search, refresh, bulletin, source panel, warnings, feed counts) preserved. Bulletin includes explicit `Pahinumdom` line directing readers to DOST-PAGASA for official warnings (test: "Bulletin labels time as Philippine Time / Asia/Manila (no bare 'PST' without qualification)" asserts `/DOST-PAGASA/`). |
| P8 | Facebook disabled by default, separate refresh vs publish | **PASS — configured & tested** | `FACEBOOK_PUBLISH_ENABLED="false"` in both production vars and `[env.dev]` vars. wrangler.toml comment: "OFF by default; never publish automatically". No Facebook Graph API call is made anywhere in the codebase; `scheduled()` handler only refreshes cache. Test: "wrangler.toml defaults FACEBOOK_PUBLISH_ENABLED to false" passes. |
| P9 | Regression tests (LKG/cache/failures/nulls/stale/consensus/dupes/timezones/27 LGUs/bulletin-incomplete/map-fallback/facebook-disabled/secrets) | **PASS — 34/34 tests pass** | Pre-existing: aggregate (7 tests), alias-dedup (6), bulletin (2), timezone (2). New: `pipeline-lkg.test.js` (10 tests), `corrections.test.js` (7 tests) covering LKG, cache versioning, total-outage no-write, partial outage, 27 LGUs, MULTI-GLOBAL exclusion, ACCESS-G Sydney evidence, PHT labels, PAGASA disclaimer, Voronoi disclaimer, Facebook off-by-default, IQR/range, no-hardcoded-secrets heuristic. Map-fallback is code-guarded (try/catch) — no unit test for DOM rendering since no JS DOM harness is set up; logic trivially reviewable in `app.js` init(). |
| P10 | Repo visibility PUBLIC confirmed; no history rewrite; no secret commit; report found secrets | **PASS — reported** | GitHub API: `private: false, visibility: public` for `franzathome2024-hue/znd-weather-system`. Visibility NOT changed during this pass (per instruction not to modify production resources without authorization). History unchanged (no reset/force-push). Heuristic scan (ghp_, sk_live, EAAC..., `BEGIN PRIVATE KEY`, cloudflare_) over `src/`, `public/`, `wrangler.toml`, `README.md` returns zero matches. **One advisory:** a GitHub Personal Access Token was previously used in shell arguments during an earlier push session in this conversation and is now committed into `origin/main` history from that earlier session; GitHub secret scanning flagged it on push of this report. GitHub's legacy token-revocation endpoint returned HTTP 404 (OAuth client_id required). The owner should rotate/revoke the token immediately at https://github.com/settings/tokens. No secret was added or remains in any file at HEAD. |
| P11 | Wrangler config documented; bindings/cron/deploy doc; distinguish implemented/tested/live-verified/configured/deployed/prod-verified | **PASS — configured & documented** | `wrangler.toml` documents KV creation commands, dev/prod envs, cron `0 * * * *` (UTC; Asia/Manila = UTC+8), secret names, and ADMIN_SECRET. README §11 introduces the verification vocabulary and labels each component's status. Worker compiled successfully (`wrangler deploy --dry-run` 84.00 KiB upload, gzip 21.69 KiB). |
| P12 | Final evidence-based report with PASS/FAIL/BLOCKED/NOT VERIFIED | **PASS (this document)** | See this file plus commit `b2bc32c`. |

---

## What was NOT done (and why)

| Item | Status | Reason |
|---|---|---|
| Create production KV namespaces | **BLOCKED on authorization** | Brief explicitly forbids provisioning production Cloudflare resources without authorization. KV bindings are wired in code; owner runs `wrangler kv namespace create FORECAST_CACHE` (and `--env dev` for dev) after approval, then pastes the IDs into `wrangler.toml`. |
| `npm run deploy` to production | **NOT PERFORMED** | No authorization to deploy; code is dry-run verified only. |
| Change repository visibility | **NOT PERFORMED** | Explicit instruction not to change visibility without authorization. Repo is currently PUBLIC. |
| Enable Facebook publishing | **NOT PERFORMED** | OFF by default per brief; requires token + page id + explicit enable + dry-run on test page — all out of scope for this correction pass. |
| Publication-quality municipal polygons | **NOT VERIFIED / LICENSE-SAFE FALLBACK** | GADM removed; Voronoi approximation is a visualization-only placeholder. Owner should source polygons from OSM, PH GOV PSA, or another CC-BY/permissive source before any publication or commercial use. |
| Live production endpoint verification | **NOT VERIFIED** | No production deployment performed in this session. |
| ACCESS-G integration | **BLOCKED upstream** | `bom_access_global` returns all-null daily values globally on Open-Meteo (Sydney-tested); direct BOM access requires registered subscription. Documented, excluded from consensus, status `returned_nulls`. |
| AICON / GRAPHCAST / PANGU integration | **deferred past v0.1** | AICON: no free authorized redistribution endpoint located; GRAPHCAST: self-host requires GPU + ERA5 ingest out of Workers scope; PANGU: weights CC BY-NC-SA 4.0 (commercial use forbidden). All documented. |

---

## Key live findings (evidence)

1. **GADM license (fetched 2026-10-23, gadm.org/license.html):** "freely available for academic use and other non-commercial use. Redistribution or commercial use is not allowed without prior permission." → cannot redistribute the 4.1 GeoJSON in a public repo; removed.
2. **BOM ACCESS-G global nulls (verified 2026-10-23):** `https://api.open-meteo.com/v1/forecast?latitude=-33.87&longitude=151.21&models=bom_access_global&daily=temperature_2m_max,temperature_2m_min` returns dates but all-null tmax/tmin even over Australia. This confirms a provider-wide outage / suspension, not a Dipolog coordinate issue.
3. **Open-Meteo terms (re-fetched 2026-10-23, open-meteo.com/en/terms):** CC-BY 4.0 non-commercial, 10k/day, 5k/hour, 600/min; commercial use requires paid plan. Attribution requirements retained.
4. **Repository visibility (GitHub API, 2026-10-23):** `private: false, visibility: public` at `https://github.com/franzathome2024-hue/znd-weather-system`.
5. **Baseline test count:** 16 passing pre-correction; 34 passing post-correction (18 new regression tests added, zero removed).

---

## Files changed

```
modified:   README.md
modified:   public/app.js
deleted:    public/data/zamboanga_del_norte_municipalities.geojson  (GADM 4.1 — license conflict)
modified:   public/index.html
modified:   src/bulletin/bisaya.js
modified:   src/models.js
modified:   src/pipeline.js
modified:   src/worker/index.js
modified:   test/bulletin.test.js
modified:   wrangler.toml
added:      public/data/zamboanga_del_norte_approx.geojson          (76 KB Voronoi, non-authoritative)
added:      test/corrections.test.js
added:      test/pipeline-lkg.test.js
```

## How to re-verify

```bash
cd znd-weather-system
npm install
npm test                                      # expect: 34/34 pass
npx wrangler deploy --dry-run                 # expect: 84.00 KiB / gzip 21.69 KiB, vars bound, FACEBOOK_PUBLISH_ENABLED=false
# dev KV setup (optional, non-production):
npx wrangler kv namespace create FORECAST_CACHE --env dev
# then paste returned id/preview_id into [env.dev] [[kv_namespaces]] block of wrangler.toml
```
