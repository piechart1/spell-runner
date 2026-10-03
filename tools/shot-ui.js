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
//   --panel       title only: menu | options | scores | story | bye (default menu)
//   --page        results only: 1 or 2 (default 1)
//   --wait        extra seconds to let the screen animate before the picture is taken
//
// World scores (docs/LEADERBOARD.md). These options turn them on with a stand-in service that holds
// sample scores in memory (createWorld below). No network request is made.
//   --world       off (default) | ready | loading | failed | empty: the state of the boards.
//                 With --panel scores the panel has its four pages; with --panel options the panel has
//                 the WORLD SCORES line, selected; with --screen highScoreEntry the score is also sent
//   --board       with --panel scores: easy | medium | hard | local, the page to show (default: the
//                 page the panel opens on)
//   --entry       highScoreEntry only: local (default; a whole run, heading NEW HIGH SCORE!) |
//                 world (a short run that misses the local top five, heading WORLD SCORES) |
//                 refused (blocked initials were typed and Enter pressed) |
//                 declined (local, after Esc: the score stays on this computer) |
//                 offered (world, with initials used before: Enter alone sends under them) |
//                 first (world, no initials used before and Enter pressed: they have to be typed)
//   --send        title only: the High Scores panel as it opens after a score was sent.
//                 sending | placed (among the ten rows) | far (a place below the ten rows) |
//                 unkept (a full board, and the run is below its 200 rows) |
//                 failed (saved on this computer) | failed-far (not saved on this computer either) |
//                 refused (the service did not take the score) | busy (its hourly limit) |
//                 down (the service cannot be reached at all; saved on this computer) | down-far
//
// How it works: every game file is loaded under test/stubs.js with the software canvas
// (tools/softcanvas.js), TG.Main.init() starts the page as in a browser, and the screen is reached the
// way a player reaches it: keys are sent as keydown and keyup events, and frames are run through the
// real requestAnimationFrame loop of TG.Main. Long stretches of play are run with TG.Main.tick and a
// small bot (below) that types the words and presses jump and duck. The picture is the game canvas
// after the last frame, drawn by TG.Render (or by the fallback of TG.Main when render.js is absent).
//
// As a module it exports the session, the bot and the stand-in service, which the tests also use.
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

// ---------------------------------------------------------------------------------------------
// A stand-in for the world scores service (docs/LEADERBOARD.md section 3), for pictures and tests.
// Its fetch function makes no network request: it answers from lists kept in memory. It answers at
// once: what it returns has a `then` that calls its handlers straight away, so a reply has arrived
// by the time the call returns, and a picture can be taken in a plain loop of frames.
//
//   createWorld(options) -> world
//   options: lists   { easy, medium, hard }: every stored entry, highest first (default: sampleLists())
//   world.url        the address to put in TG.Board.URL (a name that can never be reached)
//   world.fetch      the network function to give TG.Board
//   world.calls      one { method, path, body, url, init } per request, in order
//   world.lists      the stored entries; an accepted score is added in its place
//   world.hold       true: replies wait until world.release() is called
//   world.holdSend   true: only the reply to POST /v1/scores waits
//   world.down       true: every request fails, as when the service cannot be reached
//   world.downSend   true: only POST /v1/scores fails
//   world.refuse     an error code of LEADERBOARD 6 ('too_soon', 'rate', ...): POST /v1/scores is
//                    answered with that error
//   A board keeps its best 200 entries (KEPT_ROWS), as the service does: a score below them is answered
//   with place 201 of 201 and is not kept.
//   world.release()  lets every waiting reply go
// ---------------------------------------------------------------------------------------------

const WORLD_URL = 'https://world-scores.invalid';
const WORLD_ERRORS = { bad_request: 400, bad_token: 400, expired: 400, name: 400, implausible: 400, too_soon: 400,
  used: 409, too_large: 413, rate: 429, not_found: 404, method: 405, origin: 403, server: 500 };
const KEPT_ROWS = 200;
const SAMPLE_NAMES = ['DAV', 'MIA', 'KAI', 'ZOE', 'LEO', 'AVA', 'SAM', 'IVY', 'MAX', 'EVE', 'JAY', 'AMY', 'BEN', 'UMA',
  'TOM', 'LIV', 'RAY', 'ADA', 'GUS', 'NED', 'PIP', 'INK', 'DOT', 'TAB', 'CAP'];

