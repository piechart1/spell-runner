// test/test-tools.js
// Tests for the headless drawing tools of CONTRACT 13.2 (WP0): tools/png.js, tools/softcanvas.js and
// tools/sheet.js. Run from the project root: node test/test-tools.js
//
//   node test/test-tools.js --out <file.png>     also writes the sheet of the test sprites to that file,
//                                                 so that it can be opened and looked at
//
// The test sprites are defined in this file. They are never registered by anything under js/.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const childProcess = require('child_process');

const stubs = require('./stubs');
const png = require('../tools/png');
const soft = require('../tools/softcanvas');
const sheet = require('../tools/sheet');

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

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// The message of the error that fn throws, or null if it does not throw.
function errorOf(fn) {
  try {
    fn();
  } catch (e) {
    return e && e.message ? e.message : String(e);
  }
  return null;
}

function makeRandom(seed) {
  let s = seed >>> 0;
  return function (n) {               // whole number from 0 to n - 1
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return Math.floor((s / 4294967296) * n);
  };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-tools-'));

const RED = [255, 0, 0, 255], GREEN = [0, 255, 0, 255], BLUE = [0, 0, 255, 255], WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];

function pixel(canvas, x, y) {
  const rgba = canvas.toRGBA();
  const o = (y * canvas.width + x) * 4;
  return [rgba[o], rgba[o + 1], rgba[o + 2], rgba[o + 3]];
}

function hex(rgb) {
  return '#' + rgb.slice(0, 3).map(function (v) { return (v < 16 ? '0' : '') + v.toString(16); }).join('');
}

// Counts the pixels of a canvas that are not transparent.
function painted(canvas) {
  const rgba = canvas.toRGBA();
  let n = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 0) n++;
  return n;
}

// A canvas of 4 x 2 with eight different pixels, one of them transparent:
//   R G B W
//   Y . C M        (. = transparent)
const YELLOW = [255, 255, 0, 255], CYAN = [0, 255, 255, 255], MAGENTA = [255, 0, 255, 255];
const PATTERN = [[RED, GREEN, BLUE, WHITE], [YELLOW, CLEAR, CYAN, MAGENTA]];

function patternCanvas() {
  const c = soft.createCanvas(4, 2);
  const ctx = c.getContext('2d');
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 4; x++) {
      if (PATTERN[y][x][3] === 0) continue;
      ctx.fillStyle = hex(PATTERN[y][x]);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

// =================================================================================================
// tools/png.js
// =================================================================================================

function testImage(w, h) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      rgba[o] = (x * 37) & 255;
      rgba[o + 1] = (y * 59) & 255;
      rgba[o + 2] = (x * y + 7) & 255;
      rgba[o + 3] = (x + y) % 3 === 0 ? 0 : ((x + y) % 3 === 1 ? 128 : 255);
    }
  }
  return rgba;
}

check('png.encode writes the PNG signature and the chunks IHDR, IDAT, IEND with correct checksums', function () {
  const buffer = png.encode(7, 5, testImage(7, 5));
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const list = png.chunks(buffer);
  const header = list[0].data;
  return Buffer.isBuffer(buffer) && same(Array.from(buffer.subarray(0, 8)), signature) &&
    same(list.map(function (c) { return c.type; }), ['IHDR', 'IDAT', 'IEND']) &&
    list.every(function (c) { return c.crcOk; }) &&
    header.length === 13 && header.readUInt32BE(0) === 7 && header.readUInt32BE(4) === 5 &&
    header[8] === 8 && header[9] === 6 && header[10] === 0 && header[11] === 0 && header[12] === 0 &&
    list[2].data.length === 0 &&
    // the last 12 bytes of every PNG: length 0, "IEND", checksum AE 42 60 82
    same(Array.from(buffer.subarray(buffer.length - 12)), [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
});

check('png round trip through zlib.inflateSync: the image data is the RGBA that went in', function () {
  const w = 9, h = 6;
  const rgba = testImage(w, h);
  const buffer = png.encode(w, h, rgba);
  const idat = png.chunks(buffer).filter(function (c) { return c.type === 'IDAT'; });
  const raw = zlib.inflateSync(Buffer.concat(idat.map(function (c) { return c.data; })));
  if (raw.length !== (w * 4 + 1) * h) return 'the image data has ' + raw.length + ' bytes';
  for (let y = 0; y < h; y++) {
    if (raw[y * (w * 4 + 1)] !== 0) return 'row ' + y + ' does not start with filter type 0';
    for (let x = 0; x < w * 4; x++) {
      if (raw[y * (w * 4 + 1) + 1 + x] !== rgba[y * w * 4 + x]) return 'byte ' + x + ' of row ' + y + ' differs';
    }
  }
  return true;
});

check('png.decode(png.encode(image)) gives the same width, height and pixels, transparency included', function () {
  const w = 33, h = 17;
  const rgba = testImage(w, h);
  const back = png.decode(png.encode(w, h, rgba));
  return back.width === w && back.height === h && back.rgba.length === rgba.length &&
    Buffer.from(back.rgba).equals(Buffer.from(rgba));
});

check('png.encode accepts a Uint8ClampedArray, a Uint8Array, a Buffer and a plain array', function () {
  const rgba = testImage(3, 2);
  const a = png.encode(3, 2, rgba);
  const b = png.encode(3, 2, new Uint8Array(rgba));
  const c = png.encode(3, 2, Buffer.from(rgba));
  const d = png.encode(3, 2, Array.from(rgba));
  return a.equals(b) && a.equals(c) && a.equals(d);
});

check('png.encode refuses data of the wrong length and sizes that are not whole numbers above 0', function () {
  return errorOf(function () { png.encode(2, 2, new Uint8ClampedArray(15)); }) !== null &&
    errorOf(function () { png.encode(0, 2, new Uint8ClampedArray(0)); }) !== null &&
    errorOf(function () { png.encode(2.5, 2, new Uint8ClampedArray(20)); }) !== null &&
    errorOf(function () { png.encode(2, 2); }) !== null;
});

check('png.write creates the folders and the file; png.read reads it back', function () {
  const file = path.join(tmp, 'a', 'b', 'picture.png');
  const rgba = testImage(12, 8);
  const bytes = png.write(file, 12, 8, rgba);
  const back = png.read(file);
  return fs.existsSync(file) && fs.statSync(file).size === bytes && back.width === 12 && back.height === 8 &&
    Buffer.from(back.rgba).equals(Buffer.from(rgba));
});

check('png.decode refuses data that is not a PNG', function () {
  return errorOf(function () { png.decode(Buffer.from('not a png at all')); }) !== null;
});

// =================================================================================================
// tools/softcanvas.js
// =================================================================================================

check('softcanvas: createCanvas gives width, height, style, getContext("2d") and toRGBA; a new canvas is transparent', function () {
  const c = soft.createCanvas(5, 3);
  const ctx = c.getContext('2d');
  const rgba = c.toRGBA();
  rgba[0] = 99;        // toRGBA gives a copy
  return c.width === 5 && c.height === 3 && typeof c.style === 'object' && ctx !== null && c.getContext('2d') === ctx &&
    c.getContext('webgl') === null && ctx.canvas === c && rgba instanceof Uint8ClampedArray && rgba.length === 60 &&
    painted(c) === 0 && c.toRGBA()[0] === 0 && soft.isSoftCanvas(c) && !soft.isSoftCanvas({ width: 5, height: 3 });
});

check('softcanvas: fillRect sets exactly the pixels of the rectangle to the fill colour', function () {
  const c = soft.createCanvas(6, 5);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#F8C020';
  ctx.fillRect(1, 2, 3, 2);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 6; x++) {
      const inside = x >= 1 && x < 4 && y >= 2 && y < 4;
      if (!same(pixel(c, x, y), inside ? [0xF8, 0xC0, 0x20, 255] : CLEAR)) return 'pixel ' + x + ',' + y;
    }
  }
  return ctx.fillStyle === '#f8c020';
});

