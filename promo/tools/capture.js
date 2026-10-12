#!/usr/bin/env node
// promo/tools/capture.js
// Captures gameplay clips for the promo shorts from runs of the game's own test bot (test/sim.js),
// drawn with the software canvas, the same way tools/shot.js draws a screenshot.
//
//   node tools/capture.js <run> [<run> ...]     capture every clip of these runs of clips.json
//   node tools/capture.js --all                 capture every run
//   node tools/capture.js --probe <run>         print the times of the run's main events, capture nothing
//
// clips.json:
//   { "runs": { "<run>": {
//       "difficulty": "hard", "seed": 1, "wpm": 80, "accuracy": 0.99, "react": 0.3,   the bot
//       "adaptive": true,                 adaptive pace, as the live game has it by default
//       "noType": false, "noJump": false, "noDuck": false,
//       "clips": [
//         { "name": "x", "from": 12.5, "seconds": 6 }                      from a state time
//         { "name": "y", "from": { "event": "boss:finisher", "n": 1, "offset": -1 }, "seconds": 8 }
//         { "name": "z", "results": true, "seconds": 8 }                    the results screen after the run
//       ] } } }
// A clip may also have "keep": [[first, last], ...]. Then only those frames (inclusive, numbered from
// the start of the clip) are written as pictures; the clip keeps its numbering, its events, its data
// and its sound. It is for a long clip of which a short uses a few stretches: thousands of unused
// pictures in public/ make Remotion Studio slow. tools/used-frames.js prints the ranges a video uses.
//
// A clip is written to public/clips/<name>/:
//   0000.png ...   frames at 384 x 216, 30 a second (every second step of the game)
//   events.json    [{ f, name, payload }]: the game events, f the frame at which each happened
//   data.json      { frames, run, state: [...], keys: [[f, letter, 1 or 0]], clears: [[f, word, kind]] }
//                  state has one record per frame: time, score, lives, WPM and accuracy as the HUD
//                  shows them, the locked word, the Baron, and each creature with a word: id, kind,
//                  word, letters typed, x, y, where it comes from, type, the seconds until it lands
//                  as the game counts them, and the seconds it was given when it appeared (both in
//                  real seconds).
//                  The record of frame f is the picture of frame f. An event with frame f or f + 0.5
//                  happens after that picture: it is first seen in frame floor(f) + 1.
//
// A run is played twice: once without drawing to find the times of its events, then again to draw.
// The simulation is seeded, so both passes are the same run.
'use strict';

const fs = require('fs');
const path = require('path');

const PROMO = path.resolve(__dirname, '..');
const ROOT = path.resolve(PROMO, '..');
const stubs = require(path.join(ROOT, 'test', 'stubs'));
const png = require(path.join(ROOT, 'tools', 'png'));

const W = 384, H = 216;
const EVERY = 2;                 // steps per frame: the game steps 60 times a second
const DRAW_LEAD = 1.0;           // drawing starts this many seconds before a clip, so effects are in step
const PROBE_EVENTS = [
  'section:enter', 'checkpoint', 'boss:enter', 'boss:phase', 'boss:hit', 'boss:weakopen', 'boss:finisher',
  'boss:defeat', 'life:lost', 'game:over', 'game:continue', 'pickup:power', 'power:start', 'streak:milestone',
  'level:clear', 'screen:change', 'shield:break'
];

function fail(message) {
  console.error('capture: ' + message);
  process.exit(1);
}

function botOptions(run) {
  return {
    difficulty: run.difficulty || 'medium', seed: run.seed === undefined ? 1 : run.seed,
    profile: run.profile || undefined, wpm: run.wpm, accuracy: run.accuracy, react: run.react,
    adaptive: typeof run.adaptive === 'boolean' ? run.adaptive : undefined,
    noType: !!run.noType, noJump: !!run.noJump, noDuck: !!run.noDuck,
    until: 'results', maxSeconds: 1500
  };
}

