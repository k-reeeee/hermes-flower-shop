-- v2: demo audit rows are flagged so "Clear demo data" removes them too.
ALTER TABLE audit_events ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;