check('softcanvas: the fill colour of a new context is black; a later fillRect paints over an earlier one', function () {
  const c = soft.createCanvas(3, 1);
  const ctx = c.getContext('2d');
  ctx.fillRect(0, 0, 3, 1);
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(1, 0, 1, 1);
  return same(pixel(c, 0, 0), [0, 0, 0, 255]) && same(pixel(c, 1, 0), RED) && same(pixel(c, 2, 0), [0, 0, 0, 255]);
});

check('softcanvas: fillRect is clipped at all four edges and may lie fully outside', function () {
  const c = soft.createCanvas(4, 4);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(-2, -2, 3, 3);          // covers 0,0 only
  ctx.fillStyle = '#00ff00';
  ctx.fillRect(3, 3, 5, 5);            // covers 3,3 only
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(3, -1, 10, 2);          // covers 3,0 only
  ctx.fillRect(-10, 3, 11, 9);         // covers 0,3 only
  ctx.fillRect(4, 0, 2, 2);            // outside
  ctx.fillRect(0, 4, 2, 2);            // outside
  ctx.fillRect(-5, -5, 5, 5);          // outside
  ctx.fillRect(1, 1, 0, 2);            // no width
  return same(pixel(c, 0, 0), RED) && same(pixel(c, 3, 3), GREEN) && same(pixel(c, 3, 0), BLUE) && same(pixel(c, 0, 3), BLUE) &&
    painted(c) === 4;
});

check('softcanvas: a fillRect larger than the canvas fills it; a negative width or height reaches backwards', function () {
  const c = soft.createCanvas(4, 3);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(-100, -100, 1000, 1000);
  const full = painted(c) === 12;
  const d = soft.createCanvas(4, 3);
  const dctx = d.getContext('2d');
  dctx.fillStyle = '#ff0000';
  dctx.fillRect(3, 2, -2, -1);         // the same as fillRect(1, 1, 2, 1)
  return full && painted(d) === 2 && same(pixel(d, 1, 1), RED) && same(pixel(d, 2, 1), RED) && same(pixel(d, 3, 1), CLEAR);
});

check('softcanvas: clearRect makes pixels transparent again, clipped at the edges', function () {
  const c = soft.createCanvas(4, 4);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 4, 4);
  ctx.clearRect(2, 2, 10, 10);
  ctx.clearRect(-3, -3, 4, 4);
  return same(pixel(c, 0, 0), CLEAR) && same(pixel(c, 1, 0), RED) && same(pixel(c, 2, 2), CLEAR) && same(pixel(c, 3, 3), CLEAR) &&
    same(pixel(c, 1, 2), RED) && painted(c) === 16 - 4 - 1;
});

check('softcanvas: drawImage(canvas, dx, dy) copies the pixels and leaves the destination where the source is transparent', function () {
  const src = patternCanvas();
  const c = soft.createCanvas(8, 6);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 8, 6);
  ctx.drawImage(src, 2, 3);
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 8; x++) {
      const sx = x - 2, sy = y - 3;
      let want = [128, 128, 128, 255];
      if (sx >= 0 && sx < 4 && sy >= 0 && sy < 2 && PATTERN[sy][sx][3] !== 0) want = PATTERN[sy][sx];
      if (!same(pixel(c, x, y), want)) return 'pixel ' + x + ',' + y + ' is ' + pixel(c, x, y);
    }
  }
  return true;
});

check('softcanvas: drawImage(canvas, dx, dy, dw, dh) scales with nearest neighbour: 3x gives blocks of 3 x 3', function () {
  const src = patternCanvas();
  const c = soft.createCanvas(14, 8);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 1, 1, 12, 6);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 14; x++) {
      const inside = x >= 1 && x < 13 && y >= 1 && y < 7;
      const want = inside ? PATTERN[Math.floor((y - 1) / 3)][Math.floor((x - 1) / 3)] : CLEAR;
      if (!same(pixel(c, x, y), want)) return 'pixel ' + x + ',' + y + ' is ' + pixel(c, x, y);
    }
  }
  return true;
});

check('softcanvas: drawImage scales by other factors with the nearest source pixel (4 to 6, 4 to 2, 2 to 3)', function () {
  const src = patternCanvas();
  const c = soft.createCanvas(6, 3);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, 6, 3);
  // columns 0..5 read source columns floor((i + 0.5) * 4 / 6) = 0 1 1 2 3 3; rows 0..2 read floor((j + 0.5) * 2 / 3) = 0 1 1
  const cols = [0, 1, 1, 2, 3, 3], rows = [0, 1, 1];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 6; x++) {
      if (!same(pixel(c, x, y), PATTERN[rows[y]][cols[x]])) return 'enlarged pixel ' + x + ',' + y;
    }
  }
  const d = soft.createCanvas(2, 1);
  const dctx = d.getContext('2d');
  dctx.imageSmoothingEnabled = false;
  dctx.drawImage(src, 0, 0, 2, 1);
  // columns read floor((i + 0.5) * 2) = 1 3; the row reads floor(0.5 * 2) = 1
  return same(pixel(d, 0, 0), CLEAR) && same(pixel(d, 1, 0), MAGENTA);
});

