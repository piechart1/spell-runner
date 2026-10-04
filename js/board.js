// js/board.js
// SPELL RUNNER world scores, the game side (lead). Defines TG.Board.
//
// Agreement with the service: docs/LEADERBOARD.md (section 9 is this module). Contract:
// docs/CONTRACT.md section 4.22 and rule 10 of section 2.2. Design: docs/DESIGN.md section 8.9.
//
// The service is a small Worker of our own (server/). This is the one file of the game that makes
// network requests, and it makes them only to TG.Board.URL:
//
//   POST <URL>/v1/runs      a run token, asked for when the player confirms a difficulty
//   POST <URL>/v1/scores    a finished run: the token, three initials, score, WPM, accuracy, rank,
//                           whether the level was cleared, and the run's length in seconds
//   GET  <URL>/v1/scores    the three boards
//   POST <URL>/v1/stats     a count of a run started or ended, for the owner's daily totals
//
// The game must work without the service. So:
//   - TG.Board.URL is the empty string until a service is deployed. With an empty URL the module is
//     off: no request is ever made and every function below does nothing.
//   - The setting worldScores (CONTRACT 5.12) turns the feature off for a player. With it off no
//     request is made.
//   - The module never touches the window. TG.Main hands it the network function and a clock through
//     init({ fetch, now }); without a fetch function the module is off.
//   - No function throws and none hands a promise to its caller. Results arrive in TG.Board.state,
//     which TG.UI reads each frame.
//   - Every request gives up after 6 s (TIMEOUT_MS). TG.Main calls update(dt) each frame, which is
//     where a request that has waited too long is given up. A reply that arrives after that, or after
//     a newer request of the same kind was made, is ignored.
//   - A reply that is not JSON, has the wrong shape or carries an error status counts as a failure.
//     For a score that was sent, state.sendError says which kind: the service could not be reached,
//     it refused the score, or it has had too many scores from this address in the last hour.
//   - What the service is certain to refuse is not sent: a run shorter than MIN_TIME is not offered
//     to the world scores, and a WPM above SEND_MAX_WPM is sent as SEND_MAX_WPM.
//   - Lists from the service are cleaned before they are kept, because the game draws them: names are
//     three letters A to Z, numbers are whole and within a range the screens have room for, and at
//     most 50 entries are kept per list.
//
// The run token is kept in memory only. A token belongs to one difficulty, is dropped when the player
// confirms another difficulty, and is used up by submit(). A continue and a restart from a checkpoint
// keep it, because they do not come through startRun().
//
// File layout:
//   1. limits and the block list
//   2. module state
//   3. small helpers and the cleaning of entries
//   4. requests
//   5. the public object
(function (root) {
  'use strict';
  var TG = root.TG = root.TG || {};

  // ---------------------------------------------------------------------------------------------
  // 1. Limits and the block list
  // ---------------------------------------------------------------------------------------------

  var NAMES = ['easy', 'medium', 'hard'];
  var RANKS = ['S', 'A', 'B', 'C'];

  var TIMEOUT_MS = 6000;          // a request is given up after this long
  var REFRESH_MS = 30000;         // refresh() asks the service at most this often, unless forced
  var KEEP_MS = 20000;            // after a score was sent, its board is the one from that reply for this
                                  // long: the service lets GET /v1/scores be cached for 15 s, so a copy
                                  // read in that time may not hold the new score yet
  var MAX_ENTRIES = 50;           // entries kept per list
  var MAX_SCAN = 500;             // entries of a list that are looked at
  var MAX_SCORE = 9999999;        // seven digits, as the score tables show them
  var MAX_WPM = 999;
  var MAX_COUNT = 999999;         // the largest place or total that is believed
  var TOKEN_LIFE = 10800;         // s, used when the service does not say (LEADERBOARD 3.1)
  var TOKEN_MARGIN = 60;          // s before its end at which a token is no longer used

  // Limits of the service that the game follows, so that a run it would certainly refuse is not sent
  // (LEADERBOARD 4 and 5). They are copies: when the service changes one, change it here too.
  var MIN_TIME = 10;              // s. A shorter run is refused (check 7), so it is not offered to the world scores
  var SEND_MAX_WPM = 220;         // the highest WPM the service accepts (check 6). The game measures the speed
                                  // inside words, which can be higher for a fast typist; a higher figure is sent
                                  // as this one. WPM plays no part in the order of a board
  var KEPT_ROWS = 200;            // rows the service keeps per board (section 4). A run below them is answered
                                  // with a place one past the last row and is not kept (3.2)

  // Why a send failed (state.sendError), from the status of the reply (LEADERBOARD 6).
  var REFUSED_STATUS = [400, 409, 413];   // the service read the score and did not take it
  var BUSY_STATUS = 429;                  // the hourly limit of the address the score came from

  // Initials the world scores refuse. This is a copy of the array in server/src/blocklist.js, which
  // says what the list is for; test/test-board.js checks that the two are equal, so change both
  // together.
  var BLOCKLIST = [
    'ABO', 'ANL', 'ANS', 'ANU', 'ARS', 'ASS', 'AZZ',
    'BBS', 'BCH', 'BJS', 'BNR', 'BTT', 'BUM',
    'CHK', 'CLT', 'CNT', 'COC', 'COK', 'COX', 'CUK', 'CUM', 'CUN',
    'DCK', 'DIC', 'DIE', 'DIK', 'DIQ', 'DIX', 'DTF', 'DYK',
    'FAG', 'FAP', 'FCK', 'FFS', 'FGT', 'FKK', 'FKN', 'FKR', 'FKU', 'FUC', 'FUK', 'FUQ', 'FUX', 'FVK', 'FXK',
    'GAY', 'GFY', 'GOK', 'GTF', 'GUK', 'GYP',
    'HMO', 'HOE', 'HOM', 'HOR', 'HRN', 'HTL',
    'JAP', 'JEW', 'JIZ', 'JZZ',
    'KIK', 'KIL', 'KKK', 'KLN', 'KMS', 'KNB', 'KNT', 'KOK', 'KOX', 'KUK', 'KUM', 'KYK', 'KYS',
    'LEZ',
    'MFK', 'MFR', 'MLF', 'MNG',
    'NAZ', 'NGA', 'NGG', 'NGR', 'NIG', 'NIP', 'NOB', 'NUD', 'NYG', 'NZI',
    'PAK', 'PDO', 'PED', 'PEE', 'PHK', 'PHU', 'PIS', 'PKI', 'PNS', 'POF', 'POO', 'PRK', 'PRN', 'PSS', 'PSY', 'PUS',
    'QER',
    'RPE', 'RTD',
    'SEX', 'SHI', 'SHT', 'SLG', 'SLT', 'SLU', 'SPC', 'SPK', 'SPM', 'SPZ', 'STF', 'SUC', 'SUK', 'SUX', 'SXY',
    'THT', 'TIT', 'TRD', 'TRN', 'TTS', 'TWA', 'TWT',
    'VAG', 'VAJ',
    'WAN', 'WHR', 'WNK', 'WOG', 'WOP', 'WTF',
    'XXX',
    'YID'
  ];

  // ---------------------------------------------------------------------------------------------
  // 2. Module state
  // ---------------------------------------------------------------------------------------------

  // What TG.Main handed over through init: the browser's network function (or null) and a clock that
  // returns ms (or null). net.fetch is called in one place, request(), and nowhere else in the game.
  var net = { fetch: null, now: null };
  var ticks = 0;                  // ms counted by update(dt); the clock when init gave none
  var token = null;               // { value, difficulty, at, life }: the run token that is held
  var pending = { token: null, send: null, boards: null, stat: null };   // the request in flight of each kind
  var askedAt = null;             // when the boards were last asked for
  var sentAt = null;              // when the last score was accepted
  var warned = {};

  // What the interface reads (LEADERBOARD 9). The object stays the same one; its fields change.
  var state = {
    boards: 'off',                // 'off' | 'idle' | 'loading' | 'ready' | 'failed'
    lists: { easy: [], medium: [], hard: [] },
    send: 'none',                 // 'none' | 'sending' | 'sent' | 'failed': the last submission
    sendError: null,              // while send is 'failed': 'unreachable' | 'refused' | 'busy'. Otherwise null
    place: 0,
    total: 0,
    kept: true,                   // while send is 'sent': false when the run is below the rows the service keeps
    sentDifficulty: null,
    sentEntry: null               // the entry that was sent, for highlighting it in a list
  };

  // ---------------------------------------------------------------------------------------------
  // 3. Small helpers and the cleaning of entries
  // ---------------------------------------------------------------------------------------------

  function report(where, err) {
    if (warned[where]) return;
    warned[where] = true;
    if (typeof console !== 'undefined' && console && typeof console.error === 'function') {
      console.error('TG.Board: ' + where + ' failed', err);
    }
  }

  function isNumber(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function isRecord(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
  }

  // A whole number from min to max; anything that is not a number gives min.
  function whole(v, min, max) {
    if (!isNumber(v)) return min;
    var n = Math.floor(v);
    return n < min ? min : (n > max ? max : n);
  }

  function isCount(v) {
    return isNumber(v) && Math.floor(v) === v && v >= 1 && v <= MAX_COUNT;
  }

  // ms. The clock of init when there is one, otherwise the time counted by update(dt).
  function clock() {
    if (net.now) {
      try {
        var t = net.now();
        if (isNumber(t)) return t;
      } catch (e) { /* the counted time is used */ }
    }
    return ticks;
  }

  function baseUrl() {
    var u = TG.Board ? TG.Board.URL : '';
    return typeof u === 'string' ? u.replace(/\/+$/, '') : '';
  }

  function settingOn() {
    try {
      if (TG.Save && typeof TG.Save.getSetting === 'function') return TG.Save.getSetting('worldScores') !== false;
    } catch (e) { /* the default is used */ }
    return true;
  }

  // A service address is set and there is a network function: the Options line is shown.
  function available() {
    return baseUrl() !== '' && typeof net.fetch === 'function';
  }

  function enabled() {
    return available() && settingOn();
  }

  function isBlocked(name) {
    return typeof name === 'string' && BLOCKLIST.indexOf(name.toUpperCase()) !== -1;
  }

  // An entry as the game draws it (CONTRACT 5.12), or null for something that is not an entry: no
  // name with three letters in it, or no score.
  function cleanEntry(e) {
    if (!isRecord(e) || typeof e.name !== 'string' || !isNumber(e.score)) return null;
    var name = e.name.slice(0, 64).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    if (name.length !== 3) return null;
    return {
      name: name,
      score: whole(e.score, 0, MAX_SCORE),
      wpm: whole(e.wpm, 0, MAX_WPM),
      accuracy: whole(e.accuracy, 0, 100),
      rank: RANKS.indexOf(e.rank) !== -1 ? e.rank : 'C',
      cleared: e.cleared === true,
      date: typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : ''
    };
  }

  function cleanList(raw) {
    var out = [];
    if (!Array.isArray(raw)) return out;
    var n = Math.min(raw.length, MAX_SCAN);
    for (var i = 0; i < n && out.length < MAX_ENTRIES; i++) {
      var e = cleanEntry(raw[i]);
      if (e) out.push(e);
    }
    return out;
  }

  // The token for a difficulty (any difficulty when none is given), or null. A token near the end of
  // its life is dropped here, so that it is never sent.
  function tokenFor(difficulty) {
    if (!token) return null;
    if (clock() - token.at >= (token.life - TOKEN_MARGIN) * 1000) {
      token = null;
      return null;
    }
    if (difficulty !== undefined && difficulty !== null && token.difficulty !== difficulty) return null;
    return token;
  }

  function reset() {
    token = null;
    pending.token = null;
    pending.send = null;
    pending.boards = null;
    pending.stat = null;
    askedAt = null;
    sentAt = null;
    state.boards = 'off';
    state.lists = { easy: [], medium: [], hard: [] };
    state.send = 'none';
    state.sendError = null;
    state.place = 0;
    state.total = 0;
    state.kept = true;
    state.sentDifficulty = null;
    state.sentEntry = null;
  }

  // Keeps the state in step with enabled(). When the feature is off, everything is dropped: the token,
  // the lists and the requests in flight, whose replies are then ignored. Returns enabled().
  function sync() {
    if (enabled()) {
      if (state.boards === 'off') state.boards = 'idle';
      return true;
    }
    if (state.boards !== 'off' || state.send !== 'none' || token || pending.token || pending.send || pending.boards) reset();
    return false;
  }

  // ---------------------------------------------------------------------------------------------
  // 4. Requests
  // ---------------------------------------------------------------------------------------------

  // Ends a request: done(ok, data, why) with data the parsed reply when ok, and otherwise why it
  // failed: 'unreachable' | 'refused' | 'busy'. Does nothing for a request that was given up or
  // replaced.
  function finish(kind, req, ok, data, why) {
    if (pending[kind] !== req) return;
    pending[kind] = null;
    try {
      if (ok === true) req.done(true, data, null);
      else req.done(false, null, why === 'refused' || why === 'busy' ? why : 'unreachable');
    } catch (e) {
      report(kind + ' reply', e);
    }
  }

  // What an error status says. Only a status of the service's own refusals counts as one; anything
  // else (a server error, a page that is not the service) is a service that cannot be reached.
  function reasonFor(status) {
    if (status === BUSY_STATUS) return 'busy';
    return REFUSED_STATUS.indexOf(status) !== -1 ? 'refused' : 'unreachable';
  }

  // Starts a request of a kind ('token' | 'send' | 'boards' | 'stat'), replacing one of the same kind that is
  // still in flight. body: an object sent as JSON, or null. The reply counts only if its status is
  // 2xx and its body is a JSON object with ok === true.
  function request(kind, method, path, body, done) {
    var req = { at: clock(), done: done };
    pending[kind] = req;
    var fail = function () { finish(kind, req, false, null, 'unreachable'); };
    try {
      var options = { method: method, mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' };
      if (body) {
        options.headers = { 'content-type': 'application/json' };
        options.body = JSON.stringify(body);
      }
      var reply = net.fetch(baseUrl() + path, options);
      if (!reply || typeof reply.then !== 'function') {
        fail();
        return;
      }
      reply.then(function (res) {
        try {
          if (!res || !isNumber(res.status) || res.status < 200 || res.status >= 300) {
            finish(kind, req, false, null, res && isNumber(res.status) ? reasonFor(res.status) : 'unreachable');
            return;
          }
          if (typeof res.text !== 'function') {
            fail();
            return;
          }
          var reading = res.text();
          if (!reading || typeof reading.then !== 'function') {
            fail();
            return;
          }
          reading.then(function (text) {
            var data = null;
            try {
              data = typeof text === 'string' ? JSON.parse(text) : null;
            } catch (e) {
              data = null;
            }
            if (isRecord(data) && data.ok === true) finish(kind, req, true, data);
            else fail();
          }, fail);
        } catch (e) {
          fail();
        }
      }, fail);
    } catch (e) {
      fail();
    }
  }

  // update(): a request that has waited TIMEOUT_MS is given up, which counts as a failure.
  function giveUpLate() {
    var t = clock();
    for (var kind in pending) {
      var req = pending[kind];
      if (!req) continue;
      if (t < req.at) req.at = t;                // the clock was set back: the wait starts again
      else if (t - req.at >= TIMEOUT_MS) finish(kind, req, false, null, 'unreachable');
    }
  }

  function askToken(difficulty) {
    if (token && token.difficulty !== difficulty) token = null;
    request('token', 'POST', '/v1/runs', { difficulty: difficulty }, function (ok, data) {
      // A failed request leaves things as they were: a token for the same difficulty stays in use.
      if (!ok || typeof data.token !== 'string' || !/^[A-Za-z0-9._-]{1,400}$/.test(data.token)) return;
      var life = isNumber(data.expires) ? whole(data.expires, 0, 86400) : TOKEN_LIFE;
      token = { value: data.token, difficulty: difficulty, at: clock(), life: life };
    });
  }

  function sendScore(held, entry, time) {
    token = null;                                // a token works once
    if (entry.wpm > SEND_MAX_WPM) entry.wpm = SEND_MAX_WPM;   // entry is this module's own copy
    state.send = 'sending';
    state.sendError = null;
    state.place = 0;
    state.total = 0;
    state.kept = true;
    state.sentDifficulty = held.difficulty;
    state.sentEntry = entry;
    var body = {
      token: held.value, name: entry.name, score: entry.score, wpm: entry.wpm, accuracy: entry.accuracy,
      rank: entry.rank, cleared: entry.cleared, time: time
    };
    request('send', 'POST', '/v1/scores', body, function (ok, data, why) {
      if (!ok) {
        state.send = 'failed';
        state.sendError = why;
        return;
      }
      if (!isCount(data.place) || !isCount(data.total) || data.place > data.total ||
          data.difficulty !== held.difficulty || !Array.isArray(data.scores)) {
        state.send = 'failed';                   // an answer that cannot be read is no answer
        state.sendError = 'unreachable';
        return;
      }
      // The board shown after a send is the one in the reply.
      state.lists[held.difficulty] = cleanList(data.scores);
      state.place = data.place;
      state.total = data.total;
      state.kept = data.place <= KEPT_ROWS;
      state.send = 'sent';
      sentAt = clock();
    });
  }

  function loadBoards() {
    askedAt = clock();
    if (state.boards !== 'ready') state.boards = 'loading';   // lists that are known stay on screen meanwhile
    request('boards', 'GET', '/v1/scores', null, function (ok, data) {
      if (!ok || !Array.isArray(data.easy) || !Array.isArray(data.medium) || !Array.isArray(data.hard)) {
        state.boards = 'failed';
        return;
      }
      var age = sentAt === null ? KEEP_MS : clock() - sentAt;
      var keep = state.send === 'sent' && age >= 0 && age < KEEP_MS ? state.sentDifficulty : null;
      for (var i = 0; i < NAMES.length; i++) {
        if (NAMES[i] !== keep) state.lists[NAMES[i]] = cleanList(data[NAMES[i]]);
      }
      state.boards = 'ready';
    });
  }

  // ---------------------------------------------------------------------------------------------
  // 5. Public object
  // ---------------------------------------------------------------------------------------------

  TG.Board = {
    // The base address of the service, without a slash at the end. The empty string switches world
    // scores off completely: no request is ever made and the game behaves as it did without them.
    // This is the only remote address in the game (test/test-integration.js checks that).
    URL: 'https://spell-runner-scores.david-slee.workers.dev',

    TIMEOUT_MS: TIMEOUT_MS,
    REFRESH_MS: REFRESH_MS,
    MIN_TIME: MIN_TIME,
    SEND_MAX_WPM: SEND_MAX_WPM,
    KEPT_ROWS: KEPT_ROWS,
    BLOCKLIST: Object.freeze(BLOCKLIST.slice()),

    state: state,

    // Called by TG.Main: { fetch: window.fetch bound to the window, or null; now: a function that
    // returns ms }. Drops the token, the lists and every request in flight.
    init: function (options) {
      try {
        var o = options || {};
        net.fetch = typeof o.fetch === 'function' ? o.fetch : null;
        net.now = typeof o.now === 'function' ? o.now : null;
        ticks = 0;
        reset();
        sync();
      } catch (e) {
        report('init', e);
      }
    },

    // Called by TG.Main once per frame. Gives up requests that have waited TIMEOUT_MS, and follows
    // the worldScores setting.
    update: function (dt) {
      try {
        if (isNumber(dt) && dt > 0) ticks += dt * 1000;
        if (sync()) giveUpLate();
      } catch (e) {
        report('update', e);
      }
    },

    // A service address is set and the browser can make requests. TG.UI shows the WORLD SCORES line
    // of the Options panel only then.
    available: function () {
      try {
        return available();
      } catch (e) {
        return false;
      }
    },

    // available() and the worldScores setting is on.
    enabled: function () {
      try {
        return sync();
      } catch (e) {
        return false;
      }
    },

    // Asks for a run token. TG.UI calls it when the player confirms a difficulty, so the token has
    // normally arrived before the run starts; not on a continue or a restart from a checkpoint.
    startRun: function (difficulty) {
      try {
        if (NAMES.indexOf(difficulty) === -1 || !sync()) return;
        askToken(difficulty);
      } catch (e) {
        report('startRun', e);
      }
    },

    // Counts a run for the owner's daily totals (LEADERBOARD 10). event: 'start' when a run starts from
    // the menus, 'end' when it reaches the results screen, with info { time, cleared, section }.
    // Nothing about the player is sent: the request carries the run token and, for 'end', those three
    // values. Does nothing when world scores are off or no token is held; the reply is not used.
    stat: function (event, info) {
      try {
        if ((event !== 'start' && event !== 'end') || !sync()) return;
        var held = tokenFor();
        if (!held) return;
        var body = { token: held.value, event: event };
        if (event === 'end') {
          var i = isRecord(info) ? info : {};
          body.time = whole(i.time, 0, 10800);
          body.cleared = i.cleared === true;
          body.section = whole(i.section, 0, 3);
        }
        request('stat', 'POST', '/v1/stats', body, function () {});
      } catch (e) {
        report('stat', e);
      }
    },

    // A token for a run of this difficulty (of any difficulty when none is given) is held.
    hasToken: function (difficulty) {
      try {
        return sync() && tokenFor(difficulty) !== null;
      } catch (e) {
        return false;
      }
    },

    // Sends a finished run. entry: the high score entry (CONTRACT 5.12). result: state.result, for its
    // difficulty and its time. Does nothing without a token for that difficulty, with initials on the
    // block list, or for a run shorter than MIN_TIME (TG.UI does not offer such a run).
    submit: function (entry, result) {
      try {
        if (!sync() || !isRecord(result) || NAMES.indexOf(result.difficulty) === -1) return;
        var time = whole(result.time, 0, 86400);
        if (time < MIN_TIME) return;
        var held = tokenFor(result.difficulty);
        var clean = cleanEntry(entry);
        if (!held || !clean || isBlocked(clean.name)) return;
        sendScore(held, clean, time);
      } catch (e) {
        report('submit', e);
      }
    },

    // Loads the three boards. Asks the service at most once every REFRESH_MS, unless force is true,
    // and never while a load is in flight.
    refresh: function (force) {
      try {
        if (!sync() || pending.boards) return;
        var age = askedAt === null ? REFRESH_MS : clock() - askedAt;
        if (force !== true && age >= 0 && age < REFRESH_MS) return;
        loadBoards();
      } catch (e) {
        report('refresh', e);
      }
    },

    // The initials are on the block list. Works whether world scores are on or off.
    blocked: function (name) {
      return isBlocked(name);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
