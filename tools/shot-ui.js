// tools/shot-ui.js
// Draws one interface screen of SPELL RUNNER to a PNG file (WP-G). CONTRACT 13.2.
//
//   node tools/shot-ui.js --screen <name> --out <file.png> [--scale 3]
//
//   --screen      boot | title | difficultySelect | howToPlay | paused | gameOver | results |
//                 highScoreEntry, or 'all' to write every screen (then --out is a directory)
//   --out         the PNG file to write (a directory with --screen all)
//   --scale       whole-number enlargement of the 384 x 216 picture (default 3)
//   --difficulty  easy | medium | hard, for the screens reached by playing (default medium)
//   --seed        run seed (default 1)
//   --panel       title only: menu | options | scores | story (default menu)
//   --page        results only: 1 or 2 (default 1)
//   --wait        extra seconds to let the screen animate before the picture is taken
//
// How it works: every game file is loaded under test/stubs.js with the software canvas
// (tools/softcanvas.js), TG.Main.init() starts the page as in a browser, and the screen is reached the
// way a player reaches it: keys are sent as keydown and keyup events, and frames are run through the
// real requestAnimationFrame loop of TG.Main. Long stretches of play are run with TG.Main.tick and a
// small bot (below) that types the words and presses jump and duck. The picture is the game canvas
// after the last frame, drawn by TG.Render (or by the fallback of TG.Main when render.js is absent).
//
// As a module it exports the session and the bot, which test/test-ui.js also uses.
'use strict';

const fs = require('fs');
const path = require('path');
const stubs = require('../test/stubs');
const png = require('./png');
const soft = require('./softcanvas');

const SCREENS = ['boot', 'title', 'difficultySelect', 'howToPlay', 'paused', 'gameOver', 'results', 'highScoreEntry'];
const FRAME_MS = 1000 / 60;

// KeyboardEvent fields for a key name used below.
function keyEvent(name) {
  const named = {
    enter: { key: 'Enter', code: 'Enter' },
    space: { key: ' ', code: 'Space' },
    esc: { key: 'Escape', code: 'Escape' },
    backspace: { key: 'Backspace', code: 'Backspace' },
    up: { key: 'ArrowUp', code: 'ArrowUp' },
    down: { key: 'ArrowDown', code: 'ArrowDown' },
    left: { key: 'ArrowLeft', code: 'ArrowLeft' },
    right: { key: 'ArrowRight', code: 'ArrowRight' },
    shift: { key: 'Shift', code: 'ShiftLeft', shiftKey: true }
  };
  if (named[name]) return Object.assign({}, named[name]);
  if (/^[a-z]$/.test(name)) return { key: name, code: 'Key' + name.toUpperCase() };
  return { key: name, code: '' };
}

// A browser-like session: all files, the software (or stub) canvas, TG.Main.init(), a frame clock.
// options: { canvas: 'soft' | 'stub', files, storage, width, height, dpr, quiet }
function createSession(options) {
  const o = options || {};
  const env = stubs.load({
    canvas: o.canvas || 'soft',
    storage: o.storage || 'memory',
    files: o.files,
    quiet: o.quiet !== false
  });
  env.setSize(o.width || 1920, o.height || 1080);
  if (o.dpr) env.window.devicePixelRatio = o.dpr;
  const TG = env.TG;
  TG.Main.init();
  const s = { env: env, TG: TG, ms: 0 };
  // One displayed frame of 1/60 s: one fixed step and one draw.
  s.frame = function () {
    s.ms += FRAME_MS;
    env.runFrame(s.ms);
  };
  s.frames = function (n) {
    for (let i = 0; i < n; i++) s.frame();
  };
  s.seconds = function (sec) {
    s.frames(Math.round(sec * 60));
  };
  s.key = function (name) {
    const init = keyEvent(name);
    const down = env.dispatch('keydown', init);
    env.dispatch('keyup', init);
    return down;
  };
  // Presses a key and runs one frame, so that the key is handled before the next one.
  s.press = function (name) {
    const e = s.key(name);
    s.frame();
    return e;
  };
  s.type = function (text) {
    for (const ch of text) s.press(ch);
  };
  s.screen = function () {
    return TG.Game && TG.Game.state ? TG.Game.state.screen : null;
  };
  // Runs fixed steps without drawing (fast), with an optional bot. The frame clock is not moved, so
  // the next frame continues from the last one.
  s.steps = function (n, bot) {
    for (let i = 0; i < n; i++) {
      if (bot) botStep(TG, bot);
      TG.Main.tick(TG.C.DT);
    }
  };
  s.picture = function (scale) {
    const c = env.canvas;
    if (!c || typeof c.toRGBA !== 'function') throw new Error('shot-ui: the game canvas is not a software canvas');
    const f = scale || 1;
    return f === 1 ? { width: c.width, height: c.height, rgba: c.toRGBA() } : soft.scaleRGBA(c.toRGBA(), c.width, c.height, f);
  };
  return s;
}