// `count` entries from `top` points downwards, the same every time.
function sampleList(top, count, wpmTop) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const share = 1 / (1 + 0.25 * i + 0.012 * i * i);
    out.push({
      name: SAMPLE_NAMES[(i * 7 + count) % SAMPLE_NAMES.length],
      score: Math.max(100, Math.round(top * share / 10) * 10),
      wpm: Math.round(wpmTop * (0.45 + 0.55 * share)),
      accuracy: Math.max(71, 100 - Math.floor(i / 3)),
      rank: i < 2 ? 'S' : (i < 9 ? 'A' : (i < 40 ? 'B' : 'C')),
      cleared: i < count * 0.6,
      date: '2026-10-0' + (1 + (i % 3))
    });
  }
  return out;
}

// Scores that the service would accept: each top score is under the cap of its difficulty
// (LEADERBOARD 5), and every rank fits its accuracy.
function sampleLists() {
  return { easy: sampleList(71400, 41, 34), medium: sampleList(138200, 86, 61), hard: sampleList(204800, 23, 96) };
}

// Three boards that are full: 200 entries each, the lowest far above a run of a few seconds.
function fullLists() {
  const full = function (top, wpmTop) {
    const out = sampleList(top, KEPT_ROWS, wpmTop);
    for (let i = 0; i < out.length; i++) out[i].score = Math.round((top - (top - 9000) * i / (out.length - 1)) / 10) * 10;
    return out;
  };
  return { easy: full(71400, 34), medium: full(138200, 61), hard: full(204800, 96) };
}

// What the stand-in's fetch returns: an object with `then`, settled by resolve or reject. Handlers
// are called at once when it is settled, or as soon as they are added if it already is.
function instant() {
  const p = { settled: null, value: undefined, handlers: [] };
  function run() {
    if (!p.settled) return;
    const list = p.handlers.splice(0, p.handlers.length);
    for (const h of list) {
      const fn = p.settled === 'resolved' ? h[0] : h[1];
      if (typeof fn === 'function') fn(p.value);
    }
  }
  p.then = function (onOk, onFail) {
    p.handlers.push([onOk, onFail]);
    run();
  };
  p.resolve = function (value) {
    if (p.settled) return;
    p.settled = 'resolved';
    p.value = value;
    run();
  };
  p.reject = function (error) {
    if (p.settled) return;
    p.settled = 'rejected';
    p.value = error;
    run();
  };
  return p;
}

// A reply as TG.Board reads it: a status and the body as text.
function reply(status, data) {
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  return {
    status: status,
    ok: status >= 200 && status < 300,
    text: function () {
      const p = instant();
      p.resolve(text);
      return p;
    }
  };
}

function createWorld(options) {
  const o = options || {};
  const w = {
    url: WORLD_URL, calls: [], lists: o.lists || sampleLists(),
    hold: false, holdSend: false, down: false, downSend: false, refuse: null,
    tokens: {}, issued: 0, waiting: []
  };

  function top(difficulty) {
    return w.lists[difficulty].slice(0, 10);
  }

  // The service's answer to one request: { status, data }.
  w.answer = function (call) {
    if (call.method === 'GET' && call.path === '/v1/scores') {
      return { status: 200, data: { ok: true, easy: top('easy'), medium: top('medium'), hard: top('hard') } };
    }
    if (call.method === 'POST' && call.path === '/v1/runs') {
      if (!call.body || !w.lists[call.body.difficulty]) return { status: 400, data: { ok: false, error: 'bad_request' } };
      const token = 'run-' + (++w.issued) + '.' + call.body.difficulty;
      w.tokens[token] = call.body.difficulty;
      return { status: 200, data: { ok: true, token: token, expires: 10800 } };
    }
    if (call.method === 'POST' && call.path === '/v1/scores') {
      if (w.refuse) return { status: WORLD_ERRORS[w.refuse] || 400, data: { ok: false, error: w.refuse } };
      const b = call.body || {};
      const difficulty = w.tokens[b.token];
      if (!difficulty) return { status: 400, data: { ok: false, error: 'bad_token' } };
      delete w.tokens[b.token];
      const list = w.lists[difficulty];
      let at = list.length;
      for (let i = 0; i < list.length; i++) {
        if (b.score > list[i].score) { at = i; break; }
      }
      list.splice(at, 0, { name: b.name, score: b.score, wpm: b.wpm, accuracy: b.accuracy, rank: b.rank, cleared: b.cleared, date: '2026-10-03' });
      const total = list.length;
      if (list.length > KEPT_ROWS) list.length = KEPT_ROWS;      // place and total are from before the cut
      return { status: 200, data: { ok: true, place: at + 1, total: total, difficulty: difficulty, scores: top(difficulty) } };
    }
    return { status: 404, data: { ok: false, error: 'not_found' } };
  };

  w.fetch = function (url, init) {
    const i = init || {};
    const text = String(url);
    const call = {
      url: text, method: i.method || 'GET', path: text.indexOf(w.url) === 0 ? text.slice(w.url.length) : text,
      body: typeof i.body === 'string' ? JSON.parse(i.body) : null, init: i
    };
    w.calls.push(call);
    const p = instant();
    const send = call.method === 'POST' && call.path === '/v1/scores';
    const settle = function () {
      if (w.down || (send && w.downSend)) {
        p.reject(new Error('the stand-in service is down'));
        return;
      }
      const a = w.answer(call);
      p.resolve(reply(a.status, a.data));
    };
    if (w.hold || (send && w.holdSend)) w.waiting.push(settle);
    else settle();
    return p;
  };

  w.release = function () {
    const list = w.waiting.splice(0, w.waiting.length);
    for (const settle of list) settle();
  };

  return w;
}

