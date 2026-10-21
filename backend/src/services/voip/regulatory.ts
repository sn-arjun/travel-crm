/**
 * Regulatory bundles for numbers (R137, design TOUR-OPERATOR-DESIGN.md 5.6).
 *
 * Some countries only let an agency buy a number once its business identity and address are approved by the phone
 * provider. A country says so by having `call_country_policy.kyc_requirements` (the fields and documents the agency
 * form asks for). For such a country the flow over `number_documents` is:
 *
 *   none -> submitted -> platform_review -> provider_review -> approved        (a rejection at either review: rejected)
 *
 *   none             no row yet
 *   submitted        the agency sent its answers; the super admin has not decided (status pending)
 *   platform_review  the super admin approved; the bundle is not with the provider yet (submission failed or not run:
 *                    provider_status empty or submit_failed; the admin can submit again)
 *   provider_review  the bundle is with the provider (provider_status pending-review or in-review)
 *   approved         the provider approved it (twilio-approved): numbers can be bought
 *   rejected         the super admin rejected the documents, or the provider rejected the bundle (the reason is kept);
 *                    the agency corrects and sends again, which goes back to submitted
 *
 * The provider tells us by a signed status callback (routes/voip-callbacks.ts, POST /regulatory-callback/:tenantKey) or,
 * as a backup, when the hourly poll asks (job voip.regulatory-poll). A country without a requirement list keeps the
 * earlier flow: the super admin's approval is all a purchase needs.
 *
 * The provider is called as the agency's sub-account, so the bundle and the address belong to the account that buys the
 * number. Uploaded files are read back from our own storage (FILE_STORAGE) and streamed to the provider.
 */

import type { Env } from '../../types';
import { generateId } from '../../utils/uuid';
import { decryptSecret } from '../../utils/crypto-box';
import { loadTenant } from '../billing/subscriptions';
import { NotImplementedForProvider, VoipProviderError } from '../voip-base';
import {
  subAccountSecretAad,
  type VoipNumberType,
  type VoipRegulatoryAddress,
  type VoipRegulatoryDocument,
} from './contract';
import { getCountryPolicy, type CountryPolicy, type KycRequirement } from './country-policy';
import { VoipAccountError, accountProvider, enableCalling, getAccount } from './subaccounts';

export const REGULATORY_STATES = ['none', 'submitted', 'platform_review', 'provider_review', 'approved', 'rejected'] as const;
export type RegulatoryState = (typeof REGULATORY_STATES)[number];

/** The channel of tenant_channel_addresses that holds an agency's unguessable regulatory callback key. */
export const REGULATORY_KEY_CHANNEL = 'voip_regulatory_webhook';

/** The provider statuses we store. 'submit_failed' is ours: the platform could not hand the bundle over. */
const IN_REVIEW = new Set(['pending-review', 'in-review']);
const KNOWN_PROVIDER_STATUSES = new Set(['draft', 'pending-review', 'in-review', 'twilio-approved', 'twilio-rejected', 'submit_failed']);

export const NUMBER_TYPES: readonly VoipNumberType[] = ['local', 'mobile', 'national'];

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_FILES = 6;
export const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

/** A file the agency attached: `key` is its object in our storage; `url` is kept for documents sent as links before R137. */
export interface RegulatoryFile {
  name: string;
  url?: string;
  /** Storage key (FILE_STORAGE) of an uploaded file. */
  key?: string;
  /** The requirement this file answers. */
  field?: string;
  contentType?: string;
  size?: number;
}

/** The part of a number_documents row this service reads and writes. */
export interface DocRow {
  id: string;
  tenant_id: string;
  country: string;
  status: 'pending' | 'approved' | 'rejected';
  details: string | null;
  files: string | null;
  review_note: string | null;
  provider_bundle_sid: string | null;
  provider_address_sid: string | null;
  provider_status: string | null;
  provider_status_at: string | null;
  provider_failure_reason: string | null;
  number_type: string | null;
}

export async function loadDoc(env: Env, tenantId: string, country: string): Promise<DocRow | null> {
  return env.MASTER_DB.prepare('SELECT * FROM number_documents WHERE tenant_id = ? AND country = ?').bind(tenantId, country).first<DocRow>();
}

