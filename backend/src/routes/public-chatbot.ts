/**
 * Public chatbot surface (no staff login).
 *
 *   /api/v1/public/chatbot/:widgetKey/widget.js   the embeddable script
 *   /api/v1/public/chatbot/:widgetKey/config      greeting + branding for the widget
 *   /api/v1/public/chatbot/:widgetKey/messages    one visitor message in, one reply out
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
import { handleChatbotMessage } from './chatbot';
import { aiAwareErrorHandler } from '../utils/ai-unavailable';
import { rateLimit } from '../middleware/rate-limit';
import { requireFeature } from '../middleware/feature-gate';
import { formParams, publicRequestUrl, unsignedAllowed, verifyTwilio } from '../middleware/provider-signature';
import { resolveTenantDb } from '../services/tenant-db';
import { normalizePhone } from '../utils/phone';
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

type WidgetConfig = { enabled: number; greeting: string | null; branding_color: string | null; branding_logo: string | null; allowed_origins: string | null };

/**
 * The Website bot tab saves to channel 'website'. Older agencies saved the same settings to
 * 'web' (a name the widget never read), so 'web' is the fallback: per field, 'website' wins and
 * 'web' fills what 'website' leaves empty. A 'website' row that only holds the allowed websites
 * (no greeting or colours yet) does not decide `enabled`; the legacy 'web' row does.
 */
export async function readWidgetConfig(db: D1Database): Promise<WidgetConfig | null> {
  const { results } = await db
    .prepare("SELECT channel, enabled, greeting, branding_color, branding_logo, allowed_origins FROM chatbot_config WHERE channel IN (?, 'web')")
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
  };
}

interface Resolved {
  tenantId: string;
  db: D1Database;
  config: { enabled: number; greeting: string | null; branding_color: string | null; branding_logo: string | null; allowed_origins: string | null } | null;
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
  return c.json({
    success: true,
    data: {
      enabled: !!cfg && !!cfg.enabled,
      greeting: cfg?.greeting ?? null,
      brandingColor: cfg?.branding_color ?? null,
      brandingLogo: cfg?.branding_logo ?? null,
    },
  });
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
  d.head.appendChild(s);
  b.innerHTML = '<button class="cb-btn" onclick="toggleCB()">\\uD83D\\uDCAC</button><div class="cb-win" id="cbWin"><div class="cb-hdr"><span>Chat with us</span><button onclick="toggleCB()" style="background:none;border:none;color:#fff;cursor:pointer;font-size:18px">\\u2715</button></div><div class="cb-msgs" id="cbMsgs"></div><div class="cb-inp"><input id="cbInp" maxlength="1000" placeholder="Type a message..." onkeypress="if(event.key===\\'Enter\\')sendCB()"><button onclick="sendCB()">Send</button></div></div>';
  d.body.appendChild(b);
  var vid = null;
  try { vid = localStorage.getItem('cb_vid'); } catch (e) {}
  if (!vid) { vid = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36); try { localStorage.setItem('cb_vid', vid); } catch (e) {} }
  var cid = null, greeted = false;
  function addMsg(t, cls) {
    var m = d.createElement('div');
    m.className = 'cb-msg cb-' + cls;
    m.textContent = t;
    var box = d.getElementById('cbMsgs');
    box.appendChild(m); box.scrollTop = box.scrollHeight;
  }
  window.toggleCB = function() {
    d.getElementById('cbWin').classList.toggle('open');
    if (greeted) return;
    greeted = true;
    fetch(API + '/config').then(function(r){return r.json()}).then(function(j){
      if (j && j.data && j.data.greeting) addMsg(j.data.greeting, 'bot');
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
      if (j && j.data) { cid = j.data.conversationId; if (j.data.reply) addMsg(j.data.reply, 'bot'); }
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
