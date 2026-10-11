// test/test-audio.js
// Tests for js/audio.js (WP-B). Run from the project root: node test/test-audio.js
//
// Covers the acceptance checks of CONTRACT section 12 (WP-B), plus checks that make the music and
// the sound effects verifiable without listening:
//   - music data: every channel of a track has the same length; every note is in the track's stated
//     key unless marked as an accidental; loops start on the downbeat and wrap exactly on the bar;
//     the level tune stays in a singable range; the drum patterns and the game over chord follow
//     DESIGN 15.3;
//   - levels: the music cannot clip on its own, and the whole mix (music, a jingle and three sound
//     effect voices at their loudest) stays below 0 dBFS after the master limiter; key_ok starts
//     louder than any single music channel and than the level and boss mix; key_bad is quieter than
//     key_ok; word_clear is a reward;
//   - clicks: every envelope starts and ends at 0 without jumps; cutting music fades the channel
//     gains from their known level instead of cancelling envelopes; only the jingle duck is ever
//     re-scheduled, from its known value;
//   - timing: notes are scheduled ahead on the audio clock, stay on the beat grid with irregular
//     frames, are neither dropped nor started late at 6 fps, and pausing loses no music.
'use strict';

const assert = require('assert');
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

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const FILES = ['js/core.js', 'js/audio.js'];

const SFX_NAMES = [
  'key_ok', 'key_bad', 'lock_on', 'lock_release', 'word_clear', 'clear_pop', 'clear_twang', 'clear_bonk',
  'clear_crunch', 'deflect', 'crate_break', 'streak', 'jump', 'land', 'slide', 'cue_jump', 'cue_duck',
  'ink_drop', 'power_get', 'shield_up', 'shield_break', 'slow_on', 'slow_off', 'watch_tick', 'watch_off',
  'ink_blast', 'one_up', 'hurt', 'fall', 'rescue', 'checkpoint', 'warn', 'urgent_tick', 'boss_rumble', 'boss_laugh',
  'boss_telegraph', 'boss_throw', 'boss_stomp', 'boss_weak', 'boss_hit', 'boss_stun', 'boss_defeat', 'toot', 'click',
  'ui_move', 'ui_select', 'ui_back', 'pause', 'tally_tick', 'stamp', 'count_tick', 'start'
];
// The boss sounds that Lady Ratchet has a variant of (LEVEL2 11.3), played with these options. The checks
// that go through every sound effect go through these six as well.
const RATCHET = { variant: 'ratchet' };
const VARIANT_SOUNDS = ['boss_laugh', 'boss_telegraph', 'boss_throw', 'boss_stomp', 'boss_hit', 'boss_defeat'];
// Every sound a check goes through: [name, options to add, label]. The 52 names and the six variants.
const EVERY_SOUND = SFX_NAMES.map(function (name) { return [name, {}, name]; })
  .concat(VARIANT_SOUNDS.map(function (name) { return [name, RATCHET, name + ' (ratchet)']; }));
const TRACK_NAMES = ['title', 'level1', 'boss1', 'victory', 'results', 'gameover', 'jingle_ready', 'jingle_checkpoint',
  'level2', 'boss2', 'jingle_ready2'];
const LOOPS = ['title', 'level1', 'boss1', 'results', 'level2', 'boss2'];
const ONCE = ['victory', 'gameover', 'jingle_ready', 'jingle_checkpoint', 'jingle_ready2'];

// A fresh environment with core.js and audio.js, Audio initialised.
function fresh(opts) {
  const env = stubs.load(Object.assign({ files: FILES }, opts || {}));
  env.TG.Events.clear();
  env.TG.Audio.init();
  return env;
}

function unlocked(opts) {
  const env = fresh(opts);
  env.TG.Audio.unlock();
  return env;
}

// Runs n frames of 1/60 s: advance the audio clock, then update.
function run(env, n, dt) {
  const step = dt || 1 / 60;
  for (let i = 0; i < n; i++) {
    env.audio.advance(step);
    env.TG.Audio.update(step);
  }
}

// Nodes created by the first context after index `from`.
function createdSince(env, from) {
  const ctx = env.audio.contexts[0];
  return ctx ? Array.prototype.slice.call(ctx.created, from) : [];
}

function nodeCount(env) {
  const ctx = env.audio.contexts[0];
  return ctx ? ctx.created.length : 0;
}

function emit(env, name, payload) {
  env.TG.Events.emit(name, payload);
}

// =================================================================================================
// Loading
// =================================================================================================

check('audio.js loads with only core.js present, without canvas, audio or storage calls', function () {
  const env = stubs.load({ files: FILES });
  if (env.missing.length !== 0) return 'missing: ' + env.missing.join(', ');
  if (env.canvasCalls.count !== 0) return 'canvas calls: ' + env.canvasCalls.count;
  if (env.audio.contexts.length !== 0) return 'audio contexts created at load time';
  if (env.audio.nodes !== 0) return 'audio nodes created at load time';
  if (env.storage.size !== 0) return 'storage written at load time';
  if (env.warnings.length || env.errors.length) return 'console output at load: ' + env.warnings.concat(env.errors).join('; ');
  return typeof env.TG.Audio === 'object';
});

check('TG.Audio.SFX contains exactly the names of CONTRACT 7.1', function () {
  const env = stubs.load({ files: FILES });
  const names = Array.prototype.slice.call(env.TG.Audio.SFX);
  const missing = SFX_NAMES.filter(function (n) { return names.indexOf(n) === -1; });
  const extra = names.filter(function (n) { return SFX_NAMES.indexOf(n) === -1; });
  if (missing.length) return 'missing ' + missing.join(', ');
  if (extra.length) return 'extra ' + extra.join(', ');
  return names.length === SFX_NAMES.length && new Set(names).size === names.length;
});

check('TG.Audio.TRACKS contains exactly the names of CONTRACT 7.2', function () {
  const env = stubs.load({ files: FILES });
  const names = Array.prototype.slice.call(env.TG.Audio.TRACKS);
  return same(names.slice().sort(), TRACK_NAMES.slice().sort()) && new Set(names).size === names.length;
});

// The rows of the first table under a heading of docs/CONTRACT.md whose first column is Name, as lists of
// cells; null when the heading is not there.
function contractTable(text, heading) {
  const lines = text.split('\n');
  const cells = function (line) { return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); }); };
  let i = lines.findIndex(function (l) { return l.indexOf(heading) === 0; });
  if (i === -1) return null;
  while (i < lines.length && !(lines[i].trim().indexOf('|') === 0 && cells(lines[i])[0] === 'Name')) i++;
  const rows = [];
  for (i += 2; i < lines.length && lines[i].trim().indexOf('|') === 0; i++) rows.push(cells(lines[i]));
  return rows;
}

// The table of CONTRACT 7.1 itself, read from the document: its names are TG.Audio.SFX, each once, in the
// order of SFX_NAMES above, and every row says what plays the sound.
(function () {
  const title = 'doc: the table of CONTRACT 7.1 has the sound effects of TG.Audio.SFX, each once and in the code\'s order, and no row is empty';
  let text;
  try { text = require('fs').readFileSync(require('path').join(stubs.ROOT, 'docs', 'CONTRACT.md'), 'utf8'); } catch (e) { text = null; }
  if (text === null) { console.log('skip - ' + title + ' (docs/CONTRACT.md is not present)'); return; }
  check(title, function () {
    const rows = contractTable(text, '### 7.1 Sound effects');
    if (rows === null) return 'heading 7.1 not found';
    const docNames = rows.map(function (r) { return r[0].replace(/`/g, ''); });
    const env = stubs.load({ files: FILES });
    const code = Array.prototype.slice.call(env.TG.Audio.SFX);
    const missing = code.filter(function (n) { return docNames.indexOf(n) === -1; });
    const extra = docNames.filter(function (n) { return code.indexOf(n) === -1; });
    if (missing.length || extra.length) return 'the document lacks ' + (missing.join(' ') || 'nothing') + ' and has ' + (extra.join(' ') || 'nothing') + ' that the code has not';
    if (!same(docNames, code) || !same(code, SFX_NAMES)) return 'the order of the document is ' + docNames.join(' ');
    const empty = rows.filter(function (r) { return r.length !== 2 || !r[1]; });
    return empty.length ? 'no "Plays on" for ' + empty.map(function (r) { return r[0]; }).join(', ') : true;
  });
})();

// The table of CONTRACT 7.2 itself, read from the document: its names are TG.Audio.TRACKS, in the order of
// TRACK_NAMES above, and its Kind column agrees with the lists LOOPS and ONCE that the checks below use.
(function () {
  const title = 'doc: the table of CONTRACT 7.2 has the tracks of TG.Audio.TRACKS, and its Kind column is Loop for the loops, Jingle for the jingle_ names and Once for the rest';
  let text;
  try { text = require('fs').readFileSync(require('path').join(stubs.ROOT, 'docs', 'CONTRACT.md'), 'utf8'); } catch (e) { text = null; }
  if (text === null) { console.log('skip - ' + title + ' (docs/CONTRACT.md is not present)'); return; }
  check(title, function () {
    const rows = contractTable(text, '### 7.2 Music tracks and jingles');
    if (rows === null) return 'heading 7.2 not found';
    const docNames = rows.map(function (r) { return r[0].replace(/`/g, ''); });
    const env = stubs.load({ files: FILES });
    const code = Array.prototype.slice.call(env.TG.Audio.TRACKS);
    if (!same(docNames.slice().sort(), code.slice().sort())) return 'the document has ' + docNames.join(' ') + '; the code has ' + code.join(' ');
    if (!same(docNames, TRACK_NAMES)) return 'the order of the document is ' + docNames.join(' ');
    const bad = rows.filter(function (r, k) {
      const name = docNames[k];
      const want = LOOPS.indexOf(name) !== -1 ? 'Loop' : name.indexOf('jingle_') === 0 ? 'Jingle' : 'Once';
      return r[1] !== want || (want !== 'Loop' && ONCE.indexOf(name) === -1);
    });
    if (bad.length) return 'Kind differs for ' + bad.map(function (r) { return r[0] + ' (' + r[1] + ')'; }).join(', ');
  });
})();

check('every SFX name has a recipe and every recipe has a name in SFX', function () {
  const env = stubs.load({ files: FILES });
  const recipes = Array.prototype.slice.call(env.TG.Audio._internals.recipes());
  return same(recipes.slice().sort(), SFX_NAMES.slice().sort());
});

// =================================================================================================
// Before unlock
// =================================================================================================

check('before unlock, init and every function return without throwing and no AudioContext exists', function () {
  const env = fresh();
  const A = env.TG.Audio;
  A.sfx('key_ok', { step: 3 });
  A.sfx('warn', { pan: -0.7 });
  A.music('title');
  A.music('level1', { transpose: 2, tempo: 158 });
  A.music(null);
  A.jingle('jingle_ready');
  A.setTempoScale(0.75);
  A.setTempoScale(1);
  A.setBassOnly(true);
  A.setBassOnly(false);
  A.setEnabled('music', true);
  A.setEnabled('sfx', true);
  A.suspend();
  A.resume();
  A.update(1 / 60);
  emit(env, 'type:hit', { target: {}, id: 1, kind: 'hoppet', ch: 'a', index: 1, length: 4, complete: false, x: 0, y: 0 });
  if (env.audio.contexts.length !== 0) return 'a context was created before unlock';
  if (env.audio.nodes !== 0) return 'nodes were created before unlock';
  if (A.isUnlocked()) return 'isUnlocked is true before unlock';
  if (env.errors.length) return 'errors: ' + env.errors.join('; ');
  return true;
});

check('init subscribes to the events of section 7 and can be called twice without doubling listeners', function () {
  const env = fresh();
  const before = env.TG.Events.count('type:hit');
  env.TG.Audio.init();
  return before === 1 && env.TG.Events.count('type:hit') === 1 && env.TG.Events.count('screen:change') === 1 &&
    env.TG.Events.count('word:clear') === 1 && env.TG.Events.count('ui:letter') === 1;
});

check('init reads the music and sfx settings from TG.Save', function () {
  const env = fresh();
  env.TG.Save.setSetting('sfx', false);
  env.TG.Save.setSetting('music', false);
  env.TG.Audio.init();
  env.TG.Audio.unlock();
  const n0 = env.audio.nodes;
  env.TG.Audio.sfx('jump');
  const noSfx = env.audio.nodes === n0;
  env.TG.Audio.music('title');
  const s0 = env.audio.starts;
  run(env, 120);
  return noSfx && env.audio.starts === s0 && env.TG.Audio._internals.sequencer('loop').step > 0;
});

// =================================================================================================
// Unlock and sound effects
// =================================================================================================

check('unlock creates one AudioContext, returns true, and a second unlock creates no more', function () {
  const env = fresh();
  const first = env.TG.Audio.unlock();
  const second = env.TG.Audio.unlock();
  return first === true && second === true && env.audio.contexts.length === 1 && env.TG.Audio.isUnlocked();
});

check('unlock resumes a suspended context', function () {
  const env = unlocked();
  env.audio.contexts[0].state = 'suspended';
  env.TG.Audio.unlock();
  return env.audio.resumes >= 1 && env.audio.contexts[0].state === 'running';
});

check('the audio graph ends in a DynamicsCompressor on the destination', function () {
  const env = unlocked();
  const ctx = env.audio.contexts[0];
  const comp = ctx.created.filter(function (n) { return n.kind === 'dynamicsCompressor'; });
  return comp.length === 1 && comp[0].connections.indexOf(ctx.destination) !== -1;
});

check('the three pulse waves are PeriodicWaves from 32 harmonics with the duty cycles 12.5%, 25% and 50%', function () {
  const env = unlocked();
  env.TG.Audio.sfx('lock_on');     // p12
  env.TG.Audio.sfx('key_ok');      // p25
  env.TG.Audio.sfx('jump');        // p50
  const oscs = env.audio.contexts[0].created.filter(function (n) { return n.kind === 'oscillator' && n.periodicWave; });
  if (oscs.length < 3) return 'expected three oscillators with periodic waves, got ' + oscs.length;
  const waves = oscs.map(function (o) { return o.periodicWave; });
  const duties = [0.125, 0.25, 0.5];
  for (let i = 0; i < 3; i++) {
    const real = waves[i].real;
    if (real.length !== 33) return 'wave has ' + real.length + ' coefficients';
    for (let k = 1; k <= 32; k++) {
      const expected = 2 * Math.sin(Math.PI * k * duties[i]) / (Math.PI * k);
      if (Math.abs(real[k] - expected) > 1e-6) return 'coefficient ' + k + ' of duty ' + duties[i] + ' is ' + real[k];
    }
  }
  return true;
});

check('the noise buffers are a 32767-step long LFSR and a 93-step short LFSR', function () {
  const env = unlocked();
  const ctx = env.audio.contexts[0];
  const seen = [];
  env.TG.Audio.sfx('word_clear');   // uses the short noise
  env.TG.Audio.sfx('hurt');         // uses the long noise
  ctx.created.forEach(function (n) { if (n.kind === 'bufferSource' && n.buffer) seen.push(n.buffer.length); });
  return seen.indexOf(32767) !== -1 && seen.indexOf(93) !== -1;
});

// Rules that keep an envelope free of clicks, checked on the recorded AudioParam events.
function envelopeProblems(nodes) {
  const problems = [];
  nodes.forEach(function (node, idx) {
    if (node.kind !== 'gain' || !node.gain || !node.gain.events.length) return;
    const ev = node.gain.events;
    let prev = null;
    let afterCancel = false;
    let lastTime = -Infinity;
    const isCancel = function (e) { return e.type === 'cancelScheduledValues' || e.type === 'cancelAndHoldAtTime'; };
    if (isCancel(ev[0])) afterCancel = true;
    else if (!(ev[0].type === 'setValueAtTime' && ev[0].value === 0)) {
      problems.push('gain ' + idx + ' starts with ' + ev[0].type + '(' + ev[0].value + ') instead of setValueAtTime(0)');
    }
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (isCancel(e)) { afterCancel = true; continue; }
      if (typeof e.time === 'number') {
        if (e.time < lastTime - 1e-9) problems.push('gain ' + idx + ': event ' + i + ' goes back in time');
        lastTime = Math.max(lastTime, e.time);
      }
      if (e.type === 'setValueAtTime') {
        if (prev !== null && !afterCancel && Math.abs(e.value - prev) > 1e-9) {
          problems.push('gain ' + idx + ': setValueAtTime jumps from ' + prev + ' to ' + e.value + ' at ' + e.time);
        }
      } else if (e.type === 'exponentialRampToValueAtTime') {
        if (!(e.value > 0)) problems.push('gain ' + idx + ': exponential ramp to ' + e.value);
      } else if (e.type !== 'linearRampToValueAtTime') {
        problems.push('gain ' + idx + ': unexpected ' + e.type);
      }
      afterCancel = false;
      prev = e.value;
    }
    if (prev !== 0) problems.push('gain ' + idx + ' ends at ' + prev + ', not 0');
  });
  nodes.forEach(function (node, idx) {
    const params = [];
    if (node.kind === 'oscillator') params.push(['frequency', node.frequency]);
    if (node.kind === 'bufferSource') params.push(['playbackRate', node.playbackRate]);
    params.forEach(function (pair) {
      pair[1].events.forEach(function (e) {
        if (e.type === 'cancelScheduledValues') return;
        if (!(e.value > 0)) problems.push(node.kind + ' ' + idx + ': ' + pair[0] + ' ' + e.type + ' to ' + e.value);
      });
    });
  });
  return problems;
}

check('after unlock, sfx(name) for every name creates nodes, starts sources and does not throw', function () {
  const env = unlocked();
  const bad = [];
  SFX_NAMES.forEach(function (name) {
    const n0 = env.audio.nodes;
    const s0 = env.audio.starts;
    try {
      env.TG.Audio.sfx(name, { step: 2, pan: 0, duration: 1 });
    } catch (e) {
      bad.push(name + ' threw ' + e.message);
      return;
    }
    if (env.audio.nodes <= n0) bad.push(name + ' created no nodes');
    if (env.audio.starts <= s0) bad.push(name + ' started nothing');
    env.audio.advance(2);
  });
  if (env.warnings.length) bad.push('warnings: ' + env.warnings.join('; '));
  return bad.length ? bad.join('; ') : true;
});

check('every sound effect envelope starts at zero, never jumps and ends at zero; exponential ramps never target zero', function () {
  const bad = [];
  EVERY_SOUND.forEach(function (sound) {
    const env = unlocked();
    const from = nodeCount(env);
    env.TG.Audio.sfx(sound[0], Object.assign({ step: 4, duration: 0.7 }, sound[1]));
    const problems = envelopeProblems(createdSince(env, from));
    if (problems.length) bad.push(sound[2] + ': ' + problems[0]);
  });
  return bad.length ? bad.join('; ') : true;
});

check('every sound effect uses only the six voices of DESIGN 15.1 (P12, P25, P50, TRI, NZ-L, NZ-S)', function () {
  const env = unlocked();
  const bad = [];
  EVERY_SOUND.forEach(function (sound) {
    const name = sound[2];
    const from = nodeCount(env);
    env.TG.Audio.sfx(sound[0], Object.assign({ step: 1 }, sound[1]));
    createdSince(env, from).forEach(function (n) {
      if (n.kind === 'oscillator') {
        const lfo = n.frequency.value <= 20 && !n.periodicWave;   // vibrato LFOs are not voices
        if (!lfo && !n.periodicWave && n.type !== 'triangle') bad.push(name + ' uses oscillator type ' + n.type);
      } else if (n.kind === 'bufferSource') {
        if (!n.buffer || (n.buffer.length !== 32767 && n.buffer.length !== 93)) bad.push(name + ' uses a buffer of ' + (n.buffer && n.buffer.length));
      } else if (['gain', 'stereoPanner'].indexOf(n.kind) === -1) {
        bad.push(name + ' creates a ' + n.kind);
      }
    });
    env.audio.advance(3);
  });
  return bad.length ? bad.join('; ') : true;
});

function voiceLevel(env, name, opts) {
  const from = nodeCount(env);
  env.TG.Audio.sfx(name, opts);
  const gains = createdSince(env, from).filter(function (n) { return n.kind === 'gain' && n.gain.events.length === 0; });
  env.audio.advance(3);
  return gains.length ? gains[0].gain.value : null;
}

check('key sounds play at 0.12, other sound effects at 0.30, and key_bad at half of key_ok', function () {
  const env = unlocked();
  const keyOk = voiceLevel(env, 'key_ok', { step: 1 });
  const keyBad = voiceLevel(env, 'key_bad');
  const lock = voiceLevel(env, 'lock_on');
  const jump = voiceLevel(env, 'jump');
  const clear = voiceLevel(env, 'word_clear');
  if (Math.abs(keyOk - 0.12) > 1e-9) return 'key_ok level ' + keyOk;
  if (Math.abs(keyBad - 0.06) > 1e-9) return 'key_bad level ' + keyBad;
  if (Math.abs(lock - 0.12) > 1e-9) return 'lock_on level ' + lock;
  if (Math.abs(jump - 0.30) > 1e-9) return 'jump level ' + jump;
  return Math.abs(clear - 0.30) < 1e-9;
});

function keyOkFreq(env, step) {
  const from = nodeCount(env);
  env.TG.Audio.sfx('key_ok', { step: step });
  const osc = createdSince(env, from).filter(function (n) { return n.kind === 'oscillator'; })[0];
  env.audio.advance(1);
  return osc.frequency.events[0].value;
}

check('key_ok is a 45 ms P25 note that starts on C5 and rises one C major pentatonic step per letter', function () {
  const env = unlocked();
  const pent = [0, 2, 4, 7, 9];
  const freqs = [];
  for (let s = 0; s <= 9; s++) freqs.push(keyOkFreq(env, s));
  for (let s = 0; s <= 9; s++) {
    const semis = pent[s % 5] + 12 * Math.floor(s / 5);
    const expected = 523.2511306011972 * Math.pow(2, semis / 12);
    if (Math.abs(freqs[s] - expected) > 0.01) return 'step ' + s + ' is ' + freqs[s] + ', expected ' + expected;
    if (s > 0 && !(freqs[s] > freqs[s - 1])) return 'step ' + s + ' does not rise';
  }
  const from = nodeCount(env);
  env.TG.Audio.sfx('key_ok', { step: 0 });
  const nodes = createdSince(env, from);
  const osc = nodes.filter(function (n) { return n.kind === 'oscillator'; })[0];
  const g = nodes.filter(function (n) { return n.kind === 'gain' && n.gain.events.length; })[0];
  const last = g.gain.events[g.gain.events.length - 1];
  const dur = last.time - g.gain.events[0].time;
  if (Math.abs(dur - 0.045) > 1e-6) return 'duration ' + dur;
  if (!osc.periodicWave || Math.abs(osc.periodicWave.real[1] - 2 * Math.sin(Math.PI * 0.25) / Math.PI) > 1e-6) return 'not P25';
  return last.type === 'linearRampToValueAtTime' && last.value === 0;
});

function setKeyOk(env, root, mode) {
  emit(env, 'section:enter', { index: 0, name: 'S', stage: '1-1', palette: 'day', music: { transpose: 0, tempo: 150, keyOk: { root: root, mode: mode } } });
}

check('key_ok never goes above C7 in any key of the level data, and a 10-letter threat word rises on every letter in C and D major', function () {
  const env = unlocked();
  const C7 = 523.2511306011972 * 4;
  const bad = [];
  [[0, 'major'], [2, 'major'], [4, 'minor']].forEach(function (k) {
    setKeyOk(env, k[0], k[1]);
    const freqs = [];
    for (let s = 0; s <= 20; s++) freqs.push(keyOkFreq(env, s));
    freqs.forEach(function (fq, s) {
      if (fq > C7 * (1 + 1e-9)) bad.push(k.join(' ') + ' step ' + s + ' is ' + fq.toFixed(1) + ' Hz');
      if (s > 0 && fq < freqs[s - 1] - 1e-9) bad.push(k.join(' ') + ' step ' + s + ' falls');
    });
    const top = freqs.indexOf(Math.max.apply(null, freqs));
    for (let s = 1; s <= top; s++) if (!(freqs[s] > freqs[s - 1])) bad.push(k.join(' ') + ' step ' + s + ' does not rise before the top');
    // Letters 2 to 10 of a 10-letter word are steps 1 to 9.
    if (k[1] === 'major' && top < 9) bad.push(k.join(' ') + ' reaches its top at step ' + top);
  });
  setKeyOk(env, 30, 'major');   // a root outside the expected range is clamped, not followed
  if (keyOkFreq(env, 0) > C7) bad.push('root 30 gives ' + keyOkFreq(env, 0));
  return bad.length ? bad.slice(0, 4).join('; ') : true;
});

// RMS of a PeriodicWave built from `real` cosine coefficients, normalised to a peak of 1 as browsers do.
function periodicRms(real) {
  const n = 4096;
  const v = new Float64Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 1; k < real.length; k++) s += real[k] * Math.cos(2 * Math.PI * k * i / n);
    v[i] = s;
    peak = Math.max(peak, Math.abs(s));
  }
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (v[i] / peak) * (v[i] / peak);
  return Math.sqrt(sum / n);
}

// The waves the graph uses, read from the oscillators a few sound effects create.
function waveTable(env) {
  const out = {};
  const pairs = [['p12', 'lock_on'], ['p25', 'key_ok'], ['p50', 'jump']];
  pairs.forEach(function (pair) {
    const from = nodeCount(env);
    env.TG.Audio.sfx(pair[1], { step: 1 });
    const osc = createdSince(env, from).filter(function (n) { return n.kind === 'oscillator' && n.periodicWave; })[0];
    out[pair[0]] = { real: osc.periodicWave.real, rms: periodicRms(osc.periodicWave.real) };
    env.audio.advance(1);
  });
  out.tri = { rms: 1 / Math.sqrt(3) };
  return out;
}

// Every audible source of one sound effect with its envelope peak and time span. A source is audible
// when it feeds an envelope gain that feeds the voice gain (vibrato LFOs feed a detune param instead).
function sfxSources(env, name, opts) {
  const from = nodeCount(env);
  env.TG.Audio.sfx(name, opts || {});
  const nodes = createdSince(env, from);
  const level = env.TG.Audio._internals.levelOf(name);
  const voice = voiceGainOf(nodes, level);
  const out = [];
  nodes.forEach(function (n) {
    if (n.kind !== 'oscillator' && n.kind !== 'bufferSource') return;
    const env1 = n.connections[0];
    if (!env1 || env1.kind !== 'gain' || env1.connections.indexOf(voice) === -1) return;
    const peak = Math.max.apply(null, env1.gain.events.map(function (e) { return typeof e.value === 'number' ? e.value : 0; }));
    out.push({ node: n, peak: peak, start: n.startTime, stop: n.stopTime });
  });
  env.audio.advance(4);
  return { level: level, voice: voice, sources: out };
}

check('music sits below the typing sounds: key_ok starts louder (RMS) than any single music channel of any track at its loudest note', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  const W = waveTable(env);
  const bus = I.graph().musicBus;
  if (Math.abs(bus.gain.value - I.MUSIC_LEVEL) > 1e-9) return 'music bus gain ' + bus.gain.value;
  if (!(I.MUSIC_LEVEL > 0 && I.MUSIC_LEVEL <= 1)) return 'MUSIC_LEVEL ' + I.MUSIC_LEVEL;
  const keyRms = 0.12 * W.p25.rms;
  const bad = [];
  TRACK_NAMES.forEach(function (name) {
    const t = I.parse(name);
    ['p1', 'p2', 'tri', 'noise'].forEach(function (ch) {
      const c = t.channels[ch];
      if (!c.events.length) return;
      const maxVel = Math.max.apply(null, c.events.map(function (e) { return e.vel * (ch === 'noise' ? I.DRUM_LEVEL[e.drum] : 1); }));
      const waveRms = ch === 'noise' ? I.NOISE_AMP : W[c.wave].rms;
      const rms = I.GAINS[ch] * I.MUSIC_LEVEL * c.vel * maxVel * waveRms;
      if (!(rms < keyRms)) bad.push(name + '.' + ch + ' RMS ' + rms.toFixed(4) + ' >= key_ok ' + keyRms.toFixed(4));
    });
  });
  return bad.length ? bad.join('; ') : true;
});

check('music sits below the typing sounds in the mix too: key_ok starts louder (RMS) than the level and boss tracks with all four channels at their loudest note', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  const W = waveTable(env);
  const keyRms = 0.12 * W.p25.rms;
  const bad = [];
  ['level1', 'boss1'].forEach(function (name) {
    const t = I.parse(name);
    let sq = 0;
    ['p1', 'p2', 'tri', 'noise'].forEach(function (ch) {
      const c = t.channels[ch];
      if (!c.events.length) return;
      const maxVel = Math.max.apply(null, c.events.map(function (e) { return e.vel * (ch === 'noise' ? I.DRUM_LEVEL[e.drum] : 1); }));
      const waveRms = ch === 'noise' ? I.NOISE_AMP : W[c.wave].rms;
      sq += Math.pow(I.GAINS[ch] * I.MUSIC_LEVEL * c.vel * maxVel * waveRms, 2);   // the channels add as uncorrelated signals
    });
    const mix = Math.sqrt(sq);
    if (!(keyRms > mix)) bad.push(name + ' mix RMS ' + mix.toFixed(4) + ' >= key_ok ' + keyRms.toFixed(4));
  });
  return bad.length ? bad.join('; ') : true;
});

