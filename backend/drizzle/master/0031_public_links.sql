-- R148: public links (docs/readiness/TOUR-OPERATOR-DESIGN.md section 7).
--
-- One row per link a customer opens without signing in: the booking page of a departure now, and the self-service pages of a
-- booking or a passenger later (R150). The token is the primary key and is 128 random bits (base64url), never a UUIDv7. The tenant
-- is found here, in the master database, before any agency database is opened, so an unknown, revoked or wrong-kind token
-- reveals nothing about which agencies or bookings exist.

CREATE TABLE IF NOT EXISTS public_links (
  token TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('departure_booking', 'booking_self_service', 'passenger_self_service')),
  entity_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_public_links_entity ON public_links(tenant_id, kind, entity_id);
