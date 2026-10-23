// ZND Weather v0.1 frontend — MapLibre GL JS, vanilla ES2020, no build step.
// Uses a locally generated Voronoi-approximation GeoJSON (NOT official admin
// boundaries — for visualization only) for choropleth rendering; OSM raster
// tiles for basemap. Mapbox is not used; no Mapbox tokens required. If the
// GeoJSON fails to load or MapLibre fails to initialize, the app falls back
// to table/text/bulletin views.

const $ = (sel) => document.querySelector(sel);

const state = {
  bundle: null,
  locations: null,
  models: null,
  geo: null,
  selectedLocId: "dipolog",
  selectedDateIdx: 0,
  variable: "tmax", // 'tmax' | 'tmin' | 'agreement'
  map: null,
  hoverLocId: null,
  // National ECMWF temperature overlay state
  view: "national", // 'national' | 'zamboanga'
  overlayReady: false,
  overlayError: null,
  overlaySourceId: "om-temp",
  overlayLayerId: "om-temp-layer",
};

init().catch((e) => {
  console.error(e);
  $("#bulletinText").textContent = "Error loading: " + (e.message || e);
});

async function init() {
  bindUi();
  await Promise.all([loadMeta(), loadGeo(), loadForecast()]);
  try { initMap(); }
  catch (e) {
    console.warn("Map failed to initialize — table/bulletin views remain available:", e.message);
    const mapEl = document.getElementById("map");
    if (mapEl) mapEl.innerHTML = '<div style="padding:24px;color:#555;font-family:sans-serif;text-align:center">Mapa dili available karon. Gamita ang table/list ug bulletin sa ubos.</div>';
  }
  render();
}

function bindUi() {
  $("#mapViewSelect").addEventListener("change", (e) => {
    state.view = e.target.value;
    applyViewMode();
    renderMap();
    renderLegend();
    flyToView();
  });
  $("#varSelect").addEventListener("change", (e) => {
    state.variable = e.target.value;
    syncOverlayTimeOptions();
    renderMap();
    renderLegend();
  });
  $("#overlayTimeSelect").addEventListener("change", () => { renderMap(); renderLegend(); });
  $("#dateSelect").addEventListener("change", (e) => {
    state.selectedDateIdx = parseInt(e.target.value, 10);
    syncOverlayTimeOptions();
    render();
  });
  $("#locSearch").addEventListener("input", (e) => renderLocList(e.target.value));
  $("#btnRefresh").addEventListener("click", () => loadForecast(true));
  $("#btnBulletin").addEventListener("click", renderBulletin);
}

async function loadMeta() {
  const [locRes, modelRes] = await Promise.all([
    fetch("/api/locations").then((r) => r.json()),
    fetch("/api/models").then((r) => r.json()),
  ]);
  state.locations = locRes.locations;
  state.models = modelRes;
}

async function loadGeo() {
  // Try the license-safe Voronoi approximation first; fall back to empty and
  // rely on the table/bulletin views if anything fails.
  const candidates = [
    "/data/zamboanga_del_norte_approx.geojson",
    "/data/zamboanga_del_norte_municipalities.geojson",
  ];
  for (const url of candidates) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        const geo = await r.json();
        if (geo && geo.features && geo.features.length) { state.geo = geo; return; }
      }
    } catch (e) {
      console.warn("Geo load failed for", url, e.message);
    }
  }
  state.geo = null;
  console.warn("Municipal boundaries unavailable — using table/bulletin fallback.");
}

async function loadForecast(force = false) {
  const url = force ? "/api/forecast/raw" : "/api/forecast";
  state.bundle = await fetch(url + "?days=7").then((r) => r.json());
  populateDates();
}

function populateDates() {
  const sample = (state.bundle.locations || []).find((l) => l.dates && l.dates.length);
  const dates = sample ? sample.dates : [];
  const sel = $("#dateSelect");
  sel.innerHTML = "";
  dates.forEach((d, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    const dt = new Date(d + "T00:00:00+08:00");
    const label = i === 0 ? `${d} (karon)` : i === 1 ? `${d} (ugma)` : d;
    opt.textContent = label;
    sel.appendChild(opt);
  });
  state.selectedDateIdx = Math.min(state.selectedDateIdx, dates.length - 1);
  sel.value = String(state.selectedDateIdx);
}

