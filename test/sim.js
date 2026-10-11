// test/sim.js
// SPELL RUNNER headless harness and test bot (WP-E). CONTRACT 10.2 to 10.4 and 12 (WP-E).
//
//   node test/sim.js                       the acceptance matrix (36 runs a level) and every extra check
//   node test/sim.js --level N             the same for one level (LEVELS below lists the levels built)
//   node test/sim.js --quick               the same for the first level only (as node test/run-all.js --quick runs it),
//                                          with the checks that only read a level's data for every level
//   node test/sim.js --milestone N         the runs and checks of WP-E milestone N (CONTRACT 12)
//   node test/sim.js --check NAME          one extra check, no matrix runs
//   node test/sim.js --measure             also a MEASURE line after each RUN line (LEVEL2 13.5: window use,
//                                          the fight, the arena flag, the watch crates, lives, the dangles)
//   node test/sim.js --difficulty medium --profile target --seed 1 --until boss --verbose
//   node test/sim.js --difficulty easy --wpm 12 --accuracy 0.9 --react 1.2   (one custom run, INFO)
//   node test/sim.js --help                the options
//
// As a module:  const { runBot } = require('./sim');  runBot({ difficulty, wpm, accuracy, react, ... })
//               levelId picks the level (1 without it) and startAssist the assist the run starts at (1
//               without it); the Session class in part 4 lists every option
//
// File layout:
//   1. tuning tables (CONSTANT_OVERRIDES, EXPECTED_COUNTS and the other tables keyed by level) and settings
//   2. Checker: the assertions of CONTRACT 10.3 that run inside every bot run
//   3. Bot: the behaviour of CONTRACT 10.3
//   4. Session and runBot
//   5. extra checks (CONTRACT 10.4 and the WP-E acceptance list of section 12)
//   6. the matrix, milestones, output and the command line
//
// All six WP-E milestones are built (MILESTONES_BUILT = 6). The runs and checks of each milestone are
// listed in MILESTONES and CHECK_LIST below; the check functions are in CHECKS. --milestone 6 runs the
// same as no arguments: the full matrix and every extra check.
'use strict';

const fs = require('fs');
const path = require('path');
const stubs = require('./stubs');

// ===============================================================================================
// 1. Tuning tables and settings
// ===============================================================================================

// CONTRACT 12.1: constants that WP-E needed changed. Passed to every stubs.load as `constants`.
// Each entry is also recorded in the "Tuning changes" list of js/levels/level1.js.
const CONSTANT_OVERRIDES = {};

// The levels the harness plays, in order. `--level N` picks one; with no option every level here is
// played. A level joins the list when its file is built and it has a row in each table below
// (LEVEL2 13.1 and 13.5).
const LEVELS = [1, 2];

// The tables below are keyed by level id.
// Threat words per section (DESIGN 11.2, LEVEL2 8.4) as amended by the "Tuning changes" list of the level's file.
const EXPECTED_COUNTS = {
  1: { easy: [11, 14, 14], medium: [12, 16, 19], hard: [18, 22, 20] },
  2: { easy: [13, 16, 15], medium: [15, 19, 19], hard: [21, 23, 22] }
};

// The design's counts as written (DESIGN 11.2 for Level 1, LEVEL2 8.4 for Level 2). Never changed: the
// `counts` check compares EXPECTED_COUNTS with it.
const DESIGN_COUNTS = {
  1: { easy: [11, 14, 14], medium: [12, 16, 19], hard: [18, 22, 20] },
  2: { easy: [13, 16, 15], medium: [15, 19, 19], hard: [21, 23, 22] }
};
// The threat entries of each kind on Easy / Medium / Hard, as the level's file has them (the `counts`
// check). The timelines are DESIGN 11.2 for Level 1 and LEVEL2 9.3 to 9.5 for Level 2; LEVEL2 8.6 gives the
// Dangle's 6 / 8 / 11 and the Flit's 5 / 8 / 10. A kind that is not named has no entry in the level. A
// change of kind is a tuning change: it goes in the "Tuning changes" list of the level's file and here.
const EXPECTED_KINDS = {
  1: { boulder: [8, 8, 8], dawdle: [3, 4, 7], hoppet: [9, 10, 14], buzzle: [9, 10, 13], swoop: [3, 6, 9], truffle: [4, 6, 6], digby: [3, 3, 3] },
  2: { boulder: [8, 8, 9], dawdle: [4, 5, 6], hoppet: [6, 6, 8], buzzle: [7, 8, 11], truffle: [5, 6, 7], digby: [3, 4, 4], dangle: [6, 8, 11], flit: [5, 8, 10] }
};
// The powers of the level's crates in the order they are met (the `counts` check; LEVEL2 6.2 for Level 2).
const DESIGN_CRATES = {
  1: ['shield', 'hourglass', 'cap', 'quill', 'blast', 'cap', 'shield'],
  2: ['shield', 'watch', 'hourglass', 'cap', 'quill', 'watch', 'blast', 'cap', 'shield']
};
// The word flavour whose lists the level's runs draw from, or null for a level that adds no words to the
// tiers (the `words-by-difficulty` check). Level 1's theme names `meadow`, which has no lists (js/words.js);
// Level 2's is `clockwork` (LEVEL2 section 7 and Appendix A).
const WORD_FLAVOUR = { 1: null, 2: 'clockwork' };
// Ink drops laid out on each difficulty (the `items-shape` check; LEVEL2 6.1 for Level 2).
const INK_COUNTS = { 1: { easy: 150, medium: 153, hard: 153 }, 2: { easy: 184, medium: 187, hard: 187 } };
// The tile of the first gap that is open on Easy (the `no-jump-bridge` check).
const FIRST_EASY_GAP = { 1: 106, 2: 72 };
// The target bot's run length in seconds, from and to (the `length` check; LEVEL2 8.4 for Level 2).
const LENGTH_BOUNDS = { 1: [240, 420], 2: [260, 440] };
// The boss of the level (the `boss-fight` check): its kind, its health and whether the phase 3 volley ends
// with the minion on each difficulty, and the sprite the minion is drawn with (none: the kind's own).
// DESIGN 11.6 and the tune block of js/levels/level1.js for Level 1; LEVEL2 8.2, 10.6 and 10.7 for Level 2.
const BOSS_EXPECTED = {
  1: { kind: 'baron', health: { easy: 3, medium: 5, hard: 7 }, minion: { easy: false, medium: true, hard: true }, minionSkin: null },
  2: { kind: 'ratchet', health: { easy: 3, medium: 6, hard: 7 }, minion: { easy: true, medium: true, hard: true }, minionSkin: 'en_baronet' }
};
// What a level is tuned to beyond the fixed pass conditions of CONTRACT 10.4 (the `targets` check and the
// watch row of `counts`). Level 2's are the table of LEVEL2 13.5; each bound applies to every seed. Level 1
// has none.
//   floorContinues  the floor bot's continues, at most, started at assist 1.0 and started at the assist a
//                   floor run of level `savedFrom` on the same difficulty and seed leaves saved
//   u               the target bot's mean window use, from and to. `uNoted` names a difficulty whose value
//                   under the band is reported and not failed: Easy, which the owner keeps at the plan's
//                   timing for M1 as the noted exception until the real creatures are measured (decision 1).
//                   `uNotedFrom` is how far under it may be. It is the harness's guard and not a decided
//                   target: M1 measured Easy at 0.52 to 0.59 on seeds 1 to 20 with the real creatures, and
//                   a later change that takes it under 0.50 fails the row. What Easy should be is still
//                   the owner's to say
//   fight           the target bot's fight in seconds, boss:enter to boss:defeat, from and to
//   liveAtFlag      threats still live at the arena flag, target and floor bots (the floor bot from both
//                   starts), at most
//   watchLive       threat words live at each watch crate's word:clear, target and floor bots, at least
const LEVEL_TARGETS = {
  2: {
    floorContinues: { easy: 1, medium: 2, hard: 2 }, savedFrom: 1,
    u: [0.55, 0.75], uNoted: 'easy', uNotedFrom: 0.50,
    fight: [60, 120],
    liveAtFlag: 0,
    watchLive: 1
  }
};

// The run and the file of the `level1-events` check (LEVEL2 13.4 M0 and 13.5).
const LEVEL1_EVENTS_FILE = 'test/fixtures/level1-events.json';
const LEVEL1_EVENT_FIELDS = {
  'boss:state': ['state', 'phase', 'round'],
  'boss:attack': ['kind', 'telegraph'],
  'boss:throw': ['kind', 'x', 'y'],
  'attack:spawn': ['id', 'kind', 'action'],
  'threat:spawn': ['id', 'type', 'kind', 'from', 'word']
};

// The highest WP-E milestone that is built. Milestones above it report NOT BUILT.
const MILESTONES_BUILT = 6;

const SIM_FILES = [
  'js/core.js', 'js/words.js', 'js/typing.js', 'js/input.js', 'js/entities.js', 'js/level.js',
  'js/boss.js', 'js/levels/level1.js', 'js/levels/level2.js', 'js/game.js'
];
const WPE_FILES = ['js/input.js', 'js/entities.js', 'js/level.js', 'js/boss.js', 'js/levels/level1.js', 'js/levels/level2.js', 'js/game.js'];
// The hazards Pip ducks under. A dangle keeps its distance from them (LEVEL2 4.3).
const DUCK_HAZARDS = { branch: true, beehive: true, arch: true };

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const PROFILES = ['floor', 'target', 'fast', 'exact'];
const SEEDS = [1, 2, 3];
const UNTILS = ['checkpoint1', 'checkpoint2', 'boss', 'results'];
const STOP_INDEX = { checkpoint1: 1, checkpoint2: 2, boss: 3 };
const PROFILE_ADAPTIVE = { floor: true, target: false, fast: false, exact: false };
const DEFAULT_MAX_SECONDS = 1500;
const LETTER_SCREENS = { playing: true, boss: true, lifeLost: true };

function fmt(n, digits) {
  return typeof n === 'number' && isFinite(n) ? n.toFixed(digits) : String(n);
}

function clip(text, max) {
  const s = String(text).replace(/\s+/g, ' ');
  return s.length > (max || 300) ? s.slice(0, max || 300) + '...' : s;
}

function loadEnv(files) {
  return stubs.load({ files: files || stubs.FILES, constants: CONSTANT_OVERRIDES });
}

// ===============================================================================================
// 2. Checker: assertions inside every run (CONTRACT 10.3)
// ===============================================================================================
//
//   event-names    every event has a name in TG.Events.NAMES and the payload fields of section 8, those
//                  and no other
//   first-letters  no two live typables share a first letter
//   active-cap     live threats never exceed config.maxActive for the section
//   word-pool      every word in threat:spawn, boss:weakopen and boss:finisher is in the pools
//   no-dodge       a threat that reaches t >= 1 unfinished is removed in the same step with
//                  threat:hit or threat:bounce; contact never happens before t = 1
// Added by WP-E for the fairness rules of DESIGN 4.1:
//   budget         every new word's budget is max(base, queue, spacing) (and the boulder minimum),
//                  recomputed independently from the state at the moment of the spawn; a longer
//                  budget is allowed only when the keep-clear rule moved the arrival to a zone's end
//   keep-clear     no threat is scheduled to arrive inside a hazard's input window or its margin; and no
//                  dangle hangs within DANGLE_CLEAR of the box of a hazard to duck (LEVEL2 4.3)
//   scoring        every word:clear scores DESIGN 8.3 (clean, quick, multiplier, quill, assist), and so
//                  do the weak-point, finisher and defeat scores of the boss
//   console        nothing is written to console.error or console.warn during the run
// Added by the second WP-E engineer for the fairness rules of the boss (DESIGN 11.6):
//   announce       every attack:spawn follows a boss:attack of the same kind with telegraph > 0,
//                  emitted in an earlier step and at least that telegraph span earlier on the world
//                  clock (config.boss.telegraph for the first attack of a round, doubleGap for the second)
//   weak-window    every weak-point window is exposeFactor x the base budget of its word, plus
//                  exposeBonus when every entry of the volley was typed (world seconds, via boss.windowWs);
//                  boss.volley.hits and toLaunch then hold that count (the gauge of LEVEL2 10.4 reads them)
// Added for the Pocket Watch (LEVEL2 6.3). The `watch-freeze` check follows the whole rule on a test level;
// this asserts three parts of it in every run of the matrix that types a watch crate:
//   watch          on a step that starts with a watch running, the world clock does not move, no threat or
//                  crate appears, and the level does nothing: no section:enter, checkpoint, hazard:cue,
//                  boss:warning or boss:enter

// What TG.Level.update emits. None of it may come on a step a Pocket Watch holds (the `watch` assertion).
const LEVEL_EVENTS = { 'section:enter': true, 'checkpoint': true, 'hazard:cue': true, 'boss:warning': true, 'boss:enter': true };

class Checker {
  constructor(session) {
    this.session = session;
    this.TG = session.TG;
    this.error = null;
    this.words = [];
    this.wordSet = new Set();
    this.entities = new Map();         // id -> entity, from threat:spawn
    this.prevThreats = new Map();
    this.stepContact = new Set();
    this.stepCleared = new Set();
    this.stepFled = new Set();
    this.stepSpawned = new Set();
    this.stopReached = false;
    this.heldWorld = null;             // worldTime before a step that a Pocket Watch holds; null on any other step and between steps
    this.announced = [];               // boss:attack for shock and pick not yet followed by attack:spawn
    this.volleyHits = 0;               // volley entries typed since the volley began
    this.volleySize = 0;
    // Measurements for the run's report (LEVEL2 8.6 and 13.5). They assert nothing.
    this.measure = {
      uSum: 0, uCount: 0,              // window use of each threat word typed or missed
      bossEnterAt: null, fightTime: null,
      liveAtFlag: 0, cratesAtFlag: 0,  // threats and crates that never came to anything before the arena flag
      pastFlag: 0,                     // threats that were due at or past the arena flag when they appeared
      watch: [],                       // { id, tile, live } for each watch crate that appeared; live null: not cleared
      minLives: null,
      dangles: 0, dangleNearest: null  // dangles spawned; the least distance from an anchor to a duck hazard, px
    };
    const TG = this.TG;
    this.names = new Set(TG.Events.NAMES);
    this.fields = TG.Events.FIELDS || null;
    TG.Events.on('*', (payload, name) => this.onEvent(payload, name));
  }

  fail(assertion, message) {
    if (this.error) return;
    const s = this.TG.Game.state;
    this.error = 'assertion ' + assertion + ' failed at t=' + fmt(s ? s.time : 0, 2) + ': ' + message;
  }

  onEvent(payload, name) {
    const TG = this.TG;
    const session = this.session;
    // event-names
    if (!this.names.has(name)) this.fail('event-names', 'unknown event "' + name + '"');
    if (!payload || typeof payload !== 'object') {
      this.fail('event-names', name + ' has no payload object');
      return;
    }
    const fields = this.fields ? this.fields[name] : null;
    if (fields) {
      for (const f of fields) {
        if (!(f in payload)) this.fail('event-names', name + ' payload lacks "' + f + '"');
      }
      // And no field that section 8 does not list: payload fields are binding (CONTRACT 12.1), and Level 1's
      // events are to stay as they are while Level 2 is built (a skin, say, is not carried on one).
      for (const k of Object.keys(payload)) {
        if (fields.indexOf(k) === -1) this.fail('event-names', name + ' payload has "' + k + '", which section 8 does not list');
      }
    }

    // watch
    if (this.heldWorld !== null && LEVEL_EVENTS[name] === true) this.fail('watch', name + ' was emitted on a step a Pocket Watch holds');

    // word-pool
    if (name === 'threat:spawn' || name === 'boss:weakopen' || name === 'boss:finisher') {
      const w = payload.word;
      if (!TG.Words.has(session.difficulty, w)) this.fail('word-pool', '"' + w + '" (' + name + ') is not in the ' + session.difficulty + ' pools');
      if (!this.wordSet.has(w)) {
        this.wordSet.add(w);
        this.words.push(w);
      }
    }

    if (name === 'threat:spawn') {
      this.entities.set(payload.id, payload.entity);
      this.stepSpawned.add(payload.id);
      this.checkSpawn(payload.entity);
      // watch
      if (this.heldWorld !== null) this.fail('watch', payload.kind + ' "' + payload.word + '" appeared while a Pocket Watch holds the world');
    } else if (name === 'threat:hit' || name === 'threat:bounce') {
      this.stepContact.add(payload.id);
      const e = this.entities.get(payload.id);
      if (e && e.type === 'threat' && !(e.t >= 1 - 1e-9)) {
        this.fail('no-dodge', name + ' for ' + e.kind + ' ' + e.id + ' at t=' + fmt(e.t, 3) + ', before t = 1');
      }
    } else if (name === 'word:clear') {
      this.stepCleared.add(payload.id);
      this.checkScore(payload);
    } else if (name === 'score:add' && (payload.reason === 'core' || payload.reason === 'finisher' || payload.reason === 'boss')) {
      // DESIGN 8.3: weak-point word 1,000 x assist; finisher bonus; boss defeated 5,000.
      const s = TG.Game.state;
      const C = TG.C;
      const want = payload.reason === 'core' ? TG.Util.round10(C.PTS_CORE * s.assist)
        : payload.reason === 'finisher' ? s.config.boss.finisherBonus : C.PTS_BOSS;
      if (payload.points !== want) this.fail('scoring', payload.reason + ' scored ' + payload.points + ', expected ' + want);
    } else if (name === 'threat:escape' && payload.reason === 'flee') {
      this.stepFled.add(payload.id);
    }
    this.checkBoss(payload, name);
    this.note(payload, name);

    if (name === 'checkpoint' && STOP_INDEX[session.until] === payload.index) this.stopReached = true;

    if (session.verbose) {
      const s = TG.Game.state;
      const t = 't=' + fmt(s.time, 1);
      if (name === 'life:lost') session.log('  LIFE ' + t + ' lives=' + payload.lives + ' cause=' + payload.cause.type + (payload.cause.kind ? '/' + payload.cause.kind : '') + ' x=' + fmt(s.player.x, 0));
      else if (name === 'checkpoint') session.log('  CHECKPOINT ' + t + ' index=' + payload.index + ' wpm=' + fmt(payload.wpm, 1) + ' acc=' + fmt(payload.accuracy, 3) + ' bonus=' + payload.bonus + ' lives=' + payload.lives + ' score=' + s.score);
      else if (name === 'game:continue') session.log('  CONTINUE ' + t + ' checkpoint=' + payload.checkpoint + ' continues=' + payload.continues + ' assist=' + fmt(payload.assist, 2));
      else if (name === 'boss:phase') session.log('  BOSS PHASE ' + t + ' phase=' + payload.phase);
    }
  }

  // budget and keep-clear, recomputed from the state at the moment of the spawn.
  checkSpawn(e) {
    const TG = this.TG;
    const C = TG.C;
    const s = TG.Game.state;
    const config = s.config;
    if (!e || (e.type !== 'threat' && e.type !== 'crate')) {
      this.fail('budget', 'threat:spawn without a threat or crate entity');
      return;
    }
    // first-letters and active-cap at the moment of the spawn
    for (const o of TG.Entities.typables(s)) {
      if (o !== e && o.word.charAt(0) === e.word.charAt(0)) {
        this.fail('first-letters', '"' + e.word + '" spawned while "' + o.word + '" is live');
      }
    }
    if (e.type === 'threat') {
      const cap = config.maxActive[Math.min(s.section, config.maxActive.length - 1)];
      if (TG.Entities.activeThreats(s) > cap) this.fail('active-cap', e.kind + ' spawned with ' + TG.Entities.activeThreats(s) + ' threats live, cap ' + cap);
    }

    let A = 0, R = 0, latest = 0;
    for (const o of s.entities) {
      if (o === e || o.dead || (o.type !== 'threat' && o.type !== 'crate') || !o.typable) continue;
      const left = o.word.length - o.typed;
      if (left <= 0) continue;
      A++;
      R += left;
      latest = Math.max(latest, (o.budget - o.age + o.stallT) / config.pace);
    }
    const len = e.word.length;
    let base = config.react + config.perChar * len;
    if (e.intro || e.tutorial) base *= C.INTRO_FACTOR;
    if (e.type === 'crate') base *= C.CRATE_FACTOR;
    const queue = config.react + config.perChar * (R + len) + 0.4 * config.react * A;
    const spacing = A > 0 ? latest + config.impactGap : 0;
    let need = Math.max(base, queue, spacing);
    if (e.kind === 'boulder') need = Math.max(need, C.BOULDER_MIN_BUDGET / config.pace);
    const nominal = e.budget / config.pace;
    if (nominal < need - 1e-6) {
      this.fail('budget', e.kind + ' "' + e.word + '" budget ' + fmt(nominal, 3) + ' nominal s < ' + fmt(need, 3) +
        ' (base ' + fmt(base, 2) + ', queue ' + fmt(queue, 2) + ', spacing ' + fmt(spacing, 2) + ')');
      return;
    }
    if (e.type !== 'threat') {
      if (nominal > need + 1e-6) this.fail('budget', 'crate "' + e.word + '" budget ' + fmt(nominal, 3) + ' is longer than the rules give (' + fmt(need, 3) + ')');
      return;
    }
    const p = s.player;
    const impactX = TG.Entities.KINDS[e.kind].anchored ? e.anchorX - e.contact : p.x + C.RUN_SPEED * e.budget;
    const m = config.hazardMargin * config.pace * C.RUN_SPEED;
    let atZoneEnd = false;
    if (e.kind === 'dangle') this.measure.dangles++;
    // A threat of the level that is due at or past the arena flag cannot reach Pip: it is typed, or it
    // flees at the flag (LEVEL2 decision 20 asks that the last wave is not like that).
    if (!s.boss && impactX >= s.level.arenaX) this.measure.pastFlag++;
    for (const h of s.level.hazards) {
      if (h.bridged) continue;
      let zs = h.winStart - m, ze = h.x + h.w + m;
      if (e.kind === 'dangle' && DUCK_HAZARDS[h.kind]) {
        // LEVEL2 4.3: a dangle hangs at head height, as these hazards do, so its anchor keeps DANGLE_CLEAR
        // from the hazard's box on either side. The anchor is `contact` beyond the arrival point, which
        // makes the zone of arrival points this much wider.
        const gap = Math.max(h.x - e.anchorX, e.anchorX - (h.x + h.w));
        if (gap < C.DANGLE_CLEAR - 1e-6) {
          this.fail('keep-clear', 'dangle "' + e.word + '" hangs at x=' + fmt(e.anchorX, 1) + ', ' + fmt(gap, 1) + ' px from ' + h.kind + ' ' + h.id + ' (at least ' + C.DANGLE_CLEAR + ')');
          return;
        }
        this.measure.dangleNearest = this.measure.dangleNearest === null ? gap : Math.min(this.measure.dangleNearest, gap);
        zs = Math.min(zs, h.x - C.DANGLE_CLEAR - e.contact);
        ze = Math.max(ze, h.x + h.w + C.DANGLE_CLEAR - e.contact);
      }
      if (impactX >= zs + 1e-6 && impactX < ze - 1e-6) {
        this.fail('keep-clear', e.kind + ' "' + e.word + '" arrives at x=' + fmt(impactX, 1) + ', inside the zone of ' + h.kind + ' ' + h.id + ' [' + fmt(zs, 1) + ', ' + fmt(ze, 1) + ')');
        return;
      }
      if (Math.abs(impactX - ze) < 1e-6) atZoneEnd = true;
    }
    if (nominal > need + 1e-6 && !atZoneEnd) {
      this.fail('budget', e.kind + ' "' + e.word + '" budget ' + fmt(nominal, 3) + ' is longer than the rules give (' + fmt(need, 3) + ')');
    }
  }

  // The measurements of LEVEL2 8.6 ("How the figures are taken"), kept for the run's report.
  note(p, name) {
    const TG = this.TG;
    const s = TG.Game.state;
    const m = this.measure;
    if (name === 'word:clear' && p.type === 'threat' && p.cause === 'typed') {
      // Window use, as adaptive pacing measures it (noteResolved in js/entities.js): age / budget for a
      // threat word that was typed, the boss's rocks and minion included, U_MISS for one that reached Pip.
      const e = this.entities.get(p.id);
      if (e && e.budget > 0) {
        m.uSum += e.age / e.budget;
        m.uCount++;
      }
    } else if (name === 'threat:hit' || name === 'threat:bounce') {
      m.uSum += TG.C.U_MISS;
      m.uCount++;
    } else if (name === 'boss:enter') {
      m.bossEnterAt = s.time;
      // The arena flag: what fled in this step, and the entries of the level that never appeared.
      const types = [];
      for (const id of this.stepFled) if (this.entities.has(id)) types.push(this.entities.get(id).type);
      for (const sp of s.level.spawns) if (!sp.done) types.push(TG.Entities.KINDS[sp.kind].type);
      m.liveAtFlag += types.filter((t) => t === 'threat').length;
      m.cratesAtFlag += types.filter((t) => t === 'crate').length;
    } else if (name === 'boss:defeat' && m.bossEnterAt !== null) {
      m.fightTime = s.time - m.bossEnterAt;
    } else if (name === 'threat:spawn' && p.entity && p.entity.type === 'crate' && p.entity.power === 'watch') {
      m.watch.push({ id: p.id, tile: Math.floor(s.player.x / TG.C.TILE), live: null });
    } else if (name === 'word:clear' && p.power === 'watch') {
      const w = m.watch.find((x) => x.id === p.id);
      if (w) w.live = TG.Entities.activeThreats(s);
    }
  }

  // announce and weak-window (DESIGN 11.6).
  checkBoss(p, name) {
    const TG = this.TG;
    const s = TG.Game.state;
    if (!s || !s.config) return;
    const b = s.config.boss;
    if (name === 'boss:state' && p.state === 'volley') {
      this.volleyHits = 0;
      this.volleySize = s.boss ? s.boss.volley.toLaunch.length : 0;
    } else if (name === 'word:clear' && s.boss && p.cause === 'typed') {
      // Every threat in the arena belongs to the current volley (letters also count on lifeLost).
      this.volleyHits++;
    } else if (name === 'boss:attack' && (p.kind === 'shock' || p.kind === 'pick')) {
      if (!(p.telegraph > 0)) this.fail('announce', p.kind + ' announced with telegraph ' + p.telegraph);
      const first = s.boss && s.boss.state === 'telegraph';
      this.announced.push({ kind: p.kind, frame: s.frame, worldTime: s.worldTime, ws: TG.Difficulty.toWs(s.config, first ? b.telegraph : b.doubleGap) });
    } else if (name === 'attack:spawn') {
      const a = this.announced.shift();
      if (!a || a.kind !== p.kind) {
        this.fail('announce', p.kind + ' spawned without an announcement' + (a ? ' (next announced: ' + a.kind + ')' : ''));
      } else if (a.frame >= s.frame || s.worldTime - a.worldTime < a.ws - TG.C.DT * s.timeScale - 1e-6) {
        // worldTime is advanced at the end of a step, so the step of the spawn itself is not in it yet.
        this.fail('announce', p.kind + ' spawned ' + fmt(s.worldTime - a.worldTime, 3) + ' ws after its announcement, expected ' + fmt(a.ws, 3));
      }
    } else if (name === 'game:continue') {
      this.announced = [];
    } else if (name === 'boss:weakopen') {
      const len = p.word.length;
      const typedAll = this.volleySize > 0 && this.volleyHits >= this.volleySize;
      const want = TG.Difficulty.toWs(s.config, b.exposeFactor * TG.Difficulty.budget(s.config, len) + (typedAll ? b.exposeBonus : 0));
      if (Math.abs(s.boss.windowWs - want) > 1e-6) {
        this.fail('weak-window', '"' + p.word + '" window ' + fmt(s.boss.windowWs, 3) + ' ws, expected ' + fmt(want, 3) + ' (volley ' + this.volleyHits + '/' + this.volleySize + ' typed)');
      }
      if (len < b.coreLen[0] || len > b.coreLen[1]) this.fail('weak-window', '"' + p.word + '" is not ' + b.coreLen.join('-') + ' letters');
      // The gauge (LEVEL2 10.4): Lady Ratchet's needle and her whistle read boss.volley, so at this moment it
      // holds the count the window was set from.
      const v = s.boss.volley;
      if (v.hits !== this.volleyHits || v.toLaunch.length !== this.volleySize) {
        this.fail('weak-window', 'boss.volley has ' + v.hits + ' of ' + v.toLaunch.length + ' typed at boss:weakopen, ' + this.volleyHits + ' of ' + this.volleySize + ' were');
      }
    }
  }

  // scoring: DESIGN 8.3, recomputed from the entity and the state when word:clear is emitted.
  checkScore(p) {
    const TG = this.TG;
    const C = TG.C;
    const s = TG.Game.state;
    const e = this.entities.get(p.id);
    if (!e) return;
    const len = e.word.length;
    let want;
    if (p.cause === 'blast') {
      want = TG.Util.round10(C.BLAST_FACTOR * C.PTS_WORD_PER_LETTER * len * p.mult * s.assist);
    } else {
      const u = e.age / e.budget;
      if (p.quick !== (u <= C.QUICK_U)) this.fail('scoring', '"' + e.word + '" quick is ' + p.quick + ' with u ' + fmt(u, 3));
      if (p.clean !== (e.errors === 0)) this.fail('scoring', '"' + e.word + '" clean is ' + p.clean + ' with ' + e.errors + ' errors');
      if (p.mult !== s.typing.stats.mult) this.fail('scoring', '"' + e.word + '" mult ' + p.mult + ', engine ' + s.typing.stats.mult);
      want = TG.Util.round10(C.PTS_WORD_PER_LETTER * len * p.mult * (p.clean ? C.CLEAN_FACTOR : 1) *
        (p.quick ? C.QUICK_FACTOR : 1) * (s.power.quillT > 0 ? 2 : 1) * s.assist);
    }
    if (p.score !== want) this.fail('scoring', p.cause + ' "' + e.word + '" scored ' + p.score + ', expected ' + want);
  }

  beforeStep(state) {
    this.heldWorld = state.power.watchT > 0 ? state.worldTime : null;
    this.prevThreats.clear();
    for (const e of state.entities) {
      if (!e.dead && e.type === 'threat') this.prevThreats.set(e.id, e);
    }
    this.stepContact.clear();
    this.stepCleared.clear();
    this.stepFled.clear();
    this.stepSpawned.clear();
  }

  afterStep(state) {
    const TG = this.TG;
    const m = this.measure;
    if (state.player && (m.minLives === null || state.player.lives < m.minLives)) m.minLives = state.player.lives;
    // The step is over. A continue comes between steps and emits section:enter, which is not a held step's.
    const heldWorld = this.heldWorld;
    this.heldWorld = null;
    if (this.error) return;
    // watch
    if (heldWorld !== null && state.worldTime !== heldWorld) {
      this.fail('watch', 'the world clock moved by ' + (state.worldTime - heldWorld) + ' ws on a step a Pocket Watch holds');
    }
    // first-letters
    const seen = new Map();
    for (const t of TG.Entities.typables(state)) {
      const c = t.word.charAt(0);
      if (seen.has(c)) {
        this.fail('first-letters', '"' + t.word + '" and "' + seen.get(c) + '" are live together');
        return;
      }
      seen.set(c, t.word);
    }
    // active-cap
    if (state.config && state.level) {
      const caps = state.config.maxActive;
      const cap = caps[Math.min(state.section, caps.length - 1)];
      const n = TG.Entities.activeThreats(state);
      if (n > cap) this.fail('active-cap', n + ' threats live in section ' + state.section + ', cap ' + cap);
    }
    // no-dodge
    const live = new Set();
    for (const e of state.entities) {
      if (e.dead || e.type !== 'threat') continue;
      live.add(e.id);
      if (e.t >= 1) {
        this.fail('no-dodge', e.kind + ' ' + e.id + ' "' + e.word + '" reached t=' + fmt(e.t, 3) + ' and is still live');
      }
    }
    for (const [id, e] of this.prevThreats) {
      if (live.has(id)) continue;
      if (!this.stepContact.has(id) && !this.stepCleared.has(id) && !this.stepFled.has(id)) {
        this.fail('no-dodge', e.kind + ' ' + id + ' "' + e.word + '" left without contact, clear or flee (reason ' + e.reason + ')');
      }
    }
  }
}

// ===============================================================================================
// 3. The bot (CONTRACT 10.3)
// ===============================================================================================