/** Does this country have a provider bundle flow (a requirement list and documents required)? */
export function hasBundleFlow(policy: Pick<CountryPolicy, 'kycRequired' | 'kycRequirements'> | null | undefined): boolean {
  return !!policy?.kycRequired && !!policy.kycRequirements && policy.kycRequirements.length > 0;
}

/** Where a document set stands (see the header). */
export function regulatoryState(row: Pick<DocRow, 'status' | 'provider_status'> | null, bundleFlow: boolean): RegulatoryState {
  if (!row) return 'none';
  if (row.status === 'rejected') return 'rejected';
  if (!bundleFlow) return row.status === 'approved' ? 'approved' : 'submitted';
  if (row.status === 'pending') return 'submitted';
  if (row.provider_status === 'twilio-approved') return 'approved';
  if (row.provider_status === 'twilio-rejected') return 'rejected';
  if (row.provider_status && IN_REVIEW.has(row.provider_status)) return 'provider_review';
  return 'platform_review';
}

/** What the agency and the console may see of the provider side. Sids stay on the server side of the console view only. */
export function providerView(row: DocRow | null, bundleFlow: boolean, includeSids = false) {
  if (!row) return { state: 'none' as RegulatoryState, providerStatus: null, providerStatusAt: null, failureReason: null, numberType: 'local' };
  const state = regulatoryState(row, bundleFlow);
  return {
    state,
    providerStatus: bundleFlow ? row.provider_status : null,
    providerStatusAt: bundleFlow ? row.provider_status_at : null,
    failureReason: state === 'rejected' ? row.provider_failure_reason || row.review_note : row.provider_failure_reason,
    numberType: row.number_type || 'local',
    ...(includeSids ? { bundleSid: row.provider_bundle_sid, addressSid: row.provider_address_sid } : {}),
  };
}

// ── What the agency sends ──────────────────────────────────────────────────────

export interface RequirementProblem {
  key: string;
  message: string;
}

/** The structured address of an `address` requirement. */
export interface AddressValue {
  street: string;
  city: string;
  region?: string;
  postalCode: string;
}

export function readAddress(value: unknown): AddressValue | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const text = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
  const street = text(v.street);
  const city = text(v.city);
  const postalCode = text(v.postalCode);
  if (!street || !city || !postalCode) return null;
  return { street, city, postalCode, region: text(v.region) };
}

/** Check an agency's answers against the country's requirement list. Empty = complete. */
export function validateAgainstRequirements(
  requirements: KycRequirement[],
  details: Record<string, unknown>,
  files: RegulatoryFile[],
): RequirementProblem[] {
  const problems: RequirementProblem[] = [];
  for (const r of requirements) {
    if (r.type === 'file') {
      // Only a file in our own storage reaches the provider; a link (the earlier flow) does not count here.
      const has = files.some((f) => f.field === r.key && f.key);
      if (r.required && !has) problems.push({ key: r.key, message: `${r.label} is required` });
      continue;
    }
    const value = details[r.key];
    if (r.type === 'address') {
      if (value === undefined || value === null || value === '') {
        if (r.required) problems.push({ key: r.key, message: `${r.label} is required` });
      } else if (!readAddress(value)) {
        problems.push({ key: r.key, message: `${r.label} needs a street, a city and a postal code` });
      }
      continue;
    }
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) {
      if (r.required) problems.push({ key: r.key, message: `${r.label} is required` });
      continue;
    }
    if (r.type === 'date' && Number.isNaN(Date.parse(text))) problems.push({ key: r.key, message: `${r.label} is not a valid date` });
  }
  return problems;
}

// ── The unguessable callback key ───────────────────────────────────────────────

