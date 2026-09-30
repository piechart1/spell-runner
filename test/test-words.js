// test/test-words.js
// Tests for js/words.js (WP-A). Run from the project root: node test/test-words.js
//
// Covers the WP-A acceptance checks of CONTRACT section 12 that concern the word pools and the
// picker (CONTRACT 4.6, DESIGN 10 and Appendix A). The picker is checked against a reference filter
// written here from DESIGN 10.4, over 5,000 picks per difficulty and section. The "doc:" check reads
// Appendix A of docs/DESIGN.md and is skipped if the document is absent.
'use strict';

const fs = require('fs');
const path = require('path');
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

const FILES = ['js/core.js', 'js/words.js'];
const DIFFS = ['easy', 'medium', 'hard'];
const POOL_KEYS = ['1', '2', '3', 'boss', 'finisher'];
const THREAT_TIERS = ['1', '2', '3'];
const KINDS = ['boulder', 'dawdle', 'hoppet', 'buzzle', 'swoop', 'truffle', 'digby', 'crate', 'rock'];

// DESIGN 10.2
const RANGES = {
  easy:   { 1: [2, 5], 2: [3, 4], 3: [3, 5],  boss: [4, 6],  finisher: [6, 7] },
  medium: { 1: [4, 5], 2: [5, 6], 3: [6, 8],  boss: [7, 9],  finisher: [10, 11] },
  hard:   { 1: [5, 7], 2: [7, 9], 3: [8, 11], boss: [9, 12], finisher: [13, 15] }
};

function load() {
  return stubs.load({ files: FILES });
}

// All words of one difficulty, flavour lists included, as a Set.
function allWords(POOLS, diff) {
  const set = new Set();
  for (const k of POOL_KEYS) for (const w of POOLS[diff][k]) set.add(w);
  const flavour = POOLS[diff].flavour || {};
  for (const name of Object.keys(flavour)) {
    for (const k of THREAT_TIERS) for (const w of (flavour[name][k] || [])) set.add(w);
  }
  return set;
}

// =================================================================================================
// Loading
// =================================================================================================

check('words.js loads with only core.js and makes no canvas, audio or storage calls', function () {
  const env = load();
  return same(env.loaded, FILES) && env.canvasCalls.count === 0 && env.audio.contexts.length === 0 &&
    env.storage.size === 0 && env.raf.length === 0 && env.timers.length === 0 &&
    env.warnings.length === 0 && env.errors.length === 0;
});

check('TG.Words exposes POOLS, SAMPLES, ADJACENT, createPicker, has and validate', function () {
  const W = load().TG.Words;
  return typeof W.POOLS === 'object' && typeof W.SAMPLES === 'object' && typeof W.ADJACENT === 'object' &&
    typeof W.createPicker === 'function' && typeof W.has === 'function' && typeof W.validate === 'function';
});

check('POOLS has the five pools and a flavour object for every difficulty; Level 1 needs no flavour', function () {
  const POOLS = load().TG.Words.POOLS;
  for (const d of DIFFS) {
    for (const k of POOL_KEYS) if (!Array.isArray(POOLS[d][k])) return d + '.' + k + ' missing';
    if (typeof POOLS[d].flavour !== 'object') return d + '.flavour missing';
    if (Object.keys(POOLS[d].flavour).length !== 0) return d + '.flavour is not empty';
  }
  return true;
});

// =================================================================================================
// The pools
// =================================================================================================

check('TG.Words.validate() returns an empty array', function () {
  const problems = load().TG.Words.validate();
  return problems.length === 0 || problems.slice(0, 3).join('; ');
});

check('every word is lowercase a to z and within the length range of its pool (DESIGN 10.2)', function () {
  const POOLS = load().TG.Words.POOLS;
  for (const d of DIFFS) for (const k of POOL_KEYS) {
    const r = RANGES[d][k];
    for (const w of POOLS[d][k]) {
      if (!/^[a-z]+$/.test(w)) return d + '.' + k + ': ' + w;
      if (w.length < r[0] || w.length > r[1]) return d + '.' + k + ': ' + w + ' (' + w.length + ')';
    }
  }
  return true;
});

check('no word appears in more than one pool across all difficulties', function () {
  const POOLS = load().TG.Words.POOLS;
  const seen = new Map();
  for (const d of DIFFS) for (const k of POOL_KEYS) for (const w of POOLS[d][k]) {
    if (seen.has(w)) return w + ' in ' + seen.get(w) + ' and ' + d + '.' + k;
    seen.set(w, d + '.' + k);
  }
  return true;
});

check('Easy tier 1 uses only the home row; tier 2 only home row plus E I R T O U with a letter outside the home row; tier 3 has a letter outside tier 2\'s set', function () {
  const POOLS = load().TG.Words.POOLS;
  const home = /^[asdfghjkl]+$/, t2 = /^[asdfghjkleirtou]+$/;
  for (const w of POOLS.easy[1]) if (!home.test(w)) return 'tier 1: ' + w;
  for (const w of POOLS.easy[2]) if (!t2.test(w) || !/[eirtou]/.test(w)) return 'tier 2: ' + w;
  for (const w of POOLS.easy[3]) if (!/[bcmnpqvwxyz]/.test(w)) return 'tier 3: ' + w;
  return true;
});

