// Frontend JS for ZND Weather v0.1 — zero-build, vanilla ES2020.
// No framework; Leaflet is loaded from CDN in the HTML.

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  bundle: null,
  locations: null,
  models: null,
  selectedLocId: "dipolog",
  selectedDateIdx: 0,
  variable: "tmax", // 'tmax' | 'tmin'
  map: null,
  markerLayer: null,
};

init().catch((e) => {
  console.error(e);
  $("#bulletinText").textContent = "Error loading: " + (e.message || e);
});

async function init() {
  bindUi();
  await Promise.all([loadMeta(), loadForecast()]);
  initMap();
  render();
}

function bindUi() {
  $("#varSelect").addEventListener("change", (e) => {
    state.variable = e.target.value;
    renderMap();
    renderLegend();
  });
  $("#dateSelect").addEventListener("change", (e) => {
    state.selectedDateIdx = parseInt(e.target.value, 10);
    render();
  });
  $("#locSearch").addEventListener("input", (e) => {
    renderLocList(e.target.value);
  });
  $("#btnRefresh").addEventListener("click", () => loadForecast(true));
  $("#btnBulletin").addEventListener("click", async () => {
    const day = state.selectedDateIdx;
    const r = await fetch(`/api/bulletin?day=${day}`);
    const text = await r.text();
    $("#bulletinText").textContent = text;
  });
}

async function loadMeta() {
  const [locRes, modelRes] = await Promise.all([
    fetch("/api/locations").then((r) => r.json()),
    fetch("/api/models").then((r) => r.json()),
  ]);
  state.locations = locRes.locations;
  state.models = modelRes;
}

async function loadForecast(force = false) {
  const url = force ? "/api/forecast/raw" : "/api/forecast";
  const res = await fetch(url + "?days=7");
  state.bundle = await res.json();
  populateDates();
}

function populateDates() {
  // Find a location with dates
  const sample = (state.bundle.locations || []).find((l) => l.dates && l.dates.length);
  const dates = sample ? sample.dates : [];
  const sel = $("#dateSelect");
  sel.innerHTML = "";
  dates.forEach((d, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    const dt = new Date(d + "T00:00:00+08:00");
    const label = i === 0 ? `${d} (today)` : i === 1 ? `${d} (ugma)` : d;
    opt.textContent = label;
    sel.appendChild(opt);
  });
  state.selectedDateIdx = Math.min(state.selectedDateIdx, dates.length - 1);
  sel.value = String(state.selectedDateIdx);
}

function initMap() {
  if (state.map) return;
  const map = L.map("map", { zoomControl: true, attributionControl: true }).setView([8.15, 122.9], 9);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 13,
    minZoom: 8,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  state.map = map;
  state.markerLayer = L.layerGroup().addTo(map);
}

function render() {
  if (!state.bundle) return;
  renderMeta();
  renderLocList("");
  renderAllTable();
  renderLocDetail();
  renderMap();
  renderLegend();
  renderWarnings();
  renderSources();
  renderBulletin(); // fetch live bulletin text
}

function renderMeta() {
  const b = state.bundle;
  const updated = b.completedAt || b.startedAt;
  $("#lastUpdate").textContent = `Updated: ${formatPST(updated)}${b.fromCache ? " (cached" + (b.stale ? ", STALE" : "") + ")" : ""}`;
  const nModels = (b.models || []).length;
  const ok = b.summary?.successfulLocations ?? 0;
  $("#modelCount").textContent = `${nModels} models · ${ok}/27 locations OK`;
}

function renderWarnings() {
  const b = state.bundle;
  const stale = $("#warnStale");
  stale.classList.toggle("hidden", !b.stale);
  const errs = $("#warnErrors");
  const failCount = b.summary?.failedLocations ?? 0;
  if (failCount > 0) {
    errs.classList.remove("hidden");
    errs.textContent = `⚠ ${failCount} location(s) failed to fetch this run. Last good values (if any) are shown where available.`;
  } else {
    errs.classList.add("hidden");
    errs.textContent = "";
  }
}

function renderLocList(query) {
  const ul = $("#locList");
  ul.innerHTML = "";
  const q = (query || "").trim().toLowerCase();
  const locs = (state.locations || []).filter((l) => !q || l.name.toLowerCase().includes(q));
  // Sort: cities first, then alphabetical.
  locs.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "city" ? -1 : 1));
  const di = state.selectedDateIdx;
  for (const l of locs) {
    const d = getLocationDay(l.id, di);
    const hi = d?.tmax?.consensus;
    const lo = d?.tmin?.consensus;
    const li = document.createElement("li");
    li.className = l.id === state.selectedLocId ? "active" : "";
    li.innerHTML = `<span>${l.name}${l.type === "city" ? " ⋆" : ""}</span><span class="val">${hi != null && lo != null ? `${lo.toFixed(1)}–${hi.toFixed(1)}°C` : "—"}</span>`;
    li.addEventListener("click", () => {
      state.selectedLocId = l.id;
      render();
    });
    ul.appendChild(li);
  }
}

