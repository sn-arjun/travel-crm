-- R127: platform-wide feature switches.
--
-- Owner decision 2026-10-21: the super admin keeps features on or off for a whole plan (plan_features, 0015), for every agency
-- at once (this table), or for one agency (tenant_feature_flags, 0003).
--
-- Resolution order (services/features/resolve.ts): a row here with is_enabled = 0 turns the feature off for everyone and beats
-- an agency override; otherwise an agency override decides; otherwise the plan. No row means the platform has not switched it.

CREATE TABLE IF NOT EXISTS platform_feature_switches (
  feature_key TEXT PRIMARY KEY,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
