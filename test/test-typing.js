// test/test-typing.js
// Tests for js/typing.js (WP-A). Run from the project root: node test/test-typing.js
//
// Covers the WP-A acceptance checks of CONTRACT section 12 that concern the typing engine, the key
// handling order of 4.7, the statistics of 5.11 and the event payloads of 8.1. Typables are built by
// hand from the interface of 5.3.
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

function near(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance;
}

const FILES = ['js/core.js', 'js/words.js', 'js/typing.js'];

// One engine per check, with the events recorded.
function setup(opts) {
  const env = stubs.load({ files: FILES });
  const TG = env.TG;
  TG.Events.clear();
  const events = [];
  TG.Events.on('*', function (payload, name) {
    events.push({ name: name, payload: payload });
  });
  const ty = TG.Typing.create(opts || { autoReleaseMisses: 3, streakPenaltySteps: 2 });
  return { env: env, TG: TG, T: TG.Typing, ty: ty, events: events };
}

let nextId = 1;

function typable(word, extra) {
  const t = {
    id: nextId++,
    kind: 'hoppet',
    word: word,
    typable: true,
    priority: 0,
    eta: 3,
    x: 400, y: 184,
    shownAt: 0,
    lost: false,
    typed: 0,
    errors: 0,
    firstKeyAt: null,
    lastKeyAt: null
  };
  if (extra) for (const k in extra) t[k] = extra[k];
  return t;
}

// Types the letters of `text` one per `interval` seconds starting at `from`. Returns the results.
function typeText(s, text, typables, from, interval) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    out.push(s.T.key(s.ty, text.charAt(i), typables, from + i * interval));
  }
  return out;
}

function eventsNamed(s, name) {
  return s.events.filter(function (e) { return e.name === name; });
}

function statsSnapshot(ty) {
  return JSON.stringify(ty.stats);
}

// =================================================================================================
// Loading
// =================================================================================================

check('typing.js loads with only core.js and words.js and makes no canvas, audio or storage calls', function () {
  const env = stubs.load({ files: FILES });
  return same(env.loaded, FILES) && env.canvasCalls.count === 0 && env.audio.contexts.length === 0 &&
    env.storage.size === 0 && env.raf.length === 0 && env.timers.length === 0 &&
    env.warnings.length === 0 && env.errors.length === 0 && typeof env.TG.Typing === 'object';
});

check('typing.js loads alone with core.js (words.js absent) and exposes the public API of 4.7', function () {
  const env = stubs.load({ files: ['js/core.js', 'js/typing.js'] });
  const T = env.TG.Typing;
  const names = ['create', 'sync', 'key', 'release', 'backspace', 'locked', 'onDamage', 'onMissed', 'sectionSummary',
    'sectionReset', 'summary', 'weakLetters', 'mult'];
  return env.warnings.length === 0 && env.errors.length === 0 &&
    names.every(function (n) { return typeof T[n] === 'function'; });
});

// =================================================================================================
// The engine object and the statistics shape
// =================================================================================================

check('create gives the four public fields with opts as passed, target null and discardT 0', function () {
  const s = setup({ autoReleaseMisses: 3, streakPenaltySteps: 1 });
  return s.ty.opts.autoReleaseMisses === 3 && s.ty.opts.streakPenaltySteps === 1 &&
    s.ty.target === null && s.ty.discardT === 0 && typeof s.ty.stats === 'object';
});

check('stats has every field of CONTRACT 5.11 with its starting value, and perKey has a to z', function () {
  const s = setup();
  const st = s.ty.stats;
  const expected = {
    correct: 0, wrong: 0, wordsCleared: 0, wordsClean: 0, wordsMissed: 0, lettersInWords: 0, wordTime: 0,
    wpm: 0, liveWpm: null, peakWpm: 0, accuracy: 1, keyStreak: 0, bestKeyStreak: 0, cleanRun: 0,
    bestCleanRun: 0, mult: 1, reactionSum: 0, reactionCount: 0
  };
  for (const k in expected) {
    if (st[k] !== expected[k]) return k + ' is ' + st[k];
  }
  const keys = Object.keys(st.perKey);
  if (keys.length !== 26) return 'perKey has ' + keys.length + ' letters';
  for (let i = 0; i < 26; i++) {
    const ch = String.fromCharCode(97 + i);
    if (!same(st.perKey[ch], { hits: 0, misses: 0, intervalSum: 0, intervalCount: 0 })) return 'perKey.' + ch;
  }
  return Array.isArray(st.recentWords) && st.recentWords.length === 0 &&
    same(st.section, { correct: 0, wrong: 0, lettersInWords: 0, wordTime: 0, words: 0 });
});

check('mult follows MULT_STEPS: 0-2 x1, 3-5 x2, 6-9 x3, 10-14 x4, 15+ x5', function () {
  const s = setup();
  const table = [[0, 1], [1, 1], [2, 1], [3, 2], [5, 2], [6, 3], [9, 3], [10, 4], [14, 4], [15, 5], [40, 5]];
  for (const row of table) {
    if (s.T.mult(row[0]) !== row[1]) return 'mult(' + row[0] + ') = ' + s.T.mult(row[0]);
  }
  return true;
});

// =================================================================================================
// Locking
// =================================================================================================

check('a key with no typables returns ignored and changes no statistic', function () {
  const s = setup();
  const before = statsSnapshot(s.ty);
  const r = s.T.key(s.ty, 'a', [], 1);
  return r.type === 'ignored' && r.target === null && r.index === -1 && statsSnapshot(s.ty) === before &&
    s.events.length === 0 && s.ty.target === null;
});

check('a key when no typable is typable (all typable === false) returns ignored', function () {
  const s = setup();
  const t = typable('frog', { typable: false });
  const r = s.T.key(s.ty, 'f', [t], 1);
  return r.type === 'ignored' && s.ty.target === null && t.typed === 0 && s.ty.stats.correct === 0;
});

check('the first letter locks the typable whose word starts with it: typed 1, firstKeyAt set, result lock', function () {
  const s = setup();
  const t = typable('frog');
  const r = s.T.key(s.ty, 'f', [t], 2.5);
  return r.type === 'lock' && r.target === t && r.index === 0 && r.released === false &&
    t.typed === 1 && t.firstKeyAt === 2.5 && t.lastKeyAt === 2.5 && s.ty.target === t &&
    s.T.locked(s.ty) === t && s.ty.stats.correct === 1 && s.ty.stats.keyStreak === 1;
});

check('lock emits target:lock then type:hit with index 0 and complete false', function () {
  const s = setup();
  const t = typable('frog', { id: 7, kind: 'buzzle', x: 300, y: 168 });
  s.T.key(s.ty, 'f', [t], 1);
  const names = s.events.map(function (e) { return e.name; });
  const lock = s.events[0].payload, hit = s.events[1].payload;
  return same(names, ['target:lock', 'type:hit']) &&
    lock.target === t && lock.id === 7 && lock.kind === 'buzzle' && lock.x === 300 && lock.y === 168 &&
    hit.target === t && hit.id === 7 && hit.kind === 'buzzle' && hit.ch === 'f' && hit.index === 0 &&
    hit.length === 4 && hit.complete === false && hit.x === 300 && hit.y === 168;
});

check('lock chooses the lowest priority: a threat beats a crate that starts with the same letter', function () {
  const s = setup();
  const crate = typable('cake', { priority: 2, eta: 1, kind: 'crate' });
  const threat = typable('cow', { priority: 0, eta: 5 });
  const r = s.T.key(s.ty, 'c', [crate, threat], 1);
  return r.target === threat && crate.typed === 0 && threat.typed === 1;
});

check('lock chooses the lowest eta among equal priorities (two words where one letter matches both)', function () {
  const s = setup();
  const far = typable('bee', { eta: 4 });
  const nearT = typable('bug', { eta: 2 });
  const r = s.T.key(s.ty, 'b', [far, nearT], 1);
  return r.target === nearT && far.typed === 0 && nearT.typed === 1 && s.ty.target === nearT;
});

check('lock chooses the lowest id when priority and eta are equal', function () {
  const s = setup();
  const a = typable('sun', { id: 20, eta: 2 });
  const b = typable('sky', { id: 3, eta: 2 });
  const r = s.T.key(s.ty, 's', [a, b], 1);
  return r.target === b;
});

check('a crate locks when no threat matches the letter', function () {
  const s = setup();
  const crate = typable('cake', { priority: 2, kind: 'crate' });
  const threat = typable('dog', { priority: 0 });
  const r = s.T.key(s.ty, 'c', [crate, threat], 1);
  return r.type === 'lock' && r.target === crate;
});

