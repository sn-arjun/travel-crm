import type { Env } from '../types';

export interface EmailJob {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  templateId?: string;
  templateData?: Record<string, string>;
  attachments?: Array<{
    filename: string;
    content: string; // base64
    type: string;
  }>;
  from?: string;
  replyTo?: string;
}

/**
 * Process email sending jobs via SendGrid.
 * Stub implementation — will be completed in Milestone 9.
 */
export async function handleEmailJob(job: EmailJob, env: Env): Promise<void> {
  console.log(`[EMAIL QUEUE] Sending email to ${job.to}: ${job.subject}`);

  // TODO (Milestone 9): Implement SendGrid API call
  // const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${env.SENDGRID_API_KEY}`,
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({
  //     personalizations: [{ to: [{ email: job.to }] }],
  //     from: { email: job.from || 'noreply@travelcrm.com' },
  //     subject: job.subject,
  //     content: [
  //       { type: 'text/html', value: job.html || job.text || '' },
  //     ],
  //   }),
  // });

  console.log(`[EMAIL QUEUE] Email job processed (stub)`);
}