check('softcanvas: drawImage(canvas, sx, sy, sw, sh, dx, dy, dw, dh) draws a part of the source, scaled', function () {
  const src = patternCanvas();
  const c = soft.createCanvas(8, 8);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 2, 0, 2, 2, 1, 2, 4, 4);        // the right half (B W / C M) at 2x
  const part = [[BLUE, WHITE], [CYAN, MAGENTA]];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const inside = x >= 1 && x < 5 && y >= 2 && y < 6;
      const want = inside ? part[Math.floor((y - 2) / 2)][Math.floor((x - 1) / 2)] : CLEAR;
      if (!same(pixel(c, x, y), want)) return 'pixel ' + x + ',' + y + ' is ' + pixel(c, x, y);
    }
  }
  const d = soft.createCanvas(3, 3);
  d.getContext('2d').drawImage(src, 1, 0, 1, 1, 2, 1, 1, 1);     // one pixel, not scaled, smoothing left on
  return same(pixel(d, 2, 1), GREEN) && painted(d) === 1;
});

check('softcanvas: drawImage is clipped at the left, top, right and bottom edge of the canvas', function () {
  const src = patternCanvas();
  const at = [[-2, 0], [0, -1], [2, 0], [0, 2], [-3, -1], [3, 2], [-4, 0], [4, 0], [0, -2], [0, 3], [-50, 50]];
  for (let k = 0; k < at.length; k++) {
    const c = soft.createCanvas(5, 3);
    const ctx = c.getContext('2d');
    ctx.drawImage(src, at[k][0], at[k][1]);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 5; x++) {
        const sx = x - at[k][0], sy = y - at[k][1];
        const want = (sx >= 0 && sx < 4 && sy >= 0 && sy < 2) ? PATTERN[sy][sx] : CLEAR;
        if (!same(pixel(c, x, y), want)) return 'drawn at ' + at[k] + ': pixel ' + x + ',' + y + ' is ' + pixel(c, x, y);
      }
    }
  }
  return true;
});

check('softcanvas: a scaled drawImage is clipped at the edges without shifting the picture', function () {
  const src = patternCanvas();
  const c = soft.createCanvas(6, 4);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, -3, -2, 12, 6);                   // 3x, its top-left corner 3 px left of and 2 px above the canvas
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 6; x++) {
      const want = PATTERN[Math.floor((y + 2) / 3)][Math.floor((x + 3) / 3)];
      if (!same(pixel(c, x, y), want)) return 'pixel ' + x + ',' + y + ' is ' + pixel(c, x, y);
    }
  }
  return true;
});

check('softcanvas: a source rectangle that reaches outside the source canvas draws only the part that exists', function () {
  const src = patternCanvas();
  const c = soft.createCanvas(6, 4);
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 2, 1, 4, 3, 0, 0, 4, 3);          // source columns 2..5 and rows 1..3; only 2..3 and 1 exist
  return same(pixel(c, 0, 0), CYAN) && same(pixel(c, 1, 0), MAGENTA) && painted(c) === 2;
});

check('softcanvas: drawImage agrees with a pixel-by-pixel reference for 300 random rectangles, scales and translations', function () {
  const rnd = makeRandom(20260930);
  const src = soft.createCanvas(7, 5);
  const sctx = src.getContext('2d');
  const colours = [];
  for (let y = 0; y < 5; y++) {
    colours.push([]);
    for (let x = 0; x < 7; x++) {
      const col = rnd(5) === 0 ? CLEAR : [40 + rnd(200), 40 + rnd(200), 40 + rnd(200), 255];
      colours[y].push(col);
      if (col[3] !== 0) {
        sctx.fillStyle = hex(col);
        sctx.fillRect(x, y, 1, 1);
      }
    }
  }
  for (let n = 0; n < 300; n++) {
    const W = 9, H = 7;
    const c = soft.createCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const tx = rnd(7) - 3, ty = rnd(7) - 3;
    const sx = rnd(9) - 1, sy = rnd(7) - 1, sw = 1 + rnd(7), sh = 1 + rnd(5);
    const plain = n % 3 === 0;                       // every third case is not scaled
    const dx = rnd(15) - 5, dy = rnd(13) - 5, dw = plain ? sw : 1 + rnd(12), dh = plain ? sh : 1 + rnd(10);
    ctx.translate(tx, ty);
    ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
    const got = c.toRGBA();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = x - dx - tx, j = y - dy - ty;
        let want = CLEAR;
        if (i >= 0 && i < dw && j >= 0 && j < dh) {
          const px = sx + Math.floor((i + 0.5) * sw / dw), py = sy + Math.floor((j + 0.5) * sh / dh);
          if (px >= 0 && px < 7 && py >= 0 && py < 5) want = colours[py][px];
        }
        const o = (y * W + x) * 4;
        if (got[o] !== want[0] || got[o + 1] !== want[1] || got[o + 2] !== want[2] || got[o + 3] !== want[3]) {
          return 'case ' + n + ' (' + [sx, sy, sw, sh, dx, dy, dw, dh] + ' translated ' + [tx, ty] + '): pixel ' + x + ',' + y;
        }
      }
    }
  }
  return true;
});

check('softcanvas: drawing a canvas onto itself reads the picture as it was before the call', function () {
  const c = patternCanvas();
  const ctx = c.getContext('2d');
  ctx.drawImage(c, 1, 0);
  return same(pixel(c, 0, 0), RED) && same(pixel(c, 1, 0), RED) && same(pixel(c, 2, 0), GREEN) && same(pixel(c, 3, 0), BLUE) &&
    same(pixel(c, 0, 1), YELLOW) && same(pixel(c, 1, 1), YELLOW) && same(pixel(c, 2, 1), CYAN) && same(pixel(c, 3, 1), CYAN);
});

