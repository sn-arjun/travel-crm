-- R302: every provider callback is processed once. A callback claims its row here before any side effect;
-- a repeat of the same callback (the provider retries) finds the row and changes nothing.
CREATE TABLE IF NOT EXISTS provider_events (
  provider TEXT NOT NULL,
  provider_call_id TEXT NOT NULL,
  event TEXT NOT NULL,
  sequence TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (provider, provider_call_id, event, sequence)
);
