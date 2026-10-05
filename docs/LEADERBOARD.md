# SPELL RUNNER: World Scores

A shared leaderboard for the game. The game is static files on GitHub Pages, so the scores live in a small service of our own: a Cloudflare Worker with a D1 (SQLite) database. This document is the agreement between the two halves: the Worker under `server/` and the game-side module `js/board.js`.

The game must keep working without the service. If the Worker cannot be reached, is switched off, or refuses a score, the game carries on with the local scores it already keeps in the browser.

## 1. What is stored

One row per submitted run: three initials, difficulty, score, WPM, accuracy, rank, whether the level was cleared, the run's length in seconds, and the time it was submitted. No account, no email, no free text.

The player's network address is never stored. A salted hash of it is kept in a separate table, only to limit how often one source can submit. For an IPv6 address the hash is of the first 64 bits, which is the part one connection is given, and not of the whole address (section 4). A hash counts for one hour. It is deleted by the next score submitted after that, or by a clean-up that the service runs once an hour, whichever comes first, so no hash is kept for more than about two hours.

While a hash is kept, its row carries the same time as the score that came with it. Somebody who can read the database (only the owner can) could therefore tell which scores of the last hour or two came from the same source, though not from which address.

The id of every token that was used is kept for three hours in a third table, so that the token cannot be used again (section 4). It is a random number and says nothing about the player.

## 2. Limits of the design

The game runs in the player's browser, so a determined person can send a score they did not earn. The service makes that slower and bounded rather than impossible:

- every submission needs a run token that the service issued when the run started, and the token must be at least as old as the run it reports;
- a token works once, whether or not its score is kept, and also after the owner has deleted its score;
- the numbers must be possible for the difficulty and must agree with each other (section 5);
- one source can submit 60 scores per hour. A source is one IPv4 address, or the 64-bit prefix of an IPv6 address;
- a `POST` from a web page on another site is refused (section 3);
- the owner can delete rows (section 8).

What these do not do:

- Tokens cost nothing and do not depend on each other. Somebody who asks for 60 tokens at the same moment waits once, not 60 times. The waiting time slows down one made-up score; it does not slow down a batch of them.
- No check can tell a made-up score that stays inside the limits from a real one. Such a score is accepted and can take first place. The caps of section 5 are less than 30% above the best score the game was seen to give, so a made-up score cannot be far above a real one, and a rank that does not fit the accuracy is refused.
- The hourly limit counts sources. Somebody with many addresses (an IPv6 range larger than a /64, a VPN, several machines) has that many times the limit.
- Asking for tokens and reading the boards are not limited. Neither writes to the database, and the boards are read from the database about once in 15 seconds by each running copy of the Worker, not for every request (3.3). But every request counts towards the daily allowance of Cloudflare's free plan, and one person can use that up. The result is no world scores until 00:00 UTC and no charge; the game uses its local scores meanwhile.
- The block list looks at one set of initials at a time (section 7).

## 3. Service API

Base URL: the Worker's address, for example `https://spell-runner-scores.<subdomain>.workers.dev`. All paths start with `/v1`. All bodies are JSON in UTF-8. Every response carries `Access-Control-Allow-Origin: *`, and `OPTIONS` on any path answers a CORS preflight for `GET, POST` with the header `content-type`. Unknown paths give `404`. A known path with a method it does not have gives `405`. For a `POST`, three more things are decided before the body is read as JSON, in this order:

1. If the request has an `Origin` header (a browser sends one), it must be one of the game's addresses, `https://piechart1.github.io` or `https://html-classic.itch.zone` (where itch.io serves every browser game from; that address is shared by all games there, so for it the rule only keeps out ordinary websites), or a local address for development (`http://localhost`, `http://127.0.0.1` or `http://[::1]`, with any port). Any other value gives `403` `origin`. This stops a page on another site from sending scores through its visitors' browsers. A copy of the game opened from a file on disk has the origin `null` and is refused too: it can show the world boards but not add to them. A program that is not a browser can leave the header out or set any value, so this closes the browser route only. The list is `ORIGINS` in `server/src/worker.js`.
2. The `Content-Type` must be `application/json` (a `charset` may follow). Anything else gives `400` `bad_request`, and the body is not read.
3. A request body over 2,000 bytes gives `413` without being parsed.

`GET` is open to every origin, so the boards can be read from anywhere.

