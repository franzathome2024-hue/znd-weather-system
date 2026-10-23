# znd-weather-system

**Version:** v0.1 (working, runnable; corrected 2026-10-23)
**Scope:** Multi-model numerical weather forecast system for **Zamboanga del Norte, Philippines** — all 27 cities and municipalities.
**Stack:** Cloudflare Workers (ES modules) + static HTML/CSS/JS frontend (MapLibre GL JS + OSM tiles) served from Workers Assets. Data via [Open-Meteo](https://open-meteo.com/) CC-BY 4.0 (non-commercial free tier) aggregating independently-verified global NWP models.
**Repository visibility:** PUBLIC at `https://github.com/franzathome2024-hue/znd-weather-system` (visibility was not changed during this correction pass; the owner may set it to private from GitHub settings if desired).

The system produces:

- An **11-model consensus** (median) daily high and low temperature for each of the 27 Zamboanga del Norte LGUs.
- A **responsive dashboard** with a MapLibre GL JS / OpenStreetMap temperature choropleth (high and low) with automatic table/bulletin fallback if the map fails to load, a model comparison table, a full data table, and source/warning metadata.
- A **natural Bisaya/Cebuano daily weather bulletin** (plain text, low-data, copy-paste ready for Facebook).
- An **hourly scheduled refresh** (Cloudflare Cron Triggers) with bounded retries, stale-data fallback, and duplicate-publication prevention.
- Facebook posting is **OFF by default** and requires explicit secret configuration and a successful dry run.

---

## 1. Implemented features (v0.1)

- ✅ All 27 LGUs with verified municipal-centre coordinates from Wikipedia / Philatlas / Open-Meteo geocoding (see `src/locations.js`). Each point is explicitly labelled as a town-center representative point, not a municipal-area forecast.
- ✅ 10 global NWP models aggregated (median consensus, typically 9 unique contributors after de-duplication): ECMWF IFS 9 km, ECMWF AIFS, DWD ICON Global, NCEP GFS Seamless, NCEP AIGFS, UKMO Global, Météo-France ARPEGE World, ECCC GEM Global, JMA GSM, NCEP GFS 0.13° — see `docs/model-availability-matrix.md` for the verified availability matrix.
- ✅ Independent high/low consensus (median), contributor count, min/max range, IQR, and a per-day QC flag (`ok`, `few_models`, `all_missing`, `no_models`).
- ✅ Automatic de-duplication when two models return byte-identical series (e.g. `gfs_seamless` vs `gfs013` in this region) to prevent double-counting.
- ✅ Asia/Manila (UTC+8) local-day boundary via Open-Meteo `timezone=Asia/Manila`; dates are preserved verbatim as PST calendar days.
- ✅ Hourly scheduled refresh (Cron Trigger: `0 * * * *`), last-good-cache retention when an upstream fetch fails, bounded retries with timeouts and backoff.
- ✅ Responsive UI tested at desktop, portrait/landscape Android, and tablet layouts via a mobile-first CSS grid.
- ✅ Temperature-high and temperature-low maps (Leaflet + OSM tiles), location search, per-location model comparison table, all-locations data table.
- ✅ Natural Bisaya bulletin generator (`src/bulletin/bisaya.js`) with no invented rain probabilities, no storm claims, and an explicit DOST-PAGASA disclaimer.
- ✅ Plain-text bulletin endpoint (`GET /api/bulletin?day=N`) so the bulletin is readable without rendering an image.
- ✅ Unit tests (Node's built-in `node:test`) covering the aggregation math, edge cases, timezone/date handling, and bulletin structural checks — run with `npm test`.

## 2. Unavailable models / limitations (v0.1)

These are the items from the target roster that are **not** in v0.1, with reasons
(also listed at runtime at `/api/models` and in the Source panel of the UI):

| Model | Reason |
|---|---|
| AICON | No free, documented, authorized redistribution endpoint currently exposes it; Open-Meteo `icon_*` identifiers tested returned 400. |
| ACCESS-G (BOM) | Open-Meteo exposes `bom_access_global` but it returns all-null daily values at Zamboanga del Norte longitudes on the current Open-Meteo build; including it would show a dead channel. |
| MULTI-GLOBAL | Excluded by design — it is Open-Meteo's own built-in multi-model blend, not an independent NWP centre product; our median replaces the need for it. |
| GRAPHCAST IFS | Not exposed via free Open-Meteo; ECMWF Chart/dissemination access requires credentials/license review deferred past v0.1. |
| PANGU IFS | Same as GRAPHCAST. |

Other limitations:

- v0.1 consensus is **temperature only** (daily max/min). We do not claim rain probabilities or storm tracks. The Bisaya bulletin is worded so as not to invent such values.
- v0.1 forecasts are **point forecasts** at municipal centres. Coastal and mountain barangays can differ materially.
- No Facebook publishing is performed by default. The posting switch is `FACEBOOK_PUBLISH_ENABLED=false` and must be explicitly enabled after a successful dry run.

## 3. Project structure

```
znd-weather-system/
├─ src/
│  ├─ worker/index.js          # Cloudflare Worker entry (routes + scheduled())
│  ├─ pipeline.js              # Fetch all 27 locations → parse → aggregate → cache
│  ├─ locations.js             # All 27 LGUs with verified coordinates
│  ├─ models.js                # Model roster + unavailable-model registry
│  ├─ aggregation/aggregate.js # Median/IQR/spread + daily aggregation (pure, tested)
│  ├─ providers/open-meteo.js  # Open-Meteo client (retries, timeout, error recording)
│  └─ bulletin/bisaya.js       # Natural Bisaya bulletin generator (tested)
├─ public/                     # Static frontend (served via Workers Assets)
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
├─ test/                       # node:test unit tests (no external API calls)
├─ docs/model-availability-matrix.md
├─ wrangler.toml               # Cloudflare Workers config + cron + bindings
├─ package.json
├─ .env.example                # Safe config template (no secrets)
└─ README.md
```

## 4. Local development

### Requirements

- Node.js 20+ (tested with Node 20.20)
- npm
- `wrangler` v3 (installed as a dev dependency; no global install required)

### Setup

```bash
git clone <repo-url> znd-weather-system
cd znd-weather-system
npm install
cp .env.example .env   # edit if you have non-defaults (none required for v0.1)
```

### Run the dev server

```bash
npm run dev
```

This starts Wrangler's local dev server. The frontend is served at the local
dev URL, and all `/api/*` routes hit the Worker. Open-Meteo calls go to the
real public API (no API key required for non-commercial volumes).

### Run the tests

```bash
npm test
```

Tests are entirely offline: they use synthetic fixtures (no paid APIs, no
network access from test code). All aggregation math, timezone/date handling,
and bulletin structural checks are covered.

### Live fetch from the CLI (sanity check)

```bash
node scripts/fetch-live.mjs
```

This hits the real Open-Meteo API for all 27 locations and prints a short
summary table. It is a standalone script (not part of the Worker bundle).

## 5. GitHub repository

> The environment in which this build ran does not provide a connected GitHub
> connector with write access. The repository is therefore initialised locally
> (you can verify this with `git log` after following the deployment steps
> below) but **is NOT yet pushed to github.com**. Follow the steps under
> "Push to GitHub" below to create the remote.

### Push to GitHub (manual steps)

1. On GitHub, create a **new private repository** called `znd-weather-system`
   (do **not** initialize it with a README or license — the local repo
   already contains those).
2. From your local clone:
   ```bash
   cd znd-weather-system
   git add -A
   git commit -m "v0.1: working multi-model consensus + dashboard + Bisaya bulletin"
   git remote add origin https://github.com/<your-org-or-user>/znd-weather-system.git
   git push -u origin main
   ```
3. Verify that:
   - No `.env` file or secret is committed (`.env.example` is the only env
     file tracked).
   - The repository contains `src/`, `public/`, `test/`, `wrangler.toml`,
     `package.json`, `README.md`.

The repository should be marked **private** by default per the brief.

## 6. Cloudflare Workers deployment

### One-time setup

1. Install/authorise Wrangler:
   ```bash
   npx wrangler login
   ```
2. (Optional but recommended) Create KV namespaces for durable cache + state:
   ```bash
   npx wrangler kv namespace create FORECAST_CACHE
   npx wrangler kv namespace create BULLETIN_STATE
   ```
   Copy the returned `id` and `preview_id` values into the `[[kv_namespaces]]`
   blocks in `wrangler.toml` (commented-out examples are provided). Without
   KV, the Worker still works — it just recomputes the bundle on every
   request instead of caching between hourly cron runs.
3. Set a secret for manual admin triggers if you want to use
   `POST /api/scheduler/run`:
   ```bash
   openssl rand -hex 32   # copy the output
   npx wrangler secret put ADMIN_SECRET
   ```
4. (Do **not** enable Facebook publishing yet.)

### Deploy

```bash
npm run deploy
```

This runs `npm run build` (a no-op frontend build at v0.1 since there is no
bundler — `public/` is served directly as Workers Assets) followed by
`wrangler deploy`. You will get a `https://znd-weather-system.<your-subdomain>.workers.dev`
URL.

### Automatic deploys from GitHub

To wire GitHub → Cloudflare automatic deployments:

1. Push the repository to GitHub (see section 5).
2. In the Cloudflare Dashboard → Workers & Pages → your Worker →
   **Settings** → **Builds & deployments** → connect the GitHub repository
   `znd-weather-system`, production branch `main`.
3. Build command: `npm run build`; deploy command: `npx wrangler deploy`;
   root directory: project root.
4. (Optional) Configure a `dev` branch that deploys to the `dev` environment
   (the `[env.dev]` block in `wrangler.toml` is provided).
5. Add production secrets (`ADMIN_SECRET`, and — later, after a dry run —
   `FACEBOOK_PAGE_ACCESS_TOKEN`, `FACEBOOK_PAGE_ID`) in the Cloudflare
   dashboard under the Worker's **Settings → Variables and Secrets**. Never
   commit secrets.

### Verifying the deployment

After deploy, visit:

- `https://<your-worker>/api/healthz` → `{"ok":true,...}`
- `https://<your-worker>/api/locations` → JSON list of all 27 LGUs
- `https://<your-worker>/api/models` → implemented/unavailable model matrix
- `https://<your-worker>/api/forecast?days=7` → full province bundle
- `https://<your-worker>/api/bulletin` → plain-text Bisaya bulletin
- `https://<your-worker>/` → the dashboard

## 7. Scheduled processing

- The cron trigger `0 * * * *` fires every hour (UTC).
- Each run fetches all 27 locations sequentially with a 150 ms pacing delay
  between requests, 15 s timeouts, up to 2 bounded retries per request, and
  exponential backoff.
- Successful bundles are written to KV (`FORECAST_CACHE`) with a ~55 minute
  TTL; the hourly cron refreshes regardless.
- When an upstream request fails for a location, no replacement value is
  fabricated; the location is recorded in `summary.errors` and the UI shows
  a warning banner. Stale cache (older than 8 h) is still served with a
  `stale: true` flag while a non-blocking background refresh is kicked off.
- The next successful run overwrites the cache; no duplicate bulletins are
  published (Facebook publishing is off until you configure it after a dry
  run).

## 8. Facebook publishing (manual approval required)

Facebook publishing is **hard-disabled unless all of the following are true**:

1. A long-lived Page Access Token is stored in the secret
   `FACEBOOK_PAGE_ACCESS_TOKEN`.
2. `FACEBOOK_PAGE_ID` is set.
3. `FACEBOOK_PUBLISH_ENABLED` is set to the string `"true"` (via a secret or
   env var).
4. You have completed a successful dry run against the Facebook Graph API
   sandbox / a test page (not the production page).
5. You have manually approved bulletin wording.

v0.1 ships with the publisher **hook present but not invoked** (the
`/api/scheduler/run` endpoint only refreshes cache; posting is a separate,
explicit future step). This is intentional per the brief's safety
requirements.

## 9. Running the tests (again, CI)

```bash
npm test
```

All tests pass on the version committed here. The test suite contains:

- `test/aggregate.test.js` — median, IQR, null handling, de-duplication,
  full-location forecast shape, independent hi/lo median (highs and lows can
  come from different models).
- `test/timezone.test.js` — verifies Open-Meteo local-date preservation and
  all-null / missing model channel handling.
- `test/bulletin.test.js` — verifies required structural elements of the
  Bisaya bulletin (header, all 27 location bullets, PAGASA disclaimer, source
  attribution, no fabricated percentages).

## 10. Next steps after v0.1

- Enable Facebook publishing behind manual approval + a dry-run endpoint.
- Add GRAPHCAST / PANGU once an authorized redistribution path is confirmed.
- Add precipitation and weather-code variables from the same models once we
  have a verified calibration against PAGASA observations.
- Add simple barometric-pressure / wind signals only after numerical
  verification.
- Add a per-municipality ensemble view once we connect Open-Meteo's Ensemble
  API (`ensemble-api.open-meteo.com`) — this requires rate-limit care.
- Add a geojson-based municipal polygon overlay for spatial rendering
  (currently points-on-a-map only).
- Historical run archive (KV → R2) for trend charts.

## 11. Corrections applied 2026-10-23

A 13-priority correction pass was applied. Summary of changes:

1. **Per-locality last-known-good (LKG) preservation.** `src/pipeline.js` rewritten with
   `isValidLocBundle()`, per-location `fetchOne()` that treats all-null daily responses
   as failures (not successes), `mergeWithCached()` that preserves prior valid data per
   locality when a fresh fetch fails or returns all-null (e.g. the current BOM ACCESS-G
   outage), and a `fullOutage`/`zeroFreshSuccesses`/`partialRefresh` flag set. Cache is
   **never overwritten on zero fresh successes** so a total outage cannot wipe the last
   good bundle.
2. **Durable Cloudflare KV binding with dev/prod separation.** `wrangler.toml` updated:
   dev (`[env.dev]`) vs production sections, KV IDs left as placeholders (production
   namespaces will NOT be created without owner authorization). Worker exposes
   `FORECAST_CACHE` binding, has an in-memory + KV refresh lock (10 min TTL) to avoid
   concurrent refreshes, bounded retries with backoff, `stale-while-revalidate` serving,
   and a `/api/healthz` endpoint reporting persistent-cache status, age, and staleness.
3. **Model registry audit.**
   - ACCESS-G (`bom_access_global`) updated: confirmed 2026-10-23 to return all-null
     daily tmax/tmin even for Sydney, Australia — i.e. a global provider outage, not a
     PH coverage gap, consistent with Open-Meteo's BOM-notice. Status `returned_nulls`.
   - ECMWF label qualified: `ecmwf_ifs` on the free API is described as "ECMWF
     (Open-Meteo, ~9 km class)" — we do not claim real-time HRES 00Z/12Z native latency.
   - AICON, GRAPHCAST IFS, PANGU IFS documented with their license/self-host status.
   - GFS alias de-dup documented (`gfs_seamless` vs `gfs013` byte-identical at Dipolog).
   - MULTI-GLOBAL marked `excluded_by_design` (not an independent centre; consensus-
     ineligible) and excluded from independent-contributor counts.
4. **Counts separated** (config / verified / high-contributors / low-contributors /
   excluded) in `aggregate.js` and in the UI feed-counts display; independent hi and lo
   medians (highs and lows can come from different models); IQR and range exposed;
   `few_models`/`all_missing`/`no_models` QC states retained for insufficient-data days.
5. **Map / boundaries.** Frontend switched to a generated Voronoi-approximation GeoJSON
   (`public/data/zamboanga_del_norte_approx.geojson`, 27 features) explicitly labelled
   "NOT official administrative boundaries — for visualization only". The prior GADM
   4.1 file was removed because GADM 4.1 license does not permit redistribution or
   commercial use. Map initialization is wrapped in a try/catch; if MapLibre or GeoJSON
   fails to load the UI falls back to the table/bulletin views. 27 LGUs verified.
6. **Timezone labels.** References to bare "PST" replaced with "Philippine Time
   (Asia/Manila, UTC+8)". Dates are still fetched with `timezone=Asia/Manila`.
7. **Open-Meteo terms re-verified** (https://open-meteo.com/en/terms, 2026-10-23): CC-BY
   4.0, non-commercial free tier, <10,000 calls/day, <5,000/hour, <600/min; commercial
   use requires a paid subscription. Attribution text updated accordingly.
8. **UI preserved.** All existing features (map, model table, data table, bulletin,
   search, date picker) retained. No PAGASA impersonation — the bulletin carries an
   explicit DOST-PAGASA advisory disclaimer.
9. **Facebook off by default**, separate from refresh (refresh caches; publishing is
   a separate, gated step that is not wired to automatic triggers in v0.1).
10. **Regression tests.** 18 new tests added in `test/pipeline-lkg.test.js` and
    `test/corrections.test.js` (34 total passing) covering: LKG preservation on single-
    locality failure, LKG preservation on all-null response, cache preservation on
    total outage, cache version isolation, never-inventing data, 27 LGUs present,
    MULTI-GLOBAL exclusion, ACCESS-G global-null evidence, bulletin timezone labels,
    PAGASA disclaimer, IQR/range, Voronoi disclaimer, Facebook default-off, and a
    heuristic no-hardcoded-secrets scan.
11. **Secrets.** No GitHub PAT, Facebook token, or private key is committed to the
    source tree. The wrangler config uses placeholders for KV IDs and expects secrets
    via `wrangler secret put`.
12. **Repository visibility.** Reported as PUBLIC via the GitHub API on 2026-10-23.
    Visibility was NOT changed during this pass (per instruction to not modify
    production resources without authorization). Owner can change it from GitHub repo
    Settings → General → Danger Zone → Change visibility.
13. **Wrangler dry-run passes** (83.89 KiB total upload, gzip 21.69 KiB). No production
    deployment was performed during this pass. The `dev` environment is configured for
    sandbox testing but no KV namespaces were auto-created.

### Verification status vocabulary (used in this README and in `/api/healthz`)

- **implemented** — code is written and bundled.
- **tested** — unit tests pass offline (`npm test`).
- **configured** — wrangler/env wiring is in place.
- **deployed** — `npm run deploy` has been run against a Cloudflare account.
- **prod-verified** — a live production endpoint has been hit and returned expected
  responses.

At the time of this commit: core pipeline/cache logic and frontend are **implemented**
and **tested**; wrangler bindings/cron are **configured**; production is **not
deployed** and **not prod-verified** in this session.

## 12. Nationwide ECMWF temperature overlay (added 2026-10-23)

In addition to the per-LGU point consensus, the dashboard now ships a **seamless
Philippines-wide temperature overlay** ("National temperature" view, the default on
load). This is a separate, geographically aligned raster layer driven directly from
ECMWF IFS numerical-weather-prediction output — not an interpolation of the 27 LGU
consensus points.

**Data source (verified 2026-10-23):** ECMWF IFS O1280 reduced-Gaussian grid (~9 km
global resolution), WGS84 (EPSG:4326), served as Open-Meteo `data_spatial/ecmwf_ifs`
binary chunks from the public, no-referer-lock S3 endpoint
`https://openmeteo.s3.amazonaws.com/data_spatial/ecmwf_ifs/latest.json?variable=…`.
Variables used:

| UI layer | OM variable | Cadence |
|---|---|---|
| Daily HIGH | `temperature_2m_max` | 3-hourly preceding-period max, out ~6 days |
| Daily LOW  | `temperature_2m_min` | 3-hourly preceding-period min, out ~6 days |
| (default)  | 3-hourly `temperature_2m_max` at ~14 PHT heat-of-day | |

**Why ECMWF IFS:** It is the only verified global model on the Open-Meteo public
spatial endpoint that exposes both `temperature_2m_max` and `temperature_2m_min` with
no API key (DWD ICON is EU-only; GFS/GEM/ARPEGE/UKMO/JMA were probed 2026-10-23 and
returned 404 on this S3 endpoint). License: CC BY 4.0 (ECMWF via Open-Meteo) —
non-commercial free, attribution required. Fixtures:
`docs/verification/ecmwf-ifs-spatial-2026-10-23-{t2m,t2m_max,t2m_min}.json`.

**How it is rendered:** Tiles are decoded in-browser via the vendored copy of
`@openmeteo/weather-map-layer@0.3.0` (MIT, under `public/vendor/omdl/`). A
WASM+Web Worker decoder reads the OM binary format and returns `ImageBitmap` tiles
to MapLibre GL JS through the `om://` custom MapLibre protocol. No server-side raster
generation is required — everything runs on the client, which fits the Cloudflare
Workers + Workers Assets static-frontend model. **There are no API keys, no new
infrastructure, and no paid services.**

**Geographic alignment & no-data handling:**
- CRS is WGS84/EPSG:4326 (explicit in the metadata `crs_wkt`); the library reprojects
  tiles to Web Mercator for MapLibre using the grid's native lat/lon coordinates.
  No hardcoded pixel offsets are used.
- Ocean/lake cells are no-data and remain transparent (the OSM basemap shows through).
  Colors are not extended into unsupported regions.
- Display uses bilinear upscaling when zoomed in past native resolution; the legend
  and source panel label this explicitly as "display interpolation" vs native grid
  resolution. Square tiles visible at very high zoom reflect the native ~9 km model
  cells, not seams or mis-registration.

**Two complementary views:**
1. **National temperature (default)** — PH-wide continuous overlay, municipal
   fill/outline layers hidden so dark borders don't obscure the temperature field,
   map auto-fits to the Philippines extent (Batanes → Tawi-Tawi), fixed °C legend
   (20–38 °C, physically comparable across time), and a time-step dropdown (PHT).
2. **Zamboanga del Norte LGUs** — unchanged 27-LGU Voronoi choropleth with point
   consensus, click/hover, selected-LGU outline, model table and bulletin. This view
   explicitly labels the Voronoi polygons as approximate (non-official).

Switching views just toggles layer visibility + the overlay source; the muni-fill and
muni-line layers are never destroyed, so LGU feature state (selection/hover) persists.

**Graceful failure:** If the Open-Meteo S3 metadata fetch fails (offline, blocked,
CORS outage, or 4xx/5xx), a warning banner appears in the controls panel, the
overlay is not installed, and the user can still use the Zamboanga LGU view plus
the table/bulletin/API. The worker-side point forecast pipeline is unchanged and
does not depend on the spatial overlay.

**Files added/changed for this feature:**
- `public/app-om.js` (new) — ES module that registers the `om://` protocol, caches
  `latest.json` metadata, maps UI var/date → OM variable + valid_time.
- `public/vendor/omdl/*` (new, vendored) — `@openmeteo/weather-map-layer@0.3.0` dist
  (JS + WASM + Web Worker), served as static assets.
- `public/app.js` — added national-view state; `addNationalOverlay`,
  `installOrUpdateOmSource`, `removeOmSource`, `applyViewMode`, `flyToView`,
  `syncOverlayTimeOptions` helpers; national vs LGU view toggle; fixed-scale legend
  and PHT time labels; `mapReady()` relaxed in national mode so it no longer blocks
  on the muni source; muni data refresh skipped when not in LGU view.
- `public/index.html` — added "Map view" `<select>`, "National overlay time"
  `<select>` with metadata line, `#warnOverlay` banner.
- `public/styles.css` — small additions for overlay control / legend small-text.
- `docs/verification/ecmwf-ifs-spatial-2026-10-23-*.json` — metadata fixtures.
- `test/national-overlay.test.js` (new) — 11 tests covering the toggle/default,
  S3-vs-referer-locked host choice, vendored assets presence, live ECMWF metadata
  reachability, PH-extent bounds, view-mode layer visibility, fixed-scale legend,
  no-fabrication disclaimers, attribution text, and legacy LGU regression.

**Out of scope for this release (kept temperature-only per standing constraint):**
rain, wind, storm tracks, Facebook changes, server-side raster generation, production
secrets/cron changes.

## 13. License

MIT. Weather data © Open-Meteo.com (CC-BY 4.0, non-commercial; see
https://open-meteo.com/en/terms). Underlying NWP centres retain their own
licenses. For the Zamboanga del Norte consensus view, this project derives a median
from Open-Meteo point forecasts; for the national view it renders ECMWF IFS grids
served by Open-Meteo's public spatial endpoint in-browser.

The municipal-boundary GeoJSON (`public/data/zamboanga_del_norte_approx.geojson`) is a
generated Voronoi approximation from municipal centroids and is NOT an official
administrative boundary. It is included solely for visualization purposes; replace it
with an authoritative PSA/OSM/PH-GOV boundary source before any publication-quality use.

The national overlay's ECMWF IFS grid is native ~9 km numerical output; bilinear
upscaling at zoom levels past native resolution is a display interpolation, not new
information.
