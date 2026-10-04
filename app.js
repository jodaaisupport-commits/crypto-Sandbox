/* 2D Crypto Sandbox — Trading + Physik + Mining (vanilla JS, kein Build) */
const COINS = {
  BTC:  { name: 'Bitcoin',  symbol: '₿', color: '#f7931a', price: 67200, vol: 0.010, radius: 26 },
  ETH:  { name: 'Ethereum', symbol: 'Ξ', color: '#627eea', price: 3520,  vol: 0.014, radius: 22 },
  SOL:  { name: 'Solana',   symbol: '◎', color: '#9945FF', price: 172,   vol: 0.020, radius: 18 },
  DOGE: { name: 'Dogecoin', symbol: 'Ð', color: '#d3b755', price: 0.162, vol: 0.028, radius: 15 },
};
const START_CASH = 5000;
const MAX_BODIES = 160;

let state = {
  cash: START_CASH,
  bodies: [],       // {id, coin, amount, x,y,vx,vy, r, born}
  prices: {},       // coin -> current price
  hist: {},         // coin -> [prices]
  equityHist: [],
  turbo: 1,
  rigs: { cpu: 0, gpu: 0, asic: 0, quantum: 0 },
  buildings: { garage: 0, halle: 0, solarpark: 0, rechenzentrum: 0 },
  research: { points: 8, done: {} }, // 8 Start-RP = genau eine Einstiegs-Forschung (CPU-Technik oder Baupläne)
  tick: 0, trend: 0, regime: 'sideways',
  pausedPhys: false, pausedMarket: false,
  selected: 'BTC', chartTab: 'equity', sellMode: false,
  gravity: 900, speed: 1,
  xp: 0, done: {}, playerName: '',
  counters: { buys: 0, buyVol: 0, sellVol: 0, handMined: 0, minersBought: 0, eventsFired: 0, giftsSent: 0, turboBuys: 0, maxNW: START_CASH },
};
Object.keys(COINS).forEach(k => { state.prices[k] = COINS[k].price; state.hist[k] = [COINS[k].price]; });

// ---------- helpers ----------
const $ = id => document.getElementById(id);
const fmt$ = n => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: n < 100 ? 2 : 0 });
const fmtP = (k, p = state.prices[k]) => p < 10 ? '$' + p.toFixed(3) : '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 });
function log(msg) {
  const li = document.createElement('li');
  li.innerHTML = `<b>${new Date().toLocaleTimeString('de-DE')}</b> ${msg}`;
  const ul = $('log'); ul.prepend(li);
  while (ul.children.length > 40) ul.lastChild.remove();
}
function save() {
  try { localStorage.setItem('crypto-sandbox-v1', JSON.stringify({ cash: state.cash, turbo: state.turbo, rigs: state.rigs, buildings: state.buildings, research: state.research, bodies: state.bodies.map(b => ({ coin: b.coin, amount: b.amount, x: b.x, y: b.y })), prices: state.prices, tick: state.tick, xp: state.xp, done: state.done, counters: state.counters, playerName: state.playerName })); } catch {}
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem('crypto-sandbox-v1'));
    if (!s) return false;
    state.cash = s.cash; state.turbo = s.turbo || 1; state.tick = s.tick || 0;
    if (s.rigs) state.rigs = Object.assign(state.rigs, s.rigs);
    else if (s.miners) state.rigs.cpu = s.miners; // Migration alter Spielstände
    if (s.buildings) state.buildings = Object.assign(state.buildings, s.buildings);
    if (s.research) { state.research.points = s.research.points || 0; state.research.done = s.research.done || {}; }
    state.xp = s.xp || 0; state.done = s.done || {}; state.playerName = s.playerName || '';
    if (s.counters) Object.assign(state.counters, s.counters);
    Object.assign(state.prices, s.prices || {});
    Object.keys(COINS).forEach(k => { state.hist[k] = [state.prices[k]]; });
    return s.bodies || [];
  } catch { return false; }
}

// ---------- Toasts ----------
function toast(msg, ms = 4200) {
  const box = $('toasts'); if (!box) return;
  const d = document.createElement('div');
  d.className = 'toast'; d.innerHTML = msg;
  box.appendChild(d);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => d.remove(), ms);
}

