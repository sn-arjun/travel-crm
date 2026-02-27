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
import pushTokenRoutes from './routes/push-tokens';
import preferencesRoutes from './routes/notification-preferences';
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
import driverRoutes from './routes/driver';
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

// --- Testing Routes (Protected internally by TEST_MODE flag) ---
app.route('/api/v1/test', testRoutes);
app.route('/api/test', testRoutes);

// --- Driver App Routes (own auth middleware — BEFORE global CRM auth) ---
app.route('/api/v1/driver', driverRoutes);
app.route('/api/driver', driverRoutes);

// --- Auth & Tenant Middleware (both /api/v1/* and /api/*) ---

app.use('/api/v1/*', authMiddleware);
app.use('/api/v1/*', tenantMiddleware);
app.use('/api/*', authMiddleware);
app.use('/api/*', tenantMiddleware);

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