check('key_bad is quieter than key_ok (voice level half, and a lower RMS at its loudest moment) and sounds different (lower, with noise)', function () {
  const env = unlocked();
  const W = waveTable(env);
  const ok = sfxSources(env, 'key_ok', { step: 0 });
  const bad = sfxSources(env, 'key_bad');
  if (Math.abs(bad.level - ok.level / 2) > 1e-9) return 'levels ' + ok.level + ' / ' + bad.level;
  const okRms = ok.level * W.p25.rms * ok.sources[0].peak;
  // Both key_bad layers start together; their RMS adds as uncorrelated signals.
  let sq = 0;
  bad.sources.forEach(function (s) {
    const r = s.node.kind === 'bufferSource' ? env.TG.Audio._internals.NOISE_AMP : W.p50.rms;
    sq += Math.pow(r * s.peak, 2);
  });
  const badRms = bad.level * Math.sqrt(sq);
  if (!(badRms < okRms)) return 'key_bad RMS ' + badRms.toFixed(4) + ' is not below key_ok ' + okRms.toFixed(4);
  const badOsc = bad.sources.filter(function (s) { return s.node.kind === 'oscillator'; })[0];
  const hasNoise = bad.sources.some(function (s) { return s.node.kind === 'bufferSource'; });
  return hasNoise && badOsc.node.frequency.events[0].value <= 110 && ok.sources[0].node.frequency.events[0].value >= 523;
});

check('word_clear sounds like a reward: louder than key sounds, a rising arpeggio over an octave to at least the top key_ok note, with a sparkle', function () {
  const env = unlocked();
  const w = sfxSources(env, 'word_clear');
  if (!(w.level > 0.12)) return 'level ' + w.level;
  const osc = w.sources.filter(function (s) { return s.node.kind === 'oscillator'; })[0];
  const notes = osc.node.frequency.events.filter(function (e) { return e.type === 'setValueAtTime'; }).map(function (e) { return e.value; });
  const rising = notes.slice(0, 4).every(function (fq, i) { return i === 0 || fq > notes[i - 1]; });
  if (!rising) return 'notes ' + notes.join(',');
  if (Math.abs(notes[3] / notes[0] - 2) > 1e-6) return 'does not span an octave';
  if (notes[3] < 523.2511306011972 * 4 - 1e-6) return 'top note ' + notes[3];
  const noise = w.sources.filter(function (s) { return s.node.kind === 'bufferSource' && s.node.buffer.length === 93; });
  const length = osc.stop - osc.start;
  return noise.length === 1 && length >= 0.14;
});

check('sfx with an unknown name warns once and does not throw', function () {
  const env = unlocked();
  env.TG.Audio.sfx('no_such_sound');
  env.TG.Audio.sfx('no_such_sound');
  return env.warnings.length === 1 && env.audio.nodes === nodeCount(env) && /no_such_sound/.test(env.warnings[0]);
});

// The voice gain of a sound effect: the gain created at the sound's level that feeds the sound effect
// bus directly or through a stereo panner. Until it is taken over it has no automation.
function voiceGainOf(nodes, level) {
  return nodes.filter(function (n) {
    const dest = n.connections[0];
    return n.kind === 'gain' && Math.abs(n.gain.value - level) < 1e-9 && n.gain.events.length === 0 &&
      !!dest && (dest.kind === 'stereoPanner' || (dest.kind === 'gain' && dest.gain.value === 1 && dest.connections.length === 1 && dest.connections[0].kind === 'gain'));
  })[0];
}

check('three sound effect voices: a fourth simultaneous sound takes over the oldest with a fade from its level, not a cut', function () {
  const env = unlocked();
  const ctx = env.audio.contexts[0];
  const n0 = nodeCount(env);
  env.TG.Audio.sfx('boss_rumble');
  const rumbleVoice = voiceGainOf(createdSince(env, n0), 0.30);
  const n1 = nodeCount(env);
  env.TG.Audio.sfx('fall');
  const fallVoice = voiceGainOf(createdSince(env, n1), 0.30);
  env.TG.Audio.sfx('slow_on');
  if (!rumbleVoice || !fallVoice) return 'voice gains not found';
  if (rumbleVoice.gain.events.length || fallVoice.gain.events.length) return 'a voice was touched before all three were busy';
  env.audio.advance(0.1);
  env.TG.Audio.sfx('jump');
  const ev = rumbleVoice.gain.events;
  if (ev.length === 0) return 'the oldest voice was not taken over';
  if (fallVoice.gain.events.length) return 'a newer voice was taken over instead of the oldest';
  if (ev.some(function (e) { return /^cancel/.test(e.type); })) return 'the takeover cancelled automation';
  const first = ev[0];
  const last = ev[ev.length - 1];
  // The voice gain holds its level until the takeover, so the fade must start from exactly that level.
  if (!(first.type === 'setValueAtTime' && Math.abs(first.value - 0.30) < 1e-9 && Math.abs(first.time - ctx.currentTime) < 1e-9)) {
    return 'fade does not start from the voice level at the current time: ' + JSON.stringify(first);
  }
  return last.type === 'linearRampToValueAtTime' && last.value === 0 && last.time - first.time >= 0.005;
});

check('warn is pitched by direction and panned left for threats from behind and right for the right', function () {
  const env = unlocked();
  const results = {};
  ['behind', 'above', 'below', 'right'].forEach(function (from) {
    const start = nodeCount(env);
    emit(env, 'threat:warn', { id: 1, kind: 'truffle', from: from });
    const nodes = createdSince(env, start);
    const osc = nodes.filter(function (n) { return n.kind === 'oscillator'; })[0];
    const pan = nodes.filter(function (n) { return n.kind === 'stereoPanner'; })[0];
    results[from] = { f: osc.frequency.events[0].value, pan: pan ? pan.pan.value : 0 };
    env.audio.advance(1);
  });
  return results.behind.f === 1760 && results.behind.pan === -0.7 && results.above.f === 2093 && results.above.pan === 0 &&
    results.below.f === 880 && results.below.pan === 0 && results.right.f === 1319 && results.right.pan === 0.7;
});

check('boss_telegraph lasts for the telegraph time given in the event', function () {
  const env = unlocked();
  const from = nodeCount(env);
  emit(env, 'boss:attack', { kind: 'shock', telegraph: 1.4 });
  const g = createdSince(env, from).filter(function (n) { return n.kind === 'gain' && n.gain.events.length; })[0];
  const ev = g.gain.events;
  const len = ev[ev.length - 1].time - ev[0].time;
  return Math.abs(len - 1.38) < 0.07;
});

// =================================================================================================
// Music data: checkable without listening
// =================================================================================================

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function keySet(key, mode) {
  const m = /^([A-G])([#b]?)$/.exec(key);
  let root = PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return (mode === 'minor' ? MINOR : MAJOR).map(function (i) { return ((root + i) % 12 + 12) % 12; });
}

check('every track parses without problems', function () {
  const env = stubs.load({ files: FILES });
  const bad = [];
  TRACK_NAMES.forEach(function (name) {
    const t = env.TG.Audio._internals.parse(name);
    if (!t) { bad.push(name + ': no data'); return; }
    if (t.problems.length) bad.push(name + ': ' + t.problems.join('; '));
  });
  return bad.length ? bad.join(' | ') : true;
});

check('every channel of every track has the same total length, equal to bars x beats x 4 steps', function () {
  const env = stubs.load({ files: FILES });
  const bad = [];
  TRACK_NAMES.forEach(function (name) {
    const t = env.TG.Audio._internals.parse(name);
    const expected = t.bars * t.beats * 4;
    ['p1', 'p2', 'tri', 'noise'].forEach(function (ch) {
      if (t.channels[ch].steps !== expected) bad.push(name + '.' + ch + ' has ' + t.channels[ch].steps + ' steps, expected ' + expected);
      t.channels[ch].events.forEach(function (e) {
        if (e.step + e.len > expected) bad.push(name + '.' + ch + ' has a note running past the end');
      });
    });
    if (t.totalSteps !== expected) bad.push(name + ' totalSteps ' + t.totalSteps);
  });
  return bad.length ? bad.join('; ') : true;
});

check('loops start and end on the bar: every track length is a whole number of bars and the loop point is step 0', function () {
  const env = stubs.load({ files: FILES });
  const bad = [];
  TRACK_NAMES.forEach(function (name) {
    const t = env.TG.Audio._internals.parse(name);
    if (t.totalSteps % t.stepsPerBar !== 0) bad.push(name + ' is not a whole number of bars');
    if (t.stepsPerBar !== t.beats * 4) bad.push(name + ' stepsPerBar');
  });
  LOOPS.forEach(function (name) {
    const t = env.TG.Audio._internals.parse(name);
    // The loop starts on the downbeat: some channel plays on step 0 of bar 1.
    const onOne = ['p1', 'p2', 'tri', 'noise'].some(function (ch) { return !!t.channels[ch].byStep[0]; });
    if (!onOne) bad.push(name + ' has nothing on the first beat');
  });
  const env2 = unlocked();
  env2.TG.Audio.music('jingle_checkpoint');   // shortest track: 8 steps
  run(env2, 120);
  const s = env2.TG.Audio._internals.sequencer('loop');
  if (s.playing) bad.push('a track without loop kept playing');
  return bad.length ? bad.join('; ') : true;
});

check('every loop wraps on the bar: one loop length after the first beat the same notes start again, exactly on the beat grid', function () {
  const bad = [];
  LOOPS.forEach(function (name) {
    const env = unlocked();
    const I = env.TG.Audio._internals;
    const from = nodeCount(env);
    env.TG.Audio.music(name);
    const len = I.trackLength(name);
    run(env, Math.ceil((len + 1) * 60));
    const sources = createdSince(env, from).filter(function (n) { return n.kind === 'oscillator' || n.kind === 'bufferSource'; })
      .filter(function (n) { return !(n.kind === 'oscillator' && !n.periodicWave && n.type === 'sine'); });
    const t0 = Math.min.apply(null, sources.map(function (n) { return n.startTime; }));
    const sig = function (n) { return n.kind + ':' + (n.kind === 'oscillator' ? n.frequency.events[0].value.toFixed(3) : n.playbackRate.events[0].value.toFixed(3)); };
    const at = function (t) { return sources.filter(function (n) { return Math.abs(n.startTime - t) < 1e-6; }).map(sig).sort().join(','); };
    const first = at(t0);
    const wrap = at(t0 + len);
    if (!first) bad.push(name + ': nothing at the start');
    else if (first !== wrap) bad.push(name + ': at the wrap point [' + wrap + '] instead of [' + first + ']');
    // Nothing starts between the last step of the loop and the wrap point.
    const stepDur = len / I.parse(name).totalSteps;
    const inGap = sources.filter(function (n) { return n.startTime > t0 + len - stepDur + 1e-6 && n.startTime < t0 + len - 1e-6; });
    if (inGap.length) bad.push(name + ': ' + inGap.length + ' notes off the grid before the wrap');
  });
  return bad.length ? bad.join('; ') : true;
});

check('every note of every track is in the stated key unless marked as an accidental (independent key tables)', function () {
  const env = stubs.load({ files: FILES });
  const bad = [];
  TRACK_NAMES.forEach(function (name) {
    const t = env.TG.Audio._internals.parse(name);
    const set = keySet(t.key, t.mode);
    ['p1', 'p2', 'tri'].forEach(function (ch) {
      t.channels[ch].events.forEach(function (e) {
        const pc = ((e.midi % 12) + 12) % 12;
        if (!e.accidental && set.indexOf(pc) === -1) bad.push(name + '.' + ch + ' step ' + e.step + ' midi ' + e.midi);
        if (e.accidental && set.indexOf(pc) !== -1) bad.push(name + '.' + ch + ' step ' + e.step + ' is marked accidental but is in the key');
      });
    });
  });
  return bad.length ? bad.slice(0, 5).join('; ') : true;
});

check('the tracks have the tempo, key and length of DESIGN 15.3', function () {
  const env = stubs.load({ files: FILES });
  const P = env.TG.Audio._internals.parse;
  const t = P('title'), l = P('level1'), b = P('boss1'), v = P('victory'), r = P('results'), g = P('gameover');
  const bad = [];
  if (!(t.bpm === 132 && t.key === 'C' && t.mode === 'major' && t.bars === 16 && t.loop)) bad.push('title');
  if (!(l.bpm === 150 && l.key === 'G' && l.mode === 'major' && l.bars === 32 && l.loop)) bad.push('level1');
  if (!(b.bpm === 168 && b.key === 'E' && b.mode === 'minor' && b.bars === 16 && b.loop)) bad.push('boss1');
  if (!(v.bpm === 140 && v.key === 'C' && v.bars === 6 && !v.loop)) bad.push('victory');
  if (!(r.bpm === 100 && r.key === 'F' && r.bars === 8 && r.loop)) bad.push('results');
  if (!(g.bpm === 80 && g.key === 'A' && g.mode === 'minor' && g.bars === 4 && !g.loop)) bad.push('gameover');
  const len = env.TG.Audio._internals.trackLength('level1');
  if (Math.abs(len - 51.2) > 0.01) bad.push('level1 length ' + len);
  if (Math.abs(env.TG.Audio._internals.trackLength('jingle_checkpoint') - 0.6) > 1e-9) bad.push('jingle_checkpoint length');
  return bad.length ? bad.join(', ') : true;
});

check('the level theme has an A part and a B part (AABA) with different tunes, and the boss theme uses F natural as an accidental', function () {
  const env = stubs.load({ files: FILES });
  const l = env.TG.Audio._internals.parse('level1');
  const spb = l.stepsPerBar;
  function part(from, bars) {
    return l.channels.p1.events.filter(function (e) { return e.step >= from * spb && e.step < (from + bars) * spb; })
      .map(function (e) { return (e.step - from * spb) + ':' + e.midi + ':' + e.len; }).join(',');
  }
  const a1 = part(0, 7), a2 = part(8, 7), b = part(16, 8), a3 = part(24, 7);
  if (a1 !== a2 || a1 !== a3) return 'the A parts differ';
  if (a1 === b) return 'the B part is the same as the A part';
  if (!l.channels.p1.events.some(function (e) { return e.midi === 79 && e.len >= 6; })) return 'no held G5 at the end of the A part';
  const boss = env.TG.Audio._internals.parse('boss1');
  const fNat = boss.channels.p1.events.filter(function (e) { return e.accidental && (e.midi % 12) === 5; });
  return fNat.length > 0;
});

check('the level tune is singable: within 20 semitones, no leap wider than an octave, every A part ends on a long G', function () {
  const env = stubs.load({ files: FILES });
  const l = env.TG.Audio._internals.parse('level1');
  const lead = l.channels.p1.events;
  const midis = lead.map(function (e) { return e.midi; });
  const range = Math.max.apply(null, midis) - Math.min.apply(null, midis);
  if (range > 20) return 'range ' + range + ' semitones';
  for (let i = 1; i < lead.length; i++) {
    if (Math.abs(lead[i].midi - lead[i - 1].midi) > 12) return 'leap of ' + Math.abs(lead[i].midi - lead[i - 1].midi) + ' at step ' + lead[i].step;
  }
  const loopLeap = Math.abs(lead[0].midi - lead[lead.length - 1].midi);
  if (loopLeap > 12) return 'leap of ' + loopLeap + ' at the loop point';
  const spb = l.stepsPerBar;
  const bad = [8, 16, 32].filter(function (endBar) {
    const inBar = lead.filter(function (e) { return e.step >= (endBar - 1) * spb && e.step < endBar * spb; });
    const last = inBar[inBar.length - 1];
    return !(last && last.midi % 12 === 7 && last.len >= 6);
  });
  return bad.length === 0 || 'A parts ending in bars ' + bad.join(', ') + ' do not end on a long G';
});

check('the boss drums put a kick on every beat and the snare on 2 and 4 (outside the roll bars), the level drums follow DESIGN 15.3', function () {
  const env = stubs.load({ files: FILES });
  const P = env.TG.Audio._internals.parse;
  const boss = P('boss1').channels.noise;
  const spb = P('boss1').stepsPerBar;
  const kick = { k: true, x: true };
  const snare = { s: true, x: true };
  for (let bar = 0; bar < P('boss1').bars; bar++) {
    if (bar % 4 === 3) continue;   // snare roll bars
    for (let beat = 0; beat < 4; beat++) {
      const ev = (boss.byStep[bar * spb + beat * 4] || [])[0];
      if (!ev || !kick[ev.drum]) return 'boss bar ' + (bar + 1) + ' beat ' + (beat + 1) + ' has no kick';
      if ((beat === 1 || beat === 3) !== !!snare[ev.drum]) return 'boss bar ' + (bar + 1) + ' beat ' + (beat + 1) + ' snare wrong';
    }
  }
  const lvl = P('level1').channels.noise;
  const at = function (s) { return (lvl.byStep[s] || [])[0].drum; };
  // Kick on 1, the "and" of 2 and 3; snare on 2 and 4.
  return at(0) === 'k' && at(6) === 'k' && at(8) === 'k' && at(4) === 's' && at(12) === 's';
});

check('the game over tune descends A, G, F, E in the bass and stops on an E7 chord (E, G#, D sounding together)', function () {
  const env = stubs.load({ files: FILES });
  const g = env.TG.Audio._internals.parse('gameover');
  const bass = g.channels.tri.events.map(function (e) { return e.midi % 12; });
  if (JSON.stringify(bass) !== JSON.stringify([9, 7, 5, 4])) return 'bass ' + bass.join(',');
  const lastStep = g.totalSteps - 1;
  const sounding = [];
  ['p1', 'p2', 'tri'].forEach(function (ch) {
    g.channels[ch].events.forEach(function (e) { if (e.step <= lastStep && e.step + e.len > lastStep) sounding.push(e.midi % 12); });
  });
  const set = sounding.slice().sort().join(',');
  return set === [2, 4, 8].sort().join(',') || 'last chord pitch classes ' + set;
});

check('the boss theme is more urgent than the level theme: faster and denser', function () {
  const env = stubs.load({ files: FILES });
  const P = env.TG.Audio._internals.parse;
  const l = P('level1'), b = P('boss1');
  const lDensity = l.channels.p1.events.length / l.bars;
  const bDensity = b.channels.p1.events.length / b.bars;
  return b.bpm > l.bpm && bDensity > lDensity;
});

// Worst-case peak of one track at the master input: every channel at its loudest note at once.
// Pulse waves and the triangle peak at 1 (browsers normalise PeriodicWaves); noise at NOISE_AMP.
function trackPeak(I, name) {
  const t = I.parse(name);
  let sum = 0;
  ['p1', 'p2', 'tri', 'noise'].forEach(function (ch) {
    const c = t.channels[ch];
    if (!c.events.length) return;
    const maxVel = Math.max.apply(null, c.events.map(function (e) { return e.vel * (ch === 'noise' ? I.DRUM_LEVEL[e.drum] : 1); }));
    sum += I.GAINS[ch] * c.vel * maxVel * (ch === 'noise' ? I.NOISE_AMP : 1);
  });
  return sum * I.MUSIC_LEVEL;
}

check('the four music channels use the gains of DESIGN 15.1; with every channel at its loudest note the music cannot clip, also with a jingle over the ducked loop', function () {
  const env = stubs.load({ files: FILES });
  const I = env.TG.Audio._internals;
  const G = I.GAINS;
  if (!(G.p1 === 0.20 && G.p2 === 0.14 && G.tri === 0.28 && G.noise === 0.16)) return 'channel gains ' + JSON.stringify(G);
  if (!(G.sfx === 0.30 && G.key === 0.12)) return 'sfx gains';
  if (G.p1 + G.p2 + G.tri + G.noise > 1) return 'channel gains add up to more than 1';
  const loops = LOOPS.map(function (n) { return trackPeak(I, n); });
  const once = ONCE.map(function (n) { return trackPeak(I, n); });
  const worstLoop = Math.max.apply(null, loops.concat(once));
  const worstJingle = Math.max.apply(null, once) + I.DUCK * Math.max.apply(null, loops);
  if (worstLoop > 1) return 'a track peaks at ' + worstLoop;
  return worstJingle <= 1 || 'jingle over ducked loop peaks at ' + worstJingle;
});

check('the loop is fully ducked before the first note of a jingle', function () {
  const env = unlocked();
  env.TG.Audio.music('level1');
  run(env, 30);
  const I = env.TG.Audio._internals;
  const duck = I.graph().duck;
  const from = nodeCount(env);
  env.TG.Audio.jingle('jingle_ready');
  run(env, 10);
  const first = Math.min.apply(null, createdSince(env, from).filter(function (n) {
    return (n.kind === 'oscillator' || n.kind === 'bufferSource') && n.connections[0] && n.connections[0].connections[0] &&
      n.connections[0].connections[0].connections.indexOf(I.graph().musicBus) !== -1;
  }).map(function (n) { return n.startTime; }));
  const down = duck.gain.events.filter(function (e) { return e.type === 'linearRampToValueAtTime' && e.value === I.DUCK; })[0];
  if (!isFinite(first)) return 'no jingle note found';
  return down.time <= first + 1e-9 || 'duck reaches ' + I.DUCK + ' at ' + down.time + ', first jingle note at ' + first;
});

// Worst-case peak of one sound effect voice: its level times the largest sum of the envelope peaks
// of the sources that sound at the same moment.
function sfxVoicePeak(env, name, opts) {
  const r = sfxSources(env, name, opts);
  const amp = env.TG.Audio._internals.NOISE_AMP;
  let worst = 0;
  r.sources.forEach(function (a) {
    let sum = 0;
    r.sources.forEach(function (b) {
      if (b.start <= a.start + 1e-12 && b.stop > a.start) sum += b.peak * (b.node.kind === 'bufferSource' ? amp : 1);
    });
    worst = Math.max(worst, sum);
  });
  return r.level * worst;
}

check('the whole mix cannot clip: music, a jingle and three sound effect voices at their loudest, through the master limiter, stay below 0 dBFS', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  const comp = env.audio.contexts[0].created.filter(function (n) { return n.kind === 'dynamicsCompressor'; })[0];
  const T = comp.threshold.value, K = comp.knee.value, R = comp.ratio.value;
  if (K !== 0) return 'the check assumes a hard knee, the knee is ' + K;
  if (!(R >= 10 && comp.attack.value <= 0.005)) return 'not set as a limiter: ratio ' + R + ', attack ' + comp.attack.value;
  let worstVoice = 0;
  let worstName = '';
  EVERY_SOUND.forEach(function (sound) {
    const p = sfxVoicePeak(env, sound[0], Object.assign({ step: 9, duration: 1.5 }, sound[1]));
    if (p > worstVoice) { worstVoice = p; worstName = sound[2]; }
  });
  const loops = LOOPS.map(function (n) { return trackPeak(I, n); });
  const once = ONCE.map(function (n) { return trackPeak(I, n); });
  const music = Math.max(Math.max.apply(null, loops.concat(once)), Math.max.apply(null, once) + I.DUCK * Math.max.apply(null, loops));
  const input = music + 3 * worstVoice;
  const inDb = 20 * Math.log10(input);
  // Static curve of a hard-knee compressor with the makeup gain browsers apply: (1 / curve(1.0)) ^ 0.6.
  const curve = function (x) { return x <= T ? x : T + (x - T) / R; };
  const makeup = -0.6 * curve(0);
  const outDb = curve(inDb) + makeup;
  if (!(outDb < 0)) return 'worst case ' + input.toFixed(2) + ' (' + inDb.toFixed(1) + ' dB, loudest voice ' + worstName + ') leaves the limiter at ' + outDb.toFixed(2) + ' dB';
  // Ordinary typing over the music stays below the threshold, so key sounds do not make the music pump.
  const typing = Math.max.apply(null, loops) + sfxVoicePeak(env, 'key_ok', { step: 9 });
  return 20 * Math.log10(typing) < T || 'music and key_ok reach ' + (20 * Math.log10(typing)).toFixed(1) + ' dB, above the threshold ' + T;
});

check('the four channel gain nodes of the loop carry those gains', function () {
  const env = unlocked();
  env.TG.Audio.music('level1');
  run(env, 2);
  const values = env.audio.contexts[0].created.filter(function (n) { return n.kind === 'gain' && n.gain.events.length === 0; })
    .map(function (n) { return n.gain.value; });
  return [0.20, 0.14, 0.28, 0.16].every(function (v) { return values.indexOf(v) !== -1; });
});

// =================================================================================================
// The sequencer
// =================================================================================================

function startsPerSecond(env, seconds) {
  const counts = [];
  for (let s = 0; s < seconds; s++) {
    const before = env.audio.starts;
    run(env, 60);
    counts.push(env.audio.starts - before);
  }
  return counts;
}

check('every looping track keeps starting notes during every one of 10 seconds', function () {
  const bad = [];
  LOOPS.forEach(function (name) {
    const env = unlocked();
    env.TG.Audio.music(name);
    const counts = startsPerSecond(env, 10);
    if (counts.some(function (c) { return c === 0; })) bad.push(name + ': ' + counts.join(','));
    const s = env.TG.Audio._internals.sequencer('loop');
    if (!s.playing || s.name !== name) bad.push(name + ' stopped');
    if (env.warnings.length) bad.push(name + ' warned: ' + env.warnings[0]);
  });
  return bad.length ? bad.join('; ') : true;
});

check('every track that plays once, and every jingle, starts notes in the first second and stops after its length', function () {
  const bad = [];
  ONCE.forEach(function (name) {
    const env = unlocked();
    const len = env.TG.Audio._internals.trackLength(name);
    const isJingle = name.indexOf('jingle') === 0;
    if (isJingle) env.TG.Audio.jingle(name); else env.TG.Audio.music(name);
    const before = env.audio.starts;
    run(env, 60);
    if (env.audio.starts === before) bad.push(name + ' started nothing in the first second');
    // run to the end of the track, then a while longer
    const frames = Math.ceil((len + 0.3) * 60);
    run(env, Math.max(0, frames - 60));
    const atEnd = env.audio.starts;
    run(env, 180);
    if (env.audio.starts !== atEnd) bad.push(name + ' kept starting notes after its length');
    const s = env.TG.Audio._internals.sequencer(isJingle ? 'once' : 'loop');
    if (s.playing) bad.push(name + ' is still marked playing');
  });
  return bad.length ? bad.join('; ') : true;
});

check('notes are scheduled ahead on the audio clock: start times are never in the past and at most 100 ms ahead', function () {
  const env = unlocked();
  env.TG.Audio.music('level1');
  const bad = [];
  let from = nodeCount(env);
  for (let i = 0; i < 300; i++) {
    env.audio.advance(1 / 60);
    const now = env.audio.contexts[0].currentTime;
    env.TG.Audio.update(1 / 60);
    createdSince(env, from).forEach(function (n) {
      if (n.kind !== 'oscillator' && n.kind !== 'bufferSource') return;
      if (n.startTime < now - 1e-9) bad.push('start ' + n.startTime + ' before now ' + now);
      if (n.startTime > now + 0.1 + 1e-9) bad.push('start ' + n.startTime + ' more than 100 ms after ' + now);
    });
    from = nodeCount(env);
  }
  return bad.length ? bad.slice(0, 3).join('; ') : true;
});

check('timing stays on the beat grid when frames are irregular (16 ms, 80 ms and 250 ms frames)', function () {
  const env = unlocked();
  env.TG.Audio.music('level1');
  const stepDur = 60 / 150 / 4;
  const pattern = [1 / 60, 1 / 60, 0.08, 1 / 60, 0.25, 1 / 60, 1 / 60, 0.12];
  const from = nodeCount(env);
  for (let i = 0; i < 200; i++) {
    const dt = pattern[i % pattern.length];
    env.audio.advance(dt);
    env.TG.Audio.update(dt);
  }
  const sources = createdSince(env, from).filter(function (n) { return n.kind === 'oscillator' || n.kind === 'bufferSource'; });
  if (sources.length < 50) return 'only ' + sources.length + ' notes';
  const t0 = env.TG.Audio._internals.sequencer('loop').nextTime;   // on the grid
  const bad = sources.filter(function (n) {
    const k = (n.startTime - t0) / stepDur;
    return Math.abs(k - Math.round(k)) > 1e-6;
  });
  return bad.length ? bad.length + ' notes off the grid' : true;
});

check('a stalled frame skips the missed steps instead of playing them in a burst', function () {
  const env = unlocked();
  env.TG.Audio.music('level1');
  run(env, 30);
  const from = nodeCount(env);
  env.audio.advance(2.0);   // a 2 s stall
  const now = env.audio.contexts[0].currentTime;
  env.TG.Audio.update(2.0);
  const late = createdSince(env, from).filter(function (n) {
    return (n.kind === 'oscillator' || n.kind === 'bufferSource') && n.startTime < now - 0.03;
  });
  return late.length === 0;
});

// Start times of the music notes scheduled while frames of `frame` seconds run for `seconds`.
function musicStarts(frame, seconds, name) {
  const env = unlocked();
  env.TG.Audio.music(name || 'level1');
  const from = nodeCount(env);
  const late = [];
  const frames = Math.round(seconds / frame);
  for (let i = 0; i < frames; i++) {
    env.audio.advance(frame);
    const now = env.audio.contexts[0].currentTime;
    const before = nodeCount(env);
    env.TG.Audio.update(frame);
    createdSince(env, before).forEach(function (n) {
      if ((n.kind === 'oscillator' || n.kind === 'bufferSource') && n.startTime < now - 1e-9) late.push(n.startTime);
    });
  }
  const starts = createdSince(env, from).filter(function (n) { return n.kind === 'oscillator' || n.kind === 'bufferSource'; })
    .map(function (n) { return n.startTime; });
  return { env: env, starts: starts, late: late };
}

check('with the frame rate down to 6 fps (150 ms frames) the look-ahead grows: no note is dropped or started late after the first slow frame', function () {
  const smooth = musicStarts(1 / 60, 10);
  const slow = musicStarts(0.15, 10);
  if (slow.late.length) return slow.late.length + ' notes scheduled in the past';
  // Compare the notes from 0.5 s on (the first slow frame may miss the steps it could not see coming).
  const pick = function (list) { return list.filter(function (t) { return t >= 0.5 && t < 9.5; }).sort(function (a, b) { return a - b; }); };
  const a = pick(smooth.starts);
  const b = pick(slow.starts);
  if (a.length !== b.length) return 'smooth ' + a.length + ' notes, slow ' + b.length;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-6) return 'note ' + i + ' at ' + b[i] + ' instead of ' + a[i];
  return true;
});

