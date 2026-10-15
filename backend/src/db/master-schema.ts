import { sqliteTable, text, real, integer, uniqueIndex, index, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// --- Tenants ---
export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(), // UUIDv7
  companyName: text('company_name').notNull(),
  subdomain: text('subdomain').notNull(),
  d1DatabaseId: text('d1_database_id'),
  dbBinding: text('db_binding'), // Worker binding name TENANT_DB_<32 hex>
  shard: text('shard').notNull().default('s1'),
  logoUrl: text('logo_url'),
  plan: text('plan').notNull().default('trial'), // trial, basic, pro, enterprise
  status: text('status').notNull().default('trial'), // trial, active, suspended, expired
  settings: text('settings'), // JSON text
  maxUsers: integer('max_users').default(5),
  provisioningStatus: text('provisioning_status').notNull().default('active'), // creating_db, migrating, seeding, binding, active, pending_deploy, failed
  provisioningError: text('provisioning_error'),
  ownerEmail: text('owner_email'),
  ownerName: text('owner_name'),
  country: text('country'),
  createdByAdmin: text('created_by_admin'),
  region: text('region').notNull().default('in'), // in, eu, uk, us, au, gulf
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  updatedAt: text('updated_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [
  uniqueIndex('tenants_subdomain_idx').on(table.subdomain),
  uniqueIndex('tenants_db_binding_idx').on(table.dbBinding).where(sql`${table.dbBinding} IS NOT NULL`),
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
  periodKey: text('period_key'),
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
  email: text('email'), // R111 (0017): the email that was tried, for lockout counting
  event: text('event').notNull().default('login'), // login, logout
}, (table) => [
  index('sa_login_log_email_idx').on(table.email, table.createdAt),
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
  // Legacy plaintext key; '' once hashed (R108). New keys are only ever stored as keyHash.
  apiKey: text('api_key').notNull(),
  keyHash: text('key_hash'), // lowercase hex SHA-256 of the key
  keyPrefix: text('key_prefix'), // first 8 characters, for display and the request log
  label: text('label'),
  isActive: integer('is_active').default(1),
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  lastUsedAt: text('last_used_at'),
}, (table) => [
  uniqueIndex('tenant_api_keys_hash_idx').on(table.keyHash),
  index('tenant_api_keys_tenant_idx').on(table.tenantId),
]);

// --- Webhook Log ---
export const webhookLog = sqliteTable('webhook_log', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  apiKey: text('api_key'), // key prefix only (R108)
  source: text('source'),
  payload: text('payload'),
  status: text('status').notNull().default('success'),
  errorMessage: text('error_message'),
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [
  index('webhook_log_tenant_idx').on(table.tenantId),
  index('webhook_log_created_idx').on(table.createdAt),
]);

