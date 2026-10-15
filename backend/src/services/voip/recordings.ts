/**
 * Call recordings in our own storage (R306).
 *
 * The provider records; once it says the file is ready we copy it into R2 exactly once, then delete the provider's copy
 * so it stops accruing storage fees and personal data lives in one place. Playback is a short-lived signed link bound to
 * the person who asked. A daily job removes audio and transcripts after the agency's retention period and keeps the call
 * record and the summary.
 *
 * Storage path: `${tenantId}/recordings/${callId}.mp3`, stored in call_logs.recording_r2_key. The R208 privacy registry
 * lists call_logs.recording_r2_key as a file column, so contact erasure deletes the object.
 *
 * recording_state: 'provider' (callback received, not copied yet) -> 'stored' | 'failed'; retention sets 'expired'.
 */

import type { Env } from '../../types';
import { createVoipProvider, loadVoipSettings, type VoipProvider } from '../voip-provider';
import { signMessage } from '../../utils/unsubscribe-token';

export const DEFAULT_ANNOUNCEMENT = 'This call may be recorded for quality and training purposes.';
export const CONSENT_MODES = ['announce', 'off', 'on_request'] as const;
export type ConsentMode = (typeof CONSENT_MODES)[number];
/** How long a playback link lives. */
export const RECORDING_LINK_TTL_SECONDS = 300;
export const DEFAULT_RETENTION_DAYS = 90;

const EVENT_PROVIDER = 'twilio';

export interface RecordingSettings {
  recordingPolicy: string;
  consentMode: ConsentMode;
  /** The wording callers hear: the agency's own text, else the default. */
  announcement: string;
  /** The agency's own wording, null when the default is used. */
  customAnnouncement: string | null;
  retentionDays: number;
  callAiEnabled: boolean;
  callAiEngine: 'standard' | 'premium';
}

export function recordingKey(tenantId: string, callId: string): string {
  return `${tenantId}/recordings/${callId}.mp3`;
}

export function recordingPrefix(tenantId: string): string {
  return `${tenantId}/recordings/`;
}

/** The agency's recording and call AI settings; defaults when VoIP has not been set up. */
export async function loadRecordingSettings(db: D1Database): Promise<RecordingSettings> {
  const row = await db
    .prepare(
      `SELECT recording_policy, recording_retention_days, recording_consent_mode, recording_announcement, call_ai_enabled, call_ai_engine
       FROM voip_settings LIMIT 1`,
    )
    .first<{
      recording_policy: string | null;
      recording_retention_days: number | null;
      recording_consent_mode: string | null;
      recording_announcement: string | null;
      call_ai_enabled: number | null;
      call_ai_engine: string | null;
    }>();
  const mode = CONSENT_MODES.find((m) => m === row?.recording_consent_mode) ?? 'announce';
  const custom = row?.recording_announcement?.trim() || null;
  const days = Number(row?.recording_retention_days);
  return {
    recordingPolicy: row?.recording_policy || 'all',
    consentMode: mode,
    announcement: custom ?? DEFAULT_ANNOUNCEMENT,
    customAnnouncement: custom,
    retentionDays: Number.isFinite(days) && days >= 1 ? Math.floor(days) : DEFAULT_RETENTION_DAYS,
    callAiEnabled: row?.call_ai_enabled === 1,
    callAiEngine: row?.call_ai_engine === 'premium' ? 'premium' : 'standard',
  };
}

/**
 * Does this call start recording by itself? Only in 'announce' mode (the caller is told), and only for the directions the
 * policy covers. 'off' never records; 'on_request' records only when the agent has the caller's consent and says so.
 */
export function autoRecord(settings: Pick<RecordingSettings, 'recordingPolicy' | 'consentMode'>, direction: 'inbound' | 'outbound'): boolean {
  if (settings.consentMode !== 'announce') return false;
  return settings.recordingPolicy === 'all' || settings.recordingPolicy === direction;
}

// ── Who may hear and read what (CALL-AUTOMATION 3.7) ─────────

export type CallDataKind = 'recording' | 'transcript' | 'summary';

/**
 * admin and sales_manager: every call. salesperson: calls they made, were rung for or answered, and calls on leads
 * assigned to them. operations: the summary of a call on a won (confirmed) lead only. accountant and view_only: nothing.
 */
export async function canAccessCallData(db: D1Database, role: string, userId: string, callId: string, kind: CallDataKind): Promise<boolean> {
  if (role === 'admin' || role === 'sales_manager') return true;
  if (role !== 'salesperson' && !(role === 'operations' && kind === 'summary')) return false;
  const call = await db
    .prepare(
      `SELECT cl.created_by, cl.routed_to, cl.answered_by, l.assigned_to AS lead_owner, l.status AS lead_status
       FROM call_logs cl LEFT JOIN leads l ON l.id = cl.lead_id WHERE cl.id = ?`,
    )
    .bind(callId)
    .first<{ created_by: string | null; routed_to: string | null; answered_by: string | null; lead_owner: string | null; lead_status: string | null }>();
  if (!call) return false;
  if (role === 'operations') return call.lead_status === 'won';
  return [call.created_by, call.routed_to, call.answered_by, call.lead_owner].includes(userId);
}

