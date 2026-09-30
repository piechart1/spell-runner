// js/boss.js
// SPELL RUNNER boss: Baron von Burrow (WP-E). Defines TG.Boss.
//
// Contract: docs/CONTRACT.md sections 4.15 and 5.7. Design: docs/DESIGN.md section 11.6.
//
// File layout:
//   1. helpers and constants
//   2. phases: phaseStartHealth, phaseForHealth, volley contents, attacks
//   3. create
//   4. entering a state (the "Does" column of the table in CONTRACT 5.7)
//   5. update: the round state machine, one branch per state
//   6. onWordComplete: weak-point hit and defeat
//
// A round (DESIGN 11.6): volley -> telegraph -> attack -> taunt -> recoil (word typed) or laugh (window
// ran out) -> the next volley. After a recoil the phase may change (transition) or health may reach 0
// (finisher). Completing the finisher word defeats the Baron (defeated, screen levelComplete).
//
// How the states hand over. Each state has entry actions, run by enter(). boss.entered holds the state
// whose entry actions have run; when boss.state differs from it, update() runs the entry for the new
// state first. This is how the end of the intro works: TG.Game (step 6, bossIntro timer) sets
// boss.state to 'volley' and the screen to 'boss', and the next update builds the first volley.
//
// Fairness rules, all on the world clock so that adaptive pacing and the Hourglass apply:
//   - Rocks and the minion are spawned with TG.Entities.spawn, so they get the same budget rules as
//     every threat of the level (queue, spacing), plus the cap on rocks in flight and the launch gap.
//   - Every physical attack is announced with boss:attack before it is spawned: the first by the
//     telegraph state (config.boss.telegraph), the second of a double attack at the moment the first is
//     spawned (config.boss.doubleGap before it appears).
//   - The weak-point window is exposeFactor x the base budget of its word, plus exposeBonus when every
//     entry of the volley was typed.
//
// Fields added to state.boss beyond CONTRACT 5.7 (read-only for other modules):
//   boss.introTime   s, real: BOSS_INTRO_TIME, or BOSS_INTRO_SHORT when the boss checkpoint has been
//                    continued from
//   boss.entered     the state whose entry actions have run (see above)
//   boss.thrown      the rock and minion entities of the current volley that are still live
//   boss.poseT       ws left of a short pose (throw after a launch, stomp or throw after an attack)
//   boss.attackT     ws since the last attack of the round was spawned
//   boss.retryT      ws until a launch or word pick that failed is tried again
//   boss.lastAttack  kind of the attack spawned last in this round ('shock' | 'pick' | null)
//
// This is a simulation module: no Math.random, no Date, no timers, no DOM. It talks to the outside
// only by changing the state and emitting events.
(function (root) {
  'use strict';
  var TG = root.TG = root.TG || {};

  // ---------------------------------------------------------------------------------------------
  // 1. Helpers and constants
  // ---------------------------------------------------------------------------------------------

  var RISE_HIDDEN = 40;      // boss.rise when the body is hidden behind the mound, px
  var THROW_POSE = 0.3;      // ws of the 'throw' pose after a launch (CONTRACT 5.7)
  var ATTACK_POSE = 0.3;     // ws of the 'stomp' or 'throw' pose after an attack is spawned
  var HIT_FLASH = 0.2;       // s of white flash after a weak-point hit (CONTRACT 5.7)
  var SINK_TIME = 1.0;       // s at the end of levelComplete in which the Baron sinks into his mound
  var WORD_ELEV = 32;        // the boss word's x, y is the Baron's head: this far above boss.y, px
  var EPS = 1e-9;

  function emit(name, payload) {
    if (TG.Events && TG.Events.emit) TG.Events.emit(name, payload);
  }

  function sum(list, count) {
    var total = 0;
    for (var i = 0; i < count && i < list.length; i++) total += list[i];
    return total;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function toWs(state, nominal) {
    return TG.Difficulty.toWs(state.config, nominal);
  }

  // Real seconds for a span of world seconds at the current time scale.
  function realOf(state, ws) {
    return ws / Math.max(state.timeScale || 0, 0.01);
  }

  function activeWords(state) {
    var list = TG.Entities.typables(state);
    var out = [];
    for (var i = 0; i < list.length; i++) out.push(list[i].word);
    return out;
  }

  function liveAttacks(state) {
    var n = 0;
    for (var i = 0; i < state.entities.length; i++) {
      var e = state.entities[i];
      if (!e.dead && e.type === 'attack') n++;
    }
    return n;
  }

  // Where rocks leave the Baron's raised arm: the start of the rock path (CONTRACT 3, ROCK_FROM_*).
  function armPoint(state) {
    var C = TG.C;
    return { x: state.player.x + C.ROCK_FROM_DX, y: C.GROUND_Y - C.ROCK_FROM_ELEV };
  }

  // Adaptive pacing bookkeeping (DESIGN 9.3): a weak-point word counts like a threat word, with its
  // window use u, or U_MISS when the window ran out.
  function noteAdapt(state, u, word) {
    var a = state.adapt;
    if (!a) return;
    a.n++;
    a.uSum += u;
    a.correct += word.typed || 0;
    a.wrong += word.errors || 0;
  }

  // ---------------------------------------------------------------------------------------------
  // 2. Phases
  // ---------------------------------------------------------------------------------------------

  // Health at the start of a phase: the health minus the weak-point words of the earlier phases.
  function phaseStartHealth(config, phase) {
    var b = config.boss;
    var p = Math.max(1, Math.min(3, Math.floor(phase) || 1));
    return b.health - sum(b.coreWords, p - 1);
  }

  // The phase whose health range contains `health` (DESIGN 11.6). Health 0 counts as phase 3.
  function phaseForHealth(config, health) {
    var b = config.boss;
    if (health > b.health - sum(b.coreWords, 1)) return 1;
    if (health > b.health - sum(b.coreWords, 2)) return 2;
    return 3;
  }

  // Volley contents (CONTRACT 5.7): phase 1 all rocks; from phase 2 the second entry is a high rock;
  // in phase 3 with config.boss.minion the last entry is a Digby minion.
  function volleyFor(config, phase) {
    var n = Math.max(1, config.boss.rocks[phase - 1] || 1);
    var list = [];
    for (var i = 0; i < n; i++) list.push('rock');
    if (phase >= 2 && n >= 2) list[1] = 'rockhigh';
    if (phase === 3 && config.boss.minion) list[n - 1] = 'minion';
    return list;
  }

  // Attacks of a round (CONTRACT 5.7): phase 1 a shockwave; phase 2 one attack, alternating between
  // rounds; phase 3 shockwave then pickaxe with config.boss.doubleAttack, otherwise alternating.
  function attacksFor(boss, config) {
    if (boss.phase <= 1) return ['shock'];
    if (boss.phase >= 3 && config.boss.doubleAttack) return ['shock', 'pick'];
    var kind = boss.nextAttack === 'pick' ? 'pick' : 'shock';
    boss.nextAttack = kind === 'shock' ? 'pick' : 'shock';
    return [kind];
  }

  // ---------------------------------------------------------------------------------------------
  // 3. create
  // ---------------------------------------------------------------------------------------------

  function create(state) {
    var C = TG.C;
    var config = state.config;
    var cp = state.checkpoint || {};
    var phase = Math.max(1, Math.min(3, cp.bossPhase || 1));
    var health = phaseStartHealth(config, phase);
    var boss = {
      kind: (state.level && state.level.boss && state.level.boss.kind) || 'baron',
      x: state.player.x + C.BOSS_DX,
      y: C.GROUND_Y,
      w: 48, h: 48,
      state: 'intro',
      stateT: 0,
      phase: phase,
      round: 0,
      health: health,
      maxHealth: config.boss.health,
      volley: { toLaunch: [], launched: 0, sinceLaunch: 0, hits: 0 },
      attacks: [],
      // Phase 2 opens with the pickaxe, the attack the player has not seen yet, so that every phase
      // shows something new even when each of its weak-point words is typed at the first attempt.
      nextAttack: phase === 2 ? 'pick' : 'shock',
      word: null,
      windowWs: 0,
      pose: 'idle',
      rise: RISE_HIDDEN,
      lampRed: phase >= 2,
      flashT: 0,
      // added fields (see the file header)
      introTime: (cp.continuesHere || 0) > 0 ? C.BOSS_INTRO_SHORT : C.BOSS_INTRO_TIME,
      entered: 'intro',
      thrown: [],
      poseT: 0,
      attackT: 0,
      retryT: 0,
      lastAttack: null
    };
    state.boss = boss;
    emit('boss:state', { state: boss.state, phase: boss.phase, round: boss.round });
    return boss;
  }

  // ---------------------------------------------------------------------------------------------
  // 4. Entering a state
  // ---------------------------------------------------------------------------------------------

  function enter(state, boss, name) {
    boss.state = name;
    boss.stateT = 0;
    boss.entered = name;
    boss.poseT = 0;
    boss.retryT = 0;
    var config = state.config;

    switch (name) {
      case 'volley':
        boss.round++;
        // sinceLaunch starts at the launch gap, so that the first entry is thrown at once.
        boss.volley = {
          toLaunch: volleyFor(config, boss.phase), launched: 0,
          sinceLaunch: toWs(state, config.boss.launchGap[boss.phase - 1]), hits: 0
        };
        boss.thrown = [];
        boss.attacks = [];
        boss.lastAttack = null;
        boss.pose = 'idle';
        boss.rise = 0;
        break;

      case 'telegraph':
        boss.pose = 'raise';
        boss.attacks = attacksFor(boss, config);
        break;

      case 'attack':
        boss.attackT = 0;
        break;

      case 'taunt':
        boss.pose = 'laugh';
        boss.word = null;
        boss.windowWs = 0;
        break;

      case 'recoil':
        boss.pose = 'hurt';
        boss.flashT = HIT_FLASH;
        break;

      case 'laugh':
        boss.pose = 'laugh';
        break;

      case 'transition':
        boss.phase = Math.min(3, boss.phase + 1);
        boss.round = 0;
        boss.lampRed = true;
        boss.pose = 'stomp';
        if (boss.phase === 2) boss.nextAttack = 'pick';
        if (state.checkpoint) state.checkpoint.bossPhase = boss.phase;
        break;

      case 'finisher':
        boss.pose = 'dizzy';
        boss.word = null;
        TG.Entities.clearAll(state, 'flee');
        state.finisherScale = TG.C.FINISHER_SCALE;
        break;

      case 'defeated':
        boss.pose = 'dizzy';
        boss.rise = 0;
        break;
    }

    emit('boss:state', { state: boss.state, phase: boss.phase, round: boss.round });

    // Actions that follow the boss:state event.
    if (name === 'telegraph') {
      emit('boss:attack', { kind: boss.attacks[0], telegraph: realOf(state, toWs(state, config.boss.telegraph)) });
    } else if (name === 'attack') {
      spawnNextAttack(state, boss);
    } else if (name === 'taunt') {
      openWeakPoint(state, boss);
    } else if (name === 'transition') {
      emit('boss:phase', { phase: boss.phase });
    } else if (name === 'finisher') {
      openFinisher(state, boss);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // 5. update
  // ---------------------------------------------------------------------------------------------

  // Drops volley entities that have been removed; counts the ones that were typed.
  function pruneThrown(boss) {
    var kept = [];
    for (var i = 0; i < boss.thrown.length; i++) {
      var e = boss.thrown[i];
      if (!e.dead) kept.push(e);
      else if (e.reason === 'cleared') boss.volley.hits++;
    }
    boss.thrown = kept;
  }

  function launch(state, boss) {
    var C = TG.C;
    var volley = boss.volley;
    var entry = volley.toLaunch[volley.launched];
    var spec = entry === 'minion'
      ? { kind: 'digby', section: 3 }
      : { kind: 'rock', from: entry === 'rockhigh' ? 'above' : 'right', section: 3 };
    var e = TG.Entities.spawn(state, spec);
    if (!e) {
      boss.retryT = C.SPAWN_RETRY;
      return;
    }
    volley.launched++;
    volley.sinceLaunch = 0;
    boss.thrown.push(e);
    boss.pose = 'throw';
    boss.poseT = THROW_POSE;
    var arm = armPoint(state);
    emit('boss:attack', { kind: entry, telegraph: 0 });
    emit('boss:throw', { kind: entry, x: arm.x, y: arm.y });
  }

  function updateVolley(state, boss, wdt) {
    var config = state.config;
    var volley = boss.volley;
    pruneThrown(boss);
    volley.sinceLaunch += wdt;
    if (boss.retryT > 0) boss.retryT = Math.max(0, boss.retryT - wdt);

    var gap = toWs(state, config.boss.launchGap[boss.phase - 1]);
    if (volley.launched < volley.toLaunch.length && boss.thrown.length < config.boss.inFlight &&
        volley.sinceLaunch + EPS >= gap && boss.retryT <= EPS) {
      launch(state, boss);
    }

    if (boss.poseT <= EPS && boss.pose === 'throw') boss.pose = 'idle';
    if (volley.launched >= volley.toLaunch.length && boss.thrown.length === 0) enter(state, boss, 'telegraph');
  }

  function spawnNextAttack(state, boss) {
    var config = state.config;
    var kind = boss.attacks.shift();
    if (!kind) return;
    TG.Entities.spawnAttack(state, kind);
    if (kind === 'pick') {
      var arm = armPoint(state);
      emit('boss:throw', { kind: 'pick', x: arm.x, y: arm.y });
    }
    boss.lastAttack = kind;
    boss.pose = kind === 'shock' ? 'stomp' : 'throw';
    boss.poseT = ATTACK_POSE;
    boss.attackT = 0;
    // The next attack of a double attack is announced now, doubleGap before it appears.
    if (boss.attacks.length > 0) {
      emit('boss:attack', { kind: boss.attacks[0], telegraph: realOf(state, toWs(state, config.boss.doubleGap)) });
    }
  }

  function updateAttack(state, boss, wdt) {
    var config = state.config;
    boss.attackT += wdt;
    if (boss.attacks.length > 0 && boss.attackT + EPS >= toWs(state, config.boss.doubleGap)) {
      spawnNextAttack(state, boss);
    } else if (boss.poseT <= EPS && boss.attacks.length > 0) {
      boss.pose = 'raise';          // the arm goes up again for the second attack of a double
    }
    if (boss.attacks.length === 0 && liveAttacks(state) === 0) enter(state, boss, 'taunt');
  }

  // Taunt: a weak-point word on the boss plate. The window is exposeFactor x the base budget of the
  // word, plus exposeBonus (nominal s) when every entry of the volley was typed (DESIGN 11.6).
  function openWeakPoint(state, boss) {
    var config = state.config;
    var b = config.boss;
    var word = state.picker.pick({ tier: 'boss', minLen: b.coreLen[0], maxLen: b.coreLen[1], active: activeWords(state) });
    if (!word) {
      boss.retryT = TG.C.SPAWN_RETRY;
      return;
    }
    var allTyped = boss.volley.toLaunch.length > 0 && boss.volley.hits >= boss.volley.toLaunch.length;
    var nominal = b.exposeFactor * TG.Difficulty.budget(config, word.length) + (allTyped ? b.exposeBonus : 0);
    boss.windowWs = toWs(state, nominal);
    boss.stateT = 0;
    boss.word = makeWord(state, boss, 'core', word, realOf(state, boss.windowWs));
    emit('boss:weakopen', { id: boss.word.id, word: word, window: realOf(state, boss.windowWs) });
  }

  function openFinisher(state, boss) {
    var b = state.config.boss;
    var word = state.picker.pick({ tier: 'finisher', minLen: b.finisherLen[0], maxLen: b.finisherLen[1], active: activeWords(state) });
    if (!word) {
      boss.retryT = TG.C.SPAWN_RETRY;
      return;
    }
    boss.word = makeWord(state, boss, 'finisher', word, Infinity);
    emit('boss:finisher', { id: boss.word.id, word: word });
  }

  // A typable of kind 'core' or 'finisher' (CONTRACT 5.3). Its x, y is the Baron's head, where the ink
  // bolt of a completed word goes.
  function makeWord(state, boss, kind, word, eta) {
    return {
      id: state.nextId++,
      kind: kind,
      word: word,
      typable: true,
      priority: 0,
      eta: eta,
      x: boss.x,
      y: boss.y - WORD_ELEV,
      shownAt: state.time,
      lost: false,
      typed: 0,
      errors: 0,
      firstKeyAt: null,
      lastKeyAt: null,
      bestTyped: 0
    };
  }

  function updateTaunt(state, boss, wdt) {
    if (!boss.word) {
      // The pick failed (not expected: nothing else is typable during a taunt). Try again.
      boss.retryT = Math.max(0, boss.retryT - wdt);
      if (boss.retryT <= EPS) openWeakPoint(state, boss);
      return;
    }
    var w = boss.word;
    w.x = boss.x;
    w.y = boss.y - WORD_ELEV;
    w.eta = realOf(state, Math.max(0, boss.windowWs - boss.stateT));
    if (boss.stateT + EPS < boss.windowWs) return;

    // The window ran out: he laughs and the next round begins. No life is lost.
    w.lost = true;
    w.typable = false;
    boss.word = null;
    noteAdapt(state, TG.C.U_MISS, w);
    if (state.typing) TG.Typing.onMissed(state.typing, w);
    emit('boss:weakclose', { completed: false });
    enter(state, boss, 'laugh');
  }

  function updateFinisher(state, boss, wdt) {
    if (!boss.word) {
      boss.retryT = Math.max(0, boss.retryT - wdt);
      if (boss.retryT <= EPS) openFinisher(state, boss);
      return;
    }
    boss.word.x = boss.x;
    boss.word.y = boss.y - WORD_ELEV;
    boss.word.eta = Infinity;
  }

  function update(state, wdt, dt) {
    var C = TG.C;
    var boss = state.boss;
    if (!boss || !state.player) return;
    boss.x = state.player.x + C.BOSS_DX;
    if (boss.flashT > 0) boss.flashT = Math.max(0, boss.flashT - dt);

    if (boss.state === 'intro') {
      // Intro (DESIGN 11.6): he rises out of his mound in the first half and laughs in the second.
      // Real seconds; the end of the intro is TG.Game's bossIntro timer.
      boss.stateT += dt;
      var half = boss.introTime / 2;
      boss.rise = RISE_HIDDEN * Math.max(0, 1 - boss.stateT / half);
      boss.pose = boss.stateT >= half ? 'laugh' : 'idle';
      return;
    }

    if (boss.state === 'defeated') {
      // levelComplete: dizzy, then he sinks into his mound in the last SINK_TIME s of the screen.
      var left = C.LEVEL_COMPLETE_TIME - (state.screenT || 0);
      boss.rise = RISE_HIDDEN * clamp((SINK_TIME - left) / SINK_TIME, 0, 1);
      boss.pose = 'dizzy';
      boss.stateT += wdt;
      return;
    }

    if (boss.entered !== boss.state) enter(state, boss, boss.state);

    boss.stateT += wdt;
    if (boss.poseT > 0) boss.poseT = Math.max(0, boss.poseT - wdt);

    switch (boss.state) {
      case 'volley':
        updateVolley(state, boss, wdt);
        break;
      case 'telegraph':
        if (boss.stateT + EPS >= toWs(state, state.config.boss.telegraph)) enter(state, boss, 'attack');
        break;
      case 'attack':
        updateAttack(state, boss, wdt);
        break;
      case 'taunt':
        updateTaunt(state, boss, wdt);
        break;
      case 'recoil':
        if (boss.stateT + EPS < C.BOSS_RECOIL) break;
        if (boss.health <= 0) enter(state, boss, 'finisher');
        else if (phaseForHealth(state.config, boss.health) > boss.phase) enter(state, boss, 'transition');
        else enter(state, boss, 'volley');
        break;
      case 'laugh':
        if (boss.stateT + EPS >= C.BOSS_LAUGH) enter(state, boss, 'volley');
        break;
      case 'transition':
        if (boss.stateT + EPS < C.BOSS_PHASE_TIME) break;
        // A phase with no weak-point words (possible only through tuning) is passed through at once.
        if (phaseForHealth(state.config, boss.health) > boss.phase) enter(state, boss, 'transition');
        else enter(state, boss, 'volley');
        break;
      case 'finisher':
        updateFinisher(state, boss, wdt);
        break;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // 6. onWordComplete
  // ---------------------------------------------------------------------------------------------

  // Called by TG.Game when state.boss.word is completed (weak point or finisher).
  function onWordComplete(state, word) {
    var C = TG.C;
    var boss = state.boss;
    if (!boss || !word || boss.word !== word) return;
    word.typable = false;
    boss.word = null;

    if (word.kind === 'core' && boss.state === 'taunt') {
      noteAdapt(state, boss.windowWs > 0 ? Math.min(1, boss.stateT / boss.windowWs) : 1, word);
      boss.health = Math.max(0, boss.health - 1);
      enter(state, boss, 'recoil');
      emit('boss:hit', { health: boss.health, maxHealth: boss.maxHealth, phase: boss.phase, x: boss.x, y: boss.y - WORD_ELEV });
      emit('boss:weakclose', { completed: true });
      TG.Game.addScore(TG.Util.round10(C.PTS_CORE * state.assist), { reason: 'core', x: boss.x, y: boss.y - WORD_ELEV });
      return;
    }

    if (word.kind === 'finisher' && boss.state === 'finisher') {
      state.finisherScale = 1;
      state.run.cleared = true;
      enter(state, boss, 'defeated');
      TG.Game.addScore(state.config.boss.finisherBonus, { reason: 'finisher', x: boss.x, y: boss.y - WORD_ELEV });
      TG.Game.addScore(C.PTS_BOSS, { reason: 'boss', x: boss.x, y: boss.y - WORD_ELEV });
      emit('boss:defeat', { x: boss.x, y: boss.y });
      TG.Game.setScreen('levelComplete');
    }
  }

  TG.Boss = {
    create: create,
    update: update,
    onWordComplete: onWordComplete,
    phaseStartHealth: phaseStartHealth,
    phaseForHealth: phaseForHealth
  };
})(typeof window !== 'undefined' ? window : globalThis);
