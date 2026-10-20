/**
 * One provider sub-account per agency (R304): create, seal, suspend, resume, close.
 *
 * The platform holds one Twilio account. Each agency that turns on calling gets its own sub-account, so its
 * numbers, calls and usage are separate and can be closed at once. The sub-account's auth token is sealed with
 * the R108 crypto-box (AAD voip_sub_account:<tenant>:<sub-account>, see contract.ts) and stored in the master
 * table voip_accounts; it is never returned by any endpoint.
 *
 * The same credentials are mirrored into the agency's own voip_settings row (account id, sealed token) because
 * everything built before the sub-account existed reads credentials there: placing calls, the client token and,
 * above all, the callback signature check, which verifies a provider webhook with the agency's own token (Twilio
 * signs a sub-account's webhooks with the sub-account's token, not the platform's). The mirror is cleared when the
 * account is closed.
 *
 * Creating the sub-account is idempotent: the voip_accounts row is claimed (primary key = tenant) BEFORE the
 * provider is called, so a retry or two parallel requests create exactly one sub-account.
 */

import type { Env } from '../../types';
import { generateId } from '../../utils/uuid';
import { decryptSecret } from '../../utils/crypto-box';
import { loadLocaleContext } from '../../utils/money';
import { getTenantInfo, tenantDbFor } from '../tenant-db';
import { loadTenant, type TenantRow } from '../billing/subscriptions';
import {
  MockVoipProvider,
} from './mock-provider';
import {
  createVoipProvider,
  sealVoipSecret,
  subAccountSecretAad,
  type VoipProvider,
  type VoipSettingsRow,
} from '../voip-provider';
import { decideCalling, type CallingDecision } from './country-policy';

export class VoipAccountError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number = 409, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'VoipAccountError';
  }
}

export interface VoipAccountRow {
  tenant_id: string;
  provider: string;
  sub_account_id: string | null;
  credentials_enc: string | null;
  status: 'pending' | 'active' | 'suspended' | 'closed';
  created_at: string;
  updated_at: string;
  suspended_at: string | null;
  closed_at: string | null;
}

/** A claim that nobody has finished within this long is treated as abandoned (the isolate died mid-request). */
const STALE_CLAIM_MS = 2 * 60_000;

const nowIso = (d: Date = new Date()) => d.toISOString();

export async function getAccount(env: Env, tenantId: string): Promise<VoipAccountRow | null> {
  return env.MASTER_DB.prepare('SELECT * FROM voip_accounts WHERE tenant_id = ?').bind(tenantId).first<VoipAccountRow>();
}

/** What the API and the screens may see of an account: never the token, sealed or not. */
export function accountView(row: VoipAccountRow | null) {
  if (!row) return null;
  return {
    status: row.status,
    provider: row.provider,
    subAccountId: row.sub_account_id,
    createdAt: row.created_at,
    suspendedAt: row.suspended_at,
    closedAt: row.closed_at,
  };
}

/** The agency's database whatever its status (a suspended or cancelled agency still has one to clean up). Null when unreachable. */
export async function anyTenantDb(env: Env, tenantId: string): Promise<D1Database | null> {
  try {
    const info = await getTenantInfo(env, tenantId);
    return info ? tenantDbFor(env, info) : null;
  } catch {
    return null;
  }
}

function blankSettings(over: Partial<VoipSettingsRow> = {}): VoipSettingsRow {
  return {
    id: 'platform', voipProvider: 'twilio',
    providerAccountId: null, providerAuthToken: null, providerApiKeyId: null, providerApiKeySecret: null, providerAppId: null,
    twilioAccountSid: null, twilioAuthToken: null, twilioApiKeySid: null, twilioApiKeySecret: null, twilioTwimlAppSid: null,
    defaultCallerId: null, recordingPolicy: 'all', ivrEnabled: 0, ivrConfig: null, businessHoursEnabled: 0, businessHours: null,
    voicemailEnabled: 1, voicemailGreetingUrl: null, maxRingDuration: 30, routingStrategy: 'assigned', autoCreateLeadMissedCall: 1,
    recordingRetentionDays: 90, recordingStorageBytes: 0,
    ...over,
  };
}

