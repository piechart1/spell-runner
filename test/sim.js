// test/sim.js
// SPELL RUNNER headless harness and test bot (WP-E). CONTRACT 10.2 to 10.4 and 12 (WP-E).
//
//   node test/sim.js                       the acceptance matrix (36 runs) and every extra check
//   node test/sim.js --milestone N         the runs and checks of WP-E milestone N (CONTRACT 12)
//   node test/sim.js --check NAME          one extra check, no matrix runs
//   node test/sim.js --difficulty medium --profile target --seed 1 --until boss --verbose
//   node test/sim.js --difficulty easy --wpm 12 --accuracy 0.9 --react 1.2   (one custom run, INFO)
//
// As a module:  const { runBot } = require('./sim');  runBot({ difficulty, wpm, accuracy, react, ... })
//
// File layout:
//   1. tuning tables (CONSTANT_OVERRIDES, EXPECTED_COUNTS) and settings
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

// Threat words per section (DESIGN 11.2) as amended by the "Tuning changes" list of level1.js.
const EXPECTED_COUNTS = { easy: [11, 14, 14], medium: [12, 16, 19], hard: [18, 22, 20] };

// DESIGN 11.2 as written. Never changed: the `counts` check compares EXPECTED_COUNTS with it.
const DESIGN_COUNTS = { easy: [11, 14, 14], medium: [12, 16, 19], hard: [18, 22, 20] };
const DESIGN_CRATES = 7;

// The highest WP-E milestone that is built. Milestones above it report NOT BUILT.
const MILESTONES_BUILT = 6;

