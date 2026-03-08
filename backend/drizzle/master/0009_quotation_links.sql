-- Quotation share links (cross-tenant lookup for public itinerary view)
CREATE TABLE IF NOT EXISTS quotation_links (
  token TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  itinerary_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quotation_links_itinerary ON quotation_links(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_quotation_links_tenant ON quotation_links(tenant_id);
