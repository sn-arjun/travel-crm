-- R104: tenant provisioning state. provisioning_status walks creating_db -> migrating -> seeding -> binding
-- -> active | pending_deploy, or ends in failed with provisioning_error. Existing tenants are 'active'.
ALTER TABLE tenants ADD COLUMN provisioning_status TEXT NOT NULL DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN provisioning_error TEXT;
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN owner_email TEXT;
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN owner_name TEXT;
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN country TEXT;
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN created_by_admin TEXT;
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN region TEXT NOT NULL DEFAULT 'in';
