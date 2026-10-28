-- R213: WhatsApp sent and received directly through Meta's Cloud API.
-- One row per agency: the WhatsApp phone number it sends from and receives on. The access token and the app
-- secret are sealed (utils/crypto-box.ts, R108) and never returned; only the last 4 characters of the token are
-- shown back. Both are optional: an agency on the platform's WhatsApp account saves just the phone number id and
-- the platform token and app secret (Worker secrets) are used.
CREATE TABLE IF NOT EXISTS whatsapp_meta_accounts (
  id TEXT PRIMARY KEY,
  phone_number_id TEXT NOT NULL,
  waba_id TEXT,
  display_phone TEXT,
  access_token_enc TEXT,
  access_token_last4 TEXT,
  app_secret_enc TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_tested_at TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_meta_accounts_phone_idx ON whatsapp_meta_accounts(phone_number_id);