check('a typable with typed > 0 that is not locked is not a lock candidate', function () {
  const s = setup();
  const a = typable('bee', { typed: 2 });
  const b = typable('bug', { eta: 9 });
  const r = s.T.key(s.ty, 'b', [a, b], 1);
  return r.target === b;
});

check('while locked, keys apply only to the locked word even if another word starts with the key', function () {
  const s = setup();
  const a = typable('frog');
  const b = typable('rat');
  s.T.key(s.ty, 'f', [a, b], 1);
  const r = s.T.key(s.ty, 'r', [a, b], 2);
  return r.type === 'hit' && r.target === a && a.typed === 2 && b.typed === 0;
});

check('a letter that matches no word while words are visible is a wrong key with target null, recorded against the nearest word', function () {
  const s = setup();
  const far = typable('frog', { eta: 5 });
  const nearT = typable('dog', { eta: 1, x: 250, y: 184 });
  const r = s.T.key(s.ty, 'z', [far, nearT], 1);
  const miss = eventsNamed(s, 'type:miss');
  return r.type === 'miss' && r.target === null && r.expected === 'd' && s.ty.stats.wrong === 1 &&
    s.ty.stats.perKey.d.misses === 1 && s.ty.stats.correct === 0 && s.ty.stats.accuracy === 0 &&
    miss.length === 1 && miss[0].payload.target === null && miss[0].payload.id === null &&
    miss[0].payload.expected === 'd' && miss[0].payload.repeat === 1 && miss[0].payload.x === 250 &&
    s.ty.target === null && far.typed === 0 && nearT.typed === 0;
});

// =================================================================================================
// Completing a word
// =================================================================================================

check('the last letter completes the word on the same call: result complete, clean, wordTime, target released silently', function () {
  const s = setup();
  const t = typable('frog');
  const rs = typeText(s, 'frog', [t], 1, 0.25);
  const last = rs[3];
  const names = s.events.map(function (e) { return e.name; });
  return rs[0].type === 'lock' && rs[1].type === 'hit' && rs[2].type === 'hit' &&
    last.type === 'complete' && last.target === t && last.clean === true && near(last.wordTime, 0.75, 1e-9) &&
    last.index === 3 && s.ty.target === null && s.T.locked(s.ty) === null && t.typed === 4 &&
    names.indexOf('target:release') === -1 &&
    same(names, ['target:lock', 'type:hit', 'type:hit', 'type:hit', 'type:hit']) &&
    s.events[4].payload.complete === true && s.events[4].payload.index === 3;
});

check('completion updates wordsCleared, wordsClean, lettersInWords, wordTime, wpm and recentWords', function () {
  const s = setup();
  const t = typable('frog');
  typeText(s, 'frog', [t], 1, 0.25);
  const st = s.ty.stats;
  return st.wordsCleared === 1 && st.wordsClean === 1 && st.lettersInWords === 3 && near(st.wordTime, 0.75, 1e-9) &&
    near(st.wpm, 48, 1e-6) && st.recentWords.length === 1 && st.recentWords[0].length === 4 &&
    near(st.recentWords[0].time, 0.75, 1e-9) && st.recentWords[0].clean === true && near(st.recentWords[0].at, 1.75, 1e-9) &&
    st.correct === 4 && st.wrong === 0 && st.accuracy === 1 && st.keyStreak === 4 && st.bestKeyStreak === 4;
});

check('a scripted word typed at a fixed interval reports WPM within 1% of 12 / interval', function () {
  const s = setup();
  const interval = 0.2;   // 60 WPM
  const words = ['river', 'bridge', 'rainbow', 'ocean'];
  let now = 5;
  for (const w of words) {
    const t = typable(w);
    typeText(s, w, [t], now, interval);
    now += w.length * interval + 1.3;
  }
  const expected = 12 / interval;
  return near(s.ty.stats.wpm, expected, expected * 0.01) && s.ty.stats.wordsCleared === 4;
});

check('time spent on wrong keys inside a word is included in the word time', function () {
  const s = setup();
  const t = typable('frog');
  s.T.key(s.ty, 'f', [t], 1);
  s.T.key(s.ty, 'x', [t], 1.5);
  s.T.key(s.ty, 'r', [t], 2);
  s.T.key(s.ty, 'o', [t], 2.5);
  const r = s.T.key(s.ty, 'g', [t], 3);
  return r.type === 'complete' && r.clean === false && near(r.wordTime, 2, 1e-9) && s.ty.stats.wordsClean === 0 &&
    near(s.ty.stats.wpm, 18, 1e-9);
});

check('completing a word of kind core emits type:hit with complete true and kind core, and no target:release', function () {
  const s = setup();
  const t = typable('acorn', { kind: 'core', eta: Infinity, priority: 0 });
  const rs = typeText(s, 'acorn', [t], 1, 0.1);
  const hits = eventsNamed(s, 'type:hit');
  const lastHit = hits[hits.length - 1].payload;
  return rs[4].type === 'complete' && lastHit.complete === true && lastHit.kind === 'core' &&
    lastHit.length === 5 && eventsNamed(s, 'target:release').length === 0 && s.ty.target === null;
});

check('key times are strictly increasing: two keys at the same now are 0.001 s apart, and an earlier now is moved forward', function () {
  const s = setup();
  const t = typable('as');
  const r1 = s.T.key(s.ty, 'a', [t], 3);
  const r2 = s.T.key(s.ty, 's', [t], 3);
  const first = t.firstKeyAt;
  const u = typable('ad');
  s.T.key(s.ty, 'a', [u], 1);       // earlier than the previous key
  const r3 = s.T.key(s.ty, 'd', [u], 1);
  return r1.type === 'lock' && r2.type === 'complete' && near(r2.wordTime, 0.001, 1e-12) && first === 3 &&
    near(u.firstKeyAt, 3.002, 1e-12) && near(r3.wordTime, 0.001, 1e-12) && r3.type === 'complete';
});

check('a one-letter word is complete on its lock (contract 4.7 step 4): type:hit complete true, result complete', function () {
  const s = setup();
  const t = typable('a');
  const r = s.T.key(s.ty, 'a', [t], 1);
  const hits = eventsNamed(s, 'type:hit');
  return r.type === 'complete' && hits.length === 1 && hits[0].payload.complete === true &&
    s.ty.target === null && s.ty.stats.wordsCleared === 1 && s.ty.stats.lettersInWords === 0;
});

// =================================================================================================
// Wrong keys, auto-release, backspace
// =================================================================================================

check('a wrong key keeps progress: typed unchanged, errors++, stats.wrong++, keyStreak 0, type:miss with the expected letter', function () {
  const s = setup();
  const t = typable('frog', { x: 320, y: 184 });
  s.T.key(s.ty, 'f', [t], 1);
  s.T.key(s.ty, 'r', [t], 2);
  const r = s.T.key(s.ty, 'x', [t], 3);
  const miss = eventsNamed(s, 'type:miss');
  return r.type === 'miss' && r.target === t && r.expected === 'o' && r.index === -1 &&
    t.typed === 2 && t.errors === 1 && s.ty.stats.wrong === 1 && s.ty.stats.correct === 2 &&
    s.ty.stats.keyStreak === 0 && s.ty.stats.bestKeyStreak === 2 && s.ty.stats.perKey.o.misses === 1 &&
    near(s.ty.stats.accuracy, 2 / 3, 1e-12) && s.ty.target === t &&
    miss.length === 1 && miss[0].payload.target === t && miss[0].payload.id === t.id &&
    miss[0].payload.ch === 'x' && miss[0].payload.expected === 'o' && miss[0].payload.repeat === 1 &&
    miss[0].payload.x === 320 && miss[0].payload.y === 184;
});

check('repeat counts wrong keys in a row on the same letter and resets on a correct key', function () {
  const s = setup({ autoReleaseMisses: 0, streakPenaltySteps: 2 });
  const t = typable('frog');
  s.T.key(s.ty, 'f', [t], 1);
  s.T.key(s.ty, 'x', [t], 2);
  s.T.key(s.ty, 'y', [t], 3);
  s.T.key(s.ty, 'z', [t], 4);
  s.T.key(s.ty, 'r', [t], 5);
  s.T.key(s.ty, 'q', [t], 6);
  const repeats = eventsNamed(s, 'type:miss').map(function (e) { return e.payload.repeat; });
  return same(repeats, [1, 2, 3, 1]) && t.typed === 2 && t.errors === 4;
});

