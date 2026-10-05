// test/test-server.js
// Tests for the world scores service (server/). Run from the project root: node test/test-server.js
//
// docs/LEADERBOARD.md is the agreement these tests hold the service to. The tests import the real
// Worker module (server/src/worker.js) and call its fetch handler with real Request objects. env.DB
// is a small stand-in for Cloudflare's D1 built on node:sqlite (in memory), with server/schema.sql
// applied to it. env.NOW gives the Worker its clock, so no test waits in real time.
//
// Sections:
//   1. the D1 stand-in and the test helpers
//   2. the files under server/ (schema, block list, wrangler.toml, the limits and codes of the document)
//   3. paths, methods, the origin and content type of a POST, body size and CORS
//   4. the run token, and that it works once
//   5. the thirteen checks of LEADERBOARD 5, one test per row, and their order
//   6. the boards: order, place and total, the limit query, what is kept in memory, trimming, dates
//   7. the rate limit, what is kept of a network address, and the hourly clean-up
//   8. SQL injection, the statements the Worker runs and the work each request costs
//   9. failures inside the service (500)
//  10. the limits against the real game (the headless bot of test/sim.js)
//  11. the check that server/README.md gives for a new deployment
//
// A check passes when its function returns without throwing. If the function returns a string, the
// string is printed after the description (section 10 uses this to report measured values).
//
// No npm packages: Node's own modules only (node:sqlite needs Node 22.13 or later).
'use strict';

// A local time zone far from UTC, so that the tests on dates fail if the service used local time.
process.env.TZ = 'Pacific/Kiritimati';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const nodeCrypto = require('crypto');
const { pathToFileURL } = require('url');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'server');
const BASE = 'https://spell-runner-scores.example.workers.dev';
const SECRET = 'test-secret-7f3a9c1e5b2d4086-for-tests-only';
const T0 = Date.UTC(2026, 9, 3, 12, 0, 0);          // 2026-10-03T12:00:00Z
const HOUR = 3600;

const CHECK_SECONDS = 30;                            // a check that takes longer has failed

let passed = 0;
let failed = 0;
let current = '';                                    // the check that is running
let finished = false;                                // the summary line has been printed

function ok(condition, description, detail) {
  if (condition) {
    passed++;
    console.log('ok - ' + description);
  } else {
    failed++;
    console.log('FAIL - ' + description + (detail ? ' (' + detail + ')' : ''));
  }
}

function skip(description) {
  console.log('skip - ' + description);
}

async function check(description, fn) {
  current = description;
  let timer = null;
  try {
    // A call to the Worker that never returns must fail the check, not end the file quietly.
    const late = new Promise(function (resolve, reject) {
      timer = setTimeout(function () { reject(new Error('no answer within ' + CHECK_SECONDS + ' s')); }, CHECK_SECONDS * 1000);
    });
    const note = await Promise.race([Promise.resolve().then(fn), late]);
    ok(true, description + (typeof note === 'string' ? ': ' + note : ''));
  } catch (e) {
    ok(false, description, String(e && e.message ? e.message : e).split('\n')[0]);
  } finally {
    clearTimeout(timer);
  }
}

// Node ends a process whose pending work can never finish with exit code 0. If that happens before
// the summary line, the file has not passed.
process.on('exit', function () {
  if (finished) return;
  console.log('FAIL - test-server.js ended during "' + current + '" without finishing');
  console.log('');
  console.log('test-server: ' + passed + ' passed, ' + (failed + 1) + ' failed');
  process.exitCode = 1;
});

// =================================================================================================
// 1. The D1 stand-in and the test helpers
// =================================================================================================
//
// FakeD1 behaves like a D1 binding for the calls the Worker makes:
//   db.prepare(sql)            a statement; the SQL is compiled when the statement runs, as in D1
//   statement.bind(...values)  a new statement with the values (D1's types: null, number, string,
//                              boolean as 1 or 0, ArrayBuffer; anything else throws). The number of
//                              values must be the number of parameters, as in D1
//   statement.first(column?)   the first row, one column of it, or null
//   statement.all()            { results, success, meta }
//   statement.run()            { results, success, meta: { changes, last_row_id, ... } }
//   statement.raw()            rows as arrays
//   db.batch([statements])     runs them in one transaction and returns an array of results; if one
//                              fails, nothing of the batch is kept and the call rejects
//   db.exec(sql)               runs statements without parameters (the tests apply the schema with it)
// Extras for the tests: db.db (the DatabaseSync), db.log (every SQL text prepared), db.execs (every
// SQL text passed to exec), db.failWith (an Error that every call throws while it is set).

const SEEN_SQL = new Set();       // every SQL text any Worker call prepared, in the whole run

function toSqlValue(value) {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError("D1_TYPE_ERROR: Type '" + typeof value + "' not supported for value '" + String(value) + "'");
}

function parameterCount(sql) {
  let highest = 0;
  let anonymous = 0;
  const pattern = /\?(\d*)/g;
  let m;
  while ((m = pattern.exec(sql)) !== null) {
    if (m[1]) highest = Math.max(highest, Number(m[1]));
    else anonymous++;
  }
  return highest + anonymous;
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
    return this.d1.execute(this.sql, this.values);
  }

  async first(column) {
    const rows = this.execute().results;
    if (rows.length === 0) return null;
    if (column === undefined) return rows[0];
    if (!Object.prototype.hasOwnProperty.call(rows[0], column)) throw new Error('D1_ERROR: Column not found: ' + column);
    return rows[0][column];
  }

  async all() {
    return this.execute();
  }

  async run() {
    return this.execute();
  }

  async raw() {
    return this.execute().results.map((row) => Object.keys(row).map((key) => row[key]));
  }
}

class FakeD1 {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.log = [];
    this.execs = [];
    this.failWith = null;
  }

  prepare(sql) {
    if (typeof sql !== 'string') throw new TypeError('D1_ERROR: prepare needs a string');
    this.log.push(sql);
    SEEN_SQL.add(sql);
    return new FakeStatement(this, sql, []);
  }

  execute(sql, values) {
    if (this.failWith) throw this.failWith;
    if (values.length !== parameterCount(sql)) throw new Error('D1_ERROR: Wrong number of parameter bindings for SQL query.');
    const rows = this.db.prepare(sql).all(...values).map((row) => Object.assign({}, row));
    const reads = /^\s*(SELECT|WITH|EXPLAIN|PRAGMA)\b/i.test(sql);
    const counts = reads ? { changes: 0, id: 0 } : this.db.prepare('SELECT changes() AS changes, last_insert_rowid() AS id').get();
    return {
      results: rows,
      success: true,
      meta: {
        changes: Number(counts.changes), last_row_id: Number(counts.id), changed_db: Number(counts.changes) > 0,
        duration: 0, rows_read: 0, rows_written: Number(counts.changes)
      }
    };
  }

  async batch(statements) {
    if (this.failWith) throw this.failWith;
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

  async exec(sql) {
    if (this.failWith) throw this.failWith;
    this.execs.push(sql);
    this.db.exec(sql);
    return { count: sql.split(';').filter((part) => part.trim() !== '').length, duration: 0 };
  }

  // For the tests' own reading. Not part of D1.
  rows(sql, ...values) {
    return this.db.prepare(sql).all(...values).map((row) => Object.assign({}, row));
  }

  count(table) {
    return this.rows('SELECT COUNT(*) AS n FROM ' + table)[0].n;
  }
}

