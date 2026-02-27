-- ============================================================
-- Migration 0014: Sync DB schema with Drizzle definitions
-- Fixes: visa_applications, events, tasks missing columns
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. TASKS — Add missing columns
-- ────────────────────────────────────────────────────────────

ALTER TABLE tasks ADD COLUMN is_deleted INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN created_by TEXT;
ALTER TABLE tasks ADD COLUMN completed_at TEXT;
ALTER TABLE tasks ADD COLUMN overdue_notified_date TEXT;
CREATE INDEX IF NOT EXISTS tasks_is_deleted_idx ON tasks(is_deleted);
-- Backfill created_by from assigned_by for existing rows
UPDATE tasks SET created_by = assigned_by WHERE created_by IS NULL AND assigned_by IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. EVENTS — Drop and recreate (column renames required)
-- Old: start_date, end_date, type, related_id, related_type, is_recurring
-- New: start_at, end_at, event_type, location, recurrence_parent_id,
--      related_lead_id, related_task_id, timezone, is_deleted, updated_at
-- ────────────────────────────────────────────────────────────

CREATE TABLE events_new (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT,
  all_day INTEGER DEFAULT 0,
  location TEXT,
  color TEXT,
  recurrence_rule TEXT,
  recurrence_parent_id TEXT,
  related_lead_id TEXT,
  related_task_id TEXT,
  assigned_to TEXT NOT NULL,
  created_by TEXT NOT NULL,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

INSERT INTO events_new (
  id, title, description, event_type, start_at, end_at, all_day,
  color, recurrence_rule, assigned_to, created_by, created_at,
  related_lead_id
)
SELECT
  id, title, description,
  COALESCE(type, 'reminder'),
  start_date,
  end_date,
  all_day,
  color,
  recurrence_rule,
  COALESCE(assigned_to, created_by, 'system'),
  COALESCE(created_by, assigned_to, 'system'),
  created_at,
  CASE WHEN related_type = 'lead' THEN related_id ELSE NULL END
FROM events;

DROP TABLE events;
ALTER TABLE events_new RENAME TO events;

CREATE INDEX IF NOT EXISTS events_assigned_to_start_at_idx ON events(assigned_to, start_at);
CREATE INDEX IF NOT EXISTS events_related_lead_id_idx ON events(related_lead_id);
CREATE INDEX IF NOT EXISTS events_recurrence_parent_id_idx ON events(recurrence_parent_id);
CREATE INDEX IF NOT EXISTS events_related_task_id_idx ON events(related_task_id);
CREATE INDEX IF NOT EXISTS events_event_type_idx ON events(event_type);
CREATE INDEX IF NOT EXISTS events_is_deleted_idx ON events(is_deleted);

-- ────────────────────────────────────────────────────────────
-- 3. VISA APPLICATIONS — Add missing columns
-- ────────────────────────────────────────────────────────────

ALTER TABLE visa_applications ADD COLUMN tenant_id TEXT DEFAULT '';
ALTER TABLE visa_applications ADD COLUMN destination_country TEXT;
ALTER TABLE visa_applications ADD COLUMN application_number TEXT;
ALTER TABLE visa_applications ADD COLUMN appointment_date TEXT;
ALTER TABLE visa_applications ADD COLUMN expected_date TEXT;
ALTER TABLE visa_applications ADD COLUMN approved_date TEXT;
ALTER TABLE visa_applications ADD COLUMN rejected_date TEXT;
ALTER TABLE visa_applications ADD COLUMN rejection_reason TEXT;
ALTER TABLE visa_applications ADD COLUMN visa_number TEXT;
ALTER TABLE visa_applications ADD COLUMN visa_issue_date TEXT;
ALTER TABLE visa_applications ADD COLUMN visa_expiry_date TEXT;
ALTER TABLE visa_applications ADD COLUMN visa_entry_type TEXT;
ALTER TABLE visa_applications ADD COLUMN embassy_name TEXT;
ALTER TABLE visa_applications ADD COLUMN is_deleted INTEGER DEFAULT 0;
ALTER TABLE visa_applications ADD COLUMN created_by TEXT;

-- Backfill destination_country from old country column
UPDATE visa_applications SET destination_country = country WHERE destination_country IS NULL AND country IS NOT NULL;

CREATE INDEX IF NOT EXISTS visa_apps_tenant_id_traveller_id_idx ON visa_applications(tenant_id, traveller_id);
CREATE INDEX IF NOT EXISTS visa_apps_tenant_id_status_idx ON visa_applications(tenant_id, status);
CREATE INDEX IF NOT EXISTS visa_apps_tenant_id_visa_expiry_idx ON visa_applications(tenant_id, visa_expiry_date);

-- ────────────────────────────────────────────────────────────
-- 4. VISA CHECKLIST ITEMS — Add missing columns
-- ────────────────────────────────────────────────────────────

ALTER TABLE visa_checklist_items ADD COLUMN tenant_id TEXT DEFAULT '';
ALTER TABLE visa_checklist_items ADD COLUMN description TEXT;
ALTER TABLE visa_checklist_items ADD COLUMN is_required INTEGER DEFAULT 1;
ALTER TABLE visa_checklist_items ADD COLUMN received_by TEXT;
ALTER TABLE visa_checklist_items ADD COLUMN document_url TEXT;
ALTER TABLE visa_checklist_items ADD COLUMN updated_at TEXT;

-- ────────────────────────────────────────────────────────────
-- 5. NEW TABLES — visa_documents, visa_notes, expiry_alerts_log
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS visa_documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  visa_application_id TEXT NOT NULL REFERENCES visa_applications(id) ON DELETE CASCADE,
  document_type TEXT,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  is_deleted INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS visa_docs_visa_app_id_idx ON visa_documents(visa_application_id);

CREATE TABLE IF NOT EXISTS visa_notes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  visa_application_id TEXT NOT NULL REFERENCES visa_applications(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  is_deleted INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS visa_notes_visa_app_id_idx ON visa_notes(visa_application_id);

CREATE TABLE IF NOT EXISTS expiry_alerts_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  alert_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  alert_date TEXT NOT NULL,
  days_remaining INTEGER,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS expiry_alerts_tenant_entity_date_idx ON expiry_alerts_log(tenant_id, entity_id, alert_date);
