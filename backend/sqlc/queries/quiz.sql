-- name: CreatePlayer :one
INSERT INTO players (key_hash, created_at) VALUES (@key_hash, now()) RETURNING id;

-- name: PlayerByKeyHash :one
SELECT id FROM players WHERE key_hash = @key_hash;

-- name: CreateQuiz :one
INSERT INTO quizzes (created_at) VALUES (@created_at) RETURNING id;

-- name: CreateRun :exec
INSERT INTO runs (id, quiz_id, player_id, name, creator, started_at)
VALUES (@id, @quiz_id, @player_id, @name, @creator, @started_at);

-- name: LockRun :one
SELECT id, quiz_id, player_id, name, creator, started_at, score, finished_at, end_reason
FROM runs
WHERE id = @id
FOR UPDATE;

-- name: ListRunAnswers :many
SELECT position, served_at, answered_at, option_index, correct
FROM run_answers
WHERE run_id = @run_id
ORDER BY position;

-- name: UpdateRun :exec
UPDATE runs
SET score = @score, finished_at = @finished_at, end_reason = @end_reason
WHERE id = @id;

-- name: UpsertRunAnswer :exec
INSERT INTO run_answers (run_id, position, served_at, answered_at, option_index, correct)
VALUES (@run_id, @position, @served_at, @answered_at, @option_index, @correct)
ON CONFLICT (run_id, position) DO UPDATE
SET answered_at = excluded.answered_at, option_index = excluded.option_index, correct = excluded.correct;

-- name: GetQuestion :one
SELECT type, target, prompt, options, correct_index
FROM quiz_questions
WHERE quiz_id = @quiz_id AND position = @position;

-- name: InsertQuestion :exec
INSERT INTO quiz_questions (quiz_id, position, type, target, prompt, options, correct_index)
VALUES (@quiz_id, @position, @type, @target, @prompt, @options, @correct_index)
ON CONFLICT (quiz_id, position) DO NOTHING;

-- name: ListTargets :many
SELECT target FROM quiz_questions WHERE quiz_id = @quiz_id;

-- Leaderboards rank players by their best ended, visible run: highest score, then earliest end, then id.
-- A run without an end counts as ended once its open answer is older than @late_after, at served_at + @late_after;
-- a run without an answer, or with a fresh one, has not ended.

-- name: GlobalTop :many
WITH ended AS (
  SELECT r.id, r.player_id, r.name, r.score, coalesce(r.finished_at, a.served_at + @late_after::interval) AS ended_at
  FROM runs r
  LEFT JOIN run_answers a ON a.run_id = r.id AND a.correct IS NULL
  WHERE r.creator AND NOT r.hidden
    AND (r.finished_at IS NOT NULL OR a.served_at + @late_after::interval < @now::timestamptz)
), best AS (
  SELECT DISTINCT ON (player_id) id, player_id, name, score, ended_at
  FROM ended
  ORDER BY player_id, score DESC, ended_at ASC, id ASC
)
SELECT player_id, name, score, rank() OVER (ORDER BY score DESC) AS rank
FROM best
ORDER BY score DESC, ended_at ASC, id ASC
LIMIT 100;

-- name: QuizTop :many
WITH ended AS (
  SELECT r.id, r.player_id, r.name, r.score, coalesce(r.finished_at, a.served_at + @late_after::interval) AS ended_at
  FROM runs r
  LEFT JOIN run_answers a ON a.run_id = r.id AND a.correct IS NULL
  WHERE r.quiz_id = @quiz_id AND NOT r.hidden
    AND (r.finished_at IS NOT NULL OR a.served_at + @late_after::interval < @now::timestamptz)
), best AS (
  SELECT DISTINCT ON (player_id) id, player_id, name, score, ended_at
  FROM ended
  ORDER BY player_id, score DESC, ended_at ASC, id ASC
)
SELECT player_id, name, score, rank() OVER (ORDER BY score DESC) AS rank
FROM best
ORDER BY score DESC, ended_at ASC, id ASC
LIMIT 100;

-- name: CreatorRun :one
SELECT r.player_id, r.name, r.score, r.hidden,
  (r.finished_at IS NOT NULL OR coalesce(a.served_at + @late_after::interval < @now::timestamptz, false))::boolean AS ended
FROM runs r
LEFT JOIN run_answers a ON a.run_id = r.id AND a.correct IS NULL
WHERE r.quiz_id = @quiz_id AND r.creator;

-- A run ranks as its player's best on its list: one more than the other players with a better ended, visible run there.
-- NOT MATERIALIZED inlines each count, so the global one reads runs_global_player_score.
-- name: RunRanks :one
WITH ended AS NOT MATERIALIZED (
  SELECT r.quiz_id, r.player_id, r.creator, r.score
  FROM runs r
  LEFT JOIN run_answers a ON a.run_id = r.id AND a.correct IS NULL
  WHERE NOT r.hidden
    AND (r.finished_at IS NOT NULL OR a.served_at + @late_after::interval < @now::timestamptz)
), own AS (
  SELECT r.quiz_id, r.player_id, r.creator,
    greatest(r.score, (SELECT max(e.score) FROM ended e WHERE e.player_id = r.player_id AND e.quiz_id = r.quiz_id)) AS quiz_best,
    greatest(r.score, (SELECT max(e.score) FROM ended e WHERE e.player_id = r.player_id AND e.creator)) AS global_best
  FROM runs r
  WHERE r.id = @id
)
SELECT o.creator,
  1 + (SELECT count(DISTINCT e.player_id) FROM ended e
       WHERE e.quiz_id = o.quiz_id AND e.player_id <> o.player_id AND e.score > o.quiz_best) AS quiz_rank,
  1 + (SELECT count(DISTINCT e.player_id) FROM ended e
       WHERE e.creator AND e.player_id <> o.player_id AND e.score > o.global_best) AS global_rank
FROM own o;
