#!/usr/bin/env node
// tools/shot.js
// Screenshots of a bot run (WP-F, CONTRACT 13.2). Runs the bot of test/sim.js with every file loaded and
// the software canvas, calls TG.Main.tick (or the same steps when js/main.js is absent) and
// TG.Render.draw on every simulation step, and writes the frame at the chosen moment as a PNG.
//
//   node tools/shot.js --out <file.png> [--difficulty medium] [--seed 1] [--at <seconds>]
//                      [--until checkpoint1|checkpoint2|boss|results] [--frames <n>] [--scale 3]
//
// Choosing the moment (the first one that applies; without any, the last frame of the run):
//   --at <s>             the first frame with state.time >= s
//   --when "<expr>"      the first frame for which the JavaScript expression is true. `s` is the state
//                        and `TG` the namespace, e.g. --when "s.typing.target && s.typing.target.typed >= 2"
//   --event <name>[:<n>] the frame of the n-th emission (default 1st) of an event, e.g. --event word:clear:3
//   --after <s>          wait this many seconds (state.time) after the moment above
//   --until <point>      stop the run there (as in test/sim.js); without a moment, that frame is written
// More frames:
//   --frames <n>         write n frames from the moment on, as <out>-00.png, <out>-01.png ...
//   --every <k>          steps between those frames (default 1)
//   --sheet              put the frames side by side in one PNG instead (at most 4 per row, or --cols)
//   --cols <n>           frames per row of the sheet
//   --crop x,y,w,h       write only this part of each frame (internal pixels), e.g. around a creature
// The run:
//   --profile floor|target|fast|exact   bot profile (default target)
//   --wpm N --accuracy A --react R      custom bot (profile custom)
//   --adaptive on|off, --no-type, --no-jump, --no-duck
//   --reduce-flash       the reduceFlash setting on
//   --key-guide on|off   the keyGuide setting
//   --info               print the state at each written frame (entities, lock, player)
//   --events <file.json> also write the game events emitted from the first written frame on, as
//                        [{ f, name, payload }] with f the frame index at which the event happened
// Exit codes: 0 written; 1 bad options or the moment never came; 2 the run failed before the moment.
//
// The run is the same as `node test/sim.js`, with its assertions: a console.warn or console.error
// from any module (for example a missing sprite) stops the run and is printed.
'use strict';

const path = require('path');
const stubs = require('../test/stubs');
const soft = require('./softcanvas');
const png = require('./png');

const SENTINEL = 'tools/shot.js: done';

function usage(message) {
  if (message) console.error('shot: ' + message);
  console.error('usage: node tools/shot.js --out <file.png> [--difficulty medium] [--seed 1] [--at <seconds>] ' +
    '[--until checkpoint1|checkpoint2|boss|results] [--frames <n>] [--scale 3] [--when <expr>] [--event <name>[:<n>]] ' +
    '[--after <s>] [--every <k>] [--sheet] [--cols <n>] [--crop x,y,w,h] [--profile target] [--wpm N --accuracy A --react R] ' +
    '[--adaptive on|off] [--no-type] [--no-jump] [--no-duck] [--reduce-flash] [--key-guide on|off] [--info]');
  process.exit(1);
}

