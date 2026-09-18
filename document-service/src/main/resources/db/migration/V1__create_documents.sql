CREATE TABLE documents (
    document_id UUID PRIMARY KEY,
    case_id UUID NOT NULL,
    object_key VARCHAR(255) NOT NULL UNIQUE,
    file_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
    sha256 CHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX documents_case_id_idx ON documents(case_id);
