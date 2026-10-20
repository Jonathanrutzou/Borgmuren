// Borgmuren – topdown borgforsvar. Ingen grafik, kun simple former.
// Bygninger, helt og monstre bruger tallene fra Borgspillet (content/*.tres).
'use strict';

const COLS = 32, ROWS = 24;          // iPad 4:3 landscape

// ---------- data (fra Borgspillet) ----------
const CONFIG = {
  startGold: 180,
  castleLives: 20,
  wavesPerLevel: 10,       // bane 1 består af 10 runder
  castle: { x: 29, y: 9, w: 3, h: 6 },
  heroSpawn: { x: 27.5, y: 12 },
  // knight.tres (farten er fordoblet)
  hero: { hp: 220, damage: 12, armor: 3, attackInterval: 0.8, speed: 3.0,
          engageRange: 0.8, threatRange: 3.0, respawnSec: 10, regenPerSec: 0.005 },  // 0,5 % liv pr. sekund
  soldierRespawnSec: 10,   // døde soldater kommer tilbage én ad gangen
  buildingHp: 100,         // liv for bygninger; monstrene kan smadre dem og porte, men ikke mure
  towerThreatRange: 10,    // monstre går efter tårne, de kan nå i lige linje inden for så mange felter
  climbCost: 3,            // ekstra vejpris for at kravle over et hegn
  climbSpeed: 0.35,        // øglen kravler med 35 % af sin fart
  sellRatio: 0.6,          // ældre bygninger sælges for 60 %; nye i samme byggefase for fuld pris
  spawnIntervalSec: 1.2,
  waveArrivalSec: { 9: 40, 10: 40 },   // runder, hvor alle monstre skal nå at komme på så mange sekunder
  monsterHpGrowth: 0.15,   // +15 % liv pr. bølge
};

// grunt.tres og runner.tres
const MONSTERS = {
  blue: { name: 'Grunt',  hp: 35, armor: 1, speed: 1.0, bounty: 5, castleDamage: 1, damage: 5, interval: 1.0, color: '#3b82f6', r: 0.3 },
  red:  { name: 'Runner', hp: 20, armor: 0, speed: 1.8, bounty: 3, castleDamage: 1, damage: 3, interval: 1.0, color: '#ef4444', r: 0.25 },
  // lizard.tres: kravler over hegn (langsomt), men ikke over mure
  lizard: { name: 'Øgle', hp: 35, armor: 1, speed: 0.9, bounty: 6, castleDamage: 1, damage: 4, interval: 1.0, color: '#f97316', r: 0.24, move: 'climb' },
  // bat.tres: flyver lige mod borgen hen over alt
  bat:  { name: 'Flagermus', hp: 18, armor: 0, speed: 1.3, bounty: 6, castleDamage: 1, damage: 2, interval: 1.0, color: '#a855f7', r: 0.22, move: 'fly' },
};

// content/buildings/*.tres – kun Gård som pengebygning (ingen vindmølle eller miner).
// edge: ligger på stregen mellem to felter (mure og porte), ikke i et felt.
const BUILDINGS = {
  fence:      { name: 'Hegn', cost: 4, edge: true, climbable: true, width: 0.12, upgradesTo: 'stone_wall', color: '#b45309' },
  stone_wall: { name: 'Stenmur', cost: 10, edge: true, width: 0.24, upgradesTo: 'tall_wall', color: '#6b7280' },
  tall_wall:  { name: 'Høj mur', cost: 30, edge: true, width: 0.34, color: '#374151' },
  gate:       { name: 'Port', cost: 25, edge: true, width: 0.24, hp: 150, gate: true, upgradesTo: 'iron_gate', color: '#92400e' },
  iron_gate:  { name: 'Jernport', cost: 55, edge: true, width: 0.3, hp: 300, gate: true, color: '#44403c' },
  net:        { name: 'Klæbenet', cost: 15, blocks: false, slow: 0.4, color: '#a8a29e', label: 'N' },
  archer:     { name: 'Bueskyttetårn', cost: 40, blocks: true, tower: { damage: 10, range: 3.0, interval: 0.5 }, upgradesTo: 'archer_2', color: '#15803d', label: 'B' },
  archer_2:   { name: 'Langbuetårn', cost: 95, blocks: true, tower: { damage: 16, range: 5, interval: 0.5 }, tier: 2, color: '#166534', label: 'B' },
  cannon:     { name: 'Kanontårn', cost: 70, blocks: true, tower: { damage: 18, range: 2.3, interval: 1, splash: 0.9, ground: true }, upgradesTo: 'cannon_2', color: '#1f2937', label: 'K' },
  cannon_2:   { name: 'Stor kanon', cost: 160, blocks: true, tower: { damage: 35, range: 2.6, interval: 1, splash: 1.1, ground: true }, tier: 2, color: '#111827', label: 'K' },
  mage:       { name: 'Magertårn', cost: 130, blocks: true, tower: { damage: 10, range: 50, interval: 3.0, magic: true }, upgradesTo: 'mage_2', color: '#7c3aed', label: 'T' },
  mage_2:     { name: 'Ærkemagertårn', cost: 240, blocks: true, tower: { damage: 20, range: 50, interval: 2.4, magic: true }, tier: 2, color: '#5b21b6', label: 'T' },
  barracks:   { name: 'Kaserne', cost: 60, blocks: true, soldiers: { count: 2, hp: 90, damage: 7, armor: 1, interval: 1.0 }, upgradesTo: 'barracks_2', color: '#0e7490', label: 'Ka' },
  barracks_2: { name: 'Stor kaserne', cost: 120, blocks: true, soldiers: { count: 3, hp: 130, damage: 10, armor: 2, interval: 0.9 }, upgradesTo: 'barracks_3', tier: 2, color: '#155e75', label: 'Ka' },
  barracks_3: { name: 'Fæstningskaserne', cost: 210, blocks: true, soldiers: { count: 4, hp: 170, damage: 13, armor: 3, interval: 0.9 }, tier: 3, color: '#164e63', label: 'Ka' },
  archer_camp:{ name: 'Bueskyttelejr', cost: 70, blocks: true, soldiers: { count: 2, hp: 60, damage: 6, armor: 0, interval: 0.9, range: 2.5 }, color: '#4d7c0f', label: 'BL' },
  smithy:     { name: 'Smedje', cost: 80, blocks: true, boost: 0.25, boostRadius: 2.0, color: '#9a3412', label: 'Sm' },
  farm:       { name: 'Gård', cost: 30, blocks: true, income: 10, color: '#ca8a04', label: 'G' },
};
// Heltens opgraderinger, købes i borgen (tryk på borgen), 10 trin i hver.
// Pris for næste trin = cost + step * trin, du allerede har (halv pris siden 20. okt., rundet).
const HERO_UPGRADES = {
  attack: { name: 'Angrebshastighed', per: 0.07, cost: 30, step: 15, text: '7 % hurtigere slag' },
  damage: { name: 'Skade', per: 3, cost: 30, step: 15, text: '+3 skade' },
  hp:     { name: 'Liv', per: 40, cost: 25, step: 12.5, text: '+40 liv' },
  move:   { name: 'Bevægelse', per: 0.2, cost: 30, step: 15, text: '+0,2 felt/sek.' },
};
const HERO_MAX_LEVEL = 10;