// ---------------------------------------------------------------------------------------------
// A small bot for the screens that are reached by playing. It reads the state, and presses keys
// only through the public TG.Input API, as the page does.
//   wpm     typing speed (default 90); type: false turns typing off
//   react   s after a word appears before its first key
// It types the word with the lowest eta (or keeps the locked one), jumps and ducks in the middle of
// each input window, holds duck under an arch, and presses Enter on the game over screen.
// ---------------------------------------------------------------------------------------------

function createBot(options) {
  const o = options || {};
  return {
    wpm: o.wpm || 90, react: o.react === undefined ? 0.3 : o.react, type: o.type !== false,
    nextKeyAt: 0, pressed: {}, release: [], holdUntil: null, continues: -1, uiWait: 0
  };
}

function botStep(TG, bot) {
  const s = TG.Game.state;
  const I = TG.Input;
  for (const k of bot.release) I.keyUp(k);
  bot.release = [];
  if (s.screen === 'gameOver') {
    bot.uiWait += TG.C.DT;
    if (bot.uiWait > 1.2) {
      bot.uiWait = 0;
      I.keyDown('enter');
      bot.release.push('enter');
    }
    return;
  }
  bot.uiWait = 0;
  if (!TG.Game.isSimScreen(s.screen) || !s.player) return;
  if (s.run.continues !== bot.continues) {       // hazards are armed again after a continue
    bot.continues = s.run.continues;
    bot.pressed = {};
  }
  if (bot.holdUntil !== null && s.player.x > bot.holdUntil) {
    I.keyUp('duck');
    bot.holdUntil = null;
  }
  const a = TG.Entities.nextAction(s);
  if (a && a.inWindow && !bot.pressed[a.id]) {
    const mid = a.source === 'hazard' ? (a.winStart + a.winEnd) / 2 : -Infinity;
    if (s.player.x >= mid) {
      bot.pressed[a.id] = true;
      const key = a.action === 'jump' ? 'jump' : 'duck';
      I.keyDown(key);
      if (a.hold) bot.holdUntil = a.holdUntil;
      else bot.release.push(key);
    }
  }
  if (!bot.type || !(s.screen === 'playing' || s.screen === 'boss' || s.screen === 'lifeLost')) return;
  const ty = s.typing;
  if (!ty || ty.discardT > 0 || s.time < bot.nextKeyAt) return;
  let target = ty.target;
  if (!target) {
    const list = TG.Entities.typables(s).filter(function (x) { return x.typable && !x.lost && x.typed === 0; });
    if (list.length === 0) return;
    list.sort(function (p, q) { return (p.eta - q.eta) || (p.id - q.id); });
    target = list[0];
    if (s.time < target.shownAt + bot.react) return;
  }
  if (target.typed >= target.word.length) return;
  I.typeChar(target.word.charAt(target.typed));
  bot.nextKeyAt = s.time + 12 / bot.wpm;
}

// Plays with the bot until the screen is `until` (or maxSeconds of steps).
function playUntil(session, until, bot, maxSeconds) {
  const TG = session.TG;
  const limit = Math.round((maxSeconds || 1200) * 60);
  for (let i = 0; i < limit; i++) {
    if (session.screen() === until) return true;
    session.steps(1, bot);
  }
  return session.screen() === until;
}

// From boot to the first step of play, through the menus, as a player does it.
function startRun(session, difficulty) {
  const want = difficulty || 'medium';
  session.frames(2);
  session.press('enter');                        // boot -> title
  session.seconds(1.3);                          // the logo is stamped
  session.press('enter');                        // START -> difficultySelect
  session.type(want);                            // typing the name selects and confirms it
  session.type('ready');                         // howToPlay -> playing
  return session.screen() === 'playing';
}

