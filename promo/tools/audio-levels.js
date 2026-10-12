#!/usr/bin/env node
// promo/tools/audio-levels.js
// Prints the loudness of a WAV file over time, to check a short's sound without listening to it:
// one line per half second with the peak, the RMS level and a bar. Silence, a missing track and
// clipping are easy to see.
//
//   npx remotion render <CompositionId> out/<name>.wav --codec=wav     the sound of a short on its own
//   node tools/audio-levels.js out/<name>.wav [--step 0.5]
//
// Reads 16-bit PCM WAV files.
'use strict';

const fs = require('fs');

const file = process.argv[2];
const stepArg = process.argv.indexOf('--step');
const step = stepArg === -1 ? 0.5 : Number(process.argv[stepArg + 1]);
if (!file) {
  console.error('usage: node tools/audio-levels.js <file.wav> [--step 0.5]');
  process.exit(1);
}
const buf = fs.readFileSync(file);
if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
  console.error('audio-levels: not a WAV file');
  process.exit(1);
}
let pos = 12, channels = 2, rate = 44100, bits = 16, dataStart = -1, dataLength = 0;
while (pos + 8 <= buf.length) {
  const id = buf.toString('ascii', pos, pos + 4);
  const size = buf.readUInt32LE(pos + 4);
  if (id === 'fmt ') {
    channels = buf.readUInt16LE(pos + 10);
    rate = buf.readUInt32LE(pos + 12);
    bits = buf.readUInt16LE(pos + 22);
  } else if (id === 'data') {
    dataStart = pos + 8;
    dataLength = Math.min(size, buf.length - dataStart);
    break;
  }
  pos += 8 + size + (size % 2);
}
if (dataStart === -1 || bits !== 16) {
  console.error('audio-levels: needs 16-bit PCM (this file has ' + bits + ' bits)');
  process.exit(1);
}
const frameBytes = channels * 2;
const frames = Math.floor(dataLength / frameBytes);
const per = Math.round(rate * step);
console.log(file + ': ' + (frames / rate).toFixed(2) + ' s, ' + channels + ' channels, ' + rate + ' Hz');
let clipped = 0;
for (let start = 0; start < frames; start += per) {
  let peak = 0, sum = 0, n = 0;
  for (let i = start; i < Math.min(frames, start + per); i++) {
    for (let c = 0; c < channels; c++) {
      const v = buf.readInt16LE(dataStart + i * frameBytes + c * 2) / 32768;
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
      sum += v * v;
      n++;
    }
  }
  const rms = Math.sqrt(sum / Math.max(1, n));
  const db = rms > 0 ? 20 * Math.log10(rms) : -99;
  const bar = '#'.repeat(Math.max(0, Math.round((db + 60) / 1.5)));
  console.log((start / rate).toFixed(1).padStart(6) + ' s  peak ' + peak.toFixed(2) + '  rms ' + db.toFixed(1).padStart(6) + ' dB  ' + bar);
}
if (clipped) console.log(clipped + ' samples at full scale');
