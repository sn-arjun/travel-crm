/**
 * AI Extraction Queue Consumer — TICKET-410
 *
 * Pipeline: transcribe → extract → (auto-create lead/tasks/follow-ups)
 * Handles: transcribe_call, transcribe_voicemail, extract_lead
 */

import type { Env } from '../types';
import { resolveTenantDb } from '../services/tenant-db';
import { DeepgramService } from '../services/deepgram';
import { AIExtractionService } from '../services/ai-extraction';
import { AIRouter } from '../services/ai-router';
import { generateId } from '../utils/uuid';
import { getTenantTimeZone, localDateString, addDaysLocal } from '../utils/tz';

interface QueueMessage {
  type: 'transcribe_call' | 'transcribe_voicemail' | 'extract_lead';
  callLogId: string;
  transcriptId?: string;
  tenantId: string;
  recordingUrl?: string;
  recordingDuration?: number;
  isVoicemail?: boolean;
  attempt?: number;
}

export async function handleAIExtractionQueue(
  batch: MessageBatch<QueueMessage>,
  env: Env,
): Promise<void> {
  for (const msg of batch.messages) {
    const startTime = Date.now();
    try {
      const tenantDb = await resolveTenantDb(env, msg.body.tenantId);
      if (!tenantDb) {
        console.error(`AI extraction: tenant ${msg.body.tenantId} has no resolvable database; message dropped`);
        msg.ack();
        continue;
      }

      switch (msg.body.type) {
        case 'transcribe_call':
          await handleTranscribeCall(msg.body, env, tenantDb);
          break;
        case 'transcribe_voicemail':
          await handleTranscribeVoicemail(msg.body, env, tenantDb);
          break;
        case 'extract_lead':
          await handleExtractLead(msg.body, env, tenantDb);
          break;
      }

      msg.ack();

      const duration = Date.now() - startTime;
      console.log(
        JSON.stringify({
          metric: 'ai_pipeline_step',
          type: msg.body.type,
          tenantId: msg.body.tenantId,
          callLogId: msg.body.callLogId,
          duration_ms: duration,
          status: 'success',
        }),
      );
    } catch (error) {
      const attempt = (msg.body.attempt ?? 0) + 1;
      if (attempt >= 3) {
        try {
          await env.AI_EXTRACTION_DLQ.send({
            ...msg.body,
            error: String(error),
            attempt,
          });
        } catch (dlqErr) {
          console.error('DLQ send failed:', dlqErr);
        }
        msg.ack();
        console.error(
          `DLQ: ${msg.body.type} for call ${msg.body.callLogId} after ${attempt} attempts: ${error}`,
        );
      } else {
        msg.retry({ delaySeconds: Math.pow(4, attempt) });
      }
    }
  }
}

// ── Transcribe Call (TICKET-393) ───────────────────────────────

