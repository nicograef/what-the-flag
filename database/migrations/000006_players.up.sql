BEGIN;

-- Runs gain an owner, and the beta's play data has none to give them, so it goes.
TRUNCATE run_answers, runs, quiz_questions, quizzes;

-- key_hash is the SHA-256 of the player key; the key itself is never stored.
CREATE TABLE players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash bytea UNIQUE NOT NULL CHECK (octet_length(key_hash) = 32),
  created_at timestamptz NOT NULL
);

ALTER TABLE runs ADD COLUMN player_id uuid NOT NULL REFERENCES players;

CREATE INDEX runs_player_started ON runs (player_id, started_at DESC);

-- A global rank counts the players with a better visible creator run.
DROP INDEX runs_global_score;
CREATE INDEX runs_global_player_score ON runs (score DESC, player_id) WHERE creator AND NOT hidden;

COMMIT;
