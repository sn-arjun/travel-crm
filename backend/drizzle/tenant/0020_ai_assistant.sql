-- M23: AI Assistant — Conversations & Generated Content
-- TICKET-412, TICKET-413

-- AI Conversations: multi-turn conversation history
CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  feature TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  messages TEXT NOT NULL DEFAULT '[]',
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_cost REAL DEFAULT 0,
  model_used TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS ai_conversations_user_id_idx ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS ai_conversations_feature_idx ON ai_conversations(feature);
CREATE INDEX IF NOT EXISTS ai_conversations_entity_idx ON ai_conversations(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ai_conversations_created_at_idx ON ai_conversations(created_at);
CREATE INDEX IF NOT EXISTS ai_conversations_is_active_idx ON ai_conversations(is_active);

-- AI Generated Content: each individual AI generation (prompt → output)
CREATE TABLE IF NOT EXISTS ai_generated_content (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES ai_conversations(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  raw_output TEXT,
  structured_output TEXT,
  entity_type TEXT,
  entity_id TEXT,
  status TEXT DEFAULT 'draft',
  feedback TEXT,
  feedback_notes TEXT,
  model_used TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_estimate REAL DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS ai_generated_content_conversation_id_idx ON ai_generated_content(conversation_id);
CREATE INDEX IF NOT EXISTS ai_generated_content_user_id_idx ON ai_generated_content(user_id);
CREATE INDEX IF NOT EXISTS ai_generated_content_content_type_idx ON ai_generated_content(content_type);
CREATE INDEX IF NOT EXISTS ai_generated_content_entity_idx ON ai_generated_content(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ai_generated_content_status_idx ON ai_generated_content(status);
CREATE INDEX IF NOT EXISTS ai_generated_content_created_at_idx ON ai_generated_content(created_at);