check('three wrong keys in a row with typed <= 2 auto-release when enabled; the third key is retried as a new lock', function () {
  const s = setup({ autoReleaseMisses: 3, streakPenaltySteps: 2 });
  const frog = typable('frog');
  const dog = typable('dog');
  const all = [frog, dog];
  s.T.key(s.ty, 'f', all, 1);
  const r1 = s.T.key(s.ty, 'd', all, 2);
  const r2 = s.T.key(s.ty, 'd', all, 3);
  const r3 = s.T.key(s.ty, 'd', all, 4);
  const release = eventsNamed(s, 'target:release');
  return r1.type === 'miss' && r2.type === 'miss' && r3.type === 'lock' && r3.released === true &&
    r3.target === dog && s.ty.target === dog && dog.typed === 1 && dog.firstKeyAt === 4 &&
    frog.typed === 0 && frog.errors === 0 && frog.firstKeyAt === null &&
    release.length === 1 && release[0].payload.reason === 'auto' && release[0].payload.target === frog &&
    release[0].payload.id === frog.id;
});

check('the auto-releasing key is not counted as a miss: stats.wrong is 2, not 3, and the miss against the expected letter is undone', function () {
  const s = setup({ autoReleaseMisses: 3, streakPenaltySteps: 2 });
  const frog = typable('frog');
  const dog = typable('dog');
  const all = [frog, dog];
  s.T.key(s.ty, 'f', all, 1);
  s.T.key(s.ty, 'd', all, 2);
  s.T.key(s.ty, 'd', all, 3);
  s.T.key(s.ty, 'd', all, 4);
  const misses = eventsNamed(s, 'type:miss');
  return s.ty.stats.wrong === 2 && s.ty.stats.correct === 2 && s.ty.stats.perKey.r.misses === 2 &&
    misses.length === 3 && misses[2].payload.repeat === 3 && near(s.ty.stats.accuracy, 0.5, 1e-12);
});

check('the auto-released key that matches no word is retried and reported as a miss with released true', function () {
  const s = setup({ autoReleaseMisses: 3, streakPenaltySteps: 2 });
  const frog = typable('frog');
  s.T.key(s.ty, 'f', [frog], 1);
  s.T.key(s.ty, 'z', [frog], 2);
  s.T.key(s.ty, 'z', [frog], 3);
  const r = s.T.key(s.ty, 'z', [frog], 4);
  // two misses while locked, one miss after the release (recorded against the nearest word's first letter)
  return r.type === 'miss' && r.released === true && r.target === null && r.expected === 'f' &&
    s.ty.target === null && frog.typed === 0 && s.ty.stats.wrong === 3 &&
    s.ty.stats.perKey.r.misses === 2 && s.ty.stats.perKey.f.misses === 1;
});

check('the auto-released key can re-lock the same word from the start', function () {
  const s = setup({ autoReleaseMisses: 3, streakPenaltySteps: 2 });
  const frog = typable('frog');
  s.T.key(s.ty, 'f', [frog], 1);
  s.T.key(s.ty, 'f', [frog], 2);
  s.T.key(s.ty, 'f', [frog], 3);
  const r = s.T.key(s.ty, 'f', [frog], 4);
  return r.type === 'lock' && r.released === true && frog.typed === 1 && frog.firstKeyAt === 4 && s.ty.target === frog;
});

check('auto-release does not happen with typed > AUTO_RELEASE_MAX_TYPED (3 letters typed)', function () {
  const s = setup({ autoReleaseMisses: 3, streakPenaltySteps: 2 });
  const t = typable('frogs');
  const dog = typable('dog');
  const all = [t, dog];
  typeText(s, 'fro', all, 1, 1);
  s.T.key(s.ty, 'd', all, 5);
  s.T.key(s.ty, 'd', all, 6);
  const r = s.T.key(s.ty, 'd', all, 7);
  return r.type === 'miss' && s.ty.target === t && t.typed === 3 && t.errors === 3 && dog.typed === 0 &&
    s.ty.stats.wrong === 3 && eventsNamed(s, 'target:release').length === 0;
});

check('auto-release does not happen when disabled (autoReleaseMisses 0): five wrong keys keep the lock', function () {
  const s = setup({ autoReleaseMisses: 0, streakPenaltySteps: 5 });
  const frog = typable('frog');
  const dog = typable('dog');
  const all = [frog, dog];
  s.T.key(s.ty, 'f', all, 1);
  let last = null;
  for (let i = 0; i < 5; i++) last = s.T.key(s.ty, 'd', all, 2 + i);
  return last.type === 'miss' && s.ty.target === frog && frog.typed === 1 && frog.errors === 5 &&
    s.ty.stats.wrong === 5 && dog.typed === 0 && eventsNamed(s, 'target:release').length === 0;
});

check('a correct key between wrong keys restarts the count towards auto-release', function () {
  const s = setup({ autoReleaseMisses: 3, streakPenaltySteps: 2 });
  const frog = typable('frog');
  const dog = typable('dog');
  const all = [frog, dog];
  s.T.key(s.ty, 'f', all, 1);
  s.T.key(s.ty, 'd', all, 2);
  s.T.key(s.ty, 'd', all, 3);
  s.T.key(s.ty, 'r', all, 4);       // correct: typed 2
  s.T.key(s.ty, 'd', all, 5);
  const r = s.T.key(s.ty, 'd', all, 6);
  return r.type === 'miss' && s.ty.target === frog && frog.typed === 2;
});

// Switching words by typing, without Backspace (DESIGN 3.3): the wrong keys before the auto-release
// are replayed as the start of the word they spell.
check('auto-release: wrong keys that spell the start of another word lock it with those letters (dfog finishes FOG)', function () {
  const s = setup({ autoReleaseMisses: 3, streakPenaltySteps: 2 });
  const dad = typable('dad', { eta: 2 });
  const fog = typable('fog', { eta: 3 });
  const all = [dad, fog];
  const rs = typeText(s, 'dfog', all, 1, 1);
  const r = rs[3];
  const hits = eventsNamed(s, 'type:hit').filter(function (e) { return e.payload.target === fog; });
  const names = s.events.map(function (e) { return e.name; }).filter(function (n) { return n !== 'streak:change'; });
  const st = s.ty.stats;
  return rs[1].type === 'miss' && rs[2].type === 'miss' &&
    r.type === 'complete' && r.target === fog && r.released === true && r.clean === true && near(r.wordTime, 2, 1e-9) &&
    s.ty.target === null && fog.typed === 3 && fog.errors === 0 && fog.firstKeyAt === 2 && dad.typed === 0 &&
    same(hits.map(function (e) { return [e.payload.ch, e.payload.index, e.payload.complete]; }), [['f', 0, false], ['o', 1, false], ['g', 2, true]]) &&
    same(names, ['target:lock', 'type:hit', 'type:miss', 'type:miss', 'type:miss', 'target:release', 'target:lock', 'type:hit', 'type:hit', 'type:hit']) &&
    eventsNamed(s, 'target:release')[0].payload.reason === 'auto' &&
    st.wrong === 0 && st.section.wrong === 0 && st.correct === 4 && st.perKey.a.misses === 0 && st.accuracy === 1 &&
    st.keyStreak === 4 && st.bestKeyStreak === 4 && st.wordsCleared === 1 && st.wordsClean === 1 &&
    st.perKey.o.intervalCount === 1 && near(st.perKey.o.intervalSum, 1, 1e-9) &&
    st.reactionCount === 2 && near(st.reactionSum, 1 + 2, 1e-9);
});

check('auto-release: a replayed run shorter than the word leaves it locked, and the key streak before the run is kept', function () {
  const s = setup({ autoReleaseMisses: 3, streakPenaltySteps: 2 });
  const cat = typable('cat', { eta: 1 });
  const dad = typable('dad', { eta: 2 });
  const frogs = typable('frogs', { eta: 3 });
  const all = [cat, dad, frogs];
  typeText(s, 'cat', all, 1, 1);
  typeText(s, 'dfro', all, 4, 1);
  const r = s.ty.target === frogs ? null : 'frogs not locked';
  const mid = s.ty.stats.keyStreak === 7 && frogs.typed === 3 && s.ty.stats.wrong === 0 && s.ty.stats.perKey.a.misses === 0;
  const done = typeText(s, 'gs', all, 8, 1);
  return r === null && mid && done[1].type === 'complete' && done[1].target === frogs && frogs.firstKeyAt === 5 &&
    s.ty.stats.keyStreak === 9 && s.ty.stats.wordsCleared === 2 && dad.typed === 0;
});

