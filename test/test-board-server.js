// test/test-board-server.js
// The game and the world scores service together, without a network. Run from the project root:
//
//   node test/test-board-server.js
//
// The real game runs under test/stubs.js and is driven as a player drives it: key events through the
// menus, the small bot of tools/shot-ui.js for the run itself, key events again on the results and
// initials screens. Its network function is a bridge: every call TG.Board makes is turned into a
// Request and passed to the fetch handler of the real Worker (server/src/worker.js, loaded with a
// dynamic import), and the Worker's Response goes back to TG.Board as a real promise.
//
// The Worker gets what test/test-server.js gives it: env.DB is a small stand-in for Cloudflare's D1
// built on node:sqlite (in memory) with server/schema.sql applied, env.TOKEN_SECRET is a test
// secret, and env.NOW is the clock. The clock is the game session's own time (the frames shown and
// the steps played), so a run of five minutes makes its token five minutes old without anybody
// waiting. One check stops the Worker's clock instead, so that the token is too young when the
// score arrives and the Worker refuses it.
//
// A browser adds an Origin header to the game's requests, and the Worker may accept scores only from
// the pages it lists (its export ORIGINS). The bridge therefore sends the first of those as Origin,
// as the published game does; when the Worker exports no such list it sends none.
//
// Checks:
//   1. a run from the menus to the initials screen puts one row in the Worker's database with the
//      game's own numbers, and the WORLD page of that difficulty lists it
//   2. later runs in the same session take their places on the board
//   3. initials on the block list never reach the Worker
//   4. a score the Worker refuses shows the line for a refusal and stays in the table of this computer
//   5. with the WORLD SCORES setting off, nothing reaches the Worker
//   6. a copy of the game on a page the Worker takes no scores from (skipped when the Worker has no
//      list of pages): the game plays on with the scores of this computer
//   7. the player can decline: Esc on the initials screen, a second Enter that comes too early, and
//      Enter alone before any initials were typed send nothing
//   8. runs the Worker would refuse for what they are: a run under 10 s is not offered to the world
//      scores, and a typing speed above the Worker's limit is sent as the limit and accepted
//   9. the Worker's hourly limit shows its own line, not the one for a service that cannot be reached
//
// Prints one line per check (ok / FAIL) and exits with 0 when every check passed.
// No npm packages: Node's own modules only (node:sqlite needs Node 22.5 or later).
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');
const { DatabaseSync } = require('node:sqlite');
const stubs = require('./stubs');
const shot = require('../tools/shot-ui');

const ROOT = stubs.ROOT;
const SERVER = path.join(ROOT, 'server');
const BASE = 'https://spell-runner-scores.example.workers.dev';
const SECRET = 'test-secret-7f3a9c1e5b2d4086-for-tests-only';
const T0 = Date.UTC(2026, 9, 3, 12, 0, 0);          // 2026-10-03T12:00:00Z
const CHECK_SECONDS = 120;                           // a check that takes longer has failed

let passed = 0;
let failed = 0;
let finished = false;
let current = '';
const unhandled = [];

process.on('unhandledRejection', function (reason) {
  unhandled.push(String(reason && reason.stack ? reason.stack : reason));
});

process.on('exit', function () {
  if (finished) return;
  console.log('FAIL - test-board-server.js ended during "' + current + '" without finishing');
  process.exitCode = 1;
});