// Brings a session to `screen` and returns it. opts: { difficulty, panel, page, wait }.
function reach(session, screen, opts) {
  const o = opts || {};
  const s = session;
  if (screen === 'boot') {
    s.frames(20);
  } else if (screen === 'title') {
    s.frames(2);
    s.press('enter');
    s.seconds(1.5);
    if (o.panel === 'options') { s.press('down'); s.press('down'); s.press('down'); s.press('enter'); }
    if (o.panel === 'scores') { s.press('down'); s.press('down'); s.press('enter'); }
    if (o.panel === 'story') s.seconds(12.5);
  } else if (screen === 'difficultySelect') {
    s.frames(2);
    s.press('enter');
    s.seconds(1.3);
    s.press('enter');
    s.seconds(0.4);
  } else if (screen === 'howToPlay') {
    s.frames(2);
    s.press('enter');
    s.seconds(1.3);
    s.press('enter');
    s.type(o.difficulty || 'medium');
    s.type('re');
    s.seconds(0.6);
  } else if (screen === 'paused') {
    startRun(s, o.difficulty);
    s.steps(60 * 22, createBot());
    s.frame();
    s.press('esc');
    s.frames(6);
  } else if (screen === 'gameOver') {
    startRun(s, o.difficulty || 'hard');
    playUntil(s, 'gameOver', createBot({ type: false }), 400);
    s.seconds(2);
  } else if (screen === 'results' || screen === 'highScoreEntry') {
    startRun(s, o.difficulty);
    const bot = createBot();
    playUntil(s, 'results', bot, 1500);
    s.seconds(4.5);
    if (screen === 'results' && Number(o.page) === 2) {
      s.press('enter');
      s.seconds(2);
    }
    if (screen === 'highScoreEntry') {
      for (let i = 0; i < 6 && s.screen() === 'results'; i++) { s.press('enter'); s.seconds(0.3); }
      s.type('ab');
      s.frames(10);
    }
  } else {
    throw new Error('shot-ui: unknown screen ' + screen);
  }
  if (o.wait) s.seconds(Number(o.wait));
  return s;
}

function shoot(screen, out, opts) {
  const o = opts || {};
  const s = createSession({ canvas: 'soft' });
  reach(s, screen, o);
  const pic = s.picture(o.scale || 3);
  png.write(out, pic.width, pic.height, pic.rgba);
  return { screen: s.screen(), errors: s.env.errors.slice(), warnings: s.env.warnings.slice(), file: out };
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.indexOf('--') !== 0) throw new Error('unexpected argument ' + a);
    const k = a.slice(2);
    const v = argv[i + 1];
    if (v === undefined || v.indexOf('--') === 0) throw new Error('--' + k + ' needs a value');
    o[k] = v;
    i++;
  }
  return o;
}

function main(argv) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    console.error('shot-ui: ' + e.message);
    return 1;
  }
  if (!o.screen || !o.out) {
    console.error('usage: node tools/shot-ui.js --screen ' + SCREENS.join('|') + '|all --out <file.png> [--scale 3]');
    return 1;
  }
  const scale = o.scale === undefined ? 3 : Number(o.scale);
  if (!Number.isInteger(scale) || scale < 1 || scale > 8) {
    console.error('shot-ui: --scale must be a whole number from 1 to 8');
    return 1;
  }
  const list = o.screen === 'all' ? SCREENS : [o.screen];
  if (list.some(function (n) { return SCREENS.indexOf(n) === -1; })) {
    console.error('shot-ui: unknown screen ' + o.screen + '; use ' + SCREENS.join(', ') + ' or all');
    return 1;
  }
  let status = 0;
  for (const name of list) {
    const file = o.screen === 'all' ? path.join(o.out, name + '.png') : o.out;
    if (o.screen === 'all') fs.mkdirSync(o.out, { recursive: true });
    try {
      const r = shoot(name, file, { scale: scale, difficulty: o.difficulty, panel: o.panel, page: o.page, wait: o.wait });
      const state = r.screen === name ? '' : ' (the game is on ' + r.screen + ')';
      console.log('wrote ' + file + state + (r.errors.length ? '; console errors: ' + r.errors.length : ''));
      r.errors.slice(0, 5).forEach(function (m) { console.log('  error: ' + m); });
      if (r.screen !== name || r.errors.length) status = 2;
    } catch (e) {
      console.error('shot-ui: ' + name + ': ' + (e && e.stack ? e.stack : e));
      status = 2;
    }
  }
  return status;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { SCREENS, keyEvent, createSession, createBot, botStep, playUntil, startRun, reach, shoot, main };
