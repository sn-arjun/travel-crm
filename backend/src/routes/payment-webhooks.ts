/**
 * Payment webhooks for the AGENCY's own gateway account (R207). Public: the signature is the credential.
 *
 *   POST /api/v1/webhooks/payments/:tenantKey/:gateway     (:gateway = razorpay | stripe)
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
 * This is separate from the platform's subscription billing webhooks (routes/billing.ts); it never touches
 * platform billing tables.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppContext } from '../types';
import { resolveTenantDb } from '../services/tenant-db';
import { emitEvent } from '../services/automation/events';
import { loadAccount, openCredentials, tenantForWebhookKey, isCredentialError } from '../services/payments/accounts';
import { isAgencyGateway, parseAgencyEvent, verifyAgencyWebhook, type AgencyPaymentEvent } from '../services/payments/agency-gateway';
import { recordInvoicePayment } from '../services/payments/record';
import { getTenantTimeZone, localDateString } from '../utils/tz';
import { loadLocaleContext } from '../utils/money';

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

paymentWebhookRoutes.post('/:tenantKey/:gateway', async (c) => {
  const gateway = c.req.param('gateway');
  if (!isAgencyGateway(gateway)) return unknown(c);

  // The raw body, untouched: the signature covers these exact bytes.
  const rawBody = await c.req.text();

  const tenantId = await tenantForWebhookKey(c.env, c.req.param('tenantKey'));
  const db = tenantId ? await resolveTenantDb(c.env, tenantId) : null;
  if (!tenantId || !db) return unknown(c);

  const account = await loadAccount(db, gateway);
  if (!account || !account.is_active || !account.webhook_secret_enc) return unknown(c);

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

  const verified = await verifyAgencyWebhook(creds, c.req.raw.headers, rawBody);
  if (!verified.ok) return c.json({ success: false, error: { message: 'Invalid signature' } }, 400);

  const event = parseAgencyEvent(gateway, rawBody, c.req.raw.headers);
  if (!event) return c.json({ success: false, error: { message: 'Unreadable event' } }, 400);

  const received = (extra: Record<string, unknown> = {}) => c.json({ success: true, data: { received: true, ...extra } });

  if (event.kind === 'ignored') return received({ ignored: true });
  if (!(await claimEvent(db, event))) return received({ duplicate: true });

  try {
    const invoice = event.invoiceId
      ? await db
          .prepare('SELECT id, contact_id, total, paid_amount, status, currency, payment_link_id FROM invoices WHERE id = ?')
          .bind(event.invoiceId)
          .first<{ id: string; contact_id: string; total: number; paid_amount: number; status: string; currency: string | null; payment_link_id: string | null }>()
      : null;
    if (!invoice) return received({ ignored: true });

    const isCurrentLink = !!event.linkId && event.linkId === invoice.payment_link_id;

    if (event.kind === 'closed') {
      if (isCurrentLink) {
        await db.prepare('UPDATE invoices SET payment_link_status = ?, updated_at = ? WHERE id = ?').bind(event.closedStatus ?? 'expired', new Date().toISOString(), invoice.id).run();
      }
      return received();
    }

    // kind === 'paid'
    const amount = event.amount ?? 0;
    if (!(amount > 0)) return received({ ignored: true });
    const currency = (invoice.currency || (await loadLocaleContext(db)).currency).toUpperCase();
    if (event.currency && event.currency.toUpperCase() !== currency) {
      console.error(`[payment-webhooks] currency mismatch on invoice ${invoice.id}: ${event.currency} vs ${currency}`);
      return received({ ignored: true });
    }
    // A second guard behind the event id: the provider's payment id is recorded once (Razorpay can describe one
    // payment in more than one event).
    if (event.paymentRef) {
      const seen = await db.prepare('SELECT id FROM payments WHERE invoice_id = ? AND reference = ?').bind(invoice.id, event.paymentRef).first();
      if (seen) return received({ duplicate: true });
    }

    const recorded = await recordInvoicePayment(c.env, tenantId, db, {
      invoice,
      amount,
      currency,
      method: 'online',
      reference: event.paymentRef,
      notes: `Paid online through the ${gateway === 'razorpay' ? 'Razorpay' : 'Stripe'} payment link`,
      date: localDateString(await getTenantTimeZone(db)),
      userId: null,
      source: gateway,
    });
    if (isCurrentLink) {
      await db.prepare("UPDATE invoices SET payment_link_status = 'paid' WHERE id = ?").bind(invoice.id).run();
    }
    await emitEvent(c.env, tenantId, db, {
      type: 'payment.recorded',
      entityType: 'payment',
      entityId: recorded.paymentId,
      payload: { invoiceId: invoice.id, leadId: recorded.leadId, contactId: recorded.contactId, amount },
    });
    return received({ paymentId: recorded.paymentId });
  } catch (e) {
    console.error('[payment-webhooks] processing failed:', e instanceof Error ? e.message : 'error');
    await releaseEvent(db, event);
    return c.json({ success: false, error: { message: 'Processing failed' } }, 500);
  }
});

export default paymentWebhookRoutes;