// Each pass needs its own copy of the harness, because test/sim.js keeps the loader it was given.
function freshSim(canvasMode, onEnv) {
  const simPath = require.resolve(path.join(ROOT, 'test', 'sim'));
  delete require.cache[simPath];
  const load = stubs.__captureLoad || stubs.load;
  stubs.__captureLoad = load;
  stubs.load = function (opts) {
    const env = load(Object.assign({}, opts || {}, canvasMode ? { canvas: canvasMode } : {}));
    onEnv(env);
    return env;
  };
  return require(simPath);
}

// Pass 1: the times (state.time) of every event of the run.
function probe(run) {
  const log = [];
  let TGref = null;
  const sim = freshSim(null, function () {});
  const report = sim.runBot(Object.assign(botOptions(run), {
    setup: function (TG) {
      TGref = TG;
      TG.Events.on('*', function (payload, name) {
        log.push({ name: name, t: TG.Game.state ? TG.Game.state.time : 0, payload: payload });
      });
    }
  }));
  return { log: log, report: report, TG: TGref };
}

function resolveFrom(clip, log) {
  if (typeof clip.from === 'number') return clip.from;
  const spec = clip.from || {};
  const n = spec.n || 1;
  let seen = 0;
  for (const e of log) {
    if (e.name !== spec.event) continue;
    if (spec.where) {
      let ok = false;
      try { ok = !!new Function('p', 'return (' + spec.where + ');')(e.payload || {}); } catch (err) { ok = false; }
      if (!ok) continue;
    }
    seen++;
    if (seen === n) return Math.max(0, e.t + (spec.offset || 0));
  }
  fail('clip ' + clip.name + ': event ' + spec.event + ' number ' + n + ' did not happen in the run');
  return 0;
}

// Whether frame `index` of a clip is written as a picture.
function kept(clip, index) {
  if (!Array.isArray(clip.keep)) return true;
  return clip.keep.some(function (r) { return index >= r[0] && index <= r[1]; });
}

function plain(v) {
  try { return JSON.parse(JSON.stringify(v === undefined ? null : v)); } catch (e) { return null; }
}

function round1(v) {
  return typeof v === 'number' && isFinite(v) ? Math.round(v * 10) / 10 : null;
}

function snapshot(TG, s) {
  const cam = s.camera ? s.camera.x : 0;
  const p = s.player;
  const st = s.typing && s.typing.stats ? s.typing.stats : null;
  const keys = st ? (st.correct || 0) + (st.wrong || 0) : 0;
  const target = s.typing ? s.typing.target : null;
  const pace = s.config && typeof s.config.pace === 'number' && s.config.pace > 0 ? s.config.pace : 1;
  const rec = {
    t: Math.round(s.time * 1000) / 1000,
    screen: s.screen,
    score: s.score,
    lives: p ? p.lives : 0,
    shield: s.power ? s.power.shield : 0,
    wpm: st && typeof st.liveWpm === 'number' ? Math.round(st.liveWpm) : null,
    acc: st && keys > 0 ? Math.floor((typeof st.accuracy === 'number' ? st.accuracy : 1) * 100) : null,
    pip: p ? [round1(p.x - cam), round1(p.y), p.state] : null,
    lock: target ? target.id : null,
    ents: [],
    boss: null
  };
  for (const e of s.entities || []) {
    if (e.dead || (e.type !== 'threat' && e.type !== 'crate')) continue;
    // The game keeps a creature's time in its own seconds, of which it counts `pace` to each real
    // second (0.75 on Easy, 1 on Medium, 1.25 on Hard). Both figures here are real seconds.
    rec.ents.push([e.id, e.kind, e.word || '', e.typed || 0, round1(e.x - cam), round1(e.y), e.from || '', e.type,
      typeof e.eta === 'number' && isFinite(e.eta) ? Math.round(e.eta * 100) / 100 : null,
      typeof e.budget === 'number' ? Math.round((e.budget / pace) * 100) / 100 : null]);
  }
  if (s.boss) {
    const b = s.boss;
    rec.boss = {
      state: b.state, phase: b.phase, health: b.health, max: b.maxHealth, x: round1(b.x - cam), y: round1(b.y),
      word: b.word ? b.word.word : null, typed: b.word ? b.word.typed || 0 : 0
    };
  }
  return rec;
}

