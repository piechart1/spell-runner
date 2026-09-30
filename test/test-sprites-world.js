// test/test-sprites-world.js
// Tests for js/sprites-world.js (WP-D): the world sprites, the remaps `sunset` and `dusk` and the
// backdrop `meadow`. CONTRACT section 12 (WP-D acceptance), 6.1 to 6.5 and 2.2.
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
const HANGING = ['haz_trunk', 'haz_rope', 'haz_branch', 'haz_beehive', 'haz_arch', 'haz_canopy'];
const STANDING = ['haz_bramble', 'haz_trunk', 'haz_rope', 'sign_jump', 'sign_duck', 'sign_type', 'flag_pole', 'fx_daisy'];

check('every outlined sprite has INK on its exterior edge (at most 5% of edge pixels may differ)', function () {
  const bad = [];
  OUTLINED.forEach(function (name) {
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
    if (name.indexOf('sign_') === 0 || name.indexOf('flag_') === 0 || name.indexOf('haz_') === 0) return;
    const colors = colorsOf(name).filter(function (c) { return c !== C.INK; });
    if (colors.length > 4) bad.push(name + ' uses ' + colors.length + ': ' + colors.join(','));
  });
  if (bad.length) return bad.join(' | ');
});

check('every animated sprite has frames that differ from each other', function () {
  const bad = [];
  manifestD.forEach(function (m) {
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
  ['pw_shield', 'pw_hourglass', 'pw_quill', 'pw_blast', 'pw_cap'].forEach(function (name) {
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
  manifestD.forEach(function (m) {
    const d = def(m.name);
    const a = d.anchor;
    const n = m.name;
    let want = null;
    if (n.indexOf('tile_') === 0 || n.indexOf('icon_') === 0 || n.indexOf('ui_') === 0 || n.indexOf('key_') === 0) want = [0, 0];
    else if (n === 'bg_sails') want = [16, 16];
    else if (n === 'fx_bracket') want = [0, 0];
    else if (n.indexOf('haz_') === 0 || n.indexOf('bg_') === 0 || n.indexOf('fg_') === 0 || n === 'flag_pole' || n === 'sign_type') want = [0, d.h];
    else if (n === 'sign_jump' || n === 'sign_duck' || n.indexOf('item_') === 0 || n.indexOf('crate_') === 0 || n.indexOf('pw_') === 0) want = [d.w / 2, d.h];
    else if (n === 'fx_shield' || n === 'fx_bubble') want = [12, 30];
    else if (n === 'fx_daisy' || n === 'fx_dust') want = [4, 8];
    else if (n === 'fx_marker') want = [8, 4];
    else if (n.indexOf('fx_') === 0) want = [d.w / 2, d.h / 2];
    if (want && (a[0] !== want[0] || a[1] !== want[1])) bad.push(n + ' ' + a.join(',') + ' vs ' + want.join(','));
  });
  if (bad.length) return bad.join(' | ');
});

console.log('test-sprites-world: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