check('softcanvas: a source pixel that is partly transparent is blended over the destination', function () {
  const src = soft.createCanvas(1, 1);
  const data = src.getContext('2d').createImageData(1, 1);
  data.data.set([255, 0, 0, 128]);
  src.getContext('2d').putImageData(data, 0, 0);
  const c = soft.createCanvas(2, 1);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(0, 0, 1, 1);
  ctx.drawImage(src, 0, 0);
  ctx.drawImage(src, 1, 0);
  const a = pixel(c, 0, 0), b = pixel(c, 1, 0);
  return a[0] === 128 && a[1] === 0 && a[2] === 127 && a[3] === 255 && same(b, [255, 0, 0, 128]);
});

check('softcanvas: translate moves fillRect, clearRect and drawImage; translations add up', function () {
  const c = soft.createCanvas(12, 10);
  const ctx = c.getContext('2d');
  ctx.translate(3, 2);
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 1, 1);                       // 3,2
  ctx.translate(4, 5);
  ctx.fillStyle = '#00ff00';
  ctx.fillRect(1, 1, 2, 1);                       // 8,8 and 9,8
  ctx.drawImage(patternCanvas(), -7, -7);         // 0,0 .. 3,1
  ctx.clearRect(-6, -7, 1, 1);                    // 1,0
  return same(pixel(c, 3, 2), RED) && same(pixel(c, 8, 8), GREEN) && same(pixel(c, 9, 8), GREEN) && same(pixel(c, 0, 0), RED) &&
    same(pixel(c, 1, 0), CLEAR) && same(pixel(c, 3, 1), MAGENTA) && painted(c) === 1 + 2 + 7 - 1;
});

check('softcanvas: a translated drawing is clipped at the canvas edges', function () {
  const c = soft.createCanvas(4, 4);
  const ctx = c.getContext('2d');
  ctx.translate(-2, 3);
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 4, 4);                       // covers x -2..1, y 3..6: on the canvas 0,3 and 1,3
  ctx.drawImage(patternCanvas(), 3, -3);          // at 1,0: columns 1..3 of the canvas, rows 0..1
  return same(pixel(c, 0, 3), RED) && same(pixel(c, 1, 3), RED) && same(pixel(c, 2, 3), CLEAR) &&
    same(pixel(c, 1, 0), RED) && same(pixel(c, 3, 0), BLUE) && same(pixel(c, 2, 1), CLEAR) && same(pixel(c, 3, 1), CYAN) &&
    painted(c) === 2 + 5;
});

check('softcanvas: save and restore keep the translation and the fill colour, also when nested', function () {
  const c = soft.createCanvas(10, 1);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.translate(2, 0);
  ctx.fillStyle = '#00ff00';
  ctx.save();
  ctx.translate(3, 0);
  ctx.fillStyle = '#0000ff';
  ctx.imageSmoothingEnabled = true;
  ctx.fillRect(0, 0, 1, 1);                       // blue at 5
  ctx.restore();
  const inner = ctx.fillStyle === '#00ff00' && ctx.imageSmoothingEnabled === false;
  ctx.fillRect(0, 0, 1, 1);                       // green at 2
  ctx.restore();
  ctx.fillRect(0, 0, 1, 1);                       // red at 0
  ctx.restore();                                  // nothing saved: no effect
  ctx.fillRect(1, 0, 1, 1);                       // red at 1
  return inner && ctx.fillStyle === '#ff0000' && same(pixel(c, 5, 0), BLUE) && same(pixel(c, 2, 0), GREEN) &&
    same(pixel(c, 0, 0), RED) && same(pixel(c, 1, 0), RED) && painted(c) === 4;
});

check('softcanvas: setTransform(1, 0, 0, 1, 0, 0) removes the translation', function () {
  const c = soft.createCanvas(6, 1);
  const ctx = c.getContext('2d');
  ctx.translate(4, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 1, 1);
  return same(pixel(c, 0, 0), RED) && same(pixel(c, 4, 0), CLEAR);
});

check('softcanvas: createImageData, putImageData and getImageData; the translation does not apply to them', function () {
  const c = soft.createCanvas(5, 4);
  const ctx = c.getContext('2d');
  const made = ctx.createImageData(2, 2);
  const again = ctx.createImageData(made);
  made.data.set([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 64]);
  ctx.translate(2, 2);
  ctx.putImageData(made, 1, 1);
  const got = ctx.getImageData(1, 1, 2, 2);
  const edge = ctx.getImageData(-1, -1, 3, 3);       // only its pixel 2,2 lies on the canvas, at 1,1
  ctx.putImageData(made, 4, 3);                      // only its first pixel lands on the canvas
  ctx.putImageData(made, -1, -1);                    // only its last pixel lands on the canvas
  return made.width === 2 && made.height === 2 && made.data instanceof Uint8ClampedArray && made.data.length === 16 &&
    again.width === 2 && again.data.length === 16 && again.data[0] === 0 &&
    same(Array.from(got.data), Array.from(made.data)) && got.width === 2 && got.height === 2 &&
    same(pixel(c, 1, 1), RED) && same(pixel(c, 2, 2), [255, 255, 255, 64]) &&
    edge.width === 3 && edge.data.length === 36 && same(Array.from(edge.data.slice(32, 36)), RED) &&
    same(Array.from(edge.data.slice(0, 32)), new Array(32).fill(0)) &&
    same(pixel(c, 4, 3), RED) && same(pixel(c, 0, 0), [255, 255, 255, 64]);
});

check('softcanvas: putImageData replaces pixels without blending', function () {
  const c = soft.createCanvas(1, 1);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.createImageData(1, 1);
  d.data.set([0, 0, 255, 100]);
  ctx.putImageData(d, 0, 0);
  const a = pixel(c, 0, 0);
  d.data.set([0, 0, 0, 0]);
  ctx.putImageData(d, 0, 0);
  return same(a, [0, 0, 255, 100]) && same(pixel(c, 0, 0), CLEAR);
});

const OUTSIDE = ['fillText', 'strokeText', 'measureText', 'strokeRect', 'beginPath', 'moveTo', 'lineTo', 'arc', 'rect', 'fill',
  'stroke', 'clip', 'closePath', 'scale', 'rotate', 'transform', 'resetTransform', 'createLinearGradient',
  'createRadialGradient', 'createPattern', 'quadraticCurveTo', 'bezierCurveTo', 'ellipse', 'setLineDash', 'roundRect'];

check('softcanvas: every method outside the subset throws an error that names the method (' + OUTSIDE.length + ' methods)', function () {
  const ctx = soft.createCanvas(4, 4).getContext('2d');
  const wrong = OUTSIDE.filter(function (name) {
    const message = errorOf(function () { ctx[name](1, 2, 3, 4); });
    return message === null || message.indexOf(name) === -1;
  });
  return wrong.length === 0 ? true : 'no error, or no name in it, for: ' + wrong.join(', ');
});

