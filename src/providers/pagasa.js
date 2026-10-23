// PAGASA provincial forecast provider.
//
// PAGASA's provincial forecast endpoint requires a session cookie obtained by
// first loading the regional-forecast page. The endpoint returns 6 days of
// day/night high/low temperature for the province (not per-municipality).
//
// We use this as an ADDITIONAL official contributor to the consensus for all
// 27 Zamboanga del Norte LGUs. Because PAGASA values are province-wide, we
// give them a high but not dictating weight (2.5), and only for days where
// PAGASA returned a numeric value. The existing independent multi-model
// contributors still supply municipal-level granularity.
//
// Scraping policy: PAGASA pages are Government of Philippines public-domain
// content (footer: "All content is in the public domain unless otherwise
// stated"). We issue at most 2 requests per refresh (GET HTML + POST JSON),
// cache the result in KV with a 4h TTL (matching the main pipeline TTL), and
// send a descriptive User-Agent. Failure is non-fatal: the rest of the
// multi-model consensus is served unchanged.

import { LOCATIONS } from "../locations.js";

const PAGASA_ZN_PSGC = "907200000"; // Zamboanga del Norte, Zamboanga Peninsula
const PAGASA_ZN_NAME = "Zamboanga del Norte, Zamboanga Peninsula";
const REGIONAL_URL = "https://www.pagasa.dost.gov.ph/regional-forecast/minprsd";
const API_URL = `https://www.pagasa.dost.gov.ph/api/regional/Mindanao/${PAGASA_ZN_PSGC}`;
const TTL_S = 60 * 60 * 4; // same as main cache TTL
const CACHE_KEY = "znd:pagasa:zn-v1";
const TIMEOUT_MS = 10000;

/**
 * Fetch PAGASA Zamboanga del Norte outlook.
 * @param {Object} opts
 * @param {typeof fetch} [opts.fetchFn]
 * @param {{get:(k)=>Promise<string|null>,put:(k,v,o?)=>Promise<void>}} [opts.store] - optional KV
 * @returns {Promise<{ok:boolean, issuedAt?:string, source?:string, days?:Array<{date:string, tmax:number|null, tmin:number|null, description?:string}>, error?:string}>}
 */
