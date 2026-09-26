ALTER TABLE cases
    ADD COLUMN applicant_role VARCHAR(40) NOT NULL DEFAULT 'client',
    ADD COLUMN signed_by VARCHAR(60) NOT NULL DEFAULT 'client',
    ADD COLUMN authorization_signed_by_client BOOLEAN;

ALTER TABLE cases ALTER COLUMN applicant_role DROP DEFAULT;
ALTER TABLE cases ALTER COLUMN signed_by DROP DEFAULT;
