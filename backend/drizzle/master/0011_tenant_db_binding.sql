-- R101: one binding scheme for tenant databases. db_binding is the Worker binding name
-- (TENANT_DB_<32 hex of tenant id>); shard names the Worker/shard that owns it.
ALTER TABLE tenants ADD COLUMN db_binding TEXT;
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN shard TEXT NOT NULL DEFAULT 's1';
--> statement-breakpoint
CREATE UNIQUE INDEX tenants_db_binding_idx ON tenants(db_binding) WHERE db_binding IS NOT NULL;
--> statement-breakpoint
UPDATE tenants SET db_binding = 'TENANT_DB_' || lower(replace(id, '-', '')) WHERE d1_database_id IS NOT NULL;