Errors have the shape `{ "ok": false, "error": "<code>" }` with a 4xx or 5xx status. Codes are listed in section 6.

### 3.1 `POST /v1/runs` — start a run

Request: `{ "difficulty": "easy" | "medium" | "hard" }`

Response `200`: `{ "ok": true, "token": "<string>", "expires": 10800 }`

The token is `base64url(payload) + "." + base64url(HMAC-SHA256(TOKEN_SECRET, base64url(payload)))`, where `payload` is the JSON text `{ "id": "<32 hex characters, random>", "d": "<difficulty>", "t": <issue time, ms since epoch> }`. Issuing a token writes nothing to the database. `expires` is the token's life in seconds (3 hours).

### 3.2 `POST /v1/scores` — submit a finished run

Request:

```json
{
  "token": "<from 3.1>",
  "name": "DAV",
  "score": 102120,
  "wpm": 27,
  "accuracy": 100,
  "rank": "S",
  "cleared": true,
  "time": 317
}
```

`wpm` and `accuracy` are whole numbers as the game's high score entry has them (`accuracy` is a whole percent). `time` is the run's length in seconds (the game's `result.time`, rounded down). The difficulty comes from the token, not from the request.

Response `200`:

```json
{ "ok": true, "place": 12, "total": 87, "difficulty": "medium", "scores": [ /* the top 10 for that difficulty, as in 3.3 */ ] }
```

`place` is the 1-based position of this run among all stored runs of its difficulty (ordered by score, highest first; equal scores in order of submission). `total` is the number of stored runs for the difficulty after this one was added. Both are worked out before the board is cut back to its best 200 rows (section 4), so a run that is not among the best 200 is answered with place 201 of 201 and is then not kept. Its token is used up all the same.

### 3.3 `GET /v1/scores` — read the boards

Optional query: `limit` (1 to 50, default 10). A `limit` that is not a whole number from 1 to 50 gives `400` `bad_request`.

Response `200`:

```json
{
  "ok": true,
  "easy":   [ { "name": "PIP", "score": 16000, "wpm": 18, "accuracy": 96, "rank": "A", "cleared": true, "date": "2026-10-03" } ],
  "medium": [ ],
  "hard":   [ ]
}
```

Each list is ordered by score, highest first, then by submission time, earliest first. `date` is the UTC date of submission. The entry has the same fields as the game's local high score entry (CONTRACT 5.12), so the game draws both with the same code.

The service does not read the database for every request. Each running copy of the Worker keeps the boards it last read in memory and reads them again once they are 15 seconds old, so the database work does not grow with the number of requests. (Requests that arrive in the moment such a read is under way make their own.) A copy that accepts a score drops what it has kept, so its next answer includes that score. The response carries `Cache-Control: public, max-age=N`, where `N` is the number of whole seconds that are left of those 15 (15 for boards read just now, down to 0). A browser's copy is therefore never more than 15 seconds behind the database either. After the owner deletes a row (section 8) it can take that long until every answer is without it.

## 4. Database

```sql
CREATE TABLE IF NOT EXISTS scores (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      TEXT    NOT NULL UNIQUE,   -- the token's id
  difficulty  TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  score       INTEGER NOT NULL,
  wpm         INTEGER NOT NULL,
  accuracy    INTEGER NOT NULL,
  rank        TEXT    NOT NULL,
  cleared     INTEGER NOT NULL,
  time_s      INTEGER NOT NULL,
  created_at  INTEGER NOT NULL           -- ms since epoch
);
CREATE INDEX IF NOT EXISTS scores_board ON scores (difficulty, score DESC, created_at ASC);

CREATE TABLE IF NOT EXISTS hits (
  ip_hash TEXT    NOT NULL,              -- hex SHA-256 of TOKEN_SECRET + source, first 32 characters
  at      INTEGER NOT NULL               -- ms since epoch
);
CREATE INDEX IF NOT EXISTS hits_ip ON hits (ip_hash, at);
CREATE INDEX IF NOT EXISTS hits_at ON hits (at);   -- for deleting the rows older than an hour

CREATE TABLE IF NOT EXISTS used (
  run_id TEXT    NOT NULL PRIMARY KEY,   -- the id of a token that has been used; makes a token single-use
  at     INTEGER NOT NULL                -- ms since epoch
);
CREATE INDEX IF NOT EXISTS used_at ON used (at);   -- for deleting the rows older than a token's life

-- Counters (docs/LEADERBOARD.md, section 10): totals only, nothing about a player.
CREATE TABLE IF NOT EXISTS stats (
  day        TEXT    NOT NULL,           -- UTC date, YYYY-MM-DD
  difficulty TEXT    NOT NULL,
  starts     INTEGER NOT NULL DEFAULT 0, -- runs started
  finishes   INTEGER NOT NULL DEFAULT 0, -- runs that reached the results screen
  cleared    INTEGER NOT NULL DEFAULT 0, -- of those, runs that beat the level
  time_s     INTEGER NOT NULL DEFAULT 0, -- seconds played in the finished runs
  reach0     INTEGER NOT NULL DEFAULT 0, -- finished runs that ended in section 1
  reach1     INTEGER NOT NULL DEFAULT 0, -- ... in section 2
  reach2     INTEGER NOT NULL DEFAULT 0, -- ... in section 3
  reach3     INTEGER NOT NULL DEFAULT 0, -- ... at the boss
  PRIMARY KEY (day, difficulty)
);

CREATE TABLE IF NOT EXISTS days (
  day     TEXT    NOT NULL PRIMARY KEY,
  players INTEGER NOT NULL DEFAULT 0     -- sources that started at least one run that day
);

CREATE TABLE IF NOT EXISTS seen (
  day  TEXT NOT NULL,
  hash TEXT NOT NULL,                    -- hex SHA-256 of TOKEN_SECRET + day + source; deleted when the day is over
  PRIMARY KEY (day, hash)
);
```

`scores`: after each accepted score the service keeps only the best 200 rows per difficulty.

`hits`: one row per counted submission (section 5, check 12). The source is taken from the `CF-Connecting-IP` header, which Cloudflare sets. For an IPv4 address the source is the address. For an IPv6 address it is the first 64 bits, written as the first four groups in lower case without leading zeros and followed by `::/64` (`2001:db8:1234:5678::/64`), because one connection is usually given all the addresses that share those bits. An IPv4 address written as IPv6 (`::ffff:192.0.2.1`) counts as the IPv4 address. Rows older than one hour are deleted before each submission is counted.

`used`: one row per token that was accepted, written in the same transaction as its score. A score is added only if its token's id is not in this table. The row stays when the score is trimmed from the board or deleted by the owner, and is deleted once it is older than a token's life (3 hours), after which the token is refused as expired anyway.

The Worker also has a scheduled handler, run once an hour by a cron trigger in `server/wrangler.toml`. It deletes the same rows of `hits` and `used` that a submission would, so that they do not stay in the database when nobody submits.

Each statement finds its rows through an index, so the work of a request does not grow with the size of `hits` or `used`. A submission that is refused as `used` or by the hourly limit runs three statements; an accepted one runs ten.

## 5. Checks on a submitted score

Applied in this order; the first that fails decides the error code.

| # | Check | Error |
|---|---|---|
| 1 | The body is JSON with the fields of 3.2 and the right types | `bad_request` |
| 2 | The token has a valid signature, a known difficulty and a 32-hex id | `bad_token` |
| 3 | The token is not older than 3 hours | `expired` |
| 4 | `name` is three letters A to Z and is not on the block list (section 7) | `name` |
| 5 | `score` is a whole number from 1 to the cap for the difficulty | `implausible` |
| 6 | `wpm` is a whole number from 0 to 220; `accuracy` from 0 to 100; `rank` is S, A, B or C; `cleared` is a boolean | `bad_request` |
| 7 | `time` is a whole number from 10 to 10,800 | `implausible` |
| 8 | If `cleared`, `time` is at least the shortest possible cleared run for the difficulty | `implausible` |
| 9 | `rank` is one the game gives for that `accuracy` and `cleared`: S needs a cleared run and an accuracy of at least 97, A needs a cleared run and an accuracy of at least 93, B needs an accuracy of at least 85 | `implausible` |
| 10 | `score` is at most `2000 + time x rate` for the difficulty | `implausible` |
| 11 | The token's age is at least `time - 5` seconds (the run cannot be longer than the time since it started) | `too_soon` |
| 12 | The source has made fewer than 60 accepted or refused submissions in the last hour | `rate` (status 429) |
| 13 | The token's id has not been used | `used` (status 409) |

Checks 1 to 11 use no database. A submission is counted for check 12 once it has passed checks 1 to 11, whether it is then accepted or refused as `used`. A submission refused by checks 1 to 11, or by the limit itself, is not counted, writes nothing and does not use up its token. Each counted submission stops counting one hour after it was made.

Check 9 follows the game's rank rule (`rankOf` in `js/game.js`): the game gives S and A only for a cleared run with an accuracy of at least 97% and 93%, and B only from 85%. The rule has further conditions that the service cannot see (lives lost, continues), so a rank lower than the accuracy would allow is accepted.

A token is used up by the submission that is accepted with it (check 13). That holds when the run is not among the best 200 and is not kept, and when the owner later deletes the row: the same token is refused as `used` until it is three hours old, and as `expired` after that.

Limits per difficulty. They come from the game. In 360 runs of the headless bot per difficulty (60 seeds each at 60, 90, 150, 220, 400 and 1,000 WPM, with perfect accuracy) the highest scores were 62,480 / 108,160 / 173,530, with the end-of-level bonuses (at most 14,000) included, and the shortest cleared runs took 339 / 277 / 241 seconds. Typing faster does not raise the score and shortens the run by only a few seconds. (The two fastest speeds are above the 220 WPM that check 6 accepts. They are there for the length of their runs.) Each cap is 27% to 29% above the highest score seen, and each shortest cleared run is about 11% below the shortest seen.

| | Easy | Medium | Hard |
|---|---|---|---|
| Score cap | 80000 | 140000 | 220000 |
| Shortest cleared run (s) | 300 | 245 | 215 |
| Rate (points per second) | 400 | 700 | 1100 |

`test/test-server.js` checks these against the real game: results from the headless bot (`test/sim.js`) on every difficulty must pass with room to spare (a run may use at most 80% of a cap, and a cleared run must still pass if it were 10% shorter). The runs include the ones that gave the figures above, runs that the game ranks S, A, B and C, a run with continues, and a run that ends in a game over. A change to the game's scoring or rank rule that outgrows a limit is caught there.

## 6. Error codes

`bad_request` (400), `bad_token` (400), `expired` (400), `name` (400), `implausible` (400), `too_soon` (400), `used` (409), `too_large` (413), `rate` (429), `not_found` (404), `method` (405), `origin` (403), `server` (500).

## 7. Initials

Three letters, A to Z. A short block list of rude three-letter combinations is kept in one place, `server/src/blocklist.js`, as a plain array (an ES module that exports it as `BLOCKLIST` and as its default), and the same list is used by the game (`js/board.js` carries a copy; a test checks the two are equal). The game refuses a blocked set of initials on the entry screen and asks for others, so the service's check is a second line.

The list looks at one set of initials. Somebody who sends several scores chooses each score and so the order of the rows, and can spell a longer word over neighbouring rows, three letters to a row or one letter down the first column. The list cannot prevent that. Such rows arrive together, and the owner removes them by the time they were submitted (section 8).

## 8. Looking after the board

Run from the `server/` folder, with Wrangler signed in:

```bash
npx wrangler d1 execute spell-runner-scores --remote --command "SELECT id, difficulty, name, score, wpm, time_s, datetime(created_at/1000,'unixepoch') FROM scores ORDER BY created_at DESC LIMIT 20"
npx wrangler d1 execute spell-runner-scores --remote --command "DELETE FROM scores WHERE id = 123"
npx wrangler d1 execute spell-runner-scores --remote --command "DELETE FROM scores WHERE created_at BETWEEN strftime('%s', '2026-10-03 18:00:00') * 1000 AND strftime('%s', '2026-10-03 18:10:00') * 1000"
```

The third command removes everything that was submitted in a stretch of time (the times are UTC), which is the quickest way to clear a batch of made-up scores.

A deleted row is gone from the database at once and from every answer of the service within 15 seconds (3.3). The token it was sent with stays used, so the same request cannot simply be sent again; a new score needs a new token and its waiting time.

## 9. The game side (`js/board.js`, `TG.Board`)

This section gives the outline. The full interface of `TG.Board` as built, including `update(dt)`, `available()`, `hasToken(difficulty)`, `state.sendError`, `state.kept` and the constants `MIN_TIME`, `SEND_MAX_WPM` and `KEPT_ROWS`, is in CONTRACT 4.22. `test/test-board.js` checks that those three constants equal the service's `RULES`, and that the block lists are equal.

The game reads the reason for a failed send from the HTTP status alone: 400, 409 and 413 mean the service refused the score, 429 means the hourly limit, and anything else means the service was not reached. A change to the statuses of section 6 therefore needs a change in `js/board.js`.

After an accepted send the game shows the list from the service's reply for 20 seconds, because `GET /v1/scores` may be up to 15 seconds behind.

- `TG.Board.URL` holds the Worker's base URL. An empty string switches world scores off completely: no request is ever made and the game behaves as it did before.
- `TG.Main` gives the module its network function: `TG.Board.init({ fetch: window.fetch bound to window, now: function returning ms })`. Nothing else in the game makes a network request, and the module makes requests only to `TG.Board.URL`.
- Every request has a timeout of 6 seconds. No function of `TG.Board` throws or returns a promise to its caller; results arrive in `TG.Board.state`, which the interface reads each frame.
- The setting `worldScores` (default `true`) turns the feature off for a player. With it off, no request is made.

```js
TG.Board.enabled() -> boolean            // URL set, fetch available, setting on
TG.Board.startRun(difficulty) -> void    // asks for a run token; called when the player confirms a difficulty (on entering How to Play), so the
                                         // token has normally arrived before the run starts. Not called on a continue or a restart from a checkpoint
TG.Board.submit(entry, result) -> void   // entry: the high score entry (CONTRACT 5.12); result: state.result. Needs the run's token
TG.Board.refresh(force) -> void          // loads the boards; at most once every 30 s unless force
TG.Board.blocked(name) -> boolean        // the initials are on the block list
TG.Board.state = {
  boards: 'off' | 'idle' | 'loading' | 'ready' | 'failed',
  lists: { easy: [], medium: [], hard: [] },      // entries as in 3.3
  send: 'none' | 'sending' | 'sent' | 'failed',   // the last submission
  place: 0, total: 0, sentDifficulty: null,       // set when send is 'sent'
  sentEntry: null                                 // the entry that was sent, for highlighting it in a list
};
```

## 10. Counters

The service also keeps daily totals, so that the owner can see how much the game is played. It stores totals only: nothing in these tables describes a player or a run.

### `POST /v1/stats`

The same rules as the other `POST` paths apply (origin, content type, size). The game sends two kinds of request, each with the run token it holds. The token only shows that the request comes from a game that asked for one; it is not used up, and the request is refused as `bad_token` or `expired` without a valid one.

```json
{ "token": "<run token>", "event": "start" }
{ "token": "<run token>", "event": "end", "time": 317, "cleared": true, "section": 3 }
```

`start` is sent when a run starts from the menus. `end` is sent once, when the run reaches the results screen: `time` is the run's length in whole seconds (0 to 10,800), `cleared` whether the level was beaten, and `section` the part the run ended in (0, 1 or 2 for the three sections, 3 for the boss). The difficulty comes from the token. The response is `{ "ok": true }`.

### What is kept

- `stats`: one row per UTC day and difficulty with the number of runs started, runs finished, runs cleared, the seconds played in finished runs, and how many finished runs ended in each part.
- `days`: one row per UTC day with the number of sources that started at least one run.
- `seen`: used only to count each source once a day. It holds a hash of the secret, the day and the source (the source as in section 4). Because the day is part of the hash, a source's hash differs from day to day. Rows of earlier days are deleted on the next `start` and by the hourly clean-up.

### Limits of the numbers

- The game sends nothing when world scores are switched off in Options, when the service cannot be reached, or from a copy opened from a file, so those runs are not counted.
- "Players" counts network addresses, not people: a household or a school behind one address counts once a day, and one person on two networks counts twice.
- The counters are not protected against someone sending made-up requests, beyond the origin rule and the token. They are for the owner's interest, not for anything that depends on them being exact.

### Reading the numbers

Run from the `server/` folder:

```bash
npx wrangler d1 execute spell-runner-scores --remote --command "SELECT s.day, d.players, SUM(s.starts) AS started, SUM(s.finishes) AS finished, SUM(s.cleared) AS cleared, ROUND(SUM(s.time_s) / 60.0) AS minutes FROM stats s LEFT JOIN days d ON d.day = s.day GROUP BY s.day ORDER BY s.day DESC LIMIT 30"
npx wrangler d1 execute spell-runner-scores --remote --command "SELECT day, difficulty, starts, finishes, cleared, time_s, reach0, reach1, reach2, reach3 FROM stats ORDER BY day DESC, difficulty LIMIT 90"
```