const TOOLBAR = ['fence', 'stone_wall', 'gate', 'net', 'archer', 'cannon', 'mage', 'barracks', 'archer_camp', 'smithy', 'farm'];
const SOLDIER_ENGAGE = 0.9;   // soldaterne holder monstre inden for dette
const SOLDIER_GUARD = 2.0;    // og går ud efter monstre så langt fra deres post
const SOLDIER_SPEED = 1.5;

// Hvilke væsner der kommer i bølge n (1, 2, 3 ...).
function waveMonsters(n) {
  const list = [];
  const count = { blue: 4 + 4 * n, red: n >= 2 ? 4 * n : 0, lizard: n >= 3 ? 2 * n : 0, bat: n >= 4 ? 2 * n : 0 };
  for (const [kind, k] of Object.entries(count)) for (let i = 0; i < k; i++) list.push(kind);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// ---------- hjælpere ----------
const idx = (x, y) => y * COLS + x;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
const SQ2 = Math.SQRT2;
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const physical = (raw, armor) => Math.max(raw - Math.max(armor, 0), 1);
const center = (x, y) => ({ x: x + 0.5, y: y + 0.5 });

function isCastle(x, y) {
  const c = CONFIG.castle;
  return x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h;
}

// Lille binær hob til Dijkstra: elementer er [afstand, celleindeks].
function heapPush(h, item) {
  h.push(item);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (h[p][0] <= h[i][0]) break;
    [h[p], h[i]] = [h[i], h[p]]; i = p;
  }
}
function heapPop(h) {
  const top = h[0], last = h.pop();
  if (h.length) {
    h[0] = last;
    for (let i = 0; ;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < h.length && h[l][0] < h[m][0]) m = l;
      if (r < h.length && h[r][0] < h[m][0]) m = r;
      if (m === i) break;
      [h[m], h[i]] = [h[i], h[m]]; i = m;
    }
  }
  return top;
}

let state;

function newGame() {
  state = {
    buildings: new Map(),   // celleindeks -> bygning i et felt
    walls: new Map(),       // kant-nøgle -> mur/port på stregen mellem to felter
    phase: 'build',         // 'build' | 'wave' | 'over' | 'won'
    wave: 1,
    gold: CONFIG.startGold,
    lives: CONFIG.castleLives,
    hero: null,
    heroLv: { attack: 0, damage: 0, hp: 0, move: 0 },
    monsters: [],
    soldiers: [],
    shots: [],
    spawnQueue: [],
    spawnTimer: 0,
    field: null,
    route: [],
    tool: 'fence',
    buildOpen: false,
    selected: null,
    rallyFor: null,
    speed: 1,
    message: '',
    messageTimer: 0,
  };
  state.hero = newHero();
  recomputeField();
}

const heroLv = k => state.heroLv[k];
const heroMax = () => CONFIG.hero.hp + heroLv('hp') * HERO_UPGRADES.hp.per;
const heroDamage = () => CONFIG.hero.damage + heroLv('damage') * HERO_UPGRADES.damage.per;
const heroInterval = () => CONFIG.hero.attackInterval * Math.pow(1 - HERO_UPGRADES.attack.per, heroLv('attack'));
const heroSpeed = () => CONFIG.hero.speed + heroLv('move') * HERO_UPGRADES.move.per;
const heroUpgradeCost = k => Math.round(HERO_UPGRADES[k].cost + HERO_UPGRADES[k].step * heroLv(k));

function buyHeroUpgrade(k) {
  const c = heroUpgradeCost(k);
  if (heroLv(k) >= HERO_MAX_LEVEL || c > state.gold) return;
  state.gold -= c;
  state.heroLv[k]++;
  if (k === 'hp' && state.hero.alive) state.hero.hp += HERO_UPGRADES.hp.per;
}

function newHero() {
  const s = CONFIG.heroSpawn;
  return { x: s.x, y: s.y, hp: heroMax(), alive: true, cooldown: 0, path: [], opponent: null };
}

const buildingAt = (x, y) => (inBounds(x, y) ? state.buildings.get(idx(x, y)) : undefined);
const dataOf = b => BUILDINGS[b.id];

function isBlocking(x, y) {
  const b = buildingAt(x, y);
  return !!b && !!dataOf(b).blocks;
}

// Hvor helt og soldater må stå: ikke i borgen eller i spærrende bygninger.
function walkableCell(x, y) {
  return inBounds(x, y) && !isCastle(x, y) && !isBlocking(x, y);
}

function slowFactor(x, y) {
  const b = buildingAt(x, y);
  return b && dataOf(b).slow ? dataOf(b).slow : 1;
}

// ---------- mure på stregerne ----------
// "h x,y" er den vandrette streg på linje y fra x til x+1 (mellem felt (x,y-1) og (x,y)).
// "v x,y" er den lodrette streg på linje x fra y til y+1 (mellem felt (x-1,y) og (x,y)).
const hKey = (x, y) => `h${x},${y}`;
const vKey = (x, y) => `v${x},${y}`;

function edgeKey(ax, ay, bx, by) {
  if (bx === ax + 1) return vKey(bx, ay);
  if (bx === ax - 1) return vKey(ax, ay);
  if (by === ay + 1) return hKey(ax, by);
  return hKey(ax, ay);
}
const wallBetween = (ax, ay, bx, by) => state.walls.get(edgeKey(ax, ay, bx, by));

function edgeCells(key) {
  const [x, y] = key.slice(1).split(',').map(Number);
  return key[0] === 'h' ? [[x, y - 1], [x, y]] : [[x - 1, y], [x, y]];
}
function edgeLine(key) {
  const [x, y] = key.slice(1).split(',').map(Number);
  return key[0] === 'h' ? [x, y, x + 1, y] : [x, y, x, y + 1];
}

// Nærmeste streg ved et punkt på banen, eller null hvis den ikke kan bebygges.
function edgeAtPoint(p) {
  const cx = Math.floor(p.x), cy = Math.floor(p.y), fx = p.x - cx, fy = p.y - cy;
  const options = [
    { key: vKey(cx, cy), d: fx }, { key: vKey(cx + 1, cy), d: 1 - fx },
    { key: hKey(cx, cy), d: fy }, { key: hKey(cx, cy + 1), d: 1 - fy },
  ].sort((a, b) => a.d - b.d);
  const e = options[0];
  const [[ax, ay], [bx, by]] = edgeCells(e.key);
  if (!inBounds(ax, ay) || !inBounds(bx, by)) return null;
  if (isCastle(ax, ay) && isCastle(bx, by)) return null;
  return e;
}

// ---------- bevægelse ----------
// who: 'monster' (bygninger og porte kan smadres, borgen er målet),
//      'climber' (som monster, men kan kravle over hegn),
//      'walker'  (soldater: går frit gennem porte, ikke ind i bygninger eller borgen),
//      'hero'    (som walker, men kan også gå gennem opgraderede hegn og mure),
//      'open'    (som walker, men borgen tæller som mål – til reglen om en åben vej).
const isWalker = who => who === 'walker' || who === 'hero';
const isMonster = who => who === 'monster' || who === 'climber';
const moverOf = m => (m.s.move === 'climb' ? 'climber' : 'monster');

