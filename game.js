// Borgmuren – topdown borgforsvar. Ingen grafik, kun simple former.
// Bygninger, helt og monstre bruger tallene fra Borgspillet (content/*.tres).
'use strict';

const COLS = 32, ROWS = 24;          // iPad 4:3 landscape

// ---------- data (fra Borgspillet) ----------
const CONFIG = {
  startGold: 180,
  castleLives: 20,
  castle: { x: 29, y: 9, w: 3, h: 6 },
  heroSpawn: { x: 27.5, y: 12 },
  // knight.tres
  hero: { hp: 220, damage: 12, armor: 3, attackInterval: 0.8, speed: 1.5,
          engageRange: 0.8, threatRange: 2.0, respawnSec: 10 },
  sellRatio: 0.6,          // ældre bygninger sælges for 60 %; nye i samme byggefase for fuld pris
  defaultBuildingHp: 100,  // liv for bygninger, monstrene kan slå i stykker
  spawnIntervalSec: 1.2,
  monsterHpGrowth: 0.15,   // +15 % liv pr. bølge
};

// grunt.tres og runner.tres
const MONSTERS = {
  blue: { name: 'Grunt',  hp: 35, armor: 1, speed: 1.0, bounty: 5, castleDamage: 1, damage: 5, interval: 1.0, color: '#3b82f6', r: 0.3 },
  red:  { name: 'Runner', hp: 20, armor: 0, speed: 1.8, bounty: 3, castleDamage: 1, damage: 3, interval: 1.0, color: '#ef4444', r: 0.25 },
};

// content/buildings/*.tres – kun Gård som pengebygning (ingen vindmølle eller miner).
const BUILDINGS = {
  fence:      { name: 'Hegn', cost: 4, blocks: true, hp: 30, upgradesTo: 'stone_wall', color: '#b45309', label: 'H' },
  stone_wall: { name: 'Stenmur', cost: 10, blocks: true, hp: 80, upgradesTo: 'tall_wall', tier: 2, color: '#6b7280', label: 'S', toolbar: true },
  tall_wall:  { name: 'Høj mur', cost: 30, blocks: true, hp: 160, tier: 3, color: '#374151', label: 'M', toolbar: false },
  net:        { name: 'Klæbenet', cost: 8, blocks: false, slow: 0.4, color: '#e7e5e4', label: 'N' },
  gate:       { name: 'Port', cost: 25, blocks: false, hold: 2.0, upgradesTo: 'iron_gate', color: '#92400e', label: 'P' },
  iron_gate:  { name: 'Jernport', cost: 55, blocks: false, hold: 3.5, tier: 2, color: '#44403c', label: 'P', toolbar: false },
  archer:     { name: 'Bueskyttetårn', cost: 40, blocks: true, tower: { damage: 10, range: 3.0, interval: 0.5 }, upgradesTo: 'archer_2', color: '#15803d', label: 'B' },
  archer_2:   { name: 'Langbuetårn', cost: 95, blocks: true, tower: { damage: 16, range: 3.4, interval: 0.5 }, tier: 2, color: '#166534', label: 'B', toolbar: false },
  cannon:     { name: 'Kanontårn', cost: 70, blocks: true, tower: { damage: 18, range: 2.3, interval: 1.8, splash: 0.9 }, upgradesTo: 'cannon_2', color: '#1f2937', label: 'K' },
  cannon_2:   { name: 'Stor kanon', cost: 160, blocks: true, tower: { damage: 35, range: 2.6, interval: 1.8, splash: 1.1 }, tier: 2, color: '#111827', label: 'K', toolbar: false },
  mage:       { name: 'Magertårn', cost: 130, blocks: true, tower: { damage: 28, range: 50, interval: 3.0, magic: true }, upgradesTo: 'mage_2', color: '#7c3aed', label: 'T' },
  mage_2:     { name: 'Ærkemagertårn', cost: 240, blocks: true, tower: { damage: 50, range: 50, interval: 2.4, magic: true }, tier: 2, color: '#5b21b6', label: 'T', toolbar: false },
  barracks:   { name: 'Kaserne', cost: 60, blocks: true, soldiers: { count: 2, hp: 90, damage: 7, armor: 1, interval: 1.0, respawn: 8 }, upgradesTo: 'barracks_2', color: '#0e7490', label: 'Ka' },
  barracks_2: { name: 'Stor kaserne', cost: 120, blocks: true, soldiers: { count: 3, hp: 130, damage: 10, armor: 2, interval: 0.9, respawn: 7 }, upgradesTo: 'barracks_3', tier: 2, color: '#155e75', label: 'Ka', toolbar: false },
  barracks_3: { name: 'Fæstningskaserne', cost: 210, blocks: true, soldiers: { count: 4, hp: 170, damage: 13, armor: 3, interval: 0.9, respawn: 6 }, tier: 3, color: '#164e63', label: 'Ka', toolbar: false },
  archer_camp:{ name: 'Bueskyttelejr', cost: 70, blocks: true, soldiers: { count: 2, hp: 60, damage: 6, armor: 0, interval: 0.9, respawn: 8, range: 2.5 }, color: '#4d7c0f', label: 'BL' },
  smithy:     { name: 'Smedje', cost: 80, blocks: true, boost: 0.25, boostRadius: 2.0, color: '#9a3412', label: 'Sm' },
  farm:       { name: 'Gård', cost: 30, blocks: true, income: 10, color: '#ca8a04', label: 'G' },
};
const TOOLBAR = ['fence', 'stone_wall', 'net', 'gate', 'archer', 'cannon', 'mage', 'barracks', 'archer_camp', 'smithy', 'farm'];
const SOLDIER_ENGAGE = 0.9;   // soldaterne holder monstre inden for dette
const SOLDIER_GUARD = 2.0;    // og går ud efter monstre så langt fra deres post

