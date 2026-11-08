CREATE TABLE document_extractions (
    extraction_id UUID PRIMARY KEY,
    case_id UUID NOT NULL,
    document_id UUID NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL,
    result JSONB NOT NULL,
    reviewed_text TEXT,
    reviewed_by VARCHAR(200),
    reviewed_at TIMESTAMPTZ
);
ALTER TABLE document_extractions ADD COLUMN artifact_id uuid;
ALTER TABLE document_extractions DROP CONSTRAINT document_extractions_document_id_key;
CREATE INDEX extraction_document_history ON document_extractions(document_id, created_at DESC);
CREATE TABLE dossier_analyses (
    analysis_id uuid PRIMARY KEY,
    analysis_number bigserial UNIQUE NOT NULL,
    case_id uuid NOT NULL,
    created_at timestamptz NOT NULL,
    started_at timestamptz,
    completed_at timestamptz,
    status varchar(20) NOT NULL,
    input jsonb NOT NULL,
    request_context jsonb NOT NULL DEFAULT '{}',
    output jsonb,
    error_code varchar(30),
    reviews jsonb NOT NULL DEFAULT '[]'
);
CREATE INDEX dossier_analysis_queue ON dossier_analyses(status, created_at);
