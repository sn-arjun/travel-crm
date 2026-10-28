/**
 * Public chatbot surface (no staff login).
 *
 *   /api/v1/public/chatbot/:widgetKey/widget.js   the embeddable script
 *   /api/v1/public/chatbot/:widgetKey/config      greeting + branding for the widget
 *   /api/v1/public/chatbot/:widgetKey/messages    one visitor message in, one reply out
 *   /api/v1/public/chatbot/:widgetKey/contact     the visitor's name, email or phone with their consent (no AI involved)
 *   /api/v1/webhooks/chatbot/whatsapp             Twilio WhatsApp incoming (signed)
 *
 * The widget key (master tenant_channel_addresses, channel 'widget') maps to exactly one tenant, so a
 * visitor can only ever reach that agency's data. Every request is rate limited per IP and widget, the
 * calling website must be on the agency's allow-list, and the plan feature `ai_chatbot` is checked for the
 * resolved tenant. The staff routes (config, conversations, analytics) stay in routes/chatbot.ts.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppContext } from '../types';
import { z } from 'zod';
import { handleChatbotMessage } from './chatbot';
import {
  createLeadFromConversation,
  emitContactCaptured,
  parseContactCapture,
  publicCaptureConfig,
  validateCapturedDetails,
} from '../services/domain/chatbot-leads';
import { aiAwareErrorHandler } from '../utils/ai-unavailable';
import { rateLimit } from '../middleware/rate-limit';
import { requireFeature } from '../middleware/feature-gate';
import { formParams, publicRequestUrl, unsignedAllowed, verifyTwilio } from '../middleware/provider-signature';
import { resolveTenantDb } from '../services/tenant-db';
import { normalizePhone, tenantPhoneCountry } from '../utils/phone';
import { generateId } from '../utils/uuid';
import { isTestMode } from '../utils/test-mode';

const WIDGET_CHANNEL = 'website';
const MAX_MESSAGE_BYTES = 2048;
const MAX_BODY_BYTES = 8 * 1024;
const WIDGET_KEY_SHAPE = /^[A-Za-z0-9_-]{8,64}$/;

// ── Public widget mount ───────────────────────────────────────

export const publicChatbotRoutes = new Hono<AppContext>();
publicChatbotRoutes.onError(aiAwareErrorHandler);

const ip = (c: Context<AppContext>) => c.req.header('cf-connecting-ip') || 'unknown';
const widgetKeyOf = (c: Context<AppContext>) => c.req.param('widgetKey') ?? '';

/** 30 messages / 10 minutes / IP / widget. */
const messageLimit = rateLimit({
  limit: 30,
  windowMs: 10 * 60 * 1000,
  keyFn: (c) => `rl:widget-msg:${widgetKeyOf(c)}:${ip(c)}`,
});
/** 10 contact-detail submissions / 10 minutes / IP / widget. */
const contactLimit = rateLimit({
  limit: 10,
  windowMs: 10 * 60 * 1000,
  keyFn: (c) => `rl:widget-contact:${widgetKeyOf(c)}:${ip(c)}`,
});
/** Config and script loads are cheap but still public. */
const readLimit = rateLimit({
  limit: 120,
  windowMs: 10 * 60 * 1000,
  keyFn: (c) => `rl:widget-read:${widgetKeyOf(c)}:${ip(c)}`,
});

async function tenantForWidgetKey(c: Context<AppContext>): Promise<string | null> {
  const key = widgetKeyOf(c);
  if (!WIDGET_KEY_SHAPE.test(key)) return null;
  const row = await c.env.MASTER_DB
    .prepare("SELECT tenant_id FROM tenant_channel_addresses WHERE channel = 'widget' AND address = ? AND is_active = 1 LIMIT 1")
    .bind(key)
    .first<{ tenant_id: string }>();
  return row?.tenant_id ?? null;
}

function notFound(c: Context<AppContext>) {
  return c.json({ success: false, error: 'Chat is not available' }, 404);
}

/** Run requireFeature('ai_chatbot') for an already-resolved tenant; returns its refusal response, or null when allowed. */
async function featureRefusal(c: Context<AppContext>, tenantId: string): Promise<Response | null> {
  c.set('tenantId', tenantId);
  let allowed = false;
  const res = await requireFeature('ai_chatbot')(c, async () => {
    allowed = true;
  });
  return allowed ? null : ((res as Response | undefined) ?? c.json({ error: 'Feature not available' }, 403));
}

