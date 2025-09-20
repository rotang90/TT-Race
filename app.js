// Read‑Only Viewer App
// Fetches JSON from the same GitHub Pages repo (./data.json by default).
// No editing controls are present; UI is strictly for viewing.

const DATA_URL = (function() {
  // By default, fetch 'data.json' from the same path where index.html is hosted.
  // You can hardcode a raw GitHub URL here if you prefer:
  // return "https://raw.githubusercontent.com/<user>/<repo>/<branch>/data.json";
  return new URL('./data.json', window.location.href).href;
})();

const state = {
  data: null,
  seasons: [], // normalized [{id, name, raw}]
  activeSeasonIdx: 0
};

const $status = () => document.getElementById('status');
const $seasonSelect = () => document.getElementById('seasonSelect');

function setStatus(msg, kind="info") {
  const el = $status();
  el.textContent = msg || "";
  el.className = `status ${kind}`;
}

function normalizeSeasons(data) {
  // Try to be flexible with keys: seasons / Seasons / SEASONS, etc.
  const keys = Object.keys(data || {});
  const seasonKey = keys.find(k => k.toLowerCase() === "seasons");
  let seasons = [];
  if (seasonKey && Array.isArray(data[seasonKey])) {
    seasons = data[seasonKey];
  } else if (Array.isArray(data)) {
    // If the root is already an array, treat it as seasons
    seasons = data;
  } else {
    // No seasons structure: create a single "All Data" pseudo-season
    seasons = [{ name: "All Data", __allData: true, data }];
  }

  // Normalize to id, name
  return seasons.map((s, i) => ({
    id: s.id ?? i,
    name: String(s.name ?? `Season ${i+1}`),
    raw: s
  }));
}

async function loadData() {
  setStatus("Loading data.json from GitHub Pages…");
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    state.data = json;
    state.seasons = normalizeSeasons(json);
    populateSeasonSelect();
    renderAll();
    setStatus(`Loaded ${state.seasons.length} season${state.seasons.length===1?"":"s"}.`);
  } catch (err) {
    console.error(err);
    setStatus(`Failed to load data: ${err.message}. Ensure 'data.json' exists in the same repo path.`, "error");
    // Provide a tiny fallback so tabs still demo
    state.data = { notice: "No data.json found" };
    state.seasons = [{ id: 0, name: "Demo", raw: {} }];
    populateSeasonSelect();
    renderAll();
  }
}

function populateSeasonSelect() {
  const sel = $seasonSelect();
  sel.innerHTML = "";
  state.seasons.forEach((s, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = s.name;
    sel.appendChild(opt);
  });
  sel.value = String(state.activeSeasonIdx);
  sel.onchange = (e) => {
    state.activeSeasonIdx = Number(e.target.value);
    renderAll();
  };
}

function getSeasonRaw() {
  return state.seasons[state.activeSeasonIdx]?.raw ?? {};
}

// ---------- Render helpers ----------

function clearView(id) {
  const el = document.getElementById(id);
  el.innerHTML = "";
  return el;
}

function makeTable(columns, rows) {
  const table = document.createElement("table");
  table.className = "table";
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  columns.forEach(col => {
    const th = document.createElement("th");
    th.textContent = col.label ?? col.key;
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  const tbody = document.createElement("tbody");

  rows.forEach(r => {
    const tr = document.createElement("tr");
    columns.forEach(col => {
      const td = document.createElement("td");
      let v = r[col.key];
      if (v === undefined || v === null) v = "";
      td.textContent = typeof v === "object" ? JSON.stringify(v) : String(v);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  return table;
}

// Try to pull an array by a set of candidate keys in a case-insensitive way
function findArray(obj, candidates) {
  const lower = Object.fromEntries(Object.entries(obj || {}).map(([k,v]) => [k.toLowerCase(), v]));
  for (const name of candidates) {
    const hit = lower[name.toLowerCase()];
    if (Array.isArray(hit)) return hit;
  }
  return null;
}

// ---------- Individual views ----------

function renderStandings() {
  const el = clearView("view-standings");
  const raw = getSeasonRaw();

  // Try to find standings/finalStandings/points
  const standings = findArray(raw, ["standings", "finalStandings", "pointsTable", "table"]);
  if (standings && standings.length) {
    const cols = [
      { key: "position", label: "#" },
      { key: "driver", label: "Driver" },
      { key: "team", label: "Team" },
      { key: "points", label: "Points" },
    ].filter(c => standings.some(r => r[c.key] !== undefined));

    const table = makeTable(cols, standings);
    el.appendChild(table);
  } else {
    el.innerHTML = "<p>No explicit standings found for this season.</p>";
  }
}

function renderRaces() {
  const el = clearView("view-races");
  const raw = getSeasonRaw();
  const races = findArray(raw, ["races", "events", "rounds", "schedule"]);
  if (races && races.length) {
    const cols = [
      { key: "round", label: "Rnd" },
      { key: "name", label: "Race" },
      { key: "track", label: "Track" },
      { key: "date", label: "Date" },
      { key: "winner", label: "Winner" },
    ].filter(c => races.some(r => r[c.key] !== undefined));

    const table = makeTable(cols, races.map((r, i) => ({ round: r.round ?? (i+1), ...r })));
    el.appendChild(table);
  } else {
    el.innerHTML = "<p>No race list found for this season.</p>";
  }
}

function renderDrivers() {
  const el = clearView("view-drivers");
  const raw = getSeasonRaw();
  const drivers = findArray(raw, ["drivers", "roster", "entrants"]);
  if (drivers && drivers.length) {
    const cols = [
      { key: "number", label: "#" },
      { key: "name", label: "Driver" },
      { key: "color", label: "Color" },
      { key: "team", label: "Team" },
    ].filter(c => drivers.some(r => r[c.key] !== undefined));
    const table = makeTable(cols, drivers);
    el.appendChild(table);
  } else {
    el.innerHTML = "<p>No driver roster found for this season.</p>";
  }
}

function renderLifetime() {
  const el = clearView("view-lifetime");
  const raw = getSeasonRaw();
  // Lifetime could live at the root of the data rather than per-season:
  const lifetime = findArray(state.data || {}, ["lifetime", "lifetimeStats", "career"]);
  const cols = [
    { key: "driver", label: "Driver" },
    { key: "seasons", label: "Seasons" },
    { key: "avgPos", label: "Avg Finish" },
    { key: "titles", label: "Titles" },
    { key: "totalPoints", label: "Total Pts" },
  ];

  if (lifetime && lifetime.length) {
    const useCols = cols.filter(c => lifetime.some(r => r[c.key] !== undefined));
    const table = makeTable(useCols, lifetime);
    el.appendChild(table);
  } else {
    el.innerHTML = "<p>No lifetime stats found. If your JSON includes them under <code>lifetime</code> or <code>lifetimeStats</code>, they will appear here.</p>";
  }
}

// ---------- Tabs ----------

function initTabs() {
  const tabs = Array.from(document.querySelectorAll(".tab"));
  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      tabs.forEach(b => { b.classList.toggle("active", b === btn); b.setAttribute("aria-selected", b === btn ? "true" : "false"); });
      const target = btn.dataset.tab;
      document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
      const el = document.getElementById(`view-${target}`);
      if (el) el.classList.add("active");
    });
  });
}

function renderAll() {
  renderStandings();
  renderRaces();
  renderDrivers();
  renderLifetime();
}

(function boot() {
  initTabs();
  loadData();
})();
