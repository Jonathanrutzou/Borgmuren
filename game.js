// Borgmuren – topdown borgforsvar. Ingen grafik, kun simple former.
// Bygninger, helt og monstre bruger tallene fra Borgspillet (content/*.tres).
'use strict';

let COLS = 32, ROWS = 24;            // banens størrelse; sættes af banen (bane 1: iPad 4:3 landscape)

// ---------- data (fra Borgspillet) ----------
const CONFIG = {
  startGold: 180,
  castleLives: 20,
  wavesPerLevel: 10,       // runder pr. bane, hvis banen ikke selv siger andet (waves.count)
  freezeImmuneSec: 1,      // så længe er et monster immunt over for frysning, når det er tøet op
  // heltens erfaring: monstre, helten selv dræber, giver xpPerGold × guld i XP. Niveau n → n+1 kræver
  // xpBase + xpStep × n. Hvert niveau giver +2 % skade og +2 % liv. Højst niveau 100.
  heroXp: { perGold: 2, base: 10, step: 4, maxLevel: 100, bonusPerLevel: 0.02 },
  roundExtra: { 5: 1.4, 6: 1.4, 7: 1.4, 8: 1.4 },   // runde 5-8 har 40 % flere monstre (de var for nemme)
  // knight.tres (farten er fordoblet)
  // bow i knight.tres: -3 skade, rækker 4 felter, 10 % hurtigere, rammer flagermus, holder ingen fast
  bow: { damageBonus: -3, range: 4.0, intervalFactor: 0.9 },
  // heltens hop: lander efter airSec, skader monstre inden for radius og skubber dem push felter væk
  jump: { cooldownSec: 12, airSec: 0.55, radius: 3.0, push: 6, damage: 25, pushSpeed: 12 },
  // evner købt for stjerner (knapper i toppen under bølgen). Ventetiden nulstilles efter hver bølge.
  // Kampråb: +50 % skade til helt og soldater. Hvirvelvind: helten snurrer og skader alt tæt på
  // (dpsFactor × heltens skade pr. sek.). Lynnedslag: magisk skade et sted man trykker (også flyvende).
  // Ildmur: en mur af ild på tværs af monstrenes vej, som brænder monstre på jorden.
  abilities: {
    warcry: { cooldownSec: 25, durationSec: 6, bonus: 0.5 },
    whirl: { cooldownSec: 20, durationSec: 3, radius: 1.4, dpsFactor: 2 },
    lightning: { cooldownSec: 25, radius: 1.5, damage: 120 },
    firewall: { cooldownSec: 30, durationSec: 5, length: 3, dps: 30 },
  },
  // magikeren købes i et magertårn: angriber altid monsteret nærmest tårnet, går lige så hurtigt
  // som helten, rækker 6 felter, slår hurtigt med område-skade (magi, også flagermus), men svagt
  wizard: { cost: 80, damage: 5, interval: 0.5, range: 6, splash: 0.8, hp: 80, armor: 0, respawnSec: 10 },
  hero: { hp: 220, damage: 12, armor: 3, attackInterval: 0.8, speed: 3.0,
          engageRange: 0.8, threatRange: 3.0, respawnSec: 10, regenPerSec: 0.005 },  // 0,5 % liv pr. sekund
  soldierRespawnSec: 10,   // døde soldater kommer tilbage én ad gangen
  soldierRegenPerSec: 0.002,   // soldater heler 0,2 % af deres liv pr. sekund
  buildingHp: 100,         // liv for bygninger; monstrene kan smadre dem og porte, men ikke mure
  climbCost: 3,            // ekstra vejpris for at kravle over et hegn
  climbSpeed: 0.35,        // øglen kravler med 35 % af sin fart
  repairFactor: 0.5,       // reparation koster halvdelen af den del af prisen, der svarer til de manglende liv
  sellRatio: 0.6,          // ældre bygninger sælges for 60 %; nye i samme byggefase for fuld pris
  starLives: [18, 10],      // borgens liv tilbage for 3 og 2 stjerner (ellers 1)
  // Runderne holdes korte: højst maxPerRound monstre pr. runde. Giver formlen flere, får hvert
  // monster tilsvarende mere liv, så den samlede mængde liv er den samme. Monstrene kommer i
  // grupper på groupSize, tæt efter hinanden (groupSpawnSec); næste gruppe kommer, når der er
  // højst groupNextAt monstre tilbage, eller efter groupWaitSec.
  maxPerRound: 200, groupSize: 25, groupSpawnSec: 0.2, groupNextAt: 5, groupWaitSec: 6,
  monsterHpGrowth: 0.13,   // +13 % liv pr. bølge fra hpGrowthFrom, oven i den forrige (runde 10: 2,1×, runde 20: 7,1×)
  hpGrowthFrom: 5,          // runde 1-4 har samme liv; stigningen starter i runde 5
};

// grunt.tres og runner.tres
const MONSTERS = {
  blue: { name: 'Grunt',  hp: 35, armor: 1, speed: 1.0, bounty: 3, castleDamage: 1, damage: 5, interval: 1.0, color: '#3b82f6', r: 0.3 },
  red:  { name: 'Runner', hp: 20, armor: 0, speed: 1.8, bounty: 2, castleDamage: 1, damage: 3, interval: 1.0, color: '#ef4444', r: 0.25 },
  // lizard.tres: kravler over hegn (langsomt), men ikke over mure
  lizard: { name: 'Øgle', hp: 35, armor: 1, speed: 0.9, bounty: 4, castleDamage: 1, damage: 4, interval: 1.0, color: '#f97316', r: 0.24, move: 'climb' },
  // bat.tres: flyver lige mod borgen hen over alt
  // boss i sidste runde: stor og langsom, og der kommer små monstre ud af den, hver gang den
  // har mistet 10 % af sit liv (splitEvery), og resten, når den dør
  boss: { name: 'Kæmpe-trold', hp: 5000, armor: 3, speed: 0.45, bounty: 40, castleDamage: 5, damage: 75, interval: 1.5, color: '#7f1d1d', r: 1.2, splash: 1.5,
          boss: true, breaksFences: true, splitEvery: 0.1, splitKinds: ['blue', 'blue', 'red'] },
  // (splash: slaget rammer også helt, soldater og magikere inden for så mange felter)
  // mini-boss hver 5. runde
  miniboss: { name: 'Trold-høvding', hp: 200, armor: 2, speed: 0.6, bounty: 15, castleDamage: 3, damage: 10, interval: 1.2, color: '#9a3412', r: 0.45, mini: true, breaksFences: true },
  // nye monstre efter runde 10
  wolf:   { name: 'Ulv', hp: 30, armor: 0, speed: 2.6, bounty: 3, castleDamage: 1, damage: 4, interval: 0.8, color: '#64748b', r: 0.24 },
  shield: { name: 'Skjoldtrold', hp: 80, armor: 6, speed: 0.7, bounty: 6, castleDamage: 1, damage: 8, interval: 1.2, color: '#334155', r: 0.34 },
  shaman: { name: 'Shaman', hp: 50, armor: 1, speed: 0.9, bounty: 8, castleDamage: 1, damage: 3, interval: 1.0, color: '#0d9488', r: 0.27,
            heal: 6, healRadius: 2 },   // heler andre monstre 6 liv/sek. inden for 2 felter
  slime:  { name: 'Slim', hp: 60, armor: 0, speed: 0.8, bounty: 4, castleDamage: 1, damage: 4, interval: 1.0, color: '#ca8a04', r: 0.3,
            splitInto: ['slimelet', 'slimelet'] },   // deler sig i to små, når den dør
  slimelet: { name: 'Lille slim', hp: 20, armor: 0, speed: 1.2, bounty: 1, castleDamage: 1, damage: 2, interval: 1.0, color: '#eab308', r: 0.2 },
  dragon: { name: 'Drage', hp: 120, armor: 3, speed: 0.9, bounty: 10, castleDamage: 2, damage: 6, interval: 1.0, color: '#be123c', r: 0.35, move: 'fly' },
  bat:  { name: 'Flagermus', hp: 18, armor: 0, speed: 1.3, bounty: 4, castleDamage: 1, damage: 2, interval: 1.0, color: '#a855f7', r: 0.22, move: 'fly' },
};

