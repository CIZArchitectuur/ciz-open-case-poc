ALTER TABLE bas_submissions ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bas_submissions ADD COLUMN trace_parent VARCHAR(100);