class Bot {
  constructor(session, profile) {
    const TG = session.TG;
    this.TG = TG;
    this.session = session;
    this.rng = TG.RNG.create(session.seed + 1000);
    this.wpm = profile.wpm;
    this.accuracy = profile.accuracy;
    this.react = profile.react;
    this.interval = 12 / profile.wpm;
    this.pErr = profile.accuracy >= 1 ? 0 : (1 - profile.accuracy) / profile.accuracy;
    this.noType = !!session.opts.noType;
    this.noJump = !!session.opts.noJump;
    this.noDuck = !!session.opts.noDuck;

    this.presses = new Map();        // action id -> { point, done }
    this.held = null;                // { key, until: 'next' | x }
    this.wordId = null;
    this.nextKeyAt = null;
    this.errorPending = false;
    this.lastWordDoneAt = -Infinity;
    this.waitUntil = -Infinity;

    TG.Events.on('type:hit', (p) => {
      if (p.complete) {
        this.lastWordDoneAt = TG.Game.state.time;
        this.forget();
      }
    });
    TG.Events.on('target:release', (p) => {
      if (p.reason === 'gone') this.waitUntil = TG.Game.state.time + TG.C.DISCARD_TIME;
      this.forget();
    });
    TG.Events.on('game:continue', () => {
      this.presses.clear();
      if (this.held) {
        TG.Input.keyUp(this.held.key);
        this.held = null;
      }
      this.forget();
    });
  }

  forget() {
    this.wordId = null;
    this.nextKeyAt = null;
    this.errorPending = false;
  }

  beforeStep(state) {
    this.actionStep(state);
    this.typeStep(state);
  }

  // Jump and duck: one press point per action id, chosen once.
  actionStep(state) {
    const TG = this.TG;
    const p = state.player;
    if (this.held) {
      const h = this.held;
      if (h.until === 'next' || (p && p.x > h.until)) {
        TG.Input.keyUp(h.key);
        this.held = null;
      }
    }
    if (!p) return;
    const a = TG.Entities.nextAction(state);
    if (!a) return;
    if ((a.action === 'jump' && this.noJump) || (a.action === 'duck' && this.noDuck)) return;
    let rec = this.presses.get(a.id);
    if (!rec) {
      rec = { done: false, point: null };
      if (a.source === 'hazard') rec.point = a.winStart + 2 + this.rng.next() * 0.4 * (a.winEnd - a.winStart - 4);
      this.presses.set(a.id, rec);
    }
    if (rec.done || this.held) return;
    const reached = a.source === 'hazard' ? p.x >= rec.point : true;
    if (!reached || !a.inWindow) return;
    const key = a.action === 'jump' ? 'jump' : 'duck';
    TG.Input.keyDown(key);
    rec.done = true;
    this.held = { key: key, until: a.hold ? a.holdUntil : 'next' };
  }

  // The typable with the lowest eta, then the lowest id.
  choose(state) {
    let best = null;
    for (const t of this.TG.Entities.typables(state)) {
      if (!best || t.eta < best.eta || (t.eta === best.eta && t.id < best.id)) best = t;
    }
    return best;
  }

  // The time a key pressed now is scheduled at: the planned time, unless the bot was held back.
  scheduleBase(now) {
    return now - this.nextKeyAt > this.TG.C.DT + 1e-9 ? now : this.nextKeyAt;
  }

  typeStep(state) {
    const TG = this.TG;
    const C = TG.C;
    const ty = state.typing;
    if (this.noType || !ty || !LETTER_SCREENS[state.screen]) return;
    const now = state.time + C.DT;               // the time the key will carry
    if (now < this.waitUntil - 1e-6) return;
    if (ty.discardT - C.DT > 1e-9) return;       // the key would be discarded

    let word = ty.target;
    if (word) {
      if (this.wordId !== word.id) {             // locked by a wrong key: continue that word
        this.wordId = word.id;
        if (this.nextKeyAt === null) this.nextKeyAt = now;
      }
    } else {
      word = this.choose(state);
      if (!word) {
        this.forget();
        return;
      }
      if (word.id !== this.wordId) {
        this.wordId = word.id;
        this.nextKeyAt = null;
        this.errorPending = false;
      }
      const start = Math.max(word.shownAt + this.react, this.lastWordDoneAt + 0.4 * this.react);
      if (this.nextKeyAt === null || this.nextKeyAt < start) this.nextKeyAt = start;
    }
    if (now < this.nextKeyAt - 1e-9) return;

    const expected = word.word.charAt(word.typed);
    if (!this.errorPending && this.pErr > 0 && this.rng.chance(this.pErr)) {
      const near = (TG.Words.ADJACENT[expected] || '').split('').filter((c) => c !== expected);
      const wrong = this.rng.pick(near);
      if (wrong) {
        TG.Input.typeChar(wrong);
        this.errorPending = true;
        this.nextKeyAt = this.scheduleBase(now) + this.interval + 0.15;
        return;
      }
    }
    TG.Input.typeChar(expected);
    this.errorPending = false;
    this.nextKeyAt = this.scheduleBase(now) + this.interval;
  }
}

// ===============================================================================================
// 4. Session and runBot
// ===============================================================================================

function profileName(opts) {
  if (opts.profile) return opts.profile;
  return typeof opts.wpm === 'number' ? 'custom' : 'target';
}

