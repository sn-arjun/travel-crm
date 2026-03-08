-- M26: AI Business Intelligence
-- Briefings, health scores, customer segments

CREATE TABLE IF NOT EXISTS ai_briefings (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  briefing_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  metrics TEXT,
  highlights TEXT,
  period TEXT NOT NULL,
  delivered INTEGER DEFAULT 0,
  delivered_via TEXT,
  read_at TEXT,
  model_used TEXT,
  cost_estimate REAL DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS ai_briefings_user_id_idx ON ai_briefings(user_id);
CREATE INDEX IF NOT EXISTS ai_briefings_type_idx ON ai_briefings(briefing_type);
CREATE INDEX IF NOT EXISTS ai_briefings_period_idx ON ai_briefings(period);
CREATE INDEX IF NOT EXISTS ai_briefings_created_at_idx ON ai_briefings(created_at);

CREATE TABLE IF NOT EXISTS ai_business_health_scores (
  id TEXT PRIMARY KEY,
  overall_score INTEGER NOT NULL,
  revenue_score INTEGER,
  pipeline_score INTEGER,
  customer_score INTEGER,
  team_score INTEGER,
  operations_score INTEGER,
  breakdown TEXT,
  trends TEXT,
  alerts TEXT,
  recommendations TEXT,
  previous_score INTEGER,
  score_change INTEGER,
  model_used TEXT,
  cost_estimate REAL DEFAULT 0,
  calculated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS ai_health_scores_calculated_at_idx ON ai_business_health_scores(calculated_at);
CREATE INDEX IF NOT EXISTS ai_health_scores_overall_idx ON ai_business_health_scores(overall_score);

CREATE TABLE IF NOT EXISTS ai_customer_segments (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  segment TEXT NOT NULL,
  confidence REAL,
  signals TEXT,
  lifetime_value REAL,
  churn_risk REAL,
  next_trip_prediction TEXT,
  preferred_destinations TEXT,
  preferred_channel TEXT,
  last_calculated_at TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS ai_customer_segments_contact_id_idx ON ai_customer_segments(contact_id);
CREATE INDEX IF NOT EXISTS ai_customer_segments_segment_idx ON ai_customer_segments(segment);
CREATE INDEX IF NOT EXISTS ai_customer_segments_churn_risk_idx ON ai_customer_segments(churn_risk);
