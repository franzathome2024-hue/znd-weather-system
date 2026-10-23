// Open-Meteo Forecast API client.
//
// We request deterministic daily tmax/tmin for all ELIGIBLE VERIFIED models
// (from MODEL_REGISTRY) in one HTTP request per location, using the documented
// &models= multi-model parameter. Open-Meteo returns per-model variables with
// suffix _{modelId}.
//
// Bounded retries, timeouts, and explicit error recording — no silent
// substitution of values.

import { MODEL_API_IDS } from "../models.js";

const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";

/**
 * @param {Object} opts
 * @param {number} opts.lat
 * @param {number} opts.lon
 * @param {number} [opts.days=7]
 * @param {string} [opts.baseUrl]
 * @param {typeof fetch} [opts.fetchFn]
 * @param {number} [opts.timeoutMs=15000]
 * @param {number} [opts.maxRetries=2]
 * @returns {Promise<{ok: boolean, data?: Object, error?: string, latencyMs: number, retries: number}>}
 */
export async function fetchOpenMeteo({
  lat, lon, days = 7,
  baseUrl = OPEN_METEO_BASE,
  fetchFn = globalThis.fetch,
  timeoutMs = 15000,
  maxRetries = 2,
}) {
  const url = new URL(baseUrl);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
  url.searchParams.set("timezone", "Asia/Manila");
  url.searchParams.set("forecast_days", String(days));
  url.searchParams.set("models", MODEL_API_IDS.join(","));
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("windspeed_unit", "kmh");
  // Request past_days=0 explicitly.
  url.searchParams.set("past_days", "0");

  const start = Date.now();
  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchFn(url.toString(), {
        signal: controller.signal,
        headers: { "User-Agent": "znd-weather-system/0.1 (+local)" },
      });
      clearTimeout(to);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        lastErr = `HTTP ${res.status}: ${body.slice(0, 200)}`;
        if (res.status >= 500 && attempt < maxRetries) {
          await sleep(500 * (attempt + 1));
          continue;
        }
        return { ok: false, error: lastErr, latencyMs: Date.now() - start, retries: attempt };
      }
      const data = await res.json();
      if (data.error) {
        return { ok: false, error: `API error: ${data.reason || "unknown"}`, latencyMs: Date.now() - start, retries: attempt };
      }
      return { ok: true, data, latencyMs: Date.now() - start, retries: attempt };
    } catch (e) {
      clearTimeout(to);
      lastErr = e.name === "AbortError" ? `timeout after ${timeoutMs}ms` : e.message || String(e);
      if (attempt < maxRetries) {
        await sleep(700 * (attempt + 1));
        continue;
      }
      return { ok: false, error: lastErr, latencyMs: Date.now() - start, retries: attempt };
    }
  }
  return { ok: false, error: lastErr || "unknown", latencyMs: Date.now() - start, retries: maxRetries };
}

/**
 * Parse a multi-model Open-Meteo daily response into per-model arrays aligned
 * with the returned date axis (local Asia/Manila days).
 * @param {Object} data - parsed JSON
 * @returns {{dates: string[], perModel: Array<{modelId: string, tmax: Array<number|null>, tmin: Array<number|null>, status: string}>}}
 */
export function parseOpenMeteoResponse(data) {
  const daily = data.daily || {};
  const dates = daily.time || [];
  const perModel = [];
  for (const mid of MODEL_API_IDS) {
    const tmaxKey = `temperature_2m_max_${mid}`;
    const tminKey = `temperature_2m_min_${mid}`;
    // When exactly one model is requested (single-model batch), Open-Meteo
    // returns unsuffixed keys; when multi-model are requested it suffixes.
    // We look up both to be safe.
    const tmaxRaw = daily[tmaxKey] ?? (MODEL_API_IDS.length === 1 ? daily["temperature_2m_max"] : undefined);
    const tminRaw = daily[tminKey] ?? (MODEL_API_IDS.length === 1 ? daily["temperature_2m_min"] : undefined);
    if (!tmaxRaw || !tminRaw) {
      perModel.push({ modelId: mid, tmax: dates.map(() => null), tmin: dates.map(() => null), status: "missing_in_response" });
      continue;
    }
    const tmax = tmaxRaw.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));
    const tmin = tminRaw.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));
    const allNull = tmax.every((v) => v === null) && tmin.every((v) => v === null);
    perModel.push({
      modelId: mid,
      tmax, tmin,
      status: allNull ? "all_null" : "ok",
    });
  }
  return { dates, perModel };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
