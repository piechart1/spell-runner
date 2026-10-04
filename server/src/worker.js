// server/src/worker.js
// SPELL RUNNER world scores: a Cloudflare Worker with a D1 database.
// docs/LEADERBOARD.md is the agreement between this service and the game; section numbers below
// refer to it.
//
//   POST /v1/runs      start a run: answers with a signed run token and writes nothing (3.1)
//   POST /v1/scores    submit a finished run: the checks of section 5, then one row in `scores` (3.2)
//   GET  /v1/scores    the three boards (3.3)
//   POST /v1/stats     count a run that started or ended: daily totals only (section 10)
//   scheduled          once an hour: deletes what is no longer needed of `hits` and `used` (section 4)
//
// Bindings: env.DB (the D1 database of server/schema.sql) and env.TOKEN_SECRET (a secret string of at
// least 16 characters, set with `wrangler secret put TOKEN_SECRET`).
// env.NOW, when it is a function, replaces the clock. Only test/test-server.js sets it.
//
// The Worker uses only what the Workers runtime provides: no npm packages. Every SQL statement is one
// of the constants in SQL below and takes its values as bound parameters.
//
// File layout:
//   1. limits, rules and error codes
//   2. the SQL statements
//   3. small helpers and responses
//   4. the run token
//   5. the checks on a submitted score
//   6. the three handlers and the hourly clean-up
//   7. routing, the fetch handler and the scheduled handler

import { BLOCKLIST } from './blocklist.js';

// ---------------------------------------------------------------------------------------------
// 1. Limits, rules and error codes
// ---------------------------------------------------------------------------------------------

export const DIFFICULTIES = ['easy', 'medium', 'hard'];
export const RANKS = ['S', 'A', 'B', 'C'];

// Section 5, "Limits per difficulty". test/test-server.js plays the real game against these.
//   cap         the highest score accepted
//   minCleared  the shortest run, in seconds, that can have cleared the level
//   rate        points per second: a score may be at most RULES.base + time x rate
export const LIMITS = Object.freeze({
  easy:   Object.freeze({ cap: 80000,  minCleared: 300, rate: 400 }),
  medium: Object.freeze({ cap: 140000, minCleared: 245, rate: 700 }),
  hard:   Object.freeze({ cap: 220000, minCleared: 215, rate: 1100 })
});

// Check 9: what the game's rank rule (rankOf in js/game.js) needs for each rank. S and A are given
// only for a cleared run; each rank needs at least this accuracy in whole percent.
export const RANK_RULES = Object.freeze({
  S: Object.freeze({ cleared: true, accuracy: 97 }),
  A: Object.freeze({ cleared: true, accuracy: 93 }),
  B: Object.freeze({ cleared: false, accuracy: 85 }),
  C: Object.freeze({ cleared: false, accuracy: 0 })
});

export const RULES = Object.freeze({
  maxBody: 2000,        // bytes in a request body; more gives 413
  tokenLife: 10800,     // seconds a run token can be used for (3 hours)
  tolerance: 5,         // seconds by which a run may be longer than its token is old
  maxWpm: 220,
  minTime: 10,          // seconds
  maxTime: 10800,
  base: 2000,           // points allowed before time x rate
  hourly: 60,           // submissions per source per hour
  keep: 200,            // rows kept per difficulty
  boardDefault: 10,     // entries per board in GET /v1/scores
  boardMax: 50,
  boardAge: 15,         // seconds the boards are answered from memory before the database is read again
  top: 10               // entries sent back with an accepted score
});

// Section 3: the addresses a browser may send a POST from. A request without an Origin header (curl,
// a program) is not affected, and neither is GET. A copy of the game served from the same machine
// (http://localhost, http://127.0.0.1 or http://[::1], any port) is accepted for development.
export const ORIGINS = Object.freeze(['https://piechart1.github.io']);
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?$/;

// Section 6: error code -> HTTP status.
export const ERRORS = Object.freeze({
  bad_request: 400, bad_token: 400, expired: 400, name: 400, implausible: 400, too_soon: 400,
  used: 409, too_large: 413, rate: 429, not_found: 404, method: 405, origin: 403, server: 500
});

const HOUR_MS = 3600000;

// ---------------------------------------------------------------------------------------------
// 2. The SQL statements
// ---------------------------------------------------------------------------------------------
// Constant text only. Values from a request reach the database as bound parameters (?1, ?2, ...),
// never as part of a statement. One order is used everywhere: score, highest first; then submission
// time, earliest first; then id, so that two rows of the same millisecond keep their order.

