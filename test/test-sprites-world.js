// test/test-sprites-world.js
// Tests for js/sprites-world.js (WP-D): the world sprites, the remaps `sunset` and `dusk` and the
// backdrop `meadow`. CONTRACT section 12 (WP-D acceptance), 6.1 to 6.5 and 2.2. The Level 2 sprites,
// the remaps `brass`, `crystal` and `paleink` and their rules are LEVEL2 3.1, 3.3 to 3.5 and Appendix C.
// The last checks of the file compare the WP-D rows of CONTRACT 6.3 and the cavern tables of 6.5 with the code.
// Run from the project root: node test/test-sprites-world.js
'use strict';

const stubs = require('./stubs');

let passed = 0;
let failed = 0;

function ok(condition, description, detail) {
  if (condition) {
    passed++;
    console.log('ok - ' + description);
  } else {
    failed++;
    console.log('FAIL - ' + description + (detail ? ' (' + detail + ')' : ''));
  }
}

function check(description, fn) {
  try {
    const result = fn();
    if (result === false) ok(false, description);
    else if (typeof result === 'string') ok(false, description, result);
    else ok(true, description);
  } catch (e) {
    ok(false, description, (e && e.message ? e.message : String(e)).split('\n')[0]);
  }
}

// ---------------------------------------------------------------------------------------------
// Load: only core.js and the WP-D file, as CONTRACT 12.0 requires for every package.
// ---------------------------------------------------------------------------------------------

const env = stubs.load({ files: ['js/core.js', 'js/sprites-world.js'] });
const TG = env.TG;
const C = TG.COLOR;
const PAL_KEYS = TG.PAL_KEYS;

check('loads with only core.js and sprites-world.js present', function () {
  if (env.missing.length !== 0) return 'missing: ' + env.missing.join(', ');
  if (env.loaded.length !== 2) return 'loaded: ' + env.loaded.join(', ');
});

check('loading makes no canvas, audio or storage calls and no warnings', function () {
  if (env.canvasCalls.count !== 0) return 'canvas calls: ' + env.canvasCalls.count;
  if (env.audio.contexts.length !== 0) return 'audio contexts: ' + env.audio.contexts.length;
  if (env.storage.size !== 0) return 'storage entries: ' + env.storage.size;
  if (env.warnings.length !== 0) return 'warnings: ' + env.warnings.join(' | ');
  if (env.errors.length !== 0) return 'errors: ' + env.errors.join(' | ');
});

check('sprites-world.js does not read other modules at load time', function () {
  const raw = require('fs').readFileSync(require('path').join(stubs.ROOT, 'js/sprites-world.js'), 'utf8');
  const src = raw.replace(/\/\/[^\n]*/g, '');   // comments may name other modules; code may not
  const bad = ['TG.Gfx', 'TG.Font', 'TG.Audio', 'TG.Render', 'TG.Effects', 'TG.Hud', 'TG.UI', 'TG.Main',
    'TG.Game', 'TG.Entities', 'TG.Level', 'TG.Words', 'TG.Typing', 'document.', 'localStorage', 'AudioContext',
    'requestAnimationFrame', 'setTimeout', 'Math.random', 'Date.'];
  const found = bad.filter(function (b) { return src.indexOf(b) !== -1; });
  if (found.length) return 'found: ' + found.join(', ');
});

// ---------------------------------------------------------------------------------------------
// Helpers: pixel access with copies and flips resolved.
// ---------------------------------------------------------------------------------------------

// Rows of palette indices (-1 = transparent) for one frame, following { copy, flipX }.
function pixels(def, index) {
  let frame = def.frames[index];
  let flip = false;
  let guard = 0;
  while (frame && !Array.isArray(frame)) {
    if (frame.flipX) flip = !flip;
    frame = def.frames[frame.copy];
    if (++guard > def.frames.length) throw new Error('copy loop');
  }
  const rows = [];
  for (let y = 0; y < def.h; y++) {
    const row = [];
    for (let x = 0; x < def.w; x++) {
      const ch = frame[y].charAt(flip ? def.w - 1 - x : x);
      row.push(ch === '.' ? -1 : PAL_KEYS.indexOf(ch));
    }
    rows.push(row);
  }
  return rows;
}

function def(name) {
  const d = TG.Sprites.get(name);
  if (!d) throw new Error('sprite ' + name + ' is not defined');
  return d;
}

// Set of palette indices used by every frame of a sprite.
function colorsOf(name) {
  const d = def(name);
  const set = {};
  for (let f = 0; f < d.frames.length; f++) {
    const px = pixels(d, f);
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (px[y][x] >= 0) set[px[y][x]] = true;
  }
  return Object.keys(set).map(Number);
}

function countColors(px, w, h, indices) {
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (indices.indexOf(px[y][x]) !== -1) n++;
  return n;
}

function opaqueCount(px, w, h) {
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[y][x] >= 0) n++;
  return n;
}

// First opaque row of a column (h when the column is empty).
function silhouetteTop(px, h, x) {
  for (let y = 0; y < h; y++) if (px[y][x] >= 0) return y;
  return h;
}

// Outline check on the exterior: every opaque pixel that touches the frame edge, or a transparent pixel
// reachable from the frame edge, must be INK. Returns the number of edge pixels and the number that are not INK.
function outlineReport(px, w, h, opts) {
  const o = opts || {};
  const ext = [];
  for (let y = 0; y < h; y++) ext.push(new Array(w).fill(false));
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push([x, 0]); stack.push([x, h - 1]); }
  for (let y = 0; y < h; y++) { stack.push([0, y]); stack.push([w - 1, y]); }
  while (stack.length) {
    const p = stack.pop();
    const x = p[0], y = p[1];
    if (x < 0 || y < 0 || x >= w || y >= h || ext[y][x] || px[y][x] >= 0) continue;
    ext[y][x] = true;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  let edge = 0, notInk = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (px[y][x] < 0) continue;
    const onEdge = x === 0 || (y === 0 && !o.ignoreTop) || x === w - 1 || (y === h - 1 && !o.ignoreBottom) ||
      ext[y][x + 1] || ext[y][x - 1] || (y + 1 < h && ext[y + 1][x]) || (y > 0 && ext[y - 1][x]);
    if (!onEdge) continue;
    edge++;
    if (px[y][x] !== C.INK) notInk++;
  }
  return { edge: edge, notInk: notInk };
}

// ---------------------------------------------------------------------------------------------
// Registry: every WP-D sprite of 6.4 is defined with the manifest's size and frame count.
// ---------------------------------------------------------------------------------------------

const manifestD = TG.Sprites.MANIFEST.filter(function (m) { return m.owner === 'D'; });
// The WP-D sprites that are defined. A manifest row with no definition is reported by the checks on
// TG.Sprites.missing and on the manifest's fields. The checks of the art itself run over the sprites that
// exist, so that a missing sprite does not hide what they say about the others.
const definedD = manifestD.filter(function (m) { return TG.Sprites.has(m.name); });

check('TG.Sprites.missing("D") is empty', function () {
  const m = TG.Sprites.missing('D');
  if (m.length) return m.join(', ');
});

check('every WP-D sprite passes TG.Sprites.check', function () {
  const bad = [];
  TG.Sprites.names().forEach(function (name) {
    const d = TG.Sprites.get(name);
    if (d.owner !== 'D') return;
    const problems = TG.Sprites.check(d);
    if (problems.length) bad.push(name + ': ' + problems.join('; '));
  });
  if (bad.length) return bad.join(' | ');
});

check('every WP-D sprite has the manifest frame names, fps and anchor', function () {
  const bad = [];
  manifestD.forEach(function (m) {
    const d = TG.Sprites.get(m.name);
    if (!d) { bad.push(m.name + ' undefined'); return; }
    if (JSON.stringify(d.names) !== JSON.stringify(m.names)) bad.push(m.name + ' names ' + d.names.join(' '));
    if (d.fps !== m.fps) bad.push(m.name + ' fps ' + d.fps + ' vs ' + m.fps);
    if (d.anchor[0] !== m.ax || d.anchor[1] !== m.ay) bad.push(m.name + ' anchor ' + d.anchor.join(',') + ' vs ' + m.ax + ',' + m.ay);
    if (d.owner !== 'D') bad.push(m.name + ' owner ' + d.owner);
  });
  if (bad.length) return bad.join(' | ');
});

check('sprites-world.js defines only WP-D names (no WP-C sprite is defined here)', function () {
  const cNames = TG.Sprites.MANIFEST.filter(function (m) { return m.owner === 'C'; }).map(function (m) { return m.name; });
  const defined = TG.Sprites.names();
  const wrong = defined.filter(function (n) { return cNames.indexOf(n) !== -1; });
  if (wrong.length) return wrong.join(', ');
  const extra = defined.filter(function (n) { return !manifestD.some(function (m) { return m.name === n; }); });
  if (extra.length) return 'not in the manifest: ' + extra.join(', ');
});

// ---------------------------------------------------------------------------------------------
// Brackets: tl0 tl1 bl0 bl1, bl = tl mirrored top to bottom.
// ---------------------------------------------------------------------------------------------

check('fx_bracket has the frames tl0 tl1 bl0 bl1 and each bl frame is the tl frame mirrored top to bottom', function () {
  const d = def('fx_bracket');
  if (JSON.stringify(d.names) !== JSON.stringify(['tl0', 'tl1', 'bl0', 'bl1'])) return 'names ' + d.names.join(' ');
  for (let k = 0; k < 2; k++) {
    const tl = pixels(d, k), bl = pixels(d, k + 2);
    for (let y = 0; y < d.h; y++) {
      if (JSON.stringify(bl[y]) !== JSON.stringify(tl[d.h - 1 - y])) return 'bl' + k + ' row ' + y + ' is not tl' + k + ' row ' + (d.h - 1 - y);
    }
  }
  const colors = colorsOf('fx_bracket');
  if (colors.indexOf(C.GOLD) === -1) return 'no GOLD';
});

// ---------------------------------------------------------------------------------------------
// Horizontal tiling.
// ---------------------------------------------------------------------------------------------

['tile_grass', 'tile_soil', 'tile_arena', 'bg_hill_far', 'bg_hill_mid'].forEach(function (name) {
  check(name + ' tiles horizontally (silhouette of column 0 and of the column after the last differ by at most 1 px)', function () {
    const d = def(name);
    for (let f = 0; f < d.frames.length; f++) {
      const px = pixels(d, f);
      // The column after the last is column 0 of the next copy; for the two-frame tiles it is column 0 of
      // the other frame, because the renderer alternates the variants by column.
      const other = pixels(d, (f + 1) % d.frames.length);
      const last = silhouetteTop(px, d.h, d.w - 1);
      const next = silhouetteTop(other, d.h, 0);
      if (Math.abs(last - next) > 1) return 'frame ' + f + ': column ' + (d.w - 1) + ' top ' + last + ', next column top ' + next;
    }
  });
});

// A stronger seam check for the ground tiles: the grass-to-soil boundary must be at the same row on both
// sides of every join, and every tile is fully opaque.
['tile_grass', 'tile_soil', 'tile_arena'].forEach(function (name) {
  check(name + ' is fully opaque and its colour bands line up across the join', function () {
    const d = def(name);
    const greens = [C.GRASS, C.LIME, C.FOREST, C.PINE];
    function bandRow(px, x) {   // first row of the column that is not a green (h for none)
      for (let y = 0; y < d.h; y++) if (greens.indexOf(px[y][x]) === -1) return y;
      return d.h;
    }
    for (let f = 0; f < d.frames.length; f++) {
      const px = pixels(d, f);
      if (opaqueCount(px, d.w, d.h) !== d.w * d.h) return 'frame ' + f + ' has transparent pixels';
      const other = pixels(d, (f + 1) % d.frames.length);
      const a = bandRow(px, d.w - 1), b = bandRow(other, 0);
      if (Math.abs(a - b) > 1) return 'frame ' + f + ': band at row ' + a + ' meets row ' + b;
    }
  });
});

check('tile_edge_l and tile_edge_r match tile_grass on the side away from the gap', function () {
  const g0 = pixels(def('tile_grass'), 0), g1 = pixels(def('tile_grass'), 1);
  const el = pixels(def('tile_edge_l'), 0), er = pixels(def('tile_edge_r'), 0);
  const greens = [C.GRASS, C.LIME, C.FOREST, C.PINE];
  function bandRow(px, x) { for (let y = 0; y < 16; y++) if (greens.indexOf(px[y][x]) === -1) return y; return 16; }
  // edge_l: its left column joins the right column of a grass tile; edge_r: its right column joins the left of one
  const a = bandRow(el, 0), b0 = bandRow(g0, 15), b1 = bandRow(g1, 15);
  if (Math.abs(a - b0) > 1 && Math.abs(a - b1) > 1) return 'edge_l column 0 band ' + a + ' vs grass ' + b0 + '/' + b1;
  const c = bandRow(er, 15), d0 = bandRow(g0, 0), d1 = bandRow(g1, 0);
  if (Math.abs(c - d0) > 1 && Math.abs(c - d1) > 1) return 'edge_r column 15 band ' + c + ' vs grass ' + d0 + '/' + d1;
});

check('tile_rail is a 4 px strip at the top of the tile and transparent below', function () {
  const px = pixels(def('tile_rail'), 0);
  for (let y = 4; y < 16; y++) for (let x = 0; x < 16; x++) if (px[y][x] >= 0) return 'opaque pixel at ' + x + ',' + y;
  let top = 0;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) if (px[y][x] >= 0) top++;
  if (top < 32) return 'only ' + top + ' opaque pixels in the strip';
});

check('the rail sleepers stay visible on tile_arena under the sunset and dusk remaps', function () {
  const rail = pixels(def('tile_rail'), 0), arena = pixels(def('tile_arena'), 0);
  ['sunset', 'dusk'].forEach(function (name) {
    const t = TG.Remaps[name];
    const map = function (c) { return t[c] !== undefined ? t[c] : c; };
    // the most common ground colour of rows 2 and 3 of tile_arena, after the remap
    const count = {};
    for (let y = 2; y < 4; y++) for (let x = 0; x < 16; x++) { const c = map(arena[y][x]); count[c] = (count[c] || 0) + 1; }
    const ground = Number(Object.keys(count).sort(function (a, b) { return count[b] - count[a]; })[0]);
    let distinct = 0;
    for (let y = 2; y < 4; y++) for (let x = 0; x < 16; x++) if (rail[y][x] >= 0 && map(rail[y][x]) !== ground && map(rail[y][x]) !== C.BARK) distinct++;
    if (distinct < 8) throw new Error(name + ': only ' + distinct + ' sleeper pixels differ from the ground');
  });
});

check('tile_water animates (its two frames differ) and tile_plank has planks in its top rows', function () {
  const w = def('tile_water');
  if (JSON.stringify(pixels(w, 0)) === JSON.stringify(pixels(w, 1))) return 'water frames are identical';
  const p = pixels(def('tile_plank'), 0);
  for (let x = 0; x < 16; x++) if (p[0][x] < 0) return 'plank row 0 has a hole at ' + x;
});

// ---------------------------------------------------------------------------------------------
// Backdrop definition.
// ---------------------------------------------------------------------------------------------

const BD = TG.Backdrops.meadow;

check('TG.Backdrops.meadow has the palettes day, sunset and dusk', function () {
  if (!BD) return 'no meadow backdrop';
  const names = Object.keys(BD.palettes).sort();
  if (JSON.stringify(names) !== JSON.stringify(['day', 'dusk', 'sunset'])) return names.join(', ');
});

check('each palette has sky bands covering y 0 to 184 without gaps or overlaps, a remap and a slowSky', function () {
  const bad = [];
  Object.keys(BD.palettes).forEach(function (p) {
    const pal = BD.palettes[p];
    const bands = pal.sky.slice().sort(function (a, b) { return a.y - b.y; });
    let y = 0;
    bands.forEach(function (b) {
      if (b.y !== y) bad.push(p + ': band at ' + b.y + ' expected ' + y);
      if (!(b.color >= 0 && b.color <= 31)) bad.push(p + ': band colour ' + b.color);
      if (b.dither !== undefined && !(b.dither >= 0 && b.dither <= 31)) bad.push(p + ': dither ' + b.dither);
      y = b.y + b.h;
    });
    if (y !== TG.C.GROUND_Y) bad.push(p + ': bands end at ' + y);
    if (pal.remap !== null && !TG.Remaps[pal.remap]) bad.push(p + ': remap ' + pal.remap + ' is not defined');
    if (!(pal.slowSky >= 0 && pal.slowSky <= 31)) bad.push(p + ': slowSky ' + pal.slowSky);
    if (pal.slowSky === bands[0].color) bad.push(p + ': slowSky equals the top band colour, so the Hourglass would not show');
  });
  if (bad.length) return bad.join(' | ');
});

check('the day palette is SKY with a HAZE dither near the horizon and slowSky ROYAL', function () {
  const day = BD.palettes.day;
  if (day.sky[0].color !== C.SKY) return 'top band ' + day.sky[0].color;
  const dithered = day.sky.filter(function (b) { return b.dither === C.HAZE; });
  if (!dithered.length) return 'no HAZE dither band';
  if (day.slowSky !== C.ROYAL) return 'slowSky ' + day.slowSky;
  if (day.remap !== null) return 'day has a remap';
});

