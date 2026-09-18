CREATE TABLE case_medical_assessments (
    assessment_id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    task_id UUID NOT NULL,
    facts JSONB NOT NULL,
    outputs JSONB NOT NULL,
    resolved_inputs JSONB NOT NULL,
    assessment_complete BOOLEAN NOT NULL,
    criteria_met BOOLEAN NOT NULL,
    medical_advice_required BOOLEAN NOT NULL,
    policy_version VARCHAR(64) NOT NULL,
    engine_version VARCHAR(64) NOT NULL,
    schema_version VARCHAR(64) NOT NULL,
    regulation_hash VARCHAR(64) NOT NULL,
    effective_date DATE NOT NULL,
    assessed_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX case_medical_assessments_case_id_idx
    ON case_medical_assessments(case_id, assessed_at);
CREATE INDEX case_medical_assessments_task_id_idx
    ON case_medical_assessments(task_id);
