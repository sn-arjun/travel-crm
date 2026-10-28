-- R108: website API keys are stored as one-way hashes. SQLite cannot compute SHA-256, so existing plaintext
-- keys keep working through a legacy lookup until the hash-api-keys maintenance route (or their next use)
-- hashes them and blanks api_key. New keys are written with api_key = '' and key_hash set.
ALTER TABLE tenant_api_keys ADD COLUMN key_hash TEXT;
ALTER TABLE tenant_api_keys ADD COLUMN key_prefix TEXT;
ALTER TABLE tenant_api_keys ADD COLUMN last_used_at TEXT;

UPDATE tenant_api_keys SET key_prefix = substr(api_key, 1, 8) WHERE key_prefix IS NULL AND api_key != '';

-- Blanked keys must not collide on the old unique index; uniqueness now applies to the hash and to any
-- still-plaintext key.
DROP INDEX IF EXISTS tenant_api_keys_key_idx;
CREATE UNIQUE INDEX IF NOT EXISTS tenant_api_keys_legacy_key_idx ON tenant_api_keys(api_key) WHERE api_key != '';
CREATE UNIQUE INDEX IF NOT EXISTS tenant_api_keys_hash_idx ON tenant_api_keys(key_hash) WHERE key_hash IS NOT NULL;

-- The request log keeps the 8-character prefix only, never the key.
UPDATE webhook_log SET api_key = substr(api_key, 1, 8) WHERE api_key IS NOT NULL AND length(api_key) > 8;
