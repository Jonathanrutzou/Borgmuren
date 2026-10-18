// Borgmuren – topdown borgforsvar. Ingen grafik, kun simple former.
'use strict';

const COLS = 32, ROWS = 24;          // iPad 4:3 landscape
const EMPTY = 0, WALL = 1, CASTLE = 2;

// Alle tal samlet her, så de kan justeres fra Balance-tabellen i Notion.
const CONFIG = {
  castleHp: 20,
  castle: { x: 29, y: 9, w: 3, h: 6 },
  hero: { hp: 20, damage: 2, attacksPerSec: 2, speed: 4, guardRange: 6, respawnSec: 5 },
  wall: { hp: 3, startBricks: 60, bricksPerWave: 20, pathCost: 6 },
  monsters: {
    blue: { hp: 3, damage: 1, speed: 1.5, color: '#3b82f6' },
    red:  { hp: 5, damage: 2, speed: 1.0, color: '#ef4444' },
  },
  monsterAttackSec: 1.0,
  spawnIntervalSec: 1.0,
};

// Hvilke væsner der kommer i bølge n (1, 2, 3 ...).
function waveMonsters(n) {
  const list = [];
  const blue = 3 + 2 * n, red = 1 + n;
  for (let i = 0; i < blue; i++) list.push('blue');
  for (let i = 0; i < red; i++) list.push('red');
  // bland rækkefølgen
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// ---------- tilstand ----------
const idx = (x, y) => y * COLS + x;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

let state;

function newGame() {
  const grid = new Uint8Array(COLS * ROWS);
  const c = CONFIG.castle;
  for (let y = c.y; y < c.y + c.h; y++)
    for (let x = c.x; x < c.x + c.w; x++) grid[idx(x, y)] = CASTLE;
  state = {
    grid,
    wallHp: new Uint8Array(COLS * ROWS),
    phase: 'build',          // 'build' | 'wave' | 'over'
    wave: 1,
    bricks: CONFIG.wall.startBricks,
    castleHp: CONFIG.castleHp,
    hero: makeHero(c.x - 2.5, c.y + c.h / 2),
    monsters: [],
    spawnQueue: [],
    spawnTimer: 0,
    field: null,
    tool: 'wall',
  };
  recomputeField();
}

function makeHero(x, y) {
  return { x, y, gx: x, gy: y, hp: CONFIG.hero.hp, alive: true, cooldown: 0, respawn: 0 };
}

// ---------- vejfinding ----------
// Afstandsfelt til borgen. Mure kan passeres, men koster ekstra (= monstret slår sig igennem).
function enterCost(i) {
  return 1 + (state.grid[i] === WALL ? CONFIG.wall.pathCost : 0);
}

function recomputeField() {
  const n = COLS * ROWS;
  const dist = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (state.grid[i] === CASTLE) dist[i] = 0;
  // Simpel Dijkstra – gitteret er kun 768 felter.
  for (;;) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; best = i; }
    if (best < 0) break;
    done[best] = 1;
    const bx = best % COLS, by = (best / COLS) | 0;
    const cost = state.grid[best] === CASTLE ? 1 : enterCost(best);
    for (const [dx, dy] of DIRS) {
      const nx = bx + dx, ny = by + dy;
      if (!inBounds(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (state.grid[ni] === CASTLE) continue;
      const d = bd + cost;
      if (d < dist[ni]) dist[ni] = d;
    }
  }
  state.field = dist;
}

// Er der en åben vej (uden mure) fra venstre kant til borgen?
function hasOpening() {
  const seen = new Uint8Array(COLS * ROWS);
  const q = [];
  for (let y = 0; y < ROWS; y++) if (state.grid[idx(0, y)] === EMPTY) { seen[idx(0, y)] = 1; q.push(idx(0, y)); }
  while (q.length) {
    const i = q.shift();
    const x = i % COLS, y = (i / COLS) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (state.grid[ni] === CASTLE) return true;
      if (!seen[ni] && state.grid[ni] === EMPTY) { seen[ni] = 1; q.push(ni); }
    }
  }
  return false;
}

// Næste felt på korteste vej for helten (mure og borg kan ikke passeres).
function heroNextCell(fromX, fromY, toX, toY) {
  const start = idx(toX, toY);
  const prev = new Int32Array(COLS * ROWS).fill(-1);
  prev[start] = start;
  const q = [start];
  const goal = idx(fromX, fromY);
  while (q.length) {
    const i = q.shift();
    if (i === goal) break;
    const x = i % COLS, y = (i / COLS) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (prev[ni] !== -1 || state.grid[ni] !== EMPTY) continue;
      prev[ni] = i;
      q.push(ni);
    }
  }
  if (prev[goal] === -1) return null;
  const next = prev[goal];
  return { x: next % COLS, y: (next / COLS) | 0 };
}

