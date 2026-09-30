// js/typing.js
// SPELL RUNNER typing engine (WP-A).
// Defines TG.Typing: create, sync, key, release, backspace, locked, onDamage, onMissed, sectionSummary,
// sectionReset, summary, weakLetters, mult.
//
// Contract: docs/CONTRACT.md sections 4.7, 5.3, 5.11 and 8.1. Design: docs/DESIGN.md sections 3.3,
// 3.4 and 8.
//
// The engine knows nothing about sprites, levels or scoring. It sees a list of objects that implement
// the typable interface (CONTRACT 5.3) and writes only the fields that interface gives it: typed,
// errors, firstKeyAt and lastKeyAt. It reports what happened through the result of key() and through
// the six typing events of CONTRACT 8.1. TG.Game acts on the result (scoring, removing the entity).
//
// This is a simulation module: no Math.random, no Date, no timers, no DOM. Time comes in through the
// `now` and `dt` arguments (real seconds). TG.C is read when a function is called, not when the file
// loads, so that the test loader's constant overrides apply.
//
// The engine object `ty` has four public fields: opts, stats, target and discardT. Every field whose
// name starts with an underscore is private to this file.
(function (root) {
  'use strict';
  var TG = root.TG = root.TG || {};

  var LETTERS = 'abcdefghijklmnopqrstuvwxyz';
  var EPSILON = 1e-9;

  // ---------------------------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------------------------

  function C() {
    return TG.C || {};
  }

  function num(v, fallback) {
    return typeof v === 'number' && isFinite(v) ? v : fallback;
  }

  function emit(name, payload) {
    if (TG.Events && typeof TG.Events.emit === 'function') TG.Events.emit(name, payload);
  }

  function constArray(name, fallback) {
    var v = C()[name];
    return Array.isArray(v) && v.length > 0 ? v : fallback;
  }

  function isLetter(ch) {
    return typeof ch === 'string' && ch.length === 1 && LETTERS.indexOf(ch) !== -1;
  }

  function isTypable(t) {
    return !!t && typeof t === 'object' && t.typable === true && t.lost !== true && typeof t.word === 'string';
  }

  // The result object of key(). Every field is present in every result.
  function makeResult(type, target, ch, index, expected, clean, wordTime, released) {
    return {
      type: type,
      target: target || null,
      ch: ch,
      index: index,
      expected: expected === undefined ? null : expected,
      clean: !!clean,
      wordTime: wordTime || 0,
      released: !!released
    };
  }

  function newStats() {
    var perKey = {};
    for (var i = 0; i < LETTERS.length; i++) {
      perKey[LETTERS.charAt(i)] = { hits: 0, misses: 0, intervalSum: 0, intervalCount: 0 };
    }
    return {
      correct: 0,
      wrong: 0,
      wordsCleared: 0,
      wordsClean: 0,
      wordsMissed: 0,
      lettersInWords: 0,
      wordTime: 0,
      wpm: 0,
      liveWpm: null,
      peakWpm: 0,
      accuracy: 1,
      keyStreak: 0, bestKeyStreak: 0,
      cleanRun: 0, bestCleanRun: 0,
      mult: 1,
      reactionSum: 0, reactionCount: 0,
      perKey: perKey,
      recentWords: [],
      section: { correct: 0, wrong: 0, lettersInWords: 0, wordTime: 0, words: 0 }
    };
  }

  function updateAccuracy(stats) {
    var total = stats.correct + stats.wrong;
    stats.accuracy = total > 0 ? stats.correct / total : 1;
  }

  // WPM over a list of { length, time } entries; 0 when no time has been measured.
  function wpmOf(words) {
    var letters = 0, time = 0;
    for (var i = 0; i < words.length; i++) {
      letters += words[i].length - 1;
      time += words[i].time;
    }
    return time > 0 ? 12 * letters / time : 0;
  }

  // 1..5 from MULT_STEPS (DESIGN 8.2).
  function multOf(cleanRun) {
    var steps = constArray('MULT_STEPS', [0, 3, 6, 10, 15]);
    var m = 1;
    for (var i = 0; i < steps.length; i++) {
      if (cleanRun >= steps[i]) m = i + 1;
    }
    return m;
  }

  // Lock preference: lowest priority, then lowest eta, then lowest id.
  function preferred(a, b) {
    var pa = num(a.priority, 0), pb = num(b.priority, 0);
    if (pa !== pb) return pa < pb;
    var ea = num(a.eta, Infinity), eb = num(b.eta, Infinity);
    if (ea !== eb) return ea < eb;
    return num(a.id, Infinity) < num(b.id, Infinity);
  }

  // Nearest typable: lowest eta, then lowest id.
  function nearer(a, b) {
    var ea = num(a.eta, Infinity), eb = num(b.eta, Infinity);
    if (ea !== eb) return ea < eb;
    return num(a.id, Infinity) < num(b.id, Infinity);
  }

  // ---------------------------------------------------------------------------------------------
  // Counting keys
  // ---------------------------------------------------------------------------------------------

  // A correct key. prevKeyAt is the time of the previous correct key of the same word, or null for
  // the first letter (no per-key interval is recorded then).
  function countCorrect(ty, ch, now, prevKeyAt) {
    var stats = ty.stats;
    stats.correct++;
    stats.section.correct++;
    stats.keyStreak++;
    if (stats.keyStreak > stats.bestKeyStreak) stats.bestKeyStreak = stats.keyStreak;
    var pk = stats.perKey[ch];
    if (pk) {
      pk.hits++;
      if (typeof prevKeyAt === 'number') {
        var interval = now - prevKeyAt;
        if (interval >= 0 && interval <= num(C().KEY_INTERVAL_MAX, 2)) {
          pk.intervalSum += interval;
          pk.intervalCount++;
        }
      }
    }
    updateAccuracy(stats);
  }

  function countWrong(ty, expected) {
    var stats = ty.stats;
    stats.wrong++;
    stats.section.wrong++;
    stats.keyStreak = 0;
    var pk = stats.perKey[expected];
    if (pk) pk.misses++;
    updateAccuracy(stats);
  }

  // Undo of countWrong for the key that auto-releases the lock.
  function uncountWrong(ty, expected, savedStreak) {
    var stats = ty.stats;
    stats.wrong--;
    stats.section.wrong--;
    stats.keyStreak = savedStreak;
    var pk = stats.perKey[expected];
    if (pk) pk.misses--;
    updateAccuracy(stats);
  }

  function emitMilestone(ty) {
    var milestones = constArray('KEY_STREAK_MILESTONES', [25, 50, 100]);
    for (var i = 0; i < milestones.length; i++) {
      if (milestones[i] === ty.stats.keyStreak) emit('streak:milestone', { kind: 'keys', value: milestones[i] });
    }
  }

  // ---------------------------------------------------------------------------------------------
  // The lock
  // ---------------------------------------------------------------------------------------------

  // Releases the lock, sets the target's typed and errors to 0, emits target:release.
  function release(ty, reason) {
    var t = ty.target;
    if (!t) return false;
    t.typed = 0;
    t.errors = 0;
    t.firstKeyAt = null;
    t.lastKeyAt = null;
    ty.target = null;
    ty._wrongRun = 0;
    ty._afterWrong = false;
    ty._run = [];
    emit('target:release', { target: t, id: t.id, reason: reason });
    return true;
  }

  // Releases with reason 'gone' if the locked target is no longer in `typables`, is no longer typable
  // or has been marked lost. A lost target starts the spillover guard (DESIGN 3.3). With `typables`
  // null only the target's own flags are tested.
  function checkTarget(ty, typables) {
    var t = ty.target;
    if (!t) return;
    var listed = typables === null || (Array.isArray(typables) && typables.indexOf(t) !== -1);
    if (listed && t.typable === true && t.lost !== true) return;
    var lost = t.lost === true;
    release(ty, 'gone');
    if (lost) ty.discardT = num(C().DISCARD_TIME, 0.25);
  }

  // The last letter of a word was typed. Updates the word statistics, the clean run and the
  // multiplier, and releases the lock silently.
  function completeWord(ty, t, ch, now, released) {
    var stats = ty.stats;
    var length = t.word.length;
    var time = typeof t.firstKeyAt === 'number' ? Math.max(0, now - t.firstKeyAt) : 0;
    var clean = t.errors === 0;

    stats.wordsCleared++;
    if (clean) stats.wordsClean++;
    stats.lettersInWords += length - 1;
    stats.wordTime += time;
    stats.section.lettersInWords += length - 1;
    stats.section.wordTime += time;
    stats.section.words++;
    stats.wpm = stats.wordTime > 0 ? 12 * stats.lettersInWords / stats.wordTime : 0;

    stats.recentWords.push({ length: length, time: time, clean: clean, at: now });
    var keep = Math.max(1, num(C().LIVE_WPM_WORDS, 8));
    while (stats.recentWords.length > keep) stats.recentWords.shift();

    var peakWords = Math.max(1, num(C().PEAK_WPM_WORDS, 5));
    ty._peak.push({ length: length, time: time });
    while (ty._peak.length > peakWords) ty._peak.shift();
    if (ty._peak.length === peakWords) {
      var v = wpmOf(ty._peak);
      if (v > stats.peakWpm) stats.peakWpm = v;
    }

    // Clean run and multiplier (DESIGN 8.2).
    var previousMult = stats.mult;
    if (clean) {
      stats.cleanRun++;
    } else {
      var steps = constArray('MULT_STEPS', [0, 3, 6, 10, 15]);
      var step = multOf(stats.cleanRun);
      var newStep = Math.max(1, step - Math.max(0, num(ty.opts.streakPenaltySteps, 0)));
      stats.cleanRun = num(steps[newStep - 1], 0);
    }
    stats.mult = multOf(stats.cleanRun);
    if (stats.cleanRun > stats.bestCleanRun) stats.bestCleanRun = stats.cleanRun;

    ty.target = null;
    ty._wrongRun = 0;
    ty._afterWrong = false;
    ty._run = [];
    ty._lastWordDoneAt = now;

    if (stats.mult !== previousMult) {
      emit('streak:change', { cleanRun: stats.cleanRun, mult: stats.mult, previousMult: previousMult });
    }
    return makeResult('complete', t, ch, length - 1, null, clean, time, released);
  }

  // Step 3 of key handling: a key while a target is locked. Returns the result, or null when the key
  // auto-released the lock and must be handled again as a new key.
  function keyOnTarget(ty, ch, now, typables) {
    var t = ty.target;
    var expected = t.word.charAt(t.typed);

    if (ch === expected) {
      var prevKeyAt = t.typed > 0 ? t.lastKeyAt : null;
      t.typed++;
      t.lastKeyAt = now;
      countCorrect(ty, ch, now, prevKeyAt);
      ty._wrongRun = 0;
      ty._afterWrong = false;
      ty._run = [];
      var complete = t.typed >= t.word.length;
      emit('type:hit', {
        target: t, id: t.id, kind: t.kind, ch: ch, index: t.typed - 1, length: t.word.length,
        complete: complete, x: t.x, y: t.y
      });
      emitMilestone(ty);
      if (complete) return completeWord(ty, t, ch, now, false);
      return makeResult('hit', t, ch, t.typed - 1);
    }

    // A wrong key: progress is kept.
    var savedStreak = ty.stats.keyStreak;
    if (ty._run.length === 0) ty._runStreak = savedStreak;
    ty._run.push({ ch: ch, at: now });
    t.errors++;
    countWrong(ty, expected);
    ty._wrongRun++;
    ty._afterWrong = true;
    emit('type:miss', { target: t, id: t.id, ch: ch, expected: expected, repeat: ty._wrongRun, x: t.x, y: t.y });

    var n = num(ty.opts.autoReleaseMisses, 0);
    if (n > 0 && t.typed <= num(C().AUTO_RELEASE_MAX_TYPED, 2) && ty._wrongRun >= n) {
      // This key is not a miss after all: it is tried as a new lock, together with the wrong keys
      // before it when they spell the start of another word.
      t.errors--;
      uncountWrong(ty, expected, savedStreak);
      var run = ty._run, runStreak = ty._runStreak;
      release(ty, 'auto');
      return lockRun(ty, run, expected, runStreak, typables);
    }
    return makeResult('miss', t, ch, -1, expected);
  }

  // After an auto-release (DESIGN 3.3). The wrong keys in a row on the released word (run, those taken
  // back by Backspace left out) may spell the start of a word with nothing typed: the player has moved
  // on to that word without Backspace. That word is locked with those letters typed at the times they
  // were pressed, and their misses are taken back (the last key's already is). Returns the result of
  // the last key, or null when no word matches; the last key alone is then tried as a new lock.
  function lockRun(ty, run, expected, streak, typables) {
    if (run.length < 2) return null;
    var text = '', best = null, i;
    for (i = 0; i < run.length; i++) text += run[i].ch;
    for (i = 0; i < typables.length; i++) {
      var t = typables[i];
      if (isTypable(t) && t.typed === 0 && t.word.indexOf(text) === 0 && (best === null || preferred(t, best))) best = t;
    }
    if (!best) return null;
    for (i = 0; i < run.length - 1; i++) uncountWrong(ty, expected, streak);
    var r = lock(ty, best, run[0].ch, run[0].at, true);
    for (i = 1; i < run.length; i++) r = keyOnTarget(ty, run[i].ch, run[i].at, typables);
    r.released = true;
    return r;
  }

  // Locks t with its first letter ch.
  function lock(ty, t, ch, now, released) {
    t.typed = 1;
    t.errors = 0;
    t.firstKeyAt = now;
    t.lastKeyAt = now;
    ty.target = t;
    ty._wrongRun = 0;
    ty._afterWrong = false;
    ty._run = [];
    countCorrect(ty, ch, now, null);
    recordReaction(ty, t, now);
    emit('target:lock', { target: t, id: t.id, kind: t.kind, x: t.x, y: t.y });
    var complete = t.word.length <= 1;
    emit('type:hit', {
      target: t, id: t.id, kind: t.kind, ch: ch, index: 0, length: t.word.length,
      complete: complete, x: t.x, y: t.y
    });
    emitMilestone(ty);
    if (complete) return completeWord(ty, t, ch, now, released);
    return makeResult('lock', t, ch, 0, null, false, 0, released);
  }

  // Step 4 of key handling: a key while nothing is locked.
  function lockOrMiss(ty, ch, typables, now, released) {
    var any = false, best = null, nearest = null;
    for (var i = 0; i < typables.length; i++) {
      var t = typables[i];
      if (!isTypable(t)) continue;
      any = true;
      if (nearest === null || nearer(t, nearest)) nearest = t;
      if (t.typed === 0 && t.word.charAt(0) === ch && (best === null || preferred(t, best))) best = t;
    }
    if (!any) return makeResult('ignored', null, ch, -1, null, false, 0, released);

    if (best) return lock(ty, best, ch, now, released);

    // No candidate: a wrong key, recorded against the first letter of the nearest typable.
    var expected = nearest.word.charAt(0);
    countWrong(ty, expected);
    ty._wrongRun++;
    emit('type:miss', { target: null, id: null, ch: ch, expected: expected, repeat: ty._wrongRun, x: nearest.x, y: nearest.y });
    return makeResult('miss', null, ch, -1, expected, false, 0, released);
  }

  // Reaction time (DESIGN 8.1, Tier 2): from the word being shown, or the previous word being
  // completed if later, to the first correct key. Counted once per word.
  function recordReaction(ty, t, now) {
    if (typeof t.shownAt !== 'number' || !isFinite(t.shownAt)) return;
    var id = t.id;
    if (id === undefined || id === null) return;
    if (ty._reacted[id] === true) return;
    ty._reacted[id] = true;
    var from = Math.max(t.shownAt, ty._lastWordDoneAt);
    var reaction = now - from;
    if (reaction < 0) return;
    ty.stats.reactionSum += reaction;
    ty.stats.reactionCount++;
  }

  // Letters sorted for the results screen: highest miss rate first, then more misses, then a to z.
  function missRanking(stats, minMisses) {
    var out = [];
    for (var i = 0; i < LETTERS.length; i++) {
      var ch = LETTERS.charAt(i);
      var pk = stats.perKey[ch];
      if (!pk || pk.misses < minMisses) continue;
      out.push({ ch: ch, rate: pk.misses / (pk.hits + pk.misses), misses: pk.misses });
    }
    out.sort(function (a, b) {
      return (b.rate - a.rate) || (b.misses - a.misses) || (a.ch < b.ch ? -1 : 1);
    });
    return out;
  }

  function slowRanking(stats, minSamples) {
    var out = [];
    for (var i = 0; i < LETTERS.length; i++) {
      var ch = LETTERS.charAt(i);
      var pk = stats.perKey[ch];
      if (!pk || pk.intervalCount < minSamples) continue;
      out.push({ ch: ch, mean: pk.intervalSum / pk.intervalCount });
    }
    out.sort(function (a, b) {
      return (b.mean - a.mean) || (a.ch < b.ch ? -1 : 1);
    });
    return out;
  }

  function letters(ranking, n) {
    var out = [];
    for (var i = 0; i < ranking.length && i < n; i++) out.push(ranking[i].ch);
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------------------------

  TG.Typing = {
    // opts: { autoReleaseMisses: 3 (0 = off), streakPenaltySteps: 1 | 2 | 5 }
    create: function (opts) {
      opts = opts || {};
      return {
        opts: {
          autoReleaseMisses: Math.max(0, Math.floor(num(opts.autoReleaseMisses, 3))),
          streakPenaltySteps: Math.max(0, Math.floor(num(opts.streakPenaltySteps, 2)))
        },
        stats: newStats(),
        target: null,          // the locked typable, or null
        discardT: 0,           // s left of the spillover guard

        // private
        _lastKeyTime: -Infinity,   // time of the previous key; key times are strictly increasing
        _wrongRun: 0,              // wrong keys in a row since the last correct key or lock change
        _afterWrong: false,        // the last key on the locked word was wrong (and no Backspace since)
        _run: [],                  // those wrong keys on the lock, less any taken back by Backspace: { ch, at }
        _runStreak: 0,             // stats.keyStreak before the first of them
        _lastWordDoneAt: -Infinity,
        _wpmT: 0,                  // s since the live WPM was refreshed
        _peak: [],                 // the last PEAK_WPM_WORDS completed words
        _reacted: {}               // ids of words whose reaction time has been counted
      };
    },

    // Once per step before any key: drops a lost or vanished target, counts down the discard window,
    // refreshes stats.liveWpm every WPM_REFRESH seconds.
    sync: function (ty, typables, now, dt) {
      dt = Math.max(0, num(dt, 0));
      if (ty.discardT > 0) {
        ty.discardT -= dt;
        if (ty.discardT < EPSILON) ty.discardT = 0;
      }
      checkTarget(ty, typables);

      ty._wpmT += dt;
      var refresh = num(C().WPM_REFRESH, 0.5);
      if (ty._wpmT >= refresh) {
        ty._wpmT = refresh > 0 ? ty._wpmT % refresh : 0;
        var recent = ty.stats.recentWords;
        ty.stats.liveWpm = recent.length >= num(C().LIVE_WPM_MIN, 3) ? wpmOf(recent) : null;
      }
    },

    // One letter key. ch: one lowercase letter. now: state.time (real seconds).
    key: function (ty, ch, typables, now) {
      if (typeof ch === 'string') ch = ch.toLowerCase();
      if (!isLetter(ch)) return makeResult('ignored', null, ch, -1);
      if (!Array.isArray(typables)) typables = [];

      // 1. Key times are strictly increasing.
      now = num(now, 0);
      if (!(now > ty._lastKeyTime)) now = ty._lastKeyTime + 0.001;
      ty._lastKeyTime = now;

      // A target marked lost or untypable since sync (removed by the game in this step) is released here.
      // Membership of `typables` is sync's business; only the target's own flags are tested.
      checkTarget(ty, null);

      // 2. The spillover guard.
      if (ty.discardT > 0) return makeResult('discarded', null, ch, -1);

      // 3. A locked target.
      if (ty.target) {
        var r = keyOnTarget(ty, ch, now, typables);
        if (r) return r;
        // The key auto-released the lock: try it as a new lock.
        return lockOrMiss(ty, ch, typables, now, true);
      }

      // 4. Nothing locked.
      return lockOrMiss(ty, ch, typables, now, false);
    },

    // reason: 'backspace' | 'auto' | 'gone' | 'screen'. False if nothing was locked.
    release: function (ty, reason) {
      return release(ty, reason);
    },

    // The Backspace key (DESIGN 3.3). A wrong key never removes progress, so a Backspace pressed straight
    // after a wrong key on the locked word only takes that mistake back: the lock and the progress stay
    // and nothing is emitted ('kept'). Any other Backspace, including a second one in a row, releases the
    // lock with reason 'backspace' ('released'). 'none' when nothing is locked.
    backspace: function (ty) {
      if (!ty.target) return 'none';
      if (ty._afterWrong) {
        ty._afterWrong = false;
        // The key taken back is left out of the run an auto-release replays. Its miss stays counted, so
        // the key streak is not given back either.
        ty._run.pop();
        ty._runStreak = 0;
        return 'kept';
      }
      release(ty, 'backspace');
      return 'released';
    },

    locked: function (ty) {
      return ty.target || null;
    },

    // A life was lost.
    onDamage: function (ty) {
      var stats = ty.stats;
      var previousMult = stats.mult;
      stats.cleanRun = 0;
      stats.mult = 1;
      emit('streak:change', { cleanRun: 0, mult: 1, previousMult: previousMult });
    },

    // A threat reached Pip with its word unfinished.
    onMissed: function (ty, typable) {
      ty.stats.wordsMissed++;
    },

    sectionSummary: function (ty) {
      var s = ty.stats.section;
      var total = s.correct + s.wrong;
      return {
        wpm: s.wordTime > 0 ? 12 * s.lettersInWords / s.wordTime : 0,
        accuracy: total > 0 ? s.correct / total : 1,
        correct: s.correct,
        wrong: s.wrong,
        words: s.words
      };
    },

    sectionReset: function (ty) {
      var s = ty.stats.section;
      s.correct = 0;
      s.wrong = 0;
      s.lettersInWords = 0;
      s.wordTime = 0;
      s.words = 0;
      // Misses counted in the section that ended cannot be taken back from the new one.
      ty._run = [];
    },

    // CONTRACT 5.11. Pure.
    summary: function (ty) {
      var stats = ty.stats;
      return {
        wpm: stats.wpm,
        peakWpm: stats.peakWpm,
        accuracy: stats.accuracy,
        correct: stats.correct,
        wrong: stats.wrong,
        wordsCleared: stats.wordsCleared,
        wordsClean: stats.wordsClean,
        wordsMissed: stats.wordsMissed,
        bestCleanRun: stats.bestCleanRun,
        bestKeyStreak: stats.bestKeyStreak,
        avgReaction: stats.reactionCount > 0 ? stats.reactionSum / stats.reactionCount : 0,
        practiseKeys: letters(missRanking(stats, 2), 3),
        slowKeys: letters(slowRanking(stats, 4), 3)
      };
    },

    // Up to n letters, highest miss rate first, each with at least 2 misses.
    weakLetters: function (ty, n) {
      return letters(missRanking(ty.stats, 2), Math.max(0, num(n, 0)));
    },

    // 1..5 from MULT_STEPS.
    mult: function (cleanRun) {
      return multOf(num(cleanRun, 0));
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