check('auto-release: a wrong key taken back by Backspace is left out of the replayed run and its miss stays counted', function () {
  const s = setup({ autoReleaseMisses: 3, streakPenaltySteps: 2 });
  const dad = typable('dad', { eta: 2 });
  const fog = typable('fog', { eta: 3 });
  const all = [dad, fog];
  s.T.key(s.ty, 'd', all, 1);
  s.T.key(s.ty, 'f', all, 2);
  s.T.key(s.ty, 'x', all, 3);
  const k = s.T.backspace(s.ty);
  const r = s.T.key(s.ty, 'o', all, 4);             // third wrong key: the run is 'fo'
  const st = s.ty.stats;
  const ok1 = k === 'kept' && r.type === 'hit' && r.released === true && r.target === fog && fog.typed === 2 &&
    st.wrong === 1 && st.perKey.a.misses === 1 && st.keyStreak === 2 && st.correct === 3;
  // Every wrong key taken back: only the last key is tried, as before.
  const s2 = setup({ autoReleaseMisses: 3, streakPenaltySteps: 2 });
  const dad2 = typable('dad', { eta: 2 });
  const fog2 = typable('fog', { eta: 3 });
  const all2 = [dad2, fog2];
  s2.T.key(s2.ty, 'd', all2, 1);
  s2.T.key(s2.ty, 'f', all2, 2);
  s2.T.backspace(s2.ty);
  s2.T.key(s2.ty, 'o', all2, 3);
  s2.T.backspace(s2.ty);
  const r2 = s2.T.key(s2.ty, 'g', all2, 4);
  return ok1 && r2.type === 'miss' && r2.released === true && s2.ty.target === null && fog2.typed === 0 &&
    s2.ty.stats.wrong === 3;
});

check('auto-release: the run is not replayed across a checkpoint (sectionReset) and the section counts stay whole', function () {
  const s = setup({ autoReleaseMisses: 3, streakPenaltySteps: 2 });
  const dad = typable('dad', { eta: 2 });
  const fog = typable('fog', { eta: 3 });
  const all = [dad, fog];
  typeText(s, 'dfo', all, 1, 1);
  s.T.sectionReset(s.ty);
  const r = s.T.key(s.ty, 'g', all, 4);
  return r.type === 'miss' && r.released === true && fog.typed === 0 && s.ty.target === null &&
    s.ty.stats.wrong === 3 && s.ty.stats.section.wrong === 1 && s.ty.stats.section.correct === 0;
});

check('auto-release off (Hard): typing another word while locked never switches to it', function () {
  const s = setup({ autoReleaseMisses: 0, streakPenaltySteps: 5 });
  const quill = typable('quill', { eta: 2 });
  const wharf = typable('wharf', { eta: 3 });
  const all = [quill, wharf];
  const rs = typeText(s, 'qwharf', all, 1, 1);
  return rs[5].type === 'miss' && s.ty.target === quill && quill.typed === 1 && wharf.typed === 0 &&
    s.ty.stats.wrong === 5 && eventsNamed(s, 'target:release').length === 0;
});

check('Backspace release resets typed and errors to 0, emits target:release with reason backspace, returns true', function () {
  const s = setup();
  const t = typable('frog');
  s.T.key(s.ty, 'f', [t], 1);
  s.T.key(s.ty, 'x', [t], 2);
  s.T.key(s.ty, 'r', [t], 3);
  const released = s.T.release(s.ty, 'backspace');
  const ev = eventsNamed(s, 'target:release');
  return released === true && t.typed === 0 && t.errors === 0 && t.firstKeyAt === null && t.lastKeyAt === null &&
    s.ty.target === null && s.T.locked(s.ty) === null && ev.length === 1 &&
    ev[0].payload.target === t && ev[0].payload.id === t.id && ev[0].payload.reason === 'backspace' &&
    s.ty.discardT === 0;
});

check('release returns false when nothing is locked and emits nothing', function () {
  const s = setup();
  const r = s.T.release(s.ty, 'backspace');
  return r === false && s.events.length === 0;
});

check('release and re-lock: after Backspace the word starts from zero with a fresh firstKeyAt and no discard', function () {
  const s = setup();
  const t = typable('frog');
  s.T.key(s.ty, 'f', [t], 1);
  s.T.key(s.ty, 'r', [t], 2);
  s.T.release(s.ty, 'backspace');
  const r = s.T.key(s.ty, 'f', [t], 10);
  const rs = typeText(s, 'rog', [t], 11, 1);
  return r.type === 'lock' && t.firstKeyAt === 10 && rs[2].type === 'complete' && near(rs[2].wordTime, 3, 1e-9) &&
    rs[2].clean === true && s.ty.stats.wordsCleared === 1 && s.ty.stats.correct === 6;
});

check('backspace straight after a wrong key keeps the lock, progress and errors, emits nothing and returns kept', function () {
  const s = setup({ autoReleaseMisses: 3, streakPenaltySteps: 2 });
  const t = typable('frog');
  typeText(s, 'fr', [t], 1, 1);
  s.T.key(s.ty, 'x', [t], 3);
  const before = s.events.length;
  const stats = statsSnapshot(s.ty);
  const r = s.T.backspace(s.ty);
  const quiet = s.events.length === before && statsSnapshot(s.ty) === stats && s.ty.target === t && t.typed === 2 && t.errors === 1;
  const rs = typeText(s, 'og', [t], 4, 1);
  return r === 'kept' && quiet && eventsNamed(s, 'target:release').length === 0 &&
    rs[1].type === 'complete' && rs[1].clean === false && t.errors === 1;
});

check('backspace: a second Backspace in a row, or one after a correct key, releases with reason backspace', function () {
  const s = setup({ autoReleaseMisses: 3, streakPenaltySteps: 2 });
  const t = typable('frog');
  typeText(s, 'fr', [t], 1, 1);
  s.T.key(s.ty, 'x', [t], 3);
  const r1 = s.T.backspace(s.ty);
  const r2 = s.T.backspace(s.ty);
  const rel = eventsNamed(s, 'target:release');
  const ok1 = r1 === 'kept' && r2 === 'released' && s.ty.target === null && t.typed === 0 && rel.length === 1 && rel[0].payload.reason === 'backspace';
  const s2 = setup({ autoReleaseMisses: 3, streakPenaltySteps: 2 });
  const u = typable('frog');
  typeText(s2, 'fr', [u], 1, 1);
  const r3 = s2.T.backspace(s2.ty);
  const r4 = s2.T.backspace(s2.ty);
  return ok1 && r3 === 'released' && s2.ty.target === null && u.typed === 0 && r4 === 'none' &&
    eventsNamed(s2, 'target:release').length === 1;
});

check('backspace between wrong keys does not reset the count towards auto-release', function () {
  const s = setup({ autoReleaseMisses: 3, streakPenaltySteps: 2 });
  const frog = typable('frog');
  const dog = typable('dog');
  const all = [frog, dog];
  s.T.key(s.ty, 'f', all, 1);
  s.T.key(s.ty, 'd', all, 2);
  const k1 = s.T.backspace(s.ty);
  s.T.key(s.ty, 'd', all, 3);
  const k2 = s.T.backspace(s.ty);
  const r = s.T.key(s.ty, 'd', all, 4);
  return k1 === 'kept' && k2 === 'kept' && r.type === 'lock' && r.released === true && s.ty.target === dog;
});

check('backspace with nothing locked returns none and emits nothing, also after a wrong key with no lock', function () {
  const s = setup();
  const t = typable('frog');
  const r0 = s.T.backspace(s.ty);
  s.T.key(s.ty, 'z', [t], 1);
  const before = s.events.length;
  const r1 = s.T.backspace(s.ty);
  return r0 === 'none' && r1 === 'none' && s.events.length === before && s.ty.target === null;
});

check('release with reason screen releases without a discard window', function () {
  const s = setup();
  const t = typable('frog');
  s.T.key(s.ty, 'f', [t], 1);
  s.T.release(s.ty, 'screen');
  const r = s.T.key(s.ty, 'f', [t], 1.1);
  return s.ty.discardT === 0 && r.type === 'lock' && eventsNamed(s, 'target:release')[0].payload.reason === 'screen';
});

// =================================================================================================
// sync: lost targets and the discard window
// =================================================================================================

