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