check('the look-ahead never exceeds 300 ms and returns to 100 ms once frames are short again', function () {
  const env = unlocked();
  env.TG.Audio.music('level1');
  const ctx = env.audio.contexts[0];
  let worst = 0;
  function frames(n, dt) {
    let ahead = 0;
    for (let i = 0; i < n; i++) {
      env.audio.advance(dt);
      const now = ctx.currentTime;
      const from = nodeCount(env);
      env.TG.Audio.update(dt);
      createdSince(env, from).forEach(function (x) {
        if (x.kind === 'oscillator' || x.kind === 'bufferSource') ahead = Math.max(ahead, x.startTime - now);
      });
    }
    return ahead;
  }
  worst = frames(20, 0.4);   // frames longer than MAX_FRAME, as when a tab stalls
  const after = (frames(300, 1 / 60), frames(120, 1 / 60));
  if (worst > 0.3 + 1e-9) return 'look-ahead reached ' + worst;
  return after <= 0.1 + 1e-9 || 'look-ahead still ' + after + ' s after steady frames';
});

check('a gap of many seconds (a sleeping laptop) skips ahead in one update and keeps the loop on its grid', function () {
  const env = unlocked();
  env.TG.Audio.music('level1');
  run(env, 60);
  const I = env.TG.Audio._internals;
  const s0 = I.sequencer('loop');
  env.audio.advance(600);
  const now = env.audio.contexts[0].currentTime;
  const from = nodeCount(env);
  env.TG.Audio.update(600);
  const s1 = I.sequencer('loop');
  const stepDur = 60 / 150 / 4;
  const k = (s1.nextTime - s0.nextTime) / stepDur;
  if (Math.abs(k - Math.round(k)) > 1e-6) return 'off the grid by ' + (k - Math.round(k));
  if (!(s1.nextTime >= now && s1.nextTime < now + I.MAX_LOOKAHEAD + stepDur)) return 'next step at ' + s1.nextTime + ', now ' + now;
  const late = createdSince(env, from).filter(function (n) { return (n.kind === 'oscillator' || n.kind === 'bufferSource') && n.startTime < now; });
  if (late.length || !s1.playing) return late.length + ' late notes';
  // About a second of steady frames later the look-ahead is back to 100 ms.
  run(env, 90);
  const ahead = [];
  for (let i = 0; i < 30; i++) {
    env.audio.advance(1 / 60);
    const t = env.audio.contexts[0].currentTime;
    env.TG.Audio.update(1 / 60);
    ahead.push(I.sequencer('loop').nextTime - t);
  }
  return Math.max.apply(null, ahead) <= 0.1 + stepDur + 1e-9 || 'look-ahead ' + Math.max.apply(null, ahead);
});

// Every gain node whose automation was ever cancelled. Only the jingle duck may appear here.
function cancelledGains(env) {
  return env.audio.contexts[0].created.filter(function (n) {
    return n.kind === 'gain' && n.gain.events.some(function (e) { return /^cancel/.test(e.type); });
  });
}

check('stopping, pausing and muting music fade the channel gains from their level to 0 (no envelope is cancelled), and later notes use new channel gains', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  const duck = I.graph().duck;
  function channelGains() {
    return env.audio.contexts[0].created.filter(function (n) {
      return n.kind === 'gain' && n.connections.indexOf(duck) !== -1;
    });
  }
  function checkFade(list, what) {
    const now = env.audio.contexts[0].currentTime;
    const live = list.filter(function (g) { return g.gain.events.length === 0 || g.gain.events[g.gain.events.length - 1].time > now - 1; });
    if (live.length !== 4) return what + ': ' + live.length + ' channel gains';
    for (const g of live) {
      const ev = g.gain.events;
      if (ev.length !== 2) return what + ': ' + ev.length + ' events on a channel gain';
      const level = [0.20, 0.14, 0.28, 0.16].filter(function (v) { return Math.abs(v - ev[0].value) < 1e-9; });
      if (ev[0].type !== 'setValueAtTime' || !level.length || Math.abs(ev[0].time - now) > 1e-9) return what + ': fade does not start from the channel level now';
      if (ev[1].type !== 'linearRampToValueAtTime' || ev[1].value !== 0 || ev[1].time - ev[0].time < 0.005) return what + ': fade too short';
    }
    return null;
  }
  env.TG.Audio.music('level1');
  run(env, 60);
  const first = channelGains();
  env.TG.Audio.music(null);
  let r = checkFade(first, 'stop');
  if (r) return r;
  env.TG.Audio.music('level1');
  run(env, 60);
  const second = channelGains().filter(function (g) { return first.indexOf(g) === -1; });
  if (second.length !== 4 || second.some(function (g) { return g.gain.events.length !== 0; })) return 'no fresh channel gains after the stop';
  emit(env, 'screen:change', { from: 'playing', to: 'paused', data: null });
  r = checkFade(second, 'pause');
  if (r) return r;
  emit(env, 'screen:change', { from: 'paused', to: 'playing', data: null });
  run(env, 60);
  const third = channelGains().filter(function (g) { return first.indexOf(g) === -1 && second.indexOf(g) === -1; });
  env.TG.Audio.setEnabled('music', false);
  r = checkFade(third, 'mute');
  if (r) return r;
  const cancelled = cancelledGains(env).filter(function (g) { return g !== duck; });
  if (cancelled.length) return cancelled.length + ' gains had their automation cancelled';
  // Retired channel gains are disconnected once their fade is over.
  run(env, 30);
  const stillConnected = first.concat(second, third).filter(function (g) { return g.connections.length; });
  return stillConnected.length === 0 && I.retiredCount() === 0;
});

check('in a whole play-through of events no envelope is ever cancelled; only the jingle duck is re-scheduled, from its known value', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  const flow = [
    ['screen:change', { from: null, to: 'boot', data: null }],
    ['screen:change', { from: 'boot', to: 'title', data: null }],
    ['ui:move', {}], ['ui:select', {}],
    ['screen:change', { from: 'title', to: 'difficultySelect', data: null }],
    ['screen:change', { from: 'difficultySelect', to: 'howToPlay', data: null }],
    ['screen:change', { from: 'howToPlay', to: 'playing', data: null }],
    ['level:start', { levelId: 1, difficulty: 'medium', name: 'X', continued: false, music: { level: 'level1', boss: 'boss1' } }],
    ['section:enter', { index: 0, name: 'A', stage: '1-1', palette: 'day', music: { transpose: 0, tempo: 150, keyOk: { root: 0, mode: 'major' } } }],
    ['checkpoint', { index: 1, x: 4096, wpm: 20, accuracy: 0.9, bonus: 0, lives: 4 }],
    ['checkpoint', { index: 2, x: 8704, wpm: 20, accuracy: 0.9, bonus: 0, lives: 4 }],
    ['screen:change', { from: 'playing', to: 'paused', data: null }],
    ['screen:change', { from: 'paused', to: 'playing', data: null }],
    ['power:start', { power: 'hourglass', duration: 6 }],
    ['screen:change', { from: 'playing', to: 'lifeLost', data: null }],
    ['screen:change', { from: 'lifeLost', to: 'gameOver', data: null }],
    ['screen:change', { from: 'gameOver', to: 'playing', data: null }],
    ['game:continue', { checkpoint: 2, continues: 1, assist: 0.85 }],
    ['level:start', { levelId: 1, difficulty: 'medium', name: 'X', continued: true, music: { level: 'level1', boss: 'boss1' } }],
    ['section:enter', { index: 2, name: 'C', stage: '1-3', palette: 'sunset', music: { transpose: 2, tempo: 158, keyOk: { root: 2, mode: 'major' } } }],
    ['boss:warning', {}],
    ['screen:change', { from: 'playing', to: 'bossIntro', data: null }],
    ['screen:change', { from: 'bossIntro', to: 'boss', data: null }],
    ['boss:phase', { phase: 3 }],
    ['boss:defeat', { x: 0, y: 0 }],
    ['screen:change', { from: 'boss', to: 'levelComplete', data: null }],
    ['screen:change', { from: 'levelComplete', to: 'results', data: null }]
  ];
  flow.forEach(function (row, i) {
    emit(env, row[0], row[1]);
    emit(env, 'type:hit', { target: {}, id: 1, kind: 'hoppet', ch: 'a', index: 1 + (i % 5), length: 8, complete: false, x: 0, y: 0 });
    run(env, 25);
  });
  const cancelled = cancelledGains(env);
  const duck = I.graph().duck;
  if (cancelled.some(function (g) { return g !== duck; })) return 'a gain other than the duck was cancelled';
  // Each time the duck is re-scheduled it continues from the value its curve had at that moment.
  const ev = duck.gain.events;
  let prevRamp = null;
  for (let i = 0; i < ev.length; i++) {
    if (/^cancel/.test(ev[i].type)) {
      const set = ev[i + 1];
      if (!set || set.type !== 'setValueAtTime' || set.time !== ev[i].time) return 'a cancel is not followed by a hold at the same time';
      if (!(set.value >= I.DUCK - 1e-9 && set.value <= 1 + 1e-9)) return 'duck held at ' + set.value;
    }
    if (ev[i].type === 'linearRampToValueAtTime') prevRamp = ev[i];
  }
  return prevRamp !== null && env.errors.length === 0;
});

check('the duck curve holds the exact value of a ramp in progress when a second jingle arrives part-way', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  env.TG.Audio.music('level1');
  run(env, 10);
  env.TG.Audio.jingle('jingle_checkpoint');   // 0.6 s, then 0.25 s back up to 1
  const ctx = env.audio.contexts[0];
  const t0 = I.graph().duck.gain.events.filter(function (e) { return e.type === 'linearRampToValueAtTime' && e.value === I.DUCK; })[0].time;
  // Advance into the ramp back up: 0.6 s + 0.125 s after the duck point, i.e. half-way up.
  env.audio.advance(t0 + 0.6 + 0.125 - ctx.currentTime);
  env.TG.Audio.jingle('jingle_checkpoint');
  const ev = I.graph().duck.gain.events;
  const cancel = ev.map(function (e) { return e.type; }).lastIndexOf('cancelAndHoldAtTime');
  const held = ev[cancel + 1].value;
  const expected = I.DUCK + (1 - I.DUCK) * 0.5;
  return Math.abs(held - expected) < 1e-6 || 'held at ' + held + ', expected ' + expected;
});

check('setTempoScale(0.75) lowers the number of start() calls per second, and setBassOnly(true) lowers it further', function () {
  const env = unlocked();
  env.TG.Audio.music('level1');
  run(env, 60);
  const a = startsPerSecond(env, 8).reduce(function (x, y) { return x + y; }, 0);
  env.TG.Audio.setTempoScale(0.75);
  const b = startsPerSecond(env, 8).reduce(function (x, y) { return x + y; }, 0);
  env.TG.Audio.setBassOnly(true);
  const c = startsPerSecond(env, 8).reduce(function (x, y) { return x + y; }, 0);
  if (!(b < a)) return 'tempo scale: ' + a + ' -> ' + b;
  if (!(c < b)) return 'bass only: ' + b + ' -> ' + c;
  return env.TG.Audio._internals.sequencer('loop').bassOnly === true;
});

check('with bass only, the notes that still play are triangle notes', function () {
  const env = unlocked();
  env.TG.Audio.music('level1');
  env.TG.Audio.setBassOnly(true);
  const from = nodeCount(env);
  run(env, 120);
  const sources = createdSince(env, from).filter(function (n) { return n.kind === 'oscillator' || n.kind === 'bufferSource'; });
  return sources.length > 0 && sources.every(function (n) { return n.kind === 'oscillator' && n.type === 'triangle'; });
});

check('music(name, opts) on the track already playing changes tempo and transpose at the next bar without restarting', function () {
  const env = unlocked();
  env.TG.Audio.music('level1', { transpose: 0, tempo: 150 });
  run(env, 90);   // 1.5 s: well inside bar 1
  const before = env.TG.Audio._internals.sequencer('loop');
  env.TG.Audio.music('level1', { transpose: 2, tempo: 158 });
  const right = env.TG.Audio._internals.sequencer('loop');
  if (right.step < before.step) return 'the track restarted';
  if (right.bpm !== 150 || right.transpose !== 0) return 'the change was applied before the bar';
  run(env, 60);   // past bar 1 (1.6 s)
  const after = env.TG.Audio._internals.sequencer('loop');
  if (!(after.bpm === 158 && after.transpose === 2)) return 'not applied after the bar: ' + JSON.stringify(after);
  env.TG.Audio.music('level1', { restart: true });
  return env.TG.Audio._internals.sequencer('loop').step === 0;
});

check('transposing by 2 semitones raises every scheduled note by a factor of 2^(2/12)', function () {
  const env = unlocked();
  env.TG.Audio.music('level1');
  const from = nodeCount(env);
  run(env, 30);
  const plain = createdSince(env, from).filter(function (n) { return n.kind === 'oscillator' && n.frequency.value > 20; })
    .map(function (n) { return n.frequency.events[0].value; });
  const env2 = unlocked();
  env2.TG.Audio.music('level1', { transpose: 2 });
  const from2 = nodeCount(env2);
  run(env2, 30);
  const up = createdSince(env2, from2).filter(function (n) { return n.kind === 'oscillator' && n.frequency.value > 20; })
    .map(function (n) { return n.frequency.events[0].value; });
  if (plain.length === 0 || plain.length !== up.length) return 'different note counts ' + plain.length + ' / ' + up.length;
  const ratio = Math.pow(2, 2 / 12);
  return plain.every(function (fq, i) { return Math.abs(up[i] / fq - ratio) < 1e-6; });
});

check('every note actually scheduled for the level theme is in G major (end to end, from the oscillator frequencies)', function () {
  const env = unlocked();
  env.TG.Audio.music('level1');
  const from = nodeCount(env);
  run(env, 600);
  const set = keySet('G', 'major');
  const oscs = createdSince(env, from).filter(function (n) { return n.kind === 'oscillator' && n.frequency.value > 20; });
  if (oscs.length < 100) return 'only ' + oscs.length + ' notes';
  const bad = oscs.filter(function (n) {
    const midi = 69 + 12 * Math.log2(n.frequency.events[0].value / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    return Math.abs(midi - Math.round(midi)) > 1e-6 || set.indexOf(pc) === -1;
  });
  return bad.length ? bad.length + ' notes outside G major' : true;
});

check('music note envelopes are free of jumps too', function () {
  const env = unlocked();
  env.TG.Audio.music('level1');
  const from = nodeCount(env);
  run(env, 240);
  const problems = envelopeProblems(createdSince(env, from));
  return problems.length ? problems[0] : true;
});

check('the level lead has vibrato on notes longer than 150 ms and not on shorter ones, connected only while the note sounds', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  const vib = I.graph().vibDepth;
  if (!vib || vib.gain.value !== 10) return 'no shared vibrato depth gain of 10 cents';
  const connected = [];
  const original = vib.connect;
  vib.connect = function (target) { connected.push(target); return original.call(vib, target); };
  env.TG.Audio.music('level1');
  const from = nodeCount(env);
  let most = 0;
  for (let i = 0; i < 600; i++) {
    run(env, 1);
    most = Math.max(most, vib.connections.length);   // the LFO feeds vib; vib feeds only note detunes
  }
  const oscs = createdSince(env, from).filter(function (n) { return n.kind === 'oscillator' && n.periodicWave; });
  const durOf = function (n) {
    const ev = n.connections[0].gain.events;
    return ev[ev.length - 1].time - ev[0].time;
  };
  const leads = oscs.filter(function (n) { return Math.abs(n.periodicWave.real[1] - 2 * Math.sin(Math.PI * 0.5) / Math.PI) < 1e-6; });
  const withVib = leads.filter(function (n) { return connected.indexOf(n.detune) !== -1; });
  if (withVib.length === 0) return 'vibrato connected to no note';
  if (withVib.some(function (n) { return durOf(n) <= 0.15; })) return 'a short note has vibrato';
  if (leads.some(function (n) { return durOf(n) > 0.15 && connected.indexOf(n.detune) === -1; })) return 'a long lead note has no vibrato';
  if (oscs.some(function (n) { return leads.indexOf(n) === -1 && connected.indexOf(n.detune) !== -1; })) return 'a harmony note has vibrato';
  if (most < 1 || most > 3) return 'vibrato was connected to at most ' + most + ' notes at once (expected 1 to 3)';
  env.TG.Audio.music(null);
  run(env, 5);
  return vib.connections.length === 0 || 'still connected to ' + vib.connections.length + ' notes after the music stopped';
});

check('the title lead plays each note with a quieter 16th-note echo', function () {
  const env = stubs.load({ files: FILES });
  const t = env.TG.Audio._internals.parse('title');
  const events = t.channels.p1.events;
  const echoes = events.filter(function (e) { return e.echo; });
  if (echoes.length === 0) return 'no echoes';
  return echoes.every(function (e) {
    const main = events.filter(function (m) { return !m.echo && m.step === e.step - 1 && m.midi === e.midi; })[0];
    return main && e.vel < main.vel && e.len === 1;
  });
});

check('music(null) stops the loop; suspend and resume act on the context only and keep the sequencer position', function () {
  const env = unlocked();
  env.TG.Audio.music('title');
  run(env, 120);
  const before = env.TG.Audio._internals.sequencer('loop');
  env.TG.Audio.suspend();
  const afterSuspend = env.TG.Audio._internals.sequencer('loop');
  env.TG.Audio.resume();
  const afterResume = env.TG.Audio._internals.sequencer('loop');
  if (env.audio.suspends !== 1 || env.audio.resumes < 1) return 'suspend/resume counts ' + env.audio.suspends + '/' + env.audio.resumes;
  if (afterSuspend.step !== before.step || afterResume.step !== before.step) return 'the sequencer position changed';
  if (!afterResume.playing || afterResume.paused) return 'the sequencer stopped';
  env.TG.Audio.music(null);
  const s0 = env.audio.starts;
  run(env, 60);
  return env.audio.starts === s0 && env.TG.Audio._internals.sequencer('loop').playing === false;
});

check('setEnabled("sfx", false) stops new sound effects and setEnabled("music", false) silences music without stopping the sequencer position', function () {
  const env = unlocked();
  env.TG.Audio.setEnabled('sfx', false);
  const n0 = env.audio.nodes;
  env.TG.Audio.sfx('jump');
  if (env.audio.nodes !== n0) return 'sfx played while off';
  env.TG.Audio.setEnabled('sfx', true);
  env.TG.Audio.sfx('jump');
  if (env.audio.nodes === n0) return 'sfx did not come back';
  env.TG.Audio.music('level1');
  run(env, 60);
  env.TG.Audio.setEnabled('music', false);
  const step0 = env.TG.Audio._internals.sequencer('loop').step;
  const s0 = env.audio.starts;
  run(env, 120);
  const step1 = env.TG.Audio._internals.sequencer('loop').step;
  if (env.audio.starts !== s0) return 'music notes started while off';
  if (!(step1 > step0)) return 'the sequencer position did not advance';
  env.TG.Audio.setEnabled('music', true);
  run(env, 60);
  return env.audio.starts > s0;
});

check('a jingle ducks the loop to 30% for its length and restores it afterwards', function () {
  const env = unlocked();
  env.TG.Audio.music('level1');
  run(env, 30);
  const from = nodeCount(env);
  env.TG.Audio.jingle('jingle_checkpoint');
  const ctx = env.audio.contexts[0];
  const duck = ctx.created.filter(function (n) {
    return n.kind === 'gain' && n.gain.events.some(function (e) { return e.type === 'linearRampToValueAtTime' && e.value === 0.3; });
  })[0];
  if (!duck) return 'no duck ramp to 0.3';
  const ev = duck.gain.events;
  const down = ev.filter(function (e) { return e.type === 'linearRampToValueAtTime' && e.value === 0.3; })[0];
  const up = ev.filter(function (e) { return e.type === 'linearRampToValueAtTime' && e.value === 1; })[0];
  if (!up || !(up.time > down.time + 0.6)) return 'no restore after the jingle';
  run(env, 90);
  const once = createdSince(env, from).filter(function (n) { return n.kind === 'oscillator' || n.kind === 'bufferSource'; });
  return once.length > 0 && env.TG.Audio._internals.sequencer('loop').playing;
});

// =================================================================================================
// Event-driven behaviour (CONTRACT 7.1 to 7.3)
// =================================================================================================

function spyJingle(env) {
  const calls = [];
  const original = env.TG.Audio.jingle;
  env.TG.Audio.jingle = function (name) { calls.push(name); return original.call(env.TG.Audio, name); };
  return calls;
}

check('level:start after an Hourglass and a boss warning returns the tempo scale to 1, turns bass-only off and plays jingle_ready once', function () {
  [false, true].forEach(function (continued) {
    const env = unlocked();
    const jingles = spyJingle(env);
    emit(env, 'screen:change', { from: 'howToPlay', to: 'playing', data: null });
    emit(env, 'level:start', { levelId: 1, difficulty: 'medium', name: 'QUILL MEADOWS', continued: false, music: { level: 'level1', boss: 'boss1' } });
    run(env, 30);
    emit(env, 'power:start', { power: 'hourglass', duration: 6 });
    emit(env, 'boss:warning', {});
    const I = env.TG.Audio._internals;
    assert.strictEqual(I.tempoScale(), 0.75, 'tempo scale after hourglass');
    assert.strictEqual(I.sequencer('loop').bassOnly, true, 'bass only after warning');
    jingles.length = 0;
    if (continued) emit(env, 'game:continue', { checkpoint: 1, continues: 1, assist: 0.85 });
    emit(env, 'level:start', { levelId: 1, difficulty: 'medium', name: 'QUILL MEADOWS', continued: continued, music: { level: 'level1', boss: 'boss1' } });
    assert.strictEqual(I.tempoScale(), 1, 'tempo scale after level:start');
    assert.strictEqual(I.sequencer('loop').bassOnly, false, 'bass only after level:start');
    assert.deepStrictEqual(jingles, ['jingle_ready'], 'jingle_ready count (continued ' + continued + ')');
    assert.strictEqual(I.sequencer('once').name, 'jingle_ready');
  });
  return true;
});

// LEVEL2 11.1. No level has a ready jingle of its own yet, so jingle_checkpoint stands in for one.
check('level:start plays the ready jingle named by music.ready, and jingle_ready when the level names none or names something that is not a track', function () {
  const cases = [
    // [the music of the level:start payload, the jingle that plays]
    [{ level: 'level1', boss: 'boss1', ready: 'jingle_checkpoint' }, 'jingle_checkpoint'],
    [{ level: 'level1', boss: 'boss1' }, 'jingle_ready'],
    [{ level: 'level1', boss: 'boss1', ready: 'no_such_jingle' }, 'jingle_ready'],
    [{ level: 'level1', boss: 'boss1', ready: 7 }, 'jingle_ready'],
    [{ level: 'level1', boss: 'boss1', ready: null }, 'jingle_ready']
  ];
  const bad = [];
  [false, true].forEach(function (continued) {
    cases.forEach(function (c) {
      const env = unlocked();
      const jingles = spyJingle(env);
      const label = JSON.stringify(c[0].ready) + ' (continued ' + continued + ')';
      emit(env, 'screen:change', { from: continued ? 'gameOver' : 'howToPlay', to: 'playing', data: null });
      if (continued) emit(env, 'game:continue', { checkpoint: 1, continues: 1, assist: 0.85 });
      emit(env, 'level:start', { levelId: 2, difficulty: 'medium', name: 'X', continued: continued, music: c[0] });
      const once = env.TG.Audio._internals.sequencer('once');
      if (!same(jingles, [c[1]])) bad.push(label + ' asked for ' + jingles.join(','));
      else if (once.name !== c[1] || !once.playing) bad.push(label + ' plays ' + JSON.stringify(once));
      if (env.warnings.length || env.errors.length) bad.push(label + ' wrote to the console: ' + env.warnings.concat(env.errors).join('; '));
    });
  });
  return bad.length ? bad.join('; ') : true;
});

check('a level\'s own ready jingle takes the section\'s transpose after a continue, and is not carried into a run of a level that names none', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  const jingles = spyJingle(env);
  emit(env, 'screen:change', { from: 'gameOver', to: 'playing', data: null });
  emit(env, 'game:continue', { checkpoint: 2, continues: 1, assist: 0.85 });
  emit(env, 'level:start', { levelId: 2, difficulty: 'medium', name: 'X', continued: true, music: { level: 'level1', boss: 'boss1', ready: 'jingle_checkpoint' } });
  emit(env, 'section:enter', { index: 2, name: 'C', stage: '2-3', palette: 'crystal', music: { transpose: 3, tempo: 148, keyOk: { root: 5, mode: 'minor' } } });
  run(env, 30);
  const own = I.sequencer('once');
  if (own.name !== 'jingle_checkpoint' || own.transpose !== 3) return 'the level\'s own jingle: ' + JSON.stringify(own);
  emit(env, 'screen:change', { from: 'playing', to: 'paused', data: null });
  emit(env, 'screen:change', { from: 'paused', to: 'results', data: null });
  emit(env, 'screen:change', { from: 'results', to: 'title', data: null });
  emit(env, 'screen:change', { from: 'title', to: 'difficultySelect', data: null });
  emit(env, 'screen:change', { from: 'difficultySelect', to: 'howToPlay', data: null });
  emit(env, 'screen:change', { from: 'howToPlay', to: 'playing', data: null });
  jingles.length = 0;
  emit(env, 'level:start', { levelId: 1, difficulty: 'medium', name: 'X', continued: false, music: { level: 'level1', boss: 'boss1' } });
  emit(env, 'section:enter', { index: 0, name: 'A', stage: '1-1', palette: 'day', music: { transpose: 0, tempo: 150, keyOk: { root: 0, mode: 'major' } } });
  run(env, 30);
  const next = I.sequencer('once');
  return (same(jingles, ['jingle_ready']) && next.name === 'jingle_ready' && next.transpose === 0) ||
    'the next level: ' + jingles.join(',') + ' ' + JSON.stringify(next);
});

check('level:start with music.level "level1" followed by screen:change to playing plays level1', function () {
  const env = unlocked();
  emit(env, 'level:start', { levelId: 1, difficulty: 'medium', name: 'X', continued: false, music: { level: 'level1', boss: 'boss1' } });
  emit(env, 'screen:change', { from: 'howToPlay', to: 'playing', data: null });
  const s0 = env.audio.starts;
  run(env, 60);
  const s = env.TG.Audio._internals.sequencer('loop');
  return s.name === 'level1' && s.playing && env.audio.starts > s0;
});

check('screen:change to playing before level:start (the order of newRun) also ends with level1 playing, and start plays once', function () {
  const env = unlocked();
  emit(env, 'screen:change', { from: 'howToPlay', to: 'playing', data: null });
  emit(env, 'level:start', { levelId: 1, difficulty: 'medium', name: 'X', continued: false, music: { level: 'level1', boss: 'boss1' } });
  emit(env, 'section:enter', { index: 0, name: 'MORNING MEADOW', stage: '1-1', palette: 'day', music: { transpose: 0, tempo: 150, keyOk: { root: 0, mode: 'major' } } });
  run(env, 60);
  const s = env.TG.Audio._internals.sequencer('loop');
  const log = Array.prototype.slice.call(env.TG.Audio._internals.sfxLog);
  return s.name === 'level1' && s.playing && log.filter(function (n) { return n === 'start'; }).length === 1;
});

check('a level:start naming a track that is not in TRACKS warns once and does not throw', function () {
  const env = unlocked();
  emit(env, 'screen:change', { from: 'howToPlay', to: 'playing', data: null });
  emit(env, 'level:start', { levelId: 1, difficulty: 'medium', name: 'X', continued: false, music: { level: 'no_such_track', boss: 'boss1' } });
  emit(env, 'screen:change', { from: 'playing', to: 'lifeLost', data: null });
  emit(env, 'screen:change', { from: 'lifeLost', to: 'playing', data: null });
  run(env, 30);
  const warnings = env.warnings.filter(function (w) { return /no_such_track/.test(w); });
  return warnings.length === 1 && env.errors.length === 0 && env.TG.Audio._internals.sequencer('loop').name !== 'no_such_track';
});