function parse(argv) {
  const o = {
    out: null, difficulty: 'medium', seed: 1, at: null, until: null, frames: 1, scale: 3, when: null,
    event: null, eventN: 1, after: 0, every: 1, sheet: false, profile: null, wpm: undefined, accuracy: undefined,
    react: undefined, adaptive: undefined, noType: false, noJump: false, noDuck: false, reduceFlash: false,
    keyGuide: null, info: false, crop: null, cols: 4, events: null
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = function () {
      if (i + 1 >= argv.length) usage(a + ' needs a value');
      return argv[++i];
    };
    const number = function () {
      const v = Number(next());
      if (!isFinite(v)) usage(a + ' needs a number');
      return v;
    };
    switch (a) {
      case '--out': o.out = next(); break;
      case '--difficulty': o.difficulty = next(); break;
      case '--seed': o.seed = number(); break;
      case '--at': o.at = number(); break;
      case '--until': o.until = next(); break;
      case '--frames': o.frames = Math.max(1, Math.floor(number())); break;
      case '--scale': o.scale = Math.max(1, Math.floor(number())); break;
      case '--when': o.when = next(); break;
      case '--event': {
        const v = next().split(':');
        const last = v[v.length - 1];
        if (v.length > 2 || (v.length === 2 && /^\d+$/.test(last))) {
          if (/^\d+$/.test(last)) { o.eventN = Number(last); v.pop(); }
        }
        o.event = v.join(':');
        break;
      }
      case '--after': o.after = number(); break;
      case '--every': o.every = Math.max(1, Math.floor(number())); break;
      case '--sheet': o.sheet = true; break;
      case '--cols': o.cols = Math.max(1, Math.floor(number())); break;
      case '--crop': {
        const v = next().split(',').map(Number);
        if (v.length !== 4 || v.some(function (n) { return !isFinite(n); })) usage('--crop needs x,y,w,h');
        o.crop = { x: Math.max(0, Math.floor(v[0])), y: Math.max(0, Math.floor(v[1])), w: Math.floor(v[2]), h: Math.floor(v[3]) };
        o.crop.w = Math.max(1, Math.min(o.crop.w, 384 - o.crop.x));
        o.crop.h = Math.max(1, Math.min(o.crop.h, 216 - o.crop.y));
        break;
      }
      case '--profile': o.profile = next(); break;
      case '--wpm': o.wpm = number(); break;
      case '--accuracy': o.accuracy = number(); break;
      case '--react': o.react = number(); break;
      case '--adaptive': o.adaptive = next() === 'on'; break;
      case '--no-type': o.noType = true; break;
      case '--no-jump': o.noJump = true; break;
      case '--no-duck': o.noDuck = true; break;
      case '--reduce-flash': o.reduceFlash = true; break;
      case '--key-guide': o.keyGuide = next(); break;
      case '--info': o.info = true; break;
      case '--events': o.events = next(); break;
      case '--help': case '-h': usage(); break;
      default: usage('unknown option ' + a);
    }
  }
  if (!o.out) usage('--out is required');
  if (['easy', 'medium', 'hard'].indexOf(o.difficulty) === -1) usage('--difficulty must be easy, medium or hard');
  if (o.until && ['checkpoint1', 'checkpoint2', 'boss', 'results'].indexOf(o.until) === -1) usage('bad --until');
  return o;
}

function framePath(out, index, count) {
  if (count === 1) return out;
  const ext = path.extname(out) || '.png';
  const base = out.slice(0, out.length - path.extname(out).length);
  return base + '-' + String(index).padStart(2, '0') + ext;
}

function describe(TG, s) {
  const lines = [];
  const p = s.player;
  const t = s.typing ? s.typing.target : null;
  lines.push('  screen=' + s.screen + ' time=' + s.time.toFixed(2) + ' section=' + s.section + ' score=' + s.score +
    ' camX=' + (s.camera ? s.camera.x.toFixed(1) : '-') + (p ? ' pip=' + p.state + '@' + p.x.toFixed(1) + ',' + p.y.toFixed(1) +
    ' lives=' + p.lives + ' invuln=' + p.invulnT.toFixed(2) : '') + ' shield=' + s.power.shield +
    ' lock=' + (t ? t.kind + ':' + t.word + ':' + t.typed : 'none'));
  for (const e of s.entities) {
    if (e.dead) continue;
    lines.push('  ' + e.id + ' ' + e.kind + (e.word ? ' "' + e.word + '" typed=' + e.typed : '') + ' x=' + (e.x - s.camera.x).toFixed(1) +
      ' y=' + e.y.toFixed(1) + (e.phase ? ' ' + e.phase : '') + (e.t !== undefined ? ' t=' + e.t.toFixed(2) : '') +
      (e.eta !== undefined ? ' eta=' + (isFinite(e.eta) ? e.eta.toFixed(2) : 'inf') : ''));
  }
  if (s.boss) {
    lines.push('  boss state=' + s.boss.state + ' phase=' + s.boss.phase + ' health=' + s.boss.health + ' pose=' + s.boss.pose +
      ' rise=' + s.boss.rise.toFixed(1) + (s.boss.word ? ' word=' + s.boss.word.word + ':' + s.boss.word.typed : ''));
  }
  if (TG.Render && TG.Render.layoutLabels) {
    for (const L of TG.Render.layoutLabels(s)) {
      lines.push('  plate ' + L.text + ' x=' + L.x + ' y=' + L.y + (L.edge ? ' edge=' + L.edge : '') + (L.locked ? ' locked' : '') +
        (L.dim ? ' dim' : ''));
    }
  }
  return lines.join('\n');
}

