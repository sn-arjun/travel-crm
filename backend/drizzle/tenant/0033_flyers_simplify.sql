-- FIX (B02 / BUG-002): flyer_templates (0010_marketing_tables.sql) never had a
-- preview_url column, so the original `SELECT ..., preview_url, ...` failed with
-- "no such column: preview_url" on every fresh database. The copy now selects NULL for
-- preview_url (the rebuilt table adds the column). Every other source column was
-- cross-checked against 0010. This file was edited in place because no environment
-- had ever applied it successfully.
--
-- Simplify flyers to match the desktop's structured-form UX (no canvas editor):
-- generated_flyers needs title/content/status/imageUrl and no longer requires `name`;
-- flyer_templates no longer requires width/height/size_preset since templates only
-- take a thumbnail/preview URL, not canvas dimensions; flyer_shares needs segment_id
-- for segment-based sharing. SQLite can't drop NOT NULL via ALTER, so both tables
-- are rebuilt.

PRAGMA foreign_keys=OFF;

CREATE TABLE flyer_templates_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  preview_url TEXT,
  layout_json TEXT,
  width INTEGER,
  height INTEGER,
  size_preset TEXT,
  placeholders TEXT,
  is_system INTEGER DEFAULT 0,
  is_quick_create INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT INTO flyer_templates_new (
  id, tenant_id, name, category, description, thumbnail_url, preview_url, layout_json,
  width, height, size_preset, placeholders, is_system, is_quick_create, is_active,
  created_by, created_at, updated_at
)
SELECT
  id, tenant_id, name, category, description, thumbnail_url, NULL, layout_json,
  width, height, size_preset, placeholders, is_system, is_quick_create, is_active,
  created_by, created_at, updated_at
FROM flyer_templates;

DROP TABLE flyer_templates;
ALTER TABLE flyer_templates_new RENAME TO flyer_templates;

CREATE INDEX IF NOT EXISTS flyer_templates_tenant_id_idx ON flyer_templates(tenant_id);
CREATE INDEX IF NOT EXISTS flyer_templates_category_idx ON flyer_templates(category);
CREATE INDEX IF NOT EXISTS flyer_templates_size_preset_idx ON flyer_templates(size_preset);
CREATE INDEX IF NOT EXISTS flyer_templates_is_system_idx ON flyer_templates(is_system);
CREATE INDEX IF NOT EXISTS flyer_templates_is_active_idx ON flyer_templates(is_active);

CREATE TABLE generated_flyers_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  template_id TEXT REFERENCES flyer_templates(id),
  name TEXT,
  title TEXT,
  content_json TEXT,
  image_url TEXT,
  status TEXT DEFAULT 'draft',
  layout_json TEXT,
  r2_key TEXT,
  url TEXT,
  thumbnail_url TEXT,
  format TEXT DEFAULT 'png',
  width INTEGER,
  height INTEGER,
  file_size INTEGER,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT INTO generated_flyers_new (
  id, tenant_id, template_id, name, layout_json, r2_key, url, thumbnail_url,
  format, width, height, file_size, created_by, created_at, updated_at
)
SELECT
  id, tenant_id, template_id, name, layout_json, r2_key, url, thumbnail_url,
  format, width, height, file_size, created_by, created_at, updated_at
FROM generated_flyers;

DROP TABLE generated_flyers;
ALTER TABLE generated_flyers_new RENAME TO generated_flyers;

CREATE INDEX IF NOT EXISTS generated_flyers_tenant_id_idx ON generated_flyers(tenant_id);
CREATE INDEX IF NOT EXISTS generated_flyers_template_id_idx ON generated_flyers(template_id);
CREATE INDEX IF NOT EXISTS generated_flyers_created_by_idx ON generated_flyers(created_by);
CREATE INDEX IF NOT EXISTS generated_flyers_status_idx ON generated_flyers(status);

ALTER TABLE flyer_shares ADD COLUMN segment_id TEXT REFERENCES contact_segments(id);

CREATE INDEX IF NOT EXISTS flyer_shares_segment_id_idx ON flyer_shares(segment_id);

ALTER TABLE tenant_branding ADD COLUMN custom_css TEXT;

PRAGMA foreign_keys=ON;
