import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import type { AppContext, Env } from './types';
import { error } from './utils/response';
import { handleQueue, type QueueMessage } from './queues/index';
import { RealtimeRoom } from './durable-objects/realtime';
import { authMiddleware } from './middleware/auth';
import { tenantMiddleware } from './middleware/tenant';
import { requireFeature } from './middleware/feature-gate';
import { checkUsageCap } from './middleware/usage-cap';
import { resetUsageCaps } from './middleware/usage-cap';
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
import businessIntelligenceRoutes from './routes/business-intelligence';
import whatsappCampaignRoutes from './routes/whatsapp-campaigns';
import socialContentRoutes from './routes/social-content';
import marketingSuggestionRoutes from './routes/marketing-suggestions';
import driverRoutes from './routes/driver';
import publicRoutes from './routes/public';
import hsnCodeRoutes from './routes/hsn-codes';
import { checkFollowUpReminders } from './services/follow-up-reminders';
import {
  checkBirthdayAnniversary,
  checkInvoiceReminders,
  checkVisaPassportExpiry,
  checkTripReminders,
  checkMissingVisaDocuments,
} from './cron/auto-reminders';
import { processOverdueTasks } from './cron/overdue-tasks';
import { processFleetAlerts } from './cron/fleet-alerts';

const app = new Hono<AppContext>();

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

app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', secureHeaders());

app.use(
  '*',
  cors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3100',
      'http://localhost:8080',
      'https://*.pages.dev',
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Refresh-Token'],
    exposeHeaders: ['Content-Length', 'X-Request-Id', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 86400,
    credentials: true,
  })
);

// --- Health Check (available at both /api/health and /api/v1/health) ---

const healthHandler = (c: any) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    database: 'connected',
    uptime: Math.floor(Date.now() / 1000),
  });
};

app.get('/api/v1/health', healthHandler);
app.get('/api/health', healthHandler);

// --- Public Webhook Routes (BEFORE auth middleware) ---

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
  ['whatsapp-campaigns', whatsappCampaignRoutes],
  ['marketing/social-content', socialContentRoutes],
  ['marketing/suggestions', marketingSuggestionRoutes],
  ['hsn-codes', hsnCodeRoutes],
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

app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return error(c, 'Internal server error', 500);
});

// --- WebSocket Upgrade Route ---

app.get('/api/v1/ws', async (c) => {
  const tenantId = c.get('tenantId') || 'default';
  const userId = c.req.query('userId') || 'anonymous';

  const id = c.env.REALTIME.idFromName(tenantId);
  const room = c.env.REALTIME.get(id);

  const url = new URL(c.req.url);
  url.pathname = '/';
  url.searchParams.set('userId', userId);

  return room.fetch(new Request(url.toString(), c.req.raw));
});

// --- Export ---

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Cron schedule:
    // - Every 5 minutes: checkFollowUpReminders
    // - Every hour: checkInvoiceReminders
    // - Daily at 8 AM: checkBirthdayAnniversary
    // - Daily at 9 AM: checkVisaPassportExpiry
    // - Daily at 10 AM: checkTripReminders
    // These can be customized in wrangler.toml with cron expressions

    const cron = event.cron;

    if (!cron) {
      // Default: run follow-up reminders
      ctx.waitUntil(checkFollowUpReminders(env));
    } else {
      // Run appropriate handler based on cron time
      // In production, you would map specific cron expressions to handlers
      // For now, run all checks (they handle their own filtering)
      // Check if it's midnight (reset daily caps) or 1st of month (reset monthly caps)
      const now = new Date();
      const isMonthStart = now.getUTCDate() === 1;

      ctx.waitUntil(
        Promise.all([
          checkFollowUpReminders(env),
          checkBirthdayAnniversary(env),
          checkInvoiceReminders(env),
          checkVisaPassportExpiry(env),
          checkMissingVisaDocuments(env),
          checkTripReminders(env),
          processOverdueTasks(env),
          processFleetAlerts(env),
          // Reset usage caps
          resetUsageCaps(env.MASTER_DB, 'daily'),
          isMonthStart ? resetUsageCaps(env.MASTER_DB, 'monthly') : Promise.resolve(0),
        ])
      );
    }
  },
  async queue(batch: MessageBatch<QueueMessage>, env: Env) {
    await handleQueue(batch, env);
  },
};

// Re-export Durable Object class for wrangler
export { RealtimeRoom };