export const SQL = Object.freeze({
  // ?1 difficulty, ?2 how many
  board: `
    SELECT name, score, wpm, accuracy, rank, cleared, created_at FROM scores
    WHERE difficulty = ?1
    ORDER BY score DESC, created_at ASC, id ASC
    LIMIT ?2`,

  // ?1 the time one hour ago. The index hits_at finds the rows; without it every row would be read.
  pruneHits: `
    DELETE FROM hits WHERE at <= ?1`,

  // Check 12 in one statement: the hit is recorded only if the source has room in the last hour, and
  // the statement returns a row only if it was recorded.
  // ?1 source hash, ?2 now, ?3 the time one hour ago, ?4 submissions allowed per hour
  addHit: `
    INSERT INTO hits (ip_hash, at)
    SELECT ?1, ?2 WHERE (SELECT COUNT(*) FROM hits WHERE ip_hash = ?1 AND at > ?3) < ?4
    RETURNING at`,

  // Check 13, asked together with check 12 so that a token sent again costs no more than this.
  // ?1 run id
  isUsed: `
    SELECT run_id FROM used WHERE run_id = ?1`,

  // ?1 the time one token life ago: a token used before then is refused as expired, so its id can go.
  pruneUsed: `
    DELETE FROM used WHERE at < ?1`,

  // Check 13 again, where it is decided: the row is added only if the token's id is not in `used`,
  // and the statement returns a row only if it was added. addUsed follows in the same transaction.
  // ?1 run id, ?2 difficulty, ?3 name, ?4 score, ?5 wpm, ?6 accuracy, ?7 rank, ?8 cleared, ?9 time, ?10 now
  addScore: `
    INSERT INTO scores (run_id, difficulty, name, score, wpm, accuracy, rank, cleared, time_s, created_at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10 WHERE NOT EXISTS (SELECT 1 FROM used WHERE run_id = ?1)
    ON CONFLICT (run_id) DO NOTHING
    RETURNING id`,

  // The token's id is kept apart from its score, so that it stays used when the score is trimmed
  // from the board or deleted by the owner.
  // ?1 run id, ?2 now
  addUsed: `
    INSERT INTO used (run_id, at) VALUES (?1, ?2)
    ON CONFLICT (run_id) DO NOTHING`,

  // ?1 difficulty
  total: `
    SELECT COUNT(*) AS total FROM scores WHERE difficulty = ?1`,

  // The 1-based place of the run just added: one more than the rows that come before it.
  // ?1 difficulty, ?2 score, ?3 its created_at, ?4 its run id
  place: `
    SELECT COUNT(*) + 1 AS place FROM scores
    WHERE difficulty = ?1
      AND (score > ?2
        OR (score = ?2 AND created_at < ?3)
        OR (score = ?2 AND created_at = ?3 AND id < (SELECT id FROM scores WHERE run_id = ?4)))`,

  // Section 10: one row of totals per UTC day and difficulty.
  // ?1 day, ?2 difficulty
  statStart: `
    INSERT INTO stats (day, difficulty, starts) VALUES (?1, ?2, 1)
    ON CONFLICT (day, difficulty) DO UPDATE SET starts = starts + 1`,

  // ?1 day, ?2 difficulty, ?3 cleared (0 or 1), ?4 seconds played, ?5 to ?8: 1 for the part reached
  statEnd: `
    INSERT INTO stats (day, difficulty, finishes, cleared, time_s, reach0, reach1, reach2, reach3)
    VALUES (?1, ?2, 1, ?3, ?4, ?5, ?6, ?7, ?8)
    ON CONFLICT (day, difficulty) DO UPDATE SET
      finishes = finishes + 1, cleared = cleared + ?3, time_s = time_s + ?4,
      reach0 = reach0 + ?5, reach1 = reach1 + ?6, reach2 = reach2 + ?7, reach3 = reach3 + ?8`,

  // The sources seen today, kept only to count each one once. ?1 today
  pruneSeen: `
    DELETE FROM seen WHERE day < ?1`,

  // Returns a row only if the source had not been seen today. ?1 day, ?2 hash of day and source
  addSeen: `
    INSERT INTO seen (day, hash) VALUES (?1, ?2)
    ON CONFLICT (day, hash) DO NOTHING
    RETURNING day`,

  // ?1 day
  addPlayer: `
    INSERT INTO days (day, players) VALUES (?1, 1)
    ON CONFLICT (day) DO UPDATE SET players = players + 1`,

  // ?1 difficulty, ?2 rows to keep
  trim: `
    DELETE FROM scores
    WHERE difficulty = ?1
      AND id NOT IN (
        SELECT id FROM scores WHERE difficulty = ?1
        ORDER BY score DESC, created_at ASC, id ASC
        LIMIT ?2)`
});

