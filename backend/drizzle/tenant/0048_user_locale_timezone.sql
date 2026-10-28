-- R202: a user may override the agency's display locale and time zone. NULL means "use the agency setting".
ALTER TABLE users ADD COLUMN locale TEXT;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN timezone TEXT;