check('sync releases a locked target that is no longer in typables with reason gone; not lost, so no discard', function () {
  const s = setup();
  const t = typable('frog');
  s.T.key(s.ty, 'f', [t], 1);
  s.T.sync(s.ty, [], 1.02, 1 / 60);
  const ev = eventsNamed(s, 'target:release');
  const cleared = s.ty.target === null && t.typed === 0 && s.ty.discardT === 0;
  const r = s.T.key(s.ty, 'f', [typable('fox')], 1.03);
  return ev.length === 1 && ev[0].payload.reason === 'gone' && ev[0].payload.target === t &&
    cleared && r.type === 'lock';
});

check('sync releases a locked target whose typable flag became false', function () {
  const s = setup();
  const t = typable('frog');
  s.T.key(s.ty, 'f', [t], 1);
  t.typable = false;
  s.T.sync(s.ty, [t], 1.02, 1 / 60);
  return s.ty.target === null && eventsNamed(s, 'target:release')[0].payload.reason === 'gone' && s.ty.discardT === 0;
});

check('sync keeps a locked target that is present and typable, and counts nothing down', function () {
  const s = setup();
  const t = typable('frog');
  s.T.key(s.ty, 'f', [t], 1);
  for (let i = 0; i < 100; i++) s.T.sync(s.ty, [t], 1 + i / 60, 1 / 60);
  return s.ty.target === t && t.typed === 1 && eventsNamed(s, 'target:release').length === 0 && s.ty.discardT === 0;
});

check('a lost locked target starts the discard window: discardT is DISCARD_TIME after sync', function () {
  const s = setup();
  const t = typable('frog');
  s.T.key(s.ty, 'f', [t], 1);
  t.lost = true;
  s.T.sync(s.ty, [], 1.02, 1 / 60);
  return s.ty.target === null && near(s.ty.discardT, s.TG.C.DISCARD_TIME, 1e-12) &&
    eventsNamed(s, 'target:release')[0].payload.reason === 'gone';
});

check('the discard window drops keys for 0.25 s after a locked target is lost, and only then', function () {
  const s = setup();
  const dt = 1 / 60;
  const t = typable('frog');
  const other = typable('dog');
  s.T.key(s.ty, 'f', [t, other], 1);
  t.lost = true;
  let now = 1;
  const results = [];
  const snapshots = [];
  // 15 steps of 1/60 s = 0.25 s: the key is discarded on each of them.
  for (let i = 0; i < 15; i++) {
    now += dt;
    s.T.sync(s.ty, [other], now, dt);
    const before = statsSnapshot(s.ty);
    results.push(s.T.key(s.ty, 'd', [other], now).type);
    snapshots.push(statsSnapshot(s.ty) === before);
  }
  const allDiscarded = results.every(function (r) { return r === 'discarded'; });
  const noStatChange = snapshots.every(Boolean);
  // The 16th step: the window has ended.
  now += dt;
  s.T.sync(s.ty, [other], now, dt);
  const after = s.T.key(s.ty, 'd', [other], now);
  return allDiscarded && noStatChange && s.ty.discardT === 0 && after.type === 'lock' && after.target === other &&
    other.typed === 1 && s.ty.stats.correct === 2 && s.ty.stats.wrong === 0 && eventsNamed(s, 'type:miss').length === 0;
});

check('a discarded key emits no event and is neither a hit nor a miss in the statistics', function () {
  const s = setup();
  const t = typable('frog');
  s.T.key(s.ty, 'f', [t], 1);
  t.lost = true;
  s.T.sync(s.ty, [], 1.02, 1 / 60);
  const count = s.events.length;
  const r = s.T.key(s.ty, 'x', [typable('xylophone')], 1.03);
  return r.type === 'discarded' && r.index === -1 && s.events.length === count &&
    s.ty.stats.correct === 1 && s.ty.stats.wrong === 0 && s.ty.stats.accuracy === 1;
});

check('a key when the target has just gone in the same step (lost after sync) is discarded, not applied to another word', function () {
  const s = setup();
  const t = typable('frog');
  const other = typable('fox');
  s.T.key(s.ty, 'f', [t, other], 1);
  s.T.sync(s.ty, [t, other], 1.02, 1 / 60);
  t.lost = true;                                    // removed by the game during this step
  const r = s.T.key(s.ty, 'r', [other], 1.03);
  return r.type === 'discarded' && s.ty.target === null && other.typed === 0 && near(s.ty.discardT, 0.25, 1e-12) &&
    eventsNamed(s, 'target:release')[0].payload.reason === 'gone';
});

check('the discard window is not started by Backspace, completion or a target that vanishes without lost', function () {
  const s = setup();
  const a = typable('frog');
  s.T.key(s.ty, 'f', [a], 1);
  s.T.release(s.ty, 'backspace');
  const d1 = s.ty.discardT;
  const b = typable('dog');
  typeText(s, 'dog', [b], 2, 0.1);
  const d2 = s.ty.discardT;
  const c = typable('cat');
  s.T.key(s.ty, 'c', [c], 3);
  s.T.sync(s.ty, [], 3.1, 1 / 60);
  const d3 = s.ty.discardT;
  return d1 === 0 && d2 === 0 && d3 === 0;
});

check('sync with dt 0 (lifeLost) does not shorten the discard window; keys are still accepted after it ends', function () {
  const s = setup();
  const t = typable('frog');
  s.T.key(s.ty, 'f', [t], 1);
  t.lost = true;
  s.T.sync(s.ty, [], 1.02, 1 / 60);
  for (let i = 0; i < 20; i++) s.T.sync(s.ty, [], 1.02, 0);
  const still = s.ty.discardT;
  for (let i = 0; i < 15; i++) s.T.sync(s.ty, [], 1.1 + i / 60, 1 / 60);
  return near(still, 0.25, 1e-12) && s.ty.discardT === 0;
});

check('ty.target is null after completion, release and loss; locked() agrees each time', function () {
  const s = setup();
  const a = typable('as');
  s.T.key(s.ty, 'a', [a], 1);
  const l1 = s.ty.target === a && s.T.locked(s.ty) === a;
  s.T.key(s.ty, 's', [a], 2);
  const l2 = s.ty.target === null && s.T.locked(s.ty) === null;
  const b = typable('ad');
  s.T.key(s.ty, 'a', [b], 3);
  s.T.release(s.ty, 'backspace');
  const l3 = s.ty.target === null && s.T.locked(s.ty) === null;
  const c = typable('ah');
  s.T.key(s.ty, 'a', [c], 4);
  c.lost = true;
  s.T.sync(s.ty, [], 4.1, 1 / 60);
  const l4 = s.ty.target === null && s.T.locked(s.ty) === null;
  return l1 && l2 && l3 && l4;
});

// =================================================================================================
// Statistics: streaks, multiplier, live and peak WPM, per-key data, reaction
// =================================================================================================

function completeWords(s, words, clean, from) {
  // Types each word; with clean false one wrong key is pressed after the first letter.
  let now = from || 1;
  for (const w of words) {
    const t = typable(w);
    s.T.key(s.ty, w.charAt(0), [t], now);
    now += 0.2;
    if (!clean) {
      s.T.key(s.ty, w.charAt(0) === 'z' ? 'q' : 'z', [t], now);
      now += 0.2;
    }
    for (let i = 1; i < w.length; i++) {
      s.T.key(s.ty, w.charAt(i), [t], now);
      now += 0.2;
    }
    now += 0.5;
  }
  return now;
}

check('multiplier rises with the clean run: x1 at 0-2, x2 at 3, x3 at 6, x4 at 10, x5 at 15; streak:change on each step', function () {
  const s = setup({ autoReleaseMisses: 0, streakPenaltySteps: 2 });
  const words = [];
  for (let i = 0; i < 15; i++) words.push('ab');
  const mults = [];
  let now = 1;
  for (const w of words) {
    now = completeWords(s, [w], true, now);
    mults.push(s.ty.stats.mult);
  }
  const changes = eventsNamed(s, 'streak:change').map(function (e) { return [e.payload.previousMult, e.payload.mult, e.payload.cleanRun]; });
  return same(mults, [1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5]) &&
    same(changes, [[1, 2, 3], [2, 3, 6], [3, 4, 10], [4, 5, 15]]) && s.ty.stats.cleanRun === 15 && s.ty.stats.bestCleanRun === 15;
});

