import type { Env } from '../../types';
import type { EmailAttachment } from '../sendgrid';
import { cloudflareProvider, cloudflareAvailable } from './providers/cloudflare';
import { sendgridProvider } from './providers/sendgrid';
import { mockProvider } from './providers/mock';

/**
 * R131 (ADR-002 section 6.1): one interface for outgoing email.
 *
 * Mail kinds decide where a message may go:
 *   platform_system      the platform's own mail (welcome, invite, reset, receipts, alerts): Cloudflare when
 *                        EMAIL_SYSTEM_PROVIDER=cloudflare and the binding exists, else SendGrid; a Cloudflare
 *                        failure is retried once on SendGrid.
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

/** The provider a mail kind uses first. Marketing and agency mail are SendGrid whatever the settings say. */
export function providerFor(env: Env, kind: MailKind): EmailProvider {
  if (kind !== 'platform_system') return sendgridProvider;
  const wanted = (env.EMAIL_SYSTEM_PROVIDER ?? 'sendgrid').trim().toLowerCase();
  if (wanted === 'cloudflare' && cloudflareAvailable(env)) return cloudflareProvider;
  if (wanted === 'mock') return mockProvider;
  return sendgridProvider;
}

/**
 * Send one email. Never throws. A platform system email that fails on Cloudflare is retried once on SendGrid;
 * the result says which provider actually sent it.
 */
export async function sendMail(env: Env, kind: MailKind, message: OutgoingEmail): Promise<EmailSendResult> {
  const first = providerFor(env, kind);
  let result = await safeSend(first, env, message);
  if (!result.success && first.name === 'cloudflare') {
    console.warn(`[mail] Cloudflare send failed (${result.error}); retrying once on SendGrid`);
    const retry = await safeSend(sendgridProvider, env, message);
    result = { ...retry, fallbackFrom: 'cloudflare', error: retry.success ? undefined : `cloudflare: ${result.error}; sendgrid: ${retry.error}` };
  }
  return result;
}

async function safeSend(provider: EmailProvider, env: Env, message: OutgoingEmail): Promise<EmailSendResult> {
  try {
    return await provider.send(env, message);
  } catch (err) {
    return { success: false, provider: provider.name, error: err instanceof Error ? err.message : String(err) };
  }
}
