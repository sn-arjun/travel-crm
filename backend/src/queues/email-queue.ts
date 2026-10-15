import type { Env } from '../types';
import { sendEmail, sendWithTemplate, type SendEmailResponse } from '../services/sendgrid';
import { refundUsage, tryMeter } from '../services/metering/meter';

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
}

/**
 * Process email sending jobs via SendGrid.
 * Handles both direct emails and template-based emails with full attachment support.
 */
export async function handleEmailJob(job: EmailJob, env: Env): Promise<void> {
  console.log(`[EMAIL QUEUE] Sending email to ${job.to}: ${job.subject}`);

  let result: SendEmailResponse;
  let refunded = false;

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
    } else {
      console.error(`[EMAIL QUEUE] Email send failed for ${job.to}:`, result.error);
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