check('a word with errors lowers the multiplier by 1 step with streakPenaltySteps 1 (Easy); clean run becomes the lowest value of that step', function () {
  const s = setup({ autoReleaseMisses: 0, streakPenaltySteps: 1 });
  let now = completeWords(s, ['ab', 'ab', 'ab', 'ab', 'ab', 'ab', 'ab'], true, 1);   // clean run 7, x3
  const before = [s.ty.stats.cleanRun, s.ty.stats.mult];
  completeWords(s, ['ab'], false, now);
  const change = eventsNamed(s, 'streak:change').pop().payload;
  return same(before, [7, 3]) && s.ty.stats.cleanRun === 3 && s.ty.stats.mult === 2 &&
    change.previousMult === 3 && change.mult === 2 && change.cleanRun === 3 && s.ty.stats.bestCleanRun === 7;
});

check('a word with errors lowers the multiplier by 2 steps with streakPenaltySteps 2 (Medium)', function () {
  const s = setup({ autoReleaseMisses: 0, streakPenaltySteps: 2 });
  let now = completeWords(s, ['ab', 'ab', 'ab', 'ab', 'ab', 'ab', 'ab', 'ab', 'ab', 'ab', 'ab', 'ab'], true, 1);   // 12, x4
  completeWords(s, ['ab'], false, now);
  const a = [s.ty.stats.cleanRun, s.ty.stats.mult];
  now = completeWords(s, ['ab'], false, now + 5);
  const b = [s.ty.stats.cleanRun, s.ty.stats.mult];
  return same(a, [3, 2]) && same(b, [0, 1]);
});

check('a word with errors returns the multiplier to x1 with streakPenaltySteps 5 (Hard)', function () {
  const s = setup({ autoReleaseMisses: 0, streakPenaltySteps: 5 });
  let now = 1;
  for (let i = 0; i < 16; i++) now = completeWords(s, ['ab'], true, now);
  const before = s.ty.stats.mult;
  completeWords(s, ['ab'], false, now);
  const change = eventsNamed(s, 'streak:change').pop().payload;
  return before === 5 && s.ty.stats.cleanRun === 0 && s.ty.stats.mult === 1 && change.previousMult === 5 && change.mult === 1;
});

check('a word with errors at x1 keeps x1 and sets the clean run to 0 without a streak:change event', function () {
  const s = setup({ autoReleaseMisses: 0, streakPenaltySteps: 1 });
  let now = completeWords(s, ['ab', 'ab'], true, 1);   // clean run 2, x1
  const count = eventsNamed(s, 'streak:change').length;
  completeWords(s, ['ab'], false, now);
  return s.ty.stats.cleanRun === 0 && s.ty.stats.mult === 1 && eventsNamed(s, 'streak:change').length === count;
});

check('onDamage sets cleanRun 0 and mult 1 and emits streak:change with the previous multiplier', function () {
  const s = setup({ autoReleaseMisses: 0, streakPenaltySteps: 2 });
  completeWords(s, ['ab', 'ab', 'ab', 'ab', 'ab', 'ab'], true, 1);   // 6, x3
  const count = eventsNamed(s, 'streak:change').length;
  s.T.onDamage(s.ty);
  const ev = eventsNamed(s, 'streak:change');
  return s.ty.stats.cleanRun === 0 && s.ty.stats.mult === 1 && ev.length === count + 1 &&
    same(ev[ev.length - 1].payload, { cleanRun: 0, mult: 1, previousMult: 3 }) && s.ty.stats.bestCleanRun === 6 &&
    s.ty.stats.keyStreak === 12;
});

check('onMissed increments wordsMissed and changes nothing else', function () {
  const s = setup();
  const before = statsSnapshot(s.ty);
  s.T.onMissed(s.ty, typable('frog'));
  s.T.onMissed(s.ty, typable('dog'));
  const after = JSON.parse(statsSnapshot(s.ty));
  const expected = JSON.parse(before);
  expected.wordsMissed = 2;
  return same(after, expected) && s.events.length === 0;
});

check('the key streak counts consecutive correct keys across words, resets on a wrong key, and keeps the best', function () {
  const s = setup({ autoReleaseMisses: 0, streakPenaltySteps: 2 });
  let now = completeWords(s, ['frog', 'dog'], true, 1);   // 7 correct
  const a = [s.ty.stats.keyStreak, s.ty.stats.bestKeyStreak];
  const t = typable('cat');
  s.T.key(s.ty, 'c', [t], now);
  s.T.key(s.ty, 'x', [t], now + 0.1);
  const b = [s.ty.stats.keyStreak, s.ty.stats.bestKeyStreak];
  s.T.key(s.ty, 'a', [t], now + 0.2);
  s.T.key(s.ty, 't', [t], now + 0.3);
  const c = [s.ty.stats.keyStreak, s.ty.stats.bestKeyStreak];
  return same(a, [7, 7]) && same(b, [0, 8]) && same(c, [2, 8]);
});

check('streak:milestone is emitted at key streaks of 25, 50 and 100 and at no other value', function () {
  const s = setup({ autoReleaseMisses: 0, streakPenaltySteps: 2 });
  let now = 1;
  for (let i = 0; i < 30; i++) now = completeWords(s, ['abcd'], true, now);   // 120 correct keys
  const values = eventsNamed(s, 'streak:milestone').map(function (e) { return e.payload.value; });
  const kinds = eventsNamed(s, 'streak:milestone').every(function (e) { return e.payload.kind === 'keys'; });
  return same(values, [25, 50, 100]) && kinds && s.ty.stats.keyStreak === 120;
});

check('liveWpm is null until LIVE_WPM_MIN words, then refreshed by sync every WPM_REFRESH seconds over the last 8 words', function () {
  const s = setup();
  const dt = 1 / 60;
  let now = 1;
  function word(w, interval) {
    const t = typable(w);
    for (let i = 0; i < w.length; i++) {
      s.T.key(s.ty, w.charAt(i), [t], now);
      now += interval;
    }
    now += 0.3;
  }
  function settle() { for (let i = 0; i < 40; i++) { s.T.sync(s.ty, [], now, dt); now += dt; } }
  word('frog', 0.2); word('dog', 0.2); settle();
  const l1 = s.ty.stats.liveWpm;
  word('cat', 0.2);
  const l2 = s.ty.stats.liveWpm;                // not yet refreshed
  settle();
  const l3 = s.ty.stats.liveWpm;                // 60 WPM
  // Eight slow words push the fast ones out of the window.
  for (let i = 0; i < 8; i++) word('abcd', 0.4);
  settle();
  const l4 = s.ty.stats.liveWpm;
  return l1 === null && l2 === null && near(l3, 60, 1e-6) && near(l4, 30, 1e-6) && s.ty.stats.recentWords.length === 8;
});

check('peakWpm is the best WPM over any 5 consecutive completed words', function () {
  const s = setup();
  let now = 1;
  function word(w, interval) {
    const t = typable(w);
    for (let i = 0; i < w.length; i++) {
      s.T.key(s.ty, w.charAt(i), [t], now);
      now += interval;
    }
    now += 0.3;
  }
  for (let i = 0; i < 4; i++) word('frog', 0.1);
  const p0 = s.ty.stats.peakWpm;               // fewer than 5 words: 0
  word('frog', 0.1);
  const p1 = s.ty.stats.peakWpm;               // five words at 120 WPM
  for (let i = 0; i < 10; i++) word('frog', 0.4);
  const p2 = s.ty.stats.peakWpm;               // slower words do not lower the peak
  return p0 === 0 && near(p1, 120, 1e-6) && near(p2, 120, 1e-6) && near(s.ty.stats.wpm, 12 / ((5 * 0.1 + 10 * 0.4) / 15), 1e-6);
});

check('accuracy is correct / (correct + wrong); ignored and discarded keys are in neither count', function () {
  const s = setup({ autoReleaseMisses: 0, streakPenaltySteps: 2 });
  s.T.key(s.ty, 'q', [], 0.5);                       // ignored
  const t = typable('frog');
  const all = [t];
  s.T.key(s.ty, 'x', all, 1);                        // miss, no lock
  s.T.key(s.ty, 'f', all, 2);
  s.T.key(s.ty, 'z', all, 3);                        // miss while locked
  s.T.key(s.ty, 'r', all, 4);
  s.T.key(s.ty, 'o', all, 5);
  s.T.key(s.ty, 'g', all, 6);
  t.lost = false;
  const u = typable('dog');
  s.T.key(s.ty, 'd', [u], 7);
  u.lost = true;
  s.T.sync(s.ty, [], 7.1, 1 / 60);
  s.T.key(s.ty, 'o', [], 7.2);                       // discarded
  const st = s.ty.stats;
  return st.correct === 5 && st.wrong === 2 && near(st.accuracy, 5 / 7, 1e-12);
});