function initMap() {
  if (state.map) return;
  const map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        },
      },
      layers: [
        { id: "osm", type: "raster", source: "osm" },
      ],
    },
    center: [122.85, 8.1],
    zoom: 8,
    minZoom: 7,
    maxZoom: 12,
    attributionControl: true,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }), "top-right");
  state.map = map;

  // Use a single 'style.load' handler and guard it with a flag so style
  // reloads (e.g. setStyle later) never double-register sources/layers.
  // MapLibre fires 'style.load' once for the initial style and again for
  // any future style.setStyle / style import; the second firing would
  // otherwise throw "Source with id 'municipalities' already exists."
  let mapLayersInstalled = false;
  const installOverlay = () => {
    if (mapLayersInstalled) return;
    // If the style hasn't finished loading yet (e.g. 'styledataloading' is
    // in progress), wait for the next idle.
    if (!map.isStyleLoaded()) {
      map.once("idle", installOverlay);
      return;
    }
    mapLayersInstalled = true;
    addMunicipalities();
    addNationalOverlay();
    applyViewMode();
    flyToView();
    // Always render point markers even without polygons
    renderMap();
  };

  function addMunicipalities() {
    if (!state.geo) return;
    // Guard against duplicate source/layer registration on style reload.
    if (!map.getSource("municipalities")) {
      map.addSource("municipalities", { type: "geojson", data: state.geo, generateId: false });
    }
    if (!map.getLayer("muni-fill")) {
      map.addLayer({
        id: "muni-fill",
        type: "fill",
        source: "municipalities",
        paint: {
          "fill-color": ["get", "fillColor"],
          // Translucent choropleth so the basemap labels/roads remain visible
          // underneath while temperature colors are still readable.
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false], 0.75,
            0.55,
          ],
          "fill-outline-color": "rgba(0,0,0,0.15)",
        },
      });
    }
    if (!map.getLayer("muni-line")) {
      map.addLayer({
        id: "muni-line",
        type: "line",
        source: "municipalities",
        paint: { "line-color": "rgba(0,0,0,0.55)", "line-width": 0.75, "line-opacity": 0.75 },
      });
    }
    map.on("click", "muni-fill", (e) => {
      const fid = e.features?.[0]?.properties?.id;
      if (fid) { state.selectedLocId = fid; render(); }
    });
    map.on("mousemove", "muni-fill", (e) => {
      const fid = e.features?.[0]?.properties?.id;
      if (fid && fid !== state.hoverLocId) {
        if (state.hoverLocId) map.setFeatureState(
          { source: "municipalities", id: featureIdByLoc(state.hoverLocId) },
          { hover: false }
        );
        state.hoverLocId = fid;
        map.setFeatureState(
          { source: "municipalities", id: featureIdByLoc(fid) },
          { hover: true }
        );
        map.getCanvas().style.cursor = "pointer";
        const loc = state.locations?.find(l => l.id === fid);
        const d = getLocationDay(fid, state.selectedDateIdx);
        if (loc && d) {
          const hi = d.tmax?.consensus; const lo = d.tmin?.consensus;
          showPopup(loc, hi, lo, e.lngLat);
        }
      }
    });
    map.on("mouseleave", "muni-fill", () => {
      if (state.hoverLocId) {
        map.setFeatureState(
          { source: "municipalities", id: featureIdByLoc(state.hoverLocId) },
          { hover: false }
        );
      }
      state.hoverLocId = null;
      map.getCanvas().style.cursor = "";
      if (state.popup) { state.popup.remove(); state.popup = null; }
    });

    // Defer initial extent to flyToView() which respects state.view (national
    // vs Zamboanga LGU extent).
  }

  // If a style reload occurs (e.g. future style swap), reset the flag so we
  // re-attach sources/layers to the new style.
  map.on("style.load", () => {
    mapLayersInstalled = false;
    installOverlay();
  });
  // Install on the initial load too.
  map.on("load", installOverlay);
}

// Compute [SW, NE] bounds [[minLon,minLat],[maxLon,maxLat]] for a GeoJSON.
function geoBounds(gj) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  let has = false;
  (function walk(g) {
    if (!g) return;
    if (Array.isArray(g)) {
      if (typeof g[0] === "number" && g.length >= 2) {
        const [lon, lat] = g;
        if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
        has = true;
      } else { g.forEach(walk); }
    } else if (g.type === "FeatureCollection") g.features.forEach(walk);
    else if (g.type === "Feature") walk(g.geometry);
    else if (g.coordinates) walk(g.coordinates);
  })(gj);
  return has ? [[minLon, minLat], [maxLon, maxLat]] : null;
}

