CREATE TABLE assessment_records (
    record_id UUID PRIMARY KEY,
    case_id UUID NOT NULL,
    kind VARCHAR(30) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL
);
CREATE INDEX assessment_case_history ON assessment_records(case_id,kind,occurred_at,record_id);