function cellCost(x, y, who) {
  if (!inBounds(x, y)) return Infinity;
  if (isCastle(x, y)) return isWalker(who) ? Infinity : 1;
  const b = buildingAt(x, y);
  if (!b) return 1;
  const d = dataOf(b);
  if (d.blocks) return isMonster(who) ? 1 + b.hp / 5 : Infinity;   // ca. sekunder om at smadre den
  return 1 / (d.slow || 1);
}

function edgeCost(ax, ay, bx, by, who) {
  const w = wallBetween(ax, ay, bx, by);
  if (!w) return 0;
  const d = dataOf(w);
  if (!d.gate) {
    if (who === 'climber' && d.climbable) return CONFIG.climbCost;   // øglen kravler over hegn
    return who === 'hero' && w.heroDoor ? 0 : Infinity;               // kun helten kan gå gennem opgraderede mure
  }
  return isMonster(who) ? 1 + w.hp / 5 : 0;   // monstrene skal smadre porten først
}

// Pris for at gå ét skridt (også på skrå) fra (ax,ay) i retning (dx,dy).
function stepCost(ax, ay, dx, dy, who) {
  const bx = ax + dx, by = ay + dy;
  const c = cellCost(bx, by, who);
  if (c === Infinity) return Infinity;
  if (!dx || !dy) {
    const e = edgeCost(ax, ay, bx, by, who);
    return e === Infinity ? Infinity : c + e;
  }
  // På skrå: ingen bygning i målfeltet, hjørnefelterne skal være frie og ingen mure eller porte om hjørnet.
  if (isBlocking(bx, by)) return Infinity;
  for (const [mx, my] of [[bx, ay], [ax, by]]) {
    if (!inBounds(mx, my) || isBlocking(mx, my)) return Infinity;
    if (isCastle(mx, my) && isWalker(who)) return Infinity;
    if (wallBetween(ax, ay, mx, my) || wallBetween(mx, my, bx, by)) return Infinity;
  }
  return SQ2 * c;
}

// Afstandsfelter til borgen for gående og kravlende monstre (Dijkstra med 8 retninger).
function recomputeField() {
  state.fields = { monster: buildField('monster'), climber: buildField('climber') };
  state.route = previewRoute();
  if (state.monsters) for (const m of state.monsters) m.repath = 0;
}

function buildField(who) {
  const n = COLS * ROWS;
  const field = new Float64Array(n).fill(Infinity);
  const heap = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (isCastle(x, y)) { field[idx(x, y)] = 0; heapPush(heap, [0, idx(x, y)]); }
  }
  while (heap.length) {
    const [d, i] = heapPop(heap);
    if (d > field[i]) continue;
    const bx = i % COLS, by = (i / COLS) | 0;
    for (const [dx, dy] of DIRS8) {
      const ax = bx - dx, ay = by - dy;
      if (!inBounds(ax, ay) || isCastle(ax, ay)) continue;
      const nd = d + stepCost(ax, ay, dx, dy, who);
      const ai = idx(ax, ay);
      if (nd < field[ai]) { field[ai] = nd; heapPush(heap, [nd, ai]); }
    }
  }
  return field;
}

function nextStep(cx, cy, who = 'monster') {
  const field = state.fields[who];
  let best = null, bd = Infinity;
  for (const [dx, dy] of DIRS8) {
    const nx = cx + dx, ny = cy + dy;
    const c = stepCost(cx, cy, dx, dy, who);
    if (c === Infinity) continue;
    const d = c + (isCastle(nx, ny) ? 0 : field[idx(nx, ny)]);
    if (d < bd) { bd = d; best = { x: nx, y: ny, dx, dy }; }
  }
  return best;
}

// Monstrenes vej fra midten af venstre kant, vist som prikker i byggefasen.
function previewRoute() {
  const route = [];
  let x = 0, y = ROWS >> 1;
  for (let guard = 0; guard < COLS * ROWS && !isCastle(x, y); guard++) {
    route.push(center(x, y));
    const n = nextStep(x, y);
    if (!n) break;
    x = n.x; y = n.y;
  }
  return route;
}

// Er der en åben vej (uden om mure og bygninger, gennem porte) fra venstre kant til borgen?
function hasOpening() {
  const seen = new Uint8Array(COLS * ROWS);
  const q = [];
  for (let y = 0; y < ROWS; y++) if (!isBlocking(0, y)) { seen[idx(0, y)] = 1; q.push([0, y]); }
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h];
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx, ny = y + dy;
      if (stepCost(x, y, dx, dy, 'open') === Infinity) continue;
      if (isCastle(nx, ny)) return true;
      if (!seen[idx(nx, ny)]) { seen[idx(nx, ny)] = 1; q.push([nx, ny]); }
    }
  }
  return false;
}

// Kan monstrene nå hen til alle bygninger? Mure og hegn må ikke lukke en bygning helt inde;
// porte og andre bygninger tæller ikke som lukket, for dem kan monstrene smadre.
function buildingsReachable() {
  const seen = new Uint8Array(COLS * ROWS);
  const q = [];
  for (let y = 0; y < ROWS; y++) { seen[idx(0, y)] = 1; q.push([0, y]); }
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h];
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny) || seen[idx(nx, ny)] || isCastle(nx, ny)) continue;
      const w = wallBetween(x, y, nx, ny);
      if (w && !dataOf(w).gate) continue;
      seen[idx(nx, ny)] = 1; q.push([nx, ny]);
    }
  }
  for (const b of state.buildings.values()) if (dataOf(b).blocks && !seen[idx(b.x, b.y)]) return false;
  return true;
}

// Fortryder en placering, der bryder reglerne om en åben vej til borgen og til alle bygninger.
function placementProblem() {
  if (!hasOpening()) return 'Der skal altid være en åbning til borgen!';
  if (!buildingsReachable()) return 'Monstrene skal kunne komme hen til alle bygninger!';
  return null;
}

// Kan man gå i lige linje fra a til b? Tjekkes for midten og to sidelinjer,
// så ingen skærer hjørner af mure og bygninger.
function losClear(a, b, who) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
  if (len < 1e-6) return true;
  const ox = -dy / len * 0.2, oy = dx / len * 0.2;
  for (const k of [0, 1, -1]) {
    if (!segClear(a.x + ox * k, a.y + oy * k, b.x + ox * k, b.y + oy * k, who)) return false;
  }
  return true;
}

function edgePassable(ax, ay, bx, by, who) {
  const w = wallBetween(ax, ay, bx, by);
  if (!w) return true;
  const d = dataOf(w);
  if (!d.gate) return who === 'hero' && !!w.heroDoor;
  return !isMonster(who);
}