// Hvilke væsner der kommer i bølge n (1, 2, 3 ...).
function waveMonsters(n) {
  const list = [];
  const blue = 4 + 4 * n, red = n === 1 ? 0 : 4 * n;
  for (let i = 0; i < blue; i++) list.push('blue');
  for (let i = 0; i < red; i++) list.push('red');
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// ---------- hjælpere ----------
const idx = (x, y) => y * COLS + x;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const physical = (raw, armor) => Math.max(raw - Math.max(armor, 0), 1);

function isCastle(x, y) {
  const c = CONFIG.castle;
  return x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h;
}

let state;

function newGame() {
  state = {
    buildings: new Map(),   // celleindeks -> bygning
    phase: 'build',         // 'build' | 'wave' | 'over'
    wave: 1,
    gold: CONFIG.startGold,
    lives: CONFIG.castleLives,
    hero: newHero(),
    monsters: [],
    soldiers: [],
    shots: [],
    spawnQueue: [],
    spawnTimer: 0,
    field: null,
    route: [],
    tool: 'fence',
    selected: null,
    message: '',
    messageTimer: 0,
  };
  recomputeField();
}

function newHero() {
  const s = CONFIG.heroSpawn, h = CONFIG.hero;
  return { x: s.x, y: s.y, hp: h.hp, alive: true, cooldown: 0, respawn: 0, path: [], opponent: null };
}

const buildingAt = (x, y) => (inBounds(x, y) ? state.buildings.get(idx(x, y)) : undefined);
const dataOf = b => BUILDINGS[b.id];

function blocks(x, y) {
  const b = buildingAt(x, y);
  return !!b && dataOf(b).blocks;
}

// Hvor helt og soldater må gå: ikke ind i borgen eller spærrende bygninger.
function walkable(x, y) {
  return inBounds(x, y) && !isCastle(x, y) && !blocks(x, y);
}

function slowFactor(x, y) {
  const b = buildingAt(x, y);
  return b && dataOf(b).slow ? dataOf(b).slow : 1;
}

// ---------- vejfinding ----------
// Pris for et monster at gå ind i et felt. Spærrende bygninger kan slås i stykker,
// så de koster ekstra efter hvor mange liv de har.
function enterCost(x, y) {
  const b = buildingAt(x, y);
  if (!b) return 1;
  const d = dataOf(b);
  if (d.blocks) return 1 + b.hp / 5;   // ca. sekunder om at slå den ned
  if (d.hold) return 1 + d.hold;
  return 1 / (d.slow || 1);
}

function recomputeField() {
  const n = COLS * ROWS;
  const field = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (isCastle(x, y)) field[idx(x, y)] = 0;
  // Simpel Dijkstra – gitteret er kun 768 felter.
  for (;;) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && field[i] < bd) { bd = field[i]; best = i; }
    if (best < 0) break;
    done[best] = 1;
    const bx = best % COLS, by = (best / COLS) | 0;
    const cost = isCastle(bx, by) ? 1 : enterCost(bx, by);
    for (const [dx, dy] of DIRS) {
      const nx = bx + dx, ny = by + dy;
      if (!inBounds(nx, ny) || isCastle(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (bd + cost < field[ni]) field[ni] = bd + cost;
    }
  }
  state.field = field;
  state.route = previewRoute();
}

function nextCell(cx, cy) {
  let best = null, bd = Infinity;
  for (const [dx, dy] of DIRS) {
    const nx = cx + dx, ny = cy + dy;
    if (!inBounds(nx, ny)) continue;
    const d = isCastle(nx, ny) ? 0 : state.field[idx(nx, ny)] + enterCost(nx, ny);
    if (d < bd) { bd = d; best = { x: nx, y: ny }; }
  }
  return best;
}

// Monstrenes vej fra midten af venstre kant, vist som prikker i byggefasen.
function previewRoute() {
  const route = [];
  let x = 0, y = ROWS >> 1;
  for (let guard = 0; guard < COLS * ROWS && !isCastle(x, y); guard++) {
    route.push({ x, y });
    const n = nextCell(x, y);
    if (!n) break;
    x = n.x; y = n.y;
  }
  return route;
}

// Er der en åben vej (uden spærrende bygninger) fra venstre kant til borgen?
function hasOpening() {
  const seen = new Uint8Array(COLS * ROWS);
  const q = [];
  for (let y = 0; y < ROWS; y++) if (!blocks(0, y)) { seen[idx(0, y)] = 1; q.push([0, y]); }
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      if (isCastle(nx, ny)) return true;
      const ni = idx(nx, ny);
      if (!seen[ni] && !blocks(nx, ny)) { seen[ni] = 1; q.push([nx, ny]); }
    }
  }
  return false;
}

