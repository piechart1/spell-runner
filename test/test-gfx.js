// test/test-gfx.js
// Tests for WP-C: js/gfx.js (TG.Gfx), js/font.js (TG.Font) and js/sprites-chars.js (the character
// sprites and the remaps white, gold, dim and lampred). CONTRACT 4.9, 4.10, 6.1 to 6.4, 12 (WP-C
// acceptance) and 13.2 (canvas subset).
//
// Run from the project root:
//   node test/test-gfx.js
//   node test/test-gfx.js --sheet out.png     also draws every WP-C sprite frame at 4x with TG.Gfx into a PNG
//                                             (the visual check of CONTRACT 12, WP-C)
//
// Drawing is tested on the software canvas of tools/softcanvas.js (stubs.load({ canvas: 'soft' })),
// which really draws and throws for anything outside the canvas subset of CONTRACT 13.2.
'use strict';

const fs = require('fs');
const path = require('path');
const stubs = require('./stubs');

let passed = 0;
let failed = 0;
const warnings = [];

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

const WPC_FILES = ['js/core.js', 'js/gfx.js', 'js/font.js', 'js/sprites-chars.js'];

function loadSoft(files) {
  const env = stubs.load({ files: files || WPC_FILES, canvas: 'soft' });
  if (env.TG.Gfx) env.TG.Gfx.init(env.document);
  return env;
}

// A software canvas of w x h from the stub document, smoothing off.
function canvasOf(env, w, h) {
  const c = env.document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { canvas: c, ctx: ctx };
}

// Pixel of a software canvas as '#rrggbb' (lower case), or null when transparent.
function pixelAt(canvas, x, y) {
  const d = canvas.getContext('2d').getImageData(x, y, 1, 1).data;
  if (d[3] === 0) return null;
  return '#' + [d[0], d[1], d[2]].map(function (v) { return (v < 16 ? '0' : '') + v.toString(16); }).join('');
}

function hexOf(TG, index) { return TG.PAL[index].toLowerCase(); }

// ---------------------------------------------------------------------------------------------
// Loading (CONTRACT 2.2 and 12.0)
// ---------------------------------------------------------------------------------------------

check('js/gfx.js, js/font.js and js/sprites-chars.js load with only js/core.js present', function () {
  const env = stubs.load({ files: WPC_FILES });
  if (env.missing.length) return 'missing: ' + env.missing.join(', ');
  if (!env.TG.Gfx || !env.TG.Font) return 'TG.Gfx or TG.Font is not defined';
});

check('loading the WP-C files makes no canvas, audio or storage calls and no warnings', function () {
  const env = stubs.load({ files: WPC_FILES });
  if (env.canvasCalls.count !== 0) return 'canvas calls: ' + env.canvasCalls.count;
  if (env.audio.contexts.length !== 0) return 'audio contexts: ' + env.audio.contexts.length;
  if (env.storage.size !== 0) return 'storage entries: ' + env.storage.size;
  if (env.warnings.length || env.errors.length) return env.warnings.concat(env.errors).join(' | ');
});

['js/gfx.js', 'js/font.js', 'js/sprites-chars.js'].forEach(function (file) {
  check(file + ' loads on its own after js/core.js, without the other WP-C files', function () {
    const env = stubs.load({ files: ['js/core.js', file] });
    if (env.missing.length) return 'missing: ' + env.missing.join(', ');
    if (env.canvasCalls.count !== 0) return 'canvas calls: ' + env.canvasCalls.count;
    if (env.warnings.length || env.errors.length) return env.warnings.concat(env.errors).join(' | ');
  });
});

check('the WP-C files load with every other file of the game (no name is defined twice)', function () {
  const env = stubs.load({ files: stubs.FILES });
  if (!env.TG.Sprites.has('hero_run')) return 'hero_run missing';
});