check('softcanvas: the methods of the subset are exactly the ten of CONTRACT 13.2', function () {
  const ctx = soft.createCanvas(4, 4).getContext('2d');
  const want = ['fillRect', 'clearRect', 'drawImage', 'save', 'restore', 'translate', 'setTransform', 'createImageData',
    'getImageData', 'putImageData'];
  const callable = Object.keys(ctx).filter(function (k) {
    if (typeof ctx[k] !== 'function') return false;
    const message = errorOf(function () { ctx[k](); });
    return message === null || message.indexOf('outside the subset') === -1;
  });
  return same(callable.slice().sort(), want.slice().sort()) && same(soft.SUBSET_METHODS.slice().sort(), want.slice().sort());
});

check('softcanvas: a property outside the subset throws an error that names it; so does a new property', function () {
  const ctx = soft.createCanvas(4, 4).getContext('2d');
  const names = ['strokeStyle', 'font', 'textAlign', 'textBaseline', 'lineWidth', 'globalCompositeOperation', 'shadowBlur', 'filter'];
  const wrong = names.filter(function (name) {
    const message = errorOf(function () { ctx[name] = 'x'; });
    return message === null || message.indexOf(name) === -1;
  });
  const made = errorOf(function () { ctx.somethingNew = 1; });
  if (wrong.length > 0) return 'no error, or no name in it, for: ' + wrong.join(', ');
  return made !== null && made.indexOf('somethingNew') !== -1;
});

check('softcanvas: fillStyle takes #rrggbb only; globalAlpha must stay 1; imageSmoothingEnabled may be set', function () {
  const ctx = soft.createCanvas(4, 4).getContext('2d');
  const bad = ['red', '#fff', 'rgb(1, 2, 3)', 'rgba(0, 0, 0, 0.5)', '#12345', '#1234567', '#gggggg', 7, null, undefined];
  const accepted = bad.filter(function (v) {
    const message = errorOf(function () { ctx.fillStyle = v; });
    return message === null || message.indexOf('fillStyle') === -1;
  });
  if (accepted.length > 0) return 'accepted: ' + accepted.join(', ');
  const alpha = errorOf(function () { ctx.globalAlpha = 0.5; });
  ctx.fillStyle = '#AbCdEf';
  ctx.globalAlpha = 1;
  const before = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.webkitImageSmoothingEnabled = false;       // old prefixed names are accepted and do nothing
  ctx.mozImageSmoothingEnabled = false;
  return alpha !== null && alpha.indexOf('globalAlpha') !== -1 && ctx.fillStyle === '#abcdef' && ctx.globalAlpha === 1 &&
    before === true && ctx.imageSmoothingEnabled === false;
});

check('softcanvas: a coordinate that is not a whole number throws and names the method', function () {
  const ctx = soft.createCanvas(8, 8).getContext('2d');
  const src = patternCanvas();
  const cases = {
    fillRect: function () { ctx.fillRect(0.5, 0, 1, 1); },
    clearRect: function () { ctx.clearRect(0, 0, 1.5, 1); },
    drawImage: function () { ctx.drawImage(src, 1.25, 0); },
    translate: function () { ctx.translate(0.5, 0); },
    getImageData: function () { ctx.getImageData(0, 0.5, 1, 1); },
    putImageData: function () { ctx.putImageData(ctx.createImageData(1, 1), 0.5, 0); }
  };
  const wrong = Object.keys(cases).filter(function (name) {
    const message = errorOf(cases[name]);
    return message === null || message.indexOf(name) === -1;
  });
  const nan = errorOf(function () { ctx.fillRect(NaN, 0, 1, 1); }) !== null && errorOf(function () { ctx.fillRect(0, 0, 1); }) !== null;
  return wrong.length === 0 ? nan : 'no error, or no name in it, for: ' + wrong.join(', ');
});

check('softcanvas: drawImage throws for a negative size, for scaling with smoothing on, for another source and for 4 arguments', function () {
  const c = soft.createCanvas(8, 8);
  const ctx = c.getContext('2d');
  const src = patternCanvas();
  const flipped = errorOf(function () { ctx.drawImage(src, 4, 0, -4, 2); });
  const smooth = errorOf(function () { ctx.drawImage(src, 0, 0, 8, 4); });
  const other = errorOf(function () { ctx.drawImage({ width: 4, height: 2 }, 0, 0); });
  const four = errorOf(function () { ctx.drawImage(src, 0, 0, 4); });
  const empty = errorOf(function () { ctx.drawImage(soft.createCanvas(0, 0), 0, 0); });
  const unchanged = painted(c) === 0;
  ctx.drawImage(src, 0, 0, 0, 2);                  // a size of 0 paints nothing and is not an error
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const transform = errorOf(function () { ctx.setTransform(2, 0, 0, 2, 0, 0); });
  return [flipped, smooth, other, four, empty].every(function (m) { return m !== null && m.indexOf('drawImage') !== -1; }) &&
    smooth.indexOf('imageSmoothingEnabled') !== -1 && unchanged && painted(c) === 0 &&
    transform !== null && transform.indexOf('setTransform') !== -1;
});

check('softcanvas: setting width or height clears the picture and returns the context to its starting state', function () {
  const c = soft.createCanvas(4, 4);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.imageSmoothingEnabled = false;
  ctx.translate(1, 1);
  ctx.save();
  ctx.fillRect(0, 0, 2, 2);
  c.width = 6;
  const cleared = painted(c) === 0 && c.width === 6 && c.height === 4 && c.toRGBA().length === 96;
  const reset = ctx.fillStyle === '#000000' && ctx.imageSmoothingEnabled === true;
  ctx.restore();                                   // the saved state is gone: no effect
  ctx.fillRect(0, 0, 1, 1);
  c.height = 2;
  return cleared && reset && same(pixel(c, 0, 0), CLEAR) && c.toRGBA().length === 48 && c.getContext('2d') === ctx;
});

check('softcanvas: the onCall option reports every method call', function () {
  const calls = [];
  const c = soft.createCanvas(4, 4, { onCall: function (name) { calls.push(name); } });
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.save();
  ctx.translate(1, 1);
  ctx.fillRect(0, 0, 1, 1);
  ctx.restore();
  ctx.drawImage(patternCanvas(), 0, 0);
  return same(calls, ['save', 'translate', 'fillRect', 'restore', 'drawImage']);
});

