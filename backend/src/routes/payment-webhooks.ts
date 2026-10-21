/**
 * Payment webhooks for the AGENCY's own gateway account (R207). Public: the signature is the credential.
 *
 *   POST /api/v1/webhooks/payments/:tenantKey/:gateway     (:gateway = razorpay | stripe | mock)
 *
 * The agency pastes this URL into its Razorpay or Stripe dashboard. :tenantKey is an unguessable per-agency key
 * kept in the master registry (tenant_channel_addresses, channel payment_webhook), so the agency is known before
 * any tenant database is opened. Order of work:
 *
 *   1. find the agency from the URL; an unknown key, an unknown gateway and a gateway the agency has not
 *      connected all answer the same 404, so nothing reveals which agencies exist;
 *   2. verify the signature over the exact raw body with THAT agency's webhook secret, before parsing;
 *   3. claim the provider's event id in payment_events (INSERT OR IGNORE): a repeat changes nothing;
 *   4. a paid event records the payment through the same domain function as a manual payment, once.
 *
 * R142: the test gateway ('mock', local and test stacks only, 404 in production) adds a pay page the payment link opens:
 *
 *   GET  /api/v1/webhooks/payments/mock-pay/:tenantKey/:linkRef   the page
 *   POST /api/v1/webhooks/payments/mock-pay/:tenantKey/:linkRef   Pay, Fail or Cancel
 *
 * Pay signs a paid event with the mock secret and runs it through the same applyEvent() as a real webhook.
 *
 * This is separate from the platform's subscription billing webhooks (routes/billing.ts); it never touches
 * platform billing tables.
 */

import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import type { AppContext, Env } from '../types';
import { resolveTenantDb } from '../services/tenant-db';
import { emitEvent } from '../services/automation/events';
import { loadAccount, openCredentials, tenantForWebhookKey, isCredentialError } from '../services/payments/accounts';
import { isAgencyGateway, parseAgencyEvent, verifyAgencyWebhook, type AgencyPaymentEvent } from '../services/payments/agency-gateway';
import { recordInvoicePayment } from '../services/payments/record';
import { getTenantTimeZone, localDateString } from '../utils/tz';
import { formatMoney, loadLocaleContext } from '../utils/money';
import { MockGateway } from '../services/billing/mock';
import { mockAllowed } from '../services/billing/gateway';
import { loadMockPayLink, methodsForCurrency, signedMockPaidEvent } from '../services/payments/mock-agency';
import { agencyDefaultLanguage, t } from '../i18n';
import { escapeHtml } from '../services/mail/delivery';
import { appUrl } from '../utils/app-urls';

const paymentWebhookRoutes = new Hono<AppContext>();

paymentWebhookRoutes.use('/*', cors({ origin: '*' }));

/** One answer for every "this is not a webhook we serve": unknown key, unknown gateway, gateway not connected. */
function unknown(c: { json: (body: unknown, status: 404) => Response }): Response {
  return c.json({ success: false, error: { message: 'Not found' } }, 404);
}

