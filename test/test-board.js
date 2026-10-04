// test/test-board.js
// Tests for js/board.js (TG.Board), the game side of the world scores. Run from the project root:
//
//   node test/test-board.js
//
// docs/LEADERBOARD.md section 9 and docs/CONTRACT.md section 4.22 are what these tests hold the
// module to. No network request is made: TG.Board gets a stand-in for the browser's fetch and a clock
// that the test moves by hand.
//
// The stand-in service is createWorld() of tools/shot-ui.js. It answers at once: what its fetch
// returns calls its `then` handlers straight away, so a reply has arrived when the call returns and
// most checks read as plain sequences. world.hold keeps replies back until world.release(), which
// is how late replies and timeouts are tested. Section 9 runs the same paths with real promises.
//
// Sections:
//   1. the module: its shape, the block list, what it may and may not use
//   2. off: an empty address, the setting, no fetch
//   3. the run token
//   4. sending a score
//   5. loading the boards
//   6. cleaning what the service sends
//   7. nothing throws and nothing hands back a promise
//   8. TG.Main: the hand-over of fetch and the clock, and update() once per frame
//   9. real promises
//
// Prints one line per check (ok / FAIL) and exits with 0 when every check passed.
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');
const stubs = require('./stubs');
const shot = require('../tools/shot-ui');

const ROOT = stubs.ROOT;
const DIFFS = ['easy', 'medium', 'hard'];
const ENTRY = { name: 'DAV', score: 48210, wpm: 28, accuracy: 95, rank: 'A', cleared: true, date: '2026-10-03' };
const RESULT = { difficulty: 'medium', score: 48210, time: 301.4, cleared: true, rank: 'A' };
const ENTRY_KEYS = ['name', 'score', 'wpm', 'accuracy', 'rank', 'cleared', 'date'];

let passed = 0;
let failed = 0;
let finished = false;
let current = '';
const unhandled = [];

process.on('unhandledRejection', function (reason) {
  unhandled.push(String(reason && reason.stack ? reason.stack : reason));
});

// Node ends a process whose pending work can never finish with exit code 0. If that happens before
// the summary line, the file has not passed.
process.on('exit', function () {
  if (finished) return;
  console.log('FAIL - test-board.js ended during "' + current + '" without finishing');
  process.exitCode = 1;
});

