/**
 * Call AI (R306): transcription and a call summary, only when the agency has switched Call AI on, its plan includes AI and
 * it has credits. Both steps run through the AI router, so every minute and every summary is charged in AI credits and a
 * failed call costs nothing. Nothing here writes to a lead or contact: the summary becomes a pending extraction and, through
 * the `calls.summarise` recipe on `call.summary_ready`, one-click suggestions.
 *
 * Producer: requestCallAi (after the recording is stored, or from "Summarise now"). Consumer: handleCallAiMessage, called by
 * the AI_EXTRACTION_QUEUE consumer. When the queue is not bound (single-tenant dev) the same message is handled in-process.
 *
 * ai_status on the call: queued -> transcribed -> summarised, or skipped / failed with ai_status_reason (shown to the agent).
 */

import type { Env } from '../../types';
import { generateId } from '../../utils/uuid';
import { AIRouter, AiUnavailableError } from '../ai-router';
import { CREDIT_WEIGHTS } from '../ai-pricing';
import { AiQuotaExceededError, getCreditBalance } from '../ai-credits';
import { AIExtractionService, type ExtractionResult } from '../ai-extraction';
import { emitEvent } from '../automation/events';
import { getTenantFeatures } from '../../middleware/feature-gate';
import { loadRecordingSettings } from './recordings';

export const CALL_AI_FEATURE_KEY = 'ai_copilot';
/** Calls shorter than this are not transcribed (CALL-AUTOMATION 2.4); a voicemail needs only a few seconds. */
export const MIN_CALL_SECONDS = 20;
export const MIN_VOICEMAIL_SECONDS = 3;

export const REASON_CREDITS = 'Not summarised: AI credits used up';
export const REASON_UNAVAILABLE = 'Not summarised: the AI service is not available right now';
export const REASON_SHORT = 'Not transcribed: the call was too short';
export const REASON_NO_PLAN = 'Not summarised: AI is not included in this plan';

export type CallAiMessageType = 'transcribe_call' | 'transcribe_voicemail' | 'summarise_call';

export interface CallAiMessage {
  type: CallAiMessageType;
  callLogId: string;
  tenantId: string;
  attempt?: number;
}

export interface CallAiDeps {
  /** Injectable for tests; defaults to a metered router for the agency. */
  router?: AIRouter;
}

interface Waiter {
  waitUntil(promise: Promise<unknown>): void;
}

interface CallRow {
  id: string;
  contact_id: string | null;
  lead_id: string | null;
  routed_to: string | null;
  answered_by: string | null;
  created_by: string | null;
  duration_seconds: number | null;
  recording_duration: number | null;
  recording_r2_key: string | null;
  ai_status: string | null;
}

async function loadCall(db: D1Database, callId: string): Promise<CallRow | null> {
  return db
    .prepare(
      `SELECT id, contact_id, lead_id, routed_to, answered_by, created_by, duration_seconds, recording_duration, recording_r2_key, ai_status
       FROM call_logs WHERE id = ?`,
    )
    .bind(callId)
    .first<CallRow>();
}

function audioSeconds(call: CallRow): number {
  return Math.max(call.recording_duration ?? 0, 0) || Math.max(call.duration_seconds ?? 0, 0);
}

export async function setAiStatus(db: D1Database, callId: string, status: string | null, reason: string | null = null): Promise<void> {
  await db
    .prepare(`UPDATE call_logs SET ai_status = ?, ai_status_reason = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`)
    .bind(status, reason, callId)
    .run();
}

/** Best effort: used when the queue gives up on a message. */
export async function markCallAiFailed(env: Env, tenantId: string, callId: string, db: D1Database): Promise<void> {
  try {
    await setAiStatus(db, callId, 'failed', REASON_UNAVAILABLE);
  } catch (err) {
    console.error('[call-ai] could not mark failure:', err instanceof Error ? err.message : 'error');
  }
}

