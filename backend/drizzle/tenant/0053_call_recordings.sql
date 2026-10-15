-- R306: recordings kept in our own storage with consent and retention, and the call AI pipeline state.
ALTER TABLE call_logs ADD COLUMN recording_provider_id TEXT;
--> statement-breakpoint
ALTER TABLE call_logs ADD COLUMN recording_bytes INTEGER;
--> statement-breakpoint
ALTER TABLE call_logs ADD COLUMN recording_expires_at TEXT;
--> statement-breakpoint
ALTER TABLE call_logs ADD COLUMN recording_state TEXT;
--> statement-breakpoint
ALTER TABLE call_logs ADD COLUMN recording_provider_deleted_at TEXT;
--> statement-breakpoint
ALTER TABLE call_logs ADD COLUMN recording_consent TEXT;
--> statement-breakpoint
ALTER TABLE call_logs ADD COLUMN ai_status TEXT;
--> statement-breakpoint
ALTER TABLE call_logs ADD COLUMN ai_status_reason TEXT;
--> statement-breakpoint
ALTER TABLE voip_settings ADD COLUMN recording_consent_mode TEXT DEFAULT 'announce';
--> statement-breakpoint
ALTER TABLE voip_settings ADD COLUMN recording_announcement TEXT;
--> statement-breakpoint
ALTER TABLE voip_settings ADD COLUMN call_ai_enabled INTEGER DEFAULT 0;
--> statement-breakpoint
ALTER TABLE voip_settings ADD COLUMN call_ai_engine TEXT DEFAULT 'standard';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS call_logs_recording_expires_idx ON call_logs(recording_expires_at);
