import type { Env } from '../../types';
import { isTestMode } from '../../utils/test-mode';
import { providerFor, sendMail, type ProviderName } from './provider';
import { appUrl, emailFrom } from '../../utils/app-urls';
import { generateId } from '../../utils/uuid';
import { getEmailSettings } from './settings';
import { recordPlatformMail } from './platform-log';
import { renderTemplate, type TemplateName } from './templates';
import { emailLanguage, textLanguage, type TextLanguage } from '../../i18n';
import { resolveTenantDb } from '../tenant-db';

export const OUTBOX_PREFIX = 'outbox:';
const OUTBOX_TTL_SECONDS = 7 * 24 * 3600;

export interface OutboxEntry {
  id: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  template: TemplateName;
  tenantId: string | null;
  createdAt: string;
}

export interface TransactionalParams {
  to: string;
  template: TemplateName;
  data?: Record<string, unknown>;
  tenantId?: string;
  /** The recipient's language. When omitted it is looked up from the recipient's user row, then the agency default_language. */
  language?: string;
}

export interface TransactionalResult {
  delivered: boolean;
  via: 'sendgrid' | 'cloudflare' | 'mock' | 'outbox';
  /** Set when Cloudflare failed and SendGrid sent the mail instead. */
  fallbackFrom?: ProviderName;
  id?: string;
  error?: string;
}

/** Mail to the platform's own staff: always English, never looked up. */
const OPERATOR_TEMPLATES = new Set<TemplateName>(['platform_enquiry', 'voip_spend_alert', 'console_test']);

async function languageFor(env: Env, params: TransactionalParams): Promise<TextLanguage> {
  if (params.language) return textLanguage(params.language);
  if (!params.tenantId || OPERATOR_TEMPLATES.has(params.template)) return 'en';
  try {
    const db = await resolveTenantDb(env, params.tenantId);
    if (db) return await emailLanguage(db, params.to);
  } catch {
    // no agency database to ask: English
  }
  return 'en';
}

/**
 * Send a system email (welcome, invite, password reset...).
 * With a SendGrid key it goes out through SendGrid; with no key (or in TEST_MODE) it is
 * written to the KV outbox, readable at GET /test/outbox on the local stack.
 * Never throws: a failed email must not fail the request that triggered it.
 */
export async function sendTransactional(env: Env, params: TransactionalParams): Promise<TransactionalResult> {
  try {
    const rendered = renderTemplate(params.template, { ...(params.data ?? {}), appUrl: appUrl(env) }, await languageFor(env, params));
    const first = providerFor(env, 'platform_system', await getEmailSettings(env)).name;
    // Test mode and the mock provider write to the outbox; SendGrid with no key does too. Cloudflare needs no SendGrid key.
    const outboxReason = isTestMode(env) ? 'test mode' : first === 'mock' ? 'mock provider' : first === 'sendgrid' && !env.SENDGRID_API_KEY ? 'no SendGrid key' : null;
    const useOutbox = outboxReason !== null;

    if (!useOutbox) {
      const from = emailFrom(env);
      const res = await sendMail(env, 'platform_system', {
        to: params.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        from: from.email,
        category: params.template,
      });
      if (!res.success) console.error(`[mail] ${params.template} to ${params.to} failed on ${res.provider}: ${res.error}`);
      return { delivered: res.success, via: res.provider, error: res.error, ...(res.fallbackFrom ? { fallbackFrom: res.fallbackFrom } : {}) };
    }

    const id = generateId();
    const entry: OutboxEntry = {
      id,
      to: params.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      template: params.template,
      tenantId: params.tenantId ?? null,
      createdAt: new Date().toISOString(),
    };
    await env.CACHE.put(`${OUTBOX_PREFIX}${id}`, JSON.stringify(entry), { expirationTtl: OUTBOX_TTL_SECONDS });
    await recordPlatformMail(env, { template: params.template, to: params.to, provider: 'outbox', status: 'sent', note: `Written to the local outbox (${outboxReason}); nothing was sent` });
    console.log(`[mail:outbox] ${params.template} -> ${params.to} (${id})`);
    return { delivered: true, via: 'outbox', id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[mail] ${params.template} to ${params.to} errored: ${message}`);
    return { delivered: false, via: 'outbox', error: message };
  }
}

/** Newest first. Optionally only mail addressed to `to`. */
export async function listOutbox(env: Env, to?: string): Promise<OutboxEntry[]> {
  const entries: OutboxEntry[] = [];
  let cursor: string | undefined;
  do {
    const page: KVNamespaceListResult<unknown> = await env.CACHE.list({ prefix: OUTBOX_PREFIX, cursor });
    for (const key of page.keys) {
      const raw = await env.CACHE.get(key.name);
      if (raw) entries.push(JSON.parse(raw) as OutboxEntry);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  const wanted = to?.toLowerCase();
  return entries
    .filter((e) => !wanted || e.to.toLowerCase() === wanted)
    .sort((a, b) => (a.id < b.id ? 1 : -1));
}

export async function clearOutbox(env: Env): Promise<number> {
  let n = 0;
  let cursor: string | undefined;
  do {
    const page: KVNamespaceListResult<unknown> = await env.CACHE.list({ prefix: OUTBOX_PREFIX, cursor });
    for (const key of page.keys) {
      await env.CACHE.delete(key.name);
      n++;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return n;
}