check('Medium tier 1 has no Q, X or Z; Medium tier 3 and Hard bring them in', function () {
  const POOLS = load().TG.Words.POOLS;
  for (const w of POOLS.medium[1]) if (/[qxz]/.test(w)) return w;
  const m3 = POOLS.medium[3].filter(function (w) { return /[qxzj]/.test(w); }).length;
  const m2 = POOLS.medium[2].filter(function (w) { return /[qxzj]/.test(w); }).length;
  const h1 = POOLS.hard[1].filter(function (w) { return /[qxzj]/.test(w); }).length;
  return m3 >= POOLS.medium[3].length * 0.5 && m3 > 3 * m2 && h1 >= 30;
});

check('every threat tier has at least 45 words and every pool at least 8 different first letters', function () {
  const POOLS = load().TG.Words.POOLS;
  for (const d of DIFFS) for (const k of POOL_KEYS) {
    const words = POOLS[d][k];
    if (THREAT_TIERS.indexOf(k) !== -1 && words.length < 45) return d + '.' + k + ': ' + words.length;
    const firsts = new Set(words.map(function (w) { return w.charAt(0); }));
    if (firsts.size < 8) return d + '.' + k + ': ' + firsts.size + ' first letters';
  }
  return true;
});

check('the extended threat tiers have 80 to 120 words (all but Easy tier 1, which the home row limits)', function () {
  const POOLS = load().TG.Words.POOLS;
  for (const d of DIFFS) for (const k of THREAT_TIERS) {
    if (d === 'easy' && k === '1') continue;
    const n = POOLS[d][k].length;
    if (n < 80 || n > 120) return d + '.' + k + ': ' + n;
  }
  return POOLS.easy[1].length >= 45;
});

check('common first letters have at least 3 words in every extended threat tier', function () {
  // A letter is "common" for a tier if it starts at least 5% of the tier's words in any tier of that difficulty.
  const POOLS = load().TG.Words.POOLS;
  const problems = [];
  for (const d of DIFFS) {
    const counts = {};
    for (const k of THREAT_TIERS) {
      counts[k] = {};
      for (const w of POOLS[d][k]) counts[k][w.charAt(0)] = (counts[k][w.charAt(0)] || 0) + 1;
    }
    for (const k of THREAT_TIERS) {
      if (d === 'easy' && k === '1') continue;
      const total = POOLS[d][k].length;
      for (const ch of Object.keys(counts[k])) {
        if (counts[k][ch] >= total * 0.05 && counts[k][ch] < 3) problems.push(d + '.' + k + ':' + ch);
      }
    }
  }
  return problems.length === 0 || problems.join(' ');
});

check('every difficulty has at least 12 different first letters across its threat tiers, so four active words leave letters free', function () {
  const POOLS = load().TG.Words.POOLS;
  for (const d of DIFFS) {
    const firsts = new Set();
    for (const k of THREAT_TIERS) for (const w of POOLS[d][k]) firsts.add(w.charAt(0));
    if (firsts.size < 12) return d + ': ' + firsts.size;
  }
  return true;
});

check('Hard tier 3 has at least 45 words of 10 letters or fewer (threat words are capped at MAX_WORD_LEN)', function () {
  const env = load();
  const cap = env.TG.C.MAX_WORD_LEN;
  const n = env.TG.Words.POOLS.hard[3].filter(function (w) { return w.length <= cap; }).length;
  return n >= 45 || String(n);
});

check('the difficulties give visibly different words: mean tier-1 length rises Easy < Medium < Hard and no word is shared', function () {
  const POOLS = load().TG.Words.POOLS;
  function mean(words) { return words.reduce(function (a, w) { return a + w.length; }, 0) / words.length; }
  const e = mean(POOLS.easy[1]), m = mean(POOLS.medium[1]), h = mean(POOLS.hard[1]);
  const e3 = mean(POOLS.easy[3]), m3 = mean(POOLS.medium[3]), h3 = mean(POOLS.hard[3]);
  return e < m && m < h && e3 < m3 && m3 < h3 && e < 4.5 && h > 5.5;
});

check('SAMPLES are as in CONTRACT 4.6 and each sample is in its difficulty\'s pools', function () {
  const W = load().TG.Words;
  const want = { easy: ['ask', 'frog', 'puppy'], medium: ['river', 'bridge', 'rainbow'], hard: ['zephyr', 'labyrinth', 'silhouette'] };
  if (!same(W.SAMPLES, want)) return JSON.stringify(W.SAMPLES);
  for (const d of DIFFS) for (const w of want[d]) if (!W.has(d, w)) return d + ': ' + w;
  return true;
});

check('ADJACENT covers a to z, is symmetric, and matches the QWERTY examples of CONTRACT 4.6', function () {
  const ADJ = load().TG.Words.ADJACENT;
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  for (const ch of letters) {
    if (typeof ADJ[ch] !== 'string' || ADJ[ch].length === 0) return 'missing ' + ch;
    for (const n of ADJ[ch]) {
      if (letters.indexOf(n) === -1) return ch + ' has ' + n;
      if (ADJ[n].indexOf(ch) === -1) return ch + '-' + n + ' is not symmetric';
      if (n === ch) return ch + ' is adjacent to itself';
    }
  }
  return ADJ.q === 'wa' && ADJ.w === 'qase' && ADJ.p === 'ol' && ADJ.f.indexOf('g') !== -1 && ADJ.f.indexOf('d') !== -1 &&
    ADJ.j.indexOf('k') !== -1 && ADJ.j.indexOf('h') !== -1;
});