function renderAllTable() {
  const tbody = $("#allTable tbody");
  tbody.innerHTML = "";
  const di = state.selectedDateIdx;
  const locs = [...(state.locations || [])].sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "city" ? -1 : 1));
  for (const l of locs) {
    const d = getLocationDay(l.id, di);
    const tr = document.createElement("tr");
    if (l.id === state.selectedLocId) tr.classList.add("selected");
    if (!d || d.n_contributing === 0) tr.classList.add("missing");
    const hi = d?.tmax?.consensus;
    const lo = d?.tmin?.consensus;
    tr.innerHTML = `
      <td>${l.name}${l.type === "city" ? " ⋆" : ""}</td>
      <td class="num">${lo != null ? lo.toFixed(1) : "—"}</td>
      <td class="num">${hi != null ? hi.toFixed(1) : "—"}</td>
      <td class="num">${d?.n_contributing ?? 0}</td>
      <td class="num">${d?.spread_c != null ? "±" + d.spread_c.toFixed(1) : "—"}</td>`;
    tr.addEventListener("click", () => { state.selectedLocId = l.id; render(); });
    tbody.appendChild(tr);
  }
}

function renderLocDetail() {
  const di = state.selectedDateIdx;
  const loc = (state.locations || []).find((l) => l.id === state.selectedLocId);
  const d = getLocationDay(state.selectedLocId, di);
  const el = $("#locDetail");
  if (!loc) { el.innerHTML = ""; return; }
  if (!d || d.n_contributing === 0) {
    el.innerHTML = `<h3>${loc.name}</h3><p class="muted small">Walay datos alang niining petsa.</p>`;
    $("#modelTable tbody").innerHTML = "";
    return;
  }
  const date = d.date;
  const hi = d.tmax.consensus;
  const lo = d.tmin.consensus;
  const n = d.n_contributing;
  const spread = d.spread_c;
  el.innerHTML = `
    <h3>${loc.name}${loc.type === "city" ? " ⋆" : ""}</h3>
    <div class="subline">${date} · ${n} models · spread ±${spread != null ? spread.toFixed(1) : "—"}°C</div>
    <div class="big-temps">
      <div><span class="lbl">Low</span><span class="t lo">${lo != null ? lo.toFixed(1) : "—"}°</span></div>
      <div><span class="lbl">High</span><span class="t hi">${hi != null ? hi.toFixed(1) : "—"}°</span></div>
    </div>`;

  // Model table
  const tbody = $("#modelTable tbody");
  tbody.innerHTML = "";
  for (const m of (state.bundle.models || [])) {
    const tmax = d.tmax.valuesByModel?.[m.id];
    const tmin = d.tmin.valuesByModel?.[m.id];
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${m.label}</td><td class="num ${tmax==null?'null':''}">${tmax!=null?tmax.toFixed(1):"—"}</td><td class="num ${tmin==null?'null':''}">${tmin!=null?tmin.toFixed(1):"—"}</td>`;
    tbody.appendChild(tr);
  }
}

function renderMap() {
  if (!state.map || !state.markerLayer) return;
  state.markerLayer.clearLayers();
  const di = state.selectedDateIdx;
  const values = [];
  const markers = [];
  for (const l of state.locations || []) {
    const d = getLocationDay(l.id, di);
    const v = state.variable === "tmax" ? d?.tmax?.consensus : d?.tmin?.consensus;
    if (typeof v === "number") { values.push(v); }
    markers.push({ l, d, v });
  }
  const [lo, hi] = values.length ? [Math.min(...values), Math.max(...values)] : [22, 35];
  for (const { l, d, v } of markers) {
    const color = tempColor(v, lo, hi);
    const other = state.variable === "tmax" ? d?.tmin?.consensus : d?.tmax?.consensus;
    const vLbl = v == null ? "—" : v.toFixed(1);
    const oLbl = other == null ? "—" : other.toFixed(1);
    const html = `<div class="temp-marker" style="border-color:${color}">
      <b>${l.name}</b><br>
      <span class="lo">L ${oLbl}°</span> · <span class="hi">H ${vLbl}°</span>
    </div>`;
    const icon = L.divIcon({ className: "", html, iconSize: null, iconAnchor: [0, 0] });
    const m = L.marker([l.lat, l.lon], { icon });
    m.bindPopup(`<b>${l.name}</b><br>${d?.date ?? ""}<br>Low ${other!=null?other.toFixed(1):"—"}° / High ${v!=null?v.toFixed(1):"—"}°<br>${d?.n_contributing ?? 0} models`);
    m.on("click", () => { state.selectedLocId = l.id; renderLocDetail(); renderAllTable(); renderLocList($("#locSearch").value); });
    m.addTo(state.markerLayer);
  }
  // Fit to province bounds when first render
  if (!state._fitOnce) {
    state.map.fitBounds([[7.2, 122.0],[8.8,123.7]], { padding: [20,20] });
    state._fitOnce = true;
  }
}

function renderLegend() {
  const el = $("#mapLegend");
  if (!state.bundle) { el.innerHTML = ""; return; }
  const di = state.selectedDateIdx;
  const vals = [];
  for (const l of state.locations || []) {
    const d = getLocationDay(l.id, di);
    const v = state.variable === "tmax" ? d?.tmax?.consensus : d?.tmin?.consensus;
    if (typeof v === "number") vals.push(v);
  }
  if (!vals.length) { el.innerHTML = "<span>No data</span>"; return; }
  const lo = Math.min(...vals), hi = Math.max(...vals);
  el.innerHTML = `<span>${state.variable === "tmax" ? "HIGH" : "LOW"} (°C)</span>
    <div>
      <div class="bar" style="background:linear-gradient(to right,${tempColor(lo,lo,hi)},${tempColor((lo+hi)/2,lo,hi)},${tempColor(hi,lo,hi)})"></div>
      <div class="labels"><span>${lo.toFixed(1)}</span><span>${((lo+hi)/2).toFixed(1)}</span><span>${hi.toFixed(1)}</span></div>
    </div>`;
}

function renderSources() {
  const m = state.models || { implemented: [], unavailable: [] };
  const lines = [];
  lines.push(`<b>${m.implemented?.length || 0} models implemented via Open-Meteo CC-BY 4.0 (non-commercial):</b>`);
  lines.push("<ul>");
  for (const im of (m.implemented || [])) lines.push(`<li>${im.label} — ${im.centre} (~${im.nativeResKm} km)</li>`);
  lines.push("</ul>");
  if (m.unavailable?.length) {
    lines.push(`<b>${m.unavailable.length} target models unavailable in v0.1:</b><ul>`);
    for (const u of m.unavailable) lines.push(`<li><b>${u.label}</b> — ${u.reason}</li>`);
    lines.push("</ul>");
  }
  lines.push(`<div>${m.attribution || ""}</div>`);
  $("#sourceBlock").innerHTML = lines.join("");
}

async function renderBulletin() {
  const day = state.selectedDateIdx;
  try {
    const r = await fetch(`/api/bulletin?day=${day}`);
    if (r.ok) {
      $("#bulletinText").textContent = await r.text();
    } else {
      $("#bulletinText").textContent = "(Bulletin unavailable — " + r.status + ")";
    }
  } catch (e) {
    $("#bulletinText").textContent = "(Bulletin unavailable — " + e.message + ")";
  }
}

function getLocationDay(locId, dayIdx) {
  const b = state.bundle;
  const loc = (b?.locations || []).find((l) => l.locationId === locId);
  if (!loc || !loc.days) return null;
  return loc.days[dayIdx] || null;
}

function tempColor(t, lo, hi) {
  if (typeof t !== "number") return "#555";
  const range = Math.max(hi - lo, 0.5);
  const x = Math.max(0, Math.min(1, (t - lo) / range));
  // Cool (blue) -> mid (teal) -> warm (amber) -> hot (red)
  const stops = [
    [0.00, [79, 195, 247]],   // blue (cool)
    [0.45, [129, 199, 132]],  // green
    [0.70, [255, 183, 77]],   // amber
    [1.00, [239, 83, 80]],    // red
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [s0, c0] = stops[i], [s1, c1] = stops[i+1];
    if (x >= s0 && x <= s1) {
      const k = (x - s0) / (s1 - s0);
      const r = Math.round(c0[0] + (c1[0]-c0[0])*k);
      const g = Math.round(c0[1] + (c1[1]-c0[1])*k);
      const b = Math.round(c0[2] + (c1[2]-c0[2])*k);
      return `rgb(${r},${g},${b})`;
    }
  }
  return "rgb(239,83,80)";
}

function formatPST(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  d.setUTCHours(d.getUTCHours() + 8);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} PST`;
}