/** The key in this agency's regulatory callback URL; `create` makes one when it has none. */
export async function regulatoryWebhookKey(env: Env, tenantId: string, create: boolean): Promise<string | null> {
  const existing = await env.MASTER_DB
    .prepare('SELECT address FROM tenant_channel_addresses WHERE tenant_id = ? AND channel = ? AND is_active = 1 LIMIT 1')
    .bind(tenantId, REGULATORY_KEY_CHANNEL)
    .first<{ address: string }>();
  if (existing) return existing.address;
  if (!create) return null;
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const key = `vr_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  await env.MASTER_DB
    .prepare(`INSERT INTO tenant_channel_addresses (id, tenant_id, channel, address, provider, label) VALUES (?, ?, ?, ?, NULL, 'Number regulatory callback')`)
    .bind(generateId(), tenantId, REGULATORY_KEY_CHANNEL, key)
    .run();
  return key;
}

export async function tenantForRegulatoryKey(env: Env, key: string): Promise<string | null> {
  const row = await env.MASTER_DB
    .prepare('SELECT tenant_id FROM tenant_channel_addresses WHERE channel = ? AND address = ? AND is_active = 1')
    .bind(REGULATORY_KEY_CHANNEL, key)
    .first<{ tenant_id: string }>();
  return row?.tenant_id ?? null;
}

/** The auth tokens a callback for this agency may be signed with: its sub-account's, then the platform's. */
export async function callbackTokens(env: Env, tenantId: string): Promise<string[]> {
  const tokens: string[] = [];
  try {
    const account = await getAccount(env, tenantId);
    if (account?.sub_account_id && account.credentials_enc) {
      const { value } = await decryptSecret(env, account.credentials_enc, subAccountSecretAad(tenantId, account.sub_account_id));
      if (value) tokens.push(value);
    }
  } catch (e) {
    console.error('[voip-regulatory] sub-account token unavailable:', e instanceof Error ? e.name : 'error');
  }
  if (env.TWILIO_AUTH_TOKEN) tokens.push(env.TWILIO_AUTH_TOKEN);
  return tokens;
}

// ── Talking to the provider ────────────────────────────────────────────────────

const nowIso = () => new Date().toISOString();

async function setProviderState(
  env: Env,
  id: string,
  fields: { bundleSid?: string | null; addressSid?: string | null; status: string | null; failureReason?: string | null },
): Promise<void> {
  const stamp = nowIso();
  await env.MASTER_DB
    .prepare(
      `UPDATE number_documents SET provider_bundle_sid = COALESCE(?, provider_bundle_sid), provider_address_sid = COALESCE(?, provider_address_sid),
         provider_status = ?, provider_status_at = ?, provider_failure_reason = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(fields.bundleSid ?? null, fields.addressSid ?? null, fields.status, stamp, fields.failureReason ?? null, stamp, id)
    .run();
}

function parseJson<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function readDocuments(env: Env, files: RegulatoryFile[]): Promise<VoipRegulatoryDocument[]> {
  const out: VoipRegulatoryDocument[] = [];
  for (const file of files) {
    if (!file.key) continue; // a link sent before uploads existed cannot be streamed
    const object = await env.FILE_STORAGE.get(file.key);
    if (!object) throw new VoipAccountError('DOCUMENT_MISSING', `The uploaded file ${file.name} is no longer in storage. Ask the agency to upload it again.`, 409);
    out.push({
      field: file.field ?? 'document',
      name: file.name,
      contentType: file.contentType || object.httpMetadata?.contentType || 'application/octet-stream',
      bytes: await object.arrayBuffer(),
    });
  }
  return out;
}

export interface SubmitResult {
  state: RegulatoryState;
  providerStatus: string | null;
  failureReason: string | null;
}

/**
 * Hand the approved documents to the provider as a bundle. Needs the super admin's approval first. A bundle that is
 * already with the provider (or approved) is left alone. When the provider refuses, the row keeps provider_status
 * 'submit_failed' with the reason and the error is thrown for the caller to show.
 */