// ---------- Quests ----------
const QUESTS = [
  { id: 'first-buy', icon: '🛒', title: 'Erster Trade',       target: 1,     reward: 30,  xp: 20,  prog: () => state.counters.buys,                    unit: 'Käufe' },
  { id: 'diverse',   icon: '🌈', title: 'Diversifikation',    target: 4,     reward: 60,  xp: 40,  prog: () => new Set(state.bodies.map(b => b.coin)).size, unit: 'Coins' },
  { id: 'stack10',   icon: '🪙', title: 'Coin-Sammler',       target: 10,    reward: 60,  xp: 40,  prog: () => state.bodies.length,                  unit: 'Coins im Feld' },
  { id: 'rp20',      icon: '🔬', title: 'Tüftler',             target: 20,    reward: 50,  xp: 30,  prog: () => Math.floor(state.research.points),   unit: 'RP gesammelt' },
  { id: 'miner1',    icon: '🖥️', title: 'Rig-Start',          target: 1,     reward: 100, xp: 60,  prog: () => state.counters.minersBought,         unit: 'Miner' },
  { id: 'rig-up',    icon: '🎮', title: 'Aufrüsten',            target: 1,     reward: 120, xp: 80,  prog: () => (state.rigs.gpu || 0) + (state.rigs.asic || 0) + (state.rigs.quantum || 0), unit: 'High-End-Rigs' },
  { id: 'builder',   icon: '🏭', title: 'Bauherr',              target: 1,     reward: 100, xp: 60,  prog: () => Object.values(state.buildings).reduce((a, b) => a + b, 0), unit: 'Gebäude' },
  { id: 'forscher',  icon: '🔬', title: 'Forscher',             target: 1,     reward: 100, xp: 60,  prog: () => Object.keys(state.research.done).length, unit: 'Forschungen' },
  { id: 'seller',    icon: '💰', title: 'Profite sichern',    target: 800,   reward: 80,  xp: 50,  prog: () => Math.floor(state.counters.sellVol),  unit: '$ verkauft' },
  { id: 'events3',   icon: '🎪', title: 'Chaos-Pilot',        target: 3,     reward: 60,  xp: 40,  prog: () => state.counters.eventsFired,          unit: 'Events' },
  { id: 'moon11',    icon: '🌙', title: 'Auf dem Weg zum Mond', target: 6500, reward: 120, xp: 80, prog: () => Math.floor(state.counters.maxNW),   unit: '$ Vermögen' },
  { id: 'generous',  icon: '🎁', title: 'Gute Seele',         target: 1,     reward: 60,  xp: 50,  prog: () => state.counters.giftsSent,            unit: 'Gifts' },
  { id: 'whale',     icon: '🐋', title: 'Wal',                target: 12000, reward: 300, xp: 150, prog: () => Math.floor(state.counters.maxNW),   unit: '$ Vermögen' },
];
const levelOf = xp => 1 + Math.floor(xp / 150);
function addXP(n) {
  const before = levelOf(state.xp);
  state.xp += n;
  const after = levelOf(state.xp);
  if (after > before) {
    const bonus = 50 * after;
    state.cash += bonus;
    state.research.points += 5;
    toast(`⭐ <b>Level ${after}!</b> Bonus: ${fmt$(bonus)} + 5 RP`);
    log(`⭐ <b>Level ${after}</b> erreicht! Bonus ${fmt$(bonus)}`);
  }
  renderStats();
}
function checkQuests() {
  let changed = false;
  for (const q of QUESTS) {
    if (state.done[q.id]) continue;
    if (q.prog() >= q.target) {
      state.done[q.id] = true;
      state.cash += q.reward;
      toast(`${q.icon} Quest geschafft: <b>${q.title}</b> (+${fmt$(q.reward)}, +${q.xp} XP)`);
      log(`🎯 Quest <b>${q.title}</b> geschafft! +${fmt$(q.reward)}, +${q.xp} XP`);
      addXP(q.xp);
      changed = true;
    }
  }
  renderQuests();
  if (changed) { renderStats(); save(); }
}
function renderQuests() {
  const el = $('quests'); if (!el) return;
  const lvl = levelOf(state.xp), base = (lvl - 1) * 150;
  $('levelBadge').textContent = 'Lv ' + lvl;
  $('xpfill').style.width = Math.min(100, (state.xp - base) / 150 * 100) + '%';
  $('xptext').textContent = `${state.xp} XP · noch ${base + 150 - state.xp} bis Lv ${lvl + 1}`;
  el.innerHTML = '';
  for (const q of QUESTS) {
    const p = Math.min(q.target, q.prog()), done = !!state.done[q.id];
    const d = document.createElement('div');
    d.className = 'quest' + (done ? ' done' : '');
    d.innerHTML = `<div class="qhead">${q.icon} ${q.title} <span class="rw">${done ? '✅' : '+' + fmt$(q.reward)}</span></div>
      <div class="qbar"><div style="width:${p / q.target * 100}%"></div></div>
      <div class="qprog">${done ? 'Abgeschlossen' : p.toLocaleString('de-DE') + ' / ' + q.target.toLocaleString('de-DE') + ' ' + q.unit}</div>`;
    el.appendChild(d);
  }
}

// ---------- canvas / physik ----------
const cv = $('sandbox'), ctx = cv.getContext('2d');
const chart = $('chart'), cctx = chart.getContext('2d');
let cssW = 300, cssH = 480;
function dpr() { return Math.min(2, window.devicePixelRatio || 1); }
function resize() {
  const r = cv.getBoundingClientRect();
  cssW = Math.max(280, r.width); cssH = Math.max(300, r.height);
  cv.width = cssW * dpr(); cv.height = cssH * dpr();
  ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
  // Bodies nach Resize/Orientation-Wechsel im Feld halten
  for (const b of state.bodies) {
    b.x = Math.min(Math.max(b.x, b.r), Math.max(b.r, cssW - b.r));
    b.y = Math.min(b.y, Math.max(b.r, cssH - b.r));
  }
  const cw = chart.clientWidth || 300;
  chart.width = cw * dpr(); chart.height = 140 * dpr();
  cctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
  drawChart();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => resize());
if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(cv.parentElement);

const W = () => cssW;
const H = () => cssH;
let nextId = 1;
function spawnBody(coin, amount, x, y, vx = 0, vy = 0) {
  if (state.bodies.length >= MAX_BODIES) { const old = state.bodies.shift(); /* ältester Coin "verbrennt" */ }
  const r = COINS[coin].radius * (0.7 + Math.min(1, amount * state.prices[coin] / 2000) * 0.6);
  const ui = cssW < 480 ? 0.85 : 1; // Coins auf schmalen Displays etwas kleiner = mehr Übersicht
  state.bodies.push({ id: nextId++, coin, amount, x: x ?? Math.random() * (W() - 60) + 30, y: y ?? -30, vx, vy, r: Math.max(10, Math.min(30, r)) * ui, spin: Math.random() * 6.28, vr: (Math.random() - .5) * 3 });
}
function portfolioValue() { return state.bodies.reduce((s, b) => s + b.amount * state.prices[b.coin], 0); }
function netWorth() { return state.cash + portfolioValue(); }

