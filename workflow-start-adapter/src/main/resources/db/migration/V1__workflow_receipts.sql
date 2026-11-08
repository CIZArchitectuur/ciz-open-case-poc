CREATE TABLE workflow_receipts (
 case_id UUID PRIMARY KEY,
 event_id UUID NOT NULL,
 correlation_id VARCHAR(100) NOT NULL,
 trace_parent VARCHAR(100),
 completed_at TIMESTAMPTZ,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 attempts INTEGER NOT NULL DEFAULT 0
);
