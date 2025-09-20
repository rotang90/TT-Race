// Read-only portal clone that matches v13.7 look but disables editing.
// Auto-loads ./data.json (same GitHub Pages path).

const DATA_URL = new URL('./data.json', window.location.href).href;

let app = { seasons: [], activeSeasonIndex: 0, theme: "dark" };

const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const $  = (sel, root=document) => root.querySelector(sel);

function applyTheme(){ document.body.setAttribute("data-theme", app.theme==="dark"?"dark":"light"); }
$("#themeToggle").addEventListener("click", ()=>{
  app.theme = app.theme==="dark" ? "light" : "dark"; applyTheme();
});

// ---- Load JSON ----
(async function boot(){
  applyTheme();
  try{
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    app.seasons = Array.isArray(data.seasons) ? data.seasons : [];
    app.activeSeasonIndex = Number.isFinite(+data.activeSeasonIndex) ? +data.activeSeasonIndex : 0;
    refreshSeasonSelect();
    attachTabNav();
    renderAll();
  }catch(err){
    console.error(err);
    alert("Failed to load data.json. Make sure it exists next to index.html.");
  }
})();

function currentSeason(){ return app.seasons[app.activeSeasonIndex] || { drivers:[], schedule:[], results:[], points:{quali:[], race:[]}, rules:"" }; }
function refreshSeasonSelect(){
  const sel = $("#seasonSelect"); sel.innerHTML = "";
  app.seasons.forEach((s,i)=>{
    const opt = document.createElement("option"); opt.value = String(i); opt.textContent = s.name || `Season ${i+1}`; sel.appendChild(opt);
  });
  sel.value = String(Math.min(app.activeSeasonIndex, app.seasons.length-1));
  sel.onchange = ()=>{ app.activeSeasonIndex = +sel.value; renderAll(); };
}

function attachTabNav(){
  $("#tabs").addEventListener("click", (e)=>{
    const t = e.target.closest(".tab"); if(!t) return;
    $$(".tab").forEach(x=>x.classList.toggle("active", x===t));
    ["dashboard","drivers","schedule","results","points_rules","lifetime"].forEach(id => $("#"+id).classList.toggle("hidden", id!==t.dataset.tab));
    if (t.dataset.tab === "lifetime") setTimeout(()=>drawLifetimeChart(), 0);
  });
}

// ====== COMPUTATIONS (same schema you used earlier) ======
function sanitizeNumberInput(v){ if (v == null) return 0; v = String(v).replace(/,/g,"").trim(); const n = Number(v); return Number.isFinite(n) ? n : 0; }
function pointsFor(pos, table){ if (!Number.isFinite(pos) || pos <= 0) return 0; const idx = pos-1; return Array.isArray(table) && Number.isFinite(table[idx]) ? table[idx] : 0; }

function computePointsByDriver(){
  const s = currentSeason(); const qp = s.points?.quali || [], rp = s.points?.race || [];
  const map = {}; (s.drivers||[]).forEach(d=> map[d.id] = {id:d.id, name:d.name, number:d.number, color:d.color, qualiPts:0, racePts:0, adjPts:0, total:0});
  const included = (raceId)=> { const r = (s.schedule||[]).find(x=>x.id===raceId); return !r || r.includeInStats !== false; };
  for (const entry of (s.results||[])){
    if (!included(entry.raceId)) continue;
    for (const [id, vals] of Object.entries(entry.byDriver||{})){
      const q=Number(vals.qualiPos)||0, r=Number(vals.racePos)||0;
      if (q>0 && !vals.qDNP) map[id].qualiPts += pointsFor(q, qp);
      if (r>0 && !vals.dnf)  map[id].racePts  += pointsFor(r, rp);
    }
    for (const [id, adj] of Object.entries(entry.adjustments||{})){
      const val=(adj.points===""||adj.points==null)?0:Number(adj.points)||0;
      if (map[id]) map[id].adjPts += val;
    }
  }
  Object.values(map).forEach(d=> d.total = d.qualiPts + d.racePts + d.adjPts);
  return map;
}