function stepPhysics(dt) {
  const g = state.gravity * dt;
  for (const b of state.bodies) {
    b.vy += g; b.vx *= 0.999; b.vy *= 0.999; b.spin += b.vr * dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.75; }
    if (b.x > W() - b.r) { b.x = W() - b.r; b.vx = -Math.abs(b.vx) * 0.75; }
    if (b.y > H() - b.r) { b.y = H() - b.r; b.vy = -Math.abs(b.vy) * 0.72; b.vx *= 0.985; b.vr *= 0.99; }
    if (b.y < -200) { b.y = -200; b.vy = Math.abs(b.vy) * 0.5; }
  }
  // simple Kollisionen (n², aber n ≤ 160 ok)
  for (let i = 0; i < state.bodies.length; i++) for (let j = i + 1; j < state.bodies.length; j++) {
    const a = state.bodies[i], b = state.bodies[j];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
    if (d > 0 && d < min) {
      const nx = dx / d, ny = dy / d, overlap = (min - d) / 2;
      a.x -= nx * overlap; a.y -= ny * overlap; b.x += nx * overlap; b.y += ny * overlap;
      const rvx = b.vx - a.vx, rvy = b.vy - a.vy, rel = rvx * nx + rvy * ny;
      if (rel < 0) { const imp = -rel * 0.8; a.vx -= nx * imp / 2; a.vy -= ny * imp / 2; b.vx += nx * imp / 2; b.vy += ny * imp / 2; }
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, W(), H());
  // Boden-Glow + Grid
  const gr = ctx.createLinearGradient(0, 0, 0, H());
  gr.addColorStop(0, '#070a14'); gr.addColorStop(1, '#0e1430');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W(), H());
  ctx.strokeStyle = 'rgba(124,108,255,.12)'; ctx.lineWidth = 1;
  for (let x = 0; x < W(); x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H()); ctx.stroke(); }
  for (let y = 0; y < H(); y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W(), y); ctx.stroke(); }
  ctx.fillStyle = 'rgba(247,147,26,.5)'; ctx.fillRect(0, H() - 3, W(), 3);
  for (const b of state.bodies) {
    const c = COINS[b.coin];
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.sin(b.spin) * 0.25);
    ctx.shadowColor = c.color; ctx.shadowBlur = cssW < 600 ? 8 : 18;
    ctx.fillStyle = c.color; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, b.r - 2, 0, 7); ctx.stroke();
    ctx.fillStyle = '#111'; ctx.font = `900 ${b.r}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(c.symbol, 0, 2);
    ctx.restore();
    // Wert-Label (auf schmalen Screens nur Coin-Kürzel)
    const v = b.amount * state.prices[b.coin];
    ctx.fillStyle = '#fff'; ctx.font = '11px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(cssW < 480 ? b.coin : `${b.coin} · ${fmt$(v)}`, b.x, b.y + b.r + 12);
  }
  if (drag) {
    ctx.strokeStyle = '#f7931a'; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(drag.ox, drag.oy); ctx.lineTo(drag.x, drag.y); ctx.stroke(); ctx.setLineDash([]);
  }
}

// ---------- Mining-Tycoon: Rigs, Gebäude, Forschung ----------
const RIGS = {
  cpu:     { name: 'CPU-Miner',    icon: '🖥️', base: 400,   hash: 42,   req: 'cpu-technik' },
  gpu:     { name: 'GPU-Rig',      icon: '🎮', base: 2000,  hash: 220,  req: 'gpu' },
  asic:    { name: 'ASIC-Miner',   icon: '⚙️', base: 10000, hash: 1200, req: 'asic' },
  quantum: { name: 'Quantum-Miner', icon: '⚛️', base: 40000, hash: 6000, req: 'quantum' },
};
const BUILDINGS = {
  garage:        { name: 'Garage',         icon: '🏠', base: 800,   slots: 4,  mult: 0,    req: 'bauplaene' },
  halle:         { name: 'Mining-Halle',   icon: '🏭', base: 5000,  slots: 12, mult: 0.10, req: 'halle' },
  solarpark:     { name: 'Solarpark',      icon: '☀️', base: 12000, slots: 0,  mult: 0.15, req: 'solar', rp: true },
  rechenzentrum: { name: 'Rechenzentrum',  icon: '🏢', base: 20000, slots: 30, mult: 0.25, req: 'datacenter' },
};
const RESEARCH = {
  'cpu-technik': { name: 'CPU-Technik',     icon: '🖥️', cost: 8,   req: null,         desc: 'schaltet CPU-Miner frei' },
  bauplaene:     { name: 'Baupläne',        icon: '📐', cost: 8,   req: null,         desc: 'schaltet Garage frei' },
  grundlagen:    { name: 'Mining-Grundlagen', icon: '📖', cost: 15,  req: 'cpu-technik', desc: '+10% Ertrag' },
  gpu:           { name: 'GPU-Technik',     icon: '🎮', cost: 25,  req: 'grundlagen', desc: 'schaltet GPU-Rig frei' },
  effizienz1:    { name: 'Effizienz I',     icon: '💡', cost: 60,  req: 'gpu',        desc: '+25% Ertrag' },
  halle:         { name: 'Hallenbau',       icon: '🏭', cost: 40,  req: 'gpu',        desc: 'schaltet Mining-Halle frei' },
  turbo:         { name: 'Turbo-Technik',   icon: '⚡', cost: 30,  req: 'grundlagen', desc: 'schaltet Turbo-Upgrade frei' },
  solar:         { name: 'Solartechnik',    icon: '☀️', cost: 80,  req: 'halle',      desc: 'schaltet Solarpark frei' },
  asic:          { name: 'ASIC-Design',     icon: '⚙️', cost: 100, req: 'effizienz1', desc: 'schaltet ASIC-Miner frei' },
  datacenter:    { name: 'Rechenzentren',   icon: '🏢', cost: 150, req: 'asic',       desc: 'schaltet Rechenzentrum frei' },
  effizienz2:    { name: 'Effizienz II',    icon: '💡', cost: 200, req: 'asic',       desc: '+50% Ertrag' },
  quantum:       { name: 'Quanten-Chips',   icon: '⚛️', cost: 300, req: 'datacenter', desc: 'schaltet Quantum-Miner frei' },
};
const rigCost = k => Math.round(RIGS[k].base * Math.pow(1.8, state.rigs[k] || 0));
const buildCost = k => Math.round(BUILDINGS[k].base * Math.pow(2.0, state.buildings[k] || 0));
const turboCost = () => Math.round(500 * Math.pow(2, state.counters.turboBuys || 0));
const totalRigs = () => Object.values(state.rigs).reduce((a, b) => a + b, 0);
const totalHash = () => Object.keys(RIGS).reduce((s, k) => s + (state.rigs[k] || 0) * RIGS[k].hash, 0);
const maxSlots = () => 2 + (state.buildings.garage || 0) * 4 + (state.buildings.halle || 0) * 12 + (state.buildings.rechenzentrum || 0) * 30;
function earnMult() {
  const r = state.research.done, b = state.buildings;
  return 1 + (r.grundlagen ? 0.10 : 0) + (r.effizienz1 ? 0.25 : 0) + (r.effizienz2 ? 0.50 : 0)
    + (b.halle || 0) * 0.10 + (b.rechenzentrum || 0) * 0.25 + (b.solarpark || 0) * 0.15;
}
function buyRig(k) {
  const r = RIGS[k];
  if (r.req && !state.research.done[r.req]) { toast(`🔒 Erst forschen: <b>${RESEARCH[r.req].name}</b>`); return; }
  if (totalRigs() >= maxSlots()) { toast('⚠️ Keine freien Rig-Slots — baue Garagen/Hallen!'); return; }
  const c = rigCost(k);
  if (state.cash < c) { toast('⚠️ Nicht genug Cash für ' + r.name + '.'); return; }
  state.cash -= c; state.rigs[k]++;
  state.counters.minersBought++;
  log(`🔧 <b>${r.icon} ${r.name}</b> #${state.rigs[k]} online!`);
  renderStats(); renderMining(); checkQuests(); save();
}
function buyBuilding(k) {
  const b = BUILDINGS[k];
  if (b.req && !state.research.done[b.req]) { toast(`🔒 Erst forschen: <b>${RESEARCH[b.req].name}</b>`); return; }
  const c = buildCost(k);
  if (state.cash < c) { toast('⚠️ Nicht genug Cash für ' + b.name + '.'); return; }
  state.cash -= c; state.buildings[k]++;
  log(`🏗️ <b>${b.icon} ${b.name}</b> gebaut! (+${b.slots} Slots${b.mult ? ', +' + Math.round(b.mult * 100) + '% Ertrag' : ''})`);
  renderStats(); renderMining(); checkQuests(); save();
}
function buyResearch(id) {
  const r = RESEARCH[id];
  if (state.research.done[id]) return;
  if (r.req && !state.research.done[r.req]) { toast(`🔒 Benötigt: <b>${RESEARCH[r.req].name}</b>`); return; }
  if (state.research.points < r.cost) { toast(`⚠️ Brauchst <b>${r.cost} RP</b> (hast ${Math.floor(state.research.points)}).`); return; }
  state.research.points -= r.cost;
  state.research.done[id] = true;
  toast(`🔬 Erforscht: <b>${r.name}</b> — ${r.desc}!`);
  log(`🔬 Forschung <b>${r.name}</b> abgeschlossen!`);
  renderMining(); checkQuests(); save();
}
function updateMiningInfo() {
  const h = $('hashrate'); if (!h) return;
  h.textContent = `${Math.round(totalHash() * state.turbo)} H/s`;
  $('mineInfo').textContent = `Slots ${totalRigs()}/${maxSlots()} · 🔬 ${Math.floor(state.research.points)} RP · ×${(earnMult() * state.turbo).toFixed(2)} Ertrag`;
  const tv = $('turboVal'); if (tv) tv.textContent = state.turbo.toFixed(1);
  const tb = $('btnTurbo');
  if (tb) {
    if (!state.research.done.turbo) {
      tb.disabled = true; tb.style.opacity = 0.55;
      tb.textContent = '🔒 Turbo-Technik forschen';
    } else {
      tb.disabled = false; tb.style.opacity = '';
      tb.textContent = `Upgrade ${fmt$(turboCost())}`;
    }
  }
}
function rowBtn(disabled, label, fn) {
  const b = document.createElement('button');
  b.textContent = label; b.disabled = !!disabled;
  if (disabled) b.style.opacity = 0.55;
  else b.onclick = fn;
  return b;
}
function renderMining() {
  updateMiningInfo();
  // Rigs
  const rl = $('rigList'); rl.innerHTML = '';
  for (const k of Object.keys(RIGS)) {
    const r = RIGS[k], locked = r.req && !state.research.done[r.req];
    const d = document.createElement('div');
    d.className = 'shop' + (locked ? ' locked' : '');
    d.innerHTML = `<div>${r.icon} ${r.name} <span class="muted">×${state.rigs[k] || 0} · ${r.hash} H/s</span>${locked ? `<br><span class="muted">🔒 ${RESEARCH[r.req].name}</span>` : ''}</div>`;
    d.appendChild(rowBtn(locked, fmt$(rigCost(k)), () => buyRig(k)));
    rl.appendChild(d);
  }
  // Gebäude
  const bl = $('buildList'); bl.innerHTML = '';
  $('slotInfo').textContent = `${totalRigs()}/${maxSlots()}`;
  for (const k of Object.keys(BUILDINGS)) {
    const b = BUILDINGS[k], locked = b.req && !state.research.done[b.req];
    const d = document.createElement('div');
    d.className = 'shop' + (locked ? ' locked' : '');
    d.innerHTML = `<div>${b.icon} ${b.name} <span class="muted">×${state.buildings[k] || 0}</span><br><span class="muted">+${b.slots} Slots${b.mult ? ' · +' + Math.round(b.mult * 100) + '% Ertrag' : ''}${b.rp ? ' · +50% RP' : ''}</span>${locked ? `<br><span class="muted">🔒 ${RESEARCH[b.req].name}</span>` : ''}</div>`;
    d.appendChild(rowBtn(locked, fmt$(buildCost(k)), () => buyBuilding(k)));
    bl.appendChild(d);
  }
  // Forschung
  const fl = $('researchList'); fl.innerHTML = '';
  $('rpInfo').textContent = `${Math.floor(state.research.points)} RP`;
  for (const id of Object.keys(RESEARCH)) {
    const r = RESEARCH[id], done = !!state.research.done[id];
    const needReq = r.req && !state.research.done[r.req];
    const d = document.createElement('div');
    d.className = 'shop' + (done ? ' done' : needReq ? ' locked' : '');
    d.innerHTML = `<div>${r.icon} ${r.name}<br><span class="muted">${r.desc}${r.req && !done ? ' · braucht ' + RESEARCH[r.req].name : ''}</span></div>`;
    d.appendChild(rowBtn(done || needReq, done ? '✅' : `${r.cost} RP`, () => buyResearch(id)));
    fl.appendChild(d);
  }
}

