// Bisaya / Cebuano weather bulletin generator.
//
// Produces a plain-text, low-data Facebook-ready bulletin in natural, locally
// understandable Bisaya, using ONLY the numerical data present in the
// aggregated forecast bundle.  We do NOT invent rain probabilities, storm
// names, or hazard claims beyond what the data supports. Temperature range is
// reported because that is the primary consensus output of v0.1.
//
// Style inspiration: concise Dipolog radio-news-style FB posts (we do NOT copy
// any station's branding, intros, or proprietary catchphrases).

import { LOCATIONS, LOCATION_BY_ID } from "../locations.js";
import { IMPLEMENTED_MODELS, MODEL_REGISTRY } from "../models.js";
const MODELS = IMPLEMENTED_MODELS;

const WEEKDAY_CEB = {
  0: "Domingo", 1: "Lunes", 2: "Martes", 3: "Miyerkules",
  4: "Huwebes", 5: "Biyernes", 6: "Sabado",
};

const MONTH_CEB = {
  1: "Enero", 2: "Pebrero", 3: "Marso", 4: "Abril", 5: "Mayo", 6: "Hunyo",
  7: "Hulyo", 8: "Agosto", 9: "Setyembre", 10: "Oktubre", 11: "Nobyembre", 12: "Disyembre",
};

/**
 * @param {Object} bundle - output of pipeline.runPipeline()
 * @param {number} [dayIndex=0] - which local-day forecast to turn into a bulletin
 *                                (0 = the current local day in Asia/Manila)
 */
export function generateBisayaBulletin(bundle, dayIndex = 0) {
  const lines = [];
  lines.push("PANAHON KARONG ADLAWA | ZAMBOANGA DEL NORTE");
  lines.push("");

  const date = pickDate(bundle, dayIndex);
  const dateObj = parseDateInManila(date);
  const weekday = WEEKDAY_CEB[dateObj.getDay()];
  const month = MONTH_CEB[dateObj.getMonth() + 1];
  lines.push(`${weekday}, ${dateObj.getDate()} ${month} ${dateObj.getFullYear()}  (PST / GMT+8)`);
  lines.push("");

  const rows = LOCATIONS.map((loc) => {
    const locData = bundle.locations.find((l) => l.locationId === loc.id);
    if (!locData || !locData.days || !locData.days[dayIndex]) {
      return { loc, tmax: null, tmin: null, n: 0, spread: null, status: "missing" };
    }
    const d = locData.days[dayIndex];
    return {
      loc,
      tmax: d.tmax?.consensus ?? null,
      tmin: d.tmin?.consensus ?? null,
      n: d.n_contributing,
      spread: d.spread_c,
      status: d.qc_status,
    };
  });

  // Provincial summary stats (numeric, honest)
  const validTmax = rows.map((r) => r.tmax).filter((v) => typeof v === "number");
  const validTmin = rows.map((r) => r.tmin).filter((v) => typeof v === "number");
  const provinceHi = validTmax.length ? Math.max(...validTmax) : null;
  const provinceLo = validTmin.length ? Math.min(...validTmin) : null;
  const avgHi = validTmax.length ? (validTmax.reduce((a, b) => a + b, 0) / validTmax.length) : null;
  const avgLo = validTmin.length ? (validTmin.reduce((a, b) => a + b, 0) / validTmin.length) : null;
  const nAvailable = rows.filter((r) => r.tmax != null && r.tmin != null).length;
  const nFailed = rows.length - nAvailable;

  // Honest, short summary. We deliberately do not invent rain chances —
  // v0.1 consensus is temperature-only.
  lines.push(summarySentence({ provinceHi, provinceLo, avgHi, avgLo, nAvailable, nFailed, rows }));
  lines.push("");

  // Key cities first
  lines.push("MGA DAKBAYAN:");
  for (const locId of ["dipolog", "dapitan"]) {
    const r = rows.find((x) => x.loc.id === locId);
    lines.push(formatRow(r));
  }
  lines.push("");

  lines.push("MGA MUNICIPALIDAD:");
  const municRows = rows.filter((r) => r.loc.type === "municipality");
  // Sort municipalities alphabetically by display name for reader-friendliness
  municRows.sort((a, b) => a.loc.name.localeCompare(b.loc.name));
  for (const r of municRows) {
    lines.push(formatRow(r));
  }
  lines.push("");

  // Provincial pattern paragraph
  lines.push(patternParagraph({ rows, provinceHi, provinceLo, avgHi, avgLo, date }));
  lines.push("");

  // Source / attribution block
  const nModels = MODELS.length;
  const lastUpdate = formatPST(bundle.completedAt || bundle.startedAt);
  lines.push(`— Mga modelo: ${nModels} ka global weather models (${MODELS.map(m => m.label.split(" ")[0]).slice(0, 4).join(", ")} ...). Konsenso: median sa tanang modelo.`);
  lines.push(`— Forecast valid date: ${date} (Asia/Manila). Kataposang update: ${lastUpdate}.`);
  lines.push(`— Mga lokasyon nga adunay datos: ${nAvailable}/27.`);
  lines.push(`— Tinubdan: ${modeAttribution()}.`);
  lines.push("");
  lines.push("Pahinumdom: Ang forecast mahimong mausab. Alang sa opisyal nga mga pahibalo ug mga pasidaag sa panahon, sunda kanunay ang DOST-PAGASA.");
  lines.push("");
  lines.push(`[${bundle.version}]`);

  return lines.join("\n");
}