// Som i Borgspillet (HeroPath): korteste vej gennem labyrinten, 4 retninger.
// Trykker man på et felt, helten ikke kan nå, går han til det nærmeste, han kan nå.
function findPath(from, to) {
  const sx = Math.floor(from.x), sy = Math.floor(from.y);
  const gx = Math.min(COLS - 1, Math.max(0, Math.floor(to.x)));
  const gy = Math.min(ROWS - 1, Math.max(0, Math.floor(to.y)));
  const prev = new Map([[idx(sx, sy), -1]]);
  const q = [[sx, sy]];
  let best = [sx, sy], bestD = Math.hypot(sx + 0.5 - to.x, sy + 0.5 - to.y);
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h];
    if (x === gx && y === gy) { best = [x, y]; break; }
    const d = Math.hypot(x + 0.5 - to.x, y + 0.5 - to.y);
    if (d < bestD) { bestD = d; best = [x, y]; }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, ni = idx(nx, ny);
      if (!walkable(nx, ny) || prev.has(ni)) continue;
      prev.set(ni, idx(x, y));
      q.push([nx, ny]);
    }
  }
  const cells = [];
  for (let i = idx(best[0], best[1]); i !== -1; i = prev.get(i)) cells.unshift(i);
  const points = cells.slice(1).map(i => ({ x: i % COLS + 0.5, y: ((i / COLS) | 0) + 0.5 }));
  if (best[0] === gx && best[1] === gy) {
    points.pop();
    points.push({ x: to.x, y: to.y });
  } else if (!points.length) {
    points.push({ x: sx + 0.5, y: sy + 0.5 });
  }
  return points;
}

// Ingen spærrende bygning på linjen mellem a og b?
function clearLine(a, b) {
  const steps = Math.ceil(dist(a, b) / 0.25);
  for (let s = 1; s < steps; s++) {
    const x = a.x + (b.x - a.x) * s / steps, y = a.y + (b.y - a.y) * s / steps;
    if (blocks(Math.floor(x), Math.floor(y))) return false;
  }
  return true;
}

// ---------- bygge ----------
function say(text) { state.message = text; state.messageTimer = 3; }

function place(id, x, y) {
  const d = BUILDINGS[id];
  if (!inBounds(x, y) || isCastle(x, y) || buildingAt(x, y)) return false;
  if (x === 0) { say('Monstrene kommer ind i venstre side. Der kan ikke bygges.'); return false; }
  if (state.gold < d.cost) { say('Ikke nok guld.'); return false; }
  const h = state.hero;
  if (d.blocks && Math.floor(h.x) === x && Math.floor(h.y) === y) { say('Helten står der.'); return false; }
  const b = { id, x, y, hp: d.hp || CONFIG.defaultBuildingHp, spent: d.cost, fresh: true, cooldown: 0 };
  state.buildings.set(idx(x, y), b);
  if (d.blocks && !hasOpening()) {
    state.buildings.delete(idx(x, y));
    say('Der skal altid være en åbning til borgen!');
    return false;
  }
  state.gold -= d.cost;
  return true;
}

function maxHp(b) { return dataOf(b).hp || CONFIG.defaultBuildingHp; }
function sellValue(b) { return b.fresh ? b.spent : Math.floor(b.spent * CONFIG.sellRatio); }
function repairCost(b) { return Math.ceil(dataOf(b).cost * (1 - b.hp / maxHp(b))); }
function upgradeCost(b) {
  const to = dataOf(b).upgradesTo;
  return to ? Math.max(BUILDINGS[to].cost - dataOf(b).cost, 0) : null;
}

function sell(b) {
  state.gold += sellValue(b);
  state.buildings.delete(idx(b.x, b.y));
  state.selected = null;
  recomputeField();
}

function repair(b) {
  const c = repairCost(b);
  if (c > state.gold || b.hp >= maxHp(b)) return;
  state.gold -= c; b.hp = maxHp(b);
  recomputeField();
}

function upgrade(b) {
  const c = upgradeCost(b);
  if (c === null || c > state.gold) return;
  state.gold -= c; b.spent += c;
  b.id = dataOf(b).upgradesTo;
  b.hp = maxHp(b);
  recomputeField();
}

// ---------- bølger ----------
function startWave() {
  if (state.phase !== 'build' || !hasOpening()) return;
  state.phase = 'wave';
  state.selected = null;
  state.spawnQueue = waveMonsters(state.wave);
  state.spawnTimer = 0;
  for (const b of state.buildings.values()) b.fresh = false;
  makeSoldiers();
  recomputeField();
}

function endWave() {
  state.phase = 'build';
  state.wave++;
  let income = 0;
  for (const b of state.buildings.values()) income += dataOf(b).income || 0;
  state.gold += income;
  if (income) say(`Gårdene gav ${income} guld.`);
  state.soldiers = [];
  state.shots = [];
  const h = state.hero;
  if (h.alive) h.hp = CONFIG.hero.hp;
}

