/**
 * VoIP Callback Routes — Twilio webhooks (public, signature-validated)
 *
 * TICKET-371: Status callback, recording callback, TwiML endpoints
 * TICKET-377: Inbound call routing TwiML
 * TICKET-378: IVR menu system
 * TICKET-381: Missed call handling
 * TICKET-384: Voicemail recording
 */

import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import type { AppContext, Env } from '../types';
import { generateId } from '../utils/uuid';
import { resolveInboundRouting } from '../services/call-routing';
import { handleMissedCall } from '../services/missed-call-handler';
import { emitEvent } from '../services/automation/events';
import { broadcastCallRinging, broadcastCallStatus } from '../utils/realtime';
import { normalizePhone } from '../utils/phone';
import { checkBusinessHours, type BusinessHoursConfig } from '../utils/business-hours';
import { createVoipProvider, escapeXml as escapeXmlUtil, loadVoipSettings } from '../services/voip-provider';
import type { VoipSettingsRow } from '../services/voip-provider';

import { candidateTenantDbs, resolveTenantDb, tenancyMode } from '../services/tenant-db';
import { formParams, publicRequestUrl, unsignedAllowed, verifyTwilioAny } from '../middleware/provider-signature';
import { recordUsage } from '../services/metering/meter';
import { autoRecord, loadRecordingSettings, recordingIdFromUrl, storeRecording } from '../services/voip/recordings';
import { requestCallAi } from '../services/voip/call-ai';

const voipCallbackRoutes = new Hono<AppContext>();

// Public CORS for VoIP provider webhooks
voipCallbackRoutes.use('/*', cors({ origin: '*' }));

/**
 * Every route here is a public provider callback, so every one must be genuinely signed. The workspace is
 * found from the callback (its number, or a call it already logged) and the signature is checked with that
 * workspace's own provider token, falling back to the platform's TWILIO_AUTH_TOKEN. Unsigned or invalid:
 * 403 before any handler (and so any database write) runs. Test mode lets a callback with no signature
 * header through; a callback that carries one is always checked.
 */
voipCallbackRoutes.use('/*', async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();
  const signature = c.req.header('X-Twilio-Signature');
  const anySignature = signature || c.req.header('X-Plivo-Signature-V3');
  if (unsignedAllowed(c.env, anySignature)) return next();
  // Plivo is dropped (owner decision 2026-10-14); its callbacks are not accepted here.
  if (!signature) return c.json({ error: 'Missing webhook signature' }, 403);

  const params = await formParams(c);
  const tokens: Array<string | null | undefined> = [c.env.TWILIO_AUTH_TOKEN];
  try {
    const db =
      (await callDb(c.env, { number: params.To, callSid: params.CallSid, callLogId: c.req.query('callLogId') })) ??
      (await callDb(c.env, { number: params.From }));
    const settings = db ? await loadSettings(c.env, db) : null;
    if (settings && settings.voipProvider !== 'twilio') return c.json({ error: 'Webhook signatures are not supported for this provider' }, 403);
    // loadSettings decrypts the workspace's stored token (R108); an unreadable one leaves only the platform token.
    if (settings) tokens.unshift(settings.providerAuthToken || settings.twilioAuthToken);
  } catch (e) {
    console.error('VoIP callback tenant lookup failed:', e);
  }

  if (!(await verifyTwilioAny(publicRequestUrl(c), params, tokens, signature))) {
    return c.json({ error: 'Invalid Twilio signature' }, 403);
  }
  return next();
});

// ── Helper: load VoIP settings from DB (credentials decrypted) ─

/** A workspace whose stored credentials cannot be opened is treated as not configured (fail closed, logged without values). */
async function loadSettings(env: Env, db: D1Database): Promise<VoipSettingsRow | null> {
  try {
    return await loadVoipSettings(env, db);
  } catch (e) {
    console.error('[voip-callbacks] stored credentials unavailable:', e instanceof Error ? e.name : 'error');
    return null;
  }
}


/** Parse JSON safely, return null on failure */
function safeJsonParse(val: string | null): any {
  if (!val) return null;
  try { return JSON.parse(val); } catch { return null; }
}

/** Which workspace a call belongs to: the owner of the called number, or the only workspace there is. */
async function tenantForCalledNumber(env: Env, toNumber: string | null): Promise<string | null> {
  const masterDb = env.MASTER_DB;
  const number = toNumber ? normalizePhone(toNumber) : '';
  if (number) {
    const owner = await masterDb
      .prepare('SELECT tenant_id FROM tenant_channel_addresses WHERE address = ? AND is_active = 1 LIMIT 1')
      .bind(number)
      .first<{ tenant_id: string }>();
    if (owner) return owner.tenant_id;
  }
  // The single-workspace shortcut exists only in single-tenant mode; in multi mode an unknown number is unknown.
  if (tenancyMode(env) !== 'single') return null;
  const tenants = await masterDb.prepare("SELECT id FROM tenants WHERE status = 'active' LIMIT 2").all<{ id: string }>();
  return tenants.results.length === 1 ? tenants.results[0].id : null;
}

/**
 * The database of the workspace a provider webhook is about. A webhook carries no login, so the workspace is
 * found from what it does carry: the workspace's own number, or a call that workspace has already logged.
 */
