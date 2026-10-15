-- R202: daily exchange rates. One row per base, quote and day; the latest row per pair is the rate in use, and an
-- older row remains the fallback when a day's fetch fails. rate = units of quote per one unit of base.
CREATE TABLE IF NOT EXISTS exchange_rates (
  base TEXT NOT NULL,
  quote TEXT NOT NULL,
  rate REAL NOT NULL,
  as_of TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'open.er-api.com',
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (base, quote, as_of)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS exchange_rates_pair_idx ON exchange_rates(base, quote, as_of);
