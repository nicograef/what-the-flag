BEGIN;

-- The global list and a creator's global rank read visible creator runs by score.
CREATE INDEX runs_global_score ON runs (score DESC, id) WHERE creator AND NOT hidden;

COMMIT;