export async function fetchPagasaZn({ fetchFn = globalThis.fetch, store } = {}) {
  try {
    if (store) {
      const cached = await store.get(CACHE_KEY);
      if (cached) {
        try {
          const c = JSON.parse(cached);
          if (c && c.cachedAt && Date.now() - new Date(c.cachedAt).getTime() < TTL_S * 1000) {
            return { ok: true, ...c, fromCache: true };
          }
        } catch (_) { /* bad cache; fall through */ }
      }
    }
    const ua = "ZNDWeatherSystem/0.2 (https://github.com/franzathome2024-hue/znd-weather-system; public-good provincial aggregation; contact: repo issues)";
    // 1. GET the regional forecast page to establish the october_session cookie
    const pageResp = await fetchFn(REGIONAL_URL, {
      headers: { "User-Agent": ua, "Accept": "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!pageResp.ok) return { ok: false, error: `PAGASA page HTTP ${pageResp.status}` };
    await pageResp.text(); // discard body but ensure cookies are collected
    // Cloudflare Workers' fetch doesn't persist cookies automatically; we
    // need to read Set-Cookie and replay it. In Workers, Headers.get('set-cookie')
    // returns a comma-newline separated list of raw cookies (we parse it).
    const cookies = extractCookies(pageResp.headers);
    const cookieHeader = Object.entries(cookies).map(([k,v]) => `${k}=${v}`).join("; ");
    // 2. POST the JSON API
    const apiResp = await fetchFn(API_URL, {
      method: "POST",
      headers: {
        "User-Agent": ua,
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": REGIONAL_URL,
        "Origin": "https://www.pagasa.dost.gov.ph",
        ...(cookieHeader ? { "Cookie": cookieHeader } : {}),
      },
      body: "",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!apiResp.ok) return { ok: false, error: `PAGASA API HTTP ${apiResp.status}` };
    const raw = await apiResp.json();
    const days = parseOutlook(raw);
    const issuedAt = new Date().toISOString();
    const result = {
      ok: true,
      issuedAt,
      source: "PAGASA Mindanao PRSD provincial forecast (public domain, Government of the Philippines)",
      provinceName: raw?.name || PAGASA_ZN_NAME,
      psgcCode: raw?.psgc_code || PAGASA_ZN_PSGC,
      days,
      cachedAt: issuedAt,
    };
    if (store) {
      try { await store.put(CACHE_KEY, JSON.stringify(result), { expirationTtl: TTL_S }); } catch (_) {}
    }
    return result;
  } catch (e) {
    return { ok: false, error: `PAGASA fetch failed: ${e.message || String(e)}` };
  }
}

function extractCookies(headers) {
  const out = {};
  // Cloudflare Workers and modern fetch expose getSetCookie() returning an
  // array of raw Set-Cookie header lines (one per cookie). Older Node versions
  // expose a single aggregated header via get("set-cookie").
  let candidates = [];
  if (typeof headers.getSetCookie === "function") {
    candidates = headers.getSetCookie() || [];
  } else {
    const raw = headers.get("set-cookie");
    if (raw) candidates = raw.split(/,(?=\s*[A-Za-z0-9!#$%&'*+\-.^_`|~]+=)/); // split on cookie boundaries (best-effort)
  }
  for (const c of candidates) {
    if (!c) continue;
    const m = c.match(/^\s*([^=;\s]+)=([^;]*)/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function parseOutlook(raw) {
  // Outlook[0] = today (has day_high/day_low AND night_high/night_low; the "day"
  // value covers 8AM–8PM today and "night" covers tonight). We use day_high as
  // the PHT-day tmax and night_low as the tmin for today.
  // Outlook[1..5] = extended outlook, each only has day_high/day_low.
  const phTz = (h) => {
    // "now" in Asia/Manila = UTC+8. PHT day boundaries map to UTC 16:00 the
    // previous day through 16:00 the same day. The regional "today" forecast
    // valid from 8AM PHT today to 8AM PHT tomorrow. We align dates to the PHT
    // calendar date of the LOCAL noon for each outlook slot.
    const now = new Date();
    const phtNow = new Date(now.getTime() + 8 * 3600 * 1000);
    const phtDate = new Date(Date.UTC(
      phtNow.getUTCFullYear(), phtNow.getUTCMonth(), phtNow.getUTCDate() + h,
    ));
    return phtDate.toISOString().slice(0, 10);
  };
  const outlook = Array.isArray(raw?.outlook) ? raw.outlook : [];
  const days = [];
  for (let i = 0; i < outlook.length; i++) {
    const o = outlook[i];
    if (!o) continue;
    const date = phTz(i === 0 ? 0 : i);
    const tmax = typeof o.day_high === "number" ? o.day_high : null;
    // For day 0, tonight's low is the overnight low into tomorrow — but PAGASA
    // reports night_low for today; that actually belongs to early tomorrow
    // morning, so use day_low as today's daytime low and map night_low to
    // tomorrow's tmin if available. For simplicity we use day_low for all days.
    const tmin = typeof o.day_low === "number" ? o.day_low : null;
    days.push({
      date, tmax, tmin,
      description: o.day_description || null,
      windSpeed: o.day_wind_speed || null,
      windDirection: o.day_wind_direction || null,
      coastalCondition: o.day_coastal_condition || null,
      icon: o.day_icon || null,
    });
  }
  // The "night_low" of outlook[0] belongs to early morning of the next day.
  // Patch tomorrow's tmin if it is null.
  if (outlook[0] && typeof outlook[0].night_low === "number" && days[1] && days[1].tmin == null) {
    days[1].tmin = outlook[0].night_low;
  }
  return days;
}

/**
 * Build per-location perModel entries from PAGASA (same shape as Open-Meteo
 * perModel entries). Applies to ALL ZN locations because the forecast is
 * province-wide.
 * @param {Object} pagasaResult - from fetchPagasaZn
 * @param {string[]} dates - date axis in 'YYYY-MM-DD' PHT
 * @returns {{available: boolean, perModel: Array<{modelId:string,tmax:number[],tmin:number[],status:string,runInit:string|null}>, error?:string}}
 */
export function pagasaPerModelTraces(pagasaResult, dates) {
  const noop = { available: false, perModel: [], error: pagasaResult?.error || "no result" };
  if (!pagasaResult?.ok || !Array.isArray(pagasaResult.days)) return noop;
  const byDate = {};
  for (const d of pagasaResult.days) byDate[d.date] = d;
  const tmax = dates.map((d) => (typeof byDate[d]?.tmax === "number" ? byDate[d].tmax : null));
  const tmin = dates.map((d) => (typeof byDate[d]?.tmin === "number" ? byDate[d].tmin : null));
  const allNull = tmax.every((v) => v == null) && tmin.every((v) => v == null);
  return {
    available: !allNull,
    issuedAt: pagasaResult.issuedAt,
    provinceName: pagasaResult.provinceName,
    perModel: [{
      modelId: "pagasa_provincial",
      tmax, tmin,
      status: allNull ? "all_null" : "ok",
      runInit: pagasaResult.issuedAt || null,
      attribution: pagasaResult.source,
    }],
    error: allNull ? "all values null" : null,
  };
}

// Expose for tests / pipeline to know which location IDs are covered.
export function pagasaLocationCoverage() {
  return LOCATIONS.map((l) => l.id);
}