async function handleTranscribeCall(
  msg: QueueMessage,
  env: Env,
  db: D1Database,
): Promise<void> {
  const { callLogId, recordingUrl } = msg;
  if (!recordingUrl) throw new Error('No recording URL');

  // Check idempotency
  const existing = await db
    .prepare('SELECT id FROM call_transcripts WHERE call_log_id = ?')
    .bind(callLogId)
    .first();
  if (existing) return;

  const deepgram = new DeepgramService(env);
  const result = await deepgram.transcribeRecording(recordingUrl);

  if (!result.transcript) return;

  const transcriptId = generateId();
  await db
    .prepare(
      `INSERT INTO call_transcripts (id, call_log_id, full_transcript, speaker_segments, language, confidence, word_count, duration_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      transcriptId,
      callLogId,
      result.transcript,
      JSON.stringify(result.speakers),
      result.language,
      result.confidence,
      result.wordCount,
      result.durationSeconds,
    )
    .run();

  // Log usage
  const router = new AIRouter(env, undefined, msg.tenantId);
  await router.logUsage(
    db,
    'transcription',
    'deepgram-nova-2',
    0,
    0,
    result.durationSeconds * (0.0043 / 60), // $0.0043/min
    callLogId,
  );

  // Enqueue extraction
  await env.AI_EXTRACTION_QUEUE.send({
    type: 'extract_lead',
    callLogId,
    transcriptId,
    tenantId: msg.tenantId,
  });
}

// ── Transcribe Voicemail (TICKET-408) ──────────────────────────

async function handleTranscribeVoicemail(
  msg: QueueMessage,
  env: Env,
  db: D1Database,
): Promise<void> {
  const { callLogId, recordingUrl, recordingDuration } = msg;
  if (!recordingUrl) throw new Error('No recording URL');

  // Skip very short recordings (likely hangups)
  if ((recordingDuration ?? 0) < 3) return;

  // Check idempotency
  const existing = await db
    .prepare('SELECT id FROM call_transcripts WHERE call_log_id = ?')
    .bind(callLogId)
    .first();
  if (existing) return;

  const deepgram = new DeepgramService(env);
  const result = await deepgram.transcribeRecording(recordingUrl, {
    diarize: false, // Voicemail is single speaker
  });

  if (!result.transcript) return;

  const transcriptId = generateId();
  await db
    .prepare(
      `INSERT INTO call_transcripts (id, call_log_id, full_transcript, language, confidence, word_count, duration_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      transcriptId,
      callLogId,
      result.transcript,
      result.language,
      result.confidence,
      result.wordCount,
      result.durationSeconds,
    )
    .run();

  // Check for travel keywords to trigger extraction
  const travelKeywords = [
    'trip', 'travel', 'booking', 'hotel', 'flight', 'honeymoon',
    'vacation', 'tour', 'itinerary', 'visa', 'holiday', 'package',
  ];
  const lowerText = result.transcript.toLowerCase();
  const hasTravel = travelKeywords.some((kw) => lowerText.includes(kw));

  if (hasTravel) {
    await env.AI_EXTRACTION_QUEUE.send({
      type: 'extract_lead',
      callLogId,
      transcriptId,
      tenantId: msg.tenantId,
      isVoicemail: true,
    });
  }

  // Send notification with transcript snippet
  const snippet =
    result.transcript.substring(0, 100) +
    (result.transcript.length > 100 ? '...' : '');

  // Get routed_to from call log
  const callLog = await db
    .prepare('SELECT routed_to, from_number FROM call_logs WHERE id = ?')
    .bind(callLogId)
    .first<{ routed_to: string | null; from_number: string }>();

  if (callLog?.routed_to && env.PUSH_NOTIFICATION_QUEUE) {
    try {
      await env.PUSH_NOTIFICATION_QUEUE.send({
        type: 'push',
        data: {
          userId: callLog.routed_to,
          title: 'Voicemail Transcribed',
          body: `From ${callLog.from_number}: "${snippet}"`,
          data: { type: 'voicemail', callLogId },
        },
      });
    } catch (e) {
      console.error('Failed to send voicemail notification:', e);
    }
  }
}

// ── Extract Lead Data (TICKET-399, 400, 402-405) ───────────────

async function handleExtractLead(
  msg: QueueMessage,
  env: Env,
  db: D1Database,
): Promise<void> {
  const { callLogId, transcriptId } = msg;

  // Check idempotency
  const existingExtraction = await db
    .prepare('SELECT id FROM ai_call_extractions WHERE call_log_id = ?')
    .bind(callLogId)
    .first();
  if (existingExtraction) return;

  // Get transcript
  let transcript: string | null = null;
  if (transcriptId) {
    const row = await db
      .prepare('SELECT full_transcript FROM call_transcripts WHERE id = ?')
      .bind(transcriptId)
      .first<{ full_transcript: string }>();
    transcript = row?.full_transcript ?? null;
  }
  if (!transcript) {
    const row = await db
      .prepare(
        'SELECT full_transcript FROM call_transcripts WHERE call_log_id = ?',
      )
      .bind(callLogId)
      .first<{ full_transcript: string }>();
    transcript = row?.full_transcript ?? null;
  }
  if (!transcript) throw new Error('No transcript found');

  // Get agent name
  const callLog = await db
    .prepare(
      `SELECT cl.created_by, u.name as agent_name
       FROM call_logs cl LEFT JOIN users u ON cl.created_by = u.id
       WHERE cl.id = ?`,
    )
    .bind(callLogId)
    .first<{ created_by: string; agent_name: string | null }>();

  const extractionService = new AIExtractionService(env);
  const startTime = Date.now();
  const result = await extractionService.extractFromTranscript(
    transcript,
    callLog?.agent_name || undefined,
  );
  const durationMs = Date.now() - startTime;

  // Store extraction
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

  // Log AI usage
  const router = new AIRouter(env, undefined, msg.tenantId);
  await router.logUsage(
    db,
    'extraction',
    result.modelUsed,
    result.inputTokens,
    result.outputTokens,
    result.costEstimate,
    callLogId,
    durationMs,
  );

  // Auto-create follow-ups from action items (TICKET-404)
  if (result.actionItems.length > 0 && callLog?.created_by) {
    // default due date = tomorrow in the tenant's local calendar
    const defaultDueDate = addDaysLocal(localDateString(await getTenantTimeZone(db)), 1);
    for (const item of result.actionItems) {
      if (!item.text) continue;
      const followupId = generateId();
      const dueDate = item.dueDate || defaultDueDate;
      await db
        .prepare(
          `INSERT INTO follow_ups (id, lead_id, type, notes, due_date, assigned_to, created_by, status)
           VALUES (?, (SELECT lead_id FROM call_logs WHERE id = ?), 'task', ?, ?, ?, ?, 'pending')`,
        )
        .bind(
          followupId,
          callLogId,
          item.text,
          dueDate,
          callLog.created_by,
          callLog.created_by,
        )
        .run();
    }
  }

  // Notify if urgent sentiment
  if (result.sentiment === 'urgent' && env.PUSH_NOTIFICATION_QUEUE) {
    // Notify admins about urgent sentiment
    const admins = await db
      .prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1")
      .all();

    for (const admin of admins.results || []) {
      try {
        await env.PUSH_NOTIFICATION_QUEUE.send({
          type: 'push',
          data: {
            userId: (admin as any).id,
            title: 'Urgent Call Detected',
            body: `Call ${callLogId} flagged as urgent. ${result.summary[0] || ''}`,
            data: { type: 'urgent_call', callLogId },
          },
        });
      } catch (e) {
        console.error('Failed to send urgent notification:', e);
      }
    }
  }
}