function makeSoldiers() {
  state.soldiers = [];
  const taken = new Set();
  for (const b of state.buildings.values()) {
    const s = dataOf(b).soldiers;
    if (!s) continue;
    // poster: de nærmeste frie felter rundt om kasernen
    const spots = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = b.x + dx, y = b.y + dy;
      if (walkable(x, y) && !taken.has(idx(x, y))) spots.push({ x, y, d: Math.hypot(dx, dy) });
    }
    spots.sort((a, c) => a.d - c.d);
    for (let k = 0; k < s.count && k < spots.length; k++) {
      taken.add(idx(spots[k].x, spots[k].y));
      const px = spots[k].x + 0.5, py = spots[k].y + 0.5;
      state.soldiers.push({ b, stats: s, x: px, y: py, px, py, hp: s.hp, alive: true, cooldown: 0, respawn: 0, opponent: null });
    }
  }
}

function spawnMonster(kind) {
  const s = MONSTERS[kind];
  const y = Math.floor(Math.random() * ROWS);
  const hp = Math.round(s.hp * (1 + CONFIG.monsterHpGrowth * (state.wave - 1)));
  state.monsters.push({ kind, s, x: 0.5, y: y + 0.5, hp, maxHp: hp, cooldown: 0, target: null,
                        holdLeft: 0, passedGate: -1, heldBy: null, travelled: 0 });
}

// ---------- opdatering ----------
function moveToward(o, tx, ty, step) {
  const dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy);
  if (d <= step) { o.x = tx; o.y = ty; return true; }
  o.x += dx / d * step; o.y += dy / d * step;
  return false;
}

function update(dt) {
  if (state.messageTimer > 0) state.messageTimer -= dt;
  if (state.phase === 'over') return;
  updateHero(dt);
  if (state.phase !== 'wave') return;

  state.spawnTimer -= dt;
  if (state.spawnQueue.length && state.spawnTimer <= 0) {
    spawnMonster(state.spawnQueue.shift());
    state.spawnTimer = CONFIG.spawnIntervalSec;
  }

  for (const s of state.soldiers) updateSoldier(s, dt);
  for (const b of state.buildings.values()) if (dataOf(b).tower) updateTower(b, dt);
  for (const m of state.monsters) if (m.hp > 0) updateMonster(m, dt);

  for (const m of state.monsters) if (m.hp <= 0 && !m.paid) { m.paid = true; if (!m.done) state.gold += m.s.bounty; }
  state.monsters = state.monsters.filter(m => m.hp > 0 && !m.done);
  for (const sh of state.shots) sh.t -= dt;
  state.shots = state.shots.filter(sh => sh.t > 0);

  if (state.lives <= 0) { state.lives = 0; state.phase = 'over'; return; }
  if (!state.spawnQueue.length && !state.monsters.length) endWave();
}

function damageMonster(m, amount) {
  m.hp -= amount;
}

function updateHero(dt) {
  const h = state.hero, cfg = CONFIG.hero;
  if (!h.alive) {
    h.respawn -= dt;
    if (h.respawn <= 0) {
      Object.assign(h, newHero());
    }
    return;
  }
  h.cooldown = Math.max(0, h.cooldown - dt);

  // gå videre ad sin vej
  let step = cfg.speed * slowFactor(Math.floor(h.x), Math.floor(h.y)) * dt;
  while (step > 0 && h.path.length) {
    const p = h.path[0], d = dist(h, p);
    if (d <= step) { h.x = p.x; h.y = p.y; h.path.shift(); step -= d; }
    else { moveToward(h, p.x, p.y, step); step = 0; }
  }

  if (state.phase !== 'wave') return;
  // slås med nærmeste monster inden for rækkevidde og hold det fast
  if (h.opponent && (h.opponent.hp <= 0 || h.opponent.done || dist(h, h.opponent) > cfg.engageRange * 1.5)) {
    if (h.opponent.heldBy === h) h.opponent.heldBy = null;
    h.opponent = null;
  }
  if (!h.opponent) {
    h.opponent = nearestMonster(h, cfg.engageRange, m => !m.heldBy);
    if (h.opponent) h.opponent.heldBy = h;
  }
  if (h.opponent && h.cooldown <= 0) {
    h.cooldown = cfg.attackInterval;
    damageMonster(h.opponent, physical(cfg.damage, h.opponent.s.armor));
    state.shots.push({ x1: h.x, y1: h.y, x2: h.opponent.x, y2: h.opponent.y, t: 0.1, color: '#16a34a' });
  }
}

function moveHero(target) {
  const h = state.hero;
  if (state.phase === 'over' || !h.alive) return;
  h.path = findPath(h, target);
}

function heroTakeDamage(raw) {
  const h = state.hero;
  h.hp -= physical(raw, CONFIG.hero.armor);
  if (h.hp <= 0) {
    h.hp = 0; h.alive = false; h.respawn = CONFIG.hero.respawnSec; h.path = [];
    if (h.opponent && h.opponent.heldBy === h) h.opponent.heldBy = null;
    h.opponent = null;
  }
}

function nearestMonster(from, range, filter) {
  let best = null, bd = range;
  for (const m of state.monsters) {
    if (m.hp <= 0 || m.done || (filter && !filter(m))) continue;
    const d = dist(from, m);
    if (d <= bd) { bd = d; best = m; }
  }
  return best;
}

