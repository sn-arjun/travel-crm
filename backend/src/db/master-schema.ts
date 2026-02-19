import { sqliteTable, text, real, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// --- Tenants ---
export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(), // UUIDv7
  companyName: text('company_name').notNull(),
  subdomain: text('subdomain').notNull(),
  d1DatabaseId: text('d1_database_id'),
  logoUrl: text('logo_url'),
  plan: text('plan').notNull().default('trial'), // trial, basic, pro, enterprise
  status: text('status').notNull().default('trial'), // trial, active, suspended, expired
  settings: text('settings'), // JSON text
  maxUsers: integer('max_users').default(5),
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  updatedAt: text('updated_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [
  uniqueIndex('tenants_subdomain_idx').on(table.subdomain),
  index('tenants_status_idx').on(table.status),
]);

// --- Subscriptions ---
export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(), // UUIDv7
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  plan: text('plan').notNull(), // basic, pro, enterprise
  amount: real('amount').notNull(),
  billingCycle: text('billing_cycle').notNull().default('monthly'), // monthly, yearly
  startDate: text('start_date').notNull(),
  nextBillingDate: text('next_billing_date').notNull(),
  status: text('status').notNull().default('active'), // active, past_due, cancelled
  paymentGateway: text('payment_gateway'), // razorpay, stripe
  gatewaySubscriptionId: text('gateway_subscription_id'),
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  updatedAt: text('updated_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [
  index('subscriptions_tenant_id_idx').on(table.tenantId),
  index('subscriptions_status_idx').on(table.status),
]);

// --- WordPress Sites ---
export const wordpressSites = sqliteTable('wordpress_sites', {
  id: text('id').primaryKey(), // UUIDv7
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  subdomain: text('subdomain').notNull(),
  wpAdminUrl: text('wp_admin_url'),
  containerId: text('container_id'),
  ociInstanceId: text('oci_instance_id'),
  status: text('status').notNull().default('provisioning'), // provisioning, active, suspended, deleted
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [
  uniqueIndex('wp_sites_subdomain_idx').on(table.subdomain),
  index('wp_sites_tenant_id_idx').on(table.tenantId),
]);

// --- Tenant Users (cross-tenant user lookup) ---
export const tenantUsers = sqliteTable('tenant_users', {
  id: text('id').primaryKey(), // UUIDv7
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  email: text('email').notNull(),
  phone: text('phone'),
  userId: text('user_id').notNull(), // references tenant DB users.id
  role: text('role').notNull(),
  isActive: integer('is_active').default(1),
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [
  uniqueIndex('tenant_users_email_tenant_idx').on(table.email, table.tenantId),
  index('tenant_users_email_idx').on(table.email),
  index('tenant_users_tenant_id_idx').on(table.tenantId),
  index('tenant_users_user_id_idx').on(table.userId),
]);
