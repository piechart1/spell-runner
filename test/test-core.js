// test/test-core.js
// Tests for js/core.js and test/stubs.js (WP0). Run from the project root: node test/test-core.js
//
// Besides the acceptance checks of CONTRACT section 12 (WP0), this file compares the tables that
// core.js transcribes (TG.C, the palette, the difficulty entries, the event names and the sprite
// manifest) with the text of docs/CONTRACT.md and docs/DESIGN.md. Those checks are named "doc: ...".
// They are skipped, with a line saying so, if the documents are not present.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
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

function skip(description) {
  console.log('skip - ' + description);
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

function throws(fn) {
  try {
    fn();
  } catch (e) {
    return true;
  }
  return false;
}

function noThrow(fn) {
  try {
    fn();
    return true;
  } catch (e) {
    return 'threw: ' + e.message;
  }
}

const CORE = ['js/core.js'];

// =================================================================================================
// Loading
// =================================================================================================

check('stubs.FILES lists the 20 files of CONTRACT section 1 in load order', function () {
  return stubs.FILES.length === 20 && stubs.FILES[0] === 'js/core.js' && stubs.FILES[12] === 'js/levels/level1.js' &&
    stubs.FILES[17] === 'js/board.js' && stubs.FILES[19] === 'js/main.js' && fs.existsSync(path.join(stubs.ROOT, 'js', 'core.js'));
});

check('stubs.load() with the default file list succeeds and reports the files that do not exist as missing', function () {
  const env = stubs.load();
  const existing = stubs.FILES.filter(function (f) { return fs.existsSync(path.join(stubs.ROOT, f)); });
  const absent = stubs.FILES.filter(function (f) { return !fs.existsSync(path.join(stubs.ROOT, f)); });
  return same(env.loaded, existing) && same(env.missing, absent) && env.loaded.indexOf('js/core.js') === 0 &&
    env.loaded.length + env.missing.length === 20;
});

check('stubs.load with core.js and 19 names that do not exist loads core.js and reports the rest as missing', function () {
  const files = stubs.FILES.map(function (f, i) { return i === 0 ? f : 'js/absent/' + path.basename(f); });
  const env = stubs.load({ files: files });
  return same(env.loaded, ['js/core.js']) && env.missing.length === 19 && typeof env.TG === 'object';
});

check('stubs.load with allowMissing false throws and names the missing file', function () {
  try {
    stubs.load({ files: ['js/core.js', 'js/no-such-file.js'], allowMissing: false });
  } catch (e) {
    return e.message.indexOf('js/no-such-file.js') !== -1;
  }
  return false;
});

check('a file that throws while loading makes load throw with the file name in the message', function () {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'tg-stubs-'));
  const file = path.join(dir, 'broken.js');
  fs.writeFileSync(file, 'throw new Error("boom");\n');
  const rel = path.relative(stubs.ROOT, file);
  try {
    stubs.load({ files: ['js/core.js', rel] });
  } catch (e) {
    return e.message.indexOf('broken.js') !== -1 && e.message.indexOf('boom') !== -1;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return false;
});

check('loading core.js makes no canvas, audio or storage calls and sets no timers', function () {
  const env = stubs.load({ files: CORE });
  return env.canvasCalls.count === 0 && env.audio.contexts.length === 0 && env.audio.nodes === 0 &&
    env.storage.size === 0 && env.raf.length === 0 && env.timers.length === 0 &&
    Object.keys(env.listeners).length === 0 && env.warnings.length === 0 && env.errors.length === 0;
});

check('core.js loads when reading window.localStorage throws and when it is undefined', function () {
  const a = stubs.load({ files: CORE, storage: 'throw' });
  const b = stubs.load({ files: CORE, storage: 'none' });
  return typeof a.TG.Save === 'object' && typeof b.TG.Save === 'object';
});

