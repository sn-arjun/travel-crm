import type { Env } from '../types';
import { sendEmail, sendWithTemplate, type SendEmailResponse } from '../services/sendgrid';
import { refundUsage, tryMeter } from '../services/metering/meter';
import { resolveTenantDb } from '../services/tenant-db';
import { isEmailUndeliverable } from '../services/mail/delivery';

export interface EmailJob {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  templateId?: string;
  templateData?: Record<string, any>;
  attachments?: Array<{
    filename: string;
    content: string; // base64
    type: string;
  }>;
  from?: string;
  replyTo?: string;
  cc?: string;
  bcc?: string;
  /** R208: set on marketing mail; sendEmail adds the List-Unsubscribe headers and footer. */
  unsubscribeUrl?: string;
  /** Owning agency. When present the email counts against its monthly email allowance (system email has none). */
  tenantId?: string;
  /** The sender already took the allowance; do not take it again. */
  metered?: boolean;
  refundOnFailure?: boolean;
  /** R128: the email_message_log row for this send; it gets the provider message id and the sent/failed status. */
  emailLogId?: string;
  /** R128: the campaign_recipients row for this send (marketing campaigns). */
  campaignRecipientId?: string;
  /** R128: the message_log row (Communication Hub); its external_id becomes the provider message id. */
  messageLogId?: string;
}

const SUPPRESSED_REASON = 'Address bounced earlier (undeliverable)';

/** Write the result of a send back to the rows that represent it, so delivery events can find them. */
async function recordSendResult(
  env: Env,
  job: EmailJob,
  outcome: { messageId?: string; error?: string; suppressed?: boolean },
): Promise<void> {
  if (!job.tenantId || (!job.emailLogId && !job.messageLogId && !job.campaignRecipientId)) return;
  try {
    const tenantDb = await resolveTenantDb(env, job.tenantId);
    if (!tenantDb) return;
    const now = new Date().toISOString();
    const reason = outcome.suppressed ? SUPPRESSED_REASON : outcome.error;
    const failed = !!reason;
    if (job.emailLogId) {
      if (failed) {
        await tenantDb
          .prepare("UPDATE email_message_log SET status = ?, failure_reason = ?, updated_at = ? WHERE id = ? AND status IN ('queued', 'failed')")
          .bind(outcome.suppressed ? 'dropped' : 'failed', reason, now, job.emailLogId)
          .run();
      } else {
        await tenantDb
          .prepare("UPDATE email_message_log SET message_id = COALESCE(?, message_id), status = 'sent', failure_reason = NULL, updated_at = ? WHERE id = ? AND status IN ('queued', 'failed')")
          .bind(outcome.messageId ?? null, now, job.emailLogId)
          .run();
      }
    }
    if (job.campaignRecipientId) {
      if (failed) {
        await tenantDb
          .prepare("UPDATE campaign_recipients SET status = 'failed', error_message = ? WHERE id = ? AND status IN ('pending', 'queued', 'failed')")
          .bind(reason, job.campaignRecipientId)
          .run();
      } else {
        await tenantDb
          .prepare("UPDATE campaign_recipients SET message_id = COALESCE(?, message_id), status = 'sent', sent_at = ? WHERE id = ? AND status IN ('pending', 'queued', 'failed')")
          .bind(outcome.messageId ?? null, now, job.campaignRecipientId)
          .run();
      }
    }
    if (job.messageLogId) {
      if (failed) {
        await tenantDb
          .prepare("UPDATE message_log SET status = 'failed', error_message = ? WHERE id = ? AND status IN ('queued', 'failed')")
          .bind(reason, job.messageLogId)
          .run();
      } else {
        await tenantDb
          .prepare("UPDATE message_log SET status = 'sent', external_id = COALESCE(?, external_id), sent_at = ?, error_message = NULL WHERE id = ? AND status IN ('queued', 'failed')")
          .bind(outcome.messageId ?? null, now, job.messageLogId)
          .run();
      }
    }
  } catch (err) {
    console.error('[EMAIL QUEUE] could not record the send result:', err instanceof Error ? err.message : err);
  }
}

/**
 * Process email sending jobs via SendGrid.
 * Handles both direct emails and template-based emails with full attachment support.
 */
export async function handleEmailJob(job: EmailJob, env: Env): Promise<void> {
  console.log(`[EMAIL QUEUE] Sending email to ${job.to}: ${job.subject}`);

  let result: SendEmailResponse;
  let refunded = false;

  // R128: an address that hard-bounced is never sent to again (and uses no allowance).
  if (job.tenantId) {
    const tenantDb = await resolveTenantDb(env, job.tenantId);
    if (tenantDb && (await isEmailUndeliverable(tenantDb, job.to))) {
      console.warn(`[EMAIL QUEUE] email to ${job.to} suppressed: the address hard-bounced earlier`);
      if (job.metered && job.refundOnFailure) await refundUsage(env, job.tenantId, 'email');
      await recordSendResult(env, job, { suppressed: true });
      return;
    }
  }

  let queueMetered = false;
  if (job.tenantId && !job.metered) {
    const taken = await tryMeter(env, job.tenantId, 'email');
    if (!taken.allowed) {
      console.warn(`[EMAIL QUEUE] email to ${job.to} skipped: monthly allowance used up`);
      return;
    }
    queueMetered = true;
  }
  const refundable = !!job.tenantId && (queueMetered || (job.metered === true && job.refundOnFailure === true));

  try {
    if (job.templateId && job.templateData) {
      // Use SendGrid Dynamic Template
      result = await sendWithTemplate(env, {
        to: job.to,
        templateId: job.templateId,
        dynamicData: job.templateData,
        from: job.from,
        replyTo: job.replyTo,
        cc: job.cc,
        bcc: job.bcc,
        attachments: job.attachments,
        unsubscribeUrl: job.unsubscribeUrl,
      });
    } else {
      // Send direct email with HTML/text content
      result = await sendEmail(env, {
        to: job.to,
        subject: job.subject,
        html: job.html,
        text: job.text,
        from: job.from,
        replyTo: job.replyTo,
        cc: job.cc,
        bcc: job.bcc,
        attachments: job.attachments,
        unsubscribeUrl: job.unsubscribeUrl,
      });
    }

    if (result.success) {
      console.log(
        `[EMAIL QUEUE] Email sent successfully to ${job.to}`,
        result.messageId ? `(Message ID: ${result.messageId})` : ''
      );
      await recordSendResult(env, job, { messageId: result.messageId });
    } else {
      console.error(`[EMAIL QUEUE] Email send failed for ${job.to}:`, result.error);
      await recordSendResult(env, job, { error: result.error || 'Unknown error' });
      if (refundable && job.tenantId) { await refundUsage(env, job.tenantId, 'email'); refunded = true; }
      throw new Error(result.error || 'Unknown error');
    }
  } catch (error: any) {
    // A thrown send before a result: give the unit back only if this queue took it (the retry takes it again).
    if (queueMetered && job.tenantId && !refunded) await refundUsage(env, job.tenantId, 'email');
    console.error(
      `[EMAIL QUEUE] Exception while sending email to ${job.to}:`,
      error.message
    );
    throw error;
  }
}

