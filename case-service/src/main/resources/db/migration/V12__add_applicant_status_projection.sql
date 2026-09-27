ALTER TABLE applications
    ADD COLUMN applicant_status VARCHAR(40) NOT NULL DEFAULT 'WAITING_FOR_REGISTRATION',
    ADD COLUMN status_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE application_status_outbox (
    event_id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES cases(case_id),
    applicant_status VARCHAR(40) NOT NULL,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    correlation_id VARCHAR(100) NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_application_status_outbox_unpublished
    ON application_status_outbox (occurred_at)
    WHERE published_at IS NULL;