check('section:enter changes transpose and tempo of the playing level track at the next bar', function () {
  const env = unlocked();
  emit(env, 'screen:change', { from: 'howToPlay', to: 'playing', data: null });
  emit(env, 'level:start', { levelId: 1, difficulty: 'medium', name: 'X', continued: false, music: { level: 'level1', boss: 'boss1' } });
  emit(env, 'section:enter', { index: 0, name: 'A', stage: '1-1', palette: 'day', music: { transpose: 0, tempo: 150, keyOk: { root: 0, mode: 'major' } } });
  run(env, 60);
  emit(env, 'section:enter', { index: 2, name: 'C', stage: '1-3', palette: 'sunset', music: { transpose: 2, tempo: 158, keyOk: { root: 2, mode: 'major' } } });
  run(env, 200);
  const s = env.TG.Audio._internals.sequencer('loop');
  return s.name === 'level1' && s.transpose === 2 && s.bpm === 158;
});

check('(Tier 2) section:enter with keyOk root 2 raises key_ok by 2 semitones, and a minor mode uses the minor pentatonic', function () {
  const env = unlocked();
  const base = keyOkFreq(env, 1);
  emit(env, 'section:enter', { index: 2, name: 'C', stage: '1-3', palette: 'sunset', music: { transpose: 2, tempo: 158, keyOk: { root: 2, mode: 'major' } } });
  const up = keyOkFreq(env, 1);
  if (Math.abs(up / base - Math.pow(2, 2 / 12)) > 1e-6) return 'ratio ' + (up / base);
  emit(env, 'section:enter', { index: 3, name: 'B', stage: '1-B', palette: 'dusk', music: { transpose: 0, tempo: 168, keyOk: { root: 4, mode: 'minor' } } });
  const minor1 = keyOkFreq(env, 1);
  const expected = 523.2511306011972 * Math.pow(2, (4 + 3) / 12);   // E5 root, minor third
  if (Math.abs(minor1 - expected) > 0.01) return 'minor step 1 is ' + minor1;
  emit(env, 'section:enter', { index: 0, name: 'A', stage: '1-1', palette: 'day', music: { transpose: 0, tempo: 150 } });
  return Math.abs(keyOkFreq(env, 1) - base) < 1e-9;
});

check('urgent_tick plays four times a second while an entity is urgent on playing or boss, and not otherwise', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  function ticks(frames) {
    const n0 = I.sfxLog.length;
    const before = Array.prototype.slice.call(I.sfxLog).filter(function (n) { return n === 'urgent_tick'; }).length;
    run(env, frames);
    void n0;
    return Array.prototype.slice.call(I.sfxLog).filter(function (n) { return n === 'urgent_tick'; }).length - before;
  }
  env.TG.Game = { state: { screen: 'playing', entities: [{ id: 1, urgent: true, dead: false }] } };
  const perSecond = ticks(60);
  const perThree = ticks(180);
  if (perSecond < 3 || perSecond > 5) return perSecond + ' ticks in the first second';
  if (perThree < 11 || perThree > 13) return perThree + ' ticks in three seconds';
  env.TG.Game.state.entities = [];
  I.sfxLog.length = 0;
  if (ticks(120) !== 0) return 'ticks with no urgent entity';
  env.TG.Game.state.entities = [{ id: 1, urgent: true, dead: false }];
  env.TG.Game.state.screen = 'gameOver';
  if (ticks(120) !== 0) return 'ticks on gameOver';
  env.TG.Game.state.screen = 'boss';
  if (ticks(60) < 3) return 'no ticks on boss';
  env.TG.Game.state.entities = [{ id: 1, urgent: true, dead: true }];
  I.sfxLog.length = 0;
  if (ticks(120) !== 0) return 'ticks for a dead entity';
  delete env.TG.Game;
  run(env, 60);
  return env.errors.length === 0;
});

check('screen:change to paused stops new music notes while sfx still creates nodes; leaving paused continues from the same step', function () {
  const env = unlocked();
  env.TG.Audio.music('level1');
  run(env, 120);
  emit(env, 'screen:change', { from: 'playing', to: 'paused', data: null });
  const atPause = env.TG.Audio._internals.sequencer('loop');
  const s0 = env.audio.starts;
  run(env, 120);
  if (env.audio.starts !== s0) return 'music notes started while paused';
  const n0 = env.audio.nodes;
  env.TG.Audio.sfx('ui_move');
  if (env.audio.nodes === n0) return 'sfx made no nodes on the pause screen';
  if (env.audio.suspends !== 0) return 'pause called suspend()';
  emit(env, 'screen:change', { from: 'paused', to: 'playing', data: null });
  const afterResume = env.TG.Audio._internals.sequencer('loop');
  if (afterResume.step !== atPause.step) return 'position changed: ' + atPause.step + ' -> ' + afterResume.step;
  const s1 = env.audio.starts;
  run(env, 60);
  if (env.audio.resumes !== 0) return 'resume from pause called resume() on the context';
  const log = Array.prototype.slice.call(env.TG.Audio._internals.sfxLog);
  return env.audio.starts > s1 && log.filter(function (n) { return n === 'pause'; }).length === 2;
});

// Groups of notes that start together, in time order, as signatures.
function groups(sources) {
  const byTime = {};
  sources.forEach(function (n) {
    const key = n.startTime.toFixed(6);
    const sig = n.kind === 'oscillator' ? 'o' + n.frequency.events[0].value.toFixed(2) : 'n' + n.playbackRate.events[0].value.toFixed(3);
    (byTime[key] = byTime[key] || []).push(sig);
  });
  return Object.keys(byTime).sort(function (a, b) { return a - b; }).map(function (k) { return byTime[k].sort().join('+'); });
}

// A music note: source -> envelope gain -> channel gain -> duck. Sound effects (the pause sound, the
// watch's tick) go to a voice gain instead. Checked while the paths are still connected.
function musicNotes(e, list) {
  const duck = e.TG.Audio._internals.graph().duck;
  return list.filter(function (n) {
    if (n.kind !== 'oscillator' && n.kind !== 'bufferSource') return false;
    const g = n.connections[0];
    const ch = g && g.connections[0];
    return !!(ch && ch.connections.indexOf(duck) !== -1);
  });
}

check('pausing loses no music: after resume the loop continues with the first step that had not sounded at the pause', function () {
  const ref = unlocked();
  const rf = nodeCount(ref);
  ref.TG.Audio.music('level1');
  run(ref, 60 * 6);
  const want = groups(musicNotes(ref, createdSince(ref, rf)));

  const env = unlocked();
  const f0 = nodeCount(env);
  env.TG.Audio.music('level1');
  run(env, 97);   // part-way between two steps
  const T = env.audio.contexts[0].currentTime;
  emit(env, 'screen:change', { from: 'playing', to: 'paused', data: null });
  const beforePause = musicNotes(env, createdSince(env, f0)).filter(function (n) { return n.startTime <= T; });
  run(env, 60 * 2);
  const f1 = nodeCount(env);
  emit(env, 'screen:change', { from: 'paused', to: 'playing', data: null });
  run(env, 60 * 3);
  const afterResume = musicNotes(env, createdSince(env, f1));
  const got = groups(beforePause).concat(groups(afterResume));
  const n = Math.min(got.length, want.length, 60);
  if (n < 40) return 'only ' + n + ' note groups';
  for (let i = 0; i < n; i++) if (got[i] !== want[i]) return 'group ' + i + ' is ' + got[i] + ', expected ' + want[i];
  return true;
});

// =================================================================================================
// The Pocket Watch (LEVEL2 6.3, 11.3)
// =================================================================================================
//
// The simulation is not loaded here: power:start, power:end and the screen changes are emitted by hand,
// in the orders js/game.js emits them.

const WATCH_ON = { power: 'watch', duration: 3 };
const WATCH_END = { power: 'watch' };
const G6 = 440 * Math.pow(2, 22 / 12), D6 = 440 * Math.pow(2, 17 / 12);

// A run in play, past its ready jingle, with the level loop sounding.
function inPlay() {
  const env = unlocked();
  emit(env, 'screen:change', { from: 'howToPlay', to: 'playing', data: null });
  emit(env, 'level:start', { levelId: 2, difficulty: 'medium', name: 'X', continued: false, music: { level: 'level1', boss: 'boss1' } });
  emit(env, 'section:enter', { index: 0, name: 'A', stage: '2-1', palette: 'day', music: { transpose: 0, tempo: 150, keyOk: { root: 0, mode: 'major' } } });
  run(env, 60 * 5);
  env.TG.Audio._internals.sfxLog.length = 0;
  return env;
}

function played(env, name) {
  return Array.prototype.slice.call(env.TG.Audio._internals.sfxLog).filter(function (n) { return n === name; }).length;
}

// The music notes among the nodes made since index `from` (see musicNotes).
function musicSince(env, from) {
  return musicNotes(env, createdSince(env, from)).length;
}

check('watch_tick is one 30 ms P12 note, the tick on G6 and the tock a fourth below it on D6; watch_off is a P50 rise from 220 to 880 Hz over 200 ms; both at the sound effect level', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  function sound(name, opts) {
    const s = sfxSources(env, name, opts);
    if (s.sources.length !== 1 || s.sources[0].node.kind !== 'oscillator') return null;
    const osc = s.sources[0].node;
    const ev = osc.connections[0].gain.events;
    return { freq: osc.frequency.events, wave: osc.periodicWave ? osc.periodicWave.real[1] : null,
      dur: ev[ev.length - 1].time - ev[0].time, ends: ev[ev.length - 1].value, level: s.level };
  }
  const P12 = 2 * Math.sin(Math.PI * 0.125) / Math.PI, P50 = 2 * Math.sin(Math.PI * 0.5) / Math.PI;
  const tick = sound('watch_tick'), tock = sound('watch_tick', { tock: true }), off = sound('watch_off');
  if (!tick || !tock || !off) return 'each is one tone and nothing else';
  for (const t of [['tick', tick, G6], ['tock', tock, D6]]) {
    if (t[1].freq.length !== 1 || Math.abs(t[1].freq[0].value - t[2]) > 0.01) return 'the ' + t[0] + ' is at ' + JSON.stringify(t[1].freq);
    if (Math.abs(t[1].dur - 0.03) > 1e-6 || t[1].ends !== 0) return 'the ' + t[0] + ' lasts ' + t[1].dur;
    if (t[1].wave === null || Math.abs(t[1].wave - P12) > 1e-6) return 'the ' + t[0] + ' is not P12';
    if (Math.abs(t[1].level - 0.30) > 1e-9) return 'the ' + t[0] + ' plays at ' + t[1].level;
  }
  if (Math.abs(tick.freq[0].value / tock.freq[0].value - Math.pow(2, 5 / 12)) > 1e-6) return 'not a fourth apart';
  if (off.wave === null || Math.abs(off.wave - P50) > 1e-6) return 'watch_off is not P50';
  if (off.freq.length !== 2 || off.freq[0].value !== 220 || off.freq[1].value !== 880 || off.freq[1].type !== 'exponentialRampToValueAtTime') {
    return 'watch_off sweeps ' + JSON.stringify(off.freq);
  }
  if (Math.abs(off.freq[1].time - off.freq[0].time - 0.2) > 1e-6 || Math.abs(off.dur - 0.2) > 1e-6) return 'watch_off lasts ' + off.dur;
  return Math.abs(off.level - 0.30) < 1e-9 && I.levelOf('watch_tick') === I.levelOf('urgent_tick');
});

check('while a watch runs watch_tick plays every half second, tick and tock in turn and the first at once: six in its 3 s, and none after them however late power:end comes', function () {
  const env = inPlay();
  const ctx = env.audio.contexts[0];
  const t0 = ctx.currentTime;
  const n0 = nodeCount(env);
  emit(env, 'power:start', WATCH_ON);
  run(env, 180);
  // The music stands still, so the only oscillators made in these 3 s are the ticks.
  const ticks = createdSince(env, n0).filter(function (n) { return n.kind === 'oscillator'; });
  if (ticks.length !== 6 || played(env, 'watch_tick') !== 6) return ticks.length + ' notes, ' + played(env, 'watch_tick') + ' watch_tick in 3 s';
  // The first on the first frame after power:start (1/60 s, and the 3 ms lead of every sound effect),
  // the others exactly half a second apart.
  for (let k = 0; k < 6; k++) {
    const at = ticks[k].startTime - t0;
    if (Math.abs(at - (0.5 * k + 1 / 60 + 0.003)) > 1e-6) return 'tick ' + k + ' at ' + at.toFixed(4) + ' s';
    const want = k % 2 === 0 ? G6 : D6;
    if (Math.abs(ticks[k].frequency.events[0].value - want) > 0.01) return 'tick ' + k + ' is at ' + ticks[k].frequency.events[0].value + ' Hz';
  }
  // A machine whose simulation runs behind the clock: one more second before power:end.
  run(env, 60);
  if (played(env, 'watch_tick') !== 6) return 'a tick after the watch\'s 3 s';
  if (played(env, 'watch_off') !== 0) return 'watch_off before power:end';
  emit(env, 'power:end', WATCH_END);
  const log = Array.prototype.slice.call(env.TG.Audio._internals.sfxLog);
  if (log[log.length - 1] !== 'watch_off' || played(env, 'watch_off') !== 1) return 'power:end played ' + log.slice(6).join(',');
  run(env, 120);
  return (played(env, 'watch_tick') === 6 && played(env, 'watch_off') === 1) || 'a tick after power:end';
});

check('the watch\'s tick takes no voice from a more important sound: with three such voices busy it is not played, like the urgent tick', function () {
  const env = inPlay();
  const a = playVoice(env, 'boss_rumble'), b = playVoice(env, 'fall'), c = playVoice(env, 'slow_on');
  if (!a || !b || !c) return 'voice gains not found';
  emit(env, 'power:start', WATCH_ON);
  run(env, 12);                                   // 0.2 s: the three are still sounding
  if (played(env, 'watch_tick')) return 'the tick played over three busy voices';
  if (fadedToZero(a) || fadedToZero(b) || fadedToZero(c)) return 'a voice was taken over';
  run(env, 60);                                   // slow_on has ended: the tock at 0.5 s and the tick at 1 s have a voice
  return played(env, 'watch_tick') === 2 || played(env, 'watch_tick') + ' ticks in the next second';
});

check('a watch loses no music: no note starts while it runs, and after power:end the loop goes on with the first step that had not sounded at power:start', function () {
  const ref = unlocked();
  const rf = nodeCount(ref);
  ref.TG.Audio.music('level1');
  run(ref, 60 * 6);
  const want = groups(musicNotes(ref, createdSince(ref, rf)));

  const env = unlocked();
  const I = env.TG.Audio._internals;
  const f0 = nodeCount(env);
  env.TG.Audio.music('level1');
  run(env, 97);   // part-way between two steps
  const T = env.audio.contexts[0].currentTime;
  emit(env, 'power:start', WATCH_ON);
  const before = musicNotes(env, createdSince(env, f0)).filter(function (n) { return n.startTime <= T; });
  const held = I.sequencer('loop');
  if (!held.playing || !held.paused || held.name !== 'level1') return 'the loop under a watch: ' + JSON.stringify(held);
  const f1 = nodeCount(env);
  run(env, 180);
  if (musicSince(env, f1) !== 0) return musicSince(env, f1) + ' music notes started under the watch';
  if (I.sequencer('loop').step !== held.step) return 'the position moved under the watch';
  if (env.audio.suspends !== 0) return 'the watch called suspend()';
  emit(env, 'power:end', WATCH_END);
  if (I.sequencer('loop').paused || I.sequencer('loop').step !== held.step) return 'after power:end: ' + JSON.stringify(I.sequencer('loop'));
  run(env, 60 * 3);
  const got = groups(before).concat(groups(musicNotes(env, createdSince(env, f1))));
  const n = Math.min(got.length, want.length, 60);
  if (n < 40) return 'only ' + n + ' note groups';
  for (let i = 0; i < n; i++) if (got[i] !== want[i]) return 'group ' + i + ' is ' + got[i] + ', expected ' + want[i];
  return env.audio.resumes === 0 && cancelledGains(env).length === 0;
});

check('a watch and the Hourglass: the music stands still at the Hourglass tempo and goes on at it; a second watch while one runs starts the ticks again and one power:end ends it', function () {
  const env = inPlay();
  const I = env.TG.Audio._internals;
  emit(env, 'power:start', { power: 'hourglass', duration: 6 });
  run(env, 30);
  I.sfxLog.length = 0;
  emit(env, 'power:start', WATCH_ON);
  run(env, 90);
  if (played(env, 'watch_tick') !== 3) return played(env, 'watch_tick') + ' ticks in the first 1.5 s';
  const f = nodeCount(env);
  emit(env, 'power:start', WATCH_ON);
  run(env, 180);
  if (played(env, 'watch_tick') !== 9) return played(env, 'watch_tick') + ' ticks after a second watch, 9 expected';
  const first = createdSince(env, f).filter(function (n) { return n.kind === 'oscillator'; })[0];
  if (Math.abs(first.frequency.events[0].value - G6) > 0.01) return 'the second watch does not start on the tick';
  if (musicSince(env, f) !== 0 || !I.sequencer('loop').paused) return 'the music moved under the second watch';
  if (I.tempoScale() !== 0.75) return 'the watch changed the tempo scale to ' + I.tempoScale();
  emit(env, 'power:end', WATCH_END);
  run(env, 60);
  if (I.sequencer('loop').paused || musicSince(env, f) === 0) return 'the music did not go on after power:end';
  return (I.tempoScale() === 0.75 && played(env, 'watch_tick') === 9 && played(env, 'slow_off') === 0) || 'after the watch: tempo scale ' + I.tempoScale();
});

check('on the pause screen the watch\'s tick waits and the music stays still; back in play the ticks go on and the music still waits for power:end', function () {
  const env = inPlay();
  const I = env.TG.Audio._internals;
  emit(env, 'power:start', WATCH_ON);
  run(env, 45);                                   // 0.75 s: the tick and the tock
  if (played(env, 'watch_tick') !== 2) return played(env, 'watch_tick') + ' ticks before the pause';
  const f = nodeCount(env);
  emit(env, 'screen:change', { from: 'playing', to: 'paused', data: null });
  run(env, 60 * 4);
  if (played(env, 'watch_tick') !== 2) return 'a tick on the pause screen';
  emit(env, 'screen:change', { from: 'paused', to: 'playing', data: null });
  if (!I.sequencer('loop').paused) return 'leaving the pause screen restarted the music under a watch';
  run(env, 135);                                  // the other 2.25 s: four more
  if (played(env, 'watch_tick') !== 6) return played(env, 'watch_tick') + ' ticks in all, 6 expected';
  if (musicSince(env, f) !== 0) return 'music notes started before power:end';
  emit(env, 'power:end', WATCH_END);
  run(env, 60);
  return (!I.sequencer('loop').paused && musicSince(env, f) > 0 && played(env, 'pause') === 2) || 'the music did not go on after power:end';
});

check('a jingle that is playing when a watch starts stands still with the loop, and after the watch the loop is ducked again for the rest of it', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  emit(env, 'screen:change', { from: 'howToPlay', to: 'playing', data: null });
  emit(env, 'level:start', { levelId: 2, difficulty: 'medium', name: 'X', continued: false, music: { level: 'level1', boss: 'boss1' } });
  run(env, 60);   // 1 s into the 3.2 s ready jingle
  emit(env, 'power:start', WATCH_ON);
  const once = I.sequencer('once');
  if (!once.playing || !once.paused) return 'the jingle under a watch: ' + JSON.stringify(once);
  const f = nodeCount(env);
  run(env, 180);
  const bus = I.graph().musicBus;
  const jingleNotes = createdSince(env, f).filter(function (n) {
    return (n.kind === 'oscillator' || n.kind === 'bufferSource') && n.connections[0] && n.connections[0].connections[0] &&
      n.connections[0].connections[0].connections.indexOf(bus) !== -1;
  });
  if (jingleNotes.length) return jingleNotes.length + ' jingle notes under the watch';
  emit(env, 'power:end', WATCH_END);
  const ctx = env.audio.contexts[0];
  const ev = I.graph().duck.gain.events;
  const tail = ev.slice(ev.map(function (e) { return e.type; }).lastIndexOf('cancelAndHoldAtTime'));
  const hold = tail.filter(function (e) { return e.type === 'linearRampToValueAtTime' && e.value === I.DUCK; });
  const up = tail.filter(function (e) { return e.type === 'linearRampToValueAtTime' && e.value === 1; })[0];
  if (hold.length < 2 || !up) return 'not ducked again: ' + JSON.stringify(tail);
  const rest = hold[hold.length - 1].time - ctx.currentTime;
  if (!(rest > 1.8 && rest < 2.4)) return 'ducked for ' + rest.toFixed(2) + ' s, expected about 2.2';
  return !I.sequencer('once').paused && I.sequencer('once').step === once.step;
});

check('a watch that ends with no power:end (RESTART FROM CHECKPOINT, game over and a continue, the arena, QUIT) stops ticking, plays no watch_off and leaves no music standing', function () {
  const start = { levelId: 2, difficulty: 'medium', name: 'X', continued: true, music: { level: 'level1', boss: 'boss1' } };
  const enter = { index: 0, name: 'A', stage: '2-1', palette: 'day', music: { transpose: 0, tempo: 150, keyOk: { root: 0, mode: 'major' } } };
  const again = [['game:continue', { checkpoint: 0, continues: 1, assist: 0.85 }], ['level:start', start], ['section:enter', enter]];
  const change = function (from, to) { return ['screen:change', { from: from, to: to, data: null }]; };
  const cases = [
    // [what, the events as js/game.js emits them, the loop that plays afterwards (null: none)]
    ['RESTART FROM CHECKPOINT', [change('playing', 'paused'), change('paused', 'playing')].concat(again), 'level1'],
    ['game over', [change('playing', 'lifeLost'), change('lifeLost', 'gameOver')], 'gameover'],
    ['game over and a continue', [change('playing', 'lifeLost'), change('lifeLost', 'gameOver'), change('gameOver', 'playing')].concat(again), 'level1'],
    ['the arena', [change('playing', 'bossIntro')], null],
    ['the arena and the fight', [change('playing', 'bossIntro'), change('bossIntro', 'boss')], 'boss1'],
    ['QUIT', [change('playing', 'paused'), change('paused', 'results')], 'results']
  ];
  const bad = [];
  cases.forEach(function (c) {
    const env = inPlay();
    const I = env.TG.Audio._internals;
    emit(env, 'power:start', WATCH_ON);
    run(env, 20);
    if (played(env, 'watch_tick') !== 1) bad.push(c[0] + ': ' + played(env, 'watch_tick') + ' ticks at the start');
    c[1].forEach(function (e) { emit(env, e[0], e[1]); });
    const f = nodeCount(env);
    I.sfxLog.length = 0;
    run(env, 60 * 4);
    if (played(env, 'watch_tick')) bad.push(c[0] + ': ' + played(env, 'watch_tick') + ' ticks afterwards');
    if (played(env, 'watch_off')) bad.push(c[0] + ': watch_off');
    const loop = I.sequencer('loop');
    if (c[2] === null) {
      if (loop.playing || musicSince(env, f)) bad.push(c[0] + ': music plays: ' + JSON.stringify(loop));
    } else if (loop.name !== c[2] || loop.paused || !musicSince(env, f)) {
      bad.push(c[0] + ': ' + JSON.stringify(loop) + ' with ' + musicSince(env, f) + ' notes, ' + c[2] + ' expected');
    }
    if (I.sequencer('once').paused) bad.push(c[0] + ': a jingle is left standing');
    if (env.warnings.length || env.errors.length) bad.push(c[0] + ': console: ' + env.warnings.concat(env.errors)[0]);
  });
  return bad.length ? bad.join('; ') : true;
});

check('a watch goes on through the lifeLost screen, started on it or just before it: it keeps ticking with the music still, and power:end back in play restarts the level loop', function () {
  // A crate word finished on the lifeLost screen starts its watch there; a hit in the step that
  // finished the word changes the screen just after power:start (LEVEL2 6.3).
  for (const first of ['lifeLost', 'watch']) {
    const env = inPlay();
    const I = env.TG.Audio._internals;
    if (first === 'lifeLost') emit(env, 'screen:change', { from: 'playing', to: 'lifeLost', data: null });
    emit(env, 'power:start', WATCH_ON);
    if (first === 'watch') emit(env, 'screen:change', { from: 'playing', to: 'lifeLost', data: null });
    const f = nodeCount(env);
    run(env, 60);
    emit(env, 'screen:change', { from: 'lifeLost', to: 'playing', data: null });
    run(env, 120);
    if (played(env, 'watch_tick') !== 6) return first + ' first: ' + played(env, 'watch_tick') + ' ticks, 6 expected';
    if (musicSince(env, f) !== 0 || !I.sequencer('loop').paused) return first + ' first: the music moved under the watch';
    emit(env, 'power:end', WATCH_END);
    run(env, 60);
    const loop = I.sequencer('loop');
    if (loop.name !== 'level1' || loop.paused || musicSince(env, f) === 0) return first + ' first: ' + JSON.stringify(loop);
  }
  return true;
});

check('the watch\'s events before unlock, with no AudioContext, and with music and sound effects off do not throw or write to the console', function () {
  const flow = [
    ['screen:change', { from: 'howToPlay', to: 'playing', data: null }],
    ['level:start', { levelId: 2, difficulty: 'medium', name: 'X', continued: false, music: { level: 'level1', boss: 'boss1' } }],
    ['pickup:power', { power: 'watch', x: 0, y: 0 }], ['power:start', WATCH_ON], ['power:start', { power: 'watch' }],
    ['screen:change', { from: 'playing', to: 'paused', data: null }], ['screen:change', { from: 'paused', to: 'playing', data: null }],
    ['power:end', WATCH_END], ['power:end', WATCH_END],
    ['power:start', WATCH_ON], ['screen:change', { from: 'playing', to: 'bossIntro', data: null }]
  ];
  const bad = [];
  ['locked', 'none', 'off'].forEach(function (mode) {
    const env = mode === 'off' ? unlocked() : stubs.load({ files: FILES });
    if (mode === 'none') {
      delete env.window.AudioContext;
      delete env.window.webkitAudioContext;
    }
    if (mode !== 'off') {
      env.TG.Events.clear();
      env.TG.Audio.init();
    } else {
      env.TG.Audio.setEnabled('music', false);
      env.TG.Audio.setEnabled('sfx', false);
    }
    const starts = env.audio.starts;
    flow.forEach(function (e) {
      emit(env, e[0], e[1]);
      for (let i = 0; i < 40; i++) env.TG.Audio.update(1 / 60);
    });
    if (env.audio.starts !== starts) bad.push(mode + ': ' + (env.audio.starts - starts) + ' sources started');
    if (env.warnings.length || env.errors.length) bad.push(mode + ': ' + env.warnings.concat(env.errors)[0]);
  });
  return bad.length ? bad.join('; ') : true;
});

check('type:hit with complete true and kind finisher (or core) plays word_clear; index > 0 plays key_ok with that step', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  emit(env, 'type:hit', { target: {}, id: 9, kind: 'finisher', ch: 'y', index: 9, length: 10, complete: true, x: 0, y: 0 });
  if (I.sfxLog[I.sfxLog.length - 1] !== 'word_clear') return 'finisher: ' + I.sfxLog[I.sfxLog.length - 1];
  emit(env, 'type:hit', { target: {}, id: 9, kind: 'core', ch: 'y', index: 6, length: 7, complete: true, x: 0, y: 0 });
  if (I.sfxLog[I.sfxLog.length - 1] !== 'word_clear') return 'core';
  const from = nodeCount(env);
  emit(env, 'type:hit', { target: {}, id: 9, kind: 'hoppet', ch: 'r', index: 2, length: 4, complete: false, x: 0, y: 0 });
  if (I.sfxLog[I.sfxLog.length - 1] !== 'key_ok') return 'hit';
  const osc = createdSince(env, from).filter(function (n) { return n.kind === 'oscillator'; })[0];
  if (Math.abs(osc.frequency.events[0].value - 523.2511306011972 * Math.pow(2, 4 / 12)) > 0.01) return 'step 2 pitch';
  const len = I.sfxLog.length;
  emit(env, 'type:hit', { target: {}, id: 9, kind: 'hoppet', ch: 'g', index: 3, length: 4, complete: true, x: 0, y: 0 });
  return I.sfxLog.length === len;   // a completed threat word: word_clear comes from word:clear
});

