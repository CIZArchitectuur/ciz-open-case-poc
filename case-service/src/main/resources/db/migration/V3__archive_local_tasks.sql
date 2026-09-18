-- Operaton owns task state from milestone 3 onward. Keep older PoC task rows for traceability.
ALTER TABLE case_tasks RENAME TO legacy_case_tasks;
ALTER INDEX case_tasks_case_id_idx RENAME TO legacy_case_tasks_case_id_idx;