async function check(name, fn) {
  current = name;
  let timer = null;
  try {
    // A call to the Worker that never returns must fail the check, not end the file quietly.
    const late = new Promise(function (resolve, reject) {
      timer = setTimeout(function () { reject(new Error('no answer within ' + CHECK_SECONDS + ' s')); }, CHECK_SECONDS * 1000);
    });
    await Promise.race([Promise.resolve().then(fn), late]);
    passed++;
    console.log('ok - ' + name);
  } catch (e) {
    failed++;
    console.log('FAIL - ' + name);
    console.log('    ' + String(e && e.stack ? e.stack : e).split('\n').slice(0, 6).join('\n    '));
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------------------------
// The D1 stand-in, as in test/test-server.js: the calls the Worker makes, on node:sqlite.
// ---------------------------------------------------------------------------------------------

function toSqlValue(value) {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  throw new TypeError("D1_TYPE_ERROR: Type '" + typeof value + "' not supported for value '" + String(value) + "'");
}

class FakeStatement {
  constructor(d1, sql, values) {
    this.d1 = d1;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new FakeStatement(this.d1, this.sql, values.map(toSqlValue));
  }

  execute() {
    const rows = this.d1.db.prepare(this.sql).all(...this.values).map((row) => Object.assign({}, row));
    return { results: rows, success: true, meta: {} };
  }

  async first() {
    const rows = this.execute().results;
    return rows.length ? rows[0] : null;
  }

  async all() {
    return this.execute();
  }

  async run() {
    return this.execute();
  }
}

class FakeD1 {
  constructor(schema) {
    this.db = new DatabaseSync(':memory:');
    this.db.exec(schema);
  }

  prepare(sql) {
    return new FakeStatement(this, sql, []);
  }

  async batch(statements) {
    if (statements.length === 0) return [];
    this.db.exec('BEGIN');
    try {
      const results = statements.map((statement) => statement.execute());
      this.db.exec('COMMIT');
      return results;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  // For the tests' own reading. Not part of D1.
  rows(sql, ...values) {
    return this.db.prepare(sql).all(...values).map((row) => Object.assign({}, row));
  }
}

// ---------------------------------------------------------------------------------------------
// The two halves
// ---------------------------------------------------------------------------------------------

function tick() {
  return new Promise(function (resolve) { setImmediate(resolve); });
}

function pad7(n) {
  let s = String(n);
  while (s.length < 7) s = '0' + s;
  return s;
}

// What the game's result becomes in the Worker's database (LEADERBOARD 3.2 and 4).
function rowFor(result, name) {
  return {
    difficulty: result.difficulty,
    name: name,
    score: Math.floor(result.score),
    wpm: Math.round(result.typing.wpm),
    accuracy: Math.floor(result.typing.accuracy * 100 + 1e-9),
    rank: result.rank,
    cleared: result.cleared === true ? 1 : 0,
    time_s: Math.floor(result.time)
  };
}

async function main() {
  const W = await import(pathToFileURL(path.join(SERVER, 'src', 'worker.js')).href);
  const worker = W.default;
  // The page the game is published on, as the Worker knows it; undefined when it keeps no list.
  const HOME = Array.isArray(W.ORIGINS) && typeof W.ORIGINS[0] === 'string' ? W.ORIGINS[0] : undefined;
  const blocklist = (await import(pathToFileURL(path.join(SERVER, 'src', 'blocklist.js')).href)).BLOCKLIST;
  const SCHEMA = fs.readFileSync(path.join(SERVER, 'schema.sql'), 'utf8');

  // A fresh service and a fresh game joined by the bridge. options: storage (the game's storage map,
  // to keep settings from an earlier game), origin (the page the game is on, sent as the Origin header
  // of every request; default: the game's own page).
  function pair(options) {
    const o = options || {};
    const origin = o.origin === undefined ? HOME : o.origin;
    const d1 = new FakeD1(SCHEMA);
    const p = { d1: d1, requests: [], inFlight: new Set(), session: null, stopped: null };

    // The Worker's clock: T0 plus the game session's own time, or the moment it was stopped at.
    const env = {
      DB: d1,
      TOKEN_SECRET: SECRET,
      NOW: function () {
        const ms = p.stopped !== null ? p.stopped : (p.session ? p.session.clock() : 0);
        return T0 + Math.round(ms);
      }
    };

    // TG.Board's network function: a Request to the real Worker, the Worker's Response back.
    p.fetch = function (url, init) {
      const i = init || {};
      const record = { method: i.method || 'GET', url: String(url), path: String(url).slice(BASE.length), body: i.body ? JSON.parse(i.body) : null, status: null, json: null };
      p.requests.push(record);
      const request = new Request(String(url), {
        method: record.method,
        headers: Object.assign({ 'CF-Connecting-IP': '203.0.113.7' }, origin ? { Origin: origin } : {}, i.headers),
        body: i.body === undefined ? undefined : String(i.body)
      });
      const answer = Promise.resolve(worker.fetch(request, env, {})).then(function (response) {
        record.status = response.status;
        return response.clone().text().then(function (text) {
          try { record.json = JSON.parse(text); } catch (e) { record.json = null; }
          return response;
        });
      });
      p.inFlight.add(answer);
      const done = function () { p.inFlight.delete(answer); };
      answer.then(done, done);
      return answer;
    };

    // Waits until the Worker has answered everything and TG.Board has read the answers.
    p.settle = async function () {
      for (let round = 0; round < 50; round++) {
        if (p.inFlight.size > 0) await Promise.allSettled(Array.from(p.inFlight));
        for (let i = 0; i < 5; i++) await tick();
        if (p.inFlight.size === 0) return;
      }
      throw new Error('the Worker did not answer');
    };

    p.session = shot.createSession({ canvas: 'stub', storage: o.storage, world: { fetch: p.fetch, url: BASE } });
    p.TG = p.session.TG;
    p.scores = function () {
      return d1.rows('SELECT difficulty, name, score, wpm, accuracy, rank, cleared, time_s FROM scores ORDER BY id ASC');
    };
    p.paths = function () {
      return p.requests.map(function (r) { return r.method + ' ' + r.path + ' ' + r.status; });
    };
    return p;
  }

  // From boot to the title menu with START selected.
  function toMenu(p) {
    const s = p.session;
    s.frames(2);
    s.press('enter');
    s.seconds(1.3);
    assert.strictEqual(p.TG.UI.panel, 'menu');
  }

  // From the title menu with START selected: a run on `difficulty`, to the results screen with the
  // tally finished. options: wpm (the bot's speed, default 90), short (the run is ended from the pause
  // menu once the score is 2,000 or more), stopClock (the Worker's clock stops when the difficulty is
  // confirmed, so the token is as old at the end of the run as it was at its start).
  async function playRun(p, difficulty, options) {
    const o = options || {};
    const s = p.session;
    const before = p.requests.length;
    s.press('enter');                              // START
    assert.strictEqual(s.screen(), 'difficultySelect');
    if (o.stopClock) p.stopped = s.clock();
    s.type(difficulty);                            // confirming the difficulty asks for the run token
    assert.strictEqual(s.screen(), 'howToPlay');
    await p.settle();
    if (p.TG.Board.enabled()) {
      assert.strictEqual(p.requests.length, before + 1, 'one request on confirming the difficulty');
      assert.deepStrictEqual(p.requests[before].body, { difficulty: difficulty });
      assert.strictEqual(p.requests[before].status, 200);
      assert.strictEqual(p.TG.Board.hasToken(difficulty), true, 'the run token has arrived before the run starts');
    }
    s.type('ready');
    assert.strictEqual(s.screen(), 'playing');
    const bot = shot.createBot({ wpm: o.wpm || 90 });
    if (o.short) {
      for (let i = 0; i < 60 * 180 && s.screen() === 'playing' && p.TG.Game.state.score < 2000; i++) s.steps(1, bot);
      s.frame();
      s.press('esc');
      s.press('up');                               // from RESUME round to QUIT
      s.press('enter');
      s.press('enter');
    } else {
      assert.ok(shot.playUntil(s, 'results', bot, 1500), 'the run ended on ' + s.screen());
    }
    assert.strictEqual(s.screen(), 'results');
    s.seconds(4.5);
    // The token on confirming the difficulty, then the two counter requests (LEADERBOARD 10): start and end.
    assert.strictEqual(p.requests.length, before + (p.TG.Board.enabled() ? 3 : 0), 'requests during the run');
    return p.TG.Game.state.result;
  }

  // The texts drawn in one frame.
  function texts(p) {
    const TG = p.TG;
    const seen = [];
    const draw = TG.Font.draw;
    TG.Font.draw = function (ctx, text) { seen.push(String(text)); return draw.apply(TG.Font, arguments); };
    try { p.session.frame(); } finally { TG.Font.draw = draw; }
    return seen;
  }

  // ===============================================================================================

  await check('A run from the menus: the score is in the Worker\'s database with the game\'s numbers, and the WORLD page lists it', async function () {
    const p = pair();
    const s = p.session;
    const TG = p.TG;
    assert.strictEqual(TG.Board.enabled(), true);
    toMenu(p);
    const result = await playRun(p, 'medium');
    assert.strictEqual(result.cleared, true, 'the bot cleared the level');
    assert.ok(TG.Save.qualifies('medium', result.score), 'the score reaches the table of this computer');
    shot.leaveResults(s);
    assert.strictEqual(s.screen(), 'highScoreEntry');
    assert.ok(texts(p).indexOf('NEW HIGH SCORE!') !== -1);
    assert.strictEqual(p.scores().length, 0, 'nothing is stored before the initials are confirmed');
    s.type('dav');
    s.press('enter');
    assert.strictEqual(s.screen(), 'title');
    assert.strictEqual(TG.UI.panel, 'scores');
    assert.strictEqual(TG.UI.page, 'medium', 'the panel opens on the WORLD page of the run\'s difficulty');
    assert.strictEqual(TG.Board.state.send, 'sending');
    assert.ok(texts(p).indexOf('SENDING...') !== -1);
    await p.settle();

    // The Worker's database.
    const want = rowFor(result, 'DAV');
    assert.deepStrictEqual(p.scores(), [want]);
    assert.ok(want.score > 0 && want.wpm > 0 && want.time_s > 200, JSON.stringify(want));
    const stored = p.d1.rows('SELECT run_id, created_at FROM scores')[0];
    assert.ok(/^[0-9a-f]{32}$/.test(stored.run_id));
    assert.strictEqual(stored.created_at, T0 + Math.round(s.clock()), 'stored at the Worker\'s time');

    // What was sent, and what came back.
    const send = p.requests.filter(function (r) { return r.method === 'POST' && r.path === '/v1/scores'; });
    assert.strictEqual(send.length, 1);
    assert.strictEqual(send[0].status, 200);
    assert.deepStrictEqual(Object.keys(send[0].body).sort(), ['accuracy', 'cleared', 'name', 'rank', 'score', 'time', 'token', 'wpm']);
    assert.strictEqual(send[0].json.place, 1);
    assert.strictEqual(send[0].json.total, 1);
    p.requests.forEach(function (r) { assert.ok(r.url.indexOf(BASE + '/v1/') === 0, r.url); });

    // The game.
    const st = stubs.plain(TG.Board.state);
    assert.strictEqual(st.send, 'sent');
    assert.strictEqual(st.place, 1);
    assert.strictEqual(st.total, 1);
    assert.strictEqual(st.sentDifficulty, 'medium');
    assert.deepStrictEqual(st.lists.medium, [{ name: 'DAV', score: want.score, wpm: want.wpm, accuracy: want.accuracy, rank: want.rank, cleared: true, date: '2026-10-03' }]);
    const seen = texts(p);
    assert.ok(seen.indexOf('WORLD MEDIUM') !== -1, 'the page header');
    assert.ok(seen.indexOf('YOUR PLACE: 1 OF 1') !== -1, seen.join(' | '));
    assert.ok(seen.indexOf('DAV') !== -1 && seen.indexOf(pad7(want.score)) !== -1, 'the row is not on the page');
    assert.ok(seen.indexOf(want.wpm + '') !== -1 && seen.indexOf(want.accuracy + '%') !== -1 && seen.indexOf(want.rank) !== -1);
    // The table of this computer has it too.
    assert.strictEqual(TG.Save.scores('medium')[0].name, 'DAV');
    assert.strictEqual(TG.Save.scores('medium')[0].score, want.score);
    // The other boards were asked for when the panel opened, and are empty.
    assert.strictEqual(st.boards, 'ready');
    s.seconds(0.6);                                // the page reads no keys for its first half second
    s.press('right');
    assert.strictEqual(TG.UI.page, 'hard');
    assert.ok(texts(p).indexOf('NO SCORES YET. BE THE FIRST!') !== -1);
    assert.deepStrictEqual(p.paths(), ['POST /v1/runs 200', 'POST /v1/stats 200', 'POST /v1/stats 200', 'POST /v1/scores 200', 'GET /v1/scores 200']);
    // The counters reached the Worker: one run started and ended for the difficulty, and one player.
    const totals = p.d1.rows('SELECT difficulty, starts, finishes, cleared, time_s FROM stats').map((r) => Object.assign({}, r));
    assert.strictEqual(totals.length, 1);
    assert.strictEqual(totals[0].starts, 1);
    assert.strictEqual(totals[0].finishes, 1);
    assert.ok(totals[0].time_s > 0, 'no time was counted');
    assert.strictEqual(p.d1.rows('SELECT players FROM days')[0].players, 1);
    assert.deepStrictEqual(s.env.errors, []);
  });

  await check('Later runs place correctly: a higher score goes first of two, a lower one below it, and the page shows them in order', async function () {
    const p = pair();
    const s = p.session;
    const TG = p.TG;
    const world = function () {
      return p.d1.rows('SELECT difficulty, name, score, wpm, accuracy, rank, cleared, time_s FROM scores ORDER BY score DESC, id ASC');
    };
    toMenu(p);

    // A short run: its score misses the top five of this computer, so the initials screen is shown
    // for the world scores alone.
    const first = await playRun(p, 'easy', { short: true });
    assert.ok(first.score > 0 && !TG.Save.qualifies('easy', first.score), 'the short run reaches the table of this computer');
    shot.leaveResults(s);
    assert.strictEqual(s.screen(), 'highScoreEntry', 'a run with a token and a score goes to the initials screen');
    const entry = texts(p);
    assert.ok(entry.indexOf('WORLD SCORES') !== -1 && entry.indexOf('NEW HIGH SCORE!') === -1, 'the heading');
    s.type('one');
    s.press('enter');
    assert.strictEqual(TG.UI.page, 'easy');
    await p.settle();
    assert.strictEqual(TG.Board.state.send, 'sent');
    assert.strictEqual(TG.Board.state.place, 1);
    assert.strictEqual(TG.Board.state.total, 1);
    assert.strictEqual(TG.Save.getSetting('initials'), 'ONE');
    assert.ok(TG.Save.scores('easy').every(function (e) { return e.name !== 'ONE'; }), 'the table of this computer took a score that does not reach it');

    // A whole run scores more: first of two.
    s.seconds(0.6);
    s.press('esc');
    assert.strictEqual(TG.UI.panel, 'menu');
    const second = await playRun(p, 'easy', { wpm: 70 });
    assert.ok(second.score > first.score);
    shot.leaveResults(s);
    assert.ok(texts(p).indexOf('NEW HIGH SCORE!') !== -1);
    s.type('top');
    s.press('enter');
    await p.settle();
    assert.strictEqual(TG.Board.state.place, 1);
    assert.strictEqual(TG.Board.state.total, 2);
    assert.ok(texts(p).indexOf('YOUR PLACE: 1 OF 2') !== -1);
    assert.deepStrictEqual(world(), [rowFor(second, 'TOP'), rowFor(first, 'ONE')]);

    // Another short run: below the whole run, and above or below the first short one by its score
    // (after it when the two are equal). Enter alone takes the initials of the run before.
    s.seconds(0.6);
    s.press('esc');
    const third = await playRun(p, 'easy', { short: true });
    shot.leaveResults(s);
    assert.ok(texts(p).indexOf('ENTER: SEND AS TOP') !== -1, 'the initials of the last run are offered');
    s.press('enter');
    await p.settle();
    const place = Math.floor(third.score) > Math.floor(first.score) ? 2 : 3;
    assert.strictEqual(TG.Board.state.send, 'sent');
    assert.strictEqual(TG.Board.state.place, place);
    assert.strictEqual(TG.Board.state.total, 3);
    const want = [rowFor(second, 'TOP')].concat(place === 2 ? [rowFor(third, 'TOP'), rowFor(first, 'ONE')] : [rowFor(first, 'ONE'), rowFor(third, 'TOP')]);
    assert.deepStrictEqual(world(), want);
    assert.deepStrictEqual(stubs.plain(TG.Board.state.lists.easy).map(function (e) { return [e.name, e.score]; }),
      want.map(function (r) { return [r.name, r.score]; }));
    const seen = texts(p);
    assert.ok(seen.indexOf('YOUR PLACE: ' + place + ' OF 3') !== -1, seen.join(' | '));
    assert.deepStrictEqual(seen.filter(function (t) { return /^\d{7}$/.test(t); }), want.map(function (r) { return pad7(r.score); }), 'the rows are not in order');
    // Three tokens, three scores, and each token was used once.
    assert.strictEqual(p.requests.filter(function (r) { return r.path === '/v1/runs'; }).length, 3);
    assert.strictEqual(new Set(p.requests.filter(function (r) { return r.path === '/v1/scores' && r.method === 'POST'; }).map(function (r) { return r.body.token; })).size, 3);
    p.requests.forEach(function (r) { assert.strictEqual(r.status, 200, r.method + ' ' + r.path); });

    // Opened from the menu later, the panel shows the same board, read from the Worker.
    s.seconds(0.6);
    s.press('esc');
    s.seconds(31);                                 // the boards are asked for again after 30 s
    s.press('down');                               // any key ends the idle rotation that began meanwhile
    assert.strictEqual(TG.UI.panel, 'menu');
    await p.settle();
    const gets = p.requests.filter(function (r) { return r.method === 'GET'; }).length;
    s.press('down'); s.press('down'); s.press('enter');
    assert.strictEqual(TG.UI.panel, 'scores');
    assert.strictEqual(TG.UI.page, 'easy', 'the page of the difficulty last played');
    await p.settle();
    assert.strictEqual(p.requests.filter(function (r) { return r.method === 'GET'; }).length, gets + 1, 'opening the panel did not ask for the boards');
    assert.deepStrictEqual(stubs.plain(TG.Board.state.lists.easy).map(function (e) { return e.name; }), want.map(function (r) { return r.name; }));
    assert.deepStrictEqual(texts(p).filter(function (t) { return /^\d{7}$/.test(t); }), want.map(function (r) { return pad7(r.score); }));
    // Until the next run starts, the page still says where the last run landed.
    assert.ok(texts(p).indexOf('YOUR PLACE: ' + place + ' OF 3') !== -1, 'the place is gone after the panel was left');
    assert.deepStrictEqual(s.env.errors, []);
  });

  await check('Initials on the block list never reach the Worker: they are refused on the initials screen, and other initials are then accepted', async function () {
    const p = pair();
    const s = p.session;
    const TG = p.TG;
    toMenu(p);
    const result = await playRun(p, 'medium');
    shot.leaveResults(s);
    assert.strictEqual(s.screen(), 'highScoreEntry');
    const before = p.requests.length;
    ['ass', 'kkk', blocklist[blocklist.length - 1].toLowerCase()].forEach(function (name) {
      s.type(name);
      s.press('enter');
      assert.strictEqual(s.screen(), 'highScoreEntry', name + ' was accepted');
      assert.ok(texts(p).indexOf('TRY OTHER INITIALS') !== -1, name);
    });
    await p.settle();
    assert.strictEqual(p.requests.length, before, 'a request was made for refused initials');
    assert.strictEqual(p.scores().length, 0);
    assert.strictEqual(TG.Board.state.send, 'none');
    assert.strictEqual(TG.Save.getSetting('initials'), 'PIP', 'refused initials were saved');
    assert.ok(TG.Save.scores('medium').every(function (e) { return e.score !== Math.floor(result.score); }), 'the refused entry is in the table of this computer');
    assert.strictEqual(TG.Board.hasToken('medium'), true, 'the token was used up by a refusal');
    s.type('amy');                                 // the next letter starts the initials again
    s.press('enter');
    assert.strictEqual(s.screen(), 'title');
    await p.settle();
    assert.deepStrictEqual(p.scores(), [rowFor(result, 'AMY')]);
    assert.strictEqual(TG.Board.state.send, 'sent');
    // Every name the Worker ever saw in this check.
    const names = p.requests.filter(function (r) { return r.body && r.body.name !== undefined; }).map(function (r) { return r.body.name; });
    assert.deepStrictEqual(names, ['AMY']);
    assert.deepStrictEqual(s.env.errors, []);
  });

  await check('A score the Worker refuses (a token too young for the run): the line for a refusal is shown, not the one for a service that cannot be reached, and the score stays on this computer', async function () {
    const p = pair();
    const s = p.session;
    const TG = p.TG;
    toMenu(p);
    const result = await playRun(p, 'hard', { stopClock: true });
    shot.leaveResults(s);
    assert.strictEqual(s.screen(), 'highScoreEntry');
    s.type('dav');
    s.press('enter');
    assert.strictEqual(TG.UI.page, 'hard');
    await p.settle();
    const send = p.requests.filter(function (r) { return r.method === 'POST' && r.path === '/v1/scores'; });
    assert.strictEqual(send.length, 1);
    assert.strictEqual(send[0].status, 400);
    assert.deepStrictEqual(send[0].json, { ok: false, error: 'too_soon' });
    assert.strictEqual(p.scores().length, 0, 'the Worker stored a refused score');
    assert.strictEqual(TG.Board.state.send, 'failed');
    assert.strictEqual(TG.Board.state.sendError, 'refused');
    assert.strictEqual(TG.Board.state.place, 0);
    const seen = texts(p);
    assert.ok(seen.indexOf('WORLD SCORES DID NOT TAKE THIS SCORE.') !== -1, seen.join(' | '));
    assert.ok(seen.indexOf('COULD NOT REACH WORLD SCORES.') === -1, 'the service was reached: ' + seen.join(' | '));
    assert.ok(seen.indexOf('SAVED ON THIS COMPUTER.') !== -1, seen.join(' | '));
    assert.ok(seen.indexOf('NO SCORES YET. BE THE FIRST!') !== -1, 'the board itself is still shown');
    // The score is in the table of this computer, and on its page.
    const local = TG.Save.scores('hard');
    assert.strictEqual(local[0].name, 'DAV');
    assert.strictEqual(local[0].score, Math.floor(result.score));
    s.seconds(0.6);
    for (let i = 0; i < 3 && TG.UI.page !== 'local'; i++) s.press('right');
    assert.strictEqual(TG.UI.page, 'local');
    // The new entry blinks there, so it is looked for over half a second of frames.
    let page = [];
    for (let i = 0; i < 30; i++) page = page.concat(texts(p));
    assert.ok(page.indexOf('THIS COMPUTER') !== -1);
    assert.ok(page.indexOf('1 DAV ' + pad7(Math.floor(result.score))) !== -1, 'the entry is not on the page of this computer');
    // The game goes on: back to the menu, and a new run can start.
    s.press('esc');
    assert.strictEqual(TG.UI.panel, 'menu');
    s.press('enter');
    assert.strictEqual(s.screen(), 'difficultySelect');
    assert.deepStrictEqual(s.env.errors, []);

    // The same with a score that misses the top five of this computer: only the first line.
    const q = pair();
    toMenu(q);
    const low = await playRun(q, 'hard', { stopClock: true, short: true });
    assert.ok(!q.TG.Save.qualifies('hard', low.score));
    shot.leaveResults(q.session);
    assert.strictEqual(q.session.screen(), 'highScoreEntry');
    q.session.type('low');
    q.session.press('enter');
    await q.settle();
    const refused = q.requests.filter(function (r) { return r.method === 'POST' && r.path === '/v1/scores'; });
    assert.strictEqual(refused.length, 1);
    assert.deepStrictEqual(refused[0].json, { ok: false, error: 'too_soon' });
    assert.strictEqual(q.TG.Board.state.send, 'failed');
    const lines = texts(q);
    assert.ok(lines.indexOf('WORLD SCORES DID NOT TAKE THIS SCORE.') !== -1, lines.join(' | '));
    assert.ok(lines.indexOf('SAVED ON THIS COMPUTER.') === -1, 'the score was not saved on this computer');
    assert.strictEqual(q.scores().length, 0);
  });

  await check('With WORLD SCORES switched off in Options, a whole run makes no request and the screens are the ones without world scores', async function () {
    const p = pair();
    const s = p.session;
    const TG = p.TG;
    toMenu(p);
    s.press('down'); s.press('down'); s.press('down'); s.press('enter');   // OPTIONS
    for (let i = 0; i < 6; i++) s.press('down');
    assert.ok(texts(p).indexOf('SENDS YOUR INITIALS AND SCORE') !== -1, 'the WORLD SCORES line is not selected');
    s.press('enter');
    assert.strictEqual(TG.Save.getSetting('worldScores'), false);
    assert.strictEqual(TG.Board.enabled(), false);
    s.press('esc');
    s.press('up'); s.press('up'); s.press('up');   // back to START
    const result = await playRun(p, 'easy', { wpm: 70 });
    shot.leaveResults(s);
    assert.strictEqual(s.screen(), 'highScoreEntry');
    s.type('ass');                                 // the block list belongs to the world scores
    s.press('enter');
    assert.strictEqual(s.screen(), 'title');
    assert.strictEqual(TG.UI.page, null);
    await p.settle();
    assert.strictEqual(TG.Save.scores('easy')[0].score, Math.floor(result.score));
    assert.strictEqual(p.requests.length, 0, 'requests: ' + p.paths().join(', '));
    assert.strictEqual(p.scores().length, 0);
    assert.deepStrictEqual(s.env.errors, []);
  });

  if (HOME === undefined) {
    console.log('skip - a copy of the game on a page the Worker takes no scores from: the Worker exports no list of pages');
  } else {
    await check('A copy of the game on a page the Worker takes no scores from (another site, or a file): no token, so the game plays on with this computer\'s scores; the boards are still read', async function () {
      for (const origin of ['https://someone-else.example', 'null']) {
        const p = pair({ origin: origin });
        const s = p.session;
        const TG = p.TG;
        toMenu(p);
        // The run token is refused.
        s.press('enter');
        s.type('easy');
        await p.settle();
        assert.deepStrictEqual(p.paths(), ['POST /v1/runs 403'], origin);
        assert.strictEqual(TG.Board.hasToken('easy'), false, origin);
        s.type('ready');
        assert.ok(shot.playUntil(s, 'results', shot.createBot({ wpm: 70 }), 1500), 'the run ended on ' + s.screen());
        s.seconds(4.5);
        const result = TG.Game.state.result;
        shot.leaveResults(s);
        // The score reaches the top five of this computer: the initials screen as it always was.
        assert.strictEqual(s.screen(), 'highScoreEntry', origin);
        const entry = texts(p);
        assert.ok(entry.indexOf('NEW HIGH SCORE!') !== -1, origin);
        assert.ok(entry.indexOf('INITIALS AND SCORE ALSO GO TO WORLD SCORES') === -1, origin + ': the screen says the score is sent');
        s.type('dav');
        s.press('enter');
        await p.settle();
        assert.strictEqual(s.screen(), 'title');
        assert.strictEqual(TG.UI.page, 'local', origin + ': the panel opens where the new entry is');
        assert.strictEqual(TG.Save.scores('easy')[0].score, Math.floor(result.score));
        assert.strictEqual(p.scores().length, 0);
        assert.strictEqual(TG.Board.state.send, 'none', origin);
        assert.ok(p.requests.every(function (r) { return !(r.method === 'POST' && r.path === '/v1/scores'); }), origin + ': a score was sent');
        // Reading the boards is open to every page.
        s.press('left');
        assert.strictEqual(TG.UI.page, 'hard');
        await p.settle();
        assert.strictEqual(TG.Board.state.boards, 'ready', origin);
        assert.ok(texts(p).indexOf('NO SCORES YET. BE THE FIRST!') !== -1, origin);
        assert.deepStrictEqual(s.env.errors, []);
      }
    });
  }

  const posts = function (p) {
    return p.requests.filter(function (r) { return r.method === 'POST' && r.path === '/v1/scores'; });
  };

  await check('The player can decline: Esc on the WORLD SCORES initials screen, and Esc then Enter on NEW HIGH SCORE!, send nothing to the Worker', async function () {
    // A short run: the screen is shown for the world scores alone. Esc goes to the title.
    const p = pair();
    const s = p.session;
    const TG = p.TG;
    toMenu(p);
    const low = await playRun(p, 'easy', { short: true });
    assert.ok(!TG.Save.qualifies('easy', low.score));
    shot.leaveResults(s);
    assert.strictEqual(s.screen(), 'highScoreEntry');
    const entry = texts(p);
    assert.ok(entry.indexOf('WORLD SCORES') !== -1 && entry.indexOf('ESC: DO NOT SEND') !== -1, entry.join(' | '));
    const before = p.requests.length;
    s.press('esc');
    assert.strictEqual(s.screen(), 'title');
    assert.strictEqual(TG.UI.panel, 'menu');
    await p.settle();
    assert.strictEqual(p.requests.length, before, 'requests after Esc: ' + p.paths().join(', '));
    assert.strictEqual(p.scores().length, 0);
    assert.strictEqual(TG.Board.state.send, 'none');
    assert.strictEqual(TG.Save.getSetting('initials'), 'PIP', 'initials were saved');

    // A whole run: the score belongs in the table of this computer. Esc keeps it there only.
    s.seconds(1.3);
    const high = await playRun(p, 'easy', { wpm: 70 });
    shot.leaveResults(s);
    assert.ok(texts(p).indexOf('NEW HIGH SCORE!') !== -1);
    const sent = p.requests.length;
    s.press('esc');
    assert.strictEqual(s.screen(), 'highScoreEntry');
    assert.ok(texts(p).indexOf('THIS SCORE STAYS ON THIS COMPUTER') !== -1);
    s.type('dav');
    s.press('enter');
    assert.strictEqual(s.screen(), 'title');
    assert.strictEqual(TG.UI.page, 'local', 'the panel opens where the new entry is');
    await p.settle();
    assert.strictEqual(posts(p).length, 0, 'a score was sent after Esc');
    assert.strictEqual(p.scores().length, 0);
    assert.strictEqual(TG.Save.scores('easy')[0].name, 'DAV');
    assert.strictEqual(TG.Save.scores('easy')[0].score, Math.floor(high.score));
    // Only the boards were read since Esc: the panel asks for them when it opens.
    assert.deepStrictEqual(p.requests.slice(sent).map(function (r) { return r.method + ' ' + r.path; }), ['GET /v1/scores']);
    assert.deepStrictEqual(s.env.errors, []);
  });

  await check('A new player who presses Enter without reading sends nothing: the second Enter after the results comes too early, and Enter alone does not send a score as PIP', async function () {
    const p = pair();
    const s = p.session;
    const TG = p.TG;
    toMenu(p);
    await playRun(p, 'medium', { short: true });
    // Two Enter presses one frame apart on the last results page.
    for (let i = 0; i < 6 && s.screen() === 'results'; i++) { s.press('enter'); s.press('enter'); s.seconds(0.3); }
    assert.strictEqual(s.screen(), 'highScoreEntry', 'the second Enter left the initials screen');
    // Enter every quarter of a second for three seconds.
    for (let i = 0; i < 12; i++) { s.press('enter'); s.seconds(0.25); }
    assert.strictEqual(s.screen(), 'highScoreEntry');
    await p.settle();
    assert.strictEqual(posts(p).length, 0, 'a score was sent');
    assert.strictEqual(p.scores().length, 0);
    assert.ok(texts(p).indexOf('TYPE 3 LETTERS FIRST') !== -1);
    // Typed initials are sent.
    s.type('mia');
    s.press('enter');
    await p.settle();
    assert.strictEqual(p.scores().length, 1);
    assert.strictEqual(p.scores()[0].name, 'MIA');

    // The next run: MIA is offered now, so Enter alone would send. The second of two Enter presses one
    // frame apart still sends nothing, because the screen reads no Enter in its first half second.
    s.seconds(0.6);
    s.press('esc');
    assert.strictEqual(TG.UI.panel, 'menu');
    await playRun(p, 'medium', { short: true });
    for (let i = 0; i < 6 && s.screen() === 'results'; i++) { s.press('enter'); s.press('enter'); s.seconds(0.3); }
    assert.strictEqual(s.screen(), 'highScoreEntry', 'the second Enter sent the run');
    assert.ok(texts(p).indexOf('ENTER: SEND AS MIA') !== -1);
    await p.settle();
    assert.strictEqual(posts(p).length, 1, 'a score was sent by the second Enter');
    s.seconds(0.3);
    s.press('enter');                              // after the half second, Enter alone takes MIA
    assert.strictEqual(s.screen(), 'title');
    await p.settle();
    assert.strictEqual(posts(p).length, 2);
    assert.deepStrictEqual(p.scores().map(function (r) { return r.name; }), ['MIA', 'MIA']);
    assert.deepStrictEqual(s.env.errors, []);
  });

  await check('A run ended in under 10 s with points is not offered to the world scores (the Worker would refuse it): no initials screen, no request', async function () {
    const p = pair();
    const s = p.session;
    const TG = p.TG;
    toMenu(p);
    s.press('enter');
    s.type('hard');
    await p.settle();
    assert.strictEqual(TG.Board.hasToken('hard'), true);
    s.type('ready');
    const bot = shot.createBot({ wpm: 120 });
    for (let i = 0; i < 60 * 9 && s.screen() === 'playing'; i++) s.steps(1, bot);   // 9 s of play
    assert.ok(TG.Game.state.score > 0, 'the bot has no points after 9 s');
    s.frame();
    s.press('esc');
    s.press('up');
    s.press('enter');
    s.press('enter');
    assert.strictEqual(s.screen(), 'results');
    const result = TG.Game.state.result;
    assert.ok(result.score > 0 && result.time < 10, 'score ' + result.score + ' in ' + result.time + ' s');
    assert.ok(!TG.Save.qualifies('hard', result.score));
    s.seconds(4.5);
    for (let i = 0; i < 6 && s.screen() === 'results'; i++) { s.press('enter'); s.seconds(0.3); }
    assert.strictEqual(s.screen(), 'title', 'the run went to the initials screen');
    assert.strictEqual(TG.UI.panel, 'menu');
    await p.settle();
    assert.deepStrictEqual(p.paths(), ['POST /v1/runs 200', 'POST /v1/stats 200', 'POST /v1/stats 200']);
    // The limit the game follows is the Worker's own.
    assert.strictEqual(TG.Board.MIN_TIME, W.RULES.minTime);
    assert.deepStrictEqual(s.env.errors, []);
  });

  await check('A fast typist: the game measures a speed inside words above the Worker\'s limit, sends the limit, and the run is accepted and placed', async function () {
    const p = pair();
    const s = p.session;
    const TG = p.TG;
    toMenu(p);
    const result = await playRun(p, 'easy', { short: true, wpm: 1000 });
    const wpm = Math.round(result.typing.wpm);
    assert.ok(wpm > W.RULES.maxWpm, 'the bot at 1000 WPM was measured at ' + wpm);
    assert.ok(result.time >= 10, 'the run took ' + result.time + ' s');
    shot.leaveResults(s);
    assert.strictEqual(s.screen(), 'highScoreEntry');
    s.type('zip');
    s.press('enter');
    await p.settle();
    const sent = posts(p);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].body.wpm, W.RULES.maxWpm, 'the speed that was sent');
    assert.strictEqual(sent[0].status, 200, JSON.stringify(sent[0].json));
    assert.deepStrictEqual(p.scores(), [Object.assign(rowFor(result, 'ZIP'), { wpm: W.RULES.maxWpm })]);
    assert.strictEqual(TG.Board.state.send, 'sent');
    const seen = texts(p);
    assert.ok(seen.indexOf('YOUR PLACE: 1 OF 1') !== -1, seen.join(' | '));
    assert.ok(seen.indexOf(String(W.RULES.maxWpm)) !== -1, 'the row on the WORLD page');
    assert.deepStrictEqual(s.env.errors, []);
  });

  await check('The Worker\'s hourly limit: after 60 scores from one address the next run is told TOO MANY SCORES SENT FROM HERE THIS HOUR., while the board is still shown', async function () {
    const p = pair();
    const s = p.session;
    const TG = p.TG;
    toMenu(p);
    // Sixty runs from the same address, sent straight to the Worker: tokens now, scores a little later.
    const call = async function (pathname, body) {
      const response = await p.fetch(BASE + pathname, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return { status: response.status, json: JSON.parse(await response.text()) };
    };
    const tokens = [];
    for (let i = 0; i < W.RULES.hourly; i++) tokens.push((await call('/v1/runs', { difficulty: 'easy' })).json.token);
    s.seconds(12);
    for (let i = 0; i < tokens.length; i++) {
      const r = await call('/v1/scores', { token: tokens[i], name: 'AAA', score: 100 + i, wpm: 20, accuracy: 90, rank: 'C', cleared: false, time: 12 });
      assert.strictEqual(r.status, 200, 'score ' + (i + 1) + ': ' + JSON.stringify(r.json));
    }
    assert.strictEqual(p.scores().length, W.RULES.hourly);
    if (TG.UI.panel !== 'menu') s.press('down');   // any key ends the idle rotation that began meanwhile
    assert.strictEqual(TG.UI.panel, 'menu');
    p.requests.length = 0;
    const result = await playRun(p, 'easy', { short: true });
    shot.leaveResults(s);
    assert.strictEqual(s.screen(), 'highScoreEntry');
    s.type('amy');
    s.press('enter');
    await p.settle();
    const sent = posts(p);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].status, 429);
    assert.deepStrictEqual(sent[0].json, { ok: false, error: 'rate' });
    assert.strictEqual(TG.Board.state.send, 'failed');
    assert.strictEqual(TG.Board.state.sendError, 'busy');
    const seen = texts(p);
    assert.ok(seen.indexOf('TOO MANY SCORES SENT FROM HERE THIS HOUR.') !== -1, seen.join(' | '));
    assert.ok(seen.indexOf('COULD NOT REACH WORLD SCORES.') === -1, seen.join(' | '));
    assert.strictEqual(seen.filter(function (t) { return /^\d{7}$/.test(t); }).length, 10, 'the board is shown');
    assert.ok(p.scores().every(function (r) { return r.name !== 'AMY'; }));
    assert.ok(result.score > 0);
    assert.deepStrictEqual(s.env.errors, []);
  });

  await check('No promise was left without a handler in any check', function () {
    assert.deepStrictEqual(unhandled, []);
  });

  finished = true;
  console.log('');
  console.log('test-board-server: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(function (e) {
  finished = true;
  console.log('FAIL - test-board-server.js stopped: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