// A browser-like session: all files, the software (or stub) canvas, TG.Main.init(), a frame clock.
// options: { canvas: 'soft' | 'stub', files, storage, width, height, dpr, quiet, world, fetch, boardUrl }
//   world: a stand-in service from createWorld. Its fetch becomes window.fetch and its address
//   TG.Board.URL before the page starts, so world scores are on; TG.Board's clock is then the session's
//   own time (session.clock), so that nothing depends on how long the tool takes to run.
//   fetch: a function to put at window.fetch before the page starts, as a browser has one.
//   boardUrl: a value for TG.Board.URL, set before the page starts. The tests use the two together,
//   with boardUrl '', to see that no request is made while the address is empty.
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
  if (o.fetch) env.window.fetch = o.fetch;
  if (o.boardUrl !== undefined && TG.Board) TG.Board.URL = o.boardUrl;
  if (o.world) {
    env.window.fetch = o.world.fetch;
    TG.Board.URL = o.world.url;
  }
  TG.Main.init();
  const s = { env: env, TG: TG, ms: 0, playMs: 0, world: o.world || null };
  // ms since the session began: the frames shown plus the steps run without drawing.
  s.clock = function () {
    return s.ms + s.playMs;
  };
  if (o.world) TG.Board.init({ fetch: o.world.fetch, now: s.clock });
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
      s.playMs += FRAME_MS;
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

// A run that ends on the results screen with the tally finished. short: the bot plays until the
// score is 2,000 or more (under the lowest seeded score of every difficulty) and the run is ended
// from the pause menu; otherwise the bot plays the level to its end.
function finishRun(session, difficulty, short) {
  const s = session;
  startRun(s, difficulty);
  const bot = createBot();
  if (short) {
    for (let i = 0; i < 60 * 120 && s.screen() === 'playing' && s.TG.Game.state.score < 2000; i++) s.steps(1, bot);
    s.frame();
    s.press('esc');
    s.press('up');                               // from RESUME round to QUIT
    s.press('enter');
    s.press('enter');                            // QUIT asks for a second Enter
  } else {
    playUntil(s, 'results', bot, 1500);
  }
  s.seconds(4.5);
  return s.screen() === 'results';
}

// From the results screen to the initials screen (or the title, when the run earns no entry). On the
// initials screen it waits until Enter and Esc are read (0.5 s while world scores are on).
function leaveResults(session) {
  const s = session;
  for (let i = 0; i < 6 && s.screen() === 'results'; i++) { s.press('enter'); s.seconds(0.3); }
  if (s.screen() === 'highScoreEntry') s.seconds(0.3);
}

