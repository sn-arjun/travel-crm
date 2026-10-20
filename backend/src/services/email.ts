import type { Env } from '../types';
import { emailFrom } from '../utils/app-urls';

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
  /** Where the customer's reply goes (R128). Without it a reply goes to the no-reply sender. */
  replyTo?: string;
}

/**
 * Send email via SendGrid API. Returns the provider's message id (x-message-id) so the delivery events can find the row.
 */
export async function sendEmail(
  env: Env,
  params: SendEmailParams
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: params.to }] }],
      from: { email: params.from || emailFrom(env).email, name: emailFrom(env).name },
      ...(params.replyTo ? { reply_to: { email: params.replyTo } } : {}),
      subject: params.subject,
      content: [{ type: 'text/html', value: params.html }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { success: false, error: text };
  }

  return { success: true, messageId: response.headers.get('x-message-id') || undefined };
}
