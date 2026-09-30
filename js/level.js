// js/level.js
// SPELL RUNNER levels (WP-E). Defines TG.Level.
//
// Contract: docs/CONTRACT.md sections 4.14, 5.8 and 5.9. Design: docs/DESIGN.md sections 5, 6 and 11.
//
// A level is registered as data in TG.Levels (js/levels/level1.js). TG.Level.build turns that data
// into the runtime level for one difficulty: positions in world px, hazards with their input windows,
// the spawn list, ink drop positions and checkpoints. TG.Level.update is called by TG.Game once per
// step on the 'playing' screen and handles sections, checkpoints, spawn triggers, hazard cues and
// the start of the boss arena.
//
// File layout:
//   1. helpers
//   2. validate (rules V1 to V11)
//   3. build and the runtime queries (isGround, gapAt, sectionAt, makeItems)
//   4. update, checkpoints and resetFrom
//
// Fields added to the runtime objects beyond CONTRACT 5.8 and 5.9 (read-only for other modules):
//   hazard.struck       true once the hazard has hurt Pip on this pass; cleared by resetFrom
//   spawn.tile          the trigger tile from the data
//   spawn.section       the section index of the trigger point (word length and tier mix use it)
//   level.lengthTiles   as in the data
//   level.warnX         world px at which boss:warning is emitted (lengthTiles - 12 tiles)
//   level.warned        boss:warning has been emitted on this pass
//
// This is a simulation module: no Math.random, no Date, no timers, no DOM.
(function (root) {
  'use strict';
  var TG = root.TG = root.TG || {};

  // ---------------------------------------------------------------------------------------------
  // 1. Helpers
  // ---------------------------------------------------------------------------------------------

  var HAZARD_KINDS = {
    bramble: { action: 'jump', hold: false },
    branch:  { action: 'duck', hold: false },
    beehive: { action: 'duck', hold: false },
    arch:    { action: 'duck', hold: true }
  };
  var POWERS = ['shield', 'hourglass', 'quill', 'blast', 'cap'];
  // Used by validate when entities.js is not loaded.
  var FALLBACK_SPAWN_KINDS = {
    boulder: 'threat', dawdle: 'threat', hoppet: 'threat', buzzle: 'threat', swoop: 'threat',
    truffle: 'threat', digby: 'threat', rock: 'threat', crate: 'crate'
  };
  var ARC_OFFSETS = [-16, -8, 0, 8, 16];     // px from the gap's centre (DESIGN Appendix B)
  var ARC_TAKEOFF = 24;                      // the arc is that of a jump taking off 24 px before the centre
  var ARC_CAP = 36;                          // highest drop, px above the ground
  var UNDER_STEP = 8;                        // px between drops under a hazard
  // Where the signpost stands (hazard.postX, DESIGN 5). A gap's window starts at the first take-off that
  // still reaches the far edge, so the post stands at the take-off of the ink arc instead; for the other
  // hazards it stands this far into the window. A press anywhere from about 10 px before the post to
  // 10 px after it clears the hazard on every difficulty (check jump-geometry in test/sim.js).
  var POST_IN = { bramble: 10, duck: 12 };

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function isObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function emit(name, payload) {
    if (TG.Events && TG.Events.emit) TG.Events.emit(name, payload);
  }

  function difficultyNames() {
    return (TG.Difficulty && TG.Difficulty.NAMES) || ['easy', 'medium', 'hard'];
  }

  function includes(difficulty, tag) {
    if (tag === undefined || tag === null) return true;
    return TG.Difficulty.includes(difficulty, tag);
  }

  function spawnType(kind) {
    var kinds = TG.Entities && TG.Entities.KINDS;
    if (kinds) return hasOwn(kinds, kind) ? kinds[kind].type : null;
    return hasOwn(FALLBACK_SPAWN_KINDS, kind) ? FALLBACK_SPAWN_KINDS[kind] : null;
  }

  function byX(a, b) {
    return a.x - b.x;
  }

  // Array.prototype.sort is stable in every engine this game supports; the index keeps it so anyway.
  function stableSort(list, compare) {
    var tagged = list.map(function (v, i) { return { v: v, i: i }; });
    tagged.sort(function (a, b) { return compare(a.v, b.v) || (a.i - b.i); });
    return tagged.map(function (t) { return t.v; });
  }

  // The payload of section:enter for a section index (3 = arena).
  function sectionPayload(level, index) {
    var s = index === 3 ? level.arena : level.sections[index];
    return { index: index, name: s.name, stage: s.stage, palette: s.palette, music: s.music };
  }

  // ---------------------------------------------------------------------------------------------
  // 2. validate: rules V1 to V11 of CONTRACT 5.9
  // ---------------------------------------------------------------------------------------------

  function validate(data) {
    var problems = [];
    function bad(code, text) { problems.push(code + ': ' + text); }

    if (!isObject(data)) return ['V1: the level data is not an object'];
    var length = data.lengthTiles;
    if (!isNum(length) || length <= 0) bad('V1', 'lengthTiles is missing or not a positive number');

    var gaps = Array.isArray(data.gaps) ? data.gaps : [];
    var hazards = Array.isArray(data.hazards) ? data.hazards : [];
    var spawns = Array.isArray(data.spawns) ? data.spawns : [];
    var ink = Array.isArray(data.ink) ? data.ink : [];
    if (!Array.isArray(data.gaps)) bad('V2', 'gaps is not a list');
    if (!Array.isArray(data.hazards)) bad('V3', 'hazards is not a list');
    if (!Array.isArray(data.spawns)) bad('V5', 'spawns is not a list');
    if (!Array.isArray(data.ink)) bad('V8', 'ink is not a list');

    // V1: sections and checkpoints
    var sections = Array.isArray(data.sections) ? data.sections : [];
    if (sections.length === 0) {
      bad('V1', 'there are no sections');
    } else {
      if (sections[0].from !== 0) bad('V1', 'the first section does not start at tile 0');
      for (var i = 0; i < sections.length; i++) {
        var s = sections[i];
        if (!isObject(s) || !isNum(s.from) || !isNum(s.to) || s.from >= s.to) {
          bad('V1', 'section ' + i + ' has no valid from and to');
          continue;
        }
        if (i > 0 && sections[i - 1] && s.from !== sections[i - 1].to) {
          bad('V1', 'section ' + i + ' does not start where section ' + (i - 1) + ' ends');
        }
      }
      var last = sections[sections.length - 1];
      if (isObject(last) && last.to !== length) bad('V1', 'the last section does not end at lengthTiles');
      var expected = [0];
      for (i = 1; i < sections.length; i++) expected.push(isObject(sections[i]) ? sections[i].from : NaN);
      expected.push(length);
      if (!Array.isArray(data.checkpoints) || JSON.stringify(data.checkpoints) !== JSON.stringify(expected)) {
        bad('V1', 'checkpoints should be ' + JSON.stringify(expected));
      }
    }

    // Entry shapes
    var names = difficultyNames();
    function checkMin(code, what, entry) {
      if (entry.min !== undefined && names.indexOf(entry.min) === -1) bad(code, what + ' has an unknown min "' + entry.min + '"');
    }
    gaps.forEach(function (g, n) {
      if (!isObject(g) || !isNum(g.x)) { bad('V2', 'gap ' + n + ' has no x'); return; }
      if (g.w !== 1 && g.w !== 2) bad('V2', 'gap at tile ' + g.x + ' has w ' + g.w + ' (1 or 2)');
      checkMin('V5', 'gap at tile ' + g.x, g);
    });
    hazards.forEach(function (h, n) {
      if (!isObject(h) || !isNum(h.x)) { bad('V3', 'hazard ' + n + ' has no x'); return; }
      if (!hasOwn(HAZARD_KINDS, h.kind)) bad('V3', 'hazard at tile ' + h.x + ' has an unknown kind "' + h.kind + '"');
      if (h.kind === 'arch' && h.w !== 3) bad('V9', 'arch at tile ' + h.x + ' has w ' + h.w + ' (must be 3)');
      checkMin('V5', 'hazard at tile ' + h.x, h);
    });

    // V2: ground between gaps
    var sortedGaps = stableSort(gaps.filter(function (g) { return isObject(g) && isNum(g.x); }), byX);
    for (i = 1; i < sortedGaps.length; i++) {
      var prev = sortedGaps[i - 1], next = sortedGaps[i];
      var ground = next.x - (prev.x + (prev.w || 1));
      if (ground < 4) bad('V2', 'only ' + ground + ' tiles of ground between the gaps at ' + prev.x + ' and ' + next.x);
    }

    // V3: jump and duck hazards at least 6 tiles apart
    var jumps = [], ducks = [];
    sortedGaps.forEach(function (g) { jumps.push(g); });
    hazards.forEach(function (h) {
      if (!isObject(h) || !isNum(h.x) || !hasOwn(HAZARD_KINDS, h.kind)) return;
      if (HAZARD_KINDS[h.kind].action === 'jump') jumps.push(h); else ducks.push(h);
    });
    jumps.forEach(function (j) {
      ducks.forEach(function (d) {
        if (Math.abs(j.x - d.x) < 6) bad('V3', 'jump hazard at tile ' + j.x + ' and duck hazard at tile ' + d.x + ' are less than 6 tiles apart');
      });
    });

    // V4: clear of checkpoints and of the arena
    var cps = Array.isArray(data.checkpoints) ? data.checkpoints : [];
    var clear = TG.C.CHECKPOINT_CLEAR;
    jumps.concat(ducks).forEach(function (h) {
      var w = isNum(h.w) ? h.w : 1;
      cps.forEach(function (c) {
        if (h.x >= c && h.x < c + clear) bad('V4', 'hazard at tile ' + h.x + ' is within ' + clear + ' tiles after the checkpoint at ' + c);
      });
      if (isNum(length) && h.x + w - 1 >= length - 16) bad('V4', 'hazard at tile ' + h.x + ' reaches ' + (length - 16) + ' or beyond');
    });

    // V5, V6, V7: spawns
    var threats = [];
    spawns.forEach(function (sp, n) {
      if (!isObject(sp) || !isNum(sp.x)) { bad('V5', 'spawn ' + n + ' has no x'); return; }
      var type = spawnType(sp.kind);
      if (type !== 'threat' && type !== 'crate') {
        bad('V5', 'spawn at tile ' + sp.x + ' has kind "' + sp.kind + '", which is not a threat or crate kind');
        return;
      }
      if (type === 'crate' && POWERS.indexOf(sp.power) === -1) bad('V5', 'crate at tile ' + sp.x + ' has an unknown power "' + sp.power + '"');
      checkMin('V5', 'spawn at tile ' + sp.x, sp);
      if (type === 'threat') {
        threats.push(sp);
        if (isNum(length) && sp.x > length - 32) bad('V7', 'threat at tile ' + sp.x + ' is beyond tile ' + (length - 32));
      }
      if (data.tutorial !== true && sp.tutorial) bad('V6', 'spawn at tile ' + sp.x + ' is tagged tutorial but the level has no tutorial');
    });
    if (data.tutorial === true) {
      var firstThree = stableSort(threats, byX).slice(0, 3);
      if (firstThree.length < 3) bad('V6', 'the level has fewer than three threat spawns for the tutorial');
      firstThree.forEach(function (sp) {
        var easy = sp.min === undefined || sp.min === 'easy';
        if (!easy || sp.tutorial !== true) bad('V6', 'threat at tile ' + sp.x + ' is one of the first three and must be tagged easy and tutorial');
      });
    }

    // V8: ink entries
    ink.forEach(function (e, n) {
      if (!isObject(e)) { bad('V8', 'ink entry ' + n + ' is not an object'); return; }
      if (e.shape === 'arc') {
        var found = gaps.some(function (g) { return isObject(g) && g.x === e.gap; });
        if (!found) bad('V8', 'ink arc refers to tile ' + e.gap + ', where there is no gap');
      } else if (e.shape === 'under') {
        var hz = hazards.some(function (h) { return isObject(h) && h.x === e.hazard && HAZARD_KINDS[h.kind] && HAZARD_KINDS[h.kind].action === 'duck'; });
        if (!hz) bad('V8', 'ink under refers to tile ' + e.hazard + ', where there is no duck hazard');
      } else if (e.shape === 'row') {
        if (!isNum(e.x) || !isNum(e.n) || e.n < 1 || !isNum(e.step)) { bad('V8', 'ink row ' + n + ' needs x, n and step'); return; }
        for (var k = 0; k < e.n; k++) {
          var t = e.x + k * e.step;
          sortedGaps.forEach(function (g) {
            if (t >= g.x && t < g.x + (g.w || 1)) bad('V8', 'ink row at tile ' + e.x + ' has a drop over the gap at tile ' + g.x);
          });
        }
      } else {
        bad('V8', 'ink entry ' + n + ' has an unknown shape "' + e.shape + '"');
      }
    });

    // V10: the tune block
    if (data.tune !== undefined) {
      if (!isObject(data.tune)) {
        bad('V10', 'tune is not an object');
      } else {
        var tunable = (TG.Difficulty && TG.Difficulty.TUNABLE) || [];
        Object.keys(data.tune).forEach(function (part) {
          if (part !== 'all' && names.indexOf(part) === -1) { bad('V10', 'tune has the key "' + part + '"'); return; }
          if (!isObject(data.tune[part])) { bad('V10', 'tune.' + part + ' is not an object'); return; }
          Object.keys(data.tune[part]).forEach(function (k) {
            if (tunable.indexOf(k) === -1) bad('V10', 'tune.' + part + '.' + k + ' is not a tunable key');
          });
        });
      }
    }

    // V11: music
    var theme = isObject(data.theme) ? data.theme : {};
    var music = isObject(theme.music) ? theme.music : {};
    if (typeof music.level !== 'string' || typeof music.boss !== 'string') bad('V11', 'theme.music.level and theme.music.boss must be track names');
    sections.concat([data.arena]).forEach(function (s, n) {
      var m = isObject(s) && isObject(s.music) ? s.music : null;
      if (!m || !isNum(m.transpose) || !isNum(m.tempo)) {
        bad('V11', (n < sections.length ? 'section ' + n : 'the arena') + ' needs music.transpose and music.tempo as numbers');
      }
    });

    return problems;
  }

  // ---------------------------------------------------------------------------------------------
  // 3. build and the runtime queries
  // ---------------------------------------------------------------------------------------------

  function windowFor(kind, x, w) {
    var C = TG.C;
    if (kind === 'gap') {
      return { winStart: x + w - C.GAP_WIN_BACK, winEnd: x + C.GAP_WIN_FWD, holdUntil: 0, postX: x + w / 2 - ARC_TAKEOFF };
    }
    if (kind === 'bramble') {
      var start = x - C.BRAMBLE_WIN_BACK;
      return { winStart: start, winEnd: x + C.BRAMBLE_WIN_FWD, holdUntil: 0, postX: start + POST_IN.bramble };
    }
    var holdUntil = kind === 'arch' ? x + w + C.HOLD_PAST : 0;
    var duckStart = x - C.DUCK_WIN_BACK;
    return { winStart: duckStart, winEnd: x + C.DUCK_WIN_FWD, holdUntil: holdUntil, postX: duckStart + POST_IN.duck };
  }

  // Collision box before the inset (CONTRACT 5.8).
  function boxFor(kind, w) {
    var C = TG.C;
    if (kind === 'gap') return { y: C.GROUND_Y, h: 32 };
    if (kind === 'bramble') return { y: C.GROUND_Y - C.BRAMBLE_H, h: C.BRAMBLE_H };
    return { y: C.PLAY_TOP, h: C.GROUND_Y - C.HANG_CLEAR - C.PLAY_TOP };
  }

  function sectionAt(level, x) {
    if (x >= level.arenaX) return 3;
    for (var i = 0; i < level.sections.length; i++) {
      if (x < level.sections[i].x1) return i;
    }
    return level.sections.length - 1;
  }

  function arcHeight(d) {
    var C = TG.C;
    var s = (d + ARC_TAKEOFF) / C.JUMP_DIST;
    return Math.min(ARC_CAP, Math.max(0, 4 * C.JUMP_HEIGHT * s * (1 - s)));
  }

  function build(data, config) {
    var problems = validate(data);
    if (problems.length > 0) {
      throw new Error('TG.Level.build: level ' + (isObject(data) ? data.id : data) + ' is not valid: ' + problems.join('; '));
    }
    var C = TG.C;
    var T = C.TILE;
    var diff = config.id;

    var level = {
      id: data.id,
      name: data.name,
      theme: data.theme,
      tutorial: data.tutorial === true,
      lengthTiles: data.lengthTiles,
      lengthPx: data.lengthTiles * T,
      arenaX: data.lengthTiles * T,
      arenaTilesX: (isNum(data.arena.arenaTilesFrom) ? data.arena.arenaTilesFrom : data.lengthTiles) * T,
      sections: [],
      arena: null,
      checkpoints: [],
      hazards: [],
      spawns: [],
      ink: [],
      decor: [],
      boss: data.boss || null,
      warnX: (data.lengthTiles - 12) * T,
      warned: false
    };

    data.sections.forEach(function (s, i) {
      level.sections.push({
        index: i, name: s.name, stage: s.stage, x0: s.from * T, x1: s.to * T,
        palette: s.palette, music: s.music, gapFill: s.gapFill
      });
    });
    level.arena = {
      index: 3, name: data.arena.name, stage: data.arena.stage, palette: data.arena.palette, music: data.arena.music
    };

    data.checkpoints.forEach(function (tile, i) {
      level.checkpoints.push({
        index: i,
        x: i === 0 ? C.HERO_SCREEN_X : tile * T,
        flagX: tile * T,
        raised: i === 0
      });
    });

    // Hazards. Ids come from the full list sorted by x, so a hazard has the same id on every difficulty.
    var all = [];
    data.gaps.forEach(function (g) { all.push({ entry: g, kind: 'gap' }); });
    data.hazards.forEach(function (h) { all.push({ entry: h, kind: h.kind }); });
    all = stableSort(all, function (a, b) { return a.entry.x - b.entry.x; });
    var prompts = { jump: 0, duck: 0 };
    all.forEach(function (item, n) {
      var e = item.entry;
      var kind = item.kind;
      var used = includes(diff, e.min);
      if (kind !== 'gap' && !used) return;             // a hazard below its min is absent
      var x = e.x * T;
      var w = (kind === 'gap' ? e.w : (kind === 'arch' ? e.w : 1)) * T;
      var win = windowFor(kind, x, w);
      var box = boxFor(kind, w);
      var action = kind === 'gap' ? 'jump' : HAZARD_KINDS[kind].action;
      var bridged = kind === 'gap' && !used;           // a gap below its min is bridged from the start
      // Key prompts (presentation only): the first keyPrompts hazards of each action, and on a difficulty
      // with prompts also every arch, the one hazard that needs the key held (DESIGN 5).
      var kp = config.keyPrompts || 0;
      var prompt = false;
      if (!bridged && (prompts[action] < kp || (kind === 'arch' && kp > 0))) {
        prompts[action]++;
        prompt = true;
      }
      level.hazards.push({
        id: 'h' + n,
        kind: kind,
        action: action,
        hold: kind === 'arch',
        x: x, y: box.y, w: w, h: box.h,
        winStart: win.winStart, winEnd: win.winEnd, holdUntil: win.holdUntil,
        postX: win.postX,
        bridged: bridged,
        falls: 0,
        cued: false,
        passed: false,
        prompt: prompt,
        section: 0,
        struck: false
      });
    });
    level.hazards.forEach(function (h) { h.section = sectionAt(level, h.x); });

    // Spawns for this difficulty.
    var spawns = [];
    data.spawns.forEach(function (sp) {
      if (!includes(diff, sp.min)) return;
      spawns.push({
        x: sp.x * T, tile: sp.x, kind: sp.kind, power: sp.power || null,
        tutorial: sp.tutorial === true, intro: sp.intro === true,
        section: 0, done: false, waiting: false, retryT: 0
      });
    });
    level.spawns = stableSort(spawns, byX);
    level.spawns.forEach(function (sp) { sp.section = sectionAt(level, sp.x); });

    // Ink drops (DESIGN Appendix B).
    var drops = [];
    data.ink.forEach(function (e) {
      var k, base;
      if (e.shape === 'row') {
        for (k = 0; k < e.n; k++) drops.push({ x: (e.x + k * e.step) * T + T / 2, y: C.GROUND_Y - 4 });
      } else if (e.shape === 'arc') {
        var gap = null;
        data.gaps.forEach(function (g) { if (g.x === e.gap) gap = g; });
        base = gap.x * T + gap.w * T / 2;
        ARC_OFFSETS.forEach(function (d) { drops.push({ x: base + d, y: C.GROUND_Y - arcHeight(d) }); });
      } else if (e.shape === 'under') {
        var hz = null;
        data.hazards.forEach(function (h) { if (h.x === e.hazard && h.kind !== 'bramble') hz = h; });
        if (!includes(diff, hz.min)) return;            // absent on this difficulty, and its drops with it
        var w = (hz.kind === 'arch' ? hz.w : 1) * T;
        var n = hz.kind === 'arch' ? 5 : 3;
        base = hz.x * T + w / 2 - UNDER_STEP * (n - 1) / 2;
        for (k = 0; k < n; k++) drops.push({ x: base + k * UNDER_STEP, y: C.GROUND_Y - 4 });
      }
    });
    drops = stableSort(drops, function (a, b) { return a.x - b.x; });
    drops.forEach(function (d, i) { level.ink.push({ id: 'i' + i, x: d.x, y: d.y }); });

    (data.decor || []).forEach(function (d) {
      level.decor.push({ x: d.x * T, y: C.GROUND_Y, sprite: d.sprite });
    });

    return level;
  }

  function isGround(level, x) {
    if (x < 0 || x >= level.arenaX) return true;
    var hz = level.hazards;
    for (var i = 0; i < hz.length; i++) {
      var h = hz[i];
      if (h.kind !== 'gap' || h.bridged) continue;
      if (x >= h.x && x < h.x + h.w) return false;
    }
    return true;
  }

  function gapAt(level, x) {
    var hz = level.hazards;
    for (var i = 0; i < hz.length; i++) {
      var h = hz[i];
      if (h.kind === 'gap' && x >= h.x && x < h.x + h.w) return h;
    }
    return null;
  }

  function makeItems(level, fromX) {
    var out = [];
    for (var i = 0; i < level.ink.length; i++) {
      var d = level.ink[i];
      if (d.x >= fromX) out.push({ id: d.id, x: d.x, y: d.y, w: 8, h: 8 });
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // 4. update, checkpoints and resetFrom
  // ---------------------------------------------------------------------------------------------

  // DESIGN 6 "Checkpoints": bonus, lives top-up, bank, banner.
  function passCheckpoint(state, cp) {
    var C = TG.C;
    var config = state.config;
    var player = state.player;
    cp.raised = true;

    var sec = TG.Typing.sectionSummary(state.typing);
    var bonus = 0;
    if (sec.correct + sec.wrong > 0 && sec.accuracy >= C.CP_ACC) bonus += C.PTS_CP_ACC;
    if (state.run.sectionLivesLost === 0) bonus += C.PTS_CP_NODAMAGE;

    if (config.checkpointLives > 0 && player.lives < config.checkpointLives) player.lives = config.checkpointLives;
    // The bonus is added before the score is banked, so that a continue does not take it away.
    if (bonus > 0) TG.Game.addScore(bonus, { reason: 'checkpoint', x: null, y: null });

    state.checkpoint = {
      index: cp.index, x: cp.x, score: state.score, ink: state.ink, inkTotal: state.inkTotal,
      nextLifeAt: state.nextLifeAt, bossPhase: 1, continuesHere: 0
    };
    TG.Typing.sectionReset(state.typing);
    state.run.sectionLivesLost = 0;

    emit('checkpoint', {
      index: cp.index, x: cp.x, wpm: sec.wpm, accuracy: sec.accuracy, bonus: bonus, lives: player.lives
    });
  }

  // Spawn triggers and retries. Threat entries leave in order: while an earlier threat entry is
  // waiting for a free slot, later threat entries wait behind it. Crates skip the cap and do not wait.
  function updateSpawns(state, wdt) {
    var C = TG.C;
    var spawns = state.level.spawns;
    var px = state.player.x;
    var blocked = false;
    for (var i = 0; i < spawns.length; i++) {
      var sp = spawns[i];
      if (sp.done) continue;
      if (px < sp.x) break;
      var isThreat = spawnType(sp.kind) === 'threat';
      if (isThreat && blocked) {
        if (!sp.waiting) { sp.waiting = true; sp.retryT = 0; }
        continue;
      }
      if (sp.waiting && sp.retryT > 0) {
        sp.retryT -= wdt;
        if (sp.retryT > 1e-9) {
          if (isThreat) blocked = true;
          continue;
        }
      }
      var entity = TG.Entities.spawn(state, sp);
      if (entity) {
        sp.done = true;
        sp.waiting = false;
        sp.retryT = 0;
      } else {
        sp.waiting = true;
        sp.retryT = C.SPAWN_RETRY;
        if (isThreat) blocked = true;
      }
    }
  }

  function updateCues(state) {
    var hz = state.level.hazards;
    var px = state.player.x;
    for (var i = 0; i < hz.length; i++) {
      var h = hz[i];
      if (h.cued || h.bridged || px < h.winStart) continue;
      h.cued = true;
      if (px > h.winEnd) continue;                 // passed the whole window (a rescue): no cue
      emit('hazard:cue', {
        id: h.id, kind: h.kind, action: h.action, hold: h.hold, sound: !!state.config.hazardCue, prompt: h.prompt
      });
    }
  }

  function update(state, wdt) {
    var level = state.level;
    var player = state.player;
    if (!level || !player) return;

    // 1. Section change.
    var s = sectionAt(level, player.x);
    if (s !== state.section) {
      state.section = s;
      emit('section:enter', sectionPayload(level, s));
    }

    // 2. Checkpoint crossing.
    for (var i = 1; i < level.checkpoints.length; i++) {
      var cp = level.checkpoints[i];
      if (!cp.raised && player.x >= cp.x) passCheckpoint(state, cp);
    }

    // 3. Spawn triggers and retries (not once the arena has been reached).
    if (player.x < level.arenaX) updateSpawns(state, wdt);

    // 4. Hazard cues and the boss warning.
    updateCues(state);
    if (!level.warned && player.x >= level.warnX) {
      level.warned = true;
      emit('boss:warning', {});
    }

    // 5. Arena start.
    if (player.x >= level.arenaX && state.screen === 'playing') {
      TG.Entities.clearAll(state, 'flee');
      if (TG.Boss && TG.Boss.create) TG.Boss.create(state);
      TG.Game.setScreen('bossIntro');
      emit('boss:enter', {});
    }
  }

  function resetFrom(state, checkpointIndex) {
    var level = state.level;
    var cp = level.checkpoints[checkpointIndex] || level.checkpoints[0];
    var X = cp.flagX;
    var i;
    for (i = 0; i < level.spawns.length; i++) {
      var sp = level.spawns[i];
      sp.waiting = false;
      sp.retryT = 0;
      // Entries before the checkpoint that never appeared are dropped.
      sp.done = sp.x < X;
    }
    for (i = 0; i < level.hazards.length; i++) {
      var h = level.hazards[i];
      if (h.x + h.w > X) {
        h.cued = false;
        h.passed = false;
        h.struck = false;
      }
    }
    for (i = 0; i < level.checkpoints.length; i++) {
      if (i > cp.index) level.checkpoints[i].raised = false;
    }
    if (X < level.warnX) level.warned = false;
    var kept = (state.items || []).filter(function (item) { return item.x < X; });
    state.items = kept.concat(makeItems(level, X));
  }

  TG.Level = {
    validate: validate,
    build: build,
    isGround: isGround,
    gapAt: gapAt,
    sectionAt: sectionAt,
    update: update,
    resetFrom: resetFrom,
    makeItems: makeItems
  };
})(typeof window !== 'undefined' ? window : globalThis);