function normalizeOrigin(o: string): string {
  return o.trim().toLowerCase().replace(/\/+$/, '');
}

function originAllowed(origin: string | undefined, allowedJson: string | null | undefined): boolean {
  if (!origin) return true; // not a browser page (a script tag or a server); the rate limit still applies
  let list: unknown = [];
  try {
    list = allowedJson ? JSON.parse(allowedJson) : [];
  } catch {
    list = [];
  }
  if (!Array.isArray(list)) return false;
  const wanted = normalizeOrigin(origin);
  return list.some((o) => typeof o === 'string' && normalizeOrigin(o) === wanted);
}

type WidgetConfig = { enabled: number; greeting: string | null; branding_color: string | null; branding_logo: string | null; allowed_origins: string | null; contact_capture: string | null };

/**
 * The Website bot tab saves to channel 'website'. Older agencies saved the same settings to
 * 'web' (a name the widget never read), so 'web' is the fallback: per field, 'website' wins and
 * 'web' fills what 'website' leaves empty. A 'website' row that only holds the allowed websites
 * (no greeting or colours yet) does not decide `enabled`; the legacy 'web' row does.
 */
export async function readWidgetConfig(db: D1Database): Promise<WidgetConfig | null> {
  const { results } = await db
    .prepare("SELECT channel, enabled, greeting, branding_color, branding_logo, allowed_origins, contact_capture FROM chatbot_config WHERE channel IN (?, 'web')")
    .bind(WIDGET_CHANNEL)
    .all<WidgetConfig & { channel: string }>();
  const site = results.find((r) => r.channel === WIDGET_CHANNEL);
  const legacy = results.find((r) => r.channel === 'web');
  if (!site) return legacy ?? null;
  if (!legacy) return site;
  const siteConfigured = !!(site.greeting || site.branding_color || site.branding_logo);
  return {
    enabled: siteConfigured ? site.enabled : legacy.enabled,
    greeting: site.greeting ?? legacy.greeting,
    branding_color: site.branding_color ?? legacy.branding_color,
    branding_logo: site.branding_logo ?? legacy.branding_logo,
    allowed_origins: site.allowed_origins ?? legacy.allowed_origins,
    contact_capture: site.contact_capture ?? legacy.contact_capture,
  };
}

interface Resolved {
  tenantId: string;
  db: D1Database;
  config: WidgetConfig | null;
}

/** key -> tenant -> database -> origin allow-list -> plan feature. A refusal is returned as a Response. */
async function resolveWidget(c: Context<AppContext>): Promise<Resolved | Response> {
  const tenantId = await tenantForWidgetKey(c);
  if (!tenantId) return notFound(c);
  const db = await resolveTenantDb(c.env, tenantId);
  if (!db) return notFound(c);

  const config = await readWidgetConfig(db);
  if (!originAllowed(c.req.header('Origin'), config?.allowed_origins)) {
    return c.json({ success: false, error: 'This website is not allowed to use this chat widget' }, 403);
  }
  const refusal = await featureRefusal(c, tenantId);
  if (refusal) return refusal;
  return { tenantId, db, config: config ?? null };
}

publicChatbotRoutes.get('/:widgetKey/config', readLimit, async (c) => {
  const resolved = await resolveWidget(c);
  if (resolved instanceof Response) return resolved;
  const cfg = resolved.config;
  const captureConfig = await publicCaptureConfig(resolved.db, parseContactCapture(cfg?.contact_capture));
  return c.json({
    success: true,
    data: {
      enabled: !!cfg && !!cfg.enabled,
      greeting: cfg?.greeting ?? null,
      brandingColor: cfg?.branding_color ?? null,
      brandingLogo: cfg?.branding_logo ?? null,
      // Only present when the agency asked for it: with the setting off the answer is what it always was.
      ...(captureConfig ? { contactCapture: captureConfig } : {}),
    },
  });
});

/**
 * The visitor's contact details and consent. Same widget key, origin and plan checks as /messages; no AI. The details are stored on the
 * conversation (created here when the form comes before the first message); the agency's lead flow reads them from there.
 */