let _featureIndex = null;
function featureIdByLoc(locId) {
  if (!_featureIndex && state.geo) {
    _featureIndex = {};
    state.geo.features.forEach((f, i) => { _featureIndex[f.properties.id] = i; });
  }
  return _featureIndex ? _featureIndex[locId] : null;
}

function showPopup(loc, hi, lo, lngLat) {
  if (!state.popup) state.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
  const html = `<b>${loc.name}</b><br>L ${lo!=null?lo.toFixed(1):"—"}° · H ${hi!=null?hi.toFixed(1):"—"}°<br><span style="font-size:10px;color:#999">${dFor(loc)||""}</span>`;
  state.popup.setLngLat(lngLat).setHTML(html).addTo(state.map);
}

function dFor(locId) {
  const d = getLocationDay(locId, state.selectedDateIdx);
  return d ? d.date : "";
}

// --- National PH temperature overlay (ECMWF IFS via Open-Meteo weather-map-layer) ---
const PH_EXTENT = [[116.5, 4.3], [127.0, 21.2]]; // [SW, NE] — Luzon+VisMin+Tawi-Tawi+Batanes

function addNationalOverlay() {
  const map = state.map;
  if (!map) return;
  // The omOverlay module sets up window.omOverlay via app-om.js. If it hasn't
  // finished (e.g. slow fetch of latest.json), retry shortly.
  const om = window.omOverlay;
  if (!om || !om.state.ready) {
    if (om && om.state.error) {
      state.overlayError = om.state.error;
      showOverlayWarn(`National overlay unavailable: ${om.state.error}`);
    } else {
      setTimeout(addNationalOverlay, 250);
    }
    return;
  }
  state.overlayReady = true;
  state.overlayError = null;
  hideOverlayWarn();
  syncOverlayTimeOptions();
  // Source/layer are added on demand (renderMap); re-apply view mode in case
  // it was toggled before the overlay was ready.
  applyViewMode();
}

function showOverlayWarn(msg) {
  const el = $("#warnOverlay");
  if (!el) return;
  el.textContent = "⚠ " + msg;
  el.classList.remove("hidden");
}
function hideOverlayWarn() {
  const el = $("#warnOverlay");
  if (el) { el.classList.add("hidden"); el.textContent = ""; }
}

// Map the UI variable (tmax/tmin/agreement) to the underlying Open-Meteo
// variable key. The 'agreement' spread map is NOT available on the national
// overlay (we have no model-by-model grid); we fall back to tmax but render
// the national layer at low opacity and still show the Zamboanga detail.
function omVariableFor(uiVar) {
  if (uiVar === "tmin") return "temperature_2m_min";
  return "temperature_2m_max";
}

function syncOverlayTimeOptions() {
  const om = window.omOverlay;
  const omState = om?.state;
  const sel = $("#overlayTimeSelect");
  const metaEl = $("#overlayMeta");
  const ctrl = $("#overlayCtrl");
  if (!omState?.ready || !sel || !ctrl) return;
  ctrl.hidden = state.view !== "national";
  if (state.view !== "national") return;
  const varKey = omVariableFor(state.variable);
  const meta = omState.meta.vars[varKey];
  if (!meta || !meta.validTimes.length) {
    sel.innerHTML = "";
    if (metaEl) metaEl.textContent = `No valid times for ${varKey}.`;
    return;
  }
  // Build list of available valid times. If the user is on the LGU daily
  // picker, default to the best matching day frame.
  sel.innerHTML = "";
  const di = state.selectedDateIdx;
  const sample = (state.bundle?.locations || []).find((l) => l.dates?.[di]);
  const phDate = sample?.dates?.[di] || new Date().toISOString().slice(0,10);
  const auto = om.pickValidTime(state.variable, phDate, meta.validTimes);
  meta.validTimes.forEach((vt) => {
    const opt = document.createElement("option");
    opt.value = vt;
    // Display in Philippine Time (UTC+8)
    const d = new Date(vt);
    const pht = new Date(d.getTime() + 8*3600*1000);
    const pad = (n) => String(n).padStart(2,"0");
    opt.textContent = `${pht.getUTCFullYear()}-${pad(pht.getUTCMonth()+1)}-${pad(pht.getUTCDate())} ${pad(pht.getUTCHours())}:${pad(pht.getUTCMinutes())} PHT`;
    sel.appendChild(opt);
  });
  if (auto) sel.value = auto; else sel.selectedIndex = 0;
  if (metaEl) {
    const ref = meta.reference_time ? `ref ${meta.reference_time.replace("Z"," UTC")}` : "";
    metaEl.textContent = `ECMWF IFS ~9 km · ${ref} · ${meta.validTimes.length} frame${meta.validTimes.length===1?"":"s"} · bilinear display`;
  }
}

