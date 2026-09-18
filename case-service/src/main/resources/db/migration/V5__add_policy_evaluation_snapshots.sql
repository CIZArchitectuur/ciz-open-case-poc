CREATE TABLE case_policy_evaluations (
    evaluation_id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    task_id UUID NOT NULL,
    facts JSONB NOT NULL,
    outputs JSONB NOT NULL,
    policy_version VARCHAR(64) NOT NULL,
    engine_version VARCHAR(64) NOT NULL,
    schema_version VARCHAR(64) NOT NULL,
    regulation_hash VARCHAR(64) NOT NULL,
    evaluated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX case_policy_evaluations_case_id_idx ON case_policy_evaluations(case_id, evaluated_at);
CREATE INDEX case_policy_evaluations_task_id_idx ON case_policy_evaluations(task_id);