function sourceWithoutComments(file) {
  const raw = fs.readFileSync(path.join(stubs.ROOT, file), 'utf8');
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

['js/gfx.js', 'js/font.js', 'js/sprites-chars.js'].forEach(function (file) {
  check(file + ' is one IIFE on TG with the module pattern of CONTRACT 2.1', function () {
    const src = fs.readFileSync(path.join(stubs.ROOT, file), 'utf8');
    if (src.indexOf('(function (root) {') === -1) return 'no (function (root) {';
    if (src.indexOf("'use strict';") === -1) return "no 'use strict'";
    if (src.indexOf("})(typeof window !== 'undefined' ? window : globalThis);") === -1) return 'no closing call';
    if (/\b(import|require)\s*\(/.test(sourceWithoutComments(file)) || /^\s*import\s/m.test(src)) return 'uses import or require';
  });
});

check('sprites-chars.js does not use other modules, the DOM or timers', function () {
  const src = sourceWithoutComments('js/sprites-chars.js');
  const bad = ['TG.Gfx', 'TG.Font', 'TG.Audio', 'TG.Render', 'TG.Effects', 'TG.Hud', 'TG.UI', 'TG.Main', 'TG.Game',
    'TG.Entities', 'TG.Level', 'TG.Words', 'TG.Typing', 'document', 'localStorage', 'AudioContext',
    'requestAnimationFrame', 'setTimeout', 'Math.random', 'Date.'];
  const found = bad.filter(function (b) { return src.indexOf(b) !== -1; });
  if (found.length) return 'found: ' + found.join(', ');
});

check('gfx.js and font.js use only the canvas subset of CONTRACT 13.2', function () {
  const bad = ['fillText', 'strokeText', 'strokeRect', 'strokeStyle', 'beginPath', 'moveTo', 'lineTo', 'arc(', '.fill(',
    '.stroke(', '.clip(', 'createLinearGradient', 'createRadialGradient', 'createPattern', '.scale(', '.rotate(',
    '.transform(', 'globalCompositeOperation', '.font =', '.font=', 'shadowBlur', 'shadowColor', 'measureText',
    'lineWidth', 'filter =', 'toDataURL', 'new Image', 'Path2D'];
  const found = [];
  ['js/gfx.js', 'js/font.js'].forEach(function (file) {
    const src = sourceWithoutComments(file);
    bad.forEach(function (b) { if (src.indexOf(b) !== -1) found.push(file + ': ' + b); });
    const alpha = src.match(/globalAlpha\s*=\s*([^;]+)/g) || [];
    alpha.forEach(function (a) { if (!/=\s*1\s*$/.test(a)) found.push(file + ': ' + a); });
  });
  if (found.length) return found.join(', ');
});

// ---------------------------------------------------------------------------------------------
// TG.Gfx (CONTRACT 4.9)
// ---------------------------------------------------------------------------------------------

(function gfxTests() {
  const env = loadSoft();
  const TG = env.TG;

  check('Gfx.color gives the TG.PAL entry for every index, and INK outside 0..31', function () {
    for (let i = 0; i < 32; i++) if (TG.Gfx.color(i) !== TG.PAL[i]) return 'index ' + i;
    if (!/^#[0-9a-fA-F]{6}$/.test(TG.Gfx.color(7))) return 'not #rrggbb';
    if (TG.Gfx.color(32) !== TG.PAL[0] || TG.Gfx.color(-1) !== TG.PAL[0] || TG.Gfx.color('x') !== TG.PAL[0]) return 'bad index';
  });

  check('Gfx.has is true for a defined sprite and false for others', function () {
    if (!TG.Gfx.has('hero_run')) return 'hero_run';
    if (TG.Gfx.has('tile_grass')) return 'tile_grass is not defined in this load';
    if (TG.Gfx.has('no_such_sprite')) return 'no_such_sprite';
  });

  check('Gfx.info comes from the definition, from the manifest for an undefined sprite, and is null otherwise', function () {
    const a = TG.Gfx.info('en_swoop');
    const want = { w: 24, h: 16, frames: 3, ax: 12, ay: 16, fps: 8, names: ['flap0', 'flap1', 'dive'] };
    if (JSON.stringify(a) !== JSON.stringify(want)) return 'en_swoop ' + JSON.stringify(a);
    const b = TG.Gfx.info('flag_pole');
    const wantB = { w: 16, h: 32, frames: 5, ax: 0, ay: 32, fps: 4, names: ['down', 'rise0', 'rise1', 'wave0', 'wave1'] };
    if (JSON.stringify(b) !== JSON.stringify(wantB)) return 'flag_pole ' + JSON.stringify(b);
    if (TG.Gfx.info('no_such_sprite') !== null) return 'unknown name';
    b.names.push('x');
    if (TG.Gfx.info('flag_pole').names.length !== 5) return 'info returns the manifest array itself';
  });

  check('Gfx.frameIndex takes an index or a frame name; unknown gives 0', function () {
    if (TG.Gfx.frameIndex('en_swoop', 'dive') !== 2) return 'dive';
    if (TG.Gfx.frameIndex('en_swoop', 1) !== 1) return '1';
    if (TG.Gfx.frameIndex('en_swoop', 'nope') !== 0) return 'nope';
    if (TG.Gfx.frameIndex('en_swoop', 7) !== 0) return '7';
    if (TG.Gfx.frameIndex('en_swoop', -1) !== 0) return '-1';
    if (TG.Gfx.frameIndex('flag_pole', 'wave1') !== 4) return 'manifest frame name';
    if (TG.Gfx.frameIndex('no_such_sprite', 'x') !== 0) return 'unknown sprite';
  });

  check('Gfx.get returns the same canvas for the same arguments and a different one for another remap or flip', function () {
    const a = TG.Gfx.get('hero_run', 1);
    if (!a || a.width !== 16 || a.height !== 24) return 'size';
    if (TG.Gfx.get('hero_run', 1) !== a) return 'not cached';
    if (TG.Gfx.get('hero_run', 'r1') !== a) return 'frame name and index give different canvases';
    if (TG.Gfx.get('hero_run', 1, {}) !== a) return 'empty opts';
    const w = TG.Gfx.get('hero_run', 1, { remap: 'white' });
    if (w === a) return 'remap white gives the same canvas';
    if (TG.Gfx.get('hero_run', 1, { remap: 'white' }) !== w) return 'remap not cached';
    if (TG.Gfx.get('hero_run', 1, { remap: 'gold' }) === w) return 'gold and white share a canvas';
    const f = TG.Gfx.get('hero_run', 1, { flipX: true });
    if (f === a) return 'flipX gives the same canvas';
    if (TG.Gfx.get('hero_run', 2) === a) return 'another frame gives the same canvas';
  });

  check('Gfx.get paints the frame pixel for pixel, with flipX mirrored and remap white applied', function () {
    const def = TG.Sprites.get('en_hoppet');
    const plain = TG.Gfx.get('en_hoppet', 0);
    const flip = TG.Gfx.get('en_hoppet', 0, { flipX: true });
    const white = TG.Gfx.get('en_hoppet', 0, { remap: 'white' });
    for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) {
      const ch = def.frames[0][y].charAt(x);
      const want = ch === '.' ? null : hexOf(TG, TG.PAL_KEYS.indexOf(ch));
      if (pixelAt(plain, x, y) !== want) return 'plain ' + x + ',' + y;
      if (pixelAt(flip, def.w - 1 - x, y) !== want) return 'flip ' + x + ',' + y;
      if (pixelAt(white, x, y) !== (want ? hexOf(TG, 4) : null)) return 'white ' + x + ',' + y;
    }
  });

  check('Gfx.clearCache makes get paint a new canvas', function () {
    const a = TG.Gfx.get('pr_rock', 0);
    TG.Gfx.clearCache();
    const b = TG.Gfx.get('pr_rock', 0);
    if (a === b) return 'same canvas after clearCache';
  });

  // A small sprite with an anchor that is not symmetric, to check placement.
  TG.Sprites.define('test_anchor', {
    w: 4, h: 3, anchor: [1, 3], fps: 0, owner: 'T', names: ['a', 'b'],
    frames: [['0pp4', '0ab4', '0000'], { copy: 0, flipX: true }]
  });

  function findOpaqueBox(canvas) {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (pixelAt(canvas, x, y) !== null) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  check('Gfx.draw puts the anchor on (floor(x), floor(y))', function () {
    const t = canvasOf(env, 40, 30);
    TG.Gfx.draw(t.ctx, 'test_anchor', 0, 10.8, 12.3);
    const box = findOpaqueBox(t.canvas);
    if (!box || box.x !== 9 || box.y !== 9 || box.w !== 4 || box.h !== 3) return JSON.stringify(box);
    if (pixelAt(t.canvas, 10, 9) !== hexOf(TG, 25)) return 'pixel 1,0 of the frame is not RED';
    if (pixelAt(t.canvas, 12, 9) !== hexOf(TG, 4)) return 'pixel 3,0 of the frame is not WHITE';
  });

  check('Gfx.draw with flipX mirrors the frame and the anchor, so the sprite stays on the same spot', function () {
    const t = canvasOf(env, 40, 30);
    TG.Gfx.draw(t.ctx, 'test_anchor', 0, 10, 12, { flipX: true });
    const box = findOpaqueBox(t.canvas);
    // mirrored anchor: w - ax = 3, so the left edge is at 10 - 3 = 7
    if (!box || box.x !== 7 || box.y !== 9) return JSON.stringify(box);
    if (pixelAt(t.canvas, 7, 9) !== hexOf(TG, 4)) return 'left column is not the old right column';
    if (pixelAt(t.canvas, 10, 9) !== hexOf(TG, 0)) return 'right column is not the old left column';
  });

  check('a frame given as { copy, flipX } is drawn as the mirrored frame, and flipX on it mirrors it back', function () {
    const a = canvasOf(env, 20, 20), b = canvasOf(env, 20, 20);
    TG.Gfx.draw(a.ctx, 'test_anchor', 'b', 5, 5, { anchor: false });
    TG.Gfx.draw(b.ctx, 'test_anchor', 0, 5, 5, { anchor: false, flipX: true });
    for (let y = 5; y < 8; y++) for (let x = 5; x < 9; x++) if (pixelAt(a.canvas, x, y) !== pixelAt(b.canvas, x, y)) return x + ',' + y;
    const c = canvasOf(env, 20, 20), d = canvasOf(env, 20, 20);
    TG.Gfx.draw(c.ctx, 'test_anchor', 'b', 5, 5, { anchor: false, flipX: true });
    TG.Gfx.draw(d.ctx, 'test_anchor', 0, 5, 5, { anchor: false });
    for (let y = 5; y < 8; y++) for (let x = 5; x < 9; x++) if (pixelAt(c.canvas, x, y) !== pixelAt(d.canvas, x, y)) return 'back ' + x + ',' + y;
  });

  check('Gfx.draw with anchor: false puts the top-left corner on (x, y)', function () {
    const t = canvasOf(env, 40, 30);
    TG.Gfx.draw(t.ctx, 'test_anchor', 0, 3, 4, { anchor: false });
    const box = findOpaqueBox(t.canvas);
    if (!box || box.x !== 3 || box.y !== 4) return JSON.stringify(box);
  });

  check('Gfx.draw with scale 2, 3 and 4 enlarges by whole pixels around the scaled anchor', function () {
    [2, 3, 4].forEach(function (s) {
      const t = canvasOf(env, 60, 60);
      TG.Gfx.draw(t.ctx, 'test_anchor', 0, 30, 30, { scale: s });
      const box = findOpaqueBox(t.canvas);
      const want = { x: 30 - 1 * s, y: 30 - 3 * s, w: 4 * s, h: 3 * s };
      if (JSON.stringify(box) !== JSON.stringify(want)) throw new Error('scale ' + s + ': ' + JSON.stringify(box));
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
        if (pixelAt(t.canvas, want.x + s + dx, want.y + dy) !== hexOf(TG, 25)) throw new Error('scale ' + s + ' pixel');
      }
    });
  });

  check('Gfx.draw of a frame name draws that frame', function () {
    const a = canvasOf(env, 40, 40), b = canvasOf(env, 40, 40);
    TG.Gfx.draw(a.ctx, 'en_swoop', 'dive', 20, 20);
    TG.Gfx.draw(b.ctx, 'en_swoop', 2, 20, 20);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) if (pixelAt(a.canvas, x, y) !== pixelAt(b.canvas, x, y)) return x + ',' + y;
  });

  check('Gfx.draw ignores a missing context or coordinates that are not numbers', function () {
    const t = canvasOf(env, 10, 10);
    TG.Gfx.draw(null, 'hero_run', 0, 1, 1);
    TG.Gfx.draw(t.ctx, 'hero_run', 0, NaN, 1);
    TG.Gfx.draw(t.ctx, 'hero_run', 0, 1, undefined);
    if (findOpaqueBox(t.canvas) !== null) return 'something was drawn';
  });

  check('Gfx.rect fills a floored rectangle; Gfx.frame draws a 1 px outline only', function () {
    const t = canvasOf(env, 20, 20);
    TG.Gfx.rect(t.ctx, 1.7, 2.2, 3.9, 2.5, 26);
    let box = findOpaqueBox(t.canvas);
    if (JSON.stringify(box) !== JSON.stringify({ x: 1, y: 2, w: 3, h: 2 })) return 'rect ' + JSON.stringify(box);
    if (pixelAt(t.canvas, 2, 3) !== hexOf(TG, 26)) return 'rect colour';
    const u = canvasOf(env, 20, 20);
    TG.Gfx.frame(u.ctx, 2, 3, 6, 5, 18);
    box = findOpaqueBox(u.canvas);
    if (JSON.stringify(box) !== JSON.stringify({ x: 2, y: 3, w: 6, h: 5 })) return 'frame ' + JSON.stringify(box);
    if (pixelAt(u.canvas, 2, 3) !== hexOf(TG, 18) || pixelAt(u.canvas, 7, 7) !== hexOf(TG, 18)) return 'frame corners';
    if (pixelAt(u.canvas, 4, 5) !== null) return 'frame filled its inside';
  });

  check('Gfx.dither paints a checkerboard; phase 0 and 1 are the two halves', function () {
    const a = canvasOf(env, 300, 150), b = canvasOf(env, 300, 150);
    TG.Gfx.dither(a.ctx, 3, 5, 270, 140, 0, 0);
    TG.Gfx.dither(b.ctx, 3, 5, 270, 140, 0, 1);
    for (let y = 0; y < 150; y++) for (let x = 0; x < 300; x++) {
      const inside = x >= 3 && x < 273 && y >= 5 && y < 145;
      const pa = pixelAt(a.canvas, x, y) !== null, pb = pixelAt(b.canvas, x, y) !== null;
      const even = (x + y) % 2 === 0;
      if (pa !== (inside && even)) return 'phase 0 at ' + x + ',' + y;
      if (pb !== (inside && !even)) return 'phase 1 at ' + x + ',' + y;
    }
  });

  check('every context TG.Gfx creates has imageSmoothingEnabled false', function () {
    const c = TG.Gfx.get('hero_run', 0);
    if (c.getContext('2d').imageSmoothingEnabled !== false) return 'frame canvas';
  });
})();

(function placeholderTests() {
  const env = loadSoft(['js/core.js', 'js/gfx.js', 'js/font.js']);
  const TG = env.TG;

  check('Gfx.draw of an undefined sprite draws a CORAL placeholder of the manifest size at its anchor and warns once', function () {
    const t = canvasOf(env, 80, 80);
    TG.Gfx.draw(t.ctx, 'bg_cloud_s', 0, 10, 40);             // manifest: 32x16, anchor 0,16
    TG.Gfx.draw(t.ctx, 'bg_cloud_s', 0, 10, 60);
    const coral = hexOf(TG, 26);
    for (let x = 10; x < 42; x++) {
      if (pixelAt(t.canvas, x, 24) !== coral || pixelAt(t.canvas, x, 39) !== coral) return 'top or bottom edge at x ' + x;
    }
    for (let y = 24; y < 40; y++) {
      if (pixelAt(t.canvas, 10, y) !== coral || pixelAt(t.canvas, 41, y) !== coral) return 'side edge at y ' + y;
    }
    const inside = [];
    for (let y = 25; y < 39; y++) for (let x = 11; x < 41; x++) if (pixelAt(t.canvas, x, y) === hexOf(TG, 4)) inside.push(x);
    if (inside.length === 0) return 'no letters inside';
    const w = env.warnings.filter(function (m) { return m.indexOf('bg_cloud_s') !== -1; });
    if (w.length !== 1) return 'warnings: ' + env.warnings.join(' | ');
  });

  check('a name that is in neither the definitions nor the manifest gets a 16x16 placeholder', function () {
    const t = canvasOf(env, 40, 40);
    TG.Gfx.draw(t.ctx, 'zz_unknown', 0, 5, 6);
    const coral = hexOf(TG, 26);
    if (pixelAt(t.canvas, 5, 6) !== coral || pixelAt(t.canvas, 20, 21) !== coral || pixelAt(t.canvas, 21, 21) !== null) return 'box';
    const w = env.warnings.filter(function (m) { return m.indexOf('zz_unknown') !== -1; });
    if (w.length !== 1) return 'warnings ' + w.length;
  });

  check('an unknown remap warns once and draws the plain frame', function () {
    TG.Sprites.define('test_px', { w: 2, h: 1, anchor: [0, 0], fps: 0, owner: 'T', names: ['a'], frames: [['0p']] });
    const t = canvasOf(env, 4, 4);
    TG.Gfx.draw(t.ctx, 'test_px', 0, 0, 0, { remap: 'nope' });
    TG.Gfx.draw(t.ctx, 'test_px', 0, 0, 2, { remap: 'nope' });
    if (pixelAt(t.canvas, 1, 0) !== hexOf(TG, 25)) return 'not drawn plain';
    const w = env.warnings.filter(function (m) { return m.indexOf('nope') !== -1; });
    if (w.length !== 1) return 'warnings ' + w.length;
  });

  check('TG.Gfx works without TG.Font (the placeholder has no letters) and without init', function () {
    const e2 = stubs.load({ files: ['js/core.js', 'js/gfx.js'], canvas: 'soft' });
    const c = e2.document.createElement('canvas');
    c.width = 20; c.height = 20;
    e2.TG.Gfx.draw(c.getContext('2d'), 'hero_run', 0, 10, 20);
    if (e2.errors.length) return e2.errors.join(' | ');
  });
})();

// ---------------------------------------------------------------------------------------------
// TG.Font (CONTRACT 4.10, DESIGN 14.7)
// ---------------------------------------------------------------------------------------------

(function fontTests() {
  const env = loadSoft(['js/core.js', 'js/font.js']);
  const TG = env.TG;
  const SET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?:;\'"-+/%()=*#';
  const SYM = { UP: '^', DOWN: '_', LEFT: '<', RIGHT: '>', CHEV_UP: '{', CHEV_DOWN: '}',
    HEART: '@', STAR: '&', DROP: '$', BLOCK: '|', RETURN: '~', COPY: '\u00a9' };

  check('Font.CELL is 8 and Font.SYM is the table of CONTRACT 4.10', function () {
    if (TG.Font.CELL !== 8) return 'CELL ' + TG.Font.CELL;
    if (JSON.stringify(TG.Font.SYM) !== JSON.stringify(SYM)) return JSON.stringify(TG.Font.SYM);
  });

  check('Font.has is true for every character, space, small letters and every symbol, and false otherwise', function () {
    const all = SET + ' abcxyz' + Object.keys(SYM).map(function (k) { return SYM[k]; }).join('');
    for (const ch of all) if (!TG.Font.has(ch)) return JSON.stringify(ch);
    if (TG.Font.has('\u00e9') || TG.Font.has('ab') || TG.Font.has('') || TG.Font.has(5)) return 'accepts something outside the set';
  });

  check('Font.measure is text.length * 8 * (scale || 1)', function () {
    if (TG.Font.measure('FROG') !== 32) return '1x';
    if (TG.Font.measure('FROG', 2) !== 64) return '2x';
    if (TG.Font.measure('AB', 4) !== 64) return '4x';
    if (TG.Font.measure('') !== 0) return 'empty';
  });

  // The 8x8 bitmap of one glyph, drawn with drawGlyph: rows of '#' and '.'.
  const t = canvasOf(env, 16, 16);
  function glyph(ch, color) {
    t.ctx.clearRect(0, 0, 16, 16);
    TG.Font.drawGlyph(t.ctx, ch, 4, 4, color === undefined ? 4 : color, 1);
    const rows = [];
    for (let y = 0; y < 8; y++) {
      let r = '';
      for (let x = 0; x < 8; x++) r += pixelAt(t.canvas, 4 + x, 4 + y) ? '#' : '.';
      rows.push(r);
    }
    // nothing outside the cell
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if ((x < 4 || x >= 12 || y < 4 || y >= 12) && pixelAt(t.canvas, x, y)) throw new Error(ch + ' draws outside its cell');
    }
    return rows;
  }
  function diff(a, b) {
    let n = 0;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (a[y][x] !== b[y][x]) n++;
    return n;
  }

  const chars = SET.split('').concat(Object.keys(SYM).map(function (k) { return SYM[k]; }));
  const bitmaps = {};
  chars.forEach(function (ch) { bitmaps[ch] = glyph(ch); });

  check('every character and symbol has a glyph with pixels, drawn within the top-left 7x7 of its cell', function () {
    const bad = [];
    chars.forEach(function (ch) {
      const b = bitmaps[ch];
      if (b.join('').indexOf('#') === -1) bad.push(ch + ' empty');
      if (b[7] !== '........' || b.some(function (r) { return r[7] !== '.'; })) bad.push(ch + ' uses row 7 or column 7');
    });
    if (bad.length) return bad.join(', ');
    const space = glyph(' ');
    if (space.join('').indexOf('#') !== -1) return 'space has pixels';
  });

  check('no two glyphs are identical', function () {
    const seen = {};
    const same = [];
    chars.forEach(function (ch) {
      const key = bitmaps[ch].join('/');
      if (seen[key]) same.push(seen[key] + ' = ' + ch);
      seen[key] = ch;
    });
    if (same.length) return same.join(', ');
  });

  [['O', 'Q', 'D', '0'], ['I', 'L', '1'], ['U', 'V'], ['M', 'N', 'W', 'H'], ['S', '5'], ['B', '8'], ['Z', '2'], ['G', 'C', '6']]
    .forEach(function (group) {
      check('the glyphs ' + group.join(', ') + ' differ from each other by at least 3 pixels', function () {
        const bad = [];
        for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
          const d = diff(bitmaps[group[i]], bitmaps[group[j]]);
          if (d < 3) bad.push(group[i] + '/' + group[j] + ' ' + d);
        }
        if (bad.length) return bad.join(', ');
      });
    });

  // The copyright sign of the title screens: a ring with a C inside it.
  check('the copyright glyph: TG.Font.SYM.COPY names it, it is a closed ring with a C inside, and it differs from every other glyph', function () {
    const ch = TG.Font.SYM.COPY;
    if (ch !== '\u00a9') return 'SYM.COPY is ' + JSON.stringify(ch);
    if (!TG.Font.has(ch)) return 'Font.has is false';
    const b = bitmaps[ch];
    if (!b) return 'not among the glyphs drawn';
    if (b.join('') === bitmaps['?'].join('')) return 'drawn as the unknown character';
    const near = chars.filter(function (o) { return o !== ch && diff(b, bitmaps[o]) < 3; });
    if (near.length) return 'within 3 pixels of ' + near.join(' ');
    // The ring is everything outside the middle 3 x 3: the same left to right and top to bottom, and
    // closed at the ends of the middle row and column. The C is in the middle 3 x 3, open to the right.
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const middle = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      if (!middle && (b[y][x] !== b[y][6 - x] || b[y][x] !== b[6 - y][x])) return 'the ring is not symmetric at ' + x + ',' + y;
    }
    if (b[3][0] !== '#' || b[3][6] !== '#' || b[0][3] !== '#' || b[6][3] !== '#') return 'the ring is open';
    if (b[3][2] !== '#' || b[3][3] !== '.' || b[3][4] !== '.') return 'no C opening to the right inside the ring';
    if (b[2][3] !== '#' || b[4][3] !== '#') return 'the C has no top or bottom stroke';
    if (TG.Font.measure(ch + ' 2026 DAVID SLEE') !== 17 * 8) return 'the copyright line is not 17 cells wide';
  });

  check('small letters are drawn as capitals and unknown characters as ?', function () {
    if (glyph('q').join('') !== bitmaps.Q.join('')) return 'q';
    if (glyph('\u00e9').join('') !== bitmaps['?'].join('')) return 'unknown';
    if (glyph('`').join('') !== bitmaps['?'].join('')) return 'backtick';
  });

  check('drawGlyph uses the colour given, WHITE by default in draw', function () {
    const c = canvasOf(env, 20, 12);
    TG.Font.drawGlyph(c.ctx, 'H', 0, 0, 18, 1);
    TG.Font.draw(c.ctx, 'H', 10, 0);
    if (pixelAt(c.canvas, 0, 0) !== hexOf(TG, 18)) return 'drawGlyph colour';
    if (pixelAt(c.canvas, 10, 0) !== hexOf(TG, 4)) return 'draw default';
  });

  function box(canvas) {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (pixelAt(canvas, x, y) !== null) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  check('Font.draw floors x and y and aligns left, center and right', function () {
    const a = canvasOf(env, 100, 20);
    TG.Font.draw(a.ctx, 'HH', 10.9, 3.6);                  // H spans columns 0-6 of its cell
    let b = box(a.canvas);
    if (!b || b.x !== 10 || b.y !== 3 || b.w !== 15) return 'left ' + JSON.stringify(b);
    const c = canvasOf(env, 100, 20);
    TG.Font.draw(c.ctx, 'HH', 50, 0, { align: 'center' });
    b = box(c.canvas);
    if (!b || b.x !== 42) return 'center ' + JSON.stringify(b);
    const r = canvasOf(env, 100, 20);
    TG.Font.draw(r.ctx, 'HH', 50, 0, { align: 'right' });
    b = box(r.canvas);
    if (!b || b.x !== 34 || b.x + b.w !== 49) return 'right ' + JSON.stringify(b);
  });

  check('Font.draw at scale 2 and 4 enlarges every pixel', function () {
    [2, 4].forEach(function (s) {
      const c = canvasOf(env, 80, 40);
      TG.Font.draw(c.ctx, 'L', 0, 0, { scale: s });
      const L1 = bitmaps.L;
      for (let y = 0; y < 8 * s; y++) for (let x = 0; x < 8 * s; x++) {
        const want = L1[Math.floor(y / s)][Math.floor(x / s)] === '#';
        if ((pixelAt(c.canvas, x, y) !== null) !== want) throw new Error('scale ' + s + ' at ' + x + ',' + y);
      }
    });
  });

  check('Font.draw with shadow puts an INK copy scale px right and down, under the text', function () {
    const c = canvasOf(env, 40, 40);
    TG.Font.draw(c.ctx, 'I', 0, 0, { scale: 2, shadow: true, color: 18 });
    // I: row 0 is '.######.', so pixel (2,0) is text and (14,2) is only shadow
    if (pixelAt(c.canvas, 2, 0) !== hexOf(TG, 18)) return 'text';
    if (pixelAt(c.canvas, 14, 2) !== hexOf(TG, 0)) return 'shadow';
    if (pixelAt(c.canvas, 0, 0) !== null) return 'shadow drawn at the text position';
  });

  check('Font.draw with rowColors gives each glyph row its own colour', function () {
    const c = canvasOf(env, 20, 20);
    const rows = [18, 18, 17, 17, 17, 25, 25, 25];
    TG.Font.draw(c.ctx, 'H', 0, 0, { rowColors: rows, color: 4 });
    for (let y = 0; y < 7; y++) if (pixelAt(c.canvas, 0, y) !== hexOf(TG, rows[y])) return 'row ' + y;
  });

  check('Font.draw ignores empty text, a missing context and bad coordinates', function () {
    const c = canvasOf(env, 20, 20);
    TG.Font.draw(c.ctx, '', 0, 0);
    TG.Font.draw(c.ctx, null, 0, 0);
    TG.Font.draw(null, 'A', 0, 0);
    TG.Font.draw(c.ctx, 'A', NaN, 0);
    if (box(c.canvas) !== null) return 'drew something';
    if (env.errors.length) return env.errors.join(' | ');
  });
})();

