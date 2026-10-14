import type { Env } from '../../types';
import { isTestMode } from '../../utils/test-mode';
import { sendEmail } from '../sendgrid';
import { appUrl, emailFrom } from '../../utils/app-urls';
import { generateId } from '../../utils/uuid';
import { renderTemplate, type TemplateName } from './templates';

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
}

export interface TransactionalResult {
  delivered: boolean;
  via: 'sendgrid' | 'outbox';
  id?: string;
  error?: string;
}

/**
 * Send a system email (welcome, invite, password reset...).
 * With a SendGrid key it goes out through SendGrid; with no key (or in TEST_MODE) it is
 * written to the KV outbox, readable at GET /test/outbox on the local stack.
 * Never throws: a failed email must not fail the request that triggered it.
 */
export async function sendTransactional(env: Env, params: TransactionalParams): Promise<TransactionalResult> {
  try {
    const rendered = renderTemplate(params.template, { ...(params.data ?? {}), appUrl: appUrl(env) });
    const useOutbox = !env.SENDGRID_API_KEY || isTestMode(env);

    if (!useOutbox) {
      const from = emailFrom(env);
      const res = await sendEmail(env, {
        to: params.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        from: from.email,
      });
      if (!res.success) console.error(`[mail] ${params.template} to ${params.to} failed: ${res.error}`);
      return { delivered: res.success, via: 'sendgrid', error: res.error };
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
