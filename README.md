# znd-weather-system

**Version:** v0.1 (working, runnable)
**Scope:** Multi-model numerical weather forecast system for **Zamboanga del Norte, Philippines** — all 27 cities and municipalities.
**Stack:** Cloudflare Workers (ES modules) + static HTML/CSS/JS frontend served from Workers Assets. Data via [Open-Meteo](https://open-meteo.com/) CC-BY 4.0 (non-commercial) aggregating 11 global NWP models.

The system produces:

- An **11-model consensus** (median) daily high and low temperature for each of the 27 Zamboanga del Norte LGUs.
- A **responsive dashboard** with a Leaflet/OpenStreetMap temperature map (high and low), a model comparison table, a full data table, and source/warning metadata.
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

## 11. License

MIT. Weather data © Open-Meteo.com (CC-BY 4.0, non-commercial; see
https://open-meteo.com/en/terms). Underlying NWP centres retain their own
licenses; this project does not redistribute raw model grids — it derives a
median consensus from point forecasts served by Open-Meteo.