function installOrUpdateOmSource() {
  const map = state.map;
  const om = window.omOverlay;
  if (!map || !om?.state?.ready) return;
  const varKey = omVariableFor(state.variable);
  const validTime = $("#overlayTimeSelect")?.value || null;
  const srcId = state.overlaySourceId;
  const layerId = state.overlayLayerId;
  let src;
  try {
    src = om.buildSource(varKey, validTime);
  } catch (e) {
    console.warn("om buildSource failed:", e);
    showOverlayWarn("Could not build national overlay source: " + e.message);
    return;
  }
  // MapLibre custom sources are added via map.addSource with type:'custom'.
  // createRasterSource already returns the source config (type:'custom',
  // loadTile, etc.). If the source already exists we have to remove+re-add —
  // MapLibre doesn't allow re-setting a custom source.
  if (map.getSource(srcId)) {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    map.removeSource(srcId);
  }
  try {
    map.addSource(srcId, src);
  } catch (e) {
    console.warn("om addSource failed:", e);
    showOverlayWarn("National overlay layer failed: " + e.message);
    return;
  }
  if (!map.getLayer(layerId)) {
    map.addLayer({
      id: layerId,
      type: "raster",
      source: srcId,
      paint: {
        "raster-opacity": 0.6,
        "raster-fade-duration": 250,
        // Resampling handled by the library (returns ImageBitmap from native
        // grid); 'linear' here gives bilinear upscale on map zoom-in.
        "raster-resampling": "linear",
      },
    },
    // Insert above basemap but below municipal polygons so click/hover on
    // Zamboanga LGUs still works when toggled to zamboanga view.
    state.geo && map.getLayer("muni-fill") ? "muni-fill" : undefined);
  }
}

function removeOmSource() {
  const map = state.map;
  if (!map) return;
  if (map.getLayer(state.overlayLayerId)) map.removeLayer(state.overlayLayerId);
  if (map.getSource(state.overlaySourceId)) map.removeSource(state.overlaySourceId);
}

function applyViewMode() {
  const map = state.map;
  if (!map) return;
  const isNational = state.view === "national";
  // Municipal choropleth hidden (fill+line) in national mode; outline only
  // selected remains. Toggle visibility to preserve feature state.
  const toggle = (id, vis) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
  };
  toggle("muni-fill", isNational ? "none" : "visible");
  toggle("muni-line", isNational ? "none" : "visible");
  toggle("centers-sym", isNational ? "none" : "visible");
  toggle("selected-line", isNational ? "none" : "visible");
  // National overlay is only installed when in national view (saves
  // bandwidth/WASM work while user is in LGU view).
  if (isNational) {
    installOrUpdateOmSource();
  } else {
    removeOmSource();
  }
  syncOverlayTimeOptions();
  $("#overlayCtrl") && ($("#overlayCtrl").hidden = !isNational);
}

function flyToView() {
  const map = state.map;
  if (!map) return;
  if (state.view === "national") {
    map.fitBounds(PH_EXTENT, { padding: 24, duration: 500, maxZoom: 7 });
  } else {
    const bbox = state.geo ? geoBounds(state.geo) : null;
    if (bbox) map.fitBounds(bbox, { padding: 16, duration: 500, maxZoom: 9.5 });
    else map.flyTo({ center: [122.85, 8.1], zoom: 8, duration: 500 });
  }
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
  renderFeedCounts();
  renderBulletin();
}

function renderMeta() {
  const b = state.bundle;
  const updated = b.completedAt || b.startedAt;
  $("#lastUpdate").textContent = `Updated: ${formatPHTime(updated)}${b.fromCache ? " (cached" + (b.stale ? ", STALE" : "") + ")" : ""}`;
  // Count eligible/verified models from bundle
  const nModels = (b.models || []).length;
  const ok = b.summary?.successfulLocations ?? 0;
  $("#modelCount").textContent = `${nModels} eligible models · ${ok}/27 OK`;
}

function renderFeedCounts() {
  const m = state.models || {};
  const fc = m.feedCounts || {};
  const di = state.selectedDateIdx;
  // Count average independent contributors for today
  let avgN = 0, tot = 0;
  for (const l of state.bundle.locations || []) {
    const d = l.days?.[di];
    if (d && d.n_contributing) { avgN += d.n_contributing; tot++; }
  }
  avgN = tot ? (avgN / tot) : 0;
  $("#feedCounts").textContent =
    `Configured feeds: ${fc.configured ?? "?"} · Verified eligible: ${fc.verifiedEligible ?? "?"} · Independent contributors/day: ~${avgN.toFixed(1)} (after alias de-dup)`;
}

