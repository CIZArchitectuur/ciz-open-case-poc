-- The UUID is the identity. Historical provider counters may overlap counters
-- already allocated in the new BAS database; retain their original audit value.
ALTER TABLE dossier_analyses DROP CONSTRAINT dossier_analyses_analysis_number_key;
