import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import type { AppContext, Env } from './types';
import { error } from './utils/response';
import { resolveCorsOrigin } from './utils/cors';
import { apiRateLimit } from './middleware/rate-limit';
import { handleQueue, type QueueMessage } from './queues/index';
import { requestLogger, log } from './utils/logger';
import { reportError } from './services/error-reporter';
import { checkMasterDb, runDeepHealth } from './services/health';
import { authenticateSuperAdmin } from './middleware/require-super-admin';
import { timingSafeEqual } from './middleware/provider-signature';
import { RealtimeRoom } from './durable-objects/realtime';
import { authMiddleware } from './middleware/auth';
import { tenantMiddleware } from './middleware/tenant';
import { requireFeature } from './middleware/feature-gate';
import { checkUsageCap } from './middleware/usage-cap';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import activityLogRoutes from './routes/activity-logs';
import settingsRoutes from './routes/settings';
import contactRoutes from './routes/contacts';
import leadRoutes from './routes/leads';
import followUpRoutes from './routes/follow-ups';
import reportsRoutes from './routes/reports';
import notificationsRoutes from './routes/notifications';
import itineraryRoutes from './routes/itineraries';
import templateRoutes from './routes/itinerary-templates';
import rateCardRoutes from './routes/rate-cards';
import fileRoutes from './routes/files';
import exchangeRateRoutes from './routes/exchange-rates';
import invoiceRoutes from './routes/invoices';
import paymentRoutes from './routes/payments';
import creditNoteRoutes, { debitNoteRoutes } from './routes/credit-notes';
import communicationRoutes from './routes/communications';
import messageTemplateRoutes from './routes/templates';
import campaignRoutes from './routes/campaigns';
import webhookRoutes from './routes/webhooks';
import leadWebhookRoutes from './routes/webhook';
import inboundRoutes from './routes/inbound';
import integrationRoutes from './routes/integrations';
import assistantRoutes from './routes/assistant';
import automationRoutes from './routes/automations';
import { setRootApp } from './app-ref';
import { verifyAccessToken } from './utils/jwt';
import pushTokenRoutes from './routes/push-tokens';
import preferencesRoutes from './routes/notification-preferences';
import documentRoutes from './routes/documents';
import bookmarkRoutes from './routes/bookmarks';
import stickyNoteRoutes from './routes/sticky-notes';
import voucherRoutes from './routes/vouchers';
import supplierRoutes from './routes/suppliers';
import travellerRoutes from './routes/travellers';
import visaRoutes from './routes/visa';
import importRoutes from './routes/imports';
import exportRoutes from './routes/exports';
import { registerSalesReports } from './services/reports/sales-reports';
import { registerFinancialReports } from './services/reports/financial-reports';
import { registerLeadReports } from './services/reports/lead-reports';
import { registerCustomerReports } from './services/reports/customer-reports';
import { registerTeamReports } from './services/reports/team-reports';
import { registerFleetReports } from './services/reports/fleet-reports';
import { registerSupplierReports } from './services/reports/supplier-reports';
import { registerVisaReports } from './services/reports/visa-reports';
import { registerMarketingReports } from './services/reports/marketing-reports';
import testRoutes from './routes/test';
import plannerRoutes from './routes/planner';
import taskRoutes from './routes/tasks';
import mktFlyerTemplateRoutes from './routes/marketing/flyer-templates';
import mktImageRoutes from './routes/marketing/images';
import mktBrandingRoutes from './routes/marketing/branding';
import mktSegmentRoutes from './routes/marketing/segments';
import mktCampaignRoutes from './routes/marketing/campaigns';
import mktFlyerRoutes from './routes/marketing/flyers';
import mktOptOutRoutes from './routes/marketing/opt-out';
import fleetRoutes from './routes/fleet';
import voipRoutes from './routes/voip';
import callRoutes from './routes/calls';
import voipCallbackRoutes from './routes/voip-callbacks';
import transcriptRoutes from './routes/transcripts';
import aiExtractionRoutes from './routes/ai-extractions';
import aiAssistantRoutes from './routes/ai-assistant';
import aiIntelligenceRoutes from './routes/ai-intelligence';
import chatbotRoutes from './routes/chatbot';
import { publicChatbotRoutes, chatbotWebhookRoutes } from './routes/public-chatbot';
import { publicEnquiryRoutes, adminEnquiryRoutes } from './routes/public-enquiries';
import businessIntelligenceRoutes from './routes/business-intelligence';
import aiSettingsRoutes from './routes/ai-settings';
import whatsappCampaignRoutes from './routes/whatsapp-campaigns';
import socialContentRoutes from './routes/social-content';
import marketingSuggestionRoutes from './routes/marketing-suggestions';
import festivalCampaignRoutes from './routes/festival-campaigns';
import driverRoutes from './routes/driver';
import publicRoutes from './routes/public';
import hsnCodeRoutes from './routes/hsn-codes';
import adminRoutes from './routes/admin';
import adminTenantsRoutes from './routes/admin-tenants';
import adminAuthRoutes from './routes/admin-auth';
import { impersonationActivityLog } from './services/admin/impersonation';
import { dispatchScheduled } from './cron/dispatch';

