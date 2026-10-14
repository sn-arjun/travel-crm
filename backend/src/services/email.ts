import type { Env } from '../types';
import { emailFrom } from '../utils/app-urls';

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

/**
 * Send email via SendGrid API.
 */
export async function sendEmail(
  env: Env,
  params: SendEmailParams
): Promise<{ success: boolean; error?: string }> {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: params.to }] }],
      from: { email: params.from || emailFrom(env).email, name: emailFrom(env).name },
      subject: params.subject,
      content: [{ type: 'text/html', value: params.html }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { success: false, error: text };
  }

  return { success: true };
}
