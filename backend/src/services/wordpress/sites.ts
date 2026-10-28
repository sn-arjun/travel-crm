import type { Env } from '../../types';
import { generateId } from '../../utils/uuid';
import { sendTransactional } from '../mail/transactional';
import { callProvisioner, ProvisionerNotConfigured } from './provisioner-client';
import { log } from '../../utils/logger';

/**
 * WordPress site provisioning (R309): the state machine behind the WP_PROVISION_QUEUE consumer, the super admin
 * endpoints and the cron sweep.
 *
 *   queued -> provisioning -> active
 *                  |-> (attempt failed, retried with backoff, status back to queued with the reason shown)
 *                  `-> failed   after 3 failed attempts, a refusal (HTTP 4xx), missing configuration, or 30 minutes
 *   active <-> suspended (set by hand later; the consumer never touches either)
 *
 * Idempotency: one wordpress_sites row per agency (enforced here) and one provisioner site per row: every delivery
 * posts the same siteId and slug, and the provisioner answers with the existing site instead of building another.
 * A duplicate or late queue message for an active or failed row does nothing.
 */

export const MAX_ATTEMPTS = 3;
export const BACKOFF_SECONDS = [60, 300];
export const POLL_SECONDS = 30;
export const BUILD_TIMEOUT_MINUTES = 30;
export const SWEEP_STALE_MINUTES = 10;