check('core.js does not use Math.random, Date, performance.now, timers or the DOM', function () {
  const source = fs.readFileSync(path.join(stubs.ROOT, 'js', 'core.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"])\/\/.*$/gm, '$1');
  const banned = [/Math\.random/, /\bDate\b/, /performance\.now/, /setTimeout/, /setInterval/,
    /requestAnimationFrame/, /\bdocument\b/, /AudioContext/, /\bimport\b/, /\brequire\s*\(/];
  const found = banned.filter(function (re) { return re.test(source); });
  return found.length === 0 ? true : 'found ' + found.join(', ');
});

check('core.js is one IIFE that attaches to TG and leaves no other global behind', function () {
  const env = stubs.load({ files: [] });
  const before = Object.keys(env.window);
  const env2 = stubs.load({ files: CORE });
  const after = Object.keys(env2.window).filter(function (k) { return before.indexOf(k) === -1; });
  return same(after, ['TG']);
});

const env = stubs.load({ files: CORE });
const TG = env.TG;

check('core.js defines every module and registry of CONTRACT section 1', function () {
  const names = ['C', 'PAL', 'PAL_KEYS', 'COLOR', 'Util', 'Events', 'RNG', 'Save', 'Difficulty', 'Sprites', 'Remaps', 'Backdrops', 'Levels'];
  const absent = names.filter(function (n) { return TG[n] === undefined; });
  return absent.length === 0 ? true : 'missing ' + absent.join(', ');
});

check('env.window.TG === env.TG', function () {
  return env.window.TG === env.TG && env.run('TG') === env.TG;
});

// =================================================================================================
// Constants and palette
// =================================================================================================

check('TG.C is frozen, and so are its arrays and objects', function () {
  const C = TG.C;
  return Object.isFrozen(C) && Object.isFrozen(C.SIM_SCREENS) && Object.isFrozen(C.MIN_SPEED) &&
    Object.isFrozen(C.SHOCK_WIN) && Object.isFrozen(C.MULT_STEPS);
});

check('TG.C has the key values of CONTRACT section 3', function () {
  const C = TG.C;
  return C.VERSION === '1.0.0' && C.STORAGE_KEY === 'spellrunner.v1' && C.W === 384 && C.H === 216 && C.TILE === 16 &&
    C.GROUND_Y === 184 && C.PLAY_TOP === 24 && C.HERO_SCREEN_X === 96 && C.BUTTON_SPACE === 72 && C.DT === 1 / 60 &&
    C.RUN_SPEED === 64 && C.JUMP_TIME === 0.75 && C.JUMP_DIST === C.RUN_SPEED * C.JUMP_TIME && C.COYOTE === 0.1 &&
    C.SLIDE_TIME === 0.875 && C.MAX_LIVES === 9 && C.MAX_SHIELD === 2 && C.SCORE_SLOTS === 5 &&
    same(C.SIM_SCREENS, ['playing', 'lifeLost', 'bossIntro', 'boss', 'levelComplete']) &&
    same(C.MIN_SPEED, { dawdle: 6, hoppet: 20, buzzle: 28 }) && same(C.MULT_STEPS, [0, 3, 6, 10, 15]);
});

check('TG.PAL has 32 hex strings, TG.PAL_KEYS has 32 distinct keys, TG.COLOR has 32 names for 0 to 31', function () {
  const hexOk = TG.PAL.every(function (h) { return /^#[0-9A-F]{6}$/.test(h); });
  const keys = TG.PAL_KEYS.split('');
  const distinct = keys.filter(function (k, i) { return keys.indexOf(k) === i; });
  const indices = Object.keys(TG.COLOR).map(function (n) { return TG.COLOR[n]; }).sort(function (a, b) { return a - b; });
  return TG.PAL.length === 32 && hexOk && TG.PAL_KEYS === '0123456789abcdefghijklmnopqrstuv' && distinct.length === 32 &&
    same(indices, Array.from({ length: 32 }, function (_, i) { return i; })) &&
    Object.isFrozen(TG.PAL) && Object.isFrozen(TG.COLOR) &&
    TG.PAL[TG.COLOR.INK] === '#0F0F1B' && TG.PAL[TG.COLOR.GOLD] === '#F8C020' && TG.PAL[TG.COLOR.PEACH] === '#F8B888';
});

// =================================================================================================
// TG.Util
// =================================================================================================

check('Util.clamp, lerp and approach', function () {
  const U = TG.Util;
  return U.clamp(5, 0, 3) === 3 && U.clamp(-1, 0, 3) === 0 && U.clamp(2, 0, 3) === 2 &&
    U.lerp(10, 20, 0.25) === 12.5 && U.lerp(4, 8, 0) === 4 && U.lerp(4, 8, 1) === 8 &&
    U.approach(0, 1, 0.25) === 0.25 && U.approach(0.9, 1, 0.25) === 1 && U.approach(1, 0, 0.25) === 0.75 &&
    U.approach(0.1, 0, 0.25) === 0 && U.approach(3, 3, 1) === 3;
});

check('Util.pad, round10 and overlap', function () {
  const U = TG.Util;
  const a = { x: 0, y: 0, w: 10, h: 10 };
  return U.pad(42, 3) === '042' && U.pad(7, 7) === '0000007' && U.pad(1234, 3) === '1234' && U.pad(0, 3) === '000' &&
    U.pad(12.9, 3) === '012' &&
    U.round10(14) === 10 && U.round10(15) === 20 && U.round10(0) === 0 && U.round10(1234.9) === 1230 &&
    U.overlap(a, { x: 9, y: 9, w: 5, h: 5 }) === true &&
    U.overlap(a, { x: 10, y: 0, w: 5, h: 5 }) === false &&       // touching edges do not overlap
    U.overlap(a, { x: 0, y: 10, w: 5, h: 5 }) === false &&
    U.overlap(a, { x: -5, y: -5, w: 5, h: 5 }) === false &&
    U.overlap(a, { x: 2, y: 2, w: 2, h: 2 }) === true;
});

check('Util.deepFreeze freezes nested objects and arrays, returns its argument and copes with cycles', function () {
  const o = env.run('({ a: { b: [1, { c: 2 }] }, n: null, t: new Uint8Array(2) })');
  o.self = o;
  const r = TG.Util.deepFreeze(o);
  return r === o && Object.isFrozen(o) && Object.isFrozen(o.a) && Object.isFrozen(o.a.b) && Object.isFrozen(o.a.b[1]) &&
    TG.Util.deepFreeze(5) === 5 && TG.Util.deepFreeze(null) === null;
});

// =================================================================================================
// TG.Events
// =================================================================================================

check('Events: listeners are called synchronously, in subscription order, as fn(payload, name)', function () {
  TG.Events.clear();
  const calls = [];
  const payload = { id: 1 };
  TG.Events.on('hero:jump', function (p, n) { calls.push(['a', p === payload, n]); });
  TG.Events.on('hero:jump', function (p, n) { calls.push(['b', p === payload, n]); });
  TG.Events.emit('hero:jump', payload);
  return same(calls, [['a', true, 'hero:jump'], ['b', true, 'hero:jump']]);
});

check('Events: a listener that throws does not stop the next listener or the emitter, and is reported with console.error', function () {
  const e2 = stubs.load({ files: CORE });
  const E = e2.TG.Events;
  let reached = 0;
  E.on('hero:land', function () { throw new Error('listener failed'); });
  E.on('hero:land', function () { reached++; });
  let after = false;
  E.emit('hero:land', { x: 0, y: 0 });
  after = true;
  return reached === 1 && after && e2.errors.length === 1 && e2.errors[0].indexOf('listener failed') !== -1;
});

check('Events: the function returned by on() unsubscribes; off() unsubscribes; count() follows', function () {
  TG.Events.clear();
  let n = 0;
  function f() { n++; }
  function g() { n += 10; }
  const un = TG.Events.on('hero:duck', f);
  TG.Events.on('hero:duck', g);
  const c0 = TG.Events.count('hero:duck');
  TG.Events.emit('hero:duck', {});
  un();
  const c1 = TG.Events.count('hero:duck');
  TG.Events.emit('hero:duck', {});
  TG.Events.off('hero:duck', g);
  const c2 = TG.Events.count('hero:duck');
  TG.Events.emit('hero:duck', {});
  un();   // a second call is harmless
  return c0 === 2 && c1 === 1 && c2 === 0 && n === 21 && typeof un === 'function';
});

check('Events: "*" receives every event, in subscription order with the named listeners', function () {
  TG.Events.clear();
  const seen = [];
  TG.Events.on('score:add', function () { seen.push('first'); });
  TG.Events.on('*', function (p, name) { seen.push('*:' + name); });
  TG.Events.on('score:add', function () { seen.push('last'); });
  TG.Events.emit('score:add', { points: 10 });
  TG.Events.emit('life:gain', { lives: 5 });
  return same(seen, ['first', '*:score:add', 'last', '*:life:gain']) && TG.Events.count('*') === 1;
});

check('Events: once() is called one time and its return value unsubscribes', function () {
  TG.Events.clear();
  let n = 0, m = 0;
  TG.Events.once('checkpoint', function () { n++; });
  const un = TG.Events.once('checkpoint', function () { m++; });
  un();
  TG.Events.emit('checkpoint', {});
  TG.Events.emit('checkpoint', {});
  return n === 1 && m === 0 && TG.Events.count('checkpoint') === 0;
});

check('Events: a listener removed during an emit is not called; one added during an emit waits for the next', function () {
  TG.Events.clear();
  const seen = [];
  let unB = null;
  TG.Events.on('hero:hurt', function () {
    seen.push('a');
    unB();
    TG.Events.on('hero:hurt', function () { seen.push('c'); });
  });
  unB = TG.Events.on('hero:hurt', function () { seen.push('b'); });
  TG.Events.emit('hero:hurt', {});
  TG.Events.emit('hero:hurt', {});
  return same(seen, ['a', 'a', 'c']);
});

check('Events: emit with a name outside NAMES still delivers and warns once per name', function () {
  const e2 = stubs.load({ files: CORE });
  const E = e2.TG.Events;
  let n = 0;
  E.on('made:up', function () { n++; });
  E.emit('made:up', {});
  E.emit('made:up', {});
  E.emit('other:name', {});
  E.emit('hero:jump', {});
  return n === 2 && e2.warnings.length === 2 && e2.warnings[0].indexOf('made:up') !== -1 && e2.warnings[1].indexOf('other:name') !== -1;
});

check('Events: emit without a payload gives listeners an empty object', function () {
  TG.Events.clear();
  let got = null;
  TG.Events.on('boss:enter', function (p) { got = p; });
  TG.Events.emit('boss:enter');
  return got !== null && typeof got === 'object' && Object.keys(got).length === 0;
});

check('Events: clear() removes every listener', function () {
  TG.Events.on('hero:jump', function () {});
  TG.Events.on('*', function () {});
  TG.Events.clear();
  return TG.Events.count('hero:jump') === 0 && TG.Events.count('*') === 0;
});

check('Events.NAMES has 63 distinct names, including checkpoint, type:hit, ui:letter and ui:exit', function () {
  const N = TG.Events.NAMES;
  const distinct = N.filter(function (n, i) { return N.indexOf(n) === i; });
  return Array.isArray(N) && N.length === 63 && distinct.length === 63 && N.indexOf('checkpoint') !== -1 &&
    N.indexOf('type:hit') !== -1 && N.indexOf('ui:letter') !== -1 && N.indexOf('ui:exit') !== -1 && N.indexOf('*') === -1;
});

// =================================================================================================
// TG.RNG
// =================================================================================================

check('RNG: TG.RNG.create(1).next() === 0.6270739405881613', function () {
  return TG.RNG.create(1).next() === 0.6270739405881613;
});

check('RNG: two generators with the same seed give the same 1,000 values, all in [0, 1)', function () {
  const a = TG.RNG.create(12345), b = TG.RNG.create(12345), c = TG.RNG.create(12346);
  let equal = true, inRange = true, differs = false;
  for (let i = 0; i < 1000; i++) {
    const x = a.next(), y = b.next(), z = c.next();
    if (x !== y) equal = false;
    if (!(x >= 0 && x < 1)) inRange = false;
    if (x !== z) differs = true;
  }
  return equal && inRange && differs;
});

check('RNG: int(1, 6) stays within 1 to 6 over 10,000 calls and reaches both ends', function () {
  const r = TG.RNG.create(7);
  const counts = {};
  for (let i = 0; i < 10000; i++) {
    const v = r.int(1, 6);
    if (v < 1 || v > 6 || Math.floor(v) !== v) return 'got ' + v;
    counts[v] = (counts[v] || 0) + 1;
  }
  return Object.keys(counts).length === 6 && counts[1] > 1400 && counts[6] > 1400;
});

check('RNG: pick, weighted and chance', function () {
  const r = TG.RNG.create(3);
  const state0 = r.getState();
  if (r.pick([]) !== undefined) return 'pick([]) is not undefined';
  if (r.weighted([0, 0]) !== -1 || r.weighted([]) !== -1) return 'weighted with sum 0 is not -1';
  if (r.getState() !== state0) return 'pick([]) or weighted([0, 0]) drew a value';
  const counts = [0, 0, 0];
  for (let i = 0; i < 6000; i++) counts[r.weighted([1, 0, 3])]++;
  if (counts[1] !== 0) return 'an index with weight 0 was chosen';
  if (Math.abs(counts[0] / 6000 - 0.25) > 0.03) return 'weights are not followed: ' + counts;
  const items = ['a', 'b', 'c'];
  for (let i = 0; i < 100; i++) if (items.indexOf(r.pick(items)) === -1) return 'pick left the array';
  let yes = 0;
  for (let i = 0; i < 4000; i++) if (r.chance(0.25)) yes++;
  if (Math.abs(yes / 4000 - 0.25) > 0.03) return 'chance(0.25) gave ' + yes / 4000;
  return r.chance(0) === false && r.chance(1) === true;
});

check('RNG: getState and setState reproduce the sequence; the seed is coerced with >>> 0', function () {
  const r = TG.RNG.create(99);
  r.next(); r.next();
  const s = r.getState();
  const a = [r.next(), r.next(), r.next()];
  r.setState(s);
  const b = [r.next(), r.next(), r.next()];
  const neg = TG.RNG.create(-1).next(), big = TG.RNG.create(4294967295).next();
  const frac = TG.RNG.create(1.9).next();
  return same(a, b) && s === (s >>> 0) && neg === big && frac === 0.6270739405881613 &&
    TG.RNG.create(0).getState() === 0 && TG.RNG.create(-1).getState() === 4294967295;
});

// =================================================================================================
// TG.Save
// =================================================================================================

check('Save: before init and load, TG.Save.data equals TG.Save.defaults() by value and assist("easy") is 1', function () {
  const e2 = stubs.load({ files: CORE });
  const S = e2.TG.Save;
  return same(S.data, S.defaults()) && S.assist('easy') === 1 && S.assist('medium') === 1 && S.assist('hard') === 1 &&
    S.defaults() !== S.defaults();
});

check('Save: defaults have the shape and the seeded scores of CONTRACT 5.12', function () {
  const d = stubs.plain(TG.Save.defaults());
  assert.deepStrictEqual(d.settings, { music: true, sfx: true, crt: 'auto', reduceFlash: false, keyGuide: 'auto',
    adaptive: true, tutorialDone: false, lastDifficulty: 'medium', initials: 'PIP', worldScores: true });
  assert.deepStrictEqual(Object.keys(d), ['version', 'settings', 'scores', 'best', 'assist']);
  assert.strictEqual(d.version, 1);
  assert.deepStrictEqual(d.best, { easy: { wpm: 0, score: 0 }, medium: { wpm: 0, score: 0 }, hard: { wpm: 0, score: 0 } });
  assert.deepStrictEqual(d.assist, { easy: 1, medium: 1, hard: 1 });
  assert.deepStrictEqual(d.scores.easy.map(function (e) { return [e.name, e.score, e.wpm, e.accuracy, e.rank, e.date]; }),
    [['PIP', 16000, 18, 96, 'A', ''], ['INK', 12000, 15, 94, 'A', ''], ['DOT', 9000, 13, 92, 'B', ''], ['TAB', 6000, 11, 90, 'B', ''], ['CAP', 3000, 9, 88, 'B', '']]);
  assert.deepStrictEqual(d.scores.medium.map(function (e) { return [e.name, e.score, e.wpm, e.accuracy, e.rank]; }),
    [['PIP', 40000, 34, 96, 'A'], ['INK', 30000, 30, 94, 'A'], ['DOT', 22000, 27, 92, 'B'], ['TAB', 15000, 24, 90, 'B'], ['CAP', 8000, 21, 88, 'B']]);
  assert.deepStrictEqual(d.scores.hard.map(function (e) { return [e.name, e.score, e.wpm, e.accuracy, e.rank]; }),
    [['PIP', 70000, 55, 96, 'A'], ['INK', 52000, 50, 94, 'A'], ['DOT', 38000, 46, 92, 'B'], ['TAB', 26000, 42, 90, 'B'], ['CAP', 14000, 38, 88, 'B']]);
  assert.deepStrictEqual(Object.keys(d.scores.easy[0]), ['name', 'score', 'wpm', 'accuracy', 'rank', 'cleared', 'date']);
});

check('Save: works from memory before init (headless run): settings, scores and save() returning false', function () {
  const e2 = stubs.load({ files: CORE });
  const S = e2.TG.Save;
  S.setSetting('sfx', false);
  const pos = S.addScore('easy', { name: 'ZED', score: 20000, wpm: 20, accuracy: 97, rank: 'S', cleared: true, date: '2026-09-30' });
  return S.getSetting('sfx') === false && pos === 0 && S.scores('easy')[0].name === 'ZED' && S.save() === false &&
    e2.storage.size === 0;
});

check('Save: settings and scores round-trip with storage "memory"', function () {
  const e2 = stubs.load({ files: CORE, storage: 'memory' });
  const S = e2.TG.Save;
  S.init(e2.window);
  S.load();
  S.setSetting('music', false);
  S.setSetting('crt', 'off');
  S.setSetting('lastDifficulty', 'hard');
  S.setSetting('tutorialDone', true);
  const pos = S.addScore('medium', { name: 'AVA', score: 31000, wpm: 33, accuracy: 95, rank: 'A', cleared: true, date: '2026-09-30' });
  S.recordRun({ difficulty: 'medium', score: 31000, typing: { wpm: 33.4 }, assist: 0.85 });
  if (pos !== 1) return 'position ' + pos;
  if (!e2.storage.has(e2.TG.C.STORAGE_KEY)) return 'nothing was written under STORAGE_KEY';
  const written = JSON.parse(e2.storage.get('spellrunner.v1'));
  if (written.version !== 1 || written.settings.music !== false) return 'the stored JSON is not the data';

  // A second page load: a fresh context that shares the same storage.
  const e3 = stubs.load({ files: CORE, storage: 'memory' });
  e2.storage.forEach(function (v, k) { e3.storage.set(k, v); });
  const S3 = e3.TG.Save;
  S3.init(e3.window);
  const data = S3.load();
  const table = S3.scores('medium');
  return data === S3.data && S3.getSetting('music') === false && S3.getSetting('crt') === 'off' &&
    S3.getSetting('lastDifficulty') === 'hard' && S3.getSetting('tutorialDone') === true && S3.getSetting('sfx') === true &&
    table.length === 5 && table[1].name === 'AVA' && table[1].score === 31000 && table[1].date === '2026-09-30' &&
    table[0].name === 'PIP' && table[4].name === 'TAB' &&
    same(S3.best('medium'), { wpm: 33.4, score: 31000 }) && S3.assist('medium') === 0.85 && S3.assist('easy') === 1;
});

['none', 'throw'].forEach(function (mode) {
  check('Save: init(env.window) and every other function work without throwing with storage "' + mode + '"', function () {
    const e2 = stubs.load({ files: CORE, storage: mode });
    const S = e2.TG.Save;
    const result = noThrow(function () {
      S.init(e2.window);
      S.load();
      S.setSetting('reduceFlash', true);
      S.getSetting('reduceFlash');
      S.scores('hard');
      S.qualifies('hard', 99999);
      S.addScore('hard', { name: 'MAX', score: 99999, wpm: 80, accuracy: 99, rank: 'S', cleared: true, date: '' });
      S.best('hard');
      S.assist('hard');
      S.recordRun({ difficulty: 'hard', score: 99999, typing: { wpm: 80 }, assist: 0.9 });
      S.resetScores();
      S.defaults();
    });
    if (result !== true) return result;
    S.setSetting('keyGuide', 'on');
    return S.save() === false && S.getSetting('keyGuide') === 'on' && S.load() === S.data && S.getSetting('keyGuide') === 'on' &&
      e2.errors.length === 0;
  });
});

check('Save: a storage object whose methods all throw is survived (env.localStorage with storage "throw")', function () {
  const e2 = stubs.load({ files: CORE, storage: 'throw' });
  const S = e2.TG.Save;
  if (!throws(function () { e2.localStorage.getItem('x'); }) || !throws(function () { e2.localStorage.setItem('x', '1'); }) ||
      !throws(function () { e2.localStorage.removeItem('x'); }) || !throws(function () { e2.localStorage.clear(); }) ||
      !throws(function () { e2.localStorage.key(0); })) return 'the stub storage did not throw';
  if (!throws(function () { return e2.window.localStorage; })) return 'reading window.localStorage did not throw';
  const result = noThrow(function () {
    S.init({ localStorage: e2.localStorage });
    S.load();
    S.setSetting('music', false);
    S.addScore('easy', { name: 'ABC', score: 17000, wpm: 1, accuracy: 1, rank: 'C', cleared: false, date: '' });
  });
  return result === true ? (S.save() === false && S.getSetting('music') === false) : result;
});

check('Save: init with undefined, null or an empty object does not throw', function () {
  const e2 = stubs.load({ files: CORE });
  return noThrow(function () {
    e2.TG.Save.init(undefined);
    e2.TG.Save.init(null);
    e2.TG.Save.init({});
    e2.TG.Save.load();
  });
});

check('Save: recovers from invalid JSON and from JSON of the wrong shape', function () {
  const bad = ['{not json', '', 'null', '42', '"text"', '[]', '{"version":2,"settings":{"music":false}}', '{"version":1}'];
  for (let i = 0; i < bad.length; i++) {
    const e2 = stubs.load({ files: CORE, storage: 'memory' });
    e2.storage.set('spellrunner.v1', bad[i]);
    const S = e2.TG.Save;
    S.init(e2.window);
    let data;
    try {
      data = S.load();
    } catch (e) {
      return 'load threw for ' + JSON.stringify(bad[i]) + ': ' + e.message;
    }
    if (!same(data, S.defaults())) return 'not the defaults for ' + JSON.stringify(bad[i]);
    if (S.save() !== true) return 'save failed after ' + JSON.stringify(bad[i]);
    if (JSON.parse(e2.storage.get('spellrunner.v1')).version !== 1) return 'the bad value was not replaced';
  }
  return true;
});

check('Save: load keeps the valid parts of damaged data and repairs the rest', function () {
  const e2 = stubs.load({ files: CORE, storage: 'memory' });
  e2.storage.set('spellrunner.v1', JSON.stringify({
    version: 1,
    settings: { music: false, sfx: 'yes', crt: 'sideways', keyGuide: 'on', initials: 'ab', lastDifficulty: 'extreme', volume: 7 },
    scores: {
      easy: [{ name: 'LOW', score: 100, wpm: 5, accuracy: 80, rank: 'C', cleared: false, date: '' },
        { name: 'TOP', score: 50000, wpm: 25.6, accuracy: 99.4, rank: 'S', cleared: true, date: '2026-01-01' },
        { name: 'BAD', score: 'many' }, null, 'text'],
      medium: 'none'
    },
    best: { easy: { wpm: 22.5, score: 50000 }, medium: { wpm: 'fast' } },
    assist: { easy: 0.2, medium: 0.8, hard: 3 }
  }));
  const S = e2.TG.Save;
  S.init(e2.window);
  S.load();
  const easy = S.scores('easy');
  return S.getSetting('music') === false && S.getSetting('sfx') === true && S.getSetting('crt') === 'auto' &&
    S.getSetting('keyGuide') === 'on' && S.getSetting('initials') === 'ABA' && S.getSetting('lastDifficulty') === 'medium' &&
    S.getSetting('volume') === 7 && S.getSetting('adaptive') === true &&
    easy.length === 5 && easy[0].name === 'TOP' && easy[0].wpm === 26 && easy[0].accuracy === 99 &&
    easy[1].name === 'PIP' && easy[4].score >= 100 &&
    same(easy.map(function (e) { return e.score; }), easy.map(function (e) { return e.score; }).sort(function (a, b) { return b - a; })) &&
    same(S.scores('medium'), S.defaults().scores.medium) &&
    same(S.best('easy'), { wpm: 22.5, score: 50000 }) && same(S.best('medium'), { wpm: 0, score: 0 }) &&
    S.assist('easy') === 0.6 && S.assist('medium') === 0.8 && S.assist('hard') === 1;
});

check('Save: addScore keeps 5 entries sorted, returns the position, and -1 for a score that does not place', function () {
  const e2 = stubs.load({ files: CORE });
  const S = e2.TG.Save;
  function entry(name, score) { return { name: name, score: score, wpm: 30, accuracy: 95, rank: 'A', cleared: true, date: '2026-09-30' }; }
  const p1 = S.addScore('medium', entry('AAA', 35000));    // between PIP 40000 and INK 30000
  const p2 = S.addScore('medium', entry('BBB', 100000));   // top
  const p3 = S.addScore('medium', entry('CCC', 25000));    // last place: the table is now 100000 40000 35000 30000 22000
  const p4 = S.addScore('medium', entry('DDD', 1000));     // too low
  const p5 = S.addScore('medium', entry('EEE', 30000));    // equal to INK: goes below the older entry
  const table = S.scores('medium');
  const scores = table.map(function (e) { return e.score; });
  const names = table.map(function (e) { return e.name; });
  if (!(p1 === 1 && p2 === 0 && p3 === 4 && p4 === -1 && p5 === 4)) return 'positions ' + [p1, p2, p3, p4, p5];
  if (!same(scores, [100000, 40000, 35000, 30000, 30000])) return 'scores ' + scores;
  if (!same(names, ['BBB', 'PIP', 'AAA', 'INK', 'EEE'])) return 'names ' + names;
  return S.scores('easy').length === 5 && S.scores('hard').length === 5;
});

check('Save: qualifies is false for a score of 0, for the lowest score itself and for an unknown difficulty', function () {
  const e2 = stubs.load({ files: CORE });
  const S = e2.TG.Save;
  return S.qualifies('easy', 0) === false && S.qualifies('easy', 3000) === false && S.qualifies('easy', 3001) === true &&
    S.qualifies('easy', -5) === false && S.qualifies('nightmare', 99999) === false && S.qualifies('hard', 14001) === true &&
    S.addScore('nightmare', { name: 'AAA', score: 99999 }) === -1 && S.addScore('easy', { name: 'AAA', score: 0 }) === -1;
});

check('Save: scores() returns a copy of length SCORE_SLOTS, highest first', function () {
  const e2 = stubs.load({ files: CORE });
  const S = e2.TG.Save;
  const a = S.scores('hard');
  a[0].score = 1;
  a.pop();
  const b = S.scores('hard');
  return b.length === e2.TG.C.SCORE_SLOTS && b[0].score === 70000 && b[0].name === 'PIP';
});

check('Save: recordRun updates the bests only upwards and stores the assist value clamped', function () {
  const e2 = stubs.load({ files: CORE, storage: 'memory' });
  const S = e2.TG.Save;
  S.init(e2.window);
  S.load();
  S.recordRun({ difficulty: 'easy', score: 12000, typing: { wpm: 18.2 }, assist: 0.75 });
  S.recordRun({ difficulty: 'easy', score: 9000, typing: { wpm: 21.0 }, assist: 0.3 });
  const b = S.best('easy');
  const stored = JSON.parse(e2.storage.get('spellrunner.v1'));
  b.wpm = 0;   // best() returns a copy
  return same(S.best('easy'), { wpm: 21, score: 12000 }) && S.assist('easy') === 0.6 && same(S.best('hard'), { wpm: 0, score: 0 }) &&
    stored.best.easy.score === 12000 && stored.assist.easy === 0.6 &&
    noThrow(function () { S.recordRun(null); S.recordRun({}); S.recordRun({ difficulty: 'nightmare', score: 5 }); }) === true;
});

check('Save: recordRun of a run with adaptive pacing off (result.adaptive false) updates the bests and keeps the saved assist', function () {
  const e2 = stubs.load({ files: CORE, storage: 'memory' });
  const S = e2.TG.Save;
  S.init(e2.window);
  S.load();
  S.recordRun({ difficulty: 'medium', score: 5000, typing: { wpm: 25 }, assist: 0.8, adaptive: true });
  S.recordRun({ difficulty: 'medium', score: 9000, typing: { wpm: 30 }, assist: 1, adaptive: false });
  const stored = JSON.parse(e2.storage.get('spellrunner.v1'));
  return S.assist('medium') === 0.8 && stored.assist.medium === 0.8 && same(S.best('medium'), { wpm: 30, score: 9000 });
});

check('Save: resetScores returns the tables to the seeded entries and keeps the settings', function () {
  const e2 = stubs.load({ files: CORE, storage: 'memory' });
  const S = e2.TG.Save;
  S.init(e2.window);
  S.load();
  S.setSetting('music', false);
  S.addScore('hard', { name: 'MAX', score: 99999, wpm: 80, accuracy: 99, rank: 'S', cleared: true, date: '' });
  S.resetScores();
  const stored = JSON.parse(e2.storage.get('spellrunner.v1'));
  return same(S.scores('hard'), S.defaults().scores.hard) && S.getSetting('music') === false &&
    stored.scores.hard[0].name === 'PIP' && stored.settings.music === false;
});

check('Save: the constants option is honoured (STORAGE_KEY and SCORE_SLOTS are read when the functions run)', function () {
  const e2 = stubs.load({ files: CORE, storage: 'memory', constants: { STORAGE_KEY: 'other.key', SCORE_SLOTS: 3 } });
  const S = e2.TG.Save;
  S.init(e2.window);
  S.load();
  S.setSetting('music', false);
  return e2.storage.has('other.key') && !e2.storage.has('spellrunner.v1') && S.scores('easy').length === 3;
});

// =================================================================================================
// TG.Difficulty
// =================================================================================================

check('Difficulty.NAMES is [easy, medium, hard]; get throws on an unknown name; entries are deep-frozen', function () {
  const D = TG.Difficulty;
  const m = D.get('medium');
  return same(D.NAMES, ['easy', 'medium', 'hard']) && throws(function () { D.get('nightmare'); }) &&
    throws(function () { D.get(undefined); }) && throws(function () { D.get('toString'); }) &&
    Object.isFrozen(m) && Object.isFrozen(m.boss) && Object.isFrozen(m.boss.rocks) && Object.isFrozen(m.wordLen.hoppet) &&
    Object.isFrozen(m.tierMix) && Object.isFrozen(m.tierMix[2]) && Object.isFrozen(m.bot.floor) &&
    D.get('medium') === m && D.get('easy').id === 'easy' && D.get('hard').id === 'hard';
});

check('Difficulty: budget(m, 5) is 3.7; wordRange(m, hoppet, 2) is [6, 8]; wordRange(m, dawdle, 2) is [7, 10]; toWs(easy, 4) is 3', function () {
  const D = TG.Difficulty;
  const m = D.get('medium');
  return D.budget(m, 5) === 3.7 && same(D.wordRange(m, 'hoppet', 2), [6, 8]) && same(D.wordRange(m, 'dawdle', 2), [7, 10]) &&
    D.toWs(D.get('easy'), 4) === 3 && D.toWs(D.get('hard'), 4) === 5 && D.toWs(m, 2.5) === 2.5;
});

check('Difficulty: the budgets of DESIGN 9.1 for words of 3, 5 and 8 letters', function () {
  const D = TG.Difficulty;
  const want = { easy: [4.8, 6.8, 9.8], medium: [2.7, 3.7, 5.2], hard: [1.6, 2.2, 3.1] };
  return D.NAMES.every(function (n) {
    return [3, 5, 8].every(function (len, i) { return Math.abs(D.budget(D.get(n), len) - want[n][i]) < 1e-9; });
  });
});

check('Difficulty.wordRange: the boss arena (index 3) has no shift; the maximum is capped at MAX_WORD_LEN', function () {
  const D = TG.Difficulty;
  const h = D.get('hard'), e = D.get('easy');
  return same(D.wordRange(D.get('medium'), 'rock', 3), [4, 5]) && same(D.wordRange(h, 'dawdle', 2), [9, 10]) &&
    same(D.wordRange(h, 'crate', 1), [8, 10]) && same(D.wordRange(e, 'boulder', 0), [2, 4]) &&
    same(D.wordRange(e, 'boulder', 2), [3, 5]) && same(D.wordRange(e, 'truffle', 1), [2, 3]) &&
    same(D.wordRange(h, 'digby', 2), [8, 10]) && same(D.wordRange(h, 'rock', 3), [5, 7]);
});

check('Difficulty.wordRange returns a new array each time and follows the constants option', function () {
  const D = TG.Difficulty;
  const a = D.wordRange(D.get('medium'), 'hoppet', 0);
  a[0] = 99;
  const e2 = stubs.load({ files: CORE, constants: { MAX_WORD_LEN: 8 } });
  return same(D.wordRange(D.get('medium'), 'hoppet', 0), [4, 6]) &&
    same(e2.TG.Difficulty.wordRange(e2.TG.Difficulty.get('hard'), 'dawdle', 2), [8, 8]);
});

check('Difficulty.wordRange for a kind without a word length warns once and does not throw', function () {
  const e2 = stubs.load({ files: CORE });
  const D = e2.TG.Difficulty;
  const r = D.wordRange(D.get('medium'), 'dragon', 0);
  D.wordRange(D.get('medium'), 'dragon', 1);
  return Array.isArray(r) && r.length === 2 && r[0] <= r[1] && e2.warnings.length === 1;
});

check('Difficulty.rank and includes', function () {
  const D = TG.Difficulty;
  return D.rank('easy') === 0 && D.rank('medium') === 1 && D.rank('hard') === 2 &&
    D.includes('easy', 'medium') === false && D.includes('hard', 'easy') === true && D.includes('easy', 'easy') === true &&
    D.includes('medium', 'medium') === true && D.includes('medium', 'hard') === false && D.includes('hard', 'hard') === true &&
    D.includes('easy', undefined) === true && D.includes('hard', 'nightmare') === false;
});

check('Difficulty.tierMix gives the mix of each section and of the boss arena', function () {
  const D = TG.Difficulty;
  return same(D.tierMix(D.get('easy'), 0), { 1: 1 }) && same(D.tierMix(D.get('easy'), 1), { 1: 0.3, 2: 0.7 }) &&
    same(D.tierMix(D.get('easy'), 2), { 1: 0.1, 2: 0.3, 3: 0.6 }) && same(D.tierMix(D.get('medium'), 2), { 2: 0.4, 3: 0.6 }) &&
    same(D.tierMix(D.get('hard'), 3), { 1: 0.6, 2: 0.4 }) && D.tierMix(D.get('hard'), 2) === D.get('hard').tierMix[2];
});

check('Difficulty.TUNABLE lists the 13 keys of CONTRACT 4.5, and every one is a key of the config', function () {
  const D = TG.Difficulty;
  const want = ['react', 'perChar', 'letterStall', 'impactGap', 'hazardMargin', 'urgentTime', 'maxActive',
    'wordLen', 'lenShift', 'tierMix', 'shieldKeyStreak', 'boss', 'bot'];
  return same(D.TUNABLE, want) && want.every(function (k) { return D.get('medium')[k] !== undefined; });
});

check('Difficulty.resolve with no tune, or an empty one, returns get(name) itself; it throws on an unknown name', function () {
  const D = TG.Difficulty;
  const m = D.get('medium');
  return D.resolve('medium', undefined) === m && D.resolve('medium') === m && D.resolve('medium', null) === m &&
    D.resolve('medium', {}) === m && D.resolve('medium', { all: {}, easy: {}, medium: {}, hard: {} }) === m &&
    D.resolve('medium', { easy: { react: 9 } }) === m && throws(function () { D.resolve('nightmare', {}); }) &&
    throws(function () { D.resolve('nightmare', { all: { react: 1 } }); });
});

check('Difficulty.resolve merges tune.all and then tune[name]; the result is frozen and get() is unchanged', function () {
  const D = TG.Difficulty;
  const before = JSON.stringify(D.get('medium'));
  const r = D.resolve('medium', { all: { react: 1.0 }, medium: { boss: { telegraph: 0.9 } } });
  return r.react === 1.0 && r.boss.telegraph === 0.9 && r.boss.health === 6 && r.perChar === 0.5 &&
    Object.isFrozen(r) && Object.isFrozen(r.boss) && Object.isFrozen(r.boss.rocks) && Object.isFrozen(r.wordLen) &&
    r !== D.get('medium') && r.boss !== D.get('medium').boss &&
    JSON.stringify(D.get('medium')) === before && D.get('medium').react === 1.2 && D.get('medium').boss.telegraph === 1.0 &&
    r.id === 'medium' && r.lives === 4 && same(Object.keys(r), Object.keys(D.get('medium')));
});

check('Difficulty.resolve: objects merge key by key, arrays and numbers replace, tune[name] wins over tune.all', function () {
  const D = TG.Difficulty;
  const r = D.resolve('easy', {
    all: { lenShift: [1, 2, 3], wordLen: { boulder: [3, 5] }, react: 2.0, bot: { floor: { react: 1.2 } } },
    easy: { maxActive: [2, 2, 3, 2], react: 1.9, tierMix: [{ 1: 1 }, { 1: 1 }, { 2: 1 }, { 1: 1 }] },
    hard: { react: 0.1 }
  });
  return same(r.lenShift, [1, 2, 3]) && same(r.wordLen.boulder, [3, 5]) && same(r.wordLen.dawdle, [3, 5]) &&
    same(r.wordLen.rock, [2, 4]) && r.react === 1.9 && same(r.maxActive, [2, 2, 3, 2]) &&
    same(r.bot.floor, { wpm: 10, accuracy: 0.9, react: 1.2 }) && same(r.bot.target, { wpm: 15, accuracy: 0.95, react: 1 }) &&
    same(r.tierMix, [{ 1: 1 }, { 1: 1 }, { 2: 1 }, { 1: 1 }]) && r.perChar === 1.0 &&
    same(D.wordRange(r, 'boulder', 2), [6, 8]) && same(D.get('easy').lenShift, [0, 0, 1]);
});

check('Difficulty.resolve: the tune block is not changed and is not tied to the result', function () {
  const D = TG.Difficulty;
  const tune = { all: { wordLen: { hoppet: [5, 7] }, boss: { rocks: [1, 1, 1] } } };
  const before = JSON.stringify(tune);
  const r = D.resolve('hard', tune);
  tune.all.wordLen.hoppet[0] = 1;
  return before === JSON.stringify({ all: { wordLen: { hoppet: [5, 7] }, boss: { rocks: [1, 1, 1] } } }) &&
    same(r.wordLen.hoppet, [5, 7]) && !Object.isFrozen(tune.all) && same(r.boss.rocks, [1, 1, 1]) && r.boss.health === 8;
});

check('Difficulty.resolve: a key outside TUNABLE (lives) is ignored with one warning', function () {
  const e2 = stubs.load({ files: CORE });
  const D = e2.TG.Difficulty;
  const r = D.resolve('medium', { all: { lives: 9, react: 1.1 }, medium: { lives: 8 } });
  return r.lives === 4 && r.react === 1.1 && e2.warnings.length === 1 && e2.warnings[0].indexOf('lives') !== -1;
});

check('Difficulty: bot.floor.wpm equals floorWpm and bot.target.wpm equals designWpm; coreWords add up to health', function () {
  const D = TG.Difficulty;
  return D.NAMES.every(function (n) {
    const c = D.get(n);
    return c.bot.floor.wpm === c.floorWpm && c.bot.target.wpm === c.designWpm &&
      c.boss.coreWords.reduce(function (a, b) { return a + b; }, 0) === c.boss.health && c.id === n &&
      c.maxActive.length === 4 && c.lenShift.length === 3 && c.tierMix.length === 4;
  });
});

check('Difficulty: the three entries have the same keys in the same order, at every level', function () {
  const D = TG.Difficulty;
  function shape(v) {
    if (Array.isArray(v)) return '[' + v.length + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).map(function (k) { return k + ':' + shape(v[k]); }).join(',') + '}';
    return typeof v;
  }
  function shapeOf(name) {
    const c = stubs.plain(D.get(name));
    delete c.tierMix;      // the easy mix of section 2 has three tiers, the others two
    return shape(c);
  }
  return shapeOf('easy') === shapeOf('medium') && shapeOf('hard') === shapeOf('medium');
});

// =================================================================================================
// TG.Sprites and the other registries
// =================================================================================================

function goodSprite() {
  return {
    w: 4, h: 3, anchor: [2, 3], fps: 8, owner: 'C', names: ['a', 'b', 'c'],
    frames: [
      ['.00.', '0440', '.00.'],
      ['.00.', '0pp0', '.00.'],
      { copy: 1, flipX: true }
    ]
  };
}

check('Sprites.define accepts a valid sprite; get, has and names follow', function () {
  const e2 = stubs.load({ files: CORE });
  const S = e2.TG.Sprites;
  const def = goodSprite();
  S.define('test_good', def);
  return S.has('test_good') === true && S.get('test_good') === def && same(S.names(), ['test_good']) &&
    S.has('test_other') === false && S.get('test_other') === null && same(S.check(def), []);
});

check('Sprites.define rejects a sprite with a short row', function () {
  const e2 = stubs.load({ files: CORE });
  const S = e2.TG.Sprites;
  const def = goodSprite();
  def.frames[0][1] = '044';
  try {
    S.define('test_short', def);
  } catch (e) {
    return S.has('test_short') === false && e.message.indexOf('test_short') !== -1 && S.check(def).length === 1;
  }
  return false;
});

check('Sprites.define throws if the name is already defined', function () {
  const e2 = stubs.load({ files: CORE });
  e2.TG.Sprites.define('test_twice', goodSprite());
  return throws(function () { e2.TG.Sprites.define('test_twice', goodSprite()); });
});

check('Sprites.check reports each format problem of CONTRACT 6.1', function () {
  const S = TG.Sprites;
  function broken(change) {
    const d = goodSprite();
    change(d);
    return S.check(d).length > 0;
  }
  const cases = {
    'w missing': broken(function (d) { delete d.w; }),
    'h missing': broken(function (d) { delete d.h; }),
    'anchor missing': broken(function (d) { delete d.anchor; }),
    'fps missing': broken(function (d) { delete d.fps; }),
    'owner missing': broken(function (d) { delete d.owner; }),
    'names missing': broken(function (d) { delete d.names; }),
    'frames missing': broken(function (d) { delete d.frames; }),
    'names and frames differ in length': broken(function (d) { d.names.pop(); }),
    'a frame with too few rows': broken(function (d) { d.frames[0].pop(); }),
    'a frame with too many rows': broken(function (d) { d.frames[0].push('....'); }),
    'a row that is too long': broken(function (d) { d.frames[1][0] = '.00..'; }),
    'a character outside the set': broken(function (d) { d.frames[0][1] = '0w40'; }),
    'an uppercase palette key': broken(function (d) { d.frames[0][1] = '0A40'; }),
    'a frame that is entirely transparent': broken(function (d) { d.frames[0] = ['....', '....', '....']; }),
    'a copy of a frame that does not exist': broken(function (d) { d.frames[2] = { copy: 7, flipX: true }; }),
    'a copy of itself': broken(function (d) { d.frames[2] = { copy: 2 }; }),
    'a definition that is not an object': S.check(null).length > 0 && S.check('sprite').length > 0
  };
  const missed = Object.keys(cases).filter(function (k) { return !cases[k]; });
  return missed.length === 0 ? true : 'not reported: ' + missed.join(', ');
});

check('Sprites.check accepts every palette key, an anchor outside the frame, fps 0 and a plain copy', function () {
  const keys = TG.PAL_KEYS;
  const def = { w: 32, h: 2, anchor: [16, 24], fps: 0, owner: 'D', names: ['all', 'again'],
    frames: [[keys, keys.split('').reverse().join('')], { copy: 0 }] };
  return same(TG.Sprites.check(def), []);
});

check('Sprites.MANIFEST has 93 entries with distinct names: 27 of owner C and 66 of owner D', function () {
  const M = TG.Sprites.MANIFEST;
  const names = M.map(function (m) { return m.name; });
  const distinct = names.filter(function (n, i) { return names.indexOf(n) === i; });
  const c = M.filter(function (m) { return m.owner === 'C'; }).length;
  const d = M.filter(function (m) { return m.owner === 'D'; }).length;
  const shapeOk = M.every(function (m) {
    return typeof m.name === 'string' && m.w > 0 && m.h > 0 && m.frames >= 1 && typeof m.ax === 'number' && typeof m.ay === 'number' &&
      (m.owner === 'C' || m.owner === 'D') && Array.isArray(m.names) && m.names.length === m.frames && typeof m.fps === 'number';
  });
  return Array.isArray(M) && M.length === 93 && distinct.length === 93 && c === 27 && d === 66 && shapeOk;
});

check('Sprites.MANIFEST: fx_bracket has 4 frames (tl0 tl1 bl0 bl1); spot checks of other entries', function () {
  const M = TG.Sprites.MANIFEST;
  function entry(name) { return stubs.plain(M.filter(function (m) { return m.name === name; })[0]); }
  assert.deepStrictEqual(entry('fx_bracket'), { name: 'fx_bracket', w: 8, h: 8, frames: 4, ax: 0, ay: 0, owner: 'D', fps: 4, names: ['tl0', 'tl1', 'bl0', 'bl1'] });
  assert.deepStrictEqual(entry('hero_run'), { name: 'hero_run', w: 16, h: 24, frames: 6, ax: 8, ay: 24, owner: 'C', fps: 12, names: ['r0', 'r1', 'r2', 'r3', 'r4', 'r5'] });
  assert.deepStrictEqual(entry('hero_cast'), { name: 'hero_cast', w: 16, h: 12, frames: 1, ax: 8, ay: 24, owner: 'C', fps: 0, names: ['cast'] });
  assert.deepStrictEqual(entry('boss_arm'), { name: 'boss_arm', w: 16, h: 16, frames: 3, ax: 8, ay: 8, owner: 'C', fps: 0, names: ['rest', 'raise', 'throw'] });
  assert.deepStrictEqual(entry('bg_sails'), { name: 'bg_sails', w: 32, h: 32, frames: 4, ax: 16, ay: 16, owner: 'D', fps: 4, names: ['s0', 's1', 's2', 's3'] });
  assert.deepStrictEqual(entry('bg_hill_mid'), { name: 'bg_hill_mid', w: 128, h: 56, frames: 1, ax: 0, ay: 56, owner: 'D', fps: 0, names: ['hill'] });
  assert.deepStrictEqual(entry('fx_shield'), { name: 'fx_shield', w: 24, h: 32, frames: 4, ax: 12, ay: 30, owner: 'D', fps: 8, names: ['s0', 's1', 's2', 's3'] });
  assert.deepStrictEqual(entry('key_wide'), { name: 'key_wide', w: 32, h: 16, frames: 2, ax: 0, ay: 0, owner: 'D', fps: 0, names: ['up', 'down'] });
});

check('Sprites.missing lists manifest names that are undefined or differ in size or frame count', function () {
  const e2 = stubs.load({ files: CORE });
  const S = e2.TG.Sprites;
  const all = S.missing();
  const c = S.missing('C'), d = S.missing('D');
  if (all.length !== 93 || c.length !== 27 || d.length !== 66) return 'before: ' + [all.length, c.length, d.length];
  function blank(w, h, frames, names) {
    const rows = [];
    for (let y = 0; y < h; y++) rows.push(new Array(w + 1).join('0'));
    const list = [];
    for (let f = 0; f < frames; f++) list.push(rows.slice());
    return { w: w, h: h, anchor: [0, 0], fps: 0, owner: 'C', names: names, frames: list };
  }
  S.define('ink_bolt', blank(8, 8, 2, ['b0', 'b1']));              // matches the manifest
  S.define('ink_spark', blank(8, 8, 1, ['k0']));                   // wrong frame count
  S.define('pr_rock', blank(16, 12, 2, ['k0', 'k1']));             // wrong size
  S.define('test_extra', blank(8, 8, 1, ['x']));                   // not in the manifest
  const after = S.missing('C');
  return after.length === 26 && after.indexOf('ink_bolt') === -1 && after.indexOf('ink_spark') !== -1 &&
    after.indexOf('pr_rock') !== -1 && S.missing('D').length === 66 && S.missing().length === 92 &&
    S.missing().indexOf('test_extra') === -1;
});

check('TG.Remaps, TG.Backdrops and TG.Levels are empty plain objects that can be written to', function () {
  const e2 = stubs.load({ files: CORE });
  const T = e2.TG;
  T.Remaps.white = { '*': 4 };
  T.Backdrops.meadow = {};
  T.Levels[1] = { id: 1 };
  return Object.keys(TG.Remaps).length === 0 && Object.keys(TG.Backdrops).length === 0 && Object.keys(TG.Levels).length === 0 &&
    T.Remaps.white['*'] === 4 && T.Levels[1].id === 1 && T.Backdrops.meadow !== undefined;
});

// =================================================================================================
// test/stubs.js
// =================================================================================================

check('stubs.plain makes a copy in the test realm that deepStrictEqual accepts', function () {
  const range = TG.Difficulty.wordRange(TG.Difficulty.get('medium'), 'hoppet', 2);
  assert.deepStrictEqual(stubs.plain(range), [6, 8]);
  assert.deepStrictEqual(stubs.plain({ a: [1, { b: 2 }] }), { a: [1, { b: 2 }] });
  return Array.isArray(range) && !(range instanceof Array) && stubs.plain(range) instanceof Array &&
    stubs.plain(undefined) === undefined && stubs.plain(null) === null && stubs.plain(3) === 3;
});

check('stubs: every load builds a fresh context', function () {
  const a = stubs.load({ files: CORE }), b = stubs.load({ files: CORE });
  a.TG.Events.on('hero:jump', function () {});
  a.TG.Save.setSetting('music', false);
  return a.TG !== b.TG && b.TG.Events.count('hero:jump') === 0 && b.TG.Save.getSetting('music') === true && a.window !== b.window;
});

check('stubs: the context has the globals of CONTRACT 10.1, and window points to itself', function () {
  const e2 = stubs.load({ files: [] });
  const names = ['window', 'document', 'navigator', 'localStorage', 'AudioContext', 'webkitAudioContext', 'requestAnimationFrame',
    'cancelAnimationFrame', 'performance', 'console', 'setTimeout', 'clearTimeout', 'Math', 'Date', 'JSON'];
  const absent = names.filter(function (n) { return e2.run('typeof ' + n) === 'undefined'; });
  if (absent.length > 0) return 'missing ' + absent.join(', ');
  const viaWindow = names.filter(function (n) { return e2.run('typeof window.' + n) === 'undefined'; });
  if (viaWindow.length > 0) return 'missing on window: ' + viaWindow.join(', ');
  return e2.run('window.window === window') === true && e2.run('window.document === document') === true &&
    e2.window.document === e2.document && e2.run('performance.now()') === 0 &&
    e2.window.innerWidth === 1920 && e2.window.innerHeight === 1080 && e2.window.devicePixelRatio === 1 &&
    e2.document.hidden === false && e2.document.visibilityState === 'visible' &&
    e2.TG === undefined && e2.loaded.length === 0;
});

check('stubs: storage "memory" gives a working localStorage backed by env.storage', function () {
  const e2 = stubs.load({ files: [], storage: 'memory' });
  const ls = e2.window.localStorage;
  ls.setItem('a', 1);
  ls.setItem('b', 'two');
  const okSet = e2.storage.get('a') === '1' && ls.getItem('b') === 'two' && ls.getItem('zzz') === null && ls.length === 2 && ls.key(0) === 'a';
  ls.removeItem('a');
  const okRemove = !e2.storage.has('a') && ls.length === 1;
  ls.clear();
  return okSet && okRemove && e2.storage.size === 0 && e2.storage instanceof Map && e2.run('localStorage === window.localStorage');
});

check('stubs: storage "none" leaves window.localStorage undefined; "throw" throws on reading it', function () {
  const none = stubs.load({ files: [], storage: 'none' });
  const thrower = stubs.load({ files: [], storage: 'throw' });
  return none.window.localStorage === undefined && none.run('typeof window.localStorage') === 'undefined' && none.storage === undefined &&
    throws(function () { return thrower.window.localStorage; }) &&
    thrower.run('(function () { try { window.localStorage; return false; } catch (e) { return true; } })()') === true &&
    thrower.storage === undefined;
});

check('stubs.load({ constants: { COYOTE: 0.12 } }) gives TG.C.COYOTE === 0.12 and a frozen TG.C', function () {
  const e2 = stubs.load({ files: CORE, constants: { COYOTE: 0.12, SHOCK_WIN: [0.1, 0.5] } });
  const C = e2.TG.C;
  return C.COYOTE === 0.12 && Object.isFrozen(C) && same(C.SHOCK_WIN, [0.1, 0.5]) && Object.isFrozen(C.SHOCK_WIN) &&
    C.W === 384 && C.JUMP_BUFFER === 0.15 && same(Object.keys(C), Object.keys(TG.C)) && TG.C.COYOTE === 0.1 &&
    e2.run('TG.C.COYOTE') === 0.12;
});

check('stubs: the constants are in place before the next file is loaded', function () {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'tg-stubs-'));
  const file = path.join(dir, 'reader.js');
  fs.writeFileSync(file, '(function (root) { var TG = root.TG; TG.seenAtLoad = TG.C.COYOTE; })(window);\n');
  try {
    const e2 = stubs.load({ files: ['js/core.js', path.relative(stubs.ROOT, file)], constants: { COYOTE: 0.12 } });
    return e2.TG.seenAtLoad === 0.12 && e2.loaded.length === 2;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

check('stubs: a constants name that TG.C does not have is an error', function () {
  return throws(function () { stubs.load({ files: CORE, constants: { COYOTEE: 0.12 } }); });
});

check('stubs: console.warn and console.error are captured in env.warnings and env.errors', function () {
  const e2 = stubs.load({ files: [] });
  e2.run('console.warn("careful", 3); console.error("broken", new Error("why"));');
  return same(e2.warnings, ['careful 3']) && e2.errors.length === 1 && e2.errors[0].indexOf('broken') === 0 &&
    e2.errors[0].indexOf('why') !== -1;
});

check('stubs: window and document listeners are recorded in env.listeners and called by env.dispatch', function () {
  const e2 = stubs.load({ files: [] });
  const seen = [];
  function onKey(e) { seen.push('w:' + e.key + ':' + e.type); e.preventDefault(); }
  function onVis(e) { seen.push('d:' + e.type); }
  e2.window.addEventListener('keydown', onKey);
  e2.window.addEventListener('keydown', onKey);              // the same listener twice counts once
  e2.document.addEventListener('visibilitychange', onVis);
  e2.document.addEventListener('keydown', function (e) { seen.push('d:' + e.key); });
  const ev = e2.dispatch('keydown', { key: 'a', code: 'KeyA' });
  const ev2 = e2.dispatch('visibilitychange');
  const ev3 = e2.dispatch('resize');
  const counts = [e2.listeners.keydown.length, e2.listeners.visibilitychange.length];
  e2.window.removeEventListener('keydown', onKey);
  e2.dispatch('keydown', { key: 'b' });
  return same(seen, ['w:a:keydown', 'd:a', 'd:visibilitychange', 'd:b']) && same(counts, [2, 1]) &&
    ev.defaultPrevented === true && ev.key === 'a' && ev.code === 'KeyA' && ev.repeat === false && ev.ctrlKey === false &&
    ev2.defaultPrevented === false && typeof ev2.preventDefault === 'function' && ev3.type === 'resize' &&
    e2.listeners.keydown.length === 1;
});

check('stubs: getElementById returns the same element for the same id, with the element interface', function () {
  const e2 = stubs.load({ files: [] });
  const a = e2.document.getElementById('btn-jump'), b = e2.document.getElementById('btn-jump');
  const stage = e2.document.getElementById('stage');
  const methods = ['addEventListener', 'removeEventListener', 'focus', 'blur', 'getBoundingClientRect', 'setAttribute', 'getAttribute'];
  const absent = methods.filter(function (m) { return typeof a[m] !== 'function'; });
  if (absent.length > 0) return 'missing ' + absent.join(', ');
  stage.classList.add('buttons-side');
  stage.classList.add('buttons-side');
  const had = stage.classList.contains('buttons-side') && stage.className === 'buttons-side';
  stage.classList.remove('buttons-side');
  stage.classList.toggle('buttons-below');
  a.setAttribute('tabindex', '-1');
  a.style.width = '64px';
  a.style.height = '64px';
  const rect = a.getBoundingClientRect();
  return a === b && a !== stage && typeof a.style === 'object' && had && !stage.classList.contains('buttons-side') &&
    stage.classList.contains('buttons-below') && a.getAttribute('tabindex') === '-1' && a.getAttribute('nothing') === null &&
    rect.width === 64 && rect.height === 64 && a.id === 'btn-jump';
});

check('stubs: env.dispatchTo calls a listener added to a stub element, in order, with preventDefault', function () {
  const e2 = stubs.load({ files: [] });
  const button = e2.document.getElementById('btn-jump');
  const seen = [];
  function first(e) { seen.push('first:' + e.pointerId); e.preventDefault(); }
  function second(e) { seen.push('second:' + e.type); }
  button.addEventListener('pointerdown', first);
  button.addEventListener('pointerdown', second);
  button.addEventListener('pointerup', function () { seen.push('up'); });
  const ev = e2.dispatchTo(button, 'pointerdown', { pointerId: 1 });
  e2.dispatchTo(button, 'pointerup', { pointerId: 1 });
  e2.dispatchTo(button, 'pointercancel', { pointerId: 1 });       // no listener: nothing happens
  const recorded = button.listeners.pointerdown.length === 2 && button.listeners.pointerup.length === 1;
  button.removeEventListener('pointerdown', first);
  e2.dispatchTo(button, 'pointerdown', { pointerId: 2 });
  return same(seen, ['first:1', 'second:pointerdown', 'up', 'second:pointerdown']) && ev.defaultPrevented === true &&
    ev.target === button && recorded && button.listeners.pointerdown.length === 1 &&
    Object.keys(e2.listeners).length === 0;
});

check('stubs: env.setHidden and env.setSize change the values and dispatch nothing', function () {
  const e2 = stubs.load({ files: [] });
  let calls = 0;
  e2.document.addEventListener('visibilitychange', function () { calls++; });
  e2.window.addEventListener('resize', function () { calls++; });
  e2.setHidden(true);
  const hidden = e2.document.hidden === true && e2.document.visibilityState === 'hidden' && e2.run('document.hidden') === true;
  e2.setHidden(false);
  e2.setSize(1280, 720);
  return hidden && e2.document.hidden === false && e2.document.visibilityState === 'visible' && calls === 0 &&
    e2.window.innerWidth === 1280 && e2.window.innerHeight === 720 && e2.run('window.innerWidth + innerHeight') === 2000;
});

check('stubs: requestAnimationFrame stores callbacks in env.raf; env.runFrame runs and clears them', function () {
  const e2 = stubs.load({ files: [] });
  const seen = [];
  const id1 = e2.window.requestAnimationFrame(function (t) {
    seen.push('a' + t);
    e2.window.requestAnimationFrame(function (t2) { seen.push('c' + t2); });
  });
  const id2 = e2.window.requestAnimationFrame(function (t) { seen.push('b' + t); });
  const id3 = e2.window.requestAnimationFrame(function () { seen.push('cancelled'); });
  e2.window.cancelAnimationFrame(id3);
  const waiting = e2.raf.length;
  const nothingYet = seen.length === 0;
  e2.runFrame(16);
  const afterFirst = e2.raf.length;
  e2.runFrame(32);
  return nothingYet && waiting === 2 && afterFirst === 1 && e2.raf.length === 0 && same(seen, ['a16', 'b16', 'c32']) &&
    id1 !== id2 && typeof id1 === 'number';
});

check('stubs: setTimeout runs nothing by itself', function () {
  const e2 = stubs.load({ files: [] });
  let n = 0;
  const id = e2.window.setTimeout(function () { n++; }, 10);
  e2.window.setTimeout(function () { n += 10; }, 10);
  e2.window.clearTimeout(id);
  const before = n;
  e2.runTimers();
  return before === 0 && n === 10 && e2.timers.length === 0;
});

check('stubs: the canvas stub counts every 2D context call in env.canvasCalls', function () {
  const e2 = stubs.load({ files: [] });
  const c = e2.document.createElement('canvas');
  c.width = 32;
  c.height = 16;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.anything = 5;
  ctx.fillRect(0, 0, 4, 4);
  ctx.drawImage(c, 0, 0);
  ctx.fillText('x', 0, 0);
  ctx.save();
  ctx.restore();
  const img = ctx.getImageData(0, 0, 3, 2);
  const made = ctx.createImageData(2, 2);
  const text = ctx.measureText('hello');
  const grad = ctx.createLinearGradient(0, 0, 1, 1);
  grad.addColorStop(0, '#000000');
  return e2.canvasCalls.count === 9 && img.width === 3 && img.height === 2 && img.data instanceof Uint8ClampedArray &&
    img.data.length === 24 && made.data.length === 16 && text.width === 0 && ctx.fillStyle === '#ff0000' && ctx.anything === 5 &&
    c.getContext('2d') === ctx && typeof c.style === 'object' && ctx.createPattern(c, 'repeat') !== undefined &&
    c.getContext('webgl') === null;
});

check('stubs: getElementById("game") is a canvas of 384 x 216 and is env.canvas', function () {
  const e2 = stubs.load({ files: [] });
  const g = e2.document.getElementById('game');
  return g === e2.canvas && g.width === 384 && g.height === 216 && typeof g.getContext === 'function' &&
    g.getContext('2d') !== null && typeof g.addEventListener === 'function' && g.tagName === 'CANVAS';
});

check('stubs: the AudioContext stub counts contexts, nodes, starts, suspends and resumes', function () {
  const e2 = stubs.load({ files: [] });
  const AC = e2.window.AudioContext;
  const ctx = e2.run('new AudioContext()');
  const osc = ctx.createOscillator(), gain = ctx.createGain(), src = ctx.createBufferSource();
  const comp = ctx.createDynamicsCompressor(), pan = ctx.createStereoPanner(), filter = ctx.createBiquadFilter();
  const wave = ctx.createPeriodicWave(new Float32Array(32), new Float32Array(32));
  const buffer = ctx.createBuffer(1, 100, 44100);
  osc.setPeriodicWave(wave);
  const chained = osc.connect(gain);
  gain.connect(comp);
  comp.connect(ctx.destination);
  src.buffer = buffer;
  osc.frequency.setValueAtTime(523, 0);
  osc.frequency.linearRampToValueAtTime(600, 0.1);
  osc.frequency.exponentialRampToValueAtTime(700, 0.2);
  gain.gain.setTargetAtTime(0, 0.2, 0.01);
  gain.gain.cancelScheduledValues(0);
  pan.pan.value = -0.7;
  filter.frequency.value = 1000;
  osc.start(0);
  osc.stop(0.1);
  src.start();
  osc.disconnect();
  const stateBefore = ctx.state;
  ctx.suspend();
  const stateSuspended = ctx.state;
  ctx.resume();
  const a = e2.audio;
  return AC === e2.window.webkitAudioContext && a.contexts.length === 1 && a.contexts[0] === ctx && a.nodes === 6 && a.starts === 2 &&
    a.suspends === 1 && a.resumes === 1 && stateBefore === 'running' && stateSuspended === 'suspended' && ctx.state === 'running' &&
    chained === gain && ctx.currentTime === 0 && ctx.destination !== undefined &&
    buffer.getChannelData(0) instanceof Float32Array && buffer.getChannelData(0).length === 100 &&
    osc.frequency.value === 700 && pan.pan.value === -0.7 && osc.frequency.events.length === 3;
});

check('stubs: env.audio.advance(1) raises currentTime of a created context by 1; currentTime is writable', function () {
  const e2 = stubs.load({ files: [] });
  const a = e2.run('new AudioContext()'), b = e2.run('new webkitAudioContext()');
  e2.audio.advance(1);
  e2.audio.advance(0.5);
  const first = a.currentTime === 1.5 && b.currentTime === 1.5;
  a.currentTime = 10;
  e2.audio.advance(1);
  return first && a.currentTime === 11 && b.currentTime === 2.5 && e2.audio.contexts.length === 2;
});

check('stubs: AudioContext can be removed from the stub window', function () {
  const e2 = stubs.load({ files: [] });
  delete e2.window.AudioContext;
  delete e2.window.webkitAudioContext;
  return e2.run('typeof AudioContext') === 'undefined' && e2.run('typeof window.webkitAudioContext') === 'undefined';
});

check('stubs: canvas "soft" gives software canvases that really draw; env.canvas is the game canvas', function () {
  const e2 = stubs.load({ files: CORE, canvas: 'soft' });
  const g = e2.document.getElementById('game');
  const other = e2.document.createElement('canvas');
  other.width = 2;
  other.height = 2;
  const octx = other.getContext('2d');
  octx.fillStyle = e2.TG.PAL[e2.TG.COLOR.GOLD];
  octx.fillRect(0, 0, 2, 2);
  const ctx = g.getContext('2d');
  ctx.drawImage(other, 10, 20);
  const rgba = g.toRGBA();
  const at = function (x, y) { return Array.from(rgba.slice((y * 384 + x) * 4, (y * 384 + x) * 4 + 4)); };
  return g === e2.canvas && g.width === 384 && g.height === 216 && rgba.length === 384 * 216 * 4 &&
    same(at(10, 20), [0xF8, 0xC0, 0x20, 255]) && same(at(11, 21), [0xF8, 0xC0, 0x20, 255]) && same(at(12, 20), [0, 0, 0, 0]) &&
    e2.canvasCalls.count === 2 && typeof g.addEventListener === 'function' && typeof g.getBoundingClientRect === 'function' &&
    throws(function () { ctx.fillText('x', 0, 0); });
});

// =================================================================================================
// The documents
// =================================================================================================

function readDoc(name) {
  try {
    return fs.readFileSync(path.join(stubs.ROOT, 'docs', name), 'utf8');
  } catch (e) {
    return null;
  }
}

// The text from the heading line that starts with `from` up to the heading line that starts with `to`.
function between(text, from, to) {
  const lines = text.split('\n');
  let a = -1, b = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (a === -1 && lines[i].indexOf(from) === 0) a = i;
    else if (a !== -1 && lines[i].indexOf(to) === 0) { b = i; break; }
  }
  if (a === -1) throw new Error('heading not found: ' + from);
  return lines.slice(a, b).join('\n');
}

function cells(line) {
  const parts = line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/);
  return parts.map(function (c) { return c.trim(); });
}

// Every markdown table of the text: { header, rows, before } where `before` is the last line of text above it.
function tables(text) {
  const lines = text.split('\n');
  const out = [];
  let lastText = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().indexOf('|') === 0 && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const table = { header: cells(line), rows: [], before: lastText };
      i += 2;
      while (i < lines.length && lines[i].trim().indexOf('|') === 0) {
        table.rows.push(cells(lines[i]));
        i++;
      }
      i--;
      out.push(table);
    } else if (line.trim() !== '') {
      lastText = line.trim();
    }
  }
  return out;
}

function codeBlocks(text) {
  const out = [];
  const re = /```js\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

function unquote(s) {
  return s.replace(/`/g, '').trim();
}