export async function submitToProvider(env: Env, tenantId: string, country: string, opts: { baseUrl: string }): Promise<SubmitResult> {
  const code = country.toUpperCase();
  const policy = await getCountryPolicy(env, code);
  if (!hasBundleFlow(policy)) throw new VoipAccountError('NO_BUNDLE_FLOW', 'This country has no provider bundle; approval is enough.', 409, { country: code });
  const doc = await loadDoc(env, tenantId, code);
  if (!doc) throw new VoipAccountError('KYC_REQUIRED', 'The agency has not sent its documents for this country.', 409, { country: code });
  if (doc.status !== 'approved') throw new VoipAccountError('KYC_NOT_APPROVED', 'Approve the documents before submitting them to the provider.', 409, { country: code, kycStatus: doc.status });
  if (doc.provider_bundle_sid && (doc.provider_status === 'twilio-approved' || (doc.provider_status && IN_REVIEW.has(doc.provider_status)))) {
    return { state: regulatoryState(doc, true), providerStatus: doc.provider_status, failureReason: null };
  }

  const tenant = await loadTenant(env, tenantId);
  if (!tenant) throw new VoipAccountError('TENANT_NOT_FOUND', 'Agency not found.', 404);

  try {
    let account = await getAccount(env, tenantId);
    if (!account || account.status !== 'active') account = (await enableCalling(env, tenantId)).account;
    if (account.status !== 'active') throw new VoipAccountError('CALLING_NOT_ENABLED', 'Calling is not active for this agency.', 409);
    const provider = await accountProvider(env, account);
    if (!provider.submitRegulatoryBundle) throw new NotImplementedForProvider(provider.providerName, 'submitRegulatoryBundle');

    const details = parseJson<Record<string, unknown>>(doc.details, {});
    const address = readAddress(details.address);
    if (!address) throw new VoipAccountError('KYC_INCOMPLETE', 'The business address is incomplete.', 409, { country: code });
    const businessName = typeof details.businessName === 'string' ? details.businessName.trim() : '';
    if (!businessName) throw new VoipAccountError('KYC_INCOMPLETE', 'The business name is missing.', 409, { country: code });
    const attributes: Record<string, string> = {};
    for (const [key, value] of Object.entries(details)) {
      if (key !== 'address' && key !== 'businessName' && typeof value === 'string' && value.trim()) attributes[key] = value.trim();
    }
    const regulatoryAddress: VoipRegulatoryAddress = {
      customerName: businessName,
      street: address.street,
      city: address.city,
      region: address.region || address.city,
      postalCode: address.postalCode,
      isoCountry: code,
    };
    const documents = await readDocuments(env, parseJson<RegulatoryFile[]>(doc.files, []));
    const key = await regulatoryWebhookKey(env, tenantId, true);
    const numberType = (NUMBER_TYPES.find((t) => t === doc.number_type) ?? 'local') as VoipNumberType;

    const result = await provider.submitRegulatoryBundle({
      country: code,
      numberType,
      endUser: { name: businessName, attributes },
      address: regulatoryAddress,
      documents,
      email: tenant.owner_email || 'support@invalid.example',
      statusCallbackUrl: `${opts.baseUrl.replace(/\/+$/, '')}/api/v1/voip/regulatory-callback/${key}`,
    });
    const status = KNOWN_PROVIDER_STATUSES.has(result.status) ? result.status : 'pending-review';
    await setProviderState(env, doc.id, { bundleSid: result.bundleSid, addressSid: result.addressSid, status });
    return { state: regulatoryState({ status: 'approved', provider_status: status }, true), providerStatus: status, failureReason: null };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'The provider did not accept the bundle.';
    await setProviderState(env, doc.id, { status: 'submit_failed', failureReason: reason.slice(0, 500) });
    throw err;
  }
}

/**
 * The super admin approved an agency's documents: for a country with a bundle flow, submit to the provider now. A failure
 * is recorded on the row (state platform_review with the reason) and returned, never thrown, so the approval stands and the
 * admin can retry.
 */
export async function afterPlatformApproval(env: Env, tenantId: string, country: string, opts: { baseUrl: string }): Promise<{ submitted: boolean; error: string | null }> {
  const policy = await getCountryPolicy(env, country);
  if (!hasBundleFlow(policy)) return { submitted: false, error: null };
  try {
    await submitToProvider(env, tenantId, country, opts);
    return { submitted: true, error: null };
  } catch (err) {
    console.error('[voip-regulatory] submit failed:', err instanceof Error ? err.message : 'error');
    return { submitted: false, error: err instanceof Error ? err.message : 'submit failed' };
  }
}

/** Record what the provider says about a bundle. Ignores a bundle that is not the row's current one. True when something changed. */
export async function applyProviderStatus(
  env: Env,
  tenantId: string,
  bundleSid: string,
  update: { status: string; failureReason?: string | null },
): Promise<DocRow | null> {
  const row = await env.MASTER_DB
    .prepare('SELECT * FROM number_documents WHERE tenant_id = ? AND provider_bundle_sid = ?')
    .bind(tenantId, bundleSid)
    .first<DocRow>();
  if (!row) return null;
  const status = KNOWN_PROVIDER_STATUSES.has(update.status) ? update.status : row.provider_status;
  if (status === row.provider_status && (update.failureReason ?? null) === (row.provider_failure_reason ?? null)) return row;
  await setProviderState(env, row.id, { status, failureReason: status === 'twilio-rejected' ? update.failureReason ?? row.provider_failure_reason : null });
  return loadDoc(env, tenantId, row.country);
}

