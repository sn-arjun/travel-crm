/**
 * Call Routes — Call Logs CRUD + Outbound + Twilio Callbacks
 *
 * TICKET-371: Call Logs API
 * TICKET-372: Outbound Calling API
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { AppContext } from '../types';
import { generateId } from '../utils/uuid';
import { success, created, paginated, error, notFound } from '../utils/response';
import { rbac } from '../middleware/rbac';
import { requirePermission } from '../middleware/rbac';
import { drizzle } from 'drizzle-orm/d1';
import { createVoipProvider } from '../services/voip-provider';
import type { VoipSettingsRow } from '../services/voip-provider';
import { logActivity } from '../utils/activity-logger';

const callRoutes = new Hono<AppContext>();

// ── Schemas ───────────────────────────────────────────────────

const outboundCallSchema = z.object({
  toNumber: z.string().regex(/^\+[1-9]\d{9,14}$/, 'Invalid phone number. Must be E.164 format.'),
  contactId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
});

const updateCallSchema = z.object({
  outcome: z.enum(['interested', 'not_interested', 'follow_up_needed', 'wrong_number', 'no_answer', 'voicemail']).optional(),
  notes: z.string().optional(),
});

const transferSchema = z.object({
  targetNumber: z.string().regex(/^\+[1-9]\d{9,14}$/),
});

// ── Helper: load VoIP settings ────────────────────────────────

async function loadVoipSettings(db: D1Database): Promise<VoipSettingsRow | null> {
  const row = await db.prepare('SELECT * FROM voip_settings LIMIT 1').first<any>();
  if (!row) return null;
  return {
    id: row.id,
    voipProvider: row.voip_provider || 'twilio',
    providerAccountId: row.provider_account_id,
    providerAuthToken: row.provider_auth_token,
    providerApiKeyId: row.provider_api_key_id,
    providerApiKeySecret: row.provider_api_key_secret,
    providerAppId: row.provider_app_id,
    twilioAccountSid: row.twilio_account_sid,
    twilioAuthToken: row.twilio_auth_token,
    twilioApiKeySid: row.twilio_api_key_sid,
    twilioApiKeySecret: row.twilio_api_key_secret,
    twilioTwimlAppSid: row.twilio_twiml_app_sid,
    defaultCallerId: row.default_caller_id,
    recordingPolicy: row.recording_policy || 'all',
    ivrEnabled: row.ivr_enabled || 0,
    ivrConfig: row.ivr_config,
    businessHoursEnabled: row.business_hours_enabled || 0,
    businessHours: row.business_hours,
    voicemailEnabled: row.voicemail_enabled ?? 1,
    voicemailGreetingUrl: row.voicemail_greeting_url,
    maxRingDuration: row.max_ring_duration || 30,
    routingStrategy: row.routing_strategy || 'assigned',
    autoCreateLeadMissedCall: row.auto_create_lead_missed_call ?? 1,
    recordingRetentionDays: row.recording_retention_days ?? 90,
    recordingStorageBytes: row.recording_storage_bytes ?? 0,
  };
}

// ── Helper: parse call log row ────────────────────────────────

function parseCallLog(row: Record<string, any>) {
  return {
    id: row.id,
    contactId: row.contact_id,
    contactName: row.contact_name ?? null,
    leadId: row.lead_id,
    leadTitle: row.lead_title ?? null,
    direction: row.direction,
    fromNumber: row.from_number,
    toNumber: row.to_number,
    durationSeconds: row.duration_seconds ?? 0,
    status: row.status,
    outcome: row.outcome,
    providerCallId: row.provider_call_id ?? row.twilio_call_sid,
    twilioCallSid: row.twilio_call_sid,
    recordingUrl: row.recording_url,
    recordingR2Key: row.recording_r2_key,
    recordingDuration: row.recording_duration,
    notes: row.notes,
    ivrPath: row.ivr_path ? JSON.parse(row.ivr_path) : null,
    routedTo: row.routed_to,
    answeredBy: row.answered_by,
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── GET / — List call logs with filtering ─────────────────────

callRoutes.get('/', async (c) => {
  const db = c.get('tenantDb');
  const url = new URL(c.req.url);

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '25')));
  const offset = (page - 1) * limit;

  const contactId = url.searchParams.get('contactId');
  const leadId = url.searchParams.get('leadId');
  const userId = url.searchParams.get('userId');
  const direction = url.searchParams.get('direction');
  const status = url.searchParams.get('status');
  const outcome = url.searchParams.get('outcome');
  const fromDate = url.searchParams.get('fromDate');
  const toDate = url.searchParams.get('toDate');
  const search = url.searchParams.get('search');

  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (contactId) { conditions.push('cl.contact_id = ?'); values.push(contactId); }
  if (leadId) { conditions.push('cl.lead_id = ?'); values.push(leadId); }
  if (userId) { conditions.push('cl.created_by = ?'); values.push(userId); }
  if (direction) { conditions.push('cl.direction = ?'); values.push(direction); }
  if (status) { conditions.push('cl.status = ?'); values.push(status); }
  if (outcome) { conditions.push('cl.outcome = ?'); values.push(outcome); }
  if (fromDate) { conditions.push('cl.created_at >= ?'); values.push(fromDate); }
  if (toDate) { conditions.push('cl.created_at <= ?'); values.push(toDate); }
  if (search) { conditions.push('(cl.from_number LIKE ? OR cl.to_number LIKE ?)'); values.push(`%${search}%`, `%${search}%`); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db.prepare(`SELECT COUNT(*) as total FROM call_logs cl ${where}`).bind(...values).first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const rows = await db.prepare(`
    SELECT cl.*, c.name as contact_name, l.title as lead_title, u.name as created_by_name
    FROM call_logs cl
    LEFT JOIN contacts c ON cl.contact_id = c.id
    LEFT JOIN leads l ON cl.lead_id = l.id
    LEFT JOIN users u ON cl.created_by = u.id
    ${where}
    ORDER BY cl.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...values, limit, offset).all();

  const data = (rows.results || []).map(parseCallLog);

  return c.json({
    success: true,
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  });
});

// ── GET /:id — Single call log detail ─────────────────────────

callRoutes.get('/:id', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const row = await db.prepare(`
    SELECT cl.*, c.name as contact_name, l.title as lead_title, u.name as created_by_name
    FROM call_logs cl
    LEFT JOIN contacts c ON cl.contact_id = c.id
    LEFT JOIN leads l ON cl.lead_id = l.id
    LEFT JOIN users u ON cl.created_by = u.id
    WHERE cl.id = ?
  `).bind(id).first();

  if (!row) return notFound(c, 'Call log');

  return success(c, parseCallLog(row));
});

// ── PUT /:id — Update outcome and notes ───────────────────────

callRoutes.put('/:id', zValidator('json', updateCallSchema), async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');
  const id = c.req.param('id');
  const data = c.req.valid('json');

  const existing = await db.prepare('SELECT id, created_by FROM call_logs WHERE id = ?').bind(id).first<{ id: string; created_by: string }>();
  if (!existing) return notFound(c, 'Call log');

  // Only creator or admin can update
  if (existing.created_by !== userId && role !== 'admin') {
    return error(c, 'Insufficient permissions', 403);
  }

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (data.outcome !== undefined) { updates.push('outcome = ?'); values.push(data.outcome); }
  if (data.notes !== undefined) { updates.push('notes = ?'); values.push(data.notes); }

  if (updates.length === 0) return success(c, { message: 'No changes' });

  updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
  values.push(id);

  await db.prepare(`UPDATE call_logs SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

  // ── Automation: Auto-update lead status + auto-create follow-up ──
  if (data.outcome) {
    const callLog = await db.prepare(
      'SELECT lead_id, contact_id, duration_seconds FROM call_logs WHERE id = ?'
    ).bind(id).first<{ lead_id: string | null; contact_id: string | null; duration_seconds: number | null }>();

    if (callLog?.lead_id) {
      const leadId = callLog.lead_id;
      const lead = await db.prepare('SELECT status FROM leads WHERE id = ?').bind(leadId).first<{ status: string }>();

      if (lead) {
        let newLeadStatus: string | null = null;
        let lostReason: string | null = null;

        if (['interested', 'follow_up_needed', 'voicemail'].includes(data.outcome) && lead.status === 'new') {
          newLeadStatus = 'contacted';
        } else if (data.outcome === 'not_interested') {
          newLeadStatus = 'lost';
          lostReason = 'Not interested (call)';
        }

        if (newLeadStatus) {
          const leadUpdates = lostReason
            ? "status = ?, lost_reason = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')"
            : "status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')";
          const leadVals = lostReason ? [newLeadStatus, lostReason, leadId] : [newLeadStatus, leadId];

          await db.prepare(`UPDATE leads SET ${leadUpdates} WHERE id = ?`).bind(...leadVals).run();

          // Log lead activity
          await db.prepare(`
            INSERT INTO lead_activities (id, lead_id, type, content, metadata, created_by)
            VALUES (?, ?, 'status_change', ?, ?, ?)
          `).bind(
            generateId(),
            leadId,
            `Status auto-updated from call outcome: ${data.outcome}`,
            JSON.stringify({ old_status: lead.status, new_status: newLeadStatus, trigger: 'call_outcome', call_id: id }),
            userId,
          ).run();
        }

        // Auto-create follow-up if outcome is follow_up_needed
        if (data.outcome === 'follow_up_needed') {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(10, 0, 0, 0);
          const scheduledAt = tomorrow.toISOString().replace(/\.\d{3}Z$/, 'Z');

          await db.prepare(`
            INSERT INTO follow_ups (id, lead_id, scheduled_at, type, notes, status, created_by)
            VALUES (?, ?, ?, 'call', 'Auto-created from call outcome: follow-up needed', 'pending', ?)
          `).bind(generateId(), leadId, scheduledAt, userId).run();
        }
      }
    }

    // Increment VoIP usage cap (minutes)
    if (callLog?.duration_seconds && callLog.duration_seconds > 0) {
      try {
        const tenantId = c.get('tenantId');
        const masterDb = c.env.MASTER_DB;
        const minutes = Math.ceil(callLog.duration_seconds / 60);
        await masterDb.prepare(`
          UPDATE tenant_usage_caps SET current_usage = current_usage + ?,
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
          WHERE tenant_id = ? AND cap_key = 'voip_minutes_per_month'
        `).bind(minutes, tenantId).run();
      } catch (_e) { /* non-critical */ }
    }
  }

  return success(c, { message: 'Call log updated' });
});

