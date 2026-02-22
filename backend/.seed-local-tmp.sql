
-- Clean up any old rows (delete children before parents for FK compliance)
DELETE FROM tenant_users WHERE email     = 'admin@demo.com';
DELETE FROM tenants      WHERE subdomain = 'demo';
DELETE FROM users        WHERE email     = 'admin@demo.com';

-- Master schema seed
INSERT INTO tenants
  (id, company_name, subdomain, d1_database_id, plan, status, max_users)
VALUES
  ('01960000-0000-7000-8000-000000000001', 'Demo Travel Agency', 'demo', NULL, 'pro', 'active', 50);

INSERT INTO tenant_users
  (id, tenant_id, email, user_id, role, is_active)
VALUES
  ('01960000-0000-7000-8000-000000000003', '01960000-0000-7000-8000-000000000001', 'admin@demo.com', '01960000-0000-7000-8000-000000000002', 'admin', 1);

-- Tenant schema seed (shares MASTER_DB in local dev when d1_database_id IS NULL)
INSERT INTO users
  (id, email, name, password_hash, role, department, is_active)
VALUES
  ('01960000-0000-7000-8000-000000000002', 'admin@demo.com', 'Admin User', '$2b$10$ScKUMmMkaDvHyQNeu5m0LOP606oouVa/H7IizWtJDw9l/PHOCJcvS', 'admin', 'Management', 1);