publicChatbotRoutes.post('/:widgetKey/contact', contactLimit, async (c) => {
  const declared = Number(c.req.header('Content-Length') || 0);
  if (declared > MAX_BODY_BYTES) return c.json({ success: false, error: 'Message too large' }, 413);
  const resolved = await resolveWidget(c);
  if (resolved instanceof Response) return resolved;
  const { db, tenantId, config } = resolved;
  if (!config || !config.enabled) return notFound(c);

  const capture = parseContactCapture(config.contact_capture);
  if (capture.mode === 'off') return c.json({ success: false, error: 'This chat does not ask for contact details' }, 400);

  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return c.json({ success: false, error: 'Message too large' }, 413);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return c.json({ success: false, error: 'Invalid input' }, 400);
  }
  const parsed = z
    .object({
      visitorId: z.string().min(1).max(100),
      conversationId: z.string().max(100).nullish(),
      name: z.string().max(500).nullish(),
      email: z.string().max(500).nullish(),
      phone: z.string().max(500).nullish(),
      consent: z.unknown(),
      marketingOptIn: z.boolean().nullish(),
    })
    .safeParse(json);
  if (!parsed.success) return c.json({ success: false, error: 'Invalid input' }, 400);
  const body = parsed.data;
  if (body.consent !== true) return c.json({ success: false, error: 'Consent is needed to share contact details' }, 400);

  const checked = validateCapturedDetails(capture, body, await tenantPhoneCountry(db));
  if (!checked.ok) return c.json({ success: false, error: checked.error, field: checked.field }, 400);
  const details = checked.details;
  const marketingOptIn = capture.marketingOptIn && body.marketingOptIn === true;
  const consentText = (await publicCaptureConfig(db, capture))?.consentText ?? '';

  const now = new Date().toISOString();
  let conversationId: string | null = null;
  if (body.conversationId) {
    const existing = await db
      .prepare('SELECT id FROM chatbot_conversations WHERE id = ? AND visitor_id = ?')
      .bind(body.conversationId, body.visitorId)
      .first<{ id: string }>();
    conversationId = existing?.id ?? null;
  }
  if (!conversationId) {
    conversationId = generateId();
    const messages = config.greeting ? [{ role: 'assistant', content: config.greeting, timestamp: now }] : [];
    await db
      .prepare(
        `INSERT INTO chatbot_conversations (id, channel, visitor_id, language, messages, status, message_count, bot_message_count)
         VALUES (?, ?, ?, 'en', ?, 'active', 0, ?)`,
      )
      .bind(conversationId, WIDGET_CHANNEL, body.visitorId, JSON.stringify(messages), messages.length)
      .run();
  }

  // A field left empty keeps what an earlier submission stored.
  await db
    .prepare(
      `UPDATE chatbot_conversations SET visitor_name = COALESCE(?, visitor_name), visitor_email = COALESCE(?, visitor_email),
         visitor_phone = COALESCE(?, visitor_phone), contact_consent_at = ?, contact_consent_text = ?, contact_marketing_opt_in = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(details.name, details.email, details.phone, now, consentText, marketingOptIn ? 1 : 0, now, conversationId)
    .run();

  const waiter = c.executionCtx;
  c.set('tenantDb', db);
  c.set('tenantId', tenantId);
  await emitContactCaptured(c.env, tenantId, db, conversationId, details, marketingOptIn, waiter);

  if (capture.autoCreateLead) await createLeadFromConversation(c.env, tenantId, db, conversationId, { userId: null, waiter });
  // Nothing about the agency's records goes back to the visitor, not even whether a lead exists.
  return c.json({ success: true, data: { conversationId, captured: true } });
});

publicChatbotRoutes.post('/:widgetKey/messages', messageLimit, async (c) => {
  const declared = Number(c.req.header('Content-Length') || 0);
  if (declared > MAX_BODY_BYTES) return c.json({ success: false, error: 'Message too large' }, 413);
  const resolved = await resolveWidget(c);
  if (resolved instanceof Response) return resolved;

  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return c.json({ success: false, error: 'Message too large' }, 413);
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return c.json({ success: false, error: 'Invalid input' }, 400);
  }
  if (typeof body?.message === 'string' && new TextEncoder().encode(body.message).length > MAX_MESSAGE_BYTES) {
    return c.json({ success: false, error: 'Message is longer than 2 KB' }, 413);
  }

  c.set('tenantDb', resolved.db);
  c.set('tenantId', resolved.tenantId);
  return handleChatbotMessage(c, WIDGET_CHANNEL, body);
});

publicChatbotRoutes.get('/:widgetKey/widget.js', readLimit, async (c) => {
  const tenantId = await tenantForWidgetKey(c);
  if (!tenantId) return c.text('/* chat widget not found */', 404, { 'Content-Type': 'application/javascript' });
  const base = (c.env.API_PUBLIC_URL?.trim() || new URL(c.req.url).origin).replace(/\/+$/, '');
  const api = `${base}/api/v1/public/chatbot/${widgetKeyOf(c)}`;
  return c.text(widgetScript(api), 200, {
    'Content-Type': 'application/javascript; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  });
});

function widgetScript(apiBase: string): string {
  return `
(function() {
  var API = ${JSON.stringify(apiBase)};
  var d = document, s = d.createElement('style'), b = d.createElement('div');
  s.textContent = '.cb-btn{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:28px;background:#4F46E5;color:#fff;border:none;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:9999;font-size:24px;display:flex;align-items:center;justify-content:center;transition:transform 0.2s}.cb-btn:hover{transform:scale(1.1)}.cb-win{position:fixed;bottom:84px;right:20px;width:380px;max-width:calc(100vw - 40px);height:520px;max-height:calc(100vh - 110px);background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.12);z-index:9998;display:none;flex-direction:column;overflow:hidden}.cb-win.open{display:flex}.cb-hdr{padding:16px;background:#4F46E5;color:#fff;font-weight:600;display:flex;justify-content:space-between;align-items:center}.cb-msgs{flex:1;overflow-y:auto;padding:12px}.cb-msg{margin:6px 0;padding:8px 12px;border-radius:12px;max-width:80%;word-wrap:break-word;font-size:14px}.cb-bot{background:#f0f0f0;margin-right:auto}.cb-usr{background:#4F46E5;color:#fff;margin-left:auto}.cb-inp{display:flex;padding:8px;border-top:1px solid #eee}.cb-inp input{flex:1;border:1px solid #ddd;border-radius:8px;padding:8px 12px;outline:none;font-size:14px}.cb-inp button{background:#4F46E5;color:#fff;border:none;border-radius:8px;padding:8px 16px;margin-left:8px;cursor:pointer}';
  s.textContent += '.cb-form{display:none;padding:12px;border-top:1px solid #eee;overflow-y:auto;max-height:75%;font-size:14px;color:#222}.cb-ask .cb-form{display:block}.cb-ask .cb-inp{display:none}.cb-form h3{margin:0 0 8px;font-size:15px}.cb-form label{display:block;margin:8px 0 2px;font-size:13px}.cb-form input[type=text],.cb-form input[type=email],.cb-form input[type=tel]{width:100%;box-sizing:border-box;border:1px solid #bbb;border-radius:8px;padding:8px 12px;font-size:16px}.cb-form .cb-chk{display:flex;gap:8px;align-items:flex-start;margin:10px 0 0}.cb-form .cb-chk input{margin-top:3px}.cb-form .cb-acts{display:flex;gap:8px;margin-top:12px}.cb-form button{border-radius:8px;padding:10px 16px;font-size:14px;cursor:pointer;border:1px solid #4F46E5}.cb-form .cb-go{background:#4F46E5;color:#fff}.cb-form .cb-no{background:#fff;color:#4F46E5}.cb-form .cb-err{color:#b00020;font-size:13px;margin-top:8px}.cb-btn:focus-visible,.cb-form button:focus-visible,.cb-form input:focus-visible,.cb-inp button:focus-visible{outline:2px solid #111;outline-offset:2px}@media(max-width:480px){.cb-win{left:10px;right:10px;width:auto;max-width:none;bottom:84px}}';
  d.head.appendChild(s);
  b.innerHTML = '<button class="cb-btn" onclick="toggleCB()" aria-label="Chat">\\uD83D\\uDCAC</button><div class="cb-win" id="cbWin"><div class="cb-hdr"><span>Chat with us</span><button onclick="toggleCB()" aria-label="Close" style="background:none;border:none;color:#fff;cursor:pointer;font-size:18px">\\u2715</button></div><div class="cb-msgs" id="cbMsgs"></div><div class="cb-form" id="cbForm"></div><div class="cb-inp"><input id="cbInp" maxlength="1000" placeholder="Type a message..." onkeypress="if(event.key===\\'Enter\\')sendCB()"><button onclick="sendCB()">Send</button></div></div>';
  d.body.appendChild(b);
  var vid = null;
  try { vid = localStorage.getItem('cb_vid'); } catch (e) {}
  if (!vid) { vid = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36); try { localStorage.setItem('cb_vid', vid); } catch (e) {} }
  var cid = null, greeted = false, cap = null, asked = false, replies = 0;
  function addMsg(t, cls) {
    var m = d.createElement('div');
    m.className = 'cb-msg cb-' + cls;
    m.textContent = t;
    var box = d.getElementById('cbMsgs');
    box.appendChild(m); box.scrollTop = box.scrollHeight;
  }

  // The contact-details form. Every string (the agency's wording included) goes in as text, never as markup.
  function el(tag, attrs, text) {
    var n = d.createElement(tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text) n.textContent = text;
    return n;
  }
  function closeForm() {
    asked = true;
    d.getElementById('cbWin').classList.remove('cb-ask');
    d.getElementById('cbForm').textContent = '';
    var inp = d.getElementById('cbInp'); if (inp) inp.focus();
  }
  function showForm() {
    if (!cap || asked) return;
    asked = true;
    var L = cap.labels, F = cap.fields, box = d.getElementById('cbForm');
    var needOne = cap.requireOneOf || [];
    var form = el('form', {novalidate: 'novalidate'});
    form.appendChild(el('h3', {id: 'cbFormTitle'}, L.title));
    form.setAttribute('aria-labelledby', 'cbFormTitle');
    var inputs = {};
    [['name', 'text', 'name'], ['email', 'email', 'email'], ['phone', 'tel', 'tel']].forEach(function(f) {
      if (F[f[0]] === 'hidden') return;
      var id = 'cbF_' + f[0];
      var must = F[f[0]] === 'required';
      form.appendChild(el('label', {'for': id}, L[f[0]] + (must ? ' *' : '')));
      var i = el('input', {id: id, type: f[1], autocomplete: f[2], maxlength: '200'});
      if (must) i.setAttribute('aria-required', 'true');
      inputs[f[0]] = i; form.appendChild(i);
    });
    var consent = el('input', {type: 'checkbox', id: 'cbF_consent'});
    var cl = el('label', {'class': 'cb-chk', 'for': 'cbF_consent'});
    cl.appendChild(consent); cl.appendChild(el('span', {}, cap.consentText));
    form.appendChild(cl);
    var mk = null;
    if (cap.marketingOptIn) {
      mk = el('input', {type: 'checkbox', id: 'cbF_mk'});
      var ml = el('label', {'class': 'cb-chk', 'for': 'cbF_mk'});
      ml.appendChild(mk); ml.appendChild(el('span', {}, L.marketing));
      form.appendChild(ml);
    }
    var err = el('div', {'class': 'cb-err', role: 'alert'});
    form.appendChild(err);
    var acts = el('div', {'class': 'cb-acts'});
    var go = el('button', {type: 'submit', 'class': 'cb-go'}, L.submit);
    acts.appendChild(go);
    var optional = needOne.length === 0 && F.name !== 'required' && F.email !== 'required' && F.phone !== 'required';
    if (optional) {
      var no = el('button', {type: 'button', 'class': 'cb-no'}, L.skip);
      no.addEventListener('click', closeForm);
      acts.appendChild(no);
    }
    form.appendChild(acts);
    form.addEventListener('submit', function(ev) {
      ev.preventDefault();
      err.textContent = '';
      if (!consent.checked) { err.textContent = L.error; consent.focus(); return; }
      go.disabled = true;
      var body = {visitorId: vid, conversationId: cid, consent: true, marketingOptIn: !!(mk && mk.checked)};
      for (var k in inputs) body[k] = inputs[k].value;
      fetch(API + '/contact', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})
        .then(function(r){return r.json()}).then(function(j){
          if (j && j.success && j.data) { cid = j.data.conversationId; closeForm(); }
          else { err.textContent = L.error; go.disabled = false; }
        }).catch(function(){ err.textContent = L.error; go.disabled = false; });
    });
    box.textContent = '';
    box.appendChild(form);
    d.getElementById('cbWin').classList.add('cb-ask');
    var first = form.querySelector('input'); if (first) first.focus();
  }
  function maybeAsk(data) {
    if (!cap || asked) return;
    if (cap.mode === 'after_first_reply' && replies >= 1) showForm();
    else if (cap.mode === 'before_handoff' && data && (data.suggestHandoff || data.handedOff)) showForm();
  }

  window.toggleCB = function() {
    d.getElementById('cbWin').classList.toggle('open');
    if (greeted) return;
    greeted = true;
    fetch(API + '/config').then(function(r){return r.json()}).then(function(j){
      if (j && j.data && j.data.greeting) addMsg(j.data.greeting, 'bot');
      if (j && j.data && j.data.contactCapture) {
        cap = j.data.contactCapture;
        if (cap.mode === 'before_chat') showForm();
      }
    }).catch(function(){});
  };
  window.sendCB = function() {
    var inp = d.getElementById('cbInp'), msg = inp.value.trim();
    if (!msg) return;
    addMsg(msg, 'usr'); inp.value = '';
    fetch(API + '/messages', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({visitorId: vid, message: msg, conversationId: cid})
    }).then(function(r){return r.json()}).then(function(j){
      if (j && j.data) {
        cid = j.data.conversationId;
        if (j.data.reply) { addMsg(j.data.reply, 'bot'); replies++; }
        maybeAsk(j.data);
      }
      else addMsg('Sorry, chat is not available right now.', 'bot');
    }).catch(function(){ addMsg('Sorry, connection error.', 'bot'); });
  };
})();`;
}

// ── Signed Twilio WhatsApp webhook ────────────────────────────

export const chatbotWebhookRoutes = new Hono<AppContext>();
chatbotWebhookRoutes.onError(aiAwareErrorHandler);

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response/>';

chatbotWebhookRoutes.post('/whatsapp', async (c) => {
  const signature = c.req.header('X-Twilio-Signature');
  const params = await formParams(c);
  if (!unsignedAllowed(c.env, signature)) {
    const token = c.env.TWILIO_AUTH_TOKEN;
    if (!signature || !token || !(await verifyTwilio(publicRequestUrl(c), params, token, signature))) {
      return c.json({ error: 'Invalid Twilio signature' }, 403);
    }
  }

  const from = (params.From || '').replace(/^whatsapp:/i, '');
  const text = params.Body || '';
  if (!from || !text) return c.text(EMPTY_TWIML, 200, { 'Content-Type': 'text/xml' });

  // The number the customer wrote to names the agency.
  const to = normalizePhone((params.To || '').replace(/^whatsapp:/i, ''));
  const owner = to
    ? await c.env.MASTER_DB
        .prepare("SELECT tenant_id FROM tenant_channel_addresses WHERE channel = 'whatsapp' AND address = ? AND is_active = 1 LIMIT 1")
        .bind(to)
        .first<{ tenant_id: string }>()
    : null;
  const db = owner ? await resolveTenantDb(c.env, owner.tenant_id) : null;
  // Always answer 2xx: the provider keeps redelivering anything else.
  if (!owner || !db) return c.text(EMPTY_TWIML, 200, { 'Content-Type': 'text/xml' });
  if (await featureRefusal(c, owner.tenant_id)) return c.text(EMPTY_TWIML, 200, { 'Content-Type': 'text/xml' });

  c.set('tenantDb', db);
  c.set('tenantId', owner.tenant_id);
  const response = await handleChatbotMessage(c, 'whatsapp', { visitorId: from, message: text.slice(0, 2000), visitorPhone: from });
  const result = (await response.json().catch(() => null)) as any;

  const reply: string | undefined = result?.data?.reply;
  // Replies go out from the platform Twilio account; never in test mode (no paid provider calls).
  if (reply && c.env.TWILIO_ACCOUNT_SID && !isTestMode(c.env)) {
    try {
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${c.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${c.env.TWILIO_ACCOUNT_SID}:${c.env.TWILIO_AUTH_TOKEN}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: `whatsapp:${from}`,
          From: params.To?.startsWith('whatsapp:') ? params.To : `whatsapp:${c.env.TWILIO_WHATSAPP_FROM_NUMBER || to}`,
          Body: reply,
        }).toString(),
      });
    } catch (e) {
      console.error('[chatbot] WhatsApp reply failed:', e);
    }
  }
  return c.text(EMPTY_TWIML, 200, { 'Content-Type': 'text/xml' });
});