// ---------------------------------------------------------------------------------------------
// The WP-C sprites and remaps (CONTRACT 6.2 to 6.4 and the WP-C acceptance list)
// ---------------------------------------------------------------------------------------------

const envS = stubs.load({ files: ['js/core.js', 'js/sprites-chars.js'] });
const TGS = envS.TG;
const C = TGS.COLOR;
const manifestC = TGS.Sprites.MANIFEST.filter(function (m) { return m.owner === 'C'; });

function pixels(d, index) {
  let frame = d.frames[index];
  let flip = false;
  let guard = 0;
  while (frame && !Array.isArray(frame)) {
    if (frame.flipX) flip = !flip;
    frame = d.frames[frame.copy];
    if (++guard > d.frames.length) throw new Error('copy loop');
  }
  const rows = [];
  for (let y = 0; y < d.h; y++) {
    const row = [];
    for (let x = 0; x < d.w; x++) {
      const ch = frame[y].charAt(flip ? d.w - 1 - x : x);
      row.push(ch === '.' ? -1 : TGS.PAL_KEYS.indexOf(ch));
    }
    rows.push(row);
  }
  return rows;
}

function colorsOf(name) {
  const d = TGS.Sprites.get(name);
  const set = {};
  for (let f = 0; f < d.frames.length; f++) {
    const px = pixels(d, f);
    px.forEach(function (row) { row.forEach(function (c) { if (c >= 0) set[c] = true; }); });
  }
  return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
}