// ── DELETE /:id — Admin-only soft delete ──────────────────────

callRoutes.delete('/:id', rbac(['admin']), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const existing = await db.prepare('SELECT id FROM call_logs WHERE id = ?').bind(id).first();
  if (!existing) return notFound(c, 'Call log');

  await db.prepare('DELETE FROM call_logs WHERE id = ?').bind(id).run();

  return success(c, { message: 'Call log deleted' });
});

// ── POST /outbound — Initiate outbound call ───────────────────
// TICKET-372

callRoutes.post('/outbound', zValidator('json', outboundCallSchema), async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const data = c.req.valid('json');

  const settings = await loadVoipSettings(db);
  if (!settings?.defaultCallerId) {
    return error(c, 'VoIP not configured. Please set up VoIP credentials in Settings.', 422);
  }

  // Validate contact exists if provided
  if (data.contactId) {
    const contact = await db.prepare('SELECT id FROM contacts WHERE id = ? AND is_deleted = 0')
      .bind(data.contactId).first();
    if (!contact) return error(c, 'Contact not found', 404);
  }

  const shouldRecord = settings.recordingPolicy === 'all' || settings.recordingPolicy === 'outbound';
  const callerId = settings.defaultCallerId;

  const callLogId = generateId();
  await db.prepare(`
    INSERT INTO call_logs (id, direction, from_number, to_number, contact_id, lead_id, status, created_by)
    VALUES (?, 'outbound', ?, ?, ?, ?, 'initiated', ?)
  `).bind(
    callLogId,
    callerId,
    data.toNumber,
    data.contactId || null,
    data.leadId || null,
    userId,
  ).run();

  try {
    const provider = createVoipProvider(c.env, settings);
    const baseUrl = c.req.url.replace(/\/api\/v1\/calls\/outbound.*$/, '');

    const result = await provider.initiateCall({
      from: callerId,
      to: data.toNumber,
      statusCallbackUrl: `${baseUrl}/api/v1/voip/status-callback`,
      record: shouldRecord,
      recordingCallbackUrl: shouldRecord
        ? `${baseUrl}/api/v1/voip/recording-callback`
        : undefined,
    });

    await db.prepare('UPDATE call_logs SET twilio_call_sid = ?, provider_call_id = ? WHERE id = ?')
      .bind(result.providerCallId, result.providerCallId, callLogId).run();

    await logActivity(drizzle(db), {
      userId,
      action: 'create',
      entityType: 'call',
      entityId: callLogId,
      details: JSON.stringify({ direction: 'outbound', to: data.toNumber, provider: settings.voipProvider }),
    });

    return created(c, {
      callLogId,
      providerCallId: result.providerCallId,
      status: 'initiated',
    });
  } catch (e: any) {
    // Update call log with failure
    await db.prepare("UPDATE call_logs SET status = 'failed', notes = ? WHERE id = ?")
      .bind(e.message || 'Call initiation failed', callLogId).run();

    // The call_logs row still exists (status 'failed') — surface its id so
    // the caller can navigate to/reference the failed call.
    return error(c, e.message || 'Failed to initiate call', 500, { callLogId });
  }
});

