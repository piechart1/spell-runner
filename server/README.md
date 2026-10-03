# SPELL RUNNER world scores: the service

This folder holds the small service behind the game's shared leaderboard. It is a Cloudflare Worker (a program that Cloudflare runs for each request) with a D1 database (SQLite, kept by Cloudflare). The game on GitHub Pages asks it for the boards and sends it finished runs.

`docs/LEADERBOARD.md` is the agreement between this service and the game: the API, the database, the checks on a submitted score and the limits. This file is about putting the service online and looking after it.

The game keeps working without the service. If the Worker is not deployed, is switched off or cannot be reached, the game uses the local scores it already keeps in the browser.

## What is in the folder

| File | What it is |
|---|---|
| `src/worker.js` | The Worker: three endpoints, the checks, the SQL, and the hourly clean-up |
| `src/blocklist.js` | Initials that are refused |
| `schema.sql` | The three database tables. Safe to run more than once |
| `wrangler.toml` | Settings for Wrangler, Cloudflare's command line tool |
| `package.json` | Tells Node that the `.js` files here are ES modules. There are no dependencies to install |

The tests are in `test/test-server.js`. Run them from the project root with `node test/test-server.js`. They need Node 22.13 or later and nothing else.

## What you need

- A Cloudflare account. The free plan is enough, and no payment card is needed for anything below.
- Node.js, which also provides `npx`.
- Wrangler. You do not have to install it: `npx wrangler ...` downloads it the first time and asks whether that is all right.

Every command below is run from this folder:

```bash
cd server
```

## Deploying, step by step

### 1. Sign in

```bash
npx wrangler login
```

A browser window opens and asks you to allow Wrangler to use your account. Afterwards `npx wrangler whoami` shows the account you are signed in to. If Cloudflare has sent you an email to confirm your address, confirm it first, or the later steps are refused.

### 2. Create the database

```bash
npx wrangler d1 create spell-runner-scores
```

Wrangler prints a `database_id`, a long code such as `1b2c3d4e-0000-1111-2222-333344445555`. If it offers to add the database to `wrangler.toml` for you, answer no: the entry is already there and only the id is missing.

If Wrangler says that a database with that name already exists, it was created earlier. Do not create a second one under another name. List the databases of the account and use the id shown for `spell-runner-scores` in step 3:

```bash
npx wrangler d1 list
```

### 3. Put the id in `wrangler.toml`

Open `wrangler.toml` and replace `REPLACE_WITH_DATABASE_ID` with the id from step 2:

```toml
[[d1_databases]]
binding = "DB"
database_name = "spell-runner-scores"
database_id = "1b2c3d4e-0000-1111-2222-333344445555"
```

The id is not a secret and can be committed. The tests accept the placeholder and a real id.

### 4. Create the tables in the remote database

```bash
npx wrangler d1 execute spell-runner-scores --remote --file=./schema.sql
```

`--remote` means the database at Cloudflare. Without it Wrangler uses a local copy on your machine. Wrangler warns that the database cannot answer queries while the file is imported and asks whether to proceed: answer yes. The database is empty and nothing uses it yet. To see that the tables are there:

```bash
npx wrangler d1 execute spell-runner-scores --remote --command "SELECT name FROM sqlite_master WHERE type = 'table'"
```

The answer should include `scores`, `hits` and `used`. It also lists `sqlite_sequence`, which SQLite keeps for the numbering of `scores`, and may list a table of Cloudflare's own such as `_cf_KV`.

### 5. Set the secret

The Worker signs each run token with a secret called `TOKEN_SECRET`. It must be at least 16 characters long and should be long and random. This prints a suitable one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Give it to Cloudflare:

```bash
npx wrangler secret put TOKEN_SECRET
```

Wrangler asks for the value: paste it and press Enter. If Wrangler says that there is no Worker called `spell-runner-scores` yet and asks whether to create one, answer yes.

The secret is stored by Cloudflare and is never written to a file in this project. You do not need to keep a copy. If you set a new one later, run tokens issued before the change stop working, so a run that was in progress at that moment is not accepted; nothing else is lost.

### 6. Deploy

