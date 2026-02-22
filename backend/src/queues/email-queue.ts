import type { Env } from '../types';
import { sendEmail, sendWithTemplate, type SendEmailResponse } from '../services/sendgrid';

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
}

/**
 * Process email sending jobs via SendGrid.
 * Handles both direct emails and template-based emails with full attachment support.
 */
export async function handleEmailJob(job: EmailJob, env: Env): Promise<void> {
  console.log(`[EMAIL QUEUE] Sending email to ${job.to}: ${job.subject}`);

  let result: SendEmailResponse;

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
      });
    }

    if (result.success) {
      console.log(
        `[EMAIL QUEUE] Email sent successfully to ${job.to}`,
        result.messageId ? `(Message ID: ${result.messageId})` : ''
      );
    } else {
      console.error(`[EMAIL QUEUE] Email send failed for ${job.to}:`, result.error);
      throw new Error(result.error || 'Unknown error');
    }
  } catch (error: any) {
    console.error(
      `[EMAIL QUEUE] Exception while sending email to ${job.to}:`,
      error.message
    );
    throw error;
  }
}
