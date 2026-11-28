BEGIN;

-- prompt holds the language code a regional_language_name question shows; other types derive the prompt from the target.
ALTER TABLE quiz_questions ADD COLUMN prompt text NULL;

ALTER TABLE quiz_questions DROP CONSTRAINT quiz_questions_type_check;
ALTER TABLE quiz_questions ADD CONSTRAINT quiz_questions_type_check CHECK (type IN (
  'flag_name', 'name_flag', 'name_region',
  'name_capital', 'capital_name', 'flag_region', 'name_currency',
  'flag_capital', 'capital_flag', 'name_language', 'capital_region',
  'flag_currency', 'flag_language', 'capital_currency', 'capital_language',
  'regional_language_name'
));
ALTER TABLE quiz_questions ADD CONSTRAINT quiz_questions_prompt_check
  CHECK ((prompt IS NOT NULL) = (type = 'regional_language_name'));

COMMIT;
