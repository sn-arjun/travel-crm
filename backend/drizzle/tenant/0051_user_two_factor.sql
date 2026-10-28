-- R209: two-factor sign-in (TOTP). The secret is sealed with the credential key (crypto-box); recovery codes are stored as SHA-256 hashes only.
ALTER TABLE users ADD COLUMN totp_secret_enc TEXT;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN recovery_codes_hash TEXT;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN totp_last_step INTEGER;
