ALTER TABLE applications
    ADD COLUMN supplement_request VARCHAR(4000),
    ADD COLUMN supplement_response VARCHAR(4000),
    ADD COLUMN supplement_requested_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN supplement_responded_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN decision_result VARCHAR(40),
    ADD COLUMN decision_motivation VARCHAR(4000),
    ADD COLUMN decision_made_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN decision_sent_at TIMESTAMP WITH TIME ZONE;