function segClear(x0, y0, x1, y1, who) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.1));
  let cx = Math.floor(x0), cy = Math.floor(y0);
  for (let s = 1; s <= steps; s++) {
    const nx = Math.floor(x0 + (x1 - x0) * s / steps), ny = Math.floor(y0 + (y1 - y0) * s / steps);
    if (nx === cx && ny === cy) continue;
    if (!inBounds(nx, ny) || isBlocking(nx, ny)) return false;
    if (isCastle(nx, ny) && isWalker(who)) return false;
    if (nx !== cx && ny !== cy) {   // gennem et hjørne
      if (isBlocking(nx, cy) || isBlocking(cx, ny)) return false;
      if (!edgePassable(cx, cy, nx, cy, who) || !edgePassable(nx, cy, nx, ny, who) ||
          !edgePassable(cx, cy, cx, ny, who) || !edgePassable(cx, ny, nx, ny, who)) return false;
    } else if (!edgePassable(cx, cy, nx, ny, who)) return false;
    cx = nx; cy = ny;
  }
  return true;
}

// Heltens og soldaternes vej: korteste vej på kryds og tværs (8 retninger), rettet ud
// til lige linjer, hvor der er frit. Kan målet ikke nås, går de så tæt på som muligt.
function findPath(from, to, who = 'walker') {
  const clampC = (v, max) => Math.min(max - 1, Math.max(0, Math.floor(v)));
  const sx = clampC(from.x, COLS), sy = clampC(from.y, ROWS);
  const gx = clampC(to.x, COLS), gy = clampC(to.y, ROWS);
  const n = COLS * ROWS, start = idx(sx, sy), goal = idx(gx, gy);
  const d = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
  d[start] = 0;
  const heap = [[0, start]];
  let best = start, bestD = Math.hypot(sx + 0.5 - to.x, sy + 0.5 - to.y);
  while (heap.length) {
    const [cd, i] = heapPop(heap);
    if (cd > d[i]) continue;
    if (i === goal) { best = goal; break; }
    const x = i % COLS, y = (i / COLS) | 0;
    const e = Math.hypot(x + 0.5 - to.x, y + 0.5 - to.y);
    if (e < bestD) { bestD = e; best = i; }
    for (const [dx, dy] of DIRS8) {
      const c = stepCost(x, y, dx, dy, who);
      if (c === Infinity) continue;
      const ni = idx(x + dx, y + dy);
      if (cd + c < d[ni]) { d[ni] = cd + c; prev[ni] = i; heapPush(heap, [cd + c, ni]); }
    }
  }
  const cells = [];
  for (let i = best; i !== -1 && i !== start; i = prev[i]) cells.unshift(i);
  const pts = cells.map(i => center(i % COLS, (i / COLS) | 0));
  if (best === goal && walkableCell(gx, gy)) {
    if (pts.length) pts.pop();
    pts.push({ x: to.x, y: to.y });
  }
  // ret ud: spring til det fjerneste punkt, der kan ses
  const out = [];
  let cur = from;
  for (let i = 0; i < pts.length;) {
    let j = pts.length - 1;
    while (j > i && !losClear(cur, pts[j], who)) j--;
    out.push(pts[j]); cur = pts[j]; i = j + 1;
  }
  return out;
}

function followPath(o, speed, dt) {
  let step = speed * slowFactor(Math.floor(o.x), Math.floor(o.y)) * dt;
  while (step > 0 && o.path.length) {
    const p = o.path[0], d = dist(o, p);
    if (d <= step) { o.x = p.x; o.y = p.y; o.path.shift(); step -= d; }
    else { moveToward(o, p.x, p.y, step); step = 0; }
  }
}

function moveToward(o, tx, ty, step) {
  const dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy);
  if (d <= step) { o.x = tx; o.y = ty; return true; }
  o.x += dx / d * step; o.y += dy / d * step;
  return false;
}

// ---------- bygge ----------
function say(text) { state.message = text; state.messageTimer = 3; }

function placeEdge(id, key) {
  const d = BUILDINGS[id];
  if (state.walls.has(key)) return false;
  if (state.gold < d.cost) { say('Ikke nok guld.'); return false; }
  const w = { id, key, spent: d.cost, fresh: true };
  if (d.gate) w.hp = maxHp(w);
  state.walls.set(key, w);
  const problem = placementProblem();
  if (problem) {
    state.walls.delete(key);
    say(problem);
    return false;
  }
  state.gold -= d.cost;
  recomputeField();
  return true;
}

function placeCell(id, x, y) {
  const d = BUILDINGS[id];
  if (!inBounds(x, y) || isCastle(x, y) || buildingAt(x, y)) return false;
  if (x === 0) { say('Monstrene kommer ind i venstre side. Der kan ikke bygges.'); return false; }
  if (state.gold < d.cost) { say('Ikke nok guld.'); return false; }
  const h = state.hero;
  if (d.blocks && Math.floor(h.x) === x && Math.floor(h.y) === y) { say('Helten står der.'); return false; }
  const b = { id, x, y, hp: d.hp || CONFIG.buildingHp, spent: d.cost, fresh: true, cooldown: 0 };
  state.buildings.set(idx(x, y), b);
  const problem = d.blocks ? placementProblem() : null;
  if (problem) {
    state.buildings.delete(idx(x, y));
    say(problem);
    return false;
  }
  state.gold -= d.cost;
  if (d.soldiers) { b.rally = defaultRally(b); makeSoldiers(b); }
  recomputeField();
  return true;
}

const isWall = o => !!dataOf(o).edge;
function sellValue(b) { return b.fresh ? b.spent : Math.floor(b.spent * CONFIG.sellRatio); }
const maxHp = b => dataOf(b).hp || CONFIG.buildingHp;
const hasHp = b => b.hp !== undefined;
function repairCost(b) { return Math.ceil(dataOf(b).cost * (1 - b.hp / maxHp(b))); }
function upgradeCost(b) {
  const to = dataOf(b).upgradesTo;
  return to ? Math.max(BUILDINGS[to].cost - dataOf(b).cost, 0) : null;
}

function removeBuilding(b) {
  if (isWall(b)) state.walls.delete(b.key);
  else {
    state.buildings.delete(idx(b.x, b.y));
    state.soldiers = state.soldiers.filter(s => s.b !== b);
  }
  if (state.selected === b) state.selected = null;
  if (state.rallyFor === b) state.rallyFor = null;
  recomputeField();
}

function sell(b) {
  state.gold += sellValue(b);
  removeBuilding(b);
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
  if (isWall(b) && !dataOf(b).gate) b.heroDoor = true;   // helten kan gå gennem opgraderede hegn og mure
  b.id = dataOf(b).upgradesTo;
  if (hasHp(b)) b.hp = maxHp(b);
  if (dataOf(b).soldiers) makeSoldiers(b);
  recomputeField();
}

// ---------- soldater ----------
function defaultRally(b) {
  let best = null, bd = Infinity;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = b.x + dx, y = b.y + dy;
    if (!walkableCell(x, y)) continue;
    const d = Math.hypot(dx, dy) - dx * 0.01;   // ved lige afstand: mod venstre, hvor monstrene kommer fra
    if (d < bd) { bd = d; best = center(x, y); }
  }
  return best || center(b.x, b.y);
}

// Soldaternes pladser i en lille ring omkring samlingsstedet.
function posts(b) {
  const n = dataOf(b).soldiers.count, r = b.rally, out = [];
  for (let k = 0; k < n; k++) {
    const a = 2 * Math.PI * k / n;
    let p = n > 1 ? { x: r.x + Math.cos(a) * 0.35, y: r.y + Math.sin(a) * 0.35 } : { ...r };
    if (!walkableCell(Math.floor(p.x), Math.floor(p.y))) p = { ...r };
    out.push(p);
  }
  return out;
}