/** Credits one run needs: started minutes of transcription, plus one summary per started 5 minutes. */
export function estimateCredits(seconds: number, engine: 'standard' | 'premium', withSummary: boolean): number {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  const transcribe = minutes * CREDIT_WEIGHTS[engine === 'premium' ? 'transcribe_premium' : 'transcribe_standard'];
  const summary = withSummary ? CREDIT_WEIGHTS.understand * Math.max(1, Math.ceil(seconds / 300)) : 0;
  return transcribe + summary;
}

// ── Producer ─────────────────────────────────────────────────

export interface RequestCallAiResult {
  status: 'queued' | 'skipped' | 'off' | 'nothing_to_do';
  reason?: string;
}

/**
 * Decide whether this call gets transcribed and summarised, and if so put the job on the queue.
 * Never throws for business reasons; the answer says what happened and the call's ai_status says why.
 *  - Call AI off for the agency: nothing is written ('off').
 *  - No stored recording, plan without AI, too short, or credits short: 'skipped' with the reason on the call.
 */
export async function requestCallAi(
  env: Env,
  db: D1Database,
  tenantId: string,
  callId: string,
  opts: { voicemail?: boolean; force?: boolean; waiter?: Waiter; deps?: CallAiDeps } = {},
): Promise<RequestCallAiResult> {
  const settings = await loadRecordingSettings(db);
  if (!settings.callAiEnabled) return { status: 'off' };

  const call = await loadCall(db, callId);
  if (!call) return { status: 'nothing_to_do' };

  const hasTranscript = !!(await db.prepare('SELECT 1 AS hit FROM call_transcripts WHERE call_log_id = ?').bind(callId).first());
  const hasSummary = !!(await db.prepare('SELECT 1 AS hit FROM ai_call_extractions WHERE call_log_id = ?').bind(callId).first());
  if (hasSummary || (hasTranscript && opts.voicemail)) return { status: 'nothing_to_do' };

  const skip = async (reason: string): Promise<RequestCallAiResult> => {
    await setAiStatus(db, callId, 'skipped', reason);
    return { status: 'skipped', reason };
  };

  if (!hasTranscript && !call.recording_r2_key) return skip('Not transcribed: the recording is not in storage');

  const seconds = audioSeconds(call);
  if (!hasTranscript && seconds < (opts.voicemail ? MIN_VOICEMAIL_SECONDS : MIN_CALL_SECONDS)) return skip(REASON_SHORT);

  const features = await getTenantFeatures(env, tenantId);
  if (!features.features.includes(CALL_AI_FEATURE_KEY)) return skip(REASON_NO_PLAN);

  const needed = hasTranscript
    ? CREDIT_WEIGHTS.understand * Math.max(1, Math.ceil(seconds / 300))
    : estimateCredits(seconds, settings.callAiEngine, !opts.voicemail);
  const balance = await getCreditBalance(env, tenantId);
  if (balance.remaining < needed) return skip(REASON_CREDITS);

  const type: CallAiMessageType = hasTranscript ? 'summarise_call' : opts.voicemail ? 'transcribe_voicemail' : 'transcribe_call';
  await setAiStatus(db, callId, 'queued', null);
  await dispatchCallAi(env, { type, callLogId: callId, tenantId }, opts.waiter, opts.deps);
  return { status: 'queued' };
}

/** Put the message on the queue; without a queue binding, handle it in this invocation. */
export async function dispatchCallAi(env: Env, message: CallAiMessage, waiter?: Waiter, deps?: CallAiDeps): Promise<void> {
  if (env.AI_EXTRACTION_QUEUE) {
    await env.AI_EXTRACTION_QUEUE.send(message);
    return;
  }
  const run = (async () => {
    try {
      const { resolveTenantDb } = await import('../tenant-db');
      const db = await resolveTenantDb(env, message.tenantId);
      if (db) await handleCallAiMessage(env, db, message, deps);
    } catch (err) {
      console.error('[call-ai] inline run failed:', err instanceof Error ? err.message : 'error');
    }
  })();
  if (waiter) waiter.waitUntil(run);
  else await run;
}

// ── Consumer ─────────────────────────────────────────────────

