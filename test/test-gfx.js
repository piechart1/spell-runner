// test/test-gfx.js
// Tests for WP-C: js/gfx.js (TG.Gfx), js/font.js (TG.Font) and js/sprites-chars.js (the character
// sprites and the remaps white, gold, dim, lampred and tin). CONTRACT 4.9, 4.10, 6.1 to 6.4, 12 (WP-C
// acceptance) and 13.2 (canvas subset). The Level 2 sprites and their rules are LEVEL2 2, 3.1, 3.5 and
// Appendix C.
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
// The WP-C sprites that are defined. A manifest row with no definition is reported by the checks on
// TG.Sprites.missing, TG.Sprites.check, the manifest's fields and the drawing of every frame. The checks
// of the art itself run over the sprites that exist, so that a missing sprite does not hide what they say
// about the others.
const definedC = manifestC.filter(function (m) { return TGS.Sprites.has(m.name); });

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
    if (!d) { bad.push(m.name + ' undefined'); return; }
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
  definedC.filter(function (m) { return /^(en|pr)_/.test(m.name); }).forEach(function (m) {
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

// tin is not the table of LEVEL2 Appendix C (GRASS to BRONZE, LIME to GOLD, WHITE to SILVER): a BRONZE and
// GOLD frog was lost on the brass floor of the Gear Hall, and that table left the lily pad's FOREST
// underside green. CONTRACT 6.3 has the pairs that are checked here.
check('the remap tin has the values of CONTRACT 6.3: GRASS to SILVER, LIME to WHITE, WHITE to GOLD, FOREST to STONE', function () {
  if (JSON.stringify(stubs.plain(TGS.Remaps.tin)) !== JSON.stringify({ 4: 18, 13: 2, 14: 3, 15: 4 })) return 'tin ' + JSON.stringify(TGS.Remaps.tin);
  if (C.WHITE !== 4 || C.GOLD !== 18 || C.GRASS !== 14 || C.SILVER !== 3 || C.LIME !== 15 || C.FOREST !== 13 || C.STONE !== 2) return 'the palette indices are not those of the table';
});

// The rows of the first table under a heading of docs/CONTRACT.md whose header starts with `firstCell`, as
// lists of cells; null when the document is not there.
function contractRows(heading, firstCell) {
  let text;
  try { text = fs.readFileSync(path.join(stubs.ROOT, 'docs', 'CONTRACT.md'), 'utf8'); } catch (e) { return null; }
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

// A Content cell of CONTRACT 6.3 that gives its pairs, as in `{ 25: 18, 24: 16 }` (RED to GOLD, MAROON to
// BRONZE): { table, words }, both as index to index. null for a cell that describes its table in words only.
function remapCell(cell, COLOR) {
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
      if (!ab || COLOR[ab[1]] === undefined || COLOR[ab[2]] === undefined) throw new Error('pair not understood: ' + w.trim());
      words[COLOR[ab[1]]] = COLOR[ab[2]];
    });
  }
  return { table: table, words: words };
}