// ── POST /:id/transfer — Transfer active call ────────────────

callRoutes.post('/:id/transfer', zValidator('json', transferSchema), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const { targetNumber } = c.req.valid('json');

  const callLog = await db.prepare('SELECT twilio_call_sid, provider_call_id FROM call_logs WHERE id = ?')
    .bind(id).first<{ twilio_call_sid: string; provider_call_id: string }>();

  const providerCallId = callLog?.provider_call_id || callLog?.twilio_call_sid;
  if (!providerCallId) return notFound(c, 'Call log');

  const settings = await loadVoipSettings(db);
  if (!settings) {
    return error(c, 'VoIP not configured', 422);
  }

  const provider = createVoipProvider(c.env, settings);
  await provider.transferCall(providerCallId, targetNumber);

  return success(c, { message: 'Call transferred' });
});

// ── POST /:id/end — End active call ──────────────────────────

callRoutes.post('/:id/end', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const callLog = await db.prepare('SELECT twilio_call_sid, provider_call_id FROM call_logs WHERE id = ?')
    .bind(id).first<{ twilio_call_sid: string; provider_call_id: string }>();

  const providerCallId = callLog?.provider_call_id || callLog?.twilio_call_sid;
  if (!providerCallId) return notFound(c, 'Call log');

  const settings = await loadVoipSettings(db);
  if (!settings) {
    return error(c, 'VoIP not configured', 422);
  }

  const provider = createVoipProvider(c.env, settings);
  await provider.endCall(providerCallId);

  await db.prepare("UPDATE call_logs SET status = 'completed', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
    .bind(id).run();

  return success(c, { message: 'Call ended' });
});