function sha256Hex(text) {
  return nodeCrypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function hmacBase64Url(secret, text) {
  return nodeCrypto.createHmac('sha256', secret).update(text, 'utf8').digest('base64url');
}

function decodeToken(token) {
  const parts = token.split('.');
  return { part: parts[0], sig: parts[1], payload: JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) };
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function changeChar(text, index) {
  return text.slice(0, index) + (text[index] === 'A' ? 'B' : 'A') + text.slice(index + 1);
}

function expectError(r, status, code, what) {
  const where = what ? what + ': ' : '';
  assert.strictEqual(r.status, status, where + 'status ' + r.status + ' with ' + r.text + ', expected ' + status + ' ' + code);
  assert.deepStrictEqual(r.json, { ok: false, error: code }, where + 'body ' + r.text);
}

function expectAccepted(r, what) {
  assert.strictEqual(r.status, 200, (what ? what + ': ' : '') + 'status ' + r.status + ' with ' + r.text);
  assert.strictEqual(r.json.ok, true, what);
}

async function captureErrors(fn) {
  const real = console.error;
  const lines = [];
  console.error = function () { lines.push(Array.prototype.map.call(arguments, String).join(' ')); };
  try {
    await fn();
  } finally {
    console.error = real;
  }
  return lines;
}

// A submission that passes every check on easy, medium and hard once its token is 60 s old.
const GOOD = { name: 'DAV', score: 5000, wpm: 30, accuracy: 95, rank: 'B', cleared: false, time: 60 };

async function main() {
  const W = await import(pathToFileURL(path.join(SERVER, 'src', 'worker.js')).href);
  const blocklistModule = await import(pathToFileURL(path.join(SERVER, 'src', 'blocklist.js')).href);
  const worker = W.default;
  const LIMITS = W.LIMITS;
  const RULES = W.RULES;
  const BLOCKLIST = blocklistModule.BLOCKLIST;
  const SCHEMA = fs.readFileSync(path.join(SERVER, 'schema.sql'), 'utf8');
  const SOURCE = fs.readFileSync(path.join(SERVER, 'src', 'worker.js'), 'utf8');
  const DIFFS = ['easy', 'medium', 'hard'];
  let addressCounter = 0;

  // A fresh service: its own database (schema applied), its own clock.
  function service(overrides) {
    const d1 = new FakeD1();
    d1.db.exec(SCHEMA);
    const clock = { now: T0 };
    const env = Object.assign({ DB: d1, TOKEN_SECRET: SECRET, NOW: function () { return clock.now; } }, overrides);
    const s = { d1: d1, clock: clock, env: env };

    s.fetch = function (request) {
      return worker.fetch(request, env, {});
    };

    // options: body (an object is sent as JSON, a string as it is), headers, ip (CF-Connecting-IP)
    s.call = async function (method, pathname, options) {
      const o = options || {};
      const headers = Object.assign({}, o.headers);
      if (o.ip) headers['CF-Connecting-IP'] = o.ip;
      const init = { method: method, headers: headers };
      if (o.body !== undefined) {
        init.body = typeof o.body === 'string' ? o.body : JSON.stringify(o.body);
        if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
      }
      const response = await s.fetch(new Request(BASE + pathname, init));
      const text = await response.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
      return { status: response.status, headers: response.headers, text: text, json: json };
    };

    s.wait = function (seconds) {
      clock.now += Math.round(seconds * 1000);
    };

    s.start = async function (difficulty) {
      const r = await s.call('POST', '/v1/runs', { body: { difficulty: difficulty } });
      assert.strictEqual(r.status, 200, 'POST /v1/runs gave ' + r.status + ' ' + r.text);
      return r.json.token;
    };

    s.submit = function (token, fields, ip) {
      return s.call('POST', '/v1/scores', { body: Object.assign({ token: token }, GOOD, fields), ip: ip || nextAddress() });
    };

    // Starts a run, lets `age` seconds pass (default: the run's time) and submits it.
    // options: difficulty (default easy), age, ip, token (use this one instead of starting a run), omit (fields to leave out)
    s.attempt = async function (fields, options) {
      const o = options || {};
      const token = o.token !== undefined ? o.token : await s.start(o.difficulty || 'easy');
      const body = Object.assign({ token: token }, GOOD, fields);
      (o.omit || []).forEach(function (key) { delete body[key]; });
      const age = o.age !== undefined ? o.age : (typeof body.time === 'number' ? body.time : 60);
      s.wait(age);
      return s.call('POST', '/v1/scores', { body: body, ip: o.ip || nextAddress() });
    };

    return s;
  }

  // A new address for each submission, so that the rate limit plays no part unless a test wants it.
  function nextAddress() {
    addressCounter++;
    return '10.' + ((addressCounter >> 16) & 255) + '.' + ((addressCounter >> 8) & 255) + '.' + (addressCounter & 255);
  }

  // ===============================================================================================
  // 2. The files under server/
  // ===============================================================================================

  await check('stand-in: first() gives a row, one column or null; all() and run() give results and meta', async () => {
    const d1 = new FakeD1();
    await d1.exec('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT)');
    const added = await d1.prepare('INSERT INTO t (v) VALUES (?1)').bind('a').run();
    assert.strictEqual(added.success, true);
    assert.strictEqual(added.meta.changes, 1);
    assert.strictEqual(added.meta.last_row_id, 1);
    assert.deepStrictEqual(await d1.prepare('SELECT id, v FROM t WHERE v = ?1').bind('a').first(), { id: 1, v: 'a' });
    assert.strictEqual(await d1.prepare('SELECT id, v FROM t WHERE v = ?1').bind('a').first('v'), 'a');
    assert.strictEqual(await d1.prepare('SELECT id, v FROM t WHERE v = ?1').bind('zz').first(), null);
    const all = await d1.prepare('SELECT v FROM t').all();
    assert.deepStrictEqual(all.results, [{ v: 'a' }]);
    assert.strictEqual(all.success, true);
    assert.strictEqual(typeof all.meta, 'object');
    assert.deepStrictEqual(await d1.prepare('SELECT id, v FROM t').raw(), [[1, 'a']]);
  });

  await check('stand-in: batch() is one transaction, and bind() refuses undefined and a wrong number of values', async () => {
    const d1 = new FakeD1();
    await d1.exec('CREATE TABLE t (v TEXT NOT NULL UNIQUE)');
    const results = await d1.batch([
      d1.prepare('INSERT INTO t (v) VALUES (?1)').bind('a'),
      d1.prepare('SELECT COUNT(*) AS n FROM t')
    ]);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].meta.changes, 1);
    assert.deepStrictEqual(results[1].results, [{ n: 1 }]);
    await assert.rejects(d1.batch([
      d1.prepare('INSERT INTO t (v) VALUES (?1)').bind('b'),
      d1.prepare('INSERT INTO t (v) VALUES (?1)').bind('a')
    ]));
    assert.strictEqual(d1.count('t'), 1, 'a failed batch left a row behind');
    assert.throws(() => d1.prepare('SELECT ?1').bind(undefined), /D1_TYPE_ERROR/);
    await assert.rejects(d1.prepare('SELECT ?1, ?2').bind(1).all(), /Wrong number/);
    assert.deepStrictEqual((await d1.prepare('SELECT ?1 AS v').bind(true).all()).results, [{ v: 1 }]);
  });

  await check('schema.sql: creates scores, hits and used with their indexes, and can be run again over data', async () => {
    const d1 = new FakeD1();
    d1.db.exec(SCHEMA);
    d1.db.exec("INSERT INTO scores (run_id, difficulty, name, score, wpm, accuracy, rank, cleared, time_s, created_at) VALUES ('r', 'easy', 'PIP', 1, 1, 1, 'C', 0, 10, 1)");
    d1.db.exec("INSERT INTO used (run_id, at) VALUES ('r', 1)");
    d1.db.exec(SCHEMA);
    d1.db.exec(SCHEMA);
    assert.strictEqual(d1.count('scores'), 1, 'running the schema again lost data');
    assert.strictEqual(d1.count('used'), 1, 'running the schema again lost data');
    const names = d1.rows("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").map((r) => r.type + ' ' + r.name);
    assert.deepStrictEqual(names, ['table days', 'table hits', 'index hits_at', 'index hits_ip', 'table scores', 'index scores_board', 'table seen', 'table stats', 'table used', 'index used_at']);
    const columns = d1.rows('PRAGMA table_info(scores)').map((c) => c.name);
    assert.deepStrictEqual(columns, ['id', 'run_id', 'difficulty', 'name', 'score', 'wpm', 'accuracy', 'rank', 'cleared', 'time_s', 'created_at']);
    assert.deepStrictEqual(d1.rows('PRAGMA table_info(hits)').map((c) => c.name), ['ip_hash', 'at']);
    assert.deepStrictEqual(d1.rows('PRAGMA table_info(used)').map((c) => c.name), ['run_id', 'at']);
    assert.throws(() => d1.db.exec("INSERT INTO scores (run_id, difficulty, name, score, wpm, accuracy, rank, cleared, time_s, created_at) VALUES ('r', 'easy', 'PIP', 1, 1, 1, 'C', 0, 10, 1)"),
      /UNIQUE/, 'run_id is not unique in scores');
    assert.throws(() => d1.db.exec("INSERT INTO used (run_id, at) VALUES ('r', 2)"), /UNIQUE/, 'run_id is not unique in used');
  });

  await check('blocklist.js: a plain array of uppercase three-letter strings, sorted, without repeats', () => {
    assert.ok(Array.isArray(BLOCKLIST), 'BLOCKLIST is not an array');
    assert.strictEqual(blocklistModule.default, BLOCKLIST, 'the default export is not the same array');
    assert.ok(BLOCKLIST.length >= 20 && BLOCKLIST.length <= 150, 'the list has ' + BLOCKLIST.length + ' entries');
    const bad = BLOCKLIST.filter((w) => typeof w !== 'string' || !/^[A-Z]{3}$/.test(w));
    assert.deepStrictEqual(bad, [], 'entries that are not three letters A to Z');
    assert.strictEqual(new Set(BLOCKLIST).size, BLOCKLIST.length, 'an entry is repeated');
    assert.deepStrictEqual(BLOCKLIST, BLOCKLIST.slice().sort(), 'the list is not in alphabetical order');
    // The initials the game ships with (CONTRACT 5.12) and the example of LEADERBOARD 3.2 stay usable,
    // and so do the initials of the check in server/README.md.
    for (const name of ['PIP', 'INK', 'DOT', 'TAB', 'CAP', 'AAA', 'DAV', 'TST']) assert.ok(!BLOCKLIST.includes(name), name + ' is blocked');
  });

  await check('blocklist.js: where one spelling of a word is refused, the other usual spelling is refused too', async () => {
    const pairs = [['SHT', 'SHI'], ['SLT', 'SLU'], ['TWT', 'TWA'], ['WNK', 'WAN'], ['PDO', 'PED'], ['PIS', 'PSS'], ['FCK', 'FVK'], ['DIK', 'DIQ'],
      ['COK', 'COX'], ['KOK', 'KOX'], ['NGR', 'NGG'], ['NIG', 'NYG'], ['WTF', 'STF'], ['WTF', 'GTF'], ['KYS', 'KMS'], ['KIK', 'KYK']];
    for (const pair of pairs) {
      for (const name of pair) assert.ok(BLOCKLIST.includes(name), name + ' is not on the list (' + pair.join(' and ') + ' go together)');
    }
    // Through the handler: refused, and never on a board.
    const s = service();
    for (const name of pairs.map((pair) => pair[1]).concat(['PAK', 'YID', 'GUK', 'KLN', 'HTL', 'RTD', 'SPZ'])) {
      expectError(await s.attempt({ name: name }), 400, 'name', name);
    }
    assert.strictEqual(s.d1.count('scores'), 0);
  });

  // The id of a D1 database as Wrangler prints it. wrangler.toml holds the placeholder until the
  // database exists (server/README.md, step 3) and the real id from then on; both are right.
  const DATABASE_ID = /^database_id = "(REPLACE_WITH_DATABASE_ID|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"$/m;

  await check('wrangler.toml: name, main, compatibility date, the D1 binding, the hourly trigger, logs on, and no secret', () => {
    const toml = fs.readFileSync(path.join(SERVER, 'wrangler.toml'), 'utf8');
    const settings = toml.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
    assert.match(settings, /^name = "spell-runner-scores"$/m);
    const main = /^main = "([^"]+)"$/m.exec(settings);
    assert.ok(main, 'no main');
    assert.strictEqual(path.resolve(SERVER, main[1]), path.join(SERVER, 'src', 'worker.js'));
    const date = /^compatibility_date = "(\d{4}-\d{2}-\d{2})"$/m.exec(settings);
    assert.ok(date, 'no compatibility_date');
    assert.ok(date[1] >= '2026-01-01' && Date.parse(date[1]) <= Date.now(), 'compatibility_date ' + date[1] + ' is old or in the future');
    assert.match(settings, /^\[\[d1_databases\]\]$/m);
    assert.match(settings, /^binding = "DB"$/m);
    assert.match(settings, /^database_name = "spell-runner-scores"$/m);
    assert.match(settings, DATABASE_ID, 'database_id is neither the placeholder nor an id as Wrangler prints it');
    // One trigger, once an hour: a minute from 0 to 59 and a star in the other four fields.
    const crons = /^\[triggers\]\ncrons = \["([^"]*)"\]$/m.exec(settings);
    assert.ok(crons, 'no [triggers] with one cron');
    assert.match(crons[1], /^([0-9]|[1-5][0-9]) \* \* \* \*$/, 'the cron "' + crons[1] + '" does not run once an hour');
    assert.match(settings, /^\[observability(\.logs)?\]\nenabled = true$/m);
    // Cloudflare's own line per request is left out; the Worker's own error lines are kept.
    assert.match(settings, /^\[observability\.logs\]\nenabled = true\ninvocation_logs = false$/m);
    assert.ok(!/TOKEN_SECRET/.test(settings) && !/^\[vars\]/m.test(settings), 'wrangler.toml sets a variable or names the secret outside a comment');
  });

  await check('wrangler.toml: the test takes the placeholder and a real database id, and nothing else', () => {
    assert.match('database_id = "REPLACE_WITH_DATABASE_ID"', DATABASE_ID);
    assert.match('name = "x"\ndatabase_id = "1b2c3d4e-0000-1111-2222-333344445555"\n', DATABASE_ID);
    for (const bad of ['database_id = ""', 'database_id = "REPLACE"', 'database_id = "1b2c3d4e-0000-1111-2222-33334444555"',
      'database_id = "1B2C3D4E-0000-1111-2222-333344445555"', 'database_id = "spell-runner-scores"', '# database_id = "REPLACE_WITH_DATABASE_ID"']) {
      assert.doesNotMatch(bad, DATABASE_ID, bad);
    }
  });

  await check('worker.js: an ES module with a fetch handler, a scheduled handler and the pure pieces as named exports; no package is imported', () => {
    assert.strictEqual(typeof worker.fetch, 'function');
    assert.strictEqual(typeof worker.scheduled, 'function');
    for (const name of ['validateSubmission', 'signToken', 'verifyToken', 'sameText', 'sourceHash', 'sourceKey']) {
      assert.strictEqual(typeof W[name], 'function', name + ' is not exported');
    }
    assert.deepStrictEqual(Object.keys(LIMITS), DIFFS);
    const imports = SOURCE.match(/^[ \t]*import\s.*$/gm) || [];
    assert.deepStrictEqual(imports, ["import { BLOCKLIST } from './blocklist.js';"]);
    assert.ok(!/\brequire\s*\(|\bimport\s*\(/.test(SOURCE), 'worker.js loads something at run time');
    const lines = SOURCE.split('\n').length;
    assert.ok(lines < 700, 'worker.js has ' + lines + ' lines');
  });

  const documentPath = path.join(ROOT, 'docs', 'LEADERBOARD.md');
  if (!fs.existsSync(documentPath)) {
    skip('doc: the limits and error codes of docs/LEADERBOARD.md (the document is absent)');
  } else {
    const doc = fs.readFileSync(documentPath, 'utf8');

    await check('doc: the tables and indexes of schema.sql are those of LEADERBOARD 4', () => {
      const block = /## 4\. Database\n[\s\S]*?```sql\n([\s\S]*?)```/.exec(doc);
      assert.ok(block, 'no SQL block in section 4 of the document');
      // The statements without their comments and with single spaces, so that only the SQL is compared.
      const statements = function (sql) {
        return sql.replace(/--.*$/gm, '').split(';').map((part) => part.replace(/\s+/g, ' ').trim()).filter((part) => part !== '');
      };
      assert.deepStrictEqual(statements(SCHEMA), statements(block[1]));
    });

    await check('doc: the Worker\'s limits per difficulty are those of LEADERBOARD 5', () => {
      function row(label) {
        const m = new RegExp('^\\| ' + label + ' \\| (\\d+) \\| (\\d+) \\| (\\d+) \\|$', 'm').exec(doc);
        assert.ok(m, 'no row "' + label + '" in the document');
        return [Number(m[1]), Number(m[2]), Number(m[3])];
      }
      assert.deepStrictEqual(DIFFS.map((d) => LIMITS[d].cap), row('Score cap'));
      assert.deepStrictEqual(DIFFS.map((d) => LIMITS[d].minCleared), row('Shortest cleared run \\(s\\)'));
      assert.deepStrictEqual(DIFFS.map((d) => LIMITS[d].rate), row('Rate \\(points per second\\)'));
    });

    await check('doc: the rank rule of check 9 in LEADERBOARD 5 is the Worker\'s', () => {
      const row = /^\| 9 \| (.*) \| `implausible` \|$/m.exec(doc);
      assert.ok(row, 'no row 9 with the error implausible in the table of section 5');
      const said = {};
      const pattern = /\b([SABC]) needs (a cleared run and )?an accuracy of at least (\d+)/g;
      let m;
      while ((m = pattern.exec(row[1])) !== null) said[m[1]] = { cleared: !!m[2], accuracy: Number(m[3]) };
      said.C = { cleared: false, accuracy: 0 };
      assert.deepStrictEqual(said, JSON.parse(JSON.stringify(W.RANK_RULES)), 'the row says: ' + row[1]);
    });

    await check('doc: the Worker\'s error codes and statuses are those of LEADERBOARD 6', () => {
      const section = /## 6\. Error codes\n([\s\S]*?)\n## /.exec(doc);
      assert.ok(section, 'no section 6 in the document');
      const listed = {};
      const pattern = /`([a-z_]+)` \((\d{3})\)/g;
      let m;
      while ((m = pattern.exec(section[1])) !== null) listed[m[1]] = Number(m[2]);
      assert.deepStrictEqual(Object.assign({}, W.ERRORS), listed);
    });
  }

  // ===============================================================================================
  // 3. Paths, methods, the origin and content type of a POST, body size and CORS
  // ===============================================================================================

  await check('paths: an unknown path gives 404 not_found for GET and POST', async () => {
    const s = service();
    for (const p of ['/', '/v1', '/v1/', '/v1/score', '/v1/scores/', '/v1/scores/1', '/v1/runs/x', '/v2/scores', '/scores', '/favicon.ico', '/V1/SCORES']) {
      expectError(await s.call('GET', p), 404, 'not_found', 'GET ' + p);
      expectError(await s.call('POST', p, { body: { difficulty: 'easy' } }), 404, 'not_found', 'POST ' + p);
    }
  });

  await check('methods: a known path with another method gives 405 method and an Allow header', async () => {
    const s = service();
    for (const method of ['PUT', 'DELETE', 'PATCH']) {
      const r = await s.call(method, '/v1/scores', { body: {} });
      expectError(r, 405, 'method', method + ' /v1/scores');
      assert.strictEqual(r.headers.get('allow'), 'GET, POST, OPTIONS');
    }
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const r = await s.call(method, '/v1/runs', method === 'GET' ? {} : { body: {} });
      expectError(r, 405, 'method', method + ' /v1/runs');
      assert.strictEqual(r.headers.get('allow'), 'POST, OPTIONS');
    }
    const head = await s.fetch(new Request(BASE + '/v1/scores', { method: 'HEAD' }));
    assert.strictEqual(head.status, 405);
    const odd = await s.fetch(new Request(BASE + '/v1/scores', { method: 'constructor' }));
    assert.strictEqual(odd.status, 405);
    assert.strictEqual(s.d1.log.length, 0, 'a refused method reached the database');
  });

  await check('JSON: a body that is not JSON, or is not an object, gives 400 bad_request on both POST paths', async () => {
    const s = service();
    for (const p of ['/v1/runs', '/v1/scores']) {
      for (const body of ['', '{', 'not json', '{"difficulty":"easy"', 'null', '[]', '"easy"', '42', 'true', '\u0000']) {
        expectError(await s.call('POST', p, { body: body }), 400, 'bad_request', 'POST ' + p + ' with ' + JSON.stringify(body));
      }
      expectError(await s.call('POST', p), 400, 'bad_request', 'POST ' + p + ' with no body');
    }
    assert.strictEqual(s.d1.log.length, 0, 'a body that is not JSON reached the database');
  });

  await check('size: a body of 2,000 bytes is read; one byte more gives 413 too_large', async () => {
    const s = service();
    const pad = function (bytes) {
      const start = '{"difficulty":"easy","pad":"';
      return start + 'x'.repeat(bytes - start.length - 2) + '"}';
    };
    assert.strictEqual(Buffer.byteLength(pad(2000)), 2000);
    assert.strictEqual((await s.call('POST', '/v1/runs', { body: pad(2000) })).status, 200);
    expectError(await s.call('POST', '/v1/runs', { body: pad(2001) }), 413, 'too_large', '2,001 bytes on /v1/runs');
    expectError(await s.call('POST', '/v1/scores', { body: pad(2001) }), 413, 'too_large', '2,001 bytes on /v1/scores');
    // Bytes are counted, not characters: 1,000 two-byte characters with the JSON around them are over.
    const wide = '{"difficulty":"easy","pad":"' + 'é'.repeat(1000) + '"}';
    assert.ok(wide.length < 2000 && Buffer.byteLength(wide) > 2000);
    expectError(await s.call('POST', '/v1/runs', { body: wide }), 413, 'too_large', 'two-byte characters');
  });

  await check('size: a body over the limit is refused without being parsed, whether or not it is JSON', async () => {
    const s = service();
    const bodies = [
      '{"difficulty":"easy","pad":"' + 'x'.repeat(3000) + '"}',      // valid JSON that would otherwise be accepted
      '{{{{ not json ' + 'x'.repeat(3000)                             // invalid JSON: 413, not 400
    ];
    for (const body of bodies) {
      const realParse = JSON.parse;
      let parses = 0;
      let response;
      JSON.parse = function () { parses++; return realParse.apply(JSON, arguments); };
      try {
        response = await s.fetch(new Request(BASE + '/v1/runs', { method: 'POST', body: body, headers: { 'Content-Type': 'application/json' } }));
      } finally {
        JSON.parse = realParse;
      }
      assert.strictEqual(response.status, 413);
      assert.deepStrictEqual(await response.json(), { ok: false, error: 'too_large' });
      assert.strictEqual(parses, 0, 'JSON.parse was called ' + parses + ' time(s)');
    }
  });

  await check('size: the Content-Length header alone is enough for 413, and a stream is cut off at the limit', async () => {
    const s = service();
    const declared = await s.call('POST', '/v1/runs', { body: { difficulty: 'easy' }, headers: { 'Content-Length': '2001' } });
    expectError(declared, 413, 'too_large', 'Content-Length 2001');
    // A body sent in pieces with no length given: reading stops once 2,000 bytes are passed.
    let pulled = 0;
    let cancelled = false;
    const stream = new ReadableStream({
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(500).fill(120));
        if (pulled >= 1000) controller.close();
      },
      cancel() { cancelled = true; }
    }, { highWaterMark: 0 });
    const response = await s.fetch(new Request(BASE + '/v1/scores', { method: 'POST', body: stream, duplex: 'half', headers: { 'Content-Type': 'application/json' } }));
    assert.strictEqual(response.status, 413);
    assert.ok(pulled <= 8, 'the Worker read ' + pulled + ' pieces of 500 bytes');
    assert.ok(cancelled, 'the stream was not cancelled');
  });

  await check('order: the path is checked first, then the method, the origin, the content type, the size, and last the JSON', async () => {
    const s = service();
    const big = 'x'.repeat(3000);
    const foreign = { Origin: 'https://some-other-site.example', 'Content-Type': 'text/plain' };
    expectError(await s.call('POST', '/nowhere', { body: big, headers: foreign }), 404, 'not_found', 'unknown path, another origin, a large body');
    expectError(await s.call('PUT', '/v1/scores', { body: big, headers: foreign }), 405, 'method', 'wrong method, another origin, a large body');
    expectError(await s.call('POST', '/v1/scores', { body: big, headers: foreign }), 403, 'origin', 'another origin, text/plain, a large body');
    expectError(await s.call('POST', '/v1/scores', { body: big, headers: { 'Content-Type': 'text/plain' } }), 400, 'bad_request', 'text/plain with a large body');
    expectError(await s.call('POST', '/v1/scores', { body: big }), 413, 'too_large', 'large body that is not JSON');
    expectError(await s.call('POST', '/v1/scores', { body: 'x'.repeat(100) }), 400, 'bad_request', 'small body that is not JSON');
    assert.strictEqual(s.d1.log.length, 0);
  });

  const GAME_ORIGIN = 'https://piechart1.github.io';
  const OTHER_ORIGINS = ['https://some-other-site.example', 'http://piechart1.github.io', 'https://piechart1.github.io.example.com',
    'https://evil-piechart1.github.io', 'https://piechart1.github.io:8443', 'https://github.io', 'null', 'http://localhost.example.com',
    'https://localhost', 'http://127.0.0.1.example.com', 'http://127.0.0.2:8000', 'http://localhost:8787/', 'file://'];

  await check('origin: a POST from a page of another site gives 403 origin on both paths, and nothing is issued or stored', async () => {
    const s = service();
    // The game's own page, and the address itch.io serves every browser game from.
    assert.deepStrictEqual(Array.from(W.ORIGINS), [GAME_ORIGIN, 'https://html-classic.itch.zone']);
    const itch = await s.call('POST', '/v1/runs', { body: { difficulty: 'easy' }, headers: { Origin: 'https://html-classic.itch.zone' } });
    assert.strictEqual(itch.status, 200, 'the itch.io address was refused');
    for (const near of ['https://itch.zone', 'https://html-classic.itch.zone.example.com', 'http://html-classic.itch.zone', 'https://evil.itch.zone']) {
      expectError(await s.call('POST', '/v1/runs', { body: { difficulty: 'easy' }, headers: { Origin: near } }), 403, 'origin', near);
    }
    const token = await s.start('easy');
    s.wait(60);
    for (const origin of OTHER_ORIGINS) {
      const run = await s.call('POST', '/v1/runs', { body: { difficulty: 'easy' }, headers: { Origin: origin } });
      expectError(run, 403, 'origin', 'POST /v1/runs from ' + origin);
      assert.ok(!/token/.test(run.text), 'a token was issued to ' + origin);
      const sent = await s.call('POST', '/v1/scores', { body: Object.assign({ token: token }, GOOD), headers: { Origin: origin }, ip: nextAddress() });
      expectError(sent, 403, 'origin', 'POST /v1/scores from ' + origin);
      // Sent as text/plain, which a browser sends without asking first: still refused for its origin.
      const plain = await s.call('POST', '/v1/scores', { body: Object.assign({ token: token }, GOOD), headers: { Origin: origin, 'Content-Type': 'text/plain' } });
      expectError(plain, 403, 'origin', 'text/plain from ' + origin);
    }
    assert.strictEqual(s.d1.log.length, 0, 'a POST from another origin reached the database');
    // The token was not spent by the refusals.
    expectAccepted(await s.submit(token, {}));
  });

  await check('origin: the game\'s address, a local address and a request without an Origin header can POST; anybody can read the boards', async () => {
    const s = service();
    const origins = [GAME_ORIGIN, 'http://localhost', 'http://localhost:8417', 'http://127.0.0.1:8417', 'http://[::1]:8000', undefined];
    for (const origin of origins) {
      const headers = origin === undefined ? {} : { Origin: origin };
      const run = await s.call('POST', '/v1/runs', { body: { difficulty: 'easy' }, headers: headers });
      assert.strictEqual(run.status, 200, 'POST /v1/runs from ' + origin + ' gave ' + run.status);
      s.wait(60);
      expectAccepted(await s.call('POST', '/v1/scores', { body: Object.assign({ token: run.json.token }, GOOD), headers: headers, ip: nextAddress() }), 'POST /v1/scores from ' + origin);
    }
    assert.strictEqual(s.d1.count('scores'), origins.length);
    for (const origin of OTHER_ORIGINS.concat([GAME_ORIGIN])) {
      const boards = await s.call('GET', '/v1/scores', { headers: { Origin: origin } });
      assert.strictEqual(boards.status, 200, 'GET /v1/scores from ' + origin + ' gave ' + boards.status);
      assert.strictEqual(boards.headers.get('access-control-allow-origin'), '*');
      assert.strictEqual(boards.json.easy.length, origins.length);
    }
  });

  await check('content type: a POST whose body is not sent as application/json gives 400 bad_request without being read', async () => {
    const s = service();
    const token = await s.start('easy');
    s.wait(60);
    const body = JSON.stringify(Object.assign({ token: token }, GOOD));
    for (const type of ['text/plain', 'text/plain;charset=UTF-8', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x',
      'application/jsonp', 'application/json-seq', 'text/json', 'application/octet-stream', 'json']) {
      expectError(await s.call('POST', '/v1/scores', { body: body, headers: { 'Content-Type': type } }), 400, 'bad_request', 'POST /v1/scores as ' + type);
      expectError(await s.call('POST', '/v1/runs', { body: '{"difficulty":"easy"}', headers: { 'Content-Type': type } }), 400, 'bad_request', 'POST /v1/runs as ' + type);
    }
    // Without a Content-Type header at all (Request adds text/plain to a string body, so the body is given as bytes).
    const bare = await s.fetch(new Request(BASE + '/v1/scores', { method: 'POST', body: Buffer.from(body) }));
    assert.strictEqual(bare.status, 400);
    assert.deepStrictEqual(await bare.json(), { ok: false, error: 'bad_request' });
    // The body is not read: a stream that would never end is answered at once and never pulled from.
    let pulled = 0;
    const endless = new ReadableStream({ pull(controller) { pulled++; controller.enqueue(new Uint8Array(100).fill(120)); } }, { highWaterMark: 0 });
    const unread = await s.fetch(new Request(BASE + '/v1/scores', { method: 'POST', body: endless, duplex: 'half', headers: { 'Content-Type': 'text/plain' } }));
    assert.strictEqual(unread.status, 400);
    assert.strictEqual(pulled, 0, 'the body was read');
    assert.strictEqual(s.d1.log.length, 0, 'a refused content type reached the database');
    for (const type of ['application/json', 'application/json; charset=utf-8', 'application/json;charset=UTF-8', 'Application/JSON']) {
      const run = await s.call('POST', '/v1/runs', { body: '{"difficulty":"easy"}', headers: { 'Content-Type': type } });
      assert.strictEqual(run.status, 200, 'POST /v1/runs as ' + type + ' gave ' + run.status);
    }
    expectAccepted(await s.call('POST', '/v1/scores', { body: body, headers: { 'Content-Type': 'application/json; charset=utf-8' }, ip: nextAddress() }));
  });

  await check('CORS: OPTIONS on any path answers the preflight for GET and POST with content-type', async () => {
    const s = service();
    for (const p of ['/v1/runs', '/v1/scores', '/v1/scores?limit=5', '/', '/anything/else']) {
      const r = await s.call('OPTIONS', p, {
        headers: { Origin: 'https://piechart1.github.io', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' }
      });
      assert.strictEqual(r.status, 204, 'OPTIONS ' + p + ' gave ' + r.status);
      assert.strictEqual(r.text, '');
      assert.strictEqual(r.headers.get('access-control-allow-origin'), '*');
      const methods = r.headers.get('access-control-allow-methods').split(',').map((m) => m.trim());
      assert.ok(methods.includes('GET') && methods.includes('POST'), 'methods ' + methods);
      assert.strictEqual(r.headers.get('access-control-allow-headers').toLowerCase(), 'content-type');
      assert.ok(Number(r.headers.get('access-control-max-age')) > 0);
    }
    assert.strictEqual(s.d1.log.length, 0, 'a preflight reached the database');
  });

  await check('CORS: GET, POST and every kind of error response carry Access-Control-Allow-Origin: *', async () => {
    const s = service();
    const seen = [];
    const note = function (r, status) {
      assert.strictEqual(r.status, status, 'expected ' + status + ', got ' + r.status + ' ' + r.text);
      assert.strictEqual(r.headers.get('access-control-allow-origin'), '*', 'no CORS header on a ' + status);
      assert.match(r.headers.get('content-type'), /^application\/json/);
      seen.push(status);
    };
    note(await s.call('GET', '/v1/scores'), 200);
    note(await s.call('POST', '/v1/runs', { body: { difficulty: 'easy' } }), 200);
    const token = await s.start('easy');
    s.wait(60);
    note(await s.submit(token, {}, '192.0.2.1'), 200);
    note(await s.submit(token, {}, '192.0.2.1'), 409);
    note(await s.submit(token, { name: 'dav' }), 400);
    note(await s.call('GET', '/nowhere'), 404);
    note(await s.call('PUT', '/v1/scores', { body: {} }), 405);
    note(await s.call('POST', '/v1/runs', { body: 'x'.repeat(2500) }), 413);
    note(await s.call('POST', '/v1/runs', { body: { difficulty: 'easy' }, headers: { Origin: 'https://some-other-site.example' } }), 403);
    const tokens = [];
    for (let i = 0; i < RULES.hourly; i++) tokens.push(await s.start('easy'));
    s.wait(60);
    for (let i = 0; i < RULES.hourly - 2; i++) await s.submit(tokens[i], {}, '192.0.2.1');
    note(await s.submit(tokens[RULES.hourly - 1], {}, '192.0.2.1'), 429);
    s.d1.failWith = new Error('D1_ERROR: the database is away');
    const lines = await captureErrors(async () => { note(await s.call('GET', '/v1/scores'), 500); });
    assert.strictEqual(lines.length, 1);
    assert.deepStrictEqual(seen, [200, 200, 200, 409, 400, 404, 405, 413, 403, 429, 500]);
  });

  await check('caching: the boards may be cached for up to 15 s; nothing else may be stored', async () => {
    const s = service();
    assert.strictEqual((await s.call('GET', '/v1/scores')).headers.get('cache-control'), 'public, max-age=15');
    assert.strictEqual((await s.call('GET', '/v1/scores?limit=0')).headers.get('cache-control'), 'no-store');
    assert.strictEqual((await s.call('POST', '/v1/runs', { body: { difficulty: 'easy' } })).headers.get('cache-control'), 'no-store');
    assert.strictEqual((await s.attempt({})).headers.get('cache-control'), 'no-store');
    assert.strictEqual((await s.call('GET', '/nowhere')).headers.get('cache-control'), 'no-store');
  });

  // ===============================================================================================
  // 4. The run token, and that it works once
  // ===============================================================================================

  await check('token: POST /v1/runs answers { ok, token, expires: 10800 } for each difficulty and writes nothing', async () => {
    const s = service();
    for (const d of DIFFS) {
      const r = await s.call('POST', '/v1/runs', { body: { difficulty: d } });
      assert.strictEqual(r.status, 200);
      assert.deepStrictEqual(Object.keys(r.json).sort(), ['expires', 'ok', 'token']);
      assert.strictEqual(r.json.ok, true);
      assert.strictEqual(r.json.expires, 10800);
      assert.strictEqual(typeof r.json.token, 'string');
    }
    assert.strictEqual(s.d1.log.length, 0, 'issuing a token used the database');
    assert.strictEqual(s.d1.count('scores') + s.d1.count('hits'), 0);
  });

  await check('token: it is base64url(payload).base64url(HMAC-SHA256(secret, base64url(payload))) with id, d and t', async () => {
    const s = service();
    s.wait(1234.567);
    const token = await s.start('medium');
    assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    const t = decodeToken(token);
    assert.deepStrictEqual(Object.keys(t.payload), ['id', 'd', 't']);
    assert.match(t.payload.id, /^[0-9a-f]{32}$/);
    assert.strictEqual(t.payload.d, 'medium');
    assert.strictEqual(t.payload.t, s.clock.now, 'the issue time is not the Worker\'s clock');
    assert.strictEqual(t.sig, hmacBase64Url(SECRET, t.part), 'the signature is not HMAC-SHA256 over the first part');
    assert.ok(!token.includes(SECRET));
  });

  await check('token: every token has its own random id', async () => {
    const s = service();
    const ids = new Set();
    for (let i = 0; i < 300; i++) ids.add(decodeToken(await s.start('easy')).payload.id);
    assert.strictEqual(ids.size, 300);
  });

  await check('token: a difficulty that is not easy, medium or hard gives 400 bad_request', async () => {
    const s = service();
    for (const d of ['extreme', 'EASY', 'Easy', '', ' easy', 'constructor', '__proto__', 'toString', 0, 1, null, true, ['easy'], { d: 'easy' }]) {
      expectError(await s.call('POST', '/v1/runs', { body: { difficulty: d } }), 400, 'bad_request', JSON.stringify(d));
    }
    expectError(await s.call('POST', '/v1/runs', { body: {} }), 400, 'bad_request', 'no difficulty');
    expectError(await s.call('POST', '/v1/runs', { body: '{"__proto__":{"difficulty":"easy"}}' }), 400, 'bad_request', '__proto__ in the body');
  });

  await check('token: signToken and verifyToken agree; another secret, a changed payload or signature is refused', async () => {
    const payload = { id: 'ab'.repeat(16), d: 'hard', t: T0 };
    const token = await W.signToken(SECRET, payload);
    assert.deepStrictEqual(await W.verifyToken(SECRET, token), payload);
    assert.strictEqual(await W.verifyToken(SECRET + 'x', token), null);
    assert.strictEqual(await W.verifyToken('another-secret-0123456789', token), null);
    const t = decodeToken(token);
    for (let i = 0; i < t.sig.length - 1; i++) {
      assert.strictEqual(await W.verifyToken(SECRET, t.part + '.' + changeChar(t.sig, i)), null, 'signature changed at ' + i);
    }
    for (let i = 0; i < t.part.length; i++) {
      assert.strictEqual(await W.verifyToken(SECRET, changeChar(t.part, i) + '.' + t.sig), null, 'payload changed at ' + i);
    }
    for (const bad of [undefined, null, 5, {}, [], '', '.', 'a.b', t.part, t.part + '.', '.' + t.sig, token + '.x', token + '=', ' ' + token, token.replace('.', '..'), 'x'.repeat(5000)]) {
      assert.strictEqual(await W.verifyToken(SECRET, bad), null, 'accepted ' + JSON.stringify(bad));
    }
  });

  await check('token: sameText compares whole strings and treats different lengths and other types as unequal', () => {
    assert.strictEqual(W.sameText('abc', 'abc'), true);
    assert.strictEqual(W.sameText('', ''), true);
    assert.strictEqual(W.sameText('abc', 'abd'), false);
    assert.strictEqual(W.sameText('abc', 'xbc'), false);
    assert.strictEqual(W.sameText('abc', 'abcd'), false);
    assert.strictEqual(W.sameText('abc', undefined), false);
    assert.strictEqual(W.sameText(null, null), false);
    // The comparison must not leave the loop early: no return, break or throw inside it.
    const body = /export function sameText\(a, b\) \{([\s\S]*?)\n\}/.exec(SOURCE);
    assert.ok(body, 'sameText not found in the source');
    const loop = /for \([^)]*\)([^\n]*)/.exec(body[1]);
    assert.ok(loop && !/return|break|throw|&&|\|\|/.test(loop[1]), 'the loop of sameText can stop early');
    assert.ok(/sameText\(await signature\(/.test(SOURCE), 'verifyToken does not compare the signature with sameText');
  });

  await check('token: a tampered payload is refused with bad_token', async () => {
    const s = service();
    const t = decodeToken(await s.start('easy'));
    const forged = encodePayload(Object.assign({}, t.payload, { d: 'hard' })) + '.' + t.sig;
    expectError(await s.attempt({}, { token: forged }), 400, 'bad_token', 'difficulty changed');
    const younger = encodePayload(Object.assign({}, t.payload, { t: t.payload.t - 5000000 })) + '.' + t.sig;
    expectError(await s.attempt({}, { token: younger }), 400, 'bad_token', 'issue time changed');
    const other = encodePayload(Object.assign({}, t.payload, { id: 'f'.repeat(32) })) + '.' + t.sig;
    expectError(await s.attempt({}, { token: other }), 400, 'bad_token', 'id changed');
    assert.strictEqual(s.d1.count('scores'), 0);
  });

  await check('token: a tampered or foreign signature is refused with bad_token', async () => {
    const s = service();
    const token = await s.start('easy');
    const t = decodeToken(token);
    expectError(await s.attempt({}, { token: t.part + '.' + changeChar(t.sig, 7) }), 400, 'bad_token', 'one character changed');
    expectError(await s.attempt({}, { token: t.part + '.' + t.sig.slice(0, -1) }), 400, 'bad_token', 'signature cut short');
    expectError(await s.attempt({}, { token: t.part + '.' + hmacBase64Url('guessed-secret-0123456789', t.part) }), 400, 'bad_token', 'signed with another secret');
    expectError(await s.attempt({}, { token: t.part + '.' }), 400, 'bad_token', 'no signature');
    assert.strictEqual(s.d1.count('scores'), 0);
    // The untouched token is still good.
    expectAccepted(await s.attempt({}, { token: token, age: 0 }));
  });

  await check('token: the score is stored under the token\'s difficulty whatever the body says', async () => {
    const s = service();
    const r = await s.attempt({ difficulty: 'hard', d: 'hard', score: 7777 }, { difficulty: 'easy' });
    expectAccepted(r);
    assert.strictEqual(r.json.difficulty, 'easy');
    assert.deepStrictEqual(s.d1.rows('SELECT difficulty, score FROM scores'), [{ difficulty: 'easy', score: 7777 }]);
    const boards = (await s.call('GET', '/v1/scores')).json;
    assert.strictEqual(boards.easy.length, 1);
    assert.strictEqual(boards.hard.length, 0);
    // A score that only hard allows is refused with an easy token.
    const high = await s.attempt({ difficulty: 'hard', score: 150000, time: 600 }, { difficulty: 'easy' });
    expectError(high, 400, 'implausible', 'a hard score on an easy token');
  });

  await check('token: it cannot be used twice', async () => {
    const s = service();
    const token = await s.start('medium');
    s.wait(60);
    expectAccepted(await s.submit(token, { score: 4000 }));
    expectError(await s.submit(token, { score: 4000 }), 409, 'used', 'the same submission again');
    expectError(await s.submit(token, { score: 9000, name: 'ZED' }), 409, 'used', 'another score with the same token');
    s.wait(600);
    expectError(await s.submit(token, { score: 4000 }), 409, 'used', 'ten minutes later');
    assert.deepStrictEqual(s.d1.rows('SELECT name, score FROM scores'), [{ name: 'DAV', score: 4000 }]);
  });

  await check('token: it stays used when its run did not make the best 200 and was not kept', async () => {
    const s = service();
    const tokens = [];
    for (let i = 0; i < 200; i++) tokens.push(await s.start('easy'));
    const low = await s.start('easy');
    s.wait(60);
    for (let i = 0; i < 200; i++) expectAccepted(await s.submit(tokens[i], { score: 5000 }));
    const first = await s.submit(low, { name: 'LOW', score: 100 });
    expectAccepted(first);
    assert.deepStrictEqual([first.json.place, first.json.total], [201, 201]);
    assert.strictEqual(s.d1.rows("SELECT COUNT(*) AS n FROM scores WHERE name = 'LOW'")[0].n, 0, 'the run was kept');
    expectError(await s.submit(low, { name: 'LOW', score: 100 }), 409, 'used', 'the same run again');
    expectError(await s.submit(low, { name: 'TOP', score: 20000 }), 409, 'used', 'the same token with a score that would be first');
    s.wait(2 * HOUR);
    expectError(await s.submit(low, { name: 'TOP', score: 20000 }), 409, 'used', 'two hours later');
    assert.strictEqual(s.d1.rows("SELECT COUNT(*) AS n FROM scores WHERE name IN ('LOW', 'TOP')")[0].n, 0);
    assert.strictEqual(s.d1.rows('SELECT MAX(score) AS top FROM scores')[0].top, 5000);
  });

  await check('token: it stays used when the owner deletes its row, until it expires', async () => {
    const s = service();
    const token = await s.start('medium');
    s.wait(300);
    expectAccepted(await s.submit(token, { name: 'BAD', score: 100000, time: 300 }));
    s.d1.db.exec("DELETE FROM scores WHERE name = 'BAD'");
    expectError(await s.submit(token, { name: 'BAD', score: 100000, time: 300 }), 409, 'used', 'at once after the delete');
    s.wait(HOUR);
    expectError(await s.submit(token, { name: 'BAD', score: 100000, time: 300 }), 409, 'used', 'an hour later');
    s.clock.now = decodeToken(token).payload.t + 3 * HOUR * 1000;
    expectError(await s.submit(token, { name: 'BAD', score: 100000, time: 300 }), 409, 'used', 'at the end of the token\'s life');
    s.clock.now += 1;
    expectError(await s.submit(token, { name: 'BAD', score: 100000, time: 300 }), 400, 'expired', 'after it');
    assert.strictEqual(s.d1.count('scores'), 0);
  });

  await check('token: used holds the id and the time of use only, and an id is deleted once its token has expired', async () => {
    const s = service();
    const early = await s.start('easy');
    s.wait(60);
    expectAccepted(await s.submit(early, {}));
    assert.deepStrictEqual(s.d1.rows('SELECT * FROM used'), [{ run_id: decodeToken(early).payload.id, at: s.clock.now }]);
    const usedAt = s.clock.now;
    // An id is kept for as long as its token could still be sent: 3 hours from its use is always enough.
    const late = await s.start('easy');
    s.clock.now = usedAt + 3 * HOUR * 1000;
    expectAccepted(await s.submit(late, {}));
    assert.strictEqual(s.d1.count('used'), 2, 'the id was deleted while its token might still be accepted');
    const later = await s.start('easy');
    s.wait(60);
    expectAccepted(await s.submit(later, {}));
    assert.deepStrictEqual(s.d1.rows('SELECT run_id FROM used ORDER BY at').map((r) => r.run_id), [decodeToken(late).payload.id, decodeToken(later).payload.id]);
    expectError(await s.submit(early, {}), 400, 'expired', 'the first token, whose id is gone');
    // A submission that was refused as used, or by the hourly limit, marks nothing.
    expectError(await s.submit(later, {}), 409, 'used');
    assert.strictEqual(s.d1.count('used'), 2);
  });

  await check('token: twenty requests with one token at the same time give one accepted score and nineteen refusals', async () => {
    const s = service();
    // A call to the real database is a round trip, and other requests are served meanwhile. Here the
    // first batch of each request is held back until all twenty have reached it, so that every
    // request asks whether the id is used before any of them adds its row.
    const together = async function (token, fields) {
      const realBatch = s.d1.batch;
      let waiting = 0;
      let open = null;
      const gate = new Promise((resolve) => { open = resolve; });
      s.d1.batch = async function (statements) {
        if (!statements.some((statement) => statement.sql === W.SQL.addScore)) {
          waiting++;
          if (waiting === 20) open();
          await gate;
        }
        return realBatch.call(this, statements);
      };
      try {
        return await Promise.all(Array.from({ length: 20 }, () => s.submit(token, fields)));
      } finally {
        s.d1.batch = realBatch;
      }
    };
    const token = await s.start('hard');
    s.wait(60);
    const answers = await together(token, { score: 4321 });
    assert.deepStrictEqual(answers.map((r) => r.status).sort(), [200].concat(new Array(19).fill(409)));
    assert.strictEqual(s.d1.count('hits'), 20, 'the twenty requests did not all pass the first batch');
    assert.strictEqual(s.d1.count('scores'), 1);
    assert.strictEqual(s.d1.count('used'), 1);
    // The same with a run that is not kept: its row is gone before the next request adds its own, so
    // only the table of used ids can stop the others.
    const tokens = [];
    for (let i = 0; i < 199; i++) tokens.push(await s.start('hard'));
    const low = await s.start('hard');
    s.wait(60);
    for (let i = 0; i < 199; i++) expectAccepted(await s.submit(tokens[i], { score: 9000 }));
    const again = await together(low, { score: 50 });
    assert.deepStrictEqual(again.map((r) => r.status).sort(), [200].concat(new Array(19).fill(409)));
    assert.deepStrictEqual(again.filter((r) => r.status === 200).map((r) => [r.json.place, r.json.total]), [[201, 201]]);
    assert.strictEqual(s.d1.rows('SELECT COUNT(*) AS n FROM scores WHERE score = 50')[0].n, 0);
    assert.strictEqual(s.d1.count('used'), 201);
  });

  await check('token: a stored score refuses its token even if the id is missing from used', async () => {
    const s = service();
    const token = await s.start('easy');
    s.wait(60);
    expectAccepted(await s.submit(token, { score: 4000 }));
    // As if a machine whose clock is ahead had deleted the id a little early.
    s.d1.db.exec('DELETE FROM used');
    expectError(await s.submit(token, { score: 9000 }), 409, 'used');
    assert.deepStrictEqual(s.d1.rows('SELECT score FROM scores'), [{ score: 4000 }]);
  });

  await check('token: one older than 3 hours is refused with expired', async () => {
    const s = service();
    const token = await s.start('easy');
    s.wait(3 * HOUR + 1);
    expectError(await s.submit(token, {}), 400, 'expired');
    assert.strictEqual(s.d1.count('scores'), 0);
  });

  await check('token: a run longer than the token is old, beyond 5 s, is refused with too_soon', async () => {
    const s = service();
    const token = await s.start('easy');
    s.wait(100);
    expectError(await s.submit(token, { time: 106 }), 400, 'too_soon', 'time 106 s at age 100 s');
    expectError(await s.submit(token, { time: 300 }), 400, 'too_soon', 'time 300 s at age 100 s');
    expectAccepted(await s.submit(token, { time: 105 }), 'time 105 s at age 100 s');
  });

  // ===============================================================================================
  // 5. The thirteen checks of LEADERBOARD 5
  // ===============================================================================================

  await check('check 1: a body without the fields of 3.2, or with a field of the wrong type, gives 400 bad_request', async () => {
    const s = service();
    for (const field of ['token', 'name', 'score', 'wpm', 'accuracy', 'rank', 'cleared', 'time']) {
      expectError(await s.attempt({}, { omit: [field] }), 400, 'bad_request', 'without ' + field);
    }
    const wrong = {
      name: [5, null, ['DAV'], { a: 1 }, true],
      score: ['5000', null, [5000], true, {}],
      wpm: ['30', null, false],
      accuracy: ['95', null, [95]],
      rank: [1, null, ['S'], true],
      cleared: ['true', 1, 0, null, 'yes'],
      time: ['60', null, [60], true]
    };
    for (const field of Object.keys(wrong)) {
      for (const value of wrong[field]) {
        const fields = {};
        fields[field] = value;
        expectError(await s.attempt(fields), 400, 'bad_request', field + ' = ' + JSON.stringify(value));
      }
    }
    for (const token of [5, null, ['x'], { a: 1 }, true]) {
      expectError(await s.attempt({}, { token: token }), 400, 'bad_request', 'token = ' + JSON.stringify(token));
    }
    assert.strictEqual(s.d1.log.length, 0, 'a refused submission reached the database');
  });

  await check('check 2: a token without a valid signature, a known difficulty and a 32-hex id gives 400 bad_token', async () => {
    const s = service();
    for (const token of ['', 'abc', 'abc.def', 'a.b.c', '.', '!!!.???', 'x'.repeat(500)]) {
      expectError(await s.attempt({}, { token: token }), 400, 'bad_token', 'token ' + JSON.stringify(token.slice(0, 20)));
    }
    // Correctly signed with the service's secret, but with contents the service never issues.
    const id = 'c0ffee'.repeat(5) + 'ab';
    const payloads = [
      { id: id, d: 'extreme', t: T0 },
      { id: id, d: 'constructor', t: T0 },
      { id: id, t: T0 },
      { id: id.slice(1), d: 'easy', t: T0 },
      { id: id + 'a', d: 'easy', t: T0 },
      { id: id.toUpperCase(), d: 'easy', t: T0 },
      { id: 'g' + id.slice(1), d: 'easy', t: T0 },
      { id: 12345, d: 'easy', t: T0 },
      { d: 'easy', t: T0 },
      { id: id, d: 'easy' },
      { id: id, d: 'easy', t: String(T0) },
      { id: id, d: 'easy', t: 1.5 },
      { id: id, d: 'easy', t: null },
      [id, 'easy', T0],
      'easy',
      null
    ];
    for (const payload of payloads) {
      const token = await W.signToken(SECRET, payload);
      expectError(await s.attempt({}, { token: token }), 400, 'bad_token', 'signed payload ' + JSON.stringify(payload));
    }
    // The same shape with good contents is accepted, so the refusals above are about the contents.
    expectAccepted(await s.attempt({}, { token: await W.signToken(SECRET, { id: id, d: 'easy', t: s.clock.now }) }));
    assert.strictEqual(s.d1.count('scores'), 1);
  });

  await check('check 3: a token older than 3 hours gives 400 expired; one of exactly 3 hours is accepted', async () => {
    const s = service();
    const exact = await s.start('easy');
    s.wait(3 * HOUR);
    expectAccepted(await s.submit(exact, {}), 'age exactly 10,800 s');
    const late = await s.start('easy');
    s.clock.now += 3 * HOUR * 1000 + 1;
    expectError(await s.submit(late, {}), 400, 'expired', 'age 10,800 s and 1 ms');
    const old = await s.start('hard');
    s.wait(48 * HOUR);
    expectError(await s.submit(old, {}), 400, 'expired', 'two days old');
  });

  await check('check 4: a name that is not three letters A to Z, or is on the block list, gives 400 name', async () => {
    const s = service();
    for (const name of ['', 'D', 'DA', 'DAVE', 'dav', 'Dav', 'D4V', 'DA ', ' AV', 'D.V', 'DÄV', 'ＤＡＶ', 'DA\n', 'AAA\n', '\u0000\u0000\u0000', '🙂']) {
      expectError(await s.attempt({ name: name }), 400, 'name', 'name ' + JSON.stringify(name));
    }
    expectError(await s.attempt({ name: BLOCKLIST[0] }), 400, 'name', 'the first blocked name');
    expectError(await s.attempt({ name: BLOCKLIST[BLOCKLIST.length - 1] }), 400, 'name', 'the last blocked name');
    const payload = { id: '1'.repeat(32), d: 'easy', t: T0 - 60000 };
    for (const name of BLOCKLIST) {
      assert.strictEqual(W.validateSubmission(Object.assign({ token: 't' }, GOOD, { name: name }), payload, T0), 'name', name + ' is not refused');
    }
    assert.strictEqual(s.d1.count('scores'), 0);
    for (const name of ['AAA', 'ZZZ', 'PIP', 'DAV']) expectAccepted(await s.attempt({ name: name }), name);
  });

  await check('check 5: a score that is not a whole number from 1 to the cap gives 400 implausible', async () => {
    const s = service();
    for (const d of DIFFS) {
      const cap = LIMITS[d].cap;
      // A run long enough that only the cap, not the rate of check 10, limits the score.
      const time = Math.ceil((cap - RULES.base) / LIMITS[d].rate) + 30;
      for (const score of [0, -1, -5000, 0.5, 4999.5, cap + 1, cap * 10, 1e15, 1e300]) {
        expectError(await s.attempt({ score: score, time: time }, { difficulty: d }), 400, 'implausible', d + ' score ' + score);
      }
      expectAccepted(await s.attempt({ score: 1, time: time }, { difficulty: d }), d + ' score 1');
      expectAccepted(await s.attempt({ score: cap, time: time }, { difficulty: d }), d + ' score ' + cap);
    }
    assert.strictEqual(s.d1.count('scores'), 6);
  });

  await check('check 6: wpm outside 0 to 220, accuracy outside 0 to 100, or a rank other than S, A, B, C gives 400 bad_request', async () => {
    const s = service();
    for (const wpm of [-1, 221, 1000, 30.5, 1e300]) expectError(await s.attempt({ wpm: wpm }), 400, 'bad_request', 'wpm ' + wpm);
    for (const accuracy of [-1, 101, 99.5, 0.95]) expectError(await s.attempt({ accuracy: accuracy }), 400, 'bad_request', 'accuracy ' + accuracy);
    for (const rank of ['', 'D', 's', 'SS', 'S ', 'AB', 'constructor']) expectError(await s.attempt({ rank: rank }), 400, 'bad_request', 'rank ' + JSON.stringify(rank));
    assert.strictEqual(s.d1.count('scores'), 0);
    for (const wpm of [0, 220]) expectAccepted(await s.attempt({ wpm: wpm }), 'wpm ' + wpm);
    for (const accuracy of [0, 100]) expectAccepted(await s.attempt({ accuracy: accuracy, rank: 'C' }), 'accuracy ' + accuracy);
    for (const rank of ['S', 'A', 'B', 'C']) expectAccepted(await s.attempt({ rank: rank, accuracy: 100, cleared: true, time: 300 }), 'rank ' + rank);
    for (const cleared of [true, false]) expectAccepted(await s.attempt({ cleared: cleared, time: 300, score: 9000 }), 'cleared ' + cleared);
  });

  await check('check 7: a time that is not a whole number from 10 to 10,800 gives 400 implausible', async () => {
    const s = service();
    for (const time of [0, 1, 9, -60, 9.99, 60.5, 10801, 20000, 1e15]) {
      expectError(await s.attempt({ time: time, score: 100 }, { age: 60 }), 400, 'implausible', 'time ' + time);
    }
    expectAccepted(await s.attempt({ time: 10, score: 100 }), 'time 10');
    expectAccepted(await s.attempt({ time: 10800, score: 100 }), 'time 10,800');
  });

  await check('check 8: a cleared run shorter than the shortest possible for the difficulty gives 400 implausible', async () => {
    const s = service();
    for (const d of DIFFS) {
      const least = LIMITS[d].minCleared;
      expectError(await s.attempt({ cleared: true, time: least - 1, score: 1000 }, { difficulty: d }), 400, 'implausible', d + ' cleared in ' + (least - 1) + ' s');
      expectError(await s.attempt({ cleared: true, time: 60, score: 1000 }, { difficulty: d }), 400, 'implausible', d + ' cleared in 60 s');
      expectAccepted(await s.attempt({ cleared: true, time: least, score: 1000 }, { difficulty: d }), d + ' cleared in ' + least + ' s');
      expectAccepted(await s.attempt({ cleared: false, time: least - 1, score: 1000 }, { difficulty: d }), d + ' not cleared, ' + (least - 1) + ' s');
    }
  });

  await check('check 9: a rank the game does not give for that accuracy, or for a run that was not cleared, gives 400 implausible', async () => {
    const s = service();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(W.RANK_RULES)), {
      S: { cleared: true, accuracy: 97 }, A: { cleared: true, accuracy: 93 }, B: { cleared: false, accuracy: 85 }, C: { cleared: false, accuracy: 0 }
    });
    assert.deepStrictEqual(Object.keys(W.RANK_RULES), Array.from(W.RANKS), 'a rank of check 6 has no rule in check 9');
    // rank, accuracy, cleared, accepted
    const cases = [
      ['S', 100, true, true], ['S', 97, true, true], ['S', 96, true, false], ['S', 0, true, false], ['S', 100, false, false], ['S', 0, false, false],
      ['A', 100, true, true], ['A', 93, true, true], ['A', 92, true, false], ['A', 99, false, false], ['A', 0, false, false],
      ['B', 100, true, true], ['B', 100, false, true], ['B', 85, false, true], ['B', 85, true, true], ['B', 84, false, false], ['B', 84, true, false], ['B', 0, false, false],
      ['C', 100, true, true], ['C', 100, false, true], ['C', 84, true, true], ['C', 0, false, true], ['C', 0, true, true]
    ];
    for (const c of cases) {
      const what = 'rank ' + c[0] + ', accuracy ' + c[1] + ', ' + (c[2] ? 'cleared' : 'not cleared');
      const r = await s.attempt({ rank: c[0], accuracy: c[1], cleared: c[2], time: 300, score: 9000 });
      if (c[3]) expectAccepted(r, what);
      else expectError(r, 400, 'implausible', what);
    }
    assert.strictEqual(s.d1.count('scores'), cases.filter((c) => c[3]).length);
    // What the first review sent: the highest score with nothing typed, and the best rank with no accuracy.
    for (const d of DIFFS) {
      const time = Math.ceil((LIMITS[d].cap - RULES.base) / LIMITS[d].rate) + 30;
      expectError(await s.attempt({ score: LIMITS[d].cap, wpm: 0, accuracy: 0, rank: 'S', cleared: false, time: time }, { difficulty: d }), 400, 'implausible', d + ', rank S with accuracy 0, not cleared');
      expectError(await s.attempt({ score: LIMITS[d].cap, wpm: 0, accuracy: 0, rank: 'A', cleared: true, time: time }, { difficulty: d }), 400, 'implausible', d + ', rank A with accuracy 0');
      // The rank is what was refused: the same runs with rank C pass. No check can tell such a score
      // from a real one (LEADERBOARD 2); the caps keep it near what the game gives.
      expectAccepted(await s.attempt({ score: LIMITS[d].cap, wpm: 0, accuracy: 0, rank: 'C', cleared: false, time: time }, { difficulty: d }), d + ', rank C');
    }
  });

  await check('check 10: a score above 2000 + time x rate for the difficulty gives 400 implausible', async () => {
    const s = service();
    for (const d of DIFFS) {
      for (const time of [10, 60, 150]) {
        const most = RULES.base + time * LIMITS[d].rate;
        assert.ok(most < LIMITS[d].cap, 'the test needs a time at which the rate, not the cap, is the limit');
        expectError(await s.attempt({ time: time, score: most + 1 }, { difficulty: d }), 400, 'implausible', d + ' ' + (most + 1) + ' in ' + time + ' s');
        expectAccepted(await s.attempt({ time: time, score: most }, { difficulty: d }), d + ' ' + most + ' in ' + time + ' s');
      }
    }
    assert.deepStrictEqual(DIFFS.map((d) => RULES.base + 60 * LIMITS[d].rate), [26000, 44000, 68000]);
  });

  await check('check 11: a token younger than time - 5 seconds gives 400 too_soon', async () => {
    const s = service();
    const early = await s.start('easy');
    s.clock.now += 54999;
    expectError(await s.submit(early, { time: 60 }), 400, 'too_soon', 'time 60 s at age 54.999 s');
    s.clock.now += 1;
    expectAccepted(await s.submit(early, { time: 60 }), 'time 60 s at age 55 s');
    expectError(await s.attempt({ time: 60 }, { age: 0 }), 400, 'too_soon', 'time 60 s at age 0');
    expectError(await s.attempt({ time: 10800, score: 100 }, { age: 3 * HOUR - 6 }), 400, 'too_soon', 'time 10,800 s at age 10,794 s');
    // A token from a clock that is ahead of this one is too young for any run.
    const ahead = await W.signToken(SECRET, { id: '2'.repeat(32), d: 'easy', t: s.clock.now + 600000 });
    expectError(await s.attempt({ time: 10 }, { token: ahead, age: 0 }), 400, 'too_soon', 'a token from the future');
  });

  await check('check 12: the 61st submission of a source within an hour gives 429 rate', async () => {
    const s = service();
    const tokens = [];
    for (let i = 0; i < 62; i++) tokens.push(await s.start('easy'));
    s.wait(60);
    for (let i = 0; i < 60; i++) expectAccepted(await s.submit(tokens[i], { score: 1000 + i }, '203.0.113.50'), 'submission ' + (i + 1));
    expectError(await s.submit(tokens[60], {}, '203.0.113.50'), 429, 'rate', 'submission 61');
    expectError(await s.submit(tokens[61], {}, '203.0.113.50'), 429, 'rate', 'submission 62');
    assert.strictEqual(s.d1.count('scores'), 60);
  });

  await check('check 13: a token id that has been used gives 409 used', async () => {
    const s = service();
    const token = await s.start('hard');
    s.wait(60);
    expectAccepted(await s.submit(token, {}));
    expectError(await s.submit(token, {}), 409, 'used');
    // The id decides, not the token text: a second token signed over the same id is refused too.
    const again = await W.signToken(SECRET, Object.assign({}, decodeToken(token).payload, { d: 'easy' }));
    expectError(await s.submit(again, {}), 409, 'used', 'the same id on another difficulty');
    assert.strictEqual(s.d1.count('scores'), 1);
    assert.strictEqual(s.d1.count('used'), 1);
  });

  await check('order: check 1 before 2 (a missing field and a bad token give bad_request)', async () => {
    const s = service();
    expectError(await s.attempt({}, { token: 'not.a-token', omit: ['rank'] }), 400, 'bad_request');
    expectError(await s.attempt({ cleared: 'yes', name: 'dav', score: -1 }, { token: 'not.a-token' }), 400, 'bad_request');
    // Each field's type belongs to check 1, so each wins over a bad token.
    const wrong = { name: 5, score: '5000', wpm: '30', accuracy: '95', rank: 1, cleared: 'true', time: '60' };
    for (const field of Object.keys(wrong)) {
      const fields = {};
      fields[field] = wrong[field];
      expectError(await s.attempt(fields, { token: 'not.a-token' }), 400, 'bad_request', field + ' of the wrong type with a bad token');
      expectError(await s.attempt({}, { token: 'not.a-token', omit: [field] }), 400, 'bad_request', 'no ' + field + ' with a bad token');
    }
  });

  await check('order: check 2 before 3 and 4 (a bad token wins over its age and over a refused name)', async () => {
    const s = service();
    const t = decodeToken(await s.start('easy'));
    s.wait(4 * HOUR);
    expectError(await s.submit(t.part + '.' + changeChar(t.sig, 3), { name: BLOCKLIST[0] }), 400, 'bad_token');
  });

  await check('order: check 3 before 4 (an expired token and a refused name give expired)', async () => {
    const s = service();
    expectError(await s.attempt({ name: BLOCKLIST[0] }, { age: 4 * HOUR }), 400, 'expired');
    expectError(await s.attempt({ name: 'dav', score: 0, wpm: 999, time: 1 }, { age: 4 * HOUR }), 400, 'expired');
  });

  await check('order: check 4 before 5 (a refused name and a score over the cap give name)', async () => {
    const s = service();
    expectError(await s.attempt({ name: BLOCKLIST[0], score: LIMITS.easy.cap + 1 }), 400, 'name');
    expectError(await s.attempt({ name: 'dav', score: 0 }), 400, 'name');
  });

  await check('order: check 5 before 6 (a score over the cap and a wpm out of range give implausible)', async () => {
    const s = service();
    expectError(await s.attempt({ score: LIMITS.easy.cap + 1, wpm: 500 }), 400, 'implausible');
    expectError(await s.attempt({ score: 0, rank: 'Z', accuracy: 150 }), 400, 'implausible');
  });

  await check('order: check 6 before 7, 8, 9 and 10 (a wpm out of range and an impossible time give bad_request)', async () => {
    const s = service();
    expectError(await s.attempt({ wpm: 221, time: 5 }, { age: 60 }), 400, 'bad_request');
    expectError(await s.attempt({ rank: 'Z', cleared: true, time: 60 }), 400, 'bad_request');
    expectError(await s.attempt({ accuracy: 101, rank: 'S', cleared: false }), 400, 'bad_request');
    expectError(await s.attempt({ accuracy: 101, time: 10, score: 70000 }), 400, 'bad_request');
  });

  await check('order: checks 7, 8, 9 and 10 before 11 (an impossible run on a token that is too young gives implausible)', async () => {
    const s = service();
    expectError(await s.attempt({ time: 10801, score: 100 }, { age: 0 }), 400, 'implausible', 'check 7');
    expectError(await s.attempt({ cleared: true, time: 100, score: 100 }, { age: 0 }), 400, 'implausible', 'check 8');
    expectError(await s.attempt({ rank: 'S', accuracy: 50 }, { age: 0 }), 400, 'implausible', 'check 9');
    expectError(await s.attempt({ time: 60, score: 70000 }, { age: 0 }), 400, 'implausible', 'check 10');
  });

  await check('order: checks 1 to 11 before 12 (a source at its limit still gets the code of an earlier check)', async () => {
    const s = service();
    const ip = '203.0.113.60';
    const tokens = [];
    for (let i = 0; i < 61; i++) tokens.push(await s.start('easy'));
    s.wait(60);
    for (let i = 0; i < 60; i++) expectAccepted(await s.submit(tokens[i], {}, ip));
    expectError(await s.submit(tokens[60], { time: 600 }, ip), 400, 'too_soon', 'check 11');
    expectError(await s.submit(tokens[60], { rank: 'S' }, ip), 400, 'implausible', 'check 9');
    expectError(await s.submit(tokens[60], { name: 'dav' }, ip), 400, 'name', 'check 4');
    expectError(await s.submit('not.a-token', {}, ip), 400, 'bad_token', 'check 2');
    expectError(await s.submit(tokens[60], {}, ip), 429, 'rate', 'a good submission');
  });

  await check('order: check 12 before 13 (a used token from a source at its limit gives rate, not used)', async () => {
    const s = service();
    const ip = '203.0.113.61';
    const tokens = [];
    for (let i = 0; i < 60; i++) tokens.push(await s.start('easy'));
    s.wait(60);
    for (let i = 0; i < 60; i++) expectAccepted(await s.submit(tokens[i], {}, ip));
    expectError(await s.submit(tokens[0], {}, ip), 429, 'rate');
    expectError(await s.submit(tokens[0], {}, '203.0.113.62'), 409, 'used', 'the same token from another source');
    // The refusal by the limit does not spend a token: an unused one is accepted from another source.
    const spare = await s.start('easy');
    s.wait(60);
    expectError(await s.submit(spare, {}, ip), 429, 'rate');
    assert.strictEqual(s.d1.count('used'), 60);
    expectAccepted(await s.submit(spare, {}, '203.0.113.62'));
  });

  await check('validateSubmission: returns null for a good run and takes no notice of extra fields', () => {
    const payload = { id: '3'.repeat(32), d: 'medium', t: T0 - 60000 };
    assert.strictEqual(W.validateSubmission(Object.assign({ token: 't' }, GOOD), payload, T0), null);
    assert.strictEqual(W.validateSubmission(Object.assign({ token: 't', difficulty: 'hard', extra: [1, 2] }, GOOD), payload, T0), null);
    assert.strictEqual(W.validateSubmission(Object.assign({ token: 't' }, GOOD), null, T0), 'bad_token');
    assert.strictEqual(W.validateSubmission(Object.assign({ token: 't' }, GOOD), { id: payload.id, d: 'toString', t: payload.t }, T0), 'bad_token');
    for (const body of [undefined, null, 'text', 5, [], [GOOD]]) assert.strictEqual(W.validateSubmission(body, payload, T0), 'bad_request');
  });

  // ===============================================================================================
  // 6. The boards
  // ===============================================================================================

  await check('boards: an empty service answers three empty lists', async () => {
    const s = service();
    const r = await s.call('GET', '/v1/scores');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.json, { ok: true, easy: [], medium: [], hard: [] });
  });

  await check('boards: an entry has the fields of the game\'s high score entry and nothing else', async () => {
    const s = service();
    s.clock.now = Date.UTC(2026, 9, 3, 9, 30, 0);
    expectAccepted(await s.attempt({ name: 'PIP', score: 16000, wpm: 18, accuracy: 96, rank: 'A', cleared: true, time: 300 }));
    const boards = (await s.call('GET', '/v1/scores')).json;
    assert.deepStrictEqual(boards.easy, [{ name: 'PIP', score: 16000, wpm: 18, accuracy: 96, rank: 'A', cleared: true, date: '2026-10-03' }]);
    expectAccepted(await s.attempt({ name: 'INK', cleared: false }, { difficulty: 'hard' }));
    const hard = (await s.call('GET', '/v1/scores')).json.hard;
    assert.strictEqual(hard[0].cleared, false);
    assert.deepStrictEqual(Object.keys(hard[0]), ['name', 'score', 'wpm', 'accuracy', 'rank', 'cleared', 'date']);
  });

  await check('boards: ordered by score, highest first, then by submission time, earliest first', async () => {
    const s = service();
    const plan = [['AAA', 5000], ['BBB', 7000], ['CCC', 5000], ['DDD', 9000], ['EEE', 7000], ['FFF', 100]];
    for (const p of plan) expectAccepted(await s.attempt({ name: p[0], score: p[1] }, { difficulty: 'medium' }));
    // Two with equal scores in the same millisecond: the one submitted first comes first.
    const first = await s.start('medium');
    const second = await s.start('medium');
    s.wait(60);
    const g = await s.submit(first, { name: 'GGG', score: 7000 });
    const h = await s.submit(second, { name: 'HHH', score: 7000 });
    expectAccepted(g);
    expectAccepted(h);
    assert.deepStrictEqual([g.json.place, h.json.place], [4, 5], 'the places of two equal scores of the same millisecond');
    const names = (await s.call('GET', '/v1/scores')).json.medium.map((e) => e.name + ' ' + e.score);
    assert.deepStrictEqual(names, ['DDD 9000', 'BBB 7000', 'EEE 7000', 'GGG 7000', 'HHH 7000', 'AAA 5000', 'CCC 5000', 'FFF 100']);
    // A row with an earlier submission time comes first whatever its id (a clock that ran ahead elsewhere).
    s.d1.db.exec("INSERT INTO scores (run_id, difficulty, name, score, wpm, accuracy, rank, cleared, time_s, created_at) VALUES ('early', 'medium', 'OLD', 7000, 1, 1, 'C', 0, 60, 1000)");
    s.wait(RULES.boardAge);                          // the boards are read again from the database
    const again = (await s.call('GET', '/v1/scores')).json.medium.map((e) => e.name);
    assert.deepStrictEqual(again.slice(0, 3), ['DDD', 'OLD', 'BBB']);
  });

  await check('boards: each difficulty has its own list', async () => {
    const s = service();
    expectAccepted(await s.attempt({ name: 'EEE', score: 300 }, { difficulty: 'easy' }));
    expectAccepted(await s.attempt({ name: 'MMM', score: 200 }, { difficulty: 'medium' }));
    expectAccepted(await s.attempt({ name: 'MMN', score: 250 }, { difficulty: 'medium' }));
    expectAccepted(await s.attempt({ name: 'HHH', score: 100 }, { difficulty: 'hard' }));
    const b = (await s.call('GET', '/v1/scores')).json;
    assert.deepStrictEqual([b.easy, b.medium, b.hard].map((list) => list.map((e) => e.name)), [['EEE'], ['MMN', 'MMM'], ['HHH']]);
  });

  await check('submit: the answer has place, total, the difficulty and the top 10 of that difficulty', async () => {
    const s = service();
    const a = await s.attempt({ name: 'AAA', score: 5000 }, { difficulty: 'hard' });
    assert.deepStrictEqual(Object.keys(a.json).sort(), ['difficulty', 'ok', 'place', 'scores', 'total']);
    assert.deepStrictEqual([a.json.place, a.json.total, a.json.difficulty], [1, 1, 'hard']);
    assert.deepStrictEqual(a.json.scores.map((e) => e.name), ['AAA']);
    const b = await s.attempt({ name: 'BBB', score: 7000 }, { difficulty: 'hard' });
    assert.deepStrictEqual([b.json.place, b.json.total], [1, 2]);
    const c = await s.attempt({ name: 'CCC', score: 5000 }, { difficulty: 'hard' });
    assert.deepStrictEqual([c.json.place, c.json.total], [3, 3], 'an equal score places after the earlier one');
    const d = await s.attempt({ name: 'DDD', score: 6000 }, { difficulty: 'hard' });
    assert.deepStrictEqual([d.json.place, d.json.total], [2, 4]);
    const e = await s.attempt({ name: 'EEE', score: 1 }, { difficulty: 'hard' });
    assert.deepStrictEqual([e.json.place, e.json.total], [5, 5]);
    assert.deepStrictEqual(e.json.scores.map((x) => x.name), ['BBB', 'DDD', 'AAA', 'CCC', 'EEE']);
    assert.deepStrictEqual(e.json.scores, (await s.call('GET', '/v1/scores')).json.hard, 'the entries are not those of GET /v1/scores');
    // Other difficulties do not count towards place or total.
    const other = await s.attempt({ name: 'FFF', score: 10 }, { difficulty: 'easy' });
    assert.deepStrictEqual([other.json.place, other.json.total, other.json.difficulty], [1, 1, 'easy']);
    // The place is the entry's position in the list.
    for (let i = 0; i < 12; i++) expectAccepted(await s.attempt({ name: 'GGG', score: 8000 + i }, { difficulty: 'hard' }));
    const last = await s.attempt({ name: 'ZED', score: 8005 }, { difficulty: 'hard' });
    assert.strictEqual(last.json.scores.length, 10, 'the answer carries ' + last.json.scores.length + ' entries');
    const list = (await s.call('GET', '/v1/scores?limit=50')).json.hard;
    assert.strictEqual(list[last.json.place - 1].name, 'ZED');
    assert.strictEqual(last.json.total, list.length);
  });

  await check('limit: 10 by default, any whole number from 1 to 50 when asked', async () => {
    const s = service();
    for (let i = 0; i < 55; i++) expectAccepted(await s.attempt({ score: 1000 + i }, { difficulty: 'easy' }));
    for (let i = 0; i < 3; i++) expectAccepted(await s.attempt({ score: 1000 + i }, { difficulty: 'hard' }));
    const sizes = async function (query) {
      const r = await s.call('GET', '/v1/scores' + query);
      assert.strictEqual(r.status, 200, query + ' gave ' + r.status);
      return [r.json.easy.length, r.json.medium.length, r.json.hard.length];
    };
    assert.deepStrictEqual(await sizes(''), [10, 0, 3]);
    assert.deepStrictEqual(await sizes('?limit=1'), [1, 0, 1]);
    assert.deepStrictEqual(await sizes('?limit=2'), [2, 0, 2]);
    assert.deepStrictEqual(await sizes('?limit=10'), [10, 0, 3]);
    assert.deepStrictEqual(await sizes('?limit=50'), [50, 0, 3]);
    assert.deepStrictEqual(await sizes('?limit=05'), [5, 0, 3]);
    assert.deepStrictEqual(await sizes('?other=1'), [10, 0, 3]);
    const top = (await s.call('GET', '/v1/scores?limit=3')).json.easy.map((e) => e.score);
    assert.deepStrictEqual(top, [1054, 1053, 1052]);
  });

  await check('limit: a value that is not a whole number from 1 to 50 gives 400 bad_request', async () => {
    const s = service();
    for (const value of ['0', '51', '100', '-1', '1.5', 'abc', '', '1e1', '0x10', ' 5', '5;', '10 OR 1=1', '999999999999999999999']) {
      expectError(await s.call('GET', '/v1/scores?limit=' + encodeURIComponent(value)), 400, 'bad_request', 'limit=' + JSON.stringify(value));
    }
    assert.strictEqual(s.d1.log.length, 0, 'a refused limit reached the database');
  });

  await check('boards in memory: the database is read once in 15 s however many requests there are, and for every limit', async () => {
    const s = service();
    assert.strictEqual(RULES.boardAge, 15);
    for (let i = 0; i < 55; i++) expectAccepted(await s.attempt({ score: 1000 + i }, { difficulty: 'hard' }));
    const before = s.d1.log.length;
    let first = null;
    for (let i = 0; i < 300; i++) {
      const query = ['', '?limit=50', '?limit=1', '?limit=7&x=' + i][i % 4];
      const r = await s.call('GET', '/v1/scores' + query, { ip: nextAddress() });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.hard.length, [10, 50, 1, 7][i % 4], 'GET /v1/scores' + query);
      assert.strictEqual(r.json.hard[0].score, 1054);
      if (i === 1) first = r.text;
      if (i === 297) assert.strictEqual(r.text, first, 'two answers to limit=50 differ');
      if (i % 20 === 19) s.wait(0.7);                // 10.5 s pass during the 300 requests
    }
    assert.strictEqual(s.d1.log.length - before, 3, 'the 300 requests ran ' + (s.d1.log.length - before) + ' statements');
    s.clock.now += 4499;                             // 14.999 s after the read
    await s.call('GET', '/v1/scores');
    assert.strictEqual(s.d1.log.length - before, 3, 'the database was read again before 15 s had passed');
    s.clock.now += 1;
    await s.call('GET', '/v1/scores');
    assert.strictEqual(s.d1.log.length - before, 6, 'the database was not read again after 15 s');
    // A refused limit is answered without the database and without touching what is kept.
    expectError(await s.call('GET', '/v1/scores?limit=51'), 400, 'bad_request');
    assert.strictEqual(s.d1.log.length - before, 6);
  });

  await check('boards in memory: an accepted score is on the board at once; a row changed in the database is seen within 15 s', async () => {
    const s = service();
    expectAccepted(await s.attempt({ name: 'AAA', score: 3000 }));
    assert.deepStrictEqual((await s.call('GET', '/v1/scores')).json.easy.map((e) => e.name), ['AAA']);
    // The same copy of the Worker accepts a score: the next read shows it, with no wait.
    const token = await s.start('easy');
    s.wait(60);
    assert.deepStrictEqual((await s.call('GET', '/v1/scores')).json.easy.map((e) => e.name), ['AAA']);
    expectAccepted(await s.submit(token, { name: 'BBB', score: 4000 }));
    assert.deepStrictEqual((await s.call('GET', '/v1/scores')).json.easy.map((e) => e.name), ['BBB', 'AAA']);
    // The owner deletes a row with Wrangler (LEADERBOARD 8): the Worker is not told.
    s.d1.db.exec("DELETE FROM scores WHERE name = 'BBB'");
    s.wait(RULES.boardAge - 0.001);
    assert.deepStrictEqual((await s.call('GET', '/v1/scores')).json.easy.map((e) => e.name), ['BBB', 'AAA'], 'the database was read again early');
    s.wait(0.001);
    assert.deepStrictEqual((await s.call('GET', '/v1/scores')).json.easy.map((e) => e.name), ['AAA'], 'the deleted row is still shown after 15 s');
    // A refused submission changes no board, so it does not make the Worker read again.
    const reads = s.d1.log.filter((sql) => sql === W.SQL.board).length;
    expectError(await s.submit(token, { name: 'CCC' }), 409, 'used');
    await s.call('GET', '/v1/scores');
    assert.strictEqual(s.d1.log.filter((sql) => sql === W.SQL.board).length, reads);
    // A clock that went back does not keep an old answer alive.
    s.d1.db.exec("DELETE FROM scores WHERE name = 'AAA'");
    s.clock.now -= 5000;
    assert.deepStrictEqual((await s.call('GET', '/v1/scores')).json.easy, []);
  });

  await check('boards in memory: a read that began before a score was accepted is answered but not kept', async () => {
    const s = service();
    expectAccepted(await s.attempt({ name: 'AAA', score: 3000 }));
    const token = await s.start('easy');
    s.wait(60);
    // The database answers the read of the boards, and the answer is held back until a score has been accepted.
    let release = null;
    const gate = new Promise((resolve) => { release = resolve; });
    const realBatch = s.d1.batch;
    let held = 0;
    s.d1.batch = async function (statements) {
      const results = await realBatch.call(this, statements);
      if (statements[0].sql === W.SQL.board) {
        held++;
        await gate;
      }
      return results;
    };
    const slow = s.call('GET', '/v1/scores');
    s.d1.batch = realBatch;
    expectAccepted(await s.submit(token, { name: 'BBB', score: 4000 }));
    assert.strictEqual(held, 1, 'the read of the boards had not begun');
    release();
    assert.deepStrictEqual((await slow).json.easy.map((e) => e.name), ['AAA'], 'the read that began first');
    assert.deepStrictEqual((await s.call('GET', '/v1/scores')).json.easy.map((e) => e.name), ['BBB', 'AAA'], 'the next read');
  });

  await check('boards in memory: Cache-Control gives a browser what is left of the 15 s, so no copy is older than that', async () => {
    const s = service();
    expectAccepted(await s.attempt({}));
    const age = async function () {
      const r = await s.call('GET', '/v1/scores');
      const m = /^public, max-age=(\d+)$/.exec(r.headers.get('cache-control'));
      assert.ok(m, 'Cache-Control is ' + r.headers.get('cache-control'));
      return Number(m[1]);
    };
    assert.strictEqual(await age(), 15, 'read from the database just now');
    s.wait(0.5);
    assert.strictEqual(await age(), 14);
    s.wait(5.5);
    assert.strictEqual(await age(), 9);
    s.wait(8.999);
    assert.strictEqual(await age(), 0, 'at 14.999 s');
    s.wait(0.001);
    assert.strictEqual(await age(), 15, 'read again at 15 s');
  });

  await check('boards in memory: two services do not see each other\'s boards, and a failed read keeps nothing', async () => {
    const a = service();
    const b = service();
    expectAccepted(await a.attempt({ name: 'AAA' }));
    b.clock.now = a.clock.now;                       // the same moment on both clocks
    assert.strictEqual((await a.call('GET', '/v1/scores')).json.easy.length, 1);
    assert.deepStrictEqual((await b.call('GET', '/v1/scores')).json.easy, []);
    assert.strictEqual((await a.call('GET', '/v1/scores')).json.easy.length, 1);
    const c = service();
    c.d1.failWith = new Error('D1_ERROR: the database is away');
    const lines = await captureErrors(async () => { expectError(await c.call('GET', '/v1/scores'), 500, 'server'); });
    assert.strictEqual(lines.length, 1);
    c.d1.failWith = null;
    assert.deepStrictEqual((await c.call('GET', '/v1/scores')).json, { ok: true, easy: [], medium: [], hard: [] });
  });

  await check('trimming: only the best 200 rows of a difficulty are kept, and other difficulties are left alone', async () => {
    const s = service();
    for (let i = 0; i < 3; i++) expectAccepted(await s.attempt({ score: 10 + i }, { difficulty: 'easy' }));
    const tokens = [];
    for (let i = 0; i < 205; i++) tokens.push(await s.start('medium'));
    s.wait(60);
    for (let i = 0; i < 205; i++) {
      // Scores 1000, 1010, ... in an order that is neither rising nor falling.
      const score = 1000 + ((i * 37) % 205) * 10;
      const r = await s.submit(tokens[i], { score: score });
      expectAccepted(r, 'submission ' + (i + 1));
      assert.ok(s.d1.rows("SELECT COUNT(*) AS n FROM scores WHERE difficulty = 'medium'")[0].n <= 200, 'more than 200 rows after submission ' + (i + 1));
    }
    const kept = s.d1.rows("SELECT score FROM scores WHERE difficulty = 'medium' ORDER BY score ASC");
    assert.strictEqual(kept.length, 200);
    assert.strictEqual(kept[0].score, 1050, 'the five lowest scores (1000 to 1040) should be gone');
    assert.strictEqual(kept[199].score, 3040);
    assert.strictEqual(new Set(kept.map((r) => r.score)).size, 200);
    assert.strictEqual(s.d1.rows("SELECT COUNT(*) AS n FROM scores WHERE difficulty = 'easy'")[0].n, 3);
    // A score below all 200 is reported as place 201 of 201 and is not kept.
    const low = await s.attempt({ name: 'LOW', score: 5 }, { difficulty: 'medium' });
    assert.deepStrictEqual([low.json.place, low.json.total], [201, 201]);
    assert.strictEqual(s.d1.rows("SELECT COUNT(*) AS n FROM scores WHERE name = 'LOW'")[0].n, 0);
    // A score above them takes place 1 and the lowest row goes.
    const high = await s.attempt({ name: 'TOP', score: 40000 }, { difficulty: 'medium' });
    assert.deepStrictEqual([high.json.place, high.json.total], [1, 201]);
    const after = s.d1.rows("SELECT MIN(score) AS low, MAX(score) AS high, COUNT(*) AS n FROM scores WHERE difficulty = 'medium'")[0];
    assert.deepStrictEqual(after, { low: 1060, high: 40000, n: 200 });
    // Among equal scores at the edge, the earlier submission is the one kept.
    const tie = await s.attempt({ name: 'TIE', score: 1060 }, { difficulty: 'medium' });
    assert.deepStrictEqual([tie.json.place, tie.json.total], [201, 201]);
    assert.strictEqual(s.d1.rows("SELECT COUNT(*) AS n FROM scores WHERE name = 'TIE'")[0].n, 0);
  });

  await check('dates: date is the UTC date of submission, not the local one', async () => {
    const s = service();
    assert.notStrictEqual(new Date(T0).getDate(), new Date(T0).getUTCDate(), 'the test needs a time zone whose date differs from UTC');
    s.clock.now = Date.UTC(2026, 9, 3, 23, 58, 0);
    expectAccepted(await s.attempt({ name: 'AAA', score: 300 }, { age: 60 }));          // 23:59:00 UTC
    expectAccepted(await s.attempt({ name: 'BBB', score: 200 }, { age: 59.999 }));      // 23:59:59.999 UTC
    s.clock.now += 1;
    expectAccepted(await s.attempt({ name: 'CCC', score: 100, time: 10 }, { age: 10 })); // 00:00:10 UTC on the 4th
    s.clock.now = Date.UTC(2027, 0, 1, 0, 0, 0);
    expectAccepted(await s.attempt({ name: 'DDD', score: 50, time: 10 }, { age: 10 }));
    const list = (await s.call('GET', '/v1/scores')).json.easy;
    assert.deepStrictEqual(list.map((e) => e.name + ' ' + e.date), ['AAA 2026-10-03', 'BBB 2026-10-03', 'CCC 2026-10-04', 'DDD 2027-01-01']);
    assert.deepStrictEqual(s.d1.rows('SELECT created_at FROM scores ORDER BY id LIMIT 1'), [{ created_at: Date.UTC(2026, 9, 3, 23, 59, 0) }]);
  });

  await check('stored row: every column of scores holds what was submitted, with the token\'s id and the time in ms', async () => {
    const s = service();
    const token = await s.start('hard');
    s.wait(301);
    expectAccepted(await s.submit(token, { name: 'ZOE', score: 102120, wpm: 77, accuracy: 100, rank: 'S', cleared: true, time: 300 }));
    assert.deepStrictEqual(s.d1.rows('SELECT * FROM scores'), [{
      id: 1, run_id: decodeToken(token).payload.id, difficulty: 'hard', name: 'ZOE', score: 102120, wpm: 77, accuracy: 100,
      rank: 'S', cleared: 1, time_s: 300, created_at: s.clock.now
    }]);
    const types = s.d1.rows('SELECT typeof(score) AS a, typeof(cleared) AS b, typeof(time_s) AS c, typeof(created_at) AS d, typeof(wpm) AS e FROM scores')[0];
    assert.deepStrictEqual(types, { a: 'integer', b: 'integer', c: 'integer', d: 'integer', e: 'integer' });
  });

  // ===============================================================================================
  // 7. The rate limit, what is kept of a network address, and the hourly clean-up
  // ===============================================================================================

  await check('rate: 60 an hour for one address; another address is not affected; an hour later the first can submit again', async () => {
    const s = service();
    const first = '203.0.113.7';
    const tokens = [];
    for (let i = 0; i < 70; i++) tokens.push(await s.start('easy'));
    s.wait(60);
    for (let i = 0; i < 60; i++) expectAccepted(await s.submit(tokens[i], {}, first), 'submission ' + (i + 1));
    expectError(await s.submit(tokens[60], {}, first), 429, 'rate', 'submission 61');
    expectAccepted(await s.submit(tokens[61], {}, '203.0.113.8'), 'another address');
    expectAccepted(await s.submit(tokens[62], {}, '2001:db8::7'), 'an IPv6 address');
    assert.strictEqual(s.d1.count('hits'), 62, 'a refused submission was counted');
    s.wait(HOUR - 1);
    expectError(await s.submit(tokens[60], {}, first), 429, 'rate', 'one second short of an hour later');
    s.wait(1);
    expectAccepted(await s.submit(tokens[60], {}, first), 'an hour later');
    // The hashes of the hour before are gone.
    assert.deepStrictEqual(s.d1.rows('SELECT at FROM hits'), [{ at: s.clock.now }]);
  });

  await check('rate: the window slides, so each submission frees its place one hour after it was made', async () => {
    const s = service();
    const ip = '203.0.113.9';
    const tokens = [];
    for (let i = 0; i < 70; i++) tokens.push(await s.start('easy'));
    s.wait(60);
    for (let i = 0; i < 30; i++) expectAccepted(await s.submit(tokens[i], {}, ip));
    s.wait(1800);
    for (let i = 30; i < 60; i++) expectAccepted(await s.submit(tokens[i], {}, ip));
    expectError(await s.submit(tokens[60], {}, ip), 429, 'rate', 'at the limit');
    s.wait(1800);
    for (let i = 60; i < 70; i++) expectAccepted(await s.submit(tokens[i], {}, ip), 'after the first thirty are an hour old');
    assert.strictEqual(s.d1.count('hits'), 40, 'hashes older than an hour were not deleted');
  });

  await check('rate: the source is the CF-Connecting-IP header and no other header', async () => {
    const s = service();
    const tokens = [];
    for (let i = 0; i < 63; i++) tokens.push(await s.start('easy'));
    s.wait(60);
    const send = function (token, headers) {
      return s.call('POST', '/v1/scores', { body: Object.assign({ token: token }, GOOD), headers: headers });
    };
    for (let i = 0; i < 60; i++) {
      // The same Cloudflare address each time, with other headers that change.
      expectAccepted(await send(tokens[i], { 'CF-Connecting-IP': '198.51.100.20', 'X-Forwarded-For': '10.9.' + i + '.1', 'X-Real-IP': '10.8.' + i + '.1' }));
    }
    expectError(await send(tokens[60], { 'CF-Connecting-IP': '198.51.100.20', 'X-Forwarded-For': '10.7.7.7', 'X-Real-IP': '10.6.6.6' }), 429, 'rate', 'a changed X-Forwarded-For');
    expectError(await send(tokens[60], { 'cf-connecting-ip': '198.51.100.20' }), 429, 'rate', 'the header in lower case');
    expectAccepted(await send(tokens[61], { 'CF-Connecting-IP': '198.51.100.21', 'X-Forwarded-For': '198.51.100.20' }), 'another CF-Connecting-IP');
    // Without the header (it is always present on Cloudflare) requests share one source.
    expectAccepted(await send(tokens[62], {}));
    const hashes = s.d1.rows('SELECT ip_hash, COUNT(*) AS n FROM hits GROUP BY ip_hash ORDER BY n DESC');
    assert.deepStrictEqual(hashes.map((h) => h.n), [60, 1, 1]);
    assert.strictEqual(hashes[0].ip_hash, sha256Hex(SECRET + '198.51.100.20').slice(0, 32), 'the hash is not SHA-256 of the secret and the address, first 32 characters');
    assert.strictEqual(await W.sourceHash(SECRET, '198.51.100.20'), hashes[0].ip_hash);
  });

  await check('rate: a submission counts once it has passed checks 1 to 11, whether accepted or refused as used', async () => {
    const s = service();
    const ip = '203.0.113.30';
    // Refused by checks 1 to 11: not counted, and nothing is written.
    for (let i = 0; i < 70; i++) expectError(await s.attempt({ name: 'dav' }, { ip: ip, age: 0 }), 400, 'name');
    for (let i = 0; i < 70; i++) expectError(await s.call('POST', '/v1/scores', { body: 'not json', ip: ip }), 400, 'bad_request');
    assert.strictEqual(s.d1.count('hits'), 0);
    assert.strictEqual(s.d1.log.length, 0, 'a submission refused by checks 1 to 11 reached the database');
    // One accepted, then 59 refused as used: 60 counted.
    const token = await s.start('easy');
    const spare = await s.start('easy');
    s.wait(60);
    expectAccepted(await s.submit(token, {}, ip));
    for (let i = 0; i < 59; i++) expectError(await s.submit(token, {}, ip), 409, 'used');
    assert.strictEqual(s.d1.count('hits'), 60);
    expectError(await s.submit(spare, {}, ip), 429, 'rate', 'a fresh token after 60 counted submissions');
    // Refused by the limit: not counted, so the source is free again an hour after its 60.
    for (let i = 0; i < 20; i++) expectError(await s.submit(spare, {}, ip), 429, 'rate');
    assert.strictEqual(s.d1.count('hits'), 60);
    s.wait(HOUR);
    expectAccepted(await s.submit(spare, {}, ip), 'an hour later');
  });

  await check('rate: sourceKey gives an IPv4 address as it is and an IPv6 address as its first 64 bits', () => {
    const forms = [
      ['198.51.100.7', '198.51.100.7'],
      [' 198.51.100.7 ', '198.51.100.7'],
      ['2001:db8:1234:5678::1', '2001:db8:1234:5678::/64'],
      ['2001:db8:1234:5678:ffff:ffff:ffff:ffff', '2001:db8:1234:5678::/64'],
      ['2001:0DB8:1234:5678:0000:0000:0000:0001', '2001:db8:1234:5678::/64'],
      ['2001:db8:1234:5678:1:2:3:4', '2001:db8:1234:5678::/64'],
      ['2001:db8:1234:5679::1', '2001:db8:1234:5679::/64'],
      ['2001:db8:1234::5678:1', '2001:db8:1234:0::/64'],
      ['2001:db8::', '2001:db8:0:0::/64'],
      ['2001:db8::1', '2001:db8:0:0::/64'],
      ['::1', '0:0:0:0::/64'],
      ['::', '0:0:0:0::/64'],
      ['2606:4700:4700::1111', '2606:4700:4700:0::/64'],
      ['::ffff:192.0.2.1', '192.0.2.1'],
      ['::FFFF:192.0.2.1', '192.0.2.1'],
      ['::ffff:c000:201', '192.0.2.1'],
      ['0:0:0:0:0:ffff:192.0.2.1', '192.0.2.1'],
      ['64:ff9b::192.0.2.1', '64:ff9b:0:0::/64'],
      // Not an address: taken as it is.
      ['1:2:3:4:5:6:7', '1:2:3:4:5:6:7'],
      ['1:2:3:4:5:6:7:8:9', '1:2:3:4:5:6:7:8:9'],
      ['1::2::3', '1::2::3'],
      ['12345::1', '12345::1'],
      ['g::1', 'g::1'],
      ['::ffff:999.0.2.1', '::ffff:999.0.2.1'],
      ['fe80::1%eth0', 'fe80::1%eth0'],
      ["x' OR '1'='1", "x' OR '1'='1"],
      ['', 'unknown'], ['   ', 'unknown'], [undefined, 'unknown'], [null, 'unknown'], [5, 'unknown'], [{}, 'unknown']
    ];
    for (const form of forms) assert.strictEqual(W.sourceKey(form[0]), form[1], 'sourceKey(' + JSON.stringify(form[0]) + ')');
  });

  await check('rate: the addresses of one IPv6 /64 are one source, so the 61st submission is refused; another /64 is counted apart', async () => {
    const s = service();
    const tokens = [];
    for (let i = 0; i < 130; i++) tokens.push(await s.start('easy'));
    s.wait(60);
    // Each submission from another address of 2001:db8:1234:5678::/64, as one home connection can send them.
    for (let i = 0; i < 60; i++) {
      expectAccepted(await s.submit(tokens[i], { score: 1000 + i }, '2001:db8:1234:5678::' + (i + 1).toString(16)), 'submission ' + (i + 1));
    }
    expectError(await s.submit(tokens[60], {}, '2001:db8:1234:5678::3d'), 429, 'rate', 'submission 61, from a 61st address');
    expectError(await s.submit(tokens[60], {}, '2001:db8:1234:5678:ffff:eeee:dddd:cccc'), 429, 'rate', 'from the far end of the /64');
    expectError(await s.submit(tokens[60], {}, '2001:0DB8:1234:5678:0:0:0:99'), 429, 'rate', 'written in capitals and without ::');
    assert.strictEqual(s.d1.count('scores'), 60);
    assert.deepStrictEqual(s.d1.rows('SELECT ip_hash, COUNT(*) AS n FROM hits GROUP BY ip_hash'),
      [{ ip_hash: sha256Hex(SECRET + '2001:db8:1234:5678::/64').slice(0, 32), n: 60 }]);
    // The next /64 is another connection.
    for (let i = 0; i < 60; i++) {
      expectAccepted(await s.submit(tokens[61 + i], {}, '2001:db8:1234:5679::' + (i + 1).toString(16)), 'submission ' + (i + 1) + ' from the next /64');
    }
    expectError(await s.submit(tokens[121], {}, '2001:db8:1234:5679::ffff'), 429, 'rate', 'submission 61 from the next /64');
    assert.deepStrictEqual(s.d1.rows('SELECT COUNT(*) AS n FROM hits GROUP BY ip_hash').map((r) => r.n), [60, 60]);
    // An IPv4 source is not affected by either, and an IPv4 address written as IPv6 is the same source.
    expectAccepted(await s.submit(tokens[121], {}, '192.0.2.77'));
    expectAccepted(await s.submit(tokens[122], {}, '::ffff:192.0.2.77'));
    const v4 = s.d1.rows('SELECT COUNT(*) AS n FROM hits WHERE ip_hash = ?', sha256Hex(SECRET + '192.0.2.77').slice(0, 32));
    assert.strictEqual(v4[0].n, 2);
  });

  await check('clean-up: the scheduled handler deletes hashes after an hour and used ids after a token\'s life, with nobody submitting', async () => {
    const s = service();
    const run = function () {
      return worker.scheduled({ cron: '17 * * * *', scheduledTime: s.clock.now }, s.env, {});
    };
    expectAccepted(await s.attempt({}, { ip: '203.0.113.90' }));
    const first = s.clock.now;
    s.wait(1800);
    expectAccepted(await s.attempt({}, { ip: '203.0.113.91' }));
    const second = s.clock.now;
    assert.deepStrictEqual([s.d1.count('hits'), s.d1.count('used'), s.d1.count('scores')], [2, 2, 2]);
    // Reading the boards and asking for tokens delete nothing, however much time passes.
    s.clock.now = first + 30 * 24 * HOUR * 1000;
    await s.call('GET', '/v1/scores');
    await s.start('easy');
    assert.strictEqual(s.d1.count('hits'), 2);
    // The scheduled handler does, by the same rule as a submission.
    s.clock.now = first + HOUR * 1000 - 1;
    assert.strictEqual(await run(), undefined);
    assert.strictEqual(s.d1.count('hits'), 2, 'a hash was deleted before it was an hour old');
    s.clock.now = first + HOUR * 1000;
    await run();
    assert.deepStrictEqual(s.d1.rows('SELECT at FROM hits'), [{ at: second }]);
    s.clock.now = second + HOUR * 1000;
    await run();
    assert.strictEqual(s.d1.count('hits'), 0);
    assert.strictEqual(s.d1.count('used'), 2, 'a used id was deleted with the hashes');
    s.clock.now = first + 3 * HOUR * 1000;
    await run();
    assert.strictEqual(s.d1.count('used'), 2, 'a used id was deleted while its token might still be accepted');
    s.clock.now = first + 3 * HOUR * 1000 + 1;
    await run();
    assert.deepStrictEqual(s.d1.rows('SELECT at FROM used'), [{ at: second }]);
    s.clock.now = second + 3 * HOUR * 1000 + 1;
    await run();
    assert.deepStrictEqual([s.d1.count('hits'), s.d1.count('used'), s.d1.count('scores')], [0, 0, 2], 'the scores are not touched');
    // Run again on empty tables: nothing to do, no failure.
    await run();
  });

  await check('clean-up: the scheduled handler never rejects; a failure is one log line', async () => {
    const s = service();
    s.d1.failWith = new Error('D1_ERROR: no such table: hits');
    const lines = await captureErrors(async () => {
      assert.strictEqual(await worker.scheduled({ cron: '17 * * * *', scheduledTime: T0 }, s.env, {}), undefined);
    });
    assert.strictEqual(lines.length, 1);
    assert.match(lines[0], /clean-up: .*no such table: hits/);
    assert.ok(!lines[0].includes(SECRET));
    const more = await captureErrors(async () => {
      for (const env of [undefined, null, {}, { DB: null }, { DB: {} }, { DB: new FakeD1() }]) await worker.scheduled({}, env, {});
      await worker.scheduled(undefined, s.env, undefined);
    });
    assert.strictEqual(more.length, 7);
  });

  await check('rate: issuing tokens and reading the boards are not counted and write nothing', async () => {
    const s = service();
    for (let i = 0; i < 100; i++) {
      assert.strictEqual((await s.call('POST', '/v1/runs', { body: { difficulty: 'easy' }, ip: '203.0.113.40' })).status, 200);
      assert.strictEqual((await s.call('GET', '/v1/scores', { ip: '203.0.113.40' })).status, 200);
    }
    assert.strictEqual(s.d1.count('hits') + s.d1.count('scores'), 0);
    expectAccepted(await s.attempt({}, { ip: '203.0.113.40' }));
  });

  await check('privacy: no address, token or secret is in any text column after a run of requests', async () => {
    const s = service();
    const addresses = ['203.0.113.77', '198.51.100.123', '2001:db8:85a3::8a2e:370:7334', '192.0.2.200'];
    const forwarded = '100.64.12.34';
    const tokens = [];
    for (const ip of addresses) {
      for (const d of DIFFS) {
        const token = await s.start(d);
        tokens.push(token);
        s.wait(60);
        const headers = { 'CF-Connecting-IP': ip, 'X-Forwarded-For': forwarded + ', ' + ip, 'X-Real-IP': forwarded, Forwarded: 'for=' + forwarded };
        const body = Object.assign({ token: token }, GOOD);
        expectAccepted(await s.call('POST', '/v1/scores', { body: body, headers: headers }));
        expectError(await s.call('POST', '/v1/scores', { body: body, headers: headers }), 409, 'used');
        expectError(await s.call('POST', '/v1/scores', { body: Object.assign({}, body, { name: 'x' }), headers: headers }), 400, 'name');
        assert.strictEqual((await s.call('GET', '/v1/scores', { headers: headers })).status, 200);
      }
    }
    const tables = s.d1.rows("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").map((t) => t.name);
    assert.deepStrictEqual(tables.sort(), ['days', 'hits', 'scores', 'seen', 'stats', 'used']);
    let texts = 0;
    const secrets = addresses.concat([forwarded, SECRET]).concat(tokens).concat(tokens.map((t) => t.split('.')[1]));
    for (const table of tables) {
      for (const row of s.d1.rows('SELECT * FROM ' + table)) {
        for (const column of Object.keys(row)) {
          const value = row[column];
          if (typeof value !== 'string') {
            assert.ok(typeof value === 'number', table + '.' + column + ' holds a ' + typeof value);
            continue;
          }
          texts++;
          for (const secret of secrets) {
            assert.ok(!value.includes(secret), table + '.' + column + ' holds ' + JSON.stringify(value));
            // A stored text of some length must not be a piece of an address, a token or the secret either.
            assert.ok(value.length < 8 || !secret.includes(value), table + '.' + column + ' holds a piece of ' + JSON.stringify(secret));
          }
          // Nothing shaped like an address: no dots and no colons in any stored text.
          assert.ok(!/[.:]/.test(value), table + '.' + column + ' holds ' + JSON.stringify(value));
        }
      }
    }
    assert.ok(texts >= 12 * 4 + 24, 'only ' + texts + ' text values were read');
    const hashes = s.d1.rows('SELECT DISTINCT ip_hash FROM hits').map((h) => h.ip_hash).sort();
    // The hash is of the address for IPv4 and of the first 64 bits for IPv6 (LEADERBOARD 4).
    const sources = ['203.0.113.77', '198.51.100.123', '2001:db8:85a3:0::/64', '192.0.2.200'];
    assert.deepStrictEqual(hashes, sources.map((source) => sha256Hex(SECRET + source).slice(0, 32)).sort());
    for (const h of hashes) assert.match(h, /^[0-9a-f]{32}$/);
    // `used` holds the token's id and a time, as `scores` does, and nothing of the source.
    assert.deepStrictEqual(s.d1.rows('SELECT run_id FROM used ORDER BY run_id'), s.d1.rows('SELECT run_id FROM scores ORDER BY run_id'));
    // The same address under another secret gives another hash, so the hashes cannot be matched to a list of addresses.
    assert.notStrictEqual(await W.sourceHash('another-secret-0123456789', addresses[0]), await W.sourceHash(SECRET, addresses[0]));
  });

  // ===============================================================================================
  // 8. SQL injection, the statements the Worker runs and the work each request costs
  // ===============================================================================================

  const ATTACKS = [
    "'; DROP TABLE scores; --",
    "AAA'); DELETE FROM scores; --",
    '" OR 1=1 --',
    "x' OR '1'='1",
    "easy' UNION SELECT ip_hash, at, 1, 1, 'S', 1, 1 FROM hits --",
    'AAA; DROP TABLE hits',
    "A'A",
    '?1',
    '\u0000',
    '%27%3B%20DROP%20TABLE%20scores'
  ];

  await check('injection: SQL in the name, rank, token or difficulty is refused by the checks and changes nothing', async () => {
    const s = service();
    expectAccepted(await s.attempt({ name: 'PIP', score: 1234 }));
    const before = JSON.stringify([s.d1.rows('SELECT * FROM scores'), s.d1.rows('SELECT * FROM hits'), s.d1.rows('SELECT name, sql FROM sqlite_master ORDER BY name')]);
    const statements = s.d1.log.length;
    for (const attack of ATTACKS) {
      expectError(await s.attempt({ name: attack }), 400, 'name', 'name ' + JSON.stringify(attack));
      expectError(await s.attempt({ rank: attack }), 400, 'bad_request', 'rank ' + JSON.stringify(attack));
      expectError(await s.attempt({}, { token: attack }), 400, 'bad_token', 'token ' + JSON.stringify(attack));
      expectError(await s.attempt({ score: attack }), 400, 'bad_request', 'score ' + JSON.stringify(attack));
      expectError(await s.attempt({ time: attack }), 400, 'bad_request', 'time ' + JSON.stringify(attack));
      expectError(await s.attempt({ wpm: attack }), 400, 'bad_request', 'wpm ' + JSON.stringify(attack));
      expectError(await s.attempt({ accuracy: attack }), 400, 'bad_request', 'accuracy ' + JSON.stringify(attack));
      expectError(await s.attempt({ cleared: attack }), 400, 'bad_request', 'cleared ' + JSON.stringify(attack));
      expectError(await s.call('POST', '/v1/runs', { body: { difficulty: attack } }), 400, 'bad_request', 'difficulty ' + JSON.stringify(attack));
      expectError(await s.call('GET', '/v1/scores?limit=' + encodeURIComponent(attack)), 400, 'bad_request', 'limit ' + JSON.stringify(attack));
      // Signed by the service's own secret, so that only the checks on the contents stand in the way.
      expectError(await s.attempt({}, { token: await W.signToken(SECRET, { id: attack, d: 'easy', t: s.clock.now }) }), 400, 'bad_token', 'token id ' + JSON.stringify(attack));
      expectError(await s.attempt({}, { token: await W.signToken(SECRET, { id: '4'.repeat(32), d: attack, t: s.clock.now }) }), 400, 'bad_token', 'token difficulty ' + JSON.stringify(attack));
    }
    assert.strictEqual(s.d1.log.length, statements, 'a refused request reached the database');
    const after = JSON.stringify([s.d1.rows('SELECT * FROM scores'), s.d1.rows('SELECT * FROM hits'), s.d1.rows('SELECT name, sql FROM sqlite_master ORDER BY name')]);
    assert.strictEqual(after, before);
  });

  await check('injection: SQL in the address header or the query string is stored only as a hash, or not at all', async () => {
    const s = service();
    const printable = ATTACKS.filter((a) => !/[\u0000-\u001f]/.test(a));
    for (const attack of printable) {
      const r = await s.attempt({ name: 'PIP' }, { ip: attack });
      expectAccepted(r, 'address ' + JSON.stringify(attack));
      assert.strictEqual((await s.call('GET', '/v1/scores?x=' + encodeURIComponent(attack) + '&limit=5', { ip: attack })).status, 200);
      assert.strictEqual((await s.call('GET', '/v1/scores?' + encodeURIComponent(attack))).status, 200);
    }
    assert.strictEqual(s.d1.count('scores'), printable.length);
    const hashes = s.d1.rows('SELECT ip_hash FROM hits').map((h) => h.ip_hash);
    assert.deepStrictEqual(hashes, printable.map((a) => sha256Hex(SECRET + a).slice(0, 32)));
    const schema = s.d1.rows("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").map((r) => r.name);
    assert.deepStrictEqual(schema, ['days', 'hits', 'hits_at', 'hits_ip', 'scores', 'scores_board', 'seen', 'stats', 'used', 'used_at']);
  });

  await check('statements: every prepare() in worker.js takes a constant of SQL, and no statement text is put together at run time', () => {
    const calls = SOURCE.match(/\.prepare\([^)]*\)/g) || [];
    assert.ok(calls.length >= 5, 'only ' + calls.length + ' prepare() calls found');
    for (const call of calls) assert.match(call, /^\.prepare\(SQL\.[A-Za-z]+\)$/, call);
    assert.ok(!/\.exec\(/.test(SOURCE.replace(/\/\/.*$/gm, '')), 'worker.js calls exec(), which takes no parameters');
    assert.ok(!SOURCE.includes('${'), 'worker.js uses a template with a value in it');
    assert.ok(Object.isFrozen(W.SQL), 'SQL can be changed at run time');
    for (const name of Object.keys(W.SQL)) {
      const sql = W.SQL[name];
      assert.strictEqual(typeof sql, 'string');
      assert.ok(!/['"]/.test(sql), 'SQL.' + name + ' has a quoted value in it');
      assert.ok(!/\?(?!\d)/.test(sql), 'SQL.' + name + ' has a parameter without a number');
      assert.ok(/\?1\b/.test(sql), 'SQL.' + name + ' takes no parameter');
    }
    // In the source, the SQL block is plain text: nothing is joined onto a statement.
    const block = /export const SQL = Object\.freeze\(\{([\s\S]*?)\n\}\);/.exec(SOURCE);
    assert.ok(block, 'the SQL block was not found');
    const code = block[1].replace(/`[^`]*`/g, '``').replace(/\/\/.*$/gm, '');
    assert.match(code.replace(/\s+/g, ''), /^([A-Za-z]+:``,?)+$/, 'the SQL block holds something other than names and plain texts');
  });

  await check('work: no statement reads a whole table; each finds its rows through an index', () => {
    const d1 = new FakeD1();
    d1.db.exec(SCHEMA);
    const plans = [];
    for (const name of Object.keys(W.SQL)) {
      const values = new Array(parameterCount(W.SQL[name])).fill(1);
      const steps = d1.db.prepare('EXPLAIN QUERY PLAN ' + W.SQL[name]).all(...values).map((row) => row.detail);
      for (const step of steps) assert.ok(!/^SCAN (scores|hits|used)\b/.test(step), 'SQL.' + name + ': ' + step);
      plans.push(name + ': ' + steps.join(' / '));
    }
    const plan = plans.join('\n');
    assert.match(plan, /^pruneHits: SEARCH hits USING (COVERING )?INDEX hits_at /m);
    assert.match(plan, /^pruneUsed: SEARCH used USING (COVERING )?INDEX used_at /m);
    assert.match(plan, /^addHit: .*SEARCH hits USING (COVERING )?INDEX hits_ip /m);
    assert.match(plan, /^isUsed: SEARCH used USING /m);
    // Without the index on hits.at the same delete reads every row of the table.
    const bare = new FakeD1();
    bare.db.exec('CREATE TABLE hits (ip_hash TEXT NOT NULL, at INTEGER NOT NULL); CREATE INDEX hits_ip ON hits (ip_hash, at);');
    assert.deepStrictEqual(bare.db.prepare('EXPLAIN QUERY PLAN ' + W.SQL.pruneHits).all(1).map((row) => row.detail), ['SCAN hits']);
  });

  await check('work: the statements each kind of request runs', async () => {
    const s = service();
    const cost = async function (fn) {
      const before = s.d1.log.length;
      await fn();
      return s.d1.log.length - before;
    };
    const ip = '203.0.113.150';
    const tokens = [];
    for (let i = 0; i < 62; i++) tokens.push(await s.start('easy'));
    s.wait(60);
    assert.strictEqual(await cost(() => s.call('GET', '/v1/scores')), 3, 'the first GET /v1/scores');
    assert.strictEqual(await cost(() => s.call('GET', '/v1/scores?limit=50')), 0, 'a second GET within 15 s');
    assert.strictEqual(await cost(() => s.start('easy')), 0, 'POST /v1/runs');
    assert.strictEqual(await cost(async () => { expectAccepted(await s.submit(tokens[0], {}, ip)); }), 10, 'an accepted score');
    assert.strictEqual(await cost(async () => { expectError(await s.submit(tokens[0], {}, ip), 409, 'used'); }), 3, 'a token sent again');
    assert.strictEqual(await cost(async () => { expectError(await s.submit(tokens[1], { name: 'dav' }, ip), 400, 'name'); }), 0, 'refused by checks 1 to 11');
    assert.strictEqual(await cost(async () => { expectError(await s.call('POST', '/v1/scores', { body: Object.assign({ token: tokens[1] }, GOOD), headers: { Origin: 'https://some-other-site.example' }, ip: ip }), 403, 'origin'); }), 0, 'from another origin');
    for (let i = 1; i < 59; i++) expectAccepted(await s.submit(tokens[i], {}, ip));
    assert.strictEqual(s.d1.count('hits'), 60);
    assert.strictEqual(await cost(async () => { expectError(await s.submit(tokens[60], {}, ip), 429, 'rate'); }), 3, 'a source at its limit');
    // The answers that write nothing to `scores` write at most one row, the hit.
    const rows = [s.d1.count('hits'), s.d1.count('scores'), s.d1.count('used')];
    expectError(await s.submit(tokens[60], {}, ip), 429, 'rate');
    expectError(await s.submit(tokens[0], {}, ip), 429, 'rate');
    assert.deepStrictEqual([s.d1.count('hits'), s.d1.count('scores'), s.d1.count('used')], rows);
  });

  await check('work: one token sent 1,000 times from the addresses of one /64 costs 3 statements each and leaves 60 rows in hits', async () => {
    const s = service();
    const token = await s.start('easy');
    s.wait(60);
    expectAccepted(await s.submit(token, {}, '2001:db8:aaaa:bbbb::1'));
    const before = s.d1.log.length;
    const seen = { 409: 0, 429: 0 };
    for (let i = 0; i < 1000; i++) {
      const r = await s.submit(token, {}, '2001:db8:aaaa:bbbb:' + (i >> 8).toString(16) + ':' + (i & 255).toString(16) + '::' + (i + 2).toString(16));
      assert.ok(r.status === 409 || r.status === 429, 'replay ' + (i + 1) + ' gave ' + r.status);
      seen[r.status]++;
    }
    assert.deepStrictEqual(seen, { 409: 59, 429: 941 });
    assert.strictEqual(s.d1.log.length - before, 3000);
    assert.deepStrictEqual([s.d1.count('hits'), s.d1.count('scores'), s.d1.count('used')], [60, 1, 1]);
  });

  // ===============================================================================================
  // 9. Failures inside the service
  // ===============================================================================================

  await check('server: a database failure gives 500 server, one log line, and no secret, token or address in the log', async () => {
    const s = service();
    const token = await s.start('easy');
    s.wait(60);
    s.d1.failWith = new Error('D1_ERROR: no such table: scores');
    let post;
    let get;
    const lines = await captureErrors(async () => {
      post = await s.submit(token, {}, '203.0.113.99');
      get = await s.call('GET', '/v1/scores', { ip: '203.0.113.99' });
    });
    expectError(post, 500, 'server', 'POST /v1/scores');
    expectError(get, 500, 'server', 'GET /v1/scores');
    assert.strictEqual(lines.length, 2, 'console.error was called ' + lines.length + ' time(s)');
    for (const line of lines) {
      assert.match(line, /no such table: scores/, 'the log does not say what failed');
      for (const secret of [SECRET, token, token.split('.')[1], '203.0.113.99']) assert.ok(!line.includes(secret), 'the log holds ' + secret);
    }
    assert.ok(!post.text.includes('no such table'), 'the response carries the error message');
    // The service works again as soon as the database does, and the token was not spent.
    s.d1.failWith = null;
    expectAccepted(await s.submit(token, {}, '203.0.113.99'));
  });

  await check('server: a database that fails halfway through a submission leaves no part of it behind', async () => {
    const s = service();
    const token = await s.start('easy');
    s.wait(60);
    // The stand-in fails on the statement that reads the place, after the row was inserted in the same batch.
    const realExecute = s.d1.execute;
    s.d1.execute = function (sql, values) {
      if (sql === W.SQL.place) throw new Error('D1_ERROR: interrupted');
      return realExecute.call(this, sql, values);
    };
    let r;
    const lines = await captureErrors(async () => { r = await s.submit(token, {}); });
    expectError(r, 500, 'server');
    assert.strictEqual(lines.length, 1);
    assert.strictEqual(s.d1.count('scores'), 0, 'a row was kept although the answer was 500');
    s.d1.execute = realExecute;
    expectAccepted(await s.submit(token, {}), 'the same token afterwards');
  });

  await check('server: without TOKEN_SECRET, or with a short one, tokens and submissions give 500 and nothing is signed', async () => {
    for (const secret of [undefined, '', 'only-15-letters', 12345678901234567890, null]) {
      const s = service({ TOKEN_SECRET: secret });
      const good = await W.signToken(SECRET, { id: '5'.repeat(32), d: 'easy', t: T0 - 60000 });
      let a;
      let b;
      const lines = await captureErrors(async () => {
        a = await s.call('POST', '/v1/runs', { body: { difficulty: 'easy' } });
        b = await s.call('POST', '/v1/scores', { body: Object.assign({ token: good }, GOOD) });
      });
      expectError(a, 500, 'server', 'POST /v1/runs with TOKEN_SECRET ' + JSON.stringify(secret));
      expectError(b, 500, 'server', 'POST /v1/scores with TOKEN_SECRET ' + JSON.stringify(secret));
      assert.strictEqual(lines.length, 2);
      assert.match(lines[0], /TOKEN_SECRET/);
      if (secret) assert.ok(!lines.join('\n').includes(String(secret)), 'the log holds the secret');
      // The boards need no secret.
      assert.strictEqual((await s.call('GET', '/v1/scores')).status, 200);
    }
  });

  await check('server: the handler never rejects, whatever the request and the environment', async () => {
    const requests = function () {
      return [
        new Request(BASE + '/v1/scores'),
        new Request(BASE + '/v1/scores?limit=5'),
        new Request(BASE + '/v1/runs', { method: 'POST', body: '{"difficulty":"easy"}' }),
        new Request(BASE + '/v1/scores', { method: 'POST', body: JSON.stringify(Object.assign({ token: 'a.b' }, GOOD)) }),
        new Request(BASE + '/v1/scores', { method: 'POST', body: Buffer.from([0xff, 0xfe, 0x00, 0xc3]) }),
        new Request(BASE + '/v1/scores', { method: 'POST' }),
        new Request(BASE + '/%E0%A4%A', { method: 'GET' }),
        new Request(BASE + '//v1//scores', { method: 'DELETE' }),
        new Request(BASE + '/v1/scores', { method: 'OPTIONS' })
      ];
    };
    const environments = [undefined, null, {}, { DB: null, TOKEN_SECRET: SECRET }, { DB: {}, TOKEN_SECRET: SECRET },
      { DB: { prepare() { throw 'a string, not an Error'; }, batch() { throw null; } }, TOKEN_SECRET: SECRET },
      { DB: new FakeD1(), TOKEN_SECRET: SECRET, NOW: () => { throw new Error('no clock'); } },
      { DB: new FakeD1(), TOKEN_SECRET: SECRET, NOW: 'not a function' }];
    let count = 0;
    await captureErrors(async () => {
      for (const env of environments) {
        for (const request of requests()) {
          const response = await worker.fetch(request, env, {});
          assert.ok(response instanceof Response, 'not a Response');
          assert.ok(response.status >= 200 && response.status < 600);
          assert.strictEqual(response.headers.get('access-control-allow-origin'), '*');
          if (response.status !== 204) assert.strictEqual(typeof (await response.json()).ok, 'boolean');
          count++;
        }
      }
    });
    assert.strictEqual(count, environments.length * 9);
  });

  await check('server: without env.NOW the Worker uses the real clock', async () => {
    const s = service({ NOW: undefined });
    const before = Date.now();
    const token = await s.start('easy');
    const t = decodeToken(token).payload.t;
    assert.ok(t >= before && t <= Date.now(), 'the issue time ' + t + ' is not the present');
    // Used at once, the token is too young for a 60 s run and old enough for a 5 s one (refused only as too short).
    expectError(await s.submit(token, { time: 60 }), 400, 'too_soon');
    expectError(await s.submit(token, { time: 5, score: 10 }), 400, 'implausible');
  });

  await check('responses are small: an accepted score answers in under 1,500 bytes and the largest board in under 15,000', async () => {
    const s = service();
    let last;
    for (let i = 0; i < 60; i++) {
      for (const d of DIFFS) last = await s.attempt({ score: 1000 + i, name: 'WWW' }, { difficulty: d });
    }
    assert.ok(Buffer.byteLength(last.text) < 1500, 'the answer to a score has ' + Buffer.byteLength(last.text) + ' bytes');
    const all = await s.call('GET', '/v1/scores?limit=50');
    assert.ok(Buffer.byteLength(all.text) < 15000, 'limit=50 has ' + Buffer.byteLength(all.text) + ' bytes');
    const one = await s.call('GET', '/v1/scores');
    assert.ok(Buffer.byteLength(one.text) < 3500, 'the default boards have ' + Buffer.byteLength(one.text) + ' bytes');
    return Buffer.byteLength(last.text) + ' / ' + Buffer.byteLength(all.text) + ' / ' + Buffer.byteLength(one.text) + ' bytes';
  });

  // ===============================================================================================
  // 10. The limits against the real game
  // ===============================================================================================
  //
  // The headless bot of test/sim.js plays the level on each difficulty. From the game's own result
  // (TG.Game.state.result, with the end-of-level bonuses the game adds) the test builds the
  // submission the game would send, as TG.UI builds its high score entry (CONTRACT 5.12) and with the
  // time rounded down (LEADERBOARD 3.2), and puts it through the Worker.
  //
  // "Room to spare" is fixed here: a run may use at most ROOM of the score cap and of the points its
  // time allows, and a cleared run must still be long enough if it were SHORTER times as long. A
  // change to the game that brings a real run closer to a limit than this fails the test before any
  // player is refused.
  const ROOM = 0.8;
  const SHORTER = 0.9;

  let sim = null;
  try {
    sim = require('./sim');
  } catch (e) {
    ok(false, 'limits: test/sim.js loads', String(e && e.message).split('\n')[0]);
  }

  // Plays one run. Returns the report of runBot, the game's result, and the moment (from 10 s on) at
  // which the score was highest against what its time allows, as if the run had ended there.
  function play(difficulty, options) {
    let game = null;
    const tight = { share: 0, score: 0, time: 0 };
    const report = sim.runBot(Object.assign({ difficulty: difficulty, seed: 1, adaptive: false, files: sim.SIM_FILES }, options, {
      setup: function (TG) {
        game = TG;
        TG.Events.on('score:add', function (p) {
          const t = Math.floor(TG.Game.state.time);
          if (t < RULES.minTime) return;
          const share = p.total / (RULES.base + t * LIMITS[difficulty].rate);
          if (share > tight.share) { tight.share = share; tight.score = p.total; tight.time = t; }
        });
      }
    }));
    const result = game && game.Game && game.Game.state ? game.Game.state.result : null;
    return { report: report, result: result, tight: tight };
  }

  function submissionFor(result) {
    const typing = result.typing || {};
    return {
      name: 'BOT',
      score: Math.floor(result.score),
      wpm: Math.round(typing.wpm || 0),
      accuracy: Math.floor((typeof typing.accuracy === 'number' ? typing.accuracy : 1) * 100 + 1e-9),
      rank: result.rank,
      cleared: result.cleared === true,
      time: Math.floor(result.time)
    };
  }

  function percent(share) {
    return Math.round(share * 100) + '%';
  }

  // Checks one run against the limits with room to spare, sends it through the Worker, and returns
  // the measured values as text. capWpm: the run is from a bot that types faster than the service
  // believes of a person (RULES.maxWpm) and is here for its length, so its WPM is sent as that limit.
  async function judge(difficulty, run, expectCleared, capWpm) {
    const limits = LIMITS[difficulty];
    assert.ok(!run.report.error, 'the bot run failed: ' + run.report.error);
    assert.ok(run.result, 'the run has no result');
    assert.strictEqual(run.result.difficulty, difficulty);
    assert.strictEqual(run.result.cleared, expectCleared, 'cleared is ' + run.result.cleared);
    const sub = submissionFor(run.result);
    if (capWpm) {
      assert.ok(sub.wpm > RULES.maxWpm, 'the run reports ' + sub.wpm + ' WPM, which needs no cap');
      sub.wpm = RULES.maxWpm;
    }
    const allowed = RULES.base + sub.time * limits.rate;
    // The Worker's own checks, with a token issued when the run began.
    const now = T0 + Math.ceil(run.result.time * 1000);
    const verdict = W.validateSubmission(Object.assign({ token: 't' }, sub), { id: '6'.repeat(32), d: difficulty, t: T0 }, now);
    assert.strictEqual(verdict, null, JSON.stringify(sub) + ' is refused as ' + verdict);
    // Room to spare.
    assert.ok(sub.score >= 1, 'score ' + sub.score);
    assert.ok(sub.score <= ROOM * limits.cap, 'score ' + sub.score + ' is more than ' + percent(ROOM) + ' of the cap ' + limits.cap);
    assert.ok(sub.score <= ROOM * allowed, 'score ' + sub.score + ' is more than ' + percent(ROOM) + ' of the ' + allowed + ' allowed for ' + sub.time + ' s');
    assert.ok(run.tight.share <= ROOM, 'at ' + run.tight.time + ' s the score ' + run.tight.score + ' was ' + percent(run.tight.share) + ' of what that time allows');
    assert.ok(sub.wpm <= RULES.maxWpm && sub.time >= RULES.minTime && sub.time <= RULES.maxTime, 'wpm ' + sub.wpm + ', time ' + sub.time);
    if (sub.cleared) {
      assert.ok(Math.floor(sub.time * SHORTER) >= limits.minCleared,
        'a cleared run of ' + sub.time + ' s is within ' + percent(1 - SHORTER) + ' of the shortest allowed, ' + limits.minCleared + ' s');
    }
    // The whole way: a token at the start, the run's length later the submission, then the board.
    const s = service();
    const token = await s.start(difficulty);
    s.wait(run.result.time);
    const r = await s.call('POST', '/v1/scores', { body: Object.assign({ token: token }, sub), ip: '203.0.113.200' });
    expectAccepted(r, 'the Worker refused ' + JSON.stringify(sub));
    assert.deepStrictEqual(r.json.scores[0], Object.assign({}, { name: sub.name, score: sub.score, wpm: sub.wpm, accuracy: sub.accuracy, rank: sub.rank, cleared: sub.cleared }, { date: r.json.scores[0].date }));
    return 'score ' + sub.score + ' of cap ' + limits.cap + ' (' + percent(sub.score / limits.cap) + '); ' +
      sub.time + ' s' + (sub.cleared ? ' against the shortest cleared run of ' + limits.minCleared + ' s' : ', not cleared') + '; ' +
      sub.score + ' of the ' + allowed + ' points that time allows (' + percent(sub.score / allowed) + '); ' +
      'wpm ' + sub.wpm + ', accuracy ' + sub.accuracy + ', rank ' + sub.rank;
  }

  if (sim) {
    for (const d of DIFFS) {
      await check('limits: ' + d + ', the target profile clears the level and its result is accepted with room to spare', async () => {
        return judge(d, play(d, { profile: 'target' }), true);
      });
      for (const seed of [1, 2, 3]) {
        await check('limits: ' + d + ', 150 WPM with perfect accuracy and a 0.05 s reaction (seed ' + seed + ') is accepted with room to spare', async () => {
          const run = play(d, { wpm: 150, accuracy: 1, react: 0.05, seed: seed });
          assert.strictEqual(run.result && run.result.typing.accuracy, 1);
          return judge(d, run, true);
        });
      }
      await check('limits: ' + d + ', a run that never types, ended at the first game over, is accepted', async () => {
        const run = play(d, {
          profile: 'target', noType: true,
          onGameOver: function (TG, session) {
            TG.Game.endRun();
            session.done = true;
          }
        });
        assert.strictEqual(run.report.continues, 0);
        return judge(d, run, false);
      });
    }

    // The runs that gave the highest score and the shortest cleared run of each difficulty among 360
    // bot runs (60 seeds each at 60, 90, 150, 220, 400 and 1,000 WPM with perfect accuracy). They are
    // where the figures of LEADERBOARD 5 come from, and each must pass with room to spare.
    const EXTREMES = {
      easy: { highest: { wpm: 150, react: 0.05, seed: 33 }, shortest: { wpm: 1000, react: 0, seed: 12 } },
      medium: { highest: { wpm: 90, react: 0.1, seed: 50 }, shortest: { wpm: 1000, react: 0, seed: 11 } },
      hard: { highest: { wpm: 150, react: 0.05, seed: 9 }, shortest: { wpm: 1000, react: 0, seed: 59 } }
    };
    for (const d of DIFFS) {
      for (const kind of ['highest', 'shortest']) {
        const bot = EXTREMES[d][kind];
        await check('limits: ' + d + ', the ' + kind + (kind === 'highest' ? ' score' : ' cleared run') + ' found in 360 bot runs (' + bot.wpm + ' WPM, seed ' + bot.seed + ') is accepted with room to spare', async () => {
          return judge(d, play(d, Object.assign({ accuracy: 1 }, bot)), true, bot.wpm > RULES.maxWpm);
        });
      }
    }

    // Every rank the game gives, from the game's own rank rule, with the accuracy and the cleared flag
    // it gives them with. A change to the rule that check 9 does not follow fails here.
    await check('limits: runs that the game ranks S, A, B and C, and a run with continues, are accepted with their own rank', async () => {
      const ranks = {};
      let continued = 0;
      for (const d of DIFFS) {
        const runs = [play(d, { profile: 'fast' }), play(d, { profile: 'target' }), play(d, { profile: 'floor' }),
          play(d, { wpm: d === 'easy' ? 40 : d === 'medium' ? 60 : 90, accuracy: 0.9, react: 0.3 }),
          play(d, { wpm: d === 'easy' ? 40 : d === 'medium' ? 60 : 90, accuracy: 0.8, react: 0.3 })];
        for (const run of runs) {
          await judge(d, run, true);
          const sub = submissionFor(run.result);
          ranks[sub.rank] = (ranks[sub.rank] || []).concat([sub.accuracy]);
          if (run.result.continues > 0) continued++;
          // The rank the game gave is the highest that check 9 would take for this accuracy, or lower.
          const needs = W.RANK_RULES[sub.rank];
          assert.ok(sub.accuracy >= needs.accuracy && (sub.cleared || !needs.cleared), 'the game gave ' + sub.rank + ' at ' + sub.accuracy + '%');
        }
      }
      assert.deepStrictEqual(Object.keys(ranks).sort(), ['A', 'B', 'C', 'S'], 'the runs did not cover every rank');
      assert.ok(continued > 0, 'no run used a continue');
      return ['S', 'A', 'B', 'C'].map((rank) => rank + ' at ' + Math.min.apply(null, ranks[rank]) + ' to ' + Math.max.apply(null, ranks[rank]) + '%').join(', ') +
        '; ' + continued + ' runs with continues';
    });

    await check('limits: a made-up score at the old caps, or cleared in less time than the level takes, is refused', async () => {
      const s = service();
      const old = { easy: 120000, medium: 200000, hard: 300000 };
      for (const d of DIFFS) {
        const body = { score: old[d], wpm: 100, accuracy: 100, rank: 'S', cleared: true, time: 400 };
        expectError(await s.attempt(body, { difficulty: d }), 400, 'implausible', d + ' ' + old[d]);
        expectError(await s.attempt(Object.assign({}, body, { score: LIMITS[d].cap + 10 }), { difficulty: d }), 400, 'implausible', d + ' just over the cap');
        expectError(await s.attempt(Object.assign({}, body, { score: 50000, time: LIMITS[d].minCleared - 5 }), { difficulty: d }), 400, 'implausible', d + ' cleared too quickly');
      }
      assert.strictEqual(s.d1.count('scores'), 0);
      // The caps are above what the game gives by less than a third, and below the old ones.
      const seen = { easy: 62480, medium: 108160, hard: 173530 };
      for (const d of DIFFS) {
        assert.ok(LIMITS[d].cap < old[d] && LIMITS[d].cap > seen[d] && LIMITS[d].cap < seen[d] * 4 / 3, d + ' cap ' + LIMITS[d].cap);
      }
    });

    await check('limits: the end-of-level bonuses are part of the score that is checked, and are at most 14,000', async () => {
      const run = play('hard', { wpm: 150, accuracy: 1, react: 0.05 });
      const bonus = run.result.bonuses.reduce((sum, b) => sum + b.points, 0);
      assert.ok(bonus > 0 && bonus <= 14000, 'bonuses ' + bonus);
      assert.strictEqual(run.result.score, run.result.baseScore + bonus);
      assert.strictEqual(submissionFor(run.result).score, run.result.score);
      return run.result.baseScore + ' + ' + bonus + ' = ' + run.result.score;
    });
  }

  // ===============================================================================================
  // 11. The check that server/README.md gives for a new deployment
  // ===============================================================================================
  //
  // Step 7 of the README sends a test score with curl. It is the first request that writes to the
  // real database, so the commands are taken from the README as they are written and sent through
  // the Worker here.

  const README = fs.readFileSync(path.join(SERVER, 'README.md'), 'utf8');

  await check('README: the test score of step 7 is refused before its wait, accepted after it, and removed by the command given', async () => {
    const start = /^TOKEN=\$\(curl -sS -X POST "\$URL\/v1\/runs" -H "content-type: application\/json" -d '([^']+)' \| sed 's\/(.+)\/(.+)\/'\)$/m.exec(README);
    assert.ok(start, 'the line that asks for a token was not found in the README');
    const sleep = /^sleep (\d+)$/m.exec(README);
    assert.ok(sleep, 'no sleep line in the README');
    const send = /^curl -sS -X POST "\$URL\/v1\/scores" -H "content-type: application\/json" -d "(.+)"$/m.exec(README);
    assert.ok(send, 'the line that sends the score was not found in the README');
    const s = service();
    const run = await s.call('POST', '/v1/runs', { body: start[1] });
    assert.strictEqual(run.status, 200, 'POST /v1/runs with ' + start[1] + ' gave ' + run.status);
    // What sed does with the answer: \( \) are groups and \1 is the first of them.
    const pattern = new RegExp(start[2].replace(/\\\(/g, '(').replace(/\\\)/g, ')'));
    const token = run.text.replace(pattern, start[3].replace('\\1', '$1'));
    assert.strictEqual(token, run.json.token, 'the sed line does not give the token');
    // What the shell makes of the -d argument: \" is a quote and $TOKEN is the token.
    const body = send[1].replace(/\\"/g, '"').replace('$TOKEN', token);
    const fields = JSON.parse(body);
    assert.ok(!BLOCKLIST.includes(fields.name));
    s.wait(2);
    expectError(await s.call('POST', '/v1/scores', { body: body }), 400, 'too_soon', 'sent after 2 s');
    s.wait(Number(sleep[1]) - 2);
    const r = await s.call('POST', '/v1/scores', { body: body });
    expectAccepted(r, 'sent after ' + sleep[1] + ' s');
    assert.deepStrictEqual([r.json.place, r.json.total, r.json.difficulty, r.json.scores.length, r.json.scores[0].name], [1, 1, 'easy', 1, fields.name]);
    assert.ok(README.includes('"place":1,"total":1,"difficulty":"easy","scores":[{"name":"' + fields.name + '","score":' + fields.score + ','), 'the README shows another answer');
    const remove = new RegExp('--remote --command "(DELETE FROM scores WHERE name = \'' + fields.name + '\')"').exec(README);
    assert.ok(remove, 'the README has no command that removes the test row');
    s.d1.db.exec(remove[1]);
    assert.strictEqual(s.d1.count('scores'), 0);
  });

  await check('README and LEADERBOARD 8: every database command they give runs as written, and the delete by time takes the rows of that time only', async () => {
    const s = service();
    const at = function (h, m, sec) { return Date.UTC(2026, 9, 3, h, m, sec); };
    const times = [at(17, 59, 59), at(18, 0, 0), at(18, 5, 0), at(18, 10, 0), at(18, 10, 1)];
    times.forEach(function (t, i) {
      s.d1.db.prepare("INSERT INTO scores (run_id, difficulty, name, score, wpm, accuracy, rank, cleared, time_s, created_at) VALUES (?, 'hard', 'AAA', ?, 1, 1, 'C', 0, 60, ?)").run('run' + i, 100 + i, t);
    });
    const texts = [README];
    if (fs.existsSync(documentPath)) texts.push(fs.readFileSync(documentPath, 'utf8'));
    const commands = [];
    for (const text of texts) {
      const pattern = /npx wrangler d1 execute spell-runner-scores --remote --command "([^"]+)"/g;
      let m;
      while ((m = pattern.exec(text)) !== null) commands.push(m[1]);
    }
    assert.ok(commands.length >= 6, 'only ' + commands.length + ' commands found');
    const byTime = commands.filter((sql) => /^DELETE FROM scores WHERE created_at BETWEEN /.test(sql));
    assert.ok(byTime.length >= 1, 'no delete by time');
    for (const sql of byTime) assert.match(sql, /'2026-10-03 18:00:00'.*'2026-10-03 18:10:00'/, 'the test needs the times of the example');
    // Reads first, then the delete by time, then the other deletes.
    for (const sql of commands.filter((c) => /^SELECT /.test(c))) {
      assert.ok(Array.isArray(s.d1.rows(sql)), sql);
    }
    s.d1.db.exec(byTime[0]);
    assert.deepStrictEqual(s.d1.rows('SELECT created_at FROM scores ORDER BY created_at').map((row) => row.created_at), [times[0], times[4]]);
    for (const sql of commands.filter((c) => /^DELETE /.test(c))) s.d1.db.exec(sql);
    assert.strictEqual(commands.filter((c) => !/^(SELECT|DELETE) /.test(c)).length, 0, 'a command that is neither SELECT nor DELETE');
  });

  // ===============================================================================================
  // Every statement the Worker ran in this file
  // ===============================================================================================

  // --- Counters (LEADERBOARD.md, section 10) ----------------------------------------------------

  await check('stats: a start and an end are added to the totals of the day and difficulty', async () => {
    const s = service();
    const day = new Date(s.clock.now).toISOString().slice(0, 10);
    const t1 = await s.start('medium');
    const t2 = await s.start('hard');
    assert.strictEqual((await s.call('POST', '/v1/stats', { body: { token: t1, event: 'start' }, ip: '203.0.113.5' })).status, 200);
    assert.strictEqual((await s.call('POST', '/v1/stats', { body: { token: t1, event: 'start' }, ip: '203.0.113.5' })).status, 200);
    assert.strictEqual((await s.call('POST', '/v1/stats', { body: { token: t2, event: 'start' }, ip: '203.0.113.6' })).status, 200);
    const end = await s.call('POST', '/v1/stats', { body: { token: t1, event: 'end', time: 300, cleared: true, section: 3 }, ip: '203.0.113.5' });
    assert.deepStrictEqual(end.json, { ok: true });
    await s.call('POST', '/v1/stats', { body: { token: t1, event: 'end', time: 40, cleared: false, section: 1 }, ip: '203.0.113.5' });
    const rows = s.d1.rows('SELECT * FROM stats ORDER BY difficulty').map((r) => Object.assign({}, r));
    assert.deepStrictEqual(rows, [
      { day: day, difficulty: 'hard', starts: 1, finishes: 0, cleared: 0, time_s: 0, reach0: 0, reach1: 0, reach2: 0, reach3: 0 },
      { day: day, difficulty: 'medium', starts: 2, finishes: 2, cleared: 1, time_s: 340, reach0: 0, reach1: 1, reach2: 0, reach3: 1 }
    ]);
    assert.strictEqual(s.d1.count('scores'), 0, 'a counter request wrote a score');
    assert.strictEqual(s.d1.count('used'), 0, 'a counter request used up a token');
  });

  await check('stats: a source is counted as one player a day, by a hash that differs from day to day and is deleted the next day', async () => {
    const s = service();
    const token = await s.start('easy');
    const start = function (ip) { return s.call('POST', '/v1/stats', { body: { token: token, event: 'start' }, ip: ip }); };
    await start('203.0.113.5'); await start('203.0.113.5'); await start('203.0.113.9');
    await start('2001:db8:1:2::1'); await start('2001:db8:1:2::ffff');          // one /64: one player
    const day1 = new Date(s.clock.now).toISOString().slice(0, 10);
    assert.deepStrictEqual(s.d1.rows('SELECT day, players FROM days').map((r) => Object.assign({}, r)), [{ day: day1, players: 3 }]);
    const hashes1 = s.d1.rows('SELECT hash FROM seen').map((r) => r.hash);
    assert.strictEqual(hashes1.length, 3);
    for (const h of hashes1) assert.match(h, /^[0-9a-f]{32}$/);
    assert.ok(!JSON.stringify(s.d1.rows('SELECT * FROM seen')).includes('203.0.113'), 'an address is stored');
    s.wait(24 * 3600);
    const token2 = await s.start('easy');
    await s.call('POST', '/v1/stats', { body: { token: token2, event: 'start' }, ip: '203.0.113.5' });
    const day2 = new Date(s.clock.now).toISOString().slice(0, 10);
    assert.notStrictEqual(day2, day1);
    const seen = s.d1.rows('SELECT day, hash FROM seen');
    assert.strictEqual(seen.length, 1, 'the hashes of the day before were not deleted');
    assert.strictEqual(seen[0].day, day2);
    assert.ok(!hashes1.includes(seen[0].hash), 'the same source has the same hash on two days');
    assert.deepStrictEqual(s.d1.rows('SELECT players FROM days ORDER BY day').map((r) => r.players), [3, 1]);
  });

  await check('stats: a request without a valid token, with a wrong event or with values out of range is refused and counts nothing', async () => {
    const s = service();
    const token = await s.start('easy');
    expectError(await s.call('POST', '/v1/stats', { body: { event: 'start' } }), 400, 'bad_request');
    expectError(await s.call('POST', '/v1/stats', { body: { token: token + 'x', event: 'start' } }), 400, 'bad_token');
    expectError(await s.call('POST', '/v1/stats', { body: { token: token, event: 'won' } }), 400, 'bad_request');
    for (const bad of [{ time: -1 }, { time: 1.5 }, { time: 10801 }, { cleared: 1 }, { section: 4 }, { section: '1' }]) {
      const body = Object.assign({ token: token, event: 'end', time: 10, cleared: false, section: 0 }, bad);
      expectError(await s.call('POST', '/v1/stats', { body: body }), 400, 'bad_request', JSON.stringify(bad));
    }
    expectError(await s.call('POST', '/v1/stats', { body: { token: token, event: 'start' }, headers: { Origin: 'https://example.com' } }), 403, 'origin');
    expectError(await s.call('GET', '/v1/stats'), 405, 'method');
    s.wait(3 * 3600 + 1);
    expectError(await s.call('POST', '/v1/stats', { body: { token: token, event: 'start' } }), 400, 'expired');
    assert.strictEqual(s.d1.count('stats') + s.d1.count('days') + s.d1.count('seen'), 0);
  });

  await check('stats: the hourly clean-up deletes the hashes of earlier days', async () => {
    const s = service();
    const token = await s.start('easy');
    await s.call('POST', '/v1/stats', { body: { token: token, event: 'start' }, ip: '203.0.113.5' });
    assert.strictEqual(s.d1.count('seen'), 1);
    s.wait(24 * 3600);
    await worker.scheduled({}, s.env, {});
    assert.strictEqual(s.d1.count('seen'), 0);
    assert.strictEqual(s.d1.count('days'), 1, 'the count of the day was lost');
  });

  await check('statements: every SQL text the Worker prepared in these tests is one of its constants, and each constant was run', () => {
    const constants = Object.keys(W.SQL).map((name) => W.SQL[name]);
    const own = Array.from(SEEN_SQL).filter((sql) => !/^(CREATE TABLE t|INSERT INTO t|SELECT (id, )?v FROM t|SELECT COUNT\(\*\) AS n FROM t|SELECT \?1)/.test(sql));
    for (const sql of own) assert.ok(constants.includes(sql), 'not a constant: ' + sql.replace(/\s+/g, ' ').slice(0, 120));
    for (const name of Object.keys(W.SQL)) assert.ok(SEEN_SQL.has(W.SQL[name]), 'SQL.' + name + ' was never run');
    return own.length + ' distinct statements';
  });

  finished = true;
  console.log('');
  console.log('test-server: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(function (e) {
  finished = true;
  console.log('FAIL - test-server.js stopped: ' + (e && e.stack ? e.stack : e));
  console.log('');
  console.log('test-server: ' + passed + ' passed, ' + (failed + 1) + ' failed');
  process.exit(1);
});