(function () {
  const title = 'doc: the WP-C rows of CONTRACT 6.3 name the remaps of js/sprites-chars.js, and each row that gives its pairs has those of TG.Remaps, in numbers and in words';
  const rows = contractRows('### 6.3 Remaps', 'Name');
  if (rows === null) { console.log('skip - ' + title + ' (docs/CONTRACT.md is not present)'); return; }
  check(title, function () {
    const mine = rows.filter(function (r) { return r[1] === 'WP-C'; });
    const docNames = mine.map(function (r) { return r[0].replace(/`/g, ''); });
    const codeNames = Object.keys(TGS.Remaps);
    if (JSON.stringify(docNames.slice().sort()) !== JSON.stringify(codeNames.slice().sort())) return 'the document has ' + docNames.join(' ') + '; the code has ' + codeNames.join(' ');
    const bad = [];
    let read = 0;
    mine.forEach(function (r, i) {
      const got = remapCell(r[3], C);
      if (!got) return;
      read++;
      const code = JSON.stringify(stubs.plain(TGS.Remaps[docNames[i]]));
      if (JSON.stringify(got.table) !== code) bad.push(docNames[i] + ': the document has ' + JSON.stringify(got.table) + ', the code ' + code);
      if (got.words && JSON.stringify(got.words) !== code) bad.push(docNames[i] + ': the words of the document give ' + JSON.stringify(got.words) + ', the code ' + code);
    });
    if (read < 4) bad.push('only ' + read + ' of the rows give their pairs (white, gold, lampred and tin do)');
    if (bad.length) return bad.join(' | ');
  });
})();

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

check('en_hoppet drawn with tin turns GRASS to SILVER, LIME to WHITE and WHITE to GOLD, and changes nothing else', function () {
  const env = loadSoft();
  const TG = env.TG;
  const pairs = [[C.GRASS, C.SILVER], [C.LIME, C.WHITE], [C.WHITE, C.GOLD]].map(function (p) { return [hexOf(TG, p[0]), hexOf(TG, p[1])]; });
  const d = TG.Sprites.get('en_hoppet');
  const seen = [0, 0, 0];
  for (let f = 0; f < d.frames.length; f++) {
    const a = TG.Gfx.get('en_hoppet', f), b = TG.Gfx.get('en_hoppet', f, { remap: 'tin' });
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
      const pa = pixelAt(a, x, y), pb = pixelAt(b, x, y);
      let want = pa;
      pairs.forEach(function (p, i) { if (pa === p[0]) { want = p[1]; seen[i]++; } });
      if (pb !== want) return d.names[f] + ' at ' + x + ',' + y + ': ' + pa + ' became ' + pb;
    }
  }
  if (seen.indexOf(0) !== -1) return 'the frog has no GRASS, no LIME or no WHITE';
});

// The lily pad a cleared frog leaves is drawn with tin as well (LEVEL2 4.1). It is a WP-D sprite, so this
// check loads js/sprites-world.js beside the WP-C file; without that file it is skipped.
(function () {
  const title = 'fx_lilypad under tin: every colour of the pad but INK is in the table, so no green is left on the tin disc';
  const env = stubs.load({ files: ['js/core.js', 'js/sprites-chars.js', 'js/sprites-world.js'] });
  if (!env.TG.Sprites.get('fx_lilypad')) { console.log('skip - ' + title + ' (js/sprites-world.js is not present)'); return; }
  check(title, function () {
    const d = env.TG.Sprites.get('fx_lilypad'), tin = env.TG.Remaps.tin;
    const left = {};
    let opaque = 0;
    for (let f = 0; f < d.frames.length; f++) pixels(d, f).forEach(function (row) {
      row.forEach(function (c) { if (c >= 0) { opaque++; if (c !== C.INK && tin[c] === undefined) left[nameOf(c)] = true; } });
    });
    if (opaque === 0) return 'the pad has no pixels';
    if (Object.keys(left).length) return 'not in tin: ' + Object.keys(left).join(' ');
    const greens = [C.GRASS, C.LIME, C.FOREST, C.PINE].filter(function (g) { return Object.keys(tin).some(function (k) { return tin[k] === g; }); });
    if (greens.length) return 'tin maps a colour to ' + greens.map(nameOf).join(' ');
  });
})();

// Outline rule (CONTRACT 6.2): every opaque pixel that touches a transparent pixel (left, right, above
// or below) or the frame edge is INK. Reported as a warning list; at most 5% of the edge pixels of a
// sprite may differ. hero_cast's bottom row lies on the run frame and is not an outer edge.
check('the outline rule holds for every WP-C sprite (at most 5% of edge pixels may differ)', function () {
  const over = [];
  definedC.forEach(function (m) {
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
    boss_mound: 'all', pr_shock: 'all',
    // Level 2: a sprite drawn in the place of one of the above keeps its ground line
    en_baronet: [0, 1], boss2_engine: 'all', pr_rollgear: 'all'
  };
  const bad = [];
  Object.keys(standing).forEach(function (n) {
    const d = TGS.Sprites.get(n);
    if (!d) return;
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
  definedC.forEach(function (m) {
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
// Level 2 (LEVEL2 2, 3.1, 3.5 and Appendix C): the rules that hold for every new WP-C sprite. A sprite
// that is not defined yet is passed over here; TG.Sprites.missing("C") reports it.
// ---------------------------------------------------------------------------------------------

const LEVEL2_C = ['en_dangle', 'en_flit', 'en_glimmer', 'en_baronet', 'boss2_body', 'boss2_head', 'boss2_arm', 'boss2_key',
  'boss2_engine', 'boss2_goggles', 'pr_cog', 'pr_rollgear', 'pr_pendulum'];

check('the 13 Level 2 sprites of WP-C are in the manifest', function () {
  const names = manifestC.map(function (m) { return m.name; });
  const absent = LEVEL2_C.filter(function (n) { return names.indexOf(n) === -1; });
  if (absent.length) return absent.join(', ');
});

// Rule 2 of LEVEL2 3.1. These sprites are drawn without a section's remap on PLUM and on DEEP_BLUE, where
// an INK outline does not separate a sprite from the backdrop, so none is drawn in a colour of the bands.
check('no Level 2 creature, projectile or boss part uses PLUM, DEEP_BLUE, SHADOW, MAROON or DEEP_TEAL', function () {
  const BAND = [C.PLUM, C.DEEP_BLUE, C.SHADOW, C.MAROON, C.DEEP_TEAL];
  const bad = [];
  LEVEL2_C.filter(function (n) { return TGS.Sprites.has(n); }).forEach(function (n) {
    colorsOf(n).forEach(function (c) { if (BAND.indexOf(c) !== -1) bad.push(n + ' ' + nameOf(c)); });
  });
  if (bad.length) return bad.join(', ');
});

check('Lady Ratchet\'s parts together use at most STONE, TEAL, GOLD, PINK, WHITE, BRONZE and INK, plus CREAM on the lenses', function () {
  const BOSS2 = [C.INK, C.STONE, C.TEAL, C.GOLD, C.PINK, C.WHITE, C.BRONZE];
  const LENSES = ['boss2_head', 'boss2_goggles'];      // the two parts that show her goggles
  const bad = [];
  definedC.filter(function (m) { return m.name.indexOf('boss2_') === 0; }).forEach(function (m) {
    colorsOf(m.name).forEach(function (c) {
      if (BOSS2.indexOf(c) !== -1) return;
      if (c === C.CREAM && LENSES.indexOf(m.name) !== -1) return;
      bad.push(m.name + ' ' + nameOf(c));
    });
  });
  if (bad.length) return bad.join(', ');
});

// ===== LEVEL 2: creatures (LEVEL2 3.5, 4.2, 4.4) =====

// Dangle, Flit, Glimmer and the Baronet. The checks are in a function of their own, so that their names
// do not meet those of the region that follows.
(function () {
  // LEVEL2 Appendix C: name, w, h, frame names, fps, anchor x and y, and the Level 1 sprite whose row it copies.
  const ROWS = [
    ['en_dangle', 16, 16, 'hang0 hang1 zip', 4, 8, 16, null],
    ['en_flit', 24, 16, 'flap0 flap1 dive', 8, 12, 16, 'en_swoop'],
    ['en_glimmer', 16, 16, 'fly0 fly1', 16, 8, 16, 'en_buzzle'],
    ['en_baronet', 16, 16, 'peek up spin', 0, 8, 16, 'en_digby']
  ];
  // LEVEL2 3.5: the three colours of each, beside INK.
  const COLOURS = {
    en_dangle: ['LILAC', 'VIOLET', 'WHITE'],
    en_flit: ['LILAC', 'VIOLET', 'CREAM'],
    en_glimmer: ['AQUA', 'CREAM', 'TEAL'],
    en_baronet: ['GOLD', 'SOIL', 'WHITE']
  };
  const defined = ROWS.filter(function (r) { return TGS.Sprites.has(r[0]); });

  function frame(name, frameName) {
    const d = TGS.Sprites.get(name);
    return pixels(d, d.names.indexOf(frameName));
  }
  // The pixels of one colour in a frame, as 'x,y' strings in reading order.
  function places(px, color) {
    const list = [];
    px.forEach(function (row, y) { row.forEach(function (c, x) { if (c === color) list.push(x + ',' + y); }); });
    return list;
  }
  function meanX(list) {
    return list.reduce(function (a, p) { return a + Number(p.split(',')[0]); }, 0) / list.length;
  }
  // Contrast of two palette entries, as WCAG defines it (1 to 21).
  function lightOf(i) {
    const n = parseInt(TGS.PAL[i].slice(1), 16);
    const lin = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  }
  function contrast(a, b) {
    const x = lightOf(a), y = lightOf(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  // A colour that carries a sprite on both bands of Level 2 (LEVEL2 3.1 gives LILAC as 5.7 and 5.1 to 1).
  function carries(c) { return c !== C.INK && contrast(c, C.PLUM) >= 3 && contrast(c, C.DEEP_BLUE) >= 3; }

  check('the four Level 2 creatures have the size, frame names, fps and anchor of LEVEL2 Appendix C', function () {
    const bad = [];
    defined.forEach(function (r) {
      const d = TGS.Sprites.get(r[0]);
      if (d.w !== r[1] || d.h !== r[2]) bad.push(r[0] + ' size ' + d.w + 'x' + d.h);
      if (d.names.join(' ') !== r[3]) bad.push(r[0] + ' names ' + d.names.join(' '));
      if (d.fps !== r[4]) bad.push(r[0] + ' fps ' + d.fps);
      if (d.anchor[0] !== r[5] || d.anchor[1] !== r[6]) bad.push(r[0] + ' anchor ' + d.anchor.join(','));
      if (d.owner !== 'C') bad.push(r[0] + ' owner ' + d.owner);
    });
    if (bad.length) return bad.join(', ');
  });

  check('the skins rule: en_flit, en_glimmer and en_baronet have the size, frame names, fps and anchor of en_swoop, en_buzzle and en_digby', function () {
    const bad = [];
    defined.filter(function (r) { return r[7]; }).forEach(function (r) {
      const a = TGS.Sprites.get(r[0]), b = TGS.Sprites.get(r[7]);
      ['w', 'h', 'fps'].forEach(function (k) { if (a[k] !== b[k]) bad.push(r[0] + ' ' + k + ' ' + a[k] + ', ' + r[7] + ' ' + b[k]); });
      if (a.names.join(' ') !== b.names.join(' ')) bad.push(r[0] + ' names ' + a.names.join(' '));
      if (a.anchor.join(',') !== b.anchor.join(',')) bad.push(r[0] + ' anchor ' + a.anchor.join(','));
    });
    if (bad.length) return bad.join(', ');
  });

  check('each Level 2 creature uses the three colours LEVEL2 3.5 gives it, and INK: all three, and no other', function () {
    const bad = [];
    defined.forEach(function (r) {
      const got = colorsOf(r[0]).filter(function (c) { return c !== C.INK; }).map(nameOf).sort().join(' ');
      const want = COLOURS[r[0]].slice().sort().join(' ');
      if (got !== want) bad.push(r[0] + ': ' + got + ' (want ' + want + ')');
    });
    if (bad.length) return bad.join(' | ');
  });

  // Rule 2 of LEVEL2 3.1 as a number. An INK outline does not show on PLUM or DEEP_BLUE, and neither VIOLET
  // nor SOIL has a contrast of 3 to 1 against them, so a frame must have enough of a colour that does. The
  // Baronet's spin is the Digby's case: the GOLD helmet has flown off, and the WHITE of his moustache and
  // eyebrows is what is left to carry him.
  check('rule 2 of LEVEL2 3.1: in every frame of a Level 2 creature a third or more of the coloured pixels read at 3 to 1 on PLUM and on DEEP_BLUE (the Baronet\'s spin: his WHITE moustache and eyebrows, 12 pixels or more)', function () {
    const bad = [];
    defined.forEach(function (r) {
      const d = TGS.Sprites.get(r[0]);
      d.names.forEach(function (n, f) {
        let coloured = 0, light = 0;
        pixels(d, f).forEach(function (row) {
          row.forEach(function (c) { if (c > 0) { coloured++; if (carries(c)) light++; } });
        });
        if (r[0] === 'en_baronet' && n === 'spin') { if (light < 12) bad.push(r[0] + ' ' + n + ' ' + light); }
        else if (light * 3 < coloured) bad.push(r[0] + ' ' + n + ' ' + light + ' of ' + coloured);
      });
    });
    if (bad.length) return bad.join(', ');
  });

  check('the frames of a Level 2 creature keep its proportions: Dangle\'s eyes, Flit\'s eyes and ears, Glimmer\'s body and the Baronet\'s moustache are in the same place in the frames that alternate', function () {
    const pairs = [
      ['en_dangle', 'hang0', 'hang1', C.WHITE, 0],
      ['en_flit', 'flap0', 'flap1', C.CREAM, 0],
      ['en_glimmer', 'fly0', 'fly1', C.CREAM, 0],
      ['en_baronet', 'peek', 'up', C.WHITE, 9]      // from row 9 down: the moustache, under the helmet in both
    ];
    const bad = [];
    pairs.filter(function (p) { return TGS.Sprites.has(p[0]); }).forEach(function (p) {
      const fromRow = function (s) { return Number(s.split(',')[1]) >= p[4]; };
      const a = places(frame(p[0], p[1]), p[3]).filter(fromRow), b = places(frame(p[0], p[2]), p[3]).filter(fromRow);
      if (a.length === 0 || a.join(' ') !== b.join(' ')) bad.push(p[0] + ' ' + p[1] + '/' + p[2]);
    });
    if (bad.length) return bad.join(', ');
  });

  check('the Level 2 creatures face left: Dangle\'s and Flit\'s eyes are left of the middle of the body, Flit\'s head leads its wings in the dive, Glimmer\'s head is left of its tail, the Baronet\'s monocle is on the left half', function () {
    const bad = [];
    if (TGS.Sprites.has('en_dangle')) {
      ['hang0', 'hang1', 'zip'].forEach(function (n) {
        const px = frame('en_dangle', n);
        if (!(meanX(places(px, C.WHITE)) < meanX(places(px, C.LILAC)))) bad.push('en_dangle ' + n);
      });
    }
    if (TGS.Sprites.has('en_flit')) {
      ['flap0', 'flap1'].forEach(function (n) {
        const px = frame('en_flit', n);
        if (!(meanX(places(px, C.CREAM)) < meanX(places(px, C.VIOLET)))) bad.push('en_flit ' + n);
      });
      const dive = frame('en_flit', 'dive');
      if (!(meanX(places(dive, C.CREAM)) + 4 < meanX(places(dive, C.LILAC)))) bad.push('en_flit dive');
    }
    if (TGS.Sprites.has('en_glimmer')) {
      ['fly0', 'fly1'].forEach(function (n) {
        const body = places(frame('en_glimmer', n), C.CREAM);
        if (!(meanX(body.slice(0, 4)) < meanX(body.slice(-4)))) bad.push('en_glimmer ' + n);
      });
    }
    if (TGS.Sprites.has('en_baronet')) {
      const up = frame('en_baronet', 'up');
      const brim = up.reduce(function (best, row, y) { return places([row], C.GOLD).length >= 12 ? y : best; }, -1);
      const rim = places(up, C.GOLD).filter(function (s) { return Number(s.split(',')[1]) > brim; });
      if (brim < 0 || rim.length === 0 || !(meanX(rim) < 8)) bad.push('en_baronet up');
    }
    if (bad.length) return bad.join(', ');
  });

  check('en_dangle: the thread the renderer draws meets the sprite: the top row is opaque at the anchor\'s x and beside it, in every frame', function () {
    const d = TGS.Sprites.get('en_dangle');
    if (!d) return;
    for (let f = 0; f < d.frames.length; f++) {
      const top = pixels(d, f)[0];
      if (top[d.anchor[0]] < 0 || top[d.anchor[0] - 1] < 0) return d.names[f];
    }
  });

  check('en_glimmer sits in the bee\'s box: no opaque pixel below the lowest row of en_buzzle, and it fills the box to that row', function () {
    const g = TGS.Sprites.get('en_glimmer'), b = TGS.Sprites.get('en_buzzle');
    if (!g) return;
    const low = Math.max(lowestRow(pixels(b, 0)), lowestRow(pixels(b, 1)));
    for (let f = 0; f < g.frames.length; f++) {
      const row = lowestRow(pixels(g, f));
      if (row !== low) return g.names[f] + ' ends on row ' + row + ', the bee on row ' + low;
    }
  });

  check('en_baronet: GOLD (the helmet) in peek and up and none in spin; the helmet sits lower in peek, where no monocle shows under its brim', function () {
    if (!TGS.Sprites.has('en_baronet')) return;
    const peek = frame('en_baronet', 'peek'), up = frame('en_baronet', 'up'), spin = frame('en_baronet', 'spin');
    const brimOf = function (px) { return px.reduce(function (best, row, y) { return places([row], C.GOLD).length >= 12 ? y : best; }, -1); };
    const below = function (px) { const b = brimOf(px); return places(px, C.GOLD).filter(function (s) { return Number(s.split(',')[1]) > b; }).length; };
    if (places(spin, C.GOLD).length !== 0) return 'spin has GOLD';
    if (brimOf(peek) < 0 || brimOf(up) < 0) return 'no helmet brim (a row with 12 or more GOLD pixels)';
    if (!(brimOf(peek) > brimOf(up))) return 'the brim is on row ' + brimOf(peek) + ' in peek and row ' + brimOf(up) + ' in up';
    if (below(peek) !== 0) return 'peek has GOLD under the brim';
    if (below(up) < 4) return 'up has no monocle rim under the brim';
    if (places(spin, C.WHITE).length < 12) return 'spin has lost the moustache';
  });

  // js/render.js draws en_mound in front of a risen mole, at the same x and ground line, so the mound's 8
  // rows lie over rows 8 to 15 of the Baronet. What says "the Baron" must show above it or beside it.
  check('en_baronet up behind en_mound: the monocle is clear of the mound, and 3 or more WHITE pixels of the moustache show on each side of it', function () {
    if (!TGS.Sprites.has('en_baronet')) return;
    const up = frame('en_baronet', 'up'), mound = pixels(TGS.Sprites.get('en_mound'), 0);
    const hidden = function (x, y) { return y >= 8 && mound[y - 8][x] >= 0; };
    const brim = up.reduce(function (best, row, y) { return places([row], C.GOLD).length >= 12 ? y : best; }, -1);
    let left = 0, right = 0;
    for (let y = brim + 1; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (up[y][x] === C.GOLD && hidden(x, y)) return 'the monocle is behind the mound at ' + x + ',' + y;
        if (up[y][x] === C.WHITE && y >= 9 && !hidden(x, y)) { if (x < 8) left++; else right++; }
      }
    }
    if (left < 3 || right < 3) return 'beside the mound the moustache shows ' + left + ' pixels on the left and ' + right + ' on the right';
  });

  // The dive is one wing swept back from the shoulder, not two blades: every row holds one unbroken run
  // of wing (LILAC with its VIOLET bones), and the end of that run goes in and out down the frame, as the
  // scalloped edge of the flap frames does.
  check('en_flit dive: the wing is one membrane in every row, and its trailing edge turns twice or more (scallops)', function () {
    if (!TGS.Sprites.has('en_flit')) return;
    const px = frame('en_flit', 'dive');
    const ends = [];
    for (let y = 0; y < px.length; y++) {
      const xs = [];
      px[y].forEach(function (c, x) { if (c === C.LILAC) xs.push(x); });
      if (!xs.length) continue;
      for (let x = xs[0]; x <= xs[xs.length - 1]; x++) {
        if (px[y][x] !== C.LILAC && px[y][x] !== C.VIOLET) return 'row ' + y + ': the wing is broken at column ' + x;
      }
      ends.push(xs[xs.length - 1]);
    }
    let turns = 0, dir = 0;
    for (let i = 1; i < ends.length; i++) {
      const d = Math.sign(ends[i] - ends[i - 1]);
      if (d !== 0 && dir !== 0 && d !== dir) turns++;
      if (d !== 0) dir = d;
    }
    if (turns < 2) return 'the trailing edge turns ' + turns + ' times';
  });

  check('en_glimmer: the wings beat: fly1 is 4 or more pixels narrower than fly0', function () {
    if (!TGS.Sprites.has('en_glimmer')) return;
    const width = function (px) {
      let lo = 99, hi = -1;
      px.forEach(function (row) { row.forEach(function (c, x) { if (c >= 0) { lo = Math.min(lo, x); hi = Math.max(hi, x); } }); });
      return hi - lo + 1;
    };
    const a = width(frame('en_glimmer', 'fly0')), b = width(frame('en_glimmer', 'fly1'));
    if (a - b < 4) return 'fly0 is ' + a + ' px wide and fly1 ' + b;
  });

  // The frog is reused under `tin` (LEVEL2 3.6). The table lists GRASS, LIME and WHITE, which is the whole
  // of the frog, and FOREST for its lily pad: if a frame gained another green, it would stay green on the
  // tin frog.
  check('en_hoppet uses GRASS, LIME, WHITE and INK only, so the remap tin leaves no green on the frog', function () {
    const other = colorsOf('en_hoppet').filter(function (c) { return [C.INK, C.GRASS, C.LIME, C.WHITE].indexOf(c) === -1; });
    if (other.length) return other.map(nameOf).join(' ');
    const tin = TGS.Remaps.tin;
    if (!tin || [C.GRASS, C.LIME, C.WHITE].some(function (c) { return tin[c] === undefined; })) return 'tin does not list all three';
  });
})();

// ===== LEVEL 2: Lady Ratchet and her projectiles (LEVEL2 2, 3.5, 10.1) =====

// Lady Ratchet's six parts and her three projectiles. The checks are in a function of their own, as the
// creatures' are.
(function () {
  // LEVEL2 Appendix C: name, w, h, frame names, fps, anchor x and y.
  const ROWS = [
    ['boss2_body', 48, 32, 'b0 b1', 0, 24, 32],
    ['boss2_head', 32, 24, 'normal laugh hurt dizzy', 0, 16, 24],
    ['boss2_arm', 16, 16, 'rest raise throw watch', 0, 8, 8],
    ['boss2_key', 16, 16, 'k0 k1 k2 k3', 0, 8, 8],
    ['boss2_engine', 48, 16, 'shut open', 0, 24, 16],
    ['boss2_goggles', 8, 8, 'goggles', 0, 4, 4],
    ['pr_cog', 12, 12, 'k0 k1', 10, 6, 12],
    ['pr_rollgear', 16, 8, 's0 s1', 10, 8, 8],
    ['pr_pendulum', 16, 16, 'p0 p1 p2 p3', 12, 8, 16]
  ];
  // The Level 1 sprite each is drawn in the place of, and which fields of its row it keeps (LEVEL2
  // Appendix C). names3: the first three frame names, for the arm, which has `watch` as a fourth.
  const STANDS_IN = [
    ['boss2_body', 'boss_body', ['w', 'h', 'names', 'anchor']],          // fps 0: the renderer picks the frame
    ['boss2_head', 'boss_head', ['w', 'h', 'names', 'fps', 'anchor']],
    ['boss2_arm', 'boss_arm', ['w', 'h', 'names3', 'fps', 'anchor']],
    ['boss2_engine', 'boss_mound', ['w', 'h', 'fps', 'anchor']],
    ['boss2_goggles', 'boss_monocle', ['w', 'h', 'count', 'fps', 'anchor']],
    ['pr_cog', 'pr_rock', ['w', 'h', 'names', 'fps', 'anchor']],
    ['pr_rollgear', 'pr_shock', ['w', 'h', 'names', 'fps', 'anchor']],
    ['pr_pendulum', 'pr_pickaxe', ['w', 'h', 'names', 'fps', 'anchor']]
  ];
  // The colours that make each what LEVEL2 2 and 3.5 say it is. `has` must all be there; `only` (for the
  // projectiles, three colours beside INK) may be there.
  const COLOURS = {
    boss2_body: { has: ['TEAL', 'STONE', 'GOLD', 'PINK', 'WHITE'] },      // waistcoat, fur, buttons and chain, tail, shirt
    boss2_head: { has: ['STONE', 'PINK', 'WHITE', 'GOLD'] },              // fur, ear and nose, teeth, goggle rims
    boss2_arm: { has: ['STONE', 'PINK'] },
    boss2_key: { has: ['GOLD'] },
    boss2_engine: { has: ['BRONZE', 'GOLD', 'WHITE'] },                   // brass, and the dial's face
    boss2_goggles: { has: ['GOLD', 'CREAM'] },
    pr_cog: { has: ['GOLD', 'BRONZE'], only: ['BRONZE', 'GOLD', 'STONE'] },
    pr_rollgear: { has: ['GOLD', 'BRONZE'], only: ['BRONZE', 'GOLD', 'STONE'] },
    pr_pendulum: { has: ['GOLD', 'SILVER'], only: ['GOLD', 'BRONZE', 'SILVER'] }
  };
  const PARTS = ['boss2_body', 'boss2_head', 'boss2_arm', 'boss2_key', 'boss2_engine', 'boss2_goggles'];
  const defined = ROWS.filter(function (r) { return TGS.Sprites.has(r[0]); });
  const all = defined.length === ROWS.length;      // the checks on the composed figure need every part

  function frame(name, frameName) {
    const d = TGS.Sprites.get(name);
    return pixels(d, d.names.indexOf(frameName));
  }
  function count(px, color) {
    return px.reduce(function (a, row) { return a + row.filter(function (c) { return c === color; }).length; }, 0);
  }
  function at(px, x, y) { return y >= 0 && y < px.length && x >= 0 && x < px[0].length ? px[y][x] : -1; }
  // The groups of touching pixels of one colour (left, right, above, below), as lists of [x, y].
  function groups(px, color) {
    const seen = {}, out = [];
    px.forEach(function (row, y) {
      row.forEach(function (c, x) {
        if (c !== color || seen[x + ',' + y]) return;
        const group = [], todo = [[x, y]];
        seen[x + ',' + y] = true;
        while (todo.length) {
          const p = todo.pop();
          group.push(p);
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
            const k = (p[0] + d[0]) + ',' + (p[1] + d[1]);
            if (at(px, p[0] + d[0], p[1] + d[1]) === color && !seen[k]) { seen[k] = true; todo.push([p[0] + d[0], p[1] + d[1]]); }
          });
        }
        out.push(group);
      });
    });
    return out;
  }
  // Contrast of two palette entries, as WCAG defines it (1 to 21).
  function lightOf(i) {
    const n = parseInt(TGS.PAL[i].slice(1), 16);
    const lin = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  }
  function contrast(a, b) {
    const x = lightOf(a), y = lightOf(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function carries(c) { return c > 0 && contrast(c, C.PLUM) >= 3 && contrast(c, C.DEEP_BLUE) >= 3; }

  // Where the renderer puts each part (LEVEL2 10.1), as the offset of the part's anchor from bx, by.
  const PLACE = { boss2_body: [0, -8], far: [20, -26], boss2_key: [14, -30], boss2_head: [-2, -34], near: [-20, -26], boss2_engine: [0, 0] };
  // The top-left corner of a part's frame, from bx, by, with boss.rise = r.
  function corner(name, place, r, flipX) {
    const d = TGS.Sprites.get(name);
    return [place[0] - (flipX ? d.w - d.anchor[0] : d.anchor[0]), place[1] + r - d.anchor[1]];
  }

  check('Lady Ratchet\'s parts and projectiles have the size, frame names, fps and anchor of LEVEL2 Appendix C', function () {
    const bad = [];
    defined.forEach(function (r) {
      const d = TGS.Sprites.get(r[0]);
      if (d.w !== r[1] || d.h !== r[2]) bad.push(r[0] + ' size ' + d.w + 'x' + d.h);
      if (d.names.join(' ') !== r[3]) bad.push(r[0] + ' names ' + d.names.join(' '));
      if (d.fps !== r[4]) bad.push(r[0] + ' fps ' + d.fps);
      if (d.anchor[0] !== r[5] || d.anchor[1] !== r[6]) bad.push(r[0] + ' anchor ' + d.anchor.join(','));
      if (d.owner !== 'C') bad.push(r[0] + ' owner ' + d.owner);
    });
    if (bad.length) return bad.join(', ');
  });

  check('the skins rule: each part or projectile that is drawn in the place of one of the Baron\'s keeps what Appendix C copies of its row (the head and the three projectiles the whole row)', function () {
    const bad = [];
    STANDS_IN.filter(function (s) { return TGS.Sprites.has(s[0]); }).forEach(function (s) {
      const a = TGS.Sprites.get(s[0]), b = TGS.Sprites.get(s[1]);
      s[2].forEach(function (k) {
        let same;
        if (k === 'names') same = a.names.join(' ') === b.names.join(' ');
        else if (k === 'names3') same = a.names.slice(0, 3).join(' ') === b.names.join(' ') && a.names[3] === 'watch';
        else if (k === 'count') same = a.frames.length === b.frames.length;
        else if (k === 'anchor') same = a.anchor.join(',') === b.anchor.join(',');
        else same = a[k] === b[k];
        if (!same) bad.push(s[0] + ' ' + k + ' is not that of ' + s[1]);
      });
    });
    if (bad.length) return bad.join(', ');
  });

  check('each part and projectile has the colours that LEVEL2 2 and 3.5 name for it (STONE fur, a TEAL waistcoat, GOLD rims, a PINK tail and ear, WHITE teeth; the projectiles three colours of their lists)', function () {
    const bad = [];
    defined.forEach(function (r) {
      const got = colorsOf(r[0]).map(nameOf);
      const want = COLOURS[r[0]];
      want.has.forEach(function (n) { if (got.indexOf(n) === -1) bad.push(r[0] + ' has no ' + n); });
      if (want.only) got.forEach(function (n) { if (n !== 'INK' && want.only.indexOf(n) === -1) bad.push(r[0] + ' ' + n); });
    });
    if (bad.length) return bad.join(', ');
  });

  check('CREAM is the lenses of her goggles and nothing else: boss2_head has two lenses of 9 pixels inside GOLD rims in normal, laugh and dizzy and no goggles in hurt; boss2_goggles has the pair; no other part has CREAM', function () {
    if (TGS.Sprites.has('boss2_head')) {
      const names = ['normal', 'laugh', 'dizzy'];
      for (let i = 0; i < names.length; i++) {
        const px = frame('boss2_head', names[i]);
        const lenses = groups(px, C.CREAM);
        if (lenses.length !== 2) return names[i] + ' has ' + lenses.length + ' CREAM groups';
        for (let k = 0; k < 2; k++) {
          if (lenses[k].length !== 9) return names[i] + ' has a lens of ' + lenses[k].length + ' pixels';
          const open = lenses[k].filter(function (p) {
            return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(function (d) {
              const c = at(px, p[0] + d[0], p[1] + d[1]);
              return c !== C.CREAM && c !== C.GOLD;
            });
          });
          if (open.length) return names[i] + ': a lens is not inside a GOLD rim at ' + open[0].join(',');
        }
      }
      const hurt = frame('boss2_head', 'hurt');
      if (count(hurt, C.CREAM) !== 0 || count(hurt, C.GOLD) !== 0) return 'hurt still has goggles';
    }
    if (TGS.Sprites.has('boss2_goggles')) {
      const pair = groups(frame('boss2_goggles', 'goggles'), C.CREAM);
      if (pair.length !== 2 || pair[0].length !== pair[1].length) return 'boss2_goggles has ' + pair.length + ' lenses';
    }
    const other = ['boss2_body', 'boss2_arm', 'boss2_key', 'boss2_engine'].filter(function (n) {
      return TGS.Sprites.has(n) && colorsOf(n).indexOf(C.CREAM) !== -1;
    });
    if (other.length) return other.join(', ');
  });

  check('boss2_head and boss2_goggles drawn with lampred differ from the plain frame only where they were CREAM, and every CREAM pixel becomes RED; the GOLD rims are unchanged', function () {
    if (!TGS.Sprites.has('boss2_head') || !TGS.Sprites.has('boss2_goggles')) return;
    const env = loadSoft();
    const TG = env.TG;
    const cream = hexOf(TG, C.CREAM), red = hexOf(TG, C.RED), gold = hexOf(TG, C.GOLD);
    const list = [['boss2_head', 0], ['boss2_head', 1], ['boss2_head', 2], ['boss2_head', 3], ['boss2_goggles', 0]];
    for (let i = 0; i < list.length; i++) {
      const name = list[i][0], f = list[i][1];
      const d = TG.Sprites.get(name);
      const a = TG.Gfx.get(name, f), b = TG.Gfx.get(name, f, { remap: 'lampred' });
      let creams = 0, golds = 0;
      for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
        const pa = pixelAt(a, x, y), pb = pixelAt(b, x, y);
        if (pa === cream) { creams++; if (pb !== red) return name + ' ' + d.names[f] + ' CREAM not RED at ' + x + ',' + y; }
        else if (pa !== pb) return name + ' ' + d.names[f] + ' differs at ' + x + ',' + y;
        if (pa === gold) golds++;
      }
      const goggles = !(name === 'boss2_head' && d.names[f] === 'hurt');
      if (goggles && (creams === 0 || golds === 0)) return name + ' ' + d.names[f] + ' has no lens or no rim';
    }
  });

  // Rule 2 of LEVEL2 3.1 as a number, as for the creatures. STONE is 2.3 to 1 on PLUM and 2.1 to 1 on
  // DEEP_BLUE, so her fur does not carry her by itself: every frame needs enough of TEAL, GOLD, PINK,
  // WHITE, BRONZE, CREAM or SILVER.
  check('rule 2 of LEVEL2 3.1: every frame of her parts and projectiles has 12 or more pixels of a colour that reads at 3 to 1 on PLUM and on DEEP_BLUE, and so do a third or more of the coloured pixels of the figure put together', function () {
    const bad = [];
    defined.forEach(function (r) {
      const d = TGS.Sprites.get(r[0]);
      d.names.forEach(function (n, f) {
        let light = 0;
        pixels(d, f).forEach(function (row) { row.forEach(function (c) { if (carries(c)) light++; }); });
        if (light < 12) bad.push(r[0] + ' ' + n + ' ' + light);
      });
    });
    if (all) {
      // idle, with the body above the engine only (rows 0 to 23), both arms at rest
      let coloured = 0, light = 0;
      const add = function (px, rows) {
        px.slice(0, rows).forEach(function (row) { row.forEach(function (c) { if (c > 0) { coloured++; if (carries(c)) light++; } }); });
      };
      add(frame('boss2_body', 'b0'), 24);
      add(frame('boss2_head', 'normal'), 24);
      add(frame('boss2_arm', 'rest'), 16);
      add(frame('boss2_arm', 'rest'), 16);
      add(frame('boss2_key', 'k0'), 16);
      if (light * 3 < coloured) bad.push('the figure: ' + light + ' of ' + coloured);
    }
    if (bad.length) return bad.join(', ');
  });

  check('she faces left: in every frame of boss2_head the nose (PINK) is in the first three columns and the ear (PINK) on the right half, and rows 0 and 1 are empty', function () {
    const d = TGS.Sprites.get('boss2_head');
    if (!d) return;
    for (let f = 0; f < d.frames.length; f++) {
      const px = pixels(d, f);
      let nose = 0, ear = 0;
      px.forEach(function (row) { row.forEach(function (c, x) { if (c === C.PINK) { if (x < 3) nose++; if (x >= 16) ear++; } }); });
      if (nose < 4 || ear < 20) return d.names[f] + ': nose ' + nose + ', ear ' + ear;
      if (px[0].concat(px[1]).some(function (c) { return c >= 0; })) return d.names[f] + ' has pixels in rows 0 and 1';
    }
  });

  // What makes her a rat and not a mouse or a mole: the long snout with the two buck teeth under its tip.
  check('boss2_head: in every frame two buck teeth (WHITE, 2 pixels wide and 3 tall) hang under the tip of the snout, in the first nine columns, and nothing of the lower jaw is in front of them', function () {
    const d = TGS.Sprites.get('boss2_head');
    if (!d) return;
    for (let f = 0; f < d.frames.length; f++) {
      const px = pixels(d, f);
      // the whiskers, the eyes and the spiral eyes are WHITE too, but higher up or further back
      const teeth = groups(px, C.WHITE).filter(function (g) { return g.every(function (p) { return p[0] < 9 && p[1] >= 16; }); });
      if (teeth.length !== 2) return d.names[f] + ' has ' + teeth.length + ' teeth';
      let first = d.w;
      for (let k = 0; k < 2; k++) {
        const xs = teeth[k].map(function (p) { return p[0]; }), ys = teeth[k].map(function (p) { return p[1]; });
        const w = Math.max.apply(null, xs) - Math.min.apply(null, xs) + 1, h = Math.max.apply(null, ys) - Math.min.apply(null, ys) + 1;
        if (teeth[k].length !== 6 || w !== 2 || h !== 3) return d.names[f] + ': a tooth of ' + w + ' x ' + h + ', ' + teeth[k].length + ' pixels';
        first = Math.min(first, Math.min.apply(null, xs));
      }
      const rows = teeth[0].map(function (p) { return p[1]; });
      for (let y = Math.min.apply(null, rows); y <= Math.max.apply(null, rows); y++) {
        for (let x = 0; x < first - 1; x++) if (px[y][x] >= 0) return d.names[f] + ': a pixel in front of the teeth at ' + x + ',' + y;
      }
    }
  });

  check('at rise 40 no pixel of boss2_head shows above boss2_engine, shut or open: she is hidden until she rises (LEVEL2 10.1)', function () {
    if (!all) return;
    const head = TGS.Sprites.get('boss2_head'), engine = TGS.Sprites.get('boss2_engine');
    const h0 = corner('boss2_head', PLACE.boss2_head, 40), e0 = corner('boss2_engine', PLACE.boss2_engine, 0);
    for (let e = 0; e < engine.frames.length; e++) {
      const front = pixels(engine, e);
      for (let f = 0; f < head.frames.length; f++) {
        const px = pixels(head, f);
        for (let y = 0; y < head.h; y++) for (let x = 0; x < head.w; x++) {
          if (px[y][x] < 0 || h0[1] + y >= 0) continue;                 // transparent, or below the ground line
          if (at(front, h0[0] + x - e0[0], h0[1] + y - e0[1]) < 0) return head.names[f] + ' shows at ' + x + ',' + y + ' with the engine ' + engine.names[e];
        }
      }
    }
  });

  check('boss2_arm is drawn as the left arm: the shoulder is on the right edge in rows 4 to 7 of every frame, and the hand (PINK) is on the left half in raise, throw and watch', function () {
    const d = TGS.Sprites.get('boss2_arm');
    if (!d) return;
    for (let f = 0; f < d.frames.length; f++) {
      const px = pixels(d, f);
      for (let y = 5; y <= 7; y++) if (px[y][15] !== C.INK || px[y][14] !== C.STONE) return d.names[f] + ' has no shoulder on row ' + y;
      if (px[4][13] !== C.INK) return d.names[f] + ': the top of the shoulder is not on row 4';
      if (f === 0) continue;
      let left = 0, right = 0;
      px.forEach(function (row) { row.forEach(function (c, x) { if (c === C.PINK) { if (x < 8) left++; else right++; } }); });
      if (left === 0 || right !== 0) return d.names[f] + ': hand';
    }
  });

  check('boss2_arm: the pocket watch of `watch` is the only GOLD on the arm, a GOLD case on the left half round a WHITE face of 6 pixels or more with INK hands, its crown on the top row of the frame', function () {
    const d = TGS.Sprites.get('boss2_arm');
    if (!d) return;
    for (let f = 0; f < 3; f++) if (count(pixels(d, f), C.GOLD) !== 0) return d.names[f] + ' has GOLD';
    const px = pixels(d, 3);
    let gold = 0, right = 0;
    px.forEach(function (row) { row.forEach(function (c, x) { if (c === C.GOLD) { gold++; if (x >= 8) right++; } }); });
    if (gold < 10 || right !== 0) return 'the case: ' + gold + ' GOLD pixels, ' + right + ' on the right half';
    // the face: a WHITE group with nothing but GOLD and INK round it (the cuff is WHITE too, beside STONE and PINK)
    const face = groups(px, C.WHITE).filter(function (g) {
      return g.every(function (p) {
        return [[1, 0], [-1, 0], [0, 1], [0, -1]].every(function (s) {
          const c = at(px, p[0] + s[0], p[1] + s[1]);
          return c === C.WHITE || c === C.GOLD || c === C.INK;
        });
      });
    });
    if (face.length !== 1 || face[0].length < 6) return 'the face: ' + face.length + ' groups';
    const hands = face[0].filter(function (p) { return at(px, p[0] + 1, p[1]) === C.INK || at(px, p[0], p[1] + 1) === C.INK; });
    if (hands.length < 2) return 'the face has no hands';
    if (px[0].filter(function (c) { return c === C.INK; }).length !== 1) return 'the crown is not on the top row';
  });

  check('boss2_key ends in its shaft, one pixel on row 8 at the anchor, and that pixel is on the top edge of the far shoulder in every frame of the arm', function () {
    if (!all) return;
    const key = TGS.Sprites.get('boss2_key'), arm = TGS.Sprites.get('boss2_arm');
    for (let f = 0; f < key.frames.length; f++) {
      const px = pixels(key, f);
      const low = lowestRow(px);
      const end = px[low].map(function (c, x) { return c >= 0 ? x : -1; }).filter(function (x) { return x >= 0; });
      if (low !== key.anchor[1] || end.join(',') !== String(key.anchor[0])) return key.names[f] + ' ends on row ' + low + ' at ' + end.join(',');
    }
    // the far arm is the arm's frame mirrored
    const k0 = corner('boss2_key', PLACE.boss2_key, 0), a0 = corner('boss2_arm', PLACE.far, 0, true);
    const ax = arm.w - 1 - (k0[0] + key.anchor[0] - a0[0]), ay = k0[1] + key.anchor[1] - a0[1];
    for (let f = 0; f < arm.frames.length; f++) {
      const px = pixels(arm, f);
      if (at(px, ax, ay) !== C.INK || at(px, ax, ay - 1) >= 0 || at(px, ax, ay + 1) !== C.STONE) return 'the arm\'s ' + arm.names[f] + ' has no shoulder top at ' + ax + ',' + ay;
    }
  });

  check('boss2_engine: the dial\'s centre, column 6 and row 6 (bx - 18, by - 10), is WHITE with 3 WHITE pixels to its left, to its right and above it, for the needle; shut and open differ only in the hatch, columns 17 to 32', function () {
    const d = TGS.Sprites.get('boss2_engine');
    if (!d) return;
    const shut = pixels(d, 0), open = pixels(d, 1);
    for (let f = 0; f < 2; f++) {
      const px = f === 0 ? shut : open;
      for (let k = 0; k <= 3; k++) {
        if (px[6][6 - k] !== C.WHITE || px[6][6 + k] !== C.WHITE || px[6 - k][6] !== C.WHITE) return d.names[f] + ': the dial is not WHITE ' + k + ' from its centre';
      }
    }
    let inside = 0;
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
      if (shut[y][x] === open[y][x]) continue;
      if (x < 17 || x > 32) return 'shut and open differ at ' + x + ',' + y;
      inside++;
    }
    if (inside < 60) return 'the hatch changes only ' + inside + ' pixels';
  });

  // The bow of the key and the goggles are both GOLD and both sit by her head, so the key must not be a
  // second pair of rings: what tells it is the stem, and wings with one small hole each.
  check('boss2_key reads as a key: under the bow the stem stands alone on rows 6 and 7, one pixel wide at column 8, and is flanked by INK on row 5; face on (k0) the bow is two wings with one hole each, joined across the stem; k1 and k3 are mirror images about the stem, each with one wing wider than the other, so that a backward turn does not look like a forward one', function () {
    const d = TGS.Sprites.get('boss2_key');
    if (!d) return;
    const brass = function (c) { return c === C.GOLD || c === C.BRONZE; };
    const solid = function (px, x, y) { return at(px, x, y) >= 0; };
    for (let f = 0; f < d.frames.length; f++) {
      const px = pixels(d, f);
      for (let y = 5; y <= 7; y++) {
        if (!brass(px[y][8]) || px[y][7] !== C.INK || px[y][9] !== C.INK) return d.names[f] + ': no stem on row ' + y;
      }
      for (let y = 6; y <= 7; y++) for (let x = 0; x < d.w; x++) {
        if ((x < 7 || x > 9) && px[y][x] >= 0) return d.names[f] + ': a pixel beside the stem at ' + x + ',' + y;
      }
    }
    // k0: the holes are the INK groups that touch neither the edge of the frame nor a transparent pixel
    const k0 = pixels(d, 0);
    const holes = groups(k0, C.INK).filter(function (g) {
      return g.every(function (p) {
        return [[1, 0], [-1, 0], [0, 1], [0, -1]].every(function (s) { return solid(k0, p[0] + s[0], p[1] + s[1]); });
      });
    });
    if (holes.length !== 2) return 'k0 has ' + holes.length + ' holes';
    if (holes.some(function (g) { return g.length > 2; })) return 'k0: a hole of more than 2 pixels (a ring, as the goggles are)';
    if (!(holes[0][0][0] < 8 && holes[1][0][0] > 8) && !(holes[1][0][0] < 8 && holes[0][0][0] > 8)) return 'k0: the holes are not one in each wing';
    const mask = k0.map(function (row) { return row.map(function (c) { return brass(c) ? 1 : 0; }); });
    if (groups(mask, 1).length !== 1) return 'k0: the bow and the stem are not one piece';
    // k1 and k3
    const k1 = pixels(d, 1), k3 = pixels(d, 3);
    let left1 = 0, right1 = 0;
    for (let y = 0; y < d.h; y++) for (let x = 1; x < d.w; x++) {
      if (solid(k1, x, y) !== solid(k3, 16 - x, y)) return 'k3 is not k1 mirrored at ' + x + ',' + y;
      if (brass(k1[y][x])) { if (x < 8) left1++; else if (x > 8) right1++; }
    }
    if (Math.abs(left1 - right1) < 5) return 'k1: the wings are ' + left1 + ' and ' + right1 + ' pixels, too alike';
    let differ = 0;
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (solid(k1, x, y) !== solid(k3, x, y)) differ++;
    if (differ < 12) return 'k1 and k3 have the same outline but for ' + differ + ' pixels';
  });

  check('boss2_head hurt: with the goggles gone the skull does not grow and gains no ears: in front of the ear (columns 0 to 22) nothing is above row 5, the crown is on row 7, and rows 5 to 7 hold only single nicks of ruffled fur, two or three of them, apart', function () {
    if (!TGS.Sprites.has('boss2_head')) return;
    const px = frame('boss2_head', 'hurt');
    for (let y = 0; y < 5; y++) for (let x = 0; x <= 22; x++) if (px[y][x] >= 0) return 'a pixel at ' + x + ',' + y;
    const nicks = [];
    for (let x = 0; x <= 22; x++) {
      if (px[5][x] === C.STONE) return 'fur on row 5 at column ' + x;
      if (px[6][x] === C.STONE) nicks.push(x);
      else if (px[7][x] === C.STONE) return 'the crown is above row 8 at column ' + x;
    }
    if (nicks.length < 2 || nicks.length > 3) return nicks.length + ' nicks';
    for (let i = 1; i < nicks.length; i++) if (nicks[i] - nicks[i - 1] < 3) return 'two nicks side by side at columns ' + nicks[i - 1] + ' and ' + nicks[i];
    // and under the goggles of `normal` (columns 8 to 17) the fur starts on row 8 or 9: one row of difference at most
    const normal = frame('boss2_head', 'normal');
    let first = -1;
    for (let y = 0; y < normal.length && first < 0; y++) for (let x = 8; x <= 17; x++) if (normal[y][x] === C.STONE) { first = y; break; }
    if (first < 8 || first > 9) return 'the fur of normal starts on row ' + first;
  });

  check('boss2_head dizzy: the two spiral eyes are round and apart, so that they do not read as a pair of square spectacles: each is WHITE inside a box of 5 by 5 with its corners left as fur and INK between the turns, and two columns or more of fur lie between them', function () {
    if (!TGS.Sprites.has('boss2_head')) return;
    const px = frame('boss2_head', 'dizzy');
    // the whiskers are WHITE in columns 0 to 5 and the teeth from row 18 down
    const eyes = [[], []];
    px.forEach(function (row, y) {
      row.forEach(function (c, x) { if (c === C.WHITE && x >= 7 && y < 17) eyes[x <= 14 ? 0 : 1].push([x, y]); });
    });
    const boxes = eyes.map(function (e) {
      const xs = e.map(function (p) { return p[0]; }), ys = e.map(function (p) { return p[1]; });
      return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys), n: e.length };
    });
    for (let k = 0; k < 2; k++) {
      const b = boxes[k];
      if (b.n < 10) return 'eye ' + k + ' has ' + b.n + ' WHITE pixels';
      if (b.x1 - b.x0 !== 4 || b.y1 - b.y0 !== 4) return 'eye ' + k + ' is ' + (b.x1 - b.x0 + 1) + ' by ' + (b.y1 - b.y0 + 1);
      if ([[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].some(function (p) { return px[p[1]][p[0]] === C.WHITE; })) return 'eye ' + k + ' has a WHITE corner';
      let ink = 0;
      for (let y = b.y0 + 1; y < b.y1; y++) for (let x = b.x0 + 1; x < b.x1; x++) if (px[y][x] === C.INK) ink++;
      if (ink < 5) return 'eye ' + k + ' has ' + ink + ' INK pixels between its turns';
    }
    if (boxes[1].x0 - boxes[0].x1 - 1 < 2) return 'the eyes are ' + (boxes[1].x0 - boxes[0].x1 - 1) + ' columns apart';
  });

  // What made the engine read as a brass-bound chest: a solid two-row GOLD band along the top (a lid) and a
  // bar over a slot in the middle of the arch (a lock plate).
  check('boss2_engine reads as a machine and not as a chest: the top edge is one GOLD row over a row of rivets (BRONZE with single GOLD pixels); the shut hatch is a door with a porthole (TEAL glass in an INK ring) and two STONE hinges on the side where the open door hangs, and no slot across it; louvres stand beside the sight glass', function () {
    const d = TGS.Sprites.get('boss2_engine');
    if (!d) return;
    const shut = pixels(d, 0), open = pixels(d, 1);
    for (let f = 0; f < 2; f++) {
      const px = f === 0 ? shut : open;
      let rivets = 0;
      for (let x = 10; x <= 46; x++) {
        if (px[1][x] !== C.GOLD) return d.names[f] + ': row 1 is not GOLD at column ' + x;
        if (px[2][x] === C.GOLD) { rivets++; if (px[2][x - 1] === C.GOLD) return d.names[f] + ': two GOLD pixels side by side on row 2 (a lid)'; }
        else if (px[2][x] !== C.BRONZE) return d.names[f] + ': row 2 at column ' + x;
      }
      if (rivets < 6) return d.names[f] + ': ' + rivets + ' rivets';
      // the louvres: INK slots three wide in columns 43 to 45, with BRONZE between them
      let slots = 0;
      for (let y = 3; y <= 13; y++) if (px[y][43] === C.INK && px[y][44] === C.INK && px[y][45] === C.INK) slots++;
      if (slots < 3) return d.names[f] + ': ' + slots + ' louvres';
    }
    // the door, columns 19 to 28 inside its GOLD frame (18 and 29), rows 5 to 14
    const inDoor = function (g) { return g.every(function (p) { return p[0] >= 19 && p[0] <= 29 && p[1] >= 5 && p[1] <= 13; }); };
    const hinges = groups(shut, C.STONE).filter(inDoor);
    if (hinges.length !== 2 || hinges.some(function (g) { return g.some(function (p) { return p[0] < 24; }); })) return 'shut: ' + hinges.length + ' hinges on the right of the door';
    const glass = groups(shut, C.TEAL).filter(inDoor);
    if (glass.length !== 1 || glass[0].length < 6) return 'shut: no porthole';
    const ringOpen = glass[0].filter(function (p) {
      return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(function (s) {
        const c = at(shut, p[0] + s[0], p[1] + s[1]);
        return c !== C.TEAL && c !== C.INK && c !== C.WHITE;
      });
    });
    if (ringOpen.length) return 'shut: the porthole has no INK ring at ' + ringOpen[0].join(',');
    for (let y = 5; y <= 13; y++) {
      let run = 0;
      for (let x = 19; x <= 28; x++) { run = shut[y][x] === C.INK ? run + 1 : 0; if (run > 4) return 'shut: a slot across the door on row ' + y; }
    }
    // the open door hangs on the same side as the hinges: its edge is the GOLD in column 31
    let edge = 0;
    for (let y = 5; y <= 14; y++) if (open[y][31] === C.GOLD) edge++;
    if (edge < 8) return 'open: the door\'s edge is not at column 31';
  });

  check('boss2_body: b0 and b1 are the same in rows 0 to 9, where the head, the arms and the key meet the body, and differ by 16 pixels or more in rows 10 to 23, the part that shows above the engine', function () {
    const d = TGS.Sprites.get('boss2_body');
    if (!d) return;
    const a = pixels(d, 0), b = pixels(d, 1);
    let shown = 0;
    for (let y = 0; y < 24; y++) for (let x = 0; x < d.w; x++) {
      if (a[y][x] === b[y][x]) continue;
      if (y < 10) return 'b0 and b1 differ at ' + x + ',' + y;
      shown++;
    }
    if (shown < 16) return 'only ' + shown + ' pixels differ above the engine';
  });

  check('the projectiles: pr_cog has a hole at its centre in both frames; pr_rollgear is a half gear whose hub (STONE) sits on the floor, on rows 5 and 6, and whose web (BRONZE) is one piece in both; pr_pendulum hangs from the same hanger in all four frames by a rod one pixel wide, its bob (GOLD) left, centre, right, centre and a row higher at the two ends', function () {
    if (TGS.Sprites.has('pr_cog')) {
      for (let f = 0; f < 2; f++) {
        const px = pixels(TGS.Sprites.get('pr_cog'), f);
        if ([px[5][5], px[5][6], px[6][5], px[6][6]].some(function (c) { return c !== C.INK; })) return 'pr_cog frame ' + f + ' has no hole';
      }
    }
    if (TGS.Sprites.has('pr_rollgear')) {
      for (let f = 0; f < 2; f++) {
        const px = pixels(TGS.Sprites.get('pr_rollgear'), f);
        if (count([px[6]], C.STONE) < 2 || count(px.slice(0, 5), C.STONE) !== 0) return 'pr_rollgear frame ' + f + ': hub';
        // two BRONZE blocks side by side read as jewels on a crown; one arc reads as the web of a wheel
        if (groups(px, C.BRONZE).length !== 1) return 'pr_rollgear frame ' + f + ': the web is in ' + groups(px, C.BRONZE).length + ' pieces';
      }
    }
    if (TGS.Sprites.has('pr_pendulum')) {
      const d = TGS.Sprites.get('pr_pendulum');
      const want = [-1, 0, 1, 0];
      const top = JSON.stringify(pixels(d, 0).slice(0, 3));
      const lows = [];
      for (let f = 0; f < 4; f++) {
        const px = pixels(d, f);
        if (JSON.stringify(px.slice(0, 3)) !== top) return d.names[f] + ': the hanger moved';
        // a rod two pixels wide under a cap reads as the neck of a flask
        for (let y = 2; y <= 5; y++) if (count([px[y]], C.SILVER) !== 1) return d.names[f] + ': the rod is not one pixel wide on row ' + y;
        let sum = 0, n = 0;
        px.forEach(function (row) { row.forEach(function (c, x) { if (c === C.GOLD) { sum += x; n++; } }); });
        const side = sum / n < 6 ? -1 : (sum / n > 9 ? 1 : 0);
        if (side !== want[f]) return d.names[f] + ': the bob is at column ' + (sum / n).toFixed(1);
        lows.push(lowestRow(px));
      }
      if (lows[0] !== lows[1] - 1 || lows[2] !== lows[1] - 1 || lows[3] !== lows[1]) return 'the bob ends on rows ' + lows.join(', ');
    }
  });
})();

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
      ['white', 'gold', 'dim', 'lampred', 'tin'].forEach(function (r) { TG.Gfx.draw(t.ctx, m.name, f, 128, 160, { remap: r }); });
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