function makeSoldiers(b) {
  const old = state.soldiers.filter(s => s.b === b);
  state.soldiers = state.soldiers.filter(s => s.b !== b);
  const st = dataOf(b).soldiers;
  posts(b).forEach((p, k) => {
    const from = old[k] || defaultRally(b);
    state.soldiers.push({ b, stats: st, post: p, x: from.x, y: from.y, hp: st.hp, alive: true,
                          cooldown: 0, opponent: null, path: [], idle: false });
  });
}

function setRally(b, p) {
  const cx = Math.floor(p.x), cy = Math.floor(p.y);
  if (!walkableCell(cx, cy)) { say('Soldaterne kan ikke stå der.'); return; }
  b.rally = { x: p.x, y: p.y };
  const ps = posts(b);
  state.soldiers.filter(s => s.b === b).forEach((s, k) => { s.post = ps[k]; s.path = []; s.idle = false; });
  say('Soldaterne går derhen.');
}

// ---------- bølger ----------
function startWave() {
  if (state.phase !== 'build' || !hasOpening()) return;
  state.phase = 'wave';
  state.selected = null;
  state.buildOpen = false;
  state.spawnQueue = waveMonsters(state.wave);
  state.spawnTimer = 0;
  const arrive = CONFIG.waveArrivalSec[state.wave];
  state.spawnInterval = arrive ? arrive / state.spawnQueue.length : CONFIG.spawnIntervalSec;
  for (const b of state.buildings.values()) b.fresh = false;
  for (const w of state.walls.values()) w.fresh = false;
  recomputeField();
}

function endWave() {
  state.shots = [];
  state.rallyFor = null;
  let income = 0;
  for (const b of state.buildings.values()) income += dataOf(b).income || 0;
  state.gold += income;
  // fuld liv til helt, soldater og bueskytter efter hver runde
  const h = state.hero;
  if (!h.alive) Object.assign(h, newHero());
  h.hp = heroMax(); h.opponent = null;
  for (const s of state.soldiers) {
    s.b.reviving = null;
    if (!s.alive) { s.x = s.post.x; s.y = s.post.y; }
    s.alive = true; s.hp = s.stats.hp; s.opponent = null; s.path = []; s.idle = false;
  }
  if (state.wave >= CONFIG.wavesPerLevel) { state.phase = 'won'; return; }
  state.phase = 'build';
  state.wave++;
  if (income) say(`Gårdene gav ${income} guld.`);
}

function spawnMonster(kind) {
  const s = MONSTERS[kind];
  const y = Math.floor(Math.random() * ROWS);
  const hp = Math.round(s.hp * (1 + CONFIG.monsterHpGrowth * (state.wave - 1)));
  state.monsters.push({ kind, s, x: 0.5, y: y + 0.5, hp, maxHp: hp, cooldown: 0,
                        wp: null, repath: 0, heldBy: null });
}