check('sunset is bands of PLUM, CORAL and ORANGE with the sunset remap; dusk is DEEP_BLUE with stars, a moon and the dusk remap', function () {
  const s = BD.palettes.sunset;
  const cols = s.sky.slice().sort(function (a, b) { return a.y - b.y; }).map(function (b) { return b.color; });
  if (JSON.stringify(cols) !== JSON.stringify([C.PLUM, C.CORAL, C.ORANGE])) return 'sunset bands ' + cols.join(',');
  if (s.remap !== 'sunset') return 'sunset remap ' + s.remap;
  const d = BD.palettes.dusk;
  if (d.sky.length !== 1 || d.sky[0].color !== C.DEEP_BLUE) return 'dusk sky';
  if (d.remap !== 'dusk') return 'dusk remap ' + d.remap;
  if (!Array.isArray(d.stars) || d.stars.length < 8) return 'dusk stars';
  if (!d.moon || typeof d.moon.x !== 'number' || typeof d.moon.y !== 'number') return 'dusk moon';
  const bad = d.stars.filter(function (st) { return !(st.x >= 0 && st.x <= 376 && st.y >= TG.C.PLAY_TOP + 8 && st.y <= TG.C.GROUND_Y); });
  if (bad.length) return 'stars outside the sky: ' + JSON.stringify(bad);
  if (d.moon.x < 0 || d.moon.x + 32 > 384 || d.moon.y - 32 < TG.C.PLAY_TOP || d.moon.y > 150) return 'moon at ' + d.moon.x + ',' + d.moon.y;
});

check('the backdrop has the five layers clouds, far, mid, near, fg with the factors of DESIGN 14.4', function () {
  const ids = BD.layers.map(function (l) { return l.id; });
  if (JSON.stringify(ids) !== JSON.stringify(['clouds', 'far', 'mid', 'near', 'fg'])) return ids.join(', ');
  const factors = BD.layers.map(function (l) { return l.factor; });
  if (JSON.stringify(factors) !== JSON.stringify([0.1, 0.2, 0.4, 0.7, 1.3])) return factors.join(', ');
  if (BD.layers[0].drift !== 2) return 'cloud drift ' + BD.layers[0].drift;
  const fronts = BD.layers.filter(function (l) { return l.front; }).map(function (l) { return l.id; });
  if (JSON.stringify(fronts) !== JSON.stringify(['fg'])) return 'front layers: ' + fronts.join(', ');
  BD.layers.forEach(function (l) {
    if (!(l.repeat > 0) || l.repeat % 16 !== 0) throw new Error(l.id + ' repeat ' + l.repeat);
    if (l.drift === undefined) throw new Error(l.id + ' has no drift');
  });
});

check('every sprite the backdrop uses is defined, and every item lies within its layer repeat', function () {
  const bad = [];
  BD.layers.forEach(function (l) {
    l.items.forEach(function (it) {
      if (!TG.Sprites.has(it.sprite)) { bad.push(l.id + ': ' + it.sprite + ' undefined'); return; }
      const d = TG.Sprites.get(it.sprite);
      if (typeof it.x !== 'number' || typeof it.y !== 'number') bad.push(l.id + ': ' + it.sprite + ' has no x, y');
      if (it.x < 0 || it.x >= l.repeat) bad.push(l.id + ': ' + it.sprite + ' x ' + it.x + ' outside repeat ' + l.repeat);
      if (it.sections && !it.sections.every(function (s) { return s >= 0 && s <= 3; })) bad.push(l.id + ': ' + it.sprite + ' sections');
      // bottom on or above the ground line for the world layers, below it for the front layer
      if (!l.front && it.sprite !== 'bg_sails' && it.y > TG.C.GROUND_Y) bad.push(l.id + ': ' + it.sprite + ' bottom ' + it.y + ' below the ground');
      if (!l.front && it.y - d.h < TG.C.PLAY_TOP && it.sprite !== 'bg_sails') bad.push(l.id + ': ' + it.sprite + ' top above the playfield');
      if (l.front && it.y - d.h < 200) bad.push('fg: ' + it.sprite + ' above y 200');
    });
  });
  if (bad.length) return bad.join(' | ');
});

check('no layer piece is wider than 128 px (DESIGN 14.4)', function () {
  const wide = manifestD.filter(function (m) { return m.name.indexOf('bg_') === 0 && m.w > 128; }).map(function (m) { return m.name; });
  if (wide.length) return wide.join(', ');
});

check('the apple trees are limited to section 1 and the molehills to sections 2 and 3', function () {
  const near = BD.layers.filter(function (l) { return l.id === 'near'; })[0];
  const apples = near.items.filter(function (it) { return it.sprite === 'bg_appletree'; });
  const moles = near.items.filter(function (it) { return it.sprite === 'bg_molehill'; });
  if (!apples.length || !moles.length) return 'no apple tree or molehill';
  if (!apples.every(function (it) { return JSON.stringify(it.sections) === '[1]'; })) return 'apple tree sections';
  if (!moles.every(function (it) { return JSON.stringify(it.sections) === '[2,3]'; })) return 'molehill sections';
});

// ---------------------------------------------------------------------------------------------
// Remaps.
// ---------------------------------------------------------------------------------------------

['sunset', 'dusk'].forEach(function (name) {
  check('TG.Remaps.' + name + ' maps palette indices to palette indices and changes SKY, ROYAL, FOREST and PINE', function () {
    const t = TG.Remaps[name];
    if (!t) return 'undefined';
    const keys = Object.keys(t);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k !== '*' && !(Number(k) >= 0 && Number(k) <= 31 && String(Number(k)) === k)) return 'key ' + k;
      if (!(t[k] >= 0 && t[k] <= 31) || Math.floor(t[k]) !== t[k]) return 'value for ' + k + ' is ' + t[k];
    }
    if (t[C.SKY] === undefined || t[C.SKY] === C.SKY) return 'SKY is not changed';
    if (t[C.ROYAL] === undefined) return 'ROYAL is not changed';
    if (t[C.FOREST] === undefined) return 'FOREST is not changed';
    if (t[C.PINE] === undefined) return 'PINE is not changed';
    if (t['*'] !== undefined) return 'has a * entry, which would recolour everything';
  });
});

check('sunset: SKY and HAZE go to ORANGE and CORAL, ROYAL to VIOLET; dusk: SKY to DEEP_BLUE, ROYAL to PLUM (CONTRACT 6.3)', function () {
  const s = TG.Remaps.sunset, d = TG.Remaps.dusk;
  if (s[C.SKY] !== C.ORANGE || s[C.HAZE] !== C.CORAL || s[C.ROYAL] !== C.VIOLET) return 'sunset ' + JSON.stringify(s);
  if (d[C.SKY] !== C.DEEP_BLUE || d[C.ROYAL] !== C.PLUM) return 'dusk ' + JSON.stringify(d);
  if (d[C.INK] !== undefined || s[C.INK] !== undefined) return 'INK must not be remapped';
});

check('brass: STONE to BRONZE and TEAL to GOLD; crystal: PLUM to DEEP_BLUE, BRONZE to DEEP_TEAL, GOLD to AQUA, ORANGE to TEAL; nothing else (CONTRACT 6.3, LEVEL2 Appendix C)', function () {
  const b = TG.Remaps.brass, c = TG.Remaps.crystal;
  if (!b || !c) return 'undefined';
  if (JSON.stringify(b) !== JSON.stringify({ 2: 16, 10: 18 })) return 'brass ' + JSON.stringify(b);
  if (JSON.stringify(c) !== JSON.stringify({ 16: 9, 17: 10, 18: 11, 28: 5 })) return 'crystal ' + JSON.stringify(c);
  if (b[C.STONE] !== C.BRONZE || b[C.TEAL] !== C.GOLD) return 'brass by name ' + JSON.stringify(b);
  if (c[C.PLUM] !== C.DEEP_BLUE || c[C.BRONZE] !== C.DEEP_TEAL || c[C.GOLD] !== C.AQUA || c[C.ORANGE] !== C.TEAL) return 'crystal by name ' + JSON.stringify(c);
});

check('brass and crystal leave INK, SHADOW, SILVER, WHITE, CREAM, AQUA, DEEP_TEAL and CORAL alone (the rails stay SILVER and the hazard accents CORAL)', function () {
  const kept = [C.INK, C.SHADOW, C.SILVER, C.WHITE, C.CREAM, C.AQUA, C.DEEP_TEAL, C.CORAL];
  const bad = [];
  ['brass', 'crystal'].forEach(function (name) {
    const t = TG.Remaps[name];
    if (!t) { bad.push(name + ' undefined'); return; }
    if (t['*'] !== undefined) bad.push(name + ' has a * entry, which would recolour everything');
    kept.forEach(function (k) { if (t[k] !== undefined) bad.push(name + ' changes ' + k); });
  });
  if (bad.length) return bad.join(', ');
});

// The ink drops of Level 2 (LEVEL2 3.1, rule 2, the fallback named there): item_ink drawn with paleink.
check('paleink: ROYAL to SKY and DEEP_BLUE to ROYAL, nothing else (CONTRACT 6.3)', function () {
  const t = TG.Remaps.paleink;
  if (!t) return 'undefined';
  if (JSON.stringify(t) !== JSON.stringify({ 5: 6, 6: 7 })) return JSON.stringify(t);
  if (t[C.ROYAL] !== C.SKY || t[C.DEEP_BLUE] !== C.ROYAL) return 'by name ' + JSON.stringify(t);
});

check('item_ink is INK, ROYAL, DEEP_BLUE and WHITE only; under paleink it has the colours of icon_ink and none as dark as a band of Level 2', function () {
  const own = colorsOf('item_ink');
  const other = own.filter(function (c) { return [C.INK, C.ROYAL, C.DEEP_BLUE, C.WHITE].indexOf(c) === -1; });
  if (other.length) return 'item_ink also uses ' + other.join(' ');
  const t = TG.Remaps.paleink;
  const drawn = own.map(function (c) { return t[c] === undefined ? c : t[c]; }).sort(function (a, b) { return a - b; });
  const icon = colorsOf('icon_ink').slice().sort(function (a, b) { return a - b; });
  if (JSON.stringify(drawn) !== JSON.stringify(icon)) return 'drawn ' + drawn.join(' ') + ', icon_ink ' + icon.join(' ');
  const band = drawn.filter(function (c) { return [C.PLUM, C.DEEP_BLUE, C.SHADOW, C.MAROON, C.DEEP_TEAL].indexOf(c) !== -1; });
  if (band.length) return 'a band colour is left: ' + band.join(' ');
});

// ---------------------------------------------------------------------------------------------
// Hazards.
// ---------------------------------------------------------------------------------------------

['haz_bramble', 'haz_branch', 'haz_beehive', 'haz_arch'].forEach(function (name) {
  check(name + ' contains CORAL pixels (the hazard accent)', function () {
    if (colorsOf(name).indexOf(C.CORAL) === -1) return 'no CORAL';
  });
});

check('the thorns of haz_bramble fill the middle 8 columns of its lower 8 px, where its collision box is', function () {
  const px = pixels(def('haz_bramble'), 0);
  let coral = 0;
  for (let y = 8; y < 16; y++) for (let x = 4; x < 12; x++) {
    if (px[y][x] < 0) return 'transparent pixel at ' + x + ',' + y;
    if (px[y][x] === C.CORAL) coral++;
  }
  if (coral < 4) return 'only ' + coral + ' CORAL thorn pixels in the box';
  // and the top half is mostly clear: the bramble is 8 px tall
  let upper = 0;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) if (px[y][x] >= 0) upper++;
  if (upper > 8) return upper + ' opaque pixels in the top 4 rows';
});

check('the duck hazards (branch, beehive, arch) hang from above: their top rows connect to the trunk or rope', function () {
  const branch = pixels(def('haz_branch'), 0), trunk = pixels(def('haz_trunk'), 0);
  const hive = pixels(def('haz_beehive'), 0), rope = pixels(def('haz_rope'), 0);
  const arch = pixels(def('haz_arch'), 0);
  function opaqueCols(row, w) { const c = []; for (let x = 0; x < w; x++) if (row[x] >= 0) c.push(x); return c; }
  const bTop = opaqueCols(branch[0], 16), tBottom = opaqueCols(trunk[15], 16);
  if (JSON.stringify(bTop) !== JSON.stringify(tBottom)) return 'branch row 0 columns ' + bTop.join(',') + ' vs trunk bottom ' + tBottom.join(',');
  const hTop = opaqueCols(hive[0], 16), rBottom = opaqueCols(rope[15], 16);
  if (JSON.stringify(hTop) !== JSON.stringify(rBottom)) return 'beehive row 0 columns ' + hTop.join(',') + ' vs rope bottom ' + rBottom.join(',');
  const aTop = opaqueCols(arch[0], 48);
  const left = aTop.filter(function (x) { return x < 16; }), right = aTop.filter(function (x) { return x >= 32; }).map(function (x) { return x - 32; });
  if (JSON.stringify(left) !== JSON.stringify(tBottom) || JSON.stringify(right) !== JSON.stringify(tBottom)) return 'arch row 0 does not meet the trunk';
  // trunk and rope tile vertically: their top and bottom rows have the same opaque columns
  if (JSON.stringify(opaqueCols(trunk[0], 16)) !== JSON.stringify(tBottom)) return 'trunk does not tile vertically';
  if (JSON.stringify(opaqueCols(rope[0], 16)) !== JSON.stringify(rBottom)) return 'rope does not tile vertically';
});

check('the jump signs and duck signs differ in colour: RED arrow up, ROYAL arrow down', function () {
  const j = colorsOf('sign_jump'), d = colorsOf('sign_duck');
  if (j.indexOf(C.RED) === -1) return 'sign_jump has no RED';
  if (d.indexOf(C.ROYAL) === -1) return 'sign_duck has no ROYAL';
  if (j.indexOf(C.ROYAL) !== -1 || d.indexOf(C.RED) !== -1) return 'the signs share their arrow colours';
});

check('flag_pole frames keep the pole in place and raise the pennant', function () {
  const d = def('flag_pole');
  const frames = d.names.map(function (_, i) { return pixels(d, i); });
  // the pole: a column of WHITE beside a column of SILVER running from row 5 to the bottom, in the same
  // place in every frame
  function poleX(px) {
    for (let x = 0; x < 15; x++) {
      let all = true;
      for (let y = 5; y < 32; y++) if (px[y][x] !== C.WHITE || px[y][x + 1] !== C.SILVER) { all = false; break; }
      if (all) return x;
    }
    return -1;
  }
  const base = poleX(frames[0]);
  if (base < 0) return 'no pole column in frame down';
  for (let f = 1; f < frames.length; f++) if (poleX(frames[f]) !== base) return 'pole moves in frame ' + d.names[f];
  function redTop(px) { for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) if (px[y][x] === C.RED) return y; return 32; }
  const tops = frames.map(redTop);
  if (!(tops[0] > tops[1] && tops[1] > tops[2] && tops[2] >= tops[3])) return 'pennant tops ' + tops.join(',');
});

// ---------------------------------------------------------------------------------------------
// Legibility: the pieces behind the word plates use little WHITE, GOLD or INK.
// ---------------------------------------------------------------------------------------------

['bg_hill_far', 'bg_hill_mid', 'bg_tree', 'bg_bush', 'bg_appletree'].forEach(function (name) {
  check(name + ': WHITE, GOLD and INK are at most 10% of the opaque pixels', function () {
    const d = def(name);
    for (let f = 0; f < d.frames.length; f++) {
      const px = pixels(d, f);
      const total = opaqueCount(px, d.w, d.h);
      const bright = countColors(px, d.w, d.h, [C.WHITE, C.GOLD, C.INK]);
      if (bright > total * 0.10) return 'frame ' + f + ': ' + bright + ' of ' + total;
    }
  });
});

check('no backdrop piece or tile has an INK outline, and the windmill, fence and molehill avoid WHITE, GOLD and INK too', function () {
  const bad = [];
  ['bg_windmill', 'bg_fence', 'bg_molehill', 'bg_cloud_s', 'bg_cloud_m', 'bg_cloud_l', 'bg_moon', 'fg_tuft', 'tile_grass', 'tile_soil', 'tile_arena'].forEach(function (name) {
    const d = def(name);
    const px = pixels(d, 0);
    const r = outlineReport(px, d.w, d.h);
    if (r.edge > 0 && r.notInk < r.edge * 0.5) bad.push(name + ' looks outlined (' + (r.edge - r.notInk) + ' of ' + r.edge + ' edge pixels INK)');
    if (['bg_windmill', 'bg_fence', 'bg_molehill'].indexOf(name) !== -1 && countColors(px, d.w, d.h, [C.WHITE, C.GOLD, C.INK]) > 0) bad.push(name + ' uses WHITE, GOLD or INK');
  });
  if (bad.length) return bad.join(' | ');
});

check('the dusk remap leaves the colours of bg_star and bg_moon alone', function () {
  const t = TG.Remaps.dusk;
  const used = colorsOf('bg_star').concat(colorsOf('bg_moon'));
  const changed = used.filter(function (c) { return t[c] !== undefined; });
  if (changed.length) return 'remapped: ' + changed.join(', ');
});