function nameOf(i) { return Object.keys(C).filter(function (k) { return C[k] === i; })[0]; }

check('TG.Sprites.missing("C") is empty', function () {
  const m = TGS.Sprites.missing('C');
  if (m.length) return m.join(', ');
});

check('sprites-chars.js defines exactly the WP-C sprites of the manifest, with owner C', function () {
  const names = TGS.Sprites.names();
  const want = manifestC.map(function (m) { return m.name; });
  const extra = names.filter(function (n) { return want.indexOf(n) === -1; });
  if (extra.length) return 'not in the manifest: ' + extra.join(', ');
  const wrong = names.filter(function (n) { return TGS.Sprites.get(n).owner !== 'C'; });
  if (wrong.length) return 'owner: ' + wrong.join(', ');
});

check('every WP-C sprite passes TG.Sprites.check', function () {
  const bad = [];
  manifestC.forEach(function (m) {
    const d = TGS.Sprites.get(m.name);
    const p = TGS.Sprites.check(d);
    if (p.length) bad.push(m.name + ': ' + p.join('; '));
  });
  if (bad.length) return bad.join(' | ');
});

check('every WP-C sprite has the size, frame names, fps and anchor of CONTRACT 6.4', function () {
  const bad = [];
  manifestC.forEach(function (m) {
    const d = TGS.Sprites.get(m.name);
    if (d.w !== m.w || d.h !== m.h) bad.push(m.name + ' size');
    if (JSON.stringify(d.names) !== JSON.stringify(m.names)) bad.push(m.name + ' names ' + d.names.join(' '));
    if (d.fps !== m.fps) bad.push(m.name + ' fps ' + d.fps);
    if (d.anchor[0] !== m.ax || d.anchor[1] !== m.ay) bad.push(m.name + ' anchor ' + d.anchor.join(','));
  });
  if (bad.length) return bad.join(', ');
});