class Session {
  // opts: CONTRACT 10.3 (difficulty, wpm, accuracy, react, seed, adaptive, until, noType, noJump, noDuck,
  // files, maxSeconds, verbose), plus profile (floor | target | fast | exact | custom), levelId,
  // startAssist (the assist the run starts at; 1 without it, which is a player with nothing saved; LEVEL2
  // 8.6 and 13.5) and setup (a function called with TG before newRun, used by the checks).
  constructor(opts) {
    this.opts = opts;
    this.difficulty = opts.difficulty || 'medium';
    this.levelId = opts.levelId !== undefined ? opts.levelId : 1;
    this.startAssist = typeof opts.startAssist === 'number' ? opts.startAssist : 1;
    this.seed = typeof opts.seed === 'number' ? opts.seed : 1;
    this.until = opts.until || 'results';
    this.verbose = !!opts.verbose;
    this.maxSeconds = typeof opts.maxSeconds === 'number' ? opts.maxSeconds : DEFAULT_MAX_SECONDS;
    this.profile = profileName(opts);
    this.lines = [];
    this.steps = 0;
    this.done = false;
    this.report = {
      levelId: this.levelId, difficulty: this.difficulty, profile: this.profile, seed: this.seed,
      wpm: opts.wpm, accuracy: opts.accuracy, react: opts.react, adaptive: null,
      until: this.until, finished: false, words: [], time: 0, steps: 0, score: 0,
      lives: 0, livesLost: 0, continues: 0, damageTypable: 0, damageOther: 0,
      reportedWpm: 0, reportedAccuracy: 0, assistEnd: 0, rank: null, error: null, fatal: false,
      // The measurements of LEVEL2 8.6 and 13.5 (Checker.note); measureLine below says what each is.
      startAssist: this.startAssist, meanU: null, fightTime: null, liveAtFlag: 0, cratesAtFlag: 0, pastFlag: 0,
      watch: [], minLives: null, dangles: 0, dangleNearest: null
    };
    try {
      this.env = loadEnv(opts.files);
    } catch (e) {
      this.abort('a file failed to load: ' + e.message, true);
      return;
    }
    const TG = this.TG = this.env.TG;
    if (!TG || !TG.Game || !TG.Entities || !TG.Level || !TG.Levels || !TG.Levels[1]) {
      this.abort('the simulation files are not all loaded (missing: ' + this.env.missing.join(', ') + ')', true);
      return;
    }
    try {
      TG.Events.clear();
      TG.Input.clear();
      TG.Game.init();
      this.checker = new Checker(this);
      if (typeof opts.setup === 'function') opts.setup(TG);
      const levelId = this.levelId;
      if (!TG.Levels[levelId]) {
        this.abort('level ' + levelId + ' is not built: no file registers TG.Levels[' + levelId + ']', true);
        return;
      }
      const config = TG.Difficulty.resolve(this.difficulty, TG.Levels[levelId].tune);
      const profileKey = this.profile === 'exact' || this.profile === 'custom' ? 'target' : this.profile;
      const adaptive = typeof opts.adaptive === 'boolean' ? opts.adaptive : !!PROFILE_ADAPTIVE[this.profile];
      TG.Game.newRun({ difficulty: this.difficulty, seed: this.seed, levelId: levelId, adaptive: adaptive, assist: this.startAssist, tutorial: config.tutorialAlways });
      // Reported from the run and not from the option, so that a check can tell the run started there.
      this.report.startAssist = TG.Game.state.assist;
      // The profile is read from the run's config, so that the level's tune block applies.
      const botConfig = TG.Game.state.config.bot[profileKey] || TG.Game.state.config.bot.target;
      const profile = {
        wpm: typeof opts.wpm === 'number' ? opts.wpm : botConfig.wpm,
        accuracy: typeof opts.accuracy === 'number' ? opts.accuracy : (this.profile === 'exact' ? 1 : botConfig.accuracy),
        react: typeof opts.react === 'number' ? opts.react : botConfig.react
      };
      Object.assign(this.report, profile, { adaptive: adaptive });
      this.bot = new Bot(this, profile);
      this.errorsSeen = this.env.errors.length;
      this.warningsSeen = this.env.warnings.length;
    } catch (e) {
      this.abort('the run could not start: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e), true);
    }
  }

  log(line) {
    this.lines.push(line);
    if (this.opts.printLog) console.log(line);
  }

  abort(message, fatal) {
    if (!this.report.error) this.report.error = message;
    if (fatal) this.report.fatal = true;
    this.done = true;
  }

  // One step of the bot and the simulation, with the assertions. Returns false on an exception.
  stepOnce() {
    const TG = this.TG;
    const s = TG.Game.state;
    this.bot.beforeStep(s);
    this.checker.beforeStep(s);
    try {
      TG.Game.step(TG.C.DT);
    } catch (e) {
      this.abort('an exception escaped TG.Game.step: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e), true);
      return false;
    }
    this.steps++;
    this.checker.afterStep(TG.Game.state);
    // A listener that throws is caught by TG.Events and reported with console.error; a refused screen
    // change warns. Either would otherwise pass unnoticed.
    const env = this.env;
    if (!this.checker.error && (env.errors.length > this.errorsSeen || env.warnings.length > this.warningsSeen)) {
      const text = env.errors.length > this.errorsSeen ? 'console.error: ' + env.errors[this.errorsSeen] : 'console.warn: ' + env.warnings[this.warningsSeen];
      this.checker.fail('console', text);
    }
    if (this.checker.error) this.abort(this.checker.error, false);
    return !this.done;
  }

  // One iteration of the run loop (CONTRACT 10.3 "Bot behaviour", step 1). False when the run is over.
  tick() {
    if (this.done) return false;
    const TG = this.TG;
    const s = TG.Game.state;
    if (this.checker.stopReached) {
      this.report.finished = true;
      this.done = true;
      return false;
    }
    if (s.screen === 'results') {
      this.report.finished = this.until === 'results' && !!(s.result && s.result.cleared);
      this.done = true;
      return false;
    }
    if (s.screen === 'gameOver') {
      if (typeof this.opts.onGameOver === 'function') this.opts.onGameOver(TG, this);
      if (this.done) return false;
      TG.Game.continueRun();
      return true;
    }
    if (s.screen === 'paused') {
      TG.Game.resume();
      return true;
    }
    if (!TG.Game.isSimScreen(s.screen)) {
      this.abort('the run reached the screen "' + s.screen + '"', true);
      return false;
    }
    if (s.time >= this.maxSeconds) {
      this.abort('timed out: ' + this.maxSeconds + ' s of simulated time without reaching ' + this.until +
        ' (screen ' + s.screen + ', x=' + fmt(s.player.x, 0) + ')', true);
      return false;
    }
    return this.stepOnce();
  }

  run() {
    while (this.tick()) { /* the loop is in tick */ }
    return this.finish();
  }

  finish() {
    const r = this.report;
    if (this.checker) {
      const m = this.checker.measure;
      r.words = this.checker.words.slice();
      r.meanU = m.uCount > 0 ? m.uSum / m.uCount : null;
      r.fightTime = m.fightTime;
      r.liveAtFlag = m.liveAtFlag;
      r.cratesAtFlag = m.cratesAtFlag;
      r.pastFlag = m.pastFlag;
      r.watch = m.watch.map((w) => ({ tile: w.tile, live: w.live }));
      r.minLives = m.minLives;
      r.dangles = m.dangles;
      r.dangleNearest = m.dangleNearest;
    }
    const TG = this.TG;
    const s = TG && TG.Game ? TG.Game.state : null;
    if (s && s.player) {
      const stats = s.typing.stats;
      r.time = s.time;
      r.steps = this.steps;
      r.score = s.score;
      r.lives = s.player.lives;
      r.livesLost = s.run.livesLost;
      r.continues = s.run.continues;
      r.damageTypable = s.run.damageTypable;
      r.damageOther = s.run.damageOther;
      r.reportedWpm = stats.wpm;
      r.reportedAccuracy = stats.accuracy;
      r.assistEnd = s.assist;
      r.rank = s.result ? s.result.rank : null;
    }
    r.log = this.lines.slice();
    return r;
  }
}

function runBot(opts) {
  const session = new Session(opts || {});
  if (session.done) return session.finish();
  return session.run();
}

// ===============================================================================================
// 5. Extra checks
// ===============================================================================================
// Each check returns { pass: boolean, detail: string, skip?: boolean }. It is called with ctx:
// { until, levelId, runs, all } (profileRuns and ctxFor below read the last two). The checks marked
// perLevel in CHECK_LIST are about one level, the one in ctx.levelId, and read their expected values from
// the tables keyed by level in part 1. A perLevel check returns null for a level it has nothing to say
// about, and no line is printed.

function result(pass, detail) {
  return { pass: !!pass, detail: detail || '' };
}

function simEnv(files) {
  const env = loadEnv(files || SIM_FILES);
  env.TG.Events.clear();
  env.TG.Input.clear();
  return env;
}

function recordEvents(TG) {
  const list = [];
  TG.Events.on('*', (payload, name) => list.push({ name: name, payload: payload }));
  return list;
}

// A small test level: two gaps, a bramble, a branch, a beehive and an arch, and nothing else.
// With `empty: true` it has no gaps or hazards at all. `tune` is its tune block, `boss` its boss table,
// `spawns` its spawn list (none without it: the checks spawn what they need) and `gaps` its gaps in place of
// the two.
function testLevel(TG, options) {
  const o = options || {};
  const L1 = TG.Levels[1];
  const music = (tempo) => ({ transpose: 0, tempo: tempo, keyOk: { root: 0, mode: 'major' } });
  return {
    id: o.id || 'test',
    name: 'TEST FIELD',
    tutorial: false,
    tune: o.tune || {},
    theme: JSON.parse(JSON.stringify(L1.theme)),
    lengthTiles: 240,
    sections: [
      { name: 'A', stage: 'T-1', from: 0, to: 80, palette: 'day', gapFill: 'water', music: music(150) },
      { name: 'B', stage: 'T-2', from: 80, to: 160, palette: 'day', gapFill: 'water', music: music(150) },
      { name: 'C', stage: 'T-3', from: 160, to: 240, palette: 'sunset', gapFill: 'dark', music: music(158) }
    ],
    arena: { name: 'ARENA', stage: 'T-B', palette: 'dusk', arenaTilesFrom: 236, music: music(168) },
    checkpoints: [0, 80, 160, 240],
    gaps: o.gaps || (o.empty ? [] : [{ x: 20, w: 1 }, { x: 40, w: 2 }]),
    hazards: o.empty ? [] : [
      { x: 100, kind: 'bramble' },
      { x: 120, kind: 'branch' },
      { x: 140, kind: 'beehive' },
      { x: 180, kind: 'arch', w: 3 }
    ],
    spawns: o.spawns || [],
    ink: [],
    decor: [],
    boss: o.boss || { kind: 'baron', speech: 'TEST' }
  };
}

// The three time scales of the geometry checks: [difficulty, assist] giving pace x assist.
const SCALES = [
  { scale: 0.45, difficulty: 'easy', assist: 0.6 },
  { scale: 1.0, difficulty: 'medium', assist: 1 },
  { scale: 1.25, difficulty: 'hard', assist: 1 }
];

function startTestRun(TG, sc, levelOptions) {
  TG.Levels.test = testLevel(TG, levelOptions);
  TG.Input.clear();
  return TG.Game.newRun({ difficulty: sc.difficulty, seed: 1, levelId: 'test', adaptive: false, assist: sc.assist, tutorial: false });
}

function teleport(TG, x) {
  const s = TG.Game.state;
  s.player.x = x;
  s.camera.x = Math.max(0, x - TG.C.HERO_SCREEN_X);
}

// Runs one jump, slide or held slide at a hazard of the test level. mode 'exact': Pip is placed on
// the window edge and presses there; 'stepped': Pip runs up and presses on the step that reaches the
// edge (start) or on the last step before passing it (end). pressAt overrides the press x.
function tryHazard(env, sc, hazardId, edge, mode, pressAt) {
  const TG = env.TG;
  const C = TG.C;
  const s = startTestRun(TG, sc);
  const events = recordEvents(TG);
  const h = s.level.hazards.find((z) => z.id === hazardId);
  const key = h.action === 'jump' ? 'jump' : 'duck';
  const target = typeof pressAt === 'number' ? pressAt : (edge === 'start' ? h.winStart : h.winEnd);
  // timeScale is read as the world's speed. That is only true while no Pocket Watch runs (a watch makes it
  // 0, LEVEL2 6.3), and none can here: this run of the test level has no crate.
  const stepDist = C.RUN_SPEED * s.timeScale * C.DT;

  if (mode === 'exact') {
    teleport(TG, target);
  } else {
    // Run up to the press point. A press point outside the window is reached by running, so that Pip
    // meets the hazard as he would in play (a late press over a gap comes after the fall).
    teleport(TG, Math.min(target, h.winStart) - 40);
    const late = typeof pressAt === 'number' ? false : edge === 'end';
    for (let i = 0; i < 2000; i++) {
      const st = TG.Game.state;
      const x = st.player.x;
      if (!late && x >= target) break;
      if (late && x + stepDist > target) break;
      if (st.screen !== 'playing' || st.player.state === 'fall') break;
      TG.Game.step(C.DT);
    }
  }
  const takeoff = TG.Game.state.player.x;
  TG.Input.keyDown(key);
  TG.Game.step(C.DT);
  if (!h.hold) TG.Input.keyUp(key);
  for (let i = 0; i < 4000; i++) {
    const st = TG.Game.state;
    if (h.hold && TG.Input.isDown(key) && st.player.x > h.holdUntil) TG.Input.keyUp(key);
    if (st.player.x > h.x + h.w + 64) break;
    if (!TG.Game.isSimScreen(st.screen)) break;
    TG.Game.step(C.DT);
  }
  const bad = events.filter((e) => e.name === 'hero:fall' || e.name === 'life:lost' || e.name === 'hazard:hit');
  return { cleared: bad.length === 0, takeoff: takeoff, events: bad.map((e) => e.name) };
}

const CHECKS = {};

// --- level-valid ------------------------------------------------------------------------------
CHECKS['level-valid'] = function (ctx) {
  const env = simEnv();
  const TG = env.TG;
  const data = TG.Levels[ctx.levelId];
  const problems = TG.Level.validate(data);
  // Each rule must also be able to fail: a few broken copies of the level. Each change is placed from
  // the level's own data: its first gap, its second checkpoint, its length, whether it has the tutorial.
  const gap = data.gaps[0];
  const broken = [
    ['V2', (d) => { d.gaps.push({ x: gap.x + gap.w + 1, w: 1 }); }],
    ['V3', (d) => { d.hazards.push({ x: gap.x + 4, kind: 'branch' }); }],
    ['V4', (d) => { d.gaps.push({ x: d.checkpoints[1] + 4, w: 1 }); }],
    ['V5', (d) => { d.spawns.push({ x: 30, kind: 'dragon' }); }],
    // A level with the tutorial tags its first three threats; a level without it tags none.
    ['V6', (d) => { if (d.tutorial) d.spawns[2].tutorial = false; else d.spawns[0].tutorial = true; }],
    ['V7', (d) => { d.spawns.push({ x: d.lengthTiles - 20, kind: 'hoppet' }); }],
    ['V8', (d) => { d.ink.push({ x: gap.x - 2, shape: 'row', n: 4, step: 1 }); }],
    ['V9', (d) => { d.hazards.find((h) => h.kind === 'arch').w = 2; }],
    ['V10', (d) => { d.tune = { all: { lives: 9 } }; }],
    ['V11', (d) => { delete d.sections[1].music.tempo; }],
    ['V1', (d) => { d.checkpoints.splice(2, 1); }]
  ];
  const missed = [];
  for (const [code, change] of broken) {
    const copy = JSON.parse(JSON.stringify(data));
    change(copy);
    const found = TG.Level.validate(copy);
    if (!found.some((p) => p.indexOf(code + ':') === 0)) missed.push(code);
  }
  if (problems.length > 0) return result(false, problems.join('; '));
  if (missed.length > 0) return result(false, 'a broken level passed rule ' + missed.join(', '));
  // The optional keys a level may carry for its look and sound (LEVEL2 10.6 and Appendix B) are no
  // business of the rules: a copy of the level with all of them is valid, and build hands them on as they are.
  const extra = JSON.parse(JSON.stringify(data));
  extra.theme.hazardNames = { arch: 'TUNNEL' };
  extra.theme.hazardFx = { bramble: [11, 26, 4] };
  extra.theme.skins = { hoppet: { remap: 'tin' }, rock: { sprite: 'pr_cog' } };
  extra.theme.music.ready = 'jingle_ready2';
  extra.arena.music.phase3 = { tempo: 176, p2Octave: 12 };
  extra.boss = { kind: 'ratchet', label: 'RATCHET', speech: 'TICK TOCK!', tips: { shock: 'JUMP THE GEAR', pick: 'DUCK THE PENDULUM' }, minionSkin: 'en_baronet' };
  const extraProblems = TG.Level.validate(extra);
  if (extraProblems.length > 0) return result(false, 'the optional keys are refused: ' + extraProblems.join('; '));
  const built = TG.Level.build(extra, TG.Difficulty.resolve('medium', extra.tune));
  if (built.theme !== extra.theme || built.boss !== extra.boss || built.arena.music !== extra.arena.music) {
    return result(false, 'build did not hand on the theme, the boss table or the arena music of the level data');
  }
  return result(true, '11 rules, each also shown to fail on a broken copy; the optional theme, boss and arena keys are accepted and handed on');
};

// --- counts -------------------------------------------------------------------------------------
CHECKS['counts'] = function (ctx) {
  const env = simEnv();
  const TG = env.TG;
  const data = TG.Levels[ctx.levelId];
  const expected = EXPECTED_COUNTS[ctx.levelId];
  const design = DESIGN_COUNTS[ctx.levelId];
  const designCrates = DESIGN_CRATES[ctx.levelId];
  const expectedKinds = EXPECTED_KINDS[ctx.levelId];
  const problems = [];
  const threatKinds = Object.keys(TG.Entities.KINDS).filter((k) => TG.Entities.KINDS[k].type === 'threat');
  for (const d of DIFFICULTIES) {
    const counts = [0, 0, 0];
    const kinds = {};
    for (const sp of data.spawns) {
      if (threatKinds.indexOf(sp.kind) === -1 || !TG.Difficulty.includes(d, sp.min)) continue;
      kinds[sp.kind] = (kinds[sp.kind] || 0) + 1;
      for (let i = 0; i < data.sections.length; i++) {
        if (sp.x >= data.sections[i].from && sp.x < data.sections[i].to) counts[i]++;
      }
    }
    if (JSON.stringify(counts) !== JSON.stringify(expected[d])) {
      problems.push(d + ' has ' + counts.join('/') + ', EXPECTED_COUNTS ' + expected[d].join('/'));
    }
    // Which kinds they are: the same counts with a dangle swapped for a frog would be another level.
    for (const k of threatKinds) {
      const want = expectedKinds[k] ? expectedKinds[k][DIFFICULTIES.indexOf(d)] : 0;
      if ((kinds[k] || 0) !== want) problems.push(d + ' has ' + (kinds[k] || 0) + ' ' + k + ', EXPECTED_KINDS ' + want);
    }
    for (let i = 0; i < 3; i++) {
      const limit = Math.ceil(0.25 * design[d][i]);
      if (Math.abs(expected[d][i] - design[d][i]) > limit) {
        problems.push(d + ' section ' + (i + 1) + ': EXPECTED_COUNTS ' + expected[d][i] + ' is more than ' + limit + ' from DESIGN ' + design[d][i]);
      }
    }
  }
  const crates = data.spawns.filter((sp) => sp.kind === 'crate').sort((a, b) => a.x - b.x);
  if (crates.length !== designCrates.length) problems.push(crates.length + ' crates, expected ' + designCrates.length);
  const powers = crates.map((c) => c.power).join(',');
  const expectedPowers = designCrates.join(',');
  if (powers !== expectedPowers) problems.push('crate powers in the order met ' + powers + ', expected ' + expectedPowers);
  if (crates.some((c) => !TG.Difficulty.includes('easy', c.min))) problems.push('a crate is not on every difficulty');
  // The watch row of LEVEL2 13.5 (6.2), for a level with watch crates: when the target or the floor bot
  // clears one, a threat word is live for the watch to stop. A crate that drifts off untyped has no
  // word:clear to count at: it is reported as a missed watch and is not a failure.
  let watchText = '';
  const targets = LEVEL_TARGETS[ctx.levelId];
  if (targets && designCrates.indexOf('watch') !== -1) {
    const fewest = {};
    const missed = [];
    let cleared = 0;
    for (const r of profileRuns(ctx, 'target').concat(profileRuns(ctx, 'floor'))) {
      for (const w of r.watch) {
        const where = r.difficulty + ' ' + r.profile + ' seed ' + r.seed + ' at tile ' + w.tile;
        if (w.live === null) {
          missed.push(where);
          continue;
        }
        cleared++;
        if (w.live < targets.watchLive) problems.push('a watch crate was cleared with ' + w.live + ' threat words live (' + where + '), at least ' + targets.watchLive);
        if (fewest[r.difficulty] === undefined || w.live < fewest[r.difficulty]) fewest[r.difficulty] = w.live;
      }
    }
    if (cleared === 0) problems.push('the target and floor bots cleared no watch crate');
    watchText = '; the target and floor bots cleared ' + cleared + ' watch crates with at least ' + DIFFICULTIES.map((d) => fewest[d]).join(' / ') +
      ' threat words live' + (missed.length ? ', and missed ' + missed.length + ' (' + missed.join(', ') + ')' : '');
  }
  return problems.length ? result(false, problems.join('; ')) : result(true, 'threats ' + DIFFICULTIES.map((d) => d + ' ' + expected[d].join('/')).join(', ') +
    ', of the kinds expected; ' + designCrates.length + ' crates with the powers expected, in order' + watchText);
};

// --- jump-geometry ------------------------------------------------------------------------------
CHECKS['jump-geometry'] = function () {
  const env = simEnv();
  const TG = env.TG;
  const failures = [];
  let trials = 0;
  // h0 narrow gap, h1 wide gap, h2 bramble: jump. h3 branch, h4 beehive: slide. h5 arch (Tier 2): held slide.
  const cases = ['h0', 'h1', 'h2', 'h3', 'h4', 'h5'];
  for (const sc of SCALES) {
    for (const id of cases) {
      for (const edge of ['start', 'end']) {
        for (const mode of ['exact', 'stepped']) {
          trials++;
          const r = tryHazard(env, sc, id, edge, mode);
          if (!r.cleared) failures.push('scale ' + sc.scale + ' ' + id + ' ' + edge + ' ' + mode + ' (take-off x ' + fmt(r.takeoff, 2) + '): ' + r.events.join(','));
        }
      }
    }
  }
  // The signpost (hazard.postX, DESIGN 5) stands well inside the take-offs that clear: a press up to
  // POST_SLACK px either side of it clears at every scale. A post on the first pixel of a gap's window
  // would fail this, because an earlier take-off falls short (shown below).
  const POST_SLACK = 10;
  for (const sc of SCALES) {
    const s1 = startTestRun(TG, sc);
    for (const id of cases) {
      const h = s1.level.hazards.find((z) => z.id === id);
      if (!(typeof h.postX === 'number' && h.postX > h.winStart && h.postX < h.winEnd)) {
        failures.push('scale ' + sc.scale + ' ' + id + ': postX ' + h.postX + ' is not inside the window ' + h.winStart + ' to ' + h.winEnd);
        continue;
      }
      for (const d of [-POST_SLACK, 0, POST_SLACK]) {
        trials++;
        const r = tryHazard(env, sc, id, 'start', 'stepped', h.postX + d);
        if (!r.cleared) failures.push('scale ' + sc.scale + ' ' + id + ' post ' + (d >= 0 ? '+' : '') + d + ' (take-off ' + fmt(r.takeoff - h.x, 2) + ' px from the hazard): ' + r.events.join(','));
      }
    }
  }
  // The check must be able to fail: pressing well outside the window does not clear.
  const sc = SCALES[1];
  const s0 = startTestRun(TG, sc);
  const outside = [];
  for (const id of ['h0', 'h1', 'h2', 'h3']) {
    const h = s0.level.hazards.find((z) => z.id === id);
    const early = tryHazard(env, sc, id, 'start', 'stepped', h.winStart - 24);
    const late = tryHazard(env, sc, id, 'end', 'stepped', h.winEnd + 12);
    if (early.cleared) outside.push(id + ' cleared from 24 px before the window');
    if (late.cleared) outside.push(id + ' cleared from 12 px after the window');
    if (h.kind === 'gap' && tryHazard(env, sc, id, 'start', 'stepped', h.winStart - POST_SLACK).cleared) outside.push(id + ' cleared from ' + POST_SLACK + ' px before the window');
  }
  if (failures.length) return result(false, failures.length + ' of ' + trials + ' failed: ' + failures.slice(0, 6).join('; '));
  if (outside.length) return result(false, 'the check is not sensitive: ' + outside.join('; '));
  return result(true, trials + ' presses at the window edges and ' + POST_SLACK + ' px either side of the signpost at scales 0.45, 1.0, 1.25 (gaps, bramble, branch, beehive, arch)');
};

// --- fall-geometry ------------------------------------------------------------------------------
CHECKS['fall-geometry'] = function () {
  const env = simEnv();
  const TG = env.TG;
  const C = TG.C;
  const failures = [];
  let trials = 0;
  for (const sc of SCALES) {
    for (const id of ['h0', 'h1']) {
      for (let i = 0; i < 20; i++) {
        trials++;
        const s = startTestRun(TG, sc);
        const events = recordEvents(TG);
        const gap = s.level.hazards.find((z) => z.id === id);
        const lives = s.player.lives;
        teleport(TG, gap.x - 20 - i * 0.61);
        let steps = 0;
        while (steps++ < 3000) {
          const st = TG.Game.state;
          if (st.screen === 'playing' && st.player.state === 'run' && st.player.x > gap.x + gap.w + 30) break;
          TG.Game.step(C.DT);
        }
        const st = TG.Game.state;
        const falls = events.filter((e) => e.name === 'hero:fall');
        const lost = events.filter((e) => e.name === 'life:lost');
        const rescues = events.filter((e) => e.name === 'hero:rescue');
        let why = null;
        if (falls.length !== 1 || falls[0].payload.gapId !== gap.id) why = falls.length + ' falls';
        else if (lost.length !== 1 || lost[0].payload.cause.type !== 'fall' || st.player.lives !== lives - 1) why = 'lives ' + lives + ' -> ' + st.player.lives;
        else if (rescues.length !== 1 || rescues[0].payload.x !== gap.x + gap.w + C.RESCUE_AHEAD) why = 'rescue at ' + (rescues[0] ? rescues[0].payload.x : 'none');
        if (why) failures.push('scale ' + sc.scale + ' ' + id + ' offset ' + i + ': ' + why);
      }
    }
  }
  if (failures.length) return result(false, failures.length + ' of ' + trials + ' failed: ' + failures.slice(0, 6).join('; '));
  return result(true, trials + ' runs into a narrow and a wide gap at scales 0.45, 1.0, 1.25: one fall, one life, rescue 24 px past the gap');
};

// --- duck-held ------------------------------------------------------------------------------------
CHECKS['duck-held'] = function () {
  const env = simEnv();
  const TG = env.TG;
  const C = TG.C;
  const s = startTestRun(TG, SCALES[1], { empty: true });
  TG.Input.keyDown('duck');
  TG.Game.step(C.DT);
  if (s.player.state !== 'slide') return result(false, 'duck did not start a slide');
  // Here and for `ws` below timeScale is read as the world's speed, and here it is divided by. A Pocket
  // Watch would make it 0 (LEVEL2 6.3); this run of the test level has no crate, so none can run.
  const hold = Math.ceil(C.SLIDE_TIME / (s.timeScale * C.DT)) + 30;
  for (let i = 0; i < hold; i++) TG.Game.step(C.DT);
  if (TG.Game.state.player.state !== 'slide') return result(false, 'the slide ended while duck was held');
  TG.Input.clear();
  TG.Game.step(C.DT);
  TG.Game.step(C.DT);
  const p = TG.Game.state.player;
  if (p.state !== 'run') return result(false, 'after TG.Input.clear() the state is ' + p.state + ' (slideT ' + fmt(p.slideT, 3) + ', duckHeld ' + p.duckHeld + ')');
  // A tap gives the minimum slide.
  TG.Input.keyDown('enter');
  TG.Game.step(C.DT);
  TG.Input.keyUp('enter');
  let steps = 0;
  while (TG.Game.state.player.state === 'slide' && steps < 1000) { TG.Game.step(C.DT); steps++; }
  const ws = (steps + 1) * C.DT * TG.Game.state.timeScale;
  if (Math.abs(ws - C.SLIDE_TIME) > 2 * C.DT) return result(false, 'a tap slid for ' + fmt(ws, 3) + ' ws, expected ' + C.SLIDE_TIME);
  return result(true, 'held slide lasts, ends after TG.Input.clear(); a tap slides ' + fmt(ws, 3) + ' ws');
};

// --- input-translate ------------------------------------------------------------------------------
CHECKS['input-translate'] = function () {
  const env = stubs.load({ files: ['js/core.js', 'js/input.js'] });
  const TG = env.TG;
  const I = TG.Input;
  const chr = (c) => ({ kind: 'char', ch: c });
  const key = (k) => ({ kind: 'key', key: k });
  const cases = [
    [{ key: 'a' }, chr('a')], [{ key: 'Z' }, chr('z')], [{ key: 'q', code: 'KeyA' }, chr('q')],
    [{ key: 'a', repeat: true }, null],
    [{ key: 'a', ctrlKey: true }, null], [{ key: 'a', metaKey: true }, null], [{ key: 'a', altKey: true }, null],
    [{ key: ' ', ctrlKey: true }, null], [{ key: 'Enter', metaKey: true }, null],
    [{ key: ';', code: 'Semicolon' }, key('semicolon')], [{ key: ':', code: 'Semicolon', shiftKey: true }, key('semicolon')],
    [{ key: ';', code: 'Comma' }, key('semicolon')],
    [{ key: 'ö', code: 'Semicolon' }, key('semicolon')], [{ key: 'ñ', code: 'Semicolon' }, key('semicolon')],
    [{ key: 'm', code: 'Semicolon' }, chr('m')], [{ key: 'M', code: 'Semicolon', shiftKey: true }, chr('m')],
    [{ key: ' ', code: 'Space' }, key('space')], [{ key: 'Spacebar' }, key('space')],
    [{ key: 'Enter' }, key('enter')], [{ key: 'ArrowUp' }, key('up')], [{ key: 'ArrowDown' }, key('down')],
    [{ key: 'ArrowLeft' }, key('left')], [{ key: 'ArrowRight' }, key('right')], [{ key: 'Escape' }, key('esc')],
    [{ key: 'Backspace' }, key('backspace')],
    [{ key: 'Enter', repeat: true }, key('enter')],      // translate keeps keys; the DOM handler drops the repeat
    // A non-Latin layout: the QWERTY letter of the key's position (e.code); the semicolon key still ducks.
    [{ key: 'ф', code: 'KeyA' }, chr('a')], [{ key: 'α', code: 'KeyA' }, chr('a')], [{ key: 'ש', code: 'KeyA' }, chr('a')],
    [{ key: 'Ж', code: 'KeyZ', shiftKey: true }, chr('z')], [{ key: 'ф', code: 'KeyA', repeat: true }, null],
    [{ key: 'ж', code: 'Semicolon' }, key('semicolon')], [{ key: 'é', code: 'Digit2' }, null], [{ key: 'ф' }, null],
    [{ key: 'Tab' }, null], [{ key: 'Shift' }, null], [{ key: '1' }, null], [{ key: 'é' }, null],
    [{ key: 'Dead' }, null], [{ key: 'F5' }, null], [{ key: 'ab' }, null], [{}, null]
  ];
  const bad = [];
  for (const [e, want] of cases) {
    const got = I.translate(e);
    if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(JSON.stringify(e) + ' -> ' + JSON.stringify(got) + ', expected ' + JSON.stringify(want));
  }
  if (I.translate(null) !== null) bad.push('translate(null) is not null');

  // The DOM handlers.
  let first = 0;
  I.onFirstInput = () => { first++; };
  I.init(env.window);
  I.clear();
  const d = (type, init) => env.dispatch(type, init);
  let ev = d('keydown', { key: 'a' });
  if (JSON.stringify(stubs.plain(I.drain())) !== JSON.stringify([{ type: 'char', ch: 'a' }]) || !ev.defaultPrevented) bad.push('keydown a');
  ev = d('keydown', { key: 'r', ctrlKey: true });
  if (I.drain().length !== 0 || ev.defaultPrevented) bad.push('keydown ctrl+r is not left to the browser');
  ev = d('keydown', { key: 'a', repeat: true });
  if (I.drain().length !== 0 || ev.defaultPrevented) bad.push('keydown a with repeat');
  ev = d('keydown', { key: ' ' });
  if (JSON.stringify(stubs.plain(I.drain())) !== JSON.stringify([{ type: 'down', key: 'space' }]) || !ev.defaultPrevented) bad.push('keydown space');
  ev = d('keydown', { key: ' ', repeat: true });
  if (I.drain().length !== 0 || !ev.defaultPrevented) bad.push('repeated space is not dropped and prevented');
  d('keyup', { key: ' ' });
  if (JSON.stringify(stubs.plain(I.drain())) !== JSON.stringify([{ type: 'up', key: 'space' }])) bad.push('keyup space');
  ev = d('keydown', { key: 'Tab' });
  if (I.drain().length !== 0 || ev.defaultPrevented) bad.push('Tab is not left to the browser');
  d('keydown', { key: 'Enter' });
  d('keyup', { key: 'Enter', ctrlKey: true });
  if (I.isDown('enter')) bad.push('Enter released with Ctrl held stays down');
  I.drain();
  d('keydown', { key: 'ArrowDown' });
  d('blur', {});
  if (I.isDown('down') || I.drain().length !== 0) bad.push('blur does not clear');
  if (first !== 1) bad.push('onFirstInput called ' + first + ' times');

  // The queue functions.
  I.clear();
  I.typeChar('B'); I.typeChar('1'); I.typeChar('ab'); I.typeChar(''); I.typeChar(null);
  I.keyDown('jump'); I.keyDown('jump'); I.keyUp('duck'); I.keyUp('jump'); I.keyUp('jump');
  const q = JSON.stringify(stubs.plain(I.drain()));
  const want = JSON.stringify([{ type: 'char', ch: 'b' }, { type: 'down', key: 'jump' }, { type: 'up', key: 'jump' }]);
  if (q !== want) bad.push('queue ' + q + ', expected ' + want);
  I.keyDown('duck');
  I.clear();
  if (I.isDown('duck') || I.drain().length !== 0) bad.push('clear');
  if (env.errors.length) bad.push('console.error: ' + env.errors[0]);
  return bad.length ? result(false, bad.slice(0, 6).join('; ')) : result(true, cases.length + ' translate cases, DOM handlers, queue');
};

// --- input-buttons --------------------------------------------------------------------------------
CHECKS['input-buttons'] = function () {
  const env = stubs.load({ files: ['js/core.js', 'js/input.js'] });
  const I = env.TG.Input;
  const bad = [];
  for (const k of ['jump', 'duck']) {
    const el = env.document.getElementById('btn-' + k);
    I.bindButton(el, k);
    I.clear();
    const down = env.dispatchTo(el, 'pointerdown', { pointerId: 1 });
    if (JSON.stringify(stubs.plain(I.drain())) !== JSON.stringify([{ type: 'down', key: k }])) bad.push(k + ': pointerdown does not queue a key down');
    if (!down.defaultPrevented) bad.push(k + ': pointerdown not prevented');
    if (env.document.activeElement === el) bad.push(k + ': the button kept focus');
    for (const up of ['pointerup', 'pointercancel', 'pointerleave']) {
      if (up !== 'pointerup') env.dispatchTo(el, 'pointerdown', { pointerId: 1 });
      I.drain();
      env.dispatchTo(el, up, { pointerId: 1 });
      if (JSON.stringify(stubs.plain(I.drain())) !== JSON.stringify([{ type: 'up', key: k }])) bad.push(k + ': ' + up + ' does not queue the key up');
    }
    el.focus();
    env.dispatchTo(el, 'focus', {});
    if (env.document.activeElement === el) bad.push(k + ': focus is kept');
  }
  return bad.length ? result(false, bad.join('; ')) : result(true, 'pointerdown, pointerup, pointercancel, pointerleave on JUMP and DUCK');
};

// --- load-isolated ------------------------------------------------------------------------------
CHECKS['load-isolated'] = function () {
  const bad = [];
  const sets = [['js/core.js'].concat(WPE_FILES)].concat(WPE_FILES.map((f) => ['js/core.js', f]));
  for (const files of sets) {
    let env;
    try {
      env = stubs.load({ files: files, allowMissing: false });
    } catch (e) {
      bad.push(files.join('+') + ': ' + e.message);
      continue;
    }
    const listeners = Object.keys(env.listeners).filter((k) => env.listeners[k].length > 0);
    if (env.errors.length || env.warnings.length) bad.push(files.join('+') + ': console ' + (env.errors[0] || env.warnings[0]));
    if (env.canvasCalls.count !== 0 || env.audio.contexts.length !== 0 || env.storage.size !== 0 ||
      env.raf.length !== 0 || env.timers.length !== 0 || listeners.length !== 0) {
      bad.push(files.join('+') + ': touched canvas, audio, storage, timers or listeners at load time');
    }
  }
  return bad.length ? result(false, bad.join('; ')) : result(true, 'every WP-E file loads with core.js alone and all together');
};

// --- sim-purity -------------------------------------------------------------------------------
CHECKS['sim-purity'] = function () {
  const forbidden = [
    /Math\.random/, /\bDate\b/, /\bperformance\b/, /setTimeout|setInterval|requestAnimationFrame/,
    /localStorage/, /\bdocument\b/, /TG\.(Audio|Gfx|Font|Effects|Hud|Render|UI|Main)\b/
  ];
  const bad = [];
  for (const f of WPE_FILES) {
    const source = fs.readFileSync(path.join(stubs.ROOT, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"])\/\/.*$/gm, '$1')
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
    for (const re of forbidden) {
      if (re.test(source)) bad.push(f + ' uses ' + re.source);
    }
  }
  return bad.length ? result(false, bad.join('; ')) : result(true, 'no clock, randomness, DOM, storage or presentation calls in the simulation files');
};

// --- init-event -----------------------------------------------------------------------------------
CHECKS['init-event'] = function () {
  const env = simEnv();
  const TG = env.TG;
  const events = recordEvents(TG);
  TG.Game.init();
  const first = events[0];
  if (!first || first.name !== 'screen:change' || first.payload.from !== null || first.payload.to !== 'boot') {
    return result(false, 'init emitted ' + (first ? first.name + ' ' + JSON.stringify(stubs.plain(first.payload)) : 'nothing'));
  }
  events.length = 0;
  TG.Game.newRun({ difficulty: 'medium', seed: 1, adaptive: false, assist: 1, tutorial: false });
  const names = events.map((e) => e.name).join(',');
  if (names !== 'screen:change,level:start,section:enter') return result(false, 'newRun emitted ' + names);
  const s = TG.Game.state;
  if (s.screen !== 'playing' || !s.player || !s.typing || !s.level || !s.picker || !s.rng) return result(false, 'newRun state incomplete');
  const ls = events[1].payload;
  if (ls.continued !== false || ls.music.level !== 'level1' || ls.music.boss !== 'boss1') return result(false, 'level:start payload ' + JSON.stringify(stubs.plain(ls)));
  if (TG.Game.setScreen('title') !== false) return result(false, 'playing -> title was allowed');
  if (!TG.Game.canGo('lifeLost', 'paused') || TG.Game.canGo('playing', 'results')) return result(false, 'canGo table');
  return result(true, 'init: screen:change boot; newRun: screen:change, level:start, section:enter');
};

// Runs a fresh session step by step with a callback, for the checks below.
function withSession(opts, fn) {
  const session = new Session(opts);
  if (session.done) return result(false, session.report.error);
  try {
    return fn(session, session.TG);
  } catch (e) {
    return result(false, 'exception: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
  }
}

// --- no-dodge-actions -------------------------------------------------------------------------
// A test that makes Pip jump, and one that makes him slide, at the moment a threat reaches t = 1.
CHECKS['no-dodge-actions'] = function () {
  const env = simEnv();
  const TG = env.TG;
  const C = TG.C;
  const bad = [];
  // Every threat kind the code defines, so that a kind added later is tried without being added here.
  const kinds = Object.keys(TG.Entities.KINDS).filter((k) => TG.Entities.KINDS[k].type === 'threat');
  let trials = 0;
  for (const kind of kinds) {
    for (const action of ['jump', 'duck']) {
      trials++;
      const s = startTestRun(TG, SCALES[1], { empty: true });
      const events = recordEvents(TG);
      const e = TG.Entities.spawn(s, { kind: kind });
      if (!e) { bad.push(kind + ': spawn failed'); continue; }
      // Press so that Pip is in the air (apex) or mid-slide when the threat's clock runs out.
      const lead = action === 'jump' ? C.JUMP_TIME / 2 : C.SLIDE_TIME / 2;
      let pressed = false;
      let stateAtContact = null;
      TG.Events.on('threat:hit', () => { stateAtContact = TG.Game.state.player.state; });
      for (let i = 0; i < 5000 && !e.dead; i++) {
        if (!pressed && e.budget - e.age <= lead + 1e-9) {
          TG.Input.keyDown(action);
          pressed = true;
        } else if (pressed && TG.Input.isDown(action) && action === 'jump') {
          TG.Input.keyUp(action);
        }
        TG.Game.step(C.DT);
      }
      TG.Input.clear();
      const hit = events.filter((x) => x.name === 'threat:hit' && x.payload.id === e.id);
      const want = action === 'jump' ? 'jump' : 'slide';
      if (hit.length !== 1) bad.push(kind + ' ' + action + ': no threat:hit');
      else if (stateAtContact !== want) bad.push(kind + ' ' + action + ': Pip was ' + stateAtContact + ' at contact, not ' + want);
    }
  }
  return bad.length ? result(false, bad.join('; ')) : result(true, trials + ' contacts while jumping or sliding, all threat:hit');
};

// --- spawn-onscreen ---------------------------------------------------------------------------
CHECKS['spawn-onscreen'] = function () {
  const env = simEnv();
  const TG = env.TG;
  const C = TG.C;
  const bad = [];
  for (const B of [2, 6, 12]) {
    for (const kind of ['dawdle', 'hoppet', 'buzzle', 'truffle', 'digby', 'dangle', 'flit']) {
      // pace 1 and perChar 0: the budget is exactly `react` world seconds.
      const s = startTestRun(TG, SCALES[1], { empty: true, tune: { medium: { react: B, perChar: 0 } } });
      const e = TG.Entities.spawn(s, { kind: kind });
      if (!e) { bad.push(kind + ' B=' + B + ': spawn failed'); continue; }
      if (Math.abs(e.budget - B) > 1e-9) { bad.push(kind + ': budget ' + e.budget + ', expected ' + B); continue; }
      if (kind === 'dangle' || kind === 'flit') {
        // From above (LEVEL2 4.3): spawned above the playfield, never inside it. It comes into view through
        // the top edge, or for a dangle hanging beyond the view through the right edge, and stays in view.
        if (e.onScreen || e.y > C.PLAY_TOP) bad.push(kind + ' B=' + B + ' is spawned inside the playfield (y ' + fmt(e.y, 1) + ')');
        let entered = false;
        for (let i = 0; i < 5000; i++) {
          const bottom = e.y, left = e.x - e.w / 2 - TG.Game.state.camera.x;
          TG.Game.step(C.DT);
          if (e.dead) break;
          if (e.onScreen && !entered) {
            entered = true;
            // 2 px of allowance at the right edge: in a step onScreen is worked out before the camera
            // follows Pip, so the camera it is told from is one step of running (about 1 px) behind.
            const fromTop = bottom <= C.PLAY_TOP, fromRight = left >= C.W - 2;
            if (!fromTop && !(fromRight && kind === 'dangle')) bad.push(kind + ' B=' + B + ' appeared inside the view at t=' + fmt(e.t, 3));
          } else if (!e.onScreen && entered) {
            bad.push(kind + ' B=' + B + ' left the view at t=' + fmt(e.t, 3));
            break;
          }
        }
        if (!entered) bad.push(kind + ' B=' + B + ' never came into view');
        continue;
      }
      if (kind !== 'digby') {
        if (!e.onScreen) bad.push(kind + ' B=' + B + ' is not on screen when spawned (x ' + fmt(e.x - s.camera.x, 1) + ')');
        TG.Game.step(C.DT);
        if (!e.onScreen) bad.push(kind + ' B=' + B + ' is not on screen after the first step');
        continue;
      }
      // Digby: underground at DIGBY_DX until DIGBY_POP_T, on screen from then on.
      let popped = false;
      for (let i = 0; i < 5000 && !e.dead; i++) {
        const dx = e.x - TG.Game.state.player.x;
        if (e.t < C.DIGBY_POP_T) {
          if (e.onScreen || Math.abs(dx - C.DIGBY_DX) > 1e-6) { bad.push('digby B=' + B + ' at t=' + fmt(e.t, 3) + ': onScreen ' + e.onScreen + ', dx ' + fmt(dx, 2)); break; }
        } else if (e.t < 1) {
          popped = true;
          if (!e.onScreen) { bad.push('digby B=' + B + ' is not on screen at t=' + fmt(e.t, 3)); break; }
        }
        TG.Game.step(C.DT);
      }
      if (!popped) bad.push('digby B=' + B + ' never rose');
    }
  }
  return bad.length ? result(false, bad.join('; ')) : result(true, 'dawdle, hoppet, buzzle, truffle on screen at spawn for 2, 6 and 12 ws; digby underground until t = 0.85; ' +
    'dangle and flit spawned above the playfield, in through its top or (a far dangle) its right edge, and in view from then on');
};

// --- anchored-kinds -----------------------------------------------------------------------------
// A kind marked `anchored` in TG.Entities.KINDS stands at a fixed point in the world (DESIGN 4.3 "Boulder",
// LEVEL2 4.3): its x is its anchorX exactly from the spawn to the contact, and its clock is the distance
// Pip still has to run and not the time that has passed. The two differ when Pip does not run: here he
// falls into the gaps on the way and is set down past them. The Boulder is anchored; a kind that is not
// has no anchor.
CHECKS['anchored-kinds'] = function () {
  const env = simEnv();
  const TG = env.TG;
  const C = TG.C;
  const K = TG.Entities.KINDS;
  const bad = [];
  const anchored = Object.keys(K).filter((k) => K[k].anchored);
  if (!K.boulder.anchored) bad.push('the boulder is not marked anchored');
  let falls = 0;
  for (const kind of Object.keys(K).filter((k) => K[k].type !== 'attack')) {
    // An anchored kind is followed at each time scale of the geometry checks; the others are only spawned.
    for (const sc of K[kind].anchored ? SCALES : [SCALES[1]]) {
      const s = startTestRun(TG, sc);
      const events = recordEvents(TG);
      const where = kind + ' at scale ' + sc.scale;
      teleport(TG, s.level.hazards[0].x - 60);        // h0, the narrow gap, is 60 px ahead
      const e = TG.Entities.spawn(s, { kind: kind, power: 'shield' });
      if (!e) { bad.push(where + ': spawn failed'); continue; }
      if (!K[kind].anchored) {
        if (e.anchorX !== 0) bad.push(kind + ' has anchorX ' + e.anchorX);
        continue;
      }
      const anchorX = e.anchorX;
      const reach = anchorX - e.contact;               // Pip's x at contact
      if (anchorX !== s.player.x + e.contact + C.RUN_SPEED * e.budget) bad.push(where + ' is anchored at ' + anchorX + ', not a budget of running ahead of Pip');
      let before = s.player.x;
      for (let i = 0; i < 20000 && !e.dead; i++) {
        before = TG.Game.state.player.x;
        TG.Game.step(C.DT);
        const p = TG.Game.state.player;
        if (e.x !== anchorX || e.anchorX !== anchorX) { bad.push(where + ' moved: x ' + e.x + ', anchorX ' + e.anchorX + ', spawned at ' + anchorX); break; }
        // The step that sets Pip down past the gap ends before the entities are updated (the lifeLost
        // timer, CONTRACT 4.16 step 6): the clock takes his new x on the next step.
        if (p.state === 'rescue') continue;
        const t = 1 - (anchorX - p.x - e.contact) / (C.RUN_SPEED * e.budget);
        if (Math.abs(e.t - t) > 1e-9) { bad.push(where + ': t is ' + e.t + ' with Pip ' + p.state + ', the distance left gives ' + t); break; }
      }
      const p = TG.Game.state.player;
      const fell = events.filter((x) => x.name === 'hero:rescue').length;
      falls += fell;
      if (fell === 0) bad.push(where + ': Pip did not fall on the way, so the clock was not told from the distance');
      if (e.reason !== 'hit' || !(before < reach && p.x >= reach)) bad.push(where + ' ended with ' + e.reason + ' at Pip x ' + fmt(p.x, 2) + ' (' + fmt(before, 2) + ' a step before), contact at ' + fmt(reach, 2));
    }
  }
  return bad.length ? result(false, bad.slice(0, 6).join('; ')) : result(true, 'anchored: ' + anchored.join(', ') + '; at scales 0.45, 1.0 and 1.25 x stays its anchorX and t follows the distance left through ' + falls + ' falls and rescues, contact on the step Pip reaches it');
};

// --- new-kinds ----------------------------------------------------------------------------------
// Level 2's two kinds, the dangle and the flit, against LEVEL2 4.3 (the check of LEVEL2 13.5). Each is
// followed from the spawn to its end at budgets of 2, 6 and 12 ws on the three time scales of the geometry
// checks, with Pip running, jumping and sliding at the contact, and once more with its word typed:
//   dangle  x is its anchorX on every step; it drops from the roof to DANGLE_ELEV by t = DANGLE_DROP_T,
//           slowing as it goes, and hangs there; one warning, from above, at the spawn
//   flit    enter, cross, behind and dive in that order with the path of the table, level at
//           FLIT_CROSS_ELEV through the crossing (the flutter there is the renderer's); a second warning,
//           from behind, once, on the step it reaches FLIT_CROSS_T, and flipX from that step on
//   both    spawned above the playfield with a top tag, and no tag once in view (a dangle hanging beyond
//           the right edge has a right tag until it scrolls in); contact on the step t reaches 1 is
//           threat:hit whatever Pip is doing; the typed word gives word:clear
//   stall   a typed letter holds the flit's clock for the letter stall and leaves the dangle's alone
// The tag is the one TG.Render.layoutLabels gives the entity (CONTRACT 5.13), which is why this check
// loads js/render.js. Then the keep-clear rule near a pool and a pipe, the dangle's distance from each
// hazard to duck, and the Checker's own assertion of that distance, which every run of the matrix makes.

// A tune block for the test level that makes every base budget exactly B world seconds on the difficulty
// of sc, whatever the word.
function fixedBudget(TG, sc, B) {
  const tune = {};
  tune[sc.difficulty] = { react: B / TG.Difficulty.resolve(sc.difficulty, {}).pace, perChar: 0 };
  return tune;
}

// One trial: the kind spawned on the empty test level with a budget of B world seconds, followed until it
// is gone. `act` is 'run', 'jump', 'duck' or 'type'; typing starts once it is in view and t has reached
// `typeFrom`.
function followKind(TG, kind, sc, B, act, typeFrom) {
  const C = TG.C;
  TG.Events.clear();
  const s = startTestRun(TG, sc, { empty: true, tune: fixedBudget(TG, sc, B) });
  const events = recordEvents(TG);
  const lives = s.player.lives;
  const pipX = s.player.x;
  const e = TG.Entities.spawn(s, { kind: kind });
  if (!e) return null;
  const rows = [];
  const look = () => {
    const st = TG.Game.state;
    const label = TG.Render.layoutLabels(st).find((l) => l.id === e.id);
    rows.push({
      t: e.t, x: e.x, dx: e.x - st.player.x, elev: e.elev, y: e.y, phase: e.phase, onScreen: e.onScreen, flipX: e.flipX,
      turned: e.turned, anchorX: e.anchorX, screenX: e.x - st.camera.x, edge: label ? label.edge : undefined,
      warns: events.filter((x) => x.name === 'threat:warn' && x.payload.id === e.id).length
    });
  };
  look();
  const lead = act === 'jump' ? C.JUMP_TIME / 2 : C.SLIDE_TIME / 2;
  let pressed = false;
  let pipAtEnd = null;
  let typed = 0;
  TG.Events.on('threat:hit', () => { pipAtEnd = TG.Game.state.player.state; });
  for (let i = 0; i < 20000 && !e.dead; i++) {
    if (act === 'jump' || act === 'duck') {
      // As in no-dodge-actions: Pip is at the top of his jump, or mid-slide, when the clock runs out.
      if (!pressed && e.budget - e.age <= lead + 1e-9) {
        TG.Input.keyDown(act);
        pressed = true;
      } else if (pressed && act === 'jump' && TG.Input.isDown(act)) {
        TG.Input.keyUp(act);
      }
    } else if (act === 'type' && e.onScreen && e.t >= typeFrom && typed < e.word.length) {
      TG.Input.typeChar(e.word[typed++]);
    }
    TG.Game.step(C.DT);
    if (!e.dead) look();
  }
  TG.Input.clear();
  const mine = (name) => events.filter((x) => x.name === name && x.payload.id === e.id);
  return {
    e: e, rows: rows, budget: e.budget, pipX: pipX, spawnScreenX: rows[0].screenX,
    pipAtEnd: pipAtEnd, livesLost: lives - TG.Game.state.player.lives,
    warns: mine('threat:warn').map((x) => x.payload.from), enters: mine('threat:enter').length,
    hits: mine('threat:hit').length, bounces: mine('threat:bounce').length, clears: mine('word:clear').map((x) => x.payload.cause)
  };
}

// The tags of a followed entity in the order they were shown, without repeats: 'top', 'right' and so on,
// and 'none' while it has a plate in view.
function tagOrder(rows) {
  const out = [];
  for (const r of rows) {
    const tag = r.edge === null ? 'none' : String(r.edge);
    if (out[out.length - 1] !== tag) out.push(tag);
  }
  return out;
}

CHECKS['new-kinds'] = function () {
  const env = simEnv(SIM_FILES.concat(['js/render.js']));
  const TG = env.TG;
  const C = TG.C;
  const bad = [];
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const roof = C.GROUND_Y - C.PLAY_TOP + 16;         // both sprites are 16 px high: 176
  let trials = 0;

  // The dangle's path (LEVEL2 4.3, "Dangle"). Returns the first thing that is wrong, or null.
  const danglePath = (f) => {
    const anchorX = f.rows[0].anchorX;
    if (f.rows[0].elev !== roof || f.rows[0].onScreen) return 'spawned at elev ' + f.rows[0].elev + ', on screen ' + f.rows[0].onScreen;
    let fell = Infinity;                             // the drop of the step before, per unit of t
    for (let i = 0; i < f.rows.length; i++) {
      const r = f.rows[i];
      if (r.x !== anchorX || r.anchorX !== anchorX) return 'moved at t=' + fmt(r.t, 3) + ': x ' + r.x + ', anchorX ' + r.anchorX + ', spawned at ' + anchorX;
      if (r.y !== C.GROUND_Y - r.elev) return 'y ' + r.y + ' with elev ' + r.elev;
      if (r.t >= C.DANGLE_DROP_T) {
        if (r.elev !== C.DANGLE_ELEV || r.phase !== 'hang') return 'at t=' + fmt(r.t, 3) + ' it is at elev ' + r.elev + ' in phase ' + r.phase;
        continue;
      }
      if (r.phase !== 'drop' || !(r.elev >= C.DANGLE_ELEV && r.elev <= roof)) return 'at t=' + fmt(r.t, 3) + ' it is at elev ' + r.elev + ' in phase ' + r.phase;
      if (i > 0) {
        const rate = (f.rows[i - 1].elev - r.elev) / (r.t - f.rows[i - 1].t);
        if (!(rate >= 0 && rate < fell)) return 'the drop does not slow at t=' + fmt(r.t, 3) + ' (' + fmt(rate, 1) + ' px per unit of t after ' + fmt(fell, 1) + ')';
        fell = rate;
      }
    }
    if (f.warns.join() !== 'above') return 'warnings ' + f.warns.join(',');
    return null;
  };

  // The flit's path (the table of LEVEL2 4.3, "Flit").
  const flitPath = (f, cleared) => {
    const T1 = C.FLIT_ENTER_T, T2 = C.FLIT_CROSS_T, T3 = C.FLIT_BEHIND_T;
    const phases = [];
    let turnAt = null;
    for (let i = 0; i < f.rows.length; i++) {
      const r = f.rows[i];
      const at = ' at t=' + fmt(r.t, 3);
      const want = r.t < T1 ? 'enter' : r.t < T2 ? 'cross' : r.t < T3 ? 'behind' : 'dive';
      if (r.phase !== want) return 'phase ' + r.phase + at + ', expected ' + want;
      if (phases[phases.length - 1] !== want) phases.push(want);
      // It comes lower as t goes on; t stands still during a letter stall, and the flit with it.
      const lower = (before) => !before || before.phase !== want || (r.t > before.t ? r.elev < before.elev : r.elev === before.elev);
      if (r.y !== C.GROUND_Y - r.elev) return 'y ' + r.y + ' with elev ' + r.elev + at;
      if (want === 'enter') {
        if (!near(r.dx, C.FLIT_FROM_DX) || !(r.elev <= roof && r.elev > C.FLIT_CROSS_ELEV) || !lower(f.rows[i - 1])) return 'enter' + at + ': dx ' + fmt(r.dx, 2) + ', elev ' + fmt(r.elev, 2);
      } else if (want === 'cross') {
        const dx = C.FLIT_FROM_DX + (C.FLIT_BEHIND_DX - C.FLIT_FROM_DX) * (r.t - T1) / (T2 - T1);
        // Level. The table's 4 px flutter is drawn by TG.Render about this path and is no part of it (LEVEL2
        // 13.8): the hitbox, the plate and the clock do not flutter.
        if (!near(r.dx, dx) || r.elev !== C.FLIT_CROSS_ELEV) return 'cross' + at + ': dx ' + fmt(r.dx, 2) + ' (expected ' + fmt(dx, 2) + '), elev ' + fmt(r.elev, 2) + ' (expected ' + C.FLIT_CROSS_ELEV + ')';
      } else if (want === 'behind') {
        if (!near(r.dx, C.FLIT_BEHIND_DX) || !(r.elev >= C.FLIT_BEHIND_ELEV && r.elev <= C.FLIT_CROSS_ELEV) || !lower(f.rows[i - 1])) {
          return 'behind' + at + ': dx ' + fmt(r.dx, 2) + ', elev ' + fmt(r.elev, 2);
        }
      } else {
        const q = (r.t - T3) / (1 - T3);
        const dx = C.FLIT_BEHIND_DX * (1 - q * q), elev = C.FLIT_BEHIND_ELEV + (C.FLY_HIT_ELEV - C.FLIT_BEHIND_ELEV) * q * q;
        if (!near(r.dx, dx) || !near(r.elev, elev)) return 'dive' + at + ': dx ' + fmt(r.dx, 2) + ' (expected ' + fmt(dx, 2) + '), elev ' + fmt(r.elev, 2) + ' (expected ' + fmt(elev, 2) + ')';
      }
      // The turn: flipX, the flag and the second warning all change on the first step at or past T2.
      const turned = r.t >= T2;
      if (r.flipX !== turned || r.turned !== turned || r.warns !== (turned ? 2 : 1)) return (turned ? 'after' : 'before') + ' the turn' + at + ': flipX ' + r.flipX + ', turned ' + r.turned + ', ' + r.warns + ' warnings';
      if (turned && turnAt === null) turnAt = r.t;
    }
    // All four in order; a flit that was typed away is gone before the end of the list.
    const order = 'enter,cross,behind,dive';
    if (cleared ? order.indexOf(phases.join()) !== 0 : phases.join() !== order) return 'phases ' + phases.join(',');
    if (f.warns.join() !== (turnAt === null ? 'above' : 'above,behind')) return 'warnings ' + f.warns.join(',');
    return null;
  };

  for (const sc of SCALES) {
    for (const B of [2, 6, 12]) {
      for (const kind of ['dangle', 'flit']) {
        for (const act of ['run', 'jump', 'duck', 'type']) {
          trials++;
          const where = kind + ' B=' + B + ' at scale ' + sc.scale + ' (' + act + ')';
          // The dangle is typed while it hangs; the flit after its turn.
          const f = followKind(TG, kind, sc, B, act, kind === 'dangle' ? 0.5 : 0.6);
          if (!f) { bad.push(where + ': spawn failed'); continue; }
          if (!near(f.budget, B)) { bad.push(where + ': budget ' + f.budget); continue; }
          const wrong = kind === 'dangle' ? danglePath(f) : flitPath(f, act === 'type');
          if (wrong) { bad.push(where + ': ' + wrong); continue; }
          // The tag, from the spawn on.
          const tags = tagOrder(f.rows);
          const far = kind === 'dangle' && f.spawnScreenX - 8 >= C.W;        // it hangs beyond the right edge
          // A far dangle is above the playfield for its first steps as well as beyond the edge. Its tag is
          // the right one from the spawn, as a far boulder's is: layoutLabels asks about the right edge first.
          const wantTags = far ? 'right,none' : 'top,none';
          if (tags.join() !== wantTags) bad.push(where + ': tags ' + tags.join(',') + ', expected ' + wantTags);
          if (f.enters !== 1) bad.push(where + ': ' + f.enters + ' threat:enter');
          if (kind === 'dangle') {
            const e = f.e;
            if (e.anchorX !== f.pipX + e.contact + C.RUN_SPEED * f.budget) bad.push(where + ': anchored at ' + e.anchorX + ' with Pip at ' + f.pipX);
            if (B === 2 && !(f.spawnScreenX + 8 < C.W)) bad.push(where + ': the anchor is not inside the view at spawn (screen x ' + fmt(f.spawnScreenX, 1) + ')');
          }
          // The end: contact on the step t reaches 1, or the typed word.
          const last = f.rows[f.rows.length - 1];
          if (act === 'type') {
            if (f.clears.join() !== 'typed' || f.e.reason !== 'cleared' || f.hits + f.bounces !== 0 || f.livesLost !== 0) {
              bad.push(where + ': typed, and word:clear ' + f.clears.join(',') + ', reason ' + f.e.reason + ', ' + f.hits + ' hits, ' + f.livesLost + ' lives lost');
            }
          } else {
            const wantPip = act === 'jump' ? 'jump' : act === 'duck' ? 'slide' : 'run';
            if (f.hits !== 1 || f.bounces !== 0 || f.e.reason !== 'hit' || f.livesLost !== 1 || f.clears.length !== 0) bad.push(where + ': ' + f.hits + ' threat:hit, reason ' + f.e.reason + ', ' + f.livesLost + ' lives lost');
            else if (!(last.t < 1 && f.e.t >= 1)) bad.push(where + ': contact with t ' + fmt(last.t, 4) + ' a step before and ' + fmt(f.e.t, 4) + ' at it');
            else if (f.pipAtEnd !== wantPip) bad.push(where + ': Pip was ' + f.pipAtEnd + ' at contact, not ' + wantPip);
          }
        }
      }
    }
  }

  // The letter stall (LEVEL2 4.2 and 4.3). A correct letter holds the flit's clock for config.letterStall,
  // as it holds every moving kind's. The dangle has none: its clock is the distance Pip has left to run,
  // which a letter does not change, so a stall given to it would be owed and never spent. One letter is
  // typed at each kind once it is in view. Over the steps that follow, the flit's age falls behind the
  // world clock by exactly the stall and the dangle's does not, and neither is left owing any.
  for (const sc of SCALES) {
    for (const kind of ['dangle', 'flit']) {
      trials++;
      const where = kind + ' at scale ' + sc.scale + ' (letter stall)';
      const s = startTestRun(TG, sc, { empty: true, tune: fixedBudget(TG, sc, 6) });
      const e = TG.Entities.spawn(s, { kind: kind });
      if (!e) { bad.push(where + ': spawn failed'); continue; }
      for (let i = 0; i < 5000 && !(e.onScreen && e.t >= 0.3); i++) TG.Game.step(C.DT);
      let before = e.age;
      TG.Game.step(C.DT);
      const wdt = e.age - before;                        // the world time of one step
      const stall = TG.Difficulty.toWs(s.config, s.config.letterStall);
      const steps = Math.ceil(stall / wdt) + 2;
      before = e.age;
      let owed = 0;                                      // the most stall still to come after any step
      TG.Input.typeChar(e.word[0]);
      for (let i = 0; i < steps; i++) {
        TG.Game.step(C.DT);
        owed = Math.max(owed, e.stallT);
      }
      const held = before + steps * wdt - e.age;         // how far the letter set its clock back
      const want = kind === 'flit' ? stall : 0;
      if (e.dead || e.typed !== 1) {
        bad.push(where + ': the letter was not taken (typed ' + e.typed + ', reason ' + e.reason + ')');
      } else if (Math.abs(held - want) > 1e-9 || e.stallT !== 0 || (kind === 'dangle' && owed !== 0)) {
        bad.push(where + ': one letter held its clock ' + fmt(held, 4) + ' ws, expected ' + fmt(want, 4) + '; ' + fmt(e.stallT, 4) + ' ws still owed at the end, ' + fmt(owed, 4) + ' at most');
      }
    }
  }
  TG.Input.clear();

  // Keep-clear (CONTRACT 5.5 step 7). The arrival point at the base budget is put in the middle of a
  // pool (the narrow gap h0) and of a pipe (the branch h3) of the test level: it moves to the end of the
  // hazard's zone. For the dangle at the pipe that end is where its anchor is DANGLE_CLEAR past the pipe.
  const arrive = (kind, sc, x) => {
    const B = 2;
    const s = startTestRun(TG, sc, { tune: fixedBudget(TG, sc, B) });
    teleport(TG, x - C.RUN_SPEED * B);
    const e = TG.Entities.spawn(s, { kind: kind });
    return e ? { e: e, s: s, x: s.player.x + C.RUN_SPEED * e.budget } : null;
  };
  for (const sc of SCALES) {
    for (const kind of ['dangle', 'flit']) {
      for (const id of ['h0', 'h3']) {
        trials++;
        const where = kind + ' at scale ' + sc.scale + ' aimed at ' + id;
        const probe = startTestRun(TG, sc);
        const h = probe.level.hazards.find((z) => z.id === id);
        const m = probe.config.hazardMargin * probe.config.pace * C.RUN_SPEED;
        const a = arrive(kind, sc, h.x + h.w / 2);
        if (!a) { bad.push(where + ': spawn failed'); continue; }
        const plain = h.x + h.w + m;
        const want = kind === 'dangle' && id === 'h3' ? Math.max(plain, h.x + h.w + C.DANGLE_CLEAR - a.e.contact) : plain;
        if (Math.abs(a.x - want) > 1e-6) bad.push(where + ' (' + h.kind + '): arrives at ' + fmt(a.x, 2) + ', the end of the zone is ' + fmt(want, 2));
        if (kind === 'dangle' && Math.abs(a.e.anchorX - (a.x + a.e.contact)) > 1e-6) bad.push(where + ': anchor ' + fmt(a.e.anchorX, 2) + ' is not contact beyond the arrival at ' + fmt(a.x, 2));
      }
    }
  }

  // The dangle near each kind of hazard to duck (h3 branch, h4 beehive, h5 arch): wherever the base budget
  // would put it, from 12 tiles before the hazard to 12 tiles past it, its anchor is at least DANGLE_CLEAR
  // from the box of every such hazard. The flit, aimed at the same points, shows that the plain zones
  // alone would leave an anchor nearer than that.
  let nearest = Infinity, plainNearest = Infinity, spawns = 0;
  // The hazard to duck that is nearest to x, and how far its box is.
  const nearestTo = (level, x) => {
    let best = { gap: Infinity, kind: null };
    for (const h of level.hazards) {
      const gap = Math.max(h.x - x, x - (h.x + h.w));
      if (DUCK_HAZARDS[h.kind] && gap < best.gap) best = { gap: gap, kind: h.kind };
    }
    return best;
  };
  for (const sc of SCALES) {
    for (const id of ['h3', 'h4', 'h5']) {
      const h = startTestRun(TG, sc).level.hazards.find((z) => z.id === id);
      for (let x = h.x - 12 * C.TILE; x <= h.x + h.w + 12 * C.TILE; x += 4) {
        const d = arrive('dangle', sc, x), f = arrive('flit', sc, x);
        if (!d || !f) { bad.push('scan at ' + x + ': spawn failed'); break; }
        spawns++;
        const hung = nearestTo(d.s.level, d.e.anchorX);
        if (hung.gap < C.DANGLE_CLEAR - 1e-6) { bad.push('a dangle aimed at x ' + x + ' at scale ' + sc.scale + ' hangs ' + fmt(hung.gap, 2) + ' px from the ' + hung.kind); break; }
        nearest = Math.min(nearest, hung.gap);
        plainNearest = Math.min(plainNearest, nearestTo(f.s.level, f.x + d.e.contact).gap);
      }
    }
  }
  if (Math.abs(nearest - C.DANGLE_CLEAR) > 1e-6) bad.push('the nearest dangle hangs ' + fmt(nearest, 3) + ' px from a hazard to duck, so the rule was never the reason');
  if (!(plainNearest < C.DANGLE_CLEAR - 1)) bad.push('the plain zones already keep ' + fmt(plainNearest, 1) + ' px, so the scan shows nothing');

  // The same distance is asserted by the Checker for every dangle of every bot run (`keep-clear`). Here it
  // takes a dangle the engine placed beside the pipe as it is, and refuses one hung 28 px nearer.
  const session = new Session({
    levelId: 'test', difficulty: 'medium', profile: 'target',
    setup: (T) => { T.Levels.test = testLevel(T); }
  });
  if (session.done) {
    bad.push('the Checker could not be tried: ' + session.report.error);
  } else {
    const T = session.TG;
    const h = T.Game.state.level.hazards.find((z) => z.id === 'h3');
    teleport(T, h.x - 200);
    const e = T.Entities.spawn(T.Game.state, { kind: 'dangle' });
    if (!e || session.checker.error) {
      bad.push('the Checker refused a dangle the engine placed: ' + session.checker.error);
    } else {
      e.anchorX = h.x + h.w + C.DANGLE_CLEAR - 28;
      session.checker.checkSpawn(e);
      const refused = session.checker.error;
      if (!refused || refused.indexOf('keep-clear') === -1) bad.push('the Checker took a dangle 100 px from a pipe: ' + refused);
    }
  }

  return bad.length ? result(false, bad.length + ' wrong: ' + bad.slice(0, 5).join('; ')) : result(true, trials + ' trials of dangle and flit at 2, 6 and 12 ws and scales 0.45, 1.0 and 1.25: ' +
    'path, tags, warnings, contact at t = 1 running, jumping and sliding, word:clear when typed, the letter stall on the flit alone, keep-clear at a pool and a pipe; ' +
    spawns + ' dangles aimed around a branch, a beehive and an arch hang ' + fmt(nearest, 1) + ' px away or more (' + fmt(plainNearest, 1) + ' by the plain zones); the Checker refuses one at 100 px');
};

// --- attack-windows -----------------------------------------------------------------------------
// TG.Entities.nextAction takes the window of an attack from its action and not from the name of its kind:
// SHOCK_WIN for an attack to jump, PICK_WIN for one to duck (LEVEL2 13.1). Shown on a shockwave and a
// pickaxe as they are, and on each with the other's action written onto the entity by hand, since no
// kind has that pairing.
CHECKS['attack-windows'] = function () {
  const env = simEnv();
  const TG = env.TG;
  const C = TG.C;
  const inside = (win, eta) => eta >= win[0] && eta <= win[1];
  const bad = [];
  let told = 0;                 // steps on which the two windows give different answers
  for (const [kind, action] of [['shock', 'jump'], ['pick', 'duck'], ['shock', 'duck'], ['pick', 'jump']]) {
    const s = startTestRun(TG, SCALES[1], { empty: true });
    const e = TG.Entities.spawnAttack(s, kind);
    if (!e) { bad.push(kind + ': spawnAttack failed'); continue; }
    e.action = action;
    const win = action === 'jump' ? C.SHOCK_WIN : C.PICK_WIN;
    let wasInside = false;
    for (let i = 0; i < 2000 && !e.dead && e.eta >= 0; i++) {
      const a = TG.Entities.nextAction(TG.Game.state);
      if (!a || a.id !== e.id || a.source !== 'attack' || a.action !== action) { bad.push(kind + ' as ' + action + ': nextAction gave ' + JSON.stringify(a)); break; }
      if (a.inWindow !== inside(win, e.eta) || Math.abs(a.eta - Math.max(0, e.eta - win[1])) > 1e-12) {
        bad.push(kind + ' as ' + action + ' at eta ' + fmt(e.eta, 3) + ': inWindow ' + a.inWindow + ', opens in ' + fmt(a.eta, 3));
        break;
      }
      if (a.inWindow) wasInside = true;
      if (inside(C.SHOCK_WIN, e.eta) !== inside(C.PICK_WIN, e.eta)) told++;
      TG.Game.step(C.DT);
    }
    if (!wasInside) bad.push(kind + ' as ' + action + ': the window never opened');
  }
  if (told === 0) bad.push('the two windows never differed, so the check shows nothing');
  return bad.length ? result(false, bad.slice(0, 6).join('; ')) : result(true, 'jump attacks open at ' + C.SHOCK_WIN.join(' to ') + ' ws, duck attacks at ' + C.PICK_WIN.join(' to ') + ' ws, whatever the kind');
};

// --- spawn-skin -----------------------------------------------------------------------------------
// A spawn spec may name a sprite to draw in place of the kind's own; TG.Entities.spawn copies it onto the
// entity as `skin`, and an entity spawned without one has no such field (LEVEL2 4.5). The boss passes
// level.boss.minionSkin for its phase 3 minion when the level has one (LEVEL2 4.4, 10.6). The skin is
// presentation only: the word, the budget and the path are the same with and without it.
CHECKS['spawn-skin'] = function () {
  const env = simEnv();
  const TG = env.TG;
  const C = TG.C;
  const bad = [];
  const facts = (e) => JSON.stringify([e.kind, e.word, e.budget, e.x, e.y, e.w, e.h, e.from]);
  // 1. TG.Entities.spawn, for a threat and a crate.
  for (const kind of ['hoppet', 'crate']) {
    const plain = TG.Entities.spawn(startTestRun(TG, SCALES[1], { empty: true }), { kind: kind, power: 'shield' });
    const skinned = TG.Entities.spawn(startTestRun(TG, SCALES[1], { empty: true }), { kind: kind, power: 'shield', skin: 'en_other' });
    if (!plain || !skinned) { bad.push(kind + ': spawn failed'); continue; }
    if ('skin' in plain) bad.push(kind + ' spawned without a skin has the field (' + plain.skin + ')');
    if (skinned.skin !== 'en_other') bad.push(kind + ' spawned with skin en_other has ' + skinned.skin);
    if (facts(plain) !== facts(skinned)) bad.push(kind + ' differs with a skin: ' + facts(plain) + ' and ' + facts(skinned));
  }
  // 2. The minion, and not the rocks. With one entry in each volley the first throw of phase 1 is a rock
  // and the first throw of phase 3 is the minion; phase 3 is started as a continue starts it, from the
  // phase stored with the boss checkpoint.
  const firstThrows = (bossTable) => {
    const s = startTestRun(TG, SCALES[1], { empty: true, boss: bossTable, tune: { medium: { boss: { rocks: [1, 1, 1], minion: true } } } });
    const spawned = [];
    TG.Events.on('threat:spawn', (p) => spawned.push(p.entity));
    teleport(TG, s.level.arenaX - 8);
    for (let i = 0; i < 2000 && spawned.length === 0; i++) TG.Game.step(C.DT);
    if (spawned.length !== 1 || TG.Game.state.screen !== 'boss') return null;
    TG.Game.state.checkpoint.bossPhase = 3;
    if (!TG.Game.pause() || !TG.Game.continueRun()) return null;
    for (let i = 0; i < 2000 && spawned.length === 1; i++) TG.Game.step(C.DT);
    return spawned.length === 2 ? { rock: spawned[0], minion: spawned[1] } : null;
  };
  const dressed = firstThrows({ kind: 'baron', speech: 'TEST', minionSkin: 'en_spare' });
  const usual = firstThrows({ kind: 'baron', speech: 'TEST' });
  if (!dressed || !usual || dressed.rock.kind !== 'rock' || usual.rock.kind !== 'rock' || dressed.minion.kind !== 'digby' || usual.minion.kind !== 'digby') {
    bad.push('a rock in phase 1 and the minion in phase 3 did not appear: ' + JSON.stringify([dressed, usual].map((t) => t && [t.rock.kind, t.minion.kind])));
  } else {
    if (dressed.minion.skin !== 'en_spare') bad.push('the minion of a level with minionSkin en_spare has skin ' + dressed.minion.skin);
    if ('skin' in dressed.rock) bad.push('a rock of a level with minionSkin has skin ' + dressed.rock.skin);
    if ('skin' in usual.minion || 'skin' in usual.rock) bad.push('a level without minionSkin gave a skin: minion ' + usual.minion.skin + ', rock ' + usual.rock.skin);
    if (facts(dressed.minion) !== facts(usual.minion)) bad.push('the minion differs with a skin: ' + facts(usual.minion) + ' and ' + facts(dressed.minion));
  }
  // 3. Level 1 names no minion skin.
  if (TG.Levels[1].boss.minionSkin !== undefined) bad.push('Level 1 has boss.minionSkin ' + TG.Levels[1].boss.minionSkin);
  return bad.length ? result(false, bad.slice(0, 6).join('; ')) : result(true, 'spec.skin is copied onto a threat and a crate and absent otherwise; the minion, and no rock, carries level.boss.minionSkin when the level has one; nothing else changes');
};

// --- skins --------------------------------------------------------------------------------------
// The check of that name in LEVEL2 13.5, on the data of each level played. A level may name sprites to be
// drawn in the place of Level 1's: theme.tiles and theme.hazardSkins by key (LEVEL2 3.4), theme.skins by
// kind (LEVEL2 4.5) and boss.minionSkin for the phase 3 minion (LEVEL2 4.4). TG.Render and TG.Effects put
// such a sprite where the original goes and choose its frame as they choose the original's, so:
//   every name is in the manifest (TG.Sprites.MANIFEST) and is a defined sprite;
//   each has the size, the frame names, the fps and the anchor of the sprite it stands for: SKIN_ORIGINALS
//   for a tile or a hazard, the sprite of the kind in TG.Entities.KINDS for a creature or an attack;
//   a key of theme.tiles or theme.hazardSkins is one the renderer reads, a kind of theme.skins is a kind,
//   and a remap of theme.skins is a defined remap;
//   a sprite that the effects leave in the place of another (skin.fx) has its size and its anchor. Its
//   frames and its frame rate are its own, because the effects play it as it is: Level 2's fx_star, for
//   the bee's fx_flower, has other frame names and twice the frame rate;
//   a key of skin.fx is a sprite the effects swap for that kind (SKIN_FX): any other would be read by
//   nothing, and the level would carry a swap that is never drawn.

// The Level 1 sprite that each key of theme.tiles and theme.hazardSkins stands for: the fallbacks of
// js/render.js (TILES and HAZARD_SKINS there; archTrunk falls back to trunk).
const SKIN_ORIGINALS = {
  tiles: {
    top: 'tile_grass', fill: 'tile_soil', edgeL: 'tile_edge_l', edgeR: 'tile_edge_r', wallL: 'tile_wall_l', wallR: 'tile_wall_r',
    gapFill: 'tile_water', gapFillDark: 'tile_dark', plank: 'tile_plank', arenaTop: 'tile_arena', arenaFill: 'tile_soil', rail: 'tile_rail'
  },
  hazardSkins: {
    bramble: 'haz_bramble', branch: 'haz_branch', trunk: 'haz_trunk', canopy: 'haz_canopy', beehive: 'haz_beehive', rope: 'haz_rope',
    arch: 'haz_arch', archTrunk: 'haz_trunk'
  }
};

// The sprites that js/effects.js swaps through skin.fx, by kind: the buzzle's flower, in clearEnd (fxFor).
const SKIN_FX = { buzzle: ['fx_flower'] };

// What is wrong with the skins of the level data `data`, and how many names were looked at.
function skinProblems(TG, data) {
  const problems = [];
  let names = 0;
  const rows = new Map(TG.Sprites.MANIFEST.map((m) => [m.name, m]));
  const theme = data.theme || {};
  // `name` is drawn in the place of `original`. whole: the frame names and the fps are compared as well.
  const alike = (where, name, original, whole) => {
    names++;
    const a = rows.get(name), b = rows.get(original);
    if (!a) { problems.push(where + ': ' + name + ' is not in the manifest'); return; }
    if (!b) { problems.push(where + ': ' + original + ', which it stands for, is not in the manifest'); return; }
    if (!TG.Sprites.has(name)) problems.push(where + ': ' + name + ' is not defined');
    if (a.w !== b.w || a.h !== b.h) problems.push(where + ': ' + name + ' is ' + a.w + 'x' + a.h + ' and ' + original + ' ' + b.w + 'x' + b.h);
    if (a.ax !== b.ax || a.ay !== b.ay) problems.push(where + ': ' + name + ' has its anchor at ' + a.ax + ',' + a.ay + ' and ' + original + ' at ' + b.ax + ',' + b.ay);
    if (!whole) return;
    if (a.names.join(' ') !== b.names.join(' ')) problems.push(where + ': ' + name + ' has the frames ' + a.names.join(' ') + ' and ' + original + ' ' + b.names.join(' '));
    if (a.fps !== b.fps) problems.push(where + ': ' + name + ' has fps ' + a.fps + ' and ' + original + ' ' + b.fps);
  };
  for (const group of Object.keys(SKIN_ORIGINALS)) {
    for (const key of Object.keys(theme[group] || {})) {
      const where = 'theme.' + group + '.' + key;
      if (!SKIN_ORIGINALS[group][key]) problems.push(where + ' is not a key the renderer reads');
      else alike(where, theme[group][key], SKIN_ORIGINALS[group][key], true);
    }
  }
  const K = TG.Entities.KINDS;
  for (const kind of Object.keys(theme.skins || {})) {
    const skin = theme.skins[kind], where = 'theme.skins.' + kind;
    if (!K[kind]) { problems.push(where + ' is not a kind'); continue; }
    if (skin.sprite !== undefined) alike(where + '.sprite', skin.sprite, K[kind].sprite, true);
    if (skin.remap !== undefined) {
      names++;
      if (!TG.Remaps[skin.remap]) problems.push(where + '.remap: ' + skin.remap + ' is not a remap');
    }
    for (const from of Object.keys(skin.fx || {})) {
      if ((SKIN_FX[kind] || []).indexOf(from) === -1) problems.push(where + '.fx.' + from + ' is not a sprite the effects swap for a ' + kind);
      else alike(where + '.fx.' + from, skin.fx[from], from, false);
    }
  }
  if (data.boss && data.boss.minionSkin !== undefined) alike('boss.minionSkin', data.boss.minionSkin, K.digby.sprite, true);
  return { problems: problems, names: names };
}

CHECKS['skins'] = function (ctx) {
  const env = simEnv(SIM_FILES.concat(['js/sprites-chars.js', 'js/sprites-world.js']));
  const TG = env.TG;
  const data = TG.Levels[ctx.levelId];
  const found = skinProblems(TG, data);
  if (found.problems.length > 0) return result(false, found.problems.slice(0, 6).join('; '));
  // Each rule must also be able to fail: copies of the level with one name changed, and what is then said.
  const skin = (d, kind, value) => { d.theme.skins = Object.assign({}, d.theme.skins); d.theme.skins[kind] = value; };
  const broken = [
    ['tile_nowhere is not in the manifest', (d) => { d.theme.tiles.top = 'tile_nowhere'; }],
    ['en_boulder is 24x32', (d) => { d.theme.tiles.top = 'en_boulder'; }],
    ['en_hoppet has its anchor at 8,16', (d) => { d.theme.tiles.fill = 'en_hoppet'; }],
    ['theme.tiles.roof is not a key', (d) => { d.theme.tiles.roof = 'tile_grass'; }],
    ['haz_trunk has the frames', (d) => { d.theme.hazardSkins.bramble = 'haz_trunk'; }],
    ['en_dangle has the frames hang0 hang1 zip', (d) => { skin(d, 'hoppet', { sprite: 'en_dangle' }); }],
    ['en_dangle has fps 4', (d) => { skin(d, 'hoppet', { sprite: 'en_dangle' }); }],
    ['nowhere is not a remap', (d) => { skin(d, 'hoppet', { remap: 'nowhere' }); }],
    ['theme.skins.dragon is not a kind', (d) => { skin(d, 'dragon', { sprite: 'en_hoppet' }); }],
    ['fx_lilypad is 16x8', (d) => { skin(d, 'buzzle', { fx: { fx_flower: 'fx_lilypad' } }); }],
    ['theme.skins.hoppet.fx.fx_lilypad is not a sprite the effects swap', (d) => { skin(d, 'hoppet', { fx: { fx_lilypad: 'fx_star' } }); }],
    ['theme.skins.buzzle.fx.fx_poof is not a sprite the effects swap', (d) => { skin(d, 'buzzle', { fx: { fx_poof: 'fx_star' } }); }],
    ['en_flit is 24x16', (d) => { d.boss.minionSkin = 'en_flit'; }]
  ];
  const missed = [];
  for (const [said, change] of broken) {
    const copy = JSON.parse(JSON.stringify(data));
    change(copy);
    if (!skinProblems(TG, copy).problems.some((p) => p.indexOf(said) !== -1)) missed.push(said);
  }
  if (missed.length > 0) return result(false, 'a broken copy of the level passed: ' + missed.join('; '));
  const skins = data.theme.skins || {};
  return result(true, found.names + ' names (' + Object.keys(data.theme.tiles || {}).length + ' tiles, ' + Object.keys(data.theme.hazardSkins || {}).length +
    ' hazard sprites, the skins of ' + (Object.keys(skins).join(', ') || 'no kind') + (data.boss.minionSkin ? ', the minion as ' + data.boss.minionSkin : '') +
    '): each in the manifest and defined, with the size, frame names, fps and anchor of the sprite it stands for; ' + broken.length + ' broken copies are each refused');
};

// --- typing-results -----------------------------------------------------------------------------
// CONTRACT 4.16 step 5: letters, backspace, Esc, letter stall, letter points, shield for a key streak.
CHECKS['typing-results'] = function () {
  const env = simEnv();
  const TG = env.TG;
  const C = TG.C;
  const DT = C.DT;
  const bad = [];
  const s = startTestRun(TG, SCALES[1], { empty: true });
  const events = recordEvents(TG);
  const named = (n) => events.filter((x) => x.name === n);
  const cfg = s.config;
  const e = TG.Entities.spawn(s, { kind: 'dawdle' });
  const word = e.word;

  // Lock: the first letter scores PTS_LETTER and stalls a moving threat.
  const score0 = s.score;
  const age0 = e.age;
  TG.Input.typeChar(word[0]);
  TG.Game.step(DT);
  const stall = TG.Difficulty.toWs(cfg, cfg.letterStall);
  if (s.typing.target !== e || e.typed !== 1) bad.push('the first letter did not lock');
  if (s.score !== score0 + C.PTS_LETTER) bad.push('letter points ' + (s.score - score0));
  if (Math.abs(e.stallT - (stall - DT * s.timeScale)) > 1e-9 || e.age !== age0) bad.push('letter stall: stallT ' + fmt(e.stallT, 4) + ', age moved ' + (e.age - age0));

  // Backspace releases the lock and resets progress.
  TG.Input.keyDown('backspace');
  TG.Game.step(DT);
  TG.Input.keyUp('backspace');
  const rel = named('target:release');
  if (s.typing.target !== null || e.typed !== 0 || !rel.length || rel[rel.length - 1].payload.reason !== 'backspace') bad.push('backspace did not release');

  // Esc pauses and drops the rest of the step's events.
  TG.Input.keyDown('esc');
  TG.Input.typeChar(word[0]);
  const correct = s.typing.stats.correct;
  TG.Game.step(DT);
  if (s.screen !== 'paused' || s.resumeTo !== 'playing') bad.push('Esc: screen ' + s.screen);
  if (s.typing.stats.correct !== correct || e.typed !== 0) bad.push('a letter after Esc in the same step was handled');
  TG.Input.keyUp('esc');
  TG.Input.clear();
  TG.Game.resume();

  // The whole word, one letter per step: removed on the same step, word:clear with cause typed.
  // The first letter was typed before the Backspace, so typing it again earns no points and no stall:
  // releasing and retyping cannot hold a threat back or farm points.
  const score2 = s.score;
  const stall2 = e.stallT;
  TG.Input.typeChar(word[0]);
  TG.Game.step(DT);
  if (s.typing.target !== e || e.typed !== 1) bad.push('the first letter did not lock again after the Backspace');
  if (s.score !== score2) bad.push('a letter typed again after a Backspace scored ' + (s.score - score2));
  if (e.stallT > stall2 + 1e-9) bad.push('a letter typed again after a Backspace stalled the threat (stallT ' + fmt(stall2, 4) + ' -> ' + fmt(e.stallT, 4) + ')');
  const score3 = s.score;
  TG.Input.typeChar(word[1]);
  TG.Game.step(DT);
  if (s.score !== score3 + C.PTS_LETTER) bad.push('a new letter after the retyped one scored ' + (s.score - score3));
  for (const ch of word.slice(2)) {
    TG.Input.typeChar(ch);
    TG.Game.step(DT);
  }
  const clear = named('word:clear');
  if (!e.dead || e.reason !== 'cleared' || s.entities.indexOf(e) !== -1) bad.push('the word did not clear the dawdle');
  if (clear.length !== 1 || clear[0].payload.cause !== 'typed' || clear[0].payload.word !== word) bad.push('word:clear');
  if (s.run.threatsCleared !== 1 || named('threat:hit').length) bad.push('run counters');

  // Golden quill: 20 per letter. Shield for a key streak.
  TG.Game.applyPower('quill', 0, 0);
  const e2 = TG.Entities.spawn(s, { kind: 'hoppet' });
  s.typing.stats.keyStreak = cfg.shieldKeyStreak - 1;
  const score1 = s.score;
  const shield1 = s.power.shield;
  TG.Input.typeChar(e2.word[0]);
  TG.Game.step(DT);
  if (s.score - score1 !== 2 * C.PTS_LETTER) bad.push('quill letter points ' + (s.score - score1));
  const gain = named('shield:gain');
  if (s.power.shield !== shield1 + 1 || !gain.length || gain[gain.length - 1].payload.cause !== 'streak') bad.push('no shield for a key streak of ' + cfg.shieldKeyStreak);

  // A wrong key keeps progress and counts against accuracy; with nothing typable a letter is ignored.
  const wrongBefore = s.typing.stats.wrong;
  const bogus = 'abcdefghijklmnopqrstuvwxyz'.split('').find((c) => c !== e2.word[1] && c !== e2.word[0]);
  TG.Input.typeChar(bogus);
  TG.Game.step(DT);
  if (e2.typed !== 1 || s.typing.stats.wrong !== wrongBefore + 1) bad.push('a wrong key changed progress or was not counted');

  // Backspace straight after a wrong key only takes the mistake back: the lock and progress stay. A
  // second Backspace in a row releases.
  const releases = named('target:release').length;
  TG.Input.keyDown('backspace');
  TG.Game.step(DT);
  TG.Input.keyUp('backspace');
  if (s.typing.target !== e2 || e2.typed !== 1 || named('target:release').length !== releases) bad.push('Backspace after a wrong key released the word');
  TG.Input.keyDown('backspace');
  TG.Game.step(DT);
  TG.Input.keyUp('backspace');
  const rel2 = named('target:release');
  if (s.typing.target !== null || e2.typed !== 0 || rel2.length !== releases + 1 || rel2[rel2.length - 1].payload.reason !== 'backspace') bad.push('a second Backspace did not release');

  // Moving on to another word by typing it (auto-release on Medium, CONTRACT 4.7): the letters typed
  // before the auto-release lock that word, each scores and stalls it once, and each key streak value
  // they reach is checked for a shield charge.
  // A crate first: the hoppet and the dawdle fill Medium's cap of 2 threats in section 1.
  const d1 = TG.Entities.spawn(s, { kind: 'crate', power: 'shield' });
  const d2 = TG.Entities.spawn(s, { kind: 'dawdle' });
  if (!d1 || !d2) {
    bad.push('switch: the crate or the dawdle did not spawn');
  } else {
    e2.word = 'kiwi';               // no other word starts with d or f
    d1.word = 'dad';
    d2.word = 'fogs';
    TG.Input.typeChar('d');
    TG.Game.step(DT);
    s.typing.stats.keyStreak = cfg.shieldKeyStreak - 2;
    s.power.shield = 0;
    TG.Input.typeChar('f');
    TG.Game.step(DT);
    TG.Input.typeChar('o');
    TG.Game.step(DT);
    const score4 = s.score;
    const letter = C.PTS_LETTER * (s.power.quillT > 0 ? 2 : 1);
    TG.Input.typeChar('g');
    TG.Game.step(DT);
    if (s.typing.target !== d2 || d2.typed !== 3 || d1.typed !== 0 || d2.bestTyped !== 3) bad.push('switch: fogs not locked with 3 letters (typed ' + d2.typed + ')');
    if (s.score !== score4 + 3 * letter) bad.push('switch: the replayed letters scored ' + (s.score - score4) + ', expected ' + 3 * letter);
    if (Math.abs(d2.stallT - (3 * stall - DT * s.timeScale)) > 1e-9) bad.push('switch: letter stall ' + fmt(d2.stallT, 4));
    if (s.power.shield !== 1) bad.push('switch: no shield for the streak value ' + cfg.shieldKeyStreak + ' reached by a replayed letter');
  }
  return bad.length ? result(false, bad.join('; ')) : result(true, 'lock, stall, letter points, backspace, no points or stall for letters typed again, Esc, clear, quill points, shield for a key streak, wrong key, Backspace after a wrong key keeps the word, switching words by typing');
};

// --- crate-queue ------------------------------------------------------------------------------
CHECKS['crate-queue'] = function () {
  const env = simEnv();
  const TG = env.TG;
  const C = TG.C;
  const bad = [];
  const remaining = (e, cfg) => (e.budget - e.age + e.stallT) / cfg.pace;
  // A crate spawned while a threat is live.
  let s = startTestRun(TG, SCALES[1], { empty: true });
  let cfg = s.config;
  const threat = TG.Entities.spawn(s, { kind: 'hoppet' });
  for (let i = 0; i < 30; i++) TG.Game.step(C.DT);
  const R1 = threat.word.length - threat.typed;
  const late1 = remaining(threat, cfg);
  const crate = TG.Entities.spawn(TG.Game.state, { kind: 'crate', power: 'shield' });
  const q1 = cfg.react + cfg.perChar * (R1 + crate.word.length) + 0.4 * cfg.react;
  const b1 = crate.budget / cfg.pace;
  if (b1 < q1 - 1e-9) bad.push('crate budget ' + fmt(b1, 3) + ' < queue ' + fmt(q1, 3));
  if (b1 < late1 + cfg.impactGap - 1e-9) bad.push('crate budget ' + fmt(b1, 3) + ' < spacing ' + fmt(late1 + cfg.impactGap, 3));
  if (b1 < C.CRATE_FACTOR * (cfg.react + cfg.perChar * crate.word.length) - 1e-9) bad.push('crate budget below 1.5 x base');
  // A threat spawned while a crate with untyped letters is live.
  s = startTestRun(TG, SCALES[1], { empty: true });
  cfg = s.config;
  const crate2 = TG.Entities.spawn(s, { kind: 'crate', power: 'quill' });
  for (let i = 0; i < 30; i++) TG.Game.step(C.DT);
  const R2 = crate2.word.length - crate2.typed;
  const late2 = remaining(crate2, cfg);
  const threat2 = TG.Entities.spawn(TG.Game.state, { kind: 'buzzle' });
  const q2 = cfg.react + cfg.perChar * (R2 + threat2.word.length) + 0.4 * cfg.react;
  const b2 = threat2.budget / cfg.pace;
  if (b2 < q2 - 1e-9) bad.push('threat budget ' + fmt(b2, 3) + ' < queue ' + fmt(q2, 3) + ' with the crate counted');
  if (b2 < late2 + cfg.impactGap - 1e-9) bad.push('threat budget ' + fmt(b2, 3) + ' does not wait for the crate (' + fmt(late2 + cfg.impactGap, 3) + ')');
  const noCrate = cfg.react + cfg.perChar * threat2.word.length;
  if (!(b2 > noCrate + 1e-6)) bad.push('the crate was not counted (budget ' + fmt(b2, 3) + ')');
  return bad.length ? result(false, bad.join('; ')) : result(true, 'crate after threat ' + fmt(b1, 2) + ' >= ' + fmt(Math.max(q1, late1 + cfg.impactGap), 2) + '; threat after crate ' + fmt(b2, 2) + ' >= ' + fmt(Math.max(q2, late2 + cfg.impactGap), 2));
};

// --- items-shape --------------------------------------------------------------------------------
CHECKS['items-shape'] = function (ctx) {
  const want = INK_COUNTS[ctx.levelId];
  const wantText = DIFFICULTIES.map((d) => want[d]).join(' / ');
  return withSession({ levelId: ctx.levelId, difficulty: 'medium', profile: 'target', until: 'checkpoint1' }, (session, TG) => {
    const bad = [];
    const s = TG.Game.state;
    const shape = (it) => typeof it.id === 'string' && typeof it.x === 'number' && typeof it.y === 'number' && it.w === 8 && it.h === 8 &&
      Object.keys(it).sort().join(',') === 'h,id,w,x,y';
    if (!s.items.every(shape)) bad.push('an item does not have the shape of 5.14');
    const counts = {};
    for (const d of DIFFICULTIES) {
      const env2 = simEnv();
      env2.TG.Game.newRun({ difficulty: d, seed: 1, levelId: ctx.levelId, adaptive: false, assist: 1, tutorial: false });
      counts[d] = env2.TG.Game.state.items.length;
    }
    if (DIFFICULTIES.some((d) => counts[d] !== want[d])) bad.push('ink drops ' + JSON.stringify(counts) + ', expected ' + wantText);
    let pickups = 0;
    let lastPick = null;
    TG.Events.on('pickup:ink', (p) => { pickups++; lastPick = p; });
    let checked = 0;
    while (session.tick() && checked < 20) {
      if (lastPick) {
        const still = TG.Game.state.items.some((it) => it.x === lastPick.x && it.y === lastPick.y);
        if (still) bad.push('a drop at x ' + lastPick.x + ' is still in state.items after pickup:ink');
        if (!TG.Game.state.items.every(shape)) bad.push('an item lost its shape');
        lastPick = null;
        checked++;
      }
    }
    if (checked === 0) bad.push('no drop was collected');
    const s2 = TG.Game.state;
    if (s2.ink !== s2.inkTotal % TG.C.INK_PER_LIFE || s2.inkTotal !== pickups) bad.push('ink ' + s2.ink + ', inkTotal ' + s2.inkTotal + ', pickups ' + pickups);
    return bad.length ? result(false, bad.join('; ')) : result(true, 'items have the 5.14 shape; ' + checked + ' collected drops left state.items in the same step; ' + wantText + ' drops');
  });
};

// --- continue-restore -------------------------------------------------------------------------
// Score, ink and lives return to the checkpoint; typing statistics are kept; power-up timers end;
// no entity is live; the events come in the order of CONTRACT 4.16.
CHECKS['continue-restore'] = function () {
  return withSession({ difficulty: 'medium', profile: 'target', until: 'results', maxSeconds: 600 }, (session, TG) => {
    const bad = [];
    let passed = false;
    TG.Events.on('checkpoint', (p) => { if (p.index === 1) passed = true; });
    while (!passed && session.tick()) { /* run to checkpoint 1 */ }
    if (!passed) return result(false, 'did not reach checkpoint 1: ' + session.report.error);
    const s = TG.Game.state;
    const banked = JSON.parse(JSON.stringify(s.checkpoint));
    if (banked.index !== 1 || banked.score !== s.score) bad.push('checkpoint 1 banked ' + JSON.stringify(banked) + ' with score ' + s.score);
    // Stop typing so that the run reaches game over; start an Hourglass and a Golden quill first.
    session.bot.noType = true;
    session.bot.noJump = true;
    for (let i = 0; i < 300; i++) session.stepOnce();
    while (TG.Game.state.screen !== 'gameOver' && session.stepOnce()) {
      if (TG.Game.state.time > 900) break;
    }
    const g = TG.Game.state;
    if (g.screen !== 'gameOver') return result(false, 'no game over (' + g.screen + ', ' + session.report.error + ')');
    // Timed power-ups running at the game over end with the continue; shield charges are kept.
    g.power.slowT = 3;
    g.slowScale = TG.C.HOURGLASS_SCALE;
    g.power.quillT = 5;
    g.power.last = 'quill';
    g.power.shield = 1;
    const shieldBefore = g.power.shield;
    const statsBefore = JSON.stringify({ c: g.typing.stats.correct, w: g.typing.stats.wrong, n: g.typing.stats.wordsCleared });
    const scoreBefore = g.score;
    const events = recordEvents(TG);
    if (!TG.Game.continueRun()) return result(false, 'continueRun returned false');
    const c = TG.Game.state;
    const names = events.map((e) => e.name).filter((n) => ['screen:change', 'game:continue', 'level:start', 'section:enter'].indexOf(n) !== -1);
    if (names.join(',') !== 'screen:change,game:continue,level:start,section:enter') bad.push('events ' + names.join(','));
    const ls = events.find((e) => e.name === 'level:start');
    if (!ls || ls.payload.continued !== true) bad.push('level:start without continued: true');
    const se = events.find((e) => e.name === 'section:enter');
    if (!se || se.payload.index !== 1) bad.push('section:enter index ' + (se && se.payload.index));
    if (c.score !== banked.score || c.ink !== banked.ink || c.inkTotal !== banked.inkTotal || c.nextLifeAt !== banked.nextLifeAt) {
      bad.push('score/ink ' + [c.score, c.ink, c.inkTotal, c.nextLifeAt].join('/') + ' vs banked ' + [banked.score, banked.ink, banked.inkTotal, banked.nextLifeAt].join('/') + ' (was ' + scoreBefore + ')');
    }
    if (c.player.lives !== c.config.lives) bad.push('lives ' + c.player.lives);
    if (c.player.x !== banked.x || c.screen !== 'playing' || c.player.state !== 'run') bad.push('player at ' + c.player.x + ' ' + c.player.state + ' on ' + c.screen);
    if (c.power.slowT !== 0 || c.power.quillT !== 0 || c.slowScale !== 1 || c.power.last !== null) bad.push('timed power-ups still running');
    if (c.power.shield !== shieldBefore) bad.push('shield charges ' + shieldBefore + ' -> ' + c.power.shield);
    if (c.entities.some((e) => !e.dead)) bad.push('an entity is still live');
    const statsAfter = JSON.stringify({ c: c.typing.stats.correct, w: c.typing.stats.wrong, n: c.typing.stats.wordsCleared });
    if (statsAfter !== statsBefore || c.typing.stats.correct === 0) bad.push('typing statistics changed: ' + statsBefore + ' -> ' + statsAfter);
    if (c.run.continues !== 1 || c.checkpoint.continuesHere !== 1) bad.push('continue counters');
    // The run goes on normally from the checkpoint.
    session.bot.noType = false;
    session.bot.noJump = false;
    for (let i = 0; i < 600; i++) if (!session.stepOnce()) break;
    if (session.report.error) bad.push('after the continue: ' + session.report.error);
    return bad.length ? result(false, bad.join('; ')) : result(true, 'score ' + banked.score + ' restored, lives ' + c.player.lives + ', statistics kept, timers ended, events in order');
  });
};

// --- no-type ----------------------------------------------------------------------------------
CHECKS['no-type'] = function () {
  return withSession({ difficulty: 'medium', profile: 'target', noType: true, until: 'results', maxSeconds: 900 }, (session, TG) => {
    let seen = null;
    let after = null;
    session.opts.onGameOver = (T) => {
      if (!seen) seen = JSON.parse(JSON.stringify(T.Game.state.checkpoint));
    };
    TG.Events.on('game:continue', () => {
      if (after) return;
      const s = TG.Game.state;
      after = { x: s.player.x, lives: s.player.lives, score: s.score, screen: s.screen, livesConfig: s.config.lives };
      session.done = true;
    });
    session.run();
    if (!seen) return result(false, 'no game over: ' + session.report.error);
    if (!after) return result(false, 'no continue');
    const bad = [];
    if (after.x !== seen.x) bad.push('x ' + after.x + ', checkpoint ' + seen.x);
    if (after.lives !== after.livesConfig) bad.push('lives ' + after.lives);
    if (after.score !== seen.score) bad.push('score ' + after.score + ', banked ' + seen.score);
    if (after.screen !== 'playing') bad.push('screen ' + after.screen);
    return bad.length ? result(false, bad.join('; ')) : result(true, 'game over, then Pip at checkpoint ' + seen.index + ' (x ' + seen.x + ') with ' + after.lives + ' lives and score ' + after.score);
  });
};

// --- no-jump-bridge ---------------------------------------------------------------------------
// In a run on easy in which the bot never jumps, continued as often as needed: the first fall is at
// the level's first open gap (FIRST_EASY_GAP; tile 106 in Level 1); the first gap that Pip falls into
// config.bridgeAfterFalls times is bridged from then on, hazard:bridge is emitted once for it, and after
// a continue that restarts before it Pip runs across it.
// The bot does not type either. With typing on, Easy's lives (the checkpoint top-up to 3, extra lives
// from score and Red caps, shield charges that absorb the bramble hits) carry Pip through all nine
// open gaps without a game over, so no gap is ever fallen into twice. Without typing the first game
// over comes in section 1, and the gap that is bridged is the one at tile 106.
CHECKS['no-jump-bridge'] = function (ctx) {
  const firstTile = FIRST_EASY_GAP[ctx.levelId];
  return withSession({ levelId: ctx.levelId, difficulty: 'easy', profile: 'target', noJump: true, noType: true, until: 'results', maxSeconds: 1200 }, (session, TG) => {
    const falls = [];
    const bridges = [];
    const fallsAt = {};
    const need = TG.Game.state.config.bridgeAfterFalls;   // falls at one gap that bridge it
    let firstTwice = null;          // id of the first gap fallen into `need` times
    let restartedBefore = false;    // a continue after that restarted before the gap
    let crossed = false;
    TG.Events.on('hero:fall', (p) => {
      falls.push(p.gapId);
      fallsAt[p.gapId] = (fallsAt[p.gapId] || 0) + 1;
      if (firstTwice === null && fallsAt[p.gapId] === need) firstTwice = p.gapId;
    });
    TG.Events.on('hazard:bridge', (p) => bridges.push(p.id));
    TG.Events.on('game:continue', () => {
      if (firstTwice === null) return;
      const gap = TG.Game.state.level.hazards.find((h) => h.id === firstTwice);
      if (TG.Game.state.player.x < gap.x) restartedBefore = true;
    });
    while (session.tick()) {
      if (!restartedBefore) continue;
      const s = TG.Game.state;
      const gap = s.level.hazards.find((h) => h.id === firstTwice);
      if (s.player.onGround && s.player.state !== 'fall' && s.player.x > gap.x + gap.w + 8) {
        crossed = fallsAt[firstTwice] === need;
        break;
      }
    }
    const s = TG.Game.state;
    const bad = [];
    const first = s.level.hazards.find((h) => h.kind === 'gap' && h.x === firstTile * 16);
    if (falls[0] !== first.id) bad.push('the first fall was at ' + falls[0] + ', not at the gap at tile ' + firstTile + ' (' + first.id + ')');
    let tile = null;
    if (!(need > 0)) {
      bad.push('easy has no plank bridges (bridgeAfterFalls ' + need + ')');
    } else if (firstTwice === null) {
      bad.push('no gap was fallen into ' + need + ' time(s): ' + session.report.error);
    } else {
      const gap = s.level.hazards.find((h) => h.id === firstTwice);
      tile = gap.x / 16;
      if (!gap.bridged) bad.push('gap ' + firstTwice + ' is not bridged');
      const count = bridges.filter((id) => id === firstTwice).length;
      if (count !== 1) bad.push('hazard:bridge emitted ' + count + ' times for ' + firstTwice);
      if (bridges[0] !== firstTwice) bad.push('the first bridge was ' + bridges[0]);
      if (!restartedBefore) bad.push('no continue restarted before the bridged gap');
      else if (!crossed) bad.push('Pip did not run across the bridged gap (falls there: ' + fallsAt[firstTwice] + ')');
    }
    return bad.length ? result(false, bad.join('; '))
      : result(true, 'first fall at tile ' + firstTile + '; the gap at tile ' + tile + ' was fallen into ' + need + ' time(s), bridged once (' + bridges.length + ' bridges in all), and crossed after a continue');
  });
};

// --- pause-deferred ---------------------------------------------------------------------------
CHECKS['pause-deferred'] = function () {
  const bad = [];
  const hit = withSession({ difficulty: 'medium', profile: 'target', noType: true, until: 'results', maxSeconds: 600 }, (session, TG) => {
    while (TG.Game.state.screen !== 'lifeLost' && session.stepOnce()) { /* run to the first hit */ }
    const s = TG.Game.state;
    if (s.screen !== 'lifeLost') return result(false, 'no lifeLost');
    if (s.lifeLost.last) return result(false, 'the first life lost was the last');
    if (TG.Game.pause() !== false || s.pausePending !== true) bad.push('pause during lifeLost: not deferred');
    let n = 0;
    while (TG.Game.state.screen === 'lifeLost' && n++ < 600) session.stepOnce();
    const p = TG.Game.state;
    if (p.screen !== 'paused' || p.resumeTo !== 'playing' || p.pausePending !== false) bad.push('after the timer: ' + p.screen + ', resumeTo ' + p.resumeTo + ', pending ' + p.pausePending);
    const frame = p.frame;
    TG.Game.step(TG.C.DT);
    if (TG.Game.state.frame !== frame) bad.push('the simulation advanced while paused');
    if (TG.Game.resume() !== true || TG.Game.state.screen !== 'playing') bad.push('resume');
    for (let i = 0; i < 120; i++) session.stepOnce();
    if (session.report.error) bad.push(session.report.error);
    // The last life: the deferred pause gives way to game over.
    while (!(TG.Game.state.screen === 'lifeLost' && TG.Game.state.lifeLost.last) && TG.Game.state.screen !== 'gameOver' && session.stepOnce()) { /* run on */ }
    const l = TG.Game.state;
    if (l.screen !== 'lifeLost') return result(false, 'the last life was not lost on lifeLost (' + l.screen + ')');
    if (TG.Game.pause() !== false || l.pausePending !== true) bad.push('pause during the last lifeLost: not deferred');
    n = 0;
    while (TG.Game.state.screen === 'lifeLost' && n++ < 600) session.stepOnce();
    const g = TG.Game.state;
    if (g.screen !== 'gameOver' || g.pausePending !== false) bad.push('after the last life: ' + g.screen + ', pending ' + g.pausePending);
    return result(bad.length === 0, bad.join('; '));
  });
  if (!hit.pass) return hit;
  // After a fall: the rescue is carried out before the pause, so the paused picture shows the bubble.
  const env = simEnv();
  const TG = env.TG;
  const s = startTestRun(TG, SCALES[1]);
  const gap = s.level.hazards.find((h) => h.id === 'h0');
  teleport(TG, gap.x - 30);
  let n = 0;
  while (TG.Game.state.screen !== 'lifeLost' && n++ < 2000) TG.Game.step(TG.C.DT);
  if (TG.Game.state.lifeLost.cause !== 'fall') return result(false, 'no fall');
  TG.Game.pause();
  n = 0;
  while (TG.Game.state.screen === 'lifeLost' && n++ < 600) TG.Game.step(TG.C.DT);
  const f = TG.Game.state;
  const rx = gap.x + gap.w + TG.C.RESCUE_AHEAD;
  if (f.screen !== 'paused' || f.player.state !== 'rescue' || f.player.x !== rx) {
    return result(false, 'after a fall: ' + f.screen + ', Pip ' + f.player.state + ' at ' + f.player.x + ' (rescue point ' + rx + ')');
  }
  TG.Game.resume();
  for (let i = 0; i < 10; i++) TG.Game.step(TG.C.DT);
  if (TG.Game.state.player.state !== 'run') return result(false, 'after resume Pip is ' + TG.Game.state.player.state);
  return result(true, 'hit: deferred to paused, resumeTo playing, resumed; last life: game over; fall: paused in the bubble at the rescue point');
};

// --- watch-freeze -------------------------------------------------------------------------------
// The Pocket Watch (LEVEL2 6.3; the check of this name in LEVEL2 13.5). On the test level a watch crate is
// typed and the time it runs is followed step by step, one part of the rule at a time; then the bot plays
// Level 2 through its first watch.
// A watch counts WATCH_TIME from the step its crate is finished on, as the Hourglass counts its time. That
// step's world step was worked out before the key was read, so the world stands still on the
// WATCH_TIME / DT - 1 steps after it (179), and power:end comes on the last of them. A crate finished on
// the lifeLost screen is the one case with a step more: part 10.
// The parts with a list of clauses beside them are also run with a Red cap in the crate, which leaves the
// world moving. Each must then report those clauses, as it would if the watch did nothing: the check must
// be able to fail.
// The value of WATCH_TIME itself is pinned in test/test-core.js.
// What 6.3 leaves open and this check pins as built (reported to the owner with M3):
//   - The level waits with the world. On a step the watch holds TG.Level.update does nothing, so a section
//     line, a checkpoint, a cue, the boss warning or the arena line that Pip passed on the step of the pickup
//     is acted on when the world moves again (part 5).
//   - A watch that is running when a fall's rescue comes goes on. Pip waits in the bubble, letters are still
//     typed, and the level sees where the rescue put him when the world moves (part 10). The Hourglass is
//     not ended by a rescue either.
//   - No close-call bonus and no urgent flag on a step the watch holds, also for a word finished on the
//     first of those steps and for a threat a fraction of a step from contact (parts 2 and 3).

// The failed clauses of one part of a check. The first failure of each clause is kept, with what was seen.
function clauseList() {
  const rows = [];
  return {
    check: (ok, clause, seen) => { if (!ok && !rows.some((r) => r.clause === clause)) rows.push({ clause: clause, text: clause + ': ' + seen }); },
    has: (clause) => rows.some((r) => r.clause === clause),
    texts: () => rows.map((r) => r.text)
  };
}

CHECKS['watch-freeze'] = function () {
  const env = simEnv();
  const TG = env.TG;
  const C = TG.C;
  const DT = C.DT;
  const HELD = Math.round(C.WATCH_TIME / DT) - 1;
  const begin = (levelOptions) => {
    TG.Events.clear();
    const s = startTestRun(TG, SCALES[1], levelOptions);
    return { s: s, events: recordEvents(TG) };
  };
  const since = (events, mark, name) => events.slice(mark).filter((x) => x.name === name);
  const crateOf = (s, power) => TG.Entities.spawn(s, { kind: 'crate', power: power });
  // Types a word a letter a step: the whole of it, or the letters up to `upTo`.
  const type = (e, upTo) => {
    const to = upTo === undefined ? e.word.length : upTo;
    for (let i = e.typed; i < to && !e.dead; i++) {
      TG.Input.typeChar(e.word[i]);
      TG.Game.step(DT);
    }
  };
  const named = (e) => e.kind + ' "' + e.word + '"';

  // 1. The world holds. The threats of `kinds` and a crate are live. The nearest is half a second from Pip,
  // so it is urgent; the Hourglass and the quill are running and Pip has just been hit. Then the crate is
  // typed, and a jump is pressed on step 60 of the freeze. It is run with two sets of kinds, so that every
  // kind of the two levels is followed: one whose clock stalls on a letter, the two anchored kinds, one from
  // above that turns and one from behind; then the hopping, the bobbing, the buried and the swooping one.
  const HOLD_KINDS = [['dawdle', 'boulder', 'dangle', 'flit', 'truffle'], ['hoppet', 'buzzle', 'digby', 'swoop']];
  const holds = (kinds) => (power) => {
    const c = clauseList();
    const { s, events } = begin({ empty: true, tune: { medium: { maxActive: [6, 6, 6, 6] } } });
    const p = s.player;
    const threats = kinds.map((kind) => TG.Entities.spawn(s, { kind: kind }));
    const other = crateOf(s, 'shield');
    if (threats.some((e) => !e) || !other) {
      c.check(false, 'setup', 'a threat or the crate did not spawn');
      return c;
    }
    const nearest = threats[0];
    for (let i = 0; i < 2000 && nearest.eta > 0.5; i++) TG.Game.step(DT);
    TG.Game.applyPower('hourglass', 0, 0);
    TG.Game.applyPower('quill', 0, 0);
    const crate = crateOf(s, power);
    type(crate, crate.word.length - 1);
    TG.Entities.damage(s, { type: 'threat', kind: 'hoppet', id: 0, from: 'right' });
    for (let i = 0; i < 60 && s.screen !== 'playing'; i++) TG.Game.step(DT);
    const marks = { start: null, end: null };
    TG.Events.on('power:start', (x) => { if (x.power === 'watch') marks.start = { frame: s.frame, time: s.time, duration: x.duration }; });
    TG.Events.on('power:end', (x) => { if (x.power === 'watch') marks.end = { frame: s.frame, time: s.time }; });
    const urgentBefore = nearest.urgent;
    type(crate);                                   // the last letter: the pickup

    const was = s.entities.filter((e) => !e.dead).map((e) => ({ e: e, age: e.age, x: e.x, t: e.t, y: e.y, animT: e.animT }));
    const at = { frame: s.frame, time: s.time, world: s.worldTime, x: p.x, y: p.y, animT: p.animT, camera: s.camera.x, slowT: s.power.slowT, invulnT: p.invulnT, hurtT: p.hurtT, quillT: s.power.quillT, last: s.power.last, assist: s.assist };
    c.check(crate.dead && was.length === kinds.length + 1 && urgentBefore === true && at.slowT > 0 && at.invulnT > 0 && at.hurtT > 0 && at.quillT > 0 && s.screen === 'playing', 'setup',
      was.length + ' typables live at the pickup, the nearest ' + (urgentBefore ? '' : 'not ') + 'urgent before it, slowT ' + at.slowT + ', invulnT ' + at.invulnT + ', hurtT ' + at.hurtT + ', quillT ' + at.quillT + ', on ' + s.screen);
    // Adaptive pacing is switched on with its target well below assist: assist goes on towards it at its
    // usual rate while the world is held (6.3: it runs on the real clock).
    s.adaptive = true;
    s.assistTarget = at.assist - 0.2;

    const mark = events.length;
    for (let n = 1; n <= HELD; n++) {
      if (n === 60) TG.Input.keyDown('jump');
      if (n === 61) TG.Input.keyUp('jump');
      TG.Game.step(DT);
      const on = ' on step ' + n + ' of ' + HELD;
      c.check(s.timeScale === 0, 'timeScale', 'timeScale is ' + s.timeScale + on);
      c.check(s.worldTime === at.world, 'worldTime', 'worldTime moved by ' + (s.worldTime - at.world) + ' ws' + on);
      for (const w of was) {
        const e = w.e;
        c.check(!e.dead && e.age === w.age && e.x === w.x && e.t === w.t, 'entities',
          named(e) + on + ': age ' + w.age + ' -> ' + e.age + ', x ' + w.x + ' -> ' + e.x + ', t ' + w.t + ' -> ' + e.t + (e.dead ? ', gone (' + e.reason + ')' : ''));
        c.check(e.y === w.y && e.animT === w.animT, 'frame', named(e) + on + ': y ' + w.y + ' -> ' + e.y + ', animT ' + w.animT + ' -> ' + e.animT);
        const left = e.budget - e.age + e.stallT;
        c.check(Math.abs(e.eta - 100 * left) < 1e-6, 'eta', named(e) + on + ': eta ' + e.eta + ' with ' + left + ' ws left, expected ' + 100 * left);
        if (e.type === 'threat') c.check(e.urgent === false, 'urgent', named(e) + ' is urgent' + on);
      }
      c.check(p.x === at.x && p.y === at.y && p.animT === at.animT && p.state === 'run' && s.camera.x === at.camera, 'pip',
        'Pip is ' + p.state + ' at x ' + p.x + ' (was ' + at.x + '), y ' + p.y + ' (was ' + at.y + '), with animT ' + p.animT + ' (was ' + at.animT + '), the camera at ' + s.camera.x + ' (was ' + at.camera + ')' + on);
      c.check(Math.abs(s.assist - (at.assist - n * C.ASSIST_RATE * DT)) < 1e-9, 'assist', 'assist is ' + s.assist + on + ', expected ' + (at.assist - n * C.ASSIST_RATE * DT) + ': adaptive pacing keeps moving it towards its target');
      c.check(s.power.slowT === at.slowT, 'slowT', 'the Hourglass\'s slowT ' + at.slowT + ' -> ' + s.power.slowT + on);
      c.check(p.invulnT === at.invulnT, 'invulnT', 'Pip\'s invulnT ' + at.invulnT + ' -> ' + p.invulnT + on);
      c.check(Math.abs(p.hurtT - Math.max(0, at.hurtT - n * DT)) < 1e-9, 'hurt', 'Pip\'s hurtT is ' + p.hurtT + on + ', expected ' + Math.max(0, at.hurtT - n * DT) + ': the hurt pose keeps counting');
      c.check(Math.abs(s.power.quillT - (at.quillT - n * DT)) < 1e-9, 'quill', 'the quill\'s time is ' + s.power.quillT + on + ', expected ' + (at.quillT - n * DT) + ': it keeps counting');
    }
    const jumped = since(events, mark, 'hero:jump').length;
    c.check(jumped === 0 && p.bufferT === C.JUMP_BUFFER, 'jump',
      'a jump pressed on step 60 of the freeze ' + (jumped ? 'started during it' : 'is buffered for ' + p.bufferT + ' ws at its end, not the whole ' + C.JUMP_BUFFER));
    c.check(since(events, mark, 'threat:urgent').length === 0, 'urgent', 'threat:urgent was emitted during the freeze');
    c.check(marks.start !== null && marks.start.frame === at.frame && marks.start.duration === C.WATCH_TIME, 'start',
      'no power:start with power watch and duration ' + C.WATCH_TIME + ' on the step of the pickup');
    const ends = since(events, mark, 'power:end').filter((x) => x.payload.power === 'watch').length;
    c.check(marks.end !== null && marks.end.frame === at.frame + HELD && Math.abs(marks.end.time - at.time - (C.WATCH_TIME - DT)) < 1e-9 && s.power.watchT === 0 && ends === 1, 'ends',
      ends + ' power:end for the watch, ' + (marks.end ? (marks.end.frame - at.frame) + ' steps and ' + fmt(marks.end.time - at.time, 4) + ' s after the step of the pickup' : 'none in time') +
      ', expected one, ' + HELD + ' steps and ' + fmt(C.WATCH_TIME - DT, 4) + ' s after it (the ' + C.WATCH_TIME + ' s are counted from that step); watchT is ' + s.power.watchT);
    c.check(at.last === 'watch' && s.power.last === 'hourglass', 'slot', 'power.last was ' + at.last + ' during the watch and is ' + s.power.last + ' after it (watch, then the Hourglass that is still running)');

    // Pacing is put back as it was at the pickup, so that what follows reads the time scale of that moment.
    s.adaptive = false;
    s.assist = s.assistTarget = at.assist;
    const after = events.length;
    TG.Game.step(DT);                              // the first step the world moves again
    c.check(s.timeScale === s.pace * s.assist * C.HOURGLASS_SCALE && s.worldTime > at.world, 'moves',
      'on the step after the watch timeScale is ' + s.timeScale + ' and worldTime has moved by ' + (s.worldTime - at.world) + ' ws');
    c.check(since(events, after, 'hero:jump').length === 1 && p.state === 'jump', 'jump', 'the jump pressed during the freeze did not start on the first step the world moved: Pip is ' + p.state);
    const urgentSent = events.filter((x) => x.name === 'threat:urgent' && x.payload.id === nearest.id).length;
    c.check(nearest.urgent === true && urgentSent === 1, 'urgent',
      'once the world moves the nearest threat is ' + (nearest.urgent ? '' : 'not ') + 'urgent again (eta ' + nearest.eta + '), and threat:urgent was emitted for it ' + urgentSent + ' times in all');
    c.check(Math.abs(s.power.slowT - (at.slowT - DT)) < 1e-9, 'slowT', 'the Hourglass did not go on counting after the watch: slowT ' + at.slowT + ' -> ' + s.power.slowT);
    c.check(Math.abs(p.invulnT - (at.invulnT - DT)) < 1e-9, 'invulnT', 'the invulnerability did not go on counting after the watch: invulnT ' + at.invulnT + ' -> ' + p.invulnT);
    return c;
  };

  // 2. The close call. Pip is under CLOSE_CALL_TIME from a boulder when the crate is typed, and the
  // boulder's word is typed next: a letter a step, and in a second run the whole word on the first held
  // step, when the boulder's eta is still the one of the step of the pickup (an eta is worked out after the
  // keys of a step are read). A boulder's clock is the distance left, so the letters do not hold it back.
  const closeCall = (power) => {
    const c = clauseList();
    for (const atOnce of [false, true]) {
      const { s, events } = begin({ empty: true });
      const boulder = TG.Entities.spawn(s, { kind: 'boulder' });
      for (let i = 0; i < 2000 && boulder.eta > 1.0; i++) TG.Game.step(DT);
      const crate = crateOf(s, power);
      type(crate, crate.word.length - 1);
      for (let i = 0; i < 2000 && boulder.eta > 0.30; i++) TG.Game.step(DT);
      type(crate);
      c.check(crate.dead && !boulder.dead && boulder.eta < C.CLOSE_CALL_TIME, 'setup', 'at the pickup the boulder is ' + (boulder.dead ? 'gone' : boulder.eta + ' s away') + ', not a close call');
      const mark = events.length;
      if (atOnce) {
        for (const ch of boulder.word) TG.Input.typeChar(ch);
        TG.Game.step(DT);
      } else {
        type(boulder);
      }
      const how = atOnce ? 'typed whole on the first held step' : 'typed a letter a step during the freeze';
      const clear = since(events, mark, 'word:clear').find((x) => x.payload.id === boulder.id);
      const paid = since(events, mark, 'score:add').filter((x) => x.payload.reason === 'close').length;
      c.check(!!clear && clear.payload.cause === 'typed', 'typed', 'the boulder\'s word ' + how + ' did not clear it');
      c.check(!!clear && clear.payload.close === false && paid === 0, atOnce ? 'close-first' : 'close',
        'the boulder\'s word ' + how + ': a close-call bonus was paid: close is ' + (clear && clear.payload.close) + ' and ' + paid + ' score:add have the reason close');
    }
    return c;
  };

  // 3. A threat a fraction of a step from contact. An eta is the world time left over the time scale, and
  // the time scale has a floor of 0.01 there (etaOf in js/entities.js). With the world stopped, a thousandth
  // of a world second left therefore reads as 0.1 s, which is under the close call's time and under the
  // urgent time. The watch's rule holds for it all the same: it is not urgent and its word pays no close
  // call. The two anchored kinds, whose clocks no letter holds back; the anchor is moved to put Pip there.
  const nearContact = () => {
    const c = clauseList();
    for (const kind of ['boulder', 'dangle']) {
      const { s, events } = begin({ empty: true });
      const e = TG.Entities.spawn(s, { kind: kind });
      type(crateOf(s, 'watch'));
      e.anchorX = s.player.x + e.contact + C.RUN_SPEED * 0.001;
      const mark = events.length;
      TG.Game.step(DT);
      c.check(!e.dead && s.power.watchT > 0 && Math.abs(e.eta - 0.1) < 1e-6 && e.eta < C.CLOSE_CALL_TIME && e.eta < s.config.urgentTime, 'setup',
        'the ' + kind + ' is ' + (e.dead ? 'gone (' + e.reason + ')' : 'at an eta of ' + e.eta + ' s') + ', expected 0.1 s with the world stopped');
      type(e);
      const clear = since(events, mark, 'word:clear').find((x) => x.payload.id === e.id);
      const paid = since(events, mark, 'score:add').filter((x) => x.payload.reason === 'close').length;
      c.check(since(events, mark, 'threat:urgent').length === 0, 'urgent-near', 'the ' + kind + ' a thousandth of a world second from contact was urgent during the freeze');
      c.check(!!clear && clear.payload.cause === 'typed' && clear.payload.close === false && paid === 0, 'close-near',
        'the ' + kind + ' a thousandth of a world second from contact: ' + (clear ? 'close is ' + clear.payload.close + ' and ' + paid + ' score:add have the reason close' : 'its word typed during the freeze did not clear it'));
    }
    return c;
  };

  // 4. A word typed in the freeze, and the spawn that waits. Three threats of the level's own list are due
  // close together where two may be live, so the third waits for a slot. The first one's word is typed
  // during the freeze, which frees the slot. The level does nothing on a held step (part 5), and when the
  // world moves the entry still has the rest of its retry time to wait, which is on the world clock.
  const waiting = (power) => {
    const c = clauseList();
    const tiles = [['hoppet', 8], ['buzzle', 9], ['dawdle', 10]];
    const { s, events } = begin({ empty: true, spawns: tiles.map((t) => ({ x: t[1], kind: t[0], min: 'easy' })) });
    const third = s.level.spawns[2];
    for (let i = 0; i < 600 && !third.waiting; i++) TG.Game.step(DT);
    const hoppet = s.entities.find((e) => e.kind === 'hoppet');
    if (!hoppet || !third.waiting || third.done || TG.Entities.activeThreats(s) !== 2) {
      c.check(false, 'setup', 'the third threat is not waiting behind two live ones');
      return c;
    }
    type(crateOf(s, power));
    const mark = events.length;
    const age = hoppet.age;
    const stall = TG.Difficulty.toWs(s.config, s.config.letterStall);
    let n = 0;
    for (; n < hoppet.word.length; n++) {
      TG.Input.typeChar(hoppet.word[n]);
      TG.Game.step(DT);
      if (n < hoppet.word.length - 1) {
        c.check(hoppet.typed === n + 1 && hoppet.age === age && Math.abs(hoppet.stallT - (n + 1) * stall) < 1e-9, 'stall',
          'after ' + (n + 1) + ' letters typed in the freeze the hoppet has ' + hoppet.typed + ' typed, age ' + age + ' -> ' + hoppet.age + ' and stallT ' + hoppet.stallT + ', expected ' + (n + 1) * stall + ' (each letter still pays its stall)');
      }
    }
    const clear = since(events, mark, 'word:clear').find((x) => x.payload.id === hoppet.id);
    const u = hoppet.age / hoppet.budget;
    c.check(!!clear && clear.payload.cause === 'typed' && hoppet.reason === 'cleared', 'typed', 'a word typed during the freeze was not cleared');
    c.check(u < C.QUICK_U && !!clear && clear.payload.quick === true, 'u', 'the word cleared in the freeze has u ' + fmt(u, 3) + ' and quick ' + (clear && clear.payload.quick) + ', expected u under ' + C.QUICK_U);
    for (; n < HELD; n++) TG.Game.step(DT);
    const appeared = since(events, mark, 'threat:spawn').length;
    c.check(TG.Entities.activeThreats(s) === 1 && appeared === 0 && third.waiting && !third.done, 'waiting-spawn',
      'with its slot freed the waiting dawdle ' + (appeared ? 'appeared during the freeze' : 'is ' + (third.done ? 'done' : third.waiting ? 'waiting' : 'not waiting') + ' with ' + TG.Entities.activeThreats(s) + ' threats live'));
    // It appears once the world moves, when the retry time it had left has run out.
    const world = s.worldTime;
    for (let i = 0; i < 120 && !third.done; i++) TG.Game.step(DT);
    c.check(third.done && s.worldTime - world <= C.SPAWN_RETRY + 1e-9, 'waiting-spawn',
      'after the freeze the waiting dawdle ' + (third.done ? 'appeared ' + fmt(s.worldTime - world, 3) + ' ws on, later than its retry time of ' + C.SPAWN_RETRY : 'did not appear'));
    return c;
  };

  // 5. A line of the level reached on the step of the pickup. The crate's last letter is typed on the step
  // that carries Pip over the line. TG.Level.update ran earlier in that step, with Pip still short of the
  // line, so the level first sees him past it on a later step. That is the first step the world moves, since
  // the level does nothing on a step the watch holds. Four lines: a spawn point (a slot is free; and once
  // more with the point reached a step earlier), the start of a hazard's window, a checkpoint with the
  // section that starts there, and the arena line, where the watch runs its whole time before the boss
  // intro starts.
  // pickupOver: with one letter of a new crate left, Pip runs up to x and the letter is typed on the step
  // that carries him over it.
  const pickupOver = (s, x, power) => {
    const crate = crateOf(s, power);
    type(crate, crate.word.length - 1);
    const stepDist = C.RUN_SPEED * s.timeScale * DT;       // no watch runs yet
    for (let i = 0; i < 600 && s.player.x + stepDist < x; i++) TG.Game.step(DT);
    const before = s.player.x;
    type(crate);
    return { ok: crate.dead && before < x && s.player.x >= x, text: 'Pip went from x ' + before + ' to ' + s.player.x + ' on the step of the pickup; the line is at ' + x };
  };
  const lines = (power) => {
    const c = clauseList();
    const count = (events, mark, name) => since(events, mark, name).length;
    let run, at, mark;

    run = begin({ empty: true, spawns: [{ x: 12, kind: 'hoppet', min: 'easy' }] });
    const entry = run.s.level.spawns[0];
    at = pickupOver(run.s, entry.x, power);
    c.check(at.ok && !entry.done, 'setup', 'the spawn point: ' + at.text);
    mark = run.events.length;
    for (let n = 0; n < HELD; n++) TG.Game.step(DT);
    c.check(count(run.events, mark, 'threat:spawn') === 0 && !entry.done, 'spawn', 'the hoppet whose spawn point Pip reached on the step of the pickup appeared during the freeze');
    TG.Game.step(DT);
    c.check(entry.done && count(run.events, mark, 'threat:spawn') === 1, 'spawn', 'the hoppet did not appear on the first step the world moved');

    // The same point reached a step earlier, so that the entry is due on the step of the pickup itself. Its
    // spawn step comes after the keys of that step are read, and nothing new appears once a watch runs.
    run = begin({ empty: true, spawns: [{ x: 12, kind: 'hoppet', min: 'easy' }] });
    const due = run.s.level.spawns[0];
    const dueCrate = crateOf(run.s, power);
    type(dueCrate, dueCrate.word.length - 1);
    for (let i = 0; i < 600 && run.s.player.x < due.x; i++) TG.Game.step(DT);
    c.check(run.s.player.x >= due.x && !due.done, 'setup', 'the spawn point reached a step early: Pip is at x ' + run.s.player.x + ', the point at ' + due.x + ', the entry ' + (due.done ? 'done' : 'not done'));
    mark = run.events.length;
    type(dueCrate);
    c.check(dueCrate.dead && !due.done && count(run.events, mark, 'threat:spawn') === 0, 'spawn-due', 'the hoppet that was due on the step of the pickup appeared on it, after the crate was typed');
    for (let n = 0; n < HELD; n++) TG.Game.step(DT);
    c.check(!due.done && count(run.events, mark, 'threat:spawn') === 0, 'spawn-due', 'the hoppet that was due on the step of the pickup appeared during the freeze');
    TG.Game.step(DT);
    c.check(due.done && count(run.events, mark, 'threat:spawn') === 1, 'spawn-due', 'the hoppet that was due on the step of the pickup did not appear on the first step the world moved');

    run = begin();
    const branch = run.s.level.hazards.find((h) => h.id === 'h3');
    teleport(TG, branch.winStart - 40);
    at = pickupOver(run.s, branch.winStart, power);
    c.check(at.ok && !branch.cued, 'setup', 'the start of the branch\'s window: ' + at.text);
    mark = run.events.length;
    for (let n = 0; n < HELD; n++) TG.Game.step(DT);
    c.check(count(run.events, mark, 'hazard:cue') === 0 && !branch.cued, 'cue-line', 'hazard:cue was emitted during the freeze, for the window Pip entered on the step of the pickup');
    TG.Game.step(DT);
    c.check(since(run.events, mark, 'hazard:cue').filter((x) => x.payload.id === branch.id).length === 1, 'cue-line', 'the cue of the window Pip entered on the step of the pickup did not come on the first step the world moved');

    run = begin({ empty: true });
    const cp = run.s.level.checkpoints[1];
    teleport(TG, cp.x - 40);
    at = pickupOver(run.s, cp.x, power);
    c.check(at.ok && !cp.raised && run.s.section === 0, 'setup', 'the checkpoint line: ' + at.text);
    mark = run.events.length;
    const passed = () => count(run.events, mark, 'checkpoint') + ' checkpoint and ' + count(run.events, mark, 'section:enter') + ' section:enter, section ' + run.s.section + ', the banked checkpoint ' + run.s.checkpoint.index;
    for (let n = 0; n < HELD; n++) TG.Game.step(DT);
    c.check(count(run.events, mark, 'checkpoint') === 0 && count(run.events, mark, 'section:enter') === 0 && run.s.section === 0 && run.s.checkpoint.index === 0, 'checkpoint-line',
      'during the freeze, for the line Pip passed on the step of the pickup: ' + passed() + ' (expected none, section 0, checkpoint 0)');
    TG.Game.step(DT);
    c.check(count(run.events, mark, 'checkpoint') === 1 && count(run.events, mark, 'section:enter') === 1 && run.s.section === 1 && run.s.checkpoint.index === 1, 'checkpoint-line',
      'on the first step the world moved: ' + passed() + ' (expected one of each, section 1, checkpoint 1)');

    run = begin({ empty: true });
    const s = run.s;
    const lastCp = s.level.checkpoints.length - 1;
    teleport(TG, s.level.arenaX - 40);
    at = pickupOver(s, s.level.arenaX, power);
    c.check(at.ok && s.screen === 'playing' && s.checkpoint.index === lastCp - 1, 'setup', 'the arena line: ' + at.text + '; on ' + s.screen + ' with checkpoint ' + s.checkpoint.index + ' banked');
    mark = run.events.length;
    let away = 0;
    for (let n = 0; n < HELD; n++) {
      TG.Game.step(DT);
      if (s.screen !== 'playing') away++;
    }
    c.check(away === 0 && count(run.events, mark, 'boss:enter') === 0 && s.checkpoint.index === lastCp - 1, 'arena-line',
      'during the freeze, with Pip over the arena line since the step of the pickup: ' + away + ' steps off the playing screen, ' + count(run.events, mark, 'boss:enter') + ' boss:enter, checkpoint ' + s.checkpoint.index + ' banked');
    c.check(since(run.events, mark, 'power:end').filter((x) => x.payload.power === 'watch').length === 1, 'arena-line', 'the watch did not run its whole time and end with power:end before the arena started');
    TG.Game.step(DT);
    c.check(s.screen === 'bossIntro' && count(run.events, mark, 'boss:enter') === 1 && s.section === 3 && s.checkpoint.index === lastCp, 'arena-line',
      'on the first step the world moved: screen ' + s.screen + ', ' + count(run.events, mark, 'boss:enter') + ' boss:enter, section ' + s.section + ', checkpoint ' + s.checkpoint.index + ' banked (expected bossIntro, one, 3 and ' + lastCp + ')');
    return c;
  };

  // 6. A fall in progress. Pip runs off the edge of the narrow gap, and the crate's last letter is typed
  // three steps into the fall.
  const falls = (power) => {
    const c = clauseList();
    const { s, events } = begin();
    const p = s.player;
    teleport(TG, s.level.hazards.find((h) => h.id === 'h0').x - 40);
    const crate = crateOf(s, power);
    type(crate, crate.word.length - 1);
    for (let i = 0; i < 600 && since(events, 0, 'hero:fall').length === 0; i++) TG.Game.step(DT);
    for (let i = 0; i < 3; i++) TG.Game.step(DT);
    type(crate);
    const lives = p.lives, y = p.y, vy = p.vy;
    c.check(crate.dead && p.state === 'fall' && !p.fallen && s.screen === 'playing', 'setup', 'at the pickup Pip is ' + p.state + ' on ' + s.screen + ', not in mid-fall');
    for (let n = 1; n <= HELD; n++) {
      TG.Game.step(DT);
      c.check(p.state === 'fall' && p.y === y && p.vy === vy && p.lives === lives && s.screen === 'playing', 'fall',
        'on step ' + n + ' of ' + HELD + ' Pip is ' + p.state + ' at y ' + p.y + ' (was ' + y + ') with ' + p.lives + ' lives (was ' + lives + ') on ' + s.screen);
    }
    const mark = events.length;
    for (let i = 0; i < 60 && s.screen === 'playing'; i++) TG.Game.step(DT);
    const lost = since(events, mark, 'life:lost');
    c.check(lost.length === 1 && lost[0].payload.cause.type === 'fall' && p.lives === lives - 1 && s.screen === 'lifeLost', 'fall',
      'after the freeze the fall did not finish and cost its life: ' + lost.length + ' life:lost, ' + p.lives + ' lives (was ' + lives + '), on ' + s.screen);
    return c;
  };

  // 7. The cue. Pip is under half a second short of the branch's window when the crate is typed. A duck
  // is pressed on step 30 of the freeze: the slide pose starts at once, and its time is counted when the
  // world moves.
  const cue = (power) => {
    const c = clauseList();
    const { s, events } = begin();
    const p = s.player;
    const branch = s.level.hazards.find((h) => h.id === 'h3');
    teleport(TG, branch.winStart - 30);
    type(crateOf(s, power));
    c.check(p.x < branch.winStart && !branch.cued, 'setup', 'at the pickup Pip is at x ' + p.x + ', the window starts at ' + branch.winStart);
    const mark = events.length;
    for (let n = 1; n <= HELD; n++) {
      if (n === 30) TG.Input.keyDown('duck');
      if (n === 32) TG.Input.keyUp('duck');
      TG.Game.step(DT);
      if (n >= 30) c.check(p.state === 'slide' && p.slideT === C.SLIDE_TIME, 'duck', 'after a duck pressed on step 30 Pip is ' + p.state + ' with slideT ' + p.slideT + ' on step ' + n + ', expected a slide with the whole ' + C.SLIDE_TIME);
    }
    c.check(since(events, mark, 'hazard:cue').length === 0, 'cue', 'hazard:cue was emitted during the freeze');
    const after = events.length;
    TG.Game.step(DT);
    c.check(p.slideT < C.SLIDE_TIME, 'duck', 'the slide\'s time did not start to count when the world moved');
    for (let i = 0; i < 60 && !branch.cued; i++) TG.Game.step(DT);
    c.check(since(events, after, 'hazard:cue').filter((x) => x.payload.id === branch.id).length === 1, 'cue', 'the cue of the branch did not come once Pip ran into its window');
    return c;
  };

  // 8. What ends it besides its time, and a second watch. A second crate starts the time again: the two do
  // not add. A continue ends the watch without an event, as it ends the Hourglass (CONTRACT 4.16).
  const ended = () => {
    const c = clauseList();
    const { s, events } = begin({ empty: true });
    type(crateOf(s, 'watch'));
    for (let n = 0; n < 60; n++) TG.Game.step(DT);
    const left = s.power.watchT;
    TG.Game.applyPower('watch', 0, 0);
    c.check(s.power.watchT === C.WATCH_TIME && since(events, 0, 'power:start').length === 2, 'second',
      'a second watch with ' + left + ' s left of the first gives watchT ' + s.power.watchT + ', expected ' + C.WATCH_TIME + ', and ' + since(events, 0, 'power:start').length + ' power:start');
    for (let n = 0; n < 30; n++) TG.Game.step(DT);
    const world = s.worldTime;
    TG.Game.pause();
    const mark = events.length;
    const continued = TG.Game.continueRun();
    c.check(continued && s.power.watchT === 0 && s.power.last === null && s.timeScale === s.pace * s.assist, 'continue',
      'after a continue watchT is ' + s.power.watchT + ', power.last ' + s.power.last + ' and timeScale ' + s.timeScale);
    c.check(since(events, mark, 'power:end').length === 0, 'continue', 'the continue emitted power:end; timed power-ups end without events there');
    TG.Game.step(DT);
    c.check(s.screen === 'playing' && s.worldTime > world, 'continue', 'the world does not move on the step after the continue (' + s.screen + ')');
    return c;
  };

  // 9. The arena. Pip crosses the arena line with one letter of the crate left, and the letter is typed on
  // the next step: the watch starts, and the change to bossIntro in the same step ends it. No power:end is
  // emitted there, as none is on a continue.
  const arena = () => {
    const c = clauseList();
    const { s, events } = begin({ empty: true });
    teleport(TG, s.level.arenaX - 40);
    const crate = crateOf(s, 'watch');
    type(crate, crate.word.length - 1);
    for (let i = 0; i < 600 && s.player.x < s.level.arenaX; i++) TG.Game.step(DT);
    c.check(s.screen === 'playing' && !crate.dead, 'setup', 'with Pip just over the arena line the screen is ' + s.screen + ' and the crate is ' + (crate.dead ? 'gone' : 'live'));
    const mark = events.length;
    type(crate);
    const order = events.slice(mark).filter((x) => ((x.name === 'power:start' || x.name === 'power:end') && x.payload.power === 'watch') ||
      (x.name === 'screen:change' && x.payload.to === 'bossIntro')).map((x) => x.name).join(', ');
    c.check(order === 'power:start, screen:change' && s.screen === 'bossIntro' && s.power.watchT === 0 && s.power.last === null, 'bossIntro',
      'events ' + (order || 'none') + ' (expected power:start, screen:change); screen ' + s.screen + ', watchT ' + s.power.watchT + ', power.last ' + s.power.last);
    TG.Game.step(DT);
    c.check(s.timeScale === s.pace * s.assist, 'bossIntro', 'timeScale is ' + s.timeScale + ' on the boss intro');
    return c;
  };

  // 10. The lifeLost screen (the last row of the table of 6.3). The world is already stopped there and
  // letters still count, so a watch crate finished on it starts counting at once, on that screen. The screen
  // ends when it would have, and the watch goes on. The step of the pickup does not move the world here,
  // and the step that ends the screen stops at the change of screen and counts nothing (the Hourglass's
  // time does the same), so power:end comes WATCH_TIME / DT steps after the pickup: one more than in play.
  // After a hit, with the letter typed on the first step of the screen; and after a fall, with the letter
  // typed 20 steps in. There the rescue comes with the watch running: Pip is put down past the gap, in this
  // level past a checkpoint line as well, and waits in the bubble until the world moves. The level sees
  // where he is then.
  const overlap = () => {
    const c = clauseList();
    const STEPS = Math.round(C.WATCH_TIME / DT);
    for (const cause of ['hit', 'fall']) {
      const { s, events } = begin(cause === 'fall' ? { gaps: [{ x: 78, w: 1 }] } : { empty: true });
      const p = s.player;
      const gap = cause === 'fall' ? s.level.hazards.find((h) => h.kind === 'gap') : null;
      if (gap) teleport(TG, gap.x - 40);
      const crate = crateOf(s, 'watch');
      type(crate, crate.word.length - 1);
      if (gap) for (let i = 0; i < 600 && s.screen !== 'lifeLost'; i++) TG.Game.step(DT);
      else TG.Entities.damage(s, { type: 'threat', kind: 'hoppet', id: 0, from: 'right' });
      const lostAt = s.frame;
      const screenSteps = Math.round(s.lifeLost.duration / DT);
      for (let i = 0; gap && i < 20; i++) TG.Game.step(DT);
      const on = ' (after a ' + cause + ')';
      const marks = { end: null, rescue: null, screen: null };
      TG.Events.on('power:end', (x) => { if (x.power === 'watch') marks.end = s.frame; });
      TG.Events.on('hero:rescue', () => { marks.rescue = s.frame; });
      TG.Events.on('screen:change', (x) => { if (x.from === 'lifeLost' && marks.screen === null) marks.screen = s.frame; });
      const world = s.worldTime;
      const mark = events.length;
      type(crate);                                 // the pickup, on the lifeLost screen
      const pickup = s.frame;
      c.check(crate.dead && s.screen === 'lifeLost' && s.lifeLost.cause === cause && s.power.watchT > 0, 'setup', 'at the pickup the screen is ' + s.screen + ' (' + s.lifeLost.cause + '), the crate ' + (crate.dead ? 'typed' : 'live') + on);
      c.check(Math.abs(s.power.watchT - (C.WATCH_TIME - DT)) < 1e-9, 'counts', 'after the step of the pickup watchT is ' + s.power.watchT + ', expected ' + (C.WATCH_TIME - DT) + ': the watch counts on the lifeLost screen' + on);
      const rescueX = gap ? gap.x + gap.w + C.RESCUE_AHEAD : null;
      const level = () => since(events, mark, 'section:enter').length + ' section:enter, ' + since(events, mark, 'checkpoint').length + ' checkpoint and ' + since(events, mark, 'hazard:cue').length + ' hazard:cue';
      while (marks.end === null && s.frame < pickup + STEPS + 5) {
        const left = s.power.watchT, was = s.screen;
        TG.Game.step(DT);
        if (was === 'lifeLost' && s.screen === 'lifeLost') {
          c.check(Math.abs(left - s.power.watchT - DT) < 1e-9, 'counts', 'on a step of the lifeLost screen watchT went from ' + left + ' to ' + s.power.watchT + on);
        }
        c.check(s.worldTime === world, 'held', 'worldTime moved by ' + (s.worldTime - world) + ' ws, ' + (s.frame - pickup) + ' steps after the pickup' + on);
        if (marks.rescue !== null) {
          c.check(p.state === 'rescue' && p.x === rescueX, 'bubble', (s.frame - marks.rescue) + ' steps after the rescue Pip is ' + p.state + ' at x ' + p.x + ', expected the bubble at ' + rescueX + ' until the world moves');
        }
      }
      c.check(marks.screen === lostAt + screenSteps && s.screen === 'playing', 'screen',
        'the lifeLost screen ended ' + (marks.screen === null ? 'never' : (marks.screen - lostAt) + ' steps after the life was lost') + ', expected ' + screenSteps + ' as with no watch; now on ' + s.screen + on);
      c.check(marks.end === pickup + STEPS && s.power.watchT === 0, 'ends',
        'power:end came ' + (marks.end === null ? 'not at all' : (marks.end - pickup) + ' steps after the pickup') + ', expected ' + STEPS + on);
      if (gap) c.check(marks.rescue === lostAt + screenSteps, 'bubble', 'the rescue came ' + (marks.rescue === null ? 'not at all' : (marks.rescue - lostAt) + ' steps after the life was lost') + ', expected ' + screenSteps);
      c.check(since(events, mark, 'section:enter').length + since(events, mark, 'checkpoint').length + since(events, mark, 'hazard:cue').length === 0, 'level',
        'while the watch ran: ' + level() + ' (expected none: the level waits for the world)' + on);
      TG.Game.step(DT);
      c.check(s.worldTime > world && p.state === 'run', 'moves', 'on the step after power:end worldTime moved by ' + (s.worldTime - world) + ' ws and Pip is ' + p.state + on);
      if (gap) {
        c.check(since(events, mark, 'section:enter').length === 1 && since(events, mark, 'checkpoint').length === 1 && s.section === 1 && s.checkpoint.index === 1, 'level',
          'on the first step the world moved, with Pip put down past the checkpoint line: ' + level() + ', section ' + s.section + ', checkpoint ' + s.checkpoint.index + ' banked (expected one section:enter and one checkpoint, 1 and 1)');
      }
    }
    return c;
  };

  const bad = [];
  const blind = [];
  const HOLD_CLAUSES = ['timeScale', 'worldTime', 'entities', 'frame', 'eta', 'urgent', 'pip', 'slowT', 'invulnT', 'jump', 'start', 'ends', 'slot'];
  const parts = [
    ['the world holds', holds(HOLD_KINDS[0]), HOLD_CLAUSES],
    ['the world holds (' + HOLD_KINDS[1].join(', ') + ')', holds(HOLD_KINDS[1]), HOLD_CLAUSES],
    ['the close call', closeCall, ['close', 'close-first']],
    ['a threat a fraction of a step from contact', nearContact, null],
    ['a word typed and the waiting spawn', waiting, ['stall', 'waiting-spawn']],
    ['a line of the level reached at the pickup', lines, ['spawn', 'spawn-due', 'cue-line', 'checkpoint-line', 'arena-line']],
    ['a fall in progress', falls, ['fall']],
    ['the cue and the duck', cue, ['cue', 'duck']],
    ['a second watch and a continue', ended, null],
    ['the arena', arena, null],
    ['the lifeLost screen', overlap, null]
  ];
  for (const [what, part, sensitive] of parts) {
    for (const text of part('watch').texts()) bad.push(what + ', ' + text);
    if (!sensitive) continue;
    const control = part('cap');
    if (control.has('setup')) blind.push(what + ' (the script with a Red cap did not set up)');
    for (const clause of sensitive) if (!control.has(clause)) blind.push(what + ', ' + clause);
  }
  if (bad.length) return result(false, bad.length + ' failed: ' + bad.slice(0, 4).join('; '));
  if (blind.length) return result(false, 'the check is not sensitive (a Red cap in the crate passes): ' + blind.join('; '));

  // 11. The bot keeps typing: its timing is on state.time, which is real seconds. Level 2, to its first watch
  // crate and through the freeze, with every assertion of a run on (the `watch` one among them).
  return withSession({ levelId: 2, difficulty: 'medium', profile: 'target', seed: 1, until: 'results', maxSeconds: 300 }, (session, T) => {
    let started = false;
    T.Events.on('power:start', (x) => { if (x.power === 'watch') started = true; });
    while (!started && session.tick()) { /* run to the first watch crate */ }
    if (!started) return result(false, 'the bot did not clear the first watch crate of level 2: ' + session.report.error);
    const s = T.Game.state;
    const keys = () => s.typing.stats.correct + s.typing.stats.wrong;
    const keysBefore = keys(), world = s.worldTime;
    let cleared = 0, steps = 0;
    T.Events.on('word:clear', () => { if (s.power.watchT > 0) cleared++; });
    while (s.power.watchT > 0 && session.tick()) steps++;
    const typed = keys() - keysBefore;
    // Half of what its speed gives in the time: the rest is its pause between words.
    const least = Math.floor(0.5 * steps * DT / session.bot.interval);
    for (let i = 0; i < 600 && session.tick(); i++) { /* and on for ten seconds */ }
    if (session.report.error) return result(false, 'the level 2 run: ' + session.report.error);
    if (steps !== HELD || s.worldTime === world) return result(false, 'in the level 2 run the watch held the world for ' + steps + ' steps, expected ' + HELD);
    if (typed < least) return result(false, 'the bot pressed ' + typed + ' keys during the freeze, expected at least ' + least + ' at ' + session.bot.wpm + ' WPM');
    return result(true, 'the world held for ' + HELD + ' steps (' + fmt(HELD * DT, 3) + ' s: WATCH_TIME counts from the step of the pickup): worldTime, age, x, t of ' + (HOLD_KINDS[0].length + HOLD_KINDS[1].length) + ' kinds, ' +
      'timeScale 0, eta 100 x the ws left, urgent, slowT, invulnT, assist, jump, fall, cue, spawns, the lines of the level, close call, power:end, continue, bossIntro, lifeLost and the rescue; ' +
      parts.filter((x) => x[2]).length + ' parts shown to fail with a Red cap in the crate; ' +
      'the level 2 bot pressed ' + typed + ' keys and cleared ' + cleared + ' words in its first freeze');
  });
};

// --- checks that need full runs (milestone 4) ---------------------------------------------------

// The runs of one profile of the matrix on the level of ctx: every difficulty, seeds 1 to 3. The matrix's own
// runs are reused when it played them to the same stop point; otherwise they are played here, once.
function profileRuns(ctx, profile) {
  if (!ctx.runs[profile]) {
    ctx.runs[profile] = [];
    for (const d of DIFFICULTIES) {
      for (const seed of SEEDS) {
        ctx.runs[profile].push(runBot({ levelId: ctx.levelId, difficulty: d, profile: profile, seed: seed, until: ctx.until, adaptive: PROFILE_ADAPTIVE[profile] }));
      }
    }
  }
  return ctx.runs[profile];
}

// The ctx of another level in the same invocation, for a check that needs its runs. One is made when that
// level is not among the levels played.
function ctxFor(ctx, levelId) {
  if (!ctx.all[levelId]) ctx.all[levelId] = { until: ctx.until, levelId: levelId, runs: {}, all: ctx.all };
  return ctx.all[levelId];
}

CHECKS['deterministic'] = function (ctx) {
  const a = runBot({ levelId: ctx.levelId, difficulty: 'medium', profile: 'target', seed: 1, until: ctx.until, adaptive: false });
  const b = runBot({ levelId: ctx.levelId, difficulty: 'medium', profile: 'target', seed: 1, until: ctx.until, adaptive: false });
  if (a.error || b.error) return result(false, a.error || b.error);
  const same = a.steps === b.steps && a.score === b.score && a.time === b.time && a.words.join() === b.words.join();
  return same ? result(true, 'steps ' + a.steps + ', score ' + a.score + ', time ' + fmt(a.time, 3))
    : result(false, 'steps ' + a.steps + '/' + b.steps + ', score ' + a.score + '/' + b.score + ', time ' + a.time + '/' + b.time);
};

CHECKS['no-presentation'] = function (ctx) {
  const r = runBot({ levelId: ctx.levelId, difficulty: 'medium', profile: 'target', seed: 1, until: ctx.until, adaptive: false, files: SIM_FILES });
  return r.finished && !r.error ? result(true, 'finished with ' + SIM_FILES.length + ' files') : result(false, r.error || 'not finished');
};

CHECKS['words-by-difficulty'] = function (ctx) {
  const runs = profileRuns(ctx, 'target');
  const sets = {};
  for (const d of DIFFICULTIES) sets[d] = new Set();
  const bad = [];
  for (const r of runs) {
    if (r.error && r.error.indexOf('word-pool') !== -1) bad.push(r.difficulty + ' seed ' + r.seed + ': ' + r.error);
    for (const w of r.words) sets[r.difficulty].add(w);
  }
  for (let i = 0; i < DIFFICULTIES.length; i++) {
    for (let j = i + 1; j < DIFFICULTIES.length; j++) {
      const common = [...sets[DIFFICULTIES[i]]].filter((w) => sets[DIFFICULTIES[j]].has(w));
      if (common.length) bad.push(DIFFICULTIES[i] + ' and ' + DIFFICULTIES[j] + ' share ' + common.slice(0, 5).join(', '));
    }
  }
  // The level's flavour (WORD_FLAVOUR): its words are among those seen on every difficulty, and no word
  // comes from a flavour that is not the level's. The word-pool assertion cannot tell, since it takes a
  // word of any list. No word is in two lists (TG.Words.validate), so a word in a flavour list was drawn
  // from that list.
  if (!(ctx.levelId in WORD_FLAVOUR)) return result(false, 'WORD_FLAVOUR has no row for level ' + ctx.levelId);
  const own = WORD_FLAVOUR[ctx.levelId];
  const POOLS = simEnv().TG.Words.POOLS;
  const drawn = [];
  for (const d of DIFFICULTIES) {
    let mine = 0;
    for (const name of Object.keys(POOLS[d].flavour)) {
      const listed = new Set([].concat(...Object.values(POOLS[d].flavour[name])));
      const seen = [...sets[d]].filter((w) => listed.has(w));
      if (name === own) mine = seen.length;
      else if (seen.length) bad.push(d + ' drew ' + seen.slice(0, 3).join(', ') + ' from the flavour ' + name + ', which is not the level\'s');
    }
    if (own && mine === 0) bad.push(d + ' drew no word of the ' + own + ' flavour');
    drawn.push(mine);
  }
  return bad.length ? result(false, bad.join('; ')) : result(true, DIFFICULTIES.map((d) => d + ' ' + sets[d].size).join(', ') + ' distinct words, none shared; ' +
    (own ? drawn.join(' / ') + ' of them from the ' + own + ' flavour' : 'none from a flavour'));
};

CHECKS['length'] = function (ctx) {
  if (ctx.until !== 'results') return { pass: true, skip: true, detail: 'skipped with --until' };
  const bounds = LENGTH_BOUNDS[ctx.levelId];
  const bad = [];
  const times = [];
  for (const r of profileRuns(ctx, 'target')) {
    times.push(r.difficulty + ' ' + fmt(r.time, 0));
    if (!r.finished || r.time < bounds[0] || r.time > bounds[1]) bad.push(r.difficulty + ' seed ' + r.seed + ' ' + fmt(r.time, 1) + ' s' + (r.finished ? '' : ' (not finished)'));
  }
  return bad.length ? result(false, bad.join('; ')) : result(true, times.join(', '));
};

// --- targets ------------------------------------------------------------------------------------
// What the level is tuned to beyond the fixed pass conditions of CONTRACT 10.4: the rows of LEVEL_TARGETS
// (the table of LEVEL2 13.5 for Level 2), each on every seed. The run length is the `length` check and the
// watch crates are in `counts`. The floor row is taken twice: from the matrix's floor runs, which start at
// assist 1.0, and from nine more that start at the assist a floor run of the level before leaves saved on
// the same difficulty and seed (the startAssist option), as a player who has just cleared that level starts.
// The flag row takes those nine as well.
function span(values, digits) {
  const lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
  return fmt(lo, digits) === fmt(hi, digits) ? fmt(lo, digits) : fmt(lo, digits) + ' to ' + fmt(hi, digits);
}

CHECKS['targets'] = function (ctx) {
  const t = LEVEL_TARGETS[ctx.levelId];
  if (!t) return null;
  if (ctx.until !== 'results') return { pass: true, skip: true, detail: 'skipped with --until' };
  const floor = profileRuns(ctx, 'floor');
  const target = profileRuns(ctx, 'target');
  const saved = profileRuns(ctxFor(ctx, t.savedFrom), 'floor');
  const bad = [];
  const who = (r) => r.difficulty + ' ' + r.profile + ' seed ' + r.seed;
  const of = (runs, d) => runs.filter((r) => r.difficulty === d);
  const perDifficulty = (fn) => DIFFICULTIES.map(fn).join(' / ');

  // Floor continues, from both starts.
  const fromSaved = floor.map((r) => {
    const before = saved.find((x) => x.difficulty === r.difficulty && x.seed === r.seed);
    if (!before.finished) bad.push('the level ' + t.savedFrom + ' floor run on ' + r.difficulty + ' seed ' + r.seed + ' did not finish, so it saved no assist');
    const run = runBot({ levelId: ctx.levelId, difficulty: r.difficulty, profile: 'floor', seed: r.seed, until: ctx.until, adaptive: true, startAssist: before.assistEnd });
    // The row says nothing unless the run did start where the run before it ended.
    if (run.startAssist !== before.assistEnd) bad.push(who(run) + ' started at assist ' + fmt(run.startAssist, 2) + ', not at the ' + fmt(before.assistEnd, 2) + ' its level ' + t.savedFrom + ' run left saved');
    return run;
  });
  for (const [runs, start] of [[floor, 'assist 1.0'], [fromSaved, 'the saved assist']]) {
    for (const r of runs) {
      const from = start === 'assist 1.0' ? start : 'assist ' + fmt(r.startAssist, 2) + ', saved';
      if (r.error || !r.finished) bad.push(who(r) + ' from ' + from + ' did not finish' + (r.error ? ': ' + r.error : ''));
      else if (r.continues > t.floorContinues[r.difficulty]) bad.push(who(r) + ' from ' + from + ': ' + r.continues + ' continues (at most ' + t.floorContinues[r.difficulty] + ')');
    }
  }
  // The target bot's window use and fight.
  let noted = 0;
  for (const r of target) {
    if (r.error || !r.finished) { bad.push(who(r) + ' did not finish' + (r.error ? ': ' + r.error : '')); continue; }
    // A run with no value is under the band too. The noted difficulty may be under it, down to uNotedFrom.
    const under = typeof r.meanU !== 'number' || r.meanU < t.u[0];
    if (under && r.difficulty === t.uNoted && r.meanU >= t.uNotedFrom) noted++;
    else if (under || r.meanU > t.u[1]) {
      bad.push(who(r) + ': window use ' + fmt(r.meanU, 3) + ' (' + t.u.join(' to ') + (r.difficulty === t.uNoted ? '; the noted exception goes down to ' + fmt(t.uNotedFrom, 2) : '') + ')');
    }
    if (r.fightTime < t.fight[0] || r.fightTime > t.fight[1]) bad.push(who(r) + ': fight ' + fmt(r.fightTime, 1) + ' s (' + t.fight.join(' to ') + ')');
  }
  // Threats still live at the arena flag: the target bot, and the floor bot from both starts.
  const flagRuns = target.concat(floor, fromSaved);
  const atFlag = flagRuns.filter((r) => r.liveAtFlag > t.liveAtFlag);
  for (const r of atFlag) {
    bad.push(who(r) + (fromSaved.indexOf(r) !== -1 ? ' from the saved assist' : '') + ': ' + r.liveAtFlag + ' threats live at the arena flag (at most ' + t.liveAtFlag + ')');
  }

  const done = (runs) => runs.filter((r) => r.finished);
  const measured = 'floor continues ' + perDifficulty((d) => span(of(floor, d).map((r) => r.continues), 0)) + ' from assist 1.0, ' +
    perDifficulty((d) => span(of(fromSaved, d).map((r) => r.continues), 0)) + ' from the saved ' + perDifficulty((d) => span(of(fromSaved, d).map((r) => r.startAssist), 2)) +
    ' (at most ' + perDifficulty((d) => t.floorContinues[d]) + '); window use ' + perDifficulty((d) => (of(done(target), d).length ? span(of(done(target), d).map((r) => r.meanU), 2) : '-')) +
    ' (' + t.u.join(' to ') + (noted ? '; ' + t.uNoted + ' under it on ' + noted + ' of ' + of(target, t.uNoted).length + ' seeds: the noted exception' : '') + '); fight ' +
    perDifficulty((d) => (of(done(target), d).length ? span(of(done(target), d).map((r) => r.fightTime), 0) : '-')) + ' s (' + t.fight.join(' to ') + '); ' +
    'a threat live at the arena flag in ' + atFlag.length + ' of ' + flagRuns.length + ' runs';
  return bad.length ? result(false, bad.length + ' not met: ' + bad.slice(0, 3).join('; ') + ' | ' + measured) : result(true, measured);
};

// --- boss-fight ---------------------------------------------------------------------------------
// One target run per difficulty, traced from the arena to the results screen: the order of the boss
// states (CONTRACT 5.7), volley contents per phase (the minion in phase 3 is Tier 2), attacks per phase
// (the double attack is Tier 2), the launch gap, rocks in flight, health and phases, scores, the
// finisher at a quarter of the speed with nothing live, the defeat, levelComplete and the result.
// Whose fight it is comes from BOSS_EXPECTED for the level: the boss kind, the health and the minion on
// each difficulty, and the sprite every minion carries (LEVEL2 13.5 for Level 2: kind `ratchet`, health
// 3 / 6 / 7, the minion on every difficulty with skin en_baronet). The round machine is the same code for
// every boss (LEVEL2 10.5), so the rest of the trace is the same for every level: the states from intro to
// defeated, the lamp or the lenses RED from phase 2 and not before, each entry thrown as the threat of
// ENTRY_SPAWN, every kind of entry and both attacks seen in the fight, and the finisher's quarter speed
// measured on the time scale and on the world clock.
const BOSS_NEXT = {
  intro: ['volley'], volley: ['telegraph'], telegraph: ['attack'], attack: ['taunt'],
  taunt: ['recoil', 'laugh'], recoil: ['volley', 'transition', 'finisher'], laugh: ['volley'],
  transition: ['volley', 'transition'], finisher: ['defeated'], defeated: []
};
// What each entry of a volley is thrown as: the kind and the side of its threat:spawn (CONTRACT 5.7).
const ENTRY_SPAWN = { rock: 'rock:right', rockhigh: 'rock:above', minion: 'digby:below' };

function expectedVolley(cfg, phase) {
  const n = cfg.boss.rocks[phase - 1];
  const list = [];
  for (let i = 0; i < n; i++) list.push(phase >= 2 && i === 1 ? 'rockhigh' : 'rock');
  if (phase === 3 && cfg.boss.minion) list[n - 1] = 'minion';
  return list;
}

function traceBossFight(levelId, difficulty, profile, seed) {
  return withSession({ levelId: levelId, difficulty: difficulty, profile: profile, seed: seed, until: 'results' }, (session, TG) => {
    const C = TG.C;
    const cfg = TG.Game.state.config;
    const b = cfg.boss;
    const expected = BOSS_EXPECTED[levelId];
    const errs = [];
    const rounds = [];
    const hits = [];
    const phases = [];
    const minionSkins = [];
    let round = null;
    let prevState = null, firstState = null;
    let lastLaunch = null;
    let defeats = 0, clears = 0, finisherWord = null, arenaAt = null;
    if (b.health !== expected.health[difficulty] || b.minion !== expected.minion[difficulty]) {
      errs.push('health ' + b.health + ' and minion ' + b.minion + ', expected ' + expected.health[difficulty] + ' and ' + expected.minion[difficulty]);
    }
    TG.Events.on('*', (p, name) => {
      const s = TG.Game.state;
      if (name === 'boss:enter') arenaAt = s.time;
      if (!s.boss) return;
      if (name === 'threat:spawn' && p.kind === 'digby') minionSkins.push('skin' in p.entity ? p.entity.skin : null);
      if (name === 'threat:spawn' && round) round.spawned.push(p.kind + ':' + p.from);
      if (name === 'boss:state') {
        if (prevState && BOSS_NEXT[prevState].indexOf(p.state) === -1) errs.push('state ' + prevState + ' -> ' + p.state);
        if (firstState === null) firstState = p.state;
        prevState = p.state;
        // The lamp (CONTRACT 5.7), and her lenses (LEVEL2 10.7): RED from phase 2, and not in phase 1.
        if (s.boss.lampRed !== (s.boss.phase >= 2)) errs.push('lampRed is ' + s.boss.lampRed + ' in phase ' + s.boss.phase + ', at ' + p.state);
        if (p.state === 'volley') {
          round = { phase: p.phase, volley: [], attacks: [], spawned: [] };
          rounds.push(round);
          lastLaunch = null;
        }
      } else if (name === 'boss:attack' && p.telegraph === 0) {
        round.volley.push(p.kind);
        const gap = TG.Difficulty.toWs(cfg, b.launchGap[s.boss.phase - 1]);
        if (lastLaunch !== null && s.worldTime - lastLaunch < gap - C.DT * s.timeScale - 1e-6) {
          errs.push('launches ' + fmt(s.worldTime - lastLaunch, 2) + ' ws apart in phase ' + s.boss.phase + ', gap ' + fmt(gap, 2));
        }
        lastLaunch = s.worldTime;
      } else if (name === 'attack:spawn') {
        round.attacks.push(p.kind);
      } else if (name === 'boss:hit') {
        hits.push(p.health);
      } else if (name === 'boss:phase') {
        phases.push(p.phase);
        if (s.boss.health !== TG.Boss.phaseStartHealth(cfg, p.phase)) errs.push('phase ' + p.phase + ' began at health ' + s.boss.health);
      } else if (name === 'score:add' && p.reason === 'core') {
        if (p.points !== TG.Util.round10(C.PTS_CORE * s.assist)) errs.push('weak point scored ' + p.points);
      } else if (name === 'score:add' && p.reason === 'finisher') {
        if (p.points !== b.finisherBonus) errs.push('finisher bonus ' + p.points);
      } else if (name === 'score:add' && p.reason === 'boss') {
        if (p.points !== C.PTS_BOSS) errs.push('boss bonus ' + p.points);
      } else if (name === 'boss:finisher') {
        finisherWord = p.word;
      } else if (name === 'boss:defeat') {
        defeats++;
      } else if (name === 'level:clear') {
        clears++;
      }
    });
    let riseStart = null, riseEnd = null;
    // The finisher at 25% (DESIGN 11.6; LEVEL2 10.7). fightScale: the time scale of the last step before the
    // finisher; slow: the steps of the finisher after the one that entered it, whose world step was
    // already taken at the fight's scale; offScale: the first such step that is not a quarter of it.
    let fightScale = null, worldBefore = null, slow = 0, offScale = null;
    while (session.tick()) {
      const s = TG.Game.state;
      if (!s.boss) continue;
      const live = s.entities.filter((e) => !e.dead && e.type === 'threat').length;
      if (live > b.inFlight) errs.push(live + ' rocks in flight, at most ' + b.inFlight);
      if (s.boss.state === 'finisher' && s.screen === 'boss') {
        if (s.entities.some((e) => !e.dead)) errs.push('something is live during the finisher');
        if (s.finisherScale !== C.FINISHER_SCALE) errs.push('finisherScale ' + s.finisherScale + ' during the finisher');
        if (worldBefore !== null) {
          slow++;
          const moved = s.worldTime - worldBefore;
          if (offScale === null && (Math.abs(s.timeScale - 0.25 * fightScale) > 1e-9 || Math.abs(moved - 0.25 * fightScale * C.DT) > 1e-9)) {
            offScale = 'time scale ' + fmt(s.timeScale, 4) + ' and a world step of ' + fmt(moved / C.DT, 4) + ' x DT in the finisher, a quarter of ' + fmt(fightScale, 4) + ' expected';
          }
        }
      } else if (s.screen === 'boss') {
        fightScale = s.timeScale;
      }
      worldBefore = s.boss.state === 'finisher' && s.screen === 'boss' ? s.worldTime : null;
      if (s.screen === 'levelComplete') {
        if (riseStart === null) riseStart = s.boss.rise;
        riseEnd = s.boss.rise;
        if (s.finisherScale !== 1) errs.push('finisherScale ' + s.finisherScale + ' on levelComplete');
      }
    }
    const s = TG.Game.state;
    if (session.report.error) errs.push(session.report.error);

    // The states from the intro to the defeat.
    if (firstState !== 'intro' || prevState !== 'defeated') errs.push('the states ran from ' + firstState + ' to ' + prevState + ', expected intro to defeated');
    // Volleys and attacks.
    let singles = [];
    const thrown = {}, attacked = {};
    for (const r of rounds) {
      const want = expectedVolley(cfg, r.phase);
      if (r.volley.join() !== want.join()) errs.push('phase ' + r.phase + ' volley ' + r.volley.join('+') + ', expected ' + want.join('+'));
      const wantSpawned = r.volley.map((entry) => ENTRY_SPAWN[entry]);
      if (r.spawned.join() !== wantSpawned.join()) errs.push('phase ' + r.phase + ' volley ' + r.volley.join('+') + ' was thrown as ' + r.spawned.join('+') + ', expected ' + wantSpawned.join('+'));
      r.volley.forEach((entry) => { thrown[entry] = true; });
      r.attacks.forEach((kind) => { attacked[kind] = true; });
      if (r.phase === 1 && r.attacks.join() !== 'shock') errs.push('phase 1 attacks ' + r.attacks.join('+'));
      else if (r.phase === 3 && b.doubleAttack) {
        if (r.attacks.join() !== 'shock,pick') errs.push('phase 3 attacks ' + r.attacks.join('+') + ', expected shock+pick');
      } else if (r.phase >= 2) {
        if (r.attacks.length !== 1) errs.push('phase ' + r.phase + ' attacks ' + r.attacks.join('+'));
        else singles.push(r.attacks[0]);
      }
    }
    if (singles.length && singles[0] !== 'pick') errs.push('phase 2 opened with ' + singles[0]);
    for (let i = 1; i < singles.length; i++) if (singles[i] === singles[i - 1]) errs.push('attacks do not alternate: ' + singles.join(','));
    // Every kind of entry and both attacks are met in the fight: rocks, a high rock, the minion where the
    // difficulty has one, the shockwave and the pickaxe.
    const wantThrown = ['rock', 'rockhigh'].concat(expected.minion[difficulty] ? ['minion'] : []);
    if (Object.keys(thrown).sort().join() !== wantThrown.sort().join()) errs.push('entries thrown: ' + Object.keys(thrown).sort().join(',') + ', expected ' + wantThrown.join(','));
    if (Object.keys(attacked).sort().join() !== 'pick,shock') errs.push('attacks: ' + (Object.keys(attacked).sort().join(',') || 'none') + ', expected pick and shock');
    // The finisher at a quarter of the speed.
    if (offScale) errs.push(offScale);
    else if (slow < 2) errs.push('the finisher lasted ' + slow + ' steps: its speed was not measured');
    // Health, phases, finisher, defeat.
    const wantHits = [];
    for (let h = b.health - 1; h >= 0; h--) wantHits.push(h);
    if (hits.join() !== wantHits.join()) errs.push('health went ' + hits.join(',') + ', expected ' + wantHits.join(','));
    // One boss:phase for each phase after the first. Every boss has three phases (CONTRACT 5.7; the round
    // machine of js/boss.js), whatever the level's coreWords say.
    if (phases.join() !== '2,3') errs.push('phases ' + phases.join(',') + ', expected 2,3');
    if (!finisherWord || finisherWord.length < b.finisherLen[0] || finisherWord.length > b.finisherLen[1]) errs.push('finisher word ' + finisherWord);
    if (defeats !== 1 || clears !== 1) errs.push(defeats + ' boss:defeat and ' + clears + ' level:clear');
    if (riseStart !== 0 || !(riseEnd > 39)) errs.push('the boss did not leave: rise ' + riseStart + ' -> ' + riseEnd);
    if (s.screen !== 'results' || !s.result || s.result.cleared !== true || s.run.cleared !== true) errs.push('no cleared result');
    else if (s.result.levelId !== levelId) errs.push('result.levelId ' + s.result.levelId);
    if (!s.boss || s.boss.kind !== expected.kind || s.level.boss.kind !== expected.kind) errs.push('the boss is ' + (s.boss && s.boss.kind) + ', expected ' + expected.kind);
    const minions = rounds.filter((r) => r.volley.indexOf('minion') !== -1).length;
    if (minionSkins.length !== minions || (minions > 0) !== expected.minion[difficulty]) errs.push(minions + ' volleys with a minion and ' + minionSkins.length + ' minions spawned');
    if (minionSkins.some((skin) => skin !== expected.minionSkin)) errs.push('a minion has the skin ' + minionSkins.join(',') + ', expected ' + expected.minionSkin);
    return {
      pass: errs.length === 0,
      detail: errs.length ? difficulty + ': ' + errs.slice(0, 4).join('; ')
        : difficulty + ' ' + rounds.length + ' rounds, ' + minions + ' with a minion, ' + fmt(s.time - arenaAt, 0) + ' s'
    };
  });
}

// Rocks in flight with nobody typing in the arena, so that the rocks last their whole budget and the
// limit of config.boss.inFlight holds the next launch back where the launch gap does not. On Hard in
// phase 1 the gap alone keeps it to 2 (a rock reaches Pip before a third is thrown), so the check needs
// the limit to be reached on at least one difficulty and never passed on any.
function inFlightUntyped(levelId, difficulty) {
  return withSession({ levelId: levelId, difficulty: difficulty, profile: 'target', seed: 1, until: 'results', maxSeconds: 1500 }, (session, TG) => {
    const b = TG.Game.state.config.boss;
    while (TG.Game.state.screen !== 'boss' && session.tick()) { /* run to the fight */ }
    session.bot.noType = true;
    let most = 0;
    const t0 = TG.Game.state.time;
    while (TG.Game.state.time < t0 + 60 && session.tick()) {
      const s = TG.Game.state;
      if (s.screen !== 'boss') continue;
      most = Math.max(most, s.entities.filter((e) => !e.dead && e.type === 'threat').length);
    }
    const ok = most <= b.inFlight && !session.report.error;
    return { pass: ok, reached: most === b.inFlight, detail: difficulty + ' ' + most + '/' + b.inFlight + ' in flight' + (session.report.error ? ' (' + session.report.error + ')' : '') };
  });
}

CHECKS['boss-fight'] = function (ctx) {
  const flights = DIFFICULTIES.map((d) => inFlightUntyped(ctx.levelId, d));
  const out = DIFFICULTIES.map((d) => traceBossFight(ctx.levelId, d, 'target', 1)).concat(flights);
  const failed = out.filter((r) => !r.pass);
  if (!flights.some((r) => r.reached)) failed.push({ detail: 'the in-flight limit was never reached: ' + flights.map((r) => r.detail).join(', ') });
  return failed.length ? result(false, failed.map((r) => r.detail).join(' | ')) : result(true, out.map((r) => r.detail).join('; '));
};

// --- boss-continue ------------------------------------------------------------------------------
// The level can always be completed. A medium run reaches phase 2, stops typing and loses every life
// in the arena; missed weak-point windows cost no life. After continueRun the level's boss is back at the
// start of phase 2 after the short intro, Pip is at the boss checkpoint with the starting lives and the
// banked score, and the fight is then won. Restart from checkpoint on the pause menu does the same.
CHECKS['boss-continue'] = function (ctx) {
  const first = withSession({ levelId: ctx.levelId, difficulty: 'medium', profile: 'target', seed: 2, until: 'results', maxSeconds: 1500 }, (session, TG) => {
    const C = TG.C;
    const bad = [];
    let reached = 1;
    TG.Events.on('boss:phase', (p) => { reached = p.phase; });
    while (reached < 2 && session.tick()) { /* run to phase 2 */ }
    if (reached < 2) return result(false, 'phase 2 not reached: ' + session.report.error);
    session.bot.noType = true;
    let weakMisses = 0;
    const causes = {};
    TG.Events.on('boss:weakclose', (p) => { if (!p.completed) weakMisses++; });
    TG.Events.on('life:lost', (p) => { causes[p.cause.type] = (causes[p.cause.type] || 0) + 1; });
    let over = null, after = null;
    session.opts.onGameOver = (T) => {
      const s = T.Game.state;
      if (!over) over = { cp: JSON.parse(JSON.stringify(s.checkpoint)), phase: s.boss.phase };
    };
    TG.Events.on('game:continue', () => {
      const s = TG.Game.state;
      if (!after) {
        after = { screen: s.screen, x: s.player.x, lives: s.player.lives, score: s.score, phase: s.boss.phase, health: s.boss.health,
          state: s.boss.state, intro: s.boss.introTime, live: s.entities.filter((e) => !e.dead).length, section: s.section,
          kind: s.boss.kind, lampRed: s.boss.lampRed };
      }
    });
    while (!after && session.tick()) { /* run to the game over and the continue */ }
    if (!over || !after) return result(false, 'no game over and continue in the arena: ' + session.report.error);
    const cfg = TG.Game.state.config;
    if (over.cp.index !== 3 || over.cp.bossPhase !== 2 || over.phase !== 2) bad.push('game over at checkpoint ' + over.cp.index + ', stored phase ' + over.cp.bossPhase + ', phase ' + over.phase);
    if (weakMisses < 1) bad.push('no weak-point window ran out');
    if (Object.keys(causes).some((k) => k !== 'threat' && k !== 'attack')) bad.push('lives lost to ' + JSON.stringify(causes));
    if (after.screen !== 'bossIntro' || after.state !== 'intro' || after.intro !== C.BOSS_INTRO_SHORT) bad.push('after the continue: ' + after.screen + ', ' + after.state + ', intro ' + after.intro);
    if (after.phase !== 2 || after.health !== TG.Boss.phaseStartHealth(cfg, 2)) bad.push('the boss restarted in phase ' + after.phase + ' with health ' + after.health);
    // It is still the level's boss, and in phase 2 its lamp (or her lenses) is already RED.
    if (after.kind !== BOSS_EXPECTED[ctx.levelId].kind || after.lampRed !== true) bad.push('after the continue the boss is ' + after.kind + ' with lampRed ' + after.lampRed);
    if (after.x !== over.cp.x || after.lives !== cfg.lives || after.score !== over.cp.score || after.live !== 0 || after.section !== 3) {
      bad.push('Pip at ' + after.x + ' (checkpoint ' + over.cp.x + '), lives ' + after.lives + ', score ' + after.score + ' (banked ' + over.cp.score + '), ' + after.live + ' live, section ' + after.section);
    }
    // Typing again, the fight is won.
    session.bot.noType = false;
    const t0 = TG.Game.state.time;
    const r = session.run();
    const s = TG.Game.state;
    if (!r.finished || s.run.continues !== 1) bad.push('the fight was not won after the continue (' + (r.error || s.screen) + ', continues ' + s.run.continues + ')');
    else if (s.result.levelId !== ctx.levelId) bad.push('result.levelId ' + s.result.levelId + ' after the continue');
    return bad.length ? result(false, bad.join('; ')) : result(true, 'game over in phase 2 after ' + weakMisses + ' missed windows; continue: phase 2, health ' + after.health + ', ' +
      after.lives + ' lives, score ' + after.score + '; won ' + fmt(s.time - t0, 0) + ' s later');
  });
  if (!first.pass) return first;
  // Restart from checkpoint on the pause menu during the fight.
  const second = withSession({ levelId: ctx.levelId, difficulty: 'easy', profile: 'target', seed: 1, until: 'results' }, (session, TG) => {
    while (!(TG.Game.state.screen === 'boss' && TG.Game.state.boss.state === 'taunt') && session.tick()) { /* run to the first taunt */ }
    const s = TG.Game.state;
    if (s.screen !== 'boss') return result(false, 'the fight was not reached: ' + session.report.error);
    if (!TG.Game.pause() || !TG.Game.continueRun()) return result(false, 'pause and restart from checkpoint were refused');
    const c = TG.Game.state;
    if (c.screen !== 'bossIntro' || c.boss.phase !== 1 || c.boss.word !== null || c.typing.target !== null || c.run.continues !== 1) {
      return result(false, 'restart from checkpoint: ' + c.screen + ', phase ' + c.boss.phase + ', continues ' + c.run.continues);
    }
    const r = session.run();
    return r.finished ? result(true, '') : result(false, 'not won after restart from checkpoint: ' + r.error);
  });
  if (!second.pass) return second;
  // A pause during the intro does not make the intro start again.
  const third = withSession({ levelId: ctx.levelId, difficulty: 'hard', profile: 'target', seed: 1, until: 'results' }, (session, TG) => {
    while (TG.Game.state.screen !== 'bossIntro' && session.tick()) { /* run to the arena */ }
    let steps = 0;
    while (TG.Game.state.screen === 'bossIntro' && session.stepOnce()) {
      steps++;
      if (steps === 60) {
        TG.Game.pause();
        TG.Game.resume();
      }
    }
    const want = Math.round(TG.C.BOSS_INTRO_TIME / TG.C.DT);
    return Math.abs(steps - want) <= 1 ? result(true, '') : result(false, 'with a pause the intro lasted ' + steps + ' steps, expected ' + want);
  });
  if (!third.pass) return third;
  return result(true, first.detail + '; restart from checkpoint on the pause menu works; a pause does not restart the intro');
};

// --- result-rank --------------------------------------------------------------------------------
// state.result (CONTRACT 5.11): bonuses, final score, rank (DESIGN 8.6), suggestion (Tier 2), events.
function rankFor(r) {
  const a = r.typing.accuracy;
  if (r.typing.correct + r.typing.wrong === 0) return 'C';
  if (r.cleared && a >= 0.97 && r.livesLost === 0 && r.continues === 0) return 'S';
  if (r.cleared && a >= 0.93 && r.livesLost <= 2 && r.continues === 0) return 'A';
  return a >= 0.85 ? 'B' : 'C';
}

CHECKS['result-rank'] = function () {
  const bad = [];
  const details = [];
  for (const [d, profile, seed] of [['easy', 'fast', 1], ['medium', 'target', 2], ['hard', 'floor', 3]]) {
    const r = withSession({ difficulty: d, profile: profile, seed: seed, until: 'results' }, (session, TG) => {
      const C = TG.C;
      const errs = [];
      const clears = [];
      TG.Events.on('level:clear', (p) => clears.push(p.result));
      session.run();
      const s = TG.Game.state;
      const res = s.result;
      if (!res || !res.cleared || clears.length !== 1 || clears[0] !== res) return result(false, d + ': no level:clear with the result');
      const keys = ['cleared', 'levelId', 'difficulty', 'score', 'baseScore', 'bonuses', 'time', 'typing', 'ink', 'livesLost', 'lives', 'continues', 'rank', 'suggestion', 'bestWpm', 'assist', 'adaptive'];
      const missing = keys.filter((k) => !(k in res));
      if (missing.length) errs.push('result lacks ' + missing.join(','));
      const sum = res.bonuses.reduce((t, x) => t + x.points, 0);
      if (res.score !== res.baseScore + sum || res.score !== s.score) errs.push('score ' + res.score + ' != ' + res.baseScore + ' + ' + sum);
      const want = [];
      if (res.lives > 0) want.push('lives:' + res.lives * C.PTS_LIFE);
      if (res.typing.accuracy >= 0.95) want.push('accuracy:' + C.PTS_ACC95);
      else if (res.typing.accuracy >= 0.90) want.push('accuracy:' + C.PTS_ACC90);
      if (res.continues === 0) want.push('nocontinue:' + C.PTS_NOCONT);
      const got = res.bonuses.map((x) => x.id + ':' + x.points);
      if (got.join() !== want.join()) errs.push('bonuses ' + got.join(',') + ', expected ' + want.join(','));
      if (res.rank !== rankFor(res)) errs.push('rank ' + res.rank + ', expected ' + rankFor(res));
      const sugg = res.typing.accuracy >= 0.92 && ((d === 'easy' && res.typing.wpm >= 25) || (d === 'medium' && res.typing.wpm >= 45))
        ? (d === 'easy' ? 'READY FOR MEDIUM?' : 'READY FOR HARD?') : null;
      if (res.suggestion !== sugg) errs.push('suggestion ' + res.suggestion + ', expected ' + sugg);
      if (res.time !== s.time || res.lives !== s.player.lives || res.ink !== s.inkTotal || res.assist !== s.assist || res.adaptive !== s.adaptive) errs.push('time, lives, ink, assist or adaptive differ from the state');
      if (typeof res.typing.avgReaction !== 'number' || !Array.isArray(res.typing.slowKeys) || !Array.isArray(res.typing.practiseKeys)) errs.push('typing summary shape');
      return errs.length ? result(false, d + ': ' + errs.join('; ')) : result(true, d + ' ' + profile + ' rank ' + res.rank + (res.suggestion ? ' "' + res.suggestion + '"' : '') + ' score ' + res.score);
    });
    if (!r.pass) bad.push(r.detail); else details.push(r.detail);
  }
  // A run ended from the pause menu before any letter was typed: no bonuses, rank C, run:end.
  const env = simEnv();
  const TG = env.TG;
  const events = recordEvents(TG);
  TG.Game.newRun({ difficulty: 'medium', seed: 1, adaptive: false, assist: 1, tutorial: false });
  for (let i = 0; i < 120; i++) TG.Game.step(TG.C.DT);
  TG.Game.pause();
  TG.Game.endRun();
  const res = TG.Game.state.result;
  const ends = events.filter((e) => e.name === 'run:end');
  if (!res || res.cleared !== false || res.bonuses.length !== 0 || res.rank !== 'C' || res.suggestion !== null || ends.length !== 1 || TG.Game.state.screen !== 'results') {
    bad.push('ended run: ' + JSON.stringify(stubs.plain(res && { cleared: res.cleared, bonuses: res.bonuses, rank: res.rank })) + ', run:end ' + ends.length);
  }
  return bad.length ? result(false, bad.join(' | ')) : result(true, details.join('; ') + '; a run quit before typing ranks C with no bonuses');
};

// --- tutorial-slowdown --------------------------------------------------------------------------
// DESIGN 3.5: at 60% of a tutorial threat's time with nothing typed, the world slows to 25% and
// tutor:prompt is emitted; the first correct letter ends it (tutor:end). A tutorial threat that reaches
// Pip ends it too. Only the three tutorial threats have it, and only when the run's tutorial is on.
CHECKS['tutorial-slowdown'] = function () {
  const bad = [];
  const env = simEnv();
  const TG = env.TG;
  const C = TG.C;
  TG.Game.newRun({ difficulty: 'easy', seed: 1, adaptive: false, assist: 1, tutorial: true });
  const events = recordEvents(TG);
  const prompts = [];
  TG.Events.on('tutor:prompt', (p) => {
    const e = TG.Game.state.entities.find((x) => x.id === p.id);
    prompts.push({ id: p.id, word: p.word, t: e ? e.t : null, tutorial: e ? e.tutorial : null, typed: e ? e.typed : null });
  });
  const stepUntil = (fn, max) => { for (let i = 0; i < (max || 20000); i++) { if (fn(TG.Game.state)) return true; TG.Game.step(C.DT); } return false; };
  // 1. The first tutorial threat, not typed: the prompt at t >= TUTOR_T, a quarter of the speed.
  if (!stepUntil(() => prompts.length > 0)) return result(false, 'no tutor:prompt');
  const p1 = prompts[0];
  if (!p1.tutorial || p1.typed !== 0 || !(p1.t >= C.TUTOR_T) || p1.t > C.TUTOR_T + 0.05) bad.push('prompt for ' + JSON.stringify(p1));
  TG.Game.step(C.DT);
  let s = TG.Game.state;
  const slow = s.pace * s.assist * C.TUTOR_SCALE;
  if (Math.abs(s.timeScale - slow) > 1e-9 || s.tutorScale !== C.TUTOR_SCALE || !s.tutorial.active || s.tutorial.targetId !== p1.id) bad.push('timeScale ' + s.timeScale + ' while prompted');
  // 2. The first correct letter ends it.
  TG.Input.typeChar(p1.word[0]);
  TG.Game.step(C.DT);
  TG.Game.step(C.DT);
  s = TG.Game.state;
  const end1 = events.filter((e) => e.name === 'tutor:end');
  if (end1.length !== 1 || end1[0].payload.id !== p1.id || s.tutorScale !== 1 || Math.abs(s.timeScale - s.pace * s.assist) > 1e-9) bad.push('the first letter did not end the slow-down');
  for (const ch of p1.word.slice(1)) { TG.Input.typeChar(ch); TG.Game.step(C.DT); }
  // 3. The second tutorial threat reaches Pip untyped: the slow-down ends at contact.
  if (!stepUntil(() => prompts.length > 1)) return result(false, 'no second tutor:prompt');
  const p2 = prompts[1];
  let hit = false;
  TG.Events.on('threat:hit', (p) => { if (p.id === p2.id) hit = true; });
  stepUntil(() => hit, 20000);
  TG.Game.step(C.DT);
  s = TG.Game.state;
  const end2 = events.filter((e) => e.name === 'tutor:end');
  if (!hit || end2.length !== 2 || end2[1].payload.id !== p2.id || s.tutorScale !== 1) bad.push('contact did not end the slow-down (hit ' + hit + ', ends ' + end2.length + ')');
  // 4. No prompt for a threat that is not a tutorial threat.
  stepUntil((st) => st.player.x > 130 * 16 || st.screen === 'gameOver');
  if (prompts.some((p) => !p.tutorial) || prompts.length > 3) bad.push(prompts.length + ' prompts by tile 130');
  // 5. With the tutorial off (Medium after the first checkpoint), nothing slows down.
  const env2 = simEnv();
  const T2 = env2.TG;
  T2.Game.newRun({ difficulty: 'medium', seed: 1, adaptive: false, assist: 1, tutorial: false });
  const ev2 = recordEvents(T2);
  let late = false;
  for (let i = 0; i < 4000 && !late; i++) {
    T2.Game.step(C.DT);
    late = T2.Game.state.entities.some((e) => e.tutorial && e.t > 0.9);
    if (T2.Game.state.tutorScale !== 1) { bad.push('medium without the tutorial slowed down'); break; }
  }
  if (!late || ev2.some((e) => e.name === 'tutor:prompt')) bad.push('medium without the tutorial: prompt or no late tutorial threat');
  // 6. And on Medium with it on, the prompt comes.
  const env3 = simEnv();
  const T3 = env3.TG;
  T3.Game.newRun({ difficulty: 'medium', seed: 1, adaptive: false, assist: 1, tutorial: true });
  const ev3 = recordEvents(T3);
  for (let i = 0; i < 4000 && !ev3.some((e) => e.name === 'tutor:prompt'); i++) T3.Game.step(C.DT);
  if (!ev3.some((e) => e.name === 'tutor:prompt')) bad.push('medium with the tutorial: no prompt');
  return bad.length ? result(false, bad.join('; ')) : result(true, 'prompt at t=' + fmt(p1.t, 3) + ' for "' + p1.word + '", world at 25%, ended by the first letter and by contact; none when the tutorial is off');
};

// --- adaptive-pacing ----------------------------------------------------------------------------
// DESIGN 9.3: the evaluation every ASSIST_WINDOW resolved words, the limits, the easing rate, no
// increase while a threat is live, the continue rules, no change with adaptive pacing off, and which
// removals count.
CHECKS['adaptive-pacing'] = function () {
  const bad = [];
  const env = simEnv();
  const TG = env.TG;
  const C = TG.C;
  const start = (adaptive) => {
    TG.Levels.test = testLevel(TG, { empty: true });
    TG.Input.clear();
    return TG.Game.newRun({ difficulty: 'medium', seed: 1, levelId: 'test', adaptive: adaptive, assist: 1, tutorial: false });
  };
  const feed = (s, u, correct, wrong) => { s.adapt = { n: C.ASSIST_WINDOW, uSum: u * C.ASSIST_WINDOW, correct: correct, wrong: wrong }; };
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  let s = start(true);
  const events = recordEvents(TG);
  const cases = [
    // [target before, mean u, correct, wrong, target after]
    [1.0, 0.95, 20, 0, 0.9], [1.0, 0.85, 20, 0, 0.95], [1.0, 0.70, 20, 0, 1.0], [0.8, 0.50, 23, 2, 0.85],
    [0.8, 0.50, 22, 2, 0.8], [1.0, 0.50, 25, 0, 1.0], [0.75, 0.95, 20, 0, 0.7], [0.7, 0.95, 20, 0, 0.7], [0.8, 0.9, 20, 0, 0.75]
  ];
  for (const [before, u, cor, wr, after] of cases) {
    s.assistTarget = before;
    s.assist = before;
    feed(s, u, cor, wr);
    const n0 = events.filter((e) => e.name === 'assist:change').length;
    TG.Game.step(C.DT);
    const changes = events.filter((e) => e.name === 'assist:change').length - n0;
    if (!near(s.assistTarget, after)) bad.push('target ' + before + ' with u ' + u + ' and ' + cor + '/' + (cor + wr) + ' -> ' + s.assistTarget + ', expected ' + after);
    if (changes !== (near(before, after) ? 0 : 1)) bad.push(changes + ' assist:change events for ' + before + ' -> ' + after);
    if (s.adapt.n !== 0) bad.push('state.adapt not reset');
  }
  // Easing at ASSIST_RATE per real second.
  s.assist = 1; s.assistTarget = 0.9; s.adapt = { n: 0, uSum: 0, correct: 0, wrong: 0 };
  for (let i = 0; i < 60; i++) TG.Game.step(C.DT);
  if (Math.abs(s.assist - 0.95) > 1e-6) bad.push('after 1 s assist is ' + fmt(s.assist, 4) + ', expected 0.95');
  // No increase while a threat is live.
  s.assist = 0.8; s.assistTarget = 0.9;
  const e = TG.Entities.spawn(s, { kind: 'dawdle' });
  for (let i = 0; i < 30; i++) TG.Game.step(C.DT);
  if (!e || s.assist !== 0.8) bad.push('assist rose to ' + s.assist + ' while a threat was live');
  TG.Entities.remove(s, e, 'flee');
  if (s.adapt.n !== 0) bad.push('a threat that fled was counted');
  for (let i = 0; i < 30; i++) TG.Game.step(C.DT);
  if (!(s.assist > 0.8)) bad.push('assist did not rise once the threat was gone');
  // Nor while a weak-point window is open (a stand-in boss word, not typable so that no key reaches it).
  s.assist = 0.8; s.assistTarget = 0.9;
  s.boss = { word: { kind: 'core', word: 'test', typable: false, lost: false } };
  for (let i = 0; i < 30; i++) TG.Game.step(C.DT);
  if (s.assist !== 0.8) bad.push('assist rose to ' + s.assist + ' during a weak-point window');
  s.boss = null;
  // Which removals count.
  s.adapt = { n: 0, uSum: 0, correct: 0, wrong: 0 };
  for (const reason of ['cleared', 'hit', 'bounced', 'flee', 'blast', 'escaped']) {
    const x = TG.Entities.spawn(s, { kind: 'hoppet' });
    x.age = x.budget / 2;
    TG.Entities.remove(s, x, reason);
  }
  const c = TG.Entities.spawn(s, { kind: 'crate', power: 'shield' });
  TG.Entities.remove(s, c, 'cleared');
  if (s.adapt.n !== 3 || !near(s.adapt.uSum, 0.5 + 2 * C.U_MISS)) bad.push('adapt after cleared, hit, bounced, flee, blast, escaped and a crate: n ' + s.adapt.n + ', uSum ' + s.adapt.uSum);
  s.adapt = { n: 0, uSum: 0, correct: 0, wrong: 0 };
  // Continues: the first at a checkpoint caps the target at ASSIST_CONTINUE_CAP, each further one -0.05, down to ASSIST_MIN_CONTINUE.
  s.assistTarget = 1; s.assist = 1;
  const targets = [];
  for (let i = 0; i < 7; i++) {
    TG.Game.pause();
    TG.Game.continueRun();
    targets.push(TG.Game.state.assistTarget);
  }
  const wantT = [0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.6];
  if (targets.some((t, i) => !near(t, wantT[i]))) bad.push('targets after continues ' + targets.map((t) => fmt(t, 2)).join(',') + ', expected ' + wantT.join(','));
  // Adaptive pacing off: nothing moves.
  s = start(false);
  feed(s, 0.95, 20, 0);
  TG.Entities.damage(s, { type: 'threat', kind: 'hoppet', id: 0, from: 'right' });
  for (let i = 0; i < 60; i++) TG.Game.step(C.DT);
  if (s.assist !== 1 || s.assistTarget !== 1) bad.push('with adaptive pacing off assist is ' + s.assist + ', target ' + s.assistTarget);
  // A lowered value saved by an earlier run is used only with adaptive pacing on. With it off the run
  // starts at 1 (as TG.UI starts runs, with no assist option), and recording that run keeps the saved value.
  TG.Save.recordRun({ difficulty: 'medium', score: 0, typing: { wpm: 0 }, assist: 0.72, adaptive: true });
  const on = TG.Game.newRun({ difficulty: 'medium', seed: 1, adaptive: true, tutorial: false });
  if (!near(on.assist, 0.72) || !near(on.timeScale, on.pace * 0.72)) bad.push('adaptive on: newRun started at assist ' + on.assist + ', not the saved 0.72');
  const off = TG.Game.newRun({ difficulty: 'medium', seed: 1, adaptive: false, tutorial: false });
  if (off.assist !== 1 || off.assistTarget !== 1 || off.timeScale !== off.pace) bad.push('adaptive off: newRun started at assist ' + off.assist + ' with a saved 0.72');
  TG.Game.pause();
  TG.Game.endRun();
  const offResult = TG.Game.state.result;
  if (!offResult || offResult.adaptive !== false || offResult.assist !== 1) bad.push('adaptive off: result.adaptive ' + (offResult && offResult.adaptive) + ', assist ' + (offResult && offResult.assist));
  TG.Save.recordRun(offResult);
  if (!near(TG.Save.assist('medium'), 0.72)) bad.push('recording an adaptive-off run changed the saved assist to ' + TG.Save.assist('medium'));
  return bad.length ? result(false, bad.slice(0, 6).join('; ')) : result(true, cases.length + ' evaluations, easing 0.05/s, no rise while a threat is live, counted removals, continues 0.85 to 0.60, off stays 1, off ignores and keeps a saved lower assist');
};

// --- level1-events ------------------------------------------------------------------------------
// The regression check of LEVEL2 13.5. One Level 1 run was recorded before the engine began to read from
// level data what Level 1 hard-codes: every boss:state, boss:attack, boss:throw, attack:spawn and
// threat:spawn, with the frame it was emitted on and its payload (for a threat or crate also the budget
// and the x it was given). The same run must give the same list, event for event, after every later
// change. A difference is a change in how Level 1 plays; it is explained before the file is recorded again.
function recordLevel1Events(run) {
  const events = [];
  const report = runBot({
    levelId: run.levelId, difficulty: run.difficulty, profile: run.profile, seed: run.seed, until: 'results', adaptive: false,
    setup: (TG) => {
      TG.Events.on('*', (payload, name) => {
        const fields = LEVEL1_EVENT_FIELDS[name];
        if (!fields) return;
        const row = { f: TG.Game.state.frame, name: name };
        for (const k of fields) row[k] = payload[k];
        if (name === 'threat:spawn') {
          row.budget = payload.entity.budget;
          row.x = payload.entity.x;
        }
        events.push(row);
      });
    }
  });
  return { report: report, events: events };
}

// The first place where two event lists differ, as text; null when they are the same.
function firstEventDifference(want, got) {
  const n = Math.min(want.length, got.length);
  for (let i = 0; i < n; i++) {
    const a = JSON.stringify(want[i]), b = JSON.stringify(got[i]);
    if (a !== b) return 'event ' + (i + 1) + ' of ' + want.length + ': recorded ' + a + ', now ' + b;
  }
  if (want.length === got.length) return null;
  return want.length > got.length ? 'the run ended after ' + got.length + ' of the ' + want.length + ' recorded events; the next one recorded is ' + JSON.stringify(want[n])
    : (got.length - want.length) + ' more events than the ' + want.length + ' recorded; the first is ' + JSON.stringify(got[n]);
}

CHECKS['level1-events'] = function () {
  let fixture;
  try {
    fixture = JSON.parse(fs.readFileSync(path.join(stubs.ROOT, LEVEL1_EVENTS_FILE), 'utf8'));
  } catch (e) {
    return result(false, LEVEL1_EVENTS_FILE + ' could not be read: ' + e.message);
  }
  const want = fixture.events;
  const names = Object.keys(LEVEL1_EVENT_FIELDS);
  const count = (name) => want.filter((e) => e.name === name).length;
  if (!Array.isArray(want) || want.length < 100 || names.some((n) => count(n) === 0)) {
    return result(false, LEVEL1_EVENTS_FILE + ' does not hold a whole run');
  }
  const now = recordLevel1Events(fixture.run);
  if (now.report.error || !now.report.finished) return result(false, 'the run did not finish: ' + now.report.error);
  const difference = firstEventDifference(want, now.events);
  if (difference) return result(false, difference);
  if (now.report.steps !== fixture.steps) return result(false, 'the run took ' + now.report.steps + ' steps, recorded ' + fixture.steps);
  // The comparison must be able to fail: one changed word, and one event left out.
  const changed = now.events.map((e, i) => (i === 0 ? Object.assign({}, e, { word: e.word + 'x' }) : e));
  if (firstEventDifference(want, changed) === null || firstEventDifference(want, now.events.slice(0, -1)) === null) {
    return result(false, 'the comparison is not sensitive');
  }
  const r = fixture.run;
  return result(true, want.length + ' events of the recorded level ' + r.levelId + ' ' + r.difficulty + ' ' + r.profile + ' run (seed ' + r.seed + ') in ' + fixture.steps +
    ' steps, the same again: ' + names.map((n) => count(n) + ' ' + n).join(', '));
};

// ===============================================================================================
// 6. The matrix, milestones, output and the command line
// ===============================================================================================

// Every extra check, with the milestone it belongs to. The first ten are CONTRACT 10.4 (the full
// list with `length`, `deterministic`, `no-presentation` and `words-by-difficulty`); the others are the
// WP-E acceptance items of CONTRACT 12 written as checks; `anchored-kinds`, `attack-windows` and `spawn-skin`
// are the groundwork of LEVEL2 13.1 in js/entities.js and js/boss.js, and `level1-events` is the regression
// check of LEVEL2 13.5; `new-kinds`, `skins` and `watch-freeze` are the checks of those names in LEVEL2 13.5, and
// `targets` holds the rows of its target table. A check marked perLevel is run once for each level played (LEVEL2 13.5, "Checks keyed by
// level"); the others are run once. `deterministic` and `no-presentation` are marked as well, though 13.5
// does not list them: each plays a whole run, and a level's own kinds are only met on that level. `skins`
// is marked too: it reads the data of one level. A check marked dataOnly reads the level's data and plays
// nothing, so --quick, which plays the first level only, still runs it for every level: a misspelled sprite
// name in a later level's file then fails the quick run as well.
const CHECK_LIST = [
  { name: 'level-valid', milestone: 1, perLevel: true, dataOnly: true },
  { name: 'counts', milestone: 1, perLevel: true },
  { name: 'skins', milestone: 1, perLevel: true, dataOnly: true },
  { name: 'jump-geometry', milestone: 1 },
  { name: 'fall-geometry', milestone: 1 },
  { name: 'duck-held', milestone: 1 },
  { name: 'input-translate', milestone: 1 },
  { name: 'input-buttons', milestone: 1 },
  { name: 'load-isolated', milestone: 1 },
  { name: 'sim-purity', milestone: 1 },
  { name: 'init-event', milestone: 1 },
  { name: 'no-dodge-actions', milestone: 2 },
  { name: 'spawn-onscreen', milestone: 2 },
  { name: 'anchored-kinds', milestone: 2 },
  { name: 'new-kinds', milestone: 2 },
  { name: 'typing-results', milestone: 2 },
  { name: 'crate-queue', milestone: 3 },
  { name: 'items-shape', milestone: 3, perLevel: true },
  { name: 'continue-restore', milestone: 3 },
  { name: 'no-type', milestone: 3 },
  { name: 'no-jump-bridge', milestone: 3, perLevel: true },
  { name: 'pause-deferred', milestone: 3 },
  { name: 'watch-freeze', milestone: 3 },
  { name: 'deterministic', milestone: 4, perLevel: true },
  { name: 'no-presentation', milestone: 4, perLevel: true },
  { name: 'words-by-difficulty', milestone: 4, perLevel: true },
  { name: 'length', milestone: 4, perLevel: true },
  { name: 'boss-fight', milestone: 4, perLevel: true },
  { name: 'boss-continue', milestone: 4, perLevel: true },
  { name: 'result-rank', milestone: 4 },
  { name: 'attack-windows', milestone: 4 },
  { name: 'spawn-skin', milestone: 4 },
  { name: 'tutorial-slowdown', milestone: 5 },
  { name: 'adaptive-pacing', milestone: 5 },
  { name: 'level1-events', milestone: 6 },
  { name: 'targets', milestone: 6, perLevel: true }
];

const MILESTONES = {
  1: { what: 'input queue and translate; player physics, jump, slide, support tests, fall and rescue; level build and validation; hazards and windows; nextAction', profiles: [], until: null },
  2: { what: 'spawning, word picking, budgets, waiting at the edge, movement paths, contact, typing results, scoring, lives, lifeLost; section 1', profiles: ['target', 'exact'], until: 'checkpoint1' },
  3: { what: 'sections 2 and 3, crates and power-ups, ink drops, extra lives, shield for a key streak, checkpoints, game over and continue, plank bridges, pause and deferred pause', profiles: ['target', 'fast'], until: 'boss' },
  4: { what: 'the boss: intro, volleys, attacks, weak-point words, phases, finisher, defeat, levelComplete, result and rank', profiles: ['target', 'fast', 'exact'], until: 'results' },
  5: { what: 'adaptive pacing and the tutorial slow-down', profiles: ['floor'], until: 'results' },
  6: { what: 'tuning within the limits of CONTRACT 12.1 and the Tier 2 items', profiles: PROFILES, until: 'results' }
};

function passCondition(profile, r) {
  if (r.error) return false;
  if (!r.finished) return false;
  if (profile === 'floor') return r.continues <= 3;
  if (profile === 'target') return r.continues === 0;
  if (profile === 'fast') return r.continues === 0 && r.damageTypable === 0;
  if (profile === 'exact') return Math.abs(r.reportedWpm - r.wpm) <= 0.1 * r.wpm && r.reportedAccuracy === 1;
  return true;
}

function failReason(profile, r) {
  if (r.error) return r.error;
  if (!r.finished) return 'did not reach ' + r.until;
  if (profile === 'floor') return r.continues + ' continues (at most 3)';
  if (profile === 'target') return r.continues + ' continues (0 allowed)';
  if (profile === 'fast') return r.continues + ' continues, ' + r.damageTypable + ' damage from typable threats (0 allowed)';
  if (profile === 'exact') return 'reported WPM ' + fmt(r.reportedWpm, 1) + ' vs ' + r.wpm + ', accuracy ' + fmt(r.reportedAccuracy, 3);
  return '';
}

function runLine(r, status) {
  return 'RUN  level=' + r.levelId + ' difficulty=' + r.difficulty + ' profile=' + r.profile + ' seed=' + r.seed + ' wpm=' + r.wpm + ' acc=' + r.accuracy +
    ' adaptive=' + (r.adaptive ? 'on' : 'off') + ' until=' + r.until + ' result=' + status + ' finished=' + (r.finished ? 1 : 0) +
    ' time=' + fmt(r.time, 1) + ' score=' + r.score + ' lives=' + r.lives + ' continues=' + r.continues +
    ' dmgTyp=' + r.damageTypable + ' dmgOther=' + r.damageOther + ' repWpm=' + fmt(r.reportedWpm, 1) +
    ' repAcc=' + fmt(r.reportedAccuracy, 3) + ' assist=' + fmt(r.assistEnd, 2);
}

// The line --measure prints after a RUN line: what the target table of LEVEL2 13.5 is measured from.
//   u               mean window use: age / budget of each threat word typed, U_MISS for each that reached Pip
//   fight           seconds from boss:enter to boss:defeat
//   livesLost, minLives   lives lost in the run; the fewest held at any moment
//   liveAtFlag, cratesAtFlag   threats, and crates, still live or never spawned when Pip reached the arena flag
//   pastFlag        threats of the level that were due at or past the arena flag when they appeared
//   watch           for each watch crate that appeared, its trigger tile and the threat words live when its
//                   word was cleared, or `missed` when it drifted off
//   dangles, dangleNearest   dangles spawned; the least distance from an anchor to a hazard to duck, px
//   startAssist     the assist the run started at (assist at the end is on the RUN line)
function measureLine(r) {
  const watch = r.watch.map((w) => w.tile + ':' + (w.live === null ? 'missed' : w.live)).join(',');
  return 'MEASURE level=' + r.levelId + ' difficulty=' + r.difficulty + ' profile=' + r.profile + ' seed=' + r.seed +
    ' u=' + fmt(r.meanU, 3) + ' fight=' + fmt(r.fightTime, 1) + ' livesLost=' + r.livesLost + ' minLives=' + r.minLives +
    ' liveAtFlag=' + r.liveAtFlag + ' cratesAtFlag=' + r.cratesAtFlag + ' pastFlag=' + r.pastFlag + ' watch=' + (watch || '-') +
    ' dangles=' + r.dangles + ' dangleNearest=' + fmt(r.dangleNearest, 1) + ' startAssist=' + fmt(r.startAssist, 2);
}

function parseArgs(argv) {
  const o = {};
  const bad = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--difficulty') o.difficulty = next();
    else if (a === '--profile') o.profile = next();
    else if (a === '--wpm') o.wpm = Number(next());
    else if (a === '--accuracy') o.accuracy = Number(next());
    else if (a === '--react') o.react = Number(next());
    else if (a === '--seed') o.seed = Number(next());
    else if (a === '--level') o.level = Number(next());
    else if (a === '--adaptive') o.adaptive = next();
    else if (a === '--until') o.until = next();
    else if (a === '--check') o.check = next();
    else if (a === '--milestone') o.milestone = Number(next());
    else if (a === '--verbose') o.verbose = true;
    else if (a === '--quick') o.quick = true;
    else if (a === '--measure') o.measure = true;
    else if (a === '--help') o.help = true;
    else bad.push(a);
  }
  if (o.difficulty !== undefined && DIFFICULTIES.indexOf(o.difficulty) === -1) bad.push('--difficulty ' + o.difficulty);
  if (o.profile !== undefined && PROFILES.indexOf(o.profile) === -1) bad.push('--profile ' + o.profile);
  if (o.until !== undefined && UNTILS.indexOf(o.until) === -1) bad.push('--until ' + o.until);
  if (o.adaptive !== undefined && o.adaptive !== 'on' && o.adaptive !== 'off') bad.push('--adaptive ' + o.adaptive);
  if (o.check !== undefined && !CHECKS[o.check]) bad.push('--check ' + o.check);
  if (o.milestone !== undefined && !MILESTONES[o.milestone]) bad.push('--milestone ' + o.milestone);
  if (o.seed !== undefined && !(Number.isInteger(o.seed))) bad.push('--seed');
  if (o.level !== undefined && !(Number.isInteger(o.level) && o.level >= 1)) bad.push('--level');
  const custom = o.wpm !== undefined || o.accuracy !== undefined || o.react !== undefined;
  if (custom && (!(o.wpm > 0) || !(o.accuracy > 0 && o.accuracy <= 1) || !(o.react >= 0) || !o.difficulty)) {
    bad.push('--wpm, --accuracy and --react go together, with --difficulty');
  }
  o.custom = custom;
  return { opts: o, bad: bad };
}

const OPTIONS_LINE = 'Options: --difficulty easy|medium|hard --profile floor|target|fast|exact --wpm N --accuracy A --react R ' +
  '--seed N --level N --quick --adaptive on|off --until checkpoint1|checkpoint2|boss|results --check NAME --milestone N --measure --verbose --help';

function main(argv) {
  const { opts, bad } = parseArgs(argv);
  if (opts.help) {
    console.log(OPTIONS_LINE);
    return 0;
  }
  if (bad.length) {
    console.log('ERROR unknown or invalid options: ' + bad.join(', '));
    console.log(OPTIONS_LINE);
    return 2;
  }
  if (opts.level !== undefined && LEVELS.indexOf(opts.level) === -1) {
    console.log('LEVEL ' + opts.level + ' NOT BUILT: level ' + opts.level + ' is not built yet. The harness plays level ' + LEVELS.join(' and level ') + '.');
    console.log('SUMMARY runs=0 passed=0 checks=0 checksPassed=0 result=NOT_BUILT');
    return 1;
  }
  // One level with --level, the first with --quick, every level otherwise.
  const levels = opts.level !== undefined ? [opts.level] : (opts.quick ? LEVELS.slice(0, 1) : LEVELS);

  // What to run.
  let profiles = PROFILES;
  let until = opts.until || 'results';
  let checks = CHECK_LIST.map((c) => c.name);
  let runsWanted = true;
  if (opts.milestone) {
    const m = MILESTONES[opts.milestone];
    console.log('MILESTONE ' + opts.milestone + ': ' + m.what);
    if (opts.milestone > MILESTONES_BUILT) {
      console.log('MILESTONE ' + opts.milestone + ' NOT BUILT: this milestone belongs to the second WP-E engineer (CONTRACT 13.3). Built so far: milestones 1 to ' + MILESTONES_BUILT + '.');
      console.log('SUMMARY runs=0 passed=0 checks=0 checksPassed=0 result=NOT_BUILT');
      return 1;
    }
    profiles = m.profiles;
    until = opts.until || m.until || 'results';
    // Milestone 6 is the whole acceptance run: the full matrix and every extra check.
    checks = CHECK_LIST.filter((c) => opts.milestone === 6 || c.milestone === opts.milestone).map((c) => c.name);
    runsWanted = profiles.length > 0;
  } else if (MILESTONES_BUILT < 6 && !opts.check && !opts.custom && until === 'results') {
    console.log('NOTE milestones ' + (MILESTONES_BUILT + 1) + ' to 6 are not built yet (second WP-E engineer); runs to "results" cannot finish until the boss is built.');
  }
  if (opts.check) {
    checks = [opts.check];
    runsWanted = false;
  }
  if (opts.profile) profiles = profiles.indexOf(opts.profile) !== -1 ? [opts.profile] : [];
  const difficulties = opts.difficulty ? [opts.difficulty] : DIFFICULTIES;
  const seeds = opts.seed !== undefined ? [opts.seed] : SEEDS;
  const filtered = !!(opts.difficulty || opts.profile || opts.seed !== undefined);

  let runs = 0, runsPassed = 0, checksRun = 0, checksPassed = 0, fatal = false;
  // One ctx for each level played; a check that is not about one level gets the first.
  const all = {};
  const ctxs = levels.map((levelId) => (all[levelId] = { until: until, levelId: levelId, runs: {}, all: all }));

  if (opts.custom) {
    const r = runBot({ levelId: levels[0], difficulty: opts.difficulty, wpm: opts.wpm, accuracy: opts.accuracy, react: opts.react,
      seed: opts.seed !== undefined ? opts.seed : 1, until: until, profile: 'custom',
      adaptive: opts.adaptive ? opts.adaptive === 'on' : false, verbose: opts.verbose, printLog: opts.verbose });
    console.log(runLine(r, 'INFO') + (r.error ? ' error="' + clip(r.error) + '"' : ''));
    if (opts.measure) console.log(measureLine(r));
    console.log('SUMMARY runs=1 passed=0 checks=0 checksPassed=0 result=INFO');
    return r.fatal ? 2 : 0;
  }

  for (const ctx of runsWanted ? ctxs : []) {
    const played = {};
    for (const d of difficulties) {
      for (const profile of profiles) {
        for (const seed of seeds) {
          const adaptive = opts.adaptive ? opts.adaptive === 'on' : PROFILE_ADAPTIVE[profile];
          const r = runBot({ levelId: ctx.levelId, difficulty: d, profile: profile, seed: seed, until: until, adaptive: adaptive, verbose: opts.verbose, printLog: false });
          const pass = passCondition(profile, r);
          runs++;
          if (pass) runsPassed++;
          if (r.fatal) fatal = true;
          console.log(runLine(r, pass ? 'PASS' : 'FAIL') + (pass ? '' : ' reason="' + clip(failReason(profile, r)) + '"'));
          if (opts.measure) console.log(measureLine(r));
          if (opts.verbose) for (const line of r.log) console.log(line);
          (played[profile] = played[profile] || []).push(r);
        }
      }
    }
    // The checks that read whole runs of a profile take the matrix's own (profileRuns), when it played all
    // of them as the profile has them.
    if (!filtered && !opts.adaptive) for (const profile of Object.keys(played)) ctx.runs[profile] = played[profile];
  }

  // With --quick, the levels that are not played: each still gets its dataOnly checks.
  const unplayed = opts.quick && opts.level === undefined ? LEVELS.slice(1).map((levelId) => ({ until: until, levelId: levelId, runs: {}, all: all })) : [];

  for (const name of checks) {
    const entry = CHECK_LIST.find((c) => c.name === name);
    const perLevel = !!(entry && entry.perLevel);
    for (const ctx of perLevel ? (entry.dataOnly ? ctxs.concat(unplayed) : ctxs) : ctxs.slice(0, 1)) {
      const label = 'CHECK name=' + name + (perLevel ? ' level=' + ctx.levelId : '');
      let r;
      try {
        r = CHECKS[name](ctx);
      } catch (e) {
        r = result(false, 'exception: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
      }
      if (r === null) continue;
      if (r.skip) {
        console.log(label + ' result=SKIP detail="' + clip(r.detail) + '"');
        continue;
      }
      checksRun++;
      if (r.pass) checksPassed++;
      console.log(label + ' result=' + (r.pass ? 'PASS' : 'FAIL') + (r.detail ? ' detail="' + clip(r.detail, 400) + '"' : ''));
    }
  }

  const ok = runs === runsPassed && checksRun === checksPassed;
  console.log('SUMMARY runs=' + runs + ' passed=' + runsPassed + ' checks=' + checksRun + ' checksPassed=' + checksPassed + ' result=' + (ok ? 'PASS' : 'FAIL'));
  if (fatal) return 2;
  return ok ? 0 : 1;
}

module.exports = { runBot, CONSTANT_OVERRIDES, EXPECTED_COUNTS, SIM_FILES, CHECKS, MILESTONES_BUILT };

if (require.main === module) {
  let code;
  try {
    code = main(process.argv.slice(2));
  } catch (e) {
    console.log('ERROR the harness could not run: ' + (e && e.stack ? e.stack : e));
    code = 2;
  }
  process.exitCode = code;
}