async function callDb(env: Env, hint: { number?: string | null; callSid?: string | null; callLogId?: string | null }): Promise<D1Database | null> {
  const number = hint.number ? normalizePhone(hint.number) : '';
  if (number) {
    const owner = await env.MASTER_DB
      .prepare('SELECT tenant_id FROM tenant_channel_addresses WHERE address = ? AND is_active = 1 LIMIT 1')
      .bind(number)
      .first<{ tenant_id: string }>();
    const db = owner ? await resolveTenantDb(env, owner.tenant_id) : null;
    if (db) return db;
  }

  const candidates = await candidateTenantDbs(env);
  if (candidates.length === 1) return candidates[0];
  const key = hint.callLogId || hint.callSid;
  if (key) {
    for (const db of candidates) {
      try {
        const hit = await db
          .prepare('SELECT 1 AS hit FROM call_logs WHERE id = ? OR provider_call_id = ? OR twilio_call_sid = ? LIMIT 1')
          .bind(key, key, key)
          .first();
        if (hit) return db;
      } catch {
        // a workspace whose database is not reachable; try the next
      }
    }
  }
  // No workspace found: never fall back to the shared database. The caller answers with an empty TwiML response.
  return null;
}

// ── Exactly once (R302) ──────────────────────────────────────
// A provider repeats callbacks (retries on a slow answer, at-least-once delivery) and may deliver them out of
// order. Each callback claims a provider_events row first; only the request that inserted it does the work.

const EVENT_PROVIDER = 'twilio';

