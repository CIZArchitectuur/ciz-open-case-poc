CREATE TABLE bas_cases(case_id UUID PRIMARY KEY);
CREATE TABLE bas_submissions (
    event_id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES bas_cases(case_id),
    document_ids JSONB NOT NULL,
    correlation_id VARCHAR(100) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
    analysis_id UUID,
    error_code VARCHAR(30)
);
CREATE INDEX bas_submission_queue ON bas_submissions(status,occurred_at);