// ---------------------------------------------------------------------------------------------
// 3. Small helpers and responses
// ---------------------------------------------------------------------------------------------

const encoder = new TextEncoder();

// The one place the Worker takes the time from (ms since epoch).
function clock(env) {
  return env && typeof env.NOW === 'function' ? env.NOW() : Date.now();
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function whole(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function hex(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i++) text += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
  return text;
}

function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Returns the bytes, or null if the text is not base64url.
function fromBase64Url(text) {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch (e) {
    return null;
  }
}

// Compares two strings without stopping at the first difference, so that the time taken says
// nothing about how much of a signature was right. Strings of different lengths are unequal.
export function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function secretOf(env) {
  const secret = env ? env.TOKEN_SECRET : undefined;
  if (typeof secret !== 'string' || secret.length < 16) {
    throw new Error('TOKEN_SECRET is not set or is shorter than 16 characters');
  }
  return secret;
}

function databaseOf(env) {
  if (!env || !env.DB) throw new Error('the D1 binding DB is missing');
  return env.DB;
}

// The eight 16-bit groups of an IPv6 address, or null if the text is not one. Takes "::" and an IPv4
// tail (::ffff:192.0.2.1) as well as the full form.
function ipv6Groups(text) {
  const halves = text.split('::');
  if (text.indexOf(':') === -1 || halves.length > 2) return null;
  // last: the part ends the address, so its last piece may be an IPv4 address.
  const read = function (part, last) {
    if (part === '') return [];
    const groups = [];
    const pieces = part.split(':');
    for (let i = 0; i < pieces.length; i++) {
      const dotted = last && i === pieces.length - 1 ? pieces[i].match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/) : null;
      if (dotted) {
        const b = dotted.slice(1).map(Number);
        if (b.some(function (n) { return n > 255; })) return null;
        groups.push(b[0] * 256 + b[1], b[2] * 256 + b[3]);
      } else if (/^[0-9a-f]{1,4}$/.test(pieces[i])) {
        groups.push(parseInt(pieces[i], 16));
      } else {
        return null;
      }
    }
    return groups;
  };
  const head = read(halves[0], halves.length === 1);
  const tail = halves.length === 2 ? read(halves[1], true) : [];
  if (!head || !tail) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  if (head.length + tail.length > 7) return null;
  return head.concat(new Array(8 - head.length - tail.length).fill(0), tail);
}

// What the hourly limit counts as one source (section 4). An IPv4 address is one source. An IPv6
// address is counted by its first 64 bits, because one connection is usually given all the addresses
// that share them and can send each request from another one. Text that is not an address is taken
// as it is; Cloudflare always sets the header, so that is seen only in tests and local runs.
export function sourceKey(address) {
  const text = typeof address === 'string' ? address.trim() : '';
  if (text === '') return 'unknown';
  const groups = ipv6Groups(text.toLowerCase());
  if (!groups) return text;
  // ::ffff:a.b.c.d is an IPv4 address written as IPv6.
  if (groups[5] === 0xffff && groups.slice(0, 5).every(function (g) { return g === 0; })) {
    return [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join('.');
  }
  return groups.slice(0, 4).map(function (g) { return g.toString(16); }).join(':') + '::/64';
}

// Section 4: what is kept of a network address. Only this hash ever reaches the database.
export async function sourceHash(secret, address) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret + sourceKey(address)));
  return hex(new Uint8Array(digest)).slice(0, 32);
}

function reply(status, data, headers) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: Object.assign({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff'
    }, headers)
  });
}

function fail(code, headers) {
  return reply(ERRORS[code], { ok: false, error: code }, headers);
}

function preflight() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400'
    }
  });
}

// The request body as text, or null if it is longer than RULES.maxBody bytes. Reading stops at the
// limit, so a large body is neither held in memory nor parsed.
async function readBody(request) {
  if (Number(request.headers.get('content-length')) > RULES.maxBody) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const step = await reader.read();
    if (step.done) break;
    size += step.value.byteLength;
    if (size > RULES.maxBody) {
      try { await reader.cancel(); } catch (e) { /* the body is not read any further either way */ }
      return null;
    }
    chunks.push(step.value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

// The parsed value, or undefined if the text is not JSON.
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return undefined;
  }
}