/** Roles that may ever be handed a recording link; the files route re-checks this when the link is used. */
export const RECORDING_ROLES: ReadonlySet<string> = new Set(['admin', 'sales_manager', 'salesperson']);

// ── Signed playback links ────────────────────────────────────

function linkMessage(key: string, exp: number, userId: string): string {
  return `recording-download|${key}|${exp}|${userId}`;
}

/** A link that works for RECORDING_LINK_TTL_SECONDS and only for the person it was issued to. */
export async function signRecordingLink(env: Env, key: string, userId: string, nowMs: number = Date.now()): Promise<{ path: string; filePath: string; exp: number; sig: string; expiresAt: string }> {
  const exp = Math.floor(nowMs / 1000) + RECORDING_LINK_TTL_SECONDS;
  const sig = await signMessage(env, linkMessage(key, exp, userId));
  const filePath = `/files/${encodeURIComponent(key)}`;
  return { path: `/api/v1${filePath}?exp=${exp}&sig=${sig}`, filePath, exp, sig, expiresAt: new Date(exp * 1000).toISOString() };
}

export async function verifyRecordingLink(env: Env, key: string, userId: string, exp: string | undefined, sig: string | undefined, nowMs: number = Date.now()): Promise<boolean> {
  const expNum = Number(exp);
  if (!sig || !Number.isFinite(expNum) || expNum < Math.floor(nowMs / 1000)) return false;
  const expected = await signMessage(env, linkMessage(key, expNum, userId));
  return expected.length === sig.length && expected === sig;
}

// ── Copy into R2, then delete at the provider ────────────────

interface CallRecordingRow {
  id: string;
  provider_call_id: string | null;
  twilio_call_sid: string | null;
  recording_url: string | null;
  recording_provider_id: string | null;
  recording_r2_key: string | null;
  recording_duration: number | null;
  created_at: string | null;
}

/** Twilio recording sid from a recording URL (`.../Recordings/RE123.mp3`). */
export function recordingIdFromUrl(url: string | null | undefined): string | null {
  const match = /\/Recordings\/([A-Za-z0-9]+)/.exec(url ?? '');
  return match ? match[1] : null;
}

export interface StoreRecordingResult {
  status: 'stored' | 'already_stored' | 'no_recording' | 'failed';
  key?: string;
  bytes?: number;
  error?: string;
}

async function providerFor(env: Env, db: D1Database): Promise<{ provider: VoipProvider; subAccountId?: string } | null> {
  const settings = await loadVoipSettings(env, db);
  if (!settings) return null;
  const account = settings.providerAccountId || settings.twilioAccountSid || '';
  return { provider: createVoipProvider(env, settings), subAccountId: /^AC[0-9a-zA-Z]+$/.test(account) ? account : undefined };
}

async function claimStore(db: D1Database, claimKey: string): Promise<boolean> {
  const res = await db
    .prepare('INSERT OR IGNORE INTO provider_events (provider, provider_call_id, event, sequence) VALUES (?, ?, ?, ?)')
    .bind(EVENT_PROVIDER, claimKey, 'job:store_recording', '')
    .run();
  return (res.meta.changes ?? 0) > 0;
}

async function releaseStore(db: D1Database, claimKey: string): Promise<void> {
  await db
    .prepare('DELETE FROM provider_events WHERE provider = ? AND provider_call_id = ? AND event = ? AND sequence = ?')
    .bind(EVENT_PROVIDER, claimKey, 'job:store_recording', '')
    .run();
}

/** Flip has_recording on the call's timeline entries (lead activity and contact log) once the recording is stored. */
export async function markTimelineHasRecording(db: D1Database, callId: string): Promise<void> {
  try {
    await db
      .prepare(`UPDATE lead_activities SET metadata = json_set(metadata, '$.has_recording', json('true')) WHERE type = 'call' AND json_valid(metadata) AND json_extract(metadata, '$.call_id') = ?`)
      .bind(callId)
      .run();
    await db
      .prepare(`UPDATE activity_logs SET details = json_set(details, '$.has_recording', json('true')) WHERE action = 'call' AND details IS NOT NULL AND json_valid(details) AND json_extract(details, '$.call_id') = ?`)
      .bind(callId)
      .run();
  } catch (err) {
    console.error('[recordings] could not update the timeline entry:', err instanceof Error ? err.message : 'error');
  }
}