export interface WpSiteRow {
  id: string;
  tenant_id: string;
  subdomain: string;
  status: string;
  domain: string | null;
  site_url: string | null;
  wp_admin_url: string | null;
  container_id: string | null;
  provisioner_site_id: string | null;
  error_message: string | null;
  attempts: number;
  request_json: string | null;
  requested_by: string | null;
  started_at: string | null;
  provisioned_at: string | null;
  welcome_sent_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface WpRequest {
  companyName: string;
  adminEmail: string;
  logoUrl?: string;
  primaryColor?: string;
}

/** What the queue carries. Everything else is read from the row, which is the source of truth. */
export interface WpProvisionJob {
  siteId: string;
  tenantId?: string;
  subdomain?: string;
}

export interface JobOutcome {
  /** Set when the message should come back after this many seconds; otherwise it is acknowledged. */
  retryInSeconds?: number;
}

const isoNow = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

/** The public address of an agency's site: <slug>.<WP_SITES_DOMAIN>. */
export function siteDomain(env: Pick<Env, 'WP_SITES_DOMAIN'>, slug: string): string {
  const base = (env.WP_SITES_DOMAIN || 'sites.localhost.test').replace(/^\.+|\.+$/g, '');
  return `${slug}.${base}`;
}

export async function recordEvent(env: Env, siteId: string, event: string, status: string | null, detail?: string | null): Promise<void> {
  await env.MASTER_DB
    .prepare('INSERT INTO wordpress_site_events (id, site_id, event, status, detail) VALUES (?, ?, ?, ?, ?)')
    .bind(generateId(), siteId, event, status, detail ? detail.slice(0, 500) : null)
    .run();
}

export async function loadSite(env: Env, siteId: string): Promise<WpSiteRow | null> {
  return env.MASTER_DB.prepare('SELECT * FROM wordpress_sites WHERE id = ?').bind(siteId).first<WpSiteRow>();
}

export async function loadSiteByTenant(env: Env, tenantId: string): Promise<WpSiteRow | null> {
  return env.MASTER_DB
    .prepare('SELECT * FROM wordpress_sites WHERE tenant_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1')
    .bind(tenantId)
    .first<WpSiteRow>();
}

/** Put the job on the queue. Never throws: if the queue is unavailable the row stays queued and the cron sweep sends it later. */
export async function sendToQueue(env: Env, siteId: string, row?: Pick<WpSiteRow, 'tenant_id' | 'subdomain'>): Promise<boolean> {
  try {
    await env.WP_PROVISION_QUEUE.send({
      type: 'wp-provision',
      data: { siteId, tenantId: row?.tenant_id, subdomain: row?.subdomain } satisfies WpProvisionJob,
    });
    return true;
  } catch (err) {
    log('error', 'wp.enqueue_failed', { siteId, error: err instanceof Error ? err.message : String(err) });
    await recordEvent(env, siteId, 'enqueue_failed', 'queued', err instanceof Error ? err.message : String(err)).catch(() => undefined);
    return false;
  }
}

export type EnqueueResult =
  | { kind: 'created'; site: WpSiteRow }
  | { kind: 'restarted'; site: WpSiteRow }
  | { kind: 'exists'; site: WpSiteRow };

/**
 * Give an agency a site. One site per agency: if a row exists and is queued, building, active or suspended it is
 * returned unchanged ('exists'); a failed row is reset and queued again ('restarted').
 */
export async function requestSite(
  env: Env,
  tenant: { id: string; subdomain: string },
  request: WpRequest,
  requestedBy: string | null,
): Promise<EnqueueResult> {
  const existing = await loadSiteByTenant(env, tenant.id);
  if (existing) {
    if (existing.status === 'failed') {
      const site = await resetForRetry(env, existing, requestedBy, 'restart');
      return { kind: 'restarted', site };
    }
    return { kind: 'exists', site: existing };
  }

  const id = generateId();
  const domain = siteDomain(env, tenant.subdomain);
  try {
    await env.MASTER_DB
      .prepare(
        `INSERT INTO wordpress_sites (id, tenant_id, subdomain, domain, site_url, status, attempts, request_json, requested_by, updated_at)
         VALUES (?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?)`,
      )
      .bind(id, tenant.id, tenant.subdomain, domain, `https://${domain}`, JSON.stringify(request), requestedBy, isoNow(new Date()))
      .run();
  } catch (err) {
    // The unique subdomain index: a concurrent request for the same agency won the insert.
    const winner = await loadSiteByTenant(env, tenant.id);
    if (winner) return { kind: 'exists', site: winner };
    throw err;
  }
  await recordEvent(env, id, 'requested', 'queued', requestedBy ? `by ${requestedBy}` : null);
  await sendToQueue(env, id, { tenant_id: tenant.id, subdomain: tenant.subdomain });
  return { kind: 'created', site: (await loadSite(env, id)) as WpSiteRow };
}

async function resetForRetry(env: Env, row: WpSiteRow, requestedBy: string | null, why: 'retry' | 'restart'): Promise<WpSiteRow> {
  await env.MASTER_DB
    .prepare(`UPDATE wordpress_sites SET status = 'queued', attempts = 0, started_at = NULL, updated_at = ? WHERE id = ?`)
    .bind(isoNow(new Date()), row.id)
    .run();
  await recordEvent(env, row.id, why === 'retry' ? 'retry_requested' : 'restart_requested', 'queued', requestedBy ? `by ${requestedBy}; last error was: ${row.error_message ?? 'none'}` : row.error_message);
  await sendToQueue(env, row.id, row);
  return (await loadSite(env, row.id)) as WpSiteRow;
}

/** Retry a failed site (the super admin's Retry button). Only a failed site can be retried. */
export async function retrySite(env: Env, siteId: string, requestedBy: string | null): Promise<{ ok: true; site: WpSiteRow } | { ok: false; reason: 'not_found' | 'not_failed'; site?: WpSiteRow }> {
  const row = await loadSite(env, siteId);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.status !== 'failed') return { ok: false, reason: 'not_failed', site: row };
  return { ok: true, site: await resetForRetry(env, row, requestedBy, 'retry') };
}