// Colour limits (CONTRACT 6.2, DESIGN 4.2, 11.6 and 14.1).
const PIP = [C.INK, C.RED, C.TEAL, C.DEEP_TEAL, C.PEACH, C.WHITE];
const BOSS = [C.INK, C.SOIL, C.CLAY, C.PINK, C.GOLD, C.WHITE, C.RED];

check('Pip (hero_*) uses at most 5 colours plus INK: RED, TEAL, DEEP_TEAL, PEACH, WHITE', function () {
  const bad = [];
  const all = {};
  manifestC.filter(function (m) { return m.name.indexOf('hero_') === 0; }).forEach(function (m) {
    colorsOf(m.name).forEach(function (c) {
      all[c] = true;
      if (PIP.indexOf(c) === -1) bad.push(m.name + ' ' + nameOf(c));
    });
  });
  if (bad.length) return bad.join(', ');
  if (Object.keys(all).length > 6) return Object.keys(all).length + ' colours';
});

check('every enemy (en_*) and projectile (pr_*) uses at most 3 colours plus INK', function () {
  const bad = [];
  manifestC.filter(function (m) { return /^(en|pr)_/.test(m.name); }).forEach(function (m) {
    const cols = colorsOf(m.name).filter(function (c) { return c !== C.INK; });
    if (cols.length > 3) bad.push(m.name + ': ' + cols.map(nameOf).join(' '));
  });
  if (bad.length) return bad.join(' | ');
});

