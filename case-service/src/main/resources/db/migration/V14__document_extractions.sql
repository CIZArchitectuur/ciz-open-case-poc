CREATE TABLE document_extractions (
    extraction_id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES cases(case_id),
    document_id UUID NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL,
    result JSONB NOT NULL,
    reviewed_text TEXT,
    reviewed_by VARCHAR(200),
    reviewed_at TIMESTAMPTZ
);