function computeStandingsAfterEachRace(){
  const s = currentSeason();
  const qp = s.points?.quali || [], rp = s.points?.race || [];
  const racesSorted = [...(s.schedule||[])].filter(r=> r.includeInStats !== false).sort((a,b)=> new Date(a.raceDate)-new Date(b.raceDate));
  const ids = (s.drivers||[]).map(d=>d.id); const cum={}; ids.forEach(id=> cum[id]=0);
  const out=[];
  racesSorted.forEach(r=>{
    const entry = (s.results||[]).find(e=>e.raceId===r.id);
    if (entry){
      for (const [id, vals] of Object.entries(entry.byDriver||{})){
        const q=Number(vals.qualiPos)||0, x=Number(vals.racePos)||0;
        if (q>0 && !vals.qDNP) cum[id]+=pointsFor(q, qp);
        if (x>0 && !vals.dnf)  cum[id]+=pointsFor(x, rp);
      }
      for (const [id,adj] of Object.entries(entry.adjustments||{})){
        const val=(adj.points===""||adj.points==null)?0:Number(adj.points)||0; cum[id]+=val;
      }
    }
    const ordered = ids.map(id=>({id, total:cum[id], name:(s.drivers||[]).find(d=>d.id===id)?.name||""})).sort((a,b)=> b.total-a.total || a.name.localeCompare(b.name));
    const pos={}; ordered.forEach((o,i)=> pos[o.id]=i+1);
    out.push({raceId:r.id, round:r.round, positions:pos});
  });
  return out;
}

function computeFinalStandings(season){
  const s = season;
  const qp = s.points?.quali || [], rp = s.points?.race || [];
  const map = {}; (s.drivers||[]).forEach(d=> map[d.id]={id:d.id,name:d.name,total:0});
  for(const entry of (s.results||[])){
    for(const [id,vals] of Object.entries(entry.byDriver||{})){
      const q=Number(vals.qualiPos)||0, r=Number(vals.racePos)||0;
      if(q>0 && !vals.qDNP) map[id].total+=pointsFor(q, qp);
      if(r>0 && !vals.dnf)  map[id].total+=pointsFor(r, rp);
    }
    for(const [id,adj] of Object.entries(entry.adjustments||{})){
      const val=(adj.points===""||adj.points==null)?0:Number(adj.points)||0; map[id].total+=val;
    }
  }
  return Object.values(map).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
}

// ====== RENDER ======
function toMMDDYYYY(d){ const dd=new Date(d); if(isNaN(dd)) return ""; const mm=String(dd.getMonth()+1).padStart(2,"0"); const day=String(dd.getDate()).padStart(2,"0"); return `${mm}-${day}-${dd.getFullYear()}`; }

let sortKey="total", sortAsc=false;
function renderLeaderboard(){
  const tbody=$("#leaderboardTable tbody"); tbody.innerHTML="";
  const map = computePointsByDriver(); let rows = Object.values(map);
  if (sortKey==="name") rows.sort((a,b)=> a.name.localeCompare(b.name) * (sortAsc?1:-1));
  else rows.sort((a,b)=> (a.total - b.total) * (sortAsc?1:-1));
  rows.forEach(d=>{
    const tr=document.createElement("tr");
    tr.innerHTML = `<td><span class="number-chip"><span class="color-dot" style="background:${d.color}"></span>${d.name}</span></td>
      <td>${d.number||"-"}</td>
      <td><span class="color-dot" style="background:${d.color}"></span></td>
      <td><strong>${d.total}</strong></td>
      <td>${d.qualiPts}</td>
      <td>${d.racePts}</td>
      <td>${d.adjPts}</td>`;
    tbody.appendChild(tr);
  });
}
$$('#leaderboardTable th[data-sort]').forEach(th=> th.addEventListener("click", ()=>{
  const key=th.dataset.sort; if (sortKey===key) sortAsc=!sortAsc; else { sortKey=key; sortAsc=(key==="name"); } renderLeaderboard();
}));

