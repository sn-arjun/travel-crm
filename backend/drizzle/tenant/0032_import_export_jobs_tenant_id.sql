ALTER TABLE import_jobs ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE export_jobs ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS import_jobs_tenant_id_idx ON import_jobs(tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS export_jobs_tenant_id_idx ON export_jobs(tenant_id);
