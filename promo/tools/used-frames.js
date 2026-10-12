#!/usr/bin/env node
// promo/tools/used-frames.js
// Lists the clip frames that videos ask for, as "keep" ranges for clips.json, so that tools/capture.js
// writes only those pictures. A long clip of which a few stretches are used otherwise leaves
// thousands of unused files in public/, which makes Remotion Studio slow.
//
//   node tools/used-frames.js <CompositionId> [<CompositionId> ...] [--margin 30] [--write]
//
// Each video is rendered once at a tenth of its size into a temporary folder, with the kit reporting
// every frame it asks for (src/kit/clip.ts, REMOTION_LOG_FRAMES). The ranges are widened by --margin
// frames on both sides and joined where they touch. --write puts them into clips.json: name every
// video that uses the clips in one call, because the ranges written replace the ones that were there.
// A clip that no named video uses is left as it is.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PROMO = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const ids = args.filter(function (a, i) { return a.slice(0, 2) !== '--' && args[i - 1] !== '--margin'; });
const marginAt = args.indexOf('--margin');
const margin = marginAt === -1 ? 30 : Number(args[marginAt + 1]);
if (ids.length === 0) {
  console.error('usage: node tools/used-frames.js <CompositionId> [...] [--margin 30] [--write]');
  process.exit(1);
}

const used = new Map();       // clip -> Set of frames
for (const id of ids) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'used-frames-'));
  const r = spawnSync(path.join(PROMO, 'node_modules', '.bin', 'remotion'),
    ['render', id, tmp, '--sequence', '--image-format=jpeg', '--scale=0.1', '--log=verbose'],
    { cwd: PROMO, encoding: 'utf8', maxBuffer: 1 << 30, env: Object.assign({}, process.env, { REMOTION_LOG_FRAMES: '1' }) });
  fs.rmSync(tmp, { recursive: true, force: true });
  if (r.status !== 0) {
    console.error('used-frames: rendering ' + id + ' failed\n' + String(r.stderr || r.stdout).split('\n').slice(-15).join('\n'));
    process.exit(1);
  }
  const text = String(r.stdout) + String(r.stderr);
  const re = /clipframe (\S+) (\d+)/g;
  let m, n = 0;
  while ((m = re.exec(text))) {
    if (!used.has(m[1])) used.set(m[1], new Set());
    used.get(m[1]).add(Number(m[2]));
    n++;
  }
  console.error('used-frames: ' + id + ' asked for a clip frame ' + n + ' times');
}

const keep = {};
for (const [clip, set] of used) {
  const frames = Array.from(set).sort(function (a, b) { return a - b; });
  const ranges = [];
  for (const f of frames) {
    const a = Math.max(0, f - margin), b = f + margin;
    const last = ranges[ranges.length - 1];
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else ranges.push([a, b]);
  }
  keep[clip] = ranges;
}
for (const clip of Object.keys(keep).sort()) {
  const total = keep[clip].reduce(function (n, r) { return n + r[1] - r[0] + 1; }, 0);
  console.log(clip + ': ' + total + ' frames in ' + keep[clip].length + ' ranges  ' + JSON.stringify(keep[clip]));
}

if (args.indexOf('--write') !== -1) {
  const file = path.join(PROMO, 'clips.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const run of Object.values(manifest.runs)) {
    for (const clip of run.clips || []) {
      if (keep[clip.name]) clip.keep = keep[clip.name];
    }
  }
  // One line per clip, so that the ranges stay readable.
  const text = JSON.stringify(manifest, function (key, value) {
    return key === 'clips' ? value.map(function (c) { return '@@' + JSON.stringify(c) + '@@'; }) : value;
  }, 2).replace(/"@@(.*?)@@"/g, function (_, c) { return JSON.parse('"' + c + '"'); });
  fs.writeFileSync(file, text + '\n');
  console.error('used-frames: wrote the ranges to clips.json');
}
