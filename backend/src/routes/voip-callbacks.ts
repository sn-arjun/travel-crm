/**
 * VoIP Callback Routes — Twilio webhooks (public, signature-validated)
 *
 * TICKET-371: Status callback, recording callback, TwiML endpoints
 * TICKET-377: Inbound call routing TwiML
 * TICKET-378: IVR menu system
 * TICKET-381: Missed call handling
 * TICKET-384: Voicemail recording
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppContext, Env } from '../types';
import { generateId } from '../utils/uuid';
import { resolveInboundRouting } from '../services/call-routing';
import { handleMissedCall } from '../services/missed-call-handler';
import { emitEvent } from '../services/automation/events';
import { normalizePhone } from '../utils/phone';
import { checkBusinessHours, type BusinessHoursConfig } from '../utils/business-hours';
import { createVoipProvider, escapeXml as escapeXmlUtil, loadVoipSettings } from '../services/voip-provider';
import type { VoipSettingsRow } from '../services/voip-provider';

import { candidateTenantDbs, resolveTenantDb, tenancyMode } from '../services/tenant-db';
import { formParams, publicRequestUrl, unsignedAllowed, verifyTwilioAny } from '../middleware/provider-signature';

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

// ── Status Callback — Twilio & Plivo call status updates ──────

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

  const updates: string[] = ['status = ?'];
  const values: (string | number)[] = [status];

  if (duration !== undefined) {
    updates.push('duration_seconds = ?');
    values.push(duration);
  }

  updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
  values.push(callSid);

  try {
    // Try matching by provider_call_id first, then fall back to twilio_call_sid
    let result = await db.prepare(`UPDATE call_logs SET ${updates.join(', ')} WHERE provider_call_id = ?`)
      .bind(...values).run();
    if (!result.meta.changes) {
      await db.prepare(`UPDATE call_logs SET ${updates.join(', ')} WHERE twilio_call_sid = ?`)
        .bind(...values).run();
    }

    // Handle missed calls (TICKET-381)
    if (status === 'no-answer' || status === 'busy' || status === 'canceled') {
      const callLog = await db.prepare(`
        SELECT id, direction, from_number, to_number, routed_to, contact_id, lead_id
        FROM call_logs WHERE provider_call_id = ? OR twilio_call_sid = ?
      `).bind(callSid, callSid).first<{
        id: string;
        direction: string;
        from_number: string;
        to_number: string | null;
        routed_to: string | null;
        contact_id: string | null;
        lead_id: string | null;
      }>();

      if (callLog?.direction === 'inbound') {
        const settings = await loadSettings(c.env, db);
        try {
          await handleMissedCall(db, c.env as any, {
            callLogId: callLog.id,
            fromNumber: callLog.from_number,
            routedTo: callLog.routed_to,
            contactId: callLog.contact_id,
            leadId: callLog.lead_id,
          });
        } catch (e) {
          console.error('Missed call notification failed:', e);
        }

        // Let the automations react (call-back task). The workspace is the one that owns the called number.
        const tenantId = await tenantForCalledNumber(c.env, callLog.to_number);
        if (tenantId) {
          await emitEvent(c.env, tenantId, db, {
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
      }
    }
  } catch (e) {
    console.error('Status callback error:', e);
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
  const url = recordingUrl.endsWith('.mp3') ? recordingUrl : `${recordingUrl}.mp3`;

  try {
    let result = await db.prepare(`
      UPDATE call_logs
      SET recording_url = ?, recording_duration = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE provider_call_id = ?
    `).bind(url, recordingDuration, callSid).run();
    if (!result.meta.changes) {
      await db.prepare(`
        UPDATE call_logs
        SET recording_url = ?, recording_duration = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE twilio_call_sid = ?
      `).bind(url, recordingDuration, callSid).run();
    }
  } catch (e) {
    console.error('Recording callback error:', e);
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
  const existingLog = callSid
    ? await db.prepare('SELECT id FROM call_logs WHERE provider_call_id = ?').bind(callSid).first<{ id: string }>()
    : null;
  const callLogId = existingLog?.id ?? generateId();
  if (!existingLog) {
    await db.prepare(`
      INSERT INTO call_logs (id, direction, from_number, to_number, status, twilio_call_sid, provider_call_id, created_by)
      VALUES (?, 'inbound', ?, ?, 'ringing', ?, ?, NULL)
    `).bind(callLogId, from, to, callSid || null, callSid || null).run();
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

  const shouldRecord = settings.recordingPolicy === 'all' || settings.recordingPolicy === 'inbound';

  return c.text(
    provider.generateClientDialMarkup(routing.targetIdentity, from, shouldRecord),
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
      const shouldRecord = settings.recordingPolicy === 'all' || settings.recordingPolicy === 'inbound';
      return c.text(
        provider.generateClientDialMarkup(`user_${option.target}`, from, shouldRecord),
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
        const shouldRecord = settings.recordingPolicy === 'all' || settings.recordingPolicy === 'inbound';
        return c.text(
          provider.generateClientDialMarkup(routing.targetIdentity, from, shouldRecord),
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

  const baseUrl = c.req.url.replace(/\/api\/v1\/voip\/twiml\/dial-status.*$/, '').replace(/\/api\/voip\/twiml\/dial-status.*$/, '');

  // If the agent didn't answer, route to voicemail
  if (dialStatus !== 'answered' && dialStatus !== 'completed') {
    const db = await callDb(c.env, { number: body.To as string, callLogId });
    if (!db) return c.text('<Response/>', 200, { 'Content-Type': 'text/xml' });
    const settings = await loadSettings(c.env, db);
    if (settings) {
      const provider = createVoipProvider(c.env as any, settings);
      return c.text(provider.generateVoicemailMarkup(
        `${baseUrl}/api/v1/voip/recording-callback`,
      ), 200, { 'Content-Type': 'text/xml' });
    }
    // Fallback TwiML
    return c.text(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">The person you are trying to reach is unavailable. Please leave a message after the beep.</Say>
  <Record maxLength="120" playBeep="true" timeout="5"
    action="${escapeXml(baseUrl)}/api/v1/voip/voicemail-callback?callLogId=${callLogId}"
    recordingStatusCallback="${escapeXml(baseUrl)}/api/v1/voip/recording-callback" />
  <Hangup/>
</Response>`, 200, { 'Content-Type': 'text/xml' });
  }

  return c.text('<Response/>', 200, { 'Content-Type': 'text/xml' });
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
        SET recording_url = ?, recording_duration = ?, outcome = 'voicemail',
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?
      `).bind(`${recordingUrl}.mp3`, recordingDuration, callLogId).run();
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

// escapeXml is imported from voip-provider.ts as escapeXmlUtil
const escapeXml = escapeXmlUtil;

export default voipCallbackRoutes;
