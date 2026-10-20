import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '../utils/validator';
import type { AppContext, Env } from '../types';
import { success, error } from '../utils/response';
import { actorFrom, logAdminAction } from '../services/admin/audit';
import { cloudflareAvailable } from '../services/mail/providers/cloudflare';
import { providerFor, type MailKind } from '../services/mail/provider';
import { getEmailSettings, updateEmailSettings, type EmailSettings } from '../services/mail/settings';
import { listPlatformMail, PLATFORM_EMAIL_LOG_RETENTION_DAYS } from '../services/mail/platform-log';
import { inboundDomain } from '../services/mail/reply-token';
import { sendTransactional } from '../services/mail/transactional';
import { emailFrom } from '../utils/app-urls';
import { isTestMode } from '../utils/test-mode';

/**
 * Email routing for the platform (R132), mounted at /admin/email (super admin only, audited):
 *   GET  /            the effective settings (with where each comes from), the routing per mail kind, provider status
 *   PUT  /settings    { systemProvider?, fallback?, inboundEnabled?, reason }   a reason is required; takes effect within a minute
 *   POST /test        { to }   send a test email through platform system mail (local stacks: the outbox)
 *   GET  /log         the platform delivery log (addresses are masked), newest first; ?status=&limit=&before=
 */
export const emailAdminRoutes = new Hono<AppContext>();

const KIND_ROWS: Array<{ kind: MailKind; label: string; why: string }> = [
  { kind: 'platform_system', label: 'Platform system mail', why: 'Welcome, invitations, password resets, receipts, alerts. Follows the setting below.' },
  { kind: 'agency_transactional', label: 'Agency transactional mail', why: 'Agency mail to its customers (Communication Hub, invoices, vouchers, reminders). Always SendGrid so every agency sender, reply address and delivery event stays consistent.' },
  { kind: 'agency_marketing', label: 'Agency marketing mail', why: 'Campaigns. Always SendGrid: Cloudflare sending is transactional only and has no bulk, unsubscribe or event support. No setting can change this.' },
];

function describe(env: Env, settings: EmailSettings) {
  return {
    settings: {
      systemProvider: settings.systemProvider,
      fallback: settings.fallback,
      inboundEnabled: settings.inboundEnabled,
      source: settings.source,
    },
    routing: KIND_ROWS.map((r) => {
      const first = providerFor(env, r.kind, settings).name;
      const wantedCloudflare = r.kind === 'platform_system' && settings.systemProvider === 'cloudflare';
      return {
        kind: r.kind,
        label: r.label,
        why: r.why,
        provider: first,
        mayUseCloudflare: r.kind === 'platform_system',
        fallbackToSendgrid: r.kind === 'platform_system' && settings.fallback && wantedCloudflare,
        note: wantedCloudflare && first === 'sendgrid' ? 'Cloudflare is selected but this Worker has no send_email binding, so SendGrid sends it.' : null,
      };
    }),
    status: {
      cloudflareBinding: cloudflareAvailable(env),
      sendgridKey: !!env.SENDGRID_API_KEY,
      sendgridEventWebhook: !!env.SENDGRID_WEBHOOK_PUBLIC_KEY,
      inboundDomain: inboundDomain(env),
      fromAddress: emailFrom(env).email,
      testMode: isTestMode(env),
      variableProvider: env.EMAIL_SYSTEM_PROVIDER ?? null,
    },
    logRetentionDays: PLATFORM_EMAIL_LOG_RETENTION_DAYS,
  };
}

emailAdminRoutes.get('/', async (c) => {
  const settings = await getEmailSettings(c.env);
  return success(c, describe(c.env, settings));
});

const settingsSchema = z
  .object({
    systemProvider: z.enum(['cloudflare', 'sendgrid']).optional(),
    fallback: z.boolean().optional(),
    inboundEnabled: z.boolean().optional(),
    reason: z.string().trim().min(3, 'A reason is required').max(500),
  })
  .refine((v) => v.systemProvider !== undefined || v.fallback !== undefined || v.inboundEnabled !== undefined, { message: 'Nothing to change' });

emailAdminRoutes.put('/settings', zValidator('json', settingsSchema), async (c) => {
  const body = c.req.valid('json');
  const actor = actorFrom(c);
  const { before, after } = await updateEmailSettings(
    c.env,
    { systemProvider: body.systemProvider, fallback: body.fallback, inboundEnabled: body.inboundEnabled },
    actor.email,
  );
  const pick = (s: EmailSettings) => ({ systemProvider: s.systemProvider, fallback: s.fallback, inboundEnabled: s.inboundEnabled });
  await logAdminAction(c.env, actor, 'email.settings_update', null, pick(before), pick(after), {
    entityType: 'email_settings',
    entityId: 'platform',
    extra: { reason: body.reason },
  });
  return success(c, describe(c.env, after));
});

const testSchema = z.object({ to: z.string().trim().email().max(254) });

emailAdminRoutes.post('/test', zValidator('json', testSchema), async (c) => {
  const { to } = c.req.valid('json');
  const result = await sendTransactional(c.env, { to, template: 'console_test' });
  await logAdminAction(c.env, actorFrom(c), 'email.test_send', null, null, { delivered: result.delivered, via: result.via }, {
    entityType: 'email_settings',
    entityId: 'platform',
  });
  if (!result.delivered) return error(c, result.error ?? 'The test email could not be sent', 502);
  return success(c, { delivered: true, via: result.via, fallbackFrom: result.fallbackFrom ?? null, outbox: result.via === 'outbox' });
});

emailAdminRoutes.get('/log', async (c) => {
  const status = c.req.query('status');
  const limit = Number(c.req.query('limit') ?? 50);
  const rows = await listPlatformMail(c.env, {
    status: status && ['sent', 'fallback', 'failed'].includes(status) ? status : undefined,
    limit: Number.isFinite(limit) ? limit : 50,
    before: c.req.query('before') || undefined,
  });
  return success(c, { rows, retentionDays: PLATFORM_EMAIL_LOG_RETENTION_DAYS });
});
