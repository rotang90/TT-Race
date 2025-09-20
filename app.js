// Read‑Only Viewer App (Computed Standings)
// Fetches JSON from the same GitHub Pages repo (./data.json by default).
// Computes standings from: drivers, schedule, results, points, adjustments.

const DATA_URL = new URL('./data.json', window.location.href).href;

const state = {
  data: null,
  seasons: [], // [{id, name, raw}]
  activeSeasonIdx: 0
};

const $ = (sel) => document.querySelector(sel);
const $status = () => document.getElementById('status');
const $seasonSelect = () => document.getElementById('seasonSelect');

function setStatus(msg, kind="info") {
  const el = $status();
  el.textContent = msg || "";
  el.className = `status ${kind}`;
}

function normalizeSeasons(data) {
  const seasons = Array.isArray(data?.seasons) ? data.seasons : (Array.isArray(data) ? data : []);
  return seasons.map((s, i) => ({
    id: s.id ?? i,
    name: String(s.name ?? `Season ${i+1}`),
    raw: s
  }));
}

// ---- Points helpers ----
function pointsFor(pos, table) {
  if (!Number.isFinite(pos) || pos <= 0) return 0;
  if (!Array.isArray(table)) return 0;
  const idx = pos - 1;
  if (idx < 0 || idx >= table.length) return 0;
  const val = table[idx];
  return Number.isFinite(val) ? val : 0;
}

