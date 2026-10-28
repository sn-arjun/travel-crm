/**
 * AI Extraction Queue Consumer — TICKET-410, reworked in R306
 *
 * Handles: transcribe_call, transcribe_voicemail, summarise_call (services/voip/call-ai.ts: stored recording ->
 * Workers AI Whisper or Deepgram through the metered AI router -> transcript -> summary, suggestions only) and the
 * older extract_lead (internal follow-ups from an extraction; no producer sends it any more).
 * Nothing here calls an AI provider directly: every step is charged in the agency's AI credits.
 */

import type { Env } from '../types';
import { resolveTenantDb } from '../services/tenant-db';
import { AIExtractionService } from '../services/ai-extraction';
import { loadLocaleContext } from '../utils/money';
import { AIRouter } from '../services/ai-router';
import { generateId } from '../utils/uuid';
import { getTenantTimeZone, localDateString, addDaysLocal, localDateStartUtcIso } from '../utils/tz';
import { handleCallAiMessage, insertExtraction, markCallAiFailed } from '../services/voip/call-ai';

interface QueueMessage {
  type: 'transcribe_call' | 'transcribe_voicemail' | 'summarise_call' | 'extract_lead';
  callLogId: string;
  transcriptId?: string;
  tenantId: string;
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
        case 'transcribe_voicemail':
        case 'summarise_call':
          await handleCallAiMessage(env, tenantDb, { type: msg.body.type, callLogId: msg.body.callLogId, tenantId: msg.body.tenantId });
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
        try {
          const failedDb = await resolveTenantDb(env, msg.body.tenantId);
          if (failedDb) await markCallAiFailed(env, msg.body.tenantId, msg.body.callLogId, failedDb);
        } catch {
          /* the DLQ message is the record */
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
      `SELECT cl.created_by, cl.answered_by, cl.routed_to, cl.lead_id, u.name as agent_name
       FROM call_logs cl LEFT JOIN users u ON u.id = COALESCE(cl.answered_by, cl.routed_to, cl.created_by)
       WHERE cl.id = ?`,
    )
    .bind(callLogId)
    .first<{
      created_by: string | null;
      answered_by: string | null;
      routed_to: string | null;
      lead_id: string | null;
      agent_name: string | null;
    }>();

  const extractionService = new AIExtractionService(env, msg.tenantId);
  const startTime = Date.now();
  const result = await extractionService.extractFromTranscript(
    transcript,
    callLog?.agent_name || undefined,
    { currency: (await loadLocaleContext(db)).currency },
  );
  const durationMs = Date.now() - startTime;

  // Store extraction (pending: a person reviews it)
  await insertExtraction(db, callLogId, transcriptId || null, result);

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

  // Auto-create follow-ups from action items (TICKET-404). A follow-up belongs to a lead, so a call
  // that is not linked to one has nowhere to put them (the action items stay on the extraction).
  // follow_ups has no assignee column: the owner is the lead's, and created_by is the person on the call
  // (inbound calls have no creator, so the agent who answered or was rung).
  const followUpUser = callLog?.created_by ?? callLog?.answered_by ?? callLog?.routed_to ?? null;
  if (result.actionItems.length > 0 && callLog?.lead_id) {
    const timeZone = await getTenantTimeZone(db);
    // default due date = tomorrow in the tenant's local calendar
    const defaultDueDate = addDaysLocal(localDateString(timeZone), 1);
    for (const item of result.actionItems) {
      if (!item.text) continue;
      // 10:00 local time on the due date
      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(item.dueDate ?? '') ? (item.dueDate as string) : defaultDueDate;
      const scheduledAt = new Date(new Date(localDateStartUtcIso(timeZone, dueDate)).getTime() + 10 * 3600000)
        .toISOString()
        .replace(/\.\d{3}Z$/, 'Z');
      await db
        .prepare(
          `INSERT INTO follow_ups (id, lead_id, scheduled_at, type, notes, status, created_by)
           VALUES (?, ?, ?, 'call', ?, 'pending', ?)`,
        )
        .bind(generateId(), callLog.lead_id, scheduledAt, item.text, followUpUser)
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