// ---------------------------------------------------------------------------------------------
// Outlines and colour counts for the sprites that have them (CONTRACT 6.2).
// ---------------------------------------------------------------------------------------------

const OUTLINED = manifestD.map(function (m) { return m.name; }).filter(function (n) {
  return n.indexOf('tile_') !== 0 && n.indexOf('bg_') !== 0 && n.indexOf('fg_') !== 0;
});

// Pieces that connect to something: a hanging hazard meets its trunk or rope at the top, and a piece that
// stands on the ground meets the tiles at the bottom. Those edges carry no outline.
// A Level 2 hazard skin is in the lists its Level 1 sprite is in. decor_hole stands on the ground and its
// rope comes down from above the frame.
const HANGING = ['haz_trunk', 'haz_rope', 'haz_branch', 'haz_beehive', 'haz_arch', 'haz_canopy',
  'haz_pipe_riser', 'haz_column', 'haz_chain', 'haz_pipe', 'haz_lantern', 'haz_tunnel', 'haz_ceiling', 'decor_hole'];
const STANDING = ['haz_bramble', 'haz_trunk', 'haz_rope', 'sign_jump', 'sign_duck', 'sign_type', 'flag_pole', 'fx_daisy',
  'haz_crystal', 'haz_pipe_riser', 'haz_column', 'haz_chain', 'decor_hole'];

check('every outlined sprite has INK on its exterior edge (at most 5% of edge pixels may differ)', function () {
  const bad = [];
  OUTLINED.forEach(function (name) {
    if (!TG.Sprites.has(name)) return;
    const d = def(name);
    for (let f = 0; f < d.frames.length; f++) {
      const r = outlineReport(pixels(d, f), d.w, d.h, { ignoreTop: HANGING.indexOf(name) !== -1, ignoreBottom: STANDING.indexOf(name) !== -1 });
      if (r.notInk > r.edge * 0.05) bad.push(name + '/' + d.names[f] + ' ' + r.notInk + ' of ' + r.edge);
    }
  });
  if (bad.length) return bad.join(', ');
});

check('items, crates, power-ups, effects and icons use at most 4 colours plus INK', function () {
  const bad = [];
  OUTLINED.forEach(function (name) {
    if (!TG.Sprites.has(name)) return;
    if (name.indexOf('sign_') === 0 || name.indexOf('flag_') === 0 || name.indexOf('haz_') === 0) return;
    const colors = colorsOf(name).filter(function (c) { return c !== C.INK; });
    if (colors.length > 4) bad.push(name + ' uses ' + colors.length + ': ' + colors.join(','));
  });
  if (bad.length) return bad.join(' | ');
});

check('every animated sprite has frames that differ from each other', function () {
  const bad = [];
  definedD.forEach(function (m) {
    const d = def(m.name);
    if (d.frames.length < 2) return;
    const seen = {};
    for (let f = 0; f < d.frames.length; f++) {
      const key = JSON.stringify(pixels(d, f));
      if (seen[key] !== undefined) bad.push(m.name + ' frames ' + seen[key] + ' and ' + f + ' are identical');
      seen[key] = f;
    }
  });
  if (bad.length) return bad.join(' | ');
});

check('power-up icons keep their 12 x 12 art inside the middle of the 16 x 16 cell', function () {
  const bad = [];
  ['pw_shield', 'pw_hourglass', 'pw_quill', 'pw_blast', 'pw_cap', 'pw_watch'].forEach(function (name) {
    if (!TG.Sprites.has(name)) return;
    const d = def(name);
    for (let f = 0; f < d.frames.length; f++) {
      const px = pixels(d, f);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        if (px[y][x] >= 0 && (x < 2 || x > 13 || y < 2 || y > 13)) bad.push(name + '/' + d.names[f] + ' at ' + x + ',' + y);
      }
      if (opaqueCount(px, 16, 16) < 60) bad.push(name + '/' + d.names[f] + ' is too small');
    }
  });
  if (bad.length) return bad.slice(0, 5).join(', ');
});

check('crate_box equals the lower 16 px of crate_balloon, and the balloon is above the crate', function () {
  const cb = pixels(def('crate_balloon'), 0), box = pixels(def('crate_box'), 0);
  for (let y = 0; y < 16; y++) if (JSON.stringify(cb[16 + y]) !== JSON.stringify(box[y])) return 'row ' + y + ' differs';
  if (countColors(cb.slice(0, 16), 16, 16, [C.RED]) === 0) return 'no RED balloon in the upper half';
});

check('item_ink, icon_ink and icon_pip read as a drop and a head: the drop is blue, the head has a RED cap over a PEACH face', function () {
  const ink = colorsOf('item_ink');
  if (ink.indexOf(C.ROYAL) === -1) return 'item_ink has no ROYAL';
  if (colorsOf('icon_ink').filter(function (c) { return [C.ROYAL, C.SKY, C.DEEP_BLUE, C.AQUA].indexOf(c) !== -1; }).length === 0) return 'icon_ink is not blue';
  const pip = pixels(def('icon_pip'), 0);
  if (countColors(pip.slice(0, 3), 8, 3, [C.RED]) === 0) return 'no RED cap';
  if (countColors(pip.slice(3, 8), 8, 5, [C.PEACH]) === 0) return 'no PEACH face';
});

check('key_cap and key_wide: the pressed frame has its face lower than the up frame', function () {
  ['key_cap', 'key_wide'].forEach(function (name) {
    const d = def(name);
    function faceTop(px) { for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (px[y][x] === C.WHITE) return y; return d.h; }
    const up = faceTop(pixels(d, 0)), down = faceTop(pixels(d, 1));
    if (!(down > up)) throw new Error(name + ': face tops ' + up + ' and ' + down);
  });
});

// ---------------------------------------------------------------------------------------------
// Anchors by group (CONTRACT 6.2).
// ---------------------------------------------------------------------------------------------

check('anchors follow the groups of CONTRACT 6.2', function () {
  const bad = [];
  definedD.forEach(function (m) {
    const d = def(m.name);
    const a = d.anchor;
    const n = m.name;
    let want = null;
    if (n.indexOf('tile_') === 0 || n.indexOf('icon_') === 0 || n.indexOf('ui_') === 0 || n.indexOf('key_') === 0) want = [0, 0];
    else if (n === 'bg_sails') want = [16, 16];
    else if (n === 'fx_bracket') want = [0, 0];
    else if (n.indexOf('haz_') === 0 || n.indexOf('bg_') === 0 || n.indexOf('fg_') === 0 || n.indexOf('decor_') === 0 || n === 'flag_pole' || n === 'sign_type') want = [0, d.h];
    else if (n === 'sign_jump' || n === 'sign_duck' || n.indexOf('item_') === 0 || n.indexOf('crate_') === 0 || n.indexOf('pw_') === 0) want = [d.w / 2, d.h];
    else if (n === 'fx_shield' || n === 'fx_bubble') want = [12, 30];
    else if (n === 'fx_daisy' || n === 'fx_dust') want = [4, 8];
    else if (n === 'fx_marker') want = [8, 4];
    else if (n.indexOf('fx_') === 0) want = [d.w / 2, d.h / 2];
    if (want && (a[0] !== want[0] || a[1] !== want[1])) bad.push(n + ' ' + a.join(',') + ' vs ' + want.join(','));
  });
  if (bad.length) return bad.join(' | ');
});

// ---------------------------------------------------------------------------------------------
// Level 2 (LEVEL2 3.1, 3.3 to 3.5 and Appendix C). A sprite that is not defined yet is passed over by
// the checks above; TG.Sprites.missing("D") reports it.
// ---------------------------------------------------------------------------------------------

const LEVEL2_D = ['tile_cave_top', 'tile_cave_fill', 'tile_cave_edge_l', 'tile_cave_edge_r', 'tile_cave_wall_l', 'tile_cave_wall_r',
  'tile_pool', 'tile_girder', 'tile_clockfloor', 'haz_crystal', 'haz_pipe', 'haz_pipe_riser', 'haz_lantern', 'haz_chain',
  'haz_tunnel', 'haz_ceiling', 'haz_column', 'pw_watch', 'fx_cogbit', 'fx_flake', 'decor_hole', 'bg_mist', 'bg_gearstar',
  'bg_clockface', 'bg_cave_far', 'bg_cave_mid', 'bg_roots', 'bg_lantern', 'bg_cog_l', 'bg_pipe_v', 'bg_crystal_l',
  'bg_stalagmite', 'bg_pipe_h', 'bg_baronpeek', 'bg_rail', 'bg_boiler', 'bg_crystal_s', 'fg_stalagmite'];

check('the 38 Level 2 sprites of WP-D are in the manifest', function () {
  const names = manifestD.map(function (m) { return m.name; });
  const absent = LEVEL2_D.filter(function (n) { return names.indexOf(n) === -1; });
  if (absent.length) return absent.join(', ');
  if (LEVEL2_D.length !== 38) return LEVEL2_D.length + ' names';
});

// ===== LEVEL 2: tiles, hazard skins and small pieces (LEVEL2 3.4, 3.5) =====

// The rows of LEVEL2 Appendix C for the tiles, hazard skins and small pieces: name, w, h, frame names, fps,
// anchor x, anchor y, and the Level 1 sprite whose row it copies (null where it copies none).
const LEVEL2_SMALL = [
  ['tile_cave_top', 16, 16, 'g0 g1', 0, 0, 0, 'tile_grass'],
  ['tile_cave_fill', 16, 16, 's0 s1', 0, 0, 0, 'tile_soil'],
  ['tile_cave_edge_l', 16, 16, 'edge', 0, 0, 0, 'tile_edge_l'],
  ['tile_cave_edge_r', 16, 16, 'edge', 0, 0, 0, 'tile_edge_r'],
  ['tile_cave_wall_l', 16, 16, 'wall', 0, 0, 0, 'tile_wall_l'],
  ['tile_cave_wall_r', 16, 16, 'wall', 0, 0, 0, 'tile_wall_r'],
  ['tile_pool', 16, 16, 'w0 w1', 3, 0, 0, 'tile_water'],
  ['tile_girder', 16, 16, 'plank', 0, 0, 0, 'tile_plank'],
  ['tile_clockfloor', 16, 16, 'a0 a1', 0, 0, 0, 'tile_arena'],
  ['haz_crystal', 16, 16, 'bramble', 0, 0, 16, 'haz_bramble'],
  ['haz_pipe', 16, 16, 'branch', 0, 0, 16, 'haz_branch'],
  ['haz_pipe_riser', 16, 16, 'trunk', 0, 0, 16, 'haz_trunk'],
  ['haz_lantern', 16, 24, 'hive', 0, 0, 24, 'haz_beehive'],
  ['haz_chain', 16, 16, 'rope', 0, 0, 16, 'haz_rope'],
  ['haz_tunnel', 48, 16, 'arch', 0, 0, 16, 'haz_arch'],
  ['haz_ceiling', 48, 16, 'canopy', 0, 0, 16, 'haz_canopy'],
  ['haz_column', 16, 16, 'trunk', 0, 0, 16, 'haz_trunk'],
  ['pw_watch', 16, 16, 'p0 p1', 4, 8, 16, 'pw_hourglass'],
  ['fx_cogbit', 8, 8, 'c0 c1', 0, 4, 4, 'fx_chunk'],
  ['fx_flake', 8, 8, 'f0 f1', 6, 4, 4, 'fx_feather'],
  ['decor_hole', 32, 32, 'hole', 0, 0, 32, null]
];

const CAVE_TILES = LEVEL2_SMALL.map(function (r) { return r[0]; }).filter(function (n) { return n.indexOf('tile_') === 0; });
const CAVE_HAZARDS = LEVEL2_SMALL.map(function (r) { return r[0]; }).filter(function (n) { return n.indexOf('haz_') === 0; });

// The colours of a band behind the play plane (LEVEL2 3.1, rule 2).
const BAND_COLORS = [C.PLUM, C.DEEP_BLUE, C.SHADOW, C.MAROON, C.DEEP_TEAL];

function colorNames(indices) {
  return indices.map(function (i) {
    return Object.keys(C).filter(function (k) { return C[k] === i; })[0] || String(i);
  }).join(', ');
}

// The colours of a sprite that are not in the allowed list.
function colorsOutside(name, allowed) {
  return colorsOf(name).filter(function (c) { return allowed.indexOf(c) === -1; });
}

function opaqueCols(row, w) {
  const cols = [];
  for (let x = 0; x < w; x++) if (row[x] >= 0) cols.push(x);
  return cols;
}

function mirrored(px) {
  return px.map(function (row) { return row.slice().reverse(); });
}

check('the Level 2 tiles, hazard skins and small pieces have the size, frame names, fps and anchor of LEVEL2 Appendix C', function () {
  const bad = [];
  LEVEL2_SMALL.forEach(function (r) {
    const d = TG.Sprites.get(r[0]);
    if (!d) { bad.push(r[0] + ' undefined'); return; }
    if (d.w !== r[1] || d.h !== r[2]) bad.push(r[0] + ' size ' + d.w + 'x' + d.h);
    if (d.names.join(' ') !== r[3]) bad.push(r[0] + ' names ' + d.names.join(' '));
    if (d.fps !== r[4]) bad.push(r[0] + ' fps ' + d.fps);
    if (d.anchor[0] !== r[5] || d.anchor[1] !== r[6]) bad.push(r[0] + ' anchor ' + d.anchor.join(','));
    if (d.frames.length !== r[3].split(' ').length) bad.push(r[0] + ' frames ' + d.frames.length);
  });
  if (LEVEL2_SMALL.length !== 21) bad.push(LEVEL2_SMALL.length + ' rows');
  if (bad.length) return bad.join(' | ');
});

check('each of them that takes the place of a Level 1 sprite has that sprite\'s size, frame names, fps and anchor (the skins rule)', function () {
  const bad = [];
  LEVEL2_SMALL.forEach(function (r) {
    if (!r[7]) return;
    const d = def(r[0]), o = def(r[7]);
    if (d.w !== o.w || d.h !== o.h) bad.push(r[0] + ' size');
    if (d.names.join(' ') !== o.names.join(' ')) bad.push(r[0] + ' names');
    if (d.fps !== o.fps) bad.push(r[0] + ' fps');
    if (d.anchor[0] !== o.anchor[0] || d.anchor[1] !== o.anchor[1]) bad.push(r[0] + ' anchor');
  });
  if (bad.length) return bad.join(', ');
});

// --- Tiles ---

check('the Level 2 tiles use only STONE, SHADOW, TEAL, AQUA, DEEP_TEAL, BRONZE, GOLD and PLUM, and so have no INK outline (LEVEL2 3.5)', function () {
  const allowed = [C.STONE, C.SHADOW, C.TEAL, C.AQUA, C.DEEP_TEAL, C.BRONZE, C.GOLD, C.PLUM];
  const bad = [];
  CAVE_TILES.forEach(function (name) {
    const out = colorsOutside(name, allowed);
    if (out.length) bad.push(name + ': ' + colorNames(out));
  });
  if (bad.length) return bad.join(' | ');
});

// Light (the lit rock or plate) and dark (the rock under it, the joints) at one pixel of a ground tile.
function isLight(c) {
  return c === C.STONE || c === C.TEAL || c === C.BRONZE || c === C.GOLD;
}

['tile_cave_top', 'tile_cave_fill', 'tile_clockfloor'].forEach(function (name) {
  check(name + ' is fully opaque, and light and dark agree across the join on at least 12 of its 16 rows', function () {
    const d = def(name);
    for (let f = 0; f < d.frames.length; f++) {
      const px = pixels(d, f);
      if (opaqueCount(px, d.w, d.h) !== d.w * d.h) return 'frame ' + f + ' has transparent pixels';
      // the renderer alternates the two variants by column, so the neighbour is the other frame
      const other = pixels(d, (f + 1) % d.frames.length);
      let same = 0;
      for (let y = 0; y < d.h; y++) if (isLight(px[y][d.w - 1]) === isLight(other[y][0])) same++;
      if (same < 12) return 'frame ' + f + ': only ' + same + ' rows agree with the next column';
    }
  });
});

check('tile_cave_top has a floor line of STONE and TEAL in its top three rows, and enough of both for the brass remap to make plate and rivets', function () {
  const d = def('tile_cave_top');
  for (let f = 0; f < d.frames.length; f++) {
    const px = pixels(d, f);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 16; x++) {
      if (px[y][x] !== C.STONE && px[y][x] !== C.TEAL) return 'frame ' + f + ' has another colour at ' + x + ',' + y;
    }
    if (countColors(px, 16, 16, [C.STONE]) < 100) return 'frame ' + f + ': too little STONE';
    if (countColors(px, 16, 16, [C.TEAL]) < 4) return 'frame ' + f + ': too little TEAL';
    // the lower rows darken towards tile_cave_fill
    if (countColors(px.slice(11), 16, 5, [C.SHADOW, C.PLUM]) < 70) return 'frame ' + f + ': the lower rows are not SHADOW';
  }
});