/** The provider with the PLATFORM's credentials: creates, suspends and closes sub-accounts. */
export function platformProvider(env: Env): VoipProvider {
  return createVoipProvider(env, blankSettings());
}

/** The provider acting AS the agency's sub-account: searches, buys and releases its numbers. */
export async function accountProvider(env: Env, account: Pick<VoipAccountRow, 'tenant_id' | 'sub_account_id' | 'credentials_enc'>): Promise<VoipProvider> {
  if (!account.sub_account_id || !account.credentials_enc) {
    throw new VoipAccountError('CALLING_NOT_ENABLED', 'Calling is not turned on for this agency.', 409);
  }
  const platform = platformProvider(env);
  if (platform.providerName === 'mock') return new MockVoipProvider(blankSettings({ voipProvider: 'mock' }));
  const { value } = await decryptSecret(env, account.credentials_enc, subAccountSecretAad(account.tenant_id, account.sub_account_id));
  return createVoipProvider(env, blankSettings({ providerAccountId: account.sub_account_id, providerAuthToken: value }));
}

/** The agency's country: its own settings when a database handle is given (what the country gate reads), else the master record. */
export async function agencyCountry(env: Env, tenant: Pick<TenantRow, 'country'>, db?: D1Database | null): Promise<string> {
  if (db) {
    try {
      const locale = await loadLocaleContext(db);
      if (locale.country) return locale.country;
    } catch {
      // fall through to the master record
    }
  }
  return (tenant.country || '').toUpperCase();
}

export async function decisionFor(env: Env, tenant: TenantRow, db?: D1Database | null): Promise<CallingDecision> {
  return decideCalling(env, { country: await agencyCountry(env, tenant, db), plan: tenant.plan, tenantStatus: tenant.status });
}

// ── Mirror into the agency's voip_settings (see header) ────────────────────────

async function mirrorCredentials(env: Env, db: D1Database, subAccountId: string, token: string): Promise<void> {
  let row = await db.prepare('SELECT id FROM voip_settings LIMIT 1').first<{ id: string }>();
  if (!row) {
    const id = generateId();
    await db.prepare('INSERT INTO voip_settings (id) VALUES (?)').bind(id).run();
    row = { id };
  }
  const sealed = await sealVoipSecret(env, row.id, 'provider_auth_token', token);
  await db
    .prepare(
      `UPDATE voip_settings SET voip_provider = 'twilio', provider_account_id = ?, provider_auth_token = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`,
    )
    .bind(subAccountId, sealed, row.id)
    .run();
}

async function clearMirror(db: D1Database, subAccountId: string): Promise<void> {
  await db
    .prepare(
      `UPDATE voip_settings SET provider_account_id = NULL, provider_auth_token = NULL,
              updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE provider_account_id = ?`,
    )
    .bind(subAccountId)
    .run();
}

async function hasOwnCredentials(db: D1Database, subAccountId?: string | null): Promise<boolean> {
  const row = await db
    .prepare('SELECT provider_account_id, twilio_account_sid FROM voip_settings LIMIT 1')
    .first<{ provider_account_id: string | null; twilio_account_sid: string | null }>();
  if (!row) return false;
  const existing = row.provider_account_id || row.twilio_account_sid;
  return !!existing && existing !== subAccountId;
}

// ── Enable ─────────────────────────────────────────────────────────────────────

export interface EnableResult {
  account: VoipAccountRow;
  created: boolean;
}

/**
 * Turn calling on for an agency: policy checks (country, plan/trial), then exactly one sub-account. Safe to call
 * again: an active account is returned unchanged.
 */
