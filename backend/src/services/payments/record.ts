/**
 * The one domain function that records money received against an invoice (R207).
 *
 * Both the manual route (POST /payments) and a verified gateway webhook call it, so a paid link and a
 * hand-recorded payment move an invoice the same way: a payments row, paid_amount / balance_due / status, an
 * activity entry, a notification to the invoice creator and the realtime broadcasts. Event emission
 * (payment.recorded) stays with the caller, which knows whether it runs inside a request.
 */

import { drizzle } from 'drizzle-orm/d1';
import type { Env } from '../../types';
import { notifications } from '../../db/tenant-schema';
import { generateId } from '../../utils/uuid';
import { logActivity } from '../../utils/activity-logger';
import { broadcastToTenant } from '../../utils/realtime';
import { formatMoney, loadLocaleContext } from '../../utils/money';

export interface RecordInvoicePaymentInput {
  invoice: {
    id: string;
    contact_id: string;
    total: number;
    paid_amount: number;
    status: string;
  };
  amount: number;
  currency: string;
  method: string;
  reference?: string | null;
  notes?: string | null;
  /** ISO date (YYYY-MM-DD), tenant-local. */
  date: string;
  receiptUrl?: string | null;
  /** The person recording it; null for a payment that arrived through a gateway webhook. */
  userId: string | null;
  /** Written into the activity entry, e.g. 'manual' or 'razorpay'. */
  source?: string;
}

export interface RecordedPayment {
  paymentId: string;
  oldStatus: string;
  newStatus: string;
  paidAmount: number;
  balanceDue: number;
  leadId: string | null;
  contactId: string;
}

export async function recordInvoicePayment(
  env: Env,
  tenantId: string,
  tenantDb: D1Database,
  input: RecordInvoicePaymentInput,
): Promise<RecordedPayment> {
  const { invoice } = input;
  const paymentId = generateId();
  const now = new Date().toISOString();

  await tenantDb
    .prepare(
      `INSERT INTO payments (
          id, invoice_id, contact_id, amount, currency, method, reference,
          type, date, notes, receipt_url, created_by, created_at
        ) VALUES (
          ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13
        )`,
    )
    .bind(
      paymentId,
      invoice.id,
      invoice.contact_id,
      input.amount,
      input.currency,
      input.method,
      input.reference || null,
      'incoming',
      input.date,
      input.notes || null,
      input.receiptUrl || null,
      input.userId,
      now,
    )
    .run();

  const newPaidAmount = invoice.paid_amount + input.amount;
  const newBalanceDue = invoice.total - newPaidAmount;
  const newStatus = newBalanceDue <= 0.01 ? 'paid' : newPaidAmount > 0 ? 'partially_paid' : invoice.status;

  await tenantDb
    .prepare(
      `UPDATE invoices SET
         paid_amount = ?1, balance_due = ?2, status = ?3, updated_at = ?4
         WHERE id = ?5`,
    )
    .bind(newPaidAmount, Math.max(0, newBalanceDue), newStatus, now, invoice.id)
    .run();

  const meta = await tenantDb
    .prepare('SELECT created_by, lead_id FROM invoices WHERE id = ?')
    .bind(invoice.id)
    .first<{ created_by: string | null; lead_id: string | null }>();

  // activity_logs.user_id is required: a gateway payment is logged against the invoice's creator.
  const actor = input.userId ?? meta?.created_by ?? null;
  if (actor) {
    await logActivity(drizzle(tenantDb), {
      userId: actor,
      action: 'payment_recorded',
      entityType: 'payment',
      entityId: paymentId,
      details: JSON.stringify({ invoiceId: invoice.id, amount: input.amount, source: input.source ?? 'manual' }),
    });
  }

  // Notify the invoice creator (the lead owner) of payment received (TICKET-166)
  try {
    if (meta?.created_by && meta.created_by !== input.userId) {
      const locale = await loadLocaleContext(tenantDb);
      await drizzle(tenantDb).insert(notifications).values({
        id: generateId(),
        userId: meta.created_by,
        title: 'Payment received',
        message: `${formatMoney(input.amount, input.currency, locale.locale)} recorded against invoice`,
        type: 'payment_received',
        referenceType: 'payment',
        referenceId: paymentId,
      });
    }
  } catch {
    // Non-critical
  }

  try {
    await broadcastToTenant(env, tenantId, {
      type: 'payment:received',
      data: { paymentId, invoiceId: invoice.id, amount: input.amount, invoiceStatus: newStatus },
    });
    if (invoice.status !== newStatus) {
      await broadcastToTenant(env, tenantId, {
        type: 'invoice:status_changed',
        data: { invoiceId: invoice.id, oldStatus: invoice.status, newStatus },
      });
    }
  } catch {
    // Non-critical
  }

  return {
    paymentId,
    oldStatus: invoice.status,
    newStatus,
    paidAmount: newPaidAmount,
    balanceDue: Math.max(0, newBalanceDue),
    leadId: meta?.lead_id ?? null,
    contactId: invoice.contact_id,
  };
}