check('tile_cave_edge_l and tile_cave_wall_l are the floor tiles on the side away from the gap; the _r tiles are their mirror images', function () {
  const top = pixels(def('tile_cave_top'), 0), fill = pixels(def('tile_cave_fill'), 0);
  const el = pixels(def('tile_cave_edge_l'), 0), er = pixels(def('tile_cave_edge_r'), 0);
  const wl = pixels(def('tile_cave_wall_l'), 0), wr = pixels(def('tile_cave_wall_r'), 0);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
    if (el[y][x] !== top[y][x]) return 'tile_cave_edge_l differs from tile_cave_top g0 at ' + x + ',' + y;
    if (wl[y][x] !== fill[y][x]) return 'tile_cave_wall_l differs from tile_cave_fill s0 at ' + x + ',' + y;
  }
  if (JSON.stringify(er) !== JSON.stringify(mirrored(el))) return 'tile_cave_edge_r is not tile_cave_edge_l mirrored';
  if (JSON.stringify(wr) !== JSON.stringify(mirrored(wl))) return 'tile_cave_wall_r is not tile_cave_wall_l mirrored';
});

check('the rock lips show a light face to the gap: the gap-side column of tile_cave_edge_l is STONE or TEAL on at least 12 rows', function () {
  const el = pixels(def('tile_cave_edge_l'), 0);
  let light = 0;
  for (let y = 0; y < 16; y++) if (isLight(el[y][15])) light++;
  if (light < 12) return 'only ' + light + ' rows';
  const wl = pixels(def('tile_cave_wall_l'), 0);
  let face = 0;
  for (let y = 0; y < 16; y++) if (wl[y][15] === C.STONE || wl[y][15] === C.DEEP_TEAL) face++;
  if (face < 12) return 'tile_cave_wall_l: only ' + face + ' rows';
});

check('tile_pool animates, has an AQUA surface, and uses no colour that the brass or the crystal remap changes', function () {
  const d = def('tile_pool');
  if (JSON.stringify(pixels(d, 0)) === JSON.stringify(pixels(d, 1))) return 'the frames are identical';
  const out = colorsOutside('tile_pool', [C.AQUA, C.DEEP_TEAL, C.SHADOW]);
  if (out.length) return 'uses ' + colorNames(out);
  const changed = colorsOf('tile_pool').filter(function (c) { return TG.Remaps.brass[c] !== undefined || TG.Remaps.crystal[c] !== undefined; });
  if (changed.length) return 'remapped: ' + colorNames(changed);
  for (let f = 0; f < 2; f++) {
    const px = pixels(d, f);
    if (opaqueCount(px, 16, 16) !== 256) return 'frame ' + f + ' has transparent pixels';
    if (countColors([px[0]], 16, 1, [C.AQUA]) < 12) return 'frame ' + f + ': the top row is not an AQUA surface';
  }
});

check('tile_girder has a deck four rows deep that stays light under the crystal remap, is open below so that the pool or the dark shows under it, and has GOLD rivets on its truss', function () {
  const p = pixels(def('tile_girder'), 0);
  // the deck: tile_plank's is four rows deep, and so is the girder's under every remap it is drawn with. STONE
  // is BRONZE under brass and stays STONE under crystal; BRONZE would go DEEP_TEAL there, dark on the dark gap
  for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) {
    if (p[y][x] < 0) return 'hole at ' + x + ',' + y;
    if (p[y][x] !== C.GOLD && p[y][x] !== C.STONE) return 'the deck is not GOLD or STONE at ' + x + ',' + y;
  }
  if (colorsOf('tile_girder').indexOf(C.BRONZE) !== -1) return 'BRONZE, which the crystal remap turns DEEP_TEAL';
  if (TG.Remaps.brass[C.STONE] !== C.BRONZE || TG.Remaps.crystal[C.STONE] !== undefined) return 'the remaps do not treat STONE as LEVEL2 3.1 says';
  for (let y = 9; y < 16; y++) for (let x = 0; x < 16; x++) if (p[y][x] >= 0) return 'opaque pixel at ' + x + ',' + y;
  if (JSON.stringify(opaqueCols(p[4], 16)) === JSON.stringify(opaqueCols(p[0], 16))) return 'the truss has no openings';
  // it tiles: the opaque columns of each row are the same from either end
  for (let y = 0; y < 9; y++) for (let x = 0; x < 8; x++) if ((p[y][x] >= 0) !== (p[y][x + 8] >= 0)) return 'row ' + y + ' does not repeat every 8 px';
  // GOLD rivets below the deck line, which the crystal remap turns AQUA, so that the truss shows over the dark
  if (countColors(p.slice(1, 9), 16, 8, [C.GOLD]) < 4) return 'fewer than 4 GOLD rivets on the truss';
  if (TG.Remaps.crystal[C.GOLD] !== C.AQUA) return 'the crystal remap does not turn GOLD to AQUA';
});

check('the rail sleepers lie on a SHADOW bed in rows 2 and 3 of tile_clockfloor, which the brass remap leaves alone', function () {
  const rail = pixels(def('tile_rail'), 0);
  const t = TG.Remaps.brass;
  const map = function (c) { return t[c] !== undefined ? t[c] : c; };
  const d = def('tile_clockfloor');
  for (let f = 0; f < d.frames.length; f++) {
    const floor = pixels(d, f);
    // CLAY, the face of a sleeper, is close to BRONZE, so the brass may not show between the sleepers
    for (let y = 2; y < 4; y++) for (let x = 0; x < 16; x++) {
      if (map(floor[y][x]) !== C.SHADOW) return 'frame ' + f + ': the bed is not SHADOW at ' + x + ',' + y;
    }
    let distinct = 0;
    for (let y = 2; y < 4; y++) for (let x = 0; x < 16; x++) if (rail[y][x] >= 0 && map(rail[y][x]) !== C.SHADOW && map(rail[y][x]) !== C.BARK) distinct++;
    if (distinct < 8) return 'frame ' + f + ': only ' + distinct + ' sleeper pixels differ from the bed';
  }
});

check('tile_clockfloor is a dark plate with the brass inlaid: under a third of each plate is as light as BRONZE, a0 has a cog round a GOLD pin and a1 has none, so the arena floor is darker than the Gear Hall\'s', function () {
  const d = def('tile_clockfloor');
  const a0 = pixels(d, 0), a1 = pixels(d, 1);
  // the arena is lit by the clock face (LEVEL2 3.2), and the rolling gear, the mound and the ground marker stand
  // on this floor in GOLD, BRONZE and CORAL: the plate below the rail, rows 4 to 15, is 192 pixels
  const light = [0, 0];
  [a0, a1].forEach(function (px, f) {
    for (let y = 4; y < 16; y++) for (let x = 0; x < 16; x++) if (isLight(px[y][x])) light[f]++;
  });
  if (light[0] > 64 || light[1] > 64) return 'light pixels below the rail: ' + light.join(' and ') + ' of 192';
  if (light[0] + light[1] > 96) return 'the two plates together are ' + (light[0] + light[1]) + ' of 384 light';
  // for comparison: the Gear Hall's floor is tile_cave_top under brass, where STONE and TEAL are BRONZE and GOLD
  const hall = pixels(def('tile_cave_top'), 0);
  let hallLight = 0;
  for (let y = 4; y < 16; y++) for (let x = 0; x < 16; x++) if (isLight(hall[y][x])) hallLight++;
  if (hallLight <= light[0]) return 'tile_cave_top is no lighter (' + hallLight + ' against ' + light[0] + ')';
  for (let f = 0; f < 2; f++) {
    const px = f === 0 ? a0 : a1;
    // the lit edge of the plate: BRONZE with a GOLD rivet at either end, which meet across the join
    for (let x = 1; x < 15; x++) if (px[4][x] !== C.BRONZE) return 'frame ' + f + ': row 4 is not a BRONZE edge at column ' + x;
    if (px[4][0] !== C.GOLD || px[4][15] !== C.GOLD) return 'frame ' + f + ': no GOLD rivets at the ends of row 4';
    // the inlay keeps clear of the edge above, of the fill below and of the next plate
    for (let x = 0; x < 16; x++) if (px[5][x] !== C.SHADOW) return 'frame ' + f + ': the inlay touches the edge at column ' + x;
    for (let x = 0; x < 16; x++) if (px[15][x] !== C.SHADOW) return 'frame ' + f + ': the inlay reaches the last row at column ' + x;
    for (let y = 5; y < 15; y++) if (px[y][0] !== C.SHADOW || px[y][15] !== C.SHADOW) return 'frame ' + f + ': the inlay reaches the join in row ' + y;
  }
  // the cog of a0: BRONZE, 9 px across and the same from all four sides, round a GOLD pin
  let cog = 0;
  for (let y = 6; y < 15; y++) for (let x = 3; x < 12; x++) {
    if (a0[y][x] === C.BRONZE) cog++;
    if (a0[y][x] !== a0[y][14 - x] || a0[y][x] !== a0[20 - y][x] || a0[y][x] !== a0[x + 3][y - 3]) return 'the cog of a0 is not symmetric at ' + x + ',' + y;
  }
  if (cog < 30) return 'the cog of a0 has ' + cog + ' BRONZE pixels';
  if (a0[10][7] !== C.GOLD) return 'no GOLD pin in the cog of a0';
  // a1: a stud and nothing else, so that a cog comes every 32 px
  let stud = 0;
  for (let y = 5; y < 15; y++) for (let x = 0; x < 16; x++) if (isLight(a1[y][x])) stud++;
  if (stud < 1 || stud > 8) return 'a1 has ' + stud + ' light pixels between its edge and its last row';
});

// --- Hazard skins ---

check('the Level 2 hazard skins use only AQUA, CORAL, BRONZE, GOLD, CREAM, SHADOW, PLUM and STONE besides INK (LEVEL2 3.5)', function () {
  const allowed = [C.INK, C.AQUA, C.CORAL, C.BRONZE, C.GOLD, C.CREAM, C.SHADOW, C.PLUM, C.STONE];
  const bad = [];
  CAVE_HAZARDS.forEach(function (name) {
    const out = colorsOutside(name, allowed);
    if (out.length) bad.push(name + ': ' + colorNames(out));
  });
  if (bad.length) return bad.join(' | ');
});

['haz_crystal', 'haz_pipe', 'haz_lantern', 'haz_tunnel'].forEach(function (name) {
  check(name + ' contains CORAL pixels (the hazard accent)', function () {
    if (colorsOf(name).indexOf(C.CORAL) === -1) return 'no CORAL';
  });
});

check('the CORAL accent of each Level 2 hazard is at least 12 pixels, about what the Level 1 hazards carry', function () {
  const bad = [];
  ['haz_crystal', 'haz_pipe', 'haz_lantern', 'haz_tunnel'].forEach(function (name) {
    const d = def(name);
    const n = countColors(pixels(d, 0), d.w, d.h, [C.CORAL]);
    if (n < 12) bad.push(name + ' has ' + n);
  });
  // for comparison: the smallest accent of Level 1 is the four berries of the branch
  const branch = def('haz_branch');
  if (countColors(pixels(branch, 0), branch.w, branch.h, [C.CORAL]) < 12) bad.push('haz_branch is no longer the measure');
  if (bad.length) return bad.join(', ');
});

check('each hazard skin shows a colour that is not a band colour: AQUA on the spikes, BRONZE on the pipe, GOLD and CREAM on the lantern, STONE on the tunnel (LEVEL2 3.1, rule 2)', function () {
  // the least number of pixels of that colour; the pipe's outlet is BRONZE, GOLD and a CORAL mouth
  const want = [
    ['haz_crystal', C.AQUA, 30], ['haz_pipe', C.BRONZE, 40], ['haz_pipe_riser', C.BRONZE, 50],
    ['haz_lantern', C.GOLD, 40], ['haz_lantern', C.CREAM, 60], ['haz_chain', C.STONE, 24],
    ['haz_tunnel', C.STONE, 250], ['haz_column', C.STONE, 90]
  ];
  const bad = [];
  want.forEach(function (w) {
    const d = def(w[0]);
    const n = countColors(pixels(d, 0), d.w, d.h, [w[1]]);
    if (n < w[2]) bad.push(w[0] + ' has ' + n + ' pixels of ' + colorNames([w[1]]));
  });
  // and no band colour is the largest colour of a skin that is drawn without the remap
  CAVE_HAZARDS.forEach(function (name) {
    if (name === 'haz_ceiling') return;
    const d = def(name), px = pixels(d, 0);
    const count = {};
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (px[y][x] > 0) count[px[y][x]] = (count[px[y][x]] || 0) + 1;
    const top = Number(Object.keys(count).sort(function (a, b) { return count[b] - count[a]; })[0]);
    if (BAND_COLORS.indexOf(top) !== -1) bad.push(name + ' is mostly ' + colorNames([top]));
  });
  if (bad.length) return bad.join(' | ');
});

check('the spikes of haz_crystal fill the middle 8 columns of its lower 8 px, where its collision box is, and its three shards end in CORAL points', function () {
  const px = pixels(def('haz_crystal'), 0);
  let aqua = 0;
  for (let y = 8; y < 16; y++) for (let x = 4; x < 12; x++) {
    if (px[y][x] < 0) return 'transparent pixel at ' + x + ',' + y;
    if (px[y][x] === C.AQUA) aqua++;
  }
  if (aqua < 16) return 'only ' + aqua + ' AQUA pixels in the box';
  // the tips are CORAL: the highest coloured pixel of the sprite is CORAL, and it is one pixel, a point
  for (let y = 0; y < 16; y++) {
    const colored = px[y].filter(function (c) { return c > 0; });
    if (!colored.length) continue;
    if (colored.some(function (c) { return c !== C.CORAL; })) return 'the top of the tallest spike is not CORAL';
    if (colored.length !== 1) return 'the tallest spike ends ' + colored.length + ' px wide, not in a point';
    break;
  }
  // three shards: the row above the collision box is cut by clear sky in two places
  const runs = [];
  opaqueCols(px[7], 16).forEach(function (x, i, a) { if (i === 0 || x !== a[i - 1] + 1) runs.push(x); });
  if (runs.length !== 3) return runs.length + ' shards stand above the box in row 7';
  // each of the three carries its share of the accent, so that at 1x the warning is three tips and not one dot
  const shards = [[0, 4], [5, 10], [11, 15]];
  for (let s = 0; s < 3; s++) {
    let coral = 0;
    for (let y = 0; y < 16; y++) for (let x = shards[s][0]; x <= shards[s][1]; x++) if (px[y][x] === C.CORAL) coral++;
    if (coral < 6) return 'shard ' + (s + 1) + ' has ' + coral + ' CORAL pixels';
  }
  // and the top is mostly clear: the cluster is 8 px tall with a spike above it
  let upper = 0;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) if (px[y][x] >= 0) upper++;
  if (upper > 8) return upper + ' opaque pixels in the top 4 rows';
});

check('the Level 2 duck hazards hang from above: their top rows meet the riser, the chain or the columns, which tile upwards', function () {
  const pipe = pixels(def('haz_pipe'), 0), riser = pixels(def('haz_pipe_riser'), 0);
  const lantern = pixels(def('haz_lantern'), 0), chain = pixels(def('haz_chain'), 0);
  const tunnel = pixels(def('haz_tunnel'), 0), column = pixels(def('haz_column'), 0);
  const rBottom = opaqueCols(riser[15], 16), cBottom = opaqueCols(chain[15], 16), kBottom = opaqueCols(column[15], 16);
  if (JSON.stringify(opaqueCols(pipe[0], 16)) !== JSON.stringify(rBottom)) return 'haz_pipe row 0 does not meet the riser';
  if (JSON.stringify(pipe[0]) !== JSON.stringify(riser[15])) return 'haz_pipe row 0 is not the riser\'s last row';
  if (JSON.stringify(opaqueCols(lantern[0], 16)) !== JSON.stringify(cBottom)) return 'haz_lantern row 0 does not meet the chain';
  const tTop = opaqueCols(tunnel[0], 48);
  const left = tTop.filter(function (x) { return x < 16; }), right = tTop.filter(function (x) { return x >= 32; }).map(function (x) { return x - 32; });
  if (JSON.stringify(left) !== JSON.stringify(kBottom) || JSON.stringify(right) !== JSON.stringify(kBottom)) return 'haz_tunnel row 0 does not meet the columns';
  if (tTop.some(function (x) { return x >= 16 && x < 32; })) return 'haz_tunnel row 0 is not clear between the columns';
  if (JSON.stringify(opaqueCols(riser[0], 16)) !== JSON.stringify(rBottom)) return 'haz_pipe_riser does not tile vertically';
  if (JSON.stringify(opaqueCols(chain[0], 16)) !== JSON.stringify(cBottom)) return 'haz_chain does not tile vertically';
  if (JSON.stringify(opaqueCols(column[0], 16)) !== JSON.stringify(kBottom)) return 'haz_column does not tile vertically';
  // the feet of the columns on the tunnel are the column's last row, pixel for pixel, in its first three rows
  for (let y = 0; y < 3; y++) for (let x = kBottom[0]; x <= kBottom[kBottom.length - 1]; x++) {
    if (tunnel[y][x] !== column[15][x] || tunnel[y][x + 32] !== column[15][x]) return 'haz_tunnel does not continue the column at ' + x + ',' + y;
  }
  // the riser stands where haz_trunk stands, and the columns are centred on the same line, so that haz_ceiling
  // covers the tops of both
  const trunk = opaqueCols(pixels(def('haz_trunk'), 0)[15], 16);
  if (JSON.stringify(rBottom) !== JSON.stringify(trunk)) return 'the riser is not on the columns of haz_trunk';
  if (kBottom[0] + kBottom[kBottom.length - 1] !== trunk[0] + trunk[trunk.length - 1]) return 'the column is not centred on haz_trunk';
});

