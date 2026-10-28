import type { Env } from '../../types';
import { getEmailSettings } from './settings';

/**
 * R131: per-thread reply addresses. Agency mail goes out with Reply-To `reply+<token>@<EMAIL_INBOUND_DOMAIN>`.
 * The token is random (120 bits), unguessable, and maps (in KV) to one agency and one customer thread; only that
 * mapping decides which agency's inbox a reply lands in. A token that is unknown or has expired is rejected.
 */

const TOKEN_PREFIX = 'replytok:t:';
const THREAD_PREFIX = 'replytok:thread:';
/** A thread's reply address keeps working for 180 days after it was last used or issued. */
export const REPLY_TOKEN_TTL_SECONDS = 180 * 24 * 3600;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
export const REPLY_TOKEN_LENGTH = 24;

export interface ReplyThread {
  tenantId: string;
  contactId: string;
  leadId?: string | null;
}

export function newReplyToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(REPLY_TOKEN_LENGTH));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % 32];
  return out;
}

export function inboundDomain(env: Pick<Env, 'EMAIL_INBOUND_DOMAIN'>): string | null {
  const d = (env.EMAIL_INBOUND_DOMAIN ?? '').trim().toLowerCase().replace(/^@/, '');
  return d || null;
}

/** The reply address for a customer thread of an agency, issuing a token the first time. Null without an inbound domain. */
export async function replyAddressFor(env: Env, thread: ReplyThread): Promise<string | null> {
  const domain = inboundDomain(env);
  if (!domain || !env.CACHE) return null;
  // R132: switched off in the console -> no new reply+token addresses; the sender's normal reply-to is used.
  if (!(await getEmailSettings(env)).inboundEnabled) return null;
  try {
    const threadKey = `${THREAD_PREFIX}${thread.tenantId}:${thread.contactId}`;
    let token = await env.CACHE.get(threadKey);
    if (!token) {
      token = newReplyToken();
      await env.CACHE.put(threadKey, token, { expirationTtl: REPLY_TOKEN_TTL_SECONDS });
    }
    await env.CACHE.put(`${TOKEN_PREFIX}${token}`, JSON.stringify(thread), { expirationTtl: REPLY_TOKEN_TTL_SECONDS });
    return `reply+${token}@${domain}`;
  } catch (err) {
    console.error('[mail] could not issue a reply token:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** `reply+<token>@<inbound domain>` -> the token, or null when the address is not one of ours. */
export function tokenFromAddress(env: Pick<Env, 'EMAIL_INBOUND_DOMAIN'>, address: string): string | null {
  const domain = inboundDomain(env);
  if (!domain) return null;
  const m = address.trim().toLowerCase().match(/^reply\+([a-z2-7]+)@(.+)$/);
  if (!m || m[2] !== domain || m[1].length !== REPLY_TOKEN_LENGTH) return null;
  return m[1];
}

/** The thread a token belongs to or null when unknown or expired. */
export async function resolveReplyToken(env: Env, token: string): Promise<ReplyThread | null> {
  const raw = await env.CACHE.get(`${TOKEN_PREFIX}${token}`);
  if (!raw) return null;
  try {
    const thread = JSON.parse(raw) as ReplyThread;
    if (!thread.tenantId || !thread.contactId) return null;
    return thread;
  } catch {
    return null;
  }
}
