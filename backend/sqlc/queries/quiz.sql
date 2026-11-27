-- name: CreateQuiz :one
INSERT INTO quizzes (created_at) VALUES (@created_at) RETURNING id;

-- name: QuizExists :one
SELECT EXISTS (SELECT 1 FROM quizzes WHERE id = @id);

-- name: CreateRun :exec
INSERT INTO runs (id, quiz_id, name, creator, started_at)
VALUES (@id, @quiz_id, @name, @creator, @started_at);

-- name: LockRun :one
SELECT id, quiz_id, name, creator, started_at, score, finished_at, end_reason, hidden
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
SELECT type, target, options, correct_index
FROM quiz_questions
WHERE quiz_id = @quiz_id AND position = @position;

-- name: InsertQuestion :exec
INSERT INTO quiz_questions (quiz_id, position, type, target, options, correct_index)
VALUES (@quiz_id, @position, @type, @target, @options, @correct_index)
ON CONFLICT (quiz_id, position) DO NOTHING;

-- name: ListTargets :many
SELECT target FROM quiz_questions WHERE quiz_id = @quiz_id;
