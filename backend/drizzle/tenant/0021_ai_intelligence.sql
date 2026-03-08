-- M24: AI Search, Scoring & Document Processing
-- TICKET-439 through TICKET-458

-- AI Natural Language Queries
CREATE TABLE IF NOT EXISTS ai_nl_queries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT,
  query TEXT NOT NULL,
  generated_sql TEXT,
  query_result TEXT,
  ai_narrative TEXT,
  entity_types TEXT,
  model_used TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_estimate REAL DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  status TEXT DEFAULT 'completed',
  error_message TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS ai_nl_queries_user_id_idx ON ai_nl_queries(user_id);
CREATE INDEX IF NOT EXISTS ai_nl_queries_conversation_id_idx ON ai_nl_queries(conversation_id);
CREATE INDEX IF NOT EXISTS ai_nl_queries_created_at_idx ON ai_nl_queries(created_at);

-- AI Insights
CREATE TABLE IF NOT EXISTS ai_insights (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  insight_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  data TEXT,
  confidence REAL,
  priority TEXT DEFAULT 'medium',
  actionable INTEGER DEFAULT 0,
  action_taken INTEGER DEFAULT 0,
  dismissed_at TEXT,
  expires_at TEXT,
  model_used TEXT,
  cost_estimate REAL DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS ai_insights_user_id_idx ON ai_insights(user_id);
CREATE INDEX IF NOT EXISTS ai_insights_insight_type_idx ON ai_insights(insight_type);
CREATE INDEX IF NOT EXISTS ai_insights_entity_idx ON ai_insights(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ai_insights_priority_idx ON ai_insights(priority);
CREATE INDEX IF NOT EXISTS ai_insights_created_at_idx ON ai_insights(created_at);

-- AI Recommendations
CREATE TABLE IF NOT EXISTS ai_recommendations (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  recommendation_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  reasoning TEXT,
  impact_score REAL,
  confidence_score REAL,
  action_url TEXT,
  status TEXT DEFAULT 'active',
  dismissed_at TEXT,
  acted_on_at TEXT,
  expires_at TEXT,
  model_used TEXT,
  cost_estimate REAL DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS ai_recommendations_user_id_idx ON ai_recommendations(user_id);
CREATE INDEX IF NOT EXISTS ai_recommendations_type_idx ON ai_recommendations(recommendation_type);
CREATE INDEX IF NOT EXISTS ai_recommendations_entity_idx ON ai_recommendations(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ai_recommendations_status_idx ON ai_recommendations(status);
CREATE INDEX IF NOT EXISTS ai_recommendations_created_at_idx ON ai_recommendations(created_at);

-- AI Lead Scores
CREATE TABLE IF NOT EXISTS ai_lead_scores (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  category TEXT NOT NULL,
  signals TEXT,
  breakdown TEXT,
  previous_score INTEGER,
  score_change INTEGER,
  trigger_event TEXT,
  model_used TEXT,
  cost_estimate REAL DEFAULT 0,
  calculated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS ai_lead_scores_lead_id_idx ON ai_lead_scores(lead_id);
CREATE INDEX IF NOT EXISTS ai_lead_scores_score_idx ON ai_lead_scores(score);
CREATE INDEX IF NOT EXISTS ai_lead_scores_category_idx ON ai_lead_scores(category);
CREATE INDEX IF NOT EXISTS ai_lead_scores_calculated_at_idx ON ai_lead_scores(calculated_at);

-- AI Document Scans
CREATE TABLE IF NOT EXISTS ai_document_scans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  image_url TEXT,
  extracted_data TEXT,
  confidence REAL,
  entity_type TEXT,
  entity_id TEXT,
  status TEXT DEFAULT 'pending',
  model_used TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_estimate REAL DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS ai_document_scans_user_id_idx ON ai_document_scans(user_id);
CREATE INDEX IF NOT EXISTS ai_document_scans_document_type_idx ON ai_document_scans(document_type);
CREATE INDEX IF NOT EXISTS ai_document_scans_entity_idx ON ai_document_scans(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ai_document_scans_status_idx ON ai_document_scans(status);
CREATE INDEX IF NOT EXISTS ai_document_scans_created_at_idx ON ai_document_scans(created_at);

-- AI Follow-up Suggestions
CREATE TABLE IF NOT EXISTS ai_followup_suggestions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  lead_id TEXT,
  contact_id TEXT,
  suggested_channel TEXT,
  suggested_timing TEXT,
  timing_reasoning TEXT,
  channel_reasoning TEXT,
  message_content TEXT,
  escalation_level INTEGER DEFAULT 0,
  is_win_back INTEGER DEFAULT 0,
  confidence_score REAL,
  status TEXT DEFAULT 'pending',
  sent_at TEXT,
  dismissed_at TEXT,
  model_used TEXT,
  cost_estimate REAL DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS ai_followup_suggestions_user_id_idx ON ai_followup_suggestions(user_id);
CREATE INDEX IF NOT EXISTS ai_followup_suggestions_lead_id_idx ON ai_followup_suggestions(lead_id);
CREATE INDEX IF NOT EXISTS ai_followup_suggestions_contact_id_idx ON ai_followup_suggestions(contact_id);
CREATE INDEX IF NOT EXISTS ai_followup_suggestions_status_idx ON ai_followup_suggestions(status);
CREATE INDEX IF NOT EXISTS ai_followup_suggestions_created_at_idx ON ai_followup_suggestions(created_at);