function pickDate(bundle, dayIndex) {
  // Pick date from first location that has days array.
  for (const loc of bundle.locations || []) {
    if (loc.dates && loc.dates[dayIndex]) return loc.dates[dayIndex];
  }
  // Fallback: current PST date.
  const now = new Date();
  now.setUTCHours(now.getUTCHours() + 8);
  return now.toISOString().slice(0, 10);
}

function parseDateInManila(dateStr) {
  // dateStr is an ISO date (YYYY-MM-DD) in Asia/Manila local day.
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}

function formatPST(iso) {
  const d = new Date(iso);
  d.setUTCHours(d.getUTCHours() + 8); // PST = UTC+8 display
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} PST`;
}

function formatRow(r) {
  if (r.status === "missing" || r.tmax == null || r.tmin == null) {
    return `• ${r.loc.name}: — walay datos sa pagkakaron`;
  }
  return `• ${r.loc.name}: ${r.tmin.toFixed(1)}°C – ${r.tmax.toFixed(1)}°C`;
}

function summarySentence({ provinceHi, provinceLo, avgHi, avgLo, nAvailable, nFailed }) {
  const parts = [];
  if (avgHi != null && avgLo != null) {
    parts.push(`Sa tibuok Zamboanga del Norte, ang gipaabot nga temperatura karong adlawa kay mga ${avgLo.toFixed(0)}°C hangtod ${avgHi.toFixed(0)}°C`);
  }
  if (provinceHi != null && provinceLo != null) {
    parts.push(`(kinabugnawan ${provinceLo.toFixed(1)}°C, kinainitan ${provinceHi.toFixed(1)}°C sa mga sentro sa lungsod)`);
  }
  if (nFailed > 0) {
    parts.push(`(Adunay ${nFailed} ka lungsod nga wala pa'y kompletong datos sa pagkakaron.)`);
  }
  parts.push("Ang mga numero mao ang konsenso gikan sa daghang global weather models.");
  return parts.join(" ") + " ";
}

function patternParagraph({ rows, provinceHi, provinceLo, avgHi, avgLo }) {
  // Simple qualitative pattern from data — no invention.
  // Classify: init kaayo (avg high >= 33), init (31-33), kasarangan (<31).
  let feel = "kasarangan ngadto sa init";
  if (avgHi >= 34) feel = "init kaayo";
  else if (avgHi >= 32) feel = "init";
  else if (avgHi <= 29) feel = "bugnaw-kasarangan";

  const spreads = rows.map((r) => r.spread).filter((s) => typeof s === "number");
  const maxSpread = spreads.length ? Math.max(...spreads) : 0;

  let agreement = "Nagkasinabot ang mga modelo sa kinatibuk-ang temperatura.";
  if (maxSpread >= 6) agreement = "Adunay dakong dili-pagkasinabot ang mga modelo sa pipila ka lungsod — tan-awa ang indibidwal nga numero alang sa tino-tino nga banabana.";
  else if (maxSpread >= 3.5) agreement = "Adunay gamay nga kalainan ang mga modelo sa pila ka lugar; ang gipakita dinhi mao ang sentrong banabana.";

  // Find the location with the highest expected hi and lowest lo for the
  // "hottest/coolest" callout — purely from data, no inference about why.
  const hottest = rows.filter((r) => r.tmax != null).sort((a, b) => b.tmax - a.tmax)[0];
  const coolest = rows.filter((r) => r.tmin != null).sort((a, b) => a.tmin - b.tmin)[0];

  const l = [];
  l.push(`Mubo nga hulagway: Sa ${feel} nga kahimtang ang probinsya, base sa konsenso sa mga modelo.`);
  if (hottest) l.push(`Ang kinainitang banabana sa sentro sa lungsod naa sa ${hottest.loc.name} (${hottest.tmax.toFixed(1)}°C).`);
  if (coolest) l.push(`Ang kinabugnawang banabana sa sayo sa buntag naa sa ${coolest.loc.name} (${coolest.tmin.toFixed(1)}°C).`);
  l.push(agreement);
  return l.join(" ");
}

function modeAttribution() {
  return "Open-Meteo.com (CC-BY 4.0), nga naghatag og datos gikan sa ECMWF, DWD ICON, NCEP GFS, UKMO, Météo-France ARPEGE, ECCC GEM, JMA GSM, ug uban pang global centers";
}
