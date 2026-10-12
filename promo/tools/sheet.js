#!/usr/bin/env node
// promo/tools/sheet.js
// Contact sheets of a composition, for checking a short without rendering the video: chosen frames
// side by side in one PNG, each with its frame number and time.
//
//   node tools/sheet.js <CompositionId> --out <file.png> [--every 15] [--from 0] [--to <last>]
//                       [--frames 0,12,45] [--cols 6] [--scale 0.25]
//
// With more than --cols x 2 frames, several sheets are written: <file>-1.png, <file>-2.png ...
// --scale is the size of each frame relative to 1080 x 1920 (0.25 gives 270 x 480).
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PROMO = path.resolve(__dirname, '..');
const png = require(path.join(PROMO, '..', 'tools', 'png'));

const args = process.argv.slice(2);
const id = args[0];
const opt = function (name, fallback) {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
if (!id || id.slice(0, 2) === '--' || !opt('--out')) {
  console.error('usage: node tools/sheet.js <CompositionId> --out <file.png> [--every 15] [--from 0] [--to <last>] [--frames a,b,c] [--cols 6] [--scale 0.25]');
  process.exit(1);
}
const out = path.resolve(opt('--out'));
const cols = Number(opt('--cols', 6));
const scale = Number(opt('--scale', 0.25));
const every = Number(opt('--every', 15));
const from = Number(opt('--from', 0));

const remotion = path.join(PROMO, 'node_modules', '.bin', 'remotion');
let frames;
if (opt('--frames')) {
  frames = opt('--frames').split(',').map(Number);
} else {
  let to = opt('--to');
  if (to === undefined) {
    const list = execFileSync(remotion, ['compositions', '--quiet'], { cwd: PROMO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    // --quiet prints the ids only; the duration comes from the full listing.
    const full = execFileSync(remotion, ['compositions'], { cwd: PROMO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const line = full.split('\n').find(function (l) { return l.trim().split(/\s+/)[0] === id; });
    const m = line ? line.match(/\s(\d+)\s*\(/) : null;
    if (!m || list.indexOf(id) === -1) {
      console.error('sheet: composition ' + id + ' was not found, or its length could not be read; give --to');
      process.exit(1);
    }
    to = Number(m[1]) - 1;
  }
  frames = [];
  for (let f = from; f <= Number(to); f += every) frames.push(f);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-'));
execFileSync(remotion, ['render', id, tmp, '--frames=' + frames.join(','), '--image-format=png', '--scale=' + scale, '--log=error'],
  { cwd: PROMO, stdio: ['ignore', 'ignore', 'inherit'] });
const files = fs.readdirSync(tmp).filter(function (f) { return f.endsWith('.png'); });
const byFrame = new Map();
for (const f of files) {
  const m = f.match(/(\d+)\.png$/);
  if (m) byFrame.set(Number(m[1]), path.join(tmp, f));
}

// A 3 x 5 pixel font for the labels.
const GLYPHS = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001001001001', '8': '111101111101111', '9': '111101111001111',
  '.': '000000000000010', 's': '000011110011110', 'f': '011100110100100', ' ': '000000000000000'
};
function label(rgba, W, x, y, text, k) {
  for (let i = 0; i < text.length; i++) {
    const g = GLYPHS[text[i]] || GLYPHS[' '];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (g[r * 3 + c] !== '1') continue;
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
        const o = ((y + r * k + dy) * W + x + (i * 4 + c) * k + dx) * 4;
        rgba[o] = 248; rgba[o + 1] = 192; rgba[o + 2] = 32; rgba[o + 3] = 255;
      }
    }
  }
}

const first = png.read(byFrame.get(frames[0]));
const fw = first.width, fh = first.height, gap = 6, head = 22;
const perSheet = cols * 2;
const sheets = Math.ceil(frames.length / perSheet);
for (let s = 0; s < sheets; s++) {
  const part = frames.slice(s * perSheet, (s + 1) * perSheet);
  const rows = Math.ceil(part.length / cols);
  const W = cols * fw + (cols + 1) * gap, H = rows * (fh + head) + (rows + 1) * gap;
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < rgba.length; i += 4) { rgba[i] = 40; rgba[i + 1] = 40; rgba[i + 2] = 48; rgba[i + 3] = 255; }
  part.forEach(function (f, k) {
    const img = png.read(byFrame.get(f));
    const ox = gap + (k % cols) * (fw + gap), oy = gap + Math.floor(k / cols) * (fh + head + gap);
    label(rgba, W, ox, oy + 2, 'f' + f + '  ' + (f / 30).toFixed(1) + 's', 3);
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const src = (y * fw + x) * (img.rgba.length / (fw * fh)), dst = ((oy + head + y) * W + ox + x) * 4;
        rgba[dst] = img.rgba[src]; rgba[dst + 1] = img.rgba[src + 1]; rgba[dst + 2] = img.rgba[src + 2]; rgba[dst + 3] = 255;
      }
    }
  });
  const file = sheets === 1 ? out : out.replace(/\.png$/, '') + '-' + (s + 1) + '.png';
  png.write(file, W, H, rgba);
  console.log('sheet: frames ' + part[0] + ' to ' + part[part.length - 1] + ' -> ' + file);
}
fs.rmSync(tmp, { recursive: true, force: true });