/** Delete the provider's copy of a recording we already hold; records when the provider confirmed (the URL stays as history, dead). */
export async function deleteProviderCopy(env: Env, db: D1Database, callId: string, deps: { provider?: VoipProvider } = {}): Promise<boolean> {
  const call = await db
    .prepare('SELECT recording_url, recording_provider_id, recording_provider_deleted_at FROM call_logs WHERE id = ? AND recording_r2_key IS NOT NULL')
    .bind(callId)
    .first<{ recording_url: string | null; recording_provider_id: string | null; recording_provider_deleted_at: string | null }>();
  if (!call?.recording_url || call.recording_provider_deleted_at) return true;
  const recordingId = call.recording_provider_id ?? recordingIdFromUrl(call.recording_url);
  if (!recordingId) {
    // Nothing to delete by.
    await db.prepare("UPDATE call_logs SET recording_provider_deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").bind(callId).run();
    return true;
  }
  try {
    const resolved = deps.provider ? { provider: deps.provider, subAccountId: undefined } : await providerFor(env, db);
    if (!resolved) return false;
    await resolved.provider.deleteRecording({ recordingId, subAccountId: resolved.subAccountId });
    await db
      .prepare(`UPDATE call_logs SET recording_provider_deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`)
      .bind(callId)
      .run();
    return true;
  } catch (err) {
    console.error('[recordings] provider delete failed:', err instanceof Error ? err.message : 'error');
    return false;
  }
}

/**
 * calls.store_recording: fetch the provider recording, write it to R2 once, save key, size and expiry, then delete it at
 * the provider. Safe to call repeatedly (callback retries, the retry job): a provider_events claim lets one run do the copy,
 * and the claim is given back when the copy fails so a retry can run it again.
 */
