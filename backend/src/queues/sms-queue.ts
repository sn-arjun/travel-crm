import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import type { Env } from '../types';
import { messageLog } from '../db/tenant-schema';
import { sendSms, sendWhatsApp, sendMediaMessage } from '../services/twilio-messaging';
import { sendEmail } from '../services/email';
import { emailFrom } from '../utils/app-urls';
import { resolveTenantDb } from '../services/tenant-db';
import { refundUsage, tryMeter } from '../services/metering/meter';

export interface SmsJob {
  to: string; // E.164 format: +919876543210 or email
  body?: string; // for SMS/WhatsApp
  subject?: string; // for email
  html?: string; // for email
  templateId?: string;
  templateData?: Record<string, string>;
  messageLogId?: string; // DB record ID to update
  contactId?: string;
  /** Owning agency. Required to write the message-log result back; without it the send still happens. */
  tenantId?: string;
  channel?: 'sms' | 'whatsapp' | 'email';
  mediaUrl?: string; // for media messages
  /** The sender already took the allowance (Communication Hub); the queue must not take it again. */
  metered?: boolean;
  /** With metered: give the unit back if the provider rejects the send. False for free WhatsApp replies. */
  refundOnFailure?: boolean;
}

/**
 * Process SMS/WhatsApp/Email sending jobs via Twilio or SendGrid.
 */
export async function handleSmsJob(job: SmsJob, env: Env): Promise<void> {
  const channel = job.channel || 'sms';
  const messageLogId = job.messageLogId;

  // Metering (R110): every paid send takes one unit of the agency's monthly allowance BEFORE the provider is called.
  // Jobs from the Communication Hub are metered at the route (so the user gets the 402); everything else here.
  let queueMetered = false;
  if (!job.metered && job.tenantId) {
    const taken = await tryMeter(env, job.tenantId, channel === 'whatsapp' ? 'whatsapp' : channel === 'email' ? 'email' : 'sms');
    if (!taken.allowed) {
      await markSkippedForAllowance(job, env, channel);
      return;
    }
    queueMetered = true;
  }
  const refundable = queueMetered || (job.metered === true && job.refundOnFailure === true);
  const meterChannel = channel === 'whatsapp' ? 'whatsapp' : channel === 'email' ? 'email' : 'sms';

  try {
    console.log(`[SMS QUEUE] Sending ${channel} to ${job.to}...`);

    let result: { success: boolean; sid?: string; error?: string } | { success: boolean };

    if (channel === 'whatsapp') {
      if (job.mediaUrl) {
        result = await sendMediaMessage(env, job.to, 'whatsapp', job.mediaUrl, job.body);
      } else {
        result = await sendWhatsApp(env, job.to, job.body || '');
      }
    } else if (channel === 'sms') {
      if (job.mediaUrl) {
        result = await sendMediaMessage(env, job.to, 'sms', job.mediaUrl, job.body);
      } else {
        result = await sendSms(env, job.to, job.body || '');
      }
    } else if (channel === 'email') {
      result = await sendEmail(env, {
        to: job.to,
        subject: job.subject || 'Message',
        html: job.html || '',
        from: emailFrom(env).email,
      });
    } else {
      throw new Error(`Unknown channel: ${channel}`);
    }

    // Update message log with result
    if (messageLogId && job.tenantId) {
      const tenantDb = await resolveTenantDb(env, job.tenantId);
      if (tenantDb) {
        const db = drizzle(tenantDb);

        if (result.success) {
          const now = new Date().toISOString();
          await db
            .update(messageLog)
            .set({
              status: 'sent',
              externalId: (result as any).sid || null,
              sentAt: now,
              errorMessage: null,
            })
            .where(eq(messageLog.id, messageLogId));

          console.log(`[SMS QUEUE] ${channel.toUpperCase()} sent successfully: ${messageLogId}`);
        } else {
          if (refundable && job.tenantId) await refundUsage(env, job.tenantId, meterChannel);
          await db
            .update(messageLog)
            .set({
              status: 'failed',
              errorMessage: (result as any).error || 'Unknown error',
            })
            .where(eq(messageLog.id, messageLogId));

          console.error(`[SMS QUEUE] ${channel.toUpperCase()} failed: ${(result as any).error}`);
        }
      }
    }
  } catch (err) {
    console.error(`[SMS QUEUE] Error processing ${channel} job:`, err);
    // The queue retries a thrown job and meters again; a hub job keeps its unit for the retry.
    if (queueMetered && job.tenantId) await refundUsage(env, job.tenantId, meterChannel);

    // Update message log with error
    if (messageLogId && job.tenantId) {
      const tenantDb = await resolveTenantDb(env, job.tenantId);
      if (tenantDb) {
        const db = drizzle(tenantDb);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';

        await db
          .update(messageLog)
          .set({
            status: 'failed',
            errorMessage: errorMessage,
          })
          .where(eq(messageLog.id, messageLogId));
      }
    }

    throw err; // Re-throw to trigger queue retry
  }
}

/** The agency is at its monthly cap: the message is not sent and its log row says why. Never retried. */
async function markSkippedForAllowance(job: SmsJob, env: Env, channel: string): Promise<void> {
  console.warn(`[SMS QUEUE] ${channel} to ${job.to} skipped: monthly allowance used up`);
  if (!job.messageLogId || !job.tenantId) return;
  const tenantDb = await resolveTenantDb(env, job.tenantId);
  if (!tenantDb) return;
  await drizzle(tenantDb)
    .update(messageLog)
    .set({ status: 'failed', errorMessage: 'skipped_allowance: monthly allowance used up' })
    .where(eq(messageLog.id, job.messageLogId));
}
