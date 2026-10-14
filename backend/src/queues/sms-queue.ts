import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import type { Env } from '../types';
import { messageLog } from '../db/tenant-schema';
import { sendSms, sendWhatsApp, sendMediaMessage } from '../services/twilio-messaging';
import { sendEmail } from '../services/email';
import { resolveTenantDb } from '../services/tenant-db';

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
}

/**
 * Process SMS/WhatsApp/Email sending jobs via Twilio or SendGrid.
 */
export async function handleSmsJob(job: SmsJob, env: Env): Promise<void> {
  const channel = job.channel || 'sms';
  const messageLogId = job.messageLogId;

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
        from: 'noreply@travelcrm.pro',
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
