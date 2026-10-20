/**
 * Numbers an agency rents through its sub-account (R304): offer, search, buy, release, registration, KYC, monthly rental.
 *
 * Rules this file keeps:
 *  - A number belongs to exactly one agency: voip_number_registry.phone_number is unique among live rows, and a
 *    purchase is CLAIMED there before the provider is called, so a retry or a race never buys twice.
 *  - A purchase needs, in this order: calling allowed for the agency (country policy, trial switch), a sub-account,
 *    a price for the agency's market (R206 catalogue, else 409 PRICE_NOT_CONFIGURED), approved KYC documents where
 *    the country requires them, and one unused number add-on grant for the month (bought through R206 or granted by
 *    the super admin). The grant is consumed by the purchase (registry.addon_id).
 *  - Registration: the number is added to master tenant_channel_addresses (channel 'voice'), which is how an inbound
 *    call finds the agency (routes/voip-callbacks.ts resolves the tenant from the called number), and to the
 *    agency's own voip_numbers list.
 *  - Release: routing stops first (the address row goes), then the provider releases the number, and only then do
 *    the agency's list row and the registry row go. No path removes a number row without releasing it at the provider.
 *  - Rental: the add-on is the monthly rent. The daily job renews each number from a grant for the new month; with
 *    none, the number is scheduled for release after a grace period and the owner is emailed.
 */

import type { Env } from '../../types';
import { generateId } from '../../utils/uuid';
import { normalizePhone } from '../../utils/phone';
import { currentPeriodKey, getCatalogue, marketForCountry } from '../plans/catalogue';
import { quoteAddon } from '../billing/addons';
import { BillingError, loadTenant, type TenantRow } from '../billing/subscriptions';
import { sendTransactional } from '../mail/transactional';
import { appUrl } from '../../utils/app-urls';
import { createVoipProvider, loadVoipSettings, type VoipAvailableNumber, type VoipProvider } from '../voip-provider';
import { getCountryPolicy, type CountryPolicy } from './country-policy';
import {
  VoipAccountError,
  accountProvider,
  agencyCountry,
  anyTenantDb,
  closeAccount,
  decisionFor,
  enableCalling,
  getAccount,
  platformProvider,
  type VoipAccountRow,
} from './subaccounts';

/** Days a number stays before it is released once the agency cancels or the rent is unpaid. */
export const RELEASE_GRACE_DAYS = 7;
export const CANCELLED_RELEASE_GRACE_DAYS = 14;
const STALE_CLAIM_MS = 2 * 60_000;
const DAY_MS = 86_400_000;
const E164 = /^\+[1-9]\d{7,14}$/;

export interface RegistryRow {
  id: string;
  tenant_id: string;
  phone_number: string;
  provider_number_id: string | null;
  sub_account_id: string | null;
  country: string;
  status: 'pending' | 'active' | 'release_scheduled' | 'released';
  idempotency_key: string;
  addon_id: string | null;
  monthly_price: number | null;
  currency: string | null;
  paid_through: string | null;
  release_at: string | null;
  release_reason: string | null;
  tenant_number_id: string | null;
  created_at: string;
  updated_at: string;
  released_at: string | null;
}

export function registryView(row: RegistryRow) {
  return {
    id: row.id,
    phoneNumber: row.phone_number,
    status: row.status,
    country: row.country,
    monthlyPrice: row.monthly_price,
    currency: row.currency,
    paidThrough: row.paid_through,
    releaseAt: row.release_at,
    releaseReason: row.release_reason,
    createdAt: row.created_at,
  };
}

// ── KYC documents ──────────────────────────────────────────────────────────────

export interface KycFile { name: string; url: string }