// Brings a session to `screen` and returns it. opts: { difficulty, panel, page, wait, world, board, entry, send }.
// world, board, entry and send are the options of the same names in the header; they need a session
// made with a stand-in service (createSession({ world: createWorld() })).
function reach(session, screen, opts) {
  const o = opts || {};
  const s = session;
  const w = s.world;
  if (screen === 'boot') {
    s.frames(20);
  } else if (screen === 'title' && o.send) {
    if (!w) throw new Error('shot-ui: --send needs --world');
    const far = o.send === 'far' || o.send === 'failed-far' || o.send === 'unkept' || o.send === 'down-far';
    finishRun(s, o.difficulty, far);
    leaveResults(s);
    if (o.send === 'sending') w.holdSend = true;
    if (o.send === 'failed' || o.send === 'failed-far') w.downSend = true;
    if (o.send === 'refused') w.refuse = 'implausible';
    if (o.send === 'busy') w.refuse = 'rate';
    if (o.send === 'down' || o.send === 'down-far') w.down = true;
    s.type('dav');
    s.press('enter');
    s.seconds(0.7);                                // past the time in which the page reads no keys
  } else if (screen === 'title') {
    s.frames(2);
    s.press('enter');
    s.seconds(1.5);
    if (o.panel === 'options') {
      s.press('down'); s.press('down'); s.press('down'); s.press('enter');
      if (w) for (let i = 0; i < 6; i++) s.press('down');          // to the WORLD SCORES line
    }
    if (o.panel === 'scores') {
      if (w && o.world === 'loading') w.hold = true;
      if (w && o.world === 'failed') w.down = true;
      s.press('down'); s.press('down'); s.press('enter');
      // Left goes round the four pages, whatever state the boards are in.
      for (let i = 0; i < 4 && o.board && s.TG.UI.page !== o.board; i++) s.press('left');
    }
    if (o.panel === 'story') s.seconds(12.5);
    if (o.panel === 'bye') { for (let i = 0; i < 4; i++) s.press('down'); s.press('enter'); s.seconds(0.6); }   // EXIT
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
    const worldEntry = o.entry === 'world' || o.entry === 'offered' || o.entry === 'first';
    if (o.entry === 'offered') s.TG.Save.setSetting('initials', 'DAV');
    finishRun(s, o.difficulty, screen === 'highScoreEntry' && worldEntry);
    if (screen === 'results' && Number(o.page) === 2) {
      s.press('enter');
      s.seconds(2);
    }
    if (screen === 'highScoreEntry') {
      leaveResults(s);
      if (o.entry === 'refused') {
        s.type(REFUSED_SAMPLE);
        s.press('enter');
        s.frames(4);                               // the boxes are still shaking
      } else if (o.entry === 'declined') {
        s.press('esc');
        s.type('dav');
        s.frames(10);
      } else if (o.entry === 'offered') {
        s.frames(10);
      } else if (o.entry === 'first') {
        s.press('enter');
        s.seconds(0.5);                            // the boxes have stopped shaking
      } else {
        s.type('ab');
        s.frames(10);
      }
    }
  } else {
    throw new Error('shot-ui: unknown screen ' + screen);
  }
  if (o.wait) s.seconds(Number(o.wait));
  return s;
}

// Initials on the block list, typed for the picture of the refusal (a mild entry of the list).
const REFUSED_SAMPLE = 'bum';

const WORLD_STATES = ['off', 'ready', 'loading', 'failed', 'empty'];
const BOARD_PAGES = ['easy', 'medium', 'hard', 'local'];
const ENTRY_KINDS = ['local', 'world', 'refused', 'declined', 'offered', 'first'];
const SEND_KINDS = ['sending', 'placed', 'far', 'unkept', 'failed', 'failed-far', 'refused', 'busy', 'down', 'down-far'];

// The stand-in service for the options of a picture, or null when world scores are off.
function worldFor(o) {
  const state = o.world === undefined ? 'off' : o.world;
  if (WORLD_STATES.indexOf(state) === -1) throw new Error('--world must be one of ' + WORLD_STATES.join(', '));
  if (o.board !== undefined && BOARD_PAGES.indexOf(o.board) === -1) throw new Error('--board must be one of ' + BOARD_PAGES.join(', '));
  if (o.entry !== undefined && ENTRY_KINDS.indexOf(o.entry) === -1) throw new Error('--entry must be one of ' + ENTRY_KINDS.join(', '));
  if (o.send !== undefined && SEND_KINDS.indexOf(o.send) === -1) throw new Error('--send must be one of ' + SEND_KINDS.join(', '));
  if (state === 'off') {
    if (o.board || o.send || (o.entry && o.entry !== 'local')) throw new Error('--board, --send and --entry need --world');
    return null;
  }
  if (o.send === 'unkept') return createWorld({ lists: fullLists() });
  return createWorld(state === 'empty' ? { lists: { easy: [], medium: [], hard: [] } } : {});
}

function shoot(screen, out, opts) {
  const o = opts || {};
  const s = createSession({ canvas: 'soft', world: worldFor(o) });
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
      const r = shoot(name, file, { scale: scale, difficulty: o.difficulty, panel: o.panel, page: o.page, wait: o.wait,
        world: o.world, board: o.board, entry: o.entry, send: o.send });
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

module.exports = { SCREENS, keyEvent, createSession, createBot, botStep, playUntil, startRun, finishRun, leaveResults, reach, shoot, main,
  createWorld, sampleLists, fullLists, worldFor, WORLD_URL, KEPT_ROWS };
