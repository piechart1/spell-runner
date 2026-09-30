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
  'ink_drop', 'power_get', 'shield_up', 'shield_break', 'slow_on', 'slow_off', 'ink_blast', 'one_up',
  'hurt', 'fall', 'rescue', 'checkpoint', 'warn', 'urgent_tick', 'boss_rumble', 'boss_laugh',
  'boss_telegraph', 'boss_throw', 'boss_stomp', 'boss_weak', 'boss_hit', 'boss_stun', 'boss_defeat',
  'ui_move', 'ui_select', 'ui_back', 'pause', 'tally_tick', 'stamp', 'count_tick', 'start'
];
const TRACK_NAMES = ['title', 'level1', 'boss1', 'victory', 'results', 'gameover', 'jingle_ready', 'jingle_checkpoint'];
const LOOPS = ['title', 'level1', 'boss1', 'results'];
const ONCE = ['victory', 'gameover', 'jingle_ready', 'jingle_checkpoint'];

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
  SFX_NAMES.forEach(function (name) {
    const env = unlocked();
    const from = nodeCount(env);
    env.TG.Audio.sfx(name, { step: 4, duration: 0.7 });
    const problems = envelopeProblems(createdSince(env, from));
    if (problems.length) bad.push(name + ': ' + problems[0]);
  });
  return bad.length ? bad.join('; ') : true;
});

check('every sound effect uses only the six voices of DESIGN 15.1 (P12, P25, P50, TRI, NZ-L, NZ-S)', function () {
  const env = unlocked();
  const bad = [];
  SFX_NAMES.forEach(function (name) {
    const from = nodeCount(env);
    env.TG.Audio.sfx(name, { step: 1 });
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
  SFX_NAMES.forEach(function (name) {
    const p = sfxVoicePeak(env, name, { step: 9, duration: 1.5 });
    if (p > worstVoice) { worstVoice = p; worstName = name; }
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

check('pausing loses no music: after resume the loop continues with the first step that had not sounded at the pause', function () {
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
  // A music note: source -> envelope gain -> channel gain -> duck. Sound effects (the pause sound)
  // go to a voice gain instead. Checked while the paths are still connected.
  function musicNotes(e, list) {
    const duck = e.TG.Audio._internals.graph().duck;
    return list.filter(function (n) {
      if (n.kind !== 'oscillator' && n.kind !== 'bufferSource') return false;
      const g = n.connections[0];
      const ch = g && g.connections[0];
      return !!(ch && ch.connections.indexOf(duck) !== -1);
    });
  }
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

check('a sound that repeats all the time never takes over a reward: key_ok and ink_drop are dropped while three rewards play; a reward takes over the earliest reward', function () {
  const env = unlocked();
  const I = env.TG.Audio._internals;
  const a = playVoice(env, 'one_up'), b = playVoice(env, 'streak'), c = playVoice(env, 'checkpoint');
  if (!a || !b || !c) return 'voice gains not found';
  I.sfxLog.length = 0;
  env.TG.Audio.sfx('key_ok', { step: 2 });
  env.TG.Audio.sfx('ink_drop');
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
// Summary
// =================================================================================================

console.log('');
console.log((failed === 0 ? 'PASS' : 'FAIL') + ' - test-audio: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
