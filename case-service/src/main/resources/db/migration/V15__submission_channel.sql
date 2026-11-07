ALTER TABLE applications ADD COLUMN submission_channel varchar(30) NOT NULL DEFAULT 'CLIENT_PORTAL';
ALTER TABLE applications ADD CONSTRAINT applications_submission_channel CHECK (submission_channel IN ('CLIENT_PORTAL', 'CARE_PROVIDER', 'POST'));