// ---------- opdatering ----------
function update(dt) {
  if (state.messageTimer > 0) state.messageTimer -= dt;
  if (state.phase === 'over' || state.phase === 'won') return;
  updateHero(dt);
  for (const s of state.soldiers) updateSoldier(s, dt);
  if (state.phase !== 'wave') return;

  state.spawnTimer -= dt;
  if (state.spawnQueue.length && state.spawnTimer <= 0) {
    spawnMonster(state.spawnQueue.shift());
    state.spawnTimer = state.spawnInterval;
  }

  for (const b of state.buildings.values()) if (dataOf(b).tower) updateTower(b, dt);
  for (const m of state.monsters) if (m.hp > 0) updateMonster(m, dt);

  for (const m of state.monsters) if (m.hp <= 0 && !m.paid) { m.paid = true; if (!m.done) state.gold += m.s.bounty; }
  state.monsters = state.monsters.filter(m => m.hp > 0 && !m.done);
  for (const sh of state.shots) sh.t -= dt;
  state.shots = state.shots.filter(sh => sh.t > 0);

  if (state.lives <= 0) { state.lives = 0; state.phase = 'over'; return; }
  if (!state.spawnQueue.length && !state.monsters.length) endWave();
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

function releaseOpponent(o) {
  if (o.opponent && o.opponent.heldBy === o) o.opponent.heldBy = null;
  o.opponent = null;
}

function updateHero(dt) {
  const h = state.hero, cfg = CONFIG.hero;
  if (!h.alive) {
    h.respawn -= dt;
    if (h.respawn <= 0) Object.assign(h, newHero());
    return;
  }
  h.cooldown = Math.max(0, h.cooldown - dt);
  h.hp = Math.min(heroMax(), h.hp + heroMax() * cfg.regenPerSec * dt);   // helten heler langsomt
  followPath(h, heroSpeed(), dt);

  if (state.phase !== 'wave') return;
  // slås med nærmeste monster inden for rækkevidde (ikke gennem mure) og hold det fast
  const o = h.opponent;
  if (o && (o.hp <= 0 || o.done || dist(h, o) > cfg.engageRange * 1.5)) releaseOpponent(h);
  if (!h.opponent) {
    h.opponent = nearestMonster(h, cfg.engageRange, m => !m.heldBy && m.s.move !== 'fly' && losClear(h, m, 'hero'));
    if (h.opponent) h.opponent.heldBy = h;
  }
  if (h.opponent && h.cooldown <= 0) {
    h.cooldown = heroInterval();
    h.opponent.hp -= physical(heroDamage(), h.opponent.s.armor);
    state.shots.push({ x1: h.x, y1: h.y, x2: h.opponent.x, y2: h.opponent.y, t: 0.1, color: '#16a34a' });
  }
}

function moveHero(target) {
  const h = state.hero;
  if (state.phase === 'over' || state.phase === 'won' || !h.alive) return;
  h.path = findPath(h, target, 'hero');
}

function heroTakeDamage(raw) {
  const h = state.hero;
  h.hp -= physical(raw, CONFIG.hero.armor);
  if (h.hp <= 0) {
    h.hp = 0; h.alive = false; h.respawn = CONFIG.hero.respawnSec; h.path = [];
    releaseOpponent(h);
  }
}

function updateSoldier(s, dt) {
  const st = s.stats;
  if (!s.alive) {
    if (s.b.reviving && s.b.reviving !== s) return;   // kun én soldat kommer tilbage ad gangen
    s.b.reviving = s;
    s.respawn -= dt;
    if (s.respawn <= 0) {
      s.b.reviving = null;
      const r = defaultRally(s.b);
      Object.assign(s, { alive: true, hp: st.hp, x: r.x, y: r.y, path: [], idle: false });
    }
    return;
  }
  s.cooldown = Math.max(0, s.cooldown - dt);

  if (state.phase === 'wave') {
    if (st.range) {   // bueskytter: skyder, holder ikke fast
      const t = nearestMonster(s, st.range);
      if (t && s.cooldown <= 0) {
        s.cooldown = st.interval;
        t.hp -= physical(st.damage, t.s.armor);
        state.shots.push({ x1: s.x, y1: s.y, x2: t.x, y2: t.y, t: 0.1, color: '#4d7c0f' });
      }
    } else {
      const o = s.opponent;
      if (o && (o.hp <= 0 || o.done || dist(o, s.post) > SOLDIER_GUARD + 0.5)) { releaseOpponent(s); s.path = []; s.idle = false; }
      if (!s.opponent) {
        let best = null, bd = Infinity;
        for (const m of state.monsters) {
          if (m.hp <= 0 || m.heldBy || m.s.move === 'fly' || dist(m, s.post) > SOLDIER_GUARD) continue;
          const d = dist(s, m);
          if (d < bd && losClear(s, m, 'walker')) { bd = d; best = m; }
        }
        s.opponent = best;
      }
      if (s.opponent) {
        const m = s.opponent;
        if (dist(s, m) > SOLDIER_ENGAGE) { moveToward(s, m.x, m.y, SOLDIER_SPEED * dt); return; }
        if (!m.heldBy) m.heldBy = s;
        if (s.cooldown <= 0) { s.cooldown = st.interval; m.hp -= physical(st.damage, m.s.armor); }
        return;
      }
    }
  }
  // gå hen til sin plads
  if (dist(s, s.post) < 0.05) return;
  if (!s.path.length && !s.idle) { s.path = findPath(s, s.post); s.idle = !s.path.length; }
  followPath(s, SOLDIER_SPEED, dt);
  if (!s.path.length) s.idle = true;
}

function soldierTakeDamage(s, raw) {
  s.hp -= physical(raw, s.stats.armor);
  if (s.hp <= 0) {
    s.alive = false; s.respawn = CONFIG.soldierRespawnSec;
    releaseOpponent(s);
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
  const c = center(b.x, b.y);
  const canHit = m => !t.ground || m.s.move !== 'fly';   // kanoner rammer ikke flyvende
  const target = nearestMonster(c, t.range, canHit);
  if (!target) return;
  b.cooldown = t.interval;
  const dmg = Math.round(t.damage * towerBoost(b));
  const hit = m => { m.hp -= t.magic ? dmg : physical(dmg, m.s.armor); };
  if (t.splash) { for (const m of state.monsters) if (m.hp > 0 && canHit(m) && dist(m, target) <= t.splash) hit(m); }
  else hit(target);
  state.shots.push({ x1: c.x, y1: c.y, x2: target.x, y2: target.y, t: 0.12, color: t.magic ? '#7c3aed' : '#111', splash: t.splash });
}

// Hvor monsteret skal hen nu: det fjerneste punkt på vejen, det kan se i lige linje.
// Står der en bygning eller en port lige foran, skal det smadre den først.
function monsterWaypoint(m) {
  const who = moverOf(m);
  let cx = Math.floor(m.x), cy = Math.floor(m.y);
  const pts = [];
  for (let k = 0; k < 20; k++) {
    const n = nextStep(cx, cy, who);
    if (!n) break;
    const wall = (!n.dx || !n.dy) ? wallBetween(cx, cy, n.x, n.y) : null;
    if (wall && !dataOf(wall).gate) {   // et hegn, øglen kravler over
      if (k === 0) return { kind: 'climb', at: center(cx, cy), p: center(n.x, n.y) };
      break;
    }
    if (isBlocking(n.x, n.y) || wall) {
      if (k === 0) return { kind: 'attack', at: center(cx, cy), obj: wall || buildingAt(n.x, n.y) };
      break;
    }
    pts.push(center(n.x, n.y));
    if (isCastle(n.x, n.y)) break;
    cx = n.x; cy = n.y;
  }
  if (!pts.length) return null;
  for (let j = pts.length - 1; j > 0; j--) if (losClear(m, pts[j], who)) return { kind: 'move', p: pts[j] };
  return { kind: 'move', p: pts[0] };
}

function updateMonster(m, dt) {
  const s = m.s;
  m.cooldown = Math.max(0, m.cooldown - dt);
  const h = state.hero;

  if (s.move === 'fly') {   // flagermus flyver lige mod borgen hen over alt
    const c = CONFIG.castle;
    const tx = Math.min(Math.max(m.x, c.x), c.x + c.w), ty = Math.min(Math.max(m.y, c.y), c.y + c.h);
    moveToward(m, tx, ty, s.speed * dt);
    if (isCastle(Math.floor(m.x), Math.floor(m.y))) { state.lives -= s.castleDamage; m.done = true; }
    return;
  }
  if (m.climbTo) {          // midt i at kravle over et hegn
    if (moveToward(m, m.climbTo.x, m.climbTo.y, s.speed * CONFIG.climbSpeed * dt)) { m.climbTo = null; m.repath = 0; }
    return;
  }

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
      m.repath = 0;
      return;
    }
  }

  // Borgspillet: monstre tæt på helten går efter ham først (ikke gennem mure)
  if (h.alive && dist(h, m) <= CONFIG.hero.threatRange && losClear(m, h, moverOf(m))) {
    if (dist(h, m) > CONFIG.hero.engageRange * 0.9) moveToward(m, h.x, h.y, s.speed * dt);
    else if (m.cooldown <= 0) { m.cooldown = s.interval; heroTakeDamage(s.damage); }
    m.repath = 0;
    return;
  }

  // monstrene prøver at smadre tårne, de kan nå
  // (søges kun et par gange i sekundet, for rækkevidden er lang)
  m.towerTimer = (m.towerTimer || 0) - dt;
  if (m.towerTimer <= 0 || (m.tower && !stillThere(m.tower))) {
    const found = towerTarget(m);
    m.tower = found && found.b; m.towerTimer = 0.3;
  }
  if (m.tower) {
    const t = { b: m.tower, p: towerSpot(m, m.tower) };
    if (moveToward(m, t.p.x, t.p.y, s.speed * dt)) smash(m, t.b);
    m.repath = 0;
    return;
  }

  m.repath -= dt;
  if (m.repath <= 0 || !m.wp) { m.wp = monsterWaypoint(m); m.repath = 0.25; }
  const wp = m.wp;
  if (!wp) return;
  const speed = s.speed * slowFactor(Math.floor(m.x), Math.floor(m.y));

  if (wp.kind === 'move') {
    if (moveToward(m, wp.p.x, wp.p.y, speed * dt)) m.repath = 0;
    if (isCastle(Math.floor(m.x), Math.floor(m.y))) { state.lives -= s.castleDamage; m.done = true; }
    return;
  }
  if (!moveToward(m, wp.at.x, wp.at.y, speed * dt)) return;   // stil dig op foran
  if (wp.kind === 'climb') { m.climbTo = wp.p; return; }
  if (!stillThere(wp.obj)) { m.repath = 0; return; }           // smadr bygningen eller porten (aldrig mure)
  smash(m, wp.obj);
}

function stillThere(o) {
  return isWall(o) ? state.walls.get(o.key) === o : state.buildings.get(idx(o.x, o.y)) === o;
}

function smash(m, o) {
  if (m.cooldown > 0) return;
  m.cooldown = m.s.interval;
  o.hp -= m.s.damage;
  if (o.hp <= 0) removeBuilding(o);
}