// A row of `scores` as the game's high score entry (3.3).
function entry(row) {
  const day = new Date(Number(row.created_at));
  return {
    name: row.name,
    score: row.score,
    wpm: row.wpm,
    accuracy: row.accuracy,
    rank: row.rank,
    cleared: !!row.cleared,
    date: isNaN(day.getTime()) ? '' : day.toISOString().slice(0, 10)
  };
}

// ---------------------------------------------------------------------------------------------
// 4. The run token (3.1)
// ---------------------------------------------------------------------------------------------
// token = base64url(payload) + "." + base64url(HMAC-SHA256(secret, base64url(payload)))
// payload = JSON { id: 32 hex characters, d: difficulty, t: issue time in ms }

async function signature(secret, text) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(text))));
}

export async function signToken(secret, payload) {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  return body + '.' + await signature(secret, body);
}

// Check 2. Returns { id, d, t } if the token carries a valid signature, a known difficulty and a
// 32-hex id, otherwise null. The payload is read only after the signature has been found right.
export async function verifyToken(secret, token) {
  if (typeof token !== 'string' || token.length > 400) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  if (!sameText(await signature(secret, parts[0]), parts[1])) return null;
  const bytes = fromBase64Url(parts[0]);
  const payload = bytes ? parseJson(new TextDecoder().decode(bytes)) : undefined;
  if (!isRecord(payload)) return null;
  if (typeof payload.id !== 'string' || !/^[0-9a-f]{32}$/.test(payload.id)) return null;
  if (!DIFFICULTIES.includes(payload.d) || !Number.isSafeInteger(payload.t)) return null;
  return { id: payload.id, d: payload.d, t: payload.t };
}

// ---------------------------------------------------------------------------------------------
// 5. The checks on a submitted score (section 5, checks 1 to 11)
// ---------------------------------------------------------------------------------------------
// body: the parsed request body. payload: what verifyToken returned for body.token (null if the
// token is not valid). now: ms since epoch. Returns null if the submission passes, otherwise the
// error code of the first check that fails. Uses no database: checks 12 and 13 are in submitScore.

export function validateSubmission(body, payload, now) {
  // 1. The body is JSON with the fields of 3.2 and the right types.
  if (!isRecord(body) || typeof body.token !== 'string' || typeof body.name !== 'string' ||
      typeof body.score !== 'number' || typeof body.wpm !== 'number' || typeof body.accuracy !== 'number' ||
      typeof body.rank !== 'string' || typeof body.cleared !== 'boolean' || typeof body.time !== 'number') {
    return 'bad_request';
  }
  // 2. The token has a valid signature, a known difficulty and a 32-hex id.
  if (!payload || !DIFFICULTIES.includes(payload.d)) return 'bad_token';
  const limits = LIMITS[payload.d];
  const age = now - payload.t;
  // 3. The token is not older than 3 hours.
  if (age > RULES.tokenLife * 1000) return 'expired';
  // 4. The name is three letters A to Z and is not on the block list.
  if (!/^[A-Z]{3}$/.test(body.name) || BLOCKLIST.includes(body.name)) return 'name';
  // 5. The score is a whole number from 1 to the cap for the difficulty.
  if (!whole(body.score, 1, limits.cap)) return 'implausible';
  // 6. wpm, accuracy and rank are in range (cleared was found to be a boolean in check 1).
  if (!whole(body.wpm, 0, RULES.maxWpm) || !whole(body.accuracy, 0, 100) || !RANKS.includes(body.rank)) return 'bad_request';
  // 7. The time is a whole number of seconds from 10 to 10,800.
  if (!whole(body.time, RULES.minTime, RULES.maxTime)) return 'implausible';
  // 8. A cleared run cannot be shorter than the level.
  if (body.cleared && body.time < limits.minCleared) return 'implausible';
  // 9. The rank is one the game gives for that accuracy and for a run that was or was not cleared.
  const needs = RANK_RULES[body.rank];
  if ((needs.cleared && !body.cleared) || body.accuracy < needs.accuracy) return 'implausible';
  // 10. The score is at most 2000 + time x rate.
  if (body.score > RULES.base + body.time * limits.rate) return 'implausible';
  // 11. The run cannot be longer than the time since its token was issued.
  if (age < (body.time - RULES.tolerance) * 1000) return 'too_soon';
  return null;
}

// ---------------------------------------------------------------------------------------------
// 6. The three handlers and the hourly clean-up
// ---------------------------------------------------------------------------------------------