function renderSeasonSummary(){
  const s = currentSeason(); const map = computePointsByDriver();
  const activeDrivers = (s.drivers||[]).filter(d=>d.active!==false).length;
  const races = (s.schedule||[]).length;
  const included = (s.schedule||[]).filter(r=> r.includeInStats !== false).length;
  const resultsEntered = (s.results||[]).filter(e=> Object.keys(e.byDriver||{}).length>0 && ((s.schedule||[]).find(r=>r.id===e.raceId)?.includeInStats !== false)).length;
  $("#seasonSummary").innerHTML = `
    <div class="pill">Drivers: <strong>${(s.drivers||[]).length}</strong> (<span class="muted">${activeDrivers} active</span>)</div>
    <div class="pill">Races: <strong>${races}</strong> <span class="muted">(Included: ${included})</span></div>
    <div class="pill">Events Recorded: <strong>${resultsEntered}</strong></div>
    <div class="pill">Leader: <strong>${Object.values(map).sort((a,b)=>b.total-a.total)[0]?.name||"—"}</strong></div>`;
  const now = new Date(); const next = (s.schedule||[]).find(r=> new Date(r.raceDate) >= now);
  if (next){
    $("#upcoming").innerHTML = `
      <div class="pill">Next: <strong>Round ${next.round}</strong> — ${next.track}</div>
      <div class="pill">Practice: <strong>${toMMDDYYYY(next.practiceDate)}</strong></div>
      <div class="pill">Race: <strong>${toMMDDYYYY(next.raceDate)}</strong></div>`;
  } else { $("#upcoming").innerHTML = `<span class="muted">No upcoming events scheduled.</span>`; }
}

function renderDrivers(){
  const tbody=$("#driversTable tbody"); tbody.innerHTML="";
  (currentSeason().drivers||[]).forEach((d, idx)=>{
    const tr=document.createElement("tr");
    tr.innerHTML = `<td class="muted">${idx+1}</td><td>${d.name}</td><td>${d.number||"-"}</td><td><span class="color-dot" style="background:${d.color}"></span> ${d.color||""}</td>`;
    tbody.appendChild(tr);
  });
}

function renderSchedule(){
  const tbody=$("#scheduleTable tbody"); tbody.innerHTML="";
  (currentSeason().schedule||[]).forEach(r=>{
    const tr=document.createElement("tr");
    tr.innerHTML = `<td>${r.round}</td><td>${r.track}</td><td>${toMMDDYYYY(r.practiceDate)}</td><td>${toMMDDYYYY(r.raceDate)}</td><td>${r.includeInStats!==false? "Yes":"No"}</td>`;
    tbody.appendChild(tr);
  });
}