// ---- Compute standings from schema (drivers/results/points/adjustments) ----
function computeStandings(season) {
  const drivers = Array.isArray(season.drivers) ? season.drivers : [];
  const results = Array.isArray(season.results) ? season.results : [];
  const p = season.points || {};
  const qualiPtsTable = Array.isArray(p.quali) ? p.quali : [];
  const racePtsTable = Array.isArray(p.race) ? p.race : [];

  const byId = Object.fromEntries(drivers.map(d => [d.id, d]));
  const tallies = Object.fromEntries(drivers.map(d => [d.id, {
    driverId: d.id,
    name: d.name,
    number: d.number,
    color: d.color,
    qualiPoints: 0,
    racePoints: 0,
    adjPoints: 0,
    totalPoints: 0,
    races: 0,
    wins: 0
  }]));

  for (const r of results) {
    const byDriver = r?.byDriver || {};
    // Apply per-driver results
    for (const [driverId, rec] of Object.entries(byDriver)) {
      const t = tallies[driverId];
      if (!t) continue; // skip unknown drivers

      const qDNP = !!rec.qDNP;
      const dnf = !!rec.dnf;

      // Quali points
      if (!qDNP && Number.isFinite(rec.qualiPos)) {
        t.qualiPoints += pointsFor(rec.qualiPos, qualiPtsTable);
      }

      // Race points
      if (!dnf && Number.isFinite(rec.racePos)) {
        t.racePoints += pointsFor(rec.racePos, racePtsTable);
        if (rec.racePos === 1) t.wins += 1;
      }

      if (Number.isFinite(rec.racePos)) t.races += 1;
    }

    // Apply race-level adjustments (bonus/malus)
    const adj = r?.adjustments || {};
    for (const [driverId, a] of Object.entries(adj)) {
      const t = tallies[driverId];
      if (!t) continue;
      const delta = Number(a?.points) || 0;
      t.adjPoints += delta;
    }
  }

  // Compute totals and transform to array
  const rows = Object.values(tallies).map(t => ({
    ...t,
    totalPoints: t.qualiPoints + t.racePoints + t.adjPoints
  }));

  // Sort: total desc, wins desc, name asc
  rows.sort((a,b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return (a.name||"").localeCompare(b.name||"");
  });

  // Assign positions
  rows.forEach((r, i) => r.position = i + 1);

  return rows;
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

// ---------- Individual views ----------

function getSeasonRaw() {
  return state.seasons[state.activeSeasonIdx]?.raw ?? {};
}

function renderStandings() {
  const el = clearView("view-standings");
  const raw = getSeasonRaw();
  const rows = computeStandings(raw);

  if (rows.length) {
    const cols = [
      { key: "position", label: "#" },
      { key: "name", label: "Driver" },
      { key: "number", label: "No." },
      { key: "wins", label: "Wins" },
      { key: "races", label: "Races" },
      { key: "qualiPoints", label: "Quali Pts" },
      { key: "racePoints", label: "Race Pts" },
      { key: "adjPoints", label: "Adj" },
      { key: "totalPoints", label: "Total" },
    ];
    const table = makeTable(cols, rows);
    el.appendChild(table);
    const note = document.createElement("div");
    note.className = "small";
    note.innerHTML = "Standings are computed from each race's <code>byDriver</code> results using season <code>points</code>, ignoring <code>qDNP</code> and <code>dnf</code> for quali/race respectively, and including per‑race <code>adjustments</code>.";
    el.appendChild(note);
  } else {
    el.innerHTML = "<p>No results available to compute standings for this season.</p>";
  }
}

function renderRaces() {
  const el = clearView("view-races");
  const raw = getSeasonRaw();
  const schedule = Array.isArray(raw.schedule) ? raw.schedule : [];
  const results = Array.isArray(raw.results) ? raw.results : [];
  const resultsByRace = Object.fromEntries(results.map(r => [r.raceId, r]));

  const rows = schedule.map((r, i) => {
    const res = resultsByRace[r.id];
    let winner = "";
    if (res && res.byDriver) {
      // find lowest racePos where dnf is not true
      let best = null;
      for (const [driverId, rec] of Object.entries(res.byDriver)) {
        if (rec && Number.isFinite(rec.racePos) && !rec.dnf) {
          if (!best || rec.racePos < best.racePos) best = { driverId, racePos: rec.racePos };
        }
      }
      if (best) {
        const d = (raw.drivers||[]).find(d => d.id === best.driverId);
        winner = d ? d.name : best.driverId;
      }
    }
    return {
      round: r.round ?? (i+1),
      track: r.track || "",
      date: r.raceDate ? new Date(r.raceDate).toISOString().slice(0,10) : "",
      winner
    };
  });

  const cols = [
    { key: "round", label: "Rnd" },
    { key: "track", label: "Race" },
    { key: "date", label: "Date" },
    { key: "winner", label: "Winner" },
  ];
  const table = makeTable(cols, rows);
  el.appendChild(table);
}

function renderDrivers() {
  const el = clearView("view-drivers");
  const raw = getSeasonRaw();
  const drivers = Array.isArray(raw.drivers) ? raw.drivers : [];
  const cols = [
    { key: "number", label: "#" },
    { key: "name", label: "Driver" },
    { key: "color", label: "Color" },
  ];
  const rows = drivers.map(d => ({ number: d.number, name: d.name, color: d.color }));
  const table = makeTable(cols, rows);
  el.appendChild(table);
}

function renderLifetime() {
  const el = clearView("view-lifetime");
  // Aggregate totals per driver across all seasons
  const agg = new Map();
  state.seasons.forEach(s => {
    const rows = computeStandings(s.raw);
    rows.forEach(r => {
      const key = r.name || r.driverId;
      const prev = agg.get(key) || { driver: key, seasons: 0, totalPoints: 0, wins: 0 };
      prev.seasons += 1;
      prev.totalPoints += r.totalPoints;
      prev.wins += r.wins;
      agg.set(key, prev);
    });
  });
  const rows = Array.from(agg.values()).sort((a,b)=>b.totalPoints-a.totalPoints);
  const cols = [
    { key: "driver", label: "Driver" },
    { key: "seasons", label: "Seasons" },
    { key: "wins", label: "Wins" },
    { key: "totalPoints", label: "Total Pts" },
  ];
  const table = makeTable(cols, rows);
  el.appendChild(table);
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

function populateSeasonSelect() {
  const sel = $seasonSelect();
  sel.innerHTML = "";
  state.seasons.forEach((s, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = s.name;
    sel.appendChild(opt);
  });

  // Try to use activeSeasonIndex if present
  const asi = Number(state.data?.activeSeasonIndex);
  state.activeSeasonIdx = Number.isFinite(asi) ? Math.max(0, Math.min(state.seasons.length-1, asi)) : 0;
  sel.value = String(state.activeSeasonIdx);
  sel.onchange = (e) => {
    state.activeSeasonIdx = Number(e.target.value);
    renderAll();
  };
}

function renderAll() {
  renderStandings();
  renderRaces();
  renderDrivers();
  renderLifetime();
}

// ---------- Boot ----------

(async function boot() {
  initTabs();
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
    state.data = { seasons: [] };
  }
})();