check('word:clear plays word_clear (typed only), the family sound, deflect for rocks and crate_break 0.3 s later for crates', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  function clear(extra) {
    I.sfxLog.length = 0;
    emit(env, 'word:clear', Object.assign({ id: 1, type: 'threat', kind: 'hoppet', family: 'pop', from: 'right', word: 'frog',
      x: 0, y: 0, w: 16, h: 16, score: 100, mult: 1, clean: true, quick: false, close: false, cause: 'typed', power: null }, extra));
    run(env, 60);   // a delayed sound starts from TG.Audio.update
    return Array.prototype.slice.call(I.sfxLog);
  }
  if (!same(clear({}), ['word_clear', 'clear_pop'])) return 'pop: ' + clear({});
  if (!same(clear({ family: 'twang', kind: 'dawdle' }), ['word_clear', 'clear_twang'])) return 'twang';
  if (!same(clear({ family: 'bonk', kind: 'truffle' }), ['word_clear', 'clear_bonk'])) return 'bonk';
  if (!same(clear({ family: 'crunch', kind: 'boulder' }), ['word_clear', 'clear_crunch'])) return 'crunch';
  if (!same(clear({ family: 'pop', kind: 'rock' }), ['word_clear', 'deflect'])) return 'rock';
  if (!same(clear({ cause: 'blast' }), ['clear_pop'])) return 'blast';
  const now = env.audio.contexts[0].currentTime;
  const from = nodeCount(env);
  const crate = clear({ type: 'crate', kind: 'crate', power: 'shield' });
  if (!same(crate, ['word_clear', 'clear_pop', 'crate_break'])) return 'crate: ' + crate;
  const crateNodes = createdSince(env, from).filter(function (n) { return n.kind === 'bufferSource'; });
  const delayed = crateNodes.filter(function (n) { return Math.abs(n.startTime - (now + 0.3)) < 1e-6; });
  return delayed.length === 1;
});

check('the screen flow drives the tracks: boot silence, title loop, gameover once, results loop, boss track at 168 then 184 in phase 3', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  emit(env, 'screen:change', { from: null, to: 'boot', data: null });
  if (I.sequencer('loop').playing) return 'music on boot';
  emit(env, 'screen:change', { from: 'boot', to: 'title', data: null });
  run(env, 30);
  if (I.sequencer('loop').name !== 'title') return 'no title loop';
  const titleStep = I.sequencer('loop').step;
  emit(env, 'screen:change', { from: 'title', to: 'difficultySelect', data: null });
  emit(env, 'screen:change', { from: 'difficultySelect', to: 'howToPlay', data: null });
  if (I.sequencer('loop').step < titleStep) return 'the title loop restarted between menu screens';
  emit(env, 'screen:change', { from: 'howToPlay', to: 'playing', data: null });
  emit(env, 'level:start', { levelId: 1, difficulty: 'medium', name: 'X', continued: false, music: { level: 'level1', boss: 'boss1' } });
  emit(env, 'section:enter', { index: 0, name: 'A', stage: '1-1', palette: 'day', music: { transpose: 0, tempo: 150, keyOk: { root: 0, mode: 'major' } } });
  run(env, 30);
  if (I.sequencer('loop').name !== 'level1') return 'no level track on playing';
  emit(env, 'screen:change', { from: 'playing', to: 'lifeLost', data: null });
  emit(env, 'screen:change', { from: 'lifeLost', to: 'gameOver', data: null });
  emit(env, 'game:over', { checkpoint: 0, score: 0 });
  run(env, 30);
  if (I.sequencer('loop').name !== 'gameover') return 'no gameover track';
  emit(env, 'screen:change', { from: 'gameOver', to: 'playing', data: null });
  emit(env, 'game:continue', { checkpoint: 0, continues: 1, assist: 0.85 });
  emit(env, 'level:start', { levelId: 1, difficulty: 'medium', name: 'X', continued: true, music: { level: 'level1', boss: 'boss1' } });
  emit(env, 'section:enter', { index: 0, name: 'A', stage: '1-1', palette: 'day', music: { transpose: 0, tempo: 150, keyOk: { root: 0, mode: 'major' } } });
  run(env, 30);
  if (I.sequencer('loop').name !== 'level1') return 'no level track after continue';
  emit(env, 'boss:warning', {});
  if (!I.sequencer('loop').bassOnly) return 'not bass only before the boss';
  emit(env, 'checkpoint', { index: 3, x: 14080, wpm: 20, accuracy: 0.9, bonus: 0, lives: 3 });
  emit(env, 'screen:change', { from: 'playing', to: 'bossIntro', data: null });
  emit(env, 'boss:enter', {});
  emit(env, 'section:enter', { index: 3, name: 'B', stage: '1-B', palette: 'dusk', music: { transpose: 0, tempo: 168, keyOk: { root: 4, mode: 'minor' } } });
  if (I.sequencer('loop').playing) return 'the level track kept playing in the boss intro';
  if (I.sequencer('loop').bassOnly) return 'bass only was not turned off at the boss intro';
  emit(env, 'screen:change', { from: 'bossIntro', to: 'boss', data: null });
  run(env, 30);
  const boss = I.sequencer('loop');
  if (boss.name !== 'boss1' || boss.bpm !== 168 || boss.p2Octave !== 0) return 'boss track: ' + JSON.stringify(boss);
  emit(env, 'boss:phase', { phase: 3 });
  run(env, 60 * 3);   // one bar at 168 BPM is 1.43 s
  const phase3 = I.sequencer('loop');
  if (phase3.bpm !== 184 || phase3.p2Octave !== 12) return 'phase 3: ' + JSON.stringify(phase3);
  emit(env, 'boss:defeat', { x: 0, y: 0 });
  emit(env, 'screen:change', { from: 'boss', to: 'levelComplete', data: null });
  const s0 = env.audio.starts;
  run(env, 30);   // 0.5 s: only the defeat sound, victory has not started
  const defeatStarts = env.audio.starts - s0;
  run(env, 90);   // 2 s in: victory is playing
  const v = I.sequencer('loop');
  if (v.name !== 'victory' || !v.playing) return 'victory not playing: ' + JSON.stringify(v);
  if (!(env.audio.starts - s0 > defeatStarts)) return 'victory made no notes';
  emit(env, 'screen:change', { from: 'levelComplete', to: 'results', data: null });
  run(env, 60 * 11);   // the rest of the fanfare, then the results loop
  if (I.sequencer('loop').name !== 'results') return 'no results loop';
  emit(env, 'screen:change', { from: 'results', to: 'highScoreEntry', data: null });
  const resultsStep = I.sequencer('loop').step;
  run(env, 30);
  if (I.sequencer('loop').name !== 'results' || I.sequencer('loop').step < resultsStep) return 'results loop restarted';
  emit(env, 'screen:change', { from: 'highScoreEntry', to: 'title', data: null });
  run(env, 10);
  return I.sequencer('loop').name === 'title' && env.errors.length === 0;
});

check('game over during the Hourglass and after the boss warning plays the game over tune in full, at its own tempo, and stops a jingle', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  emit(env, 'screen:change', { from: 'howToPlay', to: 'playing', data: null });
  emit(env, 'level:start', { levelId: 1, difficulty: 'medium', name: 'X', continued: false, music: { level: 'level1', boss: 'boss1' } });
  run(env, 30);
  emit(env, 'power:start', { power: 'hourglass', duration: 6 });
  emit(env, 'boss:warning', {});
  emit(env, 'checkpoint', { index: 3, x: 14080, wpm: 20, accuracy: 0.9, bonus: 0, lives: 1 });   // a jingle is playing
  emit(env, 'screen:change', { from: 'playing', to: 'lifeLost', data: null });
  emit(env, 'screen:change', { from: 'lifeLost', to: 'gameOver', data: null });
  const s = I.sequencer('loop');
  if (s.name !== 'gameover' || s.bassOnly || I.tempoScale() !== 1) return 'loop ' + JSON.stringify(s) + ', tempo scale ' + I.tempoScale();
  if (I.sequencer('once').playing) return 'the jingle kept playing into game over';
  const from = nodeCount(env);
  run(env, 60 * 3);
  const pulses = createdSince(env, from).filter(function (n) { return n.kind === 'oscillator' && n.periodicWave; });
  if (pulses.length === 0) return 'only the bass played';
  const duck = I.graph().duck.gain;
  const lastDuck = duck.events[duck.events.length - 1];
  return (lastDuck.value === 1) || 'the loop stayed ducked: ' + JSON.stringify(lastDuck);
});

check('a screen that leaves play (results, title) resets the Hourglass tempo and bass-only, so menu music is normal', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  emit(env, 'screen:change', { from: 'howToPlay', to: 'playing', data: null });
  emit(env, 'level:start', { levelId: 1, difficulty: 'medium', name: 'X', continued: false, music: { level: 'level1', boss: 'boss1' } });
  emit(env, 'power:start', { power: 'hourglass', duration: 6 });
  emit(env, 'screen:change', { from: 'playing', to: 'paused', data: null });
  if (I.tempoScale() !== 0.75) return 'pause changed the tempo scale';
  emit(env, 'screen:change', { from: 'paused', to: 'results', data: null });
  if (I.tempoScale() !== 1 || I.sequencer('loop').name !== 'results') return 'results: ' + I.tempoScale();
  env.TG.Audio.setBassOnly(true);
  emit(env, 'screen:change', { from: 'results', to: 'title', data: null });
  return !I.sequencer('loop').bassOnly && I.sequencer('loop').name === 'title';
});

check('a jingle always plays once, even when it is given a looping track', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  env.TG.Audio.jingle('results');
  run(env, Math.ceil((I.trackLength('results') + 1) * 60));
  const s = I.sequencer('once');
  const s0 = env.audio.starts;
  run(env, 120);
  return !s.playing && env.audio.starts === s0;
});

check('a jingle paused part-way ducks the loop again for the rest of its length when play resumes', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  emit(env, 'screen:change', { from: 'howToPlay', to: 'playing', data: null });
  emit(env, 'level:start', { levelId: 1, difficulty: 'medium', name: 'X', continued: false, music: { level: 'level1', boss: 'boss1' } });
  run(env, 60);   // 1 s into the 3.2 s ready jingle
  emit(env, 'screen:change', { from: 'playing', to: 'paused', data: null });
  run(env, 60 * 5);   // longer than the jingle
  emit(env, 'screen:change', { from: 'paused', to: 'playing', data: null });
  const ctx = env.audio.contexts[0];
  const ev = I.graph().duck.gain.events;
  const tail = ev.slice(ev.map(function (e) { return e.type; }).lastIndexOf('cancelAndHoldAtTime'));
  const hold = tail.filter(function (e) { return e.type === 'linearRampToValueAtTime' && e.value === I.DUCK; });
  const up = tail.filter(function (e) { return e.type === 'linearRampToValueAtTime' && e.value === 1; })[0];
  if (hold.length < 2 || !up) return 'not ducked again: ' + JSON.stringify(tail);
  const rest = hold[hold.length - 1].time - ctx.currentTime;
  return (rest > 1.8 && rest < 2.4) || 'ducked for ' + rest.toFixed(2) + ' s, expected about 2.2';
});

check('sound effect voice gains do not pile up: after 200 sounds at most three voice gains feed the sound effect bus', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  const names = ['key_ok', 'warn', 'jump', 'word_clear', 'key_bad'];
  for (let i = 0; i < 200; i++) {
    env.TG.Audio.sfx(names[i % names.length], { step: i % 10, pan: i % 2 ? 0.7 : 0 });
    run(env, 3);
  }
  run(env, 60);
  const bus = I.graph().sfxBus;
  const feeding = env.audio.contexts[0].created.filter(function (n) { return n.connections.indexOf(bus) !== -1; });
  return feeding.length <= 3 || feeding.length + ' nodes still feed the bus';
});

check('the victory fanfare plays to its end on the results screen, then the results loop starts; leaving results earlier starts the next loop at once', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  emit(env, 'boss:defeat', { x: 0, y: 0 });
  emit(env, 'screen:change', { from: 'boss', to: 'levelComplete', data: null });
  run(env, 60 * 4);   // LEVEL_COMPLETE_TIME
  emit(env, 'screen:change', { from: 'levelComplete', to: 'results', data: null });
  if (I.sequencer('loop').name !== 'victory' || !I.sequencer('loop').playing) return 'the fanfare was cut: ' + JSON.stringify(I.sequencer('loop'));
  emit(env, 'screen:change', { from: 'results', to: 'highScoreEntry', data: null });
  if (I.sequencer('loop').name !== 'victory') return 'high score entry cut the fanfare';
  const victoryNotes = [];
  let resultsFirst = Infinity;
  for (let i = 0; i < 60 * 10; i++) {
    const from = nodeCount(env);
    run(env, 1);
    const s = I.sequencer('loop');
    createdSince(env, from).forEach(function (n) {
      if (n.kind !== 'oscillator' && n.kind !== 'bufferSource') return;
      if (s.name === 'results') resultsFirst = Math.min(resultsFirst, n.startTime);
      else victoryNotes.push(n.startTime + (n.stopTime - n.startTime));
    });
  }
  if (I.sequencer('loop').name !== 'results' || !I.sequencer('loop').playing) return 'results loop did not start';
  const lastVictory = Math.max.apply(null, victoryNotes);
  if (!(resultsFirst >= lastVictory - 0.03)) return 'results started at ' + resultsFirst + ' while the fanfare sounded until ' + lastVictory;
  // Leaving results while a fanfare still plays starts the title loop at once.
  const env2 = unlocked();
  const I2 = env2.TG.Audio._internals;
  emit(env2, 'boss:defeat', { x: 0, y: 0 });
  emit(env2, 'screen:change', { from: 'boss', to: 'levelComplete', data: null });
  run(env2, 60 * 4);
  emit(env2, 'screen:change', { from: 'levelComplete', to: 'results', data: null });
  run(env2, 60);
  emit(env2, 'screen:change', { from: 'results', to: 'title', data: null });
  run(env2, 60 * 10);
  return I2.sequencer('loop').name === 'title' || 'after title: ' + I2.sequencer('loop').name;
});

check('ending a run from game over (Esc) lets the game over tune finish before the results loop', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  emit(env, 'screen:change', { from: 'lifeLost', to: 'gameOver', data: null });
  run(env, 60);
  emit(env, 'screen:change', { from: 'gameOver', to: 'results', data: null });
  if (I.sequencer('loop').name !== 'gameover') return 'the game over tune was cut';
  run(env, 60 * 7);
  return I.sequencer('loop').name === 'results' && I.sequencer('loop').playing;
});

check('a boss track started after a continue in phase 3 uses 184 BPM and pulse 2 up an octave', function () {
  const env = unlocked();
  env.TG.Game = { state: { screen: 'bossIntro', entities: [], boss: { phase: 3 } } };
  emit(env, 'level:start', { levelId: 1, difficulty: 'medium', name: 'X', continued: true, music: { level: 'level1', boss: 'boss1' } });
  emit(env, 'section:enter', { index: 3, name: 'B', stage: '1-B', palette: 'dusk', music: { transpose: 0, tempo: 168, keyOk: { root: 4, mode: 'minor' } } });
  emit(env, 'screen:change', { from: 'bossIntro', to: 'boss', data: null });
  const s = env.TG.Audio._internals.sequencer('loop');
  return s.name === 'boss1' && s.bpm === 184 && s.p2Octave === 12;
});

// LEVEL2 11.2. The arena's music as Level 1 has it, with a phase3 entry when one is given, up to the
// boss track playing. No second boss track exists yet, so boss1 plays with the phase3 values of the test.
function bossTrack(env, phase3) {
  const music = { transpose: 0, tempo: 168, keyOk: { root: 4, mode: 'minor' } };
  if (phase3 !== undefined) music.phase3 = phase3;
  emit(env, 'level:start', { levelId: 1, difficulty: 'medium', name: 'X', continued: true, music: { level: 'level1', boss: 'boss1' } });
  emit(env, 'section:enter', { index: 3, name: 'B', stage: '1-B', palette: 'dusk', music: music });
  emit(env, 'screen:change', { from: 'bossIntro', to: 'boss', data: null });
  run(env, 30);
  return env.TG.Audio._internals.sequencer('loop');
}

check('boss:phase 3 moves the boss track to the tempo and pulse 2 octave of the arena\'s music.phase3; where that is missing, or one of its values is, to 184 BPM and an octave up', function () {
  const cases = [
    // [phase3 in the arena's music, the tempo of phase 3, its pulse 2 octave]
    [undefined, 184, 12],
    [{ tempo: 176, p2Octave: 12 }, 176, 12],      // the values of LEVEL2 11.2
    [{ tempo: 200, p2Octave: 0 }, 200, 0],        // 0 is a value: pulse 2 stays where it is
    [{ tempo: 176 }, 176, 12],
    [{ p2Octave: 7 }, 184, 7],
    [{ tempo: 0, p2Octave: NaN }, 184, 12],
    [{ tempo: '176', p2Octave: '5' }, 184, 12],
    [null, 184, 12],
    ['fast', 184, 12]
  ];
  const bad = [];
  cases.forEach(function (c, i) {
    const env = unlocked();
    const I = env.TG.Audio._internals;
    const label = 'case ' + i + ' (' + String(JSON.stringify(c[0])) + ')';
    const before = bossTrack(env, c[0]);
    if (before.name !== 'boss1' || before.bpm !== 168 || before.p2Octave !== 0) {
      bad.push(label + ' before phase 3: ' + JSON.stringify(before));
      return;
    }
    emit(env, 'boss:phase', { phase: 2 });
    run(env, 60 * 3);   // one bar at 168 BPM is 1.43 s
    const two = I.sequencer('loop');
    if (two.bpm !== 168 || two.p2Octave !== 0) bad.push(label + ' phase 2 changed the track: ' + JSON.stringify(two));
    emit(env, 'boss:phase', { phase: 3 });
    run(env, 60 * 3);
    const three = I.sequencer('loop');
    if (three.bpm !== c[1] || three.p2Octave !== c[2]) bad.push(label + ' gave ' + three.bpm + ' BPM and octave ' + three.p2Octave);
    if (env.warnings.length || env.errors.length) bad.push(label + ' wrote to the console: ' + env.warnings.concat(env.errors).join('; '));
  });
  return bad.length ? bad.join('; ') : true;
});

check('a boss track started after a continue in phase 3 uses the arena\'s music.phase3 when the level has one', function () {
  const env = unlocked();
  env.TG.Game = { state: { screen: 'bossIntro', entities: [], boss: { phase: 3 } } };
  const s = bossTrack(env, { tempo: 176, p2Octave: 5 });
  return (s.name === 'boss1' && s.bpm === 176 && s.p2Octave === 5) || JSON.stringify(s);
});

check('the phase 3 values of one level are not carried into the next: a fresh run forgets them, and an arena without music.phase3 goes to 184 BPM and an octave up', function () {
  const arena = { index: 3, name: 'B', stage: '1-B', palette: 'dusk', music: { transpose: 0, tempo: 168, keyOk: { root: 4, mode: 'minor' } } };
  const bad = [];
  // With `sections` the next run sends section:enter as the game does; without, only level:start is heard.
  [true, false].forEach(function (sections) {
    const env = unlocked();
    const I = env.TG.Audio._internals;
    bossTrack(env, { tempo: 176, p2Octave: 5 });
    emit(env, 'boss:phase', { phase: 3 });
    run(env, 60 * 3);
    if (I.sequencer('loop').bpm !== 176 || I.sequencer('loop').p2Octave !== 5) {
      bad.push('the first level: ' + JSON.stringify(I.sequencer('loop')));
      return;
    }
    emit(env, 'screen:change', { from: 'boss', to: 'paused', data: null });
    emit(env, 'screen:change', { from: 'paused', to: 'results', data: null });
    emit(env, 'screen:change', { from: 'results', to: 'title', data: null });
    emit(env, 'screen:change', { from: 'title', to: 'difficultySelect', data: null });
    emit(env, 'screen:change', { from: 'difficultySelect', to: 'howToPlay', data: null });
    emit(env, 'screen:change', { from: 'howToPlay', to: 'playing', data: null });
    emit(env, 'level:start', { levelId: 1, difficulty: 'medium', name: 'X', continued: false, music: { level: 'level1', boss: 'boss1' } });
    if (sections) emit(env, 'section:enter', { index: 0, name: 'A', stage: '1-1', palette: 'day', music: { transpose: 0, tempo: 150, keyOk: { root: 0, mode: 'major' } } });
    run(env, 30);
    if (sections) emit(env, 'section:enter', arena);
    emit(env, 'screen:change', { from: 'playing', to: 'bossIntro', data: null });
    emit(env, 'screen:change', { from: 'bossIntro', to: 'boss', data: null });
    run(env, 30);
    emit(env, 'boss:phase', { phase: 3 });
    run(env, 60 * 3);
    const s = I.sequencer('loop');
    if (s.name !== 'boss1' || s.bpm !== 184 || s.p2Octave !== 12) bad.push((sections ? 'with' : 'without') + ' section:enter: ' + JSON.stringify(s));
  });
  return bad.length ? bad.join('; ') : true;
});

check('a section:enter whose music has no phase3 forgets the phase3 of the one before, with no fresh run between: boss:phase 3 then goes to 184 BPM and an octave up', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  bossTrack(env, { tempo: 176, p2Octave: 5 });
  // The same run goes on (bossTrack sends level:start with continued: true, which resets nothing) into
  // an arena whose music names no phase3.
  const before = bossTrack(env);
  if (before.name !== 'boss1' || before.bpm !== 168 || before.p2Octave !== 0) return 'before phase 3: ' + JSON.stringify(before);
  emit(env, 'boss:phase', { phase: 3 });
  run(env, 60 * 3);
  const s = I.sequencer('loop');
  return (s.name === 'boss1' && s.bpm === 184 && s.p2Octave === 12) || JSON.stringify(s);
});

check('the checkpoint event plays the checkpoint sound and jingle_checkpoint for index > 0 only', function () {
  const env = unlocked();
  const jingles = spyJingle(env);
  env.TG.Audio._internals.sfxLog.length = 0;
  emit(env, 'checkpoint', { index: 0, x: 96, wpm: 0, accuracy: 1, bonus: 0, lives: 4 });
  const none = jingles.length === 0 && env.TG.Audio._internals.sfxLog.length === 0;
  emit(env, 'checkpoint', { index: 1, x: 4096, wpm: 20, accuracy: 0.9, bonus: 500, lives: 4 });
  return none && same(jingles, ['jingle_checkpoint']) && same(Array.prototype.slice.call(env.TG.Audio._internals.sfxLog), ['checkpoint']);
});

check('the remaining event-to-sound mappings of CONTRACT 7.1 play the right sound', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  const table = [
    ['type:miss', { target: null, id: null, ch: 'x', expected: 'a', repeat: 1, x: 0, y: 0 }, 'key_bad'],
    ['target:lock', { target: {}, id: 1, kind: 'hoppet', x: 0, y: 0 }, 'lock_on'],
    ['target:release', { target: {}, id: 1, reason: 'backspace' }, 'lock_release'],
    ['target:release', { target: {}, id: 1, reason: 'auto' }, 'lock_release'],
    ['target:release', { target: {}, id: 1, reason: 'gone' }, null],
    ['target:release', { target: {}, id: 1, reason: 'screen' }, null],
    ['streak:change', { cleanRun: 3, mult: 2, previousMult: 1 }, 'streak'],
    ['streak:change', { cleanRun: 0, mult: 1, previousMult: 2 }, null],
    ['streak:milestone', { kind: 'keys', value: 25 }, 'streak'],
    ['hero:jump', { x: 0, y: 0 }, 'jump'],
    ['hero:land', { x: 0, y: 0 }, 'land'],
    ['hero:duck', { x: 0, y: 0 }, 'slide'],
    ['hazard:cue', { id: 'h1', kind: 'gap', action: 'jump', hold: false, sound: true, prompt: false }, 'cue_jump'],
    ['hazard:cue', { id: 'h2', kind: 'branch', action: 'duck', hold: false, sound: true, prompt: false }, 'cue_duck'],
    ['hazard:cue', { id: 'h1', kind: 'gap', action: 'jump', hold: false, sound: false, prompt: false }, null],
    ['pickup:ink', { x: 0, y: 0, ink: 1, inkTotal: 1 }, 'ink_drop'],
    ['pickup:power', { power: 'hourglass', x: 0, y: 0 }, 'power_get'],
    ['pickup:power', { power: 'quill', x: 0, y: 0 }, 'power_get'],
    ['pickup:power', { power: 'watch', x: 0, y: 0 }, 'power_get'],
    ['pickup:power', { power: 'blast', x: 0, y: 0 }, 'ink_blast'],
    ['pickup:power', { power: 'shield', x: 0, y: 0 }, null],
    ['shield:gain', { charges: 1, cause: 'crate' }, 'shield_up'],
    ['shield:break', { charges: 0, x: 0, y: 0 }, 'shield_break'],
    ['power:start', { power: 'hourglass', duration: 6 }, 'slow_on'],
    ['power:end', { power: 'hourglass' }, 'slow_off'],
    ['power:start', { power: 'quill', duration: 10 }, null],
    ['life:gain', { lives: 5, cause: 'cap' }, 'one_up'],
    ['life:lost', { lives: 3, cause: { type: 'threat', kind: 'hoppet', id: 1, from: 'right' } }, 'hurt'],
    ['life:lost', { lives: 3, cause: { type: 'fall' } }, null],
    ['hero:fall', { x: 0, gapId: 'h1' }, 'fall'],
    ['hero:rescue', { x: 0, y: 0 }, 'rescue'],
    ['attack:spawn', { id: 40, kind: 'shock', action: 'jump' }, 'boss_stomp'],
    ['attack:spawn', { id: 41, kind: 'pick', action: 'duck' }, null],
    ['boss:warning', {}, 'boss_rumble'],
    ['boss:enter', {}, 'boss_rumble'],
    ['boss:attack', { kind: 'pick', telegraph: 1 }, 'boss_telegraph'],
    ['boss:attack', { kind: 'rock', telegraph: 0 }, null],
    ['boss:throw', { kind: 'rock', x: 0, y: 0 }, 'boss_throw'],
    ['boss:weakclose', { completed: false }, 'boss_laugh'],
    ['boss:weakclose', { completed: true }, null],
    ['boss:hit', { health: 5, maxHealth: 6, phase: 1, x: 0, y: 0 }, 'boss_hit'],
    ['boss:finisher', { id: 1, word: 'meadow' }, 'boss_stun'],
    ['ui:move', {}, 'ui_move'],
    ['ui:select', {}, 'ui_select'],
    ['ui:back', {}, 'ui_back'],
    ['ui:tally', {}, 'tally_tick'],
    ['ui:stamp', { rank: 'A' }, 'stamp'],
    ['ui:count', { n: 5, high: false }, 'count_tick'],
    ['ui:count', { n: 2, high: true }, 'count_tick'],
    ['ui:letter', { index: 3 }, 'key_ok']
  ];
  const bad = [];
  table.forEach(function (row) {
    I.sfxLog.length = 0;
    emit(env, row[0], row[1]);
    run(env, 60);   // the power sound of a crate starts later, from TG.Audio.update
    const played = Array.prototype.slice.call(I.sfxLog);
    if (row[2] === null) {
      if (played.length) bad.push(row[0] + ' played ' + played.join(','));
    } else if (played[0] !== row[2]) {
      bad.push(row[0] + ' played ' + (played.join(',') || 'nothing') + ' instead of ' + row[2]);
    }
  });
  // boss:weakopen plays boss_laugh at once and boss_weak 0.3 s later
  I.sfxLog.length = 0;
  const now = env.audio.contexts[0].currentTime;
  const from = nodeCount(env);
  emit(env, 'boss:weakopen', { id: 1, word: 'monocle', window: 4 });
  run(env, 30);
  if (!same(Array.prototype.slice.call(I.sfxLog), ['boss_laugh', 'boss_weak'])) bad.push('weakopen: ' + I.sfxLog.join(','));
  const weak = createdSince(env, from).filter(function (n) { return n.kind === 'oscillator' && Math.abs(n.startTime - (now + 0.3)) < 1e-6; });
  if (weak.length !== 1) bad.push('boss_weak not 0.3 s later');
  // count_tick: higher pitch when high
  function countFreq(high) {
    const start = nodeCount(env);
    emit(env, 'ui:count', { n: 1, high: high });
    env.audio.advance(1);
    return createdSince(env, start).filter(function (n) { return n.kind === 'oscillator'; })[0].frequency.events[0].value;
  }
  if (!(countFreq(true) > countFreq(false))) bad.push('count_tick high is not higher');
  return bad.length ? bad.join('; ') : true;
});

check('with AudioContext removed from the window, init, unlock, sfx, music, jingle, suspend, resume and update do not throw', function () {
  const env = stubs.load({ files: FILES });
  delete env.window.AudioContext;
  delete env.window.webkitAudioContext;
  env.TG.Events.clear();
  const A = env.TG.Audio;
  A.init();
  const r = A.unlock();
  A.sfx('key_ok', { step: 1 });
  A.music('title');
  A.jingle('jingle_ready');
  A.setTempoScale(0.75);
  A.setBassOnly(true);
  A.setEnabled('music', false);
  A.suspend();
  A.resume();
  A.update(1 / 60);
  emit(env, 'screen:change', { from: 'boot', to: 'title', data: null });
  emit(env, 'level:start', { levelId: 1, difficulty: 'easy', name: 'X', continued: false, music: { level: 'level1', boss: 'boss1' } });
  emit(env, 'boss:defeat', { x: 0, y: 0 });
  emit(env, 'word:clear', { id: 1, type: 'crate', kind: 'crate', family: 'pop', from: 'right', word: 'frog', x: 0, y: 0, w: 16, h: 32, score: 0, mult: 1, clean: true, quick: false, close: false, cause: 'typed', power: 'shield' });
  A.update(1 / 60);
  return r === false && A.isUnlocked() === false && env.audio.contexts.length === 0 && env.errors.length === 0;
});

