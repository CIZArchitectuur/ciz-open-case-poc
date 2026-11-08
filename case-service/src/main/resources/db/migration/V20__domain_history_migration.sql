CREATE TABLE legacy_domain_migrations (
    case_id UUID PRIMARY KEY REFERENCES cases(case_id),
    completed_at TIMESTAMPTZ NOT NULL
);
