-- B33: bring the migration chain in line with src/db/tenant-schema.ts.
--
-- backend/test/schema-drift.test.ts applies 0000..0038 and asserts that every table and column
-- declared in the Drizzle schema exists. Before this migration it reported 9 missing columns and
-- 6 missing tables. All additions are nullable or carry a constant default, so existing rows stay valid.
-- Nothing here drops or rewrites existing data. CREATE TABLE statements use IF NOT EXISTS because
-- routes/tasks.ts used to create task_comments on demand in older tenant databases.

-- ── message_templates ────────────────────────────────────────
ALTER TABLE message_templates ADD COLUMN is_system INTEGER DEFAULT 0;
ALTER TABLE message_templates ADD COLUMN whatsapp_template_sid TEXT;
ALTER TABLE message_templates ADD COLUMN whatsapp_status TEXT;
ALTER TABLE message_templates ADD COLUMN created_by TEXT REFERENCES users(id);

-- ── message_log ──────────────────────────────────────────────
ALTER TABLE message_log ADD COLUMN direction TEXT DEFAULT 'outgoing';
ALTER TABLE message_log ADD COLUMN media_url TEXT;
ALTER TABLE message_log ADD COLUMN metadata TEXT;
CREATE INDEX IF NOT EXISTS msg_log_direction_idx ON message_log(direction);

-- ── visa_checklist_items ─────────────────────────────────────
-- SQLite cannot add a column with a non-constant default, so add it bare and backfill.
ALTER TABLE visa_checklist_items ADD COLUMN created_at TEXT;
UPDATE visa_checklist_items SET created_at = COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) WHERE created_at IS NULL;

-- ── tenant_branding ──────────────────────────────────────────
ALTER TABLE tenant_branding ADD COLUMN logo_r2_key TEXT;

-- ── traveller_documents ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS traveller_documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  traveller_id TEXT NOT NULL REFERENCES travellers(id),
  document_type TEXT,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  is_deleted INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS traveller_docs_traveller_id_idx ON traveller_documents(traveller_id);

-- ── bulk_send_batches ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bulk_send_batches (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  template_id TEXT REFERENCES message_templates(id),
  message TEXT,
  total_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS bulk_batches_status_idx ON bulk_send_batches(status);
CREATE INDEX IF NOT EXISTS bulk_batches_channel_idx ON bulk_send_batches(channel);
CREATE INDEX IF NOT EXISTS bulk_batches_created_by_idx ON bulk_send_batches(created_by);

-- ── supplier_documents ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_documents (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'other',
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by TEXT REFERENCES users(id),
  uploaded_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  expiry_date TEXT,
  notes TEXT,
  is_deleted INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS supplier_docs_supplier_id_idx ON supplier_documents(supplier_id);

-- ── task_comments ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS task_comments_task_id_idx ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS task_comments_user_id_idx ON task_comments(user_id);

-- ── unsubscribes ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS unsubscribes (
  id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES contacts(id),
  email TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  reason TEXT,
  token TEXT,
  unsubscribed_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  resubscribed_at TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS unsubscribes_email_idx ON unsubscribes(email);
CREATE INDEX IF NOT EXISTS unsubscribes_contact_id_idx ON unsubscribes(contact_id);
CREATE INDEX IF NOT EXISTS unsubscribes_channel_idx ON unsubscribes(channel);
CREATE INDEX IF NOT EXISTS unsubscribes_token_idx ON unsubscribes(token);

-- ── email_templates ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT,
  category TEXT DEFAULT 'general',
  is_system INTEGER DEFAULT 0,
  is_deleted INTEGER DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS email_templates_tenant_id_idx ON email_templates(tenant_id);
CREATE INDEX IF NOT EXISTS email_templates_category_idx ON email_templates(category);
CREATE INDEX IF NOT EXISTS email_templates_is_deleted_idx ON email_templates(is_deleted);