// ---------- Markt-Simulation ----------
function marketTick() {
  state.tick++;
  $('tick').textContent = state.tick;
  // Regime wechseln
  if (Math.random() < 0.02) {
    state.regime = ['bull', 'bear', 'sideways', 'volatile'][Math.floor(Math.random() * 4)];
    state.trend = state.regime === 'bull' ? 0.004 : state.regime === 'bear' ? -0.004 : 0;
    if (state.regime !== 'sideways') log(`📡 Markt-Regime: <b>${state.regime.toUpperCase()}</b>`);
  }
  for (const k of Object.keys(COINS)) {
    const c = COINS[k];
    const shock = (Math.random() - 0.5) * 2 * c.vol * (state.regime === 'volatile' ? 2.5 : 1);
    state.prices[k] *= (1 + state.trend * (0.5 + Math.random()) + shock);
    state.prices[k] = Math.max(state.prices[k], COINS[k].price * 0.05);
    state.hist[k].push(state.prices[k]);
    if (state.hist[k].length > 300) state.hist[k].shift();
  }
  // Mining-Erträge (alle 5s, skaliert mit Hashleistung × Multiplikatoren)
  const hash = totalHash();
  if (hash > 0 && state.tick % 5 === 0) {
    const keys = Object.keys(COINS);
    const k = keys[Math.floor(Math.random() * keys.length)];
    const usd = hash * 0.22 * state.turbo * earnMult() * (0.8 + Math.random() * 0.4);
    spawnBody(k, usd / state.prices[k], undefined, -20, (Math.random() - .5) * 120, 0);
    state.research.points += hash / 250 * (1 + 0.5 * (state.buildings.solarpark || 0));
    log(`⛏️ Rigs haben <b>${fmt$(usd)} ${k}</b> geschürft (+${(hash / 250).toFixed(1)} RP)`);
    renderMining();
  }
  const eq = netWorth();
  state.counters.maxNW = Math.max(state.counters.maxNW, eq);
  state.equityHist.push(eq);
  if (state.equityHist.length > 300) state.equityHist.shift();
  renderMarket(); renderStats(); drawChart();
  checkQuests();
  if (state.tick % 5 === 0) { save(); if (window.NET) NET.sendStats(); }
}

