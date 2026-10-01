CREATE TABLE decisions (
    decision_id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES cases(case_id),
    result VARCHAR(40) NOT NULL,
    motivation VARCHAR(4000) NOT NULL,
    zorgprofiel VARCHAR(100),
    grondslagen JSONB NOT NULL DEFAULT '[]'::jsonb,
    decided_at TIMESTAMP WITH TIME ZONE NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE,
    source_task_id UUID,
    policy_evaluation_id UUID REFERENCES case_policy_evaluations(evaluation_id),
    medical_assessment_id UUID REFERENCES case_medical_assessments(assessment_id)
);
CREATE INDEX decisions_case_time ON decisions(case_id, decided_at, decision_id);

-- Preserve existing demo decisions before removing the old application columns.
INSERT INTO decisions (decision_id, case_id, result, motivation, decided_at, sent_at,
                       policy_evaluation_id, medical_assessment_id)
SELECT gen_random_uuid(), a.case_id, a.decision_result, COALESCE(a.decision_motivation, ''),
       COALESCE(a.decision_made_at, a.submitted_at), a.decision_sent_at,
       (SELECT e.evaluation_id FROM case_policy_evaluations e WHERE e.case_id = a.case_id
        AND e.evaluated_at <= COALESCE(a.decision_made_at, a.submitted_at)
        ORDER BY e.evaluated_at DESC, e.evaluation_id DESC LIMIT 1),
       (SELECT m.assessment_id FROM case_medical_assessments m WHERE m.case_id = a.case_id
        AND m.assessed_at <= COALESCE(a.decision_made_at, a.submitted_at)
        ORDER BY m.assessed_at DESC, m.assessment_id DESC LIMIT 1)
FROM applications a WHERE a.decision_result IS NOT NULL;

ALTER TABLE applications DROP COLUMN decision_result, DROP COLUMN decision_motivation,
    DROP COLUMN decision_made_at, DROP COLUMN decision_sent_at;