check('summary returns practise keys with at least 2 misses each, highest miss rate first, at most 3', function () {
  const s = setup({ autoReleaseMisses: 0, streakPenaltySteps: 2 });
  // Words starting with letters we then miss: misses are recorded against the expected letter.
  const t = typable('abcde');
  s.T.key(s.ty, 'a', [t], 1);
  s.T.key(s.ty, 'x', [t], 2); s.T.key(s.ty, 'x', [t], 3); s.T.key(s.ty, 'x', [t], 4);   // b: 3 misses, then 1 hit -> 75%
  s.T.key(s.ty, 'b', [t], 5);
  s.T.key(s.ty, 'x', [t], 6); s.T.key(s.ty, 'x', [t], 7);                                // c: 2 misses, 1 hit -> 67%
  s.T.key(s.ty, 'c', [t], 8);
  s.T.key(s.ty, 'x', [t], 9);                                                           // d: 1 miss (below the minimum)
  s.T.key(s.ty, 'd', [t], 10);
  s.T.key(s.ty, 'x', [t], 11); s.T.key(s.ty, 'x', [t], 12); s.T.key(s.ty, 'x', [t], 13); s.T.key(s.ty, 'x', [t], 14);   // e: 4 misses, 1 hit -> 80%
  s.T.key(s.ty, 'e', [t], 15);
  const sum = s.T.summary(s.ty);
  const weak2 = s.T.weakLetters(s.ty, 2);
  return same(sum.practiseKeys, ['e', 'b', 'c']) && same(weak2, ['e', 'b']) && same(s.T.weakLetters(s.ty, 9), ['e', 'b', 'c']) &&
    sum.wrong === 10 && sum.correct === 5;
});

check('summary is pure and has every field of CONTRACT 5.11', function () {
  const s = setup();
  completeWords(s, ['frog', 'dog'], true, 1);
  const before = statsSnapshot(s.ty);
  const sum = s.T.summary(s.ty);
  const keys = ['wpm', 'peakWpm', 'accuracy', 'correct', 'wrong', 'wordsCleared', 'wordsClean', 'wordsMissed',
    'bestCleanRun', 'bestKeyStreak', 'avgReaction', 'practiseKeys', 'slowKeys'];
  return same(Object.keys(sum), keys) && statsSnapshot(s.ty) === before && sum.wordsCleared === 2 &&
    sum.correct === 7 && Array.isArray(sum.practiseKeys) && Array.isArray(sum.slowKeys) && sum.practiseKeys.length === 0;
});

check('(Tier 2) summary returns slow keys with at least 4 samples each, highest mean interval first; first letters and intervals over 2 s are left out', function () {
  const s = setup({ autoReleaseMisses: 0, streakPenaltySteps: 2 });
  let now = 1;
  // 'ab': b follows a after 0.5 s (4 times). 'ac': c after 0.3 s (4 times). 'ad': d after 0.4 s but only 3 times.
  // 'ae': e after 3 s (over the limit, 4 times).
  function pair(w, gap) {
    const t = typable(w);
    s.T.key(s.ty, w.charAt(0), [t], now);
    s.T.key(s.ty, w.charAt(1), [t], now + gap);
    now += gap + 1;
  }
  for (let i = 0; i < 4; i++) pair('ab', 0.5);
  for (let i = 0; i < 4; i++) pair('ac', 0.3);
  for (let i = 0; i < 3; i++) pair('ad', 0.4);
  for (let i = 0; i < 4; i++) pair('ae', 3);
  const st = s.ty.stats;
  const sum = s.T.summary(s.ty);
  return same(sum.slowKeys, ['b', 'c']) && st.perKey.a.intervalCount === 0 && st.perKey.a.hits === 15 &&
    st.perKey.b.intervalCount === 4 && near(st.perKey.b.intervalSum, 2, 1e-9) && st.perKey.e.intervalCount === 0 &&
    st.perKey.d.intervalCount === 3;
});

check('(Tier 2) average reaction time: from the word being shown, or the previous completion if later, to the first correct key; once per word', function () {
  const s = setup({ autoReleaseMisses: 0, streakPenaltySteps: 2 });
  const a = typable('ab', { shownAt: 10 });
  s.T.key(s.ty, 'a', [a], 10.8);                     // reaction 0.8
  s.T.key(s.ty, 'b', [a], 11);                       // done at 11
  const b = typable('cd', { shownAt: 5 });           // shown earlier than the previous completion
  s.T.key(s.ty, 'c', [b], 11.5);                     // reaction 0.5 (from 11)
  s.T.release(s.ty, 'backspace');
  s.T.key(s.ty, 'c', [b], 13);                       // re-lock: not counted again
  s.T.key(s.ty, 'd', [b], 13.2);
  const st = s.ty.stats;
  const sum = s.T.summary(s.ty);
  return st.reactionCount === 2 && near(st.reactionSum, 1.3, 1e-9) && near(sum.avgReaction, 0.65, 1e-9);
});

check('sectionSummary reports wpm, accuracy, correct, wrong and words since the last sectionReset', function () {
  const s = setup({ autoReleaseMisses: 0, streakPenaltySteps: 2 });
  let now = completeWords(s, ['frog', 'dog'], true, 1);
  const t = typable('cat');
  s.T.key(s.ty, 'c', [t], now);
  s.T.key(s.ty, 'x', [t], now + 0.2);
  s.T.key(s.ty, 'a', [t], now + 0.4);
  s.T.key(s.ty, 't', [t], now + 0.6);
  const a = s.T.sectionSummary(s.ty);
  s.T.sectionReset(s.ty);
  const b = s.T.sectionSummary(s.ty);
  completeWords(s, ['bee'], true, now + 5);
  const c = s.T.sectionSummary(s.ty);
  return a.words === 3 && a.correct === 10 && a.wrong === 1 && near(a.accuracy, 10 / 11, 1e-12) &&
    near(a.wpm, 12 * 7 / (0.6 + 0.4 + 0.6), 1e-9) &&
    same(b, { wpm: 0, accuracy: 1, correct: 0, wrong: 0, words: 0 }) &&
    c.words === 1 && c.correct === 3 && near(c.wpm, 60, 1e-9) &&
    s.ty.stats.wordsCleared === 4 && s.ty.stats.correct === 13;
});

// =================================================================================================
// Events
// =================================================================================================

check('every event emitted matches the payload fields of CONTRACT 8.1', function () {
  const s = setup({ autoReleaseMisses: 3, streakPenaltySteps: 2 });
  const FIELDS = s.TG.Events.FIELDS;
  // Exercise every path: lock, hit, miss (locked and unlocked), auto-release, backspace, gone, complete,
  // streak change up and down, damage, milestone.
  let now = 1;
  const frog = typable('frog'), dog = typable('dog');
  s.T.key(s.ty, 'x', [frog, dog], now++);
  s.T.key(s.ty, 'f', [frog, dog], now++);
  s.T.key(s.ty, 'd', [frog, dog], now++);
  s.T.key(s.ty, 'd', [frog, dog], now++);
  s.T.key(s.ty, 'd', [frog, dog], now++);            // auto-release, then lock dog
  s.T.release(s.ty, 'backspace');
  s.T.key(s.ty, 'f', [frog, dog], now++);
  frog.lost = true;
  s.T.sync(s.ty, [dog], now++, 1 / 60);
  s.T.sync(s.ty, [dog], now++, 0.5);                // the discard window runs out
  now = completeWords(s, ['ab', 'ab', 'ab'], true, now + 1);
  now = completeWords(s, ['ab'], false, now);
  s.T.onDamage(s.ty);
  for (let i = 0; i < 7; i++) now = completeWords(s, ['abcd'], true, now);
  const seen = {};
  for (const e of s.events) {
    seen[e.name] = true;
    if (!FIELDS[e.name]) return 'unknown event ' + e.name;
    const keys = Object.keys(e.payload).sort();
    const want = FIELDS[e.name].slice().sort();
    if (!same(keys, want)) return e.name + ' has fields ' + keys.join(',') + ', expected ' + want.join(',');
  }
  const all = ['type:hit', 'type:miss', 'target:lock', 'target:release', 'streak:change', 'streak:milestone'];
  const missing = all.filter(function (n) { return !seen[n]; });
  return missing.length === 0 || 'not exercised: ' + missing.join(',') + ' (' + s.ty.stats.keyStreak + ')';
});