check('the ink effects (ink_*) use at most 4 colours plus INK', function () {
  const bad = [];
  ['ink_bolt', 'ink_spark'].forEach(function (n) {
    const cols = colorsOf(n).filter(function (c) { return c !== C.INK; });
    if (cols.length > 4) bad.push(n + ': ' + cols.map(nameOf).join(' '));
  });
  if (bad.length) return bad.join(' | ');
});

check('the boss parts together use at most SOIL, CLAY, PINK, GOLD, WHITE, RED and INK, plus CREAM on boss_head', function () {
  const bad = [];
  manifestC.filter(function (m) { return m.name.indexOf('boss_') === 0; }).forEach(function (m) {
    colorsOf(m.name).forEach(function (c) {
      if (BOSS.indexOf(c) !== -1) return;
      if (c === C.CREAM && m.name === 'boss_head') return;
      bad.push(m.name + ' ' + nameOf(c));
    });
  });
  if (bad.length) return bad.join(', ');
});

check('boss_head has CREAM pixels in all four frames and no other boss part has any', function () {
  const d = TGS.Sprites.get('boss_head');
  for (let f = 0; f < 4; f++) {
    const n = pixels(d, f).reduce(function (a, row) { return a + row.filter(function (c) { return c === C.CREAM; }).length; }, 0);
    if (n === 0) return 'frame ' + d.names[f] + ' has no CREAM';
  }
  const other = manifestC.filter(function (m) { return m.name.indexOf('boss_') === 0 && m.name !== 'boss_head'; })
    .filter(function (m) { return colorsOf(m.name).indexOf(C.CREAM) !== -1; });
  if (other.length) return other.map(function (m) { return m.name; }).join(', ');
});