// The boards as they were last read from the database, kept for RULES.boardAge seconds so that the
// database work does not grow with the number of GET requests: { db, at, lists }. Each running copy
// of the Worker has its own. It is dropped when this copy accepts a score, and `accepted` counts
// those scores, so that a read which began before one of them is answered but not kept.
let kept = null;
let accepted = 0;

// POST /v1/runs
async function startRun(body, env) {
  const secret = secretOf(env);
  if (!isRecord(body) || !DIFFICULTIES.includes(body.difficulty)) return fail('bad_request');
  const id = hex(crypto.getRandomValues(new Uint8Array(16)));
  const token = await signToken(secret, { id: id, d: body.difficulty, t: clock(env) });
  return reply(200, { ok: true, token: token, expires: RULES.tokenLife });
}

// POST /v1/scores
async function submitScore(body, request, env) {
  const secret = secretOf(env);
  const db = databaseOf(env);
  const now = clock(env);

  // Checks 1 to 11. No database is used before a submission has passed them.
  const payload = isRecord(body) && typeof body.token === 'string' ? await verifyToken(secret, body.token) : null;
  const error = validateSubmission(body, payload, now);
  if (error) return fail(error);

  // Check 12. Hashes older than an hour are deleted first, then this submission is counted if the
  // source has room. A submission refused here is not counted. The same batch looks the token's id
  // up, so that a token sent again is answered without the work of the second batch.
  const source = await sourceHash(secret, request.headers.get('cf-connecting-ip'));
  const counted = await db.batch([
    db.prepare(SQL.pruneHits).bind(now - HOUR_MS),
    db.prepare(SQL.addHit).bind(source, now, now - HOUR_MS, RULES.hourly),
    db.prepare(SQL.isUsed).bind(payload.id)
  ]);
  if (counted[1].results.length === 0) return fail('rate');
  if (counted[2].results.length > 0) return fail('used');

  // Check 13 and the answer, in one transaction: add the row unless the id is used, mark the id as
  // used, find the row's place and the total, keep the best rows of the difficulty, read the top of
  // the board. Two requests with one token cannot both add a row: the second finds the id in `used`.
  const difficulty = payload.d;
  const done = await db.batch([
    db.prepare(SQL.pruneUsed).bind(now - RULES.tokenLife * 1000),
    db.prepare(SQL.addScore).bind(payload.id, difficulty, body.name, body.score, body.wpm, body.accuracy,
      body.rank, body.cleared ? 1 : 0, body.time, now),
    db.prepare(SQL.addUsed).bind(payload.id, now),
    db.prepare(SQL.total).bind(difficulty),
    db.prepare(SQL.place).bind(difficulty, body.score, now, payload.id),
    db.prepare(SQL.trim).bind(difficulty, RULES.keep),
    db.prepare(SQL.board).bind(difficulty, RULES.top)
  ]);
  if (done[1].results.length === 0) return fail('used');
  kept = null;
  accepted++;
  return reply(200, {
    ok: true,
    place: done[4].results[0].place,
    total: done[3].results[0].total,
    difficulty: difficulty,
    scores: done[6].results.map(entry)
  });
}

// GET /v1/scores
async function readBoards(url, env) {
  const db = databaseOf(env);
  const asked = url.searchParams.get('limit');
  let limit = RULES.boardDefault;
  if (asked !== null) {
    if (!/^[0-9]{1,2}$/.test(asked) || Number(asked) < 1 || Number(asked) > RULES.boardMax) return fail('bad_request');
    limit = Number(asked);
  }
  // The database is read once in RULES.boardAge seconds, always for the longest lists, and the answer
  // is cut to the limit asked for. (Requests that arrive while that read is under way make their own.)
  // The browser may keep the answer for what is left of the time, so a board on screen is never
  // further behind the database than RULES.boardAge.
  const now = clock(env);
  const life = RULES.boardAge * 1000;
  let use = kept;
  if (!use || use.db !== db || now < use.at || now - use.at >= life) {
    const before = accepted;
    const read = await db.batch(DIFFICULTIES.map(function (d) { return db.prepare(SQL.board).bind(d, RULES.boardMax); }));
    use = { db: db, at: now, lists: read.map(function (list) { return list.results.map(entry); }) };
    if (before === accepted) kept = use;
  }
  const boards = { ok: true };
  DIFFICULTIES.forEach(function (d, i) { boards[d] = use.lists[i].slice(0, limit); });
  return reply(200, boards, { 'cache-control': 'public, max-age=' + Math.floor((life - (now - use.at)) / 1000) });
}