```bash
npx wrangler deploy
```

On a new account Wrangler may first ask you to choose a `workers.dev` subdomain. Choose any name you like; it becomes part of the address. Wrangler then prints the Worker's address and the schedule of the hourly clean-up (`17 * * * *`):

```
https://spell-runner-scores.<your-subdomain>.workers.dev
```

If you have just chosen the subdomain, wait a few minutes before step 7. Until the new address is known everywhere, `curl` may report a TLS error or `Could not resolve host`. That is not a fault in the Worker.

### 7. Check that it answers

Three checks: the boards can be read, a token is issued, and a score is stored. The third is the only one that writes to the database, so do not leave it out. Put your address in the first line, without a slash at the end:

```bash
URL="https://spell-runner-scores.<your-subdomain>.workers.dev"
curl -sS "$URL/v1/scores"
```

should print `{"ok":true,"easy":[],"medium":[],"hard":[]}`, and

```bash
curl -sS -X POST "$URL/v1/runs" -H "content-type: application/json" -d '{"difficulty":"easy"}'
```

should print `{"ok":true,"token":"...","expires":10800}`.

Now a test score. These three lines ask for a token, wait six seconds (the service refuses a ten-second run from a token that is younger than five seconds) and send a score under the initials TST:

```bash
TOKEN=$(curl -sS -X POST "$URL/v1/runs" -H "content-type: application/json" -d '{"difficulty":"easy"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')
sleep 6
curl -sS -X POST "$URL/v1/scores" -H "content-type: application/json" -d "{\"token\":\"$TOKEN\",\"name\":\"TST\",\"score\":100,\"wpm\":10,\"accuracy\":90,\"rank\":\"B\",\"cleared\":false,\"time\":10}"
```

It should print `{"ok":true,"place":1,"total":1,"difficulty":"easy","scores":[{"name":"TST","score":100,...}]}`. Then remove the test row:

```bash
npx wrangler d1 execute spell-runner-scores --remote --command "DELETE FROM scores WHERE name = 'TST'"
```

If any of the three gives `{"ok":false,"error":"server"}`, see "When something is wrong" below. If the last one gives `"error":"bad_token"`, the line before it did not get a token: run `echo $TOKEN` to see what it holds.

After this first deploy, also open the Logs page of the Worker in the Cloudflare dashboard (Workers & Pages, then `spell-runner-scores`, then Logs). With the setting in `wrangler.toml` it should show no line for the requests you have just made; see "Logs" below.

### 8. Put the address into the game

Set `TG.Board.URL` in `js/board.js` to the Worker's address, without `/v1` and without a slash at the end (LEADERBOARD.md, section 9). Run the game's tests (`node test/run-all.js` from the project root); they pass with an address set, as long as it is an `https` address ending in `.workers.dev` with no path. Then commit and push, so that GitHub Pages serves the new version. An empty string in `TG.Board.URL` switches world scores off again.

## Trying it locally with `wrangler dev`

`wrangler dev` runs the Worker on your own machine with a local database. Nothing reaches Cloudflare.

1. Create a file named `.dev.vars` in this folder with a secret for local use. Any text of 16 characters or more will do. The file is listed in `.gitignore` and must not be committed.

   ```
   TOKEN_SECRET=local-secret-for-wrangler-dev-only
   ```

2. Create the tables in the local database (note `--local`):

   ```bash
   npx wrangler d1 execute spell-runner-scores --local --file=./schema.sql
   ```

3. Start the Worker:

   ```bash
   npx wrangler dev
   ```

   It listens on `http://localhost:8787`. In another terminal, run the checks of step 7 with the local address in the first line:

   ```bash
   URL="http://localhost:8787"
   ```

   To remove the test row afterwards, use the `DELETE` command of step 7 with `--local` in place of `--remote`.

4. To play the game against it, set `TG.Board.URL` to `http://localhost:8787` for the time being and open the game from a local web server (`http://localhost:...` or `http://127.0.0.1:...`). Do not commit that change: `test/test-integration.js` fails with a local address, on purpose. A copy opened from a file on disk can read the boards but cannot send scores: the service accepts a browser's `POST` only from the game's address and from local addresses (LEADERBOARD.md, section 3).