check('an AudioContext constructor that throws leaves every function a no-op', function () {
  const env = stubs.load({ files: FILES });
  env.window.AudioContext = function () { throw new Error('blocked'); };
  env.window.webkitAudioContext = undefined;
  env.TG.Events.clear();
  const A = env.TG.Audio;
  A.init();
  const r = A.unlock();
  A.sfx('jump');
  A.music('title');
  A.update(1 / 60);
  return r === false && A.unlock() === false && env.errors.length === 0;
});

// Sample payloads for every event of section 8, by field name.
function samplePayload(name, fields) {
  const byName = {
    target: {}, id: 1, kind: 'hoppet', ch: 'a', index: 1, length: 4, complete: false, x: 100, y: 184, w: 16, h: 16,
    expected: 'b', repeat: 1, reason: 'backspace', cleanRun: 3, mult: 2, previousMult: 1, value: 25,
    from: 'title', to: 'playing', data: null, levelId: 1, difficulty: 'medium', continued: false,
    type: 'threat', family: 'pop', word: 'frog', score: 100, clean: true, quick: false, close: false, cause: 'typed',
    power: 'hourglass', points: 100, total: 100, lives: 3, charges: 1, duration: 6, assist: 1, checkpoint: 1,
    continues: 1, result: {}, gapId: 'h1', ink: 1, inkTotal: 1, entity: {}, typed: 2, action: 'jump', hold: false,
    sound: true, prompt: false, stage: '1-1', palette: 'day', wpm: 20, accuracy: 0.9, bonus: 0, state: 'volley',
    phase: 2, round: 1, telegraph: 1, window: 3, completed: false, health: 2, maxHealth: 6, n: 3, high: true, rank: 'A'
  };
  const p = {};
  fields.forEach(function (fld) { p[fld] = byName[fld]; });
  if (name === 'level:start') p.music = { level: 'level1', boss: 'boss1' };
  if (name === 'section:enter') p.music = { transpose: 0, tempo: 150, keyOk: { root: 0, mode: 'major' } };
  if (name === 'life:lost') p.cause = { type: 'threat', kind: 'hoppet', id: 1, from: 'right' };
  if (name === 'life:gain') p.cause = 'cap';
  if (name === 'threat:warn' || name === 'threat:enter' || name === 'threat:spawn') p.from = 'behind';
  if (name === 'checkpoint') p.index = 1;
  if (name === 'boss:attack') p.kind = 'shock';
  if (name === 'boss:throw') p.kind = 'rock';
  return p;
}

check('emitting every event of section 8 with a payload of section 8, and with an empty payload, does not throw or log an error', function () {
  const env = unlocked();
  emit(env, 'screen:change', { from: 'howToPlay', to: 'playing', data: null });
  const names = Array.prototype.slice.call(env.TG.Events.NAMES);
  const FIELDS = env.TG.Events.FIELDS;
  names.forEach(function (name) {
    emit(env, name, samplePayload(name, Array.prototype.slice.call(FIELDS[name] || [])));
    emit(env, name, {});
    run(env, 3);
  });
  // every screen, in and out
  const screens = ['boot', 'title', 'difficultySelect', 'howToPlay', 'playing', 'paused', 'lifeLost', 'gameOver', 'bossIntro', 'boss', 'levelComplete', 'results', 'highScoreEntry'];
  screens.forEach(function (a) {
    screens.forEach(function (b) {
      emit(env, 'screen:change', { from: a, to: b, data: null });
      run(env, 2);
    });
  });
  run(env, 120);
  if (env.errors.length) return 'errors: ' + env.errors[0];
  const unexpected = env.warnings.filter(function (w) { return !/not a registered event name/.test(w); });
  return unexpected.length ? 'warnings: ' + unexpected[0] : true;
});

check('the same events before unlock and with music and sfx off do not throw either', function () {
  const env = fresh();
  env.TG.Audio.setEnabled('music', false);
  env.TG.Audio.setEnabled('sfx', false);
  const names = Array.prototype.slice.call(env.TG.Events.NAMES);
  const FIELDS = env.TG.Events.FIELDS;
  names.forEach(function (name) {
    emit(env, name, samplePayload(name, Array.prototype.slice.call(FIELDS[name] || [])));
    env.TG.Audio.update(1 / 60);
  });
  env.TG.Audio.unlock();
  const startsAfterUnlock = env.audio.starts;   // the shared vibrato LFO starts with the graph
  names.forEach(function (name) {
    emit(env, name, samplePayload(name, Array.prototype.slice.call(FIELDS[name] || [])));
    run(env, 2);
  });
  return env.errors.length === 0 && env.audio.starts === startsAfterUnlock;
});

check('a fresh run and the title screen reset the section transpose and the key_ok scale left by an earlier run', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  const base = keyOkFreq(env, 1);
  emit(env, 'screen:change', { from: 'howToPlay', to: 'playing', data: null });
  emit(env, 'level:start', { levelId: 1, difficulty: 'medium', name: 'X', continued: false, music: { level: 'level1', boss: 'boss1' } });
  emit(env, 'section:enter', { index: 2, name: 'C', stage: '1-3', palette: 'sunset', music: { transpose: 2, tempo: 158, keyOk: { root: 2, mode: 'major' } } });
  run(env, 60);
  if (I.sequencer('loop').transpose !== 2) return 'section 3 transpose not applied';
  emit(env, 'screen:change', { from: 'playing', to: 'paused', data: null });
  emit(env, 'screen:change', { from: 'paused', to: 'results', data: null });
  emit(env, 'screen:change', { from: 'results', to: 'title', data: null });
  if (Math.abs(keyOkFreq(env, 1) - base) > 1e-9) return 'key_ok not reset on the title screen';
  emit(env, 'screen:change', { from: 'title', to: 'difficultySelect', data: null });
  emit(env, 'screen:change', { from: 'difficultySelect', to: 'howToPlay', data: null });
  emit(env, 'screen:change', { from: 'howToPlay', to: 'playing', data: null });
  emit(env, 'level:start', { levelId: 1, difficulty: 'medium', name: 'X', continued: false, music: { level: 'level1', boss: 'boss1' } });
  const once = I.sequencer('once');
  if (once.name !== 'jingle_ready') return 'no ready jingle';
  emit(env, 'section:enter', { index: 0, name: 'A', stage: '1-1', palette: 'day', music: { transpose: 0, tempo: 150, keyOk: { root: 0, mode: 'major' } } });
  run(env, 30);
  const loop = I.sequencer('loop');
  const jingle = I.sequencer('once');
  if (loop.transpose !== 0 || loop.bpm !== 150) return 'loop kept the old section: ' + JSON.stringify(loop);
  return jingle.transpose === 0;
});

check('the ready jingle after a continue in section 3 plays in that section\'s key', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  emit(env, 'screen:change', { from: 'gameOver', to: 'playing', data: null });
  emit(env, 'game:continue', { checkpoint: 2, continues: 1, assist: 0.85 });
  emit(env, 'level:start', { levelId: 1, difficulty: 'medium', name: 'X', continued: true, music: { level: 'level1', boss: 'boss1' } });
  emit(env, 'section:enter', { index: 2, name: 'C', stage: '1-3', palette: 'sunset', music: { transpose: 2, tempo: 158, keyOk: { root: 2, mode: 'major' } } });
  run(env, 30);
  return I.sequencer('once').name === 'jingle_ready' && I.sequencer('once').transpose === 2 &&
    I.sequencer('loop').transpose === 2 && I.sequencer('loop').bpm === 158;
});

check('a loop requested before unlock starts when unlock happens', function () {
  const env = fresh();
  emit(env, 'screen:change', { from: 'boot', to: 'title', data: null });
  if (env.audio.contexts.length !== 0) return 'context before unlock';
  env.TG.Audio.unlock();
  run(env, 30);
  const s = env.TG.Audio._internals.sequencer('loop');
  return s.name === 'title' && s.playing && env.audio.starts > 0;
});

// =================================================================================================
// Voices, delayed sounds and the figures of the review fixes
// =================================================================================================

// Plays a sound and returns its voice gain.
function playVoice(env, name, opts) {
  const n0 = nodeCount(env);
  env.TG.Audio.sfx(name, opts || {});
  return voiceGainOf(createdSince(env, n0), env.TG.Audio._internals.levelOf(name));
}

function fadedToZero(gainNode) {
  return gainNode.gain.events.filter(function (e) { return e.type === 'linearRampToValueAtTime' && e.value === 0; }).length;
}

check('a sound that repeats all the time never takes over a reward: key_ok, ink_drop and watch_tick are dropped while three rewards play; a reward takes over the earliest reward', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  const a = playVoice(env, 'one_up'), b = playVoice(env, 'streak'), c = playVoice(env, 'checkpoint');
  if (!a || !b || !c) return 'voice gains not found';
  I.sfxLog.length = 0;
  env.TG.Audio.sfx('key_ok', { step: 2 });
  env.TG.Audio.sfx('ink_drop');
  env.TG.Audio.sfx('watch_tick');
  if (I.sfxLog.length) return 'played over three rewards: ' + I.sfxLog.join(',');
  if (fadedToZero(a) || fadedToZero(b) || fadedToZero(c)) return 'a reward voice was taken over';
  env.TG.Audio.sfx('power_get');
  if (fadedToZero(a) !== 1 || fadedToZero(b) || fadedToZero(c)) return 'power_get did not take over the earliest reward (one_up)';
  return true;
});

check('sounds asked for in the same step take over different voices, the earliest first, not the same voice twice', function () {
  const env = unlocked();
  const a = playVoice(env, 'clear_pop'), b = playVoice(env, 'deflect'), c = playVoice(env, 'jump');
  if (!a || !b || !c) return 'voice gains not found';
  env.TG.Audio.sfx('boss_throw');
  env.TG.Audio.sfx('clear_bonk');
  return (fadedToZero(a) === 1 && fadedToZero(b) === 1 && fadedToZero(c) === 0) ||
    'takeovers: clear_pop ' + fadedToZero(a) + ', deflect ' + fadedToZero(b) + ', jump ' + fadedToZero(c);
});

check('a sound asked for later (crate_break) holds no voice while it waits, and starts on time from TG.Audio.update', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  const ctx = env.audio.contexts[0];
  const t0 = ctx.currentTime;
  const n0 = nodeCount(env);
  env.TG.Audio.sfx('crate_break', { at: t0 + 0.3 });
  playVoice(env, 'clear_pop');
  playVoice(env, 'deflect');
  playVoice(env, 'jump');
  run(env, 40);
  const nodes = createdSince(env, n0);
  const taken = nodes.filter(function (n) {
    return n.kind === 'gain' && Math.abs(n.gain.value - 0.30) < 1e-9 && fadedToZero(n) > 0;
  });
  if (taken.length) return taken.length + ' voice(s) taken over';
  const noise = nodes.filter(function (n) { return n.kind === 'bufferSource' && Math.abs(n.startTime - (t0 + 0.3)) < 1e-6; });
  if (noise.length !== 1) return 'crate_break did not start at +0.3 s';
  return I.sfxLog.indexOf('crate_break') !== -1;
});

check('the power sound of a crate plays after crate_break (+0.48 s), not on top of the word; an extra life from the score plays at once', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  const ctx = env.audio.contexts[0];
  const t0 = ctx.currentTime;
  const n0 = nodeCount(env);
  I.sfxLog.length = 0;
  emit(env, 'word:clear', { id: 1, type: 'crate', kind: 'crate', family: 'pop', from: 'right', word: 'hat', x: 0, y: 0, w: 16, h: 32,
    score: 100, mult: 1, clean: true, quick: false, close: false, cause: 'typed', power: 'cap' });
  emit(env, 'pickup:power', { power: 'cap', x: 0, y: 0 });
  emit(env, 'life:gain', { lives: 5, cause: 'cap' });
  run(env, 60);
  if (!same(Array.prototype.slice.call(I.sfxLog), ['word_clear', 'clear_pop', 'crate_break', 'one_up'])) return 'order: ' + I.sfxLog.join(',');
  const late = createdSince(env, n0).filter(function (n) { return n.kind === 'oscillator' && n.startTime >= t0 + 0.47; });
  if (late.length !== 1 || Math.abs(late[0].startTime - (t0 + 0.48)) > 0.005) return 'one_up start ' + (late[0] ? late[0].startTime - t0 : 'none');
  const n1 = nodeCount(env);
  const t1 = ctx.currentTime;
  emit(env, 'life:gain', { lives: 6, cause: 'score' });
  const now = createdSince(env, n1).filter(function (n) { return n.kind === 'oscillator'; });
  return (now.length === 1 && now[0].startTime - t1 < 0.01) || 'one_up from the score did not start at once';
});

check('two type:miss at the same moment (the key that triggers auto-release) play one key_bad; a later miss plays again', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  I.sfxLog.length = 0;
  const miss = { target: {}, id: 3, ch: 'z', expected: 'a', repeat: 3, x: 0, y: 0 };
  emit(env, 'type:miss', miss);
  emit(env, 'target:release', { target: {}, id: 3, reason: 'auto' });
  emit(env, 'type:miss', Object.assign({}, miss, { id: null, target: null, repeat: 1 }));
  const bad = I.sfxLog.filter(function (n) { return n === 'key_bad'; }).length;
  if (bad !== 1) return bad + ' key_bad sounds for one key';
  env.audio.advance(0.1);
  emit(env, 'type:miss', miss);
  return I.sfxLog.filter(function (n) { return n === 'key_bad'; }).length === 2 || 'the next miss is silent';
});

check('QUIT from the pause menu during the ready jingle drops the jingle: no jingle note and no duck on the results screen', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  const ctx = env.audio.contexts[0];
  emit(env, 'screen:change', { from: 'howToPlay', to: 'playing', data: null });
  emit(env, 'level:start', { levelId: 1, difficulty: 'medium', name: 'X', continued: false, music: { level: 'level1', boss: 'boss1' } });
  run(env, 60);
  emit(env, 'screen:change', { from: 'playing', to: 'paused', data: null });
  run(env, 30);
  const tq = ctx.currentTime;
  emit(env, 'screen:change', { from: 'paused', to: 'results', data: null });
  if (I.sequencer('once').playing) return 'the jingle is still playing after the quit';
  const n0 = nodeCount(env);
  run(env, 120);
  const bus = I.graph().musicBus;
  const jingleNotes = createdSince(env, n0).filter(function (n) {
    return (n.kind === 'oscillator' || n.kind === 'bufferSource') && n.connections[0] && n.connections[0].connections[0] &&
      n.connections[0].connections[0].connections.indexOf(bus) !== -1;
  });
  if (jingleNotes.length) return jingleNotes.length + ' jingle notes after the quit';
  // The duck automation in force: what follows its last re-scheduling.
  const ev = I.graph().duck.gain.events;
  const tail = ev.slice(ev.map(function (e) { return e.type; }).lastIndexOf('cancelAndHoldAtTime'));
  const low = tail.filter(function (e) { return e.time > tq + 0.1 && e.value === I.DUCK; });
  const up = tail.filter(function (e) { return e.value === 1 && e.time <= tq + 0.1; });
  return (low.length === 0 && up.length > 0) || 'the results loop stays ducked after the quit: ' + JSON.stringify(tail);
});

check('word_clear, streak, checkpoint and one_up follow a major section key (D6 in section 3 of Level 1) and stay in C in a minor one; the top note stays at or below D7', function () {
  const env = unlocked();
  const firstNote = function (name) {
    const r = sfxSources(env, name);
    const osc = r.sources.filter(function (s) { return s.node.kind === 'oscillator'; })[0].node;
    const notes = osc.frequency.events.filter(function (e) { return e.type === 'setValueAtTime'; }).map(function (e) { return e.value; });
    return { first: notes[0], top: Math.max.apply(null, notes) };
  };
  const D6 = 1174.659, C6 = 1046.502, D7 = 2349.318;
  setKeyOk(env, 2, 'major');
  const bad = [];
  ['word_clear', 'checkpoint'].forEach(function (n) {
    const f = firstNote(n);
    if (Math.abs(f.first - D6) > 0.05) bad.push(n + ' starts on ' + f.first.toFixed(1) + ' in D');
    if (f.top > D7 + 0.05) bad.push(n + ' reaches ' + f.top.toFixed(1));
  });
  const st = firstNote('streak');
  if (Math.abs(st.first / 783.991 - Math.pow(2, 2 / 12)) > 1e-4) bad.push('streak not moved up 2 semitones');
  if (Math.abs(firstNote('one_up').first - D6) > 0.05) bad.push('one_up not in D');
  setKeyOk(env, 4, 'minor');
  if (Math.abs(firstNote('word_clear').first - C6) > 0.05) bad.push('word_clear moved in a minor section');
  setKeyOk(env, 0, 'major');
  if (Math.abs(firstNote('word_clear').first - C6) > 0.05) bad.push('word_clear not on C6 in C');
  return bad.length ? bad.join('; ') : true;
});

check('one_up, ink_drop and start are original figures: not the Super Mario Bros. 1-up and coin; ink_drop is at most 160 ms and climbs in a chain', function () {
  const env = unlocked();
  const notesOf = function (name, opts) {
    const r = sfxSources(env, name, opts);
    const osc = r.sources.filter(function (s) { return s.node.kind === 'oscillator'; })[0];
    const notes = osc.node.frequency.events.filter(function (e) { return e.type === 'setValueAtTime'; }).map(function (e) { return e.value; });
    return { notes: notes, length: osc.stop - osc.start };
  };
  const near = function (a, b) { return Math.abs(a - b) < 0.5; };
  const f = function (name) { return 440 * Math.pow(2, (env.TG.Audio._internals.noteToMidi(name) - 69) / 12); };
  const smb1up = [f('E6'), f('G6'), f('E7'), f('C7'), f('D7'), f('G7')];
  const up = notesOf('one_up');
  if (up.notes.length < 5 || up.notes.length > 6) return 'one_up has ' + up.notes.length + ' notes';
  if (up.notes.length === 6 && up.notes.every(function (n, i) { return near(n, smb1up[i]); })) return 'one_up is the 1-up jingle';
  if (!(up.notes[up.notes.length - 1] > up.notes[0])) return 'one_up does not rise';
  const coin = [f('B5'), f('E6')];
  const ink = notesOf('ink_drop', { step: 0 });
  if (ink.notes.length !== 2 || (near(ink.notes[0], coin[0]) && near(ink.notes[1], coin[1]))) return 'ink_drop: ' + ink.notes.join(',');
  if (Math.abs(ink.notes[1] / ink.notes[0] - 4 / 3) < 0.01) return 'ink_drop is still a rising fourth';
  if (ink.length - 0.02 > 0.16 + 1e-9) return 'ink_drop lasts ' + (ink.length - 0.02);   // sources stop 20 ms after the last note
  const ink2 = notesOf('ink_drop', { step: 2 });
  if (!(ink2.notes[0] > ink.notes[0])) return 'ink_drop does not climb in a chain';
  const st = notesOf('start');
  if (near(st.notes[0], coin[0]) && near(st.notes[1], coin[1])) return 'start is the coin figure';
  if (Math.abs(st.notes[1] / st.notes[0] - 4 / 3) < 0.01) return 'start is still a rising fourth';
  // pickup:ink in quick succession passes a rising step.
  const I = env.TG.Audio._internals;
  const firstInk = function () {
    const n0 = nodeCount(env);
    emit(env, 'pickup:ink', { x: 0, y: 0, ink: 1, inkTotal: 1 });
    return createdSince(env, n0).filter(function (n) { return n.kind === 'oscillator'; })[0].frequency.events[0].value;
  };
  env.audio.advance(1);
  const i0 = firstInk();
  env.audio.advance(0.1);
  const i1 = firstInk();
  env.audio.advance(1);
  const i2 = firstInk();
  return (i1 > i0 && Math.abs(i2 - i0) < 1e-6 && I.sfxLog.length > 0) || 'chain ' + [i0, i1, i2].join(', ');
});

check('isUnlocked is true only while the context runs; unlock() resumes a context that was made or left suspended', function () {
  const env = fresh();
  if (env.TG.Audio.isUnlocked()) return 'unlocked before unlock';
  env.TG.Audio.unlock();
  const ctx = env.audio.contexts[0];
  if (!env.TG.Audio.isUnlocked()) return 'not unlocked with a running context';
  ctx.suspend();
  if (env.TG.Audio.isUnlocked()) return 'a suspended context counts as unlocked';
  const resumes = env.audio.resumes;
  env.TG.Audio.unlock();
  return (env.TG.Audio.isUnlocked() && env.audio.resumes === resumes + 1 && env.audio.contexts.length === 1) || 'unlock did not resume';
});

check('TG.Audio has exactly the public names of CONTRACT 4.8 plus the test-only _internals', function () {
  const env = stubs.load({ files: FILES });
  const names = Object.keys(env.TG.Audio).sort();
  const expected = ['SFX', 'TRACKS', '_internals', 'init', 'isUnlocked', 'jingle', 'music', 'resume', 'setBassOnly',
    'setEnabled', 'setTempoScale', 'sfx', 'suspend', 'unlock', 'update'].sort();
  return same(names, expected);
});

// =================================================================================================
// Level 2: the tracks of LEVEL2 11.1 and 11.2
// =================================================================================================

// The events of one bar of a channel, with steps counted from the start of the bar.
function barEvents(track, ch, bar) {
  const spb = track.stepsPerBar;
  return track.channels[ch].events.filter(function (e) { return e.step >= bar * spb && e.step < (bar + 1) * spb; })
    .map(function (e) { return Object.assign({}, e, { step: e.step - bar * spb }); });
}

check('level2, boss2 and jingle_ready2 have the tempo, key and length of LEVEL2 11.1', function () {
  const env = stubs.load({ files: FILES });
  const I = env.TG.Audio._internals;
  const l = I.parse('level2'), b = I.parse('boss2'), j = I.parse('jingle_ready2');
  const bad = [];
  if (!(l.bpm === 140 && l.key === 'D' && l.mode === 'minor' && l.beats === 4 && l.bars === 32 && l.loop)) bad.push('level2');
  if (!(b.bpm === 160 && b.key === 'G' && b.mode === 'minor' && b.beats === 4 && b.bars === 16 && b.loop)) bad.push('boss2');
  if (!(j.bpm === 140 && j.key === 'D' && j.mode === 'minor' && j.beats === 4 && j.bars === 2 && !j.loop)) bad.push('jingle_ready2');
  if (l.title !== 'Clockwork Caverns' || b.title !== 'The Great Clock') bad.push('titles ' + l.title + ', ' + b.title);
  // 32 bars at 140 BPM: "about 55 s". 16 bars at 160 BPM are 24 s.
  if (Math.abs(I.trackLength('level2') - 32 * 4 * 60 / 140) > 1e-9 || Math.abs(I.trackLength('level2') - 55) > 0.5) bad.push('level2 length ' + I.trackLength('level2'));
  if (Math.abs(I.trackLength('boss2') - 24) > 1e-9) bad.push('boss2 length ' + I.trackLength('boss2'));
  if (l.channels.p1.wave !== 'p50' || !l.channels.p1.vibrato || l.channels.p2.wave !== 'p12') bad.push('level2 voices');
  if (b.channels.p1.wave !== 'p12' || b.channels.p2.wave !== 'p50') bad.push('boss2 voices');
  return bad.length ? bad.join(', ') : true;
});

check('level2 is AABA: the three A parts share a tune and the B part has another; every A part ends on a held D, and the last one leads back into the first', function () {
  const env = stubs.load({ files: FILES });
  const l = env.TG.Audio._internals.parse('level2');
  const spb = l.stepsPerBar;
  const lead = l.channels.p1.events;
  function part(from, bars) {
    return lead.filter(function (e) { return e.step >= from * spb && e.step < (from + bars) * spb; })
      .map(function (e) { return (e.step - from * spb) + ':' + e.midi + ':' + e.len; }).join(',');
  }
  // The first seven bars of each part: the eighth bar of an A part is held longer the second and third time.
  const a1 = part(0, 7), a2 = part(8, 7), b = part(16, 7), a3 = part(24, 7);
  if (a1 !== a2 || a1 !== a3) return 'the A parts differ';
  if (a1 === b) return 'the B part is the same as the A part';
  const bad = [8, 16, 32].filter(function (endBar) {
    const inBar = lead.filter(function (e) { return e.step >= (endBar - 1) * spb && e.step < endBar * spb; });
    const last = inBar[inBar.length - 1];
    return !(last && last.midi % 12 === 2 && last.len >= 6);
  });
  if (bad.length) return 'A parts ending in bars ' + bad.join(', ') + ' do not end on a long D';
  // The loop point: the tune ends on D and starts again on the A above it, and the bass ends a fifth away from its first note.
  const tri = l.channels.tri.events;
  const bassStep = Math.abs(tri[0].midi - tri[tri.length - 1].midi) % 12;
  return (lead[0].midi - lead[lead.length - 1].midi === 7 && (bassStep === 5 || bassStep === 7)) || 'the loop point';
});

check('the level2 tune is singable and its own: inside the range of the Level 1 tune, no leap wider than an octave, mostly steps, a dotted pair in every bar', function () {
  const env = stubs.load({ files: FILES });
  const P = env.TG.Audio._internals.parse;
  const l = P('level2');
  const lead = l.channels.p1.events;
  const midis = lead.map(function (e) { return e.midi; });
  const ref = P('level1').channels.p1.events.map(function (e) { return e.midi; });
  const lo = Math.min.apply(null, midis), hi = Math.max.apply(null, midis);
  if (lo < Math.min.apply(null, ref) || hi > Math.max.apply(null, ref)) return 'range ' + lo + ' to ' + hi + ' is outside the Level 1 tune';
  let steps = 0;
  for (let i = 1; i < lead.length; i++) {
    const d = Math.abs(lead[i].midi - lead[i - 1].midi);
    if (d > 12) return 'leap of ' + d + ' at step ' + lead[i].step;
    if (d === 1 || d === 2) steps++;
  }
  if (Math.abs(lead[0].midi - lead[lead.length - 1].midi) > 12) return 'leap at the loop point';
  if (!(steps > (lead.length - 1) / 2)) return 'only ' + steps + ' of ' + (lead.length - 1) + ' moves are steps';
  // Dotted: a note of 3 steps and one of 1, or a note of 6 and one of 2, side by side.
  const plain = [];
  for (let bar = 0; bar < l.bars; bar++) {
    const ev = barEvents(l, 'p1', bar);
    const dotted = ev.some(function (e, i) {
      const next = ev[i + 1];
      return !!next && next.step === e.step + e.len && ((e.len === 3 && next.len === 1) || (e.len === 6 && next.len === 2));
    });
    if (!dotted) plain.push(bar + 1);
  }
  if (plain.length) return 'no dotted pair in bars ' + plain.join(', ');
  // Not the Level 1 tune moved to another key: the two A parts have different rhythms.
  const rhythm = function (t) { return t.channels.p1.events.filter(function (e) { return e.step < 8 * t.stepsPerBar; }).map(function (e) { return e.step + ':' + e.len; }).join(','); };
  return rhythm(l) !== rhythm(P('level1')) || 'the rhythm of the A part is that of level1';
});

check('the level2 tune does not start again inside a part: two bars side by side open with the same two notes only where one part ends and the next begins', function () {
  const env = stubs.load({ files: FILES });
  const P = env.TG.Audio._internals.parse;
  // The first two notes of a bar, pitch and length. Bar 1 of the A part opens A, G; if the bar
  // before it opened the same way the tune would seem to come in a bar early. (level1 keeps the
  // same rule: none of its bars opens like the one before it.)
  const inside = function (t) {
    const head = function (bar) { return barEvents(t, 'p1', bar % t.bars).slice(0, 2).map(function (e) { return e.midi + ':' + e.len; }).join(' '); };
    const out = [];
    for (let bar = 0; bar < t.bars; bar++) {
      if (bar % 8 !== 7 && head(bar) === head(bar + 1)) out.push((bar + 1) + ' and ' + (bar + 2));
    }
    return out;
  };
  const l1 = inside(P('level1')), l2 = inside(P('level2'));
  if (l1.length) return 'level1 bars ' + l1.join(', ') + ': this check needs another look';
  return l2.length === 0 || 'bars ' + l2.join(', ') + ' open with the same two notes';
});