// Stedet lige foran tårnet b, set fra monsteret m.
const towerSpot = (m, b) => ({ x: Math.min(Math.max(m.x, b.x - 0.3), b.x + 1.3), y: Math.min(Math.max(m.y, b.y - 0.3), b.y + 1.3) });

// Det nærmeste tårn, monsteret kan gå hen til i lige linje, og stedet foran det.
function towerTarget(m) {
  let best = null, bd = CONFIG.towerThreatRange;
  for (const b of state.buildings.values()) {
    if (!dataOf(b).tower) continue;
    const p = towerSpot(m, b);
    const d = dist(m, p);
    if (d <= bd && losClear(m, p, moverOf(m))) { bd = d; best = { b, p }; }
  }
  return best;
}

// ---------- input ----------
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);

// Kamera: tile er feltets størrelse i skærmpixels (baseTile * zoom); camX/camY er,
// hvor langt banen er rullet. Lærredet fylder hele skærmen.
const MAX_ZOOM = 3;
const TAP_SLOP = 10;          // så mange pixels må fingeren flytte sig, før det er en panorering
let baseTile = 20, zoom = 1, tile = 20, camX = 0, camY = 0, viewW = 0, viewH = 0;

function clampCamera() {
  const bw = COLS * tile, bh = ROWS * tile;
  camX = bw <= viewW ? -(viewW - bw) / 2 : Math.min(Math.max(camX, 0), bw - viewW);
  camY = bh <= viewH ? -(viewH - bh) / 2 : Math.min(Math.max(camY, 0), bh - viewH);
}

// Zoomer, så punktet (sx, sy) på skærmen bliver stående samme sted.
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
const toWorld = sp => ({ x: (sp.x + camX) / tile, y: (sp.y + camY) / tile });

function select(o) { state.selected = o; state.rallyFor = null; buildToolbar(); }

// Ét tryk = én handling. At trække med én finger ruller banen, to fingre zoomer.
function tap(p) {
  const cx = Math.floor(p.x), cy = Math.floor(p.y);
  if (!inBounds(cx, cy) || state.phase === 'over' || state.phase === 'won') return;
  if (state.rallyFor) { setRally(state.rallyFor, p); state.rallyFor = null; buildToolbar(); return; }
  if (isCastle(cx, cy)) return select('castle');   // borgen: køb opgraderinger til helten
  const e = edgeAtPoint(p);
  const wall = e && e.d < 0.22 ? state.walls.get(e.key) : null;
  const b = buildingAt(cx, cy);

  if (state.phase === 'wave') {   // under bølgen: flyt helten, eller tryk på en kaserne for at flytte soldaterne
    if (b && dataOf(b).soldiers) { state.rallyFor = b; say('Tryk hvor soldaterne skal stå.'); return; }
    moveHero(p);
    return;
  }
  if (state.buildOpen) {
    const d = BUILDINGS[state.tool];
    if (d.edge) {
      if (wall) return select(wall);
      if (e) placeEdge(state.tool, e.key);
    } else {
      if (b) return select(b);
      if (wall && e.d < 0.12) return select(wall);
      if (placeCell(state.tool, cx, cy)) recomputeField();
    }
    state.selected = null;
    buildToolbar();
    return;
  }
  if (wall) return select(wall);
  if (b) return select(b);
  state.selected = null;
  moveHero(p);
  buildToolbar();
}

const pointers = new Map();
let gesture = null;   // { start, last, moved, multi, pinchDist, mid }

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

$('bBuild').onclick = () => {
  state.buildOpen = !state.buildOpen;
  state.selected = null; state.rallyFor = null;
  buildToolbar();
};
$('bSpeed').onclick = () => { state.speed = { 1: 2, 2: 5, 5: 1 }[state.speed]; };
$('bStart').onclick = () => { startWave(); buildToolbar(); };
$('bRestart').onclick = () => { newGame(); buildToolbar(); };

// Bundmenuen: bygninger, når byggemenuen er åben, eller panelet for den valgte bygning.
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
  if (b === 'castle') {
    const info = document.createElement('span');
    info.className = 'info';
    info.textContent = 'Borgen: opgradér helten';
    bar.appendChild(info);
    for (const [k, u] of Object.entries(HERO_UPGRADES)) {
      const lv = heroLv(k), c = heroUpgradeCost(k), max = lv >= HERO_MAX_LEVEL;
      add(`${u.name} ${lv}/${HERO_MAX_LEVEL} <small>${max ? 'fuld' : `${u.text}, ${c} g`}</small>`, false, () => buyHeroUpgrade(k), max || c > state.gold);
    }
    add('Luk', false, () => { state.selected = null; });
    bar.hidden = false;
    return;
  }
  const exists = b && (isWall(b) ? state.walls.get(b.key) === b : state.buildings.get(idx(b.x, b.y)) === b);
  if (exists && state.phase === 'build') {
    const d = dataOf(b);
    const info = document.createElement('span');
    info.className = 'info';
    info.textContent = d.name + (hasHp(b) ? ` (${Math.ceil(b.hp)}/${maxHp(b)} liv)` : '');
    bar.appendChild(info);
    const up = upgradeCost(b);
    if (up !== null) add(`Opgradér til ${BUILDINGS[d.upgradesTo].name} <small>${up} g</small>`, false, () => upgrade(b), up > state.gold);
    if (hasHp(b) && b.hp < maxHp(b)) add(`Reparér <small>${repairCost(b)} g</small>`, false, () => repair(b), repairCost(b) > state.gold);
    if (d.soldiers) add('Flyt soldater', false, () => { state.rallyFor = b; say('Tryk hvor soldaterne skal stå.'); });
    add(`Sælg <small>+${sellValue(b)} g</small>`, false, () => sell(b));
    add('Luk', false, () => { state.selected = null; });
    bar.hidden = false;
    return;
  }
  state.selected = null;
  bar.hidden = !(state.buildOpen && state.phase === 'build');
  if (bar.hidden) return;
  for (const id of TOOLBAR) {
    const d = BUILDINGS[id];
    add(`${d.name} <small>${d.cost} g</small>`, state.tool === id, () => { state.tool = id; });
  }
}