check('haz_column is a rock column and not a pole: 12 px wide where it meets the tunnel, never narrower than 11, half as wide again as the riser, and its outline is not straight', function () {
  const column = pixels(def('haz_column'), 0), riser = pixels(def('haz_pipe_riser'), 0);
  if (opaqueCols(column[15], 16).length !== 12) return 'its last row is ' + opaqueCols(column[15], 16).length + ' px wide';
  // the riser's own width is that of its pipe, away from the flange
  const pipeWidth = opaqueCols(riser[0], 16).length;
  const lefts = {}, rights = {};
  for (let y = 0; y < 16; y++) {
    const cols = opaqueCols(column[y], 16);
    if (cols.length < 11) return 'row ' + y + ' is ' + cols.length + ' px wide';
    if (cols.length < pipeWidth * 1.5 - 1) return 'row ' + y + ' is not half as wide again as the riser';
    if (cols[cols.length - 1] - cols[0] + 1 !== cols.length) return 'row ' + y + ' has a hole';
    // the two columns stand 32 px apart and each is 16 wide: a pixel in column 0 or 15 would leave no outline
    if (cols[0] < 1 || cols[cols.length - 1] > 14) return 'row ' + y + ' reaches the edge of the frame';
    lefts[cols[0]] = true; rights[cols[cols.length - 1]] = true;
  }
  if (Object.keys(lefts).length < 2 || Object.keys(rights).length < 2) return 'an edge of the column is a straight line';
});

check('the shelf of haz_tunnel is rough rock, not coursed blocks: no row between its top and its underside is more than a third SHADOW, and its top is not level', function () {
  const tunnel = pixels(def('haz_tunnel'), 0);
  for (let y = 3; y < 10; y++) {
    let shadow = 0;
    for (let x = 0; x < 48; x++) if (tunnel[y][x] === C.SHADOW) shadow++;
    if (shadow > 16) return 'row ' + y + ' has ' + shadow + ' SHADOW pixels, a joint from end to end';
  }
  // the top between the columns: the first opaque row differs from column to column
  const tops = {};
  for (let x = 14; x < 34; x++) tops[silhouetteTop(tunnel, 16, x)] = true;
  if (Object.keys(tops).length < 3) return 'the top between the columns has ' + Object.keys(tops).length + ' heights';
});

check('the underside of each duck hazard reaches the last two rows of its frame, so that what is drawn is what has to be ducked', function () {
  const bad = [];
  ['haz_pipe', 'haz_lantern', 'haz_tunnel'].forEach(function (name) {
    const d = def(name), px = pixels(d, 0);
    if (opaqueCols(px[d.h - 1], d.w).length + opaqueCols(px[d.h - 2], d.w).length === 0) bad.push(name);
  });
  if (bad.length) return bad.join(', ');
});

check('haz_ceiling is SHADOW and PLUM only inside its outline, the crystal remap turns its PLUM to the band colour, and it covers the tops of a riser and of the tunnel\'s columns', function () {
  const out = colorsOutside('haz_ceiling', [C.INK, C.SHADOW, C.PLUM]);
  if (out.length) return 'uses ' + colorNames(out);
  if (colorsOf('haz_ceiling').indexOf(C.PLUM) === -1) return 'no PLUM';
  if (TG.Remaps.crystal[C.PLUM] !== C.DEEP_BLUE || TG.Remaps.brass[C.PLUM] !== undefined || TG.Remaps.brass[C.SHADOW] !== undefined) return 'the remaps do not treat it as LEVEL2 3.1 says';
  const px = pixels(def('haz_ceiling'), 0);
  // the renderer centres it on the riser (columns 20 to 27) and on the tunnel, whose columns reach from column 1
  // to 14 and from 33 to 46 at their widest: the rim is closed over all of them down to row 11, so that no
  // edge of a column shows beside it
  const column = pixels(def('haz_column'), 0);
  let lo = 15, hi = 0;
  for (let y = 0; y < 16; y++) { const cols = opaqueCols(column[y], 16); lo = Math.min(lo, cols[0]); hi = Math.max(hi, cols[cols.length - 1]); }
  const spans = [[20, 27], [lo, hi], [32 + lo, 32 + hi]];
  for (let s = 0; s < spans.length; s++) {
    for (let y = 0; y < 12; y++) for (let x = spans[s][0]; x <= spans[s][1]; x++) {
      if (px[y][x] < 0) return 'open at ' + x + ',' + y;
    }
  }
});

check('haz_lantern on haz_chain cannot be taken for Dangle on its thread: a GOLD frame, no LILAC or VIOLET, and a chain 4 px wide or more on every row', function () {
  const used = colorsOf('haz_lantern').concat(colorsOf('haz_chain'));
  if (used.indexOf(C.LILAC) !== -1 || used.indexOf(C.VIOLET) !== -1) return 'uses LILAC or VIOLET';
  const chain = pixels(def('haz_chain'), 0);
  for (let y = 0; y < 16; y++) if (opaqueCols(chain[y], 16).length < 4) return 'the chain is ' + opaqueCols(chain[y], 16).length + ' px wide in row ' + y;
  // the frame: GOLD or BRONZE directly inside the outline on both sides of the glass
  const px = pixels(def('haz_lantern'), 0);
  let framed = 0;
  for (let y = 0; y < 24; y++) {
    const cols = opaqueCols(px[y], 16);
    if (cols.length < 10) continue;
    const a = px[y][cols[1]], b = px[y][cols[cols.length - 2]];
    if ((a === C.GOLD || a === C.BRONZE) && (b === C.GOLD || b === C.BRONZE)) framed++;
  }
  if (framed < 12) return 'only ' + framed + ' rows have the frame on both sides';
});

// --- Power-up icon, effects, decor ---

check('pw_watch is GOLD, BRONZE, WHITE and CREAM with INK hands, and only a hand moves between its frames', function () {
  const out = colorsOutside('pw_watch', [C.INK, C.GOLD, C.BRONZE, C.WHITE, C.CREAM]);
  if (out.length) return 'uses ' + colorNames(out);
  const d = def('pw_watch');
  const a = pixels(d, 0), b = pixels(d, 1);
  let diff = 0;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (a[y][x] === b[y][x]) continue;
    diff++;
    const pair = [a[y][x], b[y][x]].sort(function (p, q) { return p - q; });
    if (pair[0] !== C.INK || pair[1] !== C.WHITE) return 'a pixel other than a hand on the face changes at ' + x + ',' + y;
  }
  if (diff < 2 || diff > 8) return diff + ' pixels differ';
  for (let f = 0; f < 2; f++) {
    const px = pixels(d, f);
    if (countColors(px, 16, 16, [C.WHITE]) < 20) return 'frame ' + f + ' has no WHITE face';
    if (countColors(px, 16, 16, [C.GOLD]) < 15) return 'frame ' + f + ' has no GOLD case';
  }
});

check('fx_cogbit is BRONZE and GOLD, fx_flake is WHITE and HAZE, decor_hole is BARK, SOIL and SAND (LEVEL2 3.5)', function () {
  const bad = [];
  [['fx_cogbit', [C.BRONZE, C.GOLD]], ['fx_flake', [C.WHITE, C.HAZE]], ['decor_hole', [C.BARK, C.SOIL, C.SAND]]].forEach(function (w) {
    const out = colorsOutside(w[0], w[1].concat([C.INK]));
    if (out.length) bad.push(w[0] + ' uses ' + colorNames(out));
    const absent = w[1].filter(function (c) { return colorsOf(w[0]).indexOf(c) === -1; });
    if (absent.length) bad.push(w[0] + ' has no ' + colorNames(absent));
  });
  if (bad.length) return bad.join(' | ');
});

check('fx_flake is a star of six arms, 5 px across with a WHITE centre and HAZE tips, and f1 is f0 turned a quarter', function () {
  const d = def('fx_flake');
  const a = pixels(d, 0), b = pixels(d, 1);
  // the coloured pixels of a frame, as a 5 x 5 grid from their top-left corner
  function grid(px) {
    let x0 = 8, y0 = 8, x1 = -1, y1 = -1;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (px[y][x] > 0) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    if (x1 - x0 !== 4 || y1 - y0 !== 4) return null;
    const g = [];
    for (let y = 0; y < 5; y++) { g.push([]); for (let x = 0; x < 5; x++) g[y].push(px[y0 + y][x0 + x] > 0 ? px[y0 + y][x0 + x] : 0); }
    return g;
  }
  const ga = grid(a), gb = grid(b);
  if (!ga || !gb) return 'a frame is not 5 px across';
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    if (ga[y][x] !== ga[y][4 - x] || ga[y][x] !== ga[4 - y][x]) return 'f0 is not symmetric at ' + x + ',' + y;
    if (gb[y][x] !== ga[x][y]) return 'f1 is not f0 turned a quarter at ' + x + ',' + y;
  }
  if (ga[2][2] !== C.WHITE) return 'the centre is not WHITE';
  // six arms: two along the long axis and four between
  let tips = 0;
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) if (ga[y][x] === C.HAZE) tips++;
  if (tips !== 6) return tips + ' HAZE tips';
});

check('decor_hole: the rope runs off the top of the frame and hangs: it ends in the air, 3 px or more above the heap of earth, which lies on the ground line', function () {
  const px = pixels(def('decor_hole'), 0);
  const top = opaqueCols(px[0], 32);
  if (top.length < 2 || top.length > 6) return 'row 0 has ' + top.length + ' opaque pixels';
  // the heap begins at the first row that is 10 px wide or more
  let heap = 0;
  while (heap < 32 && opaqueCols(px[heap], 32).length < 10) heap++;
  if (heap < 24 || heap > 28) return 'the heap begins in row ' + heap;
  // the rope is one strand, straight down from the top: its pixels lie within a pixel of the columns of row 0
  // (the knot is 1 px wider on each side). It is unbroken to its tip, and the tip is clear of the heap, so that
  // it reads as a rope hanging down the hole and not as a stake standing in the earth
  const inLine = function (x) { return x >= top[0] - 1 && x <= top[top.length - 1] + 1; };
  let tip = -1;
  const crumbs = [];
  for (let y = 0; y < heap; y++) {
    const cols = opaqueCols(px[y], 32);
    const rope = cols.filter(inLine);
    cols.filter(function (x) { return !inLine(x); }).forEach(function (x) { crumbs.push([x, y]); });
    if (rope.length && tip !== y - 1) return 'the rope is broken above row ' + y;
    if (rope.length) tip = y;
  }
  if (tip < 16) return 'the rope ends in row ' + tip + ', less than half way down';
  if (heap - 1 - tip < 3) return 'the tip of the rope is ' + (heap - 1 - tip) + ' px above the heap';
  // it is lit from row 4 down (SAND in most rows) and dark where it leaves the frame (no SAND in rows 0 to 3)
  let lit = 0;
  for (let y = 0; y <= tip; y++) {
    const sand = px[y].some(function (c, x) { return inLine(x) && c === C.SAND; });
    if (y < 4 && sand) return 'SAND in row ' + y + ', where the rope fades into the dark';
    if (y >= 4 && sand) lit++;
  }
  if (lit < 10) return 'only ' + lit + ' rows of the rope are SAND';
  // crumbs of earth still falling: single SOIL or SAND pixels, three at most, so that the outline rule's
  // allowance of 5% covers them
  if (crumbs.length > 3) return crumbs.length + ' pixels beside the rope';
  for (let i = 0; i < crumbs.length; i++) {
    const x = crumbs[i][0], y = crumbs[i][1];
    if (px[y][x] !== C.SOIL && px[y][x] !== C.SAND) return 'the crumb at ' + x + ',' + y + ' is not SOIL or SAND';
    if (px[y][x - 1] >= 0 || px[y][x + 1] >= 0 || px[y - 1][x] >= 0 || px[y + 1][x] >= 0) return 'the crumb at ' + x + ',' + y + ' is not a single pixel';
  }
  if (opaqueCols(px[31], 32).length < 28) return 'the heap is ' + opaqueCols(px[31], 32).length + ' px wide on the ground';
  if (countColors(px.slice(24), 32, 8, [C.SOIL]) < 60) return 'the heap is not SOIL';
});

// ===== LEVEL 2: the cavern backdrop (LEVEL2 3.3, Appendix C) =====

// The backdrop `cavern`: its four palettes, its layers and its pieces. Rule 1 of LEVEL2 3.1 is checked on the
// pixel data: the band where the word plates travel, y 24 to 150, holds one flat colour and SHADOW shapes, with
// the four exceptions the plan names and the rock rims that hint at the roof in sections 2 and 3.

const CAV = TG.Backdrops.cavern;
const BAND_BOTTOM = 150;
// The one sprite of the backdrop that is not a backdrop piece: the rock rim that the hazards hang from, placed
// in the mid layer as a hint of the roof in sections 2 and 3, where the roots of section 1 do not reach.
const ROOF_RIM = 'haz_ceiling';
const HAZARD_RIM_BOTTOM = 36;      // CANOPY_BOTTOM of js/render.js: where the rim of a pipe or the tunnel ends

// The 17 pieces of the backdrop: name, w, h, frame names, fps, anchor x, anchor y (the rows of LEVEL2 Appendix C),
// and the colours of the piece. The colours are those of LEVEL2 3.3 with what the art pass changed (CONTRACT 6.5):
// BRONZE for the light on bg_cave_mid and for the lower post of bg_lantern, DEEP_TEAL for the shaded face of
// bg_crystal_s, BRONZE and SHADOW for the pipe mouth of bg_baronpeek, and no GOLD on bg_pipe_h.
const CAVERN_PIECES = [
  ['bg_mist', 64, 16, 'm0 m1', 2, 0, 16, ['DEEP_TEAL']],
  ['bg_gearstar', 8, 8, 's0 s1', 2, 0, 8, ['BRONZE', 'SHADOW']],
  ['bg_clockface', 48, 48, 'c0 c1', 1, 0, 48, ['CREAM', 'GOLD', 'BRONZE', 'INK']],
  ['bg_cave_far', 128, 48, 'w0 w1', 2, 0, 48, ['SHADOW', 'GOLD']],
  ['bg_cave_mid', 128, 56, 'wall', 0, 0, 56, ['SHADOW', 'BRONZE']],
  ['bg_roots', 32, 24, 'roots', 0, 0, 24, ['SHADOW']],
  ['bg_lantern', 16, 24, 'l0 l1', 3, 0, 24, ['SHADOW', 'ORANGE', 'GOLD', 'CREAM', 'BRONZE']],
  ['bg_cog_l', 48, 48, 'c0 c1 c2 c3', 4, 0, 48, ['SHADOW', 'BRONZE', 'GOLD']],
  ['bg_pipe_v', 16, 48, 'pipe', 0, 0, 48, ['SHADOW', 'BRONZE', 'GOLD']],
  ['bg_crystal_l', 32, 24, 'crystal', 0, 0, 24, ['AQUA', 'TEAL', 'DEEP_TEAL']],
  ['bg_stalagmite', 16, 24, 'spike', 0, 0, 24, ['SHADOW', 'STONE']],
  ['bg_pipe_h', 32, 16, 'pipe', 0, 0, 16, ['SHADOW', 'BRONZE']],
  ['bg_baronpeek', 16, 16, 'out in', 1, 0, 16, ['SOIL', 'GOLD', 'PINK', 'WHITE', 'BRONZE', 'SHADOW']],
  ['bg_rail', 32, 8, 'rail', 0, 0, 8, ['SILVER', 'SHADOW']],
  ['bg_boiler', 32, 32, 'b0 b1', 2, 0, 32, ['SHADOW', 'BRONZE', 'GOLD', 'CREAM']],
  ['bg_crystal_s', 16, 16, 'crystal', 0, 0, 16, ['AQUA', 'TEAL', 'DEEP_TEAL']],
  ['fg_stalagmite', 16, 8, 't0 t1', 0, 0, 8, ['SHADOW', 'STONE']]
];

// The colours brighter than the bands that the machines of the two halls are drawn with.
const BRIGHT = [C.BRONZE, C.GOLD, C.CREAM];

// The arch of bg_cave_mid as { left, right } columns: the open run of its lowest rows that has rock on both sides
// and is narrower than a bay.
function archOfMid() {
  const d = def('bg_cave_mid');
  const row = pixels(d, 0)[d.h - 6];
  for (let x = 1; x < d.w - 1; x++) {
    if (row[x] >= 0 || row[x - 1] < 0) continue;
    let end = x;
    while (end + 1 < d.w && row[end + 1] < 0) end++;
    if (end + 1 < d.w && end - x + 1 >= 12 && end - x + 1 <= 24) return { left: x, right: end };
    x = end;
  }
  return null;
}

// Every item of the layers that are drawn behind the play plane, as { layer, sprite, x, y, sections }.
function cavernItems() {
  const items = [];
  CAV.layers.forEach(function (l) {
    if (l.front) return;
    l.items.forEach(function (it) { items.push({ layer: l.id, sprite: it.sprite, x: it.x, y: it.y, sections: it.sections }); });
  });
  return items;
}