check('the level2 tune is not the Level 1 tune in minor: it opens on the fifth and steps down where level1 opens on the key note and climbs, no bar of its A part has the rhythm of the same bar of level1, and the two are on the same scale degree on fewer than a third of the beats', function () {
  const env = stubs.load({ files: FILES });
  const I = env.TG.Audio._internals;
  const l2 = I.parse('level2'), l1 = I.parse('level1');
  // The scale degree, 1 to 7, of a note in the key of its track (0 outside the scale).
  const degree = function (t, midi) { return I.keyPitchClasses(t.key, t.mode).indexOf(midi % 12) + 1; };
  const head = function (t) { return t.channels.p1.events.slice(0, 3); };
  const h1 = head(l1), h2 = head(l2);
  if (!(degree(l1, h1[0].midi) === 1 && h1[0].midi < h1[1].midi && h1[1].midi < h1[2].midi)) return 'level1 no longer opens on its key note and climbs: this check needs another look';
  if (!(degree(l2, h2[0].midi) === 5 && h2[0].midi > h2[1].midi && h2[1].midi > h2[2].midi)) return 'level2 does not open on the fifth and step down';
  const bad = [];
  // The A part and the B part, bar against bar.
  [0, 16].forEach(function (from) {
    let same = 0;
    for (let bar = from; bar < from + 8; bar++) {
      const r = function (t) { return barEvents(t, 'p1', bar).map(function (e) { return e.step + ':' + e.len; }).join(','); };
      if (r(l1) === r(l2)) bad.push('bar ' + (bar + 1) + ' has the rhythm of level1');
      // The note that sounds as each beat starts. A beat on which either tune rests is not counted.
      for (let beat = 0; beat < 4; beat++) {
        const at = function (t) {
          const step = bar * t.stepsPerBar + beat * 4;
          return t.channels.p1.events.filter(function (e) { return e.step <= step && step < e.step + e.len; })[0];
        };
        const a = at(l1), b = at(l2);
        if (a && b && degree(l1, a.midi) === degree(l2, b.midi)) same++;
      }
    }
    if (!(same < 32 / 3)) bad.push('bars ' + (from + 1) + ' to ' + (from + 8) + ': the same scale degree as level1 on ' + same + ' of 32 beats');
  });
  return bad.length ? bad.join('; ') : true;
});

check('level2 harmony: the bass walks in quarters from the roots Dm, Bb, C, Am (A part) and Gm, Bb, C, Dm (B part), and not in fifths or octaves with the tune; pulse 2 ticks eighths on the root and fifth, answers the rest in the 4th bar of an A part with one arpeggio, and plays sixteenths in the B part', function () {
  const env = stubs.load({ files: FILES });
  const l = env.TG.Audio._internals.parse('level2');
  const A = [2, 10, 0, 9, 2, 10, 0, 9], B = [7, 10, 0, 2, 7, 10, 0, 2];
  const roots = A.concat(A, B, A);
  const bad = [];
  for (let bar = 0; bar < l.bars; bar++) {
    const inB = bar >= 16 && bar < 24;
    const tri = barEvents(l, 'tri', bar);
    if (tri.length !== 4 || tri.some(function (e, i) { return e.step !== i * 4 || e.len !== 4; })) bad.push('bar ' + (bar + 1) + ': the bass is not four quarters');
    else if (tri[0].midi % 12 !== roots[bar]) bad.push('bar ' + (bar + 1) + ': the bass starts on ' + (tri[0].midi % 12));
    const p2 = barEvents(l, 'p2', bar);
    // The fourth bar of an A part, where the tune rests on beat 4: three beats of ticks, then one
    // rising arpeggio of the chord in sixteenths.
    const answer = !inB && bar % 8 === 3;
    const ticks = answer ? p2.filter(function (e) { return e.step < 12; }) : p2;
    const want = inB ? 1 : 2;
    if (ticks.length !== (answer ? 12 : 16) / want || ticks.some(function (e, i) { return e.step !== i * want || e.len !== want; })) {
      bad.push('bar ' + (bar + 1) + ': pulse 2 is not in ' + (inB ? 'sixteenths' : 'eighths'));
    } else if (!inB && bar % 8 !== 7) {
      // Root on the beat, fifth off it. (The last bar of an A part changes chord half-way.)
      const off = ticks.filter(function (e, i) { return (e.midi % 12) !== (i % 2 === 0 ? roots[bar] : (roots[bar] + 7) % 12); });
      if (off.length) bad.push('bar ' + (bar + 1) + ': pulse 2 leaves the root and fifth');
    } else if (!inB) {
      // The close: A E, A C (the third of Am), D F (the root and third of Dm, under the held D), A E.
      const close = ticks.map(function (e) { return e.midi % 12; }).join(',');
      if (close !== '9,4,9,0,2,5,9,4') bad.push('bar ' + (bar + 1) + ': the close of pulse 2 is ' + close);
    }
    if (answer) {
      const fill = p2.filter(function (e) { return e.step >= 12; });
      const chord = [roots[bar], (roots[bar] + 3) % 12, (roots[bar] + 7) % 12];
      const ok = fill.length === 4 && fill.every(function (e, i) {
        return e.step === 12 + i && e.len === 1 && chord.indexOf(e.midi % 12) !== -1 && (i === 0 || e.midi > fill[i - 1].midi);
      });
      if (!ok) bad.push('bar ' + (bar + 1) + ': pulse 2 does not answer with a rising arpeggio on beat 4');
      if (barEvents(l, 'p1', bar).some(function (e) { return e.step + e.len > 12; })) bad.push('bar ' + (bar + 1) + ': the tune does not rest on beat 4');
    }
  }
  // An octave jump in the bass in most bars.
  const jumps = l.channels.tri.events.filter(function (e, i, all) { return i > 0 && Math.abs(e.midi - all[i - 1].midi) === 12; }).length;
  if (jumps < l.bars / 2) bad.push('only ' + jumps + ' octave jumps in the bass');
  // The voices keep their order: the tune above pulse 2, pulse 2 not below the bass.
  ['p1/p2', 'p2/tri'].forEach(function (pair) {
    const up = l.channels[pair.split('/')[0]].events, down = l.channels[pair.split('/')[1]].events;
    up.forEach(function (a) {
      down.forEach(function (b) {
        if (a.step < b.step + b.len && b.step < a.step + a.len && a.midi < b.midi) bad.push(pair + ' cross at step ' + Math.max(a.step, b.step));
      });
    });
  });
  // The bass is a line of its own: it never moves with the tune from one fifth or octave to the
  // next, round the loop point included. (level1 has none of these either.)
  const at = function (ch, step) {
    return l.channels[ch].events.filter(function (e) { return e.step <= step % l.totalSteps && step % l.totalSteps < e.step + e.len; })[0];
  };
  let prev = null;
  for (let step = 0; step <= l.totalSteps; step++) {
    const a = at('p1', step), b = at('tri', step);
    if (!a) prev = null;
    if (!a || !b) continue;
    const cur = { a: a.midi, b: b.midi };
    if (prev && (prev.a !== cur.a || prev.b !== cur.b)) {
      const before = (prev.a - prev.b) % 12, after = (cur.a - cur.b) % 12;
      const da = cur.a - prev.a, db = cur.b - prev.b;
      if (da !== 0 && db !== 0 && (da > 0) === (db > 0) && before === after && (after === 0 || after === 7)) {
        bad.push('the tune and the bass move in ' + (after === 0 ? 'octaves' : 'fifths') + ' into step ' + (step % l.totalSteps));
      }
    }
    if (!prev || prev.a !== cur.a || prev.b !== cur.b) prev = cur;
  }
  return bad.length ? bad.slice(0, 5).join('; ') : true;
});

check('the level2 bass is heard on small speakers: a note at or above 120 Hz on beat 1 of every bar, fewer than a third of the beats under 120 Hz and never more than two of them in a row, round the loop point included', function () {
  const env = stubs.load({ files: FILES });
  const l = env.TG.Audio._internals.parse('level2');
  const tri = l.channels.tri.events;
  // The bass is in quarters (checked above), so there is one note to a beat. A triangle wave has
  // little above its fundamental: under about 120 Hz a small speaker gives almost none of it.
  const low = tri.map(function (e) { return 440 * Math.pow(2, (e.midi - 69) / 12) < 120; });
  const bad = [];
  let run = 0, longest = 0;
  // Twice round, so that a run across the loop point is counted.
  for (let i = 0; i < low.length * 2; i++) {
    run = low[i % low.length] ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  if (longest > 2) bad.push(longest + ' beats in a row under 120 Hz');
  const count = low.filter(Boolean).length;
  if (!(count < low.length / 3)) bad.push(count + ' of ' + low.length + ' beats under 120 Hz');
  tri.forEach(function (e, i) {
    if (e.step % l.stepsPerBar === 0 && low[i]) bad.push('bar ' + (e.step / l.stepsPerBar + 1) + ' starts under 120 Hz');
  });
  return bad.length ? bad.slice(0, 5).join('; ') : true;
});

check('level2 drums: kick on 1 and 3, snare on 2 and 4, the accented hat on every off-beat eighth; every 8th bar ends in a fill', function () {
  const env = stubs.load({ files: FILES });
  const l = env.TG.Audio._internals.parse('level2');
  const bad = [];
  for (let bar = 0; bar < l.bars; bar++) {
    const ev = barEvents(l, 'noise', bar);
    const at = function (s) { const e = ev.filter(function (x) { return x.step === s; })[0]; return e ? e.drum : '-'; };
    const grid = [0, 2, 4, 6, 8, 10, 12, 14].map(at).join('');
    if (grid !== 'kHsHkHsH') bad.push('bar ' + (bar + 1) + ' is ' + grid);
    const fill = ev.length > 8;
    if (fill !== (bar % 8 === 7)) bad.push('bar ' + (bar + 1) + (fill ? ' has a fill' : ' has no fill'));
  }
  return bad.length ? bad.slice(0, 5).join('; ') : true;
});

check('boss2: a riff in 16ths that keeps coming back to G, with A flat its one accidental, heard in every bar, and its pedal G4 softer than its tune; pulse 2 ticks G3 G4 in eighths; the bass goes G, A flat, B flat, A flat', function () {
  const env = stubs.load({ files: FILES });
  const b = env.TG.Audio._internals.parse('boss2');
  const riff = b.channels.p1.events;
  if (riff.length !== b.totalSteps || riff.some(function (e) { return e.len !== 1; })) return 'the riff is not all 16ths';
  const acc = function (ch) { return b.channels[ch].events.filter(function (e) { return e.accidental; }); };
  const notAb = acc('p1').concat(acc('p2'), acc('tri')).filter(function (e) { return e.midi % 12 !== 8; });
  if (notAb.length) return 'an accidental other than A flat at step ' + notAb[0].step;
  // The natural second of G minor would undo the flattened one.
  if (['p1', 'p2', 'tri'].some(function (ch) { return b.channels[ch].events.some(function (e) { return e.midi % 12 === 9; }); })) return 'an A natural';
  for (let bar = 0; bar < b.bars; bar++) {
    const cell = barEvents(b, 'p1', bar);
    const g = cell.filter(function (e) { return e.midi % 12 === 7; }).length;
    if (cell[0].midi % 12 !== 7 || g < 3) return 'bar ' + (bar + 1) + ' of the riff starts on ' + (cell[0].midi % 12) + ' and has ' + g + ' Gs';
    // The A flat is in the riff itself in every bar. In the bars of the first riff (the ones with
    // G4 between the notes of the tune) it is on beat 2, where the bass has it, as the F is in boss1.
    const flats = cell.filter(function (e) { return e.midi % 12 === 8; });
    if (!flats.length) return 'bar ' + (bar + 1) + ' of the riff has no A flat';
    const first = cell.some(function (e) { return e.midi === 67; });
    if (first && !flats.some(function (e) { return e.step === 4; })) return 'bar ' + (bar + 1) + ' of the riff has no A flat on beat 2';
    // In those bars the G4 between the notes of the tune is the note of pulse 2's upper tick, and
    // the two take turns on it. The riff plays it softer than its tune notes, which are at full level.
    if (first) {
      const pedal = cell.filter(function (e) { return e.step % 2 === 1; }), tune = cell.filter(function (e) { return e.step % 2 === 0; });
      if (pedal.some(function (e) { return e.midi !== 67; }) || tune.some(function (e) { return e.midi === 67; })) return 'bar ' + (bar + 1) + ' of the riff: the pedal is not on the off 16ths only';
      if (tune.some(function (e) { return e.vel !== 1; }) || pedal.some(function (e) { return !(e.vel >= 0.3 && e.vel <= 0.7); })) return 'bar ' + (bar + 1) + ' of the riff: the pedal G4 is not softer than the tune notes';
    }
    const ost = barEvents(b, 'p2', bar).map(function (e) { return e.step + ':' + e.midi + ':' + e.len; }).join(' ');
    if (ost !== '0:55:2 2:67:2 4:55:2 6:67:2 8:55:2 10:67:2 12:55:2 14:67:2') return 'bar ' + (bar + 1) + ' pulse 2 is ' + ost;
    const tri = barEvents(b, 'tri', bar);
    if (tri.length !== 8 || tri.some(function (e) { return e.len !== 2; })) return 'bar ' + (bar + 1) + ': the bass is not in eighths';
    const line = [0, 2, 4, 6].map(function (i) { return tri[i].midi % 12; }).join(',');
    // Every 4th bar ends on D, the fifth, as the Baron's ends on B.
    if (line !== (bar % 4 === 3 ? '7,8,10,2' : '7,8,10,8')) return 'bar ' + (bar + 1) + ': the bass goes ' + line;
    if (tri.some(function (e, i) { return i % 2 === 1 && e.midi !== tri[i - 1].midi + 12; })) return 'bar ' + (bar + 1) + ': the bass does not bounce in octaves';
  }
  return true;
});

check('boss2 drums: a kick on every beat with the snare on 2 and 4, the accented hat of level2 on every off-beat eighth, a roll every 4th bar', function () {
  const env = stubs.load({ files: FILES });
  const b = env.TG.Audio._internals.parse('boss2');
  const bad = [];
  for (let bar = 0; bar < b.bars; bar++) {
    const ev = barEvents(b, 'noise', bar);
    const at = function (s) { const e = ev.filter(function (x) { return x.step === s; })[0]; return e ? e.drum : '-'; };
    if (bar % 4 === 3) {
      const roll = ev.filter(function (e) { return e.step >= 9 && e.drum === 's'; });
      if ([0, 2, 4, 6, 8].map(at).join('') !== 'kHxHk' || roll.length !== 7) bad.push('roll bar ' + (bar + 1));
      else if (roll.some(function (e, i) { return i > 0 && e.vel < roll[i - 1].vel; })) bad.push('the roll of bar ' + (bar + 1) + ' does not grow');
    } else if ([0, 2, 4, 6, 8, 10, 12, 14].map(at).join('') !== 'kHxHkHxH' || ev.length !== 8) {
      bad.push('bar ' + (bar + 1));
    }
  }
  return bad.length ? bad.join('; ') : true;
});

check('boss2 is more urgent than level2, faster and denser, and neither is louder than its Level 1 counterpart: the same worst-case peak, and key_ok above the mix', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  const l = I.parse('level2'), b = I.parse('boss2');
  if (!(b.bpm > l.bpm && b.channels.p1.events.length / b.bars > l.channels.p1.events.length / l.bars)) return 'boss2 is not faster and denser';
  const bad = [];
  [['level2', 'level1'], ['boss2', 'boss1'], ['jingle_ready2', 'jingle_ready']].forEach(function (pair) {
    const mine = trackPeak(I, pair[0]), ref = trackPeak(I, pair[1]);
    if (mine > ref + 1e-9) bad.push(pair[0] + ' peaks at ' + mine.toFixed(4) + ', ' + pair[1] + ' at ' + ref.toFixed(4));
  });
  const W = waveTable(env);
  const keyRms = 0.12 * W.p25.rms;
  ['level2', 'boss2'].forEach(function (name) {
    const t = I.parse(name);
    let sq = 0;
    ['p1', 'p2', 'tri', 'noise'].forEach(function (ch) {
      const c = t.channels[ch];
      const maxVel = Math.max.apply(null, c.events.map(function (e) { return e.vel * (ch === 'noise' ? I.DRUM_LEVEL[e.drum] : 1); }));
      const waveRms = ch === 'noise' ? I.NOISE_AMP : W[c.wave].rms;
      sq += Math.pow(I.GAINS[ch] * I.MUSIC_LEVEL * c.vel * maxVel * waveRms, 2);   // the channels add as uncorrelated signals
    });
    if (!(keyRms > Math.sqrt(sq))) bad.push(name + ' mix RMS ' + Math.sqrt(sq).toFixed(4) + ' >= key_ok ' + keyRms.toFixed(4));
  });
  return bad.length ? bad.join('; ') : true;
});

check('jingle_ready2 is jingle_ready in its rhythm, on the D minor triad', function () {
  const env = stubs.load({ files: FILES });
  const P = env.TG.Audio._internals.parse;
  const j = P('jingle_ready2'), ref = P('jingle_ready');
  const bad = [];
  ['p1', 'p2', 'tri', 'noise'].forEach(function (ch) {
    const rhythm = function (t) { return t.channels[ch].events.map(function (e) { return e.step + ':' + e.len + (e.drum || ''); }).join(' '); };
    if (rhythm(j) !== rhythm(ref)) bad.push(ch + ' rhythm ' + rhythm(j));
    if (j.channels[ch].wave !== ref.channels[ch].wave || j.channels[ch].gate !== ref.channels[ch].gate) bad.push(ch + ' wave or gate');
  });
  ['p1', 'p2', 'tri'].forEach(function (ch) {
    const out = j.channels[ch].events.filter(function (e) { return [2, 5, 9].indexOf(e.midi % 12) === -1; });
    if (out.length) bad.push(ch + ' leaves the triad at step ' + out[0].step);
  });
  // LEVEL2 11.1 prints the notes.
  const notes = function (ch) { return j.channels[ch].events.map(function (e) { return e.midi; }).join(' '); };
  if (notes('p1') !== '74 74 74 77 77 77 81 81 86') bad.push('p1 ' + notes('p1'));
  if (notes('p2') !== '65 65 65 69 69 69 74 74 77') bad.push('p2 ' + notes('p2'));
  if (notes('tri') !== '38 38 45 38') bad.push('tri ' + notes('tri'));
  return bad.length ? bad.join('; ') : true;
});

// The music of the level data as LEVEL2 11.2 gives it.
const L2_MUSIC = { level: 'level2', boss: 'boss2', ready: 'jingle_ready2' };
const L2_SECTIONS = [
  { index: 0, name: 'LANTERN HOLLOW', stage: '2-1', palette: 'lantern', music: { transpose: 0, tempo: 140, keyOk: { root: 2, mode: 'minor' } } },
  { index: 1, name: 'THE GEAR HALL', stage: '2-2', palette: 'brass', music: { transpose: 0, tempo: 140, keyOk: { root: 2, mode: 'minor' } } },
  { index: 2, name: 'CRYSTAL DEEP', stage: '2-3', palette: 'crystal', music: { transpose: 3, tempo: 148, keyOk: { root: 5, mode: 'minor' } } },
  { index: 3, name: 'THE GREAT CLOCK', stage: '2-B', palette: 'clock',
    music: { transpose: 0, tempo: 160, keyOk: { root: 7, mode: 'minor' }, phase3: { tempo: 176, p2Octave: 12 } } }
];

// The ready jingle plays over the loop it ducks: level:start starts both, so the jingle's two bars
// lie on the first bars of the level track, the loop at the section's tempo and the jingle at its
// own. The pairs of a jingle note and a loop note that sound together a semitone apart in the same
// octave for longer than a 16th of the jingle, each as 'voice step:midi / voice step:midi'. The
// section's transpose moves both alike and is left out.
function readyRubs(P, jingle, loop, loopTempo) {
  const j = P(jingle), l = P(loop);
  const sixteenth = 60 / j.bpm / 4;
  const sounds = function (t, bpm, ch, e) {
    const step = 60 / bpm / 4;
    return [e.step * step, (e.step + e.len * t.channels[ch].gate) * step];
  };
  const out = [];
  ['p1', 'p2', 'tri'].forEach(function (jc) {
    j.channels[jc].events.forEach(function (a) {
      const sa = sounds(j, j.bpm, jc, a);
      ['p1', 'p2', 'tri'].forEach(function (lc) {
        l.channels[lc].events.forEach(function (b) {
          const sb = sounds(l, loopTempo, lc, b);
          if (Math.abs(a.midi - b.midi) === 1 && Math.min(sa[1], sb[1]) - Math.max(sa[0], sb[0]) > sixteenth) {
            out.push(jc + ' ' + a.step + ':' + a.midi + ' / ' + lc + ' ' + b.step + ':' + b.midi);
          }
        });
      });
    });
  });
  return out;
}

check('the ready jingle over the loop it ducks: jingle_ready has no note a semitone from a note of level1 in the same octave for longer than a 16th, and jingle_ready2 over level2 has only the pair that LEVEL2 11.1 prints, the A of its second bar under the B flat of the tune', function () {
  const env = stubs.load({ files: FILES });
  const P = env.TG.Audio._internals.parse;
  const bad = [];
  // Level 1: sections 1 and 2 at 150, section 3 at 158 (js/levels/level1.js).
  [150, 158].forEach(function (tempo) {
    const rubs = readyRubs(P, 'jingle_ready', 'level1', tempo);
    if (rubs.length) bad.push('jingle_ready over level1 at ' + tempo + ': ' + rubs.join(', '));
  });
  // Level 2. The jingle is the text of LEVEL2 11.1: its second bar starts on A5, twice, and bar 2
  // of the tune holds B flat 5 there. That is the one pair, at either tempo. If the jingle's text
  // changes (B flat for the A, in pulse 1 and in the bass, is the tested way to remove it), this
  // list becomes empty and the notes pinned in the check of the jingle above change with it.
  const printed = ['p1 16:81 / p1 16:82', 'p1 18:81 / p1 16:82'];
  [L2_SECTIONS[0].music.tempo, L2_SECTIONS[2].music.tempo].forEach(function (tempo) {
    const rubs = readyRubs(P, 'jingle_ready2', 'level2', tempo);
    if (!same(rubs, printed)) bad.push('jingle_ready2 over level2 at ' + tempo + ': ' + (rubs.join(', ') || 'none'));
  });
  return bad.length ? bad.join('; ') : true;
});

check('a run of Level 2 plays its own tracks: jingle_ready2 over level2 at 140, up 3 semitones at 148 in section 3, boss2 at 160, then 176 with pulse 2 an octave up from phase 3', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  const jingles = spyJingle(env);
  emit(env, 'screen:change', { from: 'results', to: 'playing', data: null });
  emit(env, 'level:start', { levelId: 2, difficulty: 'medium', name: 'CLOCKWORK CAVERNS', continued: false, music: L2_MUSIC });
  emit(env, 'section:enter', L2_SECTIONS[0]);
  run(env, 30);
  let s = I.sequencer('loop');
  if (s.name !== 'level2' || !s.playing || s.bpm !== 140 || s.transpose !== 0) return 'section 1: ' + JSON.stringify(s);
  if (!same(jingles, ['jingle_ready2']) || I.sequencer('once').name !== 'jingle_ready2' || I.sequencer('once').transpose !== 0) return 'ready jingle: ' + jingles.join(',');
  emit(env, 'section:enter', L2_SECTIONS[1]);
  run(env, 60 * 2);   // one bar at 140 BPM is 1.71 s
  s = I.sequencer('loop');
  if (s.name !== 'level2' || s.bpm !== 140 || s.transpose !== 0) return 'section 2: ' + JSON.stringify(s);
  emit(env, 'section:enter', L2_SECTIONS[2]);
  run(env, 60 * 2);
  s = I.sequencer('loop');
  if (s.name !== 'level2' || s.bpm !== 148 || s.transpose !== 3) return 'section 3: ' + JSON.stringify(s);
  // A continue in section 3: the jingle is in F minor too.
  emit(env, 'screen:change', { from: 'playing', to: 'lifeLost', data: null });
  emit(env, 'screen:change', { from: 'lifeLost', to: 'gameOver', data: null });
  emit(env, 'game:over', { checkpoint: 2, score: 0 });
  emit(env, 'screen:change', { from: 'gameOver', to: 'playing', data: null });
  emit(env, 'game:continue', { checkpoint: 2, continues: 1, assist: 0.85 });
  jingles.length = 0;
  emit(env, 'level:start', { levelId: 2, difficulty: 'medium', name: 'CLOCKWORK CAVERNS', continued: true, music: L2_MUSIC });
  emit(env, 'section:enter', L2_SECTIONS[2]);
  run(env, 30);
  s = I.sequencer('loop');
  const once = I.sequencer('once');
  if (s.name !== 'level2' || s.bpm !== 148 || s.transpose !== 3) return 'after the continue: ' + JSON.stringify(s);
  if (!same(jingles, ['jingle_ready2']) || once.name !== 'jingle_ready2' || once.transpose !== 3) return 'ready jingle after the continue: ' + JSON.stringify(once);
  emit(env, 'boss:warning', {});
  emit(env, 'screen:change', { from: 'playing', to: 'bossIntro', data: null });
  emit(env, 'boss:enter', {});
  emit(env, 'section:enter', L2_SECTIONS[3]);
  emit(env, 'screen:change', { from: 'bossIntro', to: 'boss', data: null });
  run(env, 30);
  s = I.sequencer('loop');
  if (s.name !== 'boss2' || !s.playing || s.bpm !== 160 || s.transpose !== 0 || s.p2Octave !== 0) return 'boss track: ' + JSON.stringify(s);
  emit(env, 'boss:phase', { phase: 2 });
  run(env, 60 * 2);   // one bar at 160 BPM is 1.5 s
  s = I.sequencer('loop');
  if (s.bpm !== 160 || s.p2Octave !== 0) return 'phase 2 changed the track: ' + JSON.stringify(s);
  emit(env, 'boss:phase', { phase: 3 });
  run(env, 60 * 2);
  s = I.sequencer('loop');
  if (s.name !== 'boss2' || s.bpm !== 176 || s.p2Octave !== 12) return 'phase 3: ' + JSON.stringify(s);
  return (env.warnings.length === 0 && env.errors.length === 0) || 'console: ' + env.warnings.concat(env.errors).join('; ');
});

check('boss2 in phase 3: pulse 2 ticks on G4 and G5 instead of G3 and G4, and the riff and the bass stay where they were', function () {
  // The pitches each voice plays in the first two bars, by the wave of its oscillators.
  const voices = function (opts) {
    const env = unlocked();
    const waves = env.TG.Audio._internals.graph().waves;
    const from = nodeCount(env);
    env.TG.Audio.music('boss2', opts);
    run(env, 60 * 3);
    const seen = { riff: {}, p2: {}, bass: {} };
    createdSince(env, from).forEach(function (n) {
      if (n.kind !== 'oscillator') return;
      const hz = n.frequency.events[0].value.toFixed(1);
      if (n.periodicWave === waves.p12) seen.riff[hz] = true;
      else if (n.periodicWave === waves.p50) seen.p2[hz] = true;
      else if (n.type === 'triangle') seen.bass[hz] = true;
    });
    const list = function (set) { return Object.keys(set).map(Number).sort(function (a, b) { return a - b; }).join(' '); };
    return { riff: list(seen.riff), p2: list(seen.p2), bass: list(seen.bass) };
  };
  const hz = function (midi) { return (440 * Math.pow(2, (midi - 69) / 12)).toFixed(1); };
  const before = voices({}), after = voices({ tempo: 176, p2Octave: 12 });
  if (before.p2 !== Number(hz(55)) + ' ' + Number(hz(67))) return 'pulse 2 before: ' + before.p2;
  if (after.p2 !== Number(hz(67)) + ' ' + Number(hz(79))) return 'pulse 2 in phase 3: ' + after.p2;
  if (!before.riff || !before.bass) return 'no riff or no bass';
  return (before.riff === after.riff && before.bass === after.bass) || 'the riff or the bass moved';
});

check('the music and the boss of js/levels/level2.js are the ones these checks play: its tracks, each section\'s music with the arena\'s phase3, and the boss kind ratchet; Level 1\'s boss is the baron and its arena names no phase3', function () {
  const env = stubs.load({ files: FILES.concat(['js/levels/level1.js', 'js/levels/level2.js']) });
  const one = env.TG.Levels[1], two = env.TG.Levels[2];
  const bad = [];
  if (!same(two.theme.music, L2_MUSIC)) bad.push('theme.music ' + JSON.stringify(two.theme.music));
  two.sections.concat([two.arena]).forEach(function (sec, i) {
    const want = L2_SECTIONS[i];
    if (sec.name !== want.name || sec.stage !== want.stage || sec.palette !== want.palette || !same(sec.music, want.music)) {
      bad.push('section ' + i + ': ' + JSON.stringify({ name: sec.name, stage: sec.stage, palette: sec.palette, music: sec.music }));
    }
  });
  if (two.boss.kind !== 'ratchet') bad.push('the boss of Level 2 is ' + two.boss.kind);
  if (one.boss.kind !== 'baron' || one.arena.music.phase3 !== undefined) bad.push('Level 1: boss ' + one.boss.kind + ', phase3 ' + JSON.stringify(one.arena.music.phase3));
  return bad.length ? bad.join('; ') : true;
});

// =================================================================================================
// Lady Ratchet's sounds (LEVEL2 10.4, 10.5, 10.7, 11.3)
// =================================================================================================
//
// The simulation is not loaded here. TG.Audio reads whose fight it is from TG.Game.state.level.boss.kind
// and the volley from TG.Game.state.boss.volley, so a stand-in TG.Game holds both, and the boss events are
// emitted by hand as js/boss.js emits them.

const G5 = 440 * Math.pow(2, 10 / 12), D5 = 440 * Math.pow(2, 5 / 12), C5 = 440 * Math.pow(2, 3 / 12), E5 = 440 * Math.pow(2, 7 / 12);
const SFX_LEAD = 0.003;   // s, a sound effect starts this far ahead of the audio clock

