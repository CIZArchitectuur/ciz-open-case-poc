CREATE TABLE application_submission_outbox (
    event_id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES cases(case_id),
    application_id UUID NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    correlation_id VARCHAR(100) NOT NULL,
    document_ids JSONB NOT NULL,
    published_at TIMESTAMPTZ
);
CREATE INDEX submission_outbox_pending ON application_submission_outbox(occurred_at) WHERE published_at IS NULL;