const app = new Hono<AppContext>();

// Automations perform their actions by calling this app's own API in-process.
setRootApp(app);

// Register reports on startup
registerSalesReports();
registerFinancialReports();
registerLeadReports();
registerCustomerReports();
registerTeamReports();
registerFleetReports();
registerSupplierReports();
registerVisaReports();
registerMarketingReports();

// --- Global Middleware ---

// Production guards: a deployment must never run with test shortcuts or a shared database by accident.
app.use('*', async (c, next) => {
  const isProduction = c.env.ENVIRONMENT === 'production';
  if (isProduction && c.env.TEST_MODE === 'true') { // raw check on purpose: refuse to serve at all
    return c.json({ success: false, error: { code: 'MISCONFIGURED', message: 'Service unavailable: test mode is enabled in production' } }, 503);
  }
  if (isProduction && c.env.TENANCY_MODE === 'single' && c.env.ALLOW_SINGLE_TENANT_PRODUCTION !== 'true') {
    return c.json({ success: false, error: { code: 'MISCONFIGURED', message: 'Service unavailable: single-tenant mode is not allowed in production' } }, 503);
  }
  return next();
});

app.use('*', requestLogger);
app.use('*', prettyJSON());
app.use('*', secureHeaders());

app.use(
  '*',
  cors({
    // The website chat widget runs on agencies' own websites: its public mount reflects the caller's origin and
    // the route itself enforces each agency's allow-list (no cookies or staff credentials are involved there).
    origin: (origin, c) => (/^\/api(\/v1)?\/public\/chatbot\//.test(c.req.path) ? origin || null : resolveCorsOrigin(origin, c.env as any)),
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Refresh-Token', 'X-Tenant-Id'],
    exposeHeaders: ['Content-Length', 'X-Request-Id', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 86400,
    credentials: true,
  })
);

// --- Health Check (available at both /api/health and /api/v1/health) ---

// Public and cheap: one SELECT 1 on the registry database, so a dead database is visible to uptime monitors.
const healthHandler = async (c: any) => {
  const db = await checkMasterDb(c.env);
  return c.json(
    {
      status: db.ok ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: c.env.APP_VERSION || '1.0.0',
      database: db.ok ? 'connected' : 'unreachable',
      uptime: Math.floor(Date.now() / 1000),
    },
    db.ok ? 200 : 503,
  );
};

// Deep check (MASTER_DB, KV, R2 with latencies): a super admin token or the HEALTH_TOKEN secret
// (X-Health-Token header or Bearer). 503 when any dependency fails. Results never include error text.
const deepHealthHandler = async (c: any) => {
  const configured = c.env.HEALTH_TOKEN as string | undefined;
  const presented = c.req.header('X-Health-Token') || c.req.header('Authorization')?.replace(/^Bearer /, '') || '';
  const tokenOk = !!configured && presented !== '' && timingSafeEqual(presented, configured);
  if (!tokenOk) {
    const denied = await authenticateSuperAdmin(c);
    if (denied) return denied;
  }
  const result = await runDeepHealth(c.env);
  return c.json(result, result.status === 'ok' ? 200 : 503);
};

app.get('/api/v1/health', healthHandler);
app.get('/api/health', healthHandler);
app.get('/api/v1/health/deep', deepHealthHandler);
app.get('/api/health/deep', deepHealthHandler);

// --- Public Webhook Routes (BEFORE auth middleware) ---

// Inbound gateway: WhatsApp, SMS, email and website form (provider-signed or API-key authenticated)
// Chatbot: WhatsApp incoming (Twilio-signed) and the website widget (keyed by widget key, no login)
app.route('/api/v1/webhooks/chatbot', chatbotWebhookRoutes);
app.route('/api/webhooks/chatbot', chatbotWebhookRoutes);
app.route('/api/v1/public/chatbot', publicChatbotRoutes);
app.route('/api/public/chatbot', publicChatbotRoutes);
app.route('/api/v1/public/enquiries', publicEnquiryRoutes);
app.route('/api/public/enquiries', publicEnquiryRoutes);

app.route('/api/v1/webhooks/inbound', inboundRoutes);
app.route('/api/webhooks/inbound', inboundRoutes);
app.route('/api/v1/webhooks', webhookRoutes);
app.route('/api/webhooks', webhookRoutes);
app.route('/api/v1', leadWebhookRoutes);
app.route('/api', leadWebhookRoutes);

// --- VoIP Callback Routes (public, Twilio signature validated) ---
app.route('/api/v1/voip', voipCallbackRoutes);
app.route('/api/voip', voipCallbackRoutes);

// --- Testing Routes (Protected internally by TEST_MODE flag) ---
app.route('/api/v1/test', testRoutes);
app.route('/api/test', testRoutes);

// --- Driver App Routes (own auth middleware — BEFORE global CRM auth) ---
app.route('/api/v1/driver', driverRoutes);
app.route('/api/driver', driverRoutes);

// --- Public Quotation Routes (no auth required) ---
app.route('/api/v1/public', publicRoutes);
app.route('/api/public', publicRoutes);

// --- Auth & Tenant Middleware (both /api/v1/* and /api/*) ---

app.use('/api/v1/*', authMiddleware);
app.use('/api/v1/*', tenantMiddleware);
app.use('/api/*', authMiddleware);
app.use('/api/*', tenantMiddleware);
// Requests made with a support (impersonation) token are recorded in the agency's activity log (R111).
app.use('/api/*', impersonationActivityLog);

// Per-user API limit (600/min) after auth; /api/* also covers /api/v1/*, so it is counted once.
app.use('/api/*', apiRateLimit);

// --- Feature Gates & Usage Caps ---

// VoIP
for (const prefix of ['/api/v1', '/api']) {
  app.use(`${prefix}/voip/*`, requireFeature('voip_calling'));
  app.use(`${prefix}/calls/*`, requireFeature('voip_calling'));
}

// AI features
for (const prefix of ['/api/v1', '/api']) {
  app.use(`${prefix}/ai/extractions/*`, requireFeature('ai_extraction'));
  app.use(`${prefix}/ai/intelligence/*`, requireFeature('ai_intelligence'));
  app.use(`${prefix}/chatbot/*`, requireFeature('ai_chatbot'));
}

// WhatsApp campaigns
for (const prefix of ['/api/v1', '/api']) {
  app.use(`${prefix}/whatsapp-campaigns/*`, requireFeature('whatsapp_campaigns'));
}

// AI assistant — feature gate + usage cap
for (const prefix of ['/api/v1', '/api']) {
  app.use(`${prefix}/ai/*`, requireFeature('ai_assistant'));
  app.use(`${prefix}/ai/*`, checkUsageCap('ai_actions_per_day'));
}

// --- Route Registration (dual mount: /api/v1/ and /api/) ---

const routeMounts: Array<[string, typeof authRoutes]> = [
  ['auth', authRoutes],
  ['users', userRoutes],
  ['activity-logs', activityLogRoutes],
  ['settings', settingsRoutes],
  ['contacts', contactRoutes],
  ['leads', leadRoutes],
  ['follow-ups', followUpRoutes],
  ['followups', followUpRoutes],
  ['reports', reportsRoutes],
  ['notifications', notificationsRoutes],
  ['itineraries', itineraryRoutes],
  ['itinerary-templates', templateRoutes],
  ['rate-cards', rateCardRoutes],
  ['files', fileRoutes],
  ['exchange-rates', exchangeRateRoutes],
  ['invoices', invoiceRoutes],
  ['payments', paymentRoutes],
  ['credit-notes', creditNoteRoutes],
  ['debit-notes', debitNoteRoutes],
  ['communications', communicationRoutes],
  ['message-templates', messageTemplateRoutes],
  ['templates', messageTemplateRoutes],
  ['campaigns', campaignRoutes],
  ['push-tokens', pushTokenRoutes],
  ['notification-preferences', preferencesRoutes],
  ['documents', documentRoutes],
  ['bookmarks', bookmarkRoutes],
  ['sticky-notes', stickyNoteRoutes],
  ['vouchers', voucherRoutes],
  ['suppliers', supplierRoutes],
  ['travellers', travellerRoutes],
  ['visa', visaRoutes],
  ['events', plannerRoutes],
  ['tasks', taskRoutes],
  ['imports', importRoutes],
  ['exports', exportRoutes],
  ['marketing/flyer-templates', mktFlyerTemplateRoutes],
  ['marketing/images', mktImageRoutes],
  ['marketing/branding', mktBrandingRoutes],
  ['marketing/segments', mktSegmentRoutes],
  ['marketing/campaigns', mktCampaignRoutes],
  ['marketing/flyers', mktFlyerRoutes],
  ['marketing/opt-out', mktOptOutRoutes],
  ['fleet', fleetRoutes],
  ['voip', voipRoutes],
  ['calls', callRoutes],
  ['transcripts', transcriptRoutes],
  ['ai/extractions', aiExtractionRoutes],
  ['ai', aiAssistantRoutes],
  ['ai/intelligence', aiIntelligenceRoutes],
  ['chatbot', chatbotRoutes],
  ['ai/bi', businessIntelligenceRoutes],
  ['ai/settings', aiSettingsRoutes],
  ['whatsapp-campaigns', whatsappCampaignRoutes],
  ['marketing/social-content', socialContentRoutes],
  ['marketing/suggestions', marketingSuggestionRoutes],
  ['marketing/festivals', festivalCampaignRoutes],
  ['hsn-codes', hsnCodeRoutes],
  ['integrations', integrationRoutes],
  ['assistant', assistantRoutes],
  ['automations', automationRoutes],
  ['admin/auth', adminAuthRoutes],
  ['admin/tenants', adminTenantsRoutes],
  ['admin/enquiries', adminEnquiryRoutes],
  ['admin', adminRoutes],
];

for (const [path, handler] of routeMounts) {
  app.route(`/api/v1/${path}`, handler);
  app.route(`/api/${path}`, handler);
}

// --- 404 Handler ---

app.notFound((c) => {
  return error(c, 'Not found', 404);
});

// --- Global Error Handler ---

// Hono throws HTTPException for client errors raised by middleware and validators (for example a malformed
// JSON body -> 400). Those keep their own status and the standard error envelope; only unknown errors are 500.
// The message of a 5xx HTTPException is never echoed back, and no stack is ever returned.
app.onError((err, c) => {
  const report = (e: unknown) => {
    let waitUntil: ((p: Promise<unknown>) => void) | undefined;
    try { waitUntil = (p) => c.executionCtx.waitUntil(p); } catch { /* no execution context (tests) */ }
    reportError(c.env, e, { source: 'http', requestId: c.get('requestId'), tenantId: c.get('tenantId') }, waitUntil);
  };
  if (err instanceof HTTPException) {
    if (err.status >= 500) {
      report(err);
      return error(c, 'Internal server error', err.status);
    }
    return error(c, err.message || 'Bad request', err.status);
  }
  report(err);
  return error(c, 'Internal server error', 500);
});

// --- WebSocket Upgrade Route ---

// Browsers cannot set an Authorization header on a WebSocket, so the access token travels in the query string.
// It decides both who the connection is and which workspace room it joins; the userId parameter is not trusted.
app.get('/api/v1/ws', async (c) => {
  let payload;
  try {
    payload = await verifyAccessToken(c.req.query('token') ?? '', c.env.JWT_SECRET);
  } catch {
    return error(c, 'Invalid or expired token', 401);
  }
  const tenantId = payload.tenantId;
  const userId = payload.userId;

  const id = c.env.REALTIME.idFromName(tenantId);
  const room = c.env.REALTIME.get(id);

  const url = new URL(c.req.url);
  url.pathname = '/';
  url.searchParams.delete('token');
  url.searchParams.set('userId', userId);

  return room.fetch(new Request(url.toString(), c.req.raw));
});

// --- Export ---

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Three crons (wrangler.base.toml): every 5 minutes, hourly, daily at 00:30 UTC. scheduled() only
    // enqueues one TENANT_JOBS_QUEUE message per active agency (and resets usage caps on the daily
    // cron); the queue consumer runs the agency's jobs. See cron/dispatch.ts.
    ctx.waitUntil(
      dispatchScheduled(event, env).catch((err) => {
        reportError(env, err, { source: 'scheduled' });
        log('error', 'scheduled.failed', { cron: event.cron });
        throw err;
      }),
    );
  },
  async queue(batch: MessageBatch<QueueMessage>, env: Env) {
    try {
      await handleQueue(batch, env);
    } catch (err) {
      reportError(env, err, { source: 'queue' });
      log('error', 'queue.failed', { queue: batch.queue });
      throw err;
    }
  },
};

// Re-export Durable Object class for wrangler
export { RealtimeRoom };