// content/buildings/*.tres – kun Gård som pengebygning (ingen vindmølle eller miner).
// edge: ligger på stregen mellem to felter (mure og porte), ikke i et felt.
const BUILDINGS = {
  fence:      { name: 'Hegn', cost: 4, edge: true, climbable: true, hp: 40, width: 0.12, upgradesTo: 'stone_wall', color: '#b45309' },
  stone_wall: { name: 'Stenmur', cost: 10, edge: true, breakable: true, hp: 120, width: 0.24, upgradesTo: 'tall_wall', color: '#6b7280' },
  tall_wall:  { name: 'Høj mur', cost: 30, edge: true, width: 0.34, color: '#374151' },
  gate:       { name: 'Port', cost: 25, edge: true, width: 0.24, hp: 150, gate: true, upgradesTo: 'iron_gate', color: '#92400e' },
  iron_gate:  { name: 'Jernport', cost: 55, edge: true, width: 0.3, hp: 300, gate: true, color: '#44403c' },
  net:        { name: 'Klæbenet', cost: 15, blocks: false, slow: 0.4, color: '#a8a29e', label: 'N' },
  archer:     { name: 'Bueskyttetårn', cost: 40, blocks: true, tower: { damage: 10, range: 3.0, interval: 0.5 }, upgradesTo: 'archer_2', color: '#15803d', label: 'B' },
  archer_2:   { name: 'Langbuetårn', cost: 95, blocks: true, tower: { damage: 16, range: 5, interval: 0.5 }, tier: 2, color: '#166534', label: 'B' },
  cannon:     { name: 'Kanontårn', cost: 70, blocks: true, tower: { damage: 18, range: 2.3, interval: 1, splash: 0.9, ground: true, shatter: 2 }, upgradesTo: 'cannon_2', color: '#1f2937', label: 'K' },
  cannon_2:   { name: 'Stor kanon', cost: 160, blocks: true, tower: { damage: 35, range: 2.6, interval: 1, splash: 1.1, ground: true, shatter: 2 }, tier: 2, color: '#111827', label: 'K' },
  mage:       { name: 'Magertårn', cost: 130, blocks: true, tower: { damage: 10, range: 50, interval: 3.0, magic: true }, upgradesTo: 'mage_2', color: '#7c3aed', label: 'T' },
  // frysetårn: lammer monstre i nogle sekunder (freeze), rammer ikke flyvende
  frost:      { name: 'Frysetårn', cost: 60, blocks: true, tower: { damage: 2, range: 2.5, interval: 2.0, splash: 0.6, freeze: 1.5, ground: true }, upgradesTo: 'frost_2', color: '#0891b2', label: 'F' },
  frost_2:    { name: 'Istårn', cost: 130, blocks: true, tower: { damage: 4, range: 3.0, interval: 1.6, splash: 0.8, freeze: 2.2, ground: true }, tier: 2, color: '#0e7490', label: 'F' },
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

// Tårnlinjer med niveauer, der kan låses op for stjerner (niveau 1-2 er gratis).
const TOWER_LINES = {
  archer: { name: 'Bueskyttetårn', lv5text: 'Skyder to pile ad gangen' },
  cannon: { name: 'Kanontårn', lv5text: 'Brand på jorden i 2 sek.' },
  mage: { name: 'Magertårn', lv5text: 'Lynet springer til 2 mere' },
  frost: { name: 'Frysetårn', lv5text: 'Fryser i større område' },
  barracks: { name: 'Kaserne', lv5text: 'Soldater får skjold (halv skade)' },
};
// Niveau 3-5 for tårnlinjerne laves ud fra niveau 2: +40 % skade pr. niveau, lidt længere
// rækkevidde, og opgraderingen koster 30 % mere end den forrige. Niveau 5 får en særlig evne.
// Hver bygning får line (tårnlinjen) og level (1-5), så opgraderingen kan kræve stjerner.
(function makeTowerLevels() {
  const lv5 = { archer: { multishot: 2 }, cannon: { burn: 2 }, mage: { chain: 2 }, frost: { splashBoost: 0.6 } };
  for (const line of Object.keys(TOWER_LINES)) {
    const ids = [line, line + '_2'];
    if (BUILDINGS[line + '_3']) ids.push(line + '_3');   // kasernen har allerede niveau 3
    while (ids.length < 5) {
      const lvl = ids.length + 1, prev = BUILDINGS[ids[ids.length - 1]], before = BUILDINGS[ids[ids.length - 2]];
      const id = `${line}_${lvl}`, d = { ...prev, name: `${TOWER_LINES[line].name} niv. ${lvl}`, tier: lvl };
      d.cost = prev.cost + Math.round((prev.cost - before.cost) * 1.3);
      if (prev.tower) {
        d.tower = { ...prev.tower, damage: Math.round(prev.tower.damage * 1.4), range: prev.tower.range < 20 ? +(prev.tower.range + 0.2).toFixed(1) : prev.tower.range };
        if (lvl === 5) {
          Object.assign(d.tower, lv5[line] || {});
          if (d.tower.splashBoost) { d.tower.splash += d.tower.splashBoost; delete d.tower.splashBoost; }
        }
      }
      if (prev.soldiers) {
        const p = prev.soldiers;
        d.soldiers = { ...p, count: lvl === 5 ? p.count + 1 : p.count, hp: p.hp + 50, damage: p.damage + 4, armor: p.armor + 1 };
        if (lvl === 5) d.soldiers.shield = true;   // soldaterne tager halv skade
      }
      delete d.upgradesTo;
      BUILDINGS[id] = d;
      BUILDINGS[ids[ids.length - 1]].upgradesTo = id;
      ids.push(id);
    }
    ids.forEach((id, i) => { BUILDINGS[id].line = line; BUILDINGS[id].level = i + 1; if (i > 0) BUILDINGS[id].tier = i + 1; });
  }
})();
// Opgradering til niveau 3-5 kræver, at niveauet er købt for stjerner.
const levelLocked = id => { const d = BUILDINGS[id]; return !!(d && d.line && d.level >= 3 && !owns(`${d.line}_lv${d.level}`)); };

// Bygninger, der skal låses op for stjerner, før de kan bygges.
const LOCKED = { frost: 'unlock_frost', mage: 'unlock_mage', archer_camp: 'unlock_camp', smithy: 'unlock_smithy' };

const TOOLBAR = ['fence', 'stone_wall', 'gate', 'net', 'archer', 'cannon', 'mage', 'frost', 'barracks', 'archer_camp', 'smithy', 'farm'];
const SOLDIER_ENGAGE = 0.9;   // soldaterne holder monstre inden for dette
const SOLDIER_GUARD = 2.0;    // og går ud efter monstre så langt fra deres post
const SOLDIER_SPEED = 1.5;

// Hvilke væsner der kommer i bølge n (1, 2, 3 ...). Banens 'waves' gør senere runder sværere.
function waveMonsters(n) {
  const list = [];
  const count = { blue: 4 + 4 * n, red: n >= 2 ? 4 * n : 0, lizard: n >= 3 ? 2 * n : 0, bat: n >= 4 ? 2 * n : 0 };
  // efter runde 10 (på baner med 20 runder) kommer der nye, sværere monstre til, ét nyt pr. runde
  const k = n - 10;
  if (k >= 1) count.wolf = 3 * k;
  if (k >= 2) count.shield = 2 * k;
  if (k >= 3) count.shaman = k;
  if (k >= 4) count.slime = 2 * k;
  if (k >= 5) count.dragon = k;
  let factor = (1 + Math.max(0, n - state.map.waves.same) * state.map.waves.growth) * (CONFIG.roundExtra[n] || 1);
  const fixed = state.map.waves.total[n];
  if (fixed) factor *= fixed / Object.values(count).reduce((a, b) => a + b, 0);
  for (const [kind, k] of Object.entries(count)) for (let i = 0; i < Math.round(k * factor); i++) list.push(kind);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  // loft over antal: resten bliver til ekstra liv (bosserne tæller ikke med)
  list.hpScale = 1;
  if (list.length > CONFIG.maxPerRound) {
    list.hpScale = list.length / CONFIG.maxPerRound;
    list.length = CONFIG.maxPerRound;
  }
  if (n === state.map.waves.count) list.push('boss');   // bossen kommer til sidst i sidste runde
  else if (n % 5 === 0) {   // og en mini-boss hver 5. runde, der kommer tidligt sammen med de andre
    list.splice(Math.floor(Math.random() * Math.max(1, list.length / 3)), 0, 'miniboss');
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
  const c = state.map.castle;
  return x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h;
}

// ---------- baner ----------
const T_GRASS = 0, T_WATER = 1, T_ROCK = 2, T_SPAWN = 3;
const TERRAIN_CHARS = { '.': T_GRASS, '~': T_WATER, '#': T_ROCK, 'S': T_SPAWN, 'C': T_GRASS };

// Læser en bane (fra levels.js eller baneeditoren). Kort fra editoren er utroværdige, så alt
// tjekkes; giver null og en forklaring, hvis banen ikke kan bruges.
function parseLevel(level) {
  const fail = why => ({ error: why });
  if (!level || !Array.isArray(level.map) || !level.map.length) return fail('Banen har intet kort.');
  const rows = level.map.length, cols = String(level.map[0]).length;
  if (cols < 8 || rows < 6 || cols > 80 || rows > 60) return fail('Banen skal være mellem 8×6 og 80×60 felter.');
  const terrain = new Uint8Array(cols * rows), spawns = [];
  let cx0 = Infinity, cy0 = Infinity, cx1 = -1, cy1 = -1, castleCount = 0;
  for (let y = 0; y < rows; y++) {
    const line = String(level.map[y]);
    if (line.length !== cols) return fail(`Række ${y + 1} har en anden længde end de andre.`);
    for (let x = 0; x < cols; x++) {
      const ch = line[x];
      if (!(ch in TERRAIN_CHARS)) return fail(`Ukendt tegn "${ch}" i række ${y + 1}.`);
      terrain[y * cols + x] = TERRAIN_CHARS[ch];
      if (ch === 'S') spawns.push({ x, y });
      if (ch === 'C') { castleCount++; cx0 = Math.min(cx0, x); cy0 = Math.min(cy0, y); cx1 = Math.max(cx1, x); cy1 = Math.max(cy1, y); }
    }
  }
  if (!spawns.length) return fail('Banen mangler felter, hvor monstrene kommer ind (S).');
  if (!castleCount) return fail('Banen mangler en borg (C).');
  const castle = { x: cx0, y: cy0, w: cx1 - cx0 + 1, h: cy1 - cy0 + 1 };
  if (castle.w * castle.h !== castleCount) return fail('Borgen skal være et rektangel.');
  const w = level.waves || {};
  const num = (v, lo, hi, def) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  const total = {};   // runder med et fast antal monstre i alt, fx { 10: 200 }
  if (w.total && typeof w.total === 'object') {
    for (const [k, v] of Object.entries(w.total)) if (Number(k) >= 1 && Number.isFinite(v)) total[Number(k)] = num(v, 1, 1000, 1);
  }
  const waves = { count: Math.round(num(w.count, 1, 50, CONFIG.wavesPerLevel)), same: num(w.same, 0, 99, CONFIG.wavesPerLevel), growth: num(w.growth, 0, 1, 0), hpGrowth: num(w.hpGrowth, 0, 1, 0), total };
  // helten starter i et frit felt op ad borgen, så tæt på banens midte som muligt
  let hero = null, hd = Infinity;
  for (let y = castle.y - 1; y <= castle.y + castle.h; y++) for (let x = castle.x - 1; x <= castle.x + castle.w; x++) {
    if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
    if (x >= castle.x && x < castle.x + castle.w && y >= castle.y && y < castle.y + castle.h) continue;
    if (terrain[y * cols + x] !== T_GRASS) continue;
    const d = Math.hypot(x + 0.5 - cols / 2, y + 0.5 - rows / 2);
    if (d < hd) { hd = d; hero = { x: x + 0.5, y: y + 0.5 }; }
  }
  if (!hero) return fail('Der er ingen fri plads til helten ved borgen.');
  return { name: String(level.name || 'Bane'), cols, rows, terrain, spawns, castle, heroSpawn: hero, waves };
}

const terrainAt = (x, y) => state.map.terrain[idx(x, y)];
const isObstacle = (x, y) => { const t = terrainAt(x, y); return t === T_WATER || t === T_ROCK; };
const isSpawn = (x, y) => terrainAt(x, y) === T_SPAWN;
// Kan ingen gå her (spærrende bygning, vand eller sten)?
const isSolid = (x, y) => isBlocking(x, y) || isObstacle(x, y);

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

function newGame(map = parseLevel(LEVELS[0])) {
  COLS = map.cols; ROWS = map.rows;
  state = {
    map,
    buildings: new Map(),   // celleindeks -> bygning i et felt
    walls: new Map(),       // kant-nøgle -> mur/port på stregen mellem to felter
    phase: 'build',         // 'build' | 'wave' | 'over' | 'won'
    level: 1,
    wave: 1,
    gold: CONFIG.startGold + 50 * ownCount('gold50'),
    lives: CONFIG.castleLives + 5 * ownCount('castle5'),
    hero: null,
    heroLv: { attack: 0, damage: 0, hp: 0, move: 0 },
    weapon: 'sword',        // 'sword' | 'bow' (buen købes for stjerner)
    jumpCooldown: 0,        // sekunder til helten kan hoppe igen
    abilityCd: {},          // evne -> sekunder til den kan bruges igen
    warcry: 0, whirl: 0,    // sekunder tilbage af kampråb og hvirvelvind
    aiming: null,           // 'lightning' | 'firewall': næste tryk på banen bruger evnen
    heroLevel: owns('hero_startxp') ? 5 : 1, heroXp: 0,   // heltens niveau og erfaring på denne bane
    effects: [],            // chokbølger fra heltens hop
    fires: [],              // brand på jorden fra kanoner på niveau 5
    monsters: [],
    soldiers: [],
    wizards: [],            // magikere fra magertårne
    destroyed: [],          // bygninger smadret i denne bølge; de kommer tilbage efter bølgen
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
const warcryMul = () => (state.warcry > 0 ? 1 + CONFIG.abilities.warcry.bonus : 1);
const levelBonus = () => 1 + CONFIG.heroXp.bonusPerLevel * ((state.heroLevel || 1) - 1);
// stjerne-køb: Hårdfør +50 % liv, Skarpt sværd +50 % skade, Hurtige ben +30 % fart
const heroMax = () => Math.round((CONFIG.hero.hp + heroLv('hp') * HERO_UPGRADES.hp.per) * levelBonus() * (owns('hero_tough') ? 1.5 : 1));
const heroDamage = () => Math.round((CONFIG.hero.damage + heroLv('damage') * HERO_UPGRADES.damage.per) * levelBonus() * (owns('hero_sword') ? 1.5 : 1) * warcryMul());
const xpToNext = () => CONFIG.heroXp.base + CONFIG.heroXp.step * state.heroLevel;

// Helten får erfaring for de monstre, han selv dræber, og stiger i niveau.
function gainXp(xp) {
  const cfg = CONFIG.heroXp, h = state.hero;
  if (state.heroLevel >= cfg.maxLevel) return;
  state.heroXp += xp;
  while (state.heroLevel < cfg.maxLevel && state.heroXp >= xpToNext()) {
    state.heroXp -= xpToNext();
    const before = heroMax();
    state.heroLevel++;
    if (h.alive) h.hp += heroMax() - before;
    state.effects.push({ x: h.x, y: h.y, t: 0, dur: 1.2, text: `Niveau ${state.heroLevel}!` });
  }
  if (state.heroLevel >= cfg.maxLevel) state.heroXp = 0;
}
const heroInterval = () => CONFIG.hero.attackInterval * Math.pow(1 - HERO_UPGRADES.attack.per, heroLv('attack'));
const heroSpeed = () => (CONFIG.hero.speed + heroLv('move') * HERO_UPGRADES.move.per) * (owns('hero_legs') ? 1.3 : 1);
const heroUpgradeCost = k => Math.round(HERO_UPGRADES[k].cost + HERO_UPGRADES[k].step * heroLv(k));

function buyHeroUpgrade(k) {
  const c = heroUpgradeCost(k);
  if (heroLv(k) >= HERO_MAX_LEVEL || c > state.gold) return;
  state.gold -= c;
  state.heroLv[k]++;
  if (k === 'hp' && state.hero.alive) state.hero.hp += HERO_UPGRADES.hp.per;
}

function newHero() {
  const s = state.map.heroSpawn;
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
  return inBounds(x, y) && !isCastle(x, y) && !isSolid(x, y);
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
const isMonster = who => who === 'monster' || who === 'climber' || who === 'breaker';
const moverOf = m => (m.s.move === 'climb' ? 'climber' : m.s.breaksFences ? 'breaker' : 'monster');

function cellCost(x, y, who) {
  if (!inBounds(x, y) || isObstacle(x, y)) return Infinity;
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
    if (who === 'breaker' && (d.climbable || d.breakable)) return 1 + (w.hp ?? d.hp) / 10;   // bossen smadrer hegn og stenmure (10 skade/sek.)
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
    if (!inBounds(mx, my) || isSolid(mx, my)) return Infinity;
    if (isCastle(mx, my) && isWalker(who)) return Infinity;
    if (wallBetween(ax, ay, mx, my) || wallBetween(mx, my, bx, by)) return Infinity;
  }
  return SQ2 * c;
}

// Afstandsfelter til borgen for gående og kravlende monstre (Dijkstra med 8 retninger).
// Monstrene går først efter tårne, så efter gårde og til sidst efter borgen, uanset afstand.
// Derfor er der et afstandsfelt til hvert slags mål (pr. bevægelsestype).
function recomputeField() {
  state.fields = { monster: buildField('monster'), climber: buildField('climber'), breaker: buildField('breaker') };
  const towers = [], farms = [];
  for (const b of state.buildings.values()) {
    if (dataOf(b).tower) towers.push(b); else if (dataOf(b).income) farms.push(b);
  }
  const seeds = list => list.flatMap(b => attackSpots(b).map(p => idx(p.cx, p.cy)));
  state.targetFields = {};
  for (const who of ['monster', 'climber', 'breaker']) {
    state.targetFields[who] = { tower: towers.length ? buildField(who, seeds(towers)) : null,
                                farm: farms.length ? buildField(who, seeds(farms)) : null };
  }
  state.route = previewRoute();
  if (state.monsters) for (const m of state.monsters) m.repath = 0;
}

// Afstand til målet for hvert felt. Uden seeds er målet borgen, ellers de givne felter.
function buildField(who, seeds) {
  const n = COLS * ROWS;
  const field = new Float64Array(n).fill(Infinity);
  const heap = [];
  if (seeds) for (const i of seeds) { field[i] = 0; heapPush(heap, [0, i]); }
  else for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
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

function nextStep(cx, cy, who = 'monster', field = state.fields[who]) {
  let best = null, bd = Infinity;
  for (const [dx, dy] of DIRS8) {
    const nx = cx + dx, ny = cy + dy;
    const c = stepCost(cx, cy, dx, dy, who);
    if (c === Infinity) continue;
    const d = c + field[idx(nx, ny)];
    if (d < bd) { bd = d; best = { x: nx, y: ny, dx, dy }; }
  }
  return best;
}

// Monstrenes vej fra det midterste indgangsfelt, vist som prikker i byggefasen.
function previewRoute() {
  const route = [];
  const sp = state.map.spawns[state.map.spawns.length >> 1];
  let x = sp.x, y = sp.y;
  for (let guard = 0; guard < COLS * ROWS && !isCastle(x, y); guard++) {
    route.push(center(x, y));
    const n = nextStep(x, y);
    if (!n) break;
    x = n.x; y = n.y;
  }
  return route;
}

// Er der en åben vej (uden om mure og bygninger, gennem porte) fra monstrenes indgang til borgen?
function hasOpening() {
  const seen = new Uint8Array(COLS * ROWS);
  const q = [];
  for (const { x, y } of state.map.spawns) if (!isBlocking(x, y)) { seen[idx(x, y)] = 1; q.push([x, y]); }
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
  for (const { x, y } of state.map.spawns) { seen[idx(x, y)] = 1; q.push([x, y]); }
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h];
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny) || seen[idx(nx, ny)] || isCastle(nx, ny) || isObstacle(nx, ny)) continue;
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
    if (!inBounds(nx, ny) || isSolid(nx, ny)) return false;
    if (isCastle(nx, ny) && isWalker(who)) return false;
    if (nx !== cx && ny !== cy) {   // gennem et hjørne
      if (isSolid(nx, cy) || isSolid(cx, ny)) return false;
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
  if (LOCKED[id] && !owns(LOCKED[id])) { say(`${d.name} skal låses op for stjerner.`); return false; }
  if (isSpawn(x, y)) { say('Her kommer monstrene ind. Der kan ikke bygges.'); return false; }
  if (isObstacle(x, y)) { say(terrainAt(x, y) === T_WATER ? 'Der kan ikke bygges på vand.' : 'Der kan ikke bygges på sten.'); return false; }
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
function repairCost(b) { return Math.ceil(dataOf(b).cost * (1 - b.hp / maxHp(b)) * CONFIG.repairFactor); }
function upgradeCost(b) {
  const to = dataOf(b).upgradesTo;
  return to ? Math.max(BUILDINGS[to].cost - dataOf(b).cost, 0) : null;
}

function removeBuilding(b) {
  if (isWall(b)) state.walls.delete(b.key);
  else {
    state.buildings.delete(idx(b.x, b.y));
    state.soldiers = state.soldiers.filter(s => s.b !== b);
    state.wizards = state.wizards.filter(w => w.b !== b);
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
  if (c === null || c > state.gold || levelLocked(dataOf(b).upgradesTo)) return;
  state.gold -= c; b.spent += c;
  if (isWall(b) && !dataOf(b).gate) b.heroDoor = true;   // helten kan gå gennem opgraderede hegn og mure
  b.id = dataOf(b).upgradesTo;
  if (isWall(b) && !dataOf(b).gate) delete b.hp;   // mure kan ikke smadres (kun bossen smadrer hegn)
  else if (hasHp(b)) b.hp = maxHp(b);
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
  saveGame();   // med det, der er bygget i byggefasen
  state.phase = 'wave';
  state.selected = null;
  state.buildOpen = false;
  state.spawnQueue = waveMonsters(state.wave);
  state.waveHpScale = state.spawnQueue.hpScale || 1;
  state.spawnTimer = 0;
  state.groupLeft = CONFIG.groupSize; state.groupWait = 0;
  for (const b of state.buildings.values()) b.fresh = false;
  for (const w of state.walls.values()) w.fresh = false;
  recomputeField();
}

function endWave() {
  state.shots = [];
  state.abilityCd = {}; state.warcry = 0; state.whirl = 0; state.aiming = null;
  state.fires = [];
  state.effects = [];
  state.rallyFor = null;
  let income = 0;   // gårde, der blev smadret i bølgen, er væk og giver ikke guld
  for (const b of state.buildings.values()) income += dataOf(b).income || 0;
  state.gold += income;
  for (const b of state.destroyed) {   // smadrede bygninger kommer tilbage med fuldt liv
    if (state.buildings.has(idx(b.x, b.y))) continue;
    b.hp = maxHp(b);
    state.buildings.set(idx(b.x, b.y), b);
    if (dataOf(b).soldiers) makeSoldiers(b);
    if (b.wizard) addWizard(b);
  }
  state.destroyed = [];
  recomputeField();
  // fuld liv til helt, soldater og bueskytter efter hver runde
  const h = state.hero;
  if (!h.alive) Object.assign(h, newHero());
  h.hp = heroMax(); h.opponent = null;
  for (const w of state.wizards) {   // magikere får også fuldt liv
    if (!w.alive) Object.assign(w, defaultRally(w.b));
    w.alive = true; w.hp = CONFIG.wizard.hp; w.path = [];
  }
  for (const s of state.soldiers) {
    s.b.reviving = null;
    if (!s.alive) { s.x = s.post.x; s.y = s.post.y; }
    s.alive = true; s.hp = s.stats.hp; s.opponent = null; s.path = []; s.idle = false;
  }
  if (state.wave >= state.map.waves.count) { state.phase = 'won'; return; }
  state.phase = 'build';
  state.wave++;
  saveGame();
  if (income) say(`Gårdene gav ${income} guld.`);
}

// Monsterets liv i den nuværende runde (stiger pr. runde og efter banens hpGrowth).
function waveHp(s, scale = state.waveHpScale || 1) {
  const w = state.map.waves, extra = Math.max(0, state.wave - w.same) * w.hpGrowth;
  const pool = s.boss || s.mini ? 1 : scale;   // bosserne får ikke ekstra liv fra loftet
  return Math.round(s.hp * Math.pow(1 + CONFIG.monsterHpGrowth, Math.max(0, state.wave - CONFIG.hpGrowthFrom + 1)) * (1 + extra) * pool);
}

function spawnMonster(kind) {
  const s = MONSTERS[kind];
  // kun fra indgangsfelter, hvorfra der er vej til borgen (et felt kan være hegnet inde)
  const open = state.map.spawns.filter(p => state.fields.monster[idx(p.x, p.y)] < Infinity);
  const list = open.length ? open : state.map.spawns;
  const sp = list[Math.floor(Math.random() * list.length)];
  addMonster(kind, sp.x + 0.5, sp.y + 0.5);
}

function addMonster(kind, x, y) {
  const s = MONSTERS[kind], hp = waveHp(s);
  const m = { kind, s, x, y, hp, maxHp: hp, cooldown: 0, wp: null, repath: 0, heldBy: null };
  if (s.boss) m.nextSplit = hp * (1 - s.splitEvery);
  state.monsters.push(m);
}

// Bossen taber små monstre, efterhånden som den tager skade.
function bossSplits(m) {
  const s = m.s;
  while (m.nextSplit > 0 && m.hp <= m.nextSplit) {
    m.nextSplit -= m.maxHp * s.splitEvery;
    s.splitKinds.forEach((kind, k) => {
      const a = Math.random() * Math.PI * 2, r = 0.4 + 0.2 * k;
      let x = m.x + Math.cos(a) * r, y = m.y + Math.sin(a) * r;
      if (!walkableCell(Math.floor(x), Math.floor(y)) && !isCastle(Math.floor(x), Math.floor(y))) { x = m.x; y = m.y; }
      addMonster(kind, x, y);
    });
  }
}

// ---------- opdatering ----------
function update(dt) {
  if (state.messageTimer > 0) state.messageTimer -= dt;
  if (state.phase === 'over' || state.phase === 'won') return;
  updateHero(dt);
  for (const s of state.soldiers) updateSoldier(s, dt);
  for (const w of state.wizards) updateWizard(w, dt);
  if (state.phase !== 'wave') return;

  // monstrene kommer i grupper: tæt efter hinanden, og næste gruppe, når banen er ved at være tom
  state.spawnTimer -= dt;
  if (state.spawnQueue.length) {
    if (state.groupLeft <= 0) {
      state.groupWait += dt;
      if (state.monsters.length <= CONFIG.groupNextAt || state.groupWait >= CONFIG.groupWaitSec) {
        state.groupLeft = CONFIG.groupSize; state.groupWait = 0; state.spawnTimer = 0;
      }
    } else if (state.spawnTimer <= 0) {
      spawnMonster(state.spawnQueue.shift());
      state.groupLeft--;
      state.spawnTimer = CONFIG.groupSpawnSec;
    }
  }

  updateAbilities(dt);
  for (const b of state.buildings.values()) if (dataOf(b).tower) updateTower(b, dt);
  for (const m of state.monsters) if (m.hp > 0) updateMonster(m, dt);
  for (const m of state.monsters.slice()) if (m.s.boss && !m.done) bossSplits(m);

  for (const m of state.monsters) if (m.s.heal && m.hp > 0 && !m.done) {   // shamaner heler monstrene omkring sig
    for (const o of state.monsters) {
      if (o !== m && o.hp > 0 && dist(o, m) <= m.s.healRadius) o.hp = Math.min(o.maxHp, o.hp + m.s.heal * dt);
    }
  }
  for (const m of state.monsters.slice()) if (m.hp <= 0 && !m.paid) {
    m.paid = true;
    if (m.done) continue;
    state.gold += m.s.bounty;
    if (m.lastHit === 'hero') gainXp(m.s.bounty * CONFIG.heroXp.perGold);
    if (m.s.splitInto) m.s.splitInto.forEach((kind, i) => addMonster(kind, m.x + (i ? 0.2 : -0.2), m.y));   // slim deler sig
  }
  state.monsters = state.monsters.filter(m => m.hp > 0 && !m.done);
  for (const sh of state.shots) sh.t -= dt;
  for (const e of state.effects) e.t += dt;
  for (const f of state.fires) {   // brand: skader monstre på jorden, der står i den
    f.t -= dt;
    for (const m of state.monsters) if (m.hp > 0 && m.s.move !== 'fly' && dist(m, f) <= f.r) m.hp -= f.dps * dt;
  }
  state.fires = state.fires.filter(f => f.t > 0);
  state.effects = state.effects.filter(e => e.t < e.dur);
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
  state.jumpCooldown = Math.max(0, state.jumpCooldown - dt);
  if (h.jump !== undefined) {   // i luften: står stille, lander og laver en chokbølge
    h.jump += dt;
    if (h.jump >= CONFIG.jump.airSec) { delete h.jump; landJump(h); }
    return;
  }
  followPath(h, heroSpeed(), dt);

  if (state.phase !== 'wave') return;
  if (state.weapon === 'bow') {   // buen: skyder det nærmeste monster (også flagermus), men holder ingen fast
    releaseOpponent(h);
    const t = nearestMonster(h, CONFIG.bow.range);
    if (t && h.cooldown <= 0) {
      h.cooldown = heroInterval() * CONFIG.bow.intervalFactor;
      t.hp -= physical(heroDamage() + CONFIG.bow.damageBonus, t.s.armor); t.lastHit = 'hero';
      state.shots.push({ x1: h.x, y1: h.y, x2: t.x, y2: t.y, t: 0.12, color: '#15803d' });
    }
    return;
  }
  // slås med nærmeste monster inden for rækkevidde (ikke gennem mure) og hold det fast
  const o = h.opponent;
  if (o && (o.hp <= 0 || o.done || dist(h, o) > cfg.engageRange * 1.5)) releaseOpponent(h);
  if (!h.opponent) {
    h.opponent = nearestMonster(h, cfg.engageRange, m => !m.heldBy && m.s.move !== 'fly' && losClear(h, m, 'hero'));
    if (h.opponent) h.opponent.heldBy = h;
  }
  if (h.opponent && h.cooldown <= 0) {
    h.cooldown = heroInterval();
    h.opponent.hp -= physical(heroDamage(), h.opponent.s.armor); h.opponent.lastHit = 'hero';
    state.shots.push({ x1: h.x, y1: h.y, x2: h.opponent.x, y2: h.opponent.y, t: 0.1, color: '#16a34a' });
  }
}

// ---------- heltens hop ----------
function heroJump() {
  const h = state.hero;
  if (state.phase !== 'wave' || !h.alive || h.jump !== undefined || state.jumpCooldown > 0) return;
  h.jump = 0; h.path = [];
  releaseOpponent(h);
  state.jumpCooldown = CONFIG.jump.cooldownSec;
}

function landJump(h) {
  const cfg = CONFIG.jump;
  state.effects.push({ x: h.x, y: h.y, t: 0, dur: 0.45, r: cfg.radius });
  for (const m of state.monsters) {
    if (m.hp <= 0 || m.done || m.s.move === 'fly') continue;
    const d = dist(h, m);
    if (d > cfg.radius) continue;
    m.hp -= physical(cfg.damage, m.s.armor); m.lastHit = 'hero';
    const a = d > 0.01 ? Math.atan2(m.y - h.y, m.x - h.x) : Math.random() * Math.PI * 2;
    m.push = { dx: Math.cos(a), dy: Math.sin(a), left: cfg.push };
    m.heldBy = null; m.climbTo = null; m.wp = null;
  }
}

// ---------- evner (købes for stjerner) ----------
const ABILITY_NAMES = { warcry: 'Kampråb', whirl: 'Hvirvel', lightning: 'Lyn', firewall: 'Ildmur' };   // korte navne til knapperne
const abilityReady = id => owns(id) && state.phase === 'wave' && !(state.abilityCd[id] > 0);

// Kampråb og hvirvelvind virker med det samme; lyn og ildmur venter på et tryk på banen.
function useAbility(id) {
  if (state.aiming === id) { state.aiming = null; return; }   // tryk igen: fortryd
  if (!abilityReady(id)) return;
  const cfg = CONFIG.abilities[id], h = state.hero;
  if (id === 'warcry') {
    state.warcry = cfg.durationSec;
    if (h.alive) state.effects.push({ x: h.x, y: h.y, t: 0, dur: 0.6, r: 2.5, color: '220,38,38' });
  } else if (id === 'whirl') {
    if (!h.alive) return;
    state.whirl = cfg.durationSec;
  } else {
    state.aiming = id;
    say(id === 'lightning' ? 'Tryk hvor lynet skal slå ned.' : 'Tryk hvor ildmuren skal stå.');
    return;
  }
  state.abilityCd[id] = cfg.cooldownSec;
}

// Lynnedslag og ildmur på et punkt p på banen. Afviser punkter uden for banen.
function castAt(id, p) {
  if (!abilityReady(id) || !inBounds(Math.floor(p.x), Math.floor(p.y))) return false;
  const cfg = CONFIG.abilities[id];
  if (id === 'lightning') {
    for (const m of state.monsters) if (m.hp > 0 && !m.done && dist(m, p) <= cfg.radius) m.hp -= cfg.damage;
    state.effects.push({ x: p.x, y: p.y, t: 0, dur: 0.5, r: cfg.radius, color: '234,179,8', bolt: true });
  } else if (id === 'firewall') {
    // på tværs af monstrenes vej: går de vandret her, står muren lodret og omvendt
    const cx = Math.floor(p.x), cy = Math.floor(p.y), f = state.fields.monster;
    const at = (x, y) => (inBounds(x, y) ? f[idx(x, y)] : Infinity);
    const across = Math.min(at(cx - 1, cy), at(cx + 1, cy)) <= Math.min(at(cx, cy - 1), at(cx, cy + 1));
    const half = (cfg.length - 1) / 2;
    for (let k = -half; k <= half; k++) {
      const x = cx + (across ? 0 : k), y = cy + (across ? k : 0);
      if (inBounds(x, y)) state.fires.push({ x: x + 0.5, y: y + 0.5, r: 0.6, t: cfg.durationSec, dps: cfg.dps });
    }
  } else return false;
  state.abilityCd[id] = cfg.cooldownSec;
  state.aiming = null;
  return true;
}

function updateAbilities(dt) {
  for (const id of Object.keys(state.abilityCd)) state.abilityCd[id] = Math.max(0, state.abilityCd[id] - dt);
  state.warcry = Math.max(0, state.warcry - dt);
  const h = state.hero;
  if (state.whirl > 0 && h.alive) {   // hvirvelvind: skader alt på jorden tæt på helten
    const cfg = CONFIG.abilities.whirl;
    for (const m of state.monsters) {
      if (m.hp <= 0 || m.done || m.s.move === 'fly' || dist(m, h) > cfg.radius) continue;
      m.hp -= physical(heroDamage() * cfg.dpsFactor, m.s.armor) * dt; m.lastHit = 'hero';
    }
  }
  state.whirl = h.alive ? Math.max(0, state.whirl - dt) : 0;
}

// Skubbet af hoppet: glider væk, til det har flyttet sig langt nok eller rammer en mur.
function pushMonster(m, dt) {
  const p = m.push, step = Math.min(p.left, CONFIG.jump.pushSpeed * dt);
  const nx = m.x + p.dx * step, ny = m.y + p.dy * step;
  if (step <= 0 || !segClear(m.x, m.y, nx, ny, moverOf(m)) || isCastle(Math.floor(nx), Math.floor(ny))) { delete m.push; return; }
  m.x = nx; m.y = ny; p.left -= step;
  if (p.left <= 0) delete m.push;
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
    h.hp = 0; h.alive = false; h.respawn = owns('hero_revive') ? 5 : CONFIG.hero.respawnSec; h.path = [];
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
  s.hp = Math.min(st.hp, s.hp + st.hp * CONFIG.soldierRegenPerSec * dt);   // soldaterne heler langsomt

  if (state.phase === 'wave') {
    if (st.range) {   // bueskytter: skyder, holder ikke fast
      const t = nearestMonster(s, st.range);
      if (t && s.cooldown <= 0) {
        s.cooldown = st.interval;
        t.hp -= physical(st.damage * warcryMul(), t.s.armor);
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
        if (s.cooldown <= 0) { s.cooldown = st.interval; m.hp -= physical(st.damage * warcryMul(), m.s.armor); }
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

// ---------- magiker ----------
function buyWizard(b) {
  const c = CONFIG.wizard.cost;
  if (b.wizard || !dataOf(b).tower || !dataOf(b).tower.magic || c > state.gold) return;
  state.gold -= c; b.spent += c; b.wizard = true;
  addWizard(b);
}
function addWizard(b) {
  const p = defaultRally(b);
  state.wizards.push({ b, x: p.x, y: p.y, hp: CONFIG.wizard.hp, alive: true, cooldown: 0, path: [], repath: 0 });
}

function updateWizard(w, dt) {
  const cfg = CONFIG.wizard;
  if (!w.alive) {   // død: kommer tilbage ved tårnet efter 10 sek.
    w.respawn -= dt;
    if (w.respawn <= 0) Object.assign(w, defaultRally(w.b), { alive: true, hp: cfg.hp, path: [], repath: 0 });
    return;
  }
  w.cooldown = Math.max(0, w.cooldown - dt);
  w.repath -= dt;
  // målet er altid monsteret nærmest tårnet
  const target = state.phase === 'wave' ? nearestMonster(center(w.b.x, w.b.y), Infinity) : null;
  if (target && dist(w, target) <= cfg.range) {
    w.path = [];
    if (w.cooldown <= 0) {
      w.cooldown = cfg.interval;
      for (const m of state.monsters) if (m.hp > 0 && dist(m, target) <= cfg.splash) m.hp -= cfg.damage;   // magi: ingen rustning
      state.shots.push({ x1: w.x, y1: w.y, x2: target.x, y2: target.y, t: 0.12, color: '#a855f7', splash: cfg.splash });
    }
    return;
  }
  const goal = target || defaultRally(w.b);
  if (w.repath <= 0) { w.path = dist(w, goal) > 0.1 ? findPath(w, goal) : []; w.repath = 0.5; }
  followPath(w, heroSpeed(), dt);
}

function wizardTakeDamage(w, raw) {
  w.hp -= physical(raw, CONFIG.wizard.armor);
  if (w.hp <= 0) { w.alive = false; w.respawn = CONFIG.wizard.respawnSec; w.path = []; }
}

function soldierTakeDamage(s, raw) {
  s.hp -= physical(raw, s.stats.armor) * (s.stats.shield ? 0.5 : 1);   // niveau 5 kaserne: skjold
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
  const canHit = m => !t.ground || m.s.move !== 'fly';   // kanoner og frysetårne rammer ikke flyvende
  // frysetårne sigter helst på monstre, der ikke allerede er frosne
  const target = (t.freeze && nearestMonster(c, t.range, m => canHit(m) && !(m.frozen > 0) && !(m.freezeImmune > 0))) || nearestMonster(c, t.range, canHit);
  if (!target) return;
  b.cooldown = t.interval;
  const dmg = Math.round(t.damage * towerBoost(b));
  const hit = m => {
    const d = t.shatter && m.frozen > 0 ? dmg * t.shatter : dmg;   // kanoner knuser frosne monstre (dobbelt skade)
    m.hp -= t.magic ? d : physical(d, m.s.armor);
    if (t.freeze && !(m.freezeImmune > 0)) m.frozen = Math.max(m.frozen || 0, t.freeze);
  };
  if (t.splash) { for (const m of state.monsters) if (m.hp > 0 && canHit(m) && dist(m, target) <= t.splash) hit(m); }
  else hit(target);
  const color = t.magic ? '#7c3aed' : t.freeze ? '#22d3ee' : '#111';
  state.shots.push({ x1: c.x, y1: c.y, x2: target.x, y2: target.y, t: 0.12, color, splash: t.splash });
  if (t.multishot) {   // niveau 5 bueskytte: flere pile, hver mod sit eget monster
    const others = state.monsters.filter(m => m !== target && m.hp > 0 && canHit(m) && dist(m, c) <= t.range)
      .sort((a, b2) => dist(a, c) - dist(b2, c)).slice(0, t.multishot - 1);
    for (const m of others) { hit(m); state.shots.push({ x1: c.x, y1: c.y, x2: m.x, y2: m.y, t: 0.12, color }); }
  }
  if (t.chain) {   // niveau 5 magertårn: lynet springer videre til de nærmeste monstre
    let from = target;
    const hitSet = new Set([target]);
    for (let k = 0; k < t.chain; k++) {
      const next = state.monsters.filter(m => !hitSet.has(m) && m.hp > 0 && dist(m, from) <= 3).sort((a, b2) => dist(a, from) - dist(b2, from))[0];
      if (!next) break;
      hit(next); hitSet.add(next);
      state.shots.push({ x1: from.x, y1: from.y, x2: next.x, y2: next.y, t: 0.15, color });
      from = next;
    }
  }
  if (t.burn) state.fires.push({ x: target.x, y: target.y, r: t.splash, t: t.burn, dps: Math.round(dmg * 0.3) });   // niveau 5 kanon: brand
}

// Hvor monsteret skal hen nu: det fjerneste punkt på vejen, det kan se i lige linje.
// Står der en bygning eller en port lige foran, skal det smadre den først.
function monsterWaypoint(m) {
  const who = moverOf(m);
  let cx = Math.floor(m.x), cy = Math.floor(m.y);
  // først tårne, så gårde, så borgen – det første mål, der kan nås
  const tf = state.targetFields[who];
  let field = state.fields[who], goal = null;
  for (const kind of ['tower', 'farm']) {
    if (tf[kind] && tf[kind][idx(cx, cy)] < Infinity) { field = tf[kind]; goal = kind; break; }
  }
  if (goal && field[idx(cx, cy)] === 0) {   // fremme: slå bygningen ved siden af
    const t = targetNextTo(cx, cy, goal);
    if (t) return { kind: 'attack', at: t.p, obj: t.b };
  }
  const pts = [];
  for (let k = 0; k < 20; k++) {
    const n = nextStep(cx, cy, who, field);
    if (!n) break;
    const wall = (!n.dx || !n.dy) ? wallBetween(cx, cy, n.x, n.y) : null;
    if (wall && !dataOf(wall).gate && who !== 'breaker') {   // et hegn, øglen kravler over
      if (k === 0) return { kind: 'climb', at: center(cx, cy), p: center(n.x, n.y) };
      break;
    }
    if (isBlocking(n.x, n.y) || wall) {
      if (k === 0) {
        if (wall && wall.hp === undefined) wall.hp = maxHp(wall);   // et hegn, bossen begynder at smadre
        return { kind: 'attack', at: center(cx, cy), obj: wall || buildingAt(n.x, n.y) };
      }
      break;
    }
    pts.push(center(n.x, n.y));
    if (isCastle(n.x, n.y) || field[idx(n.x, n.y)] === 0) break;
    cx = n.x; cy = n.y;
  }
  if (!pts.length) return null;
  for (let j = pts.length - 1; j > 0; j--) if (losClear(m, pts[j], who)) return { kind: 'move', p: pts[j] };
  return { kind: 'move', p: pts[0] };
}

function updateMonster(m, dt) {
  const s = m.s;
  if (m.push) { pushMonster(m, dt); m.repath = 0; return; }   // skubbet af heltens hop
  if (m.frozen > 0) {   // frosset: står helt stille og slår ikke; immun et øjeblik, når det tør op
    m.frozen -= dt;
    if (m.frozen <= 0) m.freezeImmune = CONFIG.freezeImmuneSec;
    return;
  }
  if (m.freezeImmune > 0) m.freezeImmune -= dt;
  m.cooldown = Math.max(0, m.cooldown - dt);
  const h = state.hero;

  if (s.move === 'fly') {   // flagermus flyver lige mod borgen hen over alt
    const c = state.map.castle;
    // sigt mod et punkt et stykke inde i borgen; kanten selv (fx et hjørne) ligger uden for borgens felter
    const tx = Math.min(Math.max(m.x, c.x + 0.5), c.x + c.w - 0.5), ty = Math.min(Math.max(m.y, c.y + 0.5), c.y + c.h - 0.5);
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
        monsterAttack(m, foe);
      }
      m.repath = 0;
      return;
    }
  }

  // Borgspillet: monstre tæt på helten går efter ham først (ikke gennem mure)
  if (h.alive && dist(h, m) <= CONFIG.hero.threatRange && losClear(m, h, moverOf(m))) {
    if (dist(h, m) > CONFIG.hero.engageRange * 0.9) moveToward(m, h.x, h.y, s.speed * dt);
    else if (m.cooldown <= 0) { m.cooldown = s.interval; monsterAttack(m, h); }
    m.repath = 0;
    return;
  }
  // magikere tæt på bliver også angrebet
  const wz = state.wizards.find(w => w.alive && dist(w, m) <= CONFIG.hero.threatRange && losClear(m, w, moverOf(m)));
  if (wz) {
    if (dist(wz, m) > CONFIG.hero.engageRange * 0.9) moveToward(m, wz.x, wz.y, s.speed * dt);
    else if (m.cooldown <= 0) { m.cooldown = s.interval; monsterAttack(m, wz); }
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

// Et monster slår helten, en soldat eller en magiker. Med splash rammes alle inden for området.
function hitUnit(o, raw) {
  if (o === state.hero) heroTakeDamage(raw);
  else if (state.wizards.includes(o)) wizardTakeDamage(o, raw);
  else soldierTakeDamage(o, raw);
}
function monsterAttack(m, foe) {
  const s = m.s;
  hitUnit(foe, s.damage);
  if (!s.splash) return;
  const h = state.hero, others = [h, ...state.soldiers, ...state.wizards];
  for (const o of others) if (o !== foe && o.alive && dist(o, foe) <= s.splash) hitUnit(o, s.damage);
  state.effects.push({ x: foe.x, y: foe.y, t: 0, dur: 0.4, r: s.splash, color: '127,29,29' });
}

function stillThere(o) {
  return isWall(o) ? state.walls.get(o.key) === o : state.buildings.get(idx(o.x, o.y)) === o;
}

function smash(m, o) {
  if (m.cooldown > 0) return;
  m.cooldown = m.s.interval;
  o.hp -= m.s.damage;
  if (o.hp <= 0) removeBuilding(o);   // smadrede bygninger kommer ikke tilbage
}

// Felter, hvorfra et monster kan slå bygningen b: et frit nabofelt lige op ad en af dens
// fire sider uden mur, hegn eller port imellem (monstrene slår ikke gennem mure).
// p er stedet, monsteret stiller sig.
function attackSpots(b) {
  const out = [];
  for (const [dx, dy] of DIRS4) {
    const nx = b.x + dx, ny = b.y + dy;
    if (!inBounds(nx, ny) || isCastle(nx, ny) || isSolid(nx, ny) || wallBetween(b.x, b.y, nx, ny)) continue;
    out.push({ cx: nx, cy: ny, p: { x: b.x + 0.5 + dx * 0.8, y: b.y + 0.5 + dy * 0.8 } });
  }
  return out;
}

// Et tårn eller en gård (goal), som monsteret i feltet (cx, cy) kan slå.
function targetNextTo(cx, cy, goal) {
  for (const [dx, dy] of DIRS4) {
    const b = buildingAt(cx - dx, cy - dy);
    if (!b || !(goal === 'tower' ? dataOf(b).tower : dataOf(b).income)) continue;
    const spot = attackSpots(b).find(s => s.cx === cx && s.cy === cy);
    if (spot) return { b, p: spot.p };
  }
  return null;
}

// ---------- input ----------
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);

// Kamera: tile er feltets størrelse i skærmpixels (baseTile * zoom); camX/camY er,
// hvor langt banen er rullet. Lærredet fylder hele skærmen.
const MAX_ZOOM = 3;
const MIN_ZOOM = 0.8;         // lidt under 1, så hele banen kan ses fri af knapperne
const OVERSCROLL = 90;        // så mange pixels må banen rulles forbi kanten, så kanterne kan ses under knapperne
const TAP_SLOP = 10;          // så mange pixels må fingeren flytte sig, før det er en panorering
let baseTile = 20, zoom = 1, tile = 20, camX = 0, camY = 0, viewW = 0, viewH = 0;

function clampAxis(cam, board, view) {
  const lo = Math.min(-OVERSCROLL, -(view - board) / 2), hi = Math.max(board - view + OVERSCROLL, -(view - board) / 2);
  return Math.min(Math.max(cam, lo), hi);
}
function clampCamera() {
  camX = clampAxis(camX, COLS * tile, viewW);
  camY = clampAxis(camY, ROWS * tile, viewH);
}

// Zoomer, så punktet (sx, sy) på skærmen bliver stående samme sted.
function zoomAt(newZoom, sx, sy) {
  newZoom = Math.min(Math.max(newZoom, MIN_ZOOM), MAX_ZOOM);
  const wx = (sx + camX) / tile, wy = (sy + camY) / tile;
  zoom = newZoom;
  tile = baseTile * zoom;
  camX = wx * tile - sx;
  camY = wy * tile - sy;
  clampCamera();
}

// Holdes skærmen på højkant, drejes hele spillet 90° (se resize), så det altid vises i landskab.
let rotated = false;
function canvasPoint(ev) {
  if (rotated) return { x: ev.clientY, y: window.innerWidth - ev.clientX };
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
    if (state.aiming) { castAt(state.aiming, p); return; }
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
$('bWeapon').onclick = () => { state.weapon = state.weapon === 'bow' ? 'sword' : 'bow'; };
$('bJump').onclick = () => heroJump();
for (const id of Object.keys(ABILITY_NAMES)) $('b_' + id).onclick = () => useAbility(id);
$('bStart').onclick = () => { startWave(); buildToolbar(); };
$('bRestart').onclick = () => (state.level ? playLevel(state.level) : startMap(state.map, 0));

// Bundmenuen: bygninger, når byggemenuen er åben, eller panelet for den valgte bygning.
// Bundmenuen glider op og ned med samme bevægelse som menuerne (se #tools i index.html).
let barEnterTimer = 0;
function showBar(content) {
  const bar = $('tools'), entering = !bar.classList.contains('shown');
  bar.replaceChildren(content);
  bar.classList.add('shown');
  bar.inert = false;
  if (entering) {   // knapperne dukker op én for én, kun når menuen kommer frem
    bar.classList.add('enter');
    clearTimeout(barEnterTimer);
    barEnterTimer = setTimeout(() => bar.classList.remove('enter'), 700);
  }
}
function hideBar() {   // indholdet bliver stående, mens menuen glider væk
  const bar = $('tools');
  bar.classList.remove('shown', 'enter');
  bar.inert = true;
}

function buildToolbar() {
  const bar = document.createDocumentFragment();
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
    showBar(bar);
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
    if (up !== null && levelLocked(d.upgradesTo)) add(`${BUILDINGS[d.upgradesTo].name} <small>kræver stjerner</small>`, false, () => {}, true);
    else if (up !== null) add(`Opgradér til ${BUILDINGS[d.upgradesTo].name} <small>${up} g</small>`, false, () => upgrade(b), up > state.gold);
    if (hasHp(b) && b.hp < maxHp(b)) add(`Reparér <small>${repairCost(b)} g</small>`, false, () => repair(b), repairCost(b) > state.gold);
    if (d.soldiers) add('Flyt soldater', false, () => { state.rallyFor = b; say('Tryk hvor soldaterne skal stå.'); });
    if (d.tower && d.tower.magic && !b.wizard) {
      add(`Køb magiker <small>${CONFIG.wizard.cost} g</small>`, false, () => buyWizard(b), CONFIG.wizard.cost > state.gold);
    }
    add(`Sælg <small>+${sellValue(b)} g</small>`, false, () => sell(b));
    add('Luk', false, () => { state.selected = null; });
    showBar(bar);
    return;
  }
  state.selected = null;
  if (!(state.buildOpen && state.phase === 'build')) { hideBar(); return; }
  for (const id of TOOLBAR) {
    const d = BUILDINGS[id], locked = LOCKED[id] && !owns(LOCKED[id]);
    if (locked) { add(`${d.name} <small>låst (stjerner)</small>`, false, () => {}, true); continue; }
    add(`${d.name} <small>${d.cost} g</small>`, state.tool === id, () => { state.tool = id; });
  }
  showBar(bar);
}

// ---------- tegning ----------
function resize() {
  const app = $('app'), w = window.innerWidth, h = window.innerHeight;
  rotated = h > w;
  document.documentElement.classList.toggle('portrait', rotated);
  app.style.width = rotated ? h + 'px' : '';
  app.style.height = rotated ? w + 'px' : '';
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

// ---------- slagskygger ----------
// Lyset kommer fra øverst til venstre, så skyggen falder ned mod højre, længere jo højere
// tingen er (i felter). Alle skygger tegnes helt sorte på et eget lag og lægges på med én
// gennemsigtighed, så de har skarpe kanter og ikke bliver mørkere, hvor de overlapper.
const SHADOW_ALPHA = 0.22, SHADOW_SLOPE = 0.6;
const SHADOW_HEIGHT = { fence: 0.15, stone_wall: 0.3, tall_wall: 0.5, gate: 0.3, iron_gate: 0.35, net: 0,
                        building: 0.35, tower: 0.55, castle: 0.7, unit: 0.15, hero: 0.2, flyer: 0.8 };
const shadowCanvas = document.createElement('canvas');
const sctx = shadowCanvas.getContext('2d');

// Skygge af en kasse (x0,y0)-(x1,y1) i felter, der er h høj: kassen trukket ned mod højre.
function boxShadow(x0, y0, x1, y1, h) {
  const d = h * SHADOW_SLOPE * tile;
  x0 *= tile; y0 *= tile; x1 *= tile; y1 *= tile;
  sctx.beginPath();
  sctx.moveTo(x0, y0); sctx.lineTo(x1, y0); sctx.lineTo(x1 + d, y0 + d);
  sctx.lineTo(x1 + d, y1 + d); sctx.lineTo(x0 + d, y1 + d); sctx.lineTo(x0, y1);
  sctx.closePath(); sctx.fill();
}
// Skygge af noget rundt, der svæver/står h over jorden: en ellipse flyttet ned mod højre.
function blobShadow(x, y, r, h) {
  const d = h * SHADOW_SLOPE;
  sctx.beginPath(); sctx.ellipse((x + d) * tile, (y + d) * tile, r * tile, r * 0.7 * tile, 0, 0, Math.PI * 2); sctx.fill();
}

function drawShadows(dpr) {
  if (shadowCanvas.width !== canvas.width || shadowCanvas.height !== canvas.height) {
    shadowCanvas.width = canvas.width; shadowCanvas.height = canvas.height;
  }
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, shadowCanvas.width, shadowCanvas.height);
  sctx.setTransform(dpr, 0, 0, dpr, -camX * dpr, -camY * dpr);
  sctx.fillStyle = '#000';
  for (const b of state.buildings.values()) {
    const d = dataOf(b);
    if (!d.blocks) continue;
    const pad = 2 / tile;
    boxShadow(b.x + pad, b.y + pad, b.x + 1 - pad, b.y + 1 - pad, d.tower ? SHADOW_HEIGHT.tower : SHADOW_HEIGHT.building);
  }
  for (const w of state.walls.values()) {
    const d = dataOf(w), [x1, y1, x2, y2] = edgeLine(w.key), hw = d.width / 2;
    boxShadow(Math.min(x1, x2) - hw, Math.min(y1, y2) - hw, Math.max(x1, x2) + hw, Math.max(y1, y2) + hw, SHADOW_HEIGHT[w.id] ?? 0.3);
  }
  const c = state.map.castle;
  boxShadow(c.x, c.y, c.x + c.w, c.y + c.h, SHADOW_HEIGHT.castle);
  for (const m of state.monsters) {
    const fly = m.s.move === 'fly';
    blobShadow(m.x, m.y + (fly ? 0 : m.s.r * 0.5), m.s.r * (fly ? 0.8 : 0.9), fly ? SHADOW_HEIGHT.flyer : SHADOW_HEIGHT.unit);
  }
  for (const s of state.soldiers) if (s.alive) blobShadow(s.x, s.y + 0.1, 0.22, SHADOW_HEIGHT.unit);
  for (const w of state.wizards) if (w.alive) blobShadow(w.x, w.y + 0.12, 0.25, SHADOW_HEIGHT.unit);
  const h = state.hero;
  if (h.alive) blobShadow(h.x, h.y + 0.2, 0.38, SHADOW_HEIGHT.hero);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = SHADOW_ALPHA;
  ctx.drawImage(shadowCanvas, 0, 0);
  ctx.restore();
}

// ---------- dag til nat ----------
// Lyset skifter gradvist fra dag (første runde) til nat (sidste runde). Om natten lyser
// monstre, skud og tårne op.
const NIGHT_MAX = 0.62;   // hvor mørk den sidste runde er (0 = dag, 1 = helt sort)
const nightLevel = () => {
  const n = state.map.waves.count;
  return n > 1 ? NIGHT_MAX * (state.wave - 1) / (n - 1) : 0;
};

function glow(x, y, r, color, a) {
  const g = ctx.createRadialGradient(x * tile, y * tile, 0, x * tile, y * tile, r * tile);
  g.addColorStop(0, color.replace('A', a)); g.addColorStop(1, color.replace('A', 0));
  ctx.fillStyle = g;
  ctx.fillRect((x - r) * tile, (y - r) * tile, 2 * r * tile, 2 * r * tile);
}

function drawNight() {
  const night = nightLevel();
  if (night <= 0.01) return;
  ctx.fillStyle = `rgba(12,20,48,${night})`;
  ctx.fillRect(-tile * 3, -tile * 3, (COLS + 6) * tile, (ROWS + 6) * tile);
  const a = Math.min(1, night * 1.4);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of state.buildings.values()) {   // tårne: varmt lys
    if (dataOf(b).tower) glow(b.x + 0.5, b.y + 0.5, 1.3, 'rgba(255,190,90,A)', 0.5 * a);
  }
  const c = state.map.castle;   // borgen: lys i vinduerne
  glow(c.x + c.w / 2, c.y + c.h / 2, Math.max(c.w, c.h) * 0.7, 'rgba(255,200,120,A)', 0.35 * a);
  for (const m of state.monsters) {   // monstre: lyser i deres egen farve
    const hex = m.s.color, r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), bl = parseInt(hex.slice(5, 7), 16);
    glow(m.x, m.y, m.s.r * 2.2, `rgba(${r},${g},${bl},A)`, 0.7 * a);
  }
  for (const sh of state.shots) {   // skud: lysende streger
    ctx.strokeStyle = `rgba(255,240,180,${0.8 * a})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(sh.x1 * tile, sh.y1 * tile); ctx.lineTo(sh.x2 * tile, sh.y2 * tile); ctx.stroke();
  }
  const h = state.hero;
  if (h.alive) glow(h.x, h.y, 1.0, 'rgba(160,255,170,A)', 0.4 * a);
  ctx.restore();
}

// ---------- landskab ----------
// Banen tegnes som et landskab set oppefra, ud fra felterne: græs med pletter, søer med sandbred,
// sten og indgangsfelter. Vand-masken bløddes op, så bredden bliver rund, men følger felternes kant
// (grænsen ligger hvor masken er 0,5). Tegnes én gang pr. bane og skaleres så.
let landscapeOn = true;   // false: den gamle, flade bane (tast L skifter)
const LAND_PX = 24;   // pixels pr. felt i landskabsbilledet
const hash2 = (x, y, k = 0) => { let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function valueNoise(x, y, k) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, k), b = hash2(ix + 1, iy, k), c = hash2(ix, iy + 1, k), d = hash2(ix + 1, iy + 1, k);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
// Blødgør en maske med to gange vandret og lodret kasse-sløring (næsten som en gauss).
function blurMask(m, w, h, r) {
  const tmp = new Float32Array(w * h);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += m[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = acc / (2 * r + 1);
        acc += m[y * w + Math.min(w - 1, x + r + 1)] - m[y * w + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        m[y * w + x] = acc / (2 * r + 1);
        acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
  }
}
function buildLandscape(map) {
  const P = LAND_PX, W = map.cols * P, H = map.rows * P;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const t = (x, y) => map.terrain[Math.min(map.rows - 1, Math.max(0, y)) * map.cols + Math.min(map.cols - 1, Math.max(0, x))];
  const water = new Float32Array(W * H), dirt = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const tt = t(Math.floor(x / P), Math.floor(y / P));
    water[y * W + x] = tt === T_WATER ? 1 : 0;
    dirt[y * W + x] = tt === T_SPAWN ? 1 : tt === T_ROCK ? 0.45 : 0;
  }
  blurMask(water, W, H, Math.round(P * 0.36));
  blurMask(dirt, W, H, Math.round(P * 0.3));
  const img = g.createImageData(W, H), px = img.data;
  const mix = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  const GRASS1 = [122, 150, 92], GRASS2 = [98, 128, 72], SAND = [214, 200, 156], SHALLOW = [118, 168, 186], DEEP = [62, 112, 140], DIRT = [160, 138, 102];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, cx = x / P, cy = y / P;
    const n = valueNoise(cx / 3, cy / 3, 1) * 0.6 + valueNoise(cx, cy, 2) * 0.3 + hash2(x, y, 3) * 0.1;
    let c = mix(GRASS1, GRASS2, Math.min(1, Math.max(0, (n - 0.3) * 1.6)));
    const d = dirt[i];
    if (d > 0.15) c = mix(c, DIRT, Math.min(1, (d - 0.15) * 1.6) * (0.75 + 0.25 * n));
    const w = water[i] + (valueNoise(cx * 2, cy * 2, 4) - 0.5) * 0.08;   // lidt ujævn bred
    if (w > 0.5) c = mix(SHALLOW, DEEP, Math.min(1, (w - 0.5) * 2.5) * (0.85 + 0.15 * n));
    else if (w > 0.34) c = mix(c, SAND, Math.min(1, (w - 0.34) / 0.07));
    px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let cy = 0; cy < map.rows; cy++) for (let cx = 0; cx < map.cols; cx++) {
    const tt = t(cx, cy), ox = cx * P, oy = cy * P;
    if (tt === T_GRASS) {   // græstotter og en sjælden blomst
      g.strokeStyle = 'rgba(52,78,38,0.35)'; g.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        const gx = ox + hash2(cx, cy, 10 + k) * P, gy = oy + hash2(cx, cy, 20 + k) * P;
        g.beginPath(); g.moveTo(gx - 2, gy); g.lineTo(gx - 1, gy - 3); g.moveTo(gx, gy); g.lineTo(gx, gy - 4); g.moveTo(gx + 2, gy); g.lineTo(gx + 1, gy - 3); g.stroke();
      }
      if (hash2(cx, cy, 30) < 0.06) {
        g.fillStyle = hash2(cx, cy, 31) < 0.5 ? '#f1e7b0' : '#e8b4b4';
        g.beginPath(); g.arc(ox + hash2(cx, cy, 32) * P, oy + hash2(cx, cy, 33) * P, 1.6, 0, Math.PI * 2); g.fill();
      }
    } else if (tt === T_WATER && hash2(cx, cy, 40) < 0.25) {   // små lyse krusninger
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
      const wx = ox + P * (0.25 + hash2(cx, cy, 41) * 0.4), wy = oy + P * (0.3 + hash2(cx, cy, 42) * 0.4);
      g.beginPath(); g.moveTo(wx, wy); g.quadraticCurveTo(wx + 3, wy - 2, wx + 6, wy); g.stroke();
    } else if (tt === T_ROCK) {   // 2-3 sten med skygge og lys kant
      const n = 2 + Math.floor(hash2(cx, cy, 50) * 2);
      for (let k = 0; k < n; k++) {
        const r = P * (k === 0 ? 0.3 : 0.16 + hash2(cx, cy, 51 + k) * 0.08);
        const sx = ox + P * (k === 0 ? 0.48 : 0.2 + hash2(cx, cy, 55 + k) * 0.6), sy = oy + P * (k === 0 ? 0.5 : 0.2 + hash2(cx, cy, 58 + k) * 0.6);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.beginPath(); g.ellipse(sx + r * 0.3, sy + r * 0.35, r, r * 0.8, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#8b867c';
        g.beginPath(); g.ellipse(sx, sy, r, r * 0.82, hash2(cx, cy, 60 + k), 0, Math.PI * 2); g.fill();
        g.fillStyle = '#b2ada2';
        g.beginPath(); g.ellipse(sx - r * 0.25, sy - r * 0.25, r * 0.5, r * 0.35, -0.5, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(40,38,34,0.6)'; g.lineWidth = 1;
        g.beginPath(); g.ellipse(sx, sy, r, r * 0.82, hash2(cx, cy, 60 + k), 0, Math.PI * 2); g.stroke();
      }
    }
  }
  return cv;
}

function draw() {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.setTransform(dpr, 0, 0, dpr, -camX * dpr, -camY * dpr);

  // bane: landskabet (græs, søer, sten), og indgangsfelterne svagt røde ovenpå
  if (landscapeOn) {
    if (!state.map.land) state.map.land = buildLandscape(state.map);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(state.map.land, 0, 0, COLS * tile, ROWS * tile);
    ctx.fillStyle = 'rgba(220,38,38,0.16)';
    for (const p of state.map.spawns) ctx.fillRect(p.x * tile, p.y * tile, tile + 0.5, tile + 0.5);
  } else drawFlatTerrain();

  // gitter: svagt og hvidt på landskabet
  ctx.strokeStyle = landscapeOn ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= COLS; x++) { ctx.moveTo(x * tile + 0.5, 0); ctx.lineTo(x * tile + 0.5, ROWS * tile); }
  for (let y = 0; y <= ROWS; y++) { ctx.moveTo(0, y * tile + 0.5); ctx.lineTo(COLS * tile, y * tile + 0.5); }
  ctx.stroke();
  drawRest(dpr);
}

// Den gamle, flade bane (papirfarve med firkantet vand og sten).
function drawFlatTerrain() {
  ctx.fillStyle = '#e7e2d4';
  ctx.fillRect(0, 0, COLS * tile, ROWS * tile);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const t = terrainAt(x, y);
    if (t === T_GRASS) continue;
    ctx.fillStyle = t === T_SPAWN ? 'rgba(239,68,68,0.14)' : t === T_WATER ? '#a9c9d6' : '#a39d92';
    ctx.fillRect(x * tile, y * tile, tile + 0.5, tile + 0.5);
    if (t === T_WATER) {   // små bølger
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1, tile * 0.05);
      ctx.beginPath();
      for (const fy of [0.35, 0.7]) {
        ctx.moveTo((x + 0.2) * tile, (y + fy) * tile);
        ctx.quadraticCurveTo((x + 0.35) * tile, (y + fy - 0.1) * tile, (x + 0.5) * tile, (y + fy) * tile);
        ctx.quadraticCurveTo((x + 0.65) * tile, (y + fy + 0.1) * tile, (x + 0.8) * tile, (y + fy) * tile);
      }
      ctx.stroke();
    } else if (t === T_ROCK) {   // en sten med sin egen lille slagskygge
      ctx.fillStyle = `rgba(0,0,0,${SHADOW_ALPHA})`;
      ctx.beginPath(); ctx.ellipse((x + 0.62) * tile, (y + 0.67) * tile, tile * 0.32, tile * 0.24, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7d776c';
      ctx.beginPath(); ctx.ellipse((x + 0.5) * tile, (y + 0.55) * tile, tile * 0.32, tile * 0.24, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

}

function drawRest(dpr) {
  // tyk kant rundt om banen, som en mur (uden for felterne)
  const bw = Math.max(5, tile * 0.3);
  ctx.strokeStyle = '#6b6457'; ctx.lineWidth = bw; ctx.lineJoin = 'miter';
  ctx.strokeRect(-bw / 2, -bw / 2, COLS * tile + bw, ROWS * tile + bw);

  // monstrenes vej
  if (state.phase === 'build') {
    ctx.fillStyle = 'rgba(220,38,38,0.5)';
    for (const p of state.route) {
      ctx.beginPath(); ctx.arc(p.x * tile, p.y * tile, tile * 0.08, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawShadows(dpr);

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
  const c = state.map.castle;
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
    } else circle(m.x, m.y, m.s.r, m.s.color, m.s.boss || m.s.mini || m.s.armor >= 6 ? '#000' : null);
    if (m.s.boss || m.s.mini) text(m.s.boss ? 'B' : 'b', m.x * tile, m.y * tile, tile * (m.s.boss ? 0.6 : 0.45), '#fecaca');
    if (m.s.heal) text('+', m.x * tile, m.y * tile, tile * 0.4, '#fff');
    if (m.frozen > 0) circle(m.x, m.y, m.s.r + 0.08, 'rgba(165,243,252,0.55)', '#0891b2');   // frosset: is omkring
    if (m.hp < m.maxHp) hpBar(m.x, m.y, m.hp / m.maxHp, m.s.boss ? 0.85 : 0.55);
  }

  // magikere: lilla trekanter
  for (const w of state.wizards) {
    if (!w.alive) continue;
    const r = tile * 0.3;
    ctx.fillStyle = '#9333ea'; ctx.strokeStyle = '#1e1b4b'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(w.x * tile, w.y * tile - r); ctx.lineTo(w.x * tile + r * 0.9, w.y * tile + r * 0.7);
    ctx.lineTo(w.x * tile - r * 0.9, w.y * tile + r * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (w.hp < CONFIG.wizard.hp) hpBar(w.x, w.y, w.hp / CONFIG.wizard.hp);
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

  // brand på jorden: orange pletter, der flakker
  for (const f of state.fires) {
    ctx.fillStyle = `rgba(249,115,22,${0.25 + 0.1 * Math.sin(f.t * 12)})`;
    ctx.beginPath(); ctx.arc(f.x * tile, f.y * tile, f.r * tile, 0, Math.PI * 2); ctx.fill();
  }

  // chokbølger fra hoppet: en ring, der vokser og falmer
  for (const e of state.effects) {
    const f = e.t / e.dur;
    if (e.text) {   // tekst, der stiger op og falmer (fx nyt niveau)
      ctx.globalAlpha = 1 - f;
      text(e.text, e.x * tile, (e.y - 0.8 - f * 1.2) * tile, tile * 0.55, '#15803d');
      ctx.globalAlpha = 1;
      continue;
    }
    const rgb = e.color || '22,101,52';
    if (e.bolt) {   // lynnedslag: en takket streg ned fra himlen
      ctx.strokeStyle = `rgba(${rgb},${1 - f})`; ctx.lineWidth = Math.max(2, tile * 0.12);
      ctx.beginPath(); ctx.moveTo(e.x * tile, (e.y - 5) * tile);
      for (let k = 1; k <= 5; k++) ctx.lineTo((e.x + (k < 5 ? (k % 2 ? 0.35 : -0.35) : 0)) * tile, (e.y - 5 + k) * tile);
      ctx.stroke();
    }
    ctx.strokeStyle = `rgba(${rgb},${1 - f})`; ctx.lineWidth = Math.max(2, tile * 0.18 * (1 - f));
    ctx.beginPath(); ctx.arc(e.x * tile, e.y * tile, e.r * tile * (0.3 + 0.7 * f), 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = e.color ? `rgba(${rgb},${0.2 * (1 - f)})` : `rgba(134,239,172,${0.25 * (1 - f)})`; ctx.fill();
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
    // i luften: helten løfter sig og bliver større, skyggen bliver på jorden
    const air = h.jump !== undefined ? Math.sin(Math.PI * h.jump / CONFIG.jump.airSec) : 0;
    const lift = air * 0.7, size = 0.4 * (1 + 0.45 * air);
    if (state.warcry > 0) circle(h.x, h.y - lift, size + 0.15, 'rgba(220,38,38,0.3)');   // kampråb: rød glød
    if (state.whirl > 0) {   // hvirvelvind: buer, der snurrer rundt om helten
      const r = CONFIG.abilities.whirl.radius * tile, a0 = performance.now() / 80;
      ctx.strokeStyle = 'rgba(22,101,52,0.6)'; ctx.lineWidth = Math.max(2, tile * 0.1);
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(h.x * tile, h.y * tile, r * (0.6 + 0.2 * k), a0 + k * 2.1, a0 + k * 2.1 + 1.2); ctx.stroke(); }
    }
    circle(h.x, h.y - lift, size, '#16a34a', '#052e16');
    hpBar(h.x, h.y - lift, h.hp / heroMax(), 0.65 + lift * 0.3);
  } else {
    const s = state.map.heroSpawn;
    circle(s.x, s.y, 0.4, null, '#dc2626');
    text(`${Math.ceil(h.respawn)}`, s.x * tile, s.y * tile, tile * 0.45, '#dc2626');
  }

  drawNight();
  drawHud();
}

// Hvilke monstre der kommer i næste bølge, vist i byggefasen (antal pr. slags).
let nextWaveKey = '';
function drawNextWave() {
  const el = $('nextWave'), show = state.phase === 'build';
  el.hidden = !show;
  if (!show) return;
  const key = `${state.level}/${state.map.name}/${state.wave}`;
  if (key === nextWaveKey) return;
  nextWaveKey = key;
  const counts = {}, next = waveMonsters(state.wave);
  for (const k of next) counts[k] = (counts[k] || 0) + 1;
  el.innerHTML = 'Næste bølge: ' + Object.keys(MONSTERS).filter(k => counts[k]).map(k => [k, counts[k]]).map(([k, n]) => {
    const s = MONSTERS[k], shape = s.move === 'fly' ? '◆' : s.boss ? '⬤' : '●';
    return `<span class="mon" title="${s.name}"><b style="color:${s.color}">${shape}</b> ${n} ${s.name} <small>(${waveHp(s, next.hpScale)} liv)</small></span>`;
  }).join('');
}

function drawHud() {
  const h = state.hero;
  drawNextWave();
  $('sWave').textContent = `Runde ${state.wave}/${state.map.waves.count}`;
  $('sCastle').textContent = `Borg: ${state.lives}`;
  $('sGold').textContent = `Guld: ${state.gold}`;
  const lv = `niv. ${state.heroLevel}` + (state.heroLevel < CONFIG.heroXp.maxLevel ? ` (${state.heroXp}/${xpToNext()} XP)` : '');
  $('sHero').textContent = h.alive ? `Helt ${lv}: ${Math.max(0, Math.ceil(h.hp))}/${heroMax()}` : `Helt ${lv}: tilbage om ${Math.ceil(h.respawn)} s`;
  const building = state.phase === 'build';
  $('bStart').disabled = !building;
  $('bBuild').disabled = !building;
  $('bBuild').classList.toggle('active', building && state.buildOpen);
  $('bBuild').textContent = building && state.buildOpen ? 'Luk byg' : 'Byg';
  $('bSpeed').textContent = `Tempo x${state.speed}`;
  $('bWeapon').hidden = !owns('bow');
  $('bJump').hidden = state.phase !== 'wave';
  $('bJump').disabled = state.jumpCooldown > 0 || !h.alive;
  $('bJump').textContent = state.jumpCooldown > 0 ? `Hop (${Math.ceil(state.jumpCooldown)})` : 'Hop!';
  $('bWeapon').textContent = state.weapon === 'bow' ? 'Bue' : 'Sværd';
  $('msg').style.top = `${$('hud').offsetHeight + 6}px`;   // beskeden under toppen, også når den fylder to linjer
  for (const id of Object.keys(ABILITY_NAMES)) {
    const btn = $('b_' + id), cd = state.abilityCd[id] || 0;
    btn.hidden = state.phase !== 'wave' || !owns(id);
    btn.disabled = cd > 0 || (id === 'whirl' && !h.alive);
    btn.classList.toggle('active', state.aiming === id);
    btn.textContent = cd > 0 ? `${ABILITY_NAMES[id]} (${Math.ceil(cd)})` : ABILITY_NAMES[id];
  }
  if (!owns('bow')) state.weapon = 'sword';
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
    ? `${state.map.name} klaret! ${'★'.repeat(starsFor(state.lives))}${'☆'.repeat(3 - starsFor(state.lives))} (borgen har ${state.lives} liv tilbage)`
    : `Borgen faldt i runde ${state.wave}`;
}

// ---------- menuer: start, baneoversigt og spil ----------
// De tre skærme ligger under hinanden; der rulles mellem dem med parallakse (baggrunden flytter sig langsommere).
const LEVEL_COUNT = 12;      // vises i oversigten; banerne står i levels.js
const PLAYABLE_LEVELS = LEVELS.length;
// Ting, der købes for stjerner i baneoversigten og gælder på alle baner. max: hvor mange gange
// den kan købes; needs: skal være købt først. Tårnniveau 3-5 åbner for opgraderinger i banen.
const SHOP = [
  { group: 'Tårne' },
  { id: 'unlock_frost', name: 'Frysetårn', price: 2, text: 'Lås op' },
  { id: 'unlock_mage', name: 'Magertårn', price: 3, text: 'Lås op' },
  { id: 'unlock_camp', name: 'Bueskyttelejr', price: 2, text: 'Lås op' },
  { id: 'unlock_smithy', name: 'Smedje', price: 2, text: 'Lås op' },
  { group: 'Tårnniveauer (op til 5)' },
  ...['archer', 'cannon', 'mage', 'frost', 'barracks'].flatMap(t => [3, 4, 5].map(lv => ({
    id: `${t}_lv${lv}`, name: `${TOWER_LINES[t].name} niveau ${lv}`, price: lv - 2, needs: lv > 3 ? `${t}_lv${lv - 1}` : null,
    text: lv === 5 ? TOWER_LINES[t].lv5text : '+40 % skade',
  }))),
  { group: 'Helten' },
  { id: 'hero_tough', name: 'Hårdfør', price: 2, text: '+50 % liv' },
  { id: 'hero_sword', name: 'Skarpt sværd', price: 2, text: '+50 % skade' },
  { id: 'hero_legs', name: 'Hurtige ben', price: 1, text: '+30 % fart' },
  { id: 'hero_revive', name: 'Hurtig genopstandelse', price: 1, text: 'Tilbage efter 5 sek.' },
  { id: 'hero_startxp', name: 'Erfaren', price: 2, text: 'Starter på niveau 5' },
  { group: 'Evner' },
  { id: 'bow', name: 'Bue', price: 2, text: 'Skyd på afstand' },
  { id: 'warcry', name: 'Kampråb', price: 2, text: '+50 % skade i 6 sek.' },
  { id: 'whirl', name: 'Hvirvelvind', price: 3, text: 'Rammer alle tæt på i 3 sek.' },
  { id: 'lightning', name: 'Lynnedslag', price: 3, text: 'Tryk et sted på banen' },
  { id: 'firewall', name: 'Ildmur', price: 3, text: 'Brænder i 5 sek.' },
  { group: 'Andet' },
  { id: 'gold50', name: '+50 startguld', price: 1, max: 3 },
  { id: 'castle5', name: 'Borgen +5 liv', price: 1, max: 2 },
];
let stage = 0;               // 0 = start, 1 = baneoversigt, 2 = spillet

function starsFor(lives) {
  const [three, two] = CONFIG.starLives;
  return lives >= three ? 3 : lives >= two ? 2 : 1;
}

// Fremskridt gemmes i browseren; mangler det eller er det ødelagt, startes forfra.
function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem('borgmuren.progress') || '{}');
    const stars = {};
    for (const [k, v] of Object.entries(p.stars || {})) {
      const n = Number(k), st = Number(v);
      if (Number.isInteger(n) && n >= 1 && n <= LEVEL_COUNT && st >= 0 && st <= 3) stars[n] = Math.floor(st);
    }
    const owned = {};   // id -> antal køb (gamle gem havde true)
    for (const it of SHOP) {
      const v = it.id && p.owned ? p.owned[it.id] : 0;
      const n = v === true ? 1 : Math.floor(Number(v) || 0);
      if (n > 0) owned[it.id] = Math.min(n, it.max || 1);
    }
    return { stars, owned };
  } catch (e) { return { stars: {}, owned: {} }; }
}
const progress = loadProgress();
function saveProgress() {
  try { localStorage.setItem('borgmuren.progress', JSON.stringify(progress)); } catch (e) { /* ikke vigtigt */ }
}
// Den bane, man er i gang med, gemmes i byggefasen, så man kan fortsætte, også hvis appen lukkes.
// Kun bygninger, guld, liv og helten gemmes; en bølge, der var i gang, starter forfra.
const SAVE_KEY = 'borgmuren.save';
function saveGame() {
  if (!state.level || (state.phase !== 'build' && state.phase !== 'wave')) return;
  const bs = [...state.buildings.values()].map(b => ({ id: b.id, x: b.x, y: b.y, hp: b.hp, spent: b.spent, rally: b.rally, wizard: !!b.wizard }));
  const ws = [...state.walls.values()].map(w => ({ id: w.id, key: w.key, hp: w.hp, spent: w.spent, heroDoor: !!w.heroDoor }));
  const data = { v: 1, level: state.level, wave: state.wave, gold: state.gold, lives: state.lives, heroLv: state.heroLv,
                 heroLevel: state.heroLevel, heroXp: state.heroXp, weapon: state.weapon, buildings: bs, walls: ws };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* ikke vigtigt */ }
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ikke vigtigt */ } }
function readSave() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    return d && d.v === 1 && Number.isInteger(d.level) && d.level >= 1 && d.level <= PLAYABLE_LEVELS ? d : null;
  } catch (e) { return null; }
}

// Starter banen og lægger det gemte ind. Ugyldige dele springes over; giver det ingen vej, startes forfra.
function loadGame(d) {
  playLevel(d.level);
  const num = (v, lo, hi, def) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  state.wave = Math.floor(num(d.wave, 1, state.map.waves.count, 1));
  state.gold = Math.floor(num(d.gold, 0, 1e6, state.gold));
  state.lives = Math.floor(num(d.lives, 1, 1000, state.lives));
  for (const k of Object.keys(state.heroLv)) state.heroLv[k] = Math.floor(num(d.heroLv && d.heroLv[k], 0, HERO_MAX_LEVEL, 0));
  state.heroLevel = Math.floor(num(d.heroLevel, 1, CONFIG.heroXp.maxLevel, state.heroLevel));
  state.heroXp = num(d.heroXp, 0, 1e6, 0);
  state.weapon = d.weapon === 'bow' && owns('bow') ? 'bow' : 'sword';
  for (const o of Array.isArray(d.walls) ? d.walls : []) {
    const def = o && BUILDINGS[o.id];
    if (!def || !def.edge || typeof o.key !== 'string' || !/^[hv]\d+,\d+$/.test(o.key) || state.walls.has(o.key)) continue;
    const w = { id: o.id, key: o.key, spent: num(o.spent, 0, 1e6, def.cost), fresh: false };
    if (o.heroDoor) w.heroDoor = true;
    if (def.gate) w.hp = num(o.hp, 1, maxHp(w), maxHp(w));   // porte har liv; hegn og mure kun, hvis bossen har ramt dem
    else if (Number.isFinite(o.hp) && !o.heroDoor) w.hp = num(o.hp, 1, maxHp(w), maxHp(w));
    state.walls.set(o.key, w);
  }
  for (const o of Array.isArray(d.buildings) ? d.buildings : []) {
    const def = o && BUILDINGS[o.id];
    if (!def || def.edge || !Number.isInteger(o.x) || !Number.isInteger(o.y)) continue;
    const { x, y } = o;
    if (!inBounds(x, y) || isCastle(x, y) || isSpawn(x, y) || isObstacle(x, y) || buildingAt(x, y)) continue;
    if ((LOCKED[o.id] && !owns(LOCKED[o.id])) || levelLocked(o.id)) continue;
    const b = { id: o.id, x, y, hp: num(o.hp, 1, maxHp({ id: o.id }), maxHp({ id: o.id })), spent: num(o.spent, 0, 1e6, def.cost), fresh: false, cooldown: 0 };
    state.buildings.set(idx(x, y), b);
    if (def.soldiers) {
      const r = o.rally;
      b.rally = r && Number.isFinite(r.x) && Number.isFinite(r.y) && walkableCell(Math.floor(r.x), Math.floor(r.y)) ? { x: r.x, y: r.y } : defaultRally(b);
      makeSoldiers(b);
    }
    if (o.wizard && def.tower && def.tower.magic) { b.wizard = true; addWizard(b); }
  }
  recomputeField();
  if (placementProblem() || !hasOpening()) { playLevel(d.level); say('Det gemte spil kunne ikke bruges. Banen starter forfra.'); return; }
  state.hero = newHero();
  buildToolbar();
}

const totalStars = () => Object.values(progress.stars).reduce((a, b) => a + b, 0);
const ownCount = id => progress.owned[id] || 0;
const owns = id => ownCount(id) > 0;
const spentStars = () => SHOP.reduce((a, it) => a + (it.id ? it.price * ownCount(it.id) : 0), 0);
const freeStars = () => totalStars() - spentStars();

function buyShopItem(it) {
  if (!it.id) return;
  if (ownCount(it.id) >= (it.max || 1)) return menuSay('Den har du allerede.');
  if (it.needs && !owns(it.needs)) return menuSay('Køb det forrige niveau først.');
  if (freeStars() < it.price) return menuSay(`Du mangler ${it.price - freeStars()} ★.`);
  progress.owned[it.id] = ownCount(it.id) + 1;
  saveProgress();
  menuSay(`${it.name} er købt.`);
  renderLevels();
}
const unlockedLevel = () => { let n = 1; while (progress.stars[n]) n++; return n; };
const inProgress = n => state.level === n && (state.phase === 'build' || state.phase === 'wave') &&
  (state.wave > 1 || state.phase === 'wave' || state.buildings.size > 0 || state.walls.size > 0);

function showStage(k, instant) {
  stage = k;
  const els = ['menu', 'menuFg', 'menuBg', 'game'].map($);
  if (instant) for (const el of els) el.style.transition = 'none';
  $('menu').style.transform = k === 2 ? 'translateY(-100%)' : '';
  $('menuFg').style.transform = k >= 1 ? 'translateY(-50%)' : '';
  $('menuBg').style.transform = k === 0 ? '' : k === 1 ? 'translateY(-20%)' : 'translateY(5%)';
  $('game').style.transform = k === 2 ? '' : 'translateY(100%)';
  $('menu').style.pointerEvents = k === 2 ? 'none' : '';
  if (instant) { void $('menu').offsetHeight; for (const el of els) el.style.transition = ''; }
  if (k === 1) renderLevels();
}

let menuMsgTimer = 0;
function menuSay(t) {
  $('menuMsg').textContent = t; $('menuMsg').hidden = false;
  clearTimeout(menuMsgTimer); menuMsgTimer = setTimeout(() => { $('menuMsg').hidden = true; }, 2000);
}

function renderLevels() {
  const row = $('levels'), open = unlockedLevel();
  row.innerHTML = '';
  for (let n = 1; n <= LEVEL_COUNT; n++) {
    const el = document.createElement('div');
    el.className = 'lvl' + (n > open ? ' locked' : '') + (inProgress(n) ? ' playing' : '');
    el.dataset.level = n;
    const st = progress.stars[n] || 0;
    el.innerHTML = `<div class="num">${n}</div><div class="stars">` +
      [0, 1, 2].map(i => `<span class="${i < st ? 'on' : 'off'}">★</span>`).join('') + '</div>';
    row.appendChild(el);
  }
  $('starCount').textContent = `Du har ${freeStars()} ★`;
  const shop = $('shop');
  shop.innerHTML = '';
  for (const it of SHOP) {
    if (it.group) {
      const h = document.createElement('div');
      h.className = 'group'; h.textContent = it.group;
      shop.appendChild(h);
      continue;
    }
    const b = document.createElement('button');
    const n = ownCount(it.id), max = it.max || 1, full = n >= max;
    if (full) b.className = 'owned';
    else if (it.needs && !owns(it.needs)) b.className = 'waiting';
    const status = full ? 'Købt' : `${it.price} ★` + (max > 1 ? ` (${n}/${max})` : '');
    b.innerHTML = `${it.name}<small>${it.text ? it.text + ' · ' : ''}${status}</small>`;
    b.onclick = () => buyShopItem(it);
    shop.appendChild(b);
  }
}

function chooseLevel(n) {
  if (n > unlockedLevel()) return menuSay('Klar de tidligere baner først.');
  if (n > PLAYABLE_LEVELS) return menuSay(`Bane ${n} er ikke lavet endnu.`);
  const saved = readSave();
  if (inProgress(n) || (saved && saved.level === n)) {
    const live = inProgress(n);
    $('dlgText').textContent = `Bane ${n} er i gang (runde ${live ? state.wave : saved.wave}).`;
    $('levelDialog').hidden = false;
    $('bContinue').onclick = () => { $('levelDialog').hidden = true; if (live) showStage(2); else loadGame(saved); };
    $('bNew').onclick = () => { $('levelDialog').hidden = true; clearSave(); playLevel(n); };
    return;
  }
  playLevel(n);
}

function playLevel(n) {
  startMap(parseLevel(LEVELS[n - 1]), n);
}

// Spiller en bane, der ikke står i levels.js (fra baneeditoren). Giver en fejltekst, hvis den ikke kan bruges.
function playCustom(level) {
  const map = parseLevel(level);
  if (map.error) return map.error;
  startMap(map, 0);
  if (!hasOpening()) return 'Der er ingen vej fra monstrenes indgang (S) til borgen (C).';
  return null;
}

function startMap(map, n) {
  newGame(map);
  state.level = n;
  zoom = 1; camX = 0; camY = 0;
  resize();
  buildToolbar();
  showStage(2);
}

// Træk sidelæns i baneoversigten (egen håndtering, så det også virker, når spillet er drejet).
function appPoint(ev) {
  return rotated ? { x: ev.clientY, y: window.innerWidth - ev.clientX } : { x: ev.clientX, y: ev.clientY };
}
let levelDrag = null;
$('levels').addEventListener('pointerdown', ev => {
  $('levels').setPointerCapture(ev.pointerId);
  levelDrag = { x: appPoint(ev).x, scroll: $('levels').scrollLeft, moved: false };
});
$('levels').addEventListener('pointermove', ev => {
  if (!levelDrag) return;
  const dx = appPoint(ev).x - levelDrag.x;
  if (Math.abs(dx) > TAP_SLOP) levelDrag.moved = true;
  if (levelDrag.moved) $('levels').scrollLeft = levelDrag.scroll - dx;
});
$('levels').addEventListener('pointerup', ev => {
  const d = levelDrag; levelDrag = null;
  if (!d || d.moved) return;
  const el = document.elementFromPoint(ev.clientX, ev.clientY);
  const lvl = el && el.closest('.lvl');
  if (lvl) chooseLevel(Number(lvl.dataset.level));
});
$('levels').addEventListener('pointercancel', () => { levelDrag = null; });

// Træk op og ned i stjerne-butikken (samme egen håndtering som banerne).
let shopDrag = null;
$('shop').addEventListener('pointerdown', ev => {
  $('shop').setPointerCapture(ev.pointerId);
  shopDrag = { y: appPoint(ev).y, scroll: $('shop').scrollTop, moved: false };
});
$('shop').addEventListener('pointermove', ev => {
  if (!shopDrag) return;
  const dy = appPoint(ev).y - shopDrag.y;
  if (Math.abs(dy) > TAP_SLOP) shopDrag.moved = true;
  if (shopDrag.moved) $('shop').scrollTop = shopDrag.scroll - dy;
});
$('shop').addEventListener('pointerup', ev => {
  const d = shopDrag; shopDrag = null;
  if (!d || d.moved) return;
  const el = document.elementFromPoint(ev.clientX, ev.clientY);
  const b = el && el.closest('#shop button');
  if (b) b.click();
});
$('shop').addEventListener('pointercancel', () => { shopDrag = null; });
$('shop').addEventListener('wheel', ev => { ev.preventDefault(); $('shop').scrollTop += ev.deltaY; }, { passive: false });
$('levels').addEventListener('wheel', ev => { ev.preventDefault(); $('levels').scrollLeft += ev.deltaX || ev.deltaY; }, { passive: false });

$('scrStart').onclick = () => showStage(1);
$('bCancel').onclick = () => { $('levelDialog').hidden = true; };
$('bMenu').onclick = () => { state.selected = null; state.rallyFor = null; buildToolbar(); showStage(1); };
$('bToMenu').onclick = () => showStage(1);

// Svage vandrette streger i baggrunden under startskærmen; de ruller langsommere end forgrunden,
// så man kan se parallaksen. Selve startskærmen er ensfarvet.
(function decorate() {
  const bg = $('menuBg');
  for (let k = 0; k < 9; k++) {
    const d = document.createElement('div');
    d.className = 'bgline';
    d.style.top = (56 + k * 5) + '%';
    bg.appendChild(d);
  }
})();

// ---------- løkke ----------
let last = performance.now();
let lastPhase = null;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (stage === 2) for (let k = 0; k < state.speed; k++) update(dt);   // spillet står stille i menuerne
  if (state.phase !== lastPhase) {
    lastPhase = state.phase;
    if (state.phase === 'won' && state.level) {
      progress.stars[state.level] = Math.max(progress.stars[state.level] || 0, starsFor(state.lives));
      saveProgress();
    }
    if (state.level && (state.phase === 'won' || state.phase === 'over')) clearSave();
    buildToolbar();
  }
  draw();
  requestAnimationFrame(frame);
}

newGame();
buildToolbar();
resize();
showStage(0, true);
requestAnimationFrame(frame);
// gem byggefasen, når appen lukkes eller lægges væk
// (kun en bane, der er i gang, så en tom bane ikke skriver hen over det gemte)
document.addEventListener('visibilitychange', () => { if (document.hidden && state.phase === 'build' && inProgress(state.level)) saveGame(); });
window.addEventListener('keydown', ev => { if (ev.key === 'l' || ev.key === 'L') landscapeOn = !landscapeOn; });
window.addEventListener('pagehide', () => { if (state.phase === 'build' && inProgress(state.level)) saveGame(); });
window.borgmuren = { get state() { return state; }, update, startWave, placeCell, placeEdge, moveHero, tap,
                     recomputeField, hasOpening, setRally, showStage, playLevel, upgrade, useAbility, castAt, saveGame, loadGame, readSave, chooseLevel, waveMonsters, waveHp, MONSTERS, playCustom, parseLevel, smash, LEVELS, CONFIG, BUILDINGS, hKey, vKey };