`wrangler dev` does not run the hourly clean-up by itself. The Worker does the same clean-up whenever a score is submitted, so nothing is missing locally.

The local database is kept in the `.wrangler` folder here. Delete that folder to start again with an empty one. Wrangler names the local database after the `database_id` in `wrangler.toml`, so if you change the id, repeat step 2.

## Looking after the board

These run against the live database, with Wrangler signed in (LEADERBOARD.md, section 8).

The 20 most recent scores:

```bash
npx wrangler d1 execute spell-runner-scores --remote --command "SELECT id, difficulty, name, score, wpm, time_s, datetime(created_at/1000,'unixepoch') FROM scores ORDER BY created_at DESC LIMIT 20"
```

Delete one score by its `id`:

```bash
npx wrangler d1 execute spell-runner-scores --remote --command "DELETE FROM scores WHERE id = 123"
```

Two more that are often useful. The top of one board:

```bash
npx wrangler d1 execute spell-runner-scores --remote --command "SELECT id, name, score, wpm, accuracy, rank, cleared, time_s FROM scores WHERE difficulty = 'hard' ORDER BY score DESC, created_at ASC LIMIT 20"
```

Delete every score entered under one set of initials:

```bash
npx wrangler d1 execute spell-runner-scores --remote --command "DELETE FROM scores WHERE name = 'XYZ'"
```

Delete everything that was submitted in a stretch of time (the times are UTC). Made-up scores usually arrive together, and so do rows that spell a word over several lines of a board, which the block list cannot catch. Look at the times with the first command above, then:

```bash
npx wrangler d1 execute spell-runner-scores --remote --command "DELETE FROM scores WHERE created_at BETWEEN strftime('%s', '2026-10-03 18:00:00') * 1000 AND strftime('%s', '2026-10-03 18:10:00') * 1000"
```

A deleted row is gone from the database at once. The service answers from memory for up to 15 seconds and the game loads the boards at most every 30 seconds, so a player can still see the row for up to about a minute.

The token a deleted score was sent with stays used for the rest of its three hours, so the same request cannot be sent again. Nothing stops the same person from starting again with a new token: they wait once more and are limited to 60 scores an hour.

To refuse a set of initials from now on, add it to `src/blocklist.js` and to the copy in `js/board.js`, run the tests, and deploy again. Rows already stored under those initials stay until you delete them.

## Changing the service

1. Edit the files under `src/`.
2. From the project root: `node test/test-server.js`.
3. From this folder: `npx wrangler deploy`.

If you change `schema.sql`, apply it again as in step 4 of the deployment. Statements of the form `CREATE ... IF NOT EXISTS` add what is missing and leave existing data alone; they do not alter a table that already exists.

If you change a limit in `src/worker.js`, change the table in LEADERBOARD.md section 5 too. The tests compare the two, and they also play the real game against the limits, so a limit that a real run would break fails the tests. The tests compare `schema.sql` with LEADERBOARD.md section 4 in the same way.

If the game moves to another address, add that address to `ORIGINS` in `src/worker.js` (scheme and host, no slash at the end), or scores sent from the new address are refused with `"error":"origin"`.

## Logs

The Worker writes a log line only when a request ends in a 500 error or the hourly clean-up fails. The line carries the error's message and nothing from the request.

- Live: `npx wrangler tail`, then make the request again.
- Recent: in the Cloudflare dashboard, open Workers & Pages, then `spell-runner-scores`, then Logs.

With logs switched on, Cloudflare would also record a line of its own for every request (the URL, the status and other details of the request). `invocation_logs = false` under `[observability.logs]` in `wrangler.toml` leaves those out, so that only the Worker's own lines are kept. The setting could not be tried while this was written. After the first deploy, make a few requests and look at the Logs page: it should stay empty. If it shows a line per request, or if Wrangler warns about the setting when deploying, check Cloudflare's documentation for Workers Logs.

## When something is wrong