function renderMarket() {
  const el = $('market'); el.innerHTML = '';
  for (const k of Object.keys(COINS)) {
    const h = state.hist[k], prev = h[h.length - 2] ?? h[0], p = state.prices[k];
    const chg = (p / h[0] - 1) * 100, tick = (p / prev - 1) * 100;
    const held = state.bodies.filter(b => b.coin === k).reduce((s, b) => s + b.amount, 0);
    const row = document.createElement('div'); row.className = 'mrow';
    row.innerHTML = `<div class="icon" style="background:${COINS[k].color}">${COINS[k].symbol}</div>
      <div><div class="name">${k} <span class="muted">· ${held.toFixed(held < 1 ? 4 : 2)} im Feld</span></div>
      <div class="price">${fmtP(k)} <span class="chg ${tick >= 0 ? 'up' : 'down'}">${tick >= 0 ? '▲' : '▼'} ${Math.abs(tick).toFixed(2)}% · ${chg >= 0 ? '+' : ''}${chg.toFixed(1)}% Sess.</span></div>
      <div class="rowbtns"><button data-buy="${k}">Kaufen $100</button><button data-sell="${k}">1 Coin verkaufen</button></div></div>`;
    el.appendChild(row);
  }
  el.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => buyCoin(b.dataset.buy, 100));
  el.querySelectorAll('[data-sell]').forEach(b => b.onclick = () => sellCoin(b.dataset.sell, 1));
}

function renderStats() {
  const pf = portfolioValue(), nw = state.cash + pf, ret = (nw / START_CASH - 1) * 100;
  $('cash').textContent = fmt$(state.cash);
  $('portfolio').textContent = fmt$(pf);
  $('networth').textContent = fmt$(nw);
  const pnl = $('pnl'); pnl.textContent = `${ret >= 0 ? '+' : ''}${ret.toFixed(1)}%`;
  pnl.className = ret >= 0 ? 'pos' : 'neg';
  $('coinCount').textContent = state.bodies.length;
  updateMiningInfo();
}

function drawChart() {
  const data = state.chartTab === 'equity' ? state.equityHist : state.hist[state.chartTab];
  const w = chart.clientWidth, h = 140;
  cctx.clearRect(0, 0, w, h);
  if (data.length < 2) return;
  const min = Math.min(...data), max = Math.max(...data), rng = (max - min) || 1;
  const up = data[data.length - 1] >= data[0];
  cctx.strokeStyle = state.chartTab === 'equity' ? (up ? '#22c55e' : '#ef4444') : COINS[state.chartTab].color;
  cctx.lineWidth = 2; cctx.beginPath();
  data.forEach((v, i) => { const x = i / (data.length - 1) * (w - 8) + 4, y = h - 8 - (v - min) / rng * (h - 24); i ? cctx.lineTo(x, y) : cctx.moveTo(x, y); });
  cctx.stroke();
  cctx.fillStyle = '#8b94b3'; cctx.font = '11px system-ui';
  const last = data[data.length - 1];
  cctx.fillText(state.chartTab === 'equity' ? fmt$(last) : fmtP(state.chartTab, last), 8, 14);
}

// ---------- Aktionen ----------
function buyCoin(coin, usd) {
  usd = Math.min(usd, state.cash);
  if (usd < 1) { log('⚠️ Kein Cash mehr — verkaufe Coins (antippen / Doppelklick) oder resette.'); return; }
  state.cash -= usd;
  spawnBody(coin, usd / state.prices[coin], undefined, -20, (Math.random() - .5) * 160, 0);
  state.counters.buys++; state.counters.buyVol += usd;
  log(`🛒 <b>${fmt$(usd)} ${coin}</b> gekauft @ ${fmtP(coin)}`);
  renderStats(); checkQuests(); save();
}
function sellCoin(coin, n = 1) {
  const mine = state.bodies.filter(b => b.coin === coin).slice(-n);
  if (!mine.length) { log(`⚠️ Keine ${coin}-Coins im Feld.`); return; }
  let got = 0;
  for (const b of mine) { got += b.amount * state.prices[coin]; state.bodies.splice(state.bodies.indexOf(b), 1); }
  state.cash += got;
  state.counters.sellVol += got;
  log(`💰 <b>${fmt$(got)} ${coin}</b> verkauft`);
  renderStats(); checkQuests(); save();
}
function sellAll() {
  if (!state.bodies.length) return;
  const got = portfolioValue();
  state.cash += got; state.bodies = [];
  state.counters.sellVol += got;
  log(`💰 Alles verkauft: <b>${fmt$(got)}</b>`);
  renderStats(); checkQuests(); save();
}

