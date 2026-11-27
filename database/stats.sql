-- Owner statistics: `make stats` runs this on the dev database, `make prod-stats` on production.

\echo 'Runs per day, last 14 days'
SELECT d::date AS day, count(r.id) AS runs
FROM generate_series(current_date - 13, current_date, interval '1 day') AS d
LEFT JOIN runs r ON r.started_at >= d AND r.started_at < d + interval '1 day'
GROUP BY d
ORDER BY d;

\echo 'Runs from challenge links, names with more than one run, median score of finished runs'
SELECT
  round(avg((NOT creator)::int), 3) AS challenge_share,
  (SELECT round(avg((n > 1)::int), 3) FROM (SELECT count(*) AS n FROM runs GROUP BY name) AS names) AS replay_share,
  (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY score) FROM runs WHERE finished_at IS NOT NULL) AS median_score
FROM runs;

-- Five answers at least, so a single quick guess does not rank.
\echo '20 fastest mean answer times (runs with at least 5 answers)'
SELECT a.run_id, r.name, r.score, r.hidden, count(*) AS answers,
  round(avg(extract(epoch FROM a.answered_at - a.served_at))::numeric, 3) AS mean_seconds
FROM run_answers a
JOIN runs r ON r.id = a.run_id
WHERE a.answered_at IS NOT NULL
GROUP BY a.run_id, r.name, r.score, r.hidden
HAVING count(*) >= 5
ORDER BY mean_seconds
LIMIT 20;

-- A run's score is the position of the question that ended it; a completed run has none left.
\echo 'Ended runs by final position, visible runs only'
SELECT score AS position,
  count(*) FILTER (WHERE end_reason = 'wrong') AS wrong,
  count(*) FILTER (WHERE end_reason = 'timeout') AS timeout,
  count(*) FILTER (WHERE end_reason = 'completed') AS completed
FROM runs
WHERE finished_at IS NOT NULL AND NOT hidden
GROUP BY score
ORDER BY score;

\echo 'Missed questions by type: misses, answers, and the share that missed, visible runs only'
SELECT q.type, count(*) FILTER (WHERE NOT a.correct) AS missed, count(*) AS answered,
  round(avg((NOT a.correct)::int), 3) AS miss_share
FROM run_answers a
JOIN runs r ON r.id = a.run_id
JOIN quiz_questions q ON q.quiz_id = r.quiz_id AND q.position = a.position
WHERE a.correct IS NOT NULL AND NOT r.hidden
GROUP BY q.type
ORDER BY miss_share DESC, q.type;
