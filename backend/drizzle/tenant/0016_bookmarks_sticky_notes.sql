-- ============================================================
-- Tenant D1 — Bookmarks & Sticky Notes (TICKET-359)
-- Replaces previous bookmarks/sticky_notes schemas with
-- TICKET-359 spec (entity_type/entity_id, is_pinned, colors)
-- ============================================================

DROP TABLE IF EXISTS bookmarks;
DROP TABLE IF EXISTS sticky_notes;

CREATE TABLE bookmarks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE UNIQUE INDEX bookmarks_user_entity_idx ON bookmarks(user_id, entity_type, entity_id);
CREATE INDEX bookmarks_user_id_idx ON bookmarks(user_id);

CREATE TABLE sticky_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  color TEXT DEFAULT 'yellow',
  is_pinned INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX sticky_notes_user_id_idx ON sticky_notes(user_id);
CREATE INDEX sticky_notes_pinned_idx ON sticky_notes(is_pinned);