function renderWarnings() {
  const b = state.bundle;
  $("#warnStale").classList.toggle("hidden", !b.stale);
  const errs = $("#warnErrors");
  const failCount = b.summary?.failedLocations ?? 0;
  if (failCount > 0) {
    errs.classList.remove("hidden");
    errs.textContent = `⚠ ${failCount} location(s) failed to fetch this run. Last good values shown where available.`;
  } else {
    errs.classList.add("hidden"); errs.textContent = "";
  }
}

function renderLocList(query) {
  const ul = $("#locList");
  ul.innerHTML = "";
  const q = (query || "").trim().toLowerCase();
  const locs = (state.locations || []).filter((l) => !q || l.name.toLowerCase().includes(q));
  locs.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "city" ? -1 : 1));
  const di = state.selectedDateIdx;
  for (const l of locs) {
    const d = getLocationDay(l.id, di);
    const hi = d?.tmax?.consensus;
    const lo = d?.tmin?.consensus;
    const li = document.createElement("li");
    if (l.id === state.selectedLocId) li.classList.add("active");
    li.innerHTML = `<span>${l.name}${l.type === "city" ? " ⋆" : ""}</span><span class="val">${hi != null && lo != null ? `${lo.toFixed(1)}–${hi.toFixed(1)}°C` : "—"}</span>`;
    li.addEventListener("click", () => { state.selectedLocId = l.id; render(); flyTo(l.id); });
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
    const hi = d?.tmax?.consensus, lo = d?.tmin?.consensus;
    tr.innerHTML = `
      <td>${l.name}${l.type === "city" ? " ⋆" : ""}</td>
      <td class="num">${lo != null ? `${lo.toFixed(1)} <span class="muted small">(${d.tmin.n})</span>` : "—"}</td>
      <td class="num">${hi != null ? `${hi.toFixed(1)} <span class="muted small">(${d.tmax.n})</span>` : "—"}</td>
      <td class="num">${d?.n_contributing ?? 0}</td>
      <td class="num">${d?.spread_c != null ? "±" + d.spread_c.toFixed(1) : "—"}</td>`;
    tr.addEventListener("click", () => { state.selectedLocId = l.id; render(); flyTo(l.id); });
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
    $("#modelTable tbody").innerHTML = ""; return;
  }
  const hi = d.tmax.consensus, lo = d.tmin.consensus;
  const nHi = d.tmax.n, nLo = d.tmin.n;
  el.innerHTML = `
    <h3>${loc.name}${loc.type === "city" ? " ⋆" : ""}</h3>
    <div class="subline">${d.date} · independent contributors ${nLo} lo / ${nHi} hi · spread ±${d.spread_c!=null?d.spread_c.toFixed(1):"—"}°C</div>
    <div class="big-temps">
      <div><span class="lbl">Low (n=${nLo})</span><span class="t lo">${lo!=null?lo.toFixed(1):"—"}°</span></div>
      <div><span class="lbl">High (n=${nHi})</span><span class="t hi">${hi!=null?hi.toFixed(1):"—"}°</span></div>
    </div>`;

  const tbody = $("#modelTable tbody");
  tbody.innerHTML = "";
  for (const m of (state.models?.implemented || [])) {
    const tmax = d.tmax.valuesByModel?.[m.id];
    const tmin = d.tmin.valuesByModel?.[m.id];
    // Mark dropped aliases and non-consensus (e.g. non-commercial AIWP) models
    const droppedHi = d.dropped_duplicates?.some((x) => x.modelId === m.id && x.date === d.date);
    const nonConsensus = m.consensusEligible === false;
    const isAiwp = m.source === "aiwp_static_extract";
    const tr = document.createElement("tr");
    if (droppedHi) tr.classList.add("deduped");
    if (nonConsensus) tr.classList.add("non-consensus");
    const badge = droppedHi ? '<span class="muted small">(alias)</span>'
                : isAiwp ? '<span class="badge aiwp" title="Pre-processed extract from NOAA/CIRA AIWP public S3 (Pangu/GraphCast IFS). Non-commercial weights; not included in consensus median.">AI ref · non-commercial</span>'
                : nonConsensus ? '<span class="muted small">(excluded)</span>'
                : "";
    tr.innerHTML = `<td>${m.shortLabel}${badge?' '+badge:''}</td>
      <td class="num ${tmax==null?'null':''}">${tmax!=null?tmax.toFixed(1):"—"}</td>
      <td class="num ${tmin==null?'null':''}">${tmin!=null?tmin.toFixed(1):"—"}</td>`;
    tbody.appendChild(tr);
  }
}