| What you see | Likely cause | What to do |
|---|---|---|
| `POST /v1/runs` gives `{"ok":false,"error":"server"}` | `TOKEN_SECRET` is not set or is shorter than 16 characters. The log says so | Step 5, then try again. No new deploy is needed |
| `GET /v1/scores` gives `{"ok":false,"error":"server"}` and the log says `no such table` | The tables were not created in the remote database | Step 4, with `--remote` |
| `POST /v1/scores` gives `{"ok":false,"error":"server"}` while the other two checks of step 7 work | A database statement failed. `npx wrangler tail` in a second terminal shows the message when you send the score again. `no such table: used` means the tables were created from an older `schema.sql` | For a missing table, step 4 again. Otherwise the message names the statement that failed in `src/worker.js` |
| `curl` reports a TLS error or `Could not resolve host` straight after the first deploy | The `workers.dev` subdomain was registered a moment ago and is not known everywhere yet | Wait a few minutes and try again |
| `wrangler d1 create` says the database already exists | It was created earlier | `npx wrangler d1 list`, then step 3 with the id shown |
| `wrangler deploy` complains about the database id | `wrangler.toml` still has `REPLACE_WITH_DATABASE_ID` | Step 3 |
| The game shows no world scores, and the address works with `curl` | `TG.Board.URL` is empty or wrong, or the player has switched world scores off | Step 8. The browser's developer console shows failed requests |
| A score is refused with `"error":"rate"` | More than 60 submissions from one source in an hour. A source is one IPv4 address or one IPv6 /64. A school or an office usually shares one | Wait. The limit is `hourly` in `RULES` in `src/worker.js` |
| A score is refused with `"error":"origin"` | The game was opened from an address that is not in `ORIGINS`, or from a file on disk | Add the address to `ORIGINS` in `src/worker.js` and deploy, or open the game from a local web server |
| A score is refused with `"error":"bad_request"` although the fields are right | The request was not sent with `content-type: application/json` | Add the header |

## What is stored

One row per accepted run: three initials, the difficulty, score, WPM, accuracy, rank, whether the level was cleared, the run's length and the time it was submitted. Only the best 200 runs of each difficulty are kept.

The player's network address is not stored. To limit how often one source can submit, the service keeps a hash of the address mixed with `TOKEN_SECRET` in the `hits` table (for an IPv6 address, a hash of its first 64 bits). Hashes older than an hour are deleted the next time a score is submitted, and by a clean-up that Cloudflare starts once an hour (the cron trigger in `wrangler.toml`), so none stays for more than about two hours. While a hash is kept, its row has the same time as the score that came with it, so the two can be matched by somebody who can read the database.

The `used` table holds the random id of each token that was accepted, for three hours, so that a token works once.

## The free plan

At the time of writing Cloudflare's free plan allows 100,000 Worker requests a day, and for D1 5 million rows read and 100,000 rows written a day. A finished run costs a few requests (the token, the score, and the preflight requests that browsers send before them) and each player reads the boards at most every 30 seconds, so the game should stay well within those allowances. If a daily allowance is used up, Cloudflare refuses further requests until the next day (UTC) rather than charging, and the game falls back to its local scores. The current figures are on Cloudflare's pricing pages for Workers and D1. These figures could not be checked while this was written.

What the service does to stay within the database allowances:

- Reading the boards costs one database read (150 rows at most) every 15 seconds for each running copy of the Worker, and not one for every request. Requests that arrive in the moment such a read is under way make their own.
- An accepted score reads up to about 900 rows when a board is full and writes about 20, counting the indexes and the later clean-up (our own count of the statements; Cloudflare's dashboard shows the real figures). That allows several thousand scores a day.
- A submission that is refused as used, or by the hourly limit, runs three small statements. One source can make at most 60 counted submissions an hour.

What it cannot do: asking for a token and reading the boards are not limited per person, because limiting them would need a database write for every request. Somebody who sends requests in a loop can use up the 100,000 requests of a day. The result is no world scores until 00:00 UTC, and no charge. If that happens more than once, the place to limit requests per address is in front of the Worker: Cloudflare's rate limiting rules apply to a domain of your own, not to a `workers.dev` address, so the Worker would first have to be put on such a domain (this was not tried here).