check('the engine emits only the six typing events of 8.1 and warns about nothing', function () {
  const s = setup({ autoReleaseMisses: 3, streakPenaltySteps: 1 });
  let now = completeWords(s, ['frog', 'dog', 'cat', 'bee'], true, 1);
  completeWords(s, ['owl'], false, now);
  const names = {};
  for (const e of s.events) names[e.name] = true;
  const allowed = ['type:hit', 'type:miss', 'target:lock', 'target:release', 'streak:change', 'streak:milestone'];
  return Object.keys(names).every(function (n) { return allowed.indexOf(n) !== -1; }) &&
    s.env.warnings.length === 0 && s.env.errors.length === 0;
});

check('type:miss payloads carry target and id null when nothing was locked, and the target otherwise', function () {
  const s = setup();
  const t = typable('frog', { id: 42 });
  s.T.key(s.ty, 'z', [t], 1);
  s.T.key(s.ty, 'f', [t], 2);
  s.T.key(s.ty, 'z', [t], 3);
  const m = eventsNamed(s, 'type:miss');
  return m.length === 2 && m[0].payload.target === null && m[0].payload.id === null && m[0].payload.expected === 'f' &&
    m[1].payload.target === t && m[1].payload.id === 42 && m[1].payload.expected === 'r';
});

check('a listener that throws does not break key handling (the result is still returned)', function () {
  const s = setup();
  s.TG.Events.on('type:hit', function () { throw new Error('presentation bug'); });
  const t = typable('as');
  const r1 = s.T.key(s.ty, 'a', [t], 1);
  const r2 = s.T.key(s.ty, 's', [t], 2);
  return r1.type === 'lock' && r2.type === 'complete' && s.env.errors.length === 2;
});

// =================================================================================================
// Robustness and the engine only writes its own fields
// =================================================================================================

check('the engine writes only typed, errors, firstKeyAt and lastKeyAt on a typable', function () {
  const s = setup({ autoReleaseMisses: 3, streakPenaltySteps: 2 });
  const t = typable('frog', { id: 9, kind: 'dawdle', eta: 2.5, x: 333, y: 168, shownAt: 0.5 });
  const before = JSON.parse(JSON.stringify(t));
  s.T.key(s.ty, 'f', [t], 1);
  s.T.key(s.ty, 'x', [t], 2);
  s.T.key(s.ty, 'r', [t], 3);
  s.T.release(s.ty, 'backspace');
  typeText(s, 'frog', [t], 4, 0.5);
  const after = JSON.parse(JSON.stringify(t));
  const own = ['typed', 'errors', 'firstKeyAt', 'lastKeyAt'];
  for (const k in before) {
    if (own.indexOf(k) !== -1) continue;
    if (!same(before[k], after[k])) return k + ' changed';
  }
  return Object.keys(after).length === Object.keys(before).length && after.typed === 4 && after.errors === 0 &&
    after.firstKeyAt === 4 && after.lastKeyAt === 5.5;
});

check('key with an uppercase letter or a non-letter: uppercase is lowercased, anything else is ignored', function () {
  const s = setup();
  const t = typable('frog');
  const r1 = s.T.key(s.ty, 'F', [t], 1);
  const r2 = s.T.key(s.ty, ' ', [t], 2);
  const r3 = s.T.key(s.ty, 'ro', [t], 3);
  const r4 = s.T.key(s.ty, undefined, [t], 4);
  return r1.type === 'lock' && r2.type === 'ignored' && r3.type === 'ignored' && r4.type === 'ignored' &&
    t.typed === 1 && s.ty.stats.correct === 1 && s.ty.stats.wrong === 0;
});

check('sync and key cope with undefined typables', function () {
  const s = setup();
  s.T.sync(s.ty, undefined, 1, 1 / 60);
  const r = s.T.key(s.ty, 'a', undefined, 1);
  return r.type === 'ignored' && s.ty.target === null;
});

check('create with no opts gives numeric defaults; opts are not shared between engines', function () {
  const s = setup();
  const a = s.T.create();
  const b = s.T.create({ autoReleaseMisses: 0, streakPenaltySteps: 5 });
  return typeof a.opts.autoReleaseMisses === 'number' && typeof a.opts.streakPenaltySteps === 'number' &&
    b.opts.autoReleaseMisses === 0 && b.opts.streakPenaltySteps === 5 && a.stats !== b.stats && a.opts !== b.opts;
});

check('constants from the test loader are used: a shorter DISCARD_TIME and a different AUTO_RELEASE_MAX_TYPED', function () {
  const env = stubs.load({ files: FILES, constants: { DISCARD_TIME: 0.1, AUTO_RELEASE_MAX_TYPED: 0 } });
  const T = env.TG.Typing;
  const ty = T.create({ autoReleaseMisses: 3, streakPenaltySteps: 2 });
  const t = typable('frog');
  const dog = typable('dog');
  T.key(ty, 'f', [t, dog], 1);
  T.key(ty, 'd', [t, dog], 2);
  T.key(ty, 'd', [t, dog], 3);
  const r = T.key(ty, 'd', [t, dog], 4);      // typed 1 > 0: no auto-release
  t.lost = true;
  T.sync(ty, [dog], 5, 1 / 60);
  return r.type === 'miss' && ty.target === null && near(ty.discardT, 0.1, 1e-12);
});

// =================================================================================================
// A longer scripted run: statistics stay exact
// =================================================================================================

check('a scripted run of 200 words with mixed errors keeps every count exact and consistent', function () {
  const s = setup({ autoReleaseMisses: 3, streakPenaltySteps: 2 });
  const env = s.env;
  const rng = env.TG.RNG.create(7);
  const WORDS = env.TG.Words.POOLS.medium[1];
  let now = 1;
  let expCorrect = 0, expWrong = 0, expCleared = 0, expClean = 0, expLetters = 0, expTime = 0;
  let expMissed = 0;
  const active = [];
  let id = 1000;
  for (let n = 0; n < 200; n++) {
    // keep two words active with different first letters
    while (active.length < 2) {
      const w = WORDS[rng.int(0, WORDS.length - 1)];
      if (active.some(function (t) { return t.word.charAt(0) === w.charAt(0); })) continue;
      active.push(typable(w, { id: id++, eta: 2 + rng.next() * 5, shownAt: now }));
    }
    s.T.sync(s.ty, active, now, 1 / 60);
    // choose the nearest and type it, with one wrong key somewhere after the second letter in a third of the words
    const target = active.slice().sort(function (a, b) { return a.eta - b.eta; })[0];
    const w = target.word;
    const errorAt = rng.chance(1 / 3) ? rng.int(2, w.length - 1) : -1;
    const start = now;
    let dirty = false;
    for (let i = 0; i < w.length; i++) {
      if (i === errorAt) {
        const wrong = w.charAt(i) === 'z' ? 'q' : 'z';
        const r = s.T.key(s.ty, wrong, active, now);
        if (r.type !== 'miss') return 'expected a miss at word ' + n;
        expWrong++;
        dirty = true;
        now += 0.15;
      }
      const r = s.T.key(s.ty, w.charAt(i), active, now);
      const want = i === 0 ? 'lock' : (i === w.length - 1 ? 'complete' : 'hit');
      if (r.type !== want) return 'word ' + n + ' letter ' + i + ': ' + r.type + ' instead of ' + want;
      expCorrect++;
      if (i === w.length - 1) {
        expCleared++;
        if (!dirty) expClean++;
        expLetters += w.length - 1;
        expTime += now - start;
        if (r.clean !== !dirty) return 'clean flag wrong at word ' + n;
      }
      now += 0.1 + rng.next() * 0.2;
    }
    active.splice(active.indexOf(target), 1);
    // sometimes a word reaches Pip
    if (rng.chance(0.1)) {
      const gone = active.pop();
      s.T.onMissed(s.ty, gone);
      expMissed++;
    }
    now += 0.5;
  }
  const st = s.ty.stats;
  return st.correct === expCorrect && st.wrong === expWrong && st.wordsCleared === expCleared &&
    st.wordsClean === expClean && st.lettersInWords === expLetters && near(st.wordTime, expTime, 1e-6) &&
    near(st.wpm, 12 * expLetters / expTime, 1e-6) && st.wordsMissed === expMissed &&
    near(st.accuracy, expCorrect / (expCorrect + expWrong), 1e-12) && s.ty.target === null &&
    env.warnings.length === 0 && env.errors.length === 0;
});

// =================================================================================================

console.log('');
console.log('test-typing: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