function updateSoldier(s, dt) {
  const st = s.stats;
  if (!state.buildings.has(idx(s.b.x, s.b.y))) { s.alive = false; s.gone = true; return; }
  if (!s.alive) {
    if (s.gone) return;
    s.respawn -= dt;
    if (s.respawn <= 0) { s.alive = true; s.hp = st.hp; s.x = s.px; s.y = s.py; }
    return;
  }
  s.cooldown = Math.max(0, s.cooldown - dt);
  const post = { x: s.px, y: s.py };

  if (st.range) {   // bueskytter: skyder, holder ikke fast
    const t = nearestMonster(s, st.range);
    if (t && s.cooldown <= 0) {
      s.cooldown = st.interval;
      damageMonster(t, physical(st.damage, t.s.armor));
      state.shots.push({ x1: s.x, y1: s.y, x2: t.x, y2: t.y, t: 0.1, color: '#4d7c0f' });
    }
    return;
  }

  if (s.opponent && (s.opponent.hp <= 0 || s.opponent.done || dist(s.opponent, post) > SOLDIER_GUARD + 0.5)) {
    if (s.opponent.heldBy === s) s.opponent.heldBy = null;
    s.opponent = null;
  }
  if (!s.opponent) {
    let best = null, bd = Infinity;
    for (const m of state.monsters) {
      if (m.hp <= 0 || m.heldBy || dist(m, post) > SOLDIER_GUARD) continue;
      const d = dist(s, m);
      if (d < bd) { bd = d; best = m; }
    }
    s.opponent = best;
  }
  if (!s.opponent) { moveToward(s, s.px, s.py, CONFIG.hero.speed * dt); return; }
  const m = s.opponent;
  if (dist(s, m) > SOLDIER_ENGAGE) { moveToward(s, m.x, m.y, CONFIG.hero.speed * dt); return; }
  if (!m.heldBy) m.heldBy = s;
  if (s.cooldown <= 0) {
    s.cooldown = st.interval;
    damageMonster(m, physical(st.damage, m.s.armor));
  }
}

function soldierTakeDamage(s, raw) {
  s.hp -= physical(raw, s.stats.armor);
  if (s.hp <= 0) {
    s.alive = false; s.respawn = s.stats.respawn;
    if (s.opponent && s.opponent.heldBy === s) s.opponent.heldBy = null;
    s.opponent = null;
  }
}

function towerBoost(b) {
  for (const o of state.buildings.values()) {
    const d = dataOf(o);
    if (d.boost && Math.hypot(o.x - b.x, o.y - b.y) <= d.boostRadius) return 1 + d.boost;
  }
  return 1;
}

function updateTower(b, dt) {
  const t = dataOf(b).tower;
  b.cooldown = Math.max(0, b.cooldown - dt);
  if (b.cooldown > 0) return;
  const c = { x: b.x + 0.5, y: b.y + 0.5 };
  const target = nearestMonster(c, t.range);
  if (!target) return;
  b.cooldown = t.interval;
  const dmg = Math.round(t.damage * towerBoost(b));
  const hit = m => damageMonster(m, t.magic ? dmg : physical(dmg, m.s.armor));
  if (t.splash) { for (const m of state.monsters) if (m.hp > 0 && dist(m, target) <= t.splash) hit(m); }
  else hit(target);
  state.shots.push({ x1: c.x, y1: c.y, x2: target.x, y2: target.y, t: 0.12, color: t.magic ? '#7c3aed' : '#111', splash: t.splash });
}

function updateMonster(m, dt) {
  const s = m.s;
  m.cooldown = Math.max(0, m.cooldown - dt);
  const h = state.hero;

  // holdt fast af helten eller en soldat: slås med den
  if (m.heldBy) {
    const foe = m.heldBy;
    if (!foe.alive || dist(foe, m) > 1.5) m.heldBy = null;
    else {
      if (dist(foe, m) > CONFIG.hero.engageRange) moveToward(m, foe.x, foe.y, s.speed * dt);
      else if (m.cooldown <= 0) {
        m.cooldown = s.interval;
        if (foe === h) heroTakeDamage(s.damage); else soldierTakeDamage(foe, s.damage);
      }
      return;
    }
  }

  // Borgspillet: monstre tæt på helten går efter ham først (ikke gennem mure)
  if (h.alive && dist(h, m) <= CONFIG.hero.threatRange && clearLine(m, h)) {
    if (dist(h, m) > CONFIG.hero.engageRange * 0.9) moveToward(m, h.x, h.y, s.speed * dt);
    else if (m.cooldown <= 0) { m.cooldown = s.interval; heroTakeDamage(s.damage); }
    m.target = null;
    return;
  }

  if (!m.target) m.target = nextCell(Math.floor(m.x), Math.floor(m.y));
  if (!m.target) return;
  const t = m.target, ti = idx(t.x, t.y);
  const b = state.buildings.get(ti);
  const d = b && dataOf(b);

  if (d && d.blocks) {   // slå hul i bygningen
    if (m.cooldown <= 0) {
      m.cooldown = s.interval;
      b.hp -= s.damage;
      if (b.hp <= 0) {
        state.buildings.delete(ti);
        if (state.selected === b) state.selected = null;
        recomputeField();
      }
    }
    return;
  }
  if (d && d.hold && m.passedGate !== ti) {   // porte holder monstrene tilbage
    if (m.holdLeft <= 0) m.holdLeft = d.hold;
    m.holdLeft -= dt;
    if (m.holdLeft <= 0) m.passedGate = ti;
    return;
  }

  const speed = s.speed * slowFactor(Math.floor(m.x), Math.floor(m.y));
  if (moveToward(m, t.x + 0.5, t.y + 0.5, speed * dt)) {
    if (isCastle(t.x, t.y)) { state.lives -= s.castleDamage; m.done = true; }
    m.target = null;
  }
}