async function failPermanently(env: Env, row: WpSiteRow, reason: string, attempts: number): Promise<JobOutcome> {
  await env.MASTER_DB
    .prepare(`UPDATE wordpress_sites SET status = 'failed', error_message = ?, attempts = ?, updated_at = ? WHERE id = ? AND status IN ('queued','provisioning')`)
    .bind(reason.slice(0, 500), attempts, isoNow(new Date()), row.id)
    .run();
  await recordEvent(env, row.id, 'failed', 'failed', reason);
  log('warn', 'wp.provision_failed', { siteId: row.id, tenantId: row.tenant_id, reason });
  return {};
}

/** One attempt failed. Fewer than MAX_ATTEMPTS used: back to queued with the reason and a delay. Otherwise failed. */
async function attemptFailed(env: Env, row: WpSiteRow, reason: string): Promise<JobOutcome> {
  const bumped = await env.MASTER_DB
    .prepare(`UPDATE wordpress_sites SET attempts = attempts + 1 WHERE id = ? RETURNING attempts`)
    .bind(row.id)
    .first<{ attempts: number }>();
  const attempts = bumped?.attempts ?? row.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) return failPermanently(env, row, `${reason} (gave up after ${attempts} attempts)`, attempts);

  await env.MASTER_DB
    .prepare(`UPDATE wordpress_sites SET status = 'queued', error_message = ?, updated_at = ? WHERE id = ? AND status = 'provisioning'`)
    .bind(reason.slice(0, 500), isoNow(new Date()), row.id)
    .run();
  await recordEvent(env, row.id, 'attempt_failed', 'queued', `attempt ${attempts} of ${MAX_ATTEMPTS}: ${reason}`);
  return { retryInSeconds: BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)] };
}

function parseRequest(row: WpSiteRow): WpRequest {
  try {
    const r = JSON.parse(row.request_json ?? '{}') as Partial<WpRequest>;
    return { companyName: r.companyName ?? row.subdomain, adminEmail: r.adminEmail ?? '', logoUrl: r.logoUrl, primaryColor: r.primaryColor };
  } catch {
    return { companyName: row.subdomain, adminEmail: '' };
  }
}

/**
 * Handle one queue delivery. Safe to call any number of times for the same site: it never creates a second
 * provisioner site, and it does nothing for a site that is already active, failed or suspended.
 */
export async function processSite(env: Env, siteId: string, now: Date = new Date()): Promise<JobOutcome> {
  const row = await loadSite(env, siteId);
  if (!row || (row.status !== 'queued' && row.status !== 'provisioning')) return {};

  const nowIso = isoNow(now);
  if (row.status === 'queued') {
    await env.MASTER_DB
      .prepare(`UPDATE wordpress_sites SET status = 'provisioning', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ? AND status = 'queued'`)
      .bind(nowIso, nowIso, row.id)
      .run();
    await recordEvent(env, row.id, 'attempt_started', 'provisioning', `attempt ${row.attempts + 1} of ${MAX_ATTEMPTS}`);
  } else if (row.started_at && now.getTime() - Date.parse(row.started_at) > BUILD_TIMEOUT_MINUTES * 60_000) {
    return failPermanently(env, row, `Timed out: the provisioner did not finish within ${BUILD_TIMEOUT_MINUTES} minutes`, row.attempts);
  }

  const request = parseRequest(row);
  const domain = row.domain || siteDomain(env, row.subdomain);
  let res;
  try {
    res = await callProvisioner(env, 'POST', '/sites', {
      siteId: row.id,
      slug: row.subdomain,
      domain,
      companyName: request.companyName,
      adminEmail: request.adminEmail,
      logoUrl: request.logoUrl,
      primaryColor: request.primaryColor,
    });
  } catch (err) {
    if (err instanceof ProvisionerNotConfigured) return failPermanently(env, row, err.message, row.attempts);
    return attemptFailed(env, row, `Could not reach the provisioner: ${err instanceof Error ? err.message : String(err)}`);
  }

  const message = typeof res.body?.error === 'string' ? res.body.error : '';
  if (res.status === 408 || res.status === 429 || res.status >= 500) {
    return attemptFailed(env, row, `Provisioner answered ${res.status}${message ? `: ${message}` : ''}`);
  }
  if (res.status >= 400) {
    // The request itself is refused (bad signature, bad input, slug taken): retrying the same call cannot help.
    return failPermanently(env, row, `Provisioner refused the request (${res.status})${message ? `: ${message}` : ''}`, row.attempts);
  }

  const state = String(res.body?.status ?? '');
  if (state === 'active') return markActive(env, row, res.body, request);
  if (state === 'failed') return attemptFailed(env, row, `Provisioner could not build the site: ${message || String(res.body?.error ?? 'unknown error')}`);

  // Still being built (or stopped): look again shortly. Not a failed attempt.
  await env.MASTER_DB
    .prepare(`UPDATE wordpress_sites SET updated_at = ? WHERE id = ?`)
    .bind(nowIso, row.id)
    .run();
  return { retryInSeconds: POLL_SECONDS };
}