/** Handles one queue message. Throws only for errors worth a retry; business outcomes land in ai_status. */
export async function handleCallAiMessage(env: Env, db: D1Database, message: CallAiMessage, deps: CallAiDeps = {}): Promise<void> {
  if (message.type === 'summarise_call') {
    await summariseCall(env, db, message.tenantId, message.callLogId, deps);
    return;
  }
  await transcribeCall(env, db, message.tenantId, message.callLogId, { voicemail: message.type === 'transcribe_voicemail', deps });
}

/** Outcomes that are an answer, not a failure: the call is marked and the message is done. */
async function businessOutcome(db: D1Database, callId: string, err: unknown): Promise<boolean> {
  if (err instanceof AiQuotaExceededError) {
    await setAiStatus(db, callId, 'skipped', REASON_CREDITS);
    return true;
  }
  if (err instanceof AiUnavailableError) {
    await setAiStatus(db, callId, 'failed', REASON_UNAVAILABLE);
    return true;
  }
  return false;
}

export async function transcribeCall(
  env: Env,
  db: D1Database,
  tenantId: string,
  callId: string,
  opts: { voicemail?: boolean; deps?: CallAiDeps } = {},
): Promise<void> {
  const settings = await loadRecordingSettings(db);
  if (!settings.callAiEnabled) return;
  const call = await loadCall(db, callId);
  if (!call) return;

  const existing = await db.prepare('SELECT id FROM call_transcripts WHERE call_log_id = ?').bind(callId).first<{ id: string }>();
  if (existing) {
    if (!opts.voicemail) await summariseCall(env, db, tenantId, callId, opts.deps);
    return;
  }
  if (!call.recording_r2_key) {
    await setAiStatus(db, callId, 'failed', 'Not transcribed: the recording is no longer in storage');
    return;
  }
  const object = await env.FILE_STORAGE.get(call.recording_r2_key);
  if (!object) {
    await setAiStatus(db, callId, 'failed', 'Not transcribed: the recording is no longer in storage');
    return;
  }
  const audio = await object.arrayBuffer();
  const seconds = audioSeconds(call);

  const router = opts.deps?.router ?? new AIRouter(env, undefined, tenantId);
  const started = Date.now();
  let result: Awaited<ReturnType<AIRouter['transcribe']>>;
  try {
    result = await router.transcribe(audio, { durationSeconds: seconds, engine: settings.callAiEngine });
  } catch (err) {
    if (await businessOutcome(db, callId, err)) return;
    throw err;
  }

  const text = result.result.trim();
  if (!text) {
    await setAiStatus(db, callId, 'skipped', 'Not transcribed: no speech was found');
    return;
  }
  const wordCount = text.split(/\s+/).length;
  const transcriptId = generateId();
  await db
    .prepare(
      `INSERT OR IGNORE INTO call_transcripts (id, call_log_id, full_transcript, language, confidence, word_count, duration_seconds, transcription_model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(transcriptId, callId, text, result.language ?? 'en', result.confidence ?? 0, wordCount, seconds, result.model)
    .run();
  await router.logUsage(db, 'transcription', result.model, 0, 0, result.cost, callId, Date.now() - started);
  await setAiStatus(db, callId, 'transcribed', null);

  await emitEvent(env, tenantId, db, {
    type: 'call.transcript_ready',
    entityType: 'call',
    entityId: callId,
    payload: { callId, language: result.language ?? 'en', wordCount, voicemail: !!opts.voicemail },
  });

  // A voicemail gets its transcript under the task; only a conversation is summarised.
  if (!opts.voicemail) await dispatchCallAi(env, { type: 'summarise_call', callLogId: callId, tenantId }, undefined, opts.deps);
}

export async function summariseCall(env: Env, db: D1Database, tenantId: string, callId: string, deps: CallAiDeps = {}): Promise<void> {
  const settings = await loadRecordingSettings(db);
  if (!settings.callAiEnabled) return;
  if (await db.prepare('SELECT 1 AS hit FROM ai_call_extractions WHERE call_log_id = ?').bind(callId).first()) return;

  const transcript = await db
    .prepare('SELECT id, full_transcript FROM call_transcripts WHERE call_log_id = ?')
    .bind(callId)
    .first<{ id: string; full_transcript: string }>();
  if (!transcript) return;
  const call = await loadCall(db, callId);
  if (!call) return;
  const agent = await db
    .prepare('SELECT name FROM users WHERE id = ?')
    .bind(call.answered_by ?? call.routed_to ?? call.created_by ?? '')
    .first<{ name: string }>();

  const units = Math.max(1, Math.ceil(audioSeconds(call) / 300));
  const router = deps.router ?? new AIRouter(env, undefined, tenantId);
  const service = new AIExtractionService(env, tenantId, router);
  const started = Date.now();
  let result: ExtractionResult;
  try {
    result = await service.extractFromTranscript(transcript.full_transcript, agent?.name ?? undefined, { units });
  } catch (err) {
    if (await businessOutcome(db, callId, err)) return;
    throw err;
  }

  const extractionId = await insertExtraction(db, callId, transcript.id, result);
  await router.logUsage(db, 'call_summary', result.modelUsed, result.inputTokens, result.outputTokens, result.costEstimate, callId, Date.now() - started);
  await setAiStatus(db, callId, 'summarised', null);

  // The suggestions come from the calls.summarise recipe; nothing is written to the lead or contact from here.
  await emitEvent(env, tenantId, db, {
    type: 'call.summary_ready',
    entityType: 'call',
    entityId: callId,
    payload: {
      callId,
      extractionId,
      contactId: call.contact_id,
      leadId: call.lead_id,
      routedTo: call.routed_to ?? call.answered_by ?? call.created_by,
      summary: result.summary.slice(0, 5),
      destination: result.destination,
      travelDates: result.travelDates,
      paxDetails: result.paxDetails,
      budget: result.budget,
      tripType: result.tripType,
      specialRequests: result.specialRequests,
      actionItems: result.actionItems.slice(0, 5),
      draftReply: result.draftReply ?? null,
    },
  });
}

/** Store an extraction as pending: a person confirms, edits or rejects it (routes/ai-extractions.ts). */
export async function insertExtraction(db: D1Database, callLogId: string, transcriptId: string | null, result: ExtractionResult): Promise<string> {
  const extractionId = generateId();
  await db
    .prepare(
      `INSERT INTO ai_call_extractions (
        id, call_log_id, transcript_id,
        destination, travel_dates, pax_count, pax_details,
        budget, budget_currency, preferences, trip_type,
        hotel_preference, meal_preference, special_requests,
        summary, key_topics, action_items,
        sentiment, sentiment_score, deal_likelihood, likelihood_signals,
        coaching_hints, overall_confidence, field_confidences,
        status, model_used, tokens_used, cost_estimate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    )
    .bind(
      extractionId,
      callLogId,
      transcriptId || null,
      result.destination,
      result.travelDates ? JSON.stringify(result.travelDates) : null,
      result.paxCount,
      result.paxDetails ? JSON.stringify(result.paxDetails) : null,
      result.budget,
      result.budgetCurrency,
      result.preferences.length > 0 ? JSON.stringify(result.preferences) : null,
      result.tripType,
      result.hotelPreference,
      result.mealPreference,
      result.specialRequests,
      result.summary.length > 0 ? JSON.stringify(result.summary) : null,
      result.keyTopics.length > 0 ? JSON.stringify(result.keyTopics) : null,
      result.actionItems.length > 0 ? JSON.stringify(result.actionItems) : null,
      result.sentiment,
      result.sentimentScore,
      result.dealLikelihood,
      result.likelihoodSignals.length > 0 ? JSON.stringify(result.likelihoodSignals) : null,
      result.coachingHints.length > 0 ? JSON.stringify(result.coachingHints) : null,
      result.overallConfidence,
      Object.keys(result.fieldConfidences).length > 0 ? JSON.stringify(result.fieldConfidences) : null,
      result.modelUsed,
      result.inputTokens + result.outputTokens,
      result.costEstimate,
    )
    .run();
  return extractionId;
}