// The sections (0 to 2, 3 = arena) in which a sprite appears in the backdrop; null for a piece with no limit.
function cavernSections(sprite) {
  let all = false;
  const set = {};
  CAV.layers.forEach(function (l) {
    l.items.forEach(function (it) {
      if (it.sprite !== sprite) return;
      if (!it.sections) all = true;
      else it.sections.forEach(function (s) { set[s] = true; });
    });
  });
  return all ? null : Object.keys(set).map(Number).sort();
}

check('the pieces of the cavern backdrop have the size, frame names, fps and anchor of LEVEL2 Appendix C', function () {
  const bad = [];
  CAVERN_PIECES.forEach(function (r) {
    const d = TG.Sprites.get(r[0]);
    if (!d) { bad.push(r[0] + ' undefined'); return; }
    if (d.w !== r[1] || d.h !== r[2]) bad.push(r[0] + ' size ' + d.w + 'x' + d.h);
    if (d.names.join(' ') !== r[3]) bad.push(r[0] + ' names ' + d.names.join(' '));
    if (d.fps !== r[4]) bad.push(r[0] + ' fps ' + d.fps);
    if (d.anchor[0] !== r[5] || d.anchor[1] !== r[6]) bad.push(r[0] + ' anchor ' + d.anchor.join(','));
    if (d.frames.length !== r[3].split(' ').length) bad.push(r[0] + ' frames ' + d.frames.length);
  });
  const listed = CAVERN_PIECES.map(function (r) { return r[0]; });
  const pieces = LEVEL2_D.filter(function (n) { return n.indexOf('bg_') === 0 || n.indexOf('fg_') === 0; });
  pieces.forEach(function (n) { if (listed.indexOf(n) === -1) bad.push(n + ' is not in the table'); });
  if (listed.length !== pieces.length) bad.push(listed.length + ' rows for ' + pieces.length + ' pieces');
  if (bad.length) return bad.join(' | ');
});

check('each piece of the cavern backdrop uses the colours of its list and no other (a stray pixel would be recoloured by one section\'s remap only)', function () {
  const bad = [];
  CAVERN_PIECES.forEach(function (r) {
    if (!TG.Sprites.has(r[0])) return;
    const allowed = r[7].map(function (k) { return C[k]; });
    const used = colorsOf(r[0]);
    const stray = used.filter(function (c) { return allowed.indexOf(c) === -1; });
    const unused = allowed.filter(function (c) { return used.indexOf(c) === -1; });
    if (stray.length) bad.push(r[0] + ' also uses ' + colorNames(stray));
    if (unused.length) bad.push(r[0] + ' has no ' + colorNames(unused));
  });
  if (bad.length) return bad.join(' | ');
});

check('TG.Backdrops.cavern has the palettes lantern, brass, crystal and clock', function () {
  if (!CAV) return 'no cavern backdrop';
  const names = Object.keys(CAV.palettes).sort();
  if (JSON.stringify(names) !== JSON.stringify(['brass', 'clock', 'crystal', 'lantern'])) return names.join(', ');
});

check('cavern: in every palette the first band is the plate band, one flat colour from y 0 to 150, and the bands cover y 0 to 184', function () {
  const bad = [];
  Object.keys(CAV.palettes).forEach(function (p) {
    const pal = CAV.palettes[p];
    const first = pal.sky[0];
    if (first.y !== 0 || first.h !== BAND_BOTTOM) bad.push(p + ': first band y ' + first.y + ' h ' + first.h);
    if (first.dither !== undefined) bad.push(p + ': the plate band is dithered');
    let y = 0;
    pal.sky.forEach(function (b) {
      if (b.y !== y) bad.push(p + ': band at ' + b.y + ' expected ' + y);
      if (!(b.color >= 0 && b.color <= 31)) bad.push(p + ': band colour ' + b.color);
      if (b.dither !== undefined && !(b.dither >= 0 && b.dither <= 31)) bad.push(p + ': dither ' + b.dither);
      y = b.y + b.h;
    });
    if (y !== TG.C.GROUND_Y) bad.push(p + ': bands end at ' + y);
  });
  if (bad.length) return bad.join(' | ');
});

check('cavern: the bands, the remaps and the Hourglass colours are those of LEVEL2 3.1 and Appendix C', function () {
  const want = {
    lantern: { band: C.PLUM, floor: [C.PLUM, C.SHADOW], remap: null, slow: C.DEEP_BLUE },
    brass: { band: C.PLUM, floor: [C.PLUM, C.SHADOW], remap: 'brass', slow: C.DEEP_BLUE },
    crystal: { band: C.DEEP_BLUE, floor: [C.DEEP_BLUE, C.DEEP_TEAL], remap: 'crystal', slow: C.PLUM },
    clock: { band: C.PLUM, floor: [C.MAROON, C.PLUM], remap: 'brass', slow: C.DEEP_BLUE }
  };
  const bad = [];
  Object.keys(want).forEach(function (p) {
    const pal = CAV.palettes[p], w = want[p];
    if (pal.sky.length !== 2) { bad.push(p + ': ' + pal.sky.length + ' bands'); return; }
    if (pal.sky[0].color !== w.band) bad.push(p + ': band ' + pal.sky[0].color);
    if (pal.sky[1].color !== w.floor[0] || pal.sky[1].dither !== w.floor[1]) bad.push(p + ': floor band ' + pal.sky[1].color + ' dithered ' + pal.sky[1].dither);
    if (pal.sky[1].y !== BAND_BOTTOM || pal.sky[1].h !== TG.C.GROUND_Y - BAND_BOTTOM) bad.push(p + ': floor band y ' + pal.sky[1].y + ' h ' + pal.sky[1].h);
    if (pal.remap !== w.remap) bad.push(p + ': remap ' + pal.remap);
    if (pal.remap !== null && !TG.Remaps[pal.remap]) bad.push(p + ': remap ' + pal.remap + ' is not defined');
    if (pal.slowSky !== w.slow) bad.push(p + ': slowSky ' + pal.slowSky);
    if (pal.slowSky === pal.sky[0].color) bad.push(p + ': slowSky equals the band colour, so the Hourglass would not show');
  });
  if (bad.length) return bad.join(' | ');
});

check('cavern: the clock palette changes its band once per boss phase, never to flat INK, and only it has phases, stars and a moon', function () {
  const k = CAV.palettes.clock;
  if (JSON.stringify(k.phases) !== JSON.stringify({ 2: { color: C.PLUM, dither: C.MAROON }, 3: { color: C.INK, dither: C.PLUM } })) return 'phases ' + JSON.stringify(k.phases);
  const bad = [];
  Object.keys(k.phases).forEach(function (n) {
    const st = k.phases[n];
    if (st.dither === undefined || st.dither === st.color) bad.push('phase ' + n + ' is a flat colour');
    if (st.color === k.slowSky && st.dither === undefined) bad.push('phase ' + n + ' equals the Hourglass colour');
  });
  ['lantern', 'brass', 'crystal'].forEach(function (p) {
    const pal = CAV.palettes[p];
    if (pal.phases || pal.stars || pal.moon || pal.starSprite || pal.moonSprite) bad.push(p + ' has arena keys');
  });
  if (bad.length) return bad.join(' | ');
});

check('cavern: the clock face is the moon of the clock palette, at x 328 to 376 and y 36 to 84, and the gear stars keep clear of it', function () {
  const k = CAV.palettes.clock;
  if (k.starSprite !== 'bg_gearstar' || k.moonSprite !== 'bg_clockface') return 'sprites ' + k.starSprite + ', ' + k.moonSprite;
  const face = def('bg_clockface'), star = def('bg_gearstar');
  if (!k.moon || k.moon.x !== 328 || k.moon.y !== 84) return 'moon at ' + JSON.stringify(k.moon);
  if (k.moon.x + face.w !== 376 || k.moon.y - face.h !== 36) return 'the face is ' + face.w + ' x ' + face.h;
  if (!Array.isArray(k.stars) || k.stars.length < 8) return 'stars';
  const bad = k.stars.filter(function (st) {
    const inside = st.x >= 0 && st.x + star.w <= 384 && st.y - star.h >= TG.C.PLAY_TOP + 8 && st.y <= BAND_BOTTOM;
    const onFace = st.x + star.w > k.moon.x && st.x < k.moon.x + face.w && st.y > k.moon.y - face.h && st.y - star.h < k.moon.y;
    return !inside || onFace;
  });
  if (bad.length) return 'stars out of place: ' + JSON.stringify(bad);
});

// The layers of LEVEL2 3.3, and one more that the art pass added: `peek`, the Baron's own, straight after `near`.
check('cavern: the layers are mist, far, mid, near, peek, rails and fg with the factors of LEVEL2 3.3; peek has the factor of near', function () {
  const ids = CAV.layers.map(function (l) { return l.id; });
  if (JSON.stringify(ids) !== JSON.stringify(['mist', 'far', 'mid', 'near', 'peek', 'rails', 'fg'])) return ids.join(', ');
  const factors = CAV.layers.map(function (l) { return l.factor; });
  if (JSON.stringify(factors) !== JSON.stringify([0.1, 0.2, 0.4, 0.7, 0.7, 0.7, 1.3])) return factors.join(', ');
  const drifts = CAV.layers.map(function (l) { return l.drift; });
  if (JSON.stringify(drifts) !== JSON.stringify([1, 0, 0, 0, 0, 0, 0])) return 'drifts ' + drifts.join(', ');
  const repeats = CAV.layers.map(function (l) { return l.repeat; });
  if (JSON.stringify(repeats) !== JSON.stringify([512, 128, 384, 384, 1536, 32, 256])) return 'repeats ' + repeats.join(', ');
  const fronts = CAV.layers.filter(function (l) { return l.front; }).map(function (l) { return l.id; });
  if (JSON.stringify(fronts) !== JSON.stringify(['fg'])) return 'front layers: ' + fronts.join(', ');
});

check('cavern: every sprite it uses is defined, and every item lies within its layer repeat and stands on a floor line or hangs from the roof', function () {
  const bad = [];
  CAV.layers.forEach(function (l) {
    l.items.forEach(function (it) {
      if (!TG.Sprites.has(it.sprite)) { bad.push(l.id + ': ' + it.sprite + ' undefined'); return; }
      const d = TG.Sprites.get(it.sprite);
      if (typeof it.x !== 'number' || typeof it.y !== 'number') { bad.push(l.id + ': ' + it.sprite + ' has no x, y'); return; }
      if (it.x < 0 || it.x >= l.repeat) bad.push(l.id + ': ' + it.sprite + ' x ' + it.x + ' outside repeat ' + l.repeat);
      if (it.sections && !it.sections.every(function (s) { return s >= 0 && s <= 3; })) bad.push(l.id + ': ' + it.sprite + ' sections');
      if (l.front) {
        if (it.y - d.h < 200) bad.push('fg: ' + it.sprite + ' above y 200');
      } else if (it.sprite === 'bg_roots') {
        // the roots hang from the roof: their top rows are under the HUD and they end by y 40
        if (it.y !== 40) bad.push('bg_roots bottom ' + it.y);
      } else if (it.sprite === ROOF_RIM) {
        // the rock rims hang from the roof too: the three lumps of each, its lowest 6 rows, are below the HUD, and it
        // ends above a hazard's own rim, so that the rim over a pipe or the tunnel hangs lowest
        if (it.y < TG.C.PLAY_TOP + 6 || it.y >= HAZARD_RIM_BOTTOM) bad.push(ROOF_RIM + ' bottom ' + it.y);
      } else if (l.id === 'mist') {
        if (it.y - d.h < TG.C.PLAY_TOP || it.y > BAND_BOTTOM) bad.push('mist: ' + it.sprite + ' y ' + it.y);
      } else {
        // the far wall stands on its own floor line, y 168, as the far hills of Level 1 do; the rest on y 184
        const floor = l.id === 'far' ? 168 : TG.C.GROUND_Y;
        if (it.y !== floor) bad.push(l.id + ': ' + it.sprite + ' bottom ' + it.y + ', not ' + floor);
        if (it.y - d.h < TG.C.PLAY_TOP) bad.push(l.id + ': ' + it.sprite + ' top above the playfield');
      }
    });
  });
  const rail = CAV.layers.filter(function (l) { return l.id === 'rails'; })[0];
  if (rail.items.length !== 1 || rail.repeat % def('bg_rail').w !== 0) bad.push('the rail does not tile in its layer');
  if (bad.length) return bad.join(' | ');
});

// Rule 1. The colours a piece may show inside the band besides SHADOW (LEVEL2 3.1). The last entry is not one of
// the plan's four: the rock rim of the hazards, which the plan lets end by y 40, also hints at the roof in sections
// 2 and 3. It is SHADOW with flecks of PLUM, the band colour, inside an INK outline, and INK is darker than SHADOW.
const BAND_EXCEPTIONS = { bg_mist: [C.DEEP_TEAL], bg_cave_far: [C.GOLD], bg_cog_l: [C.BRONZE], bg_pipe_v: [C.BRONZE], haz_ceiling: [C.INK, C.PLUM] };

check('cavern, rule 1: a piece that stands inside the plate band, y 24 to 150, is SHADOW there, but for the four named exceptions and the outline and flecks of the roof rim', function () {
  const bad = {};
  cavernItems().forEach(function (it) {
    const d = def(it.sprite);
    const allowed = [C.SHADOW].concat(BAND_EXCEPTIONS[it.sprite] || []);
    for (let f = 0; f < d.frames.length; f++) {
      const px = pixels(d, f);
      for (let r = 0; r < d.h; r++) {
        const y = it.y - d.h + r;
        if (y < TG.C.PLAY_TOP || y >= BAND_BOTTOM) continue;
        for (let x = 0; x < d.w; x++) {
          if (px[r][x] >= 0 && allowed.indexOf(px[r][x]) === -1) bad[it.sprite + ' colour ' + px[r][x] + ' at y ' + y] = true;
        }
      }
    }
  });
  const list = Object.keys(bad);
  if (list.length) return list.slice(0, 8).join(' | ');
  // the gear stars are the fourth exception: BRONZE with a SHADOW hub and nothing else
  const stray = colorsOf('bg_gearstar').filter(function (c) { return c !== C.BRONZE && c !== C.SHADOW; });
  if (stray.length) return 'bg_gearstar uses ' + stray.join(',');
});

check('cavern, rule 1: the exceptions are dim or small (1 px mist lines, four lamps of 2 px, a 1 px rim on the cog and the standpipe)', function () {
  const bad = [];
  const mist = def('bg_mist'), far = def('bg_cave_far');
  for (let f = 0; f < mist.frames.length; f++) {
    const px = pixels(mist, f);
    for (let y = 0; y < mist.h; y++) for (let x = 0; x < mist.w; x++) {
      if (px[y][x] < 0) continue;
      if (px[y][x] !== C.DEEP_TEAL) bad.push('bg_mist colour ' + px[y][x]);
      if (y > 0 && px[y - 1][x] >= 0) bad.push('bg_mist line thicker than 1 px at ' + x + ',' + y);
    }
  }
  for (let f = 0; f < far.frames.length; f++) {
    const px = pixels(far, f);
    let gold = 0, lamps = 0;
    for (let y = 0; y < far.h; y++) for (let x = 0; x < far.w; x++) {
      if (px[y][x] !== C.GOLD) continue;
      gold++;
      if (px[y][x - 1] !== C.GOLD && (y === 0 || px[y - 1][x] !== C.GOLD)) lamps++;      // top left of a lamp
      if (px[y][x - 1] === C.GOLD && px[y][x - 2] === C.GOLD) bad.push('bg_cave_far lamp wider than 2 px at ' + x + ',' + y);
      if (y > 1 && px[y - 1][x] === C.GOLD && px[y - 2][x] === C.GOLD) bad.push('bg_cave_far lamp higher than 2 px at ' + x + ',' + y);
    }
    if (lamps !== 4) bad.push('bg_cave_far frame ' + f + ' has ' + lamps + ' lamps');
    if (gold > 16) bad.push('bg_cave_far frame ' + f + ' has ' + gold + ' GOLD pixels');
  }
  // the BRONZE of the cog and the standpipe inside the band is a rim: every such pixel touches the outside
  cavernItems().forEach(function (it) {
    if (it.sprite !== 'bg_cog_l' && it.sprite !== 'bg_pipe_v') return;
    const d = def(it.sprite);
    for (let f = 0; f < d.frames.length; f++) {
      const px = pixels(d, f);
      const open = function (x, y) { return x < 0 || y < 0 || x >= d.w || y >= d.h || px[y][x] < 0; };
      for (let r = 0; r < d.h && it.y - d.h + r < BAND_BOTTOM; r++) for (let x = 0; x < d.w; x++) {
        if (px[r][x] !== C.BRONZE) continue;
        if (!(open(x - 1, r) || open(x + 1, r) || open(x, r - 1) || open(x, r + 1))) bad.push(it.sprite + '/' + d.names[f] + ' BRONZE inside the shape at ' + x + ',' + r);
      }
    }
  });
  if (bad.length) return bad.slice(0, 6).join(' | ');
});