async function markActive(env: Env, row: WpSiteRow, body: Record<string, any>, request: WpRequest): Promise<JobOutcome> {
  const nowIso = isoNow(new Date());
  const siteUrl = String(body.siteUrl || row.site_url || `https://${row.domain}`);
  const adminUrl = String(body.adminUrl || `${siteUrl.replace(/\/+$/, '')}/wp-admin/`);
  const updated = await env.MASTER_DB
    .prepare(
      `UPDATE wordpress_sites
          SET status = 'active', site_url = ?, wp_admin_url = ?, container_id = ?, provisioner_site_id = ?, error_message = NULL,
              provisioned_at = COALESCE(provisioned_at, ?), updated_at = ?
        WHERE id = ? AND status IN ('queued','provisioning')`,
    )
    .bind(siteUrl, adminUrl, body.containerId ?? null, String(body.slug ?? row.subdomain), nowIso, nowIso, row.id)
    .run();
  if (!updated.meta?.changes) return {};
  await recordEvent(env, row.id, 'active', 'active', `${siteUrl}${body.resetEmailSent === false ? '; WordPress could not send its password email' : ''}`);

  // The welcome email carries the address only; the password is chosen through WordPress's own reset email.
  if (!row.welcome_sent_at && request.adminEmail) {
    const sent = await sendTransactional(env, {
      to: request.adminEmail,
      template: 'website_ready',
      tenantId: row.tenant_id,
      data: { agencyName: request.companyName, siteUrl, adminUrl },
    });
    if (sent.delivered) {
      await env.MASTER_DB.prepare('UPDATE wordpress_sites SET welcome_sent_at = ? WHERE id = ?').bind(nowIso, row.id).run();
    }
    await recordEvent(env, row.id, sent.delivered ? 'welcome_email_sent' : 'welcome_email_failed', 'active', sent.error ?? null);
  }
  return {};
}

/**
 * Cron safety net (every-5-minutes job set): a site that has sat queued or provisioning for 10 minutes without
 * a touch had its queue message lost or exhausted, so send it again. The consumer is idempotent, so a duplicate is harmless.
 */
export async function sweepWordpressSites(env: Env, now: Date = new Date()): Promise<number> {
  const cutoff = isoNow(new Date(now.getTime() - SWEEP_STALE_MINUTES * 60_000));
  const { results } = await env.MASTER_DB
    .prepare(`SELECT id, tenant_id, subdomain FROM wordpress_sites WHERE status IN ('queued','provisioning') AND COALESCE(updated_at, created_at) < ? LIMIT 25`)
    .bind(cutoff)
    .all<{ id: string; tenant_id: string; subdomain: string }>();
  let resent = 0;
  for (const row of results) {
    await env.MASTER_DB.prepare('UPDATE wordpress_sites SET updated_at = ? WHERE id = ?').bind(isoNow(now), row.id).run();
    if (await sendToQueue(env, row.id, row)) {
      resent += 1;
      await recordEvent(env, row.id, 'resent_by_cron', null, 'no progress for 10 minutes');
    }
  }
  return resent;
}
