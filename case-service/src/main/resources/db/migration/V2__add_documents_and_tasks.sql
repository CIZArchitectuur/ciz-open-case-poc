CREATE TABLE case_documents (
    document_id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX case_documents_case_id_idx ON case_documents(case_id);

CREATE TABLE case_tasks (
    task_id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    task_type VARCHAR(64) NOT NULL CHECK (task_type = 'APPLICATION_REVIEW'),
    status VARCHAR(16) NOT NULL CHECK (status IN ('OPEN', 'COMPLETED')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    CHECK ((status = 'OPEN' AND completed_at IS NULL)
        OR (status = 'COMPLETED' AND completed_at IS NOT NULL))
);

CREATE INDEX case_tasks_case_id_idx ON case_tasks(case_id);

INSERT INTO case_tasks (task_id, case_id, task_type, status, created_at)
SELECT gen_random_uuid(), case_id, 'APPLICATION_REVIEW', 'OPEN', created_at
FROM cases;
