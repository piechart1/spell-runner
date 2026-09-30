// js/entities.js
// SPELL RUNNER entities (WP-E). Defines TG.Entities.
//
// Contract: docs/CONTRACT.md sections 4.13, 5.2 to 5.8, 5.14 and 11. Design: docs/DESIGN.md sections
// 3.2, 4, 5 and 7.
//
// File layout:
//   1. helpers and the KINDS table
//   2. the player: createPlayer, pressJump, pressDuck, releaseDuck, updatePlayer, playerBox
//   3. spawning: word, budget (DESIGN 4.1) and start position
//   4. movement paths (DESIGN 4.3)
//   5. update: clocks, contact, attacks, hazards, ink drops
//   6. removal and damage
//   7. queries: typables, activeThreats, hitbox, nextAction
//
// Fields added beyond CONTRACT 5.2 and 5.5 (read-only for other modules):
//   player.jumpX         x at take-off; during a jump arc x = jumpX + RUN_SPEED * jumpT
//   player.duckBufferT   ws left in which a duck pressed in the air still starts a slide on landing
//   player.fallen        the fall has reached FALL_COMMIT and cost its life; cleared by the rescue
//   threat.contact       HERO_W / 2 + (w - 2 * INSET) / 2, px
//   threat.closing       closing speed towards Pip, px/ws (dawdle, hoppet, buzzle, truffle); 0 otherwise
//   threat.anchorX       boulder only: its fixed world x; 0 otherwise
//   threat.entered       the sprite has intersected the playfield (threat:enter is emitted once)
//   threat.urgentSent    threat:urgent has been emitted
//   threat.bestTyped     the most letters of the word ever typed; written by TG.Game, which pays letter
//                        points and the letter stall only for letters beyond it (also on boss words)
//   attack.dx            distance ahead of Pip, px
//
// This is a simulation module: no Math.random, no Date, no timers, no DOM. It talks to the outside
// only by changing the state and emitting events.
(function (root) {
  'use strict';
  var TG = root.TG = root.TG || {};

  // ---------------------------------------------------------------------------------------------
  // 1. Helpers and the KINDS table (CONTRACT 5.4)
  // ---------------------------------------------------------------------------------------------

  var KINDS = TG.Util.deepFreeze({
    //         type       from      sprite box   sprite           sound family      letter stall
    boulder: { type: 'threat', from: 'right',  w: 24, h: 32, sprite: 'en_boulder',    family: 'crunch', stall: false },
    dawdle:  { type: 'threat', from: 'right',  w: 16, h: 16, sprite: 'en_dawdle',     family: 'twang',  stall: true  },
    hoppet:  { type: 'threat', from: 'right',  w: 16, h: 16, sprite: 'en_hoppet',     family: 'pop',    stall: true  },
    buzzle:  { type: 'threat', from: 'right',  w: 16, h: 16, sprite: 'en_buzzle',     family: 'pop',    stall: true  },
    swoop:   { type: 'threat', from: 'above',  w: 24, h: 16, sprite: 'en_swoop',      family: 'crunch', stall: true  },
    truffle: { type: 'threat', from: 'behind', w: 24, h: 16, sprite: 'en_truffle',    family: 'bonk',   stall: true  },
    digby:   { type: 'threat', from: 'below',  w: 16, h: 16, sprite: 'en_digby',      family: 'bonk',   stall: true  },
    rock:    { type: 'threat', from: 'right',  w: 12, h: 12, sprite: 'pr_rock',       family: 'pop',    stall: true  },  // from is 'above' for a high rock
    crate:   { type: 'crate',  from: 'right',  w: 16, h: 32, sprite: 'crate_balloon', family: 'pop',    stall: false },
    shock:   { type: 'attack', from: 'right',  w: 16, h: 8,  sprite: 'pr_shock',      action: 'jump', elev: 0 },
    pick:    { type: 'attack', from: 'right',  w: 16, h: 16, sprite: 'pr_pickaxe',    action: 'duck', elev: 14 }
  });

  // Creatures that wait at the right edge (DESIGN 4.3 "Waiting at the edge").
  var RIGHT_WAITERS = { dawdle: true, hoppet: true, buzzle: true };

  var CRATE_BOB_HZ = 0.5;        // crate bob cycles per world second (presentation only)
  var HIGH_ROCK_ELEV = 200;      // a high rock leaves through the top of the screen at this elevation
  var ATTACK_START_BEHIND = 24;  // an attack starts this far in front of the Baron's centre
  var ATTACK_GONE = 32;          // an attack is removed this far behind the left screen edge
  var EPS = 1e-9;

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function emit(name, payload) {
    if (TG.Events && TG.Events.emit) TG.Events.emit(name, payload);
  }

  function isTypableEntity(e) {
    return !e.dead && (e.type === 'threat' || e.type === 'crate');
  }

  // Remaining time of a threat or crate in world seconds; the letter stall still to come is included.
  function remainingWs(e) {
    return e.budget - e.age + e.stallT;
  }

  // ---------------------------------------------------------------------------------------------
  // 2. The player (CONTRACT 5.2)
  // ---------------------------------------------------------------------------------------------

  function createPlayer(config, x) {
    var C = TG.C;
    return {
      x: isNum(x) ? x : C.HERO_SCREEN_X,
      y: C.GROUND_Y,
      vy: 0,
      state: 'run',
      onGround: true,
      jumpT: -1,
      coyoteT: 0,
      bufferT: 0,
      slideT: 0,
      duckHeld: false,
      lives: config.lives,
      invulnT: 0,
      animT: 0,
      hurtT: 0,
      lastGapId: null,
      jumpX: 0,
      duckBufferT: 0,
      fallen: false
    };
  }

  function playerBox(player) {
    var C = TG.C;
    if (player.state === 'slide') {
      return { x: player.x - C.SLIDE_W / 2, y: player.y - C.SLIDE_H, w: C.SLIDE_W, h: C.SLIDE_H };
    }
    return { x: player.x - C.HERO_W / 2, y: player.y - C.HERO_H, w: C.HERO_W, h: C.HERO_H };
  }

  function canAct(p) {
    return p.state !== 'fall' && p.state !== 'rescue';
  }

  function pressJump(state) {
    var p = state.player;
    if (!p || !canAct(p)) return;
    p.bufferT = TG.C.JUMP_BUFFER;
  }

  function startSlide(state) {
    var p = state.player;
    p.state = 'slide';
    p.slideT = TG.C.SLIDE_TIME;
    p.duckBufferT = 0;
    emit('hero:duck', { x: p.x, y: p.y });
  }

  // Starts or restarts a slide on the ground. In the air the press is remembered for the landing.
  function pressDuck(state) {
    var p = state.player;
    if (!p) return;
    p.duckHeld = true;
    if (!canAct(p)) return;
    if (p.jumpT >= 0) {
      p.duckBufferT = TG.C.JUMP_BUFFER;
      return;
    }
    startSlide(state);
  }

  function releaseDuck(state) {
    if (state.player) state.player.duckHeld = false;
  }

  function startJump(state) {
    var p = state.player;
    p.jumpT = 0;
    p.jumpX = p.x;
    p.state = 'jump';
    p.onGround = false;
    p.coyoteT = 0;
    p.bufferT = 0;
    p.slideT = 0;
    p.duckBufferT = 0;
    emit('hero:jump', { x: p.x, y: p.y });
  }

  // Running test (states run and slide): the rear end or the centre of the foot box is on ground.
  function runningSupported(level, x) {
    var half = TG.C.FOOT_W / 2;
    return TG.Level.isGround(level, x - half) || TG.Level.isGround(level, x);
  }

  // Landing test (end of a jump arc): the rear end, the centre or the front end is on ground.
  function landingSupported(level, x) {
    var half = TG.C.FOOT_W / 2;
    return TG.Level.isGround(level, x - half) || TG.Level.isGround(level, x) || TG.Level.isGround(level, x + half);
  }

  function findHazard(level, id) {
    if (!level || id === null || id === undefined) return null;
    for (var i = 0; i < level.hazards.length; i++) {
      if (level.hazards[i].id === id) return level.hazards[i];
    }
    return null;
  }

  // Committed fall: from here on Pip does not move forward and cannot jump.
  function commitFall(state, vy) {
    var p = state.player;
    var level = state.level;
    var half = TG.C.FOOT_W / 2;
    var gap = TG.Level.gapAt(level, p.x) || TG.Level.gapAt(level, p.x - half) || TG.Level.gapAt(level, p.x + half);
    p.state = 'fall';
    p.onGround = false;
    p.jumpT = -1;
    p.coyoteT = 0;
    p.bufferT = 0;
    p.duckBufferT = 0;
    p.slideT = 0;
    p.vy = vy;
    p.fallen = false;
    p.lastGapId = gap ? gap.id : null;
    emit('hero:fall', { x: p.x, gapId: p.lastGapId });
  }

  // Falling: gravity until the feet are FALL_COMMIT below the ground, then the life is lost.
  // The rescue (DESIGN 5 "Falling into a crevasse") is carried out by TG.Game when the lifeLost pause ends.
  function updateFall(state, wdt) {
    var C = TG.C;
    var p = state.player;
    p.vy += C.GRAVITY * wdt;
    p.y += p.vy * wdt;
    var limit = C.GROUND_Y + C.FALL_COMMIT;
    if (p.y < limit) return;
    p.y = limit;
    p.vy = 0;
    if (p.fallen) return;
    p.fallen = true;

    // Repeat falls: a plank bridge after config.bridgeAfterFalls falls at the same gap (0 = never).
    var gap = findHazard(state.level, p.lastGapId);
    if (gap) {
      gap.falls++;
      var after = state.config.bridgeAfterFalls;
      if (after > 0 && gap.falls >= after && !gap.bridged) {
        gap.bridged = true;
        emit('hazard:bridge', { id: gap.id, x: gap.x, w: gap.w });
      }
    }
    damage(state, { type: 'fall', kind: 'gap', id: p.lastGapId, from: null });
  }

  function updatePlayer(state, wdt, dt) {
    var C = TG.C;
    var p = state.player;
    if (!p) return;

    // Real-time timers.
    if (dt > 0) {
      p.invulnT = Math.max(0, p.invulnT - dt);
      p.hurtT = Math.max(0, p.hurtT - dt);
    }
    if (!(wdt > 0)) return;              // the world is stopped (lifeLost)
    p.animT += wdt;

    // The rescue bubble is shown until the world moves again.
    if (p.state === 'rescue') {
      p.state = 'run';
      p.lastGapId = null;
    }

    if (p.state === 'fall') {
      updateFall(state, wdt);
      return;
    }

    // Jump input: a buffered press starts a jump from the ground or within the coyote time.
    if (p.bufferT > 0 && p.jumpT < 0 && (p.onGround || p.coyoteT > 0)) startJump(state);
    p.bufferT = Math.max(0, p.bufferT - wdt);
    p.duckBufferT = Math.max(0, p.duckBufferT - wdt);

    if (p.jumpT >= 0) {
      // Jump arc, closed form (CONTRACT 5.2). The horizontal position is a closed form as well, so
      // that floating-point sums cannot make a jump shorter than JUMP_DIST.
      p.jumpT += wdt;
      p.x = p.jumpX + C.RUN_SPEED * p.jumpT;
      var s = p.jumpT / C.JUMP_TIME;
      if (s < 1) {
        p.y = C.GROUND_Y - 4 * C.JUMP_HEIGHT * s * (1 - s);
        return;
      }
      p.y = C.GROUND_Y;
      p.jumpT = -1;
      if (!landingSupported(state.level, p.x)) {
        commitFall(state, 4 * C.JUMP_HEIGHT / C.JUMP_TIME);
        return;
      }
      p.onGround = true;
      p.coyoteT = 0;
      p.state = 'run';
      emit('hero:land', { x: p.x, y: p.y });
      if (p.duckHeld || p.duckBufferT > 0) startSlide(state);
      return;
    }

    // Running or sliding: the running test and the coyote time.
    p.x += C.RUN_SPEED * wdt;
    if (runningSupported(state.level, p.x)) {
      p.onGround = true;
      p.coyoteT = 0;
    } else if (p.onGround) {
      p.onGround = false;
      p.coyoteT = C.COYOTE;
    } else {
      p.coyoteT -= wdt;
      if (p.coyoteT <= EPS) {
        p.coyoteT = 0;
        commitFall(state, 0);
        return;
      }
    }

    if (p.state === 'slide') {
      p.slideT = Math.max(0, p.slideT - wdt);
      if (p.slideT <= EPS && !p.duckHeld) {
        p.slideT = 0;
        p.state = 'run';
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // 3. Spawning (CONTRACT 5.5, DESIGN 4.1)
  // ---------------------------------------------------------------------------------------------

  function contactOf(def) {
    var C = TG.C;
    return C.HERO_W / 2 + (def.w - 2 * C.INSET) / 2;
  }

  function activeWords(state) {
    var list = typables(state);
    var out = [];
    for (var i = 0; i < list.length; i++) out.push(list[i].word);
    return out;
  }

  // Hazard keep-clear (rule 3): moves the arrival point past every zone it falls in.
  function keepClear(state, budgetWs) {
    var C = TG.C;
    var config = state.config;
    var p = state.player;
    var hazards = state.level ? state.level.hazards : [];
    var m = config.hazardMargin * config.pace * C.RUN_SPEED;
    var impactX = p.x + C.RUN_SPEED * budgetWs;
    for (var pass = 0; pass < 64; pass++) {
      var moved = false;
      for (var i = 0; i < hazards.length; i++) {
        var h = hazards[i];
        if (h.bridged) continue;
        var zoneStart = h.winStart - m;
        var zoneEnd = h.x + h.w + m;
        if (impactX >= zoneStart && impactX < zoneEnd) {
          impactX = zoneEnd;
          moved = true;
        }
      }
      if (!moved) break;
    }
    return (impactX - p.x) / C.RUN_SPEED;
  }

  // The budget of a new word in world seconds (CONTRACT 5.5 steps 2 to 7).
  function budgetFor(state, kind, len, spec) {
    var C = TG.C;
    var config = state.config;
    var def = KINDS[kind];
    var react = config.react;
    var perChar = config.perChar;

    var base = react + perChar * len;
    if (spec.intro || spec.tutorial) base *= C.INTRO_FACTOR;
    if (def.type === 'crate') base *= C.CRATE_FACTOR;

    // Queue and spacing rules over the live threats and crates that still have letters to type.
    var A = 0, R = 0, latest = 0;
    for (var i = 0; i < state.entities.length; i++) {
      var e = state.entities[i];
      if (!isTypableEntity(e) || !e.typable) continue;
      var left = e.word.length - e.typed;
      if (left <= 0) continue;
      A++;
      R += left;
      var rem = remainingWs(e) / config.pace;
      if (rem > latest) latest = rem;
    }
    var queue = react + perChar * (R + len) + 0.4 * react * A;
    var spacing = A > 0 ? latest + config.impactGap : 0;

    var budget = Math.max(base, queue, spacing);
    if (kind === 'boulder') budget = Math.max(budget, C.BOULDER_MIN_BUDGET / config.pace);
    var budgetWs = budget * config.pace;
    if (def.type === 'threat') budgetWs = keepClear(state, budgetWs);
    return budgetWs;
  }

  function spawn(state, spec) {
    var C = TG.C;
    var config = state.config;
    var p = state.player;
    if (!spec || !hasOwn(KINDS, spec.kind) || !p) return null;
    var kind = spec.kind;
    var def = KINDS[kind];
    if (def.type !== 'threat' && def.type !== 'crate') return null;
    var isCrate = def.type === 'crate';

    // The cap on active threats, for the section Pip is in. Crates do not count and are not capped.
    if (!isCrate) {
      var caps = config.maxActive;
      var cap = caps[Math.min(Math.max(0, state.section), caps.length - 1)];
      if (activeThreats(state) >= cap) return null;
    }

    // Word: length range and tier mix of the section the entry belongs to.
    var section = isNum(spec.section) ? spec.section : state.section;
    var range = TG.Difficulty.wordRange(config, kind, section);
    var req = {
      tierMix: TG.Difficulty.tierMix(config, section),
      minLen: range[0],
      maxLen: range[1],
      active: activeWords(state)
    };
    if (config.weakWeighting && state.typing && state.typing.stats.wordsCleared >= 20) {
      req.weak = TG.Typing.weakLetters(state.typing, 2);
    }
    var word = state.picker.pick(req);
    if (!word) return null;

    var budgetWs = budgetFor(state, kind, word.length, spec);
    var contact = contactOf(def);

    var closing = 0, holdSpan = 0, anchorX = 0;
    if (hasOwn(RIGHT_WAITERS, kind)) {
      closing = Math.max(C.RUN_SPEED + C.MIN_SPEED[kind], C.RIGHT_SPAN / budgetWs);
      var k = 0;
      for (var i = 0; i < state.entities.length; i++) {
        var o = state.entities[i];
        if (!o.dead && hasOwn(RIGHT_WAITERS, o.kind) && o.phase === 'hold') k++;
      }
      holdSpan = C.HOLD_SPAN - C.HOLD_STEP * k;
    } else if (kind === 'truffle') {
      closing = Math.max(C.TRUFFLE_MIN_CLOSING, C.TRUFFLE_SPAN / budgetWs);
      holdSpan = C.TRUFFLE_HOLD;
    } else if (kind === 'boulder') {
      anchorX = p.x + contact + C.RUN_SPEED * budgetWs;
    }

    var e = {
      // typable fields (CONTRACT 5.3)
      id: state.nextId++,
      kind: kind,
      word: word,
      typable: true,
      priority: isCrate ? 2 : 0,
      eta: 0,
      x: p.x, y: C.GROUND_Y,
      shownAt: state.time,
      lost: false,
      typed: 0,
      errors: 0,
      firstKeyAt: null,
      lastKeyAt: null,
      bestTyped: 0,
      // threat fields (CONTRACT 5.5)
      type: def.type,
      from: spec.from || def.from,
      w: def.w, h: def.h,
      elev: 0,
      budget: budgetWs,
      age: 0,
      t: 0,
      stallT: 0,
      holdSpan: holdSpan,
      harmful: !isCrate,
      onScreen: false,
      urgent: false,
      tutorial: spec.tutorial === true,
      intro: spec.intro === true,
      section: section,
      dead: false,
      reason: null,
      animT: 0,
      flipX: kind === 'truffle',
      phase: 'approach',
      // extras (see the file header)
      contact: contact,
      closing: closing,
      anchorX: anchorX,
      entered: false,
      urgentSent: false
    };
    if (isCrate) e.power = spec.power || null;

    state.entities.push(e);
    place(state, e);
    e.entered = e.onScreen;
    e.eta = etaOf(state, e);

    emit('threat:spawn', { entity: e, id: e.id, type: e.type, kind: e.kind, from: e.from, word: e.word });
    if (!isCrate && (e.from !== 'right' || !e.onScreen)) {
      emit('threat:warn', { id: e.id, kind: e.kind, from: e.from });
    }
    return e;
  }

  function spawnAttack(state, kind) {
    var C = TG.C;
    var def = KINDS[kind];
    if (!def || def.type !== 'attack') return null;
    var p = state.player;
    var bossX = state.boss ? state.boss.x : p.x + C.BOSS_DX;
    var x = bossX - ATTACK_START_BEHIND;
    var e = {
      id: state.nextId++, type: 'attack', kind: kind, action: def.action,
      x: x, y: C.GROUND_Y - def.elev, w: def.w, h: def.h, elev: def.elev,
      eta: 0, harmful: true, onScreen: true, dead: false, reason: null, animT: 0,
      dx: x - p.x
    };
    e.eta = attackEta(state, e);
    e.onScreen = isOnScreen(state, e);
    state.entities.push(e);
    emit('attack:spawn', { id: e.id, kind: e.kind, action: e.action });
    return e;
  }

  // ---------------------------------------------------------------------------------------------
  // 4. Movement paths (DESIGN 4.3, CONTRACT 5.5)
  // ---------------------------------------------------------------------------------------------

  // The sprite box intersects the playfield: the 384 px wide view, between PLAY_TOP and GROUND_Y.
  function isOnScreen(state, e) {
    var C = TG.C;
    var camX = state.camera ? state.camera.x : 0;
    return e.x + e.w / 2 > camX && e.x - e.w / 2 < camX + C.W && e.y > C.PLAY_TOP && e.y - e.h < C.GROUND_Y;
  }

  // Real seconds until impact at the current time scale; Infinity for an untimed typable.
  function etaOf(state, e) {
    return remainingWs(e) / Math.max(state.timeScale, 0.01);
  }

  function attackEta(state, e) {
    var C = TG.C;
    var gap = (e.x - e.w / 2 + C.INSET) - (state.player.x + C.HERO_W / 2);
    return gap / C.ATTACK_SPEED;
  }

  function easeIn(r) {
    return r * r;
  }

  // Sets x, y, elev, phase and onScreen of a threat or crate from its t.
  function place(state, e) {
    var C = TG.C;
    var p = state.player;
    var t = Math.min(Math.max(e.t, 0), 1);
    var B = e.budget;
    var dx = 0, elev = 0, dist, r;
    var phase = 'approach';
    var onScreen = null;         // null: decided by the sprite box

    switch (e.kind) {
      case 'boulder':
        dx = e.anchorX - p.x;
        break;

      case 'dawdle':
      case 'hoppet':
      case 'buzzle':
        dist = e.closing * B * (1 - t);
        dx = e.contact + Math.min(dist, e.holdSpan);
        phase = dist > e.holdSpan ? 'hold' : 'approach';
        if (e.kind === 'hoppet') {
          // Hops of HOP_LEN that end on Pip. It sits until the distance left is a whole number of
          // hops, so that the first hop starts on the ground.
          var hopFrom = Math.floor(Math.min(e.holdSpan, e.closing * B) / C.HOP_LEN) * C.HOP_LEN;
          if (dist < hopFrom) {
            var f = (dist / C.HOP_LEN) % 1;
            elev = 4 * C.HOP_HEIGHT * f * (1 - f);
          }
        } else if (e.kind === 'buzzle') {
          elev = C.BUZZLE_ELEV + C.BUZZLE_BOB * Math.sin(2 * Math.PI * C.BUZZLE_BOB_HZ * e.animT);
        }
        break;

      case 'truffle':
        dist = e.closing * B * (1 - t);
        dx = -(e.contact + Math.min(dist, e.holdSpan));
        phase = dist > e.holdSpan ? 'hold' : 'approach';
        break;

      case 'swoop':
        var startElev = C.GROUND_Y - C.PLAY_TOP + e.h;     // bottom of the sprite at the top of the screen
        if (t < C.SWOOP_ENTER_T) {
          r = t / C.SWOOP_ENTER_T;
          dx = C.SWOOP_HOVER_DX;
          elev = startElev + (C.SWOOP_HOVER_ELEV - startElev) * r;
          phase = 'enter';
        } else if (t < C.SWOOP_DIVE_T) {
          dx = C.SWOOP_HOVER_DX;
          elev = C.SWOOP_HOVER_ELEV;
          phase = 'hover';
        } else {
          r = easeIn((t - C.SWOOP_DIVE_T) / (1 - C.SWOOP_DIVE_T));
          dx = C.SWOOP_HOVER_DX * (1 - r);
          elev = C.SWOOP_HOVER_ELEV + (C.FLY_HIT_ELEV - C.SWOOP_HOVER_ELEV) * r;
          phase = 'dive';
        }
        break;

      case 'digby':
        if (t < C.DIGBY_POP_T) {
          dx = C.DIGBY_DX;
          elev = -C.DIGBY_DEPTH;
          phase = 'mound';
          onScreen = false;
        } else {
          r = (t - C.DIGBY_POP_T) / (1 - C.DIGBY_POP_T);
          dx = C.DIGBY_DX + (e.contact - C.DIGBY_DX) * r;
          elev = -C.DIGBY_DEPTH * (1 - r);
          phase = 'up';
          onScreen = true;
        }
        break;

      case 'rock':
        if (e.from === 'above') {
          // A high rock: up and out through the top, across above the screen, then straight down.
          if (t < 0.3) {
            r = t / 0.3;
            dx = C.ROCK_FROM_DX + (120 - C.ROCK_FROM_DX) * r;
            elev = C.ROCK_FROM_ELEV + (HIGH_ROCK_ELEV - C.ROCK_FROM_ELEV) * (1 - (1 - r) * (1 - r));
          } else if (t < 0.6) {
            r = (t - 0.3) / 0.3;
            dx = 120 * (1 - r);
            elev = HIGH_ROCK_ELEV;
          } else {
            r = easeIn((t - 0.6) / 0.4);
            dx = 0;
            elev = HIGH_ROCK_ELEV + (C.ROCK_TO_ELEV - HIGH_ROCK_ELEV) * r;
          }
        } else {
          dx = C.ROCK_FROM_DX * (1 - t);
          elev = C.ROCK_FROM_ELEV + (C.ROCK_TO_ELEV - C.ROCK_FROM_ELEV) * t + 4 * C.ROCK_ARC * t * (1 - t);
        }
        break;

      case 'crate':
        // From just inside the right edge to just past the left edge of the view.
        var fromDx = C.W - C.HERO_SCREEN_X - e.w / 2;
        var toDx = -C.HERO_SCREEN_X - e.w / 2;
        dx = fromDx + (toDx - fromDx) * t;
        elev = C.CRATE_ELEV + C.CRATE_BOB * Math.sin(2 * Math.PI * CRATE_BOB_HZ * e.animT);
        break;
    }

    e.x = e.kind === 'boulder' ? e.anchorX : p.x + dx;
    e.elev = elev;
    e.y = C.GROUND_Y - elev;
    e.phase = phase;
    if (e.kind === 'digby') e.harmful = phase === 'up';
    e.onScreen = onScreen === null ? isOnScreen(state, e) : onScreen;
  }

  // ---------------------------------------------------------------------------------------------
  // 5. update
  // ---------------------------------------------------------------------------------------------

  function updateTypable(state, e, wdt) {
    var C = TG.C;
    var p = state.player;
    e.animT += wdt;

    if (e.kind === 'boulder') {
      // Not a clock: t follows from the distance Pip still has to run.
      e.age = e.budget - (e.anchorX - p.x - e.contact) / C.RUN_SPEED;
    } else {
      var adv = wdt;
      if (e.stallT > 0) {
        var s = Math.min(e.stallT, adv);
        e.stallT -= s;
        if (e.stallT < EPS) e.stallT = 0;
        adv -= s;
      }
      e.age += adv;
    }
    e.t = e.budget > 0 ? e.age / e.budget : 1;
    place(state, e);

    if (!e.entered && e.onScreen) {
      e.entered = true;
      if (e.type === 'threat') emit('threat:enter', { id: e.id, kind: e.kind, from: e.from });
    }

    e.eta = etaOf(state, e);
    if (e.type === 'threat') {
      e.urgent = e.eta < state.config.urgentTime;
      if (e.urgent && !e.urgentSent) {
        e.urgentSent = true;
        emit('threat:urgent', { id: e.id, kind: e.kind });
      }
    }

    if (e.t < 1) return;

    // Contact by the clock (CONTRACT 4.13). A crate never makes contact: it has drifted away.
    if (e.type === 'crate') {
      state.run.cratesMissed++;
      remove(state, e, 'escaped');
      return;
    }
    var result = damage(state, { type: 'threat', kind: e.kind, id: e.id, from: e.from });
    remove(state, e, result === 'none' ? 'bounced' : 'hit');
    if (state.typing) TG.Typing.onMissed(state.typing, e);
    state.run.threatsMissed++;
  }

  function updateAttack(state, e, wdt) {
    var C = TG.C;
    var p = state.player;
    e.animT += wdt;
    e.dx -= C.ATTACK_SPEED * wdt;
    e.x = p.x + e.dx;
    e.eta = attackEta(state, e);
    e.onScreen = isOnScreen(state, e);

    if (canAct(p) && TG.Util.overlap(hitbox(e), playerBox(p))) {
      var result = damage(state, { type: 'attack', kind: e.kind, id: e.id, from: 'right' });
      e.dead = true;
      e.reason = result === 'none' ? 'bounced' : 'hit';
      return;
    }
    var camX = state.camera ? state.camera.x : 0;
    if (e.x < camX - ATTACK_GONE) {
      e.dead = true;
      e.reason = 'escaped';
    }
  }

  // Collision box of a bramble, branch, beehive or arch after the inset (CONTRACT 5.8).
  function hazardBox(h) {
    var C = TG.C;
    if (h.kind === 'bramble') {
      return { x: h.x + C.BRAMBLE_INSET_X, y: h.y + C.INSET, w: h.w - 2 * C.BRAMBLE_INSET_X, h: h.h - C.INSET };
    }
    return { x: h.x + C.INSET, y: h.y, w: h.w - 2 * C.INSET, h: h.h - C.INSET };
  }

  function updateHazards(state) {
    var p = state.player;
    var level = state.level;
    if (!level) return;
    var box = playerBox(p);
    var active = canAct(p);
    for (var i = 0; i < level.hazards.length; i++) {
      var h = level.hazards[i];
      if (!h.passed && p.x > h.x + h.w) h.passed = true;
      if (!active || h.kind === 'gap' || h.struck) continue;
      if (p.x < h.x - 32 || p.x > h.x + h.w + 32) continue;
      if (!TG.Util.overlap(hazardBox(h), box)) continue;
      var result = damage(state, { type: 'hazard', kind: h.kind, id: h.id, from: null });
      if (result === 'none') continue;
      h.struck = true;
      emit('hazard:hit', { id: h.id, kind: h.kind, x: p.x, y: p.y });
      box = playerBox(p);
    }
  }

  function updateItems(state) {
    var C = TG.C;
    var p = state.player;
    var items = state.items;
    if (!items || items.length === 0) return;
    var box = playerBox(p);
    var kept = null;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var touched = it.x > p.x - 16 && it.x < p.x + 16 &&
        TG.Util.overlap({ x: it.x - it.w / 2, y: it.y - it.h, w: it.w, h: it.h }, box);
      if (!touched) {
        if (kept) kept.push(it);
        continue;
      }
      if (!kept) kept = items.slice(0, i);
      state.ink++;
      state.inkTotal++;
      TG.Game.addScore(C.PTS_INK, { reason: 'ink', x: it.x, y: it.y });
      if (state.ink >= C.INK_PER_LIFE) {
        state.ink -= C.INK_PER_LIFE;
        TG.Game.addLife('ink');
      }
      emit('pickup:ink', { x: it.x, y: it.y, ink: state.ink, inkTotal: state.inkTotal });
    }
    if (kept) state.items = kept;
  }

  function update(state, wdt, dt) {
    var list = state.entities;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.dead) continue;
      if (e.type === 'attack') updateAttack(state, e, wdt);
      else updateTypable(state, e, wdt);
    }
    if (state.player) {
      updateHazards(state);
      updateItems(state);
    }
    var live = [];
    for (i = 0; i < state.entities.length; i++) {
      if (!state.entities[i].dead) live.push(state.entities[i]);
    }
    state.entities = live;
  }

  // ---------------------------------------------------------------------------------------------
  // 6. Removal and damage
  // ---------------------------------------------------------------------------------------------

  // Adaptive pacing bookkeeping (DESIGN 9.3): window use of every resolved threat word.
  function noteResolved(state, e, reason) {
    if (e.type !== 'threat' || !state.adapt) return;
    if (reason !== 'cleared' && reason !== 'hit' && reason !== 'bounced') return;
    var u = reason === 'cleared' ? (e.budget > 0 ? e.age / e.budget : 1) : TG.C.U_MISS;
    state.adapt.n++;
    state.adapt.uSum += u;
    state.adapt.correct += e.typed;
    state.adapt.wrong += e.errors;
  }

  function remove(state, e, reason) {
    if (!e || e.dead) return;
    e.dead = true;
    e.reason = reason;
    if (e.type === 'attack') return;
    e.typable = false;
    if (reason !== 'cleared') e.lost = true;
    e.urgent = false;
    noteResolved(state, e, reason);

    if (reason === 'hit') {
      emit('threat:hit', { id: e.id, kind: e.kind, word: e.word, typed: e.typed, x: e.x, y: e.y });
    } else if (reason === 'bounced') {
      emit('threat:bounce', { id: e.id, kind: e.kind, x: e.x, y: e.y });
    } else if (reason === 'escaped') {
      emit('threat:escape', { id: e.id, kind: e.kind, type: e.type, reason: 'drift' });
    } else if (reason === 'flee') {
      emit('threat:escape', { id: e.id, kind: e.kind, type: e.type, reason: 'flee' });
    }
  }

  function clearAll(state, reason) {
    var list = state.entities.slice();
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.dead) continue;
      if (e.type === 'attack') {
        e.dead = true;
        e.reason = reason;
      } else {
        remove(state, e, reason);
      }
    }
  }

  // The single place where Pip is hurt (CONTRACT 4.13).
  function damage(state, cause) {
    var C = TG.C;
    var p = state.player;
    var config = state.config;
    var run = state.run;
    var isFall = cause.type === 'fall';
    var typable = cause.type === 'threat';

    if (!isFall && p.invulnT > 0) return 'none';

    if (!isFall && state.power.shield > 0) {
      state.power.shield--;
      p.invulnT = C.SHIELD_INVULN;
      if (typable) run.damageTypable++; else run.damageOther++;
      emit('shield:break', { charges: state.power.shield, x: p.x, y: p.y });
      return 'shield';
    }

    p.lives--;
    p.invulnT = config.invuln;
    p.hurtT = 0.3;
    run.livesLost++;
    run.sectionLivesLost++;
    if (isFall) run.falls++; else run.hits++;
    if (typable) run.damageTypable++; else run.damageOther++;
    if (state.typing) TG.Typing.onDamage(state.typing);

    if (typable && state.adaptive) {
      var floor = run.continues > 0 ? C.ASSIST_MIN_CONTINUE : C.ASSIST_MIN;
      var target = Math.max(floor, state.assistTarget - 0.10);
      if (target < state.assistTarget) {
        state.assistTarget = target;
        emit('assist:change', { assist: state.assist, target: state.assistTarget });
      }
    }

    if (!isFall) emit('hero:hurt', { x: p.x, y: p.y, cause: cause });
    emit('life:lost', { lives: p.lives, cause: cause });

    var last = p.lives <= 0;
    state.lifeLost = {
      cause: isFall ? 'fall' : 'hit',
      t: 0,
      duration: last ? C.LAST_LIFE_FREEZE : (isFall ? C.FALL_FREEZE : C.HIT_FREEZE),
      gapId: isFall ? p.lastGapId : null,
      last: last
    };
    if (state.screen !== 'lifeLost') {
      state.resumeTo = state.screen;
      TG.Game.setScreen('lifeLost');
    }
    return 'life';
  }

  // ---------------------------------------------------------------------------------------------
  // 7. Queries
  // ---------------------------------------------------------------------------------------------

  // Live threats and crates, in spawn order, plus the boss word while it is typable.
  function typables(state) {
    var out = [];
    var list = state.entities || [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (isTypableEntity(e) && e.typable) out.push(e);
    }
    var bw = state.boss ? state.boss.word : null;
    if (bw && bw.typable && !bw.lost) out.push(bw);
    return out;
  }

  function activeThreats(state) {
    var n = 0;
    var list = state.entities || [];
    for (var i = 0; i < list.length; i++) {
      if (!list[i].dead && list[i].type === 'threat') n++;
    }
    return n;
  }

  function hitbox(entity) {
    var C = TG.C;
    return {
      x: entity.x - entity.w / 2 + C.INSET,
      y: entity.y - entity.h + C.INSET,
      w: entity.w - 2 * C.INSET,
      h: entity.h - 2 * C.INSET
    };
  }

  // The nearest jump or duck that Pip has not yet passed (CONTRACT 5.8).
  function nextAction(state) {
    var C = TG.C;
    var p = state.player;
    if (!p) return null;
    var best = null;
    var bestOpens = Infinity;

    var hazards = state.level ? state.level.hazards : [];
    for (var i = 0; i < hazards.length; i++) {
      var h = hazards[i];
      if (h.bridged || h.passed) continue;
      var opens = Math.max(0, (h.winStart - p.x) / C.RUN_SPEED);
      best = {
        id: h.id, source: 'hazard', kind: h.kind, action: h.action, hold: h.hold,
        inWindow: p.x >= h.winStart && p.x <= h.winEnd,
        winStart: h.winStart, winEnd: h.winEnd, holdUntil: h.holdUntil,
        eta: opens, prompt: h.prompt
      };
      bestOpens = opens;
      break;
    }

    var list = state.entities || [];
    for (i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.dead || e.type !== 'attack' || e.eta < 0) continue;
      var win = e.kind === 'shock' ? C.SHOCK_WIN : C.PICK_WIN;
      var opensA = Math.max(0, e.eta - win[1]);
      if (opensA < bestOpens) {
        bestOpens = opensA;
        best = {
          id: e.id, source: 'attack', kind: e.kind, action: e.action, hold: false,
          inWindow: e.eta >= win[0] && e.eta <= win[1],
          winStart: 0, winEnd: 0, holdUntil: 0,
          eta: opensA, prompt: false
        };
      }
    }
    return best;
  }

  TG.Entities = {
    KINDS: KINDS,
    createPlayer: createPlayer,
    pressJump: pressJump,
    pressDuck: pressDuck,
    releaseDuck: releaseDuck,
    updatePlayer: updatePlayer,
    spawn: spawn,
    spawnAttack: spawnAttack,
    update: update,
    typables: typables,
    activeThreats: activeThreats,
    remove: remove,
    clearAll: clearAll,
    damage: damage,
    hitbox: hitbox,
    playerBox: playerBox,
    nextAction: nextAction
  };
})(typeof window !== 'undefined' ? window : globalThis);