// ---------- input ----------
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
// Kamera: tile er feltets størrelse i skærmpixels (baseTile * zoom); camX/camY er,
// hvor langt banen er rullet. Lærredet har altid samme størrelse.
const MAX_ZOOM = 3;
const TAP_SLOP = 10;          // så mange pixels må fingeren flytte sig, før det er en panorering
let baseTile = 20, zoom = 1, tile = 20, camX = 0, camY = 0, viewW = 0, viewH = 0;

function clampCamera() {
  camX = Math.min(Math.max(camX, 0), COLS * tile - viewW);
  camY = Math.min(Math.max(camY, 0), ROWS * tile - viewH);
}

// Zoomer, så punktet (sx, sy) på lærredet bliver stående samme sted.
function zoomAt(newZoom, sx, sy) {
  newZoom = Math.min(Math.max(newZoom, 1), MAX_ZOOM);
  const wx = (sx + camX) / tile, wy = (sy + camY) / tile;
  zoom = newZoom;
  tile = baseTile * zoom;
  camX = wx * tile - sx;
  camY = wy * tile - sy;
  clampCamera();
}

function canvasPoint(ev) {
  const r = canvas.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}

function toWorld(sp) {
  return { x: (sp.x + camX) / tile, y: (sp.y + camY) / tile };
}

// Ét tryk = én handling. At trække med én finger ruller banen, to fingre zoomer.
function tap(p) {
  const cx = Math.floor(p.x), cy = Math.floor(p.y);
  if (!inBounds(cx, cy)) return;
  if (state.phase === 'wave') { moveHero(p); return; }   // under bølgen styres helten
  if (state.phase !== 'build') return;
  const b = buildingAt(cx, cy);
  if (b) { state.selected = b; buildToolbar(); return; }
  state.selected = null;
  if (state.tool === 'hero') { moveHero(p); return; }
  if (place(state.tool, cx, cy)) recomputeField();
  buildToolbar();
}

const pointers = new Map();
let gesture = null;   // { start, moved, multi, pinchDist, mid }