export async function enableCalling(
  env: Env,
  tenantId: string,
  opts: { db?: D1Database | null; replaceOwnCredentials?: boolean; now?: Date } = {},
): Promise<EnableResult> {
  const now = opts.now ?? new Date();
  const tenant = await loadTenant(env, tenantId);
  if (!tenant) throw new VoipAccountError('TENANT_NOT_FOUND', 'Agency not found.', 404);
  if (tenant.status === 'suspended' || tenant.status === 'cancelled' || tenant.status === 'expired') {
    throw new VoipAccountError('ACCOUNT_BLOCKED', 'Calling cannot be turned on while the account is not active.', 409);
  }
  const db = opts.db ?? (await anyTenantDb(env, tenantId));

  const decision = await decisionFor(env, tenant, opts.db);
  if (!decision.allowed) {
    throw new VoipAccountError('CALLING_NOT_AVAILABLE', decision.message ?? 'Calling is not available.', 403, { reason: decision.reason, country: decision.country });
  }

  const existing = await getAccount(env, tenantId);
  if (existing?.status === 'active') return { account: existing, created: false };
  if (existing?.status === 'suspended') {
    throw new VoipAccountError('ACCOUNT_SUSPENDED', 'Calling is suspended for this agency. Contact support.', 409);
  }

  if (db && !opts.replaceOwnCredentials && (await hasOwnCredentials(db))) {
    throw new VoipAccountError('OWN_CREDENTIALS_PRESENT', 'This agency already has its own phone provider credentials. Remove them first, or confirm replacing them.', 409);
  }

  // Claim: only the request that inserts (or re-claims a closed / abandoned row) creates the sub-account.
  const stamp = nowIso(now);
  const insert = await env.MASTER_DB
    .prepare(`INSERT OR IGNORE INTO voip_accounts (tenant_id, provider, status, created_at, updated_at) VALUES (?, 'twilio', 'pending', ?, ?)`)
    .bind(tenantId, stamp, stamp)
    .run();
  let claimed = (insert.meta.changes ?? 0) > 0;
  if (!claimed) {
    const current = await getAccount(env, tenantId);
    if (current?.status === 'active') return { account: current, created: false };
    const staleBefore = nowIso(new Date(now.getTime() - STALE_CLAIM_MS));
    const reclaim = await env.MASTER_DB
      .prepare(
        `UPDATE voip_accounts SET status = 'pending', sub_account_id = NULL, credentials_enc = NULL, closed_at = NULL, updated_at = ?
          WHERE tenant_id = ? AND (status = 'closed' OR (status = 'pending' AND updated_at <= ?))`,
      )
      .bind(stamp, tenantId, staleBefore)
      .run();
    claimed = (reclaim.meta.changes ?? 0) > 0;
    if (!claimed) throw new VoipAccountError('ACCOUNT_IN_PROGRESS', 'Calling is being set up. Try again in a moment.', 409);
  }

  const provider = platformProvider(env);
  let sub;
  try {
    sub = await provider.createSubAccount({ tenantId, name: tenant.company_name });
  } catch (err) {
    await env.MASTER_DB.prepare(`DELETE FROM voip_accounts WHERE tenant_id = ? AND status = 'pending'`).bind(tenantId).run().catch(() => undefined);
    throw err;
  }

  try {
    await env.MASTER_DB
      .prepare(
        `UPDATE voip_accounts SET sub_account_id = ?, credentials_enc = ?, status = 'active', updated_at = ?, suspended_at = NULL, closed_at = NULL
          WHERE tenant_id = ? AND status = 'pending'`,
      )
      .bind(sub.subAccountId, sub.authTokenEnc, nowIso(), tenantId)
      .run();
    if (db) {
      const { value } = await decryptSecret(env, sub.authTokenEnc, subAccountSecretAad(tenantId, sub.subAccountId));
      await mirrorCredentials(env, db, sub.subAccountId, value);
    }
  } catch (err) {
    // The sub-account exists at the provider but we could not record it: close it so nothing is left billing.
    await provider.closeSubAccount(sub.subAccountId).catch(() => undefined);
    await env.MASTER_DB.prepare(`DELETE FROM voip_accounts WHERE tenant_id = ?`).bind(tenantId).run().catch(() => undefined);
    throw err;
  }

  return { account: (await getAccount(env, tenantId))!, created: true };
}