function mapReady() {
  if (!state.map || !state.map.isStyleLoaded()) return false;
  // In national view we don't require the municipal choropleth source.
  if (state.view === "national") return true;
  return !!state.map.getSource("municipalities");
}

function renderMap() {
  if (!state.map) return;
  if (!mapReady()) {
    // Overlay not installed yet; render point markers if polygons unavailable,
    // and re-run render after the style is loaded.
    if (!state.geo) renderPointMarkers();
    if (state.map.isStyleLoaded() === false) state.map.once("idle", () => renderMap());
    return;
  }
  // Refresh national overlay when in national view (var/time changes trigger
  // a new source URL, which MapLibre re-fetches automatically only if the
  // tiles change; custom sources require source replacement).
  if (state.view === "national" && state.overlayReady) {
    installOrUpdateOmSource();
  }
  const di = state.selectedDateIdx;
  // Build color lookup
  const colors = {};
  const vals = [];
  for (const l of state.locations || []) {
    const d = getLocationDay(l.id, di);
    let v;
    if (state.variable === "tmax") v = d?.tmax?.consensus;
    else if (state.variable === "tmin") v = d?.tmin?.consensus;
    else v = d?.spread_c;
    if (typeof v === "number") vals.push(v);
    colors[l.id] = v;
  }
  const lo = vals.length ? Math.min(...vals) : 22;
  const hi = vals.length ? Math.max(...vals) : 34;

  // --- LGU choropleth work (skipped in national view) ---
  if (state.view !== "national" && state.geo && state.map.getSource("municipalities")) {
    // Update GeoJSON features with fill color
    const data = JSON.parse(JSON.stringify(state.geo));
    for (const f of data.features) {
      const v = colors[f.properties.id];
      f.properties.fillColor = v == null ? "#444" : tempColor(v, lo, hi, state.variable === "agreement");
      f.properties.value = v;
    }
    state.map.getSource("municipalities").setData(data);

    // Highlight selected
    for (const l of state.locations || []) {
      const fid = featureIdByLoc(l.id);
      if (fid == null) continue;
      state.map.setFeatureState({ source: "municipalities", id: fid }, { selected: l.id === state.selectedLocId });
    }
    state.map.setFilter("muni-line", null);
    // Add a thick outline for selected
    if (!state.map.getLayer("selected-line")) {
      state.map.addLayer({
        id: "selected-line", type: "line", source: "municipalities",
        paint: { "line-color": "#ffd54f", "line-width": 2.5 },
        filter: ["==", ["get", "id"], state.selectedLocId],
      }, "muni-line");
    } else {
      state.map.setFilter("selected-line", ["==", ["get", "id"], state.selectedLocId]);
    }
    renderPointCenters();
  }
  renderAttribution();
}

function renderPointCenters() {
  if (!state.map || !state.map.isStyleLoaded()) return;
  if (state.map.getLayer("muni-fill") && !state.map.getLayer("selected-line")) return; // will be added after map is fully initialized
  // Add / update a label layer with small centroid numbers
  const di = state.selectedDateIdx;
  const feats = [];
  for (const l of state.locations || []) {
    const d = getLocationDay(l.id, di);
    if (!d) continue;
    const v = state.variable === "tmax" ? d.tmax.consensus : state.variable === "tmin" ? d.tmin.consensus : d.spread_c;
    if (v == null) continue;
    feats.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [l.lon, l.lat] },
      properties: { label: state.variable === "agreement" ? "±" + v.toFixed(0) : v.toFixed(0) },
    });
  }
  const data = { type: "FeatureCollection", features: feats };
  // Ensure source/layer exist without double-registering on style reload.
  if (!state.map.getSource("centers")) {
    state.map.addSource("centers", { type: "geojson", data });
  } else {
    state.map.getSource("centers").setData(data);
  }
  if (!state.map.getLayer("centers-sym")) {
    const before = state.map.getLayer("selected-line") ? "selected-line" : undefined;
    state.map.addLayer({
      id: "centers-sym", type: "symbol", source: "centers",
      layout: { "text-field": ["get", "label"], "text-size": 10, "text-font": ["literal", ["Arial Unicode MS Bold"]] },
      paint: { "text-color": "#fff", "text-halo-color": "#000", "text-halo-width": 1.2 },
    }, before);
  }
}

