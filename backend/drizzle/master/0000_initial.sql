-- ============================================================
-- Master D1 — Initial Schema
-- Stores: tenants, subscriptions, wordpress_sites, tenant_users
-- ============================================================

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  subdomain TEXT NOT NULL,
  d1_database_id TEXT,
  logo_url TEXT,
  plan TEXT NOT NULL DEFAULT 'trial',
  status TEXT NOT NULL DEFAULT 'trial',
  settings TEXT,
  max_users INTEGER DEFAULT 5,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS tenants_subdomain_idx ON tenants(subdomain);
CREATE INDEX IF NOT EXISTS tenants_status_idx ON tenants(status);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  plan TEXT NOT NULL,
  amount REAL NOT NULL,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  start_date TEXT NOT NULL,
  next_billing_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  payment_gateway TEXT,
  gateway_subscription_id TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS subscriptions_tenant_id_idx ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);

CREATE TABLE IF NOT EXISTS wordpress_sites (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  subdomain TEXT NOT NULL,
  wp_admin_url TEXT,
  container_id TEXT,
  oci_instance_id TEXT,
  status TEXT NOT NULL DEFAULT 'provisioning',
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS wp_sites_subdomain_idx ON wordpress_sites(subdomain);
CREATE INDEX IF NOT EXISTS wp_sites_tenant_id_idx ON wordpress_sites(tenant_id);

-- Cross-tenant user lookup (email → tenant → user_id)
CREATE TABLE IF NOT EXISTS tenant_users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL,
  phone TEXT,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_users_email_tenant_idx ON tenant_users(email, tenant_id);
CREATE INDEX IF NOT EXISTS tenant_users_email_idx ON tenant_users(email);
CREATE INDEX IF NOT EXISTS tenant_users_tenant_id_idx ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS tenant_users_user_id_idx ON tenant_users(user_id);