/** Claim (provider, call, event, sequence). True for the first request only; a repeat changes nothing. */
async function claimEvent(db: D1Database, callId: string, event: string, sequence = ''): Promise<boolean> {
  const res = await db
    .prepare('INSERT OR IGNORE INTO provider_events (provider, provider_call_id, event, sequence) VALUES (?, ?, ?, ?)')
    .bind(EVENT_PROVIDER, callId, event, sequence)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/** Give a claim back after the work failed, so the provider's retry is processed instead of swallowed. */
async function releaseEvent(db: D1Database, callId: string, event: string, sequence = ''): Promise<void> {
  try {
    await db
      .prepare('DELETE FROM provider_events WHERE provider = ? AND provider_call_id = ? AND event = ? AND sequence = ?')
      .bind(EVENT_PROVIDER, callId, event, sequence)
      .run();
  } catch (e) {
    console.error('Could not release provider event:', e instanceof Error ? e.message : 'error');
  }
}

/** How far a call has got; a callback that would move it backwards (arrived late) is ignored. */
function statusRank(status: string): number {
  switch (status) {
    case 'initiated': case 'queued': return 0;
    case 'ringing': return 1;
    case 'in-progress': return 2;
    default: return 3; // completed, busy, no-answer, canceled, failed
  }
}

/**
 * An inbound call nobody answered: tell the person it rang and the admins, and let the automations react
 * (call-back task). Reached from the dial result (<Dial action>) and from the status callback, whichever comes
 * first; the 'missed' claim keyed by the call makes it happen once.
 */
async function recordMissedCall(env: Env, db: D1Database, key: { callLogId?: string; callSid?: string }): Promise<boolean> {
  const callLog = await db.prepare(`
    SELECT id, direction, from_number, to_number, routed_to, contact_id, lead_id, provider_call_id, twilio_call_sid
    FROM call_logs WHERE id = ? OR provider_call_id = ? OR twilio_call_sid = ?
  `).bind(key.callLogId || '', key.callSid || '', key.callSid || '').first<{
    id: string;
    direction: string;
    from_number: string;
    to_number: string | null;
    routed_to: string | null;
    contact_id: string | null;
    lead_id: string | null;
    provider_call_id: string | null;
    twilio_call_sid: string | null;
  }>();
  if (!callLog || callLog.direction !== 'inbound') return false;

  const claimKey = callLog.provider_call_id || callLog.twilio_call_sid || callLog.id;
  if (!(await claimEvent(db, claimKey, 'missed'))) return false;

  try {
    const settings = await loadSettings(env, db);
    await handleMissedCall(db, env as any, {
      callLogId: callLog.id,
      fromNumber: callLog.from_number,
      routedTo: callLog.routed_to,
      contactId: callLog.contact_id,
      leadId: callLog.lead_id,
    });

    const tenantId = await tenantForCalledNumber(env, callLog.to_number);
    if (tenantId) {
      await emitEvent(env, tenantId, db, {
        type: 'call.missed',
        entityType: 'call',
        entityId: callLog.id,
        payload: {
          from: callLog.from_number,
          contactId: callLog.contact_id,
          leadId: callLog.lead_id,
          routedTo: callLog.routed_to,
          // The workspace's "lead from a missed call" setting; without VoIP settings it is on.
          offerLead: settings ? !!settings.autoCreateLeadMissedCall : true,
        },
      });
    }
  } catch (e) {
    console.error('Missed call handling failed:', e);
    await releaseEvent(db, claimKey, 'missed');
    return false;
  }
  return true;
}

// ── Call lifecycle events (R303) ─────────────────────────────
// One automation event per real occurrence: each is claimed in provider_events (keyed by the provider's call id and
// the event name) before it is emitted, so a repeated or out-of-order callback never emits it twice.

interface LifecycleCall {
  id: string;
  direction: string;
  from_number: string;
  to_number: string | null;
  status: string | null;
  duration_seconds: number | null;
  routed_to: string | null;
  answered_by: string | null;
  created_by: string | null;
  contact_id: string | null;
  lead_id: string | null;
  recording_url: string | null;
  provider_call_id: string | null;
  twilio_call_sid: string | null;
}

async function loadLifecycleCall(db: D1Database, key: { callLogId?: string; callSid?: string }): Promise<LifecycleCall | null> {
  return db.prepare(`
    SELECT id, direction, from_number, to_number, status, duration_seconds, routed_to, answered_by, created_by,
           contact_id, lead_id, recording_url, provider_call_id, twilio_call_sid
    FROM call_logs WHERE id = ? OR provider_call_id = ? OR twilio_call_sid = ? LIMIT 1
  `).bind(key.callLogId || '', key.callSid || '', key.callSid || '').first<LifecycleCall>();
}

function claimKeyOf(call: LifecycleCall): string {
  return call.provider_call_id || call.twilio_call_sid || call.id;
}

/** The agency's side of a call is the number it owns: the called number inbound, the caller ID outbound. */
function agencyNumberOf(call: LifecycleCall): string | null {
  return call.direction === 'outbound' ? call.from_number : call.to_number;
}

/** The customer's number. */
function customerNumberOf(call: LifecycleCall): string {
  return (call.direction === 'outbound' ? call.to_number : call.from_number) ?? '';
}

/** Emit `type` for the call once. Returns true when this request was the one that emitted it. */
async function emitCallEventOnce(
  env: Env,
  db: D1Database,
  call: LifecycleCall,
  type: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (!(await claimEvent(db, claimKeyOf(call), `event:${type}`))) return false;
  const tenantId = await tenantForCalledNumber(env, agencyNumberOf(call));
  if (!tenantId) return false;
  await emitEvent(env, tenantId, db, {
    type,
    entityType: 'call',
    entityId: call.id,
    payload: { callId: call.id, direction: call.direction, ...payload },
  });
  return true;
}

/** Has this event already been emitted for the call (or the missed-call claim been taken)? */
async function claimExists(db: D1Database, call: LifecycleCall, event: string): Promise<boolean> {
  const hit = await db
    .prepare('SELECT 1 AS hit FROM provider_events WHERE provider = ? AND provider_call_id = ? AND event = ? LIMIT 1')
    .bind(EVENT_PROVIDER, claimKeyOf(call), event)
    .first();
  return !!hit;
}

/**
 * An inbound call reaches an agent: emit call.ringing and push the screen pop (call:ringing to the routed agent,
 * call:ringing_for to everyone else). Once per call.
 */
async function announceRinging(env: Env, db: D1Database, callLogId: string): Promise<void> {
  try {
    const call = await loadLifecycleCall(db, { callLogId });
    if (!call || call.direction !== 'inbound' || !call.routed_to) return;
    if (!(await claimEvent(db, claimKeyOf(call), 'event:call.ringing'))) return;
    const tenantId = await tenantForCalledNumber(env, call.to_number);
    if (!tenantId) return;

    await emitEvent(env, tenantId, db, {
      type: 'call.ringing',
      entityType: 'call',
      entityId: call.id,
      payload: {
        callId: call.id,
        direction: 'inbound',
        from: call.from_number,
        to: call.to_number,
        contactId: call.contact_id,
        leadId: call.lead_id,
        routedTo: call.routed_to,
      },
    });

    const contact = call.contact_id
      ? await db.prepare('SELECT id, name FROM contacts WHERE id = ?').bind(call.contact_id).first<{ id: string; name: string }>()
      : null;
    const lead = call.lead_id
      ? await db.prepare('SELECT id, title, status, estimated_value FROM leads WHERE id = ?').bind(call.lead_id).first<{ id: string; title: string; status: string; estimated_value: number | null }>()
      : null;
    const agent = await db.prepare('SELECT name FROM users WHERE id = ?').bind(call.routed_to).first<{ name: string }>();

    let lastInteraction: { kind: 'message' | 'call_note'; text: string; at: string | null } | null = null;
    if (contact) {
      const message = await db
        .prepare(`SELECT content, created_at FROM message_log WHERE contact_id = ? AND content IS NOT NULL AND content <> '' ORDER BY created_at DESC LIMIT 1`)
        .bind(contact.id)
        .first<{ content: string; created_at: string }>();
      const note = await db
        .prepare(`SELECT notes, created_at FROM call_logs WHERE contact_id = ? AND id <> ? AND notes IS NOT NULL AND notes <> '' ORDER BY created_at DESC LIMIT 1`)
        .bind(contact.id, call.id)
        .first<{ notes: string; created_at: string }>();
      // Whichever is newer.
      if (message && (!note || message.created_at >= note.created_at)) {
        lastInteraction = { kind: 'message', text: message.content.slice(0, 200), at: message.created_at };
      } else if (note) {
        lastInteraction = { kind: 'call_note', text: note.notes.slice(0, 200), at: note.created_at };
      }
    }

    await broadcastCallRinging(env, tenantId, {
      callId: call.id,
      direction: 'inbound',
      from: call.from_number,
      to: call.to_number,
      routedTo: call.routed_to,
      routedToName: agent?.name ?? null,
      contact,
      lead: lead ? { id: lead.id, title: lead.title, status: lead.status, value: lead.estimated_value } : null,
      lastInteraction,
      ringingAt: new Date().toISOString(),
    });
  } catch (e) {
    // Never fail the provider's request over a screen pop.
    console.error('Ringing announcement failed:', e instanceof Error ? e.message : 'error');
  }
}

/** Run announceRinging after the response is sent when the request has an execution context, else before it resolves. */
function deferRinging(c: Context<AppContext>, env: Env, db: D1Database, callLogId: string): void {
  const work = announceRinging(env, db, callLogId);
  try {
    c.executionCtx.waitUntil(work);
  } catch {
    // no execution context (unit tests calling the app directly): the promise still runs
  }
}

/** Somebody picked up. Inbound: the agent the call rang. Outbound: the agent who placed it. */
async function recordAnswered(env: Env, db: D1Database, call: LifecycleCall): Promise<void> {
  const agentId = call.answered_by ?? (call.direction === 'outbound' ? call.created_by : call.routed_to);
  if (call.direction === 'inbound' && !agentId) return;
  const answeredAt = new Date().toISOString();
  if (agentId && !call.answered_by) {
    await db.prepare('UPDATE call_logs SET answered_by = ? WHERE id = ? AND answered_by IS NULL').bind(agentId, call.id).run();
  }
  await emitCallEventOnce(env, db, call, 'call.answered', { agentId: agentId ?? null, answeredAt });
}

/** The call is over: a connected call finished, or an outbound call was not answered. */
async function recordEnded(env: Env, db: D1Database, key: { callLogId?: string; callSid?: string }, result: string): Promise<void> {
  const call = await loadLifecycleCall(db, key);
  if (!call) return;
  await emitCallEventOnce(env, db, call, 'call.ended', {
    result,
    durationSeconds: call.duration_seconds ?? 0,
    number: customerNumberOf(call),
    contactId: call.contact_id,
    leadId: call.lead_id,
    agentId: call.answered_by ?? call.created_by ?? call.routed_to,
  });
}

// ── Status Callback — Twilio & Plivo call status updates ──────

voipCallbackRoutes.post('/status-callback', async (c) => {
  const body = await c.req.parseBody();

  // Twilio: CallSid + CallStatus + CallDuration
  // Plivo: CallUUID + CallStatus + Duration / BillDuration
  const callSid = (body.CallSid || body.CallUUID) as string;
  const callStatus = (body.CallStatus as string) || '';
  const duration = body.CallDuration ? Number(body.CallDuration)
    : body.Duration ? Number(body.Duration)
    : body.BillDuration ? Number(body.BillDuration) : undefined;

  if (!callSid || !callStatus) {
    return c.text('<Response/>', 200, { 'Content-Type': 'text/xml' });
  }

  // Normalize status across providers (Twilio + Plivo use similar names)
  const statusMap: Record<string, string> = {
    queued: 'initiated',
    ringing: 'ringing',
    'in-progress': 'in-progress',
    completed: 'completed',
    busy: 'busy',
    'no-answer': 'no-answer',
    canceled: 'canceled',
    failed: 'failed',
    // Plivo-specific
    early_media: 'ringing',
    hangup: 'completed',
  };

  const status = statusMap[callStatus] || callStatus;
  const db = await callDb(c.env, { number: body.To as string, callSid });
  if (!db) return c.text('<Response/>', 200, { 'Content-Type': 'text/xml' });

  // Claim the callback before anything else. Twilio numbers its status events (SequenceNumber); without one the
  // callback's own timestamp does; a status can only happen once to a call, so the status alone keys the rest.
  const event = `status:${callStatus}`;
  const sequence = String(body.SequenceNumber ?? body.Timestamp ?? '');
  if (!(await claimEvent(db, callSid, event, sequence))) {
    return c.text('<Response/>', 200, { 'Content-Type': 'text/xml' });
  }

  try {
    const current = await db
      .prepare('SELECT status FROM call_logs WHERE provider_call_id = ? OR twilio_call_sid = ? LIMIT 1')
      .bind(callSid, callSid)
      .first<{ status: string | null }>();

    // A late callback never moves a call backwards, and a call that already ended keeps how it ended.
    const currentStatus = current?.status ?? 'initiated';
    const advance = statusRank(status) >= statusRank(currentStatus) && statusRank(currentStatus) < 3;
    const updates: string[] = [];
    const values: (string | number)[] = [];
    if (advance) {
      updates.push('status = ?');
      values.push(status);
    }
    if (duration !== undefined) {
      updates.push('duration_seconds = MAX(COALESCE(duration_seconds, 0), ?)');
      values.push(duration);
    }
    if (updates.length > 0) {
      updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
      values.push(callSid, callSid);
      await db.prepare(`UPDATE call_logs SET ${updates.join(', ')} WHERE provider_call_id = ? OR twilio_call_sid = ?`)
        .bind(...values).run();
    }

    // R110 (provisional until R305 meters from provider records): a completed call adds ceil(duration / 60) minutes to
    // the agency's monthly call-minute usage, once per call (the metering key is the call).
    if (status === 'completed' && duration && duration > 0) {
      try {
        const done = await db
          .prepare('SELECT direction, from_number, to_number FROM call_logs WHERE provider_call_id = ? OR twilio_call_sid = ?')
          .bind(callSid, callSid)
          .first<{ direction: string; from_number: string | null; to_number: string | null }>();
        const tenantId = done ? await tenantForCalledNumber(c.env, done.direction === 'outbound' ? done.from_number : done.to_number) : null;
        if (tenantId) await recordUsage(c.env, tenantId, 'call_minute', Math.ceil(duration / 60), `call:${callSid}`);
      } catch (e) {
        console.error('Call minute metering failed:', e instanceof Error ? e.message : 'error');
      }
    }

    // Missed inbound calls (TICKET-381): once per call, whichever of the dial result and this callback comes first.
    if (status === 'no-answer' || status === 'busy' || status === 'canceled') {
      await recordMissedCall(c.env, db, { callSid });
    }

    // Lifecycle events (R303): answered and ended, each once per call.
    const call = await loadLifecycleCall(db, { callSid });
    if (call) {
      // The agent's in-call panel follows the provider's real state.
      const panelAgent = call.direction === 'outbound' ? call.created_by : call.routed_to;
      if (panelAgent) {
        const tenantId = await tenantForCalledNumber(c.env, agencyNumberOf(call));
        if (tenantId) await broadcastCallStatus(c.env, tenantId, panelAgent, { callId: call.id, status: call.status ?? status, durationSeconds: call.duration_seconds });
      }
      if (status === 'in-progress') {
        // Outbound: the agent's leg answered. (An inbound call is answered when the agent picks up; that is
        // reported by the dial result, or at the end when this provider reports only the call's own status.)
        if (call.direction === 'outbound') await recordAnswered(c.env, db, call);
      } else if (status === 'completed') {
        if (call.direction === 'inbound') {
          if (!(await claimExists(db, call, 'missed')) && call.routed_to) {
            await recordAnswered(c.env, db, call);
            await recordEnded(c.env, db, { callSid }, 'completed');
          }
        } else if ((call.duration_seconds ?? 0) > 0 || (await claimExists(db, call, 'event:call.answered'))) {
          await recordAnswered(c.env, db, call);
          await recordEnded(c.env, db, { callSid }, 'completed');
        } else {
          await recordEnded(c.env, db, { callSid }, 'no_answer');
        }
      } else if (call.direction === 'outbound' && (status === 'no-answer' || status === 'busy' || status === 'canceled' || status === 'failed')) {
        await recordEnded(c.env, db, { callSid }, status === 'busy' ? 'busy' : status === 'failed' ? 'failed' : 'no_answer');
      }
    }
  } catch (e) {
    console.error('Status callback error:', e);
    await releaseEvent(db, callSid, event, sequence);
    return c.text('<Response/>', 500, { 'Content-Type': 'text/xml' });
  }

  return c.text('<Response/>', 200, { 'Content-Type': 'text/xml' });
});

// ── Recording Callback — Twilio/Plivo recording ready ─────────

voipCallbackRoutes.post('/recording-callback', async (c) => {
  const body = await c.req.parseBody();
  // Twilio: CallSid + RecordingUrl + RecordingDuration
  // Plivo: CallUUID + RecordingUrl + RecordingDuration
  const callSid = (body.CallSid || body.CallUUID) as string;
  const recordingUrl = (body.RecordingUrl || body.recording_url) as string;
  const recordingDuration = body.RecordingDuration ? Number(body.RecordingDuration)
    : body.RecordingDurationMs ? Number(body.RecordingDurationMs) / 1000 : 0;

  if (!callSid || !recordingUrl) {
    return c.text('<Response/>', 200, { 'Content-Type': 'text/xml' });
  }

  const db = await callDb(c.env, { callSid });

  if (!db) return c.text('<Response/>', 200, { 'Content-Type': 'text/xml' });
  const recordingSid = String(body.RecordingSid ?? recordingUrl);
  if (!(await claimEvent(db, callSid, 'recording', recordingSid))) {
    return c.text('<Response/>', 200, { 'Content-Type': 'text/xml' });
  }
  const url = recordingUrl.endsWith('.mp3') ? recordingUrl : `${recordingUrl}.mp3`;

  try {
    // R306: remember the provider's recording id so the copy into our storage knows what to fetch. A call that already
    // has its recording in our storage keeps it; a late duplicate never brings the provider URL back.
    const providerRecordingId = (body.RecordingSid as string | undefined) || recordingIdFromUrl(url);
    const update = `
      UPDATE call_logs
      SET recording_url = CASE WHEN recording_r2_key IS NULL THEN ? ELSE recording_url END,
          recording_duration = COALESCE(recording_duration, ?),
          recording_provider_id = CASE WHEN recording_r2_key IS NULL THEN ? ELSE recording_provider_id END,
          recording_state = CASE WHEN recording_r2_key IS NULL THEN 'provider' ELSE recording_state END,
          updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    `;
    let result = await db.prepare(`${update} WHERE provider_call_id = ?`).bind(url, recordingDuration, providerRecordingId ?? null, callSid).run();
    if (!result.meta.changes) {
      await db.prepare(`${update} WHERE twilio_call_sid = ?`).bind(url, recordingDuration, providerRecordingId ?? null, callSid).run();
    }
  } catch (e) {
    console.error('Recording callback error:', e);
  }

  // Lifecycle events (R303): the recording is ready, and an inbound recording nobody picked up is a voicemail.
  let storeFor: { callId: string; tenantId: string; voicemail: boolean } | null = null;
  try {
    const call = await loadLifecycleCall(db, { callSid });
    if (call) {
      await emitCallEventOnce(c.env, db, call, 'call.recording_ready', {
        durationSeconds: recordingDuration,
        channels: Number(body.RecordingChannels) || 1,
      });
      const answered = !!call.answered_by || (await claimExists(db, call, 'event:call.answered'));
      const recordingTenant = await tenantForCalledNumber(c.env, agencyNumberOf(call));
      if (recordingTenant) storeFor = { callId: call.id, tenantId: recordingTenant, voicemail: call.direction === 'inbound' && !answered };
      if (call.direction === 'inbound' && !answered) {
        // A voicemail is a missed call too: record that first so the call-back task exists for the voicemail task to replace.
        await recordMissedCall(c.env, db, { callSid });
        await db.prepare(`UPDATE call_logs SET outcome = COALESCE(outcome, 'voicemail') WHERE id = ?`).bind(call.id).run();
        await emitCallEventOnce(c.env, db, call, 'call.voicemail_left', {
          from: call.from_number,
          contactId: call.contact_id,
          leadId: call.lead_id,
          routedTo: call.routed_to,
          durationSeconds: recordingDuration,
          recordingUrl: url,
        });
      }
    }
  } catch (e) {
    console.error('Recording lifecycle events failed:', e instanceof Error ? e.message : 'error');
  }

  // calls.store_recording (R306): copy into our storage once, delete at the provider, then offer the call to the call AI.
  // It is record-keeping, not an automation, so the automations pause switch does not stop it. Failures are retried by the cron job.
  if (storeFor) {
    const job = storeFor;
    const work = (async () => {
      try {
        const stored = await storeRecording(c.env, db, job.tenantId, job.callId, { recordingId: (body.RecordingSid as string | undefined) || null });
        if (stored.status === 'stored' || stored.status === 'already_stored') {
          let waiter: { waitUntil(p: Promise<unknown>): void } | undefined;
          try { waiter = c.executionCtx; } catch { waiter = undefined; }
          await requestCallAi(c.env, db, job.tenantId, job.callId, { voicemail: job.voicemail, waiter });
        }
      } catch (e) {
        console.error('Recording storage failed:', e instanceof Error ? e.message : 'error');
      }
    })();
    try {
      c.executionCtx.waitUntil(work);
    } catch {
      await work;
    }
  }

  return c.text('<Response/>', 200, { 'Content-Type': 'text/xml' });
});

// ── TwiML/XML Outbound — Dial the target number ──────────────

voipCallbackRoutes.post('/twiml/outbound', async (c) => {
  const body = await c.req.parseBody();
  const to = (body.To as string) || '';
  const from = (body.From as string) || (body.Caller as string) || '';

  const db = await callDb(c.env, { number: from, callSid: (body.CallSid || body.CallUUID) as string });

  if (!db) return c.text('<Response/>', 200, { 'Content-Type': 'text/xml' });
  const settings = await loadSettings(c.env, db);
  if (settings) {
    const provider = createVoipProvider(c.env as any, settings);
    return c.text(provider.generateDialMarkup(to, from, false), 200, { 'Content-Type': 'text/xml' });
  }

  // Fallback TwiML if no settings
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${escapeXml(from)}" timeout="30">
    <Number>${escapeXml(to)}</Number>
  </Dial>
</Response>`;
  return c.text(twiml, 200, { 'Content-Type': 'text/xml' });
});

/**
 * The ring step of an inbound call: the provider calls this URL when the dial ends, answered or not, so a
 * no-answer or busy agent reaches the fallback (voicemail) and the call is counted as missed.
 */
function dialFallback(baseUrl: string, callLogId: string, settings: VoipSettingsRow): { actionUrl: string; timeout: number } {
  return {
    actionUrl: `${baseUrl}/api/v1/voip/twiml/dial-status?callLogId=${encodeURIComponent(callLogId)}`,
    timeout: settings.maxRingDuration || 30,
  };
}

/**
 * Does an inbound call record, and what does the caller hear first? (R306) Recording starts by itself only in 'announce'
 * mode, and then the agency's announcement is played before the agent is rung; the call notes that it was announced.
 */
async function inboundRecordingPlan(db: D1Database, callLogId: string): Promise<{ record: boolean; announcement?: string }> {
  const rec = await loadRecordingSettings(db);
  const record = autoRecord(rec, 'inbound');
  if (record && callLogId) {
    await db.prepare("UPDATE call_logs SET recording_consent = 'announced' WHERE id = ? AND recording_consent IS NULL").bind(callLogId).run();
  }
  return { record, announcement: record ? rec.announcement : undefined };
}

// ── Inbound — Route incoming calls (TICKET-377) ──────────────
// Handles both Twilio (TwiML) and Plivo (XML) webhooks

voipCallbackRoutes.post('/twiml/inbound', async (c) => {
  const body = await c.req.parseBody();
  // Twilio: From, To, CallSid — Plivo: From, To, CallUUID
  const from = (body.From as string) || '';
  const to = (body.To as string) || '';
  const callSid = (body.CallSid || body.CallUUID) as string || '';

  const db = await callDb(c.env, { number: to, callSid });

  if (!db) return c.text('<Response/>', 200, { 'Content-Type': 'text/xml' });
  const settings = await loadSettings(c.env, db);

  if (!settings) {
    return c.text(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">We're sorry, this service is not currently available. Please try again later.</Say>
  <Hangup/>
</Response>`, 200, { 'Content-Type': 'text/xml' });
  }

  const provider = createVoipProvider(c.env as any, settings);

  // Create the inbound call log. Nobody created it, so created_by stays NULL. A provider that
  // repeats the webhook for the same call gets the row it already has.
  // The provider may repeat this webhook (a retry after a slow answer); the call is logged once and the
  // repeat is answered with the same steps (markup is re-rendered; nothing else is written twice).
  let callLogId = generateId();
  if (callSid) {
    await db.prepare(`
      INSERT OR IGNORE INTO call_logs (id, direction, from_number, to_number, status, twilio_call_sid, provider_call_id, created_by)
      VALUES (?, 'inbound', ?, ?, 'ringing', ?, ?, NULL)
    `).bind(callLogId, from, to, callSid, callSid).run();
    const logged = await db.prepare('SELECT id FROM call_logs WHERE provider_call_id = ?').bind(callSid).first<{ id: string }>();
    if (logged) callLogId = logged.id;
  } else {
    await db.prepare(`
      INSERT INTO call_logs (id, direction, from_number, to_number, status, created_by)
      VALUES (?, 'inbound', ?, ?, 'ringing', NULL)
    `).bind(callLogId, from, to).run();
  }

  const baseUrl = c.req.url.replace(/\/api\/v1\/voip\/twiml\/inbound.*$/, '').replace(/\/api\/voip\/twiml\/inbound.*$/, '');

  // Who is calling: link the call to the contact and their open lead before anything else, so the
  // call is attached to them even when it ends up at the IVR or voicemail.
  const routing = await resolveInboundRouting(db, from, settings);
  if (routing.contactId || routing.leadId) {
    await db.prepare('UPDATE call_logs SET contact_id = COALESCE(?, contact_id), lead_id = COALESCE(?, lead_id) WHERE id = ?')
      .bind(routing.contactId ?? null, routing.leadId ?? null, callLogId).run();
  }

  // 1. Check business hours
  const businessHours = safeJsonParse(settings.businessHours);
  if (settings.businessHoursEnabled && businessHours) {
    const isOpen = checkBusinessHours(businessHours as BusinessHoursConfig);
    if (!isOpen) {
      return c.text(provider.generateVoicemailMarkup(
        `${baseUrl}/api/v1/voip/recording-callback`,
      ), 200, { 'Content-Type': 'text/xml' });
    }
  }

  // 2. Check IVR
  const ivrConfig = safeJsonParse(settings.ivrConfig);
  if (settings.ivrEnabled && ivrConfig) {
    return c.text(provider.generateIvrMarkup(
      ivrConfig.greeting || 'Welcome. Please select an option.',
      ivrConfig.options || [],
      `${baseUrl}/api/v1/voip/twiml/ivr-handler?callLogId=${callLogId}`,
    ), 200, { 'Content-Type': 'text/xml' });
  }

  // 3. Smart routing: record the agent the call rings
  if (routing.targetUserId) {
    await db.prepare('UPDATE call_logs SET routed_to = ? WHERE id = ?').bind(routing.targetUserId, callLogId).run();
  }

  // 4. Route to agent or voicemail
  if (routing.type === 'voicemail' || !routing.targetIdentity) {
    return c.text(provider.generateVoicemailMarkup(
      `${baseUrl}/api/v1/voip/recording-callback`,
    ), 200, { 'Content-Type': 'text/xml' });
  }

  const plan = await inboundRecordingPlan(db, callLogId);

  // The agent's phone is about to ring: event and screen pop, after the provider has its answer.
  deferRinging(c, c.env, db, callLogId);

  return c.text(
    provider.generateClientDialMarkup(routing.targetIdentity, from, plan.record, { ...dialFallback(baseUrl, callLogId, settings), announcement: plan.announcement }),
    200,
    { 'Content-Type': 'text/xml' },
  );
});

