/**
 * Call Routes — Call Logs CRUD + Outbound + Twilio Callbacks
 *
 * TICKET-371: Call Logs API
 * TICKET-372: Outbound Calling API
 */

import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { zValidator } from '../utils/validator';
import type { AppContext } from '../types';
import { generateId } from '../utils/uuid';
import { success, created, paginated, error, notFound } from '../utils/response';
import { rbac } from '../middleware/rbac';
import { requirePermission } from '../middleware/rbac';
import { drizzle } from 'drizzle-orm/d1';
import { createVoipProvider, loadVoipSettings, credentialsAwareErrorHandler } from '../services/voip-provider';
import type { VoipSettingsRow } from '../services/voip-provider';
import { logActivity } from '../utils/activity-logger';
import { emitFromRequest } from '../services/automation/events';
import { tenantToday, addDaysLocal, localDateStartUtcIso, sqlOffsetModifier } from '../utils/tz';
import { AllowanceExhausted, allowanceExhaustedResponse, assertAllowance } from '../services/metering/meter';
import { MAX_CALL_SECONDS, preflightOutbound } from '../services/voip/fraud';
import { DEFAULT_ANNOUNCEMENT, autoRecord, canAccessCallData, loadRecordingSettings, signRecordingLink } from '../services/voip/recordings';
import { CALL_AI_FEATURE_KEY, REASON_CREDITS, requestCallAi } from '../services/voip/call-ai';
import { AI_QUOTA_EXCEEDED_MESSAGE } from '../services/ai-credits';
import { getTenantFeatures } from '../middleware/feature-gate';

const callRoutes = new Hono<AppContext>();
callRoutes.onError(credentialsAwareErrorHandler);

// ── Schemas ───────────────────────────────────────────────────

const outboundCallSchema = z.object({
  toNumber: z.string().regex(/^\+[1-9]\d{9,14}$/, 'Invalid phone number. Must be E.164 format.'),
  contactId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  /** How the agent is reached first: their in-app softphone (default) or their own phone (bridge). */
  mode: z.enum(['softphone', 'bridge']).optional(),
  /** Bridge only: the number to ring the agent on; defaults to the phone on their profile. */
  agentNumber: z.string().regex(/^\+[1-9]\d{9,14}$/, 'Invalid phone number. Must be E.164 format.').optional(),
});

const updateCallSchema = z.object({
  outcome: z.enum(['interested', 'not_interested', 'follow_up_needed', 'wrong_number', 'no_answer', 'voicemail']).optional(),
  notes: z.string().optional(),
});

const transferSchema = z.object({
  targetNumber: z.string().regex(/^\+[1-9]\d{9,14}$/),
  /** What the next person should know. */
  note: z.string().max(500).optional(),
});

// ── Helper: load VoIP settings ────────────────────────────────


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
    hasRecording: !!row.recording_r2_key,
    recordingState: row.recording_state ?? null,
    recordingBytes: row.recording_bytes ?? null,
    recordingExpiresAt: row.recording_expires_at ?? null,
    recordingConsent: row.recording_consent ?? null,
    aiStatus: row.ai_status ?? null,
    aiStatusReason: row.ai_status_reason ?? null,
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
  // An agent's calls: the ones they placed, and the inbound ones that rang or were answered by them.
  if (userId) { conditions.push('(cl.created_by = ? OR cl.routed_to = ? OR cl.answered_by = ?)'); values.push(userId, userId, userId); }
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

// ── GET /analytics — Call analytics dashboard (TICKET-389) ────