// A game in the arena. `kind` is the boss kind of the level data: undefined for a level with no boss
// block, null for no level at all. `hits` of the `thrown` entries of the volley were typed.
function arena(env, kind, hits, thrown) {
  const toLaunch = [];
  for (let i = 0; i < (thrown || 0); i++) toLaunch.push('rock');
  env.TG.Game = { state: {
    screen: 'boss', entities: [],
    level: kind === null ? null : kind === undefined ? {} : { boss: { kind: kind } },
    boss: { phase: 1, volley: { toLaunch: toLaunch, launched: toLaunch.length, sinceLaunch: 0, hits: hits || 0 } }
  } };
  return env;
}

// What the sources made since node `from` play, in the order they were made, with every time counted
// from `t0`: the voice (p12, p25, p50, triangle, nz-l, nz-s), the pitch events (the frequency of an
// oscillator, the rate of a noise) and the notes. A note runs from an envelope's start at zero to the
// event before the next start: [at, length, peak].
function shapeSince(env, from, t0) {
  const g = env.TG.Audio._internals.graph();
  const r = function (x) { return Math.round(x * 1e6) / 1e6; };
  return createdSince(env, from).filter(function (n) { return n.kind === 'oscillator' || n.kind === 'bufferSource'; }).map(function (n) {
    const voice = n.kind === 'bufferSource' ? (n.buffer === g.noise.short ? 'nz-s' : 'nz-l')
      : n.periodicWave === g.waves.p12 ? 'p12' : n.periodicWave === g.waves.p25 ? 'p25' : n.periodicWave === g.waves.p50 ? 'p50' : n.type;
    const pitch = (n.kind === 'oscillator' ? n.frequency : n.playbackRate).events.map(function (e) {
      return [e.type.replace('ValueAtTime', '').replace('RampTo', ''), r(e.value), r(e.time - t0)];
    });
    const ev = n.connections[0].gain.events;
    const notes = [];
    ev.forEach(function (e, i) {
      if (e.type === 'setValueAtTime' && e.value === 0) notes.push({ at: e.time, end: e.time, peak: 0 });
      const note = notes[notes.length - 1];
      note.end = e.time;
      note.peak = Math.max(note.peak, e.value);
      if (i === ev.length - 1 && e.value !== 0) note.peak = NaN;      // an envelope must end at zero
    });
    return { voice: voice, pitch: pitch, notes: notes.map(function (x) { return [r(x.at - t0), r(x.end - x.at), r(x.peak)]; }), events: ev };
  });
}

// The shape of one sound played with TG.Audio.sfx in a fresh context, and the level of its voice.
function shapeOf(name, opts) {
  const env = unlocked();
  const from = nodeCount(env);
  env.TG.Audio.sfx(name, opts);
  const nodes = createdSince(env, from);
  const shape = shapeSince(env, from, SFX_LEAD);
  const voice = voiceGainOf(nodes, env.TG.Audio._internals.levelOf(name));
  return { shape: shape, text: JSON.stringify(shape.map(function (s) { return [s.voice, s.pitch, s.notes]; })), level: voice ? voice.gain.value : null };
}

// The low points of a tremolo between the first and the last event of an envelope: [times, values].
function lows(events, t0) {
  const times = [], values = [];
  for (let i = 1; i < events.length - 1; i++) {
    if (events[i].value < events[i - 1].value && events[i].value < events[i + 1].value) {
      times.push(events[i].time - t0);
      values.push(events[i].value);
    }
  }
  return [times, values];
}

check('toot is a whistle: one P25 note held on G5 for 120 ms that falls to D5 over the next 80 ms with no break, over a 60 ms puff of long noise; click is 15 ms of P12 at 1200 Hz; both at the sound effect level', function () {
  const toot = shapeOf('toot'), click = shapeOf('click');
  const want = JSON.stringify([
    ['p25', [['set', Math.round(G5 * 1e6) / 1e6, 0], ['set', Math.round(G5 * 1e6) / 1e6, 0.12], ['exponential', Math.round(D5 * 1e6) / 1e6, 0.2]], [[0, 0.2, 1]]],
    ['nz-l', [['set', 1, 0]], [[0, 0.06, 0.5]]]
  ]);
  if (toot.text !== want) return 'toot is ' + toot.text;
  // One attack and one release: the whistle does not dip between the held note and the fall.
  const zeros = toot.shape[0].events.filter(function (e) { return e.value === 0; }).length;
  if (zeros !== 2) return 'the whistle\'s envelope touches zero ' + zeros + ' times';
  if (click.text !== JSON.stringify([['p12', [['set', 1200, 0]], [[0, 0.015, 1]]]])) return 'click is ' + click.text;
  const last = click.shape[0].events[click.shape[0].events.length - 1];
  if (last.type !== 'linearRampToValueAtTime' || click.shape[0].events.length !== 3) return 'click does not decay: ' + JSON.stringify(click.shape[0].events);
  return (Math.abs(toot.level - 0.30) < 1e-9 && Math.abs(click.level - 0.30) < 1e-9) || 'levels ' + toot.level + ' and ' + click.level;
});

check('the ratchet variants of the six boss sounds are the recipes of LEVEL2 11.3: the cackle, the three clicks and the whirr for the telegraph time, the spring, the gear clunk, the blow with the tink and the clatter, the wind-down and the spring of the key', function () {
  const bad = [];
  const is = function (name, got, want) { if (got !== JSON.stringify(want)) bad.push(name + ' is ' + got); };
  const r = function (x) { return Math.round(x * 1e6) / 1e6; };

  // boss_laugh: P50 C5 D5 E5 D5 C5, 40 ms on and 30 ms off.
  const notes = [C5, D5, E5, D5, C5];
  is('boss_laugh', shapeOf('boss_laugh', RATCHET).text, [['p50',
    notes.map(function (hz, i) { return ['set', r(hz), r(0.07 * i)]; }),
    notes.map(function (hz, i) { return [r(0.07 * i), 0.04, 1]; })]]);

  // boss_telegraph: three clicks 120 ms apart, each the sound `click`, then a P12 whirr at 440 Hz that
  // pulses 20 times a second for the rest of the telegraph time. The level data's telegraphs are 1.4,
  // 1.0 and 0.7 s and its double attack gaps 1.2 and 0.9 s (nominal; longer under a lower assist).
  const click = shapeOf('click').shape[0];
  [0.7, 0.9, 1.0, 1.2, 1.4, 2.0].forEach(function (seconds) {
    const t = shapeOf('boss_telegraph', { variant: 'ratchet', duration: seconds });
    const label = 'boss_telegraph for ' + seconds + ' s';
    if (t.shape.length !== 2 || t.shape[0].voice !== 'p12' || t.shape[1].voice !== 'p12') { bad.push(label + ' is ' + t.text); return; }
    const clicks = t.shape[0], whirr = t.shape[1];
    if (JSON.stringify(clicks.notes) !== JSON.stringify([[0, 0.015, 1], [0.12, 0.015, 1], [0.24, 0.015, 1]]) ||
        JSON.stringify(clicks.pitch) !== JSON.stringify([['set', 1200, 0], ['set', 1200, 0.12], ['set', 1200, 0.24]])) bad.push(label + ': clicks ' + JSON.stringify([clicks.pitch, clicks.notes]));
    // Each click has the envelope of `click`, moved to its place.
    const shapeAt = function (events, t0) { return JSON.stringify(events.map(function (e) { return [e.type, r(e.value), r(e.time - t0)]; })); };
    for (let k = 0; k < 3; k++) {
      if (shapeAt(clicks.events.slice(3 * k, 3 * k + 3), SFX_LEAD + 0.12 * k) !== shapeAt(click.events, SFX_LEAD)) bad.push(label + ': click ' + k + ' is not the sound click');
    }
    if (JSON.stringify(whirr.pitch) !== JSON.stringify([['set', 440, 0.36]]) || JSON.stringify(whirr.notes) !== JSON.stringify([[0.36, r(seconds - 0.36), 1]])) {
      bad.push(label + ': whirr ' + JSON.stringify([whirr.pitch, whirr.notes]));
    }
    const low = lows(whirr.events, SFX_LEAD);
    const gaps = low[0].slice(1).map(function (at, i) { return r(at - low[0][i]); });
    if (low[0].length < 20 * (seconds - 0.36) - 2 || gaps.some(function (gap) { return gap !== 0.05; }) || low[1].some(function (v) { return v !== 0; })) {
      bad.push(label + ': the whirr has ' + low[0].length + ' pulses, ' + JSON.stringify(gaps.slice(0, 3)) + ' apart, down to ' + low[1][0]);
    }
  });
  // No duration: 1 s, as the Baron's.
  const plain = shapeOf('boss_telegraph', RATCHET).shape[1];
  if (!plain || JSON.stringify(plain.notes) !== JSON.stringify([[0.36, 0.64, 1]])) bad.push('boss_telegraph with no duration: the whirr is ' + (plain ? JSON.stringify(plain.notes) : 'missing'));

  // boss_throw: a spring, P25 300 to 900 Hz over 80 ms.
  is('boss_throw', shapeOf('boss_throw', RATCHET).text, [['p25', [['set', 300, 0], ['exponential', 900, 0.08]], [[0, 0.08, 1]]]]);

  // boss_stomp: a gear clunk, 80 ms of long noise at a low rate and a 60 ms triangle at 90 Hz.
  is('boss_stomp', shapeOf('boss_stomp', RATCHET).text, [['nz-l', [['set', 0.15, 0]], [[0, 0.08, 1]]], ['triangle', [['set', 90, 0]], [[0, 0.06, 1]]]]);

  // boss_hit: 100 ms of long noise, then a glass tink (P12 2093 Hz, 200 ms, an exponential decay) over a
  // gear clatter (120 ms of short noise that steps down).
  const hit = shapeOf('boss_hit', RATCHET);
  is('boss_hit', hit.text, [
    ['nz-l', [['set', 0.5, 0]], [[0, 0.1, 1]]],
    ['p12', [['set', 2093, 0.1]], [[0.1, 0.2, 0.7]]],
    ['nz-s', [['set', 1, 0.1], ['set', 0.7, 0.14], ['set', 0.5, 0.18]], [[0.1, 0.12, 0.5]]]
  ]);
  if (hit.shape[1] && !hit.shape[1].events.some(function (e) { return e.type === 'exponentialRampToValueAtTime'; })) bad.push('the tink of boss_hit does not ring out');

  // boss_defeat: a P50 whirr winding down from 600 to 60 Hz over 1.2 s with a 10 Hz tremolo, then SPROING,
  // P25 200 to 1600 Hz over 120 ms.
  const defeat = shapeOf('boss_defeat', RATCHET);
  is('boss_defeat', defeat.text, [
    ['p50', [['set', 600, 0], ['exponential', 60, 1.2]], [[0, 1.2, 1]]],
    ['p25', [['set', 200, 1.2], ['exponential', 1600, 1.32]], [[1.2, 0.12, 1]]]
  ]);
  if (defeat.shape[0]) {
    const low = lows(defeat.shape[0].events, SFX_LEAD);
    const gaps = low[0].slice(1).map(function (at, i) { return r(at - low[0][i]); });
    if (low[0].length < 10 || gaps.some(function (gap) { return gap !== 0.1; }) || low[1].some(function (v) { return !(v > 0 && v < 1); })) {
      bad.push('the tremolo of boss_defeat: ' + low[0].length + ' lows ' + JSON.stringify(gaps.slice(0, 3)) + ' apart, down to ' + low[1][0]);
    }
  }
  return bad.length ? bad.join('; ') : true;
});

check('each ratchet variant is another sound than the Baron\'s at the same level; the Baron\'s is what plays with no variant, with his kind, with a kind that has no variants and for a sound that has none', function () {
  const bad = [];
  VARIANT_SOUNDS.forEach(function (name) {
    const baron = shapeOf(name, {}), hers = shapeOf(name, RATCHET);
    if (hers.text === baron.text) bad.push(name + ': the ratchet variant is the Baron\'s');
    if (hers.level !== baron.level || Math.abs(hers.level - 0.30) > 1e-9) bad.push(name + ' plays at ' + hers.level + ', the Baron\'s at ' + baron.level);
    ['baron', 'mole', 'toString', '__proto__', 7, null].forEach(function (variant) {
      if (shapeOf(name, { variant: variant }).text !== baron.text) bad.push(name + ' with variant ' + String(variant) + ' is not the Baron\'s');
    });
  });
  // The boss sounds with no variant, and a sound that is not a boss's.
  ['boss_rumble', 'boss_weak', 'boss_stun', 'jump'].forEach(function (name) {
    if (shapeOf(name, RATCHET).text !== shapeOf(name, {}).text) bad.push(name + ' has a ratchet variant');
  });
  return bad.length ? bad.join('; ') : true;
});

// The boss events that play one of the six sounds: [event, payload, sound, the options it is played with].
const BOSS_EVENTS = [
  ['attack:spawn', { id: 40, kind: 'shock', action: 'jump' }, 'boss_stomp', {}],
  ['boss:attack', { kind: 'shock', telegraph: 0.7 }, 'boss_telegraph', { duration: 0.7 }],
  ['boss:attack', { kind: 'pick', telegraph: 1.2 }, 'boss_telegraph', { duration: 1.2 }],
  ['boss:throw', { kind: 'rock', x: 0, y: 0 }, 'boss_throw', {}],
  ['boss:throw', { kind: 'pick', x: 0, y: 0 }, 'boss_throw', {}],
  ['boss:weakopen', { id: 1, word: 'escapement', window: 4 }, 'boss_laugh', {}],
  ['boss:weakclose', { completed: false }, 'boss_laugh', {}],
  ['boss:hit', { health: 5, maxHealth: 6, phase: 1, x: 0, y: 0 }, 'boss_hit', {}],
  ['boss:defeat', { x: 0, y: 0 }, 'boss_defeat', {}]
];

check('in a level whose boss kind is ratchet the boss events play her variants; with the kind baron, with no kind, no level or no game they play the Baron\'s, note for note as before', function () {
  const bad = [];
  // [what TG.Game is, the variant expected]
  const games = [
    ['kind ratchet', function (env) { arena(env, 'ratchet', 0, 2); }, RATCHET],
    ['kind baron', function (env) { arena(env, 'baron', 0, 2); }, {}],
    ['a kind with no variants', function (env) { arena(env, 'mole', 0, 2); }, {}],
    ['a level with no boss block', function (env) { arena(env, undefined, 0, 2); }, {}],
    ['no level', function (env) { arena(env, null, 0, 2); }, {}],
    ['a game with no state', function (env) { env.TG.Game = {}; }, {}],
    ['no game', function () {}, {}]
  ];
  games.forEach(function (game) {
    BOSS_EVENTS.forEach(function (row) {
      const env = unlocked();
      game[1](env);
      const from = nodeCount(env);
      emit(env, row[0], row[1]);
      const got = JSON.stringify(shapeSince(env, from, SFX_LEAD).map(function (s) { return [s.voice, s.pitch, s.notes]; }));
      const want = shapeOf(row[2], Object.assign({}, row[3], game[2])).text;
      if (got !== want) bad.push(game[0] + ', ' + row[0] + ' ' + JSON.stringify(row[1]) + ': ' + got.slice(0, 120));
      if (env.warnings.length || env.errors.length) bad.push(game[0] + ', ' + row[0] + ' wrote to the console: ' + env.warnings.concat(env.errors)[0]);
    });
  });
  return bad.length ? bad.length + ' differ: ' + bad.slice(0, 4).join('; ') : true;
});

check('the gauge\'s whistle: on boss:weakopen after a volley whose every entry was typed, toot plays 0.3 s after her laugh and boss_weak does not; after a volley with a miss, with nothing thrown, and in the Baron\'s fight, boss_weak plays as before', function () {
  // [boss kind, entries typed, entries thrown, the sound 0.3 s after the laugh]
  const cases = [
    ['ratchet', 2, 2, 'toot'],
    ['ratchet', 5, 5, 'toot'],
    ['ratchet', 3, 2, 'toot'],            // the rule of openWeakPoint in js/boss.js is hits >= length
    ['ratchet', 1, 2, 'boss_weak'],
    ['ratchet', 0, 3, 'boss_weak'],
    ['ratchet', 0, 0, 'boss_weak'],       // and length > 0
    ['baron', 2, 2, 'boss_weak'],         // Level 1 has the same window rule and no gauge
    ['baron', 1, 2, 'boss_weak'],
    [undefined, 2, 2, 'boss_weak']
  ];
  const bad = [];
  cases.forEach(function (c) {
    const env = arena(unlocked(), c[0], c[1], c[2]);
    const I = env.TG.Audio._internals;
    const label = String(c[0]) + ' ' + c[1] + '/' + c[2];
    const t0 = env.audio.contexts[0].currentTime;
    emit(env, 'boss:weakopen', { id: 1, word: 'escapement', window: 4 });
    if (!same(Array.prototype.slice.call(I.sfxLog), ['boss_laugh'])) bad.push(label + ' at once: ' + I.sfxLog.join(','));
    const from = nodeCount(env);
    run(env, 60);
    if (!same(Array.prototype.slice.call(I.sfxLog), ['boss_laugh', c[3]])) bad.push(label + ': ' + I.sfxLog.join(','));
    const want = shapeOf(c[3], {}).text;
    const got = JSON.stringify(shapeSince(env, from, t0 + 0.3).map(function (s) { return [s.voice, s.pitch, s.notes]; }));
    if (got !== want) bad.push(label + ': 0.3 s after the laugh ' + got.slice(0, 100));
  });
  // A boss with no volley yet, and a state with no boss: boss_weak, and nothing thrown or logged.
  [function (s) { s.boss.volley = null; }, function (s) { s.boss = null; }].forEach(function (change, i) {
    const env = arena(unlocked(), 'ratchet', 2, 2);
    change(env.TG.Game.state);
    emit(env, 'boss:weakopen', { id: 1, word: 'escapement', window: 4 });
    run(env, 60);
    if (!same(Array.prototype.slice.call(env.TG.Audio._internals.sfxLog), ['boss_laugh', 'boss_weak']) || env.errors.length || env.warnings.length) {
      bad.push('guard ' + i + ': ' + env.TG.Audio._internals.sfxLog.join(',') + ' ' + env.errors.concat(env.warnings).join(';'));
    }
  });
  return bad.length ? bad.join('; ') : true;
});

check('each letter of Lady Ratchet\'s finisher word plays click, before the letter\'s own sound: the first, the ones between and the last; no other word clicks, and the Baron\'s finisher does not', function () {
  const hit = function (kind, index, length) {
    return { target: {}, id: 1, kind: kind, ch: 'a', index: index, length: length, complete: index === length - 1, x: 0, y: 0 };
  };
  // [boss kind, payload, the sounds]
  const cases = [
    ['ratchet', hit('finisher', 0, 12), ['click']],
    ['ratchet', hit('finisher', 5, 12), ['click', 'key_ok']],
    ['ratchet', hit('finisher', 11, 12), ['click', 'word_clear']],
    ['ratchet', hit('core', 5, 10), ['key_ok']],
    ['ratchet', hit('core', 9, 10), ['word_clear']],
    ['ratchet', hit('rock', 3, 6), ['key_ok']],
    ['ratchet', hit('digby', 0, 6), []],
    ['baron', hit('finisher', 0, 12), []],
    ['baron', hit('finisher', 5, 12), ['key_ok']],
    ['baron', hit('finisher', 11, 12), ['word_clear']],
    [null, hit('finisher', 5, 12), ['key_ok']]
  ];
  const bad = [];
  cases.forEach(function (c) {
    const env = arena(unlocked(), c[0], 0, 0);
    const I = env.TG.Audio._internals;
    emit(env, 'type:hit', c[1]);
    if (!same(Array.prototype.slice.call(I.sfxLog), c[2])) bad.push(String(c[0]) + ' ' + c[1].kind + ' letter ' + c[1].index + ': ' + (I.sfxLog.join(',') || 'nothing'));
  });
  return bad.length ? bad.join('; ') : true;
});

check('click has the takeover priority of the sounds that repeat all the time: it is not played over three rewards, and the letter\'s key_ok takes its voice when the other two are busy', function () {
  const env = arena(unlocked(), 'ratchet', 0, 0);
  const I = env.TG.Audio._internals;
  const a = playVoice(env, 'one_up'), b = playVoice(env, 'streak'), c = playVoice(env, 'checkpoint');
  if (!a || !b || !c) return 'voice gains not found';
  I.sfxLog.length = 0;
  env.TG.Audio.sfx('click');
  if (I.sfxLog.length || fadedToZero(a) || fadedToZero(b) || fadedToZero(c)) return 'click played over three rewards';
  // The finisher's own sound (boss_stun) and one more hold two voices: click takes the third and key_ok,
  // asked for after it in the same step, takes that voice from it. The typing sound is the one heard.
  const env2 = arena(unlocked(), 'ratchet', 0, 0);
  const I2 = env2.TG.Audio._internals;
  const stun = playVoice(env2, 'boss_stun'), rumble = playVoice(env2, 'boss_rumble');
  I2.sfxLog.length = 0;
  const from = nodeCount(env2);
  emit(env2, 'type:hit', { target: {}, id: 1, kind: 'finisher', ch: 'a', index: 3, length: 12, complete: false, x: 0, y: 0 });
  if (!same(Array.prototype.slice.call(I2.sfxLog), ['click', 'key_ok'])) return 'the letter played ' + I2.sfxLog.join(',');
  // A voice that was taken over: a gain made at the sound effect level and then faded from it to zero.
  const faded = createdSince(env2, from).filter(function (n) {
    return n.kind === 'gain' && fadedToZero(n) && n.gain.events[0].type === 'setValueAtTime' && Math.abs(n.gain.events[0].value - 0.30) < 1e-9;
  });
  if (faded.length !== 1) return faded.length + ' voices made by the letter were taken over, 1 expected (click\'s)';
  return (fadedToZero(stun) === 0 && fadedToZero(rumble) === 0) || 'key_ok took the voice of a boss sound';
});

// The boss intro as js/game.js and js/boss.js run it: one frame of 1/60 s moves boss.stateT on by as much.
function introFrames(env, frames) {
  const boss = env.TG.Game.state.boss;
  for (let i = 0; i < frames; i++) {
    boss.stateT += 1 / 60;
    run(env, 1);
  }
}

// A game in the boss intro of `seconds`, at its start.
function intro(env, kind, seconds) {
  arena(env, kind, 0, 0);
  const s = env.TG.Game.state;
  s.screen = 'bossIntro';
  Object.assign(s.boss, { state: 'intro', stateT: 0, introTime: seconds });
  return env;
}

check('in Lady Ratchet\'s long intro her key clicks three times, at 0.55, 0.6 and 0.65 of the intro (2.2, 2.4 and 2.6 s of its 4); a pause adds none; the short intro after a continue, the Baron\'s intro and the fight have none; the next long intro has three again', function () {
  const bad = [];
  const env = intro(unlocked(), 'ratchet', 4);
  const I = env.TG.Audio._internals;
  if (!same(Array.prototype.slice.call(I.INTRO_CLICKS), [0.55, 0.6, 0.65])) return 'the clicks are at ' + JSON.stringify(I.INTRO_CLICKS);
  const t0 = env.audio.contexts[0].currentTime;
  const from = nodeCount(env);
  introFrames(env, 135);                     // 2.25 s: past the first click
  if (played(env, 'click') !== 1) bad.push(played(env, 'click') + ' clicks by 2.25 s');
  // The pause screen: the simulation stands still and so does boss.stateT.
  env.TG.Game.state.screen = 'paused';
  run(env, 90);
  env.TG.Game.state.screen = 'bossIntro';
  if (played(env, 'click') !== 1) bad.push('a click on the pause screen');
  introFrames(env, 105);                     // to the end of the 4 s
  if (!same(Array.prototype.slice.call(I.sfxLog), ['click', 'click', 'click'])) bad.push('the intro played ' + (I.sfxLog.join(',') || 'nothing'));
  // Each on the frame the intro passes its mark, 132, 144 and 156 frames in (or the frame after: sixty
  // sixtieths do not add up to exactly 1), with the 1.5 s of the pause before the second and the third
  // and the 3 ms lead of every sound effect.
  const starts = createdSince(env, from).filter(function (n) { return n.kind === 'oscillator'; }).map(function (n) { return n.startTime - t0 - SFX_LEAD; });
  [132 / 60, 144 / 60 + 1.5, 156 / 60 + 1.5].forEach(function (at, k) {
    if (!(starts[k] > at - 1e-6 && starts[k] < at + 1 / 60 + 1e-6)) bad.push('click ' + k + ' at ' + (starts[k] === undefined ? 'no time' : starts[k].toFixed(4)) + ' s, expected ' + at.toFixed(4));
  });
  // The fight that follows: none, wherever boss.stateT stands.
  Object.assign(env.TG.Game.state, { screen: 'boss' });
  Object.assign(env.TG.Game.state.boss, { state: 'volley', stateT: 0 });
  introFrames(env, 240);
  if (played(env, 'click') !== 3) bad.push('a click in the fight');
  // A continue: the short intro has no gesture.
  Object.assign(env.TG.Game.state, { screen: 'bossIntro' });
  Object.assign(env.TG.Game.state.boss, { state: 'intro', stateT: 0, introTime: env.TG.C.BOSS_INTRO_SHORT });
  introFrames(env, 90);
  if (played(env, 'click') !== 3) bad.push('a click in the short intro');
  // The next run's long intro: three more.
  Object.assign(env.TG.Game.state.boss, { state: 'intro', stateT: 0, introTime: env.TG.C.BOSS_INTRO_TIME });
  introFrames(env, 240);
  if (played(env, 'click') !== 6) bad.push(played(env, 'click') + ' clicks after a second long intro, 6 expected');
  // The Baron's intro, and an intro with no game behind it.
  [['baron', 4], [undefined, 4], [null, 4]].forEach(function (c) {
    const other = intro(unlocked(), c[0], c[1]);
    introFrames(other, 240);
    if (other.TG.Audio._internals.sfxLog.length) bad.push('the intro of ' + String(c[0]) + ' played ' + other.TG.Audio._internals.sfxLog.join(','));
  });
  if (env.warnings.length || env.errors.length) bad.push('console: ' + env.warnings.concat(env.errors)[0]);
  return bad.length ? bad.join('; ') : true;
});

// The three moments are written twice: in js/audio.js, which plays the clicks, and in js/render.js, which
// steps her key at them (LEVEL2 10.1). Neither file loads the other, so this reads the list from the
// source of js/render.js. If the gesture's timing changes there, change INTRO_CLICKS in js/audio.js with it.
(function () {
  const title = 'the clicks of Lady Ratchet\'s intro are at the moments js/render.js steps her key: INTRO_CLICKS is the same list in both files';
  let text;
  try { text = require('fs').readFileSync(require('path').join(stubs.ROOT, 'js', 'render.js'), 'utf8'); } catch (e) { text = null; }
  if (text === null) { console.log('skip - ' + title + ' (js/render.js is not present)'); return; }
  check(title, function () {
    const m = /\bvar INTRO_CLICKS = \[([^\]]*)\]/.exec(text);
    if (!m) return 'js/render.js has no "var INTRO_CLICKS = [...]": the clicks of js/audio.js have nothing to follow';
    const drawn = m[1].split(',').map(function (x) { return Number(x.trim()); });
    const env = stubs.load({ files: FILES });
    const heard = Array.prototype.slice.call(env.TG.Audio._internals.INTRO_CLICKS);
    return same(drawn, heard) || 'js/render.js steps the key at ' + JSON.stringify(drawn) + ' and js/audio.js clicks at ' + JSON.stringify(heard);
  });
})();

check('boss:defeat starts the victory fanfare when the defeat sound ends: 1.22 s after the Baron\'s and 1.82 s after Lady Ratchet\'s, and after the same wait with sound effects off', function () {
  const bad = [];
  // [boss kind, sound effects on, seconds from boss:defeat to the fanfare]
  [['baron', true, 1.22 + SFX_LEAD], ['ratchet', true, 1.82 + SFX_LEAD], ['baron', false, 1.22], ['ratchet', false, 1.82], [null, true, 1.22 + SFX_LEAD]].forEach(function (c) {
    const env = arena(unlocked(), c[0], 0, 0);
    const I = env.TG.Audio._internals;
    run(env, 30);
    env.TG.Audio.setEnabled('sfx', c[1]);
    const t0 = env.audio.contexts[0].currentTime;
    const from = nodeCount(env);
    emit(env, 'boss:defeat', { x: 0, y: 0 });
    const s = I.sequencer('loop');
    const label = String(c[0]) + (c[1] ? '' : ' with sound effects off');
    if (s.name !== 'victory' || !s.playing || Math.abs(s.nextTime - t0 - c[2]) > 1e-6) bad.push(label + ': victory at +' + (s.nextTime - t0).toFixed(4) + ' s');
    if (!c[1] && createdSince(env, from).some(function (n) { return n.kind === 'oscillator' || n.kind === 'bufferSource'; })) bad.push(label + ': a sound was played');
    // The fanfare's first note is at that moment and not before.
    run(env, 60 * 3);
    const first = Math.min.apply(null, musicNotes(env, createdSince(env, from)).map(function (n) { return n.startTime; }));
    if (Math.abs(first - t0 - c[2]) > 1e-6) bad.push(label + ': the first note of the fanfare at +' + (first - t0).toFixed(4) + ' s');
  });
  return bad.length ? bad.join('; ') : true;
});

// =================================================================================================
// Summary
// =================================================================================================

console.log('');
console.log((failed === 0 ? 'PASS' : 'FAIL') + ' - test-audio: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