// No-polygon fallback
function renderPointMarkers() {
  if (!state.map || !state.map.isStyleLoaded()) return;
  if (state.map.getSource("points")) return;
  const feats = [];
  const di = state.selectedDateIdx;
  for (const l of state.locations || []) {
    feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [l.lon, l.lat] }, properties: { id: l.id } });
  }
  state.map.addSource("points", { type: "geojson", data: { type: "FeatureCollection", features: feats } });
  state.map.addLayer({
    id: "points-circles", type: "circle", source: "points",
    paint: { "circle-radius": 6, "circle-color": "#4fc3f7", "circle-stroke-color": "#000", "circle-stroke-width": 1 },
  });
}

function flyTo(locId) {
  if (!state.map) return;
  const l = state.locations.find((x) => x.id === locId);
  if (!l) return;
  state.map.flyTo({ center: [l.lon, l.lat], zoom: 10, duration: 400 });
}

function renderLegend() {
  const el = $("#mapLegend");
  if (!state.bundle) { el.innerHTML = ""; return; }
  if (state.view === "national" && state.overlayReady) {
    // Use a fixed, physically interpretable scale for PH temperatures (°C).
    // This prevents legend "stretch" when the visible frame only spans a few
    // degrees; colors remain comparable across hours/days. The OM layer itself
    // paints with its native color ramp; this legend matches the same cool→hot
    // gradient used by the library's default temperature scale.
    const lo = 20, hi = 38;
    const mid = (lo + hi) / 2;
    const varLabel = state.variable === "tmin" ? "NATIONAL LOW °C (ECMWF 3h-min)"
                    : state.variable === "tmax" ? "NATIONAL HIGH °C (ECMWF 3h-max)"
                    : "NATIONAL AFTERNOON °C (ECMWF)";
    const selectedTime = $("#overlayTimeSelect")?.value || "";
    const pht = selectedTime ? utcToPhtLabel(selectedTime) : "";
    el.innerHTML = `<span>${varLabel}${pht?` · ${pht}`:""}</span>
      <div>
        <div class="bar" style="background:linear-gradient(to right,${tempColor(lo,lo,hi)},${tempColor(26,lo,hi)},${tempColor(mid,lo,hi)},${tempColor(32,lo,hi)},${tempColor(hi,lo,hi)})"></div>
        <div class="labels"><span>${lo}°</span><span>26°</span><span>${mid}°</span><span>32°</span><span>${hi}°</span></div>
      </div>
      <div class="small muted">Native grid: ECMWF IFS reduced-Gaussian O1280 (~9 km global), WGS84. Display: bilinear. No-data: transparent (ocean/lakes).</div>`;
    return;
  }
  const di = state.selectedDateIdx;
  const vals = [];
  for (const l of state.locations || []) {
    const d = getLocationDay(l.id, di);
    const v = state.variable === "tmax" ? d?.tmax?.consensus : state.variable === "tmin" ? d?.tmin?.consensus : d?.spread_c;
    if (typeof v === "number") vals.push(v);
  }
  if (!vals.length) { el.innerHTML = "<span>No data</span>"; return; }
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const isSpread = state.variable === "agreement";
  const mid = (lo + hi) / 2;
  const label = state.variable === "tmax" ? "HIGH °C (ZND LGU consensus)" : state.variable === "tmin" ? "LOW °C (ZND LGU consensus)" : "SPREAD °C (ZND LGU)";
  el.innerHTML = `<span>${label}</span>
    <div>
      <div class="bar" style="background:linear-gradient(to right,${tempColor(lo,lo,hi,isSpread)},${tempColor(mid,lo,hi,isSpread)},${tempColor(hi,lo,hi,isSpread)})"></div>
      <div class="labels"><span>${isSpread?'±':''}${lo.toFixed(1)}</span><span>${isSpread?'±':''}${mid.toFixed(1)}</span><span>${isSpread?'±':''}${hi.toFixed(1)}</span></div>
    </div>`;
}

function utcToPhtLabel(isoZ) {
  // isoZ e.g. 2026-10-23T06:00Z
  const d = new Date(isoZ);
  const pht = new Date(d.getTime() + 8*3600*1000);
  const pad = (n) => String(n).padStart(2,"0");
  return `${pht.getUTCFullYear()}-${pad(pht.getUTCMonth()+1)}-${pad(pht.getUTCDate())} ${pad(pht.getUTCHours())}:${pad(pht.getUTCMinutes())} PHT`;
}