function main() {
  const o = parse(process.argv.slice(2));

  // Every stubs.load made by test/sim.js gets software canvases, and the env is kept.
  let env = null;
  const load = stubs.load;
  stubs.load = function (opts) {
    env = load(Object.assign({}, opts || {}, { canvas: 'soft' }));
    return env;
  };
  const sim = require('../test/sim');

  const frames = [];            // { rgba, time, info }
  const eventLog = [];          // --events: { f, name, payload }
  let armed = o.at === null && o.when === null && o.event === null ? null : false;
  let triggerTime = null;
  let eventsSeen = 0;
  let stepsSinceFrame = 0;
  let whenFn = null;
  if (o.when) {
    try {
      whenFn = new Function('s', 'TG', 'return (' + o.when + ');');
    } catch (e) {
      usage('--when does not compile: ' + e.message);
    }
  }

  function capture(TG, s) {
    frames.push({ rgba: env.canvas.toRGBA(), time: s.time, info: o.info ? describe(TG, s) : null });
    stepsSinceFrame = 0;
    if (frames.length >= o.frames) throw new Error(SENTINEL);
  }

  function afterDraw(TG) {
    const s = TG.Game.state;
    if (armed === null) return;            // no moment: the last frame is written at the end
    if (frames.length > 0) {
      stepsSinceFrame++;
      if (stepsSinceFrame >= o.every) capture(TG, s);
      return;
    }
    if (triggerTime === null) {
      let hit = false;
      if (o.at !== null && s.time >= o.at) hit = true;
      if (whenFn) {
        try { hit = hit || !!whenFn(s, TG); } catch (e) { hit = false; }
      }
      if (o.event && eventsSeen >= o.eventN) hit = true;
      if (hit) triggerTime = s.time;
    }
    if (triggerTime !== null && s.time >= triggerTime + o.after - 1e-9) capture(TG, s);
  }

  function setup(TG) {
    if (o.reduceFlash) TG.Save.setSetting('reduceFlash', true);
    if (o.keyGuide) TG.Save.setSetting('keyGuide', o.keyGuide);
    if (TG.Gfx && TG.Gfx.init) TG.Gfx.init(env.document);
    if (TG.Effects && TG.Effects.init) TG.Effects.init();
    if (TG.Hud && TG.Hud.init) TG.Hud.init();
    if (TG.Render && TG.Render.init) TG.Render.init(env.canvas);
    if (TG.UI && TG.UI.init) TG.UI.init();
    if (o.event) TG.Events.on(o.event, function () { eventsSeen++; });
    if (o.events) {
      TG.Events.on('*', function (payload, name) {
        if (frames.length === 0) return;
        let plain = null;
        try { plain = JSON.parse(JSON.stringify(payload === undefined ? null : payload)); } catch (e) { plain = null; }
        eventLog.push({ f: frames.length - 1 + stepsSinceFrame / o.every, name: name, payload: plain });
      });
    }

    const step = TG.Game.step;
    const useMain = !!(TG.Main && typeof TG.Main.tick === 'function');
    let inTick = false;
    TG.Game.step = function (dt) {
      if (inTick) return step(dt);
      if (useMain) {
        inTick = true;
        try { TG.Main.tick(dt); } finally { inTick = false; }
      } else {
        // CONTRACT 4.21 TG.Main.tick, for the sim screens the bot steps.
        step(dt);
        const s = TG.Game.state;
        if (s.screen !== 'paused' && TG.Effects && TG.Effects.update) TG.Effects.update(dt);
        if (TG.Hud && TG.Hud.update) TG.Hud.update(dt, s);
      }
      if (TG.Render && TG.Render.draw) TG.Render.draw(TG.Game.state);
      afterDraw(TG);
    };
  }

  // The bot continues at once on gameOver; that screen is drawn here so that it can be captured.
  function onGameOver(TG) {
    if (TG.Render && TG.Render.draw) TG.Render.draw(TG.Game.state);
    afterDraw(TG);
  }

  let report;
  try {
    report = sim.runBot({
      difficulty: o.difficulty, seed: o.seed, profile: o.profile || undefined, wpm: o.wpm, accuracy: o.accuracy,
      react: o.react, adaptive: o.adaptive, until: o.until || 'results', noType: o.noType, noJump: o.noJump,
      noDuck: o.noDuck, setup: setup, onGameOver: onGameOver, maxSeconds: 1500
    });
  } catch (e) {
    if (!(e && e.message === SENTINEL)) throw e;
  }
  const stopped = report && report.error && report.error.indexOf(SENTINEL) !== -1;
  if (report && report.error && !stopped && frames.length === 0) {
    console.error('shot: the run failed before the moment: ' + report.error);
    process.exit(2);
  }
  if (report && report.error && !stopped) console.error('shot: note: the run ended with: ' + report.error);

  if (frames.length === 0) {
    if (armed !== null) {
      console.error('shot: the moment never came (the run ended at time ' + (report ? report.time.toFixed(2) : '?') + ')');
      process.exit(1);
    }
    const TG = env.TG;
    frames.push({ rgba: env.canvas.toRGBA(), time: TG.Game.state.time, info: o.info ? describe(TG, TG.Game.state) : null });
  }

  let W = 384, H = 216;
  if (o.crop) {
    const c = o.crop;
    frames.forEach(function (f) {
      const out = new Uint8ClampedArray(c.w * c.h * 4);
      for (let y = 0; y < c.h; y++) {
        const src = ((c.y + y) * 384 + c.x) * 4;
        out.set(f.rgba.subarray(src, src + c.w * 4), y * c.w * 4);
      }
      f.rgba = out;
    });
    W = c.w;
    H = c.h;
  }
  if (o.sheet && frames.length > 1) {
    const cols = Math.min(o.cols, frames.length), rows = Math.ceil(frames.length / cols);
    const gap = 2;
    const SW = cols * W + (cols - 1) * gap, SH = rows * H + (rows - 1) * gap;
    const out = new Uint8ClampedArray(SW * SH * 4);
    for (let i = 0; i < out.length; i += 4) { out[i] = 40; out[i + 1] = 40; out[i + 2] = 48; out[i + 3] = 255; }
    frames.forEach(function (f, k) {
      const ox = (k % cols) * (W + gap), oy = Math.floor(k / cols) * (H + gap);
      for (let y = 0; y < H; y++) {
        const src = y * W * 4, dst = ((oy + y) * SW + ox) * 4;
        out.set(f.rgba.subarray(src, src + W * 4), dst);
      }
    });
    const big = soft.scaleRGBA(out, SW, SH, o.scale);
    png.write(o.out, big.width, big.height, big.rgba);
    console.log('shot: ' + frames.length + ' frames from time ' + frames[0].time.toFixed(2) + ' -> ' + o.out);
  } else {
    frames.forEach(function (f, k) {
      const big = soft.scaleRGBA(f.rgba, W, H, o.scale);
      const file = framePath(o.out, k, frames.length);
      png.write(file, big.width, big.height, big.rgba);
      console.log('shot: time ' + f.time.toFixed(2) + ' -> ' + file);
    });
  }
  frames.forEach(function (f) { if (f.info) console.log(f.info); });
  if (o.events) require('fs').writeFileSync(o.events, JSON.stringify(eventLog));
  process.exit(0);
}

if (require.main === module) main();

module.exports = { parse };