// ---------- tegning ----------
function resize() {
  const app = $('app');
  viewW = app.clientWidth; viewH = app.clientHeight;
  baseTile = Math.max(8, Math.min(viewW / COLS, viewH / ROWS));
  tile = baseTile * zoom;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = viewW + 'px';
  canvas.style.height = viewH + 'px';
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
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

function drawWall(w, highlight) {
  const d = dataOf(w), [x1, y1, x2, y2] = edgeLine(w.key);
  ctx.lineCap = 'square';
  if (highlight) {
    ctx.strokeStyle = '#facc15'; ctx.lineWidth = (d.width + 0.16) * tile;
    ctx.beginPath(); ctx.moveTo(x1 * tile, y1 * tile); ctx.lineTo(x2 * tile, y2 * tile); ctx.stroke();
  }
  ctx.strokeStyle = d.color; ctx.lineWidth = d.width * tile;
  if (d.gate) ctx.setLineDash([tile * 0.22, tile * 0.1]);   // porte er stiplede
  ctx.beginPath(); ctx.moveTo(x1 * tile, y1 * tile); ctx.lineTo(x2 * tile, y2 * tile); ctx.stroke();
  ctx.setLineDash([]);
  if (w.heroDoor) {   // stiplet: helten kan gå igennem
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(2, d.width * tile * 0.45);
    ctx.lineCap = 'round'; ctx.setLineDash([0.1, tile * 0.2]);
    ctx.beginPath(); ctx.moveTo(x1 * tile, y1 * tile); ctx.lineTo(x2 * tile, y2 * tile); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.lineCap = 'butt';
  if (hasHp(w) && w.hp < maxHp(w)) hpBar((x1 + x2) / 2, (y1 + y2) / 2, w.hp / maxHp(w), 0.3);
}

function draw() {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.setTransform(dpr, 0, 0, dpr, -camX * dpr, -camY * dpr);

  // bane og spawn-zone til venstre
  ctx.fillStyle = '#e7e2d4';
  ctx.fillRect(0, 0, COLS * tile, ROWS * tile);
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
      ctx.beginPath(); ctx.arc(p.x * tile, p.y * tile, tile * 0.08, 0, Math.PI * 2); ctx.fill();
    }
  }

  // bygninger i felter
  for (const b of state.buildings.values()) {
    const d = dataOf(b), x = b.x * tile, y = b.y * tile;
    if (d.blocks) {
      ctx.fillStyle = d.color;
      ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
      text(d.label, x + tile / 2, y + tile / 2, tile * 0.42, '#fff');
    } else {   // klæbenet: kan gås igennem
      ctx.strokeStyle = d.color; ctx.lineWidth = Math.max(1, tile * 0.06);
      ctx.beginPath();
      for (let k = 1; k < 4; k++) {
        ctx.moveTo(x + k * tile / 4, y + 2); ctx.lineTo(x + k * tile / 4, y + tile - 2);
        ctx.moveTo(x + 2, y + k * tile / 4); ctx.lineTo(x + tile - 2, y + k * tile / 4);
      }
      ctx.stroke();
    }
    for (let k = 1; k < (d.tier || 1); k++) {   // røde prikker for opgraderingsniveau
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(x + 4 + (k - 1) * tile * 0.2, y + tile - tile * 0.2, tile * 0.14, tile * 0.12);
    }
    if (d.blocks && b.hp < maxHp(b)) hpBar(b.x + 0.5, b.y + 0.5, b.hp / maxHp(b), 0.45);
  }

  // valgt bygning
  const sel = state.selected === 'castle' ? null : state.selected;
  if (sel && !isWall(sel) && state.buildings.get(idx(sel.x, sel.y)) === sel) {
    ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3;
    ctx.strokeRect(sel.x * tile, sel.y * tile, tile, tile);
    const d = dataOf(sel);
    const r = d.tower && d.tower.range < 20 ? d.tower.range : d.boost ? d.boostRadius : d.soldiers && d.soldiers.range ? d.soldiers.range : 0;
    if (r) circle(sel.x + 0.5, sel.y + 0.5, r, 'rgba(250,204,21,0.12)', 'rgba(202,138,4,0.6)');
  }
  // samlingssted for valgt kaserne
  const rb = state.rallyFor || (sel && !isWall(sel) && dataOf(sel).soldiers ? sel : null);
  if (rb && rb.rally) {
    ctx.strokeStyle = 'rgba(8,145,178,0.8)'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo((rb.x + 0.5) * tile, (rb.y + 0.5) * tile); ctx.lineTo(rb.rally.x * tile, rb.rally.y * tile); ctx.stroke();
    ctx.setLineDash([]);
    circle(rb.rally.x, rb.rally.y, SOLDIER_GUARD, null, 'rgba(8,145,178,0.4)');
  }

  // mure og porte på stregerne
  for (const w of state.walls.values()) drawWall(w, w === sel);

  // borg
  const c = CONFIG.castle;
  ctx.fillStyle = '#7c5a3a';
  ctx.fillRect(c.x * tile, c.y * tile, c.w * tile, c.h * tile);
  if (state.selected === 'castle') { ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3; ctx.strokeRect(c.x * tile, c.y * tile, c.w * tile, c.h * tile); }
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
    if (m.s.move === 'fly') {   // flagermus: en ruder
      const r = m.s.r * tile * 1.3;
      ctx.fillStyle = m.s.color;
      ctx.beginPath(); ctx.moveTo(m.x * tile, m.y * tile - r); ctx.lineTo(m.x * tile + r * 1.4, m.y * tile);
      ctx.lineTo(m.x * tile, m.y * tile + r); ctx.lineTo(m.x * tile - r * 1.4, m.y * tile); ctx.closePath(); ctx.fill();
    } else circle(m.x, m.y, m.s.r, m.s.color);
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
    hpBar(h.x, h.y, h.hp / heroMax(), 0.65);
  } else {
    const s = CONFIG.heroSpawn;
    circle(s.x, s.y, 0.4, null, '#dc2626');
    text(`${Math.ceil(h.respawn)}`, s.x * tile, s.y * tile, tile * 0.45, '#dc2626');
  }

  drawHud();
}

function drawHud() {
  const h = state.hero;
  $('sWave').textContent = `Runde ${state.wave}/${CONFIG.wavesPerLevel}`;
  $('sCastle').textContent = `Borg: ${state.lives}`;
  $('sGold').textContent = `Guld: ${state.gold}`;
  $('sHero').textContent = h.alive ? `Helt: ${Math.max(0, Math.ceil(h.hp))}/${heroMax()}` : `Helt: tilbage om ${Math.ceil(h.respawn)} s`;
  const building = state.phase === 'build';
  $('bStart').disabled = !building;
  $('bBuild').disabled = !building;
  $('bBuild').classList.toggle('active', building && state.buildOpen);
  $('bBuild').textContent = building && state.buildOpen ? 'Luk byg' : 'Byg';
  $('bSpeed').textContent = `Tempo x${state.speed}`;
  $('bSpeed').classList.toggle('active', state.speed > 1);

  let msg = '';
  if (state.messageTimer > 0) msg = state.message;
  else if (state.rallyFor) msg = 'Tryk hvor soldaterne skal stå.';
  else if (building && state.buildOpen) msg = BUILDINGS[state.tool].edge
    ? 'Tryk tæt på en streg for at bygge på den.'
    : 'Tryk på et felt for at bygge.';
  $('msg').textContent = msg;
  $('msg').hidden = !msg;

  const over = state.phase === 'over' || state.phase === 'won';
  $('overlay').hidden = !over;
  if (over) $('overlayText').textContent = state.phase === 'won'
    ? `Bane 1 klaret! Borgen har ${state.lives} liv tilbage.`
    : `Borgen faldt i runde ${state.wave}`;
}

// ---------- løkke ----------
let last = performance.now();
let lastPhase = null;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (let k = 0; k < state.speed; k++) update(dt);
  if (state.phase !== lastPhase) { lastPhase = state.phase; buildToolbar(); }
  draw();
  requestAnimationFrame(frame);
}

newGame();
buildToolbar();
resize();
requestAnimationFrame(frame);
window.borgmuren = { get state() { return state; }, update, startWave, placeCell, placeEdge, moveHero, tap,
                     recomputeField, hasOpening, setRally, CONFIG, BUILDINGS, hKey, vKey };
