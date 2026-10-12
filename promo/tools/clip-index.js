#!/usr/bin/env node
// promo/tools/clip-index.js
// Prints the timeline of a captured clip: the frame (30 a second) of each event worth cutting on.
//
//   node tools/clip-index.js <clip> [--from <frame>] [--to <frame>] [--keys]
//   node tools/clip-index.js <clip> --words [--from <frame>] [--to <frame>]
//
// --keys also lists every key typed. --words lists each creature word instead: the frame it appeared,
// the seconds it was allowed, how long it took to type, the time to spare (all real seconds, as the
// game counts them), and how many other typable creatures were alive while it was.
// An event listed at frame f happens after the picture of frame f and is first seen in the next one.
// Reads public/clips/<clip>/events.json and data.json.
'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const clip = args.find(function (a) { return a.slice(0, 2) !== '--' && !/^\d+$/.test(a); });
const opt = function (name, fallback) {
  const i = args.indexOf(name);
  return i === -1 ? fallback : Number(args[i + 1]);
};
if (!clip) {
  console.error('usage: node tools/clip-index.js <clip> [--from <frame>] [--to <frame>] [--keys]');
  process.exit(1);
}
const from = opt('--from', 0), to = opt('--to', Infinity), keys = args.indexOf('--keys') !== -1;
const dir = path.join(__dirname, '..', 'public', 'clips', clip);
const events = JSON.parse(fs.readFileSync(path.join(dir, 'events.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));

const describe = {
  'threat:spawn': function (p) {
    const e = p.entity || {};
    return e.kind + ' "' + e.word + '" from ' + e.from + ', ' + (typeof e.eta === 'number' ? e.eta.toFixed(2) + ' s allowed' : '');
  },
  'word:clear': function (p) { return p.kind + ' "' + p.word + '"' + (p.clean ? ' clean' : '') + (p.cause !== 'typed' ? ' (' + p.cause + ')' : ''); },
  'target:lock': function (p) { return (p.target ? p.target.kind + ' "' + p.target.word + '"' : ''); },
  'type:miss': function (p) { return 'typed "' + p.ch + '" for "' + p.expected + '"'; },
  'type:hit': function (p) { return p.ch + ' (' + (p.index + 1) + ' of ' + p.length + ')' + (p.complete ? ' done' : ''); },
  'boss:state': function (p) { return p.state + ', phase ' + p.phase + ', round ' + p.round; },
  'boss:attack': function (p) { return p.kind; },
  'boss:weakopen': function (p) { return p.word ? '"' + p.word + '"' : ''; },
  'boss:phase': function (p) { return 'phase ' + p.phase; },
  'boss:hit': function (p) { return p.health !== undefined ? 'health ' + p.health : ''; },
  'boss:finisher': function (p) { return p.word ? '"' + p.word + '"' : ''; },
  'attack:spawn': function (p) { return p.kind + ' (' + (p.action || '') + ')'; },
  'pickup:power': function (p) { return String(p.kind || p.power || ''); },
  'power:start': function (p) { return String(p.kind || p.power || ''); },
  'power:end': function (p) { return String(p.kind || p.power || ''); },
  'screen:change': function (p) { return p.from + ' -> ' + p.to; },
  'section:enter': function (p) { return 'section ' + (p.index !== undefined ? p.index : '') + ' ' + (p.name || ''); },
  'streak:change': function (p) { return 'x' + p.mult + ' (was x' + p.previousMult + ')'; },
  'life:lost': function (p) { return 'lives ' + (p.lives !== undefined ? p.lives : ''); },
  'threat:hit': function (p) { return (p.kind || '') + ' "' + (p.word || '') + '"'; }
};
const always = ['threat:spawn', 'word:clear', 'type:miss', 'boss:state', 'boss:attack', 'boss:weakopen', 'boss:weakclose',
  'boss:phase', 'boss:hit', 'boss:finisher', 'boss:defeat', 'boss:enter', 'attack:spawn', 'pickup:power', 'power:start',
  'power:end', 'screen:change', 'section:enter', 'checkpoint', 'streak:change', 'streak:milestone', 'life:lost',
  'threat:hit', 'hero:jump', 'hero:duck', 'shield:gain', 'shield:break', 'level:clear', 'ui:stamp', 'game:over'];

console.log('clip ' + clip + ': ' + data.frames + ' frames (' + (data.frames / 30).toFixed(1) + ' s)' +
  (data.from !== null ? ', from state time ' + data.from : '') + (data.result ? ', result ' + JSON.stringify(data.result) : ''));

if (args.indexOf('--words') !== -1) {
  // Times are real seconds. `allowed` is the game's count of the seconds until the creature lands on
  // the frame it appears, and `spare` the same count on the last frame before its word is cleared:
  // each correct letter holds a creature back for a moment, so spare is more than allowed less took.
  const etaAt = function (frame, id) {
    for (let f = Math.min(data.state.length - 1, Math.floor(frame)); f >= Math.max(0, Math.floor(frame) - 3); f--) {
      const ent = data.state[f].ents.find(function (x) { return x[0] === id; });
      if (ent && ent[8] !== null) return ent[8];
    }
    return null;
  };
  const spawns = new Map();
  const rows = [];
  for (const e of events) {
    const p = e.payload || {};
    if (e.name === 'threat:spawn') {
      const en = p.entity || {};
      spawns.set(en.id, { id: en.id, f: e.f, kind: en.kind, word: en.word, from: en.from, allowed: en.eta, miss: 0 });
    } else if (e.name === 'type:miss' && spawns.has(p.id)) {
      spawns.get(p.id).miss++;
    } else if ((e.name === 'word:clear' || e.name === 'threat:hit') && spawns.has(p.id)) {
      const s = spawns.get(p.id);
      if (s.end === undefined) { s.end = e.f; s.landed = e.name === 'threat:hit'; rows.push(s); }
    }
  }
  rows.sort(function (a, b) { return a.f - b.f; });
  console.log('  frame  creature  word            letters  from    allowed  took   spare  others  wrong keys');
  for (const r of rows) {
    if (r.f < from || r.f > to) continue;
    const others = rows.filter(function (o) { return o !== r && o.f < r.end && o.end > r.f; }).length;
    const took = (r.end - r.f) / 30;
    const spare = r.landed ? 0 : etaAt(r.end, r.id);
    console.log(String(r.f).padStart(7) + '  ' + r.kind.padEnd(8) + '  ' + String(r.word).padEnd(14) + '  ' +
      String(r.word.length).padStart(7) + '  ' + String(r.from).padEnd(6) + '  ' +
      (typeof r.allowed === 'number' ? r.allowed.toFixed(2) : '?').padStart(7) + '  ' +
      took.toFixed(2).padStart(5) + '  ' + (spare === null ? '?' : spare.toFixed(2)).padStart(5) + '  ' + String(others).padStart(6) + '  ' +
      String(r.miss).padStart(10) + (r.landed ? '  LANDED ON PIP' : ''));
  }
  process.exit(0);
}

for (const e of events) {
  if (e.f < from || e.f > to) continue;
  if (always.indexOf(e.name) === -1 && !(keys && e.name === 'type:hit')) continue;
  const d = describe[e.name] ? describe[e.name](e.payload || {}) : '';
  console.log(String(e.f).padStart(7) + '  ' + (e.f / 30).toFixed(2).padStart(7) + ' s  ' + e.name + (d ? '  ' + d : ''));
}