check('the remaps white, gold and lampred have the values of CONTRACT 6.3', function () {
  if (JSON.stringify(stubs.plain(TGS.Remaps.white)) !== JSON.stringify({ '*': 4 })) return 'white';
  if (JSON.stringify(stubs.plain(TGS.Remaps.gold)) !== JSON.stringify({ 24: 16, 25: 18 })) return 'gold ' + JSON.stringify(TGS.Remaps.gold);
  if (JSON.stringify(stubs.plain(TGS.Remaps.lampred)) !== JSON.stringify({ 19: 25 })) return 'lampred';
});

// Rough brightness of a palette entry, to check that `dim` darkens.
function luma(TG, i) {
  const n = parseInt(TG.PAL[i].slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

check('the remap dim maps all 32 colours to STONE, SHADOW or INK, never to a lighter colour', function () {
  const dim = TGS.Remaps.dim;
  const bad = [];
  for (let i = 0; i < 32; i++) {
    const to = dim[i];
    if ([0, 1, 2].indexOf(to) === -1) { bad.push(i + '->' + to); continue; }
    if (luma(TGS, to) > luma(TGS, i) + 0.001) bad.push(nameOf(i) + ' gets lighter');
  }
  if (Object.keys(dim).length !== 32) bad.push(Object.keys(dim).length + ' entries');
  if (bad.length) return bad.join(', ');
});

check('boss_head drawn with lampred differs from the plain frame only where it was CREAM; the GOLD helmet is unchanged', function () {
  const env = loadSoft();
  const TG = env.TG;
  const cream = hexOf(TG, C.CREAM), red = hexOf(TG, C.RED), gold = hexOf(TG, C.GOLD);
  for (let f = 0; f < 4; f++) {
    const a = TG.Gfx.get('boss_head', f), b = TG.Gfx.get('boss_head', f, { remap: 'lampred' });
    let creams = 0, golds = 0;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 32; x++) {
      const pa = pixelAt(a, x, y), pb = pixelAt(b, x, y);
      if (pa === cream) { creams++; if (pb !== red) return 'frame ' + f + ' CREAM not RED at ' + x + ',' + y; }
      else if (pa !== pb) return 'frame ' + f + ' differs at ' + x + ',' + y;
      if (pa === gold) golds++;
    }
    if (creams === 0 || golds === 0) return 'frame ' + f + ' has no lamp or no helmet';
  }
});

check('hero_run drawn with gold turns RED to GOLD and changes nothing else', function () {
  const env = loadSoft();
  const TG = env.TG;
  const red = hexOf(TG, C.RED), gold = hexOf(TG, C.GOLD);
  const a = TG.Gfx.get('hero_run', 0), b = TG.Gfx.get('hero_run', 0, { remap: 'gold' });
  let reds = 0;
  for (let y = 0; y < 24; y++) for (let x = 0; x < 16; x++) {
    const pa = pixelAt(a, x, y), pb = pixelAt(b, x, y);
    if (pa === red) { reds++; if (pb !== gold) return 'RED not GOLD at ' + x + ',' + y; }
    else if (pa !== pb) return 'differs at ' + x + ',' + y;
  }
  if (reds === 0) return 'no RED in Pip';
});

// Outline rule (CONTRACT 6.2): every opaque pixel that touches a transparent pixel (left, right, above
// or below) or the frame edge is INK. Reported as a warning list; at most 5% of the edge pixels of a
// sprite may differ. hero_cast's bottom row lies on the run frame and is not an outer edge.
check('the outline rule holds for every WP-C sprite (at most 5% of edge pixels may differ)', function () {
  const over = [];
  manifestC.forEach(function (m) {
    const d = TGS.Sprites.get(m.name);
    let edge = 0, bad = 0;
    const where = [];
    for (let f = 0; f < d.frames.length; f++) {
      const px = pixels(d, f);
      for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
        if (px[y][x] < 0) continue;
        const bottomOpen = m.name === 'hero_cast' && y === d.h - 1;
        const touches = x === 0 || x === d.w - 1 || y === 0 || (y === d.h - 1 && !bottomOpen) ||
          px[y][x - 1] < 0 || px[y][x + 1] < 0 || (y > 0 && px[y - 1][x] < 0) || (y < d.h - 1 && px[y + 1][x] < 0);
        if (!touches) continue;
        edge++;
        if (px[y][x] !== C.INK) { bad++; where.push(d.names[f] + ' ' + x + ',' + y); }
      }
    }
    if (bad > 0) warnings.push(m.name + ': ' + bad + ' of ' + edge + ' edge pixels are not INK (' + where.slice(0, 6).join('; ') + ')');
    if (bad > edge * 0.05) over.push(m.name + ' ' + bad + '/' + edge);
  });
  if (over.length) return over.join(', ');
});

// Ground line (CONTRACT 13.6): frames of one sprite keep the same ground line.
function lowestRow(px) {
  for (let y = px.length - 1; y >= 0; y--) if (px[y].some(function (c) { return c >= 0; })) return y;
  return -1;
}