callRoutes.get('/analytics', rbac(['admin', 'sales_manager']), async (c) => {
  const db = c.get('tenantDb');
  const url = new URL(c.req.url);

  // fromDate / toDate are tenant-local calendar dates (inclusive); timestamps are UTC
  const { timeZone: tz, today: localToday } = await tenantToday(c);
  const fromDate = url.searchParams.get('fromDate') || addDaysLocal(localToday, -30);
  const toDate = url.searchParams.get('toDate') || localToday;
  const fromIso = localDateStartUtcIso(tz, fromDate);
  const toIso = localDateStartUtcIso(tz, addDaysLocal(toDate, 1)); // exclusive
  const tzMod = sqlOffsetModifier(tz);

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
    WHERE created_at >= ? AND created_at < ?
  `).bind(fromIso, toIso).first<Record<string, any>>();

  // Calls per day
  const dailyCalls = await db.prepare(`
    SELECT
      DATE(created_at, '${tzMod}') as date,
      COUNT(*) as total,
      SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) as inbound,
      SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) as outbound
    FROM call_logs
    WHERE created_at >= ? AND created_at < ?
    GROUP BY DATE(created_at, '${tzMod}')
    ORDER BY date ASC
  `).bind(fromIso, toIso).all();

  // Top callers (agents). An outbound call belongs to the agent who placed it; an inbound row has no creator, so it
  // belongs to the agent who answered it, else the one it was routed to.
  const topAgents = await db.prepare(`
    SELECT u.name, u.id as user_id,
      COUNT(*) as total_calls,
      SUM(CASE WHEN cl.status = 'completed' THEN 1 ELSE 0 END) as completed,
      ROUND(AVG(CASE WHEN cl.duration_seconds > 0 THEN cl.duration_seconds END), 1) as avg_duration
    FROM call_logs cl
    JOIN users u ON u.id = COALESCE(cl.answered_by, cl.routed_to, cl.created_by)
    WHERE cl.created_at >= ? AND cl.created_at < ?
    GROUP BY u.id, u.name
    ORDER BY total_calls DESC
    LIMIT 10
  `).bind(fromIso, toIso).all();

  // Outcome distribution
  const outcomes = await db.prepare(`
    SELECT outcome, COUNT(*) as count
    FROM call_logs
    WHERE outcome IS NOT NULL AND created_at >= ? AND created_at < ?
    GROUP BY outcome
    ORDER BY count DESC
  `).bind(fromIso, toIso).all();

  // Hourly distribution
  const hourly = await db.prepare(`
    SELECT
      CAST(strftime('%H', created_at, '${tzMod}') AS INTEGER) as hour,
      COUNT(*) as count
    FROM call_logs
    WHERE created_at >= ? AND created_at < ?
    GROUP BY hour
    ORDER BY hour ASC
  `).bind(fromIso, toIso).all();

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

// ── Recording and call AI settings (R306) ─────────────────────

const recordingSettingsSchema = z.object({
  /** announce: record and play the announcement (default); off: never record; on_request: record only when the agent has the caller's consent. */
  consentMode: z.enum(['announce', 'off', 'on_request']).optional(),
  /** The wording callers hear; null or empty returns to the default. */
  announcement: z.string().trim().max(300).nullable().optional(),
  retentionDays: z.number().int().min(1).max(3650).optional(),
  callAiEnabled: z.boolean().optional(),
  callAiEngine: z.enum(['standard', 'premium']).optional(),
});

async function recordingSettingsPayload(c: Context<AppContext>) {
  const db = c.get('tenantDb');
  const settings = await loadRecordingSettings(db);
  const features = await getTenantFeatures(c.env, c.get('tenantId'));
  const configured = !!(await db.prepare('SELECT 1 AS hit FROM voip_settings LIMIT 1').first());
  return {
    configured,
    consentMode: settings.consentMode,
    announcement: settings.customAnnouncement,
    defaultAnnouncement: DEFAULT_ANNOUNCEMENT,
    effectiveAnnouncement: settings.announcement,
    retentionDays: settings.retentionDays,
    callAiEnabled: settings.callAiEnabled,
    callAiEngine: settings.callAiEngine,
    // The premium engine needs the platform's Deepgram key; without it the standard engine runs.
    premiumAvailable: !!c.env.DEEPGRAM_API_KEY,
    aiIncluded: features.features.includes(CALL_AI_FEATURE_KEY),
  };
}

callRoutes.get('/recording-settings', async (c) => success(c, await recordingSettingsPayload(c)));

callRoutes.put('/recording-settings', rbac(['admin']), zValidator('json', recordingSettingsSchema), async (c) => {
  const db = c.get('tenantDb');
  const data = c.req.valid('json');
  const row = await db.prepare('SELECT id FROM voip_settings LIMIT 1').first<{ id: string }>();
  if (!row) return error(c, 'Set up calling first (Settings > Calling), then choose how calls are recorded.', 422);

  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if (data.consentMode !== undefined) { sets.push('recording_consent_mode = ?'); values.push(data.consentMode); }
  if (data.announcement !== undefined) { sets.push('recording_announcement = ?'); values.push(data.announcement?.trim() ? data.announcement.trim() : null); }
  if (data.retentionDays !== undefined) { sets.push('recording_retention_days = ?'); values.push(data.retentionDays); }
  if (data.callAiEnabled !== undefined) { sets.push('call_ai_enabled = ?'); values.push(data.callAiEnabled ? 1 : 0); }
  if (data.callAiEngine !== undefined) { sets.push('call_ai_engine = ?'); values.push(data.callAiEngine); }
  if (sets.length > 0) {
    sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
    await db.prepare(`UPDATE voip_settings SET ${sets.join(', ')} WHERE id = ?`).bind(...values, row.id).run();
    await logActivity(drizzle(db), {
      userId: c.get('userId'),
      action: 'update',
      entityType: 'call_recording_settings',
      entityId: row.id,
      details: JSON.stringify(data),
    });
  }
  return success(c, await recordingSettingsPayload(c));
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

  const existing = await db.prepare('SELECT id, created_by, routed_to, answered_by FROM call_logs WHERE id = ?')
    .bind(id).first<{ id: string; created_by: string | null; routed_to: string | null; answered_by: string | null }>();
  if (!existing) return notFound(c, 'Call log');

  // Only the person who made the call, the agent an inbound call was routed to or answered by, or an admin
  // can update (an inbound call has no creator).
  if (existing.created_by !== userId && existing.routed_to !== userId && existing.answered_by !== userId && role !== 'admin') {
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

          // Let the automations see the change like any other status change
          await emitFromRequest(c, {
            type: 'lead.status_changed',
            entityType: 'lead',
            entityId: leadId,
            payload: { from: lead.status, to: newLeadStatus },
          });
        }

        // The follow-up is no longer created here: the recipe calls.next_step_prompt proposes it when the call
        // ends (R303), as a one-click suggestion the agent can change or dismiss.
      }
    }
    // Call minutes are metered from the provider status callback (voip-callbacks.ts), once per call.
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

  const settings = await loadVoipSettings(c.env, db);
  if (!settings?.defaultCallerId) {
    return error(c, 'VoIP not configured. Please set up VoIP credentials in Settings.', 422);
  }

  // R110: no new call once the month's call minutes are used up (a call in progress is never cut).
  try {
    await assertAllowance(c.env, c.get('tenantId'), 'call_minute');
  } catch (err) {
    if (err instanceof AllowanceExhausted) return allowanceExhaustedResponse(c, err);
    throw err;
  }

  // R305 fraud limits: blocked prefixes, destination allow-list, per-agent velocity, daily ceiling. Nothing is dialled
  // and no call row is written when one of them refuses.
  const refusal = await preflightOutbound(c.env, { tenantId: c.get('tenantId'), db, userId, toNumber: data.toNumber });
  if (refusal) {
    return c.json({ success: false, code: refusal.code, message: refusal.message, details: refusal.details ?? null, error: { code: refusal.code, message: refusal.message, details: refusal.details ?? null } }, refusal.status);
  }

  // Validate contact exists if provided
  if (data.contactId) {
    const contact = await db.prepare('SELECT id FROM contacts WHERE id = ? AND is_deleted = 0')
      .bind(data.contactId).first();
    if (!contact) return error(c, 'Contact not found', 404);
  }

  // A call started from a lead stays linked to it (and to the lead's contact when none was given)
  let contactId = data.contactId || null;
  if (data.leadId) {
    const lead = await db.prepare('SELECT id, contact_id FROM leads WHERE id = ? AND is_deleted = 0')
      .bind(data.leadId).first<{ id: string; contact_id: string }>();
    if (!lead) return error(c, 'Lead not found', 404);
    contactId = contactId ?? lead.contact_id;
  }

  // R306: recording starts by itself only when the agency announces it; the customer hears the announcement on answer.
  const recordingSettings = await loadRecordingSettings(db);
  const shouldRecord = autoRecord(recordingSettings, 'outbound');
  const callerId = settings.defaultCallerId;

  const callLogId = generateId();
  await db.prepare(`
    INSERT INTO call_logs (id, direction, from_number, to_number, contact_id, lead_id, status, created_by)
    VALUES (?, 'outbound', ?, ?, ?, ?, 'initiated', ?)
  `).bind(
    callLogId,
    callerId,
    data.toNumber,
    contactId,
    data.leadId || null,
    userId,
  ).run();

  try {
    const provider = createVoipProvider(c.env, settings);
    const baseUrl = (c.env.API_PUBLIC_URL?.trim() || c.req.url.replace(/\/api\/v1\/calls\/outbound.*$/, '')).replace(/\/+$/, '');

    // The agent's leg comes first (their softphone, or their own phone in bridge mode); the customer is
    // dialled only when the agent answers. Softphone is the default.
    const mode = data.mode ?? 'softphone';
    let agentNumber = data.agentNumber;
    if (mode === 'bridge' && !agentNumber) {
      const me = await db.prepare('SELECT phone FROM users WHERE id = ?').bind(userId).first<{ phone: string | null }>();
      const phone = (me?.phone ?? '').replace(/[\s()-]/g, '');
      agentNumber = /^\+[1-9]\d{9,14}$/.test(phone) ? phone : undefined;
      if (!agentNumber) {
        await db.prepare("UPDATE call_logs SET status = 'failed', notes = ? WHERE id = ?")
          .bind('No phone number to call the agent on', callLogId).run();
        return error(c, 'Add your phone number to your profile (or pass agentNumber) to be called first.', 422, { callLogId });
      }
    }

    const result = await provider.placeCall({
      mode,
      from: callerId,
      to: data.toNumber,
      agentIdentity: mode === 'softphone' ? userId : undefined,
      agentNumber,
      callbackBaseUrl: baseUrl,
      record: shouldRecord,
      announcementUrl: shouldRecord ? `${baseUrl}/api/v1/voip/twiml/announce?callLogId=${encodeURIComponent(callLogId)}` : undefined,
      maxDurationSeconds: MAX_CALL_SECONDS,
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

    // Automations see the call start (the lead and contact are on the call from the first moment).
    await emitFromRequest(c, {
      type: 'call.started',
      entityType: 'call',
      entityId: callLogId,
      payload: { callId: callLogId, direction: 'outbound', to: data.toNumber, contactId, leadId: data.leadId || null, agentId: userId, mode },
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
  const { targetNumber, note } = c.req.valid('json');

  const callLog = await db.prepare('SELECT twilio_call_sid, provider_call_id, routed_to, answered_by, created_by FROM call_logs WHERE id = ?')
    .bind(id).first<{ twilio_call_sid: string; provider_call_id: string; routed_to: string | null; answered_by: string | null; created_by: string | null }>();

  const providerCallId = callLog?.provider_call_id || callLog?.twilio_call_sid;
  if (!providerCallId) return notFound(c, 'Call log');

  const settings = await loadVoipSettings(c.env, db);
  if (!settings) {
    return error(c, 'VoIP not configured', 422);
  }

  const provider = createVoipProvider(c.env, settings);
  await provider.transferCall(providerCallId, targetNumber);

  // The agent on the call hands it over; the number may belong to a colleague.
  const colleague = await db.prepare('SELECT id FROM users WHERE phone = ? AND is_active = 1 LIMIT 1').bind(targetNumber).first<{ id: string }>();
  await emitFromRequest(c, {
    type: 'call.transferred',
    entityType: 'call',
    entityId: id,
    payload: {
      callId: id,
      fromAgent: callLog?.answered_by ?? callLog?.routed_to ?? callLog?.created_by ?? c.get('userId'),
      toAgent: colleague?.id ?? null,
      toNumber: targetNumber,
      note: note ?? null,
    },
  });

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

  const settings = await loadVoipSettings(c.env, db);
  if (!settings) {
    return error(c, 'VoIP not configured', 422);
  }

  const provider = createVoipProvider(c.env, settings);
  await provider.endCall(providerCallId);

  await db.prepare("UPDATE call_logs SET status = 'completed', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
    .bind(id).run();

  return success(c, { message: 'Call ended' });
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

// ── GET /:id/recording — A short-lived signed link to play the recording (R306) ─

callRoutes.get('/:id/recording', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const userId = c.get('userId');

  const call = await db
    .prepare('SELECT id, recording_r2_key, recording_state, recording_bytes, recording_duration, recording_expires_at FROM call_logs WHERE id = ?')
    .bind(id)
    .first<{ id: string; recording_r2_key: string | null; recording_state: string | null; recording_bytes: number | null; recording_duration: number | null; recording_expires_at: string | null }>();
  if (!call) return notFound(c, 'Call log');
  if (!(await canAccessCallData(db, c.get('role'), userId, id, 'recording'))) return error(c, 'You do not have access to this recording', 403);

  if (!call.recording_r2_key) {
    if (call.recording_state === 'expired') return error(c, 'This recording was deleted after the retention period', 410, { code: 'RECORDING_EXPIRED' });
    if (call.recording_state === 'provider' || call.recording_state === 'failed') return error(c, 'This recording is still being saved. Try again in a few minutes.', 409, { code: 'RECORDING_PENDING' });
    return notFound(c, 'Recording');
  }

  const link = await signRecordingLink(c.env, call.recording_r2_key, userId);
  await logActivity(drizzle(db), {
    userId,
    action: 'play_recording',
    entityType: 'call',
    entityId: id,
    details: JSON.stringify({ expiresAt: link.expiresAt }),
  });
  return success(c, {
    url: link.path,
    // The same link in the parts the desktop client needs: it adds the API prefix and its login itself.
    filePath: link.filePath,
    exp: link.exp,
    sig: link.sig,
    expiresAt: link.expiresAt,
    contentType: 'audio/mpeg',
    bytes: call.recording_bytes,
    durationSeconds: call.recording_duration,
    retentionExpiresAt: call.recording_expires_at,
  });
});

// ── POST /:id/recording/consent — The agent has the caller's consent (R306) ──
// 'On request' agencies record only after this; for the others it notes that the line was read.

callRoutes.post('/:id/recording/consent', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const id = c.req.param('id');
  const call = await db
    .prepare('SELECT id, status, provider_call_id, twilio_call_sid, created_by, routed_to, answered_by, recording_r2_key, recording_state FROM call_logs WHERE id = ?')
    .bind(id)
    .first<{ id: string; status: string; provider_call_id: string | null; twilio_call_sid: string | null; created_by: string | null; routed_to: string | null; answered_by: string | null; recording_r2_key: string | null; recording_state: string | null }>();
  if (!call) return notFound(c, 'Call log');
  const involved = [call.created_by, call.routed_to, call.answered_by].includes(userId);
  if (!involved && c.get('role') !== 'admin') return error(c, 'Insufficient permissions', 403);

  const settings = await loadRecordingSettings(db);
  await db.prepare(`UPDATE call_logs SET recording_consent = 'given', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`).bind(id).run();
  await logActivity(drizzle(db), { userId, action: 'recording_consent', entityType: 'call', entityId: id, details: JSON.stringify({ mode: settings.consentMode }) });

  let recording = false;
  if (settings.consentMode === 'on_request' && !call.recording_r2_key && !call.recording_state) {
    const providerCallId = call.provider_call_id || call.twilio_call_sid;
    if (!providerCallId || !['in-progress', 'ringing', 'initiated', 'queued'].includes(call.status)) {
      return error(c, 'The call is not in progress, so it cannot be recorded.', 409);
    }
    const voip = await loadVoipSettings(c.env, db);
    if (!voip) return error(c, 'VoIP not configured', 422);
    const baseUrl = (c.env.API_PUBLIC_URL?.trim() || c.req.url.replace(/\/api\/v1\/calls\/.*$/, '')).replace(/\/+$/, '');
    try {
      await createVoipProvider(c.env, voip).startRecording(providerCallId, baseUrl);
      recording = true;
    } catch (e: any) {
      return error(c, e.message || 'Could not start recording', 502);
    }
  }
  return success(c, { consent: 'given', recording });
});

// ── POST /:id/summarise — "Summarise now" / "Try again" (R306) ─
// Runs the call AI for this call if the agency has it on, the plan includes it and credits suffice.

callRoutes.post('/:id/summarise', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const call = await db.prepare('SELECT id, direction, status, outcome FROM call_logs WHERE id = ?').bind(id).first<{ id: string; direction: string; status: string; outcome: string | null }>();
  if (!call) return notFound(c, 'Call log');
  if (!(await canAccessCallData(db, c.get('role'), c.get('userId'), id, 'transcript'))) return error(c, 'You do not have access to this call', 403);

  let waiter: { waitUntil(p: Promise<unknown>): void } | undefined;
  try { waiter = c.executionCtx; } catch { waiter = undefined; }
  const result = await requestCallAi(c.env, db, c.get('tenantId'), id, { voicemail: call.outcome === 'voicemail', waiter });
  if (result.status === 'off') return error(c, 'Call AI is switched off for this workspace.', 409, { code: 'CALL_AI_OFF' });
  if (result.status === 'skipped' && result.reason === REASON_CREDITS) {
    return error(c, AI_QUOTA_EXCEEDED_MESSAGE, 429, { code: 'AI_QUOTA_EXCEEDED' });
  }
  if (result.status === 'skipped') return error(c, result.reason ?? 'This call cannot be summarised.', 422, { code: 'CALL_AI_SKIPPED' });
  return c.json({ success: true, data: { status: result.status } }, result.status === 'queued' ? 202 : 200);
});

// ── GET /:id/summary — The AI summary of a call, for the roles allowed to read it (R306) ─

callRoutes.get('/:id/summary', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const call = await db.prepare('SELECT id, ai_status, ai_status_reason FROM call_logs WHERE id = ?').bind(id).first<{ id: string; ai_status: string | null; ai_status_reason: string | null }>();
  if (!call) return notFound(c, 'Call log');
  if (!(await canAccessCallData(db, c.get('role'), c.get('userId'), id, 'summary'))) return error(c, 'You do not have access to this summary', 403);

  const row = await db
    .prepare('SELECT id, summary, key_topics, action_items, sentiment, deal_likelihood, status, model_used, created_at FROM ai_call_extractions WHERE call_log_id = ?')
    .bind(id)
    .first<Record<string, any>>();
  const parse = (value: string | null) => {
    if (!value) return [];
    try { return JSON.parse(value); } catch { return []; }
  };
  return success(c, {
    aiStatus: call.ai_status,
    aiStatusReason: call.ai_status_reason,
    summary: row
      ? {
          extractionId: row.id,
          bullets: parse(row.summary),
          keyTopics: parse(row.key_topics),
          actionItems: parse(row.action_items),
          sentiment: row.sentiment,
          dealLikelihood: row.deal_likelihood,
          status: row.status,
          model: row.model_used,
          createdAt: row.created_at,
        }
      : null,
  });
});

export default callRoutes;