const contract = readDoc('CONTRACT.md');
const design = readDoc('DESIGN.md');

if (contract === null || design === null) {
  skip('doc: docs/CONTRACT.md or docs/DESIGN.md is not present; the comparisons with the documents were not made');
} else {
  check('doc: TG.C equals the code block of CONTRACT section 3, key by key and in the same order', function () {
    const sec = between(contract, '## 3. Constants', '## 4. Public API');
    const block = codeBlocks(sec).filter(function (b) { return b.indexOf('TG.C = {') === 0; })[0];
    if (!block) return 'the code block was not found';
    const doc = vm.runInNewContext('var TG = {}; ' + block + '; TG.C');
    const docKeys = Object.keys(doc), codeKeys = Object.keys(TG.C);
    if (docKeys.length < 100) return 'only ' + docKeys.length + ' constants were read from the document';
    const absent = docKeys.filter(function (k) { return codeKeys.indexOf(k) === -1; });
    const extra = codeKeys.filter(function (k) { return docKeys.indexOf(k) === -1; });
    if (absent.length || extra.length) return 'missing: ' + absent.join(' ') + ' extra: ' + extra.join(' ');
    const wrong = docKeys.filter(function (k) { return JSON.stringify(doc[k]) !== JSON.stringify(TG.C[k]) || typeof doc[k] !== typeof TG.C[k]; });
    if (wrong.length) return 'different values: ' + wrong.join(' ');
    return same(docKeys, codeKeys) ? true : 'the order of the keys differs';
  });

  check('doc: TG.COLOR equals the code block of CONTRACT section 3', function () {
    const sec = between(contract, '## 3. Constants', '## 4. Public API');
    const block = codeBlocks(sec).filter(function (b) { return b.indexOf('TG.COLOR = {') === 0; })[0];
    if (!block) return 'the code block was not found';
    const doc = vm.runInNewContext('var TG = {}; ' + block + '; TG.COLOR');
    return Object.keys(doc).length === 32 && JSON.stringify(doc) === JSON.stringify(TG.COLOR);
  });

  check('doc: TG.PAL, TG.PAL_KEYS and TG.COLOR equal the palette table of DESIGN 14.2', function () {
    const sec = between(design, '### 14.2 Master palette', '### 14.3');
    const t = tables(sec)[0];
    if (!t || t.rows.length !== 16) return 'the table was not found';
    const seen = [];
    t.rows.forEach(function (r) {
      [0, 4].forEach(function (o) {
        seen.push({ index: Number(r[o]), key: r[o + 1], name: r[o + 2], hex: r[o + 3] });
      });
    });
    if (seen.length !== 32) return 'read ' + seen.length + ' palette entries';
    const wrong = seen.filter(function (p) {
      return TG.PAL[p.index] !== p.hex || TG.PAL_KEYS.charAt(p.index) !== p.key || TG.COLOR[p.name] !== p.index;
    });
    return wrong.length === 0 ? true : 'different: ' + wrong.map(function (p) { return p.name; }).join(' ');
  });

  check('doc: TG.Events.NAMES lists every event of CONTRACT section 8, in the order of the tables, with its payload fields', function () {
    const sec = between(contract, '## 8. Event registry', '## 9. Game state machine');
    const found = [];
    tables(sec).forEach(function (t) {
      if (t.header[0] !== 'Event') return;
      t.rows.forEach(function (r) {
        const name = unquote(r[0]);
        const m = /`\{([^}]*)\}`/.exec(r[1]);
        if (!m) throw new Error('no payload found for ' + name);
        const fields = m[1].split(',').map(function (f) { return f.split(':')[0].trim(); }).filter(Boolean);
        found.push({ name: name, fields: fields });
      });
    });
    if (found.length < 50) return 'only ' + found.length + ' events were read from the document';
    const docNames = found.map(function (f) { return f.name; });
    if (!same(docNames, TG.Events.NAMES)) {
      const absent = docNames.filter(function (n) { return TG.Events.NAMES.indexOf(n) === -1; });
      const extra = TG.Events.NAMES.filter(function (n) { return docNames.indexOf(n) === -1; });
      return 'missing: ' + absent.join(' ') + ' extra: ' + extra.join(' ') + (absent.length + extra.length === 0 ? ' (order differs)' : '');
    }
    const wrong = found.filter(function (f) { return !same(f.fields, TG.Events.FIELDS[f.name]); });
    return wrong.length === 0 ? true : 'payload fields differ for: ' + wrong.map(function (f) { return f.name; }).join(' ');
  });

  check('doc: TG.Sprites.MANIFEST equals the tables of CONTRACT 6.4 (name, size, frames, frame names, fps, anchor, owner)', function () {
    const sec = between(contract, '### 6.4 Sprite registry', '### 6.5 Backdrops');
    const parts = sec.split('**WP-D: `js/sprites-world.js`**');
    if (parts.length !== 2) return 'the WP-D heading was not found';
    const found = [];
    [['C', parts[0]], ['D', parts[1]]].forEach(function (pair) {
      tables(pair[1]).forEach(function (t) {
        if (t.header[0] !== 'Name') return;
        const col = {};
        t.header.forEach(function (h, i) { col[h] = i; });
        const sizeDefault = /\((\d+)x(\d+)/.exec(t.before);
        const anchorZero = /anchor 0,0/.test(t.before);
        const anchorBottomLeft = /anchor bottom left/.test(t.before);
        t.rows.forEach(function (r) {
          const name = unquote(r[col.Name]);
          let w, h;
          if (col.Size !== undefined) {
            const m = /^(\d+)x(\d+)$/.exec(r[col.Size]);
            if (!m) throw new Error('size of ' + name + ' not understood: ' + r[col.Size]);
            w = Number(m[1]); h = Number(m[2]);
          } else if (sizeDefault) {
            w = Number(sizeDefault[1]); h = Number(sizeDefault[2]);
          } else {
            throw new Error('no size for ' + name);
          }
          const names = r[col['Frame names']].split(/\s+/).filter(Boolean);
          const frames = Number(r[col.Frames]);
          const fps = col.fps !== undefined ? Number(r[col.fps]) : 0;
          let ax, ay;
          const usedFor = r[col['Used for']] || '';
          const inText = /Anchor (\d+),(\d+)/.exec(usedFor);
          if (col.Anchor !== undefined) {
            const m = /^(-?\d+),(-?\d+)$/.exec(r[col.Anchor]);
            if (!m) throw new Error('anchor of ' + name + ' not understood: ' + r[col.Anchor]);
            ax = Number(m[1]); ay = Number(m[2]);
          } else if (inText) {
            ax = Number(inText[1]); ay = Number(inText[2]);
          } else if (anchorZero) {
            ax = 0; ay = 0;
          } else if (anchorBottomLeft) {
            ax = 0; ay = h;
          } else {
            throw new Error('no anchor for ' + name);
          }
          found.push({ name: name, w: w, h: h, frames: frames, ax: ax, ay: ay, owner: pair[0], fps: fps, names: names });
        });
      });
    });
    if (found.length < 80) return 'only ' + found.length + ' sprites were read from the document';
    const badCount = found.filter(function (f) { return f.names.length !== f.frames; });
    if (badCount.length) return 'the document itself disagrees on frames for ' + badCount.map(function (f) { return f.name; }).join(' ');
    const M = stubs.plain(TG.Sprites.MANIFEST);
    const docNames = found.map(function (f) { return f.name; });
    const codeNames = M.map(function (m) { return m.name; });
    const absent = docNames.filter(function (n) { return codeNames.indexOf(n) === -1; });
    const extra = codeNames.filter(function (n) { return docNames.indexOf(n) === -1; });
    if (absent.length || extra.length) return 'missing: ' + absent.join(' ') + ' extra: ' + extra.join(' ');
    const wrong = found.filter(function (f) {
      const m = M[codeNames.indexOf(f.name)];
      return !same(m, f);
    });
    if (wrong.length) return 'different: ' + wrong.map(function (f) { return f.name; }).join(' ');
    return same(docNames, codeNames) ? true : 'the order differs';
  });

  check('doc: TG.Difficulty.get("medium") equals the example entry of CONTRACT 5.10, key by key and in the same order', function () {
    const sec = between(contract, '### 5.10 Difficulty config entry', '### 5.11');
    const block = codeBlocks(sec).filter(function (b) { return /^\{\s*\n\s*id: 'medium'/.test(b); })[0];
    if (!block) return 'the code block was not found';
    const doc = vm.runInNewContext('(' + block + ')');
    const code = TG.Difficulty.get('medium');
    if (Object.keys(doc).length < 30) return 'only ' + Object.keys(doc).length + ' keys were read from the document';
    const wrong = Object.keys(doc).filter(function (k) { return JSON.stringify(doc[k]) !== JSON.stringify(code[k]); });
    if (wrong.length) return 'different: ' + wrong.join(' ');
    return JSON.stringify(doc) === JSON.stringify(code) ? true : 'the keys or their order differ';
  });

  check('doc: the three difficulty entries have every value of the table in CONTRACT 5.10', function () {
    const sec = between(contract, '### 5.10 Difficulty config entry', '### 5.11');
    const t = tables(sec).filter(function (x) { return x.header[0] === 'Field' && x.header.length === 4; })[0];
    if (!t) return 'the table was not found';
    function value(text) {
      return vm.runInNewContext('(' + unquote(text) + ')');
    }
    function read(config, pathText) {
      let v = config;
      pathText.replace(/\[(\d+)\]/g, '.$1').split('.').forEach(function (k) { v = v[k]; });
      return v;
    }
    const names = ['easy', 'medium', 'hard'];
    const problems = [];
    const covered = {};
    let compared = 0;
    t.rows.forEach(function (r) {
      const fieldCell = r[0];
      const slash = fieldCell.indexOf(' / ') !== -1;
      let fields = fieldCell.split(slash ? ' / ' : ', ').map(unquote);
      const prefix = fields[0].indexOf('.') !== -1 ? fields[0].slice(0, fields[0].lastIndexOf('.') + 1) : '';
      fields = fields.map(function (f, i) { return i > 0 && f.indexOf('.') === -1 ? prefix + f : f; });
      const easyText = r[1];
      names.forEach(function (n, col) {
        let text = r[col + 1];
        if (text === 'same') text = easyText;
        let values;
        if (fields[0].indexOf('bot.') === 0) {
          const p = text.split(',').map(function (x) { return Number(x.trim()); });
          values = [{ wpm: p[0], accuracy: p[1], react: p[2] }];
        } else if (slash) {
          values = text.split(' / ').map(value);
        } else {
          values = fields.map(function () { return value(text); });
        }
        if (values.length !== fields.length) {
          problems.push(fieldCell + ' could not be read');
          return;
        }
        fields.forEach(function (f, i) {
          covered[f.split(/[.[]/)[0]] = true;
          compared++;
          const got = read(TG.Difficulty.get(n), f);
          if (JSON.stringify(got) !== JSON.stringify(values[i]) || typeof got !== typeof values[i]) {
            problems.push(n + '.' + f + ' is ' + JSON.stringify(got) + ', the table says ' + JSON.stringify(values[i]));
          }
        });
      });
    });
    if (problems.length) return problems.slice(0, 5).join('; ');
    if (compared < 180) return 'only ' + compared + ' values were compared';
    const uncovered = Object.keys(TG.Difficulty.get('easy')).filter(function (k) { return k !== 'id' && !covered[k]; });
    return uncovered.length === 0 ? true : 'keys that the table does not mention: ' + uncovered.join(' ');
  });

  check('doc: the seeded scores equal the table of CONTRACT 5.12', function () {
    const sec = between(contract, '### 5.12 Save data', '### 5.13');
    const t = tables(sec).filter(function (x) { return x.header[0] === 'Difficulty'; })[0];
    if (!t || t.rows.length !== 3) return 'the table was not found';
    const d = TG.Save.defaults();
    const problems = [];
    t.rows.forEach(function (r) {
      const table = d.scores[r[0]];
      for (let i = 0; i < 5; i++) {
        const p = r[i + 1].split(/\s+/);
        const e = table[i];
        if (e.name !== p[0] || e.score !== Number(p[1]) || e.wpm !== Number(p[2]) || e.accuracy !== Number(p[3]) || e.rank !== p[4]) {
          problems.push(r[0] + ' ' + (i + 1));
        }
      }
    });
    return problems.length === 0 ? true : 'different: ' + problems.join(', ');
  });

  check('doc: stubs.FILES equals the file table and the script tags of CONTRACT section 1', function () {
    const sec = between(contract, '## 1. Files, owners and load order', '## 2. Module pattern');
    const t = tables(sec)[0];
    const numbered = t.rows.filter(function (r) { return /^\d+$/.test(r[0]); }).map(function (r) { return unquote(r[1]); });
    const tags = [];
    const re = /<script src="([^"]+)"><\/script>/g;
    let m;
    while ((m = re.exec(sec)) !== null) tags.push(m[1]);
    return numbered.length === 20 && same(numbered, stubs.FILES) && same(tags, stubs.FILES);
  });

  check('doc: TG.Difficulty.TUNABLE equals the list in CONTRACT 4.5', function () {
    const sec = between(contract, '### 4.5 `TG.Difficulty`', '### 4.6');
    const m = /TG\.Difficulty\.TUNABLE[^\n]*\n\s*\/\/\s*(\[[^\]]*\n[^\]]*\])/.exec(sec);
    if (!m) return 'the list was not found';
    const list = vm.runInNewContext('(' + m[1].replace(/\n\s*\/\//g, '\n') + ')');
    return same(list, TG.Difficulty.TUNABLE);
  });
}

// =================================================================================================

console.log('');
console.log('test-core: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