// ── GET /analytics — Call analytics dashboard (TICKET-389) ────

callRoutes.get('/analytics', rbac(['admin', 'sales_manager']), async (c) => {
  const db = c.get('tenantDb');
  const url = new URL(c.req.url);

  const fromDate = url.searchParams.get('fromDate') || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const toDate = url.searchParams.get('toDate') || new Date().toISOString().slice(0, 10);

  // Total calls
  const totals = await db.prepare(`
    SELECT
      COUNT(*) as total_calls,
      SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) as inbound_calls,
      SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) as outbound_calls,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_calls,
      SUM(CASE WHEN status IN ('no-answer', 'busy', 'canceled') THEN 1 ELSE 0 END) as missed_calls,
      ROUND(AVG(CASE WHEN duration_seconds > 0 THEN duration_seconds END), 1) as avg_duration,
      SUM(duration_seconds) as total_duration,
      SUM(CASE WHEN outcome = 'interested' THEN 1 ELSE 0 END) as interested_count,
      SUM(CASE WHEN outcome = 'follow_up_needed' THEN 1 ELSE 0 END) as follow_up_count
    FROM call_logs
    WHERE created_at >= ? AND created_at <= ?
  `).bind(fromDate, toDate + 'T23:59:59Z').first<Record<string, any>>();

  // Calls per day
  const dailyCalls = await db.prepare(`
    SELECT
      DATE(created_at) as date,
      COUNT(*) as total,
      SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) as inbound,
      SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) as outbound
    FROM call_logs
    WHERE created_at >= ? AND created_at <= ?
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `).bind(fromDate, toDate + 'T23:59:59Z').all();

  // Top callers (agents)
  const topAgents = await db.prepare(`
    SELECT u.name, u.id as user_id,
      COUNT(*) as total_calls,
      SUM(CASE WHEN cl.status = 'completed' THEN 1 ELSE 0 END) as completed,
      ROUND(AVG(CASE WHEN cl.duration_seconds > 0 THEN cl.duration_seconds END), 1) as avg_duration
    FROM call_logs cl
    JOIN users u ON cl.created_by = u.id
    WHERE cl.created_at >= ? AND cl.created_at <= ?
    GROUP BY u.id, u.name
    ORDER BY total_calls DESC
    LIMIT 10
  `).bind(fromDate, toDate + 'T23:59:59Z').all();

  // Outcome distribution
  const outcomes = await db.prepare(`
    SELECT outcome, COUNT(*) as count
    FROM call_logs
    WHERE outcome IS NOT NULL AND created_at >= ? AND created_at <= ?
    GROUP BY outcome
    ORDER BY count DESC
  `).bind(fromDate, toDate + 'T23:59:59Z').all();

  // Hourly distribution
  const hourly = await db.prepare(`
    SELECT
      CAST(strftime('%H', created_at) AS INTEGER) as hour,
      COUNT(*) as count
    FROM call_logs
    WHERE created_at >= ? AND created_at <= ?
    GROUP BY hour
    ORDER BY hour ASC
  `).bind(fromDate, toDate + 'T23:59:59Z').all();

  const totalCalls = (totals?.total_calls as number) || 0;
  const completedCalls = (totals?.completed_calls as number) || 0;

  return success(c, {
    summary: {
      totalCalls,
      inboundCalls: totals?.inbound_calls || 0,
      outboundCalls: totals?.outbound_calls || 0,
      completedCalls,
      missedCalls: totals?.missed_calls || 0,
      avgDurationSeconds: totals?.avg_duration || 0,
      totalDurationSeconds: totals?.total_duration || 0,
      interestedCount: totals?.interested_count || 0,
      followUpCount: totals?.follow_up_count || 0,
      successRate: totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0,
    },
    dailyCalls: (dailyCalls.results || []).map((r: any) => ({
      date: r.date,
      total: r.total,
      inbound: r.inbound,
      outbound: r.outbound,
    })),
    topAgents: (topAgents.results || []).map((r: any) => ({
      userId: r.user_id,
      name: r.name,
      totalCalls: r.total_calls,
      completed: r.completed,
      avgDuration: r.avg_duration || 0,
    })),
    outcomes: (outcomes.results || []).map((r: any) => ({
      outcome: r.outcome,
      count: r.count,
    })),
    hourlyDistribution: (hourly.results || []).map((r: any) => ({
      hour: r.hour,
      count: r.count,
    })),
  });
});