/** Ask the provider where the bundle stands and record it. Returns the document row as it is afterwards. */
export async function refreshProviderStatus(env: Env, tenantId: string, country: string): Promise<DocRow | null> {
  const doc = await loadDoc(env, tenantId, country.toUpperCase());
  if (!doc?.provider_bundle_sid) return doc;
  const account = await getAccount(env, tenantId);
  if (!account || account.status === 'closed') return doc;
  const provider = await accountProvider(env, account);
  if (!provider.getRegulatoryBundleStatus) return doc;
  try {
    const status = await provider.getRegulatoryBundleStatus(doc.provider_bundle_sid);
    return (await applyProviderStatus(env, tenantId, doc.provider_bundle_sid, status)) ?? doc;
  } catch (err) {
    if (err instanceof VoipProviderError && err.kind === 'not_found') return doc;
    throw err;
  }
}

/** The hourly backup for the status callback: every bundle of this agency still in review is asked about. */
export async function pollRegulatory(env: Env, tenantId: string): Promise<{ checked: number; changed: number }> {
  const rows = await env.MASTER_DB
    .prepare(`SELECT country, provider_status FROM number_documents WHERE tenant_id = ? AND provider_bundle_sid IS NOT NULL AND provider_status IN ('pending-review', 'in-review')`)
    .bind(tenantId)
    .all<{ country: string; provider_status: string }>();
  let changed = 0;
  for (const row of rows.results ?? []) {
    try {
      const after = await refreshProviderStatus(env, tenantId, row.country);
      if (after && after.provider_status !== row.provider_status) changed += 1;
    } catch (err) {
      console.error('[voip-regulatory] poll failed:', err instanceof Error ? err.message : 'error');
    }
  }
  return { checked: rows.results?.length ?? 0, changed };
}

/** Forget the provider side (the bundle at the provider is left as it is); the admin can then submit again. */
export async function resetProvider(env: Env, tenantId: string, country: string): Promise<DocRow | null> {
  const doc = await loadDoc(env, tenantId, country.toUpperCase());
  if (!doc) return null;
  await env.MASTER_DB
    .prepare(
      `UPDATE number_documents SET provider_bundle_sid = NULL, provider_address_sid = NULL, provider_status = NULL, provider_status_at = NULL,
         provider_failure_reason = NULL, updated_at = ? WHERE id = ?`,
    )
    .bind(nowIso(), doc.id)
    .run();
  return loadDoc(env, tenantId, country.toUpperCase());
}

/**
 * What a purchase passes to the provider, or null when the country has no bundle flow. Throws KYC_REQUIRED when the
 * documents are not approved by the platform, and KYC_PENDING_PROVIDER (with the step it is waiting at) when the
 * provider has not approved the bundle.
 */
export async function bundleForPurchase(
  env: Env,
  tenantId: string,
  country: string,
  policy: CountryPolicy | null,
): Promise<{ bundleSid: string; addressSid: string } | null> {
  if (!hasBundleFlow(policy)) return null;
  const doc = await loadDoc(env, tenantId, country);
  const state = regulatoryState(doc, true);
  if (!doc || state === 'none' || state === 'submitted' || (state === 'rejected' && doc.status === 'rejected')) {
    throw new VoipAccountError('KYC_REQUIRED', 'Numbers in your country need approved business documents first.', 409, { country, kycStatus: doc?.status ?? 'none', state });
  }
  if (state !== 'approved' || !doc.provider_bundle_sid || !doc.provider_address_sid) {
    const waiting =
      state === 'provider_review'
        ? 'Your documents are under review by the phone provider.'
        : state === 'rejected'
          ? 'The phone provider rejected your documents. Correct them and send them again.'
          : 'Your documents are approved and are being sent to the phone provider.';
    throw new VoipAccountError('KYC_PENDING_PROVIDER', waiting, 409, {
      country,
      state,
      providerStatus: doc.provider_status ?? 'not_submitted',
      failureReason: doc.provider_failure_reason,
    });
  }
  return { bundleSid: doc.provider_bundle_sid, addressSid: doc.provider_address_sid };
}