export interface KycRow {
  id: string;
  tenant_id: string;
  country: string;
  status: 'pending' | 'approved' | 'rejected';
  details: string | null;
  files: string | null;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function kycView(row: KycRow | null) {
  if (!row) return null;
  const parse = (v: string | null) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
  return {
    id: row.id,
    country: row.country,
    status: row.status,
    details: parse(row.details),
    files: parse(row.files) ?? [],
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    submittedAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getKyc(env: Env, tenantId: string, country: string): Promise<KycRow | null> {
  return env.MASTER_DB.prepare('SELECT * FROM number_documents WHERE tenant_id = ? AND country = ?').bind(tenantId, country).first<KycRow>();
}

/** The agency submits (or re-submits after a rejection) its documents; an approved set is final and cannot be replaced. */
export async function submitKyc(
  env: Env,
  tenantId: string,
  country: string,
  input: { details: Record<string, string>; files: KycFile[] },
): Promise<KycRow> {
  const existing = await getKyc(env, tenantId, country);
  if (existing?.status === 'approved') throw new VoipAccountError('KYC_ALREADY_APPROVED', 'Your documents for this country are already approved.', 409);
  const stamp = new Date().toISOString();
  if (existing) {
    await env.MASTER_DB
      .prepare(`UPDATE number_documents SET status = 'pending', details = ?, files = ?, review_note = NULL, reviewed_by = NULL, reviewed_at = NULL, updated_at = ? WHERE id = ?`)
      .bind(JSON.stringify(input.details), JSON.stringify(input.files), stamp, existing.id)
      .run();
  } else {
    await env.MASTER_DB
      .prepare(`INSERT INTO number_documents (id, tenant_id, country, status, details, files, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`)
      .bind(generateId(), tenantId, country, JSON.stringify(input.details), JSON.stringify(input.files), stamp, stamp)
      .run();
  }
  return (await getKyc(env, tenantId, country))!;
}

/** Super admin decision. Approval is what lets the agency buy numbers in that country. */
export async function reviewKyc(
  env: Env,
  tenantId: string,
  country: string,
  decision: { status: 'approved' | 'rejected'; note?: string | null; reviewer?: string | null },
): Promise<KycRow | null> {
  const row = await getKyc(env, tenantId, country);
  if (!row) return null;
  const stamp = new Date().toISOString();
  await env.MASTER_DB
    .prepare(`UPDATE number_documents SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`)
    .bind(decision.status, decision.note ?? null, decision.reviewer ?? null, stamp, stamp, row.id)
    .run();
  return getKyc(env, tenantId, country);
}

// ── Price and add-on grants ────────────────────────────────────────────────────

export interface NumberPrice { productKey: string; unitPrice: number; currency: string; total: number; taxTotal: number }

/** The monthly price of one number for this agency (provider monthly cost + margin, R206 engine). Null with a reason when it has none. */
export async function numberPrice(env: Env, tenant: TenantRow, country: string): Promise<{ price: NumberPrice | null; reason: string | null }> {
  const catalogue = await getCatalogue(env);
  const market = marketForCountry(country || tenant.country);
  const product = catalogue.addons.find((a) => a.channel === 'phone_number' && a.isActive && a.market === market);
  if (!product) return { price: null, reason: 'PRICE_NOT_CONFIGURED' };
  try {
    const q = await quoteAddon(env, { ...tenant, country: country || tenant.country }, product.key, 1);
    return { price: { productKey: product.key, unitPrice: q.unitPrice, currency: q.currency, total: q.total, taxTotal: q.taxTotal }, reason: null };
  } catch (err) {
    if (err instanceof BillingError) return { price: null, reason: err.code };
    throw err;
  }
}

/** Number add-on grants for a month that still have a unit free: units_granted minus the live numbers they back. */
export async function freeGrants(env: Env, tenantId: string, periodKey: string): Promise<Array<{ id: string; product_key: string }>> {
  const rows = await env.MASTER_DB
    .prepare(
      `SELECT ta.id, ta.product_key FROM tenant_addons ta
         JOIN addon_products ap ON ap.key = ta.product_key
        WHERE ta.tenant_id = ? AND ap.channel = 'phone_number' AND ta.period_key = ?
          AND ta.units_granted > (SELECT COUNT(*) FROM voip_number_registry r WHERE r.addon_id = ta.id AND r.status <> 'released')
        ORDER BY ta.created_at, ta.id`,
    )
    .bind(tenantId, periodKey)
    .all<{ id: string; product_key: string }>();
  return rows.results ?? [];
}

// ── Offer (what the Phone numbers screen shows before buying) ──────────────────

export async function numberOffer(env: Env, tenantId: string, db: D1Database) {
  const tenant = await loadTenant(env, tenantId);
  if (!tenant) throw new VoipAccountError('TENANT_NOT_FOUND', 'Agency not found.', 404);
  const decision = await decisionFor(env, tenant, db);
  const country = decision.country;
  const account = await getAccount(env, tenantId);
  const policy = decision.policy ?? (country ? await getCountryPolicy(env, country) : null);
  const { price, reason: priceReason } = await numberPrice(env, tenant, country);
  const kycRow = country ? await getKyc(env, tenantId, country) : null;
  const grants = await freeGrants(env, tenantId, currentPeriodKey());
  const live = await env.MASTER_DB
    .prepare(`SELECT * FROM voip_number_registry WHERE tenant_id = ? AND status IN ('active', 'release_scheduled', 'pending') ORDER BY created_at`)
    .bind(tenantId)
    .all<RegistryRow>();
  return {
    calling: { allowed: decision.allowed, reason: decision.reason, message: decision.message, country, position: policy?.position ?? null },
    account: account ? { status: account.status, provider: account.provider } : null,
    price: price ? { productKey: price.productKey, monthly: price.unitPrice, tax: price.taxTotal, total: price.total, currency: price.currency, includesMarginPct: 20 } : null,
    priceReason,
    kyc: { required: !!policy?.kycRequired, status: kycRow?.status ?? 'none', document: kycView(kycRow) },
    addon: { freeThisMonth: grants.length, productKey: price?.productKey ?? null },
    numbers: (live.results ?? []).map(registryView),
  };
}

// ── Search ─────────────────────────────────────────────────────────────────────

export async function searchNumbers(
  env: Env,
  tenantId: string,
  db: D1Database,
  input: { country?: string; areaCode?: string; contains?: string },
): Promise<VoipAvailableNumber[]> {
  const tenant = await loadTenant(env, tenantId);
  if (!tenant) throw new VoipAccountError('TENANT_NOT_FOUND', 'Agency not found.', 404);
  const decision = await decisionFor(env, tenant, db);
  if (!decision.allowed) throw new VoipAccountError('CALLING_NOT_AVAILABLE', decision.message ?? 'Calling is not available.', 403, { reason: decision.reason, country: decision.country });
  // The first search turns calling on for an agency the policy allows (one sub-account, created once); a suspended or closed account is not revived here.
  let account = await getAccount(env, tenantId);
  if (!account || account.status === 'closed' || account.status === 'pending') {
    account = (await enableCalling(env, tenantId, { db })).account;
  }
  if (account.status !== 'active') throw new VoipAccountError('CALLING_NOT_ENABLED', 'Calling is not active for this agency.', 409);
  // An agency rents numbers in its own country only (fraud control; other countries are switched on by the platform).
  const country = (input.country || decision.country).toUpperCase();
  if (country !== decision.country) throw new VoipAccountError('COUNTRY_MISMATCH', 'You can rent numbers in your own country only.', 403, { country: decision.country });
  const provider = await accountProvider(env, account);
  const found = await provider.searchAvailableNumbers(country, input.areaCode, input.contains);
  // Never offer a number another agency already holds.
  const taken = new Set<string>();
  if (found.length > 0) {
    const marks = found.map(() => '?').join(',');
    const rows = await env.MASTER_DB
      .prepare(`SELECT phone_number FROM voip_number_registry WHERE status <> 'released' AND phone_number IN (${marks})`)
      .bind(...found.map((n) => n.phoneNumber))
      .all<{ phone_number: string }>();
    for (const r of rows.results ?? []) taken.add(r.phone_number);
  }
  return found.filter((n) => !taken.has(n.phoneNumber)).slice(0, 20);
}

// ── Purchase ───────────────────────────────────────────────────────────────────

export interface PurchaseResult {
  id: string;
  phoneNumber: string;
  providerNumberId: string;
  registryId: string;
  replay: boolean;
}

const isUnique = (err: unknown) => /UNIQUE|constraint/i.test(err instanceof Error ? err.message : String(err));

export async function purchaseNumber(
  env: Env,
  tenantId: string,
  db: D1Database,
  input: { phoneNumber: string; friendlyName?: string; idempotencyKey?: string | null; webhookBaseUrl: string; now?: Date },
): Promise<PurchaseResult> {
  const now = input.now ?? new Date();
  const phone = normalizePhone(input.phoneNumber);
  if (!E164.test(phone)) throw new VoipAccountError('INVALID_NUMBER', 'Enter a valid phone number with country code.', 400);

  const tenant = await loadTenant(env, tenantId);
  if (!tenant) throw new VoipAccountError('TENANT_NOT_FOUND', 'Agency not found.', 404);
  if (tenant.status === 'suspended' || tenant.status === 'cancelled' || tenant.status === 'expired') {
    throw new VoipAccountError('ACCOUNT_BLOCKED', 'Numbers cannot be bought while the account is not active.', 409);
  }
  const decision = await decisionFor(env, tenant, db);
  if (!decision.allowed) throw new VoipAccountError('CALLING_NOT_AVAILABLE', decision.message ?? 'Calling is not available.', 403, { reason: decision.reason, country: decision.country });
  const account = await getAccount(env, tenantId);
  if (!account || account.status !== 'active') throw new VoipAccountError('CALLING_NOT_ENABLED', 'Turn on calling before buying a number.', 409);
  const country = decision.country;

  // A retry with the same key (or for the same number) returns the finished purchase.
  const key = `${tenantId}:${input.idempotencyKey?.trim() || `number:${phone}`}`;
  const prior = await env.MASTER_DB.prepare('SELECT * FROM voip_number_registry WHERE idempotency_key = ?').bind(key).first<RegistryRow>();
  if (prior) {
    if (prior.status === 'active' && prior.tenant_number_id) {
      return { id: prior.tenant_number_id, phoneNumber: prior.phone_number, providerNumberId: prior.provider_number_id ?? '', registryId: prior.id, replay: true };
    }
    if (prior.status === 'pending' && new Date(prior.updated_at).getTime() > now.getTime() - STALE_CLAIM_MS) {
      throw new VoipAccountError('PURCHASE_IN_PROGRESS', 'This purchase is already being processed.', 409);
    }
    if (prior.status !== 'released') {
      // An abandoned claim: drop it so the number can be bought afresh.
      if (prior.status === 'pending') await env.MASTER_DB.prepare(`DELETE FROM voip_number_registry WHERE id = ?`).bind(prior.id).run();
      else throw new VoipAccountError('NUMBER_UNAVAILABLE', 'That number is not available.', 409);
    } else {
      await env.MASTER_DB.prepare(`DELETE FROM voip_number_registry WHERE id = ?`).bind(prior.id).run();
    }
  }

  const { price, reason } = await numberPrice(env, tenant, country);
  if (!price) {
    throw new VoipAccountError(reason ?? 'PRICE_NOT_CONFIGURED', 'Pricing for phone numbers in your region is not available yet. Please contact support.', 409);
  }

  const policy: CountryPolicy | null = decision.policy ?? (await getCountryPolicy(env, country));
  if (policy?.kycRequired) {
    const kyc = await getKyc(env, tenantId, country);
    if (kyc?.status !== 'approved') {
      throw new VoipAccountError('KYC_REQUIRED', 'Numbers in your country need approved business documents first.', 409, { country, kycStatus: kyc?.status ?? 'none' });
    }
  }

  // Claim the add-on grant and the number in one row; the unique indexes are the lock.
  const period = currentPeriodKey(now);
  const registryId = generateId();
  let claimed = false;
  const grants = await freeGrants(env, tenantId, period);
  if (grants.length === 0) {
    throw new VoipAccountError('NUMBER_ADDON_REQUIRED', 'Add a phone number to your plan first (Buy more).', 409, { productKey: price.productKey, monthly: price.unitPrice, currency: price.currency });
  }
  for (const grant of grants) {
    try {
      // One statement checks the grant still has a unit free and claims it, so two requests cannot both take the last one.
      const claim = await env.MASTER_DB
        .prepare(
          `INSERT INTO voip_number_registry (id, tenant_id, phone_number, sub_account_id, country, status, idempotency_key, addon_id, monthly_price, currency, paid_through, created_at, updated_at)
           SELECT ?, ?, ?, ?, ?, 'pending', ?, ta.id, ?, ?, ?, ?, ? FROM tenant_addons ta
            WHERE ta.id = ? AND ta.units_granted > (SELECT COUNT(*) FROM voip_number_registry r WHERE r.addon_id = ta.id AND r.status <> 'released')`,
        )
        .bind(registryId, tenantId, phone, account.sub_account_id, country, key, price.unitPrice, price.currency, period, now.toISOString(), now.toISOString(), grant.id)
        .run();
      if ((claim.meta.changes ?? 0) > 0) {
        claimed = true;
        break;
      }
    } catch (err) {
      if (!isUnique(err)) throw err;
      // Either the number is held (by this or another agency) or another request took this grant; tell them apart.
      const holder = await env.MASTER_DB.prepare(`SELECT 1 AS hit FROM voip_number_registry WHERE phone_number = ? AND status <> 'released'`).bind(phone).first();
      if (holder) throw new VoipAccountError('NUMBER_UNAVAILABLE', 'That number is not available.', 409);
    }
  }
  if (!claimed) throw new VoipAccountError('NUMBER_ADDON_REQUIRED', 'Add a phone number to your plan first (Buy more).', 409, { productKey: price.productKey });

  const provider = await accountProvider(env, account);
  let bought;
  try {
    bought = await provider.purchaseNumber(phone, input.friendlyName, input.webhookBaseUrl);
  } catch (err) {
    await env.MASTER_DB.prepare(`DELETE FROM voip_number_registry WHERE id = ?`).bind(registryId).run().catch(() => undefined);
    throw err;
  }

  const tenantNumberId = generateId();
  try {
    await env.MASTER_DB
      .prepare(`INSERT INTO tenant_channel_addresses (id, tenant_id, channel, address, provider, label) VALUES (?, ?, 'voice', ?, 'twilio', ?)`)
      .bind(generateId(), tenantId, bought.phoneNumber, input.friendlyName?.trim() || 'Company line')
      .run();
    const count = await db.prepare('SELECT COUNT(*) AS cnt FROM voip_numbers').first<{ cnt: number }>();
    await db
      .prepare(
        `INSERT INTO voip_numbers (id, phone_number, friendly_name, provider_number_id, provider, purpose, is_default, monthly_cost, capabilities)
         VALUES (?, ?, ?, ?, 'twilio', 'general', ?, ?, ?)`,
      )
      .bind(tenantNumberId, bought.phoneNumber, bought.friendlyName, bought.providerNumberId, (count?.cnt ?? 0) === 0 ? 1 : 0, price.unitPrice, JSON.stringify(bought.capabilities))
      .run();
    await env.MASTER_DB
      .prepare(`UPDATE voip_number_registry SET status = 'active', provider_number_id = ?, phone_number = ?, tenant_number_id = ?, updated_at = ? WHERE id = ?`)
      .bind(bought.providerNumberId, bought.phoneNumber, tenantNumberId, new Date().toISOString(), registryId)
      .run();
  } catch (err) {
    // Bought but not registered: give it back so it neither bills nor stays unreachable.
    await provider.releaseNumber(bought.providerNumberId).catch((e) => console.error('[voip] compensating release failed:', e instanceof Error ? e.message : e));
    await env.MASTER_DB.prepare(`DELETE FROM tenant_channel_addresses WHERE tenant_id = ? AND channel = 'voice' AND address = ?`).bind(tenantId, bought.phoneNumber).run().catch(() => undefined);
    await db.prepare('DELETE FROM voip_numbers WHERE id = ?').bind(tenantNumberId).run().catch(() => undefined);
    await env.MASTER_DB.prepare(`DELETE FROM voip_number_registry WHERE id = ?`).bind(registryId).run().catch(() => undefined);
    if (isUnique(err)) throw new VoipAccountError('NUMBER_UNAVAILABLE', 'That number is already registered to another workspace.', 409);
    throw err;
  }
  return { id: tenantNumberId, phoneNumber: bought.phoneNumber, providerNumberId: bought.providerNumberId, registryId, replay: false };
}

// ── Release ────────────────────────────────────────────────────────────────────

const isNotFound = (err: unknown) => !!err && typeof err === 'object' && (err as { kind?: string }).kind === 'not_found';

/**
 * Release one registered number. Routing to the agency stops at once; the provider releases the number (one that
 * is already gone counts as released); then the agency's list row and the registry row go. When the provider
 * refuses, the number stays registered as release_scheduled for the daily job to retry, and the error is thrown.
 */
export async function releaseRegistered(env: Env, row: RegistryRow, reason: string): Promise<void> {
  if (row.status === 'released') return;
  const stamp = new Date().toISOString();
  // 1. Stop routing: the called number no longer resolves to this agency.
  await env.MASTER_DB.prepare(`DELETE FROM tenant_channel_addresses WHERE tenant_id = ? AND channel = 'voice' AND address = ?`).bind(row.tenant_id, row.phone_number).run();

  // 2. Release at the provider.
  const account = await getAccount(env, row.tenant_id);
  if (row.provider_number_id && account?.sub_account_id && account.credentials_enc) {
    const woke = account.status === 'suspended';
    try {
      // A suspended sub-account refuses its own credentials: wake it for the release and suspend it again after.
      if (woke) await platformProvider(env).setSubAccountStatus(account.sub_account_id, 'active');
      const provider = await accountProvider(env, account);
      await provider.releaseNumber(row.provider_number_id);
    } catch (err) {
      if (!isNotFound(err)) {
        await env.MASTER_DB
          .prepare(`UPDATE voip_number_registry SET status = 'release_scheduled', release_at = COALESCE(release_at, ?), release_reason = ?, updated_at = ? WHERE id = ?`)
          .bind(stamp, 'release_failed', stamp, row.id)
          .run();
        throw err;
      }
    } finally {
      if (woke) await platformProvider(env).setSubAccountStatus(account.sub_account_id, 'suspended').catch(() => undefined);
    }
  } else if (row.provider_number_id) {
    // The sub-account is already closed: closing it released the numbers at the provider.
  }

  // 3. Remove the agency's list row, promoting another number to default when needed.
  const db = await anyTenantDb(env, row.tenant_id);
  if (db && row.tenant_number_id) {
    const gone = await db.prepare('SELECT is_default FROM voip_numbers WHERE id = ?').bind(row.tenant_number_id).first<{ is_default: number }>();
    await db.prepare('DELETE FROM voip_numbers WHERE id = ?').bind(row.tenant_number_id).run();
    if (gone?.is_default) {
      await db.prepare('UPDATE voip_numbers SET is_default = 1 WHERE id = (SELECT id FROM voip_numbers ORDER BY created_at ASC LIMIT 1)').run();
    }
  }

  await env.MASTER_DB
    .prepare(`UPDATE voip_number_registry SET status = 'released', released_at = ?, release_reason = ?, updated_at = ? WHERE id = ?`)
    .bind(stamp, reason, stamp, row.id)
    .run();
}

export async function liveNumbers(env: Env, tenantId: string): Promise<RegistryRow[]> {
  const rows = await env.MASTER_DB
    .prepare(`SELECT * FROM voip_number_registry WHERE tenant_id = ? AND status IN ('active', 'release_scheduled') ORDER BY created_at`)
    .bind(tenantId)
    .all<RegistryRow>();
  return rows.results ?? [];
}

export async function releaseAllNumbers(env: Env, tenantId: string, reason: string): Promise<void> {
  for (const row of await liveNumbers(env, tenantId)) await releaseRegistered(env, row, reason);
}

/** Release the number of the agency's list (voip_numbers.id): through the registry when it has one, else through the agency's own provider settings. */
export async function releaseTenantNumber(
  env: Env,
  tenantId: string,
  db: D1Database,
  numberId: string,
  legacy: { providerNumberId: string | null },
): Promise<void> {
  const reg = await env.MASTER_DB
    .prepare(`SELECT * FROM voip_number_registry WHERE tenant_id = ? AND tenant_number_id = ? AND status <> 'released'`)
    .bind(tenantId, numberId)
    .first<RegistryRow>();
  if (reg) {
    await releaseRegistered(env, reg, 'agency_released');
    return;
  }
  // A number bought before sub-accounts (or on the agency's own provider account): the provider must still release it.
  if (legacy.providerNumberId) {
    const settings = await loadVoipSettings(env, db);
    if (!settings) throw new VoipAccountError('PROVIDER_NOT_CONFIGURED', 'The phone provider is not configured, so this number cannot be released.', 409);
    const provider: VoipProvider = createVoipProvider(env, settings);
    try {
      await provider.releaseNumber(legacy.providerNumberId);
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }
}

// ── Scheduling: cancellation, unpaid rent, daily job ───────────────────────────

async function ownerEmail(env: Env, tenantId: string): Promise<{ email: string | null; agency: string }> {
  const t = await loadTenant(env, tenantId);
  return { email: t?.owner_email ?? null, agency: t?.company_name ?? 'your agency' };
}

async function sendReleaseNotice(env: Env, tenantId: string, numbers: string[], releaseOn: string, reason: string): Promise<void> {
  if (numbers.length === 0) return;
  const { email, agency } = await ownerEmail(env, tenantId);
  if (!email) return;
  await sendTransactional(env, {
    to: email,
    template: 'number_release_notice',
    tenantId,
    data: { agencyName: agency, numbers, releaseOn: releaseOn.slice(0, 10), reason, billingUrl: `${appUrl(env)}/settings/billing` },
  });
}

/** An agency was cancelled: its numbers go after a grace period, with a notice. Returns the numbers scheduled. */
export async function scheduleTenantRelease(env: Env, tenantId: string, graceDays: number = CANCELLED_RELEASE_GRACE_DAYS, now: Date = new Date()): Promise<string[]> {
  const live = (await liveNumbers(env, tenantId)).filter((r) => r.status === 'active');
  if (live.length === 0) return [];
  const releaseAt = new Date(now.getTime() + graceDays * DAY_MS).toISOString();
  await env.MASTER_DB
    .prepare(`UPDATE voip_number_registry SET status = 'release_scheduled', release_at = ?, release_reason = 'cancelled', updated_at = ? WHERE tenant_id = ? AND status = 'active'`)
    .bind(releaseAt, now.toISOString(), tenantId)
    .run();
  await sendReleaseNotice(env, tenantId, live.map((r) => r.phone_number), releaseAt, 'cancelled');
  return live.map((r) => r.phone_number);
}

/** The agency came back before the grace ran out: keep its numbers. */
export async function cancelScheduledRelease(env: Env, tenantId: string, reason: string = 'cancelled'): Promise<number> {
  const res = await env.MASTER_DB
    .prepare(`UPDATE voip_number_registry SET status = 'active', release_at = NULL, release_reason = NULL, updated_at = ? WHERE tenant_id = ? AND status = 'release_scheduled' AND release_reason = ?`)
    .bind(new Date().toISOString(), tenantId, reason)
    .run();
  return res.meta.changes ?? 0;
}

export interface NumberJobResult {
  renewed: number;
  scheduled: number;
  restored: number;
  released: number;
  failed: number;
  closedAccounts: number;
}

/**
 * Daily job (platform-wide): renew rent, schedule release for unpaid numbers, restore numbers whose rent arrived,
 * release those whose grace ended, and close the sub-account of an agency that has no numbers left and is cancelled.
 */
export async function runNumberLifecycle(env: Env, now: Date = new Date()): Promise<NumberJobResult> {
  const result: NumberJobResult = { renewed: 0, scheduled: 0, restored: 0, released: 0, failed: 0, closedAccounts: 0 };
  const period = currentPeriodKey(now);

  // Rent: every active number whose paid month is behind.
  const due = await env.MASTER_DB
    .prepare(`SELECT * FROM voip_number_registry WHERE status = 'active' AND (paid_through IS NULL OR paid_through < ?) ORDER BY tenant_id, created_at`)
    .bind(period)
    .all<RegistryRow>();
  const unpaid = new Map<string, RegistryRow[]>();
  for (const row of due.results ?? []) {
    const grants = await freeGrants(env, row.tenant_id, period);
    if (grants.length > 0) {
      const res = await env.MASTER_DB
        .prepare(
          `UPDATE voip_number_registry SET addon_id = ?1, paid_through = ?2, updated_at = ?3 WHERE id = ?4 AND status = 'active'
             AND (SELECT units_granted FROM tenant_addons WHERE id = ?1) > (SELECT COUNT(*) FROM voip_number_registry r WHERE r.addon_id = ?1 AND r.status <> 'released')`,
        )
        .bind(grants[0].id, period, now.toISOString(), row.id)
        .run();
      if ((res.meta.changes ?? 0) > 0) result.renewed++;
    } else {
      unpaid.set(row.tenant_id, [...(unpaid.get(row.tenant_id) ?? []), row]);
    }
  }
  for (const [tenantId, rows] of unpaid) {
    const releaseAt = new Date(now.getTime() + RELEASE_GRACE_DAYS * DAY_MS).toISOString();
    for (const row of rows) {
      await env.MASTER_DB
        .prepare(`UPDATE voip_number_registry SET status = 'release_scheduled', release_at = ?, release_reason = 'unpaid', updated_at = ? WHERE id = ? AND status = 'active'`)
        .bind(releaseAt, now.toISOString(), row.id)
        .run();
      result.scheduled++;
    }
    await sendReleaseNotice(env, tenantId, rows.map((r) => r.phone_number), releaseAt, 'unpaid');
  }

  // Numbers waiting for unpaid rent come back when a grant for this month exists.
  const waiting = await env.MASTER_DB
    .prepare(`SELECT * FROM voip_number_registry WHERE status = 'release_scheduled' AND release_reason = 'unpaid' ORDER BY tenant_id, created_at`)
    .all<RegistryRow>();
  for (const row of waiting.results ?? []) {
    const grants = await freeGrants(env, row.tenant_id, period);
    if (grants.length === 0) continue;
    await env.MASTER_DB
      .prepare(
        `UPDATE voip_number_registry SET status = 'active', addon_id = ?1, paid_through = ?2, release_at = NULL, release_reason = NULL, updated_at = ?3
          WHERE id = ?4 AND status = 'release_scheduled'
            AND (SELECT units_granted FROM tenant_addons WHERE id = ?1) > (SELECT COUNT(*) FROM voip_number_registry r WHERE r.addon_id = ?1 AND r.status <> 'released')`,
      )
      .bind(grants[0].id, period, now.toISOString(), row.id)
      .run()
      .then((r) => { if ((r.meta.changes ?? 0) > 0) result.restored++; });
  }

  // Grace over: release (routing was kept until now for unpaid, and was never cut for cancelled; release cuts it).
  const over = await env.MASTER_DB
    .prepare(`SELECT * FROM voip_number_registry WHERE status = 'release_scheduled' AND release_at IS NOT NULL AND release_at <= ? ORDER BY created_at`)
    .bind(now.toISOString())
    .all<RegistryRow>();
  const touched = new Set<string>();
  for (const row of over.results ?? []) {
    try {
      await releaseRegistered(env, row, row.release_reason === 'release_failed' ? 'retry' : row.release_reason || 'scheduled');
      result.released++;
      touched.add(row.tenant_id);
    } catch (err) {
      result.failed++;
      console.error('[voip] scheduled release failed:', row.id, err instanceof Error ? err.message : err);
    }
  }

  // A cancelled agency with nothing left to release no longer needs its sub-account.
  for (const tenantId of touched) {
    const tenant = await loadTenant(env, tenantId);
    if (tenant?.status !== 'cancelled') continue;
    if ((await liveNumbers(env, tenantId)).length > 0) continue;
    try {
      await closeAccount(env, tenantId, releaseAllNumbers);
      result.closedAccounts++;
    } catch (err) {
      result.failed++;
      console.error('[voip] closing sub-account failed:', tenantId, err instanceof Error ? err.message : err);
    }
  }
  return result;
}

