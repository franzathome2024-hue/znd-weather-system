# PAGASA provincial scraper + weighted consensus — 2026-10-23

## What changed

1. **New PAGASA provider** (`src/providers/pagasa.js`) — scrapes the official
   PAGASA-DOST Zamboanga del Norte provincial forecast twice daily:
   - `GET https://www.pagasa.dost.gov.ph/regional-forecast/minprsd` to
     establish the `october_session` cookie;
   - `POST https://www.pagasa.dost.gov.ph/api/regional/Mindanao/907200000`
     (PSGC 0907200000) with `X-Requested-With: XMLHttpRequest` returns 6 days
     of day/night high/low temperature, weather, wind, coastal condition.
   - Results cached in KV for 4h to keep request volume tiny (max ~12 PAGASA
     hits/day versus up to 27 × the Open-Meteo fetches).
   - Failures are non-fatal: the multi-model consensus still runs with the
     10 Open-Meteo feeds.
   - PAGASA footer states "All content is in the public domain unless
     otherwise stated." Attribution text and a yellow "PAGASA · official"
     badge appear in the UI. Scraping uses a descriptive User-Agent and
     respects 4h cache, no bulk download.

   Live verification 2026-10-23 ~11:25 UTC (issued 08:36 UTC):
       2026-10-23  hi=33 lo=26  Cloudy with rainshowers/thunderstorms (TY Rosal trough)
       2026-10-24  hi=35 lo=26
       2026-10-25  hi=34 lo=25
       2026-10-26  hi=33 lo=24
       2026-10-27  hi=33 lo=25
       2026-10-28  hi=34 lo=24

2. **Consensus switched from median to robust weighted mean**
   (`src/aggregation/aggregate.js`):
   - Outliers (values >2.5·rescaled-MAD from the median) are trimmed before
     weighting, so one broken feed cannot swing the consensus.
   - Per-model weights (field `consensusWeight` in `MODEL_REGISTRY`):
       - PAGASA provincial               2.5  (domestic official guidance)
       - ECMWF IFS HRES                  1.5
       - NCEP AIGFS                      1.5
       - UKMO UK10                       1.5
       - DWD ICON                        1.0
       - NCEP GFS seamless               1.0
       - Météo-France ARPEGE             1.0
       - ECCC GEM                        1.0
       - JMA GSM                         1.0
       - GFS 0.125° (alias of GFS)       1.0
       - ECMWF AIFS (experimental AI)    0.5
       - AIWP Pangu / GraphCast          non-consensus (BY-NC-SA 4.0)
   - Median is kept as the fallback when fewer than 3 independent values
     survive trim, and the UI shows which method was used per variable per
     day ("weighted" or "median").
   - `n_contributing` / `n` now reflects post-trim contributors; `n_raw` is
     contributors after alias dedup but before outlier trim; `weightsApplied`
     is emitted per-day so the UI/debug can see exactly how each model was
     weighted.

## Tests

`npm test` → 68/68 passing (was 62 before this PR; added `test/pagasa.test.js`
and `test/weighted-consensus.test.js`, updated the two existing tests that
asserted specific median values where the new method gives a different
answer).

## Caveats

- PAGASA values are **province-wide**, not per-municipality, so all 27 ZN
  LGUs see the same PAGASA trace. This is why the weight is 2.5, not larger —
  the other 10 global models provide municipal-scale resolution.
- Night_low of outlook[0] (tonight's overnight low) is carried over to the
  next day's tmin when available; otherwise the day_low is used. PAGASA's
  extended outlook days only provide day_high/day_low.
- Cookie parsing is best-effort: Workers' `Headers.getSetCookie()` is used
  when available, with a regex fallback for older Node.