async function check(name, fn) {
  current = name;
  try {
    await fn();
    passed++;
    console.log('ok - ' + name);
  } catch (e) {
    failed++;
    console.log('FAIL - ' + name);
    console.log('    ' + String(e && e.stack ? e.stack : e).split('\n').slice(0, 6).join('\n    '));
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// TG.Board on its own (core.js and board.js) with the stand-in service and a clock the test moves.
// options: url (default: the stand-in's address; '' leaves world scores off), fetch (default: the
// stand-in's; null for a browser without fetch), lists (the stand-in's stored entries), setting
// (the worldScores setting, default true).
function board(options) {
  const o = options || {};
  const env = stubs.load({ files: ['js/core.js', 'js/board.js'] });
  const TG = env.TG;
  const world = shot.createWorld(o.lists ? { lists: o.lists } : {});
  const t = { env: env, TG: TG, B: TG.Board, world: world, now: 1000000 };
  TG.Board.URL = o.url === undefined ? world.url : o.url;
  if (o.setting === false) TG.Save.setSetting('worldScores', false);
  TG.Board.init({ fetch: o.fetch === undefined ? world.fetch : o.fetch, now: function () { return t.now; } });
  // Lets time pass, as TG.Main does once per frame.
  t.wait = function (seconds) {
    t.now += Math.round(seconds * 1000);
    TG.Board.update(seconds);
  };
  t.state = function () { return stubs.plain(TG.Board.state); };
  t.paths = function () { return world.calls.map(function (c) { return c.method + ' ' + c.path; }); };
  // A token for the difficulty, held.
  t.token = function (difficulty) {
    TG.Board.startRun(difficulty || 'medium');
    assert.strictEqual(TG.Board.hasToken(difficulty || 'medium'), true, 'the token was not given');
  };
  return t;
}

function isCleanEntry(e) {
  return e && typeof e === 'object' && JSON.stringify(Object.keys(e)) === JSON.stringify(ENTRY_KEYS) &&
    /^[A-Z]{3}$/.test(e.name) &&
    Number.isInteger(e.score) && e.score >= 0 && e.score <= 9999999 &&
    Number.isInteger(e.wpm) && e.wpm >= 0 && e.wpm <= 999 &&
    Number.isInteger(e.accuracy) && e.accuracy >= 0 && e.accuracy <= 100 &&
    ['S', 'A', 'B', 'C'].indexOf(e.rank) !== -1 && typeof e.cleared === 'boolean' &&
    (e.date === '' || /^\d{4}-\d{2}-\d{2}$/.test(e.date));
}

function tick() {
  return new Promise(function (resolve) { setImmediate(resolve); });
}

async function settle() {
  for (let i = 0; i < 5; i++) await tick();
}

async function main() {
  // ===============================================================================================
  // 1. The module
  // ===============================================================================================

  await check('board.js follows the module pattern of CONTRACT 2.1 and does nothing at load time, with or without core.js', function () {
    const src = read('js/board.js');
    assert.ok(/^\(function \(root\) \{\n  'use strict';\n  var TG = root\.TG = root\.TG \|\| \{\};/m.test(src), 'IIFE head');
    assert.ok(/\}\)\(typeof window !== 'undefined' \? window : globalThis\);\s*$/.test(src), 'IIFE tail');
    [['js/board.js'], ['js/core.js', 'js/board.js']].forEach(function (files) {
      const env = stubs.load({ files: files });
      assert.deepStrictEqual(env.missing, []);
      assert.strictEqual(env.canvasCalls.count, 0);
      assert.strictEqual(env.timers.length, 0);
      assert.strictEqual(env.raf.length, 0);
      assert.strictEqual(env.storage.size, 0);
      assert.strictEqual(Object.keys(env.listeners).length, 0);
      assert.deepStrictEqual(env.errors.concat(env.warnings), []);
      assert.strictEqual(typeof env.TG.Board, 'object');
      assert.strictEqual(env.TG.Board.enabled(), false, 'off before init');
    });
  });

  await check('board.js never touches the window, the document, storage, timers or the clock: only what init gives it', function () {
    const code = read('js/board.js').split('\n').map(function (line) { return line.replace(/\/\/.*$/, ''); }).join('\n');
    const banned = [/\bwindow\.(?!TG\b)/, /\bdocument\b/, /localStorage/, /sessionStorage/, /setTimeout|setInterval/, /requestAnimationFrame/,
      /\bDate\b/, /performance\b/, /Math\.random/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /\bnavigator\b/,
      /\bcookie\b/, /\bimport\s*\(/, /\beval\b/, /new\s+Function/];
    banned.forEach(function (re) { assert.ok(!re.test(code), 'board.js uses ' + re); });
    // The network function is called in one place, and its address is built from TG.Board.URL. It is
    // the function init was given, never a global one.
    const calls = code.match(/\bfetch\s*\(/g) || [];
    assert.strictEqual(calls.length, 1, 'fetch( appears ' + calls.length + ' times');
    assert.ok(/net\.fetch\(baseUrl\(\) \+ path, options\)/.test(code), 'the one call is not net.fetch(baseUrl() + path, options)');
    assert.ok(/net\.fetch = typeof o\.fetch === 'function' \? o\.fetch : null;/.test(code), 'net.fetch is not what init was given');
    assert.strictEqual((code.match(/net\.fetch\s*=[^=]/g) || []).length, 1, 'net.fetch is set in more than one place');
    assert.ok(!/\b(window|root|globalThis|self)\.fetch\b/.test(code), 'a global fetch is used');
  });

  await check('TG.Board has the names of LEADERBOARD 9; URL is a string, empty or an https address; the state has its fields', function () {
    const env = stubs.load({ files: ['js/core.js', 'js/board.js'] });
    const B = env.TG.Board;
    // Empty until a service is deployed. test/test-integration.js holds a value to https and .workers.dev.
    assert.strictEqual(typeof B.URL, 'string');
    assert.ok(B.URL === '' || /^https:\/\/[^/]+$/.test(B.URL), 'TG.Board.URL is ' + B.URL);
    assert.ok(Object.getOwnPropertyDescriptor(B, 'URL').writable, 'TG.Board.URL is a plain value');
    ['init', 'update', 'available', 'enabled', 'startRun', 'hasToken', 'submit', 'refresh', 'blocked'].forEach(function (fn) {
      assert.strictEqual(typeof B[fn], 'function', 'TG.Board.' + fn);
    });
    assert.deepStrictEqual(stubs.plain(B.state), {
      boards: 'off', lists: { easy: [], medium: [], hard: [] }, send: 'none', sendError: null, place: 0, total: 0, kept: true,
      sentDifficulty: null, sentEntry: null
    });
    assert.strictEqual(B.TIMEOUT_MS, 6000);
    assert.strictEqual(B.REFRESH_MS, 30000);
    // The limits of the service that the game follows (LEADERBOARD 4 and 5).
    assert.strictEqual(B.MIN_TIME, 10);
    assert.strictEqual(B.SEND_MAX_WPM, 220);
    assert.strictEqual(B.KEPT_ROWS, 200);
  });

  await check('The limits of the service that js/board.js copies (shortest run, highest WPM, rows kept) equal RULES in server/src/worker.js', async function () {
    const W = await import(pathToFileURL(path.join(ROOT, 'server', 'src', 'worker.js')).href);
    const env = stubs.load({ files: ['js/core.js', 'js/board.js'] });
    const B = env.TG.Board;
    assert.ok(W.RULES && typeof W.RULES === 'object', 'server/src/worker.js exports no RULES: check MIN_TIME, SEND_MAX_WPM and KEPT_ROWS of js/board.js by hand');
    assert.strictEqual(B.MIN_TIME, W.RULES.minTime, 'the shortest run the service accepts (LEADERBOARD 5, check 7)');
    assert.strictEqual(B.SEND_MAX_WPM, W.RULES.maxWpm, 'the highest WPM the service accepts (LEADERBOARD 5, check 6)');
    assert.strictEqual(B.KEPT_ROWS, W.RULES.keep, 'the rows the service keeps per board (LEADERBOARD 4)');
  });

  await check('The block list in js/board.js equals the array in server/src/blocklist.js', async function () {
    const server = await import(pathToFileURL(path.join(ROOT, 'server', 'src', 'blocklist.js')).href);
    const env = stubs.load({ files: ['js/core.js', 'js/board.js'] });
    const own = stubs.plain(env.TG.Board.BLOCKLIST);
    assert.ok(Array.isArray(server.BLOCKLIST) && server.BLOCKLIST.length > 0, 'the server list was not read');
    assert.deepStrictEqual(own, Array.from(server.BLOCKLIST));
    assert.ok(Object.isFrozen(env.TG.Board.BLOCKLIST), 'TG.Board.BLOCKLIST can be changed');
    // The array in the source text too, so that the comparison does not depend on how it is exported.
    const text = /export const BLOCKLIST = \[([\s\S]*?)\];/.exec(read('server/src/blocklist.js'));
    assert.ok(text, 'the array was not found in the server file');
    assert.deepStrictEqual(own, text[1].match(/[A-Z]{3}/g));
  });

  await check('blocked(): true for every entry in any letter case, false for other names and for values that are not strings', function () {
    const t = board();
    const list = stubs.plain(t.B.BLOCKLIST);
    list.forEach(function (name) {
      assert.strictEqual(t.B.blocked(name), true, name);
      assert.strictEqual(t.B.blocked(name.toLowerCase()), true, name.toLowerCase());
    });
    ['DAV', 'ABC', 'ZZZ', '', 'AS', 'ASSS'].forEach(function (name) { assert.strictEqual(t.B.blocked(name), false, name); });
    [undefined, null, 5, {}, ['ASS'], true].forEach(function (v) { assert.strictEqual(t.B.blocked(v), false, String(v)); });
    // The names the game itself puts on a table: the default initials and the seeded entries.
    const seeded = stubs.plain(t.TG.Save.defaults());
    const names = [seeded.settings.initials];
    DIFFS.forEach(function (d) { seeded.scores[d].forEach(function (e) { names.push(e.name); }); });
    names.forEach(function (name) { assert.strictEqual(t.B.blocked(name), false, name + ' is on the block list'); });
    // blocked() does not depend on world scores being on.
    assert.strictEqual(board({ url: '' }).B.blocked(list[0]), true);
  });

  // ===============================================================================================
  // 2. Off
  // ===============================================================================================

  await check('Empty URL: off. enabled() and available() are false, the state is "off", and no function makes a request', function () {
    const t = board({ url: '' });
    assert.strictEqual(t.B.available(), false);
    assert.strictEqual(t.B.enabled(), false);
    t.B.startRun('medium');
    assert.strictEqual(t.B.hasToken('medium'), false);
    t.B.submit(ENTRY, RESULT);
    t.B.refresh();
    t.B.refresh(true);
    t.wait(10);
    assert.strictEqual(t.world.calls.length, 0, 'requests: ' + t.paths().join(', '));
    assert.deepStrictEqual(t.state(), {
      boards: 'off', lists: { easy: [], medium: [], hard: [] }, send: 'none', sendError: null, place: 0, total: 0, kept: true,
      sentDifficulty: null, sentEntry: null
    });
  });

  await check('Empty URL, the whole game: boot, options, high scores, a run to its end, initials, the title and its idle rotation make no request', function () {
    let calls = 0;
    const s = shot.createSession({ canvas: 'stub', boardUrl: '', fetch: function () { calls++; throw new Error('a request was made'); } });
    const TG = s.TG;
    assert.strictEqual(TG.Board.URL, '');
    assert.strictEqual(TG.Board.available(), false);
    s.frames(2);
    s.press('enter');                              // boot -> title
    s.seconds(1.3);
    s.press('down'); s.press('down'); s.press('enter');   // HIGH SCORES
    assert.strictEqual(TG.UI.panel, 'scores');
    assert.strictEqual(TG.UI.page, null, 'the panel has no pages');
    s.press('right');
    s.press('left');
    assert.strictEqual(TG.UI.page, null);
    s.press('esc');
    s.press('down'); s.press('enter');             // OPTIONS
    assert.strictEqual(TG.UI.panel, 'options');
    for (let i = 0; i < 7; i++) s.press('down');   // eight lines: seven steps reach BACK
    s.press('enter');
    assert.strictEqual(TG.UI.panel, 'menu', 'BACK is the eighth line: there is no WORLD SCORES line');
    s.press('up'); s.press('up'); s.press('up');   // back to START
    s.press('enter');
    assert.strictEqual(s.screen(), 'difficultySelect');
    s.type('easy');
    s.type('ready');
    assert.strictEqual(s.screen(), 'playing');
    assert.ok(shot.playUntil(s, 'results', shot.createBot({ wpm: 70 }), 1500), 'the run ended on ' + s.screen());
    s.seconds(4.5);
    shot.leaveResults(s);
    assert.strictEqual(s.screen(), 'highScoreEntry');
    s.type('xyz');
    s.press('enter');
    assert.strictEqual(s.screen(), 'title');
    assert.strictEqual(TG.UI.panel, 'scores');
    assert.strictEqual(TG.UI.page, null);
    s.press('esc');
    s.seconds(12.5);
    assert.strictEqual(TG.UI.panel, 'story');
    s.seconds(8.2);
    assert.strictEqual(TG.UI.panel, 'scores');
    assert.strictEqual(TG.UI.page, null);
    assert.strictEqual(calls, 0, 'the game made ' + calls + ' requests');
    assert.strictEqual(TG.Board.state.boards, 'off');
    assert.strictEqual(TG.Board.state.send, 'none');
    assert.deepStrictEqual(s.env.errors, []);
  });

  await check('The setting off: available() stays true, enabled() is false and no request is made; on again, requests are made', function () {
    const t = board({ setting: false });
    assert.strictEqual(t.B.available(), true);
    assert.strictEqual(t.B.enabled(), false);
    assert.strictEqual(t.B.state.boards, 'off');
    t.B.startRun('easy');
    t.B.submit(ENTRY, RESULT);
    t.B.refresh(true);
    t.wait(1);
    assert.strictEqual(t.world.calls.length, 0);
    t.TG.Save.setSetting('worldScores', true);
    assert.strictEqual(t.B.enabled(), true);
    assert.strictEqual(t.B.state.boards, 'idle');
    t.B.refresh();
    assert.deepStrictEqual(t.paths(), ['GET /v1/scores']);
    assert.strictEqual(t.B.state.boards, 'ready');
  });

  await check('Switching the setting off drops the token, the lists and the last send, and a reply still in flight is ignored', function () {
    const t = board();
    t.token('medium');
    t.B.refresh();
    t.B.submit(ENTRY, RESULT);
    assert.strictEqual(t.B.state.send, 'sent');
    assert.ok(t.B.state.lists.medium.length > 0);
    t.token('hard');
    t.world.hold = true;
    t.B.refresh(true);
    t.B.submit(Object.assign({}, ENTRY), Object.assign({}, RESULT, { difficulty: 'hard' }));
    assert.strictEqual(t.B.state.send, 'sending');
    t.TG.Save.setSetting('worldScores', false);
    t.wait(0.1);
    assert.deepStrictEqual(t.state(), {
      boards: 'off', lists: { easy: [], medium: [], hard: [] }, send: 'none', sendError: null, place: 0, total: 0, kept: true,
      sentDifficulty: null, sentEntry: null
    });
    t.world.hold = false;
    t.world.release();
    assert.strictEqual(t.B.state.boards, 'off', 'a reply that arrived after the switch changed the state');
    assert.strictEqual(t.B.state.send, 'none');
    assert.strictEqual(t.B.state.lists.medium.length, 0);
    t.TG.Save.setSetting('worldScores', true);
    assert.strictEqual(t.B.hasToken(), false, 'the token came back');
  });

  await check('No fetch (an old browser): off, and nothing throws', function () {
    const t = board({ fetch: null });
    assert.strictEqual(t.B.available(), false);
    assert.strictEqual(t.B.enabled(), false);
    t.B.startRun('medium');
    t.B.submit(ENTRY, RESULT);
    t.B.refresh(true);
    t.wait(7);
    assert.strictEqual(t.B.state.boards, 'off');
    assert.strictEqual(t.B.hasToken(), false);
    assert.deepStrictEqual(t.env.errors, []);
    // init with nothing at all, and with values of the wrong kind.
    [undefined, null, {}, { fetch: 'fetch', now: 5 }, 7].forEach(function (arg) {
      t.B.init(arg);
      assert.strictEqual(t.B.enabled(), false);
      t.B.refresh(true);
      t.B.update(1);
    });
  });

  // ===============================================================================================
  // 3. The run token
  // ===============================================================================================

  await check('startRun asks POST <URL>/v1/runs with the difficulty; the token is held for that difficulty only', function () {
    const t = board();
    assert.strictEqual(t.B.hasToken(), false);
    t.B.startRun('hard');
    assert.strictEqual(t.world.calls.length, 1);
    const call = t.world.calls[0];
    assert.strictEqual(call.url, shot.WORLD_URL + '/v1/runs');
    assert.strictEqual(call.method, 'POST');
    assert.deepStrictEqual(call.body, { difficulty: 'hard' });
    assert.deepStrictEqual(stubs.plain(call.init.headers), { 'content-type': 'application/json' });
    assert.strictEqual(call.init.credentials, 'omit', 'no cookies or other credentials are sent');
    assert.strictEqual(call.init.referrerPolicy, 'no-referrer');
    assert.strictEqual(t.B.hasToken('hard'), true);
    assert.strictEqual(t.B.hasToken(), true);
    assert.strictEqual(t.B.hasToken('easy'), false);
    assert.strictEqual(t.B.hasToken('medium'), false);
    // The token is nowhere but in memory.
    assert.strictEqual(t.env.storage.size, 0, 'something was written to storage');
    assert.ok(JSON.stringify(t.state()).indexOf('run-1') === -1, 'the token is in TG.Board.state');
  });

  await check('stat sends POST <URL>/v1/stats with the token and, for an end, the time, cleared and section only; nothing without a token, with the setting off or for another event', function () {
    const t = board();
    t.B.stat('start');
    assert.strictEqual(t.world.calls.length, 0, 'a count was sent without a token');
    t.token('medium');
    t.B.stat('start');
    t.B.stat('end', { time: 317.9, cleared: true, section: 3, name: 'DAV', score: 5 });
    t.B.stat('won');
    t.B.stat('end');
    const sent = t.world.calls.filter(function (c) { return c.path === '/v1/stats'; });
    assert.strictEqual(sent.length, 3);
    const token = sent[0].body.token;
    assert.ok(typeof token === 'string' && token.length > 0);
    assert.deepStrictEqual(sent[0].body, { token: token, event: 'start' });
    assert.deepStrictEqual(sent[1].body, { token: token, event: 'end', time: 317, cleared: true, section: 3 });
    assert.deepStrictEqual(sent[2].body, { token: token, event: 'end', time: 0, cleared: false, section: 0 });
    assert.strictEqual(sent[1].init.credentials, 'omit');
    assert.strictEqual(t.B.hasToken('medium'), true, 'a count used up the token');
    assert.strictEqual(t.state().send, 'none', 'a count changed the state the interface reads');
    // The setting off: nothing is sent.
    const off = board({ setting: false });
    off.B.startRun('easy');
    off.B.stat('start');
    assert.strictEqual(off.world.calls.length, 0);
    // No network function, or one that throws: nothing throws.
    const none = board({ fetch: null });
    none.B.stat('start');
    const bad = board({ fetch: function () { throw new Error('no network'); } });
    bad.B.stat('end', {});
  });

  await check('startRun with an unknown difficulty makes no request', function () {
    const t = board();
    [undefined, null, 'extreme', '', 3, {}, ['easy']].forEach(function (d) { t.B.startRun(d); });
    assert.strictEqual(t.world.calls.length, 0);
    assert.strictEqual(t.B.hasToken(), false);
  });

  await check('A late token: a reply after 3 s is taken; a reply after the 6 s timeout is ignored', function () {
    const t = board();
    t.world.hold = true;
    t.B.startRun('medium');
    assert.strictEqual(t.B.hasToken('medium'), false);
    t.wait(3);
    assert.strictEqual(t.B.hasToken('medium'), false);
    t.world.release();
    assert.strictEqual(t.B.hasToken('medium'), true, 'the reply at 3 s was not taken');

    const late = board();
    late.world.hold = true;
    late.B.startRun('medium');
    late.wait(5.9);
    late.wait(0.2);                                // given up at 6 s
    late.world.release();
    assert.strictEqual(late.B.hasToken('medium'), false, 'a reply after the timeout was taken');
    assert.strictEqual(late.world.calls.length, 1, 'the request was made again');
  });

  await check('A failed token request leaves no token: network failure, error status, invalid JSON, wrong shapes', function () {
    const cases = [
      ['network failure', function (w) { w.down = true; }],
      ['status 500', function (w) { w.answer = function () { return { status: 500, data: { ok: false, error: 'server' } }; }; }],
      ['status 400', function (w) { w.answer = function () { return { status: 400, data: { ok: false, error: 'bad_request' } }; }; }],
      ['status 500 with a good body', function (w) { w.answer = function () { return { status: 500, data: { ok: true, token: 'abc.def', expires: 10800 } }; }; }],
      ['not JSON', function (w) { w.answer = function () { return { status: 200, data: '<html>busy</html>' }; }; }],
      ['empty body', function (w) { w.answer = function () { return { status: 200, data: '' }; }; }],
      ['JSON null', function (w) { w.answer = function () { return { status: 200, data: 'null' }; }; }],
      ['an array', function (w) { w.answer = function () { return { status: 200, data: [] }; }; }],
      ['ok false', function (w) { w.answer = function () { return { status: 200, data: { ok: false, token: 'abc.def' } }; }; }],
      ['ok missing', function (w) { w.answer = function () { return { status: 200, data: { token: 'abc.def' } }; }; }],
      ['no token', function (w) { w.answer = function () { return { status: 200, data: { ok: true } }; }; }],
      ['token a number', function (w) { w.answer = function () { return { status: 200, data: { ok: true, token: 12345 } }; }; }],
      ['token an object', function (w) { w.answer = function () { return { status: 200, data: { ok: true, token: { a: 1 } } }; }; }],
      ['token empty', function (w) { w.answer = function () { return { status: 200, data: { ok: true, token: '' } }; }; }],
      ['token too long', function (w) { w.answer = function () { return { status: 200, data: { ok: true, token: 'a'.repeat(401) } }; }; }],
      ['token with other characters', function (w) { w.answer = function () { return { status: 200, data: { ok: true, token: 'abc def\n' } }; }; }]
    ];
    cases.forEach(function (c) {
      const t = board();
      c[1](t.world);
      t.B.startRun('easy');
      assert.strictEqual(t.B.hasToken(), false, c[0] + ': a token is held');
      assert.strictEqual(t.B.state.send, 'none', c[0]);
      assert.deepStrictEqual(t.env.errors, [], c[0]);
      // Without a token nothing is sent.
      t.B.submit(ENTRY, Object.assign({}, RESULT, { difficulty: 'easy' }));
      assert.strictEqual(t.world.calls.length, 1, c[0] + ': a score was sent without a token');
    });
  });

  await check('A later confirm for another difficulty replaces the token, and the reply to the earlier request is ignored', function () {
    const t = board();
    t.token('easy');
    t.B.startRun('hard');
    assert.strictEqual(t.B.hasToken('easy'), false, 'the token for easy is still held');
    assert.strictEqual(t.B.hasToken('hard'), true);

    // Both requests in flight: only the later one counts, whichever reply comes first.
    const two = board();
    two.world.hold = true;
    two.B.startRun('easy');
    two.B.startRun('hard');
    two.world.release();
    assert.strictEqual(two.B.hasToken('easy'), false);
    assert.strictEqual(two.B.hasToken('hard'), true);
    two.B.submit(ENTRY, Object.assign({}, RESULT, { difficulty: 'hard' }));
    assert.strictEqual(two.world.calls[2].body.token, 'run-2.hard', 'the token of the earlier request was sent');

    // The other difficulty is asked for and its request fails: the old token is not used for it.
    const lost = board();
    lost.token('easy');
    lost.world.down = true;
    lost.B.startRun('medium');
    assert.strictEqual(lost.B.hasToken(), false);
  });

  await check('Confirming the same difficulty again keeps the token in hand until the new one arrives, also when the new request fails', function () {
    const t = board();
    t.token('medium');
    t.world.hold = true;
    t.B.startRun('medium');
    assert.strictEqual(t.B.hasToken('medium'), true, 'the token was dropped while the new one is on its way');
    t.world.release();
    t.world.hold = false;
    t.B.submit(ENTRY, RESULT);
    assert.strictEqual(t.world.calls[2].body.token, 'run-2.medium', 'the newer token is the one in use');

    const kept = board();
    kept.token('medium');
    kept.world.down = true;
    kept.B.startRun('medium');
    assert.strictEqual(kept.B.hasToken('medium'), true, 'a failed request took the token away');
  });

  await check('A token is no longer held near the end of its life (the "expires" of the reply, or 3 hours)', function () {
    const t = board();
    t.token('medium');
    t.wait(10800 - 61);
    assert.strictEqual(t.B.hasToken('medium'), true);
    t.wait(2);
    assert.strictEqual(t.B.hasToken('medium'), false, 'a token past its life is still held');
    t.B.submit(ENTRY, RESULT);
    assert.strictEqual(t.world.calls.length, 1, 'a score was sent with a token past its life');

    const short = board();
    const answer = short.world.answer;
    short.world.answer = function (call) {
      const a = answer(call);
      if (call.path === '/v1/runs') a.data.expires = 600;
      return a;
    };
    short.token('easy');
    short.wait(600 - 61);
    assert.strictEqual(short.B.hasToken('easy'), true);
    short.wait(2);
    assert.strictEqual(short.B.hasToken('easy'), false);

    [undefined, '600', null, {}].forEach(function (expires) {
      const none = board();
      none.world.answer = function () { return { status: 200, data: { ok: true, token: 'abc.def', expires: expires } }; };
      none.token('hard');
      none.wait(10800 - 61);
      assert.strictEqual(none.B.hasToken('hard'), true, 'without a number for "expires" a token lasts 3 hours');
      none.wait(2);
      assert.strictEqual(none.B.hasToken('hard'), false);
    });
  });

  // ===============================================================================================
  // 4. Sending a score
  // ===============================================================================================

  await check('submit sends the fields of LEADERBOARD 3.2 and nothing else; the state goes sending, then sent with place, total and the list of the reply', function () {
    const t = board();
    t.token('medium');
    t.world.holdSend = true;
    t.B.submit(ENTRY, RESULT);
    assert.strictEqual(t.B.state.send, 'sending');
    assert.strictEqual(t.B.state.sendError, null);
    assert.strictEqual(t.B.state.sentDifficulty, 'medium');
    assert.deepStrictEqual(stubs.plain(t.B.state.sentEntry), ENTRY);
    assert.strictEqual(t.B.state.place, 0);
    const call = t.world.calls[1];
    assert.strictEqual(call.url, shot.WORLD_URL + '/v1/scores');
    assert.strictEqual(call.method, 'POST');
    assert.deepStrictEqual(call.body, { token: 'run-1.medium', name: 'DAV', score: 48210, wpm: 28, accuracy: 95, rank: 'A', cleared: true, time: 301 });
    assert.strictEqual(call.init.credentials, 'omit');
    assert.strictEqual(t.B.state.lists.medium.length, 0, 'the board changed before the reply');
    t.world.release();
    const st = t.state();
    assert.strictEqual(st.send, 'sent');
    assert.strictEqual(st.sendError, null);
    assert.strictEqual(st.kept, true);
    assert.strictEqual(st.total, 87);
    assert.ok(st.place >= 1 && st.place <= 87);
    assert.strictEqual(st.sentDifficulty, 'medium');
    assert.strictEqual(st.lists.medium.length, 10, 'the list of the reply');
    assert.ok(st.lists.medium.every(isCleanEntry));
    assert.strictEqual(st.place, 1 + t.world.lists.medium.findIndex(function (e) { return e.name === 'DAV' && e.score === 48210; }));
    assert.deepStrictEqual(st.lists.easy, [], 'the other boards are not touched');
    assert.strictEqual(st.boards, 'idle', 'a send does not say that every board is loaded');
  });

  await check('A token works once: a second submit, and a submit with no token or the token of another difficulty, send nothing', function () {
    const t = board();
    t.token('medium');
    t.B.submit(ENTRY, RESULT);
    assert.strictEqual(t.B.hasToken(), false, 'the token is still held after it was sent');
    t.B.submit(ENTRY, RESULT);
    assert.deepStrictEqual(t.paths(), ['POST /v1/runs', 'POST /v1/scores']);
    assert.strictEqual(t.B.state.send, 'sent', 'the second call changed the state');

    const other = board();
    other.B.submit(ENTRY, RESULT);
    other.token('easy');
    other.B.submit(ENTRY, RESULT);                 // a medium run with a token for easy
    assert.deepStrictEqual(other.paths(), ['POST /v1/runs']);
    assert.strictEqual(other.B.state.send, 'none');
    assert.strictEqual(other.B.hasToken('easy'), true, 'the token was used up by a submit that sent nothing');
  });

  await check('submit sends nothing for initials on the block list, or for an entry or a result that is not one', function () {
    const t = board();
    t.token('medium');
    const blocked = stubs.plain(t.B.BLOCKLIST)[0];
    t.B.submit(Object.assign({}, ENTRY, { name: blocked }), RESULT);
    t.B.submit(Object.assign({}, ENTRY, { name: blocked.toLowerCase() }), RESULT);
    [undefined, null, 'DAV', 5, [], {}, { name: 'DAV' }, { name: 'D', score: 5 }, { name: 12, score: 5 }, { name: 'DAV', score: '5' }].forEach(function (entry) {
      t.B.submit(entry, RESULT);
    });
    [undefined, null, 'medium', 5, [], {}].forEach(function (result) { t.B.submit(ENTRY, result); });
    assert.deepStrictEqual(t.paths(), ['POST /v1/runs'], 'something was sent');
    assert.strictEqual(t.B.state.send, 'none');
    assert.strictEqual(t.B.hasToken('medium'), true);
    assert.deepStrictEqual(t.env.errors, []);
  });

  await check('Every error status of LEADERBOARD 6 counts as a failed send, and leaves the boards as they were; sendError says whether the service refused the score, is at its hourly limit or could not be reached', function () {
    const codes = { bad_request: 400, bad_token: 400, expired: 400, name: 400, implausible: 400, too_soon: 400,
      used: 409, too_large: 413, rate: 429, not_found: 404, method: 405, origin: 403, server: 500 };
    const reasons = { bad_request: 'refused', bad_token: 'refused', expired: 'refused', name: 'refused', implausible: 'refused',
      too_soon: 'refused', used: 'refused', too_large: 'refused', rate: 'busy', not_found: 'unreachable', method: 'unreachable',
      origin: 'unreachable', server: 'unreachable' };
    Object.keys(codes).forEach(function (code) {
      const t = board();
      t.B.refresh();
      const before = JSON.stringify(t.state().lists);
      t.token('medium');
      t.world.refuse = code;
      t.world.answer = (function (answer) {
        return function (call) {
          const a = answer(call);
          if (call.path === '/v1/scores' && call.method === 'POST') a.status = codes[code];
          return a;
        };
      })(t.world.answer);
      t.B.submit(ENTRY, RESULT);
      const st = t.state();
      assert.strictEqual(st.send, 'failed', code);
      assert.strictEqual(st.sendError, reasons[code], code);
      assert.strictEqual(st.place, 0, code);
      assert.strictEqual(st.total, 0, code);
      assert.strictEqual(JSON.stringify(st.lists), before, code + ': the boards changed');
      assert.strictEqual(st.boards, 'ready', code);
      assert.strictEqual(t.world.calls[t.world.calls.length - 1].path, '/v1/scores', code);
      assert.deepStrictEqual(t.env.errors, [], code);
    });
    // Other statuses, with a body that looks like an accepted score.
    [100, 199, 301, 302, 304, 403, 418, 502, 503, 0, -1, NaN, undefined, '200'].forEach(function (status) {
      const t = board();
      t.token('medium');
      const answer = t.world.answer;
      t.world.answer = function (call) {
        const a = answer(call);
        if (call.path === '/v1/scores') a.status = status;
        return a;
      };
      t.B.submit(ENTRY, RESULT);
      assert.strictEqual(t.B.state.send, 'failed', 'status ' + status);
      assert.strictEqual(t.B.state.sendError, 'unreachable', 'status ' + status);
    });
    // The reason is read from the status alone: a body that is not JSON does not change it.
    [[400, 'refused'], [409, 'refused'], [413, 'refused'], [429, 'busy'], [500, 'unreachable']].forEach(function (c) {
      const t = board();
      t.token('medium');
      t.world.answer = function () { return { status: c[0], data: '<html>no</html>' }; };
      t.B.submit(ENTRY, RESULT);
      assert.strictEqual(t.B.state.send, 'failed');
      assert.strictEqual(t.B.state.sendError, c[1], 'status ' + c[0]);
    });
    // The next send starts clean, and an accepted one has no error.
    const t = board();
    t.token('medium');
    t.world.refuse = 'rate';
    t.B.submit(ENTRY, RESULT);
    assert.strictEqual(t.B.state.sendError, 'busy');
    t.world.refuse = null;
    t.token('medium');
    t.world.holdSend = true;
    t.B.submit(ENTRY, RESULT);
    assert.strictEqual(t.B.state.send, 'sending');
    assert.strictEqual(t.B.state.sendError, null, 'the error of the send before is still there');
    t.world.release();
    assert.strictEqual(t.B.state.send, 'sent');
    assert.strictEqual(t.B.state.sendError, null);
  });

  await check('A send with no reply fails at 6 s, not before; a reply after that is ignored', function () {
    const t = board();
    t.B.refresh();
    const before = JSON.stringify(t.state().lists);
    t.token('medium');
    t.world.holdSend = true;
    t.B.submit(ENTRY, RESULT);
    t.wait(3);
    t.wait(2.9);
    assert.strictEqual(t.B.state.send, 'sending', 'given up before 6 s');
    t.wait(0.1);
    assert.strictEqual(t.B.state.send, 'failed', 'not given up at 6 s');
    assert.strictEqual(t.B.state.sendError, 'unreachable');
    t.world.release();                             // the service did accept it, but too late
    t.wait(1);
    const st = t.state();
    assert.strictEqual(st.send, 'failed', 'a reply after the timeout changed the state');
    assert.strictEqual(st.place, 0);
    assert.strictEqual(JSON.stringify(st.lists), before, 'a reply after the timeout changed the boards');
    assert.strictEqual(t.world.calls.filter(function (c) { return c.path === '/v1/scores' && c.method === 'POST'; }).length, 1, 'the score was sent again');
  });

  await check('A network failure, a reply that is not JSON and replies of the wrong shape are failed sends', function () {
    const good = function (t) {
      return { ok: true, place: 3, total: 9, difficulty: 'medium', scores: t.world.lists.medium.slice(0, 10) };
    };
    const cases = [
      ['network failure', null],
      ['not JSON', function () { return 'Service Unavailable'; }],
      ['half a JSON text', function () { return '{"ok":true,"place":3,'; }],
      ['empty', function () { return ''; }],
      ['JSON null', function () { return 'null'; }],
      ['a JSON string', function () { return '"ok"'; }],
      ['an array', function (t) { return [good(t)]; }],
      ['ok missing', function (t) { const d = good(t); delete d.ok; return d; }],
      ['ok false', function (t) { return Object.assign(good(t), { ok: false }); }],
      ['ok "true"', function (t) { return Object.assign(good(t), { ok: 'true' }); }],
      ['place missing', function (t) { const d = good(t); delete d.place; return d; }],
      ['place 0', function (t) { return Object.assign(good(t), { place: 0 }); }],
      ['place negative', function (t) { return Object.assign(good(t), { place: -4 }); }],
      ['place a fraction', function (t) { return Object.assign(good(t), { place: 2.5 }); }],
      ['place a string', function (t) { return Object.assign(good(t), { place: '3' }); }],
      ['place above total', function (t) { return Object.assign(good(t), { place: 10 }); }],
      ['place huge', function (t) { return Object.assign(good(t), { place: 1e300, total: 1e300 }); }],
      ['total missing', function (t) { const d = good(t); delete d.total; return d; }],
      ['total a string', function (t) { return Object.assign(good(t), { total: '9' }); }],
      ['total huge', function (t) { return Object.assign(good(t), { total: 5e9 }); }],
      ['another difficulty', function (t) { return Object.assign(good(t), { difficulty: 'hard' }); }],
      ['difficulty missing', function (t) { const d = good(t); delete d.difficulty; return d; }],
      ['scores missing', function (t) { const d = good(t); delete d.scores; return d; }],
      ['scores an object', function (t) { return Object.assign(good(t), { scores: { 0: ENTRY, length: 1 } }); }],
      ['scores a string', function (t) { return Object.assign(good(t), { scores: 'none' }); }]
    ];
    cases.forEach(function (c) {
      const t = board();
      t.token('medium');
      if (c[1] === null) t.world.downSend = true;
      else t.world.answer = function () { return { status: 200, data: c[1](t) }; };
      t.B.submit(ENTRY, RESULT);
      const st = t.state();
      assert.strictEqual(st.send, 'failed', c[0]);
      assert.strictEqual(st.sendError, 'unreachable', c[0] + ': an answer that cannot be read is no answer');
      assert.strictEqual(st.place, 0, c[0]);
      assert.strictEqual(st.total, 0, c[0]);
      assert.deepStrictEqual(st.lists.medium, [], c[0] + ': the board changed');
      assert.deepStrictEqual(t.env.errors, [], c[0]);
    });
    // The good reply of these cases is accepted, so each case above failed for its own reason.
    const t = board();
    t.token('medium');
    t.world.answer = function () { return { status: 200, data: good(t) }; };
    t.B.submit(ENTRY, RESULT);
    assert.strictEqual(t.B.state.send, 'sent');
    assert.strictEqual(t.B.state.place, 3);
    assert.strictEqual(t.B.state.total, 9);
  });

  await check('The time sent is the run\'s length in whole seconds, rounded down; values of the entry are sent as whole numbers', function () {
    const t = board();
    t.token('hard');
    t.B.submit({ name: 'abc', score: 1234.9, wpm: 61.7, accuracy: 99.9, rank: 'S', cleared: true, date: '2026-10-03' },
      { difficulty: 'hard', time: 259.99 });
    const body = t.world.calls[1].body;
    assert.deepStrictEqual(body, { token: 'run-1.hard', name: 'ABC', score: 1234, wpm: 61, accuracy: 99, rank: 'S', cleared: true, time: 259 });
  });

  await check('A WPM above the 220 the service accepts is sent as 220 (the game measures the speed inside words), and the run is accepted', function () {
    [[219, 219], [220, 220], [221, 220], [240, 220], [720, 220], [999, 220], [5000, 220]].forEach(function (c) {
      const t = board();
      t.token('easy');
      t.B.submit(Object.assign({}, ENTRY, { wpm: c[0] }), Object.assign({}, RESULT, { difficulty: 'easy' }));
      const body = t.world.calls[1].body;
      assert.strictEqual(body.wpm, c[1], 'wpm ' + c[0]);
      assert.strictEqual(t.B.state.send, 'sent');
      assert.strictEqual(t.B.state.sentEntry.wpm, c[1], 'sentEntry is what was sent');
    });
    // The caller's entry is not changed: the table of this computer keeps the game's own figure.
    const t = board();
    t.token('easy');
    const entry = Object.assign({}, ENTRY, { wpm: 300 });
    t.B.submit(entry, Object.assign({}, RESULT, { difficulty: 'easy' }));
    assert.strictEqual(entry.wpm, 300);
  });

  await check('A run shorter than 10 s is not sent (the service would refuse it), and its token is not used up', function () {
    const t = board();
    t.token('medium');
    [0, 2.6, 9, 9.99, -5, NaN, undefined, '30'].forEach(function (time) {
      t.B.submit(ENTRY, Object.assign({}, RESULT, { time: time }));
    });
    assert.deepStrictEqual(t.paths(), ['POST /v1/runs'], 'a short run was sent');
    assert.strictEqual(t.B.state.send, 'none');
    assert.strictEqual(t.B.hasToken('medium'), true);
    t.B.submit(ENTRY, Object.assign({}, RESULT, { time: 10 }));
    assert.strictEqual(t.world.calls[1].body.time, 10);
    assert.strictEqual(t.B.state.send, 'sent');
  });

  await check('A run below the 200 rows the service keeps: place 201 of 201 is taken as "not kept"; place 200 of 200 is kept', function () {
    const t = board({ lists: shot.fullLists() });
    t.token('medium');
    t.B.submit(Object.assign({}, ENTRY, { score: 900 }), RESULT);
    let st = t.state();
    assert.strictEqual(st.send, 'sent');
    assert.strictEqual(st.place, 201);
    assert.strictEqual(st.total, 201);
    assert.strictEqual(st.kept, false);
    assert.strictEqual(st.lists.medium.length, 10);
    assert.strictEqual(t.world.lists.medium.length, 200, 'the stand-in kept the row');
    // The next send starts with kept true again.
    t.token('medium');
    t.world.holdSend = true;
    t.B.submit(ENTRY, RESULT);
    assert.strictEqual(t.B.state.kept, true);
    t.world.release();
    assert.strictEqual(t.B.state.kept, true);
    assert.ok(t.B.state.place <= 200);

    const last = board({ lists: shot.fullLists() });
    last.world.lists.medium.pop();
    last.token('medium');
    last.B.submit(Object.assign({}, ENTRY, { score: 900 }), RESULT);
    st = last.state();
    assert.strictEqual(st.place, 200);
    assert.strictEqual(st.total, 200);
    assert.strictEqual(st.kept, true);
  });

  // ===============================================================================================
  // 5. Loading the boards
  // ===============================================================================================

  await check('refresh asks GET <URL>/v1/scores: idle, loading, then ready with the three lists', function () {
    const t = board();
    assert.strictEqual(t.B.state.boards, 'idle');
    t.world.hold = true;
    t.B.refresh();
    assert.strictEqual(t.B.state.boards, 'loading');
    const call = t.world.calls[0];
    assert.strictEqual(call.url, shot.WORLD_URL + '/v1/scores');
    assert.strictEqual(call.method, 'GET');
    assert.strictEqual(call.init.body, undefined);
    assert.strictEqual(call.init.headers, undefined, 'a GET with no headers of its own needs no preflight');
    assert.strictEqual(call.init.credentials, 'omit');
    t.world.release();
    const st = t.state();
    assert.strictEqual(st.boards, 'ready');
    DIFFS.forEach(function (d) {
      assert.strictEqual(st.lists[d].length, 10, d);
      assert.ok(st.lists[d].every(isCleanEntry), d);
      assert.deepStrictEqual(st.lists[d], t.world.lists[d].slice(0, 10), d);
    });
    assert.strictEqual(st.send, 'none');
  });

  await check('refresh asks at most once every 30 s; force asks at once; nothing is asked while a load is in flight', function () {
    const t = board();
    t.B.refresh();
    t.B.refresh();
    t.wait(10);
    t.B.refresh();
    t.wait(19.9);
    t.B.refresh();
    t.B.refresh(false);
    t.B.refresh('yes');                            // only true forces
    assert.strictEqual(t.world.calls.length, 1, 'asked again within 30 s');
    t.wait(0.1);
    t.B.refresh();
    assert.strictEqual(t.world.calls.length, 2, 'not asked again after 30 s');
    t.B.refresh(true);
    assert.strictEqual(t.world.calls.length, 3, 'force did not ask');
    t.world.hold = true;
    t.wait(31);
    t.B.refresh();
    t.B.refresh();
    t.B.refresh(true);
    assert.strictEqual(t.world.calls.length, 4, 'asked again while a load was in flight');
    assert.strictEqual(t.B.state.boards, 'ready', 'lists that are known stay on screen while they are loaded again');
    assert.strictEqual(t.B.state.lists.medium.length, 10);
    t.world.release();
    assert.strictEqual(t.B.state.boards, 'ready');
  });

  await check('A failed load: network failure, error status, timeout, invalid JSON and wrong shapes give "failed"; a forced refresh loads again', function () {
    const cases = [
      ['network failure', function (w) { w.down = true; }],
      ['status 500', function (w) { w.answer = function () { return { status: 500, data: { ok: false, error: 'server' } }; }; }],
      ['status 404', function (w) { w.answer = function () { return { status: 404, data: { ok: false, error: 'not_found' } }; }; }],
      ['not JSON', function (w) { w.answer = function () { return { status: 200, data: '<!doctype html>' }; }; }],
      ['ok false', function (w) { w.answer = function () { return { status: 200, data: { ok: false, easy: [], medium: [], hard: [] } }; }; }],
      ['a list missing', function (w) { w.answer = function () { return { status: 200, data: { ok: true, easy: [], medium: [] } }; }; }],
      ['a list that is an object', function (w) { w.answer = function () { return { status: 200, data: { ok: true, easy: [], medium: {}, hard: [] } }; }; }],
      ['a list that is a string', function (w) { w.answer = function () { return { status: 200, data: { ok: true, easy: 'x', medium: [], hard: [] } }; }; }],
      ['an array', function (w) { w.answer = function () { return { status: 200, data: [[], [], []] }; }; }]
    ];
    cases.forEach(function (c) {
      const t = board();
      const answer = t.world.answer;
      c[1](t.world);
      t.B.refresh();
      assert.strictEqual(t.B.state.boards, 'failed', c[0]);
      assert.deepStrictEqual(t.state().lists, { easy: [], medium: [], hard: [] }, c[0]);
      assert.deepStrictEqual(t.env.errors, [], c[0]);
      // Within 30 s only a forced refresh asks again.
      t.world.down = false;
      t.world.answer = answer;
      t.B.refresh();
      assert.strictEqual(t.B.state.boards, 'failed', c[0] + ': asked again within 30 s without force');
      t.B.refresh(true);
      assert.strictEqual(t.B.state.boards, 'ready', c[0] + ': the forced refresh did not load');
      assert.strictEqual(t.world.calls.length, 2, c[0]);
    });

    const slow = board();
    slow.world.hold = true;
    slow.B.refresh();
    slow.wait(5.9);
    assert.strictEqual(slow.B.state.boards, 'loading');
    slow.wait(0.1);
    assert.strictEqual(slow.B.state.boards, 'failed', 'not given up at 6 s');
    slow.world.release();
    assert.strictEqual(slow.B.state.boards, 'failed', 'a reply after the timeout was taken');
    assert.deepStrictEqual(slow.state().lists, { easy: [], medium: [], hard: [] });
  });

  await check('A load that fails after an earlier one worked gives "failed"; the next good load gives "ready" again', function () {
    const t = board();
    t.B.refresh();
    assert.strictEqual(t.B.state.boards, 'ready');
    t.wait(40);
    t.world.down = true;
    t.B.refresh();
    assert.strictEqual(t.B.state.boards, 'failed');
    t.world.down = false;
    t.wait(40);
    t.B.refresh();
    assert.strictEqual(t.B.state.boards, 'ready');
    assert.strictEqual(t.B.state.lists.hard.length, 10);
  });

  await check('After a score was sent, its board stays the one of that reply for 20 s, also when the boards are loaded in that time', function () {
    const t = board();
    t.token('medium');
    t.B.submit(Object.assign({}, ENTRY, { score: t.world.lists.medium[0].score - 10 }), RESULT);   // just under the best
    assert.strictEqual(t.B.state.send, 'sent');
    assert.strictEqual(t.B.state.place, 2);
    const mine = stubs.plain(t.B.state.lists.medium);
    assert.strictEqual(mine[1].name, 'DAV');
    // A copy of the boards from before the score was stored (the service lets them be cached for 15 s).
    const stale = shot.sampleLists();
    const answer = t.world.answer;
    t.world.answer = function (call) {
      if (call.method === 'GET') return { status: 200, data: { ok: true, easy: stale.easy.slice(0, 10), medium: stale.medium.slice(0, 10), hard: stale.hard.slice(0, 10) } };
      return answer(call);
    };
    t.wait(5);
    t.B.refresh();
    assert.strictEqual(t.B.state.boards, 'ready');
    assert.deepStrictEqual(stubs.plain(t.B.state.lists.medium), mine, 'an older copy of the board replaced the one with the new score');
    assert.strictEqual(t.B.state.lists.easy.length, 10, 'the other boards were not loaded');
    // Later the service's list is taken again.
    t.world.answer = answer;
    t.wait(31);
    t.B.refresh();
    assert.deepStrictEqual(stubs.plain(t.B.state.lists.medium), t.world.lists.medium.slice(0, 10));
    assert.strictEqual(t.B.state.lists.medium[1].name, 'DAV');
  });

  // ===============================================================================================
  // 6. Cleaning what the service sends
  // ===============================================================================================

  const hostile = function () {
    const many = [];
    for (let i = 0; i < 10000; i++) many.push({ name: 'BOT', score: 10000 - i, wpm: 20, accuracy: 90, rank: 'B', cleared: false, date: '2026-10-03' });
    return {
      easy: [
        { name: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(40), score: 500, wpm: 20, accuracy: 90, rank: 'A', cleared: true, date: '2026-10-03' },
        { name: 'abc', score: 400, wpm: 20, accuracy: 90, rank: 'A', cleared: true, date: '2026-10-03' },
        { name: 'x-y z9!', score: 300, wpm: 20, accuracy: 90, rank: 'A', cleared: true, date: '2026-10-03' },
        { name: { toString: function () { return 'OBJ'; } }, score: 250 },
        { name: ['A', 'B', 'C'], score: 240 },
        { name: 'AB', score: 230 },
        { name: '', score: 220 },
        { name: '<b>', score: 210 },
        { name: 123, score: 200 },
        { name: null, score: 190 },
        { score: 180 },
        null, undefined, 7, 'DAV 100', [], [['DAV', 100]], true,
        { name: 'NEG', score: -500, wpm: -20, accuracy: -5, rank: 'A', cleared: true, date: '2026-10-03' },
        { name: 'BIG', score: 1e300, wpm: 1e300, accuracy: 1e300, rank: 'S', cleared: true, date: '2026-10-03' },
        { name: 'MAX', score: Number.MAX_SAFE_INTEGER, wpm: 123456789, accuracy: 101, rank: 'S', cleared: true, date: '2026-10-03' },
        { name: 'FRA', score: 1234.56, wpm: 33.9, accuracy: 99.99, rank: 'B', cleared: true, date: '2026-10-03' },
        { name: 'STR', score: '9000', wpm: '40', accuracy: '95', rank: 'A', cleared: true, date: '2026-10-03' },
        { name: 'TXT', score: 100, wpm: '40', accuracy: null, rank: 'A', cleared: true, date: '2026-10-03' },
        { name: 'RNK', score: 90, wpm: 10, accuracy: 80, rank: 'SSS', cleared: 'yes', date: 20261003 },
        { name: 'RK2', score: 80, wpm: 10, accuracy: 80, rank: { a: 1 }, cleared: 1, date: 'yesterday <script>' },
        { name: 'XTR', score: 70, wpm: 10, accuracy: 80, rank: 'C', cleared: false, date: '2026-10-03', extra: 'x'.repeat(5000), html: '<img>', nested: { a: [1, 2, 3] } }
      ],
      medium: many,
      hard: [{ name: 'ONE', score: 1, wpm: 1, accuracy: 1, rank: 'C', cleared: false, date: '' }]
    };
  };

  await check('Hostile lists are cleaned: names are three letters A to Z, numbers whole and in range, at most 50 entries, only the seven fields', function () {
    const t = board();
    const lists = hostile();
    t.world.answer = function () { return { status: 200, data: JSON.parse(JSON.stringify(Object.assign({ ok: true }, lists))) }; };
    t.B.refresh();
    const st = t.state();
    assert.strictEqual(st.boards, 'ready');
    DIFFS.forEach(function (d) {
      assert.ok(st.lists[d].length <= 50, d + ' has ' + st.lists[d].length + ' entries');
      st.lists[d].forEach(function (e, i) { assert.ok(isCleanEntry(e), d + ' ' + i + ': ' + JSON.stringify(e).slice(0, 200)); });
    });
    assert.strictEqual(st.lists.medium.length, 50, '10,000 entries were not cut to 50');
    assert.deepStrictEqual(st.lists.medium[0], { name: 'BOT', score: 10000, wpm: 20, accuracy: 90, rank: 'B', cleared: false, date: '2026-10-03' });
    assert.deepStrictEqual(st.lists.hard, [{ name: 'ONE', score: 1, wpm: 1, accuracy: 1, rank: 'C', cleared: false, date: '' }]);
    const by = {};
    st.lists.easy.forEach(function (e) { by[e.name] = e; });
    // Entries that are not objects, have no name with three letters in it (AB, <b>, RK2 ...) or have no
    // number for a score are left out.
    assert.deepStrictEqual(st.lists.easy.map(function (e) { return e.name; }), ['ABC', 'ABC', 'XYZ', 'NEG', 'BIG', 'MAX', 'FRA', 'TXT', 'RNK', 'XTR']);
    assert.strictEqual(st.lists.easy[0].score, 500, 'a long name is cut to its first three letters');
    assert.strictEqual(st.lists.easy[1].score, 400, 'a lower-case name is put in capitals');
    assert.strictEqual(st.lists.easy[2].score, 300, 'other characters are left out of a name');
    assert.deepStrictEqual(by.NEG, { name: 'NEG', score: 0, wpm: 0, accuracy: 0, rank: 'A', cleared: true, date: '2026-10-03' });
    assert.deepStrictEqual(by.BIG, { name: 'BIG', score: 9999999, wpm: 999, accuracy: 100, rank: 'S', cleared: true, date: '2026-10-03' });
    assert.deepStrictEqual(by.MAX, { name: 'MAX', score: 9999999, wpm: 999, accuracy: 100, rank: 'S', cleared: true, date: '2026-10-03' });
    assert.deepStrictEqual(by.FRA, { name: 'FRA', score: 1234, wpm: 33, accuracy: 99, rank: 'B', cleared: true, date: '2026-10-03' });
    assert.strictEqual(by.STR, undefined, 'an entry whose score is not a number is left out');
    assert.deepStrictEqual(by.TXT, { name: 'TXT', score: 100, wpm: 0, accuracy: 0, rank: 'A', cleared: true, date: '2026-10-03' });
    assert.deepStrictEqual(by.RNK, { name: 'RNK', score: 90, wpm: 10, accuracy: 80, rank: 'C', cleared: false, date: '' });
    assert.deepStrictEqual(by.XTR, { name: 'XTR', score: 70, wpm: 10, accuracy: 80, rank: 'C', cleared: false, date: '2026-10-03' });
    assert.ok(JSON.stringify(st).length < 20000, 'the kept lists are ' + JSON.stringify(st).length + ' characters');
    assert.deepStrictEqual(t.env.errors, []);
  });

  await check('The list in the reply to a send is cleaned in the same way', function () {
    const t = board();
    t.token('medium');
    const lists = hostile();
    t.world.answer = function () {
      return { status: 200, data: JSON.parse(JSON.stringify({ ok: true, place: 4, total: 12000, difficulty: 'medium', scores: lists.easy.concat(lists.medium) })) };
    };
    t.B.submit(ENTRY, RESULT);
    const st = t.state();
    assert.strictEqual(st.send, 'sent');
    assert.strictEqual(st.lists.medium.length, 50);
    st.lists.medium.forEach(function (e, i) { assert.ok(isCleanEntry(e), i + ': ' + JSON.stringify(e).slice(0, 200)); });
    assert.deepStrictEqual(st.sentEntry, ENTRY, 'the entry that was sent is kept as the game made it');
  });

  await check('Lists the module keeps are its own copies: changing what the service sent afterwards changes nothing', function () {
    const t = board();
    t.B.refresh();
    const before = JSON.stringify(t.state().lists);
    t.world.lists.easy[0].name = 'ZZZ';
    t.world.lists.easy[0].score = 1;
    assert.strictEqual(JSON.stringify(t.state().lists), before);
  });

  // ===============================================================================================
  // 7. Nothing throws and nothing hands back a promise
  // ===============================================================================================

  const ODD = [undefined, null, 0, -1, NaN, Infinity, '', 'easy', 'medium', true, false, [], {}, { difficulty: 'medium' },
    { name: 'DAV', score: 5 }, function () {}, Symbol.iterator];

  function exercise(t, what) {
    const B = t.B;
    const calls = [];
    ['update', 'available', 'enabled', 'startRun', 'hasToken', 'submit', 'refresh', 'blocked'].forEach(function (fn) {
      ODD.forEach(function (a) {
        ODD.forEach(function (b) {
          let r;
          try {
            r = B[fn](a, b);
          } catch (e) {
            throw new Error(what + ': TG.Board.' + fn + ' threw: ' + (e && e.message));
          }
          const kind = typeof r;
          if (!(r === undefined || kind === 'boolean')) calls.push(fn + ' returned ' + kind);
          if (r && typeof r.then === 'function') calls.push(fn + ' returned a promise');
        });
      });
    });
    assert.deepStrictEqual(calls.slice(0, 3), [], what);
    ODD.forEach(function (a) {
      assert.strictEqual(B.init(a), undefined, what + ': init');
    });
  }

  await check('Every function, with any arguments, returns undefined or a boolean and never throws: off, on, with replies held, and with the service down', function () {
    exercise(board({ url: '' }), 'empty URL');
    exercise(board({ fetch: null }), 'no fetch');
    exercise(board({ setting: false }), 'setting off');
    exercise(board(), 'on');
    const held = board();
    held.world.hold = true;
    exercise(held, 'replies held');
    const down = board();
    down.world.down = true;
    exercise(down, 'service down');
    [board(), held, down].forEach(function (t) { assert.deepStrictEqual(t.env.errors, []); });
  });

  await check('A fetch that throws, returns nothing, or returns something that is not a promise: each request is a failure and nothing throws', function () {
    const kinds = {
      'throws': function () { throw new Error('fetch is blocked'); },
      'throws a string': function () { throw 'no'; },
      'returns undefined': function () { return undefined; },
      'returns null': function () { return null; },
      'returns a number': function () { return 7; },
      'returns an object without then': function () { return { status: 200 }; },
      'returns a reply whose text() throws': function () {
        return { then: function (ok) { ok({ status: 200, text: function () { throw new Error('no body'); } }); } };
      },
      'returns a reply without text()': function () { return { then: function (ok) { ok({ status: 200 }); } }; },
      'returns a reply whose text() gives no promise': function () { return { then: function (ok) { ok({ status: 200, text: function () { return '{"ok":true}'; } }); } }; },
      'returns a reply whose text is not a string': function () {
        return { then: function (ok) { ok({ status: 200, text: function () { return { then: function (done) { done({ ok: true }); } }; } }); } };
      },
      'resolves with nothing': function () { return { then: function (ok) { ok(undefined); } }; },
      'a then that throws': function () { return { then: function () { throw new Error('broken promise'); } }; },
      'rejects with nothing': function () { return { then: function (ok, fail) { fail(); } }; }
    };
    Object.keys(kinds).forEach(function (kind) {
      let mode = 'good';
      const t = board();
      const good = t.world.fetch;
      t.B.init({ fetch: function (url, init) { return mode === 'good' ? good(url, init) : kinds[kind](); }, now: function () { return t.now; } });
      t.token('medium');                           // a token from the working service, so that submit sends
      mode = 'bad';
      t.B.refresh();
      assert.strictEqual(t.B.state.boards, 'failed', kind + ': boards');
      t.B.submit(ENTRY, RESULT);
      assert.strictEqual(t.B.state.send, 'failed', kind + ': send');
      t.B.startRun('easy');
      assert.strictEqual(t.B.hasToken(), false, kind + ': token');
      t.wait(7);
      assert.deepStrictEqual(t.env.errors, [], kind);
    });
  });

  await check('Requests go only to TG.Board.URL: every address is the URL followed by /v1/runs or /v1/scores, also with a slash at the end of the URL', function () {
    [shot.WORLD_URL, shot.WORLD_URL + '/', shot.WORLD_URL + '///'].forEach(function (url) {
      const t = board({ url: url });
      t.B.startRun('medium');
      t.B.refresh();
      t.B.submit(ENTRY, RESULT);
      t.B.refresh(true);
      assert.deepStrictEqual(t.world.calls.map(function (c) { return c.method + ' ' + c.url; }), [
        'POST ' + shot.WORLD_URL + '/v1/runs', 'GET ' + shot.WORLD_URL + '/v1/scores',
        'POST ' + shot.WORLD_URL + '/v1/scores', 'GET ' + shot.WORLD_URL + '/v1/scores'
      ], url);
    });
    // Nothing in a reply can send a request elsewhere: an address in a reply is never used.
    const t = board();
    t.world.answer = function (call) {
      if (call.path === '/v1/runs') return { status: 200, data: { ok: true, token: 'abc.def', expires: 10800, url: 'https://elsewhere.invalid', next: 'https://elsewhere.invalid/v1/scores' } };
      return { status: 200, data: { ok: true, easy: [], medium: [], hard: [], place: 1, total: 1, difficulty: 'medium', scores: [], location: 'https://elsewhere.invalid' } };
    };
    t.B.startRun('medium');
    t.B.refresh();
    t.B.submit(ENTRY, RESULT);
    t.B.refresh(true);
    t.world.calls.forEach(function (c) { assert.ok(c.url.indexOf(shot.WORLD_URL + '/v1/') === 0, c.url); });
  });

  await check('Without a clock from init, update(dt) counts the time: a request with no reply still fails after 6 s', function () {
    const env = stubs.load({ files: ['js/core.js', 'js/board.js'] });
    const world = shot.createWorld();
    env.TG.Board.URL = world.url;
    env.TG.Board.init({ fetch: world.fetch });
    world.hold = true;
    env.TG.Board.refresh();
    for (let i = 0; i < 59; i++) env.TG.Board.update(0.1);
    assert.strictEqual(env.TG.Board.state.boards, 'loading');
    env.TG.Board.update(0.1);
    env.TG.Board.update(0.1);
    assert.strictEqual(env.TG.Board.state.boards, 'failed');
  });

  await check('A clock that is set back does not give a request up early, and does not keep it for ever', function () {
    const t = board();
    t.world.hold = true;
    t.B.refresh();
    t.wait(4);
    t.now -= 3600000;                              // the computer's clock is put back an hour
    t.B.update(0.016);
    assert.strictEqual(t.B.state.boards, 'loading');
    t.wait(5.9);
    assert.strictEqual(t.B.state.boards, 'loading');
    t.wait(0.2);
    assert.strictEqual(t.B.state.boards, 'failed');
  });

  // ===============================================================================================
  // 8. TG.Main
  // ===============================================================================================

  await check('TG.Main.init gives TG.Board the window\'s fetch, bound to the window, and a clock; without window.fetch world scores are off', function () {
    const env = stubs.load({ canvas: 'stub' });
    const world = shot.createWorld();
    const seen = [];
    env.window.fetch = function (url, init) {
      seen.push(this);
      return world.fetch(url, init);
    };
    env.TG.Board.URL = world.url;
    env.run('var boardNow = 5000; Date.now = function () { return boardNow; };');
    env.TG.Main.init();
    assert.strictEqual(env.TG.Board.enabled(), true);
    env.TG.Board.refresh();
    assert.strictEqual(seen.length, 1);
    assert.ok(seen[0] === env.window, 'fetch was not called with the window as this');
    assert.strictEqual(env.TG.Board.state.boards, 'ready');
    // The clock is the one TG.Main gave: 30 s on it let the boards be asked for again.
    env.TG.Board.refresh();
    assert.strictEqual(world.calls.length, 1);
    env.run('boardNow += 30000;');
    env.TG.Board.refresh();
    assert.strictEqual(world.calls.length, 2);
    assert.deepStrictEqual(env.errors, []);

    const none = stubs.load({ canvas: 'stub' });
    none.TG.Board.URL = world.url;
    none.TG.Main.init();
    assert.strictEqual(none.TG.Board.available(), false);
    assert.strictEqual(none.TG.Board.enabled(), false);
    assert.deepStrictEqual(none.errors, []);
  });

  await check('TG.Main.frame calls TG.Board.update once per frame: a request with no reply is given up after 6 s of frames', function () {
    const env = stubs.load({ canvas: 'stub' });
    const world = shot.createWorld();
    env.window.fetch = world.fetch;
    env.TG.Board.URL = world.url;
    env.run('var boardNow = 5000; Date.now = function () { return boardNow; };');
    env.TG.Main.init();
    let updates = 0;
    const update = env.TG.Board.update;
    env.TG.Board.update = function (dt) { updates++; return update.call(env.TG.Board, dt); };
    world.hold = true;
    env.TG.Board.refresh();
    let ms = 0;
    for (let i = 0; i < 350; i++) {                // 5.83 s
      ms += 1000 / 60;
      env.run('boardNow += 1000 / 60;');
      env.runFrame(ms);
    }
    assert.strictEqual(updates, 350);
    assert.strictEqual(env.TG.Board.state.boards, 'loading');
    for (let i = 0; i < 12; i++) {
      ms += 1000 / 60;
      env.run('boardNow += 1000 / 60;');
      env.runFrame(ms);
    }
    assert.strictEqual(env.TG.Board.state.boards, 'failed');
    assert.deepStrictEqual(env.errors, []);
  });

  await check('main.js makes no request itself: fetch appears there only where it is handed to TG.Board', function () {
    const lines = read('js/main.js').split('\n').filter(function (line) { return !/^\s*\/\//.test(line) && /fetch/.test(line); });
    assert.ok(lines.length >= 1, 'the hand-over was not found');
    lines.forEach(function (line) {
      assert.ok(/win\.fetch\.bind\(win\)|TG\.Board\.init\(\{ fetch: networkFunction\(\)/.test(line), line.trim());
      assert.ok(!/\bfetch\s*\(/.test(line), 'a call: ' + line.trim());
    });
  });

  // ===============================================================================================
  // 9. Real promises
  // ===============================================================================================

  // The stand-in service behind a fetch that returns real promises and real Response objects, as a
  // browser does.
  function realBoard(options) {
    const o = options || {};
    const t = board();
    const world = t.world;
    const calls = [];
    t.B.init({
      fetch: function (url, init) {
        const call = { url: String(url), method: init.method, path: String(url).slice(world.url.length), body: init.body ? JSON.parse(init.body) : null, init: init };
        calls.push(call);
        if (o.reject) return Promise.reject(new TypeError('Failed to fetch'));
        if (o.never) return new Promise(function () {});
        return tick().then(function () {
          const a = world.answer(call);
          return new Response(typeof a.data === 'string' ? a.data : JSON.stringify(a.data), { status: a.status });
        });
      },
      now: function () { return t.now; }
    });
    t.calls = calls;
    return t;
  }

  await check('Real promises: a token, a send and a load arrive in TG.Board.state without any call handing back a promise', async function () {
    const t = realBoard();
    assert.strictEqual(t.B.startRun('medium'), undefined);
    assert.strictEqual(t.B.hasToken('medium'), false, 'the reply cannot have arrived yet');
    await settle();
    assert.strictEqual(t.B.hasToken('medium'), true);
    assert.strictEqual(t.B.refresh(), undefined);
    assert.strictEqual(t.B.state.boards, 'loading');
    assert.strictEqual(t.B.submit(ENTRY, RESULT), undefined);
    assert.strictEqual(t.B.state.send, 'sending');
    await settle();
    assert.strictEqual(t.B.state.boards, 'ready');
    assert.strictEqual(t.B.state.send, 'sent');
    assert.strictEqual(t.B.state.total, 87);
    assert.strictEqual(t.B.state.lists.medium.length, 10);
    assert.deepStrictEqual(t.calls.map(function (c) { return c.method + ' ' + c.path; }), ['POST /v1/runs', 'GET /v1/scores', 'POST /v1/scores']);
    assert.deepStrictEqual(t.env.errors, []);
  });

  await check('Real promises: a rejected fetch, an error status and a body that is not JSON are failures, with no unhandled rejection', async function () {
    const down = realBoard({ reject: true });
    down.B.startRun('medium');
    down.B.refresh();
    await settle();
    assert.strictEqual(down.B.hasToken(), false);
    assert.strictEqual(down.B.state.boards, 'failed');

    const refused = realBoard();
    refused.B.startRun('medium');
    await settle();
    refused.world.refuse = 'too_soon';
    refused.B.submit(ENTRY, RESULT);
    await settle();
    assert.strictEqual(refused.B.state.send, 'failed');

    const garbled = realBoard();
    garbled.world.answer = function () { return { status: 200, data: 'not json' }; };
    garbled.B.refresh();
    garbled.B.startRun('easy');
    await settle();
    assert.strictEqual(garbled.B.state.boards, 'failed');
    assert.strictEqual(garbled.B.hasToken(), false);
    [down, refused, garbled].forEach(function (t) { assert.deepStrictEqual(t.env.errors, []); });
    await settle();
    assert.deepStrictEqual(unhandled, []);
  });

  await check('Real promises: a fetch that never settles is given up at 6 s, and a reply that comes later is ignored', async function () {
    const t = realBoard({ never: true });
    t.B.refresh();
    await settle();
    t.wait(5.9);
    assert.strictEqual(t.B.state.boards, 'loading');
    t.wait(0.1);
    assert.strictEqual(t.B.state.boards, 'failed');

    // A reply that is on its way when the request is given up.
    const late = realBoard();
    late.B.startRun('medium');
    await settle();
    late.B.submit(ENTRY, RESULT);
    late.wait(6);                                  // the reply has not been delivered yet
    assert.strictEqual(late.B.state.send, 'failed');
    await settle();
    assert.strictEqual(late.B.state.send, 'failed', 'the late reply was taken');
    assert.strictEqual(late.B.state.place, 0);
    assert.deepStrictEqual(stubs.plain(late.B.state.lists.medium), []);
    assert.deepStrictEqual(unhandled, []);
  });

  finished = true;
  console.log('');
  console.log('test-board: ' + passed + ' passed, ' + failed + ' failed');
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch(function (e) {
  finished = true;
  console.log('FAIL - test-board.js stopped: ' + (e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
