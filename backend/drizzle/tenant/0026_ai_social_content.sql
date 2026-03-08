-- 0026: AI Social Content & Marketing Suggestions

CREATE TABLE IF NOT EXISTS ai_social_content (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  platform TEXT NOT NULL,
  topic TEXT NOT NULL,
  prompt TEXT,
  generated_text TEXT NOT NULL,
  hashtags TEXT,
  media_suggestions TEXT,
  cta TEXT,
  tone TEXT DEFAULT 'professional',
  language TEXT DEFAULT 'en',
  status TEXT DEFAULT 'draft',
  model_used TEXT,
  tokens_used INTEGER DEFAULT 0,
  cost_estimate REAL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX ai_social_content_platform_idx ON ai_social_content(platform);
CREATE INDEX ai_social_content_status_idx ON ai_social_content(status);
CREATE INDEX ai_social_content_created_by_idx ON ai_social_content(created_by);
CREATE INDEX ai_social_content_created_at_idx ON ai_social_content(created_at);

CREATE TABLE IF NOT EXISTS ai_marketing_suggestions (
  id TEXT PRIMARY KEY,
  suggestion_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  details TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'pending',
  target_segment TEXT,
  estimated_impact TEXT,
  basis TEXT,
  model_used TEXT,
  tokens_used INTEGER DEFAULT 0,
  cost_estimate REAL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX ai_mkt_suggestions_type_idx ON ai_marketing_suggestions(suggestion_type);
CREATE INDEX ai_mkt_suggestions_status_idx ON ai_marketing_suggestions(status);
CREATE INDEX ai_mkt_suggestions_priority_idx ON ai_marketing_suggestions(priority);