// Sandbox-Events (lokal + per Broadcast an Peers teilbar)
function doMoon(by) {
  for (const k of Object.keys(COINS)) state.prices[k] *= 1.25;
  state.counters.eventsFired++;
  log(by ? `🌙 <b>${by}</b> hat TO THE MOON ausgelöst! +25%` : '🌙 <b>TO THE MOON! +25%</b>');
  renderMarket(); checkQuests();
  if (!by && window.NET) NET.broadcast({ t: 'event', kind: 'moon' });
}
function doCrash(by) {
  for (const k of Object.keys(COINS)) state.prices[k] *= 0.8;
  state.counters.eventsFired++;
  log(by ? `📉 <b>${by}</b> hat einen CRASH ausgelöst! -20%` : '📉 <b>CRASH! -20%</b> Alles rot.');
  renderMarket(); checkQuests();
  if (!by && window.NET) NET.broadcast({ t: 'event', kind: 'crash' });
}
function doAirdrop(by) {
  for (let i = 0; i < 12; i++) { const keys = Object.keys(COINS), k = keys[Math.floor(Math.random() * keys.length)]; spawnBody(k, (10 + Math.random() * 40) / state.prices[k], undefined, -20 - i * 30, (Math.random() - .5) * 200, 0); }
  state.counters.eventsFired++;
  log(by ? `🎁 <b>${by}</b> hat einen AIRDROP geschickt!` : '🎁 <b>AIRDROP!</b> Gratis-Coins regnen vom Himmel.');
  checkQuests();
  if (!by && window.NET) NET.broadcast({ t: 'event', kind: 'airdrop' });
}
function doBoom(by) {
  for (const b of state.bodies) { b.vx += (Math.random() - .5) * 1200; b.vy -= Math.random() * 900; }
  state.counters.eventsFired++;
  log(by ? `💥 <b>${by}</b> hat die Sandbox durchgeschüttelt!` : '💥 <b>BOOM!</b> Sandbox durchgeschüttelt.');
  checkQuests();
  if (!by && window.NET) NET.broadcast({ t: 'event', kind: 'boom' });
}

// ---------- Events ----------
$('btnBuy').onclick = () => buyCoin(state.selected, Math.max(10, parseFloat($('buyAmount').value) || 100));
$('btnSellAll').onclick = sellAll;
$('btnSellMode').onclick = e => {
  state.sellMode = !state.sellMode;
  e.target.textContent = state.sellMode ? '💰 Verkaufen' : '✋ Schubsen';
  e.target.classList.toggle('gold-active', state.sellMode);
  cv.style.cursor = state.sellMode ? 'pointer' : 'crosshair';
};
$('btnTurbo').onclick = () => {
  if (!state.research.done.turbo) { toast('🔒 Erst <b>Turbo-Technik</b> erforschen!'); return; }
  const c = turboCost();
  if (state.cash < c) { log('⚠️ Nicht genug Cash für Turbo.'); return; }
  state.cash -= c; state.turbo *= 1.5;
  state.counters.turboBuys = (state.counters.turboBuys || 0) + 1;
  log(`⚡ Turbo-Upgrade! Ertrag ×${state.turbo.toFixed(1)}`);
  renderStats(); renderMining(); save();
};
$('btnMoon').onclick = () => doMoon();
$('btnCrash').onclick = () => doCrash();
$('btnAirdrop').onclick = () => doAirdrop();
$('btnBoom').onclick = () => doBoom();
$('btnReset').onclick = () => { if (confirm(`Wirklich neu starten mit ${fmt$(START_CASH)}?`)) { localStorage.removeItem('crypto-sandbox-v1'); location.reload(); } };
$('btnPausePhys').onclick = e => { state.pausedPhys = !state.pausedPhys; e.target.textContent = state.pausedPhys ? '▶ Physik' : '⏸ Physik'; };
$('btnPauseMarket').onclick = e => { state.pausedMarket = !state.pausedMarket; e.target.textContent = state.pausedMarket ? '▶ Markt' : '⏸ Markt'; $('liveDot').textContent = state.pausedMarket ? '○ PAUSE' : '● LIVE'; $('liveDot').classList.toggle('paused', state.pausedMarket); };
$('gravity').oninput = e => { state.gravity = +e.target.value; $('gravityVal').textContent = e.target.value; };
$('speed').oninput = e => { state.speed = +e.target.value / 100; $('speedVal').textContent = (+e.target.value / 100).toFixed(1) + '×'; };
document.querySelectorAll('[data-chart]').forEach(b => b.onclick = () => { document.querySelectorAll('[data-chart]').forEach(x => x.classList.remove('active')); b.classList.add('active'); state.chartTab = b.dataset.chart; drawChart(); });
$('hintClose').onclick = () => $('hint').remove();

// ---------- Multiplayer-UI ----------
$('btnHost').onclick = () => NET.hostInvite();
$('btnNewInvite').onclick = () => NET.hostInvite();
$('btnAccept').onclick = () => NET.acceptAnswer();
$('btnJoin').onclick = () => NET.joinInvite();
$('btnCopyHost').onclick = () => copyText('hostCode');
$('btnCopyAnswer').onclick = () => copyText('myAnswer');
$('btnChat').onclick = () => NET.sendChat();
$('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') NET.sendChat(); });
$('playerName').addEventListener('change', e => {
  state.playerName = e.target.value.trim().slice(0, 16);
  save(); NET.renderPeers();
  NET.broadcast({ t: 'hello', name: myName() });
});

// Coin-Auswahl
function renderCoinSelect() {
  const el = $('coinSelect'); el.innerHTML = '';
  for (const k of Object.keys(COINS)) {
    const b = document.createElement('button');
    b.textContent = `${COINS[k].symbol} ${k}`; b.className = k === state.selected ? 'active' : '';
    b.onclick = () => { state.selected = k; renderCoinSelect(); };
    el.appendChild(b);
  }
}

// ---------- Maus-/Touch-Interaktion ----------
let drag = null, downPos = null, downTime = 0, downTouch = false;
function pos(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function bodyAt(x, y) { for (let i = state.bodies.length - 1; i >= 0; i--) { const b = state.bodies[i]; if (Math.hypot(b.x - x, b.y - y) < b.r + 10) return b; } return null; }
function sellBody(b, how) {
  const v = b.amount * state.prices[b.coin];
  state.cash += v; state.bodies.splice(state.bodies.indexOf(b), 1);
  state.counters.sellVol += v;
  log(`💰 <b>${b.coin}</b> ${how} verkauft: ${fmt$(v)}`);
  renderStats(); checkQuests(); save();
}
cv.addEventListener('pointerdown', e => {
  try { cv.setPointerCapture(e.pointerId); } catch {}
  const p = pos(e); const b = bodyAt(p.x, p.y);
  downPos = p; downTime = Date.now(); downTouch = e.pointerType !== 'mouse';
  if (b) drag = { b, x: p.x, y: p.y, ox: p.x, oy: p.y, moved: false };
  else drag = { pan: true, x: p.x, y: p.y, ox: p.x, oy: p.y, moved: false };
});
cv.addEventListener('pointermove', e => {
  if (!drag) return; const p = pos(e);
  if (Math.hypot(p.x - drag.ox, p.y - drag.oy) > 10) drag.moved = true;
  if (drag.b) { drag.b.x = p.x; drag.b.y = p.y; drag.b.vx = (p.x - drag.x) * 12; drag.b.vy = (p.y - drag.y) * 12; }
  drag.x = p.x; drag.y = p.y;
});
cv.addEventListener('pointerup', e => {
  const p = pos(e);
  const quickTap = drag && !drag.moved && Date.now() - downTime < 400;
  if (quickTap && drag.b) {
    // Touch: kurzer Tap auf Coin = verkaufen (Desktop: Doppelklick, s.u.);
    // im 💰-Verkaufsmodus verkauft jeder Klick/Tap.
    if (downTouch || state.sellMode) sellBody(drag.b, downTouch ? 'per Tap' : 'per Klick');
  } else if (quickTap && !drag.b) {
    // Leeres Feld antippen = schubsen
    for (const b of state.bodies) { const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < 160) { b.vx += (b.x - p.x) / (d + 20) * 500; b.vy -= 300 / (d / 60 + 1); } }
  }
  if (drag) drag.b = null;
  drag = null;
});
cv.addEventListener('pointercancel', () => { drag = null; });
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('dblclick', e => {
  const p = pos(e); const b = bodyAt(p.x, p.y);
  if (b) sellBody(b, 'per Doppelklick');
});

