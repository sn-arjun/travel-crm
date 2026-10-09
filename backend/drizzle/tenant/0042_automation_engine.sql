-- Automation engine + embedded assistant.
--
-- domain_events        what happened (outbox; every automation starts from one of these)
-- automation_rules     per-workspace mode and settings for each recipe; custom rules use trigger/conditions/actions
-- automation_runs      audit log: what each recipe did with each event
-- assistant_suggestions proposals waiting for one click, plus everything applied automatically (for undo)
-- assistant_message_analysis what the assistant understood from each received message

CREATE TABLE IF NOT EXISTS domain_events (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload TEXT,
  actor_id TEXT,
  depth INTEGER NOT NULL DEFAULT 0,
  processed_at TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS domain_events_type_idx ON domain_events(type);
CREATE INDEX IF NOT EXISTS domain_events_entity_idx ON domain_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS domain_events_created_at_idx ON domain_events(created_at);

CREATE TABLE IF NOT EXISTS automation_rules (
  id TEXT PRIMARY KEY NOT NULL,
  recipe_key TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'suggest',
  settings TEXT,
  trigger TEXT,
  conditions TEXT,
  actions TEXT,
  updated_by TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS automation_rules_recipe_key_idx ON automation_rules(recipe_key);

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY NOT NULL,
  rule_key TEXT NOT NULL,
  event_id TEXT,
  event_type TEXT,
  entity_type TEXT,
  entity_id TEXT,
  outcome TEXT NOT NULL,
  detail TEXT,
  suggestion_id TEXT,
  duration_ms INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS automation_runs_rule_key_idx ON automation_runs(rule_key);
CREATE INDEX IF NOT EXISTS automation_runs_created_at_idx ON automation_runs(created_at);

CREATE TABLE IF NOT EXISTS assistant_suggestions (
  id TEXT PRIMARY KEY NOT NULL,
  rule_key TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'rule',
  source_type TEXT,
  source_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  contact_id TEXT,
  lead_id TEXT,
  action_type TEXT NOT NULL,
  params TEXT NOT NULL,
  title TEXT NOT NULL,
  reason TEXT,
  confidence REAL,
  risk TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  dedupe_key TEXT NOT NULL,
  result TEXT,
  undo TEXT,
  error TEXT,
  assigned_to TEXT,
  applied_by TEXT,
  applied_at TEXT,
  model_used TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS assistant_suggestions_dedupe_idx ON assistant_suggestions(dedupe_key);
CREATE INDEX IF NOT EXISTS assistant_suggestions_entity_idx ON assistant_suggestions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS assistant_suggestions_status_idx ON assistant_suggestions(status);
CREATE INDEX IF NOT EXISTS assistant_suggestions_lead_idx ON assistant_suggestions(lead_id);
CREATE INDEX IF NOT EXISTS assistant_suggestions_contact_idx ON assistant_suggestions(contact_id);
CREATE INDEX IF NOT EXISTS assistant_suggestions_created_at_idx ON assistant_suggestions(created_at);

CREATE TABLE IF NOT EXISTS assistant_message_analysis (
  message_id TEXT PRIMARY KEY NOT NULL,
  intent TEXT NOT NULL,
  urgency TEXT,
  language TEXT,
  needs_work INTEGER DEFAULT 0,
  entities TEXT,
  draft_reply TEXT,
  summary TEXT,
  source TEXT NOT NULL DEFAULT 'rules',
  model_used TEXT,
  cost_estimate REAL DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
