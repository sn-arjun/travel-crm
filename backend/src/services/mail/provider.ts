import type { Env } from '../../types';
import type { EmailAttachment } from '../sendgrid';
import { cloudflareProvider, cloudflareAvailable } from './providers/cloudflare';
import { sendgridProvider } from './providers/sendgrid';
import { mockProvider } from './providers/mock';
import { envEmailSettings, getEmailSettings, type EmailSettings } from './settings';
import { recordPlatformMail } from './platform-log';

/**
 * R131 (ADR-002 section 6.1): one interface for outgoing email.
 *
 * Mail kinds decide where a message may go:
 *   platform_system      the platform's own mail (welcome, invite, reset, receipts, alerts): Cloudflare by default (R132)
 *                        when the send_email binding exists, else SendGrid; a Cloudflare failure is retried once on
 *                        SendGrid. The console Email page (settings.ts) can switch it to SendGrid or turn the fallback off.
 *   agency_transactional agency mail to its customers (Hub, invoices, vouchers, itineraries, reminders): SendGrid.
 *   agency_marketing     campaigns: SendGrid. Never Cloudflare (Cloudflare sending is beta and transactional only).
 */
export type MailKind = 'platform_system' | 'agency_transactional' | 'agency_marketing';

export type ProviderName = 'sendgrid' | 'cloudflare' | 'mock';

export interface OutgoingEmail {
  to: string | string[];
  /** Sender address; the display name comes from EMAIL_FROM_NAME. */
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  /** Extra headers (for example List-Unsubscribe). */
  headers?: Record<string, string>;
  attachments?: EmailAttachment[];
  /** Marketing mail: the SendGrid provider adds the List-Unsubscribe headers and a footer link. */
  unsubscribeUrl?: string;
  /** A label for reports and provider categories, for example the template name. */
  category?: string;
  /** A SendGrid dynamic template id with its data (R132). Only SendGrid can send it, so a message with one never goes to Cloudflare. */
  templateId?: string;
  templateData?: Record<string, string | number | boolean | string[]>;
}

export interface EmailSendResult {
  success: boolean;
  provider: ProviderName;
  messageId?: string;
  error?: string;
  /** Set when the first choice failed and this result is from the fallback provider. */
  fallbackFrom?: ProviderName;
}

export interface EmailProvider {
  readonly name: ProviderName;
  send(env: Env, message: OutgoingEmail): Promise<EmailSendResult>;
}

/**
 * The provider a mail kind uses first. Marketing and agency mail are SendGrid whatever the settings say.
 * Platform system mail follows `settings` (console, then EMAIL_SYSTEM_PROVIDER, then the built-in Cloudflare default); without
 * `settings` only the variable and the built-in default are consulted. Cloudflare needs the send_email binding; without it
 * the answer is SendGrid, unless the fallback is switched off (then Cloudflare, which fails with a readable error).
 */
export function providerFor(env: Env, kind: MailKind, settings: EmailSettings = envEmailSettings(env)): EmailProvider {
  if (kind !== 'platform_system') return sendgridProvider;
  if (settings.systemProvider === 'mock') return mockProvider;
  if (settings.systemProvider === 'cloudflare' && (cloudflareAvailable(env) || !settings.fallback)) return cloudflareProvider;
  return sendgridProvider;
}

/**
 * Send one email. Never throws. A platform system email that cannot go through Cloudflare (no binding, or Cloudflare refuses)
 * is sent through SendGrid when the fallback is on; the result says which provider actually sent it. Platform mail is
 * written to the delivery log (platform_email_log) with the reason for a fallback or a failure.
 */
export async function sendMail(env: Env, kind: MailKind, message: OutgoingEmail): Promise<EmailSendResult> {
  if (kind !== 'platform_system') return safeSend(sendgridProvider, env, message);

  const settings = await getEmailSettings(env);
  // A SendGrid dynamic template exists only at SendGrid: it is sent there whatever the routing says.
  const first = message.templateId ? sendgridProvider : providerFor(env, kind, settings);
  let result: EmailSendResult;
  let note: string | null = null;
  if (settings.systemProvider === 'cloudflare' && first.name === 'sendgrid' && !message.templateId) {
    // Cloudflare is wanted but there is no binding (local, tests, or a Worker without send_email) and the fallback is on.
    note = 'Cloudflare send_email binding is not present; sent through SendGrid';
    result = { ...(await safeSend(sendgridProvider, env, message)), fallbackFrom: 'cloudflare' };
  } else {
    result = await safeSend(first, env, message);
    if (!result.success && first.name === 'cloudflare' && settings.fallback) {
      console.warn(`[mail] Cloudflare send failed (${result.error}); retrying once on SendGrid`);
      const retry = await safeSend(sendgridProvider, env, message);
      note = `Cloudflare refused: ${result.error ?? 'unknown error'}`;
      result = { ...retry, fallbackFrom: 'cloudflare', error: retry.success ? undefined : `cloudflare: ${result.error}; sendgrid: ${retry.error}` };
    } else if (!result.success && first.name === 'cloudflare') {
      note = 'Cloudflare failed and the fallback is switched off';
    }
  }
  await recordPlatformMail(env, {
    template: message.category,
    to: message.to,
    provider: result.provider,
    fallbackFrom: result.fallbackFrom,
    messageId: result.messageId,
    status: !result.success ? 'failed' : result.fallbackFrom ? 'fallback' : 'sent',
    error: result.error,
    note,
  });
  return result;
}

async function safeSend(provider: EmailProvider, env: Env, message: OutgoingEmail): Promise<EmailSendResult> {
  try {
    return await provider.send(env, message);
  } catch (err) {
    return { success: false, provider: provider.name, error: err instanceof Error ? err.message : String(err) };
  }
}