const SIM_FILES = [
  'js/core.js', 'js/words.js', 'js/typing.js', 'js/input.js', 'js/entities.js', 'js/level.js',
  'js/boss.js', 'js/levels/level1.js', 'js/game.js'
];
const WPE_FILES = ['js/input.js', 'js/entities.js', 'js/level.js', 'js/boss.js', 'js/levels/level1.js', 'js/game.js'];

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
//   event-names    every event has a name in TG.Events.NAMES and the payload fields of section 8
//   first-letters  no two live typables share a first letter
//   active-cap     live threats never exceed config.maxActive for the section
//   word-pool      every word in threat:spawn, boss:weakopen and boss:finisher is in the pools
//   no-dodge       a threat that reaches t >= 1 unfinished is removed in the same step with
//                  threat:hit or threat:bounce; contact never happens before t = 1
// Added by WP-E for the fairness rules of DESIGN 4.1:
//   budget         every new word's budget is max(base, queue, spacing) (and the boulder minimum),
//                  recomputed independently from the state at the moment of the spawn; a longer
//                  budget is allowed only when the keep-clear rule moved the arrival to a zone's end
//   keep-clear     no threat is scheduled to arrive inside a hazard's input window or its margin
//   scoring        every word:clear scores DESIGN 8.3 (clean, quick, multiplier, quill, assist), and so
//                  do the weak-point, finisher and defeat scores of the boss
//   console        nothing is written to console.error or console.warn during the run
// Added by the second WP-E engineer for the fairness rules of the boss (DESIGN 11.6):
//   announce       every attack:spawn follows a boss:attack of the same kind with telegraph > 0,
//                  emitted in an earlier step and at least that telegraph span earlier on the world
//                  clock (config.boss.telegraph for the first attack of a round, doubleGap for the second)
//   weak-window    every weak-point window is exposeFactor x the base budget of its word, plus
//                  exposeBonus when every entry of the volley was typed (world seconds, via boss.windowWs)

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
    this.announced = [];               // boss:attack for shock and pick not yet followed by attack:spawn
    this.volleyHits = 0;               // volley entries typed since the volley began
    this.volleySize = 0;
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
    }

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
    const impactX = e.kind === 'boulder' ? e.anchorX - e.contact : p.x + C.RUN_SPEED * e.budget;
    const m = config.hazardMargin * config.pace * C.RUN_SPEED;
    let atZoneEnd = false;
    for (const h of s.level.hazards) {
      if (h.bridged) continue;
      const zs = h.winStart - m, ze = h.x + h.w + m;
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
    if (this.error) return;
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
  // files, maxSeconds, verbose), plus profile (floor | target | fast | exact | custom), levelId and
  // setup (a function called with TG before newRun, used by the checks).
  constructor(opts) {
    this.opts = opts;
    this.difficulty = opts.difficulty || 'medium';
    this.seed = typeof opts.seed === 'number' ? opts.seed : 1;
    this.until = opts.until || 'results';
    this.verbose = !!opts.verbose;
    this.maxSeconds = typeof opts.maxSeconds === 'number' ? opts.maxSeconds : DEFAULT_MAX_SECONDS;
    this.profile = profileName(opts);
    this.lines = [];
    this.steps = 0;
    this.done = false;
    this.report = {
      difficulty: this.difficulty, profile: this.profile, seed: this.seed,
      wpm: opts.wpm, accuracy: opts.accuracy, react: opts.react, adaptive: null,
      until: this.until, finished: false, words: [], time: 0, steps: 0, score: 0,
      lives: 0, livesLost: 0, continues: 0, damageTypable: 0, damageOther: 0,
      reportedWpm: 0, reportedAccuracy: 0, assistEnd: 0, rank: null, error: null, fatal: false
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
      const levelId = opts.levelId !== undefined ? opts.levelId : 1;
      const config = TG.Difficulty.resolve(this.difficulty, TG.Levels[levelId].tune);
      const profileKey = this.profile === 'exact' || this.profile === 'custom' ? 'target' : this.profile;
      const adaptive = typeof opts.adaptive === 'boolean' ? opts.adaptive : !!PROFILE_ADAPTIVE[this.profile];
      TG.Game.newRun({ difficulty: this.difficulty, seed: this.seed, levelId: levelId, adaptive: adaptive, assist: 1, tutorial: config.tutorialAlways });
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
    if (this.checker) r.words = this.checker.words.slice();
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
// Each check returns { pass: boolean, detail: string, skip?: boolean }.

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
// With `empty: true` it has no gaps or hazards at all. `tune` is its tune block.
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
    gaps: o.empty ? [] : [{ x: 20, w: 1 }, { x: 40, w: 2 }],
    hazards: o.empty ? [] : [
      { x: 100, kind: 'bramble' },
      { x: 120, kind: 'branch' },
      { x: 140, kind: 'beehive' },
      { x: 180, kind: 'arch', w: 3 }
    ],
    spawns: [],
    ink: [],
    decor: [],
    boss: { kind: 'baron', speech: 'TEST' }
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
CHECKS['level-valid'] = function () {
  const env = simEnv();
  const problems = env.TG.Level.validate(env.TG.Levels[1]);
  // Each rule must also be able to fail: a few broken copies of the level.
  const TG = env.TG;
  const broken = [
    ['V2', (d) => { d.gaps.push({ x: 108, w: 1 }); }],
    ['V3', (d) => { d.hazards.push({ x: 110, kind: 'branch' }); }],
    ['V4', (d) => { d.gaps.push({ x: 260, w: 1 }); }],
    ['V5', (d) => { d.spawns.push({ x: 30, kind: 'dragon' }); }],
    ['V6', (d) => { d.spawns[2].tutorial = false; }],
    ['V7', (d) => { d.spawns.push({ x: 860, kind: 'hoppet' }); }],
    ['V8', (d) => { d.ink.push({ x: 104, shape: 'row', n: 4, step: 1 }); }],
    ['V9', (d) => { d.hazards.find((h) => h.kind === 'arch').w = 2; }],
    ['V10', (d) => { d.tune = { all: { lives: 9 } }; }],
    ['V11', (d) => { delete d.sections[1].music.tempo; }],
    ['V1', (d) => { d.checkpoints = [0, 256, 880]; }]
  ];
  const missed = [];
  for (const [code, change] of broken) {
    const copy = JSON.parse(JSON.stringify(TG.Levels[1]));
    change(copy);
    const found = TG.Level.validate(copy);
    if (!found.some((p) => p.indexOf(code + ':') === 0)) missed.push(code);
  }
  if (problems.length > 0) return result(false, problems.join('; '));
  if (missed.length > 0) return result(false, 'a broken level passed rule ' + missed.join(', '));
  return result(true, '11 rules, each also shown to fail on a broken copy');
};

// --- counts -------------------------------------------------------------------------------------
CHECKS['counts'] = function () {
  const env = simEnv();
  const TG = env.TG;
  const data = TG.Levels[1];
  const problems = [];
  const threatKinds = Object.keys(TG.Entities.KINDS).filter((k) => TG.Entities.KINDS[k].type === 'threat');
  for (const d of DIFFICULTIES) {
    const counts = [0, 0, 0];
    for (const sp of data.spawns) {
      if (threatKinds.indexOf(sp.kind) === -1 || !TG.Difficulty.includes(d, sp.min)) continue;
      for (let i = 0; i < data.sections.length; i++) {
        if (sp.x >= data.sections[i].from && sp.x < data.sections[i].to) counts[i]++;
      }
    }
    if (JSON.stringify(counts) !== JSON.stringify(EXPECTED_COUNTS[d])) {
      problems.push(d + ' has ' + counts.join('/') + ', EXPECTED_COUNTS ' + EXPECTED_COUNTS[d].join('/'));
    }
    for (let i = 0; i < 3; i++) {
      const limit = Math.ceil(0.25 * DESIGN_COUNTS[d][i]);
      if (Math.abs(EXPECTED_COUNTS[d][i] - DESIGN_COUNTS[d][i]) > limit) {
        problems.push(d + ' section ' + (i + 1) + ': EXPECTED_COUNTS ' + EXPECTED_COUNTS[d][i] + ' is more than ' + limit + ' from DESIGN ' + DESIGN_COUNTS[d][i]);
      }
    }
  }
  const crates = data.spawns.filter((sp) => sp.kind === 'crate');
  if (crates.length !== DESIGN_CRATES) problems.push(crates.length + ' crates, expected ' + DESIGN_CRATES);
  const powers = crates.map((c) => c.power).sort().join(',');
  const expectedPowers = ['blast', 'cap', 'cap', 'hourglass', 'quill', 'shield', 'shield'].join(',');
  if (powers !== expectedPowers) problems.push('crate powers ' + powers + ', expected ' + expectedPowers);
  if (crates.some((c) => !TG.Difficulty.includes('easy', c.min))) problems.push('a crate is not on every difficulty');
  return problems.length ? result(false, problems.join('; ')) : result(true, 'threats ' + DIFFICULTIES.map((d) => d + ' ' + EXPECTED_COUNTS[d].join('/')).join(', ') + '; 7 crates');
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
  const kinds = ['dawdle', 'buzzle', 'hoppet', 'boulder', 'swoop', 'truffle', 'digby'];
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
    for (const kind of ['dawdle', 'hoppet', 'buzzle', 'truffle', 'digby']) {
      // pace 1 and perChar 0: the budget is exactly `react` world seconds.
      const s = startTestRun(TG, SCALES[1], { empty: true, tune: { medium: { react: B, perChar: 0 } } });
      const e = TG.Entities.spawn(s, { kind: kind });
      if (!e) { bad.push(kind + ' B=' + B + ': spawn failed'); continue; }
      if (Math.abs(e.budget - B) > 1e-9) { bad.push(kind + ': budget ' + e.budget + ', expected ' + B); continue; }
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
  return bad.length ? result(false, bad.join('; ')) : result(true, 'dawdle, hoppet, buzzle, truffle on screen at spawn for 2, 6 and 12 ws; digby underground until t = 0.85');
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
CHECKS['items-shape'] = function () {
  return withSession({ difficulty: 'medium', profile: 'target', until: 'checkpoint1' }, (session, TG) => {
    const bad = [];
    const s = TG.Game.state;
    const shape = (it) => typeof it.id === 'string' && typeof it.x === 'number' && typeof it.y === 'number' && it.w === 8 && it.h === 8 &&
      Object.keys(it).sort().join(',') === 'h,id,w,x,y';
    if (!s.items.every(shape)) bad.push('an item does not have the shape of 5.14');
    const counts = {};
    for (const d of DIFFICULTIES) {
      const env2 = simEnv();
      env2.TG.Game.newRun({ difficulty: d, seed: 1, adaptive: false, assist: 1, tutorial: false });
      counts[d] = env2.TG.Game.state.items.length;
    }
    if (counts.easy !== 150 || counts.medium !== 153 || counts.hard !== 153) bad.push('ink drops ' + JSON.stringify(counts) + ', expected 150 / 153 / 153');
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
    return bad.length ? result(false, bad.join('; ')) : result(true, 'items have the 5.14 shape; ' + checked + ' collected drops left state.items in the same step; 150 / 153 / 153 drops');
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
// the gap at tile 106; the first gap that Pip falls into config.bridgeAfterFalls times is bridged from
// then on, hazard:bridge is emitted once for it, and after a continue that restarts before it Pip runs
// across it.
// The bot does not type either. With typing on, Easy's lives (the checkpoint top-up to 3, extra lives
// from score and Red caps, shield charges that absorb the bramble hits) carry Pip through all nine
// open gaps without a game over, so no gap is ever fallen into twice. Without typing the first game
// over comes in section 1, and the gap that is bridged is the one at tile 106.
CHECKS['no-jump-bridge'] = function () {
  return withSession({ difficulty: 'easy', profile: 'target', noJump: true, noType: true, until: 'results', maxSeconds: 1200 }, (session, TG) => {
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
    const first = s.level.hazards.find((h) => h.kind === 'gap' && h.x === 106 * 16);
    if (falls[0] !== first.id) bad.push('the first fall was at ' + falls[0] + ', not at the gap at tile 106 (' + first.id + ')');
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
      : result(true, 'first fall at tile 106; the gap at tile ' + tile + ' was fallen into ' + need + ' time(s), bridged once (' + bridges.length + ' bridges in all), and crossed after a continue');
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

// --- checks that need full runs (milestone 4) ---------------------------------------------------

function targetRuns(ctx) {
  // Reuses the target runs of the matrix when they were run with the same stop point.
  if (!ctx.targetRuns) {
    ctx.targetRuns = [];
    for (const d of DIFFICULTIES) {
      for (const seed of SEEDS) {
        ctx.targetRuns.push(runBot({ difficulty: d, profile: 'target', seed: seed, until: ctx.until, adaptive: false }));
      }
    }
  }
  return ctx.targetRuns;
}

CHECKS['deterministic'] = function (ctx) {
  const a = runBot({ difficulty: 'medium', profile: 'target', seed: 1, until: ctx.until, adaptive: false });
  const b = runBot({ difficulty: 'medium', profile: 'target', seed: 1, until: ctx.until, adaptive: false });
  if (a.error || b.error) return result(false, a.error || b.error);
  const same = a.steps === b.steps && a.score === b.score && a.time === b.time && a.words.join() === b.words.join();
  return same ? result(true, 'steps ' + a.steps + ', score ' + a.score + ', time ' + fmt(a.time, 3))
    : result(false, 'steps ' + a.steps + '/' + b.steps + ', score ' + a.score + '/' + b.score + ', time ' + a.time + '/' + b.time);
};

CHECKS['no-presentation'] = function (ctx) {
  const r = runBot({ difficulty: 'medium', profile: 'target', seed: 1, until: ctx.until, adaptive: false, files: SIM_FILES });
  return r.finished && !r.error ? result(true, 'finished with ' + SIM_FILES.length + ' files') : result(false, r.error || 'not finished');
};

CHECKS['words-by-difficulty'] = function (ctx) {
  const runs = targetRuns(ctx);
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
  return bad.length ? result(false, bad.join('; ')) : result(true, DIFFICULTIES.map((d) => d + ' ' + sets[d].size).join(', ') + ' distinct words, none shared');
};

CHECKS['length'] = function (ctx) {
  if (ctx.until !== 'results') return { pass: true, skip: true, detail: 'skipped with --until' };
  const bad = [];
  const times = [];
  for (const r of targetRuns(ctx)) {
    times.push(r.difficulty + ' ' + fmt(r.time, 0));
    if (!r.finished || r.time < 240 || r.time > 420) bad.push(r.difficulty + ' seed ' + r.seed + ' ' + fmt(r.time, 1) + ' s' + (r.finished ? '' : ' (not finished)'));
  }
  return bad.length ? result(false, bad.join('; ')) : result(true, times.join(', '));
};

// --- boss-fight ---------------------------------------------------------------------------------
// One target run per difficulty, traced from the arena to the results screen: the order of the boss
// states (CONTRACT 5.7), volley contents per phase (the minion in phase 3 is Tier 2), attacks per phase
// (the double attack is Tier 2), the launch gap, rocks in flight, health and phases, scores, the
// finisher at a quarter of the speed with nothing live, the defeat, levelComplete and the result.
const BOSS_NEXT = {
  intro: ['volley'], volley: ['telegraph'], telegraph: ['attack'], attack: ['taunt'],
  taunt: ['recoil', 'laugh'], recoil: ['volley', 'transition', 'finisher'], laugh: ['volley'],
  transition: ['volley', 'transition'], finisher: ['defeated'], defeated: []
};

function expectedVolley(cfg, phase) {
  const n = cfg.boss.rocks[phase - 1];
  const list = [];
  for (let i = 0; i < n; i++) list.push(phase >= 2 && i === 1 ? 'rockhigh' : 'rock');
  if (phase === 3 && cfg.boss.minion) list[n - 1] = 'minion';
  return list;
}

function traceBossFight(difficulty, profile, seed) {
  return withSession({ difficulty: difficulty, profile: profile, seed: seed, until: 'results' }, (session, TG) => {
    const C = TG.C;
    const cfg = TG.Game.state.config;
    const b = cfg.boss;
    const errs = [];
    const rounds = [];
    const hits = [];
    const phases = [];
    let round = null;
    let prevState = null;
    let lastLaunch = null;
    let defeats = 0, clears = 0, finisherWord = null, arenaAt = null;
    TG.Events.on('*', (p, name) => {
      const s = TG.Game.state;
      if (name === 'boss:enter') arenaAt = s.time;
      if (!s.boss) return;
      if (name === 'boss:state') {
        if (prevState && BOSS_NEXT[prevState].indexOf(p.state) === -1) errs.push('state ' + prevState + ' -> ' + p.state);
        prevState = p.state;
        if (p.state === 'volley') {
          round = { phase: p.phase, volley: [], attacks: [] };
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
    while (session.tick()) {
      const s = TG.Game.state;
      if (!s.boss) continue;
      const live = s.entities.filter((e) => !e.dead && e.type === 'threat').length;
      if (live > b.inFlight) errs.push(live + ' rocks in flight, at most ' + b.inFlight);
      if (s.boss.state === 'finisher' && s.screen === 'boss') {
        if (s.entities.some((e) => !e.dead)) errs.push('something is live during the finisher');
        if (s.finisherScale !== C.FINISHER_SCALE) errs.push('finisherScale ' + s.finisherScale + ' during the finisher');
      }
      if (s.screen === 'levelComplete') {
        if (riseStart === null) riseStart = s.boss.rise;
        riseEnd = s.boss.rise;
        if (s.finisherScale !== 1) errs.push('finisherScale ' + s.finisherScale + ' on levelComplete');
      }
    }
    const s = TG.Game.state;
    if (session.report.error) errs.push(session.report.error);

    // Volleys and attacks.
    let singles = [];
    for (const r of rounds) {
      const want = expectedVolley(cfg, r.phase);
      if (r.volley.join() !== want.join()) errs.push('phase ' + r.phase + ' volley ' + r.volley.join('+') + ', expected ' + want.join('+'));
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
    // Health, phases, finisher, defeat.
    const wantHits = [];
    for (let h = b.health - 1; h >= 0; h--) wantHits.push(h);
    if (hits.join() !== wantHits.join()) errs.push('health went ' + hits.join(',') + ', expected ' + wantHits.join(','));
    if (phases.join() !== '2,3') errs.push('phases ' + phases.join(','));
    if (!finisherWord || finisherWord.length < b.finisherLen[0] || finisherWord.length > b.finisherLen[1]) errs.push('finisher word ' + finisherWord);
    if (defeats !== 1 || clears !== 1) errs.push(defeats + ' boss:defeat and ' + clears + ' level:clear');
    if (riseStart !== 0 || !(riseEnd > 39)) errs.push('the Baron did not sink: rise ' + riseStart + ' -> ' + riseEnd);
    if (s.screen !== 'results' || !s.result || s.result.cleared !== true || s.run.cleared !== true) errs.push('no cleared result');
    const minions = rounds.filter((r) => r.volley.indexOf('minion') !== -1).length;
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
function inFlightUntyped(difficulty) {
  return withSession({ difficulty: difficulty, profile: 'target', seed: 1, until: 'results', maxSeconds: 1500 }, (session, TG) => {
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

CHECKS['boss-fight'] = function () {
  const flights = DIFFICULTIES.map(inFlightUntyped);
  const out = DIFFICULTIES.map((d) => traceBossFight(d, 'target', 1)).concat(flights);
  const failed = out.filter((r) => !r.pass);
  if (!flights.some((r) => r.reached)) failed.push({ detail: 'the in-flight limit was never reached: ' + flights.map((r) => r.detail).join(', ') });
  return failed.length ? result(false, failed.map((r) => r.detail).join(' | ')) : result(true, out.map((r) => r.detail).join('; '));
};

// --- boss-continue ------------------------------------------------------------------------------
// The level can always be completed. A medium run reaches phase 2, stops typing and loses every life
// in the arena; missed weak-point windows cost no life. After continueRun the Baron is back at the
// start of phase 2 after the short intro, Pip is at the boss checkpoint with the starting lives and the
// banked score, and the fight is then won. Restart from checkpoint on the pause menu does the same.
CHECKS['boss-continue'] = function () {
  const first = withSession({ difficulty: 'medium', profile: 'target', seed: 2, until: 'results', maxSeconds: 1500 }, (session, TG) => {
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
          state: s.boss.state, intro: s.boss.introTime, live: s.entities.filter((e) => !e.dead).length, section: s.section };
      }
    });
    while (!after && session.tick()) { /* run to the game over and the continue */ }
    if (!over || !after) return result(false, 'no game over and continue in the arena: ' + session.report.error);
    const cfg = TG.Game.state.config;
    if (over.cp.index !== 3 || over.cp.bossPhase !== 2 || over.phase !== 2) bad.push('game over at checkpoint ' + over.cp.index + ', stored phase ' + over.cp.bossPhase + ', phase ' + over.phase);
    if (weakMisses < 1) bad.push('no weak-point window ran out');
    if (Object.keys(causes).some((k) => k !== 'threat' && k !== 'attack')) bad.push('lives lost to ' + JSON.stringify(causes));
    if (after.screen !== 'bossIntro' || after.state !== 'intro' || after.intro !== C.BOSS_INTRO_SHORT) bad.push('after the continue: ' + after.screen + ', ' + after.state + ', intro ' + after.intro);
    if (after.phase !== 2 || after.health !== TG.Boss.phaseStartHealth(cfg, 2)) bad.push('the Baron restarted in phase ' + after.phase + ' with health ' + after.health);
    if (after.x !== over.cp.x || after.lives !== cfg.lives || after.score !== over.cp.score || after.live !== 0 || after.section !== 3) {
      bad.push('Pip at ' + after.x + ' (checkpoint ' + over.cp.x + '), lives ' + after.lives + ', score ' + after.score + ' (banked ' + over.cp.score + '), ' + after.live + ' live, section ' + after.section);
    }
    // Typing again, the fight is won.
    session.bot.noType = false;
    const t0 = TG.Game.state.time;
    const r = session.run();
    const s = TG.Game.state;
    if (!r.finished || s.run.continues !== 1) bad.push('the fight was not won after the continue (' + (r.error || s.screen) + ', continues ' + s.run.continues + ')');
    return bad.length ? result(false, bad.join('; ')) : result(true, 'game over in phase 2 after ' + weakMisses + ' missed windows; continue: phase 2, health ' + after.health + ', ' +
      after.lives + ' lives, score ' + after.score + '; won ' + fmt(s.time - t0, 0) + ' s later');
  });
  if (!first.pass) return first;
  // Restart from checkpoint on the pause menu during the fight.
  const second = withSession({ difficulty: 'easy', profile: 'target', seed: 1, until: 'results' }, (session, TG) => {
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
  const third = withSession({ difficulty: 'hard', profile: 'target', seed: 1, until: 'results' }, (session, TG) => {
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

// ===============================================================================================
// 6. The matrix, milestones, output and the command line
// ===============================================================================================

// Every extra check, with the milestone it belongs to. The first ten are CONTRACT 10.4 (the full
// list with `length`, `deterministic`, `no-presentation` and `words-by-difficulty`); the others are the
// WP-E acceptance items of CONTRACT 12 written as checks.
const CHECK_LIST = [
  { name: 'level-valid', milestone: 1 },
  { name: 'counts', milestone: 1 },
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
  { name: 'typing-results', milestone: 2 },
  { name: 'crate-queue', milestone: 3 },
  { name: 'items-shape', milestone: 3 },
  { name: 'continue-restore', milestone: 3 },
  { name: 'no-type', milestone: 3 },
  { name: 'no-jump-bridge', milestone: 3 },
  { name: 'pause-deferred', milestone: 3 },
  { name: 'deterministic', milestone: 4 },
  { name: 'no-presentation', milestone: 4 },
  { name: 'words-by-difficulty', milestone: 4 },
  { name: 'length', milestone: 4 },
  { name: 'boss-fight', milestone: 4 },
  { name: 'boss-continue', milestone: 4 },
  { name: 'result-rank', milestone: 4 },
  { name: 'tutorial-slowdown', milestone: 5 },
  { name: 'adaptive-pacing', milestone: 5 }
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
  return 'RUN  difficulty=' + r.difficulty + ' profile=' + r.profile + ' seed=' + r.seed + ' wpm=' + r.wpm + ' acc=' + r.accuracy +
    ' adaptive=' + (r.adaptive ? 'on' : 'off') + ' until=' + r.until + ' result=' + status + ' finished=' + (r.finished ? 1 : 0) +
    ' time=' + fmt(r.time, 1) + ' score=' + r.score + ' lives=' + r.lives + ' continues=' + r.continues +
    ' dmgTyp=' + r.damageTypable + ' dmgOther=' + r.damageOther + ' repWpm=' + fmt(r.reportedWpm, 1) +
    ' repAcc=' + fmt(r.reportedAccuracy, 3) + ' assist=' + fmt(r.assistEnd, 2);
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
    else if (a === '--adaptive') o.adaptive = next();
    else if (a === '--until') o.until = next();
    else if (a === '--check') o.check = next();
    else if (a === '--milestone') o.milestone = Number(next());
    else if (a === '--verbose') o.verbose = true;
    else bad.push(a);
  }
  if (o.difficulty !== undefined && DIFFICULTIES.indexOf(o.difficulty) === -1) bad.push('--difficulty ' + o.difficulty);
  if (o.profile !== undefined && PROFILES.indexOf(o.profile) === -1) bad.push('--profile ' + o.profile);
  if (o.until !== undefined && UNTILS.indexOf(o.until) === -1) bad.push('--until ' + o.until);
  if (o.adaptive !== undefined && o.adaptive !== 'on' && o.adaptive !== 'off') bad.push('--adaptive ' + o.adaptive);
  if (o.check !== undefined && !CHECKS[o.check]) bad.push('--check ' + o.check);
  if (o.milestone !== undefined && !MILESTONES[o.milestone]) bad.push('--milestone ' + o.milestone);
  if (o.seed !== undefined && !(Number.isInteger(o.seed))) bad.push('--seed');
  const custom = o.wpm !== undefined || o.accuracy !== undefined || o.react !== undefined;
  if (custom && (!(o.wpm > 0) || !(o.accuracy > 0 && o.accuracy <= 1) || !(o.react >= 0) || !o.difficulty)) {
    bad.push('--wpm, --accuracy and --react go together, with --difficulty');
  }
  o.custom = custom;
  return { opts: o, bad: bad };
}

function main(argv) {
  const { opts, bad } = parseArgs(argv);
  if (bad.length) {
    console.log('ERROR unknown or invalid options: ' + bad.join(', '));
    console.log('Options: --difficulty easy|medium|hard --profile floor|target|fast|exact --wpm N --accuracy A --react R ' +
      '--seed N --adaptive on|off --until checkpoint1|checkpoint2|boss|results --check NAME --milestone N --verbose');
    return 2;
  }

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
  const ctx = { until: until, targetRuns: null };

  if (opts.custom) {
    const r = runBot({ difficulty: opts.difficulty, wpm: opts.wpm, accuracy: opts.accuracy, react: opts.react,
      seed: opts.seed !== undefined ? opts.seed : 1, until: until, profile: 'custom',
      adaptive: opts.adaptive ? opts.adaptive === 'on' : false, verbose: opts.verbose, printLog: opts.verbose });
    console.log(runLine(r, 'INFO') + (r.error ? ' error="' + clip(r.error) + '"' : ''));
    console.log('SUMMARY runs=1 passed=0 checks=0 checksPassed=0 result=INFO');
    return r.fatal ? 2 : 0;
  }

  if (runsWanted) {
    const targets = [];
    for (const d of difficulties) {
      for (const profile of profiles) {
        for (const seed of seeds) {
          const adaptive = opts.adaptive ? opts.adaptive === 'on' : PROFILE_ADAPTIVE[profile];
          const r = runBot({ difficulty: d, profile: profile, seed: seed, until: until, adaptive: adaptive, verbose: opts.verbose, printLog: false });
          const pass = passCondition(profile, r);
          runs++;
          if (pass) runsPassed++;
          if (r.fatal) fatal = true;
          console.log(runLine(r, pass ? 'PASS' : 'FAIL') + (pass ? '' : ' reason="' + clip(failReason(profile, r)) + '"'));
          if (opts.verbose) for (const line of r.log) console.log(line);
          if (profile === 'target' && !opts.adaptive) targets.push(r);
        }
      }
    }
    if (!filtered && targets.length === DIFFICULTIES.length * SEEDS.length) ctx.targetRuns = targets;
  }

  for (const name of checks) {
    let r;
    try {
      r = CHECKS[name](ctx);
    } catch (e) {
      r = result(false, 'exception: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
    }
    if (r.skip) {
      console.log('CHECK name=' + name + ' result=SKIP detail="' + clip(r.detail) + '"');
      continue;
    }
    checksRun++;
    if (r.pass) checksPassed++;
    console.log('CHECK name=' + name + ' result=' + (r.pass ? 'PASS' : 'FAIL') + (r.detail ? ' detail="' + clip(r.detail, 400) + '"' : ''));
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