// ---------- bølger ----------
function startWave() {
  if (state.phase !== 'build' || !hasOpening()) return;
  state.phase = 'wave';
  state.spawnQueue = waveMonsters(state.wave);
  state.spawnTimer = 0;
  recomputeField();
}

function endWave() {
  state.phase = 'build';
  state.wave++;
  state.bricks += CONFIG.wall.bricksPerWave;
  const h = state.hero;
  h.alive = true; h.hp = CONFIG.hero.hp; h.respawn = 0;
  h.x = h.gx; h.y = h.gy;
}

function spawnMonster(kind) {
  const free = [];
  for (let y = 0; y < ROWS; y++) if (state.grid[idx(0, y)] !== WALL) free.push(y);
  const y = free.length ? free[Math.floor(Math.random() * free.length)] : Math.floor(Math.random() * ROWS);
  const s = CONFIG.monsters[kind];
  state.monsters.push({ kind, x: 0.5, y: y + 0.5, hp: s.hp, maxHp: s.hp, cooldown: 0, target: null });
}

// ---------- opdatering ----------
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function moveToward(o, tx, ty, speed, dt) {
  const dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy);
  const step = speed * dt;
  if (d <= step) { o.x = tx; o.y = ty; return true; }
  o.x += dx / d * step; o.y += dy / d * step;
  return false;
}

function update(dt) {
  if (state.phase !== 'wave') return;

  // spawn
  state.spawnTimer -= dt;
  if (state.spawnQueue.length && state.spawnTimer <= 0) {
    spawnMonster(state.spawnQueue.shift());
    state.spawnTimer = CONFIG.spawnIntervalSec;
  }

  updateHero(dt);
  for (const m of state.monsters) updateMonster(m, dt);
  state.monsters = state.monsters.filter(m => m.hp > 0 && !m.done);

  if (state.castleHp <= 0) { state.castleHp = 0; state.phase = 'over'; return; }
  if (!state.spawnQueue.length && !state.monsters.length) endWave();
}

function updateHero(dt) {
  const h = state.hero, cfg = CONFIG.hero;
  if (!h.alive) {
    h.respawn -= dt;
    if (h.respawn <= 0) { h.alive = true; h.hp = cfg.hp; h.x = h.gx; h.y = h.gy; }
    return;
  }
  h.cooldown -= dt;

  // nærmeste monster inden for vagtområdet
  let target = null, best = Infinity;
  for (const m of state.monsters) {
    if (Math.hypot(m.x - h.gx, m.y - h.gy) > cfg.guardRange) continue;
    const d = dist2(h, m);
    if (d < best) { best = d; target = m; }
  }

  if (target && best < 0.9) {
    if (h.cooldown <= 0) { target.hp -= cfg.damage; h.cooldown = 1 / cfg.attacksPerSec; }
    return;
  }
  const goal = target ? { x: target.x, y: target.y } : { x: h.gx, y: h.gy };
  walkHero(h, goal.x, goal.y, cfg.speed, dt);
}

function walkHero(h, tx, ty, speed, dt) {
  const hx = Math.floor(h.x), hy = Math.floor(h.y);
  const gx = Math.floor(tx), gy = Math.floor(ty);
  if (hx === gx && hy === gy) { moveToward(h, tx, ty, speed, dt); return; }
  const target = inBounds(gx, gy) && state.grid[idx(gx, gy)] === EMPTY ? { gx, gy } : null;
  const next = target && heroNextCell(hx, hy, gx, gy);
  if (next) moveToward(h, next.x + 0.5, next.y + 0.5, speed, dt);
}

