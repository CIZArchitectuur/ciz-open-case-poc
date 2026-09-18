ALTER TABLE case_policy_evaluations
    ADD COLUMN can_be_taken_into_consideration BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN resolved_inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN effective_date DATE NOT NULL DEFAULT CURRENT_DATE;

ALTER TABLE case_policy_evaluations
    ALTER COLUMN can_be_taken_into_consideration DROP DEFAULT,
    ALTER COLUMN resolved_inputs DROP DEFAULT,
    ALTER COLUMN effective_date DROP DEFAULT;