// ── GET /missed — Get missed call count (TICKET-381) ──────────

callRoutes.get('/missed', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');

  const count = await db.prepare(`
    SELECT COUNT(*) as count FROM call_logs
    WHERE direction = 'inbound'
      AND status IN ('no-answer', 'busy', 'canceled')
      AND routed_to = ?
      AND outcome IS NULL
  `).bind(userId).first<{ count: number }>();

  return success(c, { count: count?.count || 0 });
});

// ── POST /missed/:id/mark-returned — Mark missed call as returned ─

callRoutes.post('/missed/:id/mark-returned', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  await db.prepare(`
    UPDATE call_logs
    SET outcome = 'follow_up_needed', notes = COALESCE(notes || ' | ', '') || 'Call returned',
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = ?
  `).bind(id).run();

  return success(c, { message: 'Marked as returned' });
});

// ── GET /:id/actions — Available quick actions for a call ─────

callRoutes.get('/:id/actions', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const callLog = await db.prepare(`
    SELECT cl.id, cl.status, cl.recording_url, cl.recording_r2_key, cl.lead_id, cl.outcome
    FROM call_logs cl WHERE cl.id = ?
  `).bind(id).first<Record<string, any>>();

  if (!callLog) return notFound(c, 'Call log');

  const actions: string[] = [];

  const hasRecording = !!(callLog.recording_url || callLog.recording_r2_key);

  // Check for transcript
  const transcript = await db.prepare(
    'SELECT id FROM call_transcripts WHERE call_log_id = ?'
  ).bind(id).first<{ id: string }>();
  const hasTranscript = !!transcript;

  // Check for extraction
  const extraction = await db.prepare(
    'SELECT id, status FROM ai_call_extractions WHERE call_log_id = ?'
  ).bind(id).first<{ id: string; status: string }>();

  if (hasRecording && !hasTranscript) {
    actions.push('transcribe');
  }
  if (hasTranscript && !extraction) {
    actions.push('extract');
  }
  if (extraction?.status === 'pending') {
    actions.push('review_extraction');
  }
  if (extraction?.status === 'confirmed') {
    actions.push('create_itinerary');
    actions.push('create_invoice');
    actions.push('schedule_followup');
  }
  if (callLog.lead_id) {
    actions.push('send_whatsapp');
  }

  return success(c, {
    actions,
    hasRecording,
    hasTranscript,
    extractionId: extraction?.id || null,
    extractionStatus: extraction?.status || null,
  });
});

export default callRoutes;