// POST /v1/stats (section 10). Counts a run that started or ended in the totals of the day. Nothing
// about the player is kept: a start also counts the source once per day, through a hash that is made
// with the day, so that it cannot be matched with another day's, and is deleted when the day is over.
// The token only shows that the request comes from a game that asked for one; it is not used up.
async function recordStat(body, request, env) {
  const secret = secretOf(env);
  const db = databaseOf(env);
  const now = clock(env);
  if (!isRecord(body) || typeof body.token !== 'string' || (body.event !== 'start' && body.event !== 'end')) {
    return fail('bad_request');
  }
  const payload = await verifyToken(secret, body.token);
  if (!payload) return fail('bad_token');
  if (now - payload.t > RULES.tokenLife * 1000) return fail('expired');
  const day = new Date(now).toISOString().slice(0, 10);

  if (body.event === 'start') {
    const hash = await sourceHash(secret + day, request.headers.get('cf-connecting-ip'));
    const counted = await db.batch([
      db.prepare(SQL.pruneSeen).bind(day),
      db.prepare(SQL.addSeen).bind(day, hash),
      db.prepare(SQL.statStart).bind(day, payload.d)
    ]);
    if (counted[1].results.length > 0) await db.prepare(SQL.addPlayer).bind(day).run();
    return reply(200, { ok: true });
  }

  if (!whole(body.time, 0, RULES.maxTime) || typeof body.cleared !== 'boolean' || !whole(body.section, 0, 3)) {
    return fail('bad_request');
  }
  await db.prepare(SQL.statEnd).bind(day, payload.d, body.cleared ? 1 : 0, body.time,
    body.section === 0 ? 1 : 0, body.section === 1 ? 1 : 0, body.section === 2 ? 1 : 0, body.section === 3 ? 1 : 0).run();
  return reply(200, { ok: true });
}

// The hourly clean-up (section 4): what a submission would delete, done also when nobody submits, so
// that no hash of an address stays in the database for long on a quiet day.
async function cleanUp(env) {
  const db = databaseOf(env);
  const now = clock(env);
  await db.batch([
    db.prepare(SQL.pruneHits).bind(now - HOUR_MS),
    db.prepare(SQL.pruneUsed).bind(now - RULES.tokenLife * 1000),
    db.prepare(SQL.pruneSeen).bind(new Date(now).toISOString().slice(0, 10))
  ]);
}

// ---------------------------------------------------------------------------------------------
// 7. Routing, the fetch handler and the scheduled handler
// ---------------------------------------------------------------------------------------------

async function route(request, env) {
  if (request.method === 'OPTIONS') return preflight();
  const url = new URL(request.url);
  const path = url.pathname;
  if (path !== '/v1/runs' && path !== '/v1/scores' && path !== '/v1/stats') return fail('not_found');
  if (request.method === 'GET' && path === '/v1/scores') return readBoards(url, env);
  if (request.method !== 'POST') return fail('method', { allow: path === '/v1/scores' ? 'GET, POST, OPTIONS' : 'POST, OPTIONS' });
  // A POST from a browser page that is not the game is refused, and the body must be sent as JSON
  // (which also makes a browser ask first with a preflight). Both are decided before the body is read.
  const origin = request.headers.get('origin');
  if (origin !== null && !ORIGINS.includes(origin) && !LOCAL_ORIGIN.test(origin)) return fail('origin');
  if (!/^application\/json\s*(;|$)/i.test(request.headers.get('content-type') || '')) return fail('bad_request');
  const text = await readBody(request);
  if (text === null) return fail('too_large');
  const body = parseJson(text);
  if (path === '/v1/stats') return recordStat(body, request, env);
  return path === '/v1/runs' ? startRun(body, env) : submitScore(body, request, env);
}

export default {
  // Never throws to the runtime: anything unexpected is logged and answered with 500 "server".
  // The log line carries the error's message only: no request body, token, address or secret.
  async fetch(request, env, ctx) {
    try {
      return await route(request, env);
    } catch (e) {
      console.error('spell-runner-scores: ' + (e && e.message ? e.message : String(e)));
      return fail('server');
    }
  },

  // Run by the cron trigger of wrangler.toml. Never throws either: a failure is logged in the same way.
  async scheduled(controller, env, ctx) {
    try {
      await cleanUp(env);
    } catch (e) {
      console.error('spell-runner-scores: clean-up: ' + (e && e.message ? e.message : String(e)));
    }
  }
};