// Pass 2: draw and write the clips.
function capture(runName, run, clips, log1) {
  let env = null;
  const sim = freshSim('soft', function (e) { env = e; });
  const windows = clips.filter(function (c) { return !c.results; }).map(function (c) {
    const from = resolveFrom(c, log1);
    return { clip: c, from: from, to: from + c.seconds, count: 0, dir: null, state: [], events: [], sinceFrame: 0, done: false };
  }).sort(function (a, b) { return a.from - b.from; });
  const resultsClip = clips.find(function (c) { return c.results; }) || null;
  const resultsWin = resultsClip ? { clip: resultsClip, count: 0, dir: null, state: [], events: [], sinceFrame: 0 } : null;
  let TGref = null;

  // Frames are written as they are drawn, so that a long clip is never held in memory.
  function record(win, TG) {
    const s = TG.Game.state;
    if (win.count === 0) {
      win.dir = path.join(PROMO, 'public', 'clips', win.clip.name);
      fs.rmSync(win.dir, { recursive: true, force: true });
      fs.mkdirSync(win.dir, { recursive: true });
    }
    if (kept(win.clip, win.count)) {
      png.write(path.join(win.dir, String(win.count).padStart(4, '0') + '.png'), W, H, env.canvas.toRGBA());
      win.written = (win.written || 0) + 1;
    }
    win.count++;
    win.state.push(snapshot(TG, s));
    win.sinceFrame = 0;
  }

  function afterStep(TG) {
    const s = TG.Game.state;
    let drew = false;
    const needsDraw = windows.some(function (w) { return !w.done && s.time >= w.from - DRAW_LEAD; });
    if (needsDraw && TG.Render && TG.Render.draw) { TG.Render.draw(s); drew = true; }
    for (const w of windows) {
      if (w.done) continue;
      if (w.count === 0) {
        if (s.time >= w.from - 1e-9) { if (!drew) TG.Render.draw(s); record(w, TG); }
        continue;
      }
      w.sinceFrame++;
      if (w.sinceFrame >= EVERY) {
        record(w, TG);
        if (w.count >= Math.round(w.clip.seconds * 30)) w.done = true;
      }
    }
  }

  function setup(TG) {
    TGref = TG;
    if (TG.Gfx && TG.Gfx.init) TG.Gfx.init(env.document);
    if (TG.Effects && TG.Effects.init) TG.Effects.init();
    if (TG.Hud && TG.Hud.init) TG.Hud.init();
    if (TG.Render && TG.Render.init) TG.Render.init(env.canvas);
    if (TG.UI && TG.UI.init) TG.UI.init();
    TG.Events.on('*', function (payload, name) {
      const targets = windows.filter(function (w) { return !w.done && w.count > 0; });
      if (resultsWin && resultsWin.count > 0) targets.push(resultsWin);
      for (const w of targets) {
        w.events.push({ f: w.count - 1 + w.sinceFrame / EVERY, name: name, payload: plain(payload) });
      }
    });
    const step = TG.Game.step;
    let inTick = false;
    TG.Game.step = function (dt) {
      if (inTick) return step(dt);
      inTick = true;
      try { TG.Main.tick(dt); } finally { inTick = false; }
      afterStep(TG);
    };
  }

  const report = sim.runBot(Object.assign(botOptions(run), { setup: setup }));
  if (report.error) console.error('capture: note: run ' + runName + ' ended with: ' + report.error);
  const TG = TGref;

  if (resultsWin) {
    if (!TG || TG.Game.state.screen !== 'results') fail('run ' + runName + ' did not reach the results screen');
    const total = Math.round(resultsClip.seconds * 30);
    TG.Render.draw(TG.Game.state);
    record(resultsWin, TG);
    while (resultsWin.count < total) {
      TG.Main.tick(1 / 60);
      resultsWin.sinceFrame++;
      if (resultsWin.sinceFrame >= EVERY) { TG.Render.draw(TG.Game.state); record(resultsWin, TG); }
    }
  }

  const all = windows.slice();
  if (resultsWin) all.push(resultsWin);
  for (const w of all) {
    const want = Math.round(w.clip.seconds * 30);
    if (w.count === 0) fail('clip ' + w.clip.name + ' has no frames: the run ended before it began');
    if (w.count < want) {
      console.error('capture: note: clip ' + w.clip.name + ' has ' + w.count + ' of ' + want + ' frames (the run ended)');
    }
    const dir = w.dir;
    fs.writeFileSync(path.join(dir, 'events.json'), JSON.stringify(w.events));
    const keys = [], clears = [];
    for (const e of w.events) {
      const p = e.payload || {};
      if (e.name === 'type:hit') keys.push([e.f, p.ch, 1]);
      else if (e.name === 'type:miss') keys.push([e.f, p.ch, 0]);
      else if (e.name === 'word:clear') clears.push([e.f, p.word, p.kind]);
    }
    const result = TG && TG.Game.state.result ? TG.Game.state.result : null;
    fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify({
      name: w.clip.name, frames: w.count, fps: 30, run: runName,
      bot: { difficulty: run.difficulty, seed: run.seed, wpm: run.wpm, accuracy: run.accuracy, react: run.react },
      from: w.from === undefined ? null : Math.round(w.from * 1000) / 1000,
      result: result ? {
        rank: result.rank, score: result.score, cleared: result.cleared, livesLost: result.livesLost,
        continues: result.continues, wpm: Math.round(result.typing.wpm), accuracy: Math.floor(result.typing.accuracy * 100)
      } : null,
      keys: keys, clears: clears, state: w.state
    }));
    console.log('capture: ' + w.clip.name + ': ' + w.count + ' frames' + (Array.isArray(w.clip.keep) ? ' (' + (w.written || 0) + ' kept)' : '') +
      (w.from === undefined ? ' (results)' : ' from time ' + w.from.toFixed(2)) + ', ' + w.events.length + ' events');
  }
  return report;
}