function renderSources() {
  const m = state.models || { implemented: [], unavailable: [], registry: [] };
  const lines = [];
  lines.push(`<b>National temperature overlay:</b> ECMWF IFS (O1280 reduced-Gaussian, ~9 km global, WGS84 lon/lat) temperature_2m / temperature_2m_max / temperature_2m_min fields, rendered client-side via Open-Meteo weather-map-layer (MIT) from public S3 chunks; data © ECMWF via Open-Meteo, <a href="https://open-meteo.com/en/license" target="_blank" rel="noopener">CC BY 4.0</a>. Bilinear resampling on display only — native grid cells remain ~9 km; squares/seams visible at high zoom reflect model resolution, not stitching artifacts. Ocean cells are no-data (transparent). Times shown in Asia/Manila (UTC+8).`);
  lines.push(`<br><b>Geographic data:</b> Zamboanga del Norte municipal overlay is a generated Voronoi approximation from verified municipal centroids (NOT official administrative boundaries — visualization only; "LGU View" discloses this). Basemap © OpenStreetMap contributors (ODbL). Representative points: Wikipedia / Philatlas / Open-Meteo geocoding cross-check (town centres).`);
  lines.push(`<br><b>${m.implemented?.length || 0} eligible independent models for Zamboanga del Norte, implemented via Open-Meteo CC-BY 4.0 (non-commercial):</b>`);
  lines.push("<ul>");
  for (const im of (m.implemented || [])) lines.push(`<li><b>${im.shortLabel}</b> — ${im.centre} (~${im.nativeResKm} km)${im.aliasGroup ? ` [alias-group: ${im.aliasGroup}]` : ""}</li>`);
  lines.push("</ul>");
  const unavail = (m.unavailable || []).filter((u) => u.status !== "excluded_by_design");
  if (unavail.length) {
    lines.push(`<b>${unavail.length} target models NOT eligible in v0.1:</b><ul>`);
    for (const u of unavail) lines.push(`<li><b>${u.label}</b> <span class="muted">(${u.status})</span> — ${u.reason}</li>`);
    lines.push("</ul>");
  }
  lines.push(`<div class="mono small">Open-Meteo terms verified 2026-10-23: free non-commercial API, CC-BY 4.0, &lt;10,000 calls/day, &lt;5,000/hour, &lt;600/minute. Evidence fixtures: <code>docs/verification/open-meteo-models-2026-10-23.json</code>, <code>docs/verification/ecmwf-ifs-spatial-2026-10-23.json</code>.</div>`);
  $("#sourceBlock").innerHTML = lines.join("");
  const attr = state.view === "national" && state.overlayReady
    ? `National overlay: ECMWF IFS via Open-Meteo (CC BY 4.0), ~9 km · Municipal overlay (LGU view): approximate · Basemap: OpenStreetMap`
    : `Municipal overlay: approximate (not official) · Basemap: OpenStreetMap`;
  $(".map-attribution").innerHTML = attr;
}

async function renderBulletin() {
  const day = state.selectedDateIdx;
  try {
    const r = await fetch(`/api/bulletin?day=${day}`);
    $("#bulletinText").textContent = r.ok ? await r.text() : `(Bulletin unavailable — HTTP ${r.status})`;
  } catch (e) {
    $("#bulletinText").textContent = "(Bulletin unavailable — " + e.message + ")";
  }
}

function getLocationDay(locId, dayIdx) {
  const b = state.bundle;
  const loc = (b?.locations || []).find((l) => l.locationId === locId);
  return loc?.days?.[dayIdx] || null;
}

function tempColor(t, lo, hi, isSpread = false) {
  if (typeof t !== "number") return "rgba(80,80,80,0.4)";
  const range = Math.max(hi - lo, 0.5);
  const x = Math.max(0, Math.min(1, (t - lo) / range));
  const stops = isSpread
    ? [
        [0.0, [46, 125, 50]],    // green (low spread = agreement)
        [0.5, [255, 183, 77]],  // amber
        [1.0, [239, 83, 80]],   // red (high spread = disagreement)
      ]
    : [
        [0.00, [79, 195, 247]], // blue (cool)
        [0.45, [129, 199, 132]],// green
        [0.70, [255, 183, 77]], // amber
        [1.00, [239, 83, 80]],  // red (hot)
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
  return `rgb(${stops[stops.length-1][1].join(",")})`;
}

function formatPHTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  d.setUTCHours(d.getUTCHours() + 8); // Philippine Time = Asia/Manila = UTC+8
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} PHT (Asia/Manila)`;
}
