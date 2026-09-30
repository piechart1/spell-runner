// js/core.js
// SPELL RUNNER foundation (WP0).
// Defines TG, TG.C, TG.PAL, TG.PAL_KEYS, TG.COLOR, TG.Util, TG.Events, TG.RNG, TG.Save, TG.Difficulty
// and the registries TG.Sprites, TG.Remaps, TG.Backdrops, TG.Levels.
//
// Contract: docs/CONTRACT.md sections 3, 4.1 to 4.5, 4.11, 5.10, 5.12, 6.1, 6.4 and 8.
//
// This is a simulation module: no Math.random, no Date, no timers, no DOM. Storage is touched only
// through TG.Save.init(root) and the functions called after it, always inside try/catch.
//
// Functions in this file read TG.C when they are called, never when the file loads, because the test
// loader may replace TG.C directly after this file has run (CONTRACT 10.1, option `constants`).
(function (root) {
  'use strict';
  var TG = root.TG = root.TG || {};

  // ---------------------------------------------------------------------------------------------
  // Small private helpers
  // ---------------------------------------------------------------------------------------------

  function isPlainObject(v) {
    // Works for objects from another realm as well (tests pass objects into the vm context).
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function warn(message) {
    if (typeof console !== 'undefined' && console && typeof console.warn === 'function') {
      console.warn(message);
    }
  }

  function reportError(message, error) {
    if (typeof console !== 'undefined' && console && typeof console.error === 'function') {
      console.error(message, error);
    }
  }

  function deepFreeze(obj) {
    var seen = new Set();
    function visit(o) {
      if (o === null || typeof o !== 'object') return;
      if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(o)) return;   // typed arrays cannot be frozen
      if (seen.has(o)) return;
      seen.add(o);
      var keys = Object.getOwnPropertyNames(o);
      for (var i = 0; i < keys.length; i++) {
        var d = Object.getOwnPropertyDescriptor(o, keys[i]);
        if (d && hasOwn(d, 'value')) visit(d.value);
      }
      Object.freeze(o);
    }
    visit(obj);
    return obj;
  }

  // A copy made of new objects and arrays. Used for config copies and save data.
  function deepCopy(v) {
    var out, i, k;
    if (Array.isArray(v)) {
      out = [];
      for (i = 0; i < v.length; i++) out.push(deepCopy(v[i]));
      return out;
    }
    if (isPlainObject(v)) {
      out = {};
      for (k in v) if (hasOwn(v, k)) out[k] = deepCopy(v[k]);
      return out;
    }
    return v;
  }

  function isNumber(v) {
    return typeof v === 'number' && isFinite(v);
  }

  // ---------------------------------------------------------------------------------------------
  // Section 3: constants
  // ---------------------------------------------------------------------------------------------

  TG.C = {
    VERSION: '1.0.0',
    STORAGE_KEY: 'spellrunner.v1',

    // Display
    W: 384,                 // internal width, px
    H: 216,                 // internal height, px
    TILE: 16,               // tile size, px
    GROUND_Y: 184,          // y of the ground surface, px
    PLAY_TOP: 24,           // top of the playfield (below the HUD), px
    HERO_SCREEN_X: 96,      // screen x of Pip's centre, px
    CAMERA_MAX_STEP: 4,     // camera catches up by at most this many px per step
    BUTTON_SPACE: 72,       // CSS px kept free for the JUMP and DUCK buttons (section 4.21)

    // Loop
    DT: 1 / 60,             // fixed simulation step, s
    MAX_STEPS: 5,           // most simulation steps per displayed frame
    MAX_FRAME: 0.25,        // a longer frame pauses the game, s

    // Hero physics (world units)
    RUN_SPEED: 64,          // px/ws
    JUMP_TIME: 0.75,        // airtime, ws
    JUMP_HEIGHT: 40,        // apex, px
    JUMP_DIST: 48,          // = RUN_SPEED * JUMP_TIME, px
    GRAVITY: 570,           // px/ws^2, used only when falling (not during a jump arc)
    COYOTE: 0.10,           // ws
    JUMP_BUFFER: 0.15,      // ws
    SLIDE_TIME: 0.875,      // minimum slide, ws (56 px)

    // Hitboxes, px
    HERO_W: 10, HERO_H: 22,
    SLIDE_W: 12, SLIDE_H: 10,
    FOOT_W: 8,              // foot box used for the support tests of section 5.2
    INSET: 2,               // attacks and hazards are inset by this on each side; also used for the `contact` distance of threats

    // Hazards, px
    GAP_NARROW: 16, GAP_WIDE: 32,
    HANG_CLEAR: 14,         // underside of branch, beehive, arch above the ground
    BRAMBLE_H: 8,
    BRAMBLE_INSET_X: 4,     // the bramble's collision box is inset by this on the left and right (8 px wide)
    GAP_WIN_BACK: 52,       // gap:    winStart = x + w - 52
    GAP_WIN_FWD: 4,         // gap:    winEnd   = x + 4
    BRAMBLE_WIN_BACK: 27,   // bramble: winStart = x - 27
    BRAMBLE_WIN_FWD: -5,    // bramble: winEnd   = x - 5
    DUCK_WIN_BACK: 34,      // branch, beehive, arch: winStart = x - 34
    DUCK_WIN_FWD: -6,       //                         winEnd   = x - 6
    HOLD_PAST: 6,           // arch: hold duck until x + w + 6
    FALL_COMMIT: 8,         // a committed fall ends (life lost) when the feet are this far below GROUND_Y, px
    RESCUE_AHEAD: 24,       // Pip returns this far past the gap's far edge, px
    CHECKPOINT_CLEAR: 12,   // no hazard within this many tiles after a checkpoint

    // Threat geometry
    EDGE_DX_RIGHT: 296,     // dx at which a 16 px sprite is just off the right edge
    EDGE_DX_LEFT: -104,     // dx at which a 16 px sprite is just off the left edge
    BOULDER_MIN_BUDGET: 4.4,// ws
    INTRO_FACTOR: 1.5,      // budget factor for intro and tutorial spawns
    SPAWN_RETRY: 0.25,      // ws between retries of a waiting spawn
    SWOOP_HOVER_DX: 120, SWOOP_HOVER_ELEV: 120, SWOOP_ENTER_T: 0.15, SWOOP_DIVE_T: 0.65,
    FLY_HIT_ELEV: 12,       // elevation at which Swoop ends its dive, px
    BUZZLE_ELEV: 16, BUZZLE_BOB: 4, BUZZLE_BOB_HZ: 1.5,
    HOP_LEN: 24, HOP_HEIGHT: 10,
    DIGBY_POP_T: 0.85,      // t at which the mole starts to rise
    DIGBY_DX: 56,           // dx of the mound and the mole until DIGBY_POP_T, px
    DIGBY_DEPTH: 16,        // how far below the ground the mole is until DIGBY_POP_T, px (elev = -16)
    CRATE_ELEV: 100, CRATE_FACTOR: 1.5, CRATE_BOB: 3,
    ROCK_FROM_DX: 190, ROCK_FROM_ELEV: 40, ROCK_TO_ELEV: 8, ROCK_ARC: 50,
    MIN_SPEED: { dawdle: 6, hoppet: 20, buzzle: 28 },   // px/ws towards Pip, relative to the ground
    TRUFFLE_MIN_CLOSING: 40, TRUFFLE_SPAN: 110,
    TRUFFLE_HOLD: 64,       // truffle: largest distance beyond `contact` at which it is drawn, px
    RIGHT_SPAN: 280,
    HOLD_SPAN: 264,         // dawdle, hoppet, buzzle: largest distance beyond `contact` at which they are drawn, px
    HOLD_STEP: 16,          // each further creature waiting at the right edge stands this much closer, px

    // Boss
    BOSS_DX: 200,           // boss centre is this far ahead of Pip, px
    ATTACK_SPEED: 160,      // shockwave and pickaxe closing speed, px/ws
    SHOCK_WIN: [0.05, 0.45],// press jump when eta (ws) is inside this range
    PICK_WIN: [0.05, 0.60], // press duck when eta (ws) is inside this range
    BOSS_RECOIL: 0.8,       // ws
    BOSS_LAUGH: 1.0,        // ws
    BOSS_PHASE_TIME: 2.0,   // ws
    BOSS_INTRO_TIME: 4.0,   // s
    BOSS_INTRO_SHORT: 1.5,  // s, after a continue
    LEVEL_COMPLETE_TIME: 4.0, // s
    FINISHER_SCALE: 0.25,

    // Typing
    DISCARD_TIME: 0.25,     // s, spillover guard
    AUTO_RELEASE_MAX_TYPED: 2,
    RECENT_WORDS: 20,
    LIVE_WPM_WORDS: 8, LIVE_WPM_MIN: 3, PEAK_WPM_WORDS: 5,
    KEY_INTERVAL_MAX: 2.0,  // s
    WPM_REFRESH: 0.5,       // s
    MULT_STEPS: [0, 3, 6, 10, 15],      // clean run needed for x1..x5
    KEY_STREAK_MILESTONES: [25, 50, 100],   // banners; the key streak that gives a shield charge is config.shieldKeyStreak
    MAX_WORD_LEN: 10,       // threats and crates

    // Scoring
    PTS_LETTER: 10,
    PTS_WORD_PER_LETTER: 20,
    CLEAN_FACTOR: 1.5,
    QUICK_FACTOR: 1.25, QUICK_U: 0.5,
    CLOSE_CALL_TIME: 0.35, PTS_CLOSE: 100,
    BLAST_FACTOR: 0.5,
    PTS_INK: 10,
    PTS_CORE: 1000, PTS_BOSS: 5000,
    PTS_CP_ACC: 500, CP_ACC: 0.95, PTS_CP_NODAMAGE: 500,
    PTS_LIFE: 1000, PTS_ACC95: 3000, PTS_ACC90: 1500, PTS_NOCONT: 2000,
    INK_PER_LIFE: 100,
    MAX_LIVES: 9, MAX_SHIELD: 2,
    SCORE_SLOTS: 5,

    // Timers, s (real)
    HIT_FREEZE: 0.10,
    FALL_FREEZE: 1.0,
    LAST_LIFE_FREEZE: 1.5,
    SHIELD_INVULN: 1.0,
    HOURGLASS_TIME: 6, HOURGLASS_SCALE: 0.5,
    QUILL_TIME: 10,
    TUTOR_SCALE: 0.25, TUTOR_T: 0.6,
    CONTINUE_COUNT: 9, CONTINUE_LOCKOUT: 0.8,
    RESUME_STEP: 0.5,       // seconds per step of the 3-2-1 resume countdown
    READY_TIME: 3.0,        // READY / GO banner

    // Adaptive pacing
    ASSIST_MAX: 1.0, ASSIST_MIN: 0.70, ASSIST_MIN_CONTINUE: 0.60,
    ASSIST_RATE: 0.05,      // per real second
    ASSIST_WINDOW: 4,       // resolved threat words per evaluation
    ASSIST_CONTINUE_CAP: 0.85,
    U_MISS: 1.2,

    // Screens on which TG.Game.step advances the simulation
    SIM_SCREENS: ['playing', 'lifeLost', 'bossIntro', 'boss', 'levelComplete']
  };
  deepFreeze(TG.C);

  // DESIGN 14.2: the master palette, in palette order.
  TG.PAL = Object.freeze([
    '#0F0F1B', //  0  0  INK
    '#2B2D42', //  1  1  SHADOW
    '#5C6078', //  2  2  STONE
    '#A9B0C3', //  3  3  SILVER
    '#F8F8F8', //  4  4  WHITE
    '#1E2A78', //  5  5  DEEP_BLUE
    '#2F5FD0', //  6  6  ROYAL
    '#5C94FC', //  7  7  SKY
    '#A8D8FC', //  8  8  HAZE
    '#0B6A6A', //  9  9  DEEP_TEAL
    '#18A8A0', // 10  a  TEAL
    '#6EF0E0', // 11  b  AQUA
    '#0E4A2A', // 12  c  PINE
    '#1E8A32', // 13  d  FOREST
    '#4CC83C', // 14  e  GRASS
    '#B8F050', // 15  f  LIME
    '#B86A00', // 16  g  BRONZE
    '#F08A1C', // 17  h  ORANGE
    '#F8C020', // 18  i  GOLD
    '#FCF0A0', // 19  j  CREAM
    '#3E2210', // 20  k  BARK
    '#7A4420', // 21  l  SOIL
    '#B87848', // 22  m  CLAY
    '#E8C890', // 23  n  SAND
    '#6A1428', // 24  o  MAROON
    '#D82C2C', // 25  p  RED
    '#F86858', // 26  q  CORAL
    '#FCA8C0', // 27  r  PINK
    '#3C1A5A', // 28  s  PLUM
    '#7C3CC0', // 29  t  VIOLET
    '#C090F0', // 30  u  LILAC
    '#F8B888'  // 31  v  PEACH
  ]);

  // The character at index i is the sprite-data key for palette entry i.
  TG.PAL_KEYS = '0123456789abcdefghijklmnopqrstuv';

  TG.COLOR = Object.freeze({ INK: 0, SHADOW: 1, STONE: 2, SILVER: 3, WHITE: 4, DEEP_BLUE: 5, ROYAL: 6, SKY: 7, HAZE: 8,
    DEEP_TEAL: 9, TEAL: 10, AQUA: 11, PINE: 12, FOREST: 13, GRASS: 14, LIME: 15, BRONZE: 16, ORANGE: 17,
    GOLD: 18, CREAM: 19, BARK: 20, SOIL: 21, CLAY: 22, SAND: 23, MAROON: 24, RED: 25, CORAL: 26, PINK: 27,
    PLUM: 28, VIOLET: 29, LILAC: 30, PEACH: 31 });

  // ---------------------------------------------------------------------------------------------
  // Section 4.1: TG.Util
  // ---------------------------------------------------------------------------------------------

  TG.Util = {
    clamp: function (v, min, max) {
      return v < min ? min : (v > max ? max : v);
    },

    lerp: function (a, b, t) {
      return a + (b - a) * t;
    },

    // Moves v towards target by at most maxDelta.
    approach: function (v, target, maxDelta) {
      if (v < target) return Math.min(v + maxDelta, target);
      if (v > target) return Math.max(v - maxDelta, target);
      return target;
    },

    // Zero-padded integer, e.g. pad(42, 3) = '042'. A number with more digits than `width` is returned in full.
    pad: function (n, width) {
      var v = Math.floor(Number(n) || 0);
      var neg = v < 0;
      var s = String(Math.abs(v));
      while (s.length < width) s = '0' + s;
      return neg ? '-' + s : s;
    },

    // a, b are { x, y, w, h } with x, y = left, top. Touching edges do not overlap.
    overlap: function (a, b) {
      return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    },

    // Rounds to the nearest 10.
    round10: function (n) {
      return Math.round(n / 10) * 10;
    },

    deepFreeze: deepFreeze
  };

  // ---------------------------------------------------------------------------------------------
  // Sections 4.2 and 8: TG.Events
  // ---------------------------------------------------------------------------------------------

  // Every event of section 8 with its payload fields, in the order of the tables.
  var EVENT_FIELDS = {
    // 8.1 Typing
    'type:hit': 'target id kind ch index length complete x y',
    'type:miss': 'target id ch expected repeat x y',
    'target:lock': 'target id kind x y',
    'target:release': 'target id reason',
    'streak:change': 'cleanRun mult previousMult',
    'streak:milestone': 'kind value',
    // 8.2 Game and scoring
    'screen:change': 'from to data',
    'level:start': 'levelId difficulty name continued music',
    'word:clear': 'id type kind family from word x y w h score mult clean quick close cause power',
    'score:add': 'points total reason x y',
    'life:gain': 'lives cause',
    'life:lost': 'lives cause',
    'shield:gain': 'charges cause',
    'shield:break': 'charges x y',
    'pickup:power': 'power x y',
    'power:start': 'power duration',
    'power:end': 'power',
    'tutor:prompt': 'id word',
    'tutor:end': 'id',
    'assist:change': 'assist target',
    'game:over': 'checkpoint score',
    'game:continue': 'checkpoint continues assist',
    'level:clear': 'result',
    'run:end': 'result',
    // 8.3 Hero, threats and hazards
    'hero:jump': 'x y',
    'hero:land': 'x y',
    'hero:duck': 'x y',
    'hero:hurt': 'x y cause',
    'hero:fall': 'x gapId',
    'hero:rescue': 'x y',
    'pickup:ink': 'x y ink inkTotal',
    'threat:spawn': 'entity id type kind from word',
    'threat:warn': 'id kind from',
    'threat:enter': 'id kind from',
    'threat:urgent': 'id kind',
    'threat:hit': 'id kind word typed x y',
    'threat:bounce': 'id kind x y',
    'threat:escape': 'id kind type reason',
    'hazard:hit': 'id kind x y',
    'attack:spawn': 'id kind action',
    // 8.4 Level
    'section:enter': 'index name stage palette music',
    'checkpoint': 'index x wpm accuracy bonus lives',
    'hazard:cue': 'id kind action hold sound prompt',
    'hazard:bridge': 'id x w',
    'boss:warning': '',
    'boss:enter': '',
    // 8.5 Boss
    'boss:state': 'state phase round',
    'boss:attack': 'kind telegraph',
    'boss:throw': 'kind x y',
    'boss:weakopen': 'id word window',
    'boss:weakclose': 'completed',
    'boss:hit': 'health maxHealth phase x y',
    'boss:phase': 'phase',
    'boss:finisher': 'id word',
    'boss:defeat': 'x y',
    // 8.6 Interface
    'ui:move': '',
    'ui:select': '',
    'ui:back': '',
    'ui:count': 'n high',
    'ui:tally': '',
    'ui:stamp': 'rank',
    'ui:letter': 'index'
  };

  var EVENT_NAMES = Object.keys(EVENT_FIELDS);
  var EVENT_FIELD_LISTS = {};
  (function () {
    for (var i = 0; i < EVENT_NAMES.length; i++) {
      var text = EVENT_FIELDS[EVENT_NAMES[i]];
      EVENT_FIELD_LISTS[EVENT_NAMES[i]] = text ? text.split(' ') : [];
    }
  })();
  deepFreeze(EVENT_FIELD_LISTS);

  var listeners = {};        // name -> array of { name, fn, seq, once, active }
  var listenerSeq = 0;
  var warnedEvents = {};     // names outside NAMES that have been warned about

  function subscribe(name, fn, once) {
    if (typeof fn !== 'function') return function () {};
    var entry = { name: name, fn: fn, seq: ++listenerSeq, once: !!once, active: true };
    (listeners[name] = listeners[name] || []).push(entry);
    return function unsubscribe() {
      removeEntry(name, entry);
    };
  }

  function removeEntry(name, entry) {
    entry.active = false;
    var list = listeners[name];
    if (!list) return;
    var i = list.indexOf(entry);
    if (i !== -1) list.splice(i, 1);
    if (list.length === 0) delete listeners[name];
  }

  TG.Events = {
    // Array of every event name in section 8.
    NAMES: Object.freeze(EVENT_NAMES.slice()),

    // Extra, not required by the contract: the payload field names of section 8 for each event,
    // as { 'type:hit': ['target', 'id', ...], ... }. Read-only.
    FIELDS: EVENT_FIELD_LISTS,

    // Subscribes; returns a function that unsubscribes. The name '*' subscribes to every event.
    on: function (name, fn) {
      return subscribe(name, fn, false);
    },

    once: function (name, fn) {
      return subscribe(name, fn, true);
    },

    off: function (name, fn) {
      var list = listeners[name];
      if (!list) return;
      for (var i = list.length - 1; i >= 0; i--) {
        if (list[i].fn === fn) removeEntry(name, list[i]);
      }
    },

    // Listeners are called synchronously, in the order they subscribed, as fn(payload, name).
    emit: function (name, payload) {
      if (!hasOwn(EVENT_FIELDS, name) && !warnedEvents[name]) {
        warnedEvents[name] = true;
        warn('TG.Events: "' + name + '" is not a registered event name');
      }
      if (payload === undefined || payload === null) payload = {};

      var own = listeners[name];
      var all = name === '*' ? null : listeners['*'];
      var queue;
      if (own && all) {
        // Merge the two lists by subscription order.
        queue = [];
        var i = 0, j = 0;
        while (i < own.length || j < all.length) {
          if (j >= all.length || (i < own.length && own[i].seq < all[j].seq)) queue.push(own[i++]);
          else queue.push(all[j++]);
        }
      } else if (own) {
        queue = own.slice();
      } else if (all) {
        queue = all.slice();
      } else {
        return;
      }

      for (var k = 0; k < queue.length; k++) {
        var entry = queue[k];
        if (!entry.active) continue;            // removed by an earlier listener of this emit
        if (entry.once) removeEntry(entry.name, entry);
        try {
          entry.fn(payload, name);
        } catch (e) {
          reportError('TG.Events: a listener for "' + name + '" threw', e);
        }
      }
    },

    // Removes every listener (used by tests).
    clear: function () {
      var names = Object.keys(listeners);
      for (var i = 0; i < names.length; i++) {
        var list = listeners[names[i]];
        for (var j = 0; j < list.length; j++) list[j].active = false;
      }
      listeners = {};
    },

    // Listeners registered for name.
    count: function (name) {
      return listeners[name] ? listeners[name].length : 0;
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Section 4.3: TG.RNG (mulberry32)
  // ---------------------------------------------------------------------------------------------

  TG.RNG = {
    create: function (seed) {
      var s = (seed >>> 0) | 0;

      function next() {
        s = (s + 0x6D2B79F5) | 0;
        var t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      }

      return {
        // Float in [0, 1).
        next: next,

        // Integer, both ends inclusive.
        int: function (min, max) {
          return min + Math.floor(next() * (max - min + 1));
        },

        // An element of the array; undefined for an empty array (no value is drawn then).
        pick: function (array) {
          if (!array || array.length === 0) return undefined;
          return array[Math.floor(next() * array.length)];
        },

        // Index chosen in proportion to weights (array of numbers >= 0); -1 if the sum is 0 (no value is drawn then).
        weighted: function (weights) {
          var total = 0, i, w;
          var n = weights ? weights.length : 0;
          for (i = 0; i < n; i++) {
            w = weights[i];
            if (w > 0) total += w;
          }
          if (!(total > 0)) return -1;
          var r = next() * total;
          var last = -1;
          for (i = 0; i < n; i++) {
            w = weights[i];
            if (!(w > 0)) continue;
            last = i;
            r -= w;
            if (r < 0) return i;
          }
          return last;     // only reached through rounding
        },

        // True with probability p.
        chance: function (p) {
          return next() < p;
        },

        // uint32
        getState: function () {
          return s >>> 0;
        },

        setState: function (n) {
          s = (n >>> 0) | 0;
        }
      };
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Sections 4.5 and 5.10: TG.Difficulty
  // ---------------------------------------------------------------------------------------------

  var DIFFICULTY_NAMES = ['easy', 'medium', 'hard'];

  var TUNABLE = ['react', 'perChar', 'letterStall', 'impactGap', 'hazardMargin', 'urgentTime', 'maxActive',
    'wordLen', 'lenShift', 'tierMix', 'shieldKeyStreak', 'boss', 'bot'];

  var DIFFICULTY = {
    easy: {
      id: 'easy',
      label: 'EASY',
      description: 'SHORT WORDS, HOME ROW FIRST',
      wpmGuide: '10-20',
      designWpm: 15,
      floorWpm: 10,

      pace: 0.75,                     // world seconds per real second at assist 1.0

      lives: 5,
      invuln: 3.0,                    // s, real
      checkpointLives: 3,             // lives are raised to at least this at a checkpoint; 0 = no top-up
      extraLifeFirst: 5000,
      extraLifeEvery: 10000,

      react: 1.8,                     // nominal s
      perChar: 1.0,                   // nominal s per letter
      letterStall: 0.20,              // nominal s
      impactGap: 3.5,                 // nominal s
      hazardMargin: 1.2,              // nominal s
      urgentTime: 1.5,                // s, real
      maxActive: [1, 2, 2, 2],        // threats at once in sections 0, 1, 2 and the boss arena

      wordLen: {                      // [min, max] before the section shift
        boulder: [2, 4], dawdle: [3, 5], hoppet: [2, 4], buzzle: [2, 4],
        swoop: [3, 4], truffle: [2, 3], digby: [3, 4], crate: [3, 5], rock: [2, 4]
      },
      lenShift: [0, 0, 1],            // added to both ends in sections 0, 1, 2
      tierMix: [ { 1: 1 }, { 2: 0.7, 1: 0.3 }, { 3: 0.6, 2: 0.3, 1: 0.1 }, { 1: 0.6, 2: 0.4 } ],   // sections 0, 1, 2, boss arena

      autoReleaseMisses: 3,           // 0 = off
      streakPenaltySteps: 1,          // 5 = back to x1
      weakWeighting: true,
      adjacencyWeighting: true,

      keyGuide: true,
      hazardCue: true,
      keyPrompts: 3,                  // first N hazards of each action show the key
      bridgeAfterFalls: 1,            // 0 = never
      tutorialAlways: true,           // true: tutorial slow-down on every run

      shieldHits: 2,                  // charges per Bubble shield
      shieldKeyStreak: 30,            // correct keys in a row that give one shield charge

      boss: {
        health: 3,
        coreWords: [1, 1, 1],         // weak-point words in phases 1, 2, 3; their sum is health
        rocks: [2, 2, 3],             // volley entries in phases 1, 2, 3
        inFlight: 1,
        launchGap: [4.5, 4.2, 3.8],   // nominal s
        coreLen: [4, 6],
        exposeFactor: 1.5,
        exposeBonus: 2.0,             // nominal s
        telegraph: 1.4,               // nominal s
        doubleAttack: false,
        doubleGap: 0,                 // nominal s
        minion: false,
        finisherLen: [6, 7],
        finisherBonus: 500
      },

      bot: {                          // profiles used by test/sim.js
        floor:  { wpm: 10, accuracy: 0.90, react: 1.5 },
        target: { wpm: 15, accuracy: 0.95, react: 1.0 },
        fast:   { wpm: 30, accuracy: 0.98, react: 0.5 }
      }
    },

    medium: {
      id: 'medium',
      label: 'MEDIUM',
      description: 'EVERYDAY WORDS',
      wpmGuide: '20-40',
      designWpm: 30,
      floorWpm: 20,

      pace: 1.0,

      lives: 4,
      invuln: 2.5,
      checkpointLives: 2,
      extraLifeFirst: 10000,
      extraLifeEvery: 20000,

      react: 1.2,
      perChar: 0.5,
      letterStall: 0.12,
      impactGap: 1.5,
      hazardMargin: 0.75,
      urgentTime: 1.2,
      maxActive: [2, 2, 3, 3],

      wordLen: {
        boulder: [4, 6], dawdle: [5, 8], hoppet: [4, 6], buzzle: [4, 6],
        swoop: [5, 6], truffle: [4, 5], digby: [5, 6], crate: [5, 8], rock: [4, 5]
      },
      lenShift: [0, 1, 2],
      tierMix: [ { 1: 1 }, { 2: 0.7, 1: 0.3 }, { 3: 0.6, 2: 0.4 }, { 1: 0.6, 2: 0.4 } ],

      autoReleaseMisses: 3,
      streakPenaltySteps: 2,
      weakWeighting: true,
      adjacencyWeighting: true,

      keyGuide: false,
      hazardCue: true,
      keyPrompts: 0,
      bridgeAfterFalls: 2,
      tutorialAlways: false,

      shieldHits: 1,
      shieldKeyStreak: 50,

      boss: {
        health: 6,
        coreWords: [2, 2, 2],
        rocks: [2, 3, 4],
        inFlight: 2,
        launchGap: [2.4, 2.2, 1.8],
        coreLen: [7, 9],
        exposeFactor: 1.5,
        exposeBonus: 2.0,
        telegraph: 1.0,
        doubleAttack: true,
        doubleGap: 1.2,
        minion: true,
        finisherLen: [10, 11],
        finisherBonus: 1000
      },

      bot: {
        floor:  { wpm: 20, accuracy: 0.92, react: 1.0 },
        target: { wpm: 30, accuracy: 0.95, react: 0.7 },
        fast:   { wpm: 60, accuracy: 0.98, react: 0.4 }
      }
    },

    hard: {
      id: 'hard',
      label: 'HARD',
      description: 'LONG AND UNUSUAL WORDS',
      wpmGuide: '40+',
      designWpm: 50,
      floorWpm: 35,

      pace: 1.25,

      lives: 3,
      invuln: 2.0,
      checkpointLives: 0,
      extraLifeFirst: 15000,
      extraLifeEvery: 30000,

      react: 0.7,
      perChar: 0.3,
      letterStall: 0.06,
      impactGap: 0.9,
      hazardMargin: 0.5,
      urgentTime: 0.9,
      maxActive: [2, 3, 4, 4],

      wordLen: {
        boulder: [5, 9], dawdle: [7, 10], hoppet: [5, 8], buzzle: [5, 8],
        swoop: [6, 9], truffle: [5, 7], digby: [6, 8], crate: [7, 10], rock: [5, 7]
      },
      lenShift: [0, 1, 2],
      tierMix: [ { 1: 1 }, { 2: 0.7, 1: 0.3 }, { 3: 0.6, 2: 0.4 }, { 1: 0.6, 2: 0.4 } ],

      autoReleaseMisses: 0,
      streakPenaltySteps: 5,
      weakWeighting: false,
      adjacencyWeighting: false,

      keyGuide: false,
      hazardCue: false,
      keyPrompts: 0,
      bridgeAfterFalls: 0,
      tutorialAlways: false,

      shieldHits: 1,
      shieldKeyStreak: 75,

      boss: {
        health: 8,
        coreWords: [2, 3, 3],
        rocks: [3, 4, 5],
        inFlight: 3,
        launchGap: [1.5, 1.3, 1.1],
        coreLen: [9, 12],
        exposeFactor: 1.5,
        exposeBonus: 2.0,
        telegraph: 0.7,
        doubleAttack: true,
        doubleGap: 0.9,
        minion: true,
        finisherLen: [13, 15],
        finisherBonus: 1500
      },

      bot: {
        floor:  { wpm: 35, accuracy: 0.94, react: 0.6 },
        target: { wpm: 50, accuracy: 0.95, react: 0.5 },
        fast:   { wpm: 90, accuracy: 0.98, react: 0.3 }
      }
    }
  };
  deepFreeze(DIFFICULTY);

  var warnedKinds = {};

  // Merge rule of section 4.5: a plain object is merged key by key; anything else replaces the old value.
  function mergeInto(target, source) {
    for (var k in source) {
      if (!hasOwn(source, k)) continue;
      var v = source[k];
      if (v === undefined) continue;
      if (isPlainObject(v) && isPlainObject(target[k])) mergeInto(target[k], v);
      else target[k] = deepCopy(v);
    }
  }

  function ownKeys(obj) {
    return isPlainObject(obj) ? Object.keys(obj) : [];
  }

  TG.Difficulty = {
    NAMES: Object.freeze(DIFFICULTY_NAMES.slice()),

    // The top-level config keys that a level may override.
    TUNABLE: Object.freeze(TUNABLE.slice()),

    // Deep-frozen; throws on an unknown name.
    get: function (name) {
      if (typeof name !== 'string' || !hasOwn(DIFFICULTY, name)) {
        throw new Error('TG.Difficulty.get: unknown difficulty "' + name + '"');
      }
      return DIFFICULTY[name];
    },

    // 0, 1 or 2; -1 for a name that is not a difficulty.
    rank: function (name) {
      return DIFFICULTY_NAMES.indexOf(name);
    },

    // True if an entry tagged `tag` is used on difficulty `name`. An entry without a tag is used everywhere.
    includes: function (name, tag) {
      var r = DIFFICULTY_NAMES.indexOf(name);
      if (r === -1) return false;
      if (tag === undefined || tag === null) return true;
      var t = DIFFICULTY_NAMES.indexOf(tag);
      if (t === -1) return false;
      return r >= t;
    },

    // Nominal seconds = react + perChar * len.
    budget: function (config, len) {
      return config.react + config.perChar * len;
    },

    // Nominal seconds to world seconds.
    toWs: function (config, nominal) {
      return nominal * config.pace;
    },

    // config.wordLen[kind] with both ends raised by config.lenShift[sectionIndex]
    // (sectionIndex 3 = boss: no shift); max capped at MAX_WORD_LEN.
    wordRange: function (config, kind, sectionIndex) {
      var cap = TG.C.MAX_WORD_LEN;
      var range = config.wordLen ? config.wordLen[kind] : undefined;
      if (!Array.isArray(range) || range.length < 2) {
        if (!warnedKinds[kind]) {
          warnedKinds[kind] = true;
          warn('TG.Difficulty.wordRange: no word length for kind "' + kind + '"; using 2 to ' + cap);
        }
        range = [2, cap];
      }
      var shift = 0;
      if (config.lenShift && isNumber(config.lenShift[sectionIndex])) shift = config.lenShift[sectionIndex];
      var max = Math.min(cap, range[1] + shift);
      var min = Math.min(max, range[0] + shift);
      return [min, max];
    },

    // { tier: weight } for a section index (3 = boss arena).
    tierMix: function (config, sectionIndex) {
      var list = config.tierMix;
      var i = Math.floor(Number(sectionIndex) || 0);
      if (i < 0) i = 0;
      if (i > list.length - 1) i = list.length - 1;
      return list[i];
    },

    // The config used for a run: the difficulty entry with the level's `tune` block merged in.
    resolve: function (name, tune) {
      var base = TG.Difficulty.get(name);
      if (!isPlainObject(tune)) return base;
      var parts = [tune.all, tune[name]];
      var total = 0, p, k, i;
      for (p = 0; p < parts.length; p++) total += ownKeys(parts[p]).length;
      if (total === 0) return base;

      var copy = deepCopy(base);
      var warned = {};
      for (p = 0; p < parts.length; p++) {
        var keys = ownKeys(parts[p]);
        var accepted = {};
        for (i = 0; i < keys.length; i++) {
          k = keys[i];
          if (TUNABLE.indexOf(k) === -1) {
            if (!warned[k]) {
              warned[k] = true;
              warn('TG.Difficulty.resolve: "' + k + '" cannot be tuned by a level and is ignored');
            }
            continue;
          }
          accepted[k] = parts[p][k];
        }
        mergeInto(copy, accepted);
      }
      return deepFreeze(copy);
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Sections 4.11, 6.1 and 6.4: registries
  // ---------------------------------------------------------------------------------------------

  // Rows: name, w, h, frame names, fps, ax, ay. Transcribed from section 6.4.
  var MANIFEST_C = [
    ['hero_run',     16, 24, 'r0 r1 r2 r3 r4 r5',            12,  8, 24],
    ['hero_jump',    16, 24, 'rise apex fall',                0,  8, 24],
    ['hero_slide',   24, 16, 's0 s1',                        10, 12, 16],
    ['hero_cast',    16, 12, 'cast',                          0,  8, 24],
    ['hero_hurt',    16, 24, 'hurt',                          0,  8, 24],
    ['hero_idle',    16, 24, 'i0 i1',                         2,  8, 24],
    ['hero_win',     16, 24, 'w0 w1',                         5,  8, 24],
    ['hero_sit',     16, 24, 'sit0 sit1',                     3,  8, 24],
    ['ink_bolt',      8,  8, 'b0 b1',                        20,  4,  4],
    ['ink_spark',     8,  8, 'k0 k1',                        20,  4,  4],
    ['en_boulder',   24, 32, 'whole crack1 crack2 crack3',    0, 12, 32],
    ['en_dawdle',    16, 16, 'crawl0 crawl1 shell',           4,  8, 16],
    ['en_hoppet',    16, 16, 'sit leap puff',                 0,  8, 16],
    ['en_buzzle',    16, 16, 'fly0 fly1',                    16,  8, 16],
    ['en_swoop',     24, 16, 'flap0 flap1 dive',              8, 12, 16],
    ['en_truffle',   24, 16, 'run0 run1 run2 run3',          12, 12, 16],
    ['en_digby',     16, 16, 'peek up spin',                  0,  8, 16],
    ['en_mound',     16,  8, 'm0 m1',                         6,  8,  8],
    ['boss_body',    48, 32, 'b0 b1',                         4, 24, 32],
    ['boss_head',    32, 24, 'normal laugh hurt dizzy',       0, 16, 24],
    ['boss_arm',     16, 16, 'rest raise throw',              0,  8,  8],
    ['boss_mound',   48, 16, 'mound',                         0, 24, 16],
    ['boss_monocle',  8,  8, 'monocle',                       0,  4,  4],
    ['boss_helmet',  16,  8, 'helmet',                        0,  8,  4],
    ['pr_rock',      12, 12, 'k0 k1',                        10,  6, 12],
    ['pr_pickaxe',   16, 16, 'p0 p1 p2 p3',                  12,  8, 16],
    ['pr_shock',     16,  8, 's0 s1',                        10,  8,  8]
  ];

  var MANIFEST_D = [
    // Tiles (16x16, anchor 0,0)
    ['tile_grass',   16, 16, 'g0 g1',                         0,  0,  0],
    ['tile_soil',    16, 16, 's0 s1',                         0,  0,  0],
    ['tile_edge_l',  16, 16, 'edge',                          0,  0,  0],
    ['tile_edge_r',  16, 16, 'edge',                          0,  0,  0],
    ['tile_wall_l',  16, 16, 'wall',                          0,  0,  0],
    ['tile_wall_r',  16, 16, 'wall',                          0,  0,  0],
    ['tile_water',   16, 16, 'w0 w1',                         3,  0,  0],
    ['tile_dark',    16, 16, 'dark',                          0,  0,  0],
    ['tile_plank',   16, 16, 'plank',                         0,  0,  0],
    ['tile_arena',   16, 16, 'a0 a1',                         0,  0,  0],
    ['tile_rail',    16, 16, 'rail',                          0,  0,  0],
    // Hazards, signs and flag
    ['haz_bramble',  16, 16, 'bramble',                       0,  0, 16],
    ['haz_branch',   16, 16, 'branch',                        0,  0, 16],
    ['haz_trunk',    16, 16, 'trunk',                         0,  0, 16],
    ['haz_beehive',  16, 24, 'hive',                          0,  0, 24],
    ['haz_rope',     16, 16, 'rope',                          0,  0, 16],
    ['haz_arch',     48, 16, 'arch',                          0,  0, 16],
    ['haz_canopy',   48, 16, 'canopy',                        0,  0, 16],
    ['sign_jump',    16, 16, 'sign',                          0,  8, 16],
    ['sign_duck',    16, 16, 'sign',                          0,  8, 16],
    ['sign_type',    48, 32, 'sign',                          0,  0, 32],
    ['flag_pole',    16, 32, 'down rise0 rise1 wave0 wave1',  4,  0, 32],
    // Items and crates
    ['item_ink',      8,  8, 'd0 d1 d2 d3',                   8,  4,  8],
    ['crate_balloon', 16, 32, 'c0 c1',                        3,  8, 32],
    ['crate_box',    16, 16, 'box',                           0,  8, 16],
    ['pw_shield',    16, 16, 'p0 p1',                         4,  8, 16],
    ['pw_hourglass', 16, 16, 'p0 p1',                         4,  8, 16],
    ['pw_quill',     16, 16, 'p0 p1',                         4,  8, 16],
    ['pw_blast',     16, 16, 'p0 p1',                         4,  8, 16],
    ['pw_cap',       16, 16, 'p0 p1',                         4,  8, 16],
    // Effects
    ['fx_shield',    24, 32, 's0 s1 s2 s3',                   8, 12, 30],
    ['fx_bubble',    24, 32, 'b0 b1',                         4, 12, 30],
    ['fx_bracket',    8,  8, 'tl0 tl1 bl0 bl1',               4,  0,  0],
    ['fx_marker',    16,  4, 'm0 m1',                         6,  8,  4],
    ['fx_chunk',      8,  8, 'c0 c1',                         0,  4,  4],
    ['fx_splinter',   8,  8, 'c0 c1',                         0,  4,  4],
    ['fx_feather',    8,  8, 'f0 f1',                         6,  4,  4],
    ['fx_star',       8,  8, 's0 s1',                         8,  4,  4],
    ['fx_flower',     8,  8, 'f0 f1',                         4,  4,  4],
    ['fx_lilypad',   16,  8, 'pad',                           0,  8,  4],
    ['fx_daisy',      8,  8, 'd0 d1 d2',                      0,  4,  8],
    ['fx_helmet',     8,  8, 'helmet',                        0,  4,  4],
    ['fx_dust',       8,  8, 'd0 d1 d2',                     12,  4,  8],
    ['fx_poof',      16, 16, 'p0 p1 p2',                     12,  8,  8],
    // Icons and interface pieces (anchor 0,0)
    ['icon_pip',      8,  8, 'pip',                           0,  0,  0],
    ['icon_shield',   8,  8, 'shield',                        0,  0,  0],
    ['icon_ink',      8,  8, 'ink',                           0,  0,  0],
    ['icon_crown',    8,  8, 'crown',                         0,  0,  0],
    ['ui_slot',      16, 16, 'slot',                          0,  0,  0],
    ['key_cap',      16, 16, 'up down',                       0,  0,  0],
    ['key_wide',     32, 16, 'up down',                       0,  0,  0],
    // Backdrop pieces (anchor bottom left; bg_sails 16,16)
    ['bg_cloud_s',   32, 16, 'cloud',                         0,  0, 16],
    ['bg_cloud_m',   48, 16, 'cloud',                         0,  0, 16],
    ['bg_cloud_l',   64, 24, 'cloud',                         0,  0, 24],
    ['bg_hill_far', 128, 48, 'hill',                          0,  0, 48],
    ['bg_hill_mid', 128, 56, 'hill',                          0,  0, 56],
    ['bg_tree',      16, 32, 'tree',                          0,  0, 32],
    ['bg_windmill',  32, 48, 'mill',                          0,  0, 48],
    ['bg_sails',     32, 32, 's0 s1 s2 s3',                   4, 16, 16],
    ['bg_bush',      32, 16, 'bush',                          0,  0, 16],
    ['bg_fence',     32, 16, 'fence',                         0,  0, 16],
    ['bg_appletree', 32, 48, 'tree',                          0,  0, 48],
    ['bg_molehill',  16,  8, 'hill',                          0,  0,  8],
    ['bg_moon',      32, 32, 'moon',                          0,  0, 32],
    ['bg_star',       8,  8, 's0 s1',                         2,  0,  8],
    ['fg_tuft',      16,  8, 't0 t1',                         0,  0,  8]
  ];

  function buildManifest() {
    var out = [];
    function add(rows, owner) {
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var names = r[3].split(' ');
        // name, w, h, frames, ax, ay, owner are the contract's fields. fps and names are added so that
        // TG.Gfx.info can answer in full for a sprite that is not defined yet.
        out.push({ name: r[0], w: r[1], h: r[2], frames: names.length, ax: r[5], ay: r[6], owner: owner,
          fps: r[4], names: names });
      }
    }
    add(MANIFEST_C, 'C');
    add(MANIFEST_D, 'D');
    return deepFreeze(out);
  }

  var spriteDefs = {};       // name -> def
  var spriteOrder = [];      // names in the order they were defined

  function checkSprite(def) {
    var problems = [];
    if (!isPlainObject(def)) return ['definition is not an object'];

    var sizeOk = true;
    if (!isNumber(def.w) || def.w <= 0 || Math.floor(def.w) !== def.w) { problems.push('w is missing or is not a positive whole number'); sizeOk = false; }
    if (!isNumber(def.h) || def.h <= 0 || Math.floor(def.h) !== def.h) { problems.push('h is missing or is not a positive whole number'); sizeOk = false; }
    if (!Array.isArray(def.anchor) || def.anchor.length !== 2 || !isNumber(def.anchor[0]) || !isNumber(def.anchor[1])) {
      problems.push('anchor is missing or is not [x, y]');
    }
    if (!isNumber(def.fps) || def.fps < 0) problems.push('fps is missing or is not a number of 0 or more');
    if (typeof def.owner !== 'string' || def.owner.length === 0) problems.push('owner is missing');

    var namesOk = Array.isArray(def.names) && def.names.length > 0;
    if (!namesOk) {
      problems.push('names is missing or empty');
    } else {
      for (var n = 0; n < def.names.length; n++) {
        if (typeof def.names[n] !== 'string' || def.names[n].length === 0) {
          problems.push('names[' + n + '] is not a name');
        } else if (def.names.indexOf(def.names[n]) !== n) {
          problems.push('frame name "' + def.names[n] + '" is used more than once');
        }
      }
    }

    if (!Array.isArray(def.frames) || def.frames.length === 0) {
      problems.push('frames is missing or empty');
      return problems;
    }
    if (namesOk && def.frames.length !== def.names.length) {
      problems.push('frames.length is ' + def.frames.length + ' but names.length is ' + def.names.length);
    }
    if (!sizeOk) return problems;

    var keys = TG.PAL_KEYS;
    for (var f = 0; f < def.frames.length; f++) {
      var frame = def.frames[f];

      if (isPlainObject(frame)) {
        // { copy: 2, flipX: true }: another frame of the same sprite, optionally mirrored.
        var copyKeys = Object.keys(frame);
        for (var c = 0; c < copyKeys.length; c++) {
          if (copyKeys[c] !== 'copy' && copyKeys[c] !== 'flipX') {
            problems.push('frame ' + f + ': "' + copyKeys[c] + '" is not allowed in a copied frame (only copy and flipX)');
          }
        }
        if (!isNumber(frame.copy) || Math.floor(frame.copy) !== frame.copy || frame.copy < 0 || frame.copy >= def.frames.length) {
          problems.push('frame ' + f + ': copy does not name a frame of this sprite');
        } else if (frame.copy === f) {
          problems.push('frame ' + f + ': copies itself');
        } else if (!Array.isArray(def.frames[frame.copy])) {
          problems.push('frame ' + f + ': copies frame ' + frame.copy + ', which is not pixel data');
        }
        if (hasOwn(frame, 'flipX') && typeof frame.flipX !== 'boolean') {
          problems.push('frame ' + f + ': flipX is not true or false');
        }
        continue;
      }

      if (!Array.isArray(frame)) {
        problems.push('frame ' + f + ' is neither rows of pixels nor a copy');
        continue;
      }
      if (frame.length !== def.h) {
        problems.push('frame ' + f + ' has ' + frame.length + ' rows, expected ' + def.h);
      }
      var opaque = 0;
      var badChars = {};
      for (var y = 0; y < frame.length; y++) {
        var row = frame[y];
        if (typeof row !== 'string') {
          problems.push('frame ' + f + ' row ' + y + ' is not a string');
          continue;
        }
        if (row.length !== def.w) {
          problems.push('frame ' + f + ' row ' + y + ' has ' + row.length + ' characters, expected ' + def.w);
        }
        for (var x = 0; x < row.length; x++) {
          var ch = row.charAt(x);
          if (ch === '.') continue;
          if (keys.indexOf(ch) === -1) {
            if (!badChars[ch]) {
              badChars[ch] = true;
              problems.push('frame ' + f + ' row ' + y + ' has the character "' + ch + '", which is not a palette key');
            }
          } else {
            opaque++;
          }
        }
      }
      if (opaque === 0) problems.push('frame ' + f + ' is entirely transparent');
    }
    return problems;
  }

  TG.Sprites = {
    // Array of { name, w, h, frames, ax, ay, owner } (plus fps and names) transcribed from section 6.4.
    MANIFEST: buildManifest(),

    // Stores def; throws if name is already defined or def fails TG.Sprites.check.
    define: function (name, def) {
      if (typeof name !== 'string' || name.length === 0) {
        throw new Error('TG.Sprites.define: the sprite name is missing');
      }
      if (hasOwn(spriteDefs, name)) {
        throw new Error('TG.Sprites.define: "' + name + '" is already defined');
      }
      var problems = checkSprite(def);
      if (problems.length > 0) {
        throw new Error('TG.Sprites.define: "' + name + '" is not valid: ' + problems.join('; '));
      }
      spriteDefs[name] = def;
      spriteOrder.push(name);
    },

    get: function (name) {
      return hasOwn(spriteDefs, name) ? spriteDefs[name] : null;
    },

    has: function (name) {
      return hasOwn(spriteDefs, name);
    },

    // Names in the order they were defined.
    names: function () {
      return spriteOrder.slice();
    },

    // Format problems (section 6.1); empty when valid.
    check: checkSprite,

    // Manifest names for owner ('C' or 'D', or undefined for all) that are undefined or differ in size or frame count.
    missing: function (owner) {
      var out = [];
      var list = TG.Sprites.MANIFEST;
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (owner !== undefined && owner !== null && m.owner !== owner) continue;
        var def = hasOwn(spriteDefs, m.name) ? spriteDefs[m.name] : null;
        if (!def || def.w !== m.w || def.h !== m.h || def.frames.length !== m.frames) out.push(m.name);
      }
      return out;
    }
  };

  TG.Remaps = TG.Remaps || {};       // name -> { fromIndex: toIndex, ... }. '*' means "every opaque colour"
  TG.Backdrops = TG.Backdrops || {}; // id -> backdrop definition (section 6.5)
  TG.Levels = TG.Levels || {};       // level id -> level data (section 5.9)

  // ---------------------------------------------------------------------------------------------
  // Sections 4.4 and 5.12: TG.Save
  // ---------------------------------------------------------------------------------------------

  // name, score, wpm, accuracy, rank; highest first.
  var SEED_SCORES = {
    easy:   [['PIP', 16000, 18, 96, 'A'], ['INK', 12000, 15, 94, 'A'], ['DOT', 9000, 13, 92, 'B'], ['TAB', 6000, 11, 90, 'B'], ['CAP', 3000, 9, 88, 'B']],
    medium: [['PIP', 40000, 34, 96, 'A'], ['INK', 30000, 30, 94, 'A'], ['DOT', 22000, 27, 92, 'B'], ['TAB', 15000, 24, 90, 'B'], ['CAP', 8000, 21, 88, 'B']],
    hard:   [['PIP', 70000, 55, 96, 'A'], ['INK', 52000, 50, 94, 'A'], ['DOT', 38000, 46, 92, 'B'], ['TAB', 26000, 42, 90, 'B'], ['CAP', 14000, 38, 88, 'B']]
  };

  var TRI_STATE = ['auto', 'on', 'off'];
  var RANKS = ['S', 'A', 'B', 'C'];

  var storage = null;        // the localStorage object kept by init, or null

  function seededScores(difficulty) {
    var rows = SEED_SCORES[difficulty];
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      out.push({ name: rows[i][0], score: rows[i][1], wpm: rows[i][2], accuracy: rows[i][3], rank: rows[i][4],
        cleared: true, date: '' });
    }
    return out;
  }

  function defaultSettings() {
    return {
      music: true,
      sfx: true,
      crt: 'auto',            // 'auto' | 'on' | 'off'
      reduceFlash: false,
      keyGuide: 'auto',       // 'auto' | 'on' | 'off'
      adaptive: true,
      tutorialDone: false,
      lastDifficulty: 'medium',
      initials: 'PIP'
    };
  }

  function defaultData() {
    return {
      version: 1,
      settings: defaultSettings(),
      scores: { easy: seededScores('easy'), medium: seededScores('medium'), hard: seededScores('hard') },
      best: { easy: { wpm: 0, score: 0 }, medium: { wpm: 0, score: 0 }, hard: { wpm: 0, score: 0 } },
      assist: { easy: 1, medium: 1, hard: 1 }
    };
  }

  function cleanInitials(v, fallback) {
    if (typeof v !== 'string') return fallback;
    var s = v.toUpperCase().replace(/[^A-Z]/g, '');
    if (s.length === 0) return fallback;
    while (s.length < 3) s += 'A';
    return s.slice(0, 3);
  }

  function cleanEntry(e) {
    if (!isPlainObject(e) || !isNumber(e.score) || e.score < 0) return null;
    return {
      name: cleanInitials(e.name, 'AAA'),
      score: Math.floor(e.score),
      wpm: isNumber(e.wpm) && e.wpm > 0 ? Math.round(e.wpm) : 0,
      accuracy: isNumber(e.accuracy) ? Math.round(TG.Util.clamp(e.accuracy, 0, 100)) : 0,
      rank: RANKS.indexOf(e.rank) !== -1 ? e.rank : 'C',
      cleared: e.cleared === true,
      date: typeof e.date === 'string' ? e.date : ''
    };
  }

  function sortScores(list) {
    // Highest first; entries with equal scores keep their order.
    var tagged = [];
    for (var i = 0; i < list.length; i++) tagged.push({ e: list[i], i: i });
    tagged.sort(function (a, b) { return (b.e.score - a.e.score) || (a.i - b.i); });
    var out = [];
    for (i = 0; i < tagged.length; i++) out.push(tagged[i].e);
    return out;
  }

  function cleanScores(raw, difficulty) {
    var slots = TG.C.SCORE_SLOTS;
    var out = [];
    var i;
    if (Array.isArray(raw)) {
      for (i = 0; i < raw.length; i++) {
        var e = cleanEntry(raw[i]);
        if (e) out.push(e);
      }
    }
    out = sortScores(out);
    if (out.length < slots) {
      // Fill the empty places from the seeded table, lowest places last.
      var seeds = seededScores(difficulty);
      for (i = 0; i < seeds.length && out.length < slots; i++) out.push(seeds[i]);
      out = sortScores(out);
    }
    return out.slice(0, slots);
  }

  function clampAssist(v) {
    if (!isNumber(v)) return 1;
    return TG.Util.clamp(v, TG.C.ASSIST_MIN_CONTINUE, TG.C.ASSIST_MAX);
  }

  // Builds valid data from anything: fields that are missing or of the wrong kind take their default.
  function cleanData(raw) {
    var d = defaultData();
    if (!isPlainObject(raw) || raw.version !== 1) return d;

    var s = raw.settings;
    if (isPlainObject(s)) {
      var k;
      for (k in s) {
        if (!hasOwn(s, k)) continue;
        var v = s[k];
        if (hasOwn(d.settings, k)) {
          if (k === 'crt' || k === 'keyGuide') {
            if (TRI_STATE.indexOf(v) !== -1) d.settings[k] = v;
          } else if (k === 'lastDifficulty') {
            if (DIFFICULTY_NAMES.indexOf(v) !== -1) d.settings[k] = v;
          } else if (k === 'initials') {
            d.settings[k] = cleanInitials(v, d.settings[k]);
          } else if (typeof v === 'boolean') {
            d.settings[k] = v;
          }
        } else if (typeof v === 'boolean' || typeof v === 'string' || isNumber(v)) {
          d.settings[k] = v;       // a setting this version does not know: kept as it is
        }
      }
    }

    for (var i = 0; i < DIFFICULTY_NAMES.length; i++) {
      var name = DIFFICULTY_NAMES[i];
      if (isPlainObject(raw.scores)) d.scores[name] = cleanScores(raw.scores[name], name);
      if (isPlainObject(raw.best) && isPlainObject(raw.best[name])) {
        var b = raw.best[name];
        d.best[name] = {
          wpm: isNumber(b.wpm) && b.wpm > 0 ? b.wpm : 0,
          score: isNumber(b.score) && b.score > 0 ? Math.floor(b.score) : 0
        };
      }
      if (isPlainObject(raw.assist)) d.assist[name] = clampAssist(raw.assist[name]);
    }
    return d;
  }

  function currentData() {
    if (!isPlainObject(TG.Save.data)) TG.Save.data = defaultData();
    return TG.Save.data;
  }

  function knownDifficulty(name) {
    return typeof name === 'string' && DIFFICULTY_NAMES.indexOf(name) !== -1;
  }

  function scoreList(difficulty) {
    var data = currentData();
    if (!isPlainObject(data.scores)) data.scores = {};
    if (!Array.isArray(data.scores[difficulty]) || data.scores[difficulty].length !== TG.C.SCORE_SLOTS) {
      data.scores[difficulty] = cleanScores(data.scores[difficulty], difficulty);
    }
    return data.scores[difficulty];
  }

  TG.Save = {
    // The current data. Equals defaults() from load time until load() is called.
    data: defaultData(),

    // root: the window object. Keeps root.localStorage, or null if reading it throws or it is missing.
    init: function (rootObject) {
      storage = null;
      try {
        var s = rootObject ? rootObject.localStorage : null;
        if (s && typeof s.getItem === 'function' && typeof s.setItem === 'function') storage = s;
      } catch (e) {
        storage = null;
      }
    },

    // Reads and validates; falls back to defaults. The result is also at TG.Save.data.
    // Without working storage the module works from memory: the data in memory is kept (after validation).
    load: function () {
      var text = null;
      var readOk = false;
      if (storage) {
        try {
          text = storage.getItem(TG.C.STORAGE_KEY);
          readOk = true;
        } catch (e) {
          readOk = false;
        }
      }
      if (!readOk) {
        TG.Save.data = cleanData(TG.Save.data);
        return TG.Save.data;
      }
      var parsed = null;
      if (typeof text === 'string' && text.length > 0) {
        try {
          parsed = JSON.parse(text);
        } catch (e2) {
          parsed = null;
        }
      }
      TG.Save.data = cleanData(parsed);
      return TG.Save.data;
    },

    // Writes TG.Save.data; false if storage failed or is missing.
    save: function () {
      if (!storage) return false;
      try {
        storage.setItem(TG.C.STORAGE_KEY, JSON.stringify(currentData()));
        return true;
      } catch (e) {
        return false;
      }
    },

    // A fresh default object.
    defaults: function () {
      return defaultData();
    },

    getSetting: function (key) {
      var data = currentData();
      if (!isPlainObject(data.settings)) data.settings = defaultSettings();
      return data.settings[key];
    },

    // Also saves.
    setSetting: function (key, value) {
      var data = currentData();
      if (!isPlainObject(data.settings)) data.settings = defaultSettings();
      data.settings[key] = value;
      TG.Save.save();
    },

    // Copy, highest first, length SCORE_SLOTS.
    scores: function (difficulty) {
      if (!knownDifficulty(difficulty)) return [];
      return deepCopy(scoreList(difficulty));
    },

    // score > lowest entry and score > 0
    qualifies: function (difficulty, score) {
      if (!knownDifficulty(difficulty) || !isNumber(score) || score <= 0) return false;
      var list = scoreList(difficulty);
      return score > list[list.length - 1].score;
    },

    // 0-based position, or -1; also saves.
    addScore: function (difficulty, entry) {
      if (!knownDifficulty(difficulty)) return -1;
      var e = cleanEntry(entry);
      if (!e || !TG.Save.qualifies(difficulty, e.score)) return -1;
      var list = scoreList(difficulty);
      var pos = list.length;
      for (var i = 0; i < list.length; i++) {
        if (e.score > list[i].score) { pos = i; break; }
      }
      list.splice(pos, 0, e);
      list.length = TG.C.SCORE_SLOTS;
      TG.Save.save();
      return pos;
    },

    // { wpm, score }: the personal bests for the difficulty.
    best: function (difficulty) {
      var data = currentData();
      var b = knownDifficulty(difficulty) && isPlainObject(data.best) ? data.best[difficulty] : null;
      return {
        wpm: b && isNumber(b.wpm) ? b.wpm : 0,
        score: b && isNumber(b.score) ? b.score : 0
      };
    },

    // The saved assist value for the difficulty, clamped to ASSIST_MIN_CONTINUE..ASSIST_MAX; 1 when nothing is saved.
    assist: function (difficulty) {
      var data = currentData();
      if (!knownDifficulty(difficulty) || !isPlainObject(data.assist)) return 1;
      return clampAssist(data.assist[difficulty]);
    },

    // Updates best wpm and best score for result.difficulty and stores result.assist; also saves. A run
    // played with adaptive pacing off (result.adaptive === false) keeps the saved assist value as it was.
    recordRun: function (result) {
      if (!isPlainObject(result) || !knownDifficulty(result.difficulty)) return;
      var data = currentData();
      var d = result.difficulty;
      var b = TG.Save.best(d);
      var wpm = isPlainObject(result.typing) ? result.typing.wpm : undefined;
      if (isNumber(wpm) && wpm > b.wpm) b.wpm = wpm;
      if (isNumber(result.score) && result.score > b.score) b.score = Math.floor(result.score);
      if (!isPlainObject(data.best)) data.best = {};
      data.best[d] = b;
      if (isNumber(result.assist) && result.adaptive !== false) {
        if (!isPlainObject(data.assist)) data.assist = {};
        data.assist[d] = clampAssist(result.assist);
      }
      TG.Save.save();
    },

    // Returns the three score tables to the seeded entries and the personal bests to 0; also saves.
    resetScores: function () {
      var data = currentData();
      var fresh = defaultData();
      data.scores = fresh.scores;
      data.best = fresh.best;
      TG.Save.save();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