// ---------- Multiplayer (WebRTC P2P, serverlos: nur STUN zur NAT-Erkennung) ----------
const NET = window.NET = {
  peers: new Map(),  // id -> {id, pc, dc, name, nw, open}
  pending: [],       // Host-Einladungen, die noch auf Antwort warten
  seq: 1,
};
const RTC_CONF = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
function myName() {
  const v = ($('playerName') && $('playerName').value || '').trim().slice(0, 16);
  return v || state.playerName || ('Spieler-' + Math.floor(1000 + Math.random() * 9000));
}
NET.encode = desc => btoa(JSON.stringify(desc));
NET.decode = code => JSON.parse(atob(code.trim()));
NET.waitGathering = pc => new Promise(res => {
  if (pc.iceGatheringState === 'complete') return res(pc.localDescription);
  const to = setTimeout(() => { pc.removeEventListener('icegatheringstatechange', on); res(pc.localDescription); }, 5000);
  function on() { if (pc.iceGatheringState === 'complete') { clearTimeout(to); pc.removeEventListener('icegatheringstatechange', on); res(pc.localDescription); } }
  pc.addEventListener('icegatheringstatechange', on);
});
NET.makePC = peer => {
  const pc = new RTCPeerConnection(RTC_CONF);
  peer.pc = pc;
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
      peer.open = false; NET.renderPeers(); NET.updateStatus();
    }
  };
  return pc;
};
NET.attachDC = (peer, dc) => {
  peer.dc = dc;
  dc.onopen = () => {
    peer.open = true;
    dc.send(JSON.stringify({ t: 'hello', name: myName() }));
    dc.send(JSON.stringify({ t: 'stats', nw: Math.round(netWorth()) }));
    toast(`🌐 <b>${peer.name}</b> verbunden!`);
    log(`🌐 Peer <b>${peer.name}</b> verbunden`);
    NET.renderPeers(); NET.updateStatus();
  };
  dc.onmessage = e => { try { NET.onMessage(peer, JSON.parse(e.data)); } catch {} };
  dc.onclose = () => { peer.open = false; NET.renderPeers(); NET.updateStatus(); };
};
NET.onMessage = (peer, m) => {
  if (m.t === 'hello') { peer.name = String(m.name || 'Spieler').slice(0, 16); NET.renderPeers(); }
  else if (m.t === 'stats') { peer.nw = +m.nw || 0; NET.renderPeers(); }
  else if (m.t === 'event') {
    if (m.kind === 'moon') doMoon(peer.name);
    else if (m.kind === 'crash') doCrash(peer.name);
    else if (m.kind === 'airdrop') doAirdrop(peer.name);
    else if (m.kind === 'boom') doBoom(peer.name);
    toast(`🌐 <b>${peer.name}</b>: ${m.kind === 'moon' ? '🌙 MOON!' : m.kind === 'crash' ? '📉 CRASH!' : m.kind === 'airdrop' ? '🎁 AIRDROP!' : '💥 BOOM!'}`);
  }
  else if (m.t === 'gift') {
    const coin = COINS[m.coin] ? m.coin : 'BTC', usd = Math.min(500, Math.max(1, +m.usd || 0));
    spawnBody(coin, usd / state.prices[coin], undefined, -20, (Math.random() - .5) * 160, 0);
    toast(`🎁 <b>${peer.name}</b> schenkt dir ${fmt$(usd)} ${coin}!`);
    log(`🎁 Gift von <b>${peer.name}</b>: ${fmt$(usd)} ${coin}`);
    renderStats();
  }
  else if (m.t === 'chat') { NET.chat(String(m.text || '').slice(0, 120), peer.name, false); }
};
NET.broadcast = obj => {
  const s = JSON.stringify(obj);
  for (const p of NET.peers.values()) if (p.open && p.dc) { try { p.dc.send(s); } catch {} }
};
NET.sendStats = () => NET.broadcast({ t: 'stats', nw: Math.round(netWorth()) });
NET.hostInvite = async () => {
  try {
    const peer = { id: 'p' + (NET.seq++), pc: null, dc: null, name: 'Einladung…', nw: 0, open: false };
    const pc = NET.makePC(peer);
    NET.attachDC(peer, pc.createDataChannel('sandbox'));
    await pc.setLocalDescription(await pc.createOffer());
    $('hostCode').value = NET.encode(await NET.waitGathering(pc));
    NET.peers.set(peer.id, peer); NET.pending.push(peer);
    NET.renderPeers(); NET.updateStatus();
    toast('✉️ Einladungs-Code bereit — kopieren & per Messenger teilen!');
  } catch (err) { toast('⚠️ Host fehlgeschlagen: ' + err.message); }
};
NET.acceptAnswer = async () => {
  try {
    const peer = NET.pending.find(p => !p.pc.remoteDescription);
    if (!peer) { toast('⚠️ Keine offene Einladung — erst „Raum erstellen".'); return; }
    await peer.pc.setRemoteDescription(NET.decode($('answerCode').value));
    $('answerCode').value = '';
    toast('🤝 Antwort angenommen — verbinde …');
  } catch { toast('⚠️ Ungültiger Antwort-Code.'); }
};
NET.joinInvite = async () => {
  try {
    const peer = { id: 'p' + (NET.seq++), pc: null, dc: null, name: 'Host…', nw: 0, open: false };
    const pc = NET.makePC(peer);
    pc.ondatachannel = e => NET.attachDC(peer, e.channel);
    await pc.setRemoteDescription(NET.decode($('joinCode').value));
    await pc.setLocalDescription(await pc.createAnswer());
    $('myAnswer').value = NET.encode(await NET.waitGathering(pc));
    NET.peers.set(peer.id, peer);
    NET.renderPeers(); NET.updateStatus();
    toast('✉️ Antwort-Code bereit — an den Host zurückschicken!');
  } catch { toast('⚠️ Ungültiger Einladungs-Code.'); }
};
NET.gift = id => {
  const peer = NET.peers.get(id);
  if (!peer || !peer.open) { toast('⚠️ Peer nicht verbunden.'); return; }
  const usd = 25;
  if (state.cash < usd) { toast('⚠️ Nicht genug Cash zum Schenken.'); return; }
  state.cash -= usd;
  try { peer.dc.send(JSON.stringify({ t: 'gift', coin: state.selected, usd, from: myName() })); } catch { toast('⚠️ Senden fehlgeschlagen.'); return; }
  state.counters.giftsSent++;
  log(`🎁 <b>${fmt$(usd)} ${state.selected}</b> an ${peer.name} verschenkt`);
  renderStats(); checkQuests(); save();
};
NET.chat = (text, from, me) => {
  text = String(text || '').slice(0, 120).trim();
  if (!text) return;
  const box = $('chatlog');
  const d = document.createElement('div');
  d.className = 'msg' + (me ? ' me' : '');
  d.innerHTML = `<b>${me ? 'Du' : from}:</b> `;
  d.appendChild(document.createTextNode(text));
  box.appendChild(d);
  while (box.children.length > 30) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
};
NET.sendChat = () => {
  const inp = $('chatInput'), text = inp.value.trim().slice(0, 120);
  if (!text) return;
  inp.value = '';
  NET.chat(text, myName(), true);
  NET.broadcast({ t: 'chat', from: myName(), text });
};
NET.drop = id => {
  const peer = NET.peers.get(id);
  if (peer) { try { peer.pc.close(); } catch {} NET.peers.delete(id); }
  NET.pending = NET.pending.filter(p => p.id !== id);
  NET.renderPeers(); NET.updateStatus();
};
NET.renderPeers = () => {
  const el = $('peers'); if (!el) return;
  el.innerHTML = '';
  const rows = [{ me: true, name: myName() + ' (Du)', nw: Math.round(netWorth()) }];
  for (const p of NET.peers.values()) rows.push(p);
  rows.sort((a, b) => (b.nw || 0) - (a.nw || 0));
  rows.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'peer';
    if (p.me) {
      d.innerHTML = `<span class="dot">${i === 0 ? '👑' : '●'}</span><b></b><span class="nw"></span>`;
      d.querySelector('b').textContent = p.name;
      d.querySelector('.nw').textContent = fmt$(p.nw);
    } else {
      d.innerHTML = `<span class="dot">●</span><b></b><span class="nw"></span>`;
      d.querySelector('b').textContent = (p.open ? '' : '⏳ ') + p.name;
      d.querySelector('.nw').textContent = p.nw ? fmt$(p.nw) : '–';
      d.querySelector('.dot').style.color = p.open ? '' : '#8b94b3';
      if (p.open) {
        const g = document.createElement('button');
        g.textContent = '🎁 $25';
        g.title = `${state.selected} schenken`;
        g.onclick = () => NET.gift(p.id);
        d.appendChild(g);
      }
      const x = document.createElement('button');
      x.textContent = '✖'; x.title = 'Trennen';
      x.onclick = () => NET.drop(p.id);
      d.appendChild(x);
    }
    el.appendChild(d);
  });
};
NET.updateStatus = () => {
  const n = [...NET.peers.values()].filter(p => p.open).length;
  const el = $('mpStatus');
  el.textContent = n ? `🟢 ${n} verbunden` : '🔴 offline';
};
function copyText(id) {
  const ta = $(id);
  if (!ta || !ta.value) { toast('⚠️ Kein Code zum Kopieren.'); return; }
  (navigator.clipboard ? navigator.clipboard.writeText(ta.value) : Promise.reject())
    .then(() => toast('📋 Code kopiert!'))
    .catch(() => { ta.select(); try { document.execCommand('copy'); toast('📋 Code kopiert!'); } catch { toast('⚠️ Kopieren fehlgeschlagen — manuell markieren.'); } });
}