// ── IVR Handler (TICKET-378) ──────────────────────────────────

voipCallbackRoutes.post('/twiml/ivr-handler', async (c) => {
  const body = await c.req.parseBody();
  // Twilio: Digits — Plivo: Digits
  const digits = (body.Digits as string) || '';
  const callLogId = c.req.query('callLogId') || '';
  const noInput = c.req.query('noInput');
  const from = (body.From as string) || '';

  const db = await callDb(c.env, { number: body.To as string, callLogId });

  if (!db) return c.text('<Response/>', 200, { 'Content-Type': 'text/xml' });
  const settings = await loadSettings(c.env, db);
  const baseUrl = c.req.url.replace(/\/api\/v1\/voip\/twiml\/ivr-handler.*$/, '').replace(/\/api\/voip\/twiml\/ivr-handler.*$/, '');

  if (!settings) {
    return c.text(`<?xml version="1.0" encoding="UTF-8"?><Response/>`, 200, { 'Content-Type': 'text/xml' });
  }

  const provider = createVoipProvider(c.env as any, settings);
  const ivrConfig = safeJsonParse(settings.ivrConfig);

  if (!ivrConfig?.options) {
    // No IVR config — route directly via redirect (TwiML/XML fallback)
    return c.text(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Please hold while we connect you.</Say>
  <Redirect>${escapeXml(baseUrl)}/api/v1/voip/twiml/inbound?From=${escapeXml(from)}</Redirect>
</Response>`, 200, { 'Content-Type': 'text/xml' });
  }

  // No input — repeat or voicemail
  if (noInput || !digits) {
    return c.text(provider.generateIvrMarkup(
      ivrConfig.greeting || 'Please select an option.',
      ivrConfig.options || [],
      `${baseUrl}/api/v1/voip/twiml/ivr-handler?callLogId=${callLogId}`,
    ), 200, { 'Content-Type': 'text/xml' });
  }

  // Find matching option
  const option = ivrConfig.options.find((o: any) => o.digit === digits);

  // Record IVR path
  if (callLogId) {
    try {
      const existing = await db.prepare('SELECT ivr_path FROM call_logs WHERE id = ?')
        .bind(callLogId).first<{ ivr_path: string | null }>();
      const path = existing?.ivr_path ? JSON.parse(existing.ivr_path) : [];
      path.push(digits);
      await db.prepare('UPDATE call_logs SET ivr_path = ? WHERE id = ?')
        .bind(JSON.stringify(path), callLogId).run();
    } catch (e) { /* ignore */ }
  }

  if (!option) {
    // Invalid — re-prompt
    return c.text(provider.generateIvrMarkup(
      'Invalid selection. ' + (ivrConfig.greeting || 'Please select an option.'),
      ivrConfig.options || [],
      `${baseUrl}/api/v1/voip/twiml/ivr-handler?callLogId=${callLogId}`,
    ), 200, { 'Content-Type': 'text/xml' });
  }

  // Route based on action
  switch (option.action) {
    case 'extension': {
      const plan = await inboundRecordingPlan(db, callLogId);
      if (callLogId && option.target) {
        await db.prepare('UPDATE call_logs SET routed_to = ? WHERE id = ?').bind(String(option.target), callLogId).run();
        deferRinging(c, c.env, db, callLogId);
      }
      return c.text(
        provider.generateClientDialMarkup(`user_${option.target}`, from, plan.record, { ...dialFallback(baseUrl, callLogId, settings), announcement: plan.announcement }),
        200, { 'Content-Type': 'text/xml' },
      );
    }
    case 'voicemail':
      return c.text(provider.generateVoicemailMarkup(
        `${baseUrl}/api/v1/voip/recording-callback`,
      ), 200, { 'Content-Type': 'text/xml' });
    case 'queue':
    default: {
      const routing = await resolveInboundRouting(db, from, settings);
      if (routing.targetIdentity) {
        const plan = await inboundRecordingPlan(db, callLogId);
        if (callLogId && routing.targetUserId) {
          await db.prepare('UPDATE call_logs SET routed_to = ? WHERE id = ?').bind(routing.targetUserId, callLogId).run();
          deferRinging(c, c.env, db, callLogId);
        }
        return c.text(
          provider.generateClientDialMarkup(routing.targetIdentity, from, plan.record, { ...dialFallback(baseUrl, callLogId, settings), announcement: plan.announcement }),
          200, { 'Content-Type': 'text/xml' },
        );
      }
      return c.text(provider.generateVoicemailMarkup(
        `${baseUrl}/api/v1/voip/recording-callback`,
      ), 200, { 'Content-Type': 'text/xml' });
    }
  }
});

// ── Dial Status — Called after <Dial> completes (no answer → voicemail) ──

voipCallbackRoutes.post('/twiml/dial-status', async (c) => {
  const body = await c.req.parseBody();
  const dialStatus = (body.DialCallStatus as string) || '';
  const callLogId = c.req.query('callLogId') || '';
  const callSid = ((body.CallSid || body.CallUUID) as string) || '';

  // The agent answered (or the call simply ended): nothing more to do.
  if (dialStatus === 'answered' || dialStatus === 'completed') {
    // The agent picked up: that is when the call was answered (call.answered, once, and who answered).
    try {
      const answeredDb = await callDb(c.env, { number: body.To as string, callSid, callLogId });
      const call = answeredDb ? await loadLifecycleCall(answeredDb, { callLogId, callSid }) : null;
      if (answeredDb && call && call.direction === 'inbound') await recordAnswered(c.env, answeredDb, call);
    } catch (e) {
      console.error('Answered handling failed:', e instanceof Error ? e.message : 'error');
    }
    return c.text('<Response/>', 200, { 'Content-Type': 'text/xml' });
  }

  const db = await callDb(c.env, { number: body.To as string, callSid, callLogId });
  if (!db) return c.text('<Response/>', 200, { 'Content-Type': 'text/xml' });

  const baseUrl = c.req.url.replace(/\/api\/v1\/voip\/twiml\/dial-status.*$/, '').replace(/\/api\/voip\/twiml\/dial-status.*$/, '');

  // No answer, busy, failed or cancelled: the call is missed (once; the status callback may say so too).
  // The call ends as 'no-answer' unless it already ended some other way.
  try {
    await db.prepare(`
      UPDATE call_logs SET status = 'no-answer', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE (id = ? OR provider_call_id = ?) AND status IN ('initiated', 'ringing', 'in-progress')
    `).bind(callLogId, callSid).run();
    await recordMissedCall(c.env, db, { callLogId, callSid });
  } catch (e) {
    console.error('Dial status handling failed:', e);
  }

  // The fallback: voicemail (the workspace's greeting), or a polite goodbye when voicemail is switched off.
  const settings = await loadSettings(c.env, db);
  if (settings) {
    const provider = createVoipProvider(c.env as any, settings);
    if (!settings.voicemailEnabled) {
      return c.text(provider.generateHangupMarkup('Nobody is available to take your call right now. Please try again later.'), 200, { 'Content-Type': 'text/xml' });
    }
    return c.text(provider.generateVoicemailMarkup(
      `${baseUrl}/api/v1/voip/recording-callback`,
    ), 200, { 'Content-Type': 'text/xml' });
  }
  // Fallback TwiML
  return c.text(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">The person you are trying to reach is unavailable. Please leave a message after the beep.</Say>
  <Record maxLength="120" playBeep="true" timeout="5"
    action="${escapeXml(baseUrl)}/api/v1/voip/voicemail-callback?callLogId=${escapeXml(callLogId)}"
    recordingStatusCallback="${escapeXml(baseUrl)}/api/v1/voip/recording-callback" />
  <Hangup/>
</Response>`, 200, { 'Content-Type': 'text/xml' });
});

// ── Voicemail Callback (TICKET-384) ──────────────────────────

voipCallbackRoutes.post('/voicemail-callback', async (c) => {
  const body = await c.req.parseBody();
  const callLogId = c.req.query('callLogId') || '';
  const recordingUrl = body.RecordingUrl as string;
  const recordingDuration = body.RecordingDuration ? Number(body.RecordingDuration) : 0;

  if (callLogId && recordingUrl) {
    const db = await callDb(c.env, { number: body.To as string, callLogId });
    if (!db) return c.text('<Response/>', 200, { 'Content-Type': 'text/xml' });
    try {
      await db.prepare(`
        UPDATE call_logs
        SET recording_url = CASE WHEN recording_r2_key IS NULL THEN ? ELSE recording_url END,
            recording_duration = COALESCE(recording_duration, ?), outcome = 'voicemail',
            recording_state = CASE WHEN recording_r2_key IS NULL THEN COALESCE(recording_state, 'provider') ELSE recording_state END,
            recording_provider_id = COALESCE(recording_provider_id, ?),
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?
      `).bind(`${recordingUrl}.mp3`, recordingDuration, recordingIdFromUrl(recordingUrl), callLogId).run();
    } catch (e) {
      console.error('Voicemail callback error:', e);
    }
  }

  return c.text(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you for your message. Goodbye.</Say>
  <Hangup/>
</Response>`, 200, { 'Content-Type': 'text/xml' });
});

// ── Voicemail Complete ────────────────────────────────────────

voipCallbackRoutes.post('/voicemail-complete', async (c) => {
  return c.text(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you for your message. Goodbye.</Say>
  <Hangup/>
</Response>`, 200, { 'Content-Type': 'text/xml' });
});

// ── Announcement played to the customer on answer (R306, outbound calls) ──

voipCallbackRoutes.post('/twiml/announce', async (c) => {
  const callLogId = c.req.query('callLogId') || '';
  const db = await callDb(c.env, { callLogId });
  if (!db) return c.text('<Response/>', 200, { 'Content-Type': 'text/xml' });
  const rec = await loadRecordingSettings(db);
  if (callLogId) {
    await db.prepare("UPDATE call_logs SET recording_consent = 'announced' WHERE id = ? AND recording_consent IS NULL").bind(callLogId).run();
  }
  return c.text(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${escapeXmlUtil(rec.announcement)}</Say>
</Response>`, 200, { 'Content-Type': 'text/xml' });
});

// escapeXml is imported from voip-provider.ts as escapeXmlUtil
const escapeXml = escapeXmlUtil;

export default voipCallbackRoutes;
