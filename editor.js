// Baneeditor til Borgmuren. Ikke en del af spillet: den lægges kun ind i editor-udgaven
// (python3 build_artifact.py <udfil> --editor). Mal vand, sten, træer, indgang og borg, prøv banen
// med det samme, og kopiér den til levels.js. Kan også læse en tegning med de faste farver.
'use strict';
(function () {
  const PAINTS = [
    { ch: '.', name: 'Græs', color: '#e7e2d4' },
    { ch: '~', name: 'Vand', color: '#a9c9d6' },
    { ch: '#', name: 'Sten', color: '#a39d92' },
    { ch: 'T', name: 'Træ', color: '#5f7d4a' },
    { ch: 'S', name: 'Indgang', color: '#f3b8b0' },
    { ch: 'C', name: 'Borg', color: '#7c5a3a' },
  ];
  // de faste farver i tegninger (samme som tools/level_colors.py)
  const DRAW_COLORS = { '.': [255, 255, 255], '~': [59, 130, 246], '#': [128, 128, 128], T: [34, 139, 34], S: [239, 68, 68], C: [139, 90, 43] };
  const CELL_PX = 32;

  const css = document.createElement('style');
  css.textContent = `
    #editor { position: absolute; inset: 0; z-index: 10; background: #ebe6dc; color: #36454b; display: flex; flex-direction: column;
              font-family: 'Cormorant Garamond', Georgia, serif; font-variant-numeric: lining-nums; }
    #editor .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 8px 16px; border-bottom: 1px solid #c8bfae; }
    #editor h1 { font-size: 24px; font-weight: 500; letter-spacing: 2px; margin: 0 12px 0 0; }
    #editor button, #editor select, #editor input { font-family: inherit; font-size: 17px; color: #36454b; background: transparent;
              border: 1px solid #36454b; border-radius: 4px; padding: 5px 10px; }
    #editor input[type=number] { width: 64px; }
    #editor button.active { background: #36454b; color: #ebe6dc; }
    #editor .sw { display: inline-block; width: 14px; height: 14px; border: 1px solid #36454b; margin-right: 6px; vertical-align: -2px; }
    #edWrap { flex: 1; min-height: 0; position: relative; }
    #edCanvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
    #edMsg { min-height: 1.4em; font-size: 17px; }
    #edOut { position: absolute; inset: 24px; display: flex; flex-direction: column; gap: 8px; background: #ebe6dc; border: 1px solid #36454b; padding: 12px; }
    #edOut textarea { flex: 1; font-family: ui-monospace, monospace; font-size: 12px; }
    #bEditor { border-color: #fbbf24 !important; }
  `;
  document.head.appendChild(css);

  const ed = document.createElement('div');
  ed.id = 'editor';
  ed.innerHTML = `
    <div class="row"><h1>Baneeditor</h1>
      <select id="edLoad"><option value="">Hent bane …</option></select>
      Bredde <input id="edW" type="number" min="8" max="80" value="32">
      Højde <input id="edH" type="number" min="6" max="60" value="24">
      <button id="edNew">Ny tom bane</button>
      <button id="edImg">Indlæs tegning</button><input id="edFile" type="file" accept="image/*" hidden>
    </div>
    <div class="row" id="edPaints"></div>
    <div class="row">
      Navn <input id="edName" value="Ny bane">
      Som bane 1 til runde <input id="edSame" type="number" min="0" max="10" value="2">
      Flere monstre pr. runde % <input id="edGrowth" type="number" min="0" max="100" value="6">
      Mere liv pr. runde % <input id="edHp" type="number" min="0" max="100" value="2">
    </div>
    <div class="row"><button id="edPlay">Prøv banen</button><button id="edCopy">Kopiér til levels.js</button><span id="edMsg"></span></div>
    <div id="edWrap"><canvas id="edCanvas"></canvas>
      <div id="edOut" hidden><div>Kopiér teksten ind i LEVELS i levels.js (eller send den til Claude):</div><textarea id="edText" readonly></textarea><button id="edClose">Luk</button></div>
    </div>`;
  document.getElementById('app').appendChild(ed);
  const $e = id => document.getElementById(id);

  let cols = 32, rows = 24, grid = [], paint = '~';
  const g = window.borgmuren;

  function blank(w, h) {
    cols = w; rows = h;
    grid = [];
    for (let y = 0; y < rows; y++) grid.push(Array.from({ length: cols }, (_, x) => (x === 0 ? 'S' : '.')));
    // en borg i højre side midt på
    const cy = Math.floor(rows / 2) - 3;
    for (let y = cy; y < cy + 6; y++) for (let x = cols - 3; x < cols; x++) grid[y][x] = 'C';
    syncSize(); draw();
  }
  function fromLevel(level) {
    rows = level.map.length; cols = level.map[0].length;
    grid = level.map.map(r => r.split(''));
    $e('edName').value = level.name;
    const w = level.waves || {};
    $e('edSame').value = w.same ?? 10;
    $e('edGrowth').value = Math.round((w.growth || 0) * 100);
    $e('edHp').value = Math.round((w.hpGrowth || 0) * 100);
    syncSize(); draw();
  }
  function syncSize() { $e('edW').value = cols; $e('edH').value = rows; }
  const clampNum = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));
  function level() {
    return {
      name: $e('edName').value.trim() || 'Ny bane',
      waves: { same: clampNum($e('edSame').value, 0, 10), growth: clampNum($e('edGrowth').value, 0, 100) / 100,
               hpGrowth: clampNum($e('edHp').value, 0, 100) / 100 },
      map: grid.map(r => r.join('')),
    };
  }

  // ---- tegning af gitteret ----
  const cv = $e('edCanvas'), cx = cv.getContext('2d');
  let cell = 10, ox = 0, oy = 0;
  function draw() {
    const w = $e('edWrap').clientWidth, h = $e('edWrap').clientHeight, dpr = window.devicePixelRatio || 1;
    if (!w || !h) return;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, w, h);
    cell = Math.max(4, Math.min((w - 32) / cols, (h - 32) / rows));
    ox = (w - cell * cols) / 2; oy = (h - cell * rows) / 2;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      cx.fillStyle = PAINTS.find(p => p.ch === grid[y][x]).color;
      cx.fillRect(ox + x * cell, oy + y * cell, cell + 0.5, cell + 0.5);
    }
    cx.strokeStyle = 'rgba(0,0,0,0.1)'; cx.lineWidth = 1; cx.beginPath();
    for (let x = 0; x <= cols; x++) { cx.moveTo(ox + x * cell + 0.5, oy); cx.lineTo(ox + x * cell + 0.5, oy + rows * cell); }
    for (let y = 0; y <= rows; y++) { cx.moveTo(ox, oy + y * cell + 0.5); cx.lineTo(ox + cols * cell, oy + y * cell + 0.5); }
    cx.stroke();
    cx.strokeStyle = '#6b6457'; cx.lineWidth = 4; cx.strokeRect(ox - 2, oy - 2, cols * cell + 4, rows * cell + 4);
  }

  // ---- male med fingeren ----
  // Som i spillet: er skærmen på højkant, er alt drejet 90°, så punktet regnes om.
  function localPoint(ev) {
    const rect = $e('edWrap').getBoundingClientRect();
    if (typeof rotated !== 'undefined' && rotated) {
      // edWrap ligger drejet; dens lokale x følger skærmens y og lokale y følger -x
      return { x: ev.clientY - rect.top, y: rect.right - ev.clientX };
    }
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }
  let painting = false;
  function paintAt(ev) {
    const p = localPoint(ev);
    const x = Math.floor((p.x - ox) / cell), y = Math.floor((p.y - oy) / cell);
    if (x < 0 || y < 0 || x >= cols || y >= rows || grid[y][x] === paint) return;
    grid[y][x] = paint; draw();
  }
  cv.addEventListener('pointerdown', ev => { cv.setPointerCapture(ev.pointerId); painting = true; paintAt(ev); });
  cv.addEventListener('pointermove', ev => { if (painting) paintAt(ev); });
  cv.addEventListener('pointerup', () => { painting = false; });
  cv.addEventListener('pointercancel', () => { painting = false; });

  // ---- knapper ----
  for (const p of PAINTS) {
    const b = document.createElement('button');
    b.innerHTML = `<span class="sw" style="background:${p.color}"></span>${p.name}`;
    b.onclick = () => { paint = p.ch; for (const o of $e('edPaints').children) o.classList.toggle('active', o === b); };
    if (p.ch === paint) b.classList.add('active');
    $e('edPaints').appendChild(b);
  }
  g.LEVELS.forEach((l, i) => {
    const o = document.createElement('option'); o.value = i; o.textContent = l.name; $e('edLoad').appendChild(o);
  });
  $e('edLoad').onchange = () => { if ($e('edLoad').value !== '') fromLevel(g.LEVELS[Number($e('edLoad').value)]); $e('edLoad').value = ''; };
  $e('edNew').onclick = () => blank(clampNum($e('edW').value, 8, 80), clampNum($e('edH').value, 6, 60));
  const say = t => { $e('edMsg').textContent = t; };

  $e('edPlay').onclick = () => {
    const err = g.playCustom(level());
    if (err) { say(err); g.showStage(0, true); return; }
    say('');
    ed.hidden = true;
    $e('bEditor').hidden = false;
  };
  $e('edCopy').onclick = () => {
    const l = level();
    const err = g.parseLevel(l).error;
    $e('edText').value = (err ? `// OBS: ${err}\n` : '') +
      `  { name: ${JSON.stringify(l.name)}, waves: { same: ${l.waves.same}, growth: ${l.waves.growth}, hpGrowth: ${l.waves.hpGrowth} },\n` +
      '    map: [\n' + l.map.map(r => `      ${JSON.stringify(r)},\n`).join('') + '    ] },\n';
    $e('edOut').hidden = false;
    $e('edText').select();
  };
  $e('edClose').onclick = () => { $e('edOut').hidden = true; };

  // ---- indlæs en tegning med de faste farver ----
  $e('edImg').onclick = () => $e('edFile').click();
  $e('edFile').onchange = () => {
    const f = $e('edFile').files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      // størrelsen: 32 px pr. felt i skabelonen; ellers bruges bredde og højde i felterne ovenfor
      let w = clampNum($e('edW').value, 8, 80), h = clampNum($e('edH').value, 6, 60);
      if (img.width % CELL_PX === 0) { w = img.width / CELL_PX; h = Math.floor(img.height / CELL_PX); }
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const k = c.getContext('2d'); k.drawImage(img, 0, 0);
      const px = k.getImageData(0, 0, img.width, img.height).data, cw = img.width / w;
      const near = (r, gg, b) => Object.keys(DRAW_COLORS).reduce((best, ch) => {
        const [R, G, B] = DRAW_COLORS[ch], d = (R - r) ** 2 + (G - gg) ** 2 + (B - b) ** 2;
        return d < best[1] ? [ch, d] : best;
      }, ['.', Infinity])[0];
      cols = w; rows = h; grid = [];
      for (let y = 0; y < rows; y++) {
        const line = [];
        for (let x = 0; x < cols; x++) {
          const votes = {};
          for (let sy = 0.3; sy < 0.7; sy += 0.1) for (let sx = 0.3; sx < 0.7; sx += 0.1) {
            const ix = Math.floor((x + sx) * cw), iy = Math.floor((y + sy) * cw), o = (iy * img.width + ix) * 4;
            const ch = near(px[o], px[o + 1], px[o + 2]);
            votes[ch] = (votes[ch] || 0) + 1;
          }
          line.push(Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0]);
        }
        grid.push(line);
      }
      syncSize(); draw();
      say(`Tegningen er læst som ${cols}×${rows} felter.`);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => say('Billedet kunne ikke læses.');
    img.src = URL.createObjectURL(f);
    $e('edFile').value = '';
  };

  // knap i spillet: tilbage til editoren
  const back = document.createElement('button');
  back.id = 'bEditor'; back.textContent = 'Editor'; back.hidden = true;
  back.onclick = () => { ed.hidden = false; back.hidden = true; g.showStage(0, true); requestAnimationFrame(draw); };
  document.getElementById('hud').prepend(back);

  window.addEventListener('resize', () => requestAnimationFrame(draw));
  fromLevel(g.LEVELS[g.LEVELS.length - 1]);
  requestAnimationFrame(draw);
})();