function updateMonster(m, dt) {
  const s = CONFIG.monsters[m.kind];
  m.cooldown -= dt;

  // slås med helten, hvis den står lige ved siden af
  const h = state.hero;
  if (h.alive && dist2(h, m) < 0.8) {
    if (m.cooldown <= 0) {
      h.hp -= s.damage; m.cooldown = CONFIG.monsterAttackSec;
      if (h.hp <= 0) { h.alive = false; h.respawn = CONFIG.hero.respawnSec; }
    }
    return;
  }

  if (!m.target) m.target = chooseNext(m);
  if (!m.target) return;
  const t = m.target, ti = idx(t.x, t.y);

  if (state.grid[ti] === WALL) {
    if (m.cooldown <= 0) {
      m.cooldown = CONFIG.monsterAttackSec;
      state.wallHp[ti] = Math.max(0, state.wallHp[ti] - s.damage);
      if (state.wallHp[ti] === 0) { state.grid[ti] = EMPTY; recomputeField(); }
    }
    return;
  }

  if (moveToward(m, t.x + 0.5, t.y + 0.5, s.speed, dt)) {
    if (state.grid[ti] === CASTLE) { state.castleHp -= s.damage; m.done = true; }
    m.target = null;
  } else if (state.grid[ti] === CASTLE && dist2(m, { x: t.x + 0.5, y: t.y + 0.5 }) < 0.6) {
    state.castleHp -= s.damage; m.done = true;
  }
}

function chooseNext(m) {
  const cx = Math.floor(m.x), cy = Math.floor(m.y);
  let best = null, bd = Infinity;
  for (const [dx, dy] of DIRS) {
    const nx = cx + dx, ny = cy + dy;
    if (!inBounds(nx, ny)) continue;
    const ni = idx(nx, ny);
    const d = state.grid[ni] === CASTLE ? 0 : state.field[ni] + enterCost(ni);
    if (d < bd) { bd = d; best = { x: nx, y: ny }; }
  }
  return best;
}

// ---------- input ----------
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let tile = 20;
let dragMode = null;

function cellAt(ev) {
  const r = canvas.getBoundingClientRect();
  return { x: Math.floor((ev.clientX - r.left) / tile), y: Math.floor((ev.clientY - r.top) / tile) };
}

function applyBuild(c) {
  if (!inBounds(c.x, c.y)) return;
  const i = idx(c.x, c.y);
  const g = state.grid[i];
  if (g === CASTLE) return;
  if (dragMode === 'paint' && g === EMPTY && c.x > 0 && state.bricks > 0) {
    const h = state.hero;
    if (Math.floor(h.gx) === c.x && Math.floor(h.gy) === c.y) return;
    state.grid[i] = WALL; state.wallHp[i] = CONFIG.wall.hp; state.bricks--;
  } else if (dragMode === 'erase' && g === WALL && state.wallHp[i] === CONFIG.wall.hp) {
    state.grid[i] = EMPTY; state.wallHp[i] = 0; state.bricks++;
  } else if (dragMode === 'repair' && g === WALL && state.wallHp[i] < CONFIG.wall.hp && state.bricks > 0) {
    state.wallHp[i] = CONFIG.wall.hp; state.bricks--;
  }
}

function placeHero(c) {
  if (!inBounds(c.x, c.y) || state.grid[idx(c.x, c.y)] !== EMPTY) return;
  const h = state.hero;
  h.gx = c.x + 0.5; h.gy = c.y + 0.5;
  if (state.phase === 'build') { h.x = h.gx; h.y = h.gy; }
}

canvas.addEventListener('pointerdown', ev => {
  ev.preventDefault();
  const c = cellAt(ev);
  if (!inBounds(c.x, c.y)) return;
  if (state.phase === 'wave') { placeHero(c); return; }   // under bølgen flytter man helten
  if (state.phase !== 'build') return;
  if (state.tool === 'hero') { placeHero(c); return; }
  const i = idx(c.x, c.y);
  if (state.grid[i] === WALL) dragMode = state.wallHp[i] < CONFIG.wall.hp ? 'repair' : 'erase';
  else dragMode = 'paint';
  canvas.setPointerCapture(ev.pointerId);
  applyBuild(c);
  recomputeField();
});
canvas.addEventListener('pointermove', ev => {
  if (!dragMode) return;
  applyBuild(cellAt(ev));
});
const endDrag = () => { if (dragMode) { dragMode = null; recomputeField(); } };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

const $ = id => document.getElementById(id);
$('bWall').onclick = () => { state.tool = 'wall'; };
$('bHero').onclick = () => { state.tool = 'hero'; };
$('bStart').onclick = () => startWave();
$('bRestart').onclick = () => newGame();

// ---------- tegning ----------
function resize() {
  const hud = $('hud').offsetHeight + $('msg').offsetHeight + 8;
  const w = Math.min(window.innerWidth - 8, (window.innerHeight - hud) * 4 / 3);
  tile = Math.max(8, Math.floor(w / COLS));
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = tile * COLS + 'px';
  canvas.style.height = tile * ROWS + 'px';
  canvas.width = tile * COLS * dpr;
  canvas.height = tile * ROWS * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);