// ---------- Loops ----------
let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!state.pausedPhys) { stepPhysics(dt * state.speed); }
  draw();
  requestAnimationFrame(frame);
}

// ---------- Init ----------
(function init() {
  resize();
  renderCoinSelect(); renderMarket(); renderStats(); renderQuests();
  if (state.playerName) $('playerName').value = state.playerName;
  const saved = load();
  if (Array.isArray(saved) && saved.length) {
    for (const s of saved.slice(-MAX_BODIES)) spawnBody(s.coin, s.amount, Math.min(Math.max(s.x || 100, 20), W() - 20), Math.min(s.y ?? 100, H() - 30));
    log(`💾 Spielstand geladen: <b>${fmt$(netWorth())}</b> Vermögen`);
  } else {
    // Start-Demo: je 1 Coin jeder Sorte
    buyCoin('BTC', 800); buyCoin('ETH', 400); buyCoin('SOL', 200); buyCoin('DOGE', 100);
    state.cash = START_CASH - 1500;
    log('👋 Willkommen in der <b>2D Crypto Sandbox</b>! Deine Coins sind dein Wallet.');
    log('💡 Tipp: Coins <b>ziehen & werfen</b>, antippen/Doppelklick = verkaufen.');
    if ('ontouchstart' in window) {
      const ht = $('hintText');
      if (ht) ht.innerHTML = '👆 Tippe ins Feld zum <b>Schubsen</b> · Coin <b>ziehen</b> zum Werfen · <b>Coin antippen</b> = verkaufen · Kaufen lässt Coins von oben regnen!';
    }
  }
  renderStats(); renderMarket();
  NET.renderPeers(); NET.updateStatus();
  renderMining();
  setInterval(() => { if (!state.pausedMarket) marketTick(); }, 1000);
  setInterval(save, 10000);
  requestAnimationFrame(frame);
})();
