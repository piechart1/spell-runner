// js/game.js
// SPELL RUNNER game state and fixed step (WP-E). Defines TG.Game.
//
// Contract: docs/CONTRACT.md sections 4.16, 5.1, 5.11, 9 and 11.3. Design: docs/DESIGN.md sections
// 3, 6, 7, 8 and 9.3.
//
// File layout:
//   1. helpers, the transition table and the empty state
//   2. screens: canGo, setScreen, pause, resume
//   3. newRun and continueRun
//   4. step (the fixed order of CONTRACT 4.16) and its parts: input, typing results, screen timers,
//      power-up timers, adaptive pacing, camera
//   5. scoring, lives and power-ups: addScore, addLife, applyPower
//   6. the run result, endRun and snapshot
//
// Fields added to the state beyond CONTRACT 5.1:
//   state.tutorial.enabled   the tutorial slow-down applies on this run (newRun option `tutorial`)
//   state.tutorial.done      ids of the tutorial threats that have had their slow-down
//   state.run.bestWpm        the saved personal best WPM for the difficulty, read once by newRun
//
// The boss round state machine lives in js/boss.js. This file hands over to it at the end of the
// boss intro (screenTimers) and passes it completed boss words (completeWord).
//
// This is a simulation module: no Math.random, no Date, no timers, no DOM. TG.Save is only read, in
// newRun. The simulation never writes to TG.Save.
(function (root) {
  'use strict';
  var TG = root.TG = root.TG || {};

  // ---------------------------------------------------------------------------------------------
  // 1. Helpers, the transition table and the empty state
  // ---------------------------------------------------------------------------------------------

  // CONTRACT 9.1.
  var TRANSITIONS = {
    boot: ['title'],
    title: ['difficultySelect', 'howToPlay'],
    difficultySelect: ['howToPlay', 'title'],
    howToPlay: ['playing', 'title', 'difficultySelect'],
    playing: ['lifeLost', 'paused', 'bossIntro'],
    lifeLost: ['playing', 'boss', 'gameOver', 'paused'],
    bossIntro: ['boss', 'paused'],
    boss: ['lifeLost', 'paused', 'levelComplete'],
    levelComplete: ['results'],
    paused: ['playing', 'bossIntro', 'boss', 'results'],
    gameOver: ['playing', 'bossIntro', 'results'],
    results: ['highScoreEntry', 'title'],
    highScoreEntry: ['title']
  };

  var JUMP_KEYS = { space: true, up: true, jump: true };
  var DUCK_KEYS = { enter: true, down: true, semicolon: true, duck: true };
  var DUCK_KEY_LIST = ['enter', 'down', 'semicolon', 'duck'];
  var LETTER_SCREENS = { playing: true, boss: true, lifeLost: true };
  var ACTION_SCREENS = { playing: true, lifeLost: true, bossIntro: true, boss: true };
  var PAUSABLE = { playing: true, bossIntro: true, boss: true };
  var RELEASE_ON_ENTER = { paused: true, gameOver: true, results: true, bossIntro: true };
  var EPS = 1e-9;

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function emit(name, payload) {
    if (TG.Events && TG.Events.emit) TG.Events.emit(name, payload);
  }

  function warn(message) {
    if (typeof console !== 'undefined' && console && console.warn) console.warn(message);
  }

  function emptyState() {
    return {
      screen: 'boot', screenT: 0, screenData: null, resumeTo: null, pausePending: false,
      frame: 0, time: 0, worldTime: 0,
      pace: 1, assist: 1, assistTarget: 1, adaptive: true,
      slowScale: 1, tutorScale: 1, finisherScale: 1, timeScale: 1,
      seed: 1, rng: null, difficulty: 'medium', config: null, levelId: 1, level: null, picker: null, typing: null,
      section: 0, camera: { x: 0 }, player: null, entities: [], items: [], boss: null, nextId: 1,
      score: 0, nextLifeAt: 10000, ink: 0, inkTotal: 0,
      power: { shield: 0, slowT: 0, quillT: 0, last: null },
      checkpoint: { index: 0, x: 96, score: 0, ink: 0, inkTotal: 0, nextLifeAt: 10000, bossPhase: 1, continuesHere: 0 },
      lifeLost: { cause: 'hit', t: 0, duration: 0.10, gapId: null, last: false },
      tutorial: { active: false, targetId: null, enabled: false, done: [] },
      adapt: { n: 0, uSum: 0, correct: 0, wrong: 0 },
      run: {
        continues: 0, livesLost: 0, sectionLivesLost: 0, hits: 0, falls: 0,
        damageTypable: 0, damageOther: 0,
        threatsCleared: 0, threatsMissed: 0, cratesCleared: 0, cratesMissed: 0,
        cleared: false, ended: false, bonuses: [], bestWpm: 0
      },
      result: null
    };
  }

  function timeScaleOf(s) {
    return s.pace * s.assist * s.slowScale * s.tutorScale * s.finisherScale;
  }

  function sectionPayload(level, index) {
    var sec = index === 3 ? level.arena : level.sections[index];
    return { index: index, name: sec.name, stage: sec.stage, palette: sec.palette, music: sec.music };
  }

  function levelStartPayload(s, continued) {
    return { levelId: s.levelId, difficulty: s.difficulty, name: s.level.name, continued: continued, music: s.level.theme.music };
  }

  function anyDuckDown() {
    if (!TG.Input) return false;
    for (var i = 0; i < DUCK_KEY_LIST.length; i++) {
      if (TG.Input.isDown(DUCK_KEY_LIST[i])) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------------------------
  // 2. Screens
  // ---------------------------------------------------------------------------------------------

  function canGo(from, to) {
    return hasOwn(TRANSITIONS, from) && TRANSITIONS[from].indexOf(to) !== -1;
  }

  function setScreen(name, data) {
    var s = TG.Game.state;
    var from = s.screen;
    if (!canGo(from, name)) {
      warn('TG.Game.setScreen: ' + from + ' -> ' + name + ' is not allowed');
      return false;
    }
    if (RELEASE_ON_ENTER[name] && s.typing && s.typing.target) TG.Typing.release(s.typing, 'screen');
    s.screen = name;
    s.screenT = 0;
    s.screenData = data || null;
    emit('screen:change', { from: from, to: name, data: s.screenData });
    if (name === 'gameOver') emit('game:over', { checkpoint: s.checkpoint.index, score: s.score });
    return true;
  }

  function pause() {
    var s = TG.Game.state;
    if (PAUSABLE[s.screen]) {
      s.resumeTo = s.screen;
      return setScreen('paused');
    }
    if (s.screen === 'lifeLost') {
      s.pausePending = true;          // deferred until the lifeLost pause ends (CONTRACT 9.2)
      return false;
    }
    return false;
  }

  function resume() {
    var s = TG.Game.state;
    if (s.screen !== 'paused') return false;
    var to = s.resumeTo && PAUSABLE[s.resumeTo] ? s.resumeTo : 'playing';
    return setScreen(to);
  }

  // ---------------------------------------------------------------------------------------------
  // 3. newRun and continueRun
  // ---------------------------------------------------------------------------------------------

  function newRun(opts) {
    var C = TG.C;
    opts = opts || {};
    var difficulty = opts.difficulty || 'medium';
    var levelId = opts.levelId !== undefined ? opts.levelId : 1;
    var data = TG.Levels[levelId];
    if (!data) throw new Error('TG.Game.newRun: there is no level ' + levelId);
    var config = TG.Difficulty.resolve(difficulty, data.tune);

    var save = TG.Save;
    var adaptive = typeof opts.adaptive === 'boolean' ? opts.adaptive : save.getSetting('adaptive') !== false;
    // With adaptive pacing off the run keeps full speed (DESIGN 9.3), whatever value an earlier run saved.
    var assist = isNum(opts.assist) && opts.assist > 0 ? opts.assist : (adaptive ? save.assist(difficulty) : 1);
    var tutorial = typeof opts.tutorial === 'boolean' ? opts.tutorial
      : (config.tutorialAlways || !save.getSetting('tutorialDone'));

    var from = TG.Game.state ? TG.Game.state.screen : null;
    var s = emptyState();
    s.seed = isNum(opts.seed) ? opts.seed : 1;
    s.rng = TG.RNG.create(s.seed);
    s.difficulty = difficulty;
    s.config = config;
    s.levelId = levelId;
    s.level = TG.Level.build(data, config);
    s.picker = TG.Words.createPicker(difficulty, s.rng, { flavour: data.theme && data.theme.wordFlavour });
    s.typing = TG.Typing.create({ autoReleaseMisses: config.autoReleaseMisses, streakPenaltySteps: config.streakPenaltySteps });
    s.pace = config.pace;
    s.assist = assist;
    s.assistTarget = assist;
    s.adaptive = adaptive;
    s.player = TG.Entities.createPlayer(config, s.level.checkpoints[0].x);
    s.camera.x = Math.max(0, s.player.x - C.HERO_SCREEN_X);
    s.items = TG.Level.makeItems(s.level, 0);
    s.nextLifeAt = config.extraLifeFirst;
    s.checkpoint = {
      index: 0, x: s.level.checkpoints[0].x, score: 0, ink: 0, inkTotal: 0,
      nextLifeAt: config.extraLifeFirst, bossPhase: 1, continuesHere: 0
    };
    s.tutorial.enabled = tutorial && s.level.tutorial;
    s.run.bestWpm = save.best(difficulty).wpm;
    s.timeScale = timeScaleOf(s);
    s.screen = 'playing';
    TG.Game.state = s;

    emit('screen:change', { from: from, to: 'playing', data: null });
    emit('level:start', levelStartPayload(s, false));
    emit('section:enter', sectionPayload(s.level, 0));
    return s;
  }

  // DESIGN 9.3: pacing eases after a continue.
  function easeOnContinue(s) {
    if (!s.adaptive) return;
    var C = TG.C;
    var target = s.checkpoint.continuesHere <= 1
      ? Math.min(s.assistTarget, C.ASSIST_CONTINUE_CAP)
      : s.assistTarget - 0.05;
    target = Math.max(C.ASSIST_MIN_CONTINUE, target);
    if (target !== s.assistTarget) {
      s.assistTarget = target;
      emit('assist:change', { assist: s.assist, target: s.assistTarget });
    }
  }

  function continueRun() {
    var C = TG.C;
    var s = TG.Game.state;
    if (s.screen !== 'gameOver' && s.screen !== 'paused') return false;
    var config = s.config;
    var cp = s.checkpoint;

    // 1. Counters and pacing.
    s.run.continues++;
    cp.continuesHere++;
    easeOnContinue(s);
    // 2. Threats and crates leave.
    TG.Entities.clearAll(s, 'flee');
    s.entities = [];
    // 3. The lock is released; the typing statistics are kept.
    if (s.typing && s.typing.target) TG.Typing.release(s.typing, 'screen');
    // 4. Score, ink and lives from the checkpoint.
    s.score = cp.score;
    s.ink = cp.ink;
    s.inkTotal = cp.inkTotal;
    s.nextLifeAt = cp.nextLifeAt;
    // 5. Timed power-ups end without events; shield charges are kept.
    s.power.slowT = 0;
    s.power.quillT = 0;
    s.power.last = null;
    s.slowScale = 1;
    s.tutorScale = 1;
    s.finisherScale = 1;
    s.pausePending = false;
    s.tutorial.active = false;
    s.tutorial.targetId = null;
    s.lifeLost = { cause: 'hit', t: 0, duration: C.HIT_FREEZE, gapId: null, last: false };
    // 6. The level from the checkpoint on, and a new player there.
    TG.Level.resetFrom(s, cp.index);
    s.player = TG.Entities.createPlayer(config, cp.x);
    s.camera.x = Math.max(0, s.player.x - C.HERO_SCREEN_X);
    s.section = TG.Level.sectionAt(s.level, cp.x);
    s.boss = null;
    s.resumeTo = null;
    // 7. The boss checkpoint restarts the Baron at the phase that had been reached.
    var atBoss = cp.index === s.level.checkpoints.length - 1;
    if (atBoss && TG.Boss && TG.Boss.create) TG.Boss.create(s);
    s.timeScale = timeScaleOf(s);
    setScreen(atBoss ? 'bossIntro' : 'playing');
    // 8. Events, in this order after screen:change.
    emit('game:continue', { checkpoint: cp.index, continues: s.run.continues, assist: s.assist });
    emit('level:start', levelStartPayload(s, true));
    emit('section:enter', sectionPayload(s.level, s.section));
    return true;
  }

  // ---------------------------------------------------------------------------------------------
  // 4. step
  // ---------------------------------------------------------------------------------------------

  function step(dt) {
    var s = TG.Game.state;
    // 1.
    if (!s || !isSimScreen(s.screen)) return;
    if (!(dt > 0)) return;
    // 2.
    s.frame++;
    s.time += dt;
    s.screenT += dt;
    // 3.
    s.timeScale = timeScaleOf(s);
    var wdt = s.screen === 'lifeLost' ? 0 : dt * s.timeScale;
    // 4.
    TG.Typing.sync(s.typing, TG.Entities.typables(s), s.time, dt);
    // 5.
    if (!handleInput(s)) return;
    // 6.
    if (screenTimers(s, dt)) return;
    // 7.
    if (s.screen === 'playing') {
      TG.Level.update(s, wdt);
    } else if (s.screen === 'bossIntro' || s.screen === 'boss' || s.screen === 'levelComplete') {
      if (TG.Boss && TG.Boss.update) TG.Boss.update(s, wdt, dt);
    }
    // 8.
    TG.Entities.updatePlayer(s, wdt, dt);
    TG.Entities.update(s, wdt, dt);
    // 9.
    updatePowers(s, dt);
    updateTutorial(s, dt);
    updateAssist(s, dt);
    updateCamera(s);
    // 10.
    s.worldTime += wdt;
  }

  // Step 5. Returns false when the step must stop because the screen left the sim screens (Esc).
  function handleInput(s) {
    var events = TG.Input ? TG.Input.drain() : [];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type === 'char') {
        if (LETTER_SCREENS[s.screen]) handleLetter(s, ev.ch);
      } else if (ev.type === 'down') {
        if (JUMP_KEYS[ev.key]) {
          if (ACTION_SCREENS[s.screen]) TG.Entities.pressJump(s);
        } else if (DUCK_KEYS[ev.key]) {
          if (ACTION_SCREENS[s.screen]) TG.Entities.pressDuck(s);
        } else if (ev.key === 'backspace') {
          TG.Typing.backspace(s.typing);
        } else if (ev.key === 'esc') {
          pause();
          break;                        // the rest of this step's events are dropped
        }
      } else if (ev.type === 'up') {
        if (DUCK_KEYS[ev.key] && !anyDuckDown()) TG.Entities.releaseDuck(s);
      }
    }
    if (s.player) s.player.duckHeld = anyDuckDown();
    return isSimScreen(s.screen);
  }

  // A letter key: CONTRACT 4.16 "Applying a typing result".
  function handleLetter(s, ch) {
    var correct = s.typing.stats.correct;
    var result = TG.Typing.key(s.typing, ch, TG.Entities.typables(s), s.time);
    var t = result.target;
    if (result.type === 'lock' || result.type === 'hit') {
      correctLetter(s, t);
    } else if (result.type === 'complete') {
      correctLetter(s, t);
      completeWord(s, t, result);
    } else {
      return;
    }
    // One key counts several correct letters when an auto-release locks a word with the letters typed
    // before it (CONTRACT 4.7).
    shieldForStreak(s, s.typing.stats.correct - correct);
  }

  function correctLetter(s, t) {
    var C = TG.C;
    // Letter points and the letter stall are paid once per letter of a word: letters typed again after
    // a Backspace or an auto-release earn nothing, so releasing and retyping cannot hold a threat back.
    var def = TG.Entities.KINDS[t.kind];
    while (t.typed > (t.bestTyped || 0)) {
      t.bestTyped = (t.bestTyped || 0) + 1;
      var points = C.PTS_LETTER * (s.power.quillT > 0 ? 2 : 1);
      addScore(points, { reason: 'letter', x: t.x, y: t.y });
      // A moving threat's clock pauses on each correct letter.
      if (def && def.stall && t.type === 'threat') t.stallT += TG.Difficulty.toWs(s.config, s.config.letterStall);
    }
  }

  function completeWord(s, t, result) {
    var C = TG.C;
    if (t.kind === 'core' || t.kind === 'finisher') {
      // Boss words: no word:clear (CONTRACT 4.16). The boss reacts.
      if (TG.Boss && TG.Boss.onWordComplete) TG.Boss.onWordComplete(s, t);
      return;
    }
    var def = TG.Entities.KINDS[t.kind];
    var mult = s.typing.stats.mult;
    var u = t.budget > 0 ? t.age / t.budget : 1;
    var clean = result.clean === true;
    var quick = u <= C.QUICK_U;
    var quill = s.power.quillT > 0;
    var points = TG.Util.round10(C.PTS_WORD_PER_LETTER * t.word.length * mult *
      (clean ? C.CLEAN_FACTOR : 1) * (quick ? C.QUICK_FACTOR : 1) * (quill ? 2 : 1) * s.assist);
    var close = t.type === 'threat' && t.eta < C.CLOSE_CALL_TIME;

    TG.Entities.remove(s, t, 'cleared');
    if (t.type === 'crate') s.run.cratesCleared++;
    else s.run.threatsCleared++;

    emit('word:clear', {
      id: t.id, type: t.type, kind: t.kind, family: def.family, from: t.from, word: t.word,
      x: t.x, y: t.y, w: t.w, h: t.h, score: points, mult: mult, clean: clean, quick: quick, close: close,
      cause: 'typed', power: t.type === 'crate' ? t.power : null
    });
    addScore(points, { reason: 'word', x: t.x, y: t.y });
    if (close) addScore(C.PTS_CLOSE, { reason: 'close', x: t.x, y: t.y });
    if (t.type === 'crate') applyPower(t.power, t.x, t.y);
  }

  // A shield charge for every config.shieldKeyStreak correct keys in a row (DESIGN 7). keys: the correct
  // keys counted by this letter key, so that each streak value reached is checked.
  function shieldForStreak(s, keys) {
    var C = TG.C;
    var every = s.config.shieldKeyStreak;
    for (var k = keys - 1; k >= 0; k--) {
      var streak = s.typing.stats.keyStreak - k;
      if (streak > 0 && every > 0 && streak % every === 0 && s.power.shield < C.MAX_SHIELD) {
        s.power.shield++;
        emit('shield:gain', { charges: s.power.shield, cause: 'streak' });
      }
    }
  }

  // After a fall, Pip returns in a bubble past the far edge of the gap (DESIGN 5).
  function rescue(s) {
    var C = TG.C;
    var p = s.player;
    var gap = null;
    for (var i = 0; i < s.level.hazards.length; i++) {
      if (s.level.hazards[i].id === p.lastGapId) gap = s.level.hazards[i];
    }
    p.x = gap ? gap.x + gap.w + C.RESCUE_AHEAD : p.x + C.RESCUE_AHEAD;
    p.y = C.GROUND_Y;
    p.vy = 0;
    p.state = 'rescue';
    p.onGround = true;
    p.jumpT = -1;
    p.coyoteT = 0;
    p.bufferT = 0;
    p.slideT = 0;
    p.duckBufferT = 0;
    p.fallen = false;
    emit('hero:rescue', { x: p.x, y: p.y });
  }

  // Step 6. Returns true when a timer ended and the screen changed.
  function screenTimers(s, dt) {
    var C = TG.C;
    if (s.screen === 'lifeLost') {
      s.lifeLost.t += dt;
      if (s.lifeLost.t + EPS < s.lifeLost.duration) return false;
      if (s.player.lives <= 0) {
        s.pausePending = false;
        setScreen('gameOver');
        return true;
      }
      if (s.lifeLost.cause === 'fall') rescue(s);
      var back = s.resumeTo === 'boss' ? 'boss' : 'playing';
      if (s.pausePending) {
        s.pausePending = false;
        s.resumeTo = back;
        setScreen('paused');
      } else {
        setScreen(back);
      }
      return true;
    }
    if (s.screen === 'bossIntro') {
      var boss = s.boss;
      var length = boss && isNum(boss.introTime) ? boss.introTime : C.BOSS_INTRO_TIME;
      // Timed by the Baron's intro clock (real s, advanced by TG.Boss.update after this point in the
      // step, hence + dt) rather than screenT, which a pause and resume would set back to 0.
      var elapsed = boss && boss.state === 'intro' ? boss.stateT + dt : s.screenT;
      if (elapsed + EPS < length) return false;
      if (boss) {
        // The first round starts. TG.Boss.update runs the entry of 'volley' (and emits boss:state)
        // on the next step.
        boss.state = 'volley';
        boss.stateT = 0;
        boss.rise = 0;
        boss.pose = 'idle';
      }
      setScreen('boss');
      return true;
    }
    if (s.screen === 'levelComplete') {
      if (s.screenT + EPS < C.LEVEL_COMPLETE_TIME) return false;
      s.result = buildResult(s, true);
      emit('level:clear', { result: s.result });
      setScreen('results');
      return true;
    }
    return false;
  }

  // Hourglass and Golden quill run on the real clock.
  function updatePowers(s, dt) {
    var pw = s.power;
    if (pw.slowT > 0) {
      pw.slowT -= dt;
      if (pw.slowT <= EPS) {
        pw.slowT = 0;
        s.slowScale = 1;
        if (pw.last === 'hourglass') pw.last = pw.quillT > 0 ? 'quill' : null;
        emit('power:end', { power: 'hourglass' });
      }
    }
    if (pw.quillT > 0) {
      pw.quillT -= dt;
      if (pw.quillT <= EPS) {
        pw.quillT = 0;
        if (pw.last === 'quill') pw.last = pw.slowT > 0 ? 'hourglass' : null;
        emit('power:end', { power: 'quill' });
      }
    }
  }

  // Tutorial slow-down (DESIGN 3.5). For a tutorial threat, once TUTOR_T of its time has passed with
  // no letter of it typed, the world slows to TUTOR_SCALE and tutor:prompt is emitted. It ends on the
  // first correct letter of that threat, or when the threat is gone (tutor:end). Each tutorial threat
  // gets the slow-down at most once; state.tutorial.done holds the ids that have had it.
  function updateTutorial(s, dt) {
    var C = TG.C;
    var tut = s.tutorial;
    if (!tut.enabled) {
      s.tutorScale = 1;
      return;
    }
    if (!tut.done) tut.done = [];
    if (tut.active) {
      var target = null;
      for (var i = 0; i < s.entities.length; i++) {
        if (s.entities[i].id === tut.targetId) target = s.entities[i];
      }
      if (target && !target.dead && target.typed === 0) {
        s.tutorScale = C.TUTOR_SCALE;
        return;
      }
      var id = tut.targetId;
      tut.active = false;
      tut.targetId = null;
      s.tutorScale = 1;
      emit('tutor:end', { id: id });
      return;
    }
    s.tutorScale = 1;
    if (s.screen !== 'playing') return;
    for (var j = 0; j < s.entities.length; j++) {
      var e = s.entities[j];
      if (e.dead || !e.tutorial || e.type !== 'threat' || e.typed > 0 || e.t < C.TUTOR_T) continue;
      if (tut.done.indexOf(e.id) !== -1) continue;
      tut.done.push(e.id);
      tut.active = true;
      tut.targetId = e.id;
      s.tutorScale = C.TUTOR_SCALE;
      emit('tutor:prompt', { id: e.id, word: e.word });
      return;
    }
  }

  // Adaptive pacing (DESIGN 9.3). After every ASSIST_WINDOW resolved words (TG.Entities.remove and
  // TG.Boss fill state.adapt), the mean window use u moves the target: over 0.90 by -0.10, over 0.80
  // by -0.05, under 0.55 with 92% accuracy on those words by +0.05. The target is also lowered by
  // TG.Entities.damage and by continueRun. assist moves towards the target at ASSIST_RATE per real
  // second; increases apply only when no typable threat is active and no weak-point window is open.
  function updateAssist(s, dt) {
    var C = TG.C;
    var a = s.adapt;
    if (a && a.n >= C.ASSIST_WINDOW) {
      if (s.adaptive) {
        var mean = a.uSum / a.n;
        var keys = a.correct + a.wrong;
        var accuracy = keys > 0 ? a.correct / keys : 1;
        var target = s.assistTarget;
        if (mean > 0.90) target -= 0.10;
        else if (mean > 0.80) target -= 0.05;
        else if (mean < 0.55 && accuracy >= 0.92) target += 0.05;
        var floor = s.run.continues > 0 ? C.ASSIST_MIN_CONTINUE : C.ASSIST_MIN;
        if (target < s.assistTarget) target = Math.max(Math.min(floor, s.assistTarget), target);
        if (target > s.assistTarget) target = Math.min(C.ASSIST_MAX, target);
        target = Math.round(target * 1000) / 1000;
        if (target !== s.assistTarget) {
          s.assistTarget = target;
          emit('assist:change', { assist: s.assist, target: s.assistTarget });
        }
      }
      s.adapt = { n: 0, uSum: 0, correct: 0, wrong: 0 };
    }
    if (!s.adaptive) return;
    // A weak-point word is timed like a threat, so an open window also holds increases back.
    var timedWord = s.boss && s.boss.word && s.boss.word.kind === 'core';
    if (s.assistTarget > s.assist && (TG.Entities.activeThreats(s) > 0 || timedWord)) return;
    s.assist = TG.Util.approach(s.assist, s.assistTarget, C.ASSIST_RATE * dt);
  }

  function updateCamera(s) {
    var C = TG.C;
    if (!s.player) return;
    var target = Math.max(0, s.player.x - C.HERO_SCREEN_X);
    s.camera.x = Math.max(0, TG.Util.approach(s.camera.x, target, C.CAMERA_MAX_STEP));
  }

  // ---------------------------------------------------------------------------------------------
  // 5. Scoring, lives and power-ups
  // ---------------------------------------------------------------------------------------------

  function addScore(points, info) {
    var s = TG.Game.state;
    info = info || {};
    points = Math.round(Number(points) || 0);
    if (points <= 0) return;
    s.score += points;
    emit('score:add', {
      points: points, total: s.score, reason: info.reason || null,
      x: isNum(info.x) ? info.x : null, y: isNum(info.y) ? info.y : null
    });
    // Extra lives from score (DESIGN 8.5). A threshold passed at 9 lives is not stored for later.
    var every = s.config ? s.config.extraLifeEvery : 0;
    while (every > 0 && s.score >= s.nextLifeAt) {
      s.nextLifeAt += every;
      addLife('score');
    }
  }

  function addLife(cause) {
    var s = TG.Game.state;
    var p = s.player;
    if (!p || p.lives >= TG.C.MAX_LIVES) return false;
    p.lives++;
    emit('life:gain', { lives: p.lives, cause: cause });
    return true;
  }

  // Ink blast: clears every live threat at half score, without touching the streak or statistics.
  function inkBlast(s) {
    var C = TG.C;
    var list = s.entities.slice();
    var mult = s.typing.stats.mult;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.dead || e.type !== 'threat') continue;
      var def = TG.Entities.KINDS[e.kind];
      var points = TG.Util.round10(C.BLAST_FACTOR * C.PTS_WORD_PER_LETTER * e.word.length * mult * s.assist);
      TG.Entities.remove(s, e, 'blast');
      s.run.threatsCleared++;
      emit('word:clear', {
        id: e.id, type: e.type, kind: e.kind, family: def.family, from: e.from, word: e.word,
        x: e.x, y: e.y, w: e.w, h: e.h, score: points, mult: mult, clean: false, quick: false, close: false,
        cause: 'blast', power: null
      });
      addScore(points, { reason: 'blast', x: e.x, y: e.y });
    }
  }

  function applyPower(power, x, y) {
    var C = TG.C;
    var s = TG.Game.state;
    var pw = s.power;
    emit('pickup:power', { power: power, x: isNum(x) ? x : null, y: isNum(y) ? y : null });
    if (power === 'shield') {
      var before = pw.shield;
      pw.shield = Math.min(C.MAX_SHIELD, pw.shield + s.config.shieldHits);
      if (pw.shield > before) emit('shield:gain', { charges: pw.shield, cause: 'crate' });
    } else if (power === 'hourglass') {
      pw.slowT = C.HOURGLASS_TIME;
      s.slowScale = C.HOURGLASS_SCALE;
      pw.last = 'hourglass';
      emit('power:start', { power: 'hourglass', duration: C.HOURGLASS_TIME });
    } else if (power === 'quill') {
      pw.quillT = C.QUILL_TIME;
      pw.last = 'quill';
      emit('power:start', { power: 'quill', duration: C.QUILL_TIME });
    } else if (power === 'blast') {
      inkBlast(s);
    } else if (power === 'cap') {
      addLife('cap');
    }
  }

  // ---------------------------------------------------------------------------------------------
  // 6. The run result, endRun and snapshot
  // ---------------------------------------------------------------------------------------------

  // DESIGN 8.6. Two cases the table does not cover are decided here: a run in which no letter key was
  // pressed ranks C (its accuracy of 1 means nothing), and S and A need the level to be cleared, so a
  // run quit early from the pause menu cannot rank above B.
  function rankOf(summary, livesLost, continues, cleared) {
    if (summary.correct + summary.wrong === 0) return 'C';
    var accuracy = summary.accuracy;
    if (cleared && accuracy >= 0.97 && livesLost === 0 && continues === 0) return 'S';
    if (cleared && accuracy >= 0.93 && livesLost <= 2 && continues === 0) return 'A';
    if (accuracy >= 0.85) return 'B';
    return 'C';
  }

  // CONTRACT 5.11. End-of-level bonuses are added only for a cleared run.
  function buildResult(s, cleared) {
    var C = TG.C;
    var summary = TG.Typing.summary(s.typing);
    var baseScore = s.score;
    var lives = s.player ? s.player.lives : 0;
    var bonuses = [];
    if (cleared) {
      if (lives > 0) bonuses.push({ id: 'lives', label: 'LIVES X' + lives, points: lives * C.PTS_LIFE });
      var pct = Math.floor(summary.accuracy * 100);
      if (summary.accuracy >= 0.95) bonuses.push({ id: 'accuracy', label: 'ACCURACY ' + pct + '%', points: C.PTS_ACC95 });
      else if (summary.accuracy >= 0.90) bonuses.push({ id: 'accuracy', label: 'ACCURACY ' + pct + '%', points: C.PTS_ACC90 });
      if (s.run.continues === 0) bonuses.push({ id: 'nocontinue', label: 'NO CONTINUES', points: C.PTS_NOCONT });
    }
    var total = 0;
    for (var i = 0; i < bonuses.length; i++) total += bonuses[i].points;
    s.run.bonuses = bonuses;
    if (total > 0) {
      s.score += total;
      emit('score:add', { points: total, total: s.score, reason: 'bonus', x: null, y: null });
    }

    var suggestion = null;
    if (cleared && summary.accuracy >= 0.92) {
      if (s.difficulty === 'easy' && summary.wpm >= 25) suggestion = 'READY FOR MEDIUM?';
      else if (s.difficulty === 'medium' && summary.wpm >= 45) suggestion = 'READY FOR HARD?';
    }

    return {
      cleared: cleared,
      levelId: s.levelId,
      difficulty: s.difficulty,
      score: s.score,
      baseScore: baseScore,
      bonuses: bonuses,
      time: s.time,
      typing: summary,
      ink: s.inkTotal,
      livesLost: s.run.livesLost,
      lives: lives,
      continues: s.run.continues,
      rank: rankOf(summary, s.run.livesLost, s.run.continues, cleared),
      suggestion: suggestion,
      bestWpm: s.run.bestWpm,
      assist: s.assist,
      adaptive: s.adaptive
    };
  }

  function endRun() {
    var s = TG.Game.state;
    if (s.screen !== 'gameOver' && s.screen !== 'paused') return false;
    s.run.ended = true;
    s.result = buildResult(s, false);
    setScreen('results');
    emit('run:end', { result: s.result });
    return true;
  }

  function snapshot() {
    var s = TG.Game.state;
    var p = s.player;
    var stats = s.typing ? s.typing.stats : null;
    var entities = [];
    for (var i = 0; i < s.entities.length; i++) {
      var e = s.entities[i];
      if (e.dead) continue;
      entities.push({
        id: e.id, kind: e.kind, word: e.word || null, typed: e.typed || 0,
        eta: isNum(e.eta) ? e.eta : null
      });
    }
    return {
      screen: s.screen, time: s.time, frame: s.frame, section: s.section, score: s.score,
      lives: p ? p.lives : 0, shield: s.power.shield, continues: s.run.continues, livesLost: s.run.livesLost,
      damageTypable: s.run.damageTypable, damageOther: s.run.damageOther, assist: s.assist,
      playerX: p ? p.x : 0, entities: entities,
      bossHealth: s.boss ? s.boss.health : null, bossPhase: s.boss ? s.boss.phase : null,
      wpm: stats ? stats.wpm : 0, accuracy: stats ? stats.accuracy : 1
    };
  }

  function isSimScreen(name) {
    return TG.C.SIM_SCREENS.indexOf(name) !== -1;
  }

  function init() {
    TG.Game.state = emptyState();
    emit('screen:change', { from: null, to: 'boot', data: null });
    return TG.Game.state;
  }

  TG.Game = {
    state: emptyState(),
    init: init,
    newRun: newRun,
    step: step,
    isSimScreen: isSimScreen,
    canGo: canGo,
    setScreen: setScreen,
    pause: pause,
    resume: resume,
    continueRun: continueRun,
    endRun: endRun,
    addScore: addScore,
    addLife: addLife,
    applyPower: applyPower,
    snapshot: snapshot
  };
})(typeof window !== 'undefined' ? window : globalThis);