check('cavern: the far wall and the roots are SHADOW; the lamps of the far wall twinkle and turn AQUA under the remap crystal', function () {
  const roots = colorsOf('bg_roots'), far = colorsOf('bg_cave_far').sort(function (a, b) { return a - b; });
  if (JSON.stringify(roots) !== JSON.stringify([C.SHADOW])) return 'bg_roots uses ' + roots.join(',');
  if (JSON.stringify(far) !== JSON.stringify([C.SHADOW, C.GOLD])) return 'bg_cave_far uses ' + far.join(',');
  const d = def('bg_cave_far');
  const a = pixels(d, 0), b = pixels(d, 1);
  let moved = 0;
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if ((a[y][x] === C.GOLD) !== (b[y][x] === C.GOLD)) moved++;
  if (moved < 4) return 'the lamps do not change between the frames';
  if (TG.Remaps.crystal[C.GOLD] !== C.AQUA) return 'crystal does not turn GOLD into AQUA';
});

check('bg_cave_mid: SHADOW rock; the light round its arch is single BRONZE pixels below the plate band, within 18 px of the arch and thinning out to its inner faces alone from y 174 down, where the ground creatures pass', function () {
  const d = def('bg_cave_mid');
  const px = pixels(d, 0);
  const arch = archOfMid();
  if (!arch) return 'no arch was found';
  const item = cavernItems().filter(function (it) { return it.sprite === 'bg_cave_mid'; })[0];
  const top = item.y - d.h;                       // screen y of row 0
  const bad = [];
  let lit = 0, low = 0;
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
    if (px[y][x] !== C.BRONZE) continue;
    lit++;
    if (top + y < BAND_BOTTOM) bad.push('BRONZE at y ' + (top + y));
    if (x < arch.left - 18 || x > arch.right + 18) bad.push('BRONZE at column ' + x + ', away from the arch');
    if (top + y >= 174) {
      low++;
      if (x !== arch.left - 1 && x !== arch.right + 1) bad.push('BRONZE off the faces of the arch at ' + x + ',' + y);
    }
    // a pattern of single pixels and a 1 px line, never a filled patch
    if (px[y][x + 1] === C.BRONZE && px[y + 1] && px[y + 1][x] === C.BRONZE && px[y + 1][x + 1] === C.BRONZE) bad.push('a 2 x 2 block of BRONZE at ' + x + ',' + y);
  }
  if (lit < 60 || lit > 160) bad.push(lit + ' BRONZE pixels');
  if (low > 8) bad.push(low + ' BRONZE pixels from y 174 down');
  if (TG.Remaps.crystal[C.BRONZE] !== C.DEEP_TEAL) bad.push('crystal does not turn BRONZE into DEEP_TEAL');
  if (bad.length) return bad.slice(0, 6).join(' | ');
});

['bg_cave_far', 'bg_cave_mid'].forEach(function (name) {
  check(name + ' tiles every 128 px (the silhouette of its last column meets that of its first)', function () {
    const d = def(name);
    if (d.w !== 128) return 'width ' + d.w;
    for (let f = 0; f < d.frames.length; f++) {
      const px = pixels(d, f);
      const last = silhouetteTop(px, d.h, d.w - 1), first = silhouetteTop(px, d.h, 0);
      if (Math.abs(last - first) > 1) return 'frame ' + f + ': column 127 top ' + last + ', column 0 top ' + first;
    }
  });
});

check('bg_clockface: a CREAM face in a GOLD rim with BRONZE numerals and INK hands, and only the minute hand moves', function () {
  const d = def('bg_clockface');
  const cols = colorsOf('bg_clockface').sort(function (a, b) { return a - b; });
  if (JSON.stringify(cols) !== JSON.stringify([C.INK, C.BRONZE, C.GOLD, C.CREAM].sort(function (a, b) { return a - b; }))) return 'colours ' + cols.join(',');
  const a = pixels(d, 0), b = pixels(d, 1);
  const total = opaqueCount(a, d.w, d.h);
  if (countColors(a, d.w, d.h, [C.CREAM]) < total * 0.5) return 'the face is less than half CREAM';
  const ink = countColors(a, d.w, d.h, [C.INK]);
  if (ink < 30 || ink > 120) return ink + ' INK pixels';
  let moved = 0, shape = 0;
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
    if (a[y][x] !== b[y][x]) moved++;
    if ((a[y][x] < 0) !== (b[y][x] < 0)) shape++;
  }
  if (shape !== 0) return 'the outline of the face changes';
  if (moved < 8 || moved > 60) return moved + ' pixels differ between c0 and c1';
});

check('bg_cog_l: SHADOW inside a 1 px BRONZE line from top to bottom; its GOLD is the 2 x 2 pin of the hub, which stays in place in every frame, below y 150', function () {
  const d = def('bg_cog_l');
  const stray = colorsOf('bg_cog_l').filter(function (c) { return [C.SHADOW, C.BRONZE, C.GOLD].indexOf(c) === -1; });
  if (stray.length) return 'colours ' + stray.join(',');
  for (let f = 0; f < d.frames.length; f++) {
    const p = pixels(d, f);
    const open = function (x, y) { return x < 0 || y < 0 || x >= d.w || y >= d.h || p[y][x] < 0; };
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
      if (p[y][x] === C.BRONZE && !(open(x - 1, y) || open(x + 1, y) || open(x, y - 1) || open(x, y + 1))) return d.names[f] + ': BRONZE inside the shape at ' + x + ',' + y;
    }
    if (countColors(p, d.w, d.h, [C.GOLD]) !== 4) return d.names[f] + ': ' + countColors(p, d.w, d.h, [C.GOLD]) + ' GOLD pixels';
    if (p[23][23] !== C.GOLD || p[23][24] !== C.GOLD || p[24][23] !== C.GOLD || p[24][24] !== C.GOLD) return d.names[f] + ': the pin is not at the centre';
  }
  const hub = function (px) {
    const cells = [];
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (px[y][x] === C.GOLD) cells.push(x + ',' + y);
    return cells.join(' ');
  };
  const first = hub(pixels(d, 0));
  if (!first) return 'no GOLD hub';
  for (let f = 1; f < d.frames.length; f++) if (hub(pixels(d, f)) !== first) return 'the hub moves in frame ' + d.names[f];
  const item = cavernItems().filter(function (it) { return it.sprite === 'bg_cog_l'; })[0];
  const px = pixels(d, 0);
  for (let r = 0; r < d.h; r++) if (px[r].indexOf(C.GOLD) !== -1 && item.y - d.h + r < BAND_BOTTOM) return 'GOLD at y ' + (item.y - d.h + r);
});

check('bg_gearstar: one dark cog in both frames whose BRONZE teeth glint in turn, so that it is not taken for pr_cog', function () {
  const d = def('bg_gearstar');
  const a = pixels(d, 0), b = pixels(d, 1);
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
    if ((a[y][x] < 0) !== (b[y][x] < 0)) return 'the outline of the cog changes at ' + x + ',' + y;
    if (a[y][x] === C.BRONZE && b[y][x] === C.BRONZE) return 'a tooth is lit in both frames at ' + x + ',' + y;
  }
  for (let f = 0; f < 2; f++) {
    const px = f ? b : a;
    const lit = countColors(px, d.w, d.h, [C.BRONZE]), all = opaqueCount(px, d.w, d.h);
    if (lit < 4) return d.names[f] + ' has no glint';
    if (lit * 2 > all) return d.names[f] + ' has ' + lit + ' BRONZE pixels of ' + all + ': more lit than dark';
  }
});

check('the machines of the two halls are drawn in line, since the frog, the rolling gear and the pendulum pass in front of them: bg_cog_l, bg_pipe_v, bg_pipe_h and bg_boiler are more SHADOW than BRONZE, with at most 6 pixels of GOLD and CREAM in a frame and no 3 x 3 block of BRONZE, GOLD and CREAM', function () {
  const bad = [];
  ['bg_cog_l', 'bg_pipe_v', 'bg_pipe_h', 'bg_boiler'].forEach(function (name) {
    const d = def(name);
    for (let f = 0; f < d.frames.length; f++) {
      const p = pixels(d, f);
      const shadow = countColors(p, d.w, d.h, [C.SHADOW]), bronze = countColors(p, d.w, d.h, [C.BRONZE]);
      const lights = countColors(p, d.w, d.h, [C.GOLD, C.CREAM]);
      if (shadow <= bronze) bad.push(name + '/' + d.names[f] + ': ' + bronze + ' BRONZE to ' + shadow + ' SHADOW');
      if (lights > 6) bad.push(name + '/' + d.names[f] + ': ' + lights + ' pixels of GOLD and CREAM');
      for (let y = 0; y + 2 < d.h; y++) for (let x = 0; x + 2 < d.w; x++) {
        let all = true;
        for (let k = 0; k < 9 && all; k++) if (BRIGHT.indexOf(p[y + Math.floor(k / 3)][x + k % 3]) === -1) all = false;
        if (all) { bad.push(name + '/' + d.names[f] + ': a filled patch at ' + x + ',' + y); y = d.h; break; }
      }
    }
  });
  if (bad.length) return bad.slice(0, 6).join(' | ');
});

check('bg_pipe_h has no GOLD, and its section is that of the stub of bg_baronpeek: a BRONZE line above and below six rows of SHADOW', function () {
  const pipe = def('bg_pipe_h'), peek = def('bg_baronpeek');
  if (colorsOf('bg_pipe_h').indexOf(C.GOLD) !== -1) return 'GOLD on the pipe run';
  const p = pixels(pipe, 0);
  const section = function (px, x) { let t = ''; for (let y = 0; y < 16; y++) t += px[y][x] < 0 ? '.' : px[y][x] === C.BRONZE ? 'g' : px[y][x] === C.SHADOW ? '1' : '?'; return t; };
  const plain = section(p, 6);
  if (plain !== '..g111111g......') return 'the section of the pipe is ' + plain;
  for (let f = 0; f < peek.frames.length; f++) {
    const got = section(pixels(peek, f), peek.w - 1);
    if (got !== plain) return 'the stub of ' + peek.names[f] + ' is ' + got;
  }
});

check('bg_boiler: a dark tank drawn in line; its lights are the CREAM needle of the gauge and two GOLD sparks in the firebox, and the two frames differ in those alone', function () {
  const d = def('bg_boiler');
  const a = pixels(d, 0), b = pixels(d, 1);
  for (let f = 0; f < 2; f++) {
    const p = f ? b : a;
    const all = opaqueCount(p, d.w, d.h);
    if (countColors(p, d.w, d.h, [C.SHADOW]) * 2 < all) return d.names[f] + ': less than half of the boiler is SHADOW';
    if (countColors(p, d.w, d.h, [C.CREAM]) !== 3) return d.names[f] + ': the needle is ' + countColors(p, d.w, d.h, [C.CREAM]) + ' CREAM pixels';
    if (countColors(p, d.w, d.h, [C.GOLD]) !== 2) return d.names[f] + ': ' + countColors(p, d.w, d.h, [C.GOLD]) + ' GOLD sparks';
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
      // the needle is in the gauge (rows 9 to 16) and 1 px wide; the sparks are in the firebox (rows 20 to 25) and apart
      if (p[y][x] === C.CREAM && (y < 10 || y > 15 || p[y][x + 1] === C.CREAM)) return d.names[f] + ': CREAM out of place at ' + x + ',' + y;
      if (p[y][x] === C.GOLD && (y < 21 || y > 24 || p[y][x + 1] === C.GOLD || (p[y + 1] && p[y + 1][x] === C.GOLD))) return d.names[f] + ': GOLD out of place at ' + x + ',' + y;
    }
  }
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
    if (a[y][x] === b[y][x]) continue;
    if ((a[y][x] < 0) !== (b[y][x] < 0)) return 'the outline of the boiler changes at ' + x + ',' + y;
    if (!((y >= 9 && y <= 16) || (y >= 20 && y <= 25))) return 'the frames differ outside the gauge and the firebox at ' + x + ',' + y;
  }
  const item = cavernItems().filter(function (it) { return it.sprite === 'bg_boiler'; })[0];
  if (item.y - d.h < BAND_BOTTOM) return 'the boiler reaches into the plate band';
});

check('cavern: a piece that stands behind a hazard skin is a step dimmer than it (the crystals, the lantern, the stalagmite)', function () {
  const n = function (name, f, col) { const d = def(name); return countColors(pixels(d, f), d.w, d.h, [col]); };
  const bad = [];
  // the crystals are DEEP_TEAL with a TEAL face of 2 px and an AQUA glint at the tips; haz_crystal is AQUA all
  // over, and Pip's tunic, which passes in front of them, is TEAL
  if (n('bg_crystal_l', 0, C.AQUA) > 24) bad.push('bg_crystal_l has ' + n('bg_crystal_l', 0, C.AQUA) + ' AQUA pixels');
  if (n('bg_crystal_s', 0, C.AQUA) > 8) bad.push('bg_crystal_s has ' + n('bg_crystal_s', 0, C.AQUA) + ' AQUA pixels');
  ['bg_crystal_l', 'bg_crystal_s'].forEach(function (name) {
    const d = def(name), px = pixels(d, 0);
    if (n(name, 0, C.DEEP_TEAL) < n(name, 0, C.TEAL)) bad.push(name + ' is more TEAL than DEEP_TEAL');
    for (let y = 0; y < d.h; y++) for (let x = 0; x + 2 < d.w; x++) {
      if (px[y][x] === C.TEAL && px[y][x + 1] === C.TEAL && px[y][x + 2] === C.TEAL) { bad.push(name + ' has a TEAL face wider than 2 px at ' + x + ',' + y); return; }
    }
  });
  // the lantern is an ORANGE glow round a GOLD flame with a CREAM heart of a few pixels; haz_lantern has a CREAM glass
  for (let f = 0; f < 2; f++) {
    if (n('bg_lantern', f, C.CREAM) > 4) bad.push('bg_lantern frame ' + f + ' has ' + n('bg_lantern', f, C.CREAM) + ' CREAM pixels');
    if (n('bg_lantern', f, C.ORANGE) < n('bg_lantern', f, C.GOLD)) bad.push('bg_lantern frame ' + f + ' is more GOLD than ORANGE');
  }
  // the stalagmite is rock at the back: more SHADOW than STONE
  if (n('bg_stalagmite', 0, C.STONE) >= n('bg_stalagmite', 0, C.SHADOW)) bad.push('bg_stalagmite is more STONE than SHADOW');
  if (bad.length) return bad.join(' | ');
});

check('the cavern pieces have no INK but the hands of the clock, and the crystals no CORAL: they are not to be taken for haz_crystal', function () {
  const bad = [];
  LEVEL2_D.filter(function (n) { return n.indexOf('bg_') === 0 || n.indexOf('fg_') === 0; }).forEach(function (name) {
    const cols = colorsOf(name);
    if (name !== 'bg_clockface' && cols.indexOf(C.INK) !== -1) bad.push(name + ' uses INK');
  });
  ['bg_crystal_l', 'bg_crystal_s'].forEach(function (name) {
    const cols = colorsOf(name);
    if (cols.indexOf(C.CORAL) !== -1) bad.push(name + ' uses CORAL');
    if (cols.indexOf(C.AQUA) === -1 || cols.indexOf(C.TEAL) === -1) bad.push(name + ' is not AQUA and TEAL');
  });
  if (bad.length) return bad.join(' | ');
});

// The sections of LEVEL2 3.3, but for three things the art pass took out of the clock hall, where the fight is: the
// mid rocks (the light round their arches would lie behind the rolling gear and the pendulum), the backdrop rails
// (the arena has tile_rail on the play plane) and the foreground stumps, which are also left out of the Gear Hall,
// where the remap brass would make them BRONZE. The roof rim is the one sprite here that 3.3 does not list.
check('cavern: each piece appears in its sections (LEVEL2 3.3; no mid rocks, backdrop rails or stumps in the clock hall; the roof rim in sections 2 and 3)', function () {
  const want = {
    bg_mist: [0, 1, 2], bg_cave_far: null, bg_cave_mid: [0, 1, 2], bg_roots: [0], bg_lantern: [0, 1], bg_cog_l: [1, 3],
    bg_pipe_v: [1], bg_crystal_l: [2], bg_molehill: [0], bg_stalagmite: [0, 2], bg_pipe_h: [1, 3], bg_baronpeek: [1],
    bg_boiler: [3], bg_crystal_s: [2], bg_rail: [2], fg_stalagmite: [0, 2]
  };
  want[ROOF_RIM] = [1, 2];
  const bad = [];
  Object.keys(want).forEach(function (name) {
    const got = cavernSections(name);
    if (JSON.stringify(got) !== JSON.stringify(want[name])) bad.push(name + ' in ' + JSON.stringify(got));
  });
  const used = {};
  CAV.layers.forEach(function (l) { l.items.forEach(function (it) { used[it.sprite] = true; }); });
  Object.keys(used).forEach(function (name) { if (want[name] === undefined) bad.push(name + ' is not a piece of 3.3'); });
  if (bad.length) return bad.join(' | ');
});