check('softcanvas.scaleRGBA enlarges pixels by a whole factor', function () {
  const src = patternCanvas();
  const big = soft.scaleRGBA(src.toRGBA(), 4, 2, 3);
  if (big.width !== 12 || big.height !== 6 || big.rgba.length !== 12 * 6 * 4) return 'size ' + big.width + ' x ' + big.height;
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 12; x++) {
      const o = (y * 12 + x) * 4;
      if (!same(Array.from(big.rgba.slice(o, o + 4)), PATTERN[Math.floor(y / 3)][Math.floor(x / 3)])) return 'pixel ' + x + ',' + y;
    }
  }
  return true;
});

check('softcanvas to PNG and back: the file holds the picture that was drawn', function () {
  const c = soft.createCanvas(16, 9);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#5c94fc';
  ctx.fillRect(0, 0, 16, 5);
  ctx.drawImage(patternCanvas(), 2, 3, 8, 4);
  const file = path.join(tmp, 'canvas.png');
  png.write(file, c.width, c.height, c.toRGBA());
  const back = png.read(file);
  return back.width === 16 && back.height === 9 && Buffer.from(back.rgba).equals(Buffer.from(c.toRGBA()));
});

check('softcanvas: a frame of 384 x 216 with 2,000 fills and 2,000 sprite draws takes less than 2 seconds', function () {
  const c = soft.createCanvas(384, 216);
  const ctx = c.getContext('2d');
  const sprite = soft.createCanvas(16, 16);
  const sctx = sprite.getContext('2d');
  sctx.fillStyle = '#d82c2c';
  sctx.fillRect(2, 2, 12, 12);
  const rnd = makeRandom(5);
  const t0 = process.hrtime.bigint();
  ctx.fillStyle = '#5c94fc';
  for (let i = 0; i < 2000; i++) ctx.fillRect(rnd(384) - 8, rnd(216) - 8, 1 + rnd(64), 1 + rnd(64));
  for (let i = 0; i < 2000; i++) ctx.drawImage(sprite, rnd(400) - 16, rnd(232) - 16);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return ms < 2000 ? true : 'took ' + ms.toFixed(0) + ' ms';
});

// =================================================================================================
// tools/sheet.js
// =================================================================================================

// Three test sprites. They exist only in this test.
const TEST_SPRITES = {
  test_walker: {
    w: 16, h: 16, anchor: [8, 16], fps: 8, owner: 'C', names: ['step0', 'step1', 'back'],
    frames: [
      [
        '................',
        '.....00000......',
        '....0ppppp0.....',
        '...0ppppppp0....',
        '...000000000....',
        '....0vv0v0......',
        '....0vvvvv0.....',
        '.....0vvv0......',
        '....0aaaaa0..0..',
        '...0aaaaaaa004..',
        '...0a0aaa0a0....',
        '...0v0aaa0v0....',
        '....00aaa00.....',
        '.....09090......',
        '....0990990.....',
        '....000.000.....'
      ],
      [
        '................',
        '.....00000......',
        '....0ppppp0.....',
        '...0ppppppp0....',
        '...000000000....',
        '....0vv0v0......',
        '....0vvvvv0.....',
        '.....0vvv0......',
        '....0aaaaa0..0..',
        '...0aaaaaaa004..',
        '...0a0aaa0a0....',
        '...0v0aaa0v0....',
        '....00aaa00.....',
        '....0990.090....',
        '...0990...0990..',
        '...000.....000..'
      ],
      { copy: 0, flipX: true }
    ]
  },
  test_flag: {
    w: 8, h: 8, anchor: [0, 8], fps: 4, owner: 'D', names: ['left', 'right'],
    frames: [
      [
        '0.......',
        '0pppp...',
        '0ppppp..',
        '0pppp...',
        '0.......',
        '0.......',
        '0.......',
        '000.....'
      ],
      { copy: 0, flipX: true }
    ]
  },
  test_bar: {
    w: 12, h: 4, anchor: [6, 4], fps: 0, owner: 'D', names: ['bar'],
    frames: [[
      '000000000000',
      '0iiiihhhhqq0',
      '0eeeeddddcc0',
      '000000000000'
    ]]
  }
};

function loadWithTestSprites() {
  const env = stubs.load({ files: ['js/core.js'] });
  Object.keys(TEST_SPRITES).forEach(function (name) {
    env.TG.Sprites.define(name, JSON.parse(JSON.stringify(TEST_SPRITES[name])));
  });
  env.TG.Remaps.test_white = { '*': 4 };
  env.TG.Remaps.test_gold = { 25: 18, 10: 16 };
  return env;
}