function renderResults(){
  const wrap=$("#resultsList"); wrap.innerHTML="";
  const s=currentSeason();
  const idToDriver = Object.fromEntries((s.drivers||[]).map(d=>[d.id,d]));
  (s.schedule||[]).forEach(r=>{
    const entry=(s.results||[]).find(x=>x.raceId===r.id) || {byDriver:{},adjustments:{}};
    const panel=document.createElement("div"); panel.className="panel";
    panel.innerHTML = `<h3 style="margin:0;">Round ${r.round} — ${r.track}</h3>
      <div class="muted">Practice: ${toMMDDYYYY(r.practiceDate)} · Race: ${toMMDDYYYY(r.raceDate)}</div>
      <div class="hr"></div>
      <div class="two-col">
        <div>
          <h4>Qualifying</h4>
          <table class="mini"><thead><tr><th>Pos</th><th>Driver</th><th>DNP</th></tr></thead><tbody></tbody></table>
        </div>
        <div>
          <h4>Race</h4>
          <table class="mini"><thead><tr><th>Pos</th><th>Driver</th><th>DNF</th></tr></thead><tbody></tbody></table>
        </div>
      </div>
      <div class="hr"></div>
      <div class="muted">Adjustments</div>
      <table class="mini"><thead><tr><th>Driver</th><th>Points</th><th>Note</th></tr></thead><tbody class="adj"></tbody></table>`;
    const [qT,rT] = panel.querySelectorAll("table.mini tbody");
    // build arrays
    const qRows=[], rRows=[];
    for (const [id, vals] of Object.entries(entry.byDriver||{})){
      const d = idToDriver[id]; if (!d) continue;
      if (Number(vals.qualiPos)>0 || vals.qDNP) qRows.push({pos:Number(vals.qualiPos)||"", name:d.name, flag:vals.qDNP?"DNP":""});
      if (Number(vals.racePos)>0 || vals.dnf)  rRows.push({pos:Number(vals.racePos)||"", name:d.name, flag:vals.dnf?"DNF":""});
    }
    qRows.sort((a,b)=> (a.pos||99)-(b.pos||99) || a.name.localeCompare(b.name));
    rRows.sort((a,b)=> (a.pos||99)-(b.pos||99) || a.name.localeCompare(b.name));
    qT.innerHTML = qRows.map(row=> `<tr><td>${row.pos||"-"}</td><td>${row.name}</td><td>${row.flag}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">No quali results.</td></tr>`;
    rT.innerHTML = rRows.map(row=> `<tr><td>${row.pos||"-"}</td><td>${row.name}</td><td>${row.flag}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">No race results.</td></tr>`;
    // adjustments
    const adjT = panel.querySelector("tbody.adj");
    const adjRows = Object.entries(entry.adjustments||{}).map(([id,a])=>({name:idToDriver[id]?.name||id, pts:(a.points===""||a.points==null)?"":a.points, note:a.note||""}));
    adjT.innerHTML = adjRows.map(x=> `<tr><td>${x.name}</td><td>${x.pts}</td><td>${x.note}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">None</td></tr>`;
    wrap.appendChild(panel);
  });
}

function renderPointsAndRules(){
  const s=currentSeason();
  const qp=s.points?.quali||[], rp=s.points?.race||[];
  const fill=(tbodyId, arr)=>{
    const tbody=$(tbodyId); tbody.innerHTML="";
    arr.forEach((v,i)=>{
      const tr=document.createElement("tr"); tr.innerHTML=`<td class="muted">P${i+1}</td><td>${v}</td>`; tbody.appendChild(tr);
    });
  };
  fill("#qualiPointsTable tbody", qp);
  fill("#racePointsTable tbody",  rp);
  $("#rulesBox").textContent = s.rules || "No rules saved.";
}

// ===== Lifetime =====
function renderLifetime(){
  const tbody=$("#lifetimeTable tbody"); tbody.innerHTML="";
  const allDrivers={}; const labels = app.seasons.map((s,i)=> s.seasonNo ?? (i+1));
  app.seasons.forEach((s,si)=>{
    const standings=computeFinalStandings(s);
    standings.forEach((d,idx)=>{
      if(!allDrivers[d.name]) allDrivers[d.name]=[];
      allDrivers[d.name][si]=idx+1;
    });
  });
  Object.entries(allDrivers).forEach(([name,positions])=>{
    const tdSeasons=(positions||[]).map((p,i)=>`<span class="pill">S${labels[i]}: P${p||"-"}</span>`).join(" ");
    const tr=document.createElement("tr"); tr.innerHTML=`<td>${name}</td><td>${tdSeasons}</td>`; tbody.appendChild(tr);
  });
}

const posCanvas = $("#posChart"); const ctx = posCanvas.getContext("2d"); let hiddenDrivers = new Set();
function drawPositionsChart(){
  const s=currentSeason(); const racesSorted = [...(s.schedule||[])].sort((a,b)=> new Date(a.raceDate)-new Date(b.raceDate));
  ctx.clearRect(0,0,posCanvas.width,posCanvas.height);
  const padL=40,padR=10,padT=10,padB=30; const W=posCanvas.width-padL-padR, H=posCanvas.height-padT-padB;
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue("--border"); ctx.beginPath(); ctx.moveTo(padL,padT); ctx.lineTo(padL,padT+H); ctx.lineTo(padL+W,padT+H); ctx.stroke();
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--muted"); ctx.font="12px system-ui"; ctx.textAlign="center";
  racesSorted.forEach((r,i)=>{ const x=padL + (W * (i/Math.max(1,racesSorted.length-1))); ctx.fillText("R"+r.round, x, padT+H+18); });
  const standings = computeStandingsAfterEachRace(); if(!standings.length) return;
  const drivers = (s.drivers||[]); const maxPos = Math.max(drivers.length,1);
  const yForPos = (p)=> padT + ((p-1)/Math.max(1,maxPos-1))*H; const xFor = (i)=> padL + (W*(i/Math.max(1,standings.length-1)));
  drivers.forEach(d=>{
    if (hiddenDrivers.has(d.id)) return;
    ctx.strokeStyle = d.color||"#888"; ctx.lineWidth=2; ctx.beginPath();
    standings.forEach((s,i)=>{ const p=s.positions[d.id]||maxPos, x=xFor(i), y=yForPos(p); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
    ctx.stroke();
    standings.forEach((s,i)=>{ const p=s.positions[d.id]||maxPos, x=xFor(i), y=yForPos(p); ctx.fillStyle=d.color||"#888"; ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill(); });
  });
  // y ticks
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--muted"); ctx.textAlign="right"; ctx.textBaseline="middle";
  for (let p=1;p<=Math.min(maxPos,10);p++){ const y=yForPos(p); ctx.fillText("P"+p, padL-6, y); }
  // legend
  const legend = $("#posLegend"); legend.innerHTML=""; (s.drivers||[]).forEach(d=>{
    const b=document.createElement("button"); b.className="legend-item"; b.innerHTML = `<span class="color-dot" style="background:${d.color}"></span> ${d.name}`;
    b.style.opacity = hiddenDrivers.has(d.id)? .4 : 1; b.addEventListener("click", ()=>{ if(hiddenDrivers.has(d.id)) hiddenDrivers.delete(d.id); else hiddenDrivers.add(d.id); drawPositionsChart(); b.style.opacity = hiddenDrivers.has(d.id)? .4 : 1; });
    legend.appendChild(b);
  });
}

function drawLifetimeChart(){
  const cvs = document.getElementById("lifetimeChart"); const ctx = cvs.getContext("2d");
  ctx.clearRect(0,0,cvs.width,cvs.height);
  // build series
  const labels = app.seasons.map((s,i)=> s.seasonNo ?? (i+1));
  const colorBy = {}; app.seasons.forEach(season => (season.drivers||[]).forEach(d => { if (d && d.name) colorBy[d.name] = d.color || colorBy[d.name] || '#888'; }));
  const all = {};
  app.seasons.forEach((s,si)=>{
    const standings = computeFinalStandings(s);
    standings.forEach((row,idx)=>{
      const name = row.name;
      if(!all[name]) all[name] = { color: colorBy[name] || '#888', data: Array(app.seasons.length).fill(null) };
      all[name].color = colorBy[name] || all[name].color;
      all[name].data[si] = idx+1;
    });
  });
  const series = Object.entries(all).map(([name,info])=>({name, color:info.color, data:info.data}));
  let maxPos = 1; series.forEach(s=> s.data.forEach(v=>{ if(Number.isFinite(v)) maxPos = Math.max(maxPos, v); }));
  // axes
  const padL=48, padR=20, padT=16, padB=36;
  const W=cvs.width, H=cvs.height, plotW=W-padL-padR, plotH=H-padT-padB;
  const cs = getComputedStyle(document.body);
  ctx.save();
  ctx.strokeStyle = cs.getPropertyValue('--border') || '#ddd';
  ctx.fillStyle   = cs.getPropertyValue('--muted') || '#888';
  ctx.lineWidth = 1;
  ctx.textAlign="right"; ctx.textBaseline="middle";
  for (let p=1;p<=maxPos;p++){
    const y = padT + (p-1) * (plotH / Math.max(1,(maxPos-1||1)));
    ctx.globalAlpha=.35; ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(W-padR,y); ctx.stroke();
    ctx.globalAlpha=1; ctx.fillText("P"+p, padL-8, y);
  }
  ctx.textAlign="center"; ctx.textBaseline="top";
  labels.forEach((lab,i)=>{
    const x = padL + (labels.length<=1 ? 0 : i*(plotW/(labels.length-1)));
    ctx.fillText("S"+lab, x, H-padB+8);
  });
  ctx.restore();
  // helpers
  const xAt = i => padL + (labels.length<=1 ? 0 : i*(plotW/(labels.length-1)));
  const yAt = pos => { if(!Number.isFinite(pos)) return null; const r=(pos-1)/Math.max(1,(maxPos-1||1)); return padT + r*plotH; };
  // lines
  series.forEach(ser=>{
    ctx.beginPath(); let started=false;
    ser.data.forEach((v,i)=>{ const x=xAt(i), y=yAt(v); if(y==null){ started=false; return; } if(!started){ ctx.moveTo(x,y); started=true; } else { ctx.lineTo(x,y); } });
    ctx.lineWidth=2; ctx.strokeStyle = ser.color || '#888'; ctx.stroke();
    ser.data.forEach((v,i)=>{ const y=yAt(v); if(y==null) return; const x=xAt(i); ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fillStyle=ser.color||'#888'; ctx.fill(); });
  });
  // legend
  const legend = document.getElementById("lifetimeLegend");
  if (legend){
    legend.innerHTML = "";
    series.forEach(s=>{
      const el = document.createElement("div");
      el.className="legend-item";
      el.innerHTML = `<span class="color-dot" style="background:${s.color||'#888'}"></span>${s.name}`;
      legend.appendChild(el);
    });
  }
}

function renderAll(){
  renderDrivers(); renderSchedule(); renderResults(); renderPointsAndRules();
  renderLeaderboard(); renderSeasonSummary(); drawPositionsChart(); renderLifetime();
}