// ── Suspend, resume, close ─────────────────────────────────────────────────────

/**
 * Suspend: the provider stops the sub-account (no calls) and routing to the agency's numbers is switched off;
 * the numbers are kept, so resuming restores everything.
 */
export async function suspendAccount(env: Env, tenantId: string): Promise<VoipAccountRow | null> {
  const account = await getAccount(env, tenantId);
  if (!account || account.status !== 'active' || !account.sub_account_id) return account;
  await platformProvider(env).setSubAccountStatus(account.sub_account_id, 'suspended');
  const stamp = nowIso();
  await env.MASTER_DB.batch([
    env.MASTER_DB.prepare(`UPDATE voip_accounts SET status = 'suspended', suspended_at = ?, updated_at = ? WHERE tenant_id = ?`).bind(stamp, stamp, tenantId),
    env.MASTER_DB
      .prepare(`UPDATE tenant_channel_addresses SET is_active = 0, updated_at = ? WHERE tenant_id = ? AND channel = 'voice' AND address IN (SELECT phone_number FROM voip_number_registry WHERE tenant_id = ? AND status IN ('active', 'release_scheduled'))`)
      .bind(stamp, tenantId, tenantId),
  ]);
  return getAccount(env, tenantId);
}

export async function resumeAccount(env: Env, tenantId: string): Promise<VoipAccountRow | null> {
  const account = await getAccount(env, tenantId);
  if (!account || account.status !== 'suspended' || !account.sub_account_id) return account;
  await platformProvider(env).setSubAccountStatus(account.sub_account_id, 'active');
  const stamp = nowIso();
  await env.MASTER_DB.batch([
    env.MASTER_DB.prepare(`UPDATE voip_accounts SET status = 'active', suspended_at = NULL, updated_at = ? WHERE tenant_id = ?`).bind(stamp, tenantId),
    env.MASTER_DB
      .prepare(`UPDATE tenant_channel_addresses SET is_active = 1, updated_at = ? WHERE tenant_id = ? AND channel = 'voice' AND address IN (SELECT phone_number FROM voip_number_registry WHERE tenant_id = ? AND status IN ('active', 'release_scheduled'))`)
      .bind(stamp, tenantId, tenantId),
  ]);
  return getAccount(env, tenantId);
}

/**
 * Close the agency's sub-account: every number is released at the provider FIRST (numbers.ts releaseAllNumbers; one
 * that cannot be released stops the close, so nothing keeps billing unseen), then the sub-account is closed and the
 * mirrored credentials are removed. Safe to repeat.
 */
export async function closeAccount(env: Env, tenantId: string, releaseAll: (env: Env, tenantId: string, reason: string) => Promise<void>): Promise<VoipAccountRow | null> {
  const account = await getAccount(env, tenantId);
  if (!account || account.status === 'closed') return account;
  if (account.status === 'pending') {
    await env.MASTER_DB.prepare(`DELETE FROM voip_accounts WHERE tenant_id = ? AND status = 'pending'`).bind(tenantId).run();
    return null;
  }
  await releaseAll(env, tenantId, 'account_closed');
  if (account.sub_account_id) {
    try {
      await platformProvider(env).closeSubAccount(account.sub_account_id);
    } catch (err) {
      // Already closed at the provider (a repeated close) is fine; anything else is surfaced.
      if (!(err && typeof err === 'object' && (err as { kind?: string }).kind === 'not_found')) throw err;
    }
  }
  const stamp = nowIso();
  await env.MASTER_DB
    .prepare(`UPDATE voip_accounts SET status = 'closed', closed_at = ?, updated_at = ?, credentials_enc = NULL WHERE tenant_id = ?`)
    .bind(stamp, stamp, tenantId)
    .run();
  const db = await anyTenantDb(env, tenantId);
  if (db && account.sub_account_id) await clearMirror(db, account.sub_account_id).catch(() => undefined);
  return getAccount(env, tenantId);
}