function main() {
  const args = process.argv.slice(2);
  const manifest = JSON.parse(fs.readFileSync(path.join(PROMO, 'clips.json'), 'utf8'));
  const probeOnly = args[0] === '--probe';
  let names = args.filter(function (a) { return a.slice(0, 2) !== '--'; });
  if (args.indexOf('--all') !== -1) names = Object.keys(manifest.runs);
  if (names.length === 0) fail('name a run of clips.json, or --all');
  for (const name of names) {
    const run = manifest.runs[name];
    if (!run) fail('no run ' + name + ' in clips.json');
    const first = probe(run);
    const r = first.report;
    console.log('capture: run ' + name + ': finished=' + r.finished + ' time=' + r.time.toFixed(1) + ' rank=' + r.rank +
      ' score=' + r.score + ' wpm=' + Math.round(r.reportedWpm) + ' accuracy=' + Math.floor(r.reportedAccuracy * 100) +
      '% livesLost=' + r.livesLost + ' continues=' + r.continues + (r.error ? ' error=' + r.error : ''));
    if (probeOnly) {
      for (const e of first.log) {
        if (PROBE_EVENTS.indexOf(e.name) === -1) continue;
        const p = e.payload || {};
        const note = e.name === 'screen:change' ? p.from + ' -> ' + p.to :
          e.name === 'boss:phase' ? 'phase ' + p.phase : e.name === 'section:enter' ? 'section ' + (p.index !== undefined ? p.index : p.section) :
            e.name === 'pickup:power' || e.name === 'power:start' ? String(p.kind || p.power || '') : '';
        console.log('  ' + e.t.toFixed(2).padStart(8) + '  ' + e.name + (note ? '  ' + note : ''));
      }
      continue;
    }
    capture(name, run, run.clips || [], first.log);
  }
  process.exit(0);
}

main();
