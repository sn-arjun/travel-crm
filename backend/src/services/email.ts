import type { Env } from '../types';
import { sendMail, type MailKind } from './mail/provider';

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
  /** Where the customer's reply goes (R128). Without it a reply goes to the no-reply sender. */
  replyTo?: string;
}

/**
 * Send one HTML email through the mail provider interface (R131). Returns the provider's message id so the delivery
 * events can find the row. The kind decides the provider: platform system mail may use Cloudflare, agency mail is SendGrid.
 */
export async function sendEmail(
  env: Env,
  params: SendEmailParams,
  kind: MailKind = 'agency_transactional',
): Promise<{ success: boolean; error?: string; messageId?: string; provider?: string }> {
  const res = await sendMail(env, kind, { to: params.to, subject: params.subject, html: params.html, from: params.from, replyTo: params.replyTo });
  return { success: res.success, error: res.error, messageId: res.messageId, provider: res.provider };
}
