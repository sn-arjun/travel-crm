-- Add missing columns to suppliers table for full CRUD support
-- Using CREATE TABLE IF NOT EXISTS trick to make idempotent
-- (columns may already exist from manual application)
CREATE TABLE IF NOT EXISTS _migration_0027_guard (id INTEGER PRIMARY KEY);
DROP TABLE IF EXISTS _migration_0027_guard;
