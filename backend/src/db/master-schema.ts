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

// --- Subscription Payments ---
export const subscriptionPayments = sqliteTable('subscription_payments', {
  id: text('id').primaryKey(), // UUIDv7
  subscriptionId: text('subscription_id').notNull().references(() => subscriptions.id),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  amount: real('amount').notNull(),
  currency: text('currency').notNull().default('INR'),
  paymentMethod: text('payment_method').notNull(), // razorpay, stripe, manual, bank_transfer
  paymentReference: text('payment_reference'),
  status: text('status').notNull().default('success'), // success, failed, pending, refunded
  gatewayResponse: text('gateway_response'), // JSON
  notes: text('notes'),
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [
  index('sub_payments_sub_id_idx').on(table.subscriptionId),
  index('sub_payments_tenant_id_idx').on(table.tenantId),
  index('sub_payments_status_idx').on(table.status),
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

// --- Tenant Feature Flags ---
export const tenantFeatureFlags = sqliteTable('tenant_feature_flags', {
  id: text('id').primaryKey(), // UUIDv7
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  featureKey: text('feature_key').notNull(),
  isEnabled: integer('is_enabled').notNull().default(1),
  updatedBy: text('updated_by'),
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [
  uniqueIndex('tenant_feature_flags_tenant_key_idx').on(table.tenantId, table.featureKey),
  index('tenant_feature_flags_tenant_idx').on(table.tenantId),
]);

// --- Tenant Usage Snapshots ---
export const tenantUsageSnapshots = sqliteTable('tenant_usage_snapshots', {
  id: text('id').primaryKey(), // UUIDv7
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  snapshotDate: text('snapshot_date').notNull(), // YYYY-MM-DD
  usersCount: integer('users_count').default(0),
  leadsCount: integer('leads_count').default(0),
  contactsCount: integer('contacts_count').default(0),
  itinerariesCount: integer('itineraries_count').default(0),
  invoicesCount: integer('invoices_count').default(0),
  storageMb: real('storage_mb').default(0),
  apiCalls: integer('api_calls').default(0),
  // AI/VoIP usage tracking
  aiRequests: integer('ai_requests').default(0),
  aiTokensUsed: integer('ai_tokens_used').default(0),
  aiCostUsd: real('ai_cost_usd').default(0),
  voipMinutes: integer('voip_minutes').default(0),
  voipCalls: integer('voip_calls').default(0),
  whatsappMessagesSent: integer('whatsapp_messages_sent').default(0),
  smsSent: integer('sms_sent').default(0),
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [
  uniqueIndex('usage_snapshots_tenant_date_idx').on(table.tenantId, table.snapshotDate),
  index('usage_snapshots_tenant_idx').on(table.tenantId),
  index('usage_snapshots_date_idx').on(table.snapshotDate),
]);

// --- Tenant Usage Caps ---
export const tenantUsageCaps = sqliteTable('tenant_usage_caps', {
  id: text('id').primaryKey(), // UUIDv7
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  capKey: text('cap_key').notNull(), // ai_actions_per_day, voip_minutes_per_month, etc.
  capValue: integer('cap_value').notNull(),
  currentUsage: integer('current_usage').default(0),
  resetPeriod: text('reset_period').default('monthly'), // daily, monthly
  lastResetAt: text('last_reset_at'),
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  updatedAt: text('updated_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [
  uniqueIndex('tenant_caps_tenant_key_idx').on(table.tenantId, table.capKey),
  index('tenant_caps_tenant_idx').on(table.tenantId),
]);

// --- Super Admins ---
export const superAdmins = sqliteTable('super_admins', {
  id: text('id').primaryKey(), // UUIDv7
  email: text('email').notNull(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('super_admin'), // super_admin, support, viewer
  isActive: integer('is_active').default(1),
  lastLoginAt: text('last_login_at'),
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [
  uniqueIndex('super_admins_email_idx').on(table.email),
]);

// --- Super Admin Login Log ---
export const superAdminLoginLog = sqliteTable('super_admin_login_log', {
  id: text('id').primaryKey(), // UUIDv7
  adminId: text('admin_id'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  success: integer('success').notNull(), // 0 or 1
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [
  index('sa_login_log_ip_idx').on(table.ipAddress),
  index('sa_login_log_admin_idx').on(table.adminId),
  index('sa_login_log_created_idx').on(table.createdAt),
]);

// --- Announcements ---
export const announcements = sqliteTable('announcements', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  target: text('target').notNull().default('all'), // all, specific
  targetTenantIds: text('target_tenant_ids'), // JSON array
  priority: text('priority').notNull().default('info'), // info, warning, critical
  isActive: integer('is_active').default(1),
  publishedAt: text('published_at'),
  expiresAt: text('expires_at'),
  createdBy: text('created_by').references(() => superAdmins.id),
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [
  index('announcements_active_idx').on(table.isActive),
  index('announcements_created_idx').on(table.createdAt),
]);

// --- Support Tickets ---
export const supportTickets = sqliteTable('support_tickets', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  subject: text('subject').notNull(),
  description: text('description').notNull(),
  status: text('status').notNull().default('open'), // open, in_progress, resolved, closed
  priority: text('priority').notNull().default('medium'), // low, medium, high, urgent
  assignedTo: text('assigned_to').references(() => superAdmins.id),
  createdByEmail: text('created_by_email'),
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  updatedAt: text('updated_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  resolvedAt: text('resolved_at'),
}, (table) => [
  index('support_tickets_tenant_idx').on(table.tenantId),
  index('support_tickets_status_idx').on(table.status),
  index('support_tickets_assigned_idx').on(table.assignedTo),
]);

// --- Support Ticket Replies ---
export const supportTicketReplies = sqliteTable('support_ticket_replies', {
  id: text('id').primaryKey(),
  ticketId: text('ticket_id').notNull().references(() => supportTickets.id),
  authorType: text('author_type').notNull(), // admin, tenant
  authorName: text('author_name').notNull(),
  body: text('body').notNull(),
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [
  index('ticket_replies_ticket_idx').on(table.ticketId),
]);

// --- Super Admin Audit Log ---
export const superAdminAuditLog = sqliteTable('super_admin_audit_log', {
  id: text('id').primaryKey(),
  adminId: text('admin_id').references(() => superAdmins.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull().default('system'),
  entityId: text('entity_id'),
  details: text('details'), // JSON
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [
  index('audit_log_admin_idx').on(table.adminId),
  index('audit_log_action_idx').on(table.action),
  index('audit_log_entity_idx').on(table.entityType),
  index('audit_log_created_idx').on(table.createdAt),
]);

// --- Tenant API Keys ---
export const tenantApiKeys = sqliteTable('tenant_api_keys', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  apiKey: text('api_key').notNull(),
  label: text('label'),
  isActive: integer('is_active').default(1),
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [
  uniqueIndex('tenant_api_keys_key_idx').on(table.apiKey),
  index('tenant_api_keys_tenant_idx').on(table.tenantId),
]);

// --- Webhook Log ---
export const webhookLog = sqliteTable('webhook_log', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  apiKey: text('api_key'),
  source: text('source'),
  payload: text('payload'),
  status: text('status').notNull().default('success'),
  errorMessage: text('error_message'),
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [
  index('webhook_log_tenant_idx').on(table.tenantId),
  index('webhook_log_created_idx').on(table.createdAt),
]);

// --- Tenant Users (cross-tenant user lookup) ---
// --- Quotation Links (cross-tenant share links for public itinerary view) ---
export const quotationLinks = sqliteTable('quotation_links', {
  token: text('token').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  itineraryId: text('itinerary_id').notNull(),
  isActive: integer('is_active').notNull().default(1),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [
  index('idx_quotation_links_itinerary').on(table.itineraryId),
  index('idx_quotation_links_tenant').on(table.tenantId),
]);

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
