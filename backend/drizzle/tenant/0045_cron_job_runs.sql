-- R105: one row per (job, period) that already ran for this agency. The queue consumer claims a row with
-- INSERT OR IGNORE before running a job, so a retried or duplicated message cannot repeat the work.
CREATE TABLE IF NOT EXISTS cron_job_runs (
  job TEXT NOT NULL,
  period_key TEXT NOT NULL,
  claimed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (job, period_key)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cron_job_runs_claimed_idx ON cron_job_runs (claimed_at);