check('standing frames keep their ground line on the bottom row of the frame', function () {
  const standing = {
    hero_run: 'all', hero_idle: 'all', hero_hurt: 'all', hero_sit: 'all', hero_slide: 'all', hero_win: [0, 1],
    en_boulder: 'all', en_dawdle: [0, 1], en_hoppet: [0], en_truffle: 'all', en_digby: [0, 1], en_mound: 'all',
    boss_mound: 'all', pr_shock: 'all'
  };
  const bad = [];
  Object.keys(standing).forEach(function (n) {
    const d = TGS.Sprites.get(n);
    const list = standing[n] === 'all' ? d.frames.map(function (f, i) { return i; }) : standing[n];
    list.forEach(function (i) {
      const low = lowestRow(pixels(d, i));
      if (low !== d.h - 1) bad.push(n + ' ' + d.names[i] + ' ends on row ' + low);
    });
  });
  if (bad.length) return bad.join(', ');
});

check('the frames of every animated sprite differ enough to read as movement (8 pixels or more between neighbours)', function () {
  const bad = [];
  manifestC.forEach(function (m) {
    const d = TGS.Sprites.get(m.name);
    if (d.frames.length < 2) return;
    for (let f = 0; f < d.frames.length; f++) {
      const g = (f + 1) % d.frames.length;
      if (d.frames.length === 2 && f === 1) break;
      const a = pixels(d, f), b = pixels(d, g);
      let n = 0;
      for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (a[y][x] !== b[y][x]) n++;
      if (n < 8) bad.push(m.name + ' ' + d.names[f] + '/' + d.names[g] + ' ' + n);
    }
  });
  if (bad.length) return bad.join(', ');
});

check('the six hero_run frames are all different', function () {
  const d = TGS.Sprites.get('hero_run');
  const keys = d.frames.map(function (f, i) { return JSON.stringify(pixels(d, i)); });
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) if (keys[i] === keys[j]) return d.names[i] + ' = ' + d.names[j];
});

check('hero_cast covers every opaque pixel of rows 0-11 of every hero_run frame', function () {
  const cast = pixels(TGS.Sprites.get('hero_cast'), 0);
  const run = TGS.Sprites.get('hero_run');
  for (let f = 0; f < 6; f++) {
    const px = pixels(run, f);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) {
      if (px[y][x] >= 0 && cast[y][x] < 0) return run.names[f] + ' ' + x + ',' + y;
    }
  }
});

check('hero_slide fits under a branch: no opaque pixel higher than HANG_CLEAR above the ground line', function () {
  const d = TGS.Sprites.get('hero_slide');
  const top = d.anchor[1] - TGS.C.HANG_CLEAR;       // first row that may be opaque
  for (let f = 0; f < d.frames.length; f++) {
    const px = pixels(d, f);
    for (let y = 0; y < top; y++) if (px[y].some(function (c) { return c >= 0; })) return d.names[f] + ' row ' + y;
  }
});

check('boss_arm is drawn as the left arm: its hand is on the left half in every frame', function () {
  const d = TGS.Sprites.get('boss_arm');
  for (let f = 0; f < 3; f++) {
    const px = pixels(d, f);
    let left = 0, right = 0;
    px.forEach(function (row) { row.forEach(function (c, x) { if (c === C.PINK) { if (x < 8) left++; else right++; } }); });
    if (left <= right) return d.names[f];
  }
});

// ---------------------------------------------------------------------------------------------
// Drawing every WP-C frame through TG.Gfx on the software canvas (and the optional sheet)
// ---------------------------------------------------------------------------------------------

check('TG.Gfx draws every frame of every WP-C sprite at scales 1 to 4, plain, flipped and with each remap', function () {
  const env = loadSoft();
  const TG = env.TG;
  const t = canvasOf(env, 256, 256);
  manifestC.forEach(function (m) {
    for (let f = 0; f < m.frames; f++) {
      [1, 2, 3, 4].forEach(function (s) { TG.Gfx.draw(t.ctx, m.name, f, 128, 160, { scale: s }); });
      TG.Gfx.draw(t.ctx, m.name, f, 128, 160, { flipX: true });
      ['white', 'gold', 'dim', 'lampred'].forEach(function (r) { TG.Gfx.draw(t.ctx, m.name, f, 128, 160, { remap: r }); });
    }
  });
  if (env.warnings.length || env.errors.length) return env.warnings.concat(env.errors).join(' | ');
});

const sheetAt = process.argv.indexOf('--sheet');
if (sheetAt !== -1) {
  check('draws the WP-C sheet at 4x with TG.Gfx and TG.Font', function () {
    const out = process.argv[sheetAt + 1];
    if (!out) return 'no file name after --sheet';
    const png = require('../tools/png');
    const env = loadSoft();
    const TG = env.TG;
    const S = 4, PAD = 8;
    const W = 1400;
    let x = PAD, y = PAD, rowH = 0;
    const places = [];
    manifestC.forEach(function (m) {
      for (let f = 0; f < m.frames; f++) {
        const w = m.w * S, h = m.h * S + 12;
        if (x + w + PAD > W) { x = PAD; y += rowH + PAD; rowH = 0; }
        places.push({ m: m, f: f, x: x, y: y });
        x += Math.max(w, 64) + PAD;
        rowH = Math.max(rowH, h);
      }
    });
    const H = y + rowH + PAD;
    const t = canvasOf(env, W, H);
    TG.Gfx.rect(t.ctx, 0, 0, W, H, 1);
    places.forEach(function (p) {
      TG.Gfx.rect(t.ctx, p.x, p.y, p.m.w * S, p.m.h * S, 7);
      TG.Gfx.draw(t.ctx, p.m.name, p.f, p.x, p.y, { scale: S, anchor: false });
      // '_' is the DOWN arrow in TG.Font, so the label leaves out the prefix of the name
      const label = (p.m.name.split('_').slice(1).join(' ') + ' ' + p.m.names[p.f]).toUpperCase();
      TG.Font.draw(t.ctx, label.slice(0, Math.floor(Math.max(p.m.w * S, 64) / 8)), p.x, p.y + p.m.h * S + 2, { color: 3 });
    });
    png.write(out, W, H, t.canvas.toRGBA());
    console.log('# sheet written to ' + path.resolve(out));
  });
}

// ---------------------------------------------------------------------------------------------

warnings.forEach(function (w) { console.log('# warning: ' + w); });
console.log('test-gfx: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
