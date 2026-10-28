-- R132: platform mail delivery log.
--
-- One row per platform system email (welcome, invite, reset, receipts, alerts) written by sendMail('platform_system').
-- The routing settings themselves live in platform_settings (R304) under email.* keys; no table is needed for them.
--
-- Privacy: the recipient address is stored masked (first character, ***, domain), never in full; a row is deleted after 90 days
-- by the platform daily cron. Agency mail is not logged here (it has email_message_log in the agency's own database).
--
-- status           what the send did: sent | fallback (Cloudflare was wanted, SendGrid sent it) | failed
-- delivery_status  what the provider reported afterwards: accepted (Cloudflare, no event webhook), processed, delivered, deferred,
--                  bounced, dropped (SendGrid events, matched by message id)
-- note             why a fallback or a failure happened, in words an operator can read

CREATE TABLE IF NOT EXISTS platform_email_log (
  id TEXT PRIMARY KEY,
  template TEXT,
  kind TEXT NOT NULL DEFAULT 'platform_system',
  to_masked TEXT NOT NULL,
  provider TEXT NOT NULL,
  fallback_from TEXT,
  message_id TEXT,
  status TEXT NOT NULL,
  delivery_status TEXT,
  error TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_platform_email_log_created ON platform_email_log(created_at);
CREATE INDEX IF NOT EXISTS idx_platform_email_log_message ON platform_email_log(message_id);