// =================================================================================================
// doc: Appendix A
// =================================================================================================

(function () {
  const file = path.join(stubs.ROOT, 'docs', 'DESIGN.md');
  if (!fs.existsSync(file)) {
    skip('doc: every word of DESIGN Appendix A is in the matching pool (docs/DESIGN.md not found)');
    return;
  }
  const text = fs.readFileSync(file, 'utf8');
  const start = text.indexOf('## Appendix A');
  const end = text.indexOf('## Appendix B');
  if (start === -1 || end === -1) {
    skip('doc: every word of DESIGN Appendix A is in the matching pool (Appendix A not found)');
    return;
  }
  const lines = text.slice(start, end).split('\n');
  const lists = {};      // 'easy.1' -> words
  let diff = null, key = null;
  for (const raw of lines) {
    const line = raw.trim();
    let m;
    if ((m = /^### (Easy|Medium|Hard)$/.exec(line))) { diff = m[1].toLowerCase(); key = null; continue; }
    if ((m = /^\*\*(Tier (\d)|Boss|Finisher):/.exec(line))) { key = m[2] ? m[2] : m[1].toLowerCase(); continue; }
    if (!diff || !key || line === '' || line.charAt(0) === '#' || line.charAt(0) === '*') continue;
    const words = line.replace(/^Themed additions:/, '').trim().split(/\s+/).filter(Boolean);
    const id = diff + '.' + key;
    lists[id] = (lists[id] || []).concat(words);
  }

  check('doc: Appendix A has the fifteen lists', function () {
    const ids = DIFFS.map(function (d) { return POOL_KEYS.map(function (k) { return d + '.' + k; }); }).flat();
    const missing = ids.filter(function (id) { return !lists[id] || lists[id].length === 0; });
    return missing.length === 0 || 'missing ' + missing.join(',');
  });

  // Appendix A words that words.js leaves out on purpose, with the reason (WP-A hand-over notes).
  const EXCLUDED = { 'hard.2': ['blackjack'] };   // a gambling game; DESIGN 10.1 asks for words suitable for a child

  check('doc: every word of DESIGN Appendix A is in the matching pool, except the recorded exclusions, which are absent', function () {
    const W = load().TG.Words;
    const problems = [];
    for (const id of Object.keys(lists)) {
      const parts = id.split('.');
      const pool = W.POOLS[parts[0]][parts[1]];
      const excluded = EXCLUDED[id] || [];
      for (const w of lists[id]) {
        if (excluded.indexOf(w) !== -1) {
          if (W.has(parts[0], w)) problems.push(id + ':' + w + ' should be excluded');
        } else if (pool.indexOf(w) === -1) {
          problems.push(id + ':' + w);
        }
      }
    }
    return problems.length === 0 || problems.slice(0, 5).join(' ');
  });

  check('doc: the Appendix A words come first in each pool, in the order given', function () {
    const POOLS = load().TG.Words.POOLS;
    for (const id of Object.keys(lists)) {
      const parts = id.split('.');
      const pool = POOLS[parts[0]][parts[1]];
      const excluded = EXCLUDED[id] || [];
      const given = lists[id].filter(function (w) { return excluded.indexOf(w) === -1; });
      for (let i = 0; i < given.length; i++) if (pool[i] !== given[i]) return id + ' at ' + i + ': ' + pool[i] + ' vs ' + given[i];
    }
    return true;
  });
})();

// =================================================================================================
// has
// =================================================================================================

check('TG.Words.has is true for every word of every pool of a difficulty and false for the other difficulties\' words', function () {
  const W = load().TG.Words;
  for (const d of DIFFS) {
    for (const k of POOL_KEYS) for (const w of W.POOLS[d][k]) if (!W.has(d, w)) return d + ' lacks ' + w;
    for (const o of DIFFS) {
      if (o === d) continue;
      for (const k of POOL_KEYS) for (const w of W.POOLS[o][k]) if (W.has(d, w)) return d + ' has ' + w + ' of ' + o;
    }
  }
  return !W.has('easy', 'xyzzy') && !W.has('easy', '') && !W.has('nope', 'ask') && !W.has('easy', 'ASK');
});

check('TG.Words.has includes flavour lists', function () {
  const W = load().TG.Words;
  W.POOLS.easy.flavour.test = { 1: ['sass'], 2: [], 3: [] };
  const r = W.has('easy', 'sass') && !W.has('medium', 'sass');
  delete W.POOLS.easy.flavour.test;
  return r && !W.has('easy', 'sass');
});

// =================================================================================================
// The picker against a reference filter (DESIGN 10.4)
// =================================================================================================

function refFilter(words, min, max, active, recent, skipRecent) {
  const out = [];
  for (const w of words) {
    if (w.length < min || w.length > max) continue;
    if (skipRecent && recent.has(w)) continue;
    let clash = false;
    for (const a of active) {
      if (a.charAt(0) === w.charAt(0) || w.startsWith(a) || a.startsWith(w)) { clash = true; break; }
    }
    if (!clash) out.push(w);
  }
  return out;
}

// The set of words the picker may return for `req`, or null if it must return null, following steps
// 2 to 9. `tiers` is the order the picker searches; the union over tiers is used, which is looser than
// the picker's first-tier-with-candidates rule but enough to check the binding rules.
function refAllowed(lists, tiers, minLen, maxLen, active, recent) {
  for (let min = minLen; min >= 2; min--) {
    let words = [];
    for (const k of tiers) words = words.concat(lists[k]);
    const fresh = refFilter(words, min, maxLen, active, recent, true);
    if (fresh.length > 0) return { words: new Set(fresh), min: min, repeat: false };
    const any = refFilter(words, min, maxLen, active, recent, false);
    if (any.length > 0) return { words: new Set(any), min: min, repeat: true };
  }
  return null;
}

// Random active words with distinct first letters and no prefix pairs, like the game guarantees.
function randomActive(rng, words, n) {
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 200) {
    const w = words[rng.int(0, words.length - 1)];
    let clash = false;
    for (const a of out) if (a.charAt(0) === w.charAt(0) || w.startsWith(a) || a.startsWith(w)) clash = true;
    if (!clash) out.push(w);
  }
  return out;
}

for (const d of DIFFS) {
  for (let section = 0; section < 3; section++) {
    check('5,000 picks on ' + d + ' section ' + (section + 1) + ' with 1 to 4 active words follow rules 2 to 9 of DESIGN 10.4', function () {
      const env = load();
      const TG = env.TG;
      const W = TG.Words;
      const config = TG.Difficulty.get(d);
      const mix = config.tierMix[section];
      const lists = {};
      for (const k of THREAT_TIERS) lists[k] = W.POOLS[d][k];
      const pool = [].concat(lists[1], lists[2], lists[3]);
      const rng = TG.RNG.create(100 + section);
      const picker = W.createPicker(d, TG.RNG.create(7 + section));
      let repeats = 0, shortened = 0, nulls = 0;
      const history = [];
      for (let i = 0; i < 5000; i++) {
        const kind = KINDS[rng.int(0, KINDS.length - 1)];
        const range = TG.Difficulty.wordRange(config, kind, section);
        const active = randomActive(rng, pool, rng.int(1, 4));
        const recent = new Set(history.slice(-TG.C.RECENT_WORDS));
        const tiers = Object.keys(mix).concat(THREAT_TIERS.filter(function (k) { return !(k in mix); }));
        const allowed = refAllowed(lists, tiers, range[0], range[1], active, recent);
        const word = picker.pick({ tierMix: mix, minLen: range[0], maxLen: range[1], active: active });
        if (word === null) {
          nulls++;
          if (allowed !== null) return 'pick ' + i + ' returned null although ' + allowed.words.size + ' words were allowed';
          continue;
        }
        if (allowed === null) return 'pick ' + i + ' returned ' + word + ' when null was expected';
        if (typeof word !== 'string' || !/^[a-z]+$/.test(word)) return 'pick ' + i + ': ' + word;
        if (!W.has(d, word)) return 'pick ' + i + ': ' + word + ' is not a ' + d + ' word';
        if (!allowed.words.has(word)) return 'pick ' + i + ': ' + word + ' is not allowed (active ' + active.join(',') + ', range ' + range + ')';
        for (const a of active) {
          if (a.charAt(0) === word.charAt(0)) return 'pick ' + i + ': ' + word + ' shares a first letter with ' + a;
          if (word.startsWith(a) || a.startsWith(word)) return 'pick ' + i + ': ' + word + ' and ' + a + ' are a prefix pair';
        }
        if (word.length > range[1]) return 'pick ' + i + ': ' + word + ' is longer than ' + range[1];
        if (word.length < range[0]) shortened++;
        if (recent.has(word)) {
          repeats++;
          if (!allowed.repeat) return 'pick ' + i + ': ' + word + ' repeats within 20 picks although fresh words were available';
        }
        if (picker.recent[picker.recent.length - 1] !== word) return 'pick ' + i + ' was not appended to recent';
        if (picker.recent.length > TG.C.RECENT_WORDS) return 'recent is longer than RECENT_WORDS';
        history.push(word);
      }
      return true;
    });
  }
}

check('the same seed gives the same sequence of picks', function () {
  const env = load();
  const TG = env.TG;
  const config = TG.Difficulty.get('medium');
  function run(seed) {
    const picker = TG.Words.createPicker('medium', TG.RNG.create(seed));
    const rng = TG.RNG.create(99);
    const out = [];
    for (let i = 0; i < 300; i++) {
      const section = i % 3;
      const kind = KINDS[rng.int(0, KINDS.length - 1)];
      const range = TG.Difficulty.wordRange(config, kind, section);
      const active = out.slice(-2).filter(Boolean);
      out.push(picker.pick({ tierMix: config.tierMix[section], minLen: range[0], maxLen: range[1], active: active }));
    }
    return out;
  }
  const a = run(5), b = run(5), c = run(6);
  return same(a, b) && !same(a, c) && a.indexOf(null) === -1;
});

check('picks with tier set come from that pool only: boss, finisher and a numbered tier', function () {
  const env = load();
  const TG = env.TG, W = TG.Words;
  for (const d of DIFFS) {
    const picker = W.createPicker(d, TG.RNG.create(3));
    const r = RANGES[d];
    for (let i = 0; i < 100; i++) {
      const b = picker.pick({ tier: 'boss', minLen: r.boss[0], maxLen: r.boss[1], active: [] });
      if (W.POOLS[d].boss.indexOf(b) === -1) return d + ' boss: ' + b;
      const f = picker.pick({ tier: 'finisher', minLen: r.finisher[0], maxLen: r.finisher[1], active: [] });
      if (W.POOLS[d].finisher.indexOf(f) === -1) return d + ' finisher: ' + f;
      const t = picker.pick({ tier: 1, minLen: 2, maxLen: 10, active: [] });
      if (W.POOLS[d][1].indexOf(t) === -1) return d + ' tier 1: ' + t;
      const s = picker.pick({ tier: '2', minLen: 2, maxLen: 10, active: [] });
      if (W.POOLS[d][2].indexOf(s) === -1) return d + ' tier 2: ' + s;
    }
  }
  return true;
});

check('the boss weak-point and finisher lengths of every difficulty can always be met', function () {
  const env = load();
  const TG = env.TG, W = TG.Words;
  for (const d of DIFFS) {
    const c = TG.Difficulty.get(d);
    const picker = W.createPicker(d, TG.RNG.create(1));
    for (let i = 0; i < 40; i++) {
      const w = picker.pick({ tier: 'boss', minLen: c.boss.coreLen[0], maxLen: c.boss.coreLen[1], active: ['frog'] });
      if (w === null || w.length < c.boss.coreLen[0] || w.length > c.boss.coreLen[1]) return d + ' boss: ' + w;
      const f = picker.pick({ tier: 'finisher', minLen: c.boss.finisherLen[0], maxLen: c.boss.finisherLen[1], active: [] });
      if (f === null || f.length < c.boss.finisherLen[0] || f.length > c.boss.finisherLen[1]) return d + ' finisher: ' + f;
    }
  }
  return true;
});

check('rule 4 is never relaxed: when every candidate first letter is active, pick returns null', function () {
  const env = load();
  const TG = env.TG, W = TG.Words;
  const picker = W.createPicker('easy', TG.RNG.create(1));
  // Easy tier 1 words start with a d f g h j l s; block them all with active words of other tiers.
  const active = ['ant', 'dog', 'fox', 'goat', 'hen', 'jug', 'lid', 'sun'];
  const r = picker.pick({ tier: 1, minLen: 2, maxLen: 5, active: active });
  const r2 = picker.pick({ tierMix: { 1: 1 }, minLen: 2, maxLen: 5, active: active });
  // With the whole alphabet blocked, no tier can help.
  const all = 'abcdefghijklmnopqrstuvwxyz'.split('').map(function (ch) { return ch + 'zzz'; });
  const r3 = picker.pick({ tierMix: { 3: 0.6, 2: 0.3, 1: 0.1 }, minLen: 3, maxLen: 5, active: all });
  return r === null && r2 !== null && W.POOLS.easy[1].indexOf(r2) === -1 && r3 === null && picker.recent.length === 1;
});

check('rule 5: a word that is a prefix of an active word, or has one as a prefix, is never picked', function () {
  const env = load();
  const TG = env.TG, W = TG.Words;
  const picker = W.createPicker('easy', TG.RNG.create(2));
  // 'sun' and 'sunny' are both in easy tier 3; with 'su' active neither may be picked, nor any s-word.
  for (let i = 0; i < 300; i++) {
    const w = picker.pick({ tier: 3, minLen: 3, maxLen: 5, active: ['su', 'pe'] });
    if (w === null) return 'null at ' + i;
    if (w.charAt(0) === 's' || w.charAt(0) === 'p') return w;
  }
  return true;
});

check('rule 6: when the chosen tier has nothing, the other tiers of the mix and then the remaining tiers are searched', function () {
  const env = load();
  const TG = env.TG, W = TG.Words;
  const picker = W.createPicker('medium', TG.RNG.create(4));
  // Medium tier 1 has 4-5 letter words only; a request for 7 to 8 letters must fall through to tier 3.
  for (let i = 0; i < 50; i++) {
    const w = picker.pick({ tierMix: { 1: 1 }, minLen: 7, maxLen: 8, active: [] });
    if (w === null || W.POOLS.medium[3].indexOf(w) === -1 && W.POOLS.medium[2].indexOf(w) === -1) return String(w);
    if (w.length < 7 || w.length > 8) return w;
  }
  return true;
});

check('rule 7: after every fresh word is in recent, a recent word is allowed rather than nothing', function () {
  const env = load();
  const TG = env.TG, W = TG.Words;
  const picker = W.createPicker('easy', TG.RNG.create(1));
  // Easy words of length 2: as ad ah ha (tier 1). Four picks exhaust them; the fifth must repeat.
  const seen = [];
  for (let i = 0; i < 4; i++) seen.push(picker.pick({ tier: 1, minLen: 2, maxLen: 2, active: [] }));
  const fifth = picker.pick({ tier: 1, minLen: 2, maxLen: 2, active: [] });
  const unique = new Set(seen);
  return unique.size === 4 && fifth !== null && unique.has(fifth);
});

check('rule 8: the bottom of the length range is lowered, one letter at a time, down to 2', function () {
  const env = load();
  const TG = env.TG, W = TG.Words;
  const picker = W.createPicker('easy', TG.RNG.create(1));
  // Easy tier 1 has no 6+ letter words: a request for 6 to 8 letters gives 5-letter words.
  const lengths = new Set();
  for (let i = 0; i < 60; i++) {
    const w = picker.pick({ tier: 1, minLen: 6, maxLen: 8, active: [] });
    if (w === null) return 'null';
    lengths.add(w.length);
  }
  return same(Array.from(lengths), [5]);
});

check('rule 9: pick returns null only when no word satisfies the first-letter and prefix rules', function () {
  const env = load();
  const TG = env.TG, W = TG.Words;
  const picker = W.createPicker('hard', TG.RNG.create(1));
  const all = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const r = picker.pick({ tierMix: { 1: 1 }, minLen: 5, maxLen: 7, active: all });
  const r2 = picker.pick({ tierMix: { 1: 1 }, minLen: 5, maxLen: 7, active: all.filter(function (c) { return c !== 'q'; }) });
  return r === null && r2 !== null && r2.charAt(0) === 'q';
});

check('recent holds at most RECENT_WORDS picks, oldest first, and reset clears it', function () {
  const env = load();
  const TG = env.TG, W = TG.Words;
  const picker = W.createPicker('medium', TG.RNG.create(1));
  const picks = [];
  for (let i = 0; i < 30; i++) picks.push(picker.pick({ tier: 2, minLen: 5, maxLen: 6, active: [] }));
  const a = same(picker.recent, picks.slice(-20)) && picker.recent.length === 20;
  picker.reset();
  const b = picker.recent.length === 0;
  picker.pick({ tier: 2, minLen: 5, maxLen: 6, active: [] });
  return a && b && picker.recent.length === 1;
});

check('no repeat within 20 picks on a plain sequence (recent respected) and the pick is fresh', function () {
  const env = load();
  const TG = env.TG, W = TG.Words;
  const picker = W.createPicker('hard', TG.RNG.create(11));
  const out = [];
  for (let i = 0; i < 200; i++) {
    const w = picker.pick({ tierMix: { 3: 0.6, 2: 0.4 }, minLen: 7, maxLen: 10, active: [] });
    if (out.slice(-20).indexOf(w) !== -1) return 'repeat of ' + w + ' at ' + i;
    out.push(w);
  }
  return true;
});

check('a word is not picked again in a run while an unused word fits the request; once they are used up, repeats come from outside recent; reset forgets the run', function () {
  const env = load();
  const TG = env.TG, W = TG.Words;
  const req = { tierMix: { 1: 1 }, minLen: 5, maxLen: 7, active: [] };
  const pool = W.POOLS.hard[1].filter(function (w) { return w.length >= 5 && w.length <= 7; });
  const picker = W.createPicker('hard', TG.RNG.create(3));
  const seen = new Set();
  for (let i = 0; i < pool.length; i++) {
    const w = picker.pick(req);
    if (seen.has(w)) return 'pick ' + i + ' repeated ' + w + ' with ' + (pool.length - seen.size) + ' unused words left';
    seen.add(w);
  }
  const again = picker.pick(req);
  if (!seen.has(again) || picker.recent.slice(0, -1).indexOf(again) !== -1) return 'after the tier was used up the pick was ' + again;
  // Boss rocks after the level words: a rock does not repeat a level word while an unused one fits.
  const p2 = W.createPicker('medium', TG.RNG.create(4));
  const config = TG.Difficulty.get('medium');
  const level = new Set();
  for (let i = 0; i < 40; i++) level.add(p2.pick({ tierMix: config.tierMix[i % 2], minLen: 4, maxLen: 6, active: [] }));
  const range = TG.Difficulty.wordRange(config, 'rock', 3);
  for (let i = 0; i < 20; i++) {
    const rock = p2.pick({ tierMix: config.tierMix[3], minLen: range[0], maxLen: range[1], active: [] });
    if (level.has(rock)) return 'rock ' + i + ' repeated the level word ' + rock;
    level.add(rock);
  }
  picker.reset();
  const fresh = new Set();
  for (let i = 0; i < 20; i++) fresh.add(picker.pick(req));
  return fresh.size === 20;
});

check('minLen and maxLen default sensibly: a request without a range or with min above max still returns a word', function () {
  const env = load();
  const TG = env.TG, W = TG.Words;
  const picker = W.createPicker('easy', TG.RNG.create(1));
  const a = picker.pick({ tier: 1, active: [] });
  const b = picker.pick({ tier: 1, minLen: 9, maxLen: 4, active: [] });
  const c = picker.pick({ tierMix: { 1: 1 } });
  return typeof a === 'string' && typeof b === 'string' && b.length <= 4 && typeof c === 'string';
});

check('createPicker with an unknown difficulty warns once and gives a picker whose pick returns null', function () {
  const env = load();
  const TG = env.TG, W = TG.Words;
  const p = W.createPicker('extreme', TG.RNG.create(1));
  const q = W.createPicker('extreme', TG.RNG.create(1));
  return p.pick({ tier: 1, minLen: 2, maxLen: 5, active: [] }) === null && q.pick({}) === null &&
    env.warnings.length === 1 && env.errors.length === 0;
});

// =================================================================================================
// Flavours
// =================================================================================================

check('a picker created with { flavour: "meadow" } gives the same sequence as one created without options', function () {
  const env = load();
  const TG = env.TG, W = TG.Words;
  const config = TG.Difficulty.get('easy');
  function run(opts) {
    const picker = W.createPicker('easy', TG.RNG.create(21), opts);
    const out = [];
    for (let i = 0; i < 200; i++) {
      const section = i % 3;
      const range = TG.Difficulty.wordRange(config, KINDS[i % KINDS.length], section);
      out.push(picker.pick({ tierMix: config.tierMix[section], minLen: range[0], maxLen: range[1], active: out.slice(-1) }));
    }
    return out;
  }
  return same(run(undefined), run({ flavour: 'meadow' })) && same(run({}), run({ flavour: 'nothing' })) && env.warnings.length === 0;
});

check('a test flavour list added to POOLS.easy.flavour is picked from, and validate() includes it', function () {
  const env = load();
  const TG = env.TG, W = TG.Words;
  // 'jazzlands' is not a word, but it is the only 9-letter candidate; 'glasshall' would break the tier 1 letter rule.
  W.POOLS.easy.flavour.cavern = { 1: ['glassjar'], 2: ['toolset'], 3: ['jazzland'] };
  const picker = W.createPicker('easy', TG.RNG.create(1), { flavour: 'cavern' });
  const plain = W.createPicker('easy', TG.RNG.create(1));
  const a = picker.pick({ tier: 3, minLen: 8, maxLen: 8, active: [] });
  const b = plain.pick({ tier: 3, minLen: 8, maxLen: 8, active: [] });
  const c = picker.pick({ tierMix: { 2: 1 }, minLen: 7, maxLen: 7, active: [] });
  const has = W.has('easy', 'jazzland') && W.has('easy', 'toolset') && !W.has('medium', 'jazzland');
  const problems = W.validate();
  delete W.POOLS.easy.flavour.cavern;
  const clean = W.validate().length === 0;
  // The flavour words break the length and letter-set rules of their tiers, so validate reports them.
  const reported = problems.some(function (p) { return p.indexOf('flavour.cavern') !== -1 && p.indexOf('jazzland') !== -1; }) &&
    problems.some(function (p) { return p.indexOf('flavour.cavern') !== -1 && p.indexOf('glassjar') !== -1; }) &&
    problems.some(function (p) { return p.indexOf('flavour.cavern') !== -1 && p.indexOf('toolset') !== -1; });
  return a === 'jazzland' && b !== 'jazzland' && b.length === 5 && c === 'toolset' && has && reported && clean;
});

check('a valid flavour list passes validate and its words are picked alongside the tier\'s own words', function () {
  const env = load();
  const TG = env.TG, W = TG.Words;
  W.POOLS.medium.flavour.tools = { 1: ['gear', 'bolt'], 2: ['wrench', 'chisel'], 3: ['spanner', 'toolkit'] };
  const problems = W.validate();
  const picker = W.createPicker('medium', TG.RNG.create(1), { flavour: 'tools' });
  const seen = new Set();
  for (let i = 0; i < 3000; i++) seen.add(picker.pick({ tier: 2, minLen: 5, maxLen: 6, active: [] }));
  delete W.POOLS.medium.flavour.tools;
  return problems.length === 0 && seen.has('wrench') && seen.has('chisel') && seen.has('bridge');
});

check('a flavour word that duplicates a pool word is reported by validate', function () {
  const env = load();
  const W = env.TG.Words;
  W.POOLS.hard.flavour.dup = { 1: ['zephyr'], 2: [], 3: [] };
  const problems = W.validate();
  delete W.POOLS.hard.flavour.dup;
  return problems.length === 1 && problems[0].indexOf('zephyr') !== -1;
});

// =================================================================================================
// (Tier 2) weightings of step 10
// =================================================================================================

function frequency(picker, req, predicate, n) {
  let hits = 0;
  for (let i = 0; i < n; i++) {
    picker.reset();
    const w = picker.pick(req);
    if (predicate(w)) hits++;
  }
  return hits / n;
}

check('(Tier 2) on Easy and Medium a first letter not adjacent to an active word\'s first letter is favoured x3; on Hard it is not', function () {
  const env = load();
  const TG = env.TG, W = TG.Words;
  const N = 6000;
  // Active 'goat': the neighbours of g are f t y h b v. Words starting with one of them keep weight 1,
  // the rest get 3. Words starting with g are excluded by rule 4 either way.
  const NEAR = W.ADJACENT.g;
  function expected(d, tier, min, max) {
    const words = W.POOLS[d][tier].filter(function (w) { return w.length >= min && w.length <= max && w.charAt(0) !== 'g'; });
    const near = words.filter(function (w) { return NEAR.indexOf(w.charAt(0)) !== -1; }).length;
    const far = words.length - near;
    return { plain: near / words.length, weighted: near / (near + 3 * far) };
  }
  const nearFirst = function (w) { return w !== null && NEAR.indexOf(w.charAt(0)) !== -1; };

  const e = expected('easy', 3, 3, 5);
  const fe = frequency(W.createPicker('easy', TG.RNG.create(1)), { tier: 3, minLen: 3, maxLen: 5, active: ['goat'] }, nearFirst, N);
  const m = expected('medium', 1, 4, 5);
  const fm = frequency(W.createPicker('medium', TG.RNG.create(2)), { tier: 1, minLen: 4, maxLen: 5, active: ['goat'] }, nearFirst, N);
  const h = expected('hard', 1, 5, 7);
  const fh = frequency(W.createPicker('hard', TG.RNG.create(3)), { tier: 1, minLen: 5, maxLen: 7, active: ['goat'] }, nearFirst, N);
  const tol = 0.025;
  if (Math.abs(fe - e.weighted) > tol) return 'easy: ' + fe.toFixed(3) + ' vs weighted ' + e.weighted.toFixed(3) + ' (plain ' + e.plain.toFixed(3) + ')';
  if (Math.abs(fm - m.weighted) > tol) return 'medium: ' + fm.toFixed(3) + ' vs weighted ' + m.weighted.toFixed(3) + ' (plain ' + m.plain.toFixed(3) + ')';
  if (Math.abs(fh - h.plain) > tol) return 'hard: ' + fh.toFixed(3) + ' vs plain ' + h.plain.toFixed(3) + ' (weighted ' + h.weighted.toFixed(3) + ')';
  return Math.abs(e.plain - e.weighted) > 0.1 && Math.abs(h.plain - h.weighted) > 0.1;
});

check('(Tier 2) a word containing one of the player\'s weak letters is favoured x2', function () {
  const env = load();
  const TG = env.TG, W = TG.Words;
  const N = 6000;
  const words = W.POOLS.easy[3].filter(function (w) { return w.length >= 3 && w.length <= 5; });
  const weakCount = words.filter(function (w) { return /[qz]/.test(w); }).length;
  const plain = weakCount / words.length;
  const weighted = 2 * weakCount / (2 * weakCount + (words.length - weakCount));
  const hasWeak = function (w) { return w !== null && /[qz]/.test(w); };
  const f1 = frequency(W.createPicker('easy', TG.RNG.create(5)), { tier: 3, minLen: 3, maxLen: 5, active: [], weak: ['q', 'z'] }, hasWeak, N);
  const f0 = frequency(W.createPicker('easy', TG.RNG.create(6)), { tier: 3, minLen: 3, maxLen: 5, active: [] }, hasWeak, N);
  const tol = 0.025;
  if (Math.abs(f1 - weighted) > tol) return 'weighted: ' + f1.toFixed(3) + ' vs ' + weighted.toFixed(3);
  if (Math.abs(f0 - plain) > tol) return 'plain: ' + f0.toFixed(3) + ' vs ' + plain.toFixed(3);
  return weighted - plain > 0.03;
});

// =================================================================================================
// A Level 1 run: how often words repeat
// =================================================================================================

check('a full Level 1 run of threat and crate words never shows a word twice', function () {
  const env = load();
  const TG = env.TG, W = TG.Words;
  // Threat words per section from DESIGN 11.2 plus the crates (1, 2, 4) and typical kinds. Repeats past the
  // RECENT_WORDS window are allowed by DESIGN 10.4, but step 10 prefers words not yet picked in the run, and
  // the tiers are large enough that none is needed (before that preference: 0.9 / 0.5 / 2.1 per run).
  const COUNTS = { easy: [11, 14, 14], medium: [12, 16, 19], hard: [18, 22, 20] };
  const CRATES = [1, 2, 4];
  for (const d of DIFFS) {
    const config = TG.Difficulty.get(d);
    for (let seed = 1; seed <= 20; seed++) {
      const picker = W.createPicker(d, TG.RNG.create(seed), { flavour: 'meadow' });
      const rng = TG.RNG.create(seed + 50);
      const words = [];
      for (let section = 0; section < 3; section++) {
        const n = COUNTS[d][section] + CRATES[section];
        for (let i = 0; i < n; i++) {
          const kind = i < CRATES[section] ? 'crate' : KINDS[rng.int(0, 6)];
          const range = TG.Difficulty.wordRange(config, kind, section);
          const k = rng.int(0, 2);
          const active = k === 0 ? [] : words.slice(-k);
          const w = picker.pick({ tierMix: config.tierMix[section], minLen: range[0], maxLen: range[1], active: active });
          if (w === null) return d + ' seed ' + seed + ': null pick';
          words.push(w);
        }
      }
      const counts = {};
      for (const w of words) counts[w] = (counts[w] || 0) + 1;
      const repeated = Object.keys(counts).filter(function (w) { return counts[w] > 1; });
      const worst = Math.max.apply(null, Object.keys(counts).map(function (w) { return counts[w]; }));
      if (worst > 1) return d + ' seed ' + seed + ': ' + repeated.join(',');
    }
  }
  return true;
});

// =================================================================================================

console.log('');
console.log('test-words: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