function circle(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x * tile, y * tile, r * tile, 0, Math.PI * 2); ctx.fill();
}

function hpBar(x, y, frac) {
  const w = tile * 0.8, h = Math.max(2, tile * 0.1);
  ctx.fillStyle = '#000'; ctx.fillRect(x * tile - w / 2, y * tile - tile * 0.55, w, h);
  ctx.fillStyle = '#22c55e'; ctx.fillRect(x * tile - w / 2, y * tile - tile * 0.55, w * Math.max(0, frac), h);
}

function draw() {
  ctx.clearRect(0, 0, COLS * tile, ROWS * tile);

  // spawn-zone til venstre
  ctx.fillStyle = 'rgba(239,68,68,0.12)';
  ctx.fillRect(0, 0, tile, ROWS * tile);

  // gitter
  ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= COLS; x++) { ctx.moveTo(x * tile + 0.5, 0); ctx.lineTo(x * tile + 0.5, ROWS * tile); }
  for (let y = 0; y <= ROWS; y++) { ctx.moveTo(0, y * tile + 0.5); ctx.lineTo(COLS * tile, y * tile + 0.5); }
  ctx.stroke();

  // mure
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const i = idx(x, y);
    if (state.grid[i] !== WALL) continue;
    const f = state.wallHp[i] / CONFIG.wall.hp;
    const v = Math.round(60 + 70 * f);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x * tile + 1, y * tile + 1, tile - 2, tile - 2);
  }

  // borg
  const c = CONFIG.castle;
  ctx.fillStyle = '#7c5a3a';
  ctx.fillRect(c.x * tile, c.y * tile, c.w * tile, c.h * tile);
  ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(tile * 0.6)}px system-ui`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('BORG', (c.x + c.w / 2) * tile, (c.y + c.h / 2) * tile);

  // heltens vagtpunkt
  const h = state.hero;
  ctx.strokeStyle = 'rgba(22,163,74,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(h.gx * tile, h.gy * tile, CONFIG.hero.guardRange * tile, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 2;
  const s = tile * 0.25;
  ctx.beginPath();
  ctx.moveTo(h.gx * tile - s, h.gy * tile - s); ctx.lineTo(h.gx * tile + s, h.gy * tile + s);
  ctx.moveTo(h.gx * tile + s, h.gy * tile - s); ctx.lineTo(h.gx * tile - s, h.gy * tile + s);
  ctx.stroke();

  // monstre
  for (const m of state.monsters) {
    circle(m.x, m.y, 0.35, CONFIG.monsters[m.kind].color);
    hpBar(m.x, m.y, m.hp / m.maxHp);
  }

  // helt
  if (h.alive) {
    circle(h.x, h.y, 0.42, '#16a34a');
    hpBar(h.x, h.y, h.hp / CONFIG.hero.hp);
  }

  drawHud();
}

function drawHud() {
  const h = state.hero;
  $('sWave').textContent = `Bølge ${state.wave}`;
  $('sCastle').textContent = `Borg: ${Math.max(0, state.castleHp)}/${CONFIG.castleHp}`;
  $('sHero').textContent = h.alive ? `Helt: ${Math.max(0, h.hp)}/${CONFIG.hero.hp}` : `Helt: genopstår om ${Math.ceil(h.respawn)} s`;
  $('sBricks').textContent = `Mursten: ${state.bricks}`;
  const building = state.phase === 'build';
  $('bWall').classList.toggle('active', building && state.tool === 'wall');
  $('bHero').classList.toggle('active', building && state.tool === 'hero');
  $('bWall').disabled = $('bHero').disabled = !building;
  const open = !building || hasOpening();
  $('bStart').disabled = !building || !open;

  let msg = '';
  if (building) msg = open
    ? 'Byggefase: træk for at tegne mur, tryk på en mur for at fjerne den, tryk på en skadet mur for at reparere.'
    : 'Muren skal have mindst én åbning, før bølgen kan starte.';
  else if (state.phase === 'wave') msg = `Bølge ${state.wave}: tryk på banen for at flytte helten. Monstre tilbage: ${state.spawnQueue.length + state.monsters.length}`;
  $('msg').textContent = msg;

  const over = state.phase === 'over';
  $('overlay').style.display = over ? 'flex' : 'none';
  if (over) $('overlayText').textContent = `Borgen faldt i bølge ${state.wave}`;
}

// ---------- løkke ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

newGame();
resize();
requestAnimationFrame(frame);
window.borgmuren = { get state() { return state; }, update, startWave, CONFIG };