function rgbOf(TG, index) {
  const n = parseInt(TG.PAL[index].slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

// Compares every frame cell of a sheet with the sprite data. `colour(index)` maps a palette index of the
// sprite data to the palette index that must be seen.
function compareCells(TG, picture, bg, colour) {
  const KEYS = TG.PAL_KEYS;
  for (let k = 0; k < picture.cells.length; k++) {
    const cell = picture.cells[k];
    const def = TEST_SPRITES[cell.sprite];
    let frame = def.frames[cell.index];
    let flip = false;
    if (!Array.isArray(frame)) {
      flip = !!frame.flipX;
      frame = def.frames[frame.copy];
    }
    const s = picture.scale;
    if (cell.w !== def.w * s || cell.h !== def.h * s) return cell.sprite + ' frame ' + cell.index + ' has the wrong size';
    for (let py = 0; py < def.h; py++) {
      for (let px = 0; px < def.w; px++) {
        const ch = frame[py].charAt(flip ? def.w - 1 - px : px);
        const want = rgbOf(TG, ch === '.' ? bg : colour(KEYS.indexOf(ch)));
        for (let by = 0; by < s; by++) {
          for (let bx = 0; bx < s; bx++) {
            const o = ((cell.y + py * s + by) * picture.width + cell.x + px * s + bx) * 4;
            if (picture.rgba[o] !== want[0] || picture.rgba[o + 1] !== want[1] || picture.rgba[o + 2] !== want[2] || picture.rgba[o + 3] !== 255) {
              return cell.sprite + ' frame ' + cell.index + ' pixel ' + px + ',' + py + ' is ' +
                Array.from(picture.rgba.slice(o, o + 4)) + ', expected ' + want;
            }
          }
        }
      }
    }
  }
  return true;
}

check('sheet.render draws every frame of the three test sprites, pixel for pixel, at 4x on the SKY background', function () {
  const env = loadWithTestSprites();
  const picture = sheet.render(env.TG, {});
  if (picture.sprites !== 3 || picture.frames !== 6 || picture.cells.length !== 6 || picture.scale !== 4) {
    return picture.sprites + ' sprites, ' + picture.frames + ' frames';
  }
  if (picture.rgba.length !== picture.width * picture.height * 4) return 'the picture has the wrong length';
  return compareCells(env.TG, picture, 7, function (i) { return i; });
});

check('sheet.render resolves { copy, flipX }: frame "back" of test_walker is frame "step0" mirrored', function () {
  const env = loadWithTestSprites();
  const picture = sheet.render(env.TG, { filter: 'walker', scale: 1 });
  const a = picture.cells[0], b = picture.cells[2];
  let differs = false;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const o1 = ((a.y + y) * picture.width + a.x + x) * 4;
      const o2 = ((b.y + y) * picture.width + b.x + (15 - x)) * 4;
      const o3 = ((b.y + y) * picture.width + b.x + x) * 4;
      for (let k = 0; k < 4; k++) {
        if (picture.rgba[o1 + k] !== picture.rgba[o2 + k]) return 'pixel ' + x + ',' + y + ' is not mirrored';
        if (picture.rgba[o1 + k] !== picture.rgba[o3 + k]) differs = true;
      }
    }
  }
  const rows = sheet.framePixels(TEST_SPRITES.test_flag, 1);
  return differs && same(rows[1], [-1, -1, -1, 25, 25, 25, 25, 0]) && same(rows[7], [-1, -1, -1, -1, -1, 0, 0, 0]);
});

check('sheet.render follows scale, bg, filter and owner', function () {
  const env = loadWithTestSprites();
  const TG = env.TG;
  const big = sheet.render(TG, { scale: 6, bg: 5, filter: 'flag,bar' });
  const onlyC = sheet.render(TG, { owner: 'C', scale: 2 });
  const onlyD = sheet.render(TG, { owner: 'D', scale: 2 });
  const both = sheet.render(TG, { owner: 'D', filter: 'bar', scale: 2 });
  if (!same(big.names, ['test_flag', 'test_bar']) || big.scale !== 6) return 'filter gave ' + big.names;
  if (!same(onlyC.names, ['test_walker']) || !same(onlyD.names, ['test_flag', 'test_bar']) || !same(both.names, ['test_bar'])) return 'owner';
  const r = compareCells(TG, big, 5, function (i) { return i; });
  if (r !== true) return r;
  return compareCells(TG, onlyD, 7, function (i) { return i; });
});

check('sheet.render applies a remap, with "*" for every colour that is not listed', function () {
  const env = loadWithTestSprites();
  const TG = env.TG;
  const white = sheet.render(TG, { remap: 'test_white', scale: 2 });
  const gold = sheet.render(TG, { remap: 'test_gold', scale: 2 });
  const a = compareCells(TG, white, 7, function () { return 4; });
  if (a !== true) return 'white: ' + a;
  return compareCells(TG, gold, 7, function (i) { return i === 25 ? 18 : (i === 10 ? 16 : i); });
});

check('sheet.render labels the picture: the text is drawn outside the frames, and the page wraps at the width given', function () {
  const env = loadWithTestSprites();
  const TG = env.TG;
  const wide = sheet.render(TG, { scale: 4, width: 1024 });
  const narrow = sheet.render(TG, { scale: 4, width: 260 });
  const white = rgbOf(TG, 4);
  // Title pixels: WHITE pixels above the first frame.
  const first = wide.cells[0];
  let titlePixels = 0;
  for (let y = 0; y < first.y - 1; y++) {
    for (let x = 0; x < wide.width; x++) {
      const o = (y * wide.width + x) * 4;
      if (wide.rgba[o] === white[0] && wide.rgba[o + 1] === white[1] && wide.rgba[o + 2] === white[2]) titlePixels++;
    }
  }
  // No frame overlaps another, and every frame lies inside the picture.
  function separate(p) {
    return p.cells.every(function (a, i) {
      const inside = a.x >= 0 && a.y >= 0 && a.x + a.w <= p.width && a.y + a.h <= p.height;
      return inside && p.cells.every(function (b, j) {
        return i === j || a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      });
    });
  }
  const rowsWide = wide.cells.map(function (c) { return c.y; }).filter(function (y, i, all) { return all.indexOf(y) === i; }).length;
  const rowsNarrow = narrow.cells.map(function (c) { return c.y; }).filter(function (y, i, all) { return all.indexOf(y) === i; }).length;
  return titlePixels > 200 && separate(wide) && separate(narrow) && rowsWide === 1 && rowsNarrow >= 2 &&
    narrow.width <= 260 && narrow.height > wide.height &&
    compareCells(TG, narrow, 7, function (i) { return i; }) === true;
});