function pinchInfo() {
  const [a, b] = [...pointers.values()];
  return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

canvas.addEventListener('pointerdown', ev => {
  ev.preventDefault();
  canvas.setPointerCapture(ev.pointerId);
  const sp = canvasPoint(ev);
  pointers.set(ev.pointerId, sp);
  if (pointers.size === 1) gesture = { start: sp, last: sp, moved: false, multi: false };
  else if (pointers.size === 2 && gesture) {
    gesture.multi = true;
    const pi = pinchInfo();
    gesture.pinchDist = pi.dist; gesture.mid = pi.mid;
  }
});
canvas.addEventListener('pointermove', ev => {
  if (!pointers.has(ev.pointerId) || !gesture) return;
  const sp = canvasPoint(ev);
  pointers.set(ev.pointerId, sp);
  if (pointers.size >= 2) {
    const pi = pinchInfo();
    if (gesture.pinchDist > 0) zoomAt(zoom * pi.dist / gesture.pinchDist, pi.mid.x, pi.mid.y);
    camX -= pi.mid.x - gesture.mid.x; camY -= pi.mid.y - gesture.mid.y;
    clampCamera();
    gesture.pinchDist = pi.dist; gesture.mid = pi.mid;
    return;
  }
  if (gesture.multi) return;
  if (!gesture.moved && Math.hypot(sp.x - gesture.start.x, sp.y - gesture.start.y) > TAP_SLOP) gesture.moved = true;
  if (gesture.moved) {
    camX -= sp.x - gesture.last.x; camY -= sp.y - gesture.last.y;
    clampCamera();
  }
  gesture.last = sp;
});
function endPointer(ev, cancelled) {
  if (!pointers.has(ev.pointerId)) return;
  pointers.delete(ev.pointerId);
  if (pointers.size > 0 || !gesture) return;
  if (!cancelled && !gesture.moved && !gesture.multi) tap(toWorld(canvasPoint(ev)));
  gesture = null;
}
canvas.addEventListener('pointerup', ev => endPointer(ev, false));
canvas.addEventListener('pointercancel', ev => endPointer(ev, true));
canvas.addEventListener('wheel', ev => {
  ev.preventDefault();
  const sp = canvasPoint(ev);
  zoomAt(zoom * Math.exp(-ev.deltaY * 0.002), sp.x, sp.y);
}, { passive: false });

$('bZoomIn').onclick = () => zoomAt(zoom * 1.5, viewW / 2, viewH / 2);
$('bZoomOut').onclick = () => zoomAt(zoom / 1.5, viewW / 2, viewH / 2);
$('bStart').onclick = () => startWave();
$('bRestart').onclick = () => { newGame(); buildToolbar(); };

// Værktøjslinjen: bygninger, "Flyt helt" og panelet for den valgte bygning.
function buildToolbar() {
  const bar = $('tools');
  bar.innerHTML = '';
  const add = (label, active, onclick, disabled) => {
    const btn = document.createElement('button');
    btn.innerHTML = label;
    if (active) btn.classList.add('active');
    btn.disabled = !!disabled;
    btn.onclick = () => { onclick(); buildToolbar(); };
    bar.appendChild(btn);
  };
  const b = state.selected;
  if (b && state.buildings.get(idx(b.x, b.y)) === b && state.phase === 'build') {
    const d = dataOf(b);
    const info = document.createElement('span');
    info.className = 'info';
    info.textContent = `${d.name}${d.blocks ? ` (${Math.ceil(b.hp)}/${maxHp(b)} liv)` : ''}`;
    bar.appendChild(info);
    const up = upgradeCost(b);
    if (up !== null) add(`Opgradér til ${BUILDINGS[d.upgradesTo].name} <small>${up} g</small>`, false, () => upgrade(b), up > state.gold);
    if (d.blocks && b.hp < maxHp(b)) add(`Reparér <small>${repairCost(b)} g</small>`, false, () => repair(b), repairCost(b) > state.gold);
    add(`Sælg <small>+${sellValue(b)} g</small>`, false, () => sell(b));
    add('Luk', false, () => { state.selected = null; });
    return;
  }
  for (const id of TOOLBAR) {
    const d = BUILDINGS[id];
    add(`${d.name} <small>${d.cost} g</small>`, state.tool === id, () => { state.tool = id; }, state.phase !== 'build');
  }
  add('Flyt helt', state.tool === 'hero', () => { state.tool = 'hero'; }, state.phase !== 'build');
}

// ---------- tegning ----------
function resize() {
  const used = $('hud').offsetHeight + $('tools').offsetHeight + $('msg').offsetHeight + 12;
  const cs = getComputedStyle(document.body);
  const availW = document.body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const w = Math.min(availW, (window.innerHeight - used) * 4 / 3);
  baseTile = Math.max(8, Math.floor(w / COLS));
  tile = baseTile * zoom;
  viewW = baseTile * COLS; viewH = baseTile * ROWS;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = viewW + 'px';
  canvas.style.height = viewH + 'px';
  canvas.width = viewW * dpr;
  canvas.height = viewH * dpr;
  clampCamera();
}
window.addEventListener('resize', resize);

function circle(x, y, r, fill, stroke) {
  ctx.beginPath(); ctx.arc(x * tile, y * tile, r * tile, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

function hpBar(x, y, frac, dy = 0.55) {
  const w = tile * 0.8, h = Math.max(2, tile * 0.1);
  ctx.fillStyle = '#000'; ctx.fillRect(x * tile - w / 2, y * tile - tile * dy, w, h);
  ctx.fillStyle = frac > 0.5 ? '#22c55e' : frac > 0.25 ? '#eab308' : '#ef4444';
  ctx.fillRect(x * tile - w / 2, y * tile - tile * dy, w * Math.max(0, frac), h);
}

function text(str, x, y, size, color) {
  ctx.fillStyle = color; ctx.font = `bold ${Math.round(size)}px system-ui`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function draw() {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.setTransform(dpr, 0, 0, dpr, -camX * dpr, -camY * dpr);

  // spawn-zone til venstre
  ctx.fillStyle = 'rgba(239,68,68,0.12)';
  ctx.fillRect(0, 0, tile, ROWS * tile);

  // gitter
  ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= COLS; x++) { ctx.moveTo(x * tile + 0.5, 0); ctx.lineTo(x * tile + 0.5, ROWS * tile); }
  for (let y = 0; y <= ROWS; y++) { ctx.moveTo(0, y * tile + 0.5); ctx.lineTo(COLS * tile, y * tile + 0.5); }
  ctx.stroke();

  // monstrenes vej
  if (state.phase === 'build') {
    ctx.fillStyle = 'rgba(220,38,38,0.5)';
    for (const p of state.route) {
      ctx.beginPath(); ctx.arc((p.x + 0.5) * tile, (p.y + 0.5) * tile, tile * 0.08, 0, Math.PI * 2); ctx.fill();
    }
  }

  // bygninger
  for (const b of state.buildings.values()) {
    const d = dataOf(b), x = b.x * tile, y = b.y * tile;
    if (d.blocks) {
      ctx.fillStyle = d.color;
      ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
      text(d.label, x + tile / 2, y + tile / 2, tile * 0.42, '#fff');
    } else {   // net og porte: kan gås igennem
      ctx.strokeStyle = d.color; ctx.lineWidth = Math.max(2, tile * 0.12);
      ctx.strokeRect(x + 3, y + 3, tile - 6, tile - 6);
      text(d.label, x + tile / 2, y + tile / 2, tile * 0.42, d.slow ? '#78716c' : d.color);
    }
    for (let k = 1; k < (d.tier || 1); k++) {   // røde prikker for opgraderingsniveau
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(x + 3 + (k - 1) * tile * 0.2, y + tile - tile * 0.18, tile * 0.14, tile * 0.12);
    }
    if (d.blocks && b.hp < maxHp(b)) hpBar(b.x + 0.5, b.y + 0.5, b.hp / maxHp(b), 0.45);
  }

  // valgt bygning
  const sel = state.selected;
  if (sel && state.buildings.get(idx(sel.x, sel.y)) === sel) {
    ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3;
    ctx.strokeRect(sel.x * tile, sel.y * tile, tile, tile);
    const d = dataOf(sel);
    const r = d.tower && d.tower.range < 20 ? d.tower.range : d.boost ? d.boostRadius : d.soldiers ? (d.soldiers.range || SOLDIER_GUARD) : 0;
    if (r) circle(sel.x + 0.5, sel.y + 0.5, r, 'rgba(250,204,21,0.12)', 'rgba(202,138,4,0.6)');
  }

  // borg
  const c = CONFIG.castle;
  ctx.fillStyle = '#7c5a3a';
  ctx.fillRect(c.x * tile, c.y * tile, c.w * tile, c.h * tile);
  text('BORG', (c.x + c.w / 2) * tile, (c.y + c.h / 2 - 0.5) * tile, tile * 0.6, '#fff');
  text(`${state.lives}`, (c.x + c.w / 2) * tile, (c.y + c.h / 2 + 0.6) * tile, tile * 0.55, '#fde68a');

  // skud
  for (const sh of state.shots) {
    ctx.strokeStyle = sh.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sh.x1 * tile, sh.y1 * tile); ctx.lineTo(sh.x2 * tile, sh.y2 * tile); ctx.stroke();
    if (sh.splash) circle(sh.x2, sh.y2, sh.splash, 'rgba(0,0,0,0.12)');
  }

  // monstre
  for (const m of state.monsters) {
    circle(m.x, m.y, m.s.r, m.s.color);
    if (m.hp < m.maxHp) hpBar(m.x, m.y, m.hp / m.maxHp);
  }

  // soldater
  for (const s of state.soldiers) {
    if (!s.alive) continue;
    const sz = tile * 0.4;
    ctx.fillStyle = s.stats.range ? '#84cc16' : '#06b6d4';
    ctx.fillRect(s.x * tile - sz / 2, s.y * tile - sz / 2, sz, sz);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(s.x * tile - sz / 2, s.y * tile - sz / 2, sz, sz);
    if (s.hp < s.stats.hp) hpBar(s.x, s.y, s.hp / s.stats.hp);
  }

  // helt
  const h = state.hero;
  if (h.alive) {
    if (h.path.length) {
      const goal = h.path[h.path.length - 1];
      ctx.strokeStyle = 'rgba(22,163,74,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(h.x * tile, h.y * tile);
      for (const p of h.path) ctx.lineTo(p.x * tile, p.y * tile);
      ctx.stroke(); ctx.setLineDash([]);
      circle(goal.x, goal.y, 0.15, null, '#16a34a');
    }
    circle(h.x, h.y, 0.4, '#16a34a', '#052e16');
    hpBar(h.x, h.y, h.hp / CONFIG.hero.hp, 0.65);
  } else {
    const s = CONFIG.heroSpawn;
    circle(s.x, s.y, 0.4, null, '#dc2626');
    text(`${Math.ceil(h.respawn)}`, s.x * tile, s.y * tile, tile * 0.45, '#dc2626');
  }

  drawHud();
}

function drawHud() {
  const h = state.hero;
  $('sWave').textContent = `Bølge ${state.wave}`;
  $('sCastle').textContent = `Borg: ${state.lives}`;
  $('sGold').textContent = `Guld: ${state.gold}`;
  $('sHero').textContent = h.alive ? `Helt: ${Math.max(0, Math.ceil(h.hp))}/${CONFIG.hero.hp}` : `Helt: tilbage om ${Math.ceil(h.respawn)} s`;
  $('bStart').disabled = state.phase !== 'build';

  let msg;
  if (state.messageTimer > 0) msg = state.message;
  else if (state.phase === 'build') msg = state.tool === 'hero'
    ? 'Tryk på banen for at flytte helten.'
    : 'Byggefase: tryk for at bygge ét felt ad gangen. Tryk på en bygning for at opgradere, reparere eller sælge. Zoom med to fingre, træk med én finger for at flytte banen.';
  else if (state.phase === 'wave') msg = `Bølge ${state.wave}: tryk på banen for at flytte helten. Monstre tilbage: ${state.spawnQueue.length + state.monsters.length}`;
  else msg = '';
  $('msg').textContent = msg;

  const over = state.phase === 'over';
  $('overlay').style.display = over ? 'flex' : 'none';
  if (over) $('overlayText').textContent = `Borgen faldt i bølge ${state.wave}`;
}

// ---------- løkke ----------
let last = performance.now();
let lastPhase = null;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  if (state.phase !== lastPhase) { lastPhase = state.phase; buildToolbar(); }
  draw();
  requestAnimationFrame(frame);
}

newGame();
buildToolbar();
resize();
requestAnimationFrame(frame);
window.borgmuren = { get state() { return state; }, update, startWave, place, moveHero, recomputeField, CONFIG, BUILDINGS };
