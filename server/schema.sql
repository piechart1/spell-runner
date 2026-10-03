-- server/schema.sql
-- The database of SPELL RUNNER's world scores (docs/LEADERBOARD.md, section 4).
-- Safe to run more than once: every statement creates only what is missing.
--
--   npx wrangler d1 execute spell-runner-scores --remote --file=./schema.sql

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
