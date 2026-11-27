BEGIN;

CREATE TABLE quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL
);

CREATE TABLE quiz_questions (
  quiz_id uuid REFERENCES quizzes,
  position smallint CHECK (position >= 0),
  type text NOT NULL CHECK (type IN (
    'flag_name', 'name_flag', 'name_region',
    'name_capital', 'capital_name', 'flag_region', 'name_currency',
    'flag_capital', 'capital_flag', 'name_language', 'capital_region',
    'flag_currency', 'flag_language', 'capital_currency', 'capital_language'
  )),
  target text NOT NULL,
  options text[] NOT NULL CHECK (cardinality(options) = 4),
  correct_index smallint NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  PRIMARY KEY (quiz_id, position)
);

CREATE TABLE runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES quizzes,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 20),
  creator boolean NOT NULL,
  started_at timestamptz NOT NULL,
  score integer NOT NULL DEFAULT 0 CHECK (score >= 0),
  finished_at timestamptz NULL,
  end_reason text NULL CHECK (end_reason IN ('wrong', 'timeout', 'completed')),
  hidden boolean NOT NULL DEFAULT false,
  CHECK ((finished_at IS NULL) = (end_reason IS NULL))
);

CREATE UNIQUE INDEX runs_one_creator ON runs (quiz_id) WHERE creator;
CREATE INDEX runs_quiz_score ON runs (quiz_id, score DESC);

CREATE TABLE run_answers (
  run_id uuid REFERENCES runs,
  position smallint,
  served_at timestamptz NOT NULL,
  answered_at timestamptz NULL,
  option_index smallint NULL CHECK (option_index BETWEEN 0 AND 3),
  correct boolean NULL,
  PRIMARY KEY (run_id, position)
);

CREATE UNIQUE INDEX run_answers_one_open ON run_answers (run_id) WHERE correct IS NULL;

COMMIT;
