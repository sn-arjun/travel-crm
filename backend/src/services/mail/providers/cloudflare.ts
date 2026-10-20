import type { Env } from '../../../types';
import { emailFrom } from '../../../utils/app-urls';
import type { EmailProvider, EmailSendResult, OutgoingEmail } from '../provider';

/**
 * Cloudflare Email Service sending (Workers `send_email` binding, structured send(); public beta, transactional
 * only; arbitrary recipients need the Workers Paid plan and an onboarded sending domain). The binding is declared
 * in wrangler.base.toml as EMAIL and never with remote = true.
 */
export function cloudflareAvailable(env: Env): boolean {
  return !!env.EMAIL && typeof env.EMAIL.send === 'function';
}

function list(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

export const cloudflareProvider: EmailProvider = {
  name: 'cloudflare',
  async send(env: Env, message: OutgoingEmail): Promise<EmailSendResult> {
    if (!env.EMAIL) return { success: false, provider: 'cloudflare', error: 'send_email binding EMAIL is not configured' };
    const sender = emailFrom(env);
    const cc = list(message.cc);
    const bcc = list(message.bcc);
    try {
      const res = await env.EMAIL.send({
        to: message.to,
        from: { email: message.from || sender.email, name: sender.name },
        subject: message.subject,
        ...(message.html ? { html: message.html } : {}),
        ...(message.text ? { text: message.text } : {}),
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
        ...(cc.length ? { cc } : {}),
        ...(bcc.length ? { bcc } : {}),
        ...(message.headers ? { headers: message.headers } : {}),
        ...(message.attachments?.length
          ? { attachments: message.attachments.map((a) => ({ content: a.content, filename: a.filename, type: a.type, disposition: 'attachment' as const })) }
          : {}),
      });
      return { success: true, provider: 'cloudflare', messageId: res?.messageId };
    } catch (err) {
      const e = err as { code?: string; message?: string };
      return { success: false, provider: 'cloudflare', error: e.code ? `${e.code}: ${e.message ?? ''}`.trim() : e.message ?? String(err) };
    }
  },
};