async function claimEvent(db: D1Database, event: AgencyPaymentEvent): Promise<boolean> {
  const res = await db
    .prepare('INSERT OR IGNORE INTO payment_events (gateway, event_id, event_type, payment_id) VALUES (?, ?, ?, ?)')
    .bind(event.gateway, event.eventId, event.type, event.paymentRef)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/** Give a claim back after the work failed, so the provider's retry is processed instead of swallowed. */
async function releaseEvent(db: D1Database, event: AgencyPaymentEvent): Promise<void> {
  try {
    await db.prepare('DELETE FROM payment_events WHERE gateway = ? AND event_id = ?').bind(event.gateway, event.eventId).run();
  } catch (e) {
    console.error('[payment-webhooks] could not release event:', e instanceof Error ? e.message : 'error');
  }
}

type ApplyResult = { ok: true; extra: Record<string, unknown> } | { ok: false };

/**
 * Work a verified, parsed event: claim its id, then record a paid event once. Shared by the gateway webhook route and the
 * test gateway's pay page, so both go through the same single path. A failure gives the claim back (a retry is processed).
 */
async function applyEvent(env: Env, tenantId: string, db: D1Database, event: AgencyPaymentEvent): Promise<ApplyResult> {
  if (event.kind === 'ignored') return { ok: true, extra: { ignored: true } };
  if (!(await claimEvent(db, event))) return { ok: true, extra: { duplicate: true } };

  try {
    const invoice = event.invoiceId
      ? await db
          .prepare('SELECT id, contact_id, total, paid_amount, status, currency, payment_link_id FROM invoices WHERE id = ?')
          .bind(event.invoiceId)
          .first<{ id: string; contact_id: string; total: number; paid_amount: number; status: string; currency: string | null; payment_link_id: string | null }>()
      : null;
    if (!invoice) return { ok: true, extra: { ignored: true } };

    const isCurrentLink = !!event.linkId && event.linkId === invoice.payment_link_id;

    if (event.kind === 'closed') {
      if (isCurrentLink) {
        await db.prepare('UPDATE invoices SET payment_link_status = ?, updated_at = ? WHERE id = ?').bind(event.closedStatus ?? 'expired', new Date().toISOString(), invoice.id).run();
      }
      return { ok: true, extra: {} };
    }

    // kind === 'paid'
    const amount = event.amount ?? 0;
    if (!(amount > 0)) return { ok: true, extra: { ignored: true } };
    const currency = (invoice.currency || (await loadLocaleContext(db)).currency).toUpperCase();
    if (event.currency && event.currency.toUpperCase() !== currency) {
      console.error(`[payment-webhooks] currency mismatch on invoice ${invoice.id}: ${event.currency} vs ${currency}`);
      return { ok: true, extra: { ignored: true } };
    }
    // A second guard behind the event id: the provider's payment id is recorded once (Razorpay can describe one
    // payment in more than one event).
    if (event.paymentRef) {
      const seen = await db.prepare('SELECT id FROM payments WHERE invoice_id = ? AND reference = ?').bind(invoice.id, event.paymentRef).first();
      if (seen) return { ok: true, extra: { duplicate: true } };
    }

    const gatewayName = event.gateway === 'razorpay' ? 'Razorpay' : event.gateway === 'stripe' ? 'Stripe' : 'test gateway';
    const recorded = await recordInvoicePayment(env, tenantId, db, {
      invoice,
      amount,
      currency,
      method: 'online',
      reference: event.paymentRef,
      notes: `Paid online through the ${gatewayName} payment link${event.method ? ` (${event.method})` : ''}`,
      date: localDateString(await getTenantTimeZone(db)),
      userId: null,
      source: event.gateway,
    });
    if (isCurrentLink) {
      await db.prepare("UPDATE invoices SET payment_link_status = 'paid' WHERE id = ?").bind(invoice.id).run();
    }
    await emitEvent(env, tenantId, db, {
      type: 'payment.recorded',
      entityType: 'payment',
      entityId: recorded.paymentId,
      payload: { invoiceId: invoice.id, leadId: recorded.leadId, contactId: recorded.contactId, amount },
    });
    return { ok: true, extra: { paymentId: recorded.paymentId } };
  } catch (e) {
    console.error('[payment-webhooks] processing failed:', e instanceof Error ? e.message : 'error');
    await releaseEvent(db, event);
    return { ok: false };
  }
}

// ----------------------------------------------------------------------------
// The test gateway's pay page (R142): GET shows it, POST plays what the provider would do. 404 unless mockAllowed.
// These routes are declared before /:tenantKey/:gateway; they have three path segments, so they never collide with it.
// ----------------------------------------------------------------------------

function pageHtml(lang: string, title: string, body: string): string {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#f5f6f8;margin:0;padding:24px;color:#1b1f24}main{max-width:420px;margin:32px auto;background:#fff;border:1px solid #dde1e6;border-radius:12px;padding:24px}
.banner{background:#fff4d6;border:1px solid #f0d78a;border-radius:8px;padding:8px 12px;font-size:13px;margin-bottom:16px}h1{font-size:20px;margin:0 0 4px}.sub{color:#5b6570;margin:0 0 16px}
.amount{font-size:28px;font-weight:700;margin:8px 0 16px}label.m{display:flex;gap:8px;align-items:center;border:1px solid #dde1e6;border-radius:8px;padding:10px 12px;margin:6px 0;cursor:pointer}
button{font:inherit;border-radius:8px;border:1px solid #c5ccd3;background:#fff;padding:10px 14px;cursor:pointer;margin-top:8px;width:100%}button.pay{background:#1b64f2;border-color:#1b64f2;color:#fff;font-weight:600}</style></head>
<body><main>${body}</main></body></html>`;
}

interface PayInvoice {
  id: string;
  invoice_number: string;
  payment_link_id: string | null;
  payment_link_status: string | null;
}

/** The tenant, its database and the link's state behind a pay-page URL, or null (answered as 404 by the caller). */
async function loadPayContext(c: Context<AppContext>) {
  if (!mockAllowed(c.env)) return null;
  const tenantId = await tenantForWebhookKey(c.env, c.req.param('tenantKey') ?? '');
  const db = tenantId ? await resolveTenantDb(c.env, tenantId) : null;
  const link = await loadMockPayLink(c.env, c.req.param('linkRef') ?? '');
  if (!tenantId || !db || !link || link.tenantId !== tenantId) return null;
  const invoice = await db
    .prepare('SELECT id, invoice_number, payment_link_id, payment_link_status FROM invoices WHERE id = ?')
    .bind(link.invoiceId)
    .first<PayInvoice>();
  if (!invoice) return null;
  const lang = await agencyDefaultLanguage(db);
  return { tenantId, db, link, invoice, lang };
}

function messagePage(c: Context<AppContext>, lang: string, titleKey: string, bodyKey: string, status: 200 | 410 = 200): Response {
  const body = `<div class="banner">${escapeHtml(t(lang, 'mockpay.banner'))}</div><h1>${escapeHtml(t(lang, titleKey))}</h1><p class="sub">${escapeHtml(t(lang, bodyKey))}</p>`;
  return c.html(pageHtml(lang, t(lang, titleKey), body), status);
}

/** The return address is honoured only when it is inside the app (APP_URL); anything else is ignored. */
function safeReturn(env: Env, value: string | undefined): string | null {
  if (!value) return null;
  const base = appUrl(env);
  if (value !== base && !value.startsWith(`${base}/`)) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function withStatus(url: string, status: string): string {
  const u = new URL(url);
  u.searchParams.set('payment', status);
  return u.toString();
}

paymentWebhookRoutes.get('/mock-pay/:tenantKey/:linkRef', async (c) => {
  const ctx = await loadPayContext(c);
  if (!ctx) return unknown(c);
  const { db, link, invoice, lang } = ctx;
  if (invoice.payment_link_id === link.linkRef && invoice.payment_link_status === 'paid') return messagePage(c, lang, 'mockpay.received', 'mockpay.receivedBody');
  if (invoice.payment_link_id !== link.linkRef || invoice.payment_link_status !== 'created') return messagePage(c, lang, 'mockpay.expired', 'mockpay.expiredBody', 410);

  const locale = await loadLocaleContext(db);
  const settingsRow = await db.prepare("SELECT value FROM settings WHERE key = 'company_name'").first<{ value: string | null }>();
  const tenantRow = await c.env.MASTER_DB.prepare('SELECT company_name FROM tenants WHERE id = ?').bind(ctx.tenantId).first<{ company_name: string | null }>().catch(() => null);
  const agency = settingsRow?.value || tenantRow?.company_name || '';
  const money = formatMoney(link.amount, link.currency, locale.locale);
  const returnUrl = safeReturn(c.env, c.req.query('return'));
  const methods = methodsForCurrency(link.currency)
    .map((m, i) => `<label class="m"><input type="radio" name="method" value="${m.id}"${i === 0 ? ' checked' : ''}> ${escapeHtml(t(lang, m.labelKey))}</label>`)
    .join('');
  const body = `<div class="banner">${escapeHtml(t(lang, 'mockpay.banner'))}</div>
<h1>${escapeHtml(t(lang, 'mockpay.payTo', { agency }))}</h1>
<p class="sub">${escapeHtml(t(lang, 'mockpay.invoice', { number: invoice.invoice_number }))} · ${escapeHtml(t(lang, `mockpay.purpose.${link.purpose}`))}</p>
<div class="amount" data-testid="mock-amount">${escapeHtml(money)}</div>
<form method="post">
<p class="sub">${escapeHtml(t(lang, 'mockpay.chooseMethod'))}</p>${methods}
${returnUrl ? `<input type="hidden" name="return" value="${escapeHtml(returnUrl)}">` : ''}
<button class="pay" type="submit" name="action" value="pay">${escapeHtml(t(lang, 'mockpay.pay', { amount: money }))}</button>
<button type="submit" name="action" value="fail">${escapeHtml(t(lang, 'mockpay.fail'))}</button>
<button type="submit" name="action" value="cancel">${escapeHtml(t(lang, 'mockpay.cancel'))}</button>
</form>`;
  return c.html(pageHtml(lang, t(lang, 'mockpay.title'), body));
});

paymentWebhookRoutes.post('/mock-pay/:tenantKey/:linkRef', async (c) => {
  const ctx = await loadPayContext(c);
  if (!ctx) return unknown(c);
  const { tenantId, db, link, invoice, lang } = ctx;

  const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const action = typeof form.action === 'string' ? form.action : 'pay';
  const methods = methodsForCurrency(link.currency);
  const method = typeof form.method === 'string' && methods.some((m) => m.id === form.method) ? form.method : methods[0].id;
  const returnUrl = safeReturn(c.env, typeof form.return === 'string' ? form.return : c.req.query('return'));
  const finish = (status: 'success' | 'failed' | 'cancelled'): Response => {
    if (returnUrl) return c.redirect(withStatus(returnUrl, status), 303);
    if (status === 'success') return messagePage(c, lang, 'mockpay.received', 'mockpay.receivedBody');
    if (status === 'failed') return messagePage(c, lang, 'mockpay.failed', 'mockpay.failedBody');
    return messagePage(c, lang, 'mockpay.cancelled', 'mockpay.cancelledBody');
  };

  if (action === 'fail') return finish('failed');
  if (action === 'cancel') return finish('cancelled');

  // Paid already (a double submit or a replay): the payment is not recorded again.
  if (invoice.payment_link_id === link.linkRef && invoice.payment_link_status === 'paid') return finish('success');
  if (invoice.payment_link_id !== link.linkRef || invoice.payment_link_status !== 'created') return messagePage(c, lang, 'mockpay.expired', 'mockpay.expiredBody', 410);

  // What the provider would do: sign the paid event and put it through the same pipeline as a real webhook.
  const { body, signature } = await signedMockPaidEvent(c.env, link, method);
  const headers = new Headers({ 'x-mock-signature': signature });
  const verified = await new MockGateway(c.env).verifyWebhook(headers, body);
  if (!verified.ok) return unknown(c);
  const event = parseAgencyEvent('mock', body, headers);
  if (!event) return unknown(c);
  const result = await applyEvent(c.env, tenantId, db, event);
  if (!result.ok) return c.json({ success: false, error: { message: 'Processing failed' } }, 500);
  return finish('success');
});

// ----------------------------------------------------------------------------
// The provider webhook
// ----------------------------------------------------------------------------

paymentWebhookRoutes.post('/:tenantKey/:gateway', async (c) => {
  const gateway = c.req.param('gateway');
  if (!isAgencyGateway(gateway)) return unknown(c);
  // The test gateway is a local and test tool: in production it is simply not there.
  if (gateway === 'mock' && !mockAllowed(c.env)) return unknown(c);

  // The raw body, untouched: the signature covers these exact bytes.
  const rawBody = await c.req.text();

  const tenantId = await tenantForWebhookKey(c.env, c.req.param('tenantKey'));
  const db = tenantId ? await resolveTenantDb(c.env, tenantId) : null;
  if (!tenantId || !db) return unknown(c);

  const account = await loadAccount(db, gateway);
  if (!account || !account.is_active) return unknown(c);

  let verified;
  if (gateway === 'mock') {
    // The test gateway holds no secrets of its own: events are signed with the mock secret.
    verified = await new MockGateway(c.env).verifyWebhook(c.req.raw.headers, rawBody);
  } else {
    if (!account.webhook_secret_enc) return unknown(c);
    let creds;
    try {
      creds = await openCredentials(c.env, account);
    } catch (e) {
      if (isCredentialError(e)) {
        console.error('[payment-webhooks] stored credentials unavailable:', e instanceof Error ? e.name : 'error');
        return c.json({ success: false, error: { message: 'Webhook temporarily unavailable' } }, 503);
      }
      throw e;
    }
    if (!creds) return unknown(c);
    verified = await verifyAgencyWebhook(creds, c.req.raw.headers, rawBody);
  }
  if (!verified.ok) return c.json({ success: false, error: { message: 'Invalid signature' } }, 400);

  const event = parseAgencyEvent(gateway, rawBody, c.req.raw.headers);
  if (!event) return c.json({ success: false, error: { message: 'Unreadable event' } }, 400);

  const result = await applyEvent(c.env, tenantId, db, event);
  if (!result.ok) return c.json({ success: false, error: { message: 'Processing failed' } }, 500);
  return c.json({ success: true, data: { received: true, ...result.extra } });
});

export default paymentWebhookRoutes;