// --- Tenant Channel Addresses (inbound gateway: receiving number / mailbox -> tenant) ---
export const tenantChannelAddresses = sqliteTable('tenant_channel_addresses', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  channel: text('channel').notNull(), // whatsapp, sms, email, voice
  address: text('address').notNull(), // E.164 number or lower-cased email address
  provider: text('provider'), // twilio, plivo, sendgrid
  label: text('label'),
  isActive: integer('is_active').default(1),
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  updatedAt: text('updated_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [
  uniqueIndex('tenant_channel_addresses_channel_address_idx').on(table.channel, table.address),
  index('tenant_channel_addresses_tenant_idx').on(table.tenantId),
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

// --- Plan catalogue (R109, migration 0015) ---
export const plans = sqliteTable('plans', {
  key: text('key').primaryKey(), // trial, basic, pro, enterprise
  name: text('name').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  isPublic: integer('is_public').notNull().default(1),
  trialDays: integer('trial_days').notNull().default(0),
  isActive: integer('is_active').notNull().default(1),
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  updatedAt: text('updated_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
});

export const planPrices = sqliteTable('plan_prices', {
  id: text('id').primaryKey(), // UUIDv7
  planKey: text('plan_key').notNull().references(() => plans.key),
  market: text('market').notNull(), // IN, WEST, GULF, SG, MY_TH, LK_NP_BD
  currency: text('currency').notNull(),
  yearlyPrice: real('yearly_price').notNull(),
  includedUsers: integer('included_users').notNull(),
  extraUserYearlyPrice: real('extra_user_yearly_price'),
  isActive: integer('is_active').notNull().default(1),
  validFrom: text('valid_from').notNull(),
}, (table) => [
  index('plan_prices_plan_market_idx').on(table.planKey, table.market, table.isActive),
]);

export const planFeatures = sqliteTable('plan_features', {
  planKey: text('plan_key').notNull().references(() => plans.key),
  featureKey: text('feature_key').notNull(),
}, (table) => [primaryKey({ columns: [table.planKey, table.featureKey] })]);

export const planAllowances = sqliteTable('plan_allowances', {
  planKey: text('plan_key').notNull().references(() => plans.key),
  allowanceKey: text('allowance_key').notNull(), // ai_credits, sms, whatsapp, otp, call_minutes, email
  monthlyAmount: integer('monthly_amount').notNull().default(0),
}, (table) => [primaryKey({ columns: [table.planKey, table.allowanceKey] })]);

export const commUnitCosts = sqliteTable('comm_unit_costs', {
  id: text('id').primaryKey(), // UUIDv7
  channel: text('channel').notNull(), // sms, whatsapp, otp, call_minute, phone_number
  market: text('market').notNull(),
  provider: text('provider').notNull(),
  unitCost: real('unit_cost').notNull(),
  currency: text('currency').notNull(),
  marginPct: real('margin_pct').notNull().default(20),
  effectiveFrom: text('effective_from').notNull(),
  isActive: integer('is_active').notNull().default(1),
});

export const addonProducts = sqliteTable('addon_products', {
  key: text('key').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull(), // extra_user, ai_credit_pack, comm_pack
  channel: text('channel'), // sms, whatsapp, otp, call_minute for comm packs
  units: integer('units').notNull().default(1),
  fixedPrice: real('fixed_price'), // NULL = computed from comm_unit_costs
  currency: text('currency').notNull(),
  market: text('market').notNull(),
  isActive: integer('is_active').notNull().default(1),
});

export const tenantAddons = sqliteTable('tenant_addons', {
  id: text('id').primaryKey(), // UUIDv7
  tenantId: text('tenant_id').notNull(),
  productKey: text('product_key').notNull(),
  quantity: integer('quantity').notNull().default(1),
  unitsGranted: integer('units_granted').notNull().default(0),
  periodKey: text('period_key'), // NULL = recurring (extra users); yyyy-mm for packs
  source: text('source').notNull().default('super_admin_grant'), // super_admin_grant, purchase
  grantedBy: text('granted_by'),
  reference: text('reference'),
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [index('tenant_addons_tenant_period_idx').on(table.tenantId, table.periodKey)]);

export const catalogueNotes = sqliteTable('catalogue_notes', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// --- Impersonation sessions (R111, migration 0017) ---
export const impersonationSessions = sqliteTable('impersonation_sessions', {
  id: text('id').primaryKey(), // UUIDv7, also the sid claim of the impersonation token
  superAdminId: text('super_admin_id').notNull().references(() => superAdmins.id),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  userId: text('user_id').notNull(),
  userEmail: text('user_email'),
  reason: text('reason').notNull(),
  startedAt: text('started_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  expiresAt: text('expires_at').notNull(),
  endedAt: text('ended_at'),
  endedBy: text('ended_by'),
}, (table) => [
  index('impersonation_sessions_tenant_idx').on(table.tenantId),
  index('impersonation_sessions_admin_idx').on(table.superAdminId),
]);

// --- Communication caps (R110, migration 0016) ---
export const otpRequests = sqliteTable('otp_requests', {
  id: text('id').primaryKey(), // UUIDv7
  tenantId: text('tenant_id'),
  destinationHash: text('destination_hash').notNull(), // SHA-256 of the digits; the number itself is never stored
  ip: text('ip'),
  purpose: text('purpose').notNull().default('login'),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [
  index('otp_requests_dest_idx').on(table.destinationHash, table.createdAt),
  index('otp_requests_ip_idx').on(table.ip, table.createdAt),
]);

export const usageAlerts = sqliteTable('usage_alerts', {
  tenantId: text('tenant_id').notNull(),
  capKey: text('cap_key').notNull(),
  periodKey: text('period_key').notNull(),
  threshold: integer('threshold').notNull(), // 80 or 100
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [
  primaryKey({ columns: [table.tenantId, table.capKey, table.periodKey, table.threshold] }),
]);

export const meteredEvents = sqliteTable('metered_events', {
  eventKey: text('event_key').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  channel: text('channel').notNull(),
  units: integer('units').notNull(),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
});

// --- Landing page enquiries (R116, migration 0018) ---
export const platformEnquiries = sqliteTable('platform_enquiries', {
  id: text('id').primaryKey(), // UUIDv7
  kind: text('kind').notNull().default('contact'), // contact | demo | signup
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  company: text('company'),
  country: text('country'),
  agentsCount: integer('agents_count'),
  message: text('message'),
  sourceUrl: text('source_url'),
  ipHash: text('ip_hash'),
  status: text('status').notNull().default('new'), // new | contacted | converted | spam
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [
  index('platform_enquiries_status_idx').on(table.status, table.createdAt),
  index('platform_enquiries_email_idx').on(table.email, table.createdAt),
]);

// --- Daily exchange rates (R202, migration 0019) ---
export const exchangeRates = sqliteTable('exchange_rates', {
  base: text('base').notNull(),
  quote: text('quote').notNull(),
  rate: real('rate').notNull(), // units of quote per one unit of base
  asOf: text('as_of').notNull(), // YYYY-MM-DD
  source: text('source').notNull().default('open.er-api.com'),
  fetchedAt: text('fetched_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
}, (table) => [
  primaryKey({ columns: [table.base, table.quote, table.asOf] }),
  index('exchange_rates_pair_idx').on(table.base, table.quote, table.asOf),
]);