export async function storeRecording(
  env: Env,
  db: D1Database,
  tenantId: string,
  callId: string,
  opts: { provider?: VoipProvider; now?: Date; recordingId?: string | null } = {},
): Promise<StoreRecordingResult> {
  const call = await db
    .prepare(
      `SELECT id, provider_call_id, twilio_call_sid, recording_url, recording_provider_id, recording_r2_key, recording_duration, created_at
       FROM call_logs WHERE id = ?`,
    )
    .bind(callId)
    .first<CallRecordingRow>();
  if (!call) return { status: 'no_recording' };

  if (call.recording_r2_key) {
    await deleteProviderCopy(env, db, callId, { provider: opts.provider });
    return { status: 'already_stored', key: call.recording_r2_key };
  }

  const recordingId = opts.recordingId ?? call.recording_provider_id ?? recordingIdFromUrl(call.recording_url);
  if (!recordingId) {
    if (!call.recording_url) return { status: 'no_recording' };
    await db.prepare(`UPDATE call_logs SET recording_state = 'failed' WHERE id = ?`).bind(callId).run();
    return { status: 'failed', error: 'The provider recording id is unknown' };
  }

  const claimKey = call.provider_call_id || call.twilio_call_sid || call.id;
  if (!(await claimStore(db, claimKey))) return { status: 'already_stored' };

  const now = opts.now ?? new Date();
  const key = recordingKey(tenantId, callId);
  try {
    const resolved = opts.provider ? { provider: opts.provider, subAccountId: undefined } : await providerFor(env, db);
    if (!resolved) throw new Error('VoIP is not configured');
    const file = await resolved.provider.fetchRecording({ recordingId, subAccountId: resolved.subAccountId });
    const settings = await loadRecordingSettings(db);
    const expiresAt = new Date(now.getTime() + settings.retentionDays * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');

    await env.FILE_STORAGE.put(key, file.bytes, {
      httpMetadata: { contentType: file.contentType || 'audio/mpeg' },
      customMetadata: { kind: 'call-recording', callId },
    });
    const bytes = file.bytes.byteLength;
    await db
      .prepare(
        `UPDATE call_logs
         SET recording_r2_key = ?, recording_bytes = ?, recording_expires_at = ?, recording_state = 'stored', recording_provider_id = ?,
             recording_duration = COALESCE(recording_duration, ?), updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE id = ?`,
      )
      .bind(key, bytes, expiresAt, recordingId, file.durationSeconds ? Math.round(file.durationSeconds) : null, callId)
      .run();
    await db
      .prepare('UPDATE voip_settings SET recording_storage_bytes = COALESCE(recording_storage_bytes, 0) + ?')
      .bind(bytes)
      .run();

    // The timeline entries written when the call ended said "no recording"; now they get their Play button.
    await markTimelineHasRecording(db, callId);

    // Only now is the provider's copy redundant. If deleting fails the job retries it; the audio is already safe.
    await deleteProviderCopy(env, db, callId, { provider: opts.provider });
    return { status: 'stored', key, bytes };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'error';
    console.error('[recordings] store failed:', message);
    try {
      await db.prepare(`UPDATE call_logs SET recording_state = 'failed' WHERE id = ? AND recording_r2_key IS NULL`).bind(callId).run();
      await releaseStore(db, claimKey);
    } catch {
      /* the retry job finds the row by its state */
    }
    return { status: 'failed', error: message };
  }
}

// ── Cron jobs ────────────────────────────────────────────────

/** Every five minutes: recordings whose copy failed or never ran, and stored ones whose provider copy is still there. */
export async function retryPendingRecordings(env: Env, tenantId: string, db: D1Database, now: Date = new Date()): Promise<{ stored: number; failed: number }> {
  const stale = new Date(now.getTime() - 10 * 60000).toISOString();
  // A copy that keeps failing is given up on after three days (the retention job then removes the provider copy).
  const giveUp = new Date(now.getTime() - 3 * 86400000).toISOString();
  const { results } = await db
    .prepare(
      `SELECT id, recording_r2_key FROM call_logs
       WHERE recording_url IS NOT NULL
         AND created_at >= ?
         AND ((recording_r2_key IS NULL AND (recording_state = 'failed' OR (recording_state = 'provider' AND updated_at <= ?)))
              OR (recording_r2_key IS NOT NULL AND recording_provider_deleted_at IS NULL))
       ORDER BY updated_at LIMIT 10`,
    )
    .bind(giveUp, stale)
    .all<{ id: string; recording_r2_key: string | null }>();
  let stored = 0;
  let failed = 0;
  for (const row of results ?? []) {
    const result = await storeRecording(env, db, tenantId, row.id, { now });
    if (result.status === 'stored' || result.status === 'already_stored') stored++;
    else if (result.status === 'failed') failed++;
  }
  return { stored, failed };
}

/**
 * Daily: audio past its expiry is deleted from R2 (and any provider copy that is still there); transcripts of calls older
 * than the retention period are deleted. The call record and the summary stay.
 */
export async function runRecordingRetention(
  env: Env,
  tenantId: string,
  db: D1Database,
  now: Date = new Date(),
): Promise<{ recordingsDeleted: number; transcriptsDeleted: number; providerCopiesDeleted: number }> {
  const settings = await loadRecordingSettings(db);
  const nowIso = now.toISOString();
  const cutoff = new Date(now.getTime() - settings.retentionDays * 86400000).toISOString();
  let recordingsDeleted = 0;
  let providerCopiesDeleted = 0;

  const expired = await db
    .prepare(
      `SELECT id, recording_r2_key, recording_bytes FROM call_logs
       WHERE recording_r2_key IS NOT NULL AND recording_expires_at IS NOT NULL AND recording_expires_at <= ?
       LIMIT 500`,
    )
    .bind(nowIso)
    .all<{ id: string; recording_r2_key: string; recording_bytes: number | null }>();
  for (const row of expired.results ?? []) {
    await env.FILE_STORAGE.delete(row.recording_r2_key);
    await db
      .prepare(
        `UPDATE call_logs SET recording_r2_key = NULL, recording_url = NULL, recording_state = 'expired', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`,
      )
      .bind(row.id)
      .run();
    await db
      .prepare('UPDATE voip_settings SET recording_storage_bytes = MAX(0, COALESCE(recording_storage_bytes, 0) - ?)')
      .bind(row.recording_bytes ?? 0)
      .run();
    recordingsDeleted++;
  }

  // A recording that never reached our storage is not kept at the provider past the retention period either.
  const stragglers = await db
    .prepare(
      `SELECT id, recording_url, recording_provider_id FROM call_logs
       WHERE recording_r2_key IS NULL AND recording_url IS NOT NULL AND created_at < ? LIMIT 200`,
    )
    .bind(cutoff)
    .all<{ id: string; recording_url: string; recording_provider_id: string | null }>();
  if ((stragglers.results ?? []).length > 0) {
    const resolved = await providerFor(env, db).catch(() => null);
    for (const row of stragglers.results ?? []) {
      const recordingId = row.recording_provider_id ?? recordingIdFromUrl(row.recording_url);
      try {
        if (resolved && recordingId) await resolved.provider.deleteRecording({ recordingId, subAccountId: resolved.subAccountId });
        await db.prepare(`UPDATE call_logs SET recording_url = NULL, recording_state = 'expired' WHERE id = ?`).bind(row.id).run();
        providerCopiesDeleted++;
      } catch (err) {
        console.error('[recordings] provider delete (retention) failed:', err instanceof Error ? err.message : 'error');
      }
    }
  }

  const transcripts = await db
    .prepare('DELETE FROM call_transcripts WHERE call_log_id IN (SELECT id FROM call_logs WHERE created_at < ?)')
    .bind(cutoff)
    .run();
  return { recordingsDeleted, transcriptsDeleted: transcripts.meta.changes ?? 0, providerCopiesDeleted };
}
