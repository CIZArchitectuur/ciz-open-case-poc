ALTER TABLE application_submission_outbox ADD COLUMN event_type VARCHAR(30) NOT NULL DEFAULT 'ApplicationSubmitted';
ALTER TABLE application_submission_outbox ADD COLUMN trace_parent VARCHAR(100);