check('sheet: the label font has a glyph of 5 x 7 for A to Z, 0 to 9 and the signs used in sprite names; no two are the same', function () {
  const need = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-.,:/ '.split('');
  const absent = need.filter(function (ch) { return !sheet.FONT[ch]; });
  if (absent.length > 0) return 'missing: ' + absent.join(' ');
  const keys = Object.keys(sheet.FONT);
  const bad = keys.filter(function (ch) {
    const g = sheet.FONT[ch];
    return g.length !== 7 || g.some(function (row) { return row.length !== 5 || /[^#.]/.test(row); });
  });
  if (bad.length > 0) return 'wrong shape: ' + bad.join(' ');
  const seen = {};
  const twins = keys.filter(function (ch) {
    const text = sheet.FONT[ch].join('');
    if (seen[text]) return true;
    seen[text] = true;
    return false;
  });
  return twins.length === 0 ? sheet.textWidth('abc', 2) === 36 : 'same glyph twice: ' + twins.join(' ');
});

check('sheet.render throws a clear error when nothing matches, for an unknown remap and for a bad scale or background', function () {
  const env = loadWithTestSprites();
  const empty = stubs.load({ files: ['js/core.js'] });
  const none = errorOf(function () { sheet.render(env.TG, { filter: 'no_such_sprite' }); });
  const nothing = errorOf(function () { sheet.render(empty.TG, {}); });
  const remap = errorOf(function () { sheet.render(env.TG, { remap: 'no_such_remap' }); });
  return none !== null && nothing !== null && remap !== null && remap.indexOf('no_such_remap') !== -1 &&
    remap.indexOf('test_white') !== -1 &&
    errorOf(function () { sheet.render(env.TG, { scale: 0 }); }) !== null &&
    errorOf(function () { sheet.render(env.TG, { scale: 2.5 }); }) !== null &&
    errorOf(function () { sheet.render(env.TG, { bg: 32 }); }) !== null;
});

// The command line, with the test sprites in a temporary file outside the project.
const spriteFile = path.join(tmp, 'test-sprites.js');
fs.writeFileSync(spriteFile,
  '(function (root) {\n' +
  '  \'use strict\';\n' +
  '  var TG = root.TG = root.TG || {};\n' +
  Object.keys(TEST_SPRITES).map(function (name) {
    return '  TG.Sprites.define(' + JSON.stringify(name) + ', ' + JSON.stringify(TEST_SPRITES[name]) + ');\n';
  }).join('') +
  '  TG.Remaps.test_white = { \'*\': 4 };\n' +
  '  TG.Remaps.test_gold = { 25: 18, 10: 16 };\n' +
  '})(typeof window !== \'undefined\' ? window : globalThis);\n');

function runSheet(args) {
  return childProcess.spawnSync(process.execPath, [path.join(stubs.ROOT, 'tools', 'sheet.js')].concat(args),
    { cwd: stubs.ROOT, encoding: 'utf8' });
}

check('node tools/sheet.js --out <file.png> writes a PNG that holds the same picture as sheet.render', function () {
  const file = path.join(tmp, 'sheets', 'test-sheet.png');
  const r = runSheet(['--out', file, '--files', spriteFile]);
  if (r.status !== 0) return 'exit code ' + r.status + ': ' + (r.stderr || r.stdout).trim().split('\n')[0];
  if (!fs.existsSync(file)) return 'the file was not written';
  const back = png.read(file);
  const env = loadWithTestSprites();
  const picture = sheet.render(env.TG, {});
  if (r.stdout.indexOf('3 sprites, 6 frames') === -1) return 'the summary line is missing: ' + r.stdout.trim().split('\n')[0];
  return back.width === picture.width && back.height === picture.height &&
    Buffer.from(back.rgba).equals(Buffer.from(picture.rgba)) &&
    compareCells(env.TG, { width: back.width, height: back.height, rgba: back.rgba, cells: picture.cells, scale: 4 }, 7,
      function (i) { return i; }) === true;
});

check('node tools/sheet.js follows --scale, --filter, --owner, --remap and --bg', function () {
  const file = path.join(tmp, 'options.png');
  const r = runSheet(['--out', file, '--files', spriteFile, '--scale', '3', '--filter', 'test_', '--owner', 'D', '--remap', 'test_gold', '--bg', '12']);
  if (r.status !== 0) return 'exit code ' + r.status + ': ' + (r.stderr || r.stdout).trim().split('\n')[0];
  const back = png.read(file);
  const env = loadWithTestSprites();
  const picture = sheet.render(env.TG, { scale: 3, filter: 'test_', owner: 'D', remap: 'test_gold', bg: 12 });
  return picture.frames === 3 && back.width === picture.width && back.height === picture.height &&
    Buffer.from(back.rgba).equals(Buffer.from(picture.rgba)) &&
    compareCells(env.TG, picture, 12, function (i) { return i === 25 ? 18 : (i === 10 ? 16 : i); }) === true;
});

check('node tools/sheet.js ends with code 1 and a message when --out is missing, a remap is unknown or nothing matches', function () {
  const a = runSheet(['--files', spriteFile]);
  const b = runSheet(['--out', path.join(tmp, 'x.png'), '--files', spriteFile, '--remap', 'no_such_remap']);
  const c = runSheet(['--out', path.join(tmp, 'y.png'), '--files', spriteFile, '--filter', 'no_such_sprite']);
  const d = runSheet(['--out', path.join(tmp, 'z.png'), '--files', spriteFile, '--colour', 'blue']);
  return a.status === 1 && b.status === 1 && c.status === 1 && d.status === 1 &&
    a.stderr.indexOf('--out') !== -1 && b.stderr.indexOf('no_such_remap') !== -1 && d.stderr.indexOf('--colour') !== -1 &&
    !fs.existsSync(path.join(tmp, 'x.png')) && !fs.existsSync(path.join(tmp, 'y.png'));
});

check('node tools/sheet.js ends with code 2 and names the file when a sprite file does not load', function () {
  const broken = path.join(tmp, 'broken-sprites.js');
  fs.writeFileSync(broken, '(function (root) { root.TG.Sprites.define("test_bad", { w: 2, h: 1, anchor: [0, 0], fps: 0, owner: "C", ' +
    'names: ["a"], frames: [["0"]] }); })(window);\n');
  const r = runSheet(['--out', path.join(tmp, 'broken.png'), '--files', broken]);
  return r.status === 2 && r.stderr.indexOf('broken-sprites.js') !== -1 && r.stderr.indexOf('test_bad') !== -1 &&
    !fs.existsSync(path.join(tmp, 'broken.png'));
});

check('no test sprite is left in the registry of a fresh load, and js/ holds no sprite named test_', function () {
  const env = stubs.load();
  const left = env.TG.Sprites.names().filter(function (n) { return n.indexOf('test_') === 0; });
  const jsDir = path.join(stubs.ROOT, 'js');
  const hits = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.js$/.test(e.name) && /define\(\s*['"]test_/.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative(stubs.ROOT, p));
    });
  })(jsDir);
  return left.length === 0 && hits.length === 0 ? true : 'found: ' + left.concat(hits).join(', ');
});

// Optional: keep the sheet of the test sprites so that it can be looked at.
(function () {
  const i = process.argv.indexOf('--out');
  if (i === -1 || !process.argv[i + 1]) return;
  const env = loadWithTestSprites();
  const picture = sheet.render(env.TG, {});
  png.write(process.argv[i + 1], picture.width, picture.height, picture.rgba);
  console.log('wrote ' + path.resolve(process.argv[i + 1]) + ' (' + picture.width + ' x ' + picture.height + ')');
})();

fs.rmSync(tmp, { recursive: true, force: true });

console.log('');
console.log('test-tools: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