check('cavern: each lantern stands in an arch of the mid rocks in every section it appears in, and each crystal cluster before one, so that the light on the rock has its source', function () {
  const arch = archOfMid();
  if (!arch) return 'no arch was found';
  const mid = CAV.layers.filter(function (l) { return l.id === 'mid'; })[0];
  const rocks = mid.items.filter(function (it) { return it.sprite === 'bg_cave_mid'; });
  const centre = (arch.left + arch.right + 1) / 2;
  const bad = [];
  let lanterns = 0, crystals = 0;
  mid.items.forEach(function (it, index) {
    if (it.sprite !== 'bg_lantern' && it.sprite !== 'bg_crystal_l') return;
    if (it.sprite === 'bg_lantern') lanterns++; else crystals++;
    const d = def(it.sprite);
    const rock = rocks.filter(function (r) { return Math.abs(r.x + centre - (it.x + d.w / 2)) <= 0.5; })[0];
    if (!rock) { bad.push(it.sprite + ' at ' + it.x + ' is not centred on an arch'); return; }
    if (rock.sections && !it.sections.every(function (sec) { return rock.sections.indexOf(sec) !== -1; })) bad.push(it.sprite + ' at ' + it.x + ' has no rock in one of its sections');
    if (mid.items.indexOf(rock) > index) bad.push(it.sprite + ' at ' + it.x + ' is drawn behind its rock');
  });
  if (lanterns < 2 || crystals < 2) bad.push(lanterns + ' lanterns and ' + crystals + ' crystal clusters');
  // a lantern fits inside the arch, so the rock does not cut it
  if (def('bg_lantern').w > arch.right - arch.left + 1) bad.push('the arch is narrower than the lantern');
  if (bad.length) return bad.join(' | ');
});

check('bg_rail: a SHADOW rail with short SILVER glints on its head and no bright line, since it is drawn behind the play plane and runs across every open gap', function () {
  const d = def('bg_rail');
  const px = pixels(d, 0);
  const bad = [];
  let silver = 0, headRow = -1;
  for (let y = 0; y < d.h; y++) {
    let run = 0;
    for (let x = 0; x < d.w * 2; x++) {             // twice round: the piece tiles
      if (px[y][x % d.w] === C.SILVER) { run++; if (run > 4) { bad.push('a SILVER run longer than 4 px in row ' + y); break; } } else run = 0;
    }
    const n = px[y].filter(function (c) { return c === C.SILVER; }).length;
    if (n > 0) { if (headRow !== -1) bad.push('SILVER in more than one row'); headRow = y; }
    silver += n;
  }
  if (silver < 2 || silver > 8) bad.push(silver + ' SILVER pixels in ' + d.w + ' px');
  if (headRow !== -1 && px[headRow].some(function (c) { return c < 0; })) bad.push('the rail head is broken');
  if (bad.length) return bad.join(' | ');
});

// The Baron has a layer of his own. As an item of `near`, whose repeat is the width of the screen, one copy of him
// was on screen at every moment of the Gear Hall, in a mole's colours, where the creatures walk.
check('cavern: the Baron peeks in section 2 only, from the open left end of a pipe run, in a layer of his own whose repeat keeps him off the screen for two thirds of the way; his two frames differ in the head alone', function () {
  const at = function (id) { return CAV.layers.map(function (l) { return l.id; }).indexOf(id); };
  const near = CAV.layers[at('near')], peek = CAV.layers[at('peek')];
  if (!near || !peek) return 'no layer near or no layer peek';
  const d = def('bg_baronpeek');
  const where = [];
  CAV.layers.forEach(function (l) { l.items.forEach(function (it) { if (it.sprite === 'bg_baronpeek') where.push(l.id); }); });
  if (JSON.stringify(where) !== JSON.stringify(['peek']) || peek.items.length !== 1) return 'bg_baronpeek in ' + where.join(', ') + '; peek has ' + peek.items.length + ' items';
  const it = peek.items[0];
  if (JSON.stringify(it.sections) !== JSON.stringify([1])) return 'sections ' + JSON.stringify(it.sections);
  // he moves with the pipe run and is drawn straight after it
  if (at('peek') !== at('near') + 1 || peek.factor !== near.factor || (peek.drift || 0) !== (near.drift || 0)) return 'peek does not follow near';
  // every copy of him is at the left end of a run: the repeat is a whole number of near's, and his right edge
  // meets the left end of the run
  const pipes = near.items.filter(function (p) { return p.sprite === 'bg_pipe_h' && p.sections.indexOf(1) !== -1; });
  const left = Math.min.apply(null, pipes.map(function (p) { return p.x; }));
  if (peek.repeat % near.repeat !== 0) return 'repeat ' + peek.repeat + ' is not a multiple of ' + near.repeat;
  if ((it.x + d.w) % near.repeat !== left % near.repeat || it.y !== pipes[0].y) return 'peek at ' + it.x + ', pipes from ' + left;
  // by the renderer's rule (a copy every `repeat` px of the layer, drawn while any of it is on screen) he is on
  // screen for at most a third of the layer's travel and away for two screens or more between two visits
  const shown = TG.C.W + d.w - 1;
  if (shown * 3 > peek.repeat) return 'on screen for ' + Math.round(100 * shown / peek.repeat) + '% of the way';
  if (peek.repeat - shown < 2 * TG.C.W) return 'away for only ' + (peek.repeat - shown) + ' px of the layer';
  const cols = colorsOf('bg_baronpeek');
  const missing = [C.GOLD, C.SOIL, C.PINK, C.WHITE].filter(function (c) { return cols.indexOf(c) === -1; });
  if (missing.length) return 'no ' + missing.join(',');
  // the pipe behind him (the last 4 columns) is the same in both frames
  const a = pixels(d, 0), b = pixels(d, 1);
  for (let y = 0; y < d.h; y++) for (let x = 12; x < d.w; x++) if (a[y][x] !== b[y][x]) return 'the pipe changes at ' + x + ',' + y;
});

// Sections 2 and 3 are too deep for the roots of section 1. Without a hint of the roof the flat band over the far
// wall reads as open sky, most of all the DEEP_BLUE band of section 3.
check('cavern: the roof is hinted at in sections 1 to 3 and not in the arena: the roots in section 1, and in sections 2 and 3 the rock rim of the hazards, three to five to a screen in the mid layer and apart from each other; the rim is SHADOW with flecks of the band colour inside an INK outline', function () {
  const mid = CAV.layers.filter(function (l) { return l.id === 'mid'; })[0];
  const d = def(ROOF_RIM);
  const bad = [];
  const rims = [];
  CAV.layers.forEach(function (l) {
    l.items.forEach(function (it) {
      if (it.sprite !== ROOF_RIM && it.sprite !== 'bg_roots') return;
      if (l.id !== 'mid') bad.push(it.sprite + ' in layer ' + l.id);
      if (!it.sections || it.sections.indexOf(3) !== -1) bad.push(it.sprite + ' at ' + it.x + ' in the arena, under the boss bar');
      if (it.y > 40) bad.push(it.sprite + ' at ' + it.x + ' ends at y ' + it.y);
      if (it.sprite === ROOF_RIM) rims.push(it);
    });
  });
  if (rims.length < 3 || rims.length > 5) bad.push(rims.length + ' rims in ' + mid.repeat + ' px');
  // lumps of one roof, not a strip: 8 px or more of band between two rims, round the repeat
  const xs = rims.map(function (it) { return it.x; }).sort(function (a, b) { return a - b; });
  xs.forEach(function (x, i) {
    const next = i + 1 < xs.length ? xs[i + 1] : xs[0] + mid.repeat;
    if (next - x < d.w + 8) bad.push('the rims at ' + x + ' and ' + (next % mid.repeat) + ' touch');
  });
  // what the rim puts into the band: SHADOW, an INK outline (darker than SHADOW) and flecks of PLUM, which is
  // the band colour in section 2 and becomes that of section 3 under its remap
  const stray = colorsOf(ROOF_RIM).filter(function (c) { return [C.INK, C.SHADOW, C.PLUM].indexOf(c) === -1; });
  if (stray.length) bad.push(ROOF_RIM + ' also uses ' + colorNames(stray));
  const px = pixels(d, 0);
  if (countColors(px, d.w, d.h, [C.PLUM]) * 8 > opaqueCount(px, d.w, d.h)) bad.push('more than an eighth of ' + ROOF_RIM + ' is PLUM');
  if (CAV.palettes.brass.sky[0].color !== C.PLUM) bad.push('the band of section 2 is not PLUM');
  if (TG.Remaps.crystal[C.PLUM] !== CAV.palettes.crystal.sky[0].color) bad.push('crystal does not turn PLUM into the band colour of section 3');
  ['brass', 'crystal'].forEach(function (r) {
    [C.INK, C.SHADOW].forEach(function (c) { if (TG.Remaps[r][c] !== undefined) bad.push(r + ' changes colour ' + c); });
  });
  if (TG.Remaps.brass[C.PLUM] !== undefined) bad.push('brass changes PLUM');
  if (bad.length) return bad.join(' | ');
});

// ---------------------------------------------------------------------------------------------
// The documents: the WP-D rows of CONTRACT 6.3 and the two cavern tables of CONTRACT 6.5 against the code.
// ---------------------------------------------------------------------------------------------

// The rows of the first table under a heading of docs/CONTRACT.md whose header starts with `firstCell`, as
// lists of cells; null when the document is not there.
function contractRows(heading, firstCell) {
  let text;
  try { text = require('fs').readFileSync(require('path').join(stubs.ROOT, 'docs', 'CONTRACT.md'), 'utf8'); } catch (e) { return null; }
  const lines = text.split('\n');
  const cells = function (line) { return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); }); };
  let i = lines.findIndex(function (l) { return l.indexOf(heading) === 0; });
  if (i === -1) throw new Error('heading not found: ' + heading);
  for (i++; i < lines.length && !/^#{2,3} /.test(lines[i]); i++) {
    if (lines[i].trim().indexOf('|') !== 0 || cells(lines[i])[0] !== firstCell) continue;
    const rows = [];
    for (i += 2; i < lines.length && lines[i].trim().indexOf('|') === 0; i++) rows.push(cells(lines[i]));
    return rows;
  }
  throw new Error('no table starting with "' + firstCell + '" under ' + heading);
}

// A Content cell of CONTRACT 6.3 that gives its pairs, as in `{ 2: 16, 10: 18 }` (STONE to BRONZE, TEAL to
// GOLD): { table, words }, both as index to index. null for a cell that describes its table in words only.
function remapCell(cell) {
  const m = /^`\{([^}]*)\}`(?:\s*\(([^)]*)\))?/.exec(cell);
  if (!m) return null;
  const table = {};
  m[1].split(',').forEach(function (pair) {
    const kv = pair.split(':').map(function (t) { return t.trim().replace(/^'|'$/g, ''); });
    table[kv[0]] = Number(kv[1]);
  });
  let words = null;
  if (m[2]) {
    words = {};
    m[2].split(',').forEach(function (w) {
      const ab = /^\s*([A-Z_]+) to ([A-Z_]+)\s*$/.exec(w);
      if (!ab || C[ab[1]] === undefined || C[ab[2]] === undefined) throw new Error('pair not understood: ' + w.trim());
      words[C[ab[1]]] = C[ab[2]];
    });
  }
  return { table: table, words: words };
}

function unquote(cell) { return cell.replace(/`/g, '').trim(); }

(function () {
  const remapTitle = 'doc: the WP-D rows of CONTRACT 6.3 name the remaps of js/sprites-world.js, and each row that gives its pairs has those of TG.Remaps, in numbers and in words';
  const paletteTitle = 'doc: the palette table of CONTRACT 6.5 for the backdrop cavern equals TG.Backdrops.cavern.palettes (bands, slowSky, remap, phases, stars and moon)';
  const layerTitle = 'doc: the layer table of CONTRACT 6.5 for the backdrop cavern has the layers of TG.Backdrops.cavern in order, with their factor, drift, repeat and pieces';
  const remapRows = contractRows('### 6.3 Remaps', 'Name');
  if (remapRows === null) {
    [remapTitle, paletteTitle, layerTitle].forEach(function (t) { console.log('skip - ' + t + ' (docs/CONTRACT.md is not present)'); });
    return;
  }

  check(remapTitle, function () {
    const mine = remapRows.filter(function (r) { return r[1] === 'WP-D'; });
    const docNames = mine.map(function (r) { return unquote(r[0]); });
    const codeNames = Object.keys(TG.Remaps);
    if (JSON.stringify(docNames.slice().sort()) !== JSON.stringify(codeNames.slice().sort())) return 'the document has ' + docNames.join(' ') + '; the code has ' + codeNames.join(' ');
    const bad = [];
    let read = 0;
    mine.forEach(function (r, i) {
      const got = remapCell(r[3]);
      if (!got) return;
      read++;
      const code = JSON.stringify(stubs.plain(TG.Remaps[docNames[i]]));
      if (JSON.stringify(got.table) !== code) bad.push(docNames[i] + ': the document has ' + JSON.stringify(got.table) + ', the code ' + code);
      if (got.words && JSON.stringify(got.words) !== code) bad.push(docNames[i] + ': the words of the document give ' + JSON.stringify(got.words) + ', the code ' + code);
    });
    if (read < 3) bad.push('only ' + read + ' of the rows give their pairs (brass, crystal and paleink do)');
    if (bad.length) return bad.join(' | ');
  });

  check(paletteTitle, function () {
    const rows = contractRows('### 6.5 Backdrops', 'Palette');
    const names = rows.map(function (r) { return unquote(r[0]); });
    if (JSON.stringify(names) !== JSON.stringify(Object.keys(CAV.palettes))) return 'the document has ' + names.join(' ') + '; the code has ' + Object.keys(CAV.palettes).join(' ');
    const colour = function (word) { if (C[word] === undefined) throw new Error('not a colour: ' + word); return C[word]; };
    const bad = [];
    rows.forEach(function (r, i) {
      const pal = stubs.plain(CAV.palettes[names[i]]);
      const floor = /^([A-Z_]+) dithered ([A-Z_]+)$/.exec(r[3]);
      if (!floor) throw new Error('floor band of ' + names[i] + ' not understood: ' + r[3]);
      const doc = { band: colour(r[2]), floor: colour(floor[1]), dither: colour(floor[2]), slowSky: colour(r[4]), remap: r[5] === 'none' ? null : unquote(r[5]) };
      const code = { band: pal.sky[0].color, floor: pal.sky[1].color, dither: pal.sky[1].dither, slowSky: pal.slowSky, remap: pal.remap };
      if (JSON.stringify(doc) !== JSON.stringify(code)) bad.push(names[i] + ': the document has ' + JSON.stringify(doc) + ', the code ' + JSON.stringify(code));
      // The other keys: `phases`: 2 is PLUM dithered MAROON, ...; `stars` (8) drawn with `bg_gearstar`; `moon` at x 328, y 84 drawn with `bg_clockface`.
      const other = { phases: {}, stars: 0, starSprite: null, moon: null, moonSprite: null };
      const phase = /(\d) is ([A-Z_]+) dithered ([A-Z_]+)/g;
      let m;
      while ((m = phase.exec(r[6])) !== null) other.phases[m[1]] = { color: colour(m[2]), dither: colour(m[3]) };
      const stars = /`stars` \((\d+)\) drawn with `(\w+)`/.exec(r[6]);
      if (stars) { other.stars = Number(stars[1]); other.starSprite = stars[2]; }
      const moon = /`moon` at x (\d+), y (\d+) drawn with `(\w+)`/.exec(r[6]);
      if (moon) { other.moon = { x: Number(moon[1]), y: Number(moon[2]) }; other.moonSprite = moon[3]; }
      const has = { phases: pal.phases || {}, stars: pal.stars ? pal.stars.length : 0, starSprite: pal.starSprite || null, moon: pal.moon || null, moonSprite: pal.moonSprite || null };
      if (JSON.stringify(other) !== JSON.stringify(has)) bad.push(names[i] + ', other keys: the document has ' + JSON.stringify(other) + ', the code ' + JSON.stringify(has));
    });
    if (bad.length) return bad.join(' | ');
  });

  check(layerTitle, function () {
    const rows = contractRows('### 6.5 Backdrops', 'Layer');
    const doc = rows.map(function (r) {
      const f = /^([\d.]+)(?:, drift (\d+))?(, `front`)?$/.exec(r[1]);
      if (!f) throw new Error('factor of ' + r[0] + ' not understood: ' + r[1]);
      const pieces = {};
      (r[3].match(/`(?:bg|fg|haz)_\w+`/g) || []).forEach(function (n) { pieces[unquote(n)] = true; });
      return { id: unquote(r[0]), factor: Number(f[1]), drift: f[2] ? Number(f[2]) : 0, repeat: Number(r[2]), front: !!f[3], pieces: Object.keys(pieces).sort() };
    });
    const code = stubs.plain(CAV.layers).map(function (l) {
      const pieces = {};
      l.items.forEach(function (it) { pieces[it.sprite] = true; });
      return { id: l.id, factor: l.factor, drift: l.drift || 0, repeat: l.repeat, front: !!l.front, pieces: Object.keys(pieces).sort() };
    });
    if (doc.length !== code.length) return 'the document has ' + doc.length + ' layers, the code ' + code.length;
    const bad = [];
    doc.forEach(function (d, i) { if (JSON.stringify(d) !== JSON.stringify(code[i])) bad.push('the document has ' + JSON.stringify(d) + ', the code ' + JSON.stringify(code[i])); });
    if (bad.length) return bad.join(' | ');
  });
})();

console.log('test-sprites-world: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
