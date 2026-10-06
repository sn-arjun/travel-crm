/**
 * Chatbot Routes — M25 (TICKET-459 through TICKET-477)
 *
 * Website & WhatsApp chatbot with AI engine, qualification, handoff.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../types';
import { success, error } from '../utils/response';
import { generateId } from '../utils/uuid';
import { AIRouter } from '../services/ai-router';

import { aiAwareErrorHandler, aiUnavailableResponse } from '../utils/ai-unavailable';
import { AiUnavailableError } from '../services/ai-router';

const app = new Hono<AppContext>();
app.onError(aiAwareErrorHandler);

// ============================================================
// CHATBOT CONFIG (TICKET-459, 475)
// ============================================================

app.get('/config', async (c) => {
  const db = c.get('tenantDb');
  const channel = c.req.query('channel');
  let query = `SELECT * FROM chatbot_config`;
  const binds: any[] = [];
  if (channel) { query += ` WHERE channel = ?`; binds.push(channel); }
  query += ` ORDER BY channel`;
  const rows = await db.prepare(query).bind(...binds).all();
  return c.json({ success: true, data: rows.results || [] });
});

app.get('/config/:channel', async (c) => {
  const db = c.get('tenantDb');
  const { channel } = c.req.param();
  const row = await db.prepare(`SELECT * FROM chatbot_config WHERE channel = ?`).bind(channel).first();
  if (!row) return error(c, 'Config not found', 404);
  return c.json({ success: true, data: row });
});

app.put('/config/:channel', async (c) => {
  const db = c.get('tenantDb');
  const { channel } = c.req.param();
  const body = await c.req.json();

  const existing = await db.prepare(`SELECT id FROM chatbot_config WHERE channel = ?`).bind(channel).first();
  const now = new Date().toISOString();

  if (existing) {
    const updates: string[] = [];
    const vals: any[] = [];
    const fields = ['enabled', 'greeting', 'business_hours_start', 'business_hours_end', 'business_days', 'after_hours_message', 'qualification_questions', 'faq_entries', 'branding_color', 'branding_logo', 'max_auto_replies', 'handoff_threshold', 'system_prompt'];
    for (const f of fields) {
      const camelCase = f.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
      if (body[camelCase] !== undefined) {
        updates.push(`${f} = ?`);
        vals.push(typeof body[camelCase] === 'object' ? JSON.stringify(body[camelCase]) : body[camelCase]);
      }
    }
    if (updates.length > 0) {
      updates.push('updated_at = ?');
      vals.push(now);
      await db.prepare(`UPDATE chatbot_config SET ${updates.join(', ')} WHERE channel = ?`).bind(...vals, channel).run();
    }
    const row = await db.prepare(`SELECT * FROM chatbot_config WHERE channel = ?`).bind(channel).first();
    return c.json({ success: true, data: row });
  } else {
    const id = generateId();
    await db.prepare(`
      INSERT INTO chatbot_config (id, channel, enabled, greeting, business_hours_start, business_hours_end, business_days, after_hours_message, qualification_questions, faq_entries, branding_color, branding_logo, max_auto_replies, handoff_threshold, system_prompt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, channel,
      body.enabled ?? 1,
      body.greeting || null,
      body.businessHoursStart || null,
      body.businessHoursEnd || null,
      body.businessDays ? JSON.stringify(body.businessDays) : null,
      body.afterHoursMessage || null,
      body.qualificationQuestions ? JSON.stringify(body.qualificationQuestions) : null,
      body.faqEntries ? JSON.stringify(body.faqEntries) : null,
      body.brandingColor || null,
      body.brandingLogo || null,
      body.maxAutoReplies || 10,
      body.handoffThreshold || 5,
      body.systemPrompt || null,
    ).run();
    const row = await db.prepare(`SELECT * FROM chatbot_config WHERE id = ?`).bind(id).first();
    return c.json({ success: true, data: row }, 201);
  }
});

// ============================================================
// PUBLIC CHATBOT WEBHOOK (TICKET-460, 462, 469)
// ============================================================

app.post('/webhook/:channel', async (c) => {
  const db = c.get('tenantDb');
  const { channel } = c.req.param();
  const body = await c.req.json();

  const parsed = z.object({
    visitorId: z.string(),
    message: z.string().min(1).max(2000),
    visitorName: z.string().optional(),
    visitorEmail: z.string().email().optional(),
    visitorPhone: z.string().optional(),
    conversationId: z.string().optional(),
    language: z.string().optional(),
  }).safeParse(body);
  if (!parsed.success) return error(c, 'Invalid input', 400);

  const { visitorId, message, visitorName, visitorEmail, visitorPhone, conversationId, language } = parsed.data;
  const now = new Date().toISOString();

  // Load config
  const config = await db.prepare(`SELECT * FROM chatbot_config WHERE channel = ? AND enabled = 1`).bind(channel).first() as any;
  if (!config) return error(c, 'Chatbot not configured', 404);

  // Check business hours
  const isBusinessHours = checkBusinessHours(config);

  // Get or create conversation
  let convId = conversationId;
  let conv: any = null;
  let messages: any[] = [];

  if (convId) {
    conv = await db.prepare(`SELECT * FROM chatbot_conversations WHERE id = ? AND visitor_id = ?`).bind(convId, visitorId).first();
    if (conv) {
      try { messages = JSON.parse(conv.messages || '[]'); } catch { messages = []; }
    }
  }

  if (!conv) {
    convId = generateId();
    messages = [];
    if (config.greeting) {
      messages.push({ role: 'assistant', content: config.greeting, timestamp: now });
    }
    await db.prepare(`
      INSERT INTO chatbot_conversations (id, channel, visitor_id, visitor_name, visitor_email, visitor_phone, language, messages, status, message_count, bot_message_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?)
    `).bind(convId, channel, visitorId, visitorName || null, visitorEmail || null, visitorPhone || null, language || 'en', JSON.stringify(messages), config.greeting ? 1 : 0).run();
    conv = { status: 'active', message_count: 0 };
  }

  // If handed off, don't auto-respond
  if (conv.status === 'handed_off') {
    messages.push({ role: 'user', content: message, timestamp: now });
    await db.prepare(`UPDATE chatbot_conversations SET messages = ?, message_count = message_count + 1, human_message_count = human_message_count + 1, last_message_at = ?, updated_at = ? WHERE id = ?`)
      .bind(JSON.stringify(messages), now, now, convId).run();
    return c.json({ success: true, data: { conversationId: convId, reply: null, handedOff: true } });
  }

  // Add user message
  messages.push({ role: 'user', content: message, timestamp: now });

  // After-hours handling
  if (!isBusinessHours && config.after_hours_message) {
    const afterHoursReply = config.after_hours_message;
    messages.push({ role: 'assistant', content: afterHoursReply, timestamp: now });
    await db.prepare(`UPDATE chatbot_conversations SET messages = ?, message_count = message_count + 1, bot_message_count = bot_message_count + 1, last_message_at = ?, updated_at = ? WHERE id = ?`)
      .bind(JSON.stringify(messages), now, now, convId).run();
    return c.json({ success: true, data: { conversationId: convId, reply: afterHoursReply, afterHours: true } });
  }

  // Check FAQ first
  const faqEntries = config.faq_entries ? JSON.parse(config.faq_entries) : [];
  const faqMatch = faqEntries.find((faq: any) => message.toLowerCase().includes(faq.question?.toLowerCase() || ''));
  if (faqMatch) {
    messages.push({ role: 'assistant', content: faqMatch.answer, timestamp: now });
    await db.prepare(`UPDATE chatbot_conversations SET messages = ?, message_count = message_count + 1, bot_message_count = bot_message_count + 1, last_message_at = ?, updated_at = ? WHERE id = ?`)
      .bind(JSON.stringify(messages), now, now, convId).run();
    return c.json({ success: true, data: { conversationId: convId, reply: faqMatch.answer, source: 'faq' } });
  }

  // AI response
  try {
    const router = new AIRouter(c.env);
    const systemPrompt = config.system_prompt || `You are a helpful travel agency chatbot. Help visitors with travel inquiries. Be concise and helpful.
If the visitor seems interested in a specific destination or package, try to qualify them by asking about:
- Destination preferences
- Travel dates
- Number of travelers
- Budget range
Always be friendly and professional. If you can't help, suggest speaking with a human agent.`;

    const conversationContext = messages.slice(-10).map((m: any) => `${m.role === 'user' ? 'Visitor' : 'Bot'}: ${m.content}`).join('\n');

    const result = await router.route(
      'communication',
      `Conversation so far:\n${conversationContext}\n\nVisitor: ${message}`,
      systemPrompt,
    );

    const reply = result.result;
    messages.push({ role: 'assistant', content: reply, timestamp: now });

    // Check if handoff threshold reached
    const msgCount = (conv.message_count || 0) + 1;
    const shouldHandoff = msgCount >= (config.handoff_threshold || 5);

    await db.prepare(`
      UPDATE chatbot_conversations SET messages = ?, message_count = message_count + 1, bot_message_count = bot_message_count + 1, total_tokens = total_tokens + ?, total_cost = total_cost + ?, last_message_at = ?, updated_at = ? WHERE id = ?
    `).bind(JSON.stringify(messages), result.inputTokens + result.outputTokens, result.cost, now, now, convId).run();

    // Try to extract qualification data
    if (msgCount >= 3) {
      const qualResult = await router.route(
        'extraction',
        conversationContext + `\nVisitor: ${message}\nBot: ${reply}`,
        `Extract travel intent from this conversation. Return JSON or null if not enough info: { "destination": "...", "travelDates": "...", "travelers": number, "budget": "...", "tripType": "..." }`,
      );
      try {
        const qualData = JSON.parse(qualResult.result);
        if (qualData && qualData.destination) {
          await db.prepare(`UPDATE chatbot_conversations SET qualification_data = ? WHERE id = ?`).bind(JSON.stringify(qualData), convId).run();
        }
      } catch { /* ignore parsing failures */ }
    }

    return c.json({
      success: true,
      data: {
        conversationId: convId,
        reply,
        suggestHandoff: shouldHandoff,
        model: result.model,
        cost: result.cost,
      },
    });
  } catch (e: any) {
    if (e instanceof AiUnavailableError) return aiUnavailableResponse(c, e.message);
    return error(c, 'Chatbot error: ' + e.message, 500);
  }
});

// ============================================================
// CHATBOT CONVERSATIONS MANAGEMENT (TICKET-477)
// ============================================================

app.get('/conversations', async (c) => {
  const db = c.get('tenantDb');
  const channel = c.req.query('channel');
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');

  let where = `WHERE 1=1`;
  const binds: any[] = [];
  if (channel) { where += ` AND channel = ?`; binds.push(channel); }
  if (status) { where += ` AND status = ?`; binds.push(status); }

  const rows = await db.prepare(`
    SELECT id, channel, visitor_id, visitor_name, visitor_email, visitor_phone, language, status, assigned_user_id, lead_id, contact_id, sentiment, message_count, bot_message_count, human_message_count, total_cost, last_message_at, created_at
    FROM chatbot_conversations ${where} ORDER BY last_message_at DESC NULLS LAST, created_at DESC LIMIT ? OFFSET ?
  `).bind(...binds, limit, offset).all();

  const countRow = await db.prepare(`SELECT COUNT(*) as total FROM chatbot_conversations ${where}`).bind(...binds).first<{ total: number }>();

  return c.json({ success: true, data: rows.results || [], pagination: { total: countRow?.total || 0, limit, offset } });
});

app.get('/conversations/:id', async (c) => {
  const db = c.get('tenantDb');
  const { id } = c.req.param();
  const row = await db.prepare(`SELECT * FROM chatbot_conversations WHERE id = ?`).bind(id).first();
  if (!row) return error(c, 'Conversation not found', 404);
  return c.json({ success: true, data: row });
});

// Human agent reply
app.post('/conversations/:id/reply', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = z.object({ message: z.string().min(1) }).safeParse(body);
  if (!parsed.success) return error(c, 'Invalid input', 400);

  const conv = await db.prepare(`SELECT * FROM chatbot_conversations WHERE id = ?`).bind(id).first() as any;
  if (!conv) return error(c, 'Conversation not found', 404);

  const messages = JSON.parse(conv.messages || '[]');
  const now = new Date().toISOString();
  messages.push({ role: 'agent', content: parsed.data.message, timestamp: now, agentId: userId });

  await db.prepare(`UPDATE chatbot_conversations SET messages = ?, status = 'handed_off', assigned_user_id = ?, human_message_count = human_message_count + 1, last_message_at = ?, updated_at = ? WHERE id = ?`)
    .bind(JSON.stringify(messages), userId, now, now, id).run();

  return c.json({ success: true, data: { replied: true } });
});

// Handoff to human
app.post('/conversations/:id/handoff', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const { id } = c.req.param();
  const now = new Date().toISOString();

  await db.prepare(`UPDATE chatbot_conversations SET status = 'handed_off', assigned_user_id = ?, updated_at = ? WHERE id = ?`)
    .bind(userId, now, id).run();

  return c.json({ success: true, data: { handedOff: true, assignedTo: userId } });
});

// Close conversation
app.post('/conversations/:id/close', async (c) => {
  const db = c.get('tenantDb');
  const { id } = c.req.param();
  const now = new Date().toISOString();

  await db.prepare(`UPDATE chatbot_conversations SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = ?`)
    .bind(now, now, id).run();

  return c.json({ success: true, data: { closed: true } });
});

// Create lead from conversation
app.post('/conversations/:id/create-lead', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const { id } = c.req.param();

  const conv = await db.prepare(`SELECT * FROM chatbot_conversations WHERE id = ?`).bind(id).first() as any;
  if (!conv) return error(c, 'Conversation not found', 404);

  const qualData = conv.qualification_data ? JSON.parse(conv.qualification_data) : {};
  const leadId = generateId();
  const now = new Date().toISOString();

  await db.prepare(`
    INSERT INTO leads (id, title, status, source, destination, pax_count, estimated_value, contact_id, assignee_id, created_at, updated_at)
    VALUES (?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    leadId,
    `${conv.channel} Inquiry — ${qualData.destination || conv.visitor_name || 'Visitor'}`,
    `chatbot_${conv.channel}`,
    qualData.destination || null,
    qualData.travelers || null,
    qualData.budget ? parseFloat(qualData.budget) || null : null,
    conv.contact_id || null,
    userId,
    now, now,
  ).run();

  await db.prepare(`UPDATE chatbot_conversations SET lead_id = ?, status = 'qualified', updated_at = ? WHERE id = ?`)
    .bind(leadId, now, id).run();

  return c.json({ success: true, data: { leadId } });
});

// Chatbot analytics (TICKET-476)
app.get('/analytics', async (c) => {
  const db = c.get('tenantDb');
  const period = c.req.query('period') || '30d';
  const days = parseInt(period.replace('d', '')) || 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const totalConvs = await db.prepare(`SELECT COUNT(*) as count FROM chatbot_conversations WHERE created_at >= ?`).bind(since).first<{ count: number }>();
  const byChannel = await db.prepare(`SELECT channel, COUNT(*) as count FROM chatbot_conversations WHERE created_at >= ? GROUP BY channel`).bind(since).all();
  const byStatus = await db.prepare(`SELECT status, COUNT(*) as count FROM chatbot_conversations WHERE created_at >= ? GROUP BY status`).bind(since).all();
  const handoffs = await db.prepare(`SELECT COUNT(*) as count FROM chatbot_conversations WHERE status = 'handed_off' AND created_at >= ?`).bind(since).first<{ count: number }>();
  const qualified = await db.prepare(`SELECT COUNT(*) as count FROM chatbot_conversations WHERE status = 'qualified' AND created_at >= ?`).bind(since).first<{ count: number }>();
  const avgMessages = await db.prepare(`SELECT AVG(message_count) as avg FROM chatbot_conversations WHERE created_at >= ?`).bind(since).first<{ avg: number }>();
  const totalCost = await db.prepare(`SELECT COALESCE(SUM(total_cost), 0) as total FROM chatbot_conversations WHERE created_at >= ?`).bind(since).first<{ total: number }>();

  return c.json({
    success: true,
    data: {
      totalConversations: totalConvs?.count || 0,
      byChannel: byChannel.results || [],
      byStatus: byStatus.results || [],
      handoffCount: handoffs?.count || 0,
      qualifiedCount: qualified?.count || 0,
      avgMessagesPerConversation: Math.round(avgMessages?.avg || 0),
      totalAiCost: totalCost?.total || 0,
      handoffRate: totalConvs?.count ? ((handoffs?.count || 0) / totalConvs.count * 100).toFixed(1) : '0.0',
    },
  });
});

// ============================================================
// WHATSAPP WEBHOOK (TICKET-469–474)
// ============================================================

// Twilio WhatsApp incoming webhook
app.post('/whatsapp/incoming', async (c) => {
  const db = c.get('tenantDb');
  const body = await c.req.parseBody();

  const from = (body['From'] as string || '').replace('whatsapp:', '');
  const messageBody = body['Body'] as string || '';
  const messageSid = body['MessageSid'] as string || '';

  if (!from || !messageBody) return c.text('OK');

  // Route through the chatbot webhook handler
  const webhookUrl = new URL(c.req.url);
  webhookUrl.pathname = webhookUrl.pathname.replace('/whatsapp/incoming', '/webhook/whatsapp');

  const response = await app.fetch(new Request(webhookUrl.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...Object.fromEntries(c.req.raw.headers.entries()) },
    body: JSON.stringify({
      visitorId: from,
      message: messageBody,
      visitorPhone: from,
    }),
  }), c.env);

  const result = await response.json() as any;

  // Send reply via Twilio
  if (result.data?.reply && c.env.TWILIO_ACCOUNT_SID) {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${c.env.TWILIO_ACCOUNT_SID}/Messages.json`;
    const twilioBody = new URLSearchParams({
      To: `whatsapp:${from}`,
      From: `whatsapp:${c.env.TWILIO_WHATSAPP_FROM_NUMBER || ''}`,
      Body: result.data.reply,
    });

    await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${c.env.TWILIO_ACCOUNT_SID}:${c.env.TWILIO_AUTH_TOKEN}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: twilioBody.toString(),
    });
  }

  return c.text('OK');
});

// ============================================================
// WIDGET EMBED SCRIPT (TICKET-462)
// ============================================================

app.get('/widget.js', async (c) => {
  const tenantId = c.get('tenantId');
  const baseUrl = new URL(c.req.url).origin;

  const script = `
(function() {
  var d = document, s = d.createElement('style'), b = d.createElement('div');
  s.textContent = '.cb-btn{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:28px;background:#4F46E5;color:#fff;border:none;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:9999;font-size:24px;display:flex;align-items:center;justify-content:center;transition:transform 0.2s}.cb-btn:hover{transform:scale(1.1)}.cb-win{position:fixed;bottom:84px;right:20px;width:380px;height:520px;background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.12);z-index:9998;display:none;flex-direction:column;overflow:hidden}.cb-win.open{display:flex}.cb-hdr{padding:16px;background:#4F46E5;color:#fff;font-weight:600;display:flex;justify-content:space-between;align-items:center}.cb-msgs{flex:1;overflow-y:auto;padding:12px}.cb-msg{margin:6px 0;padding:8px 12px;border-radius:12px;max-width:80%;word-wrap:break-word;font-size:14px}.cb-bot{background:#f0f0f0;margin-right:auto}.cb-usr{background:#4F46E5;color:#fff;margin-left:auto}.cb-inp{display:flex;padding:8px;border-top:1px solid #eee}.cb-inp input{flex:1;border:1px solid #ddd;border-radius:8px;padding:8px 12px;outline:none;font-size:14px}.cb-inp button{background:#4F46E5;color:#fff;border:none;border-radius:8px;padding:8px 16px;margin-left:8px;cursor:pointer}';
  d.head.appendChild(s);
  b.innerHTML = '<button class="cb-btn" onclick="toggleCB()">💬</button><div class="cb-win" id="cbWin"><div class="cb-hdr"><span>Chat with us</span><button onclick="toggleCB()" style="background:none;border:none;color:#fff;cursor:pointer;font-size:18px">✕</button></div><div class="cb-msgs" id="cbMsgs"></div><div class="cb-inp"><input id="cbInp" placeholder="Type a message..." onkeypress="if(event.key===\\'Enter\\')sendCB()"><button onclick="sendCB()">Send</button></div></div>';
  d.body.appendChild(b);
  var vid = localStorage.getItem('cb_vid') || ('v_' + Math.random().toString(36).substr(2));
  localStorage.setItem('cb_vid', vid);
  var cid = null;
  window.toggleCB = function() { d.getElementById('cbWin').classList.toggle('open'); };
  window.sendCB = function() {
    var inp = d.getElementById('cbInp'), msg = inp.value.trim();
    if (!msg) return;
    addMsg(msg, 'usr'); inp.value = '';
    fetch('${baseUrl}/api/v1/chatbot/webhook/website', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({visitorId: vid, message: msg, conversationId: cid})
    }).then(function(r){return r.json()}).then(function(d){
      if(d.data){cid=d.data.conversationId;if(d.data.reply)addMsg(d.data.reply,'bot');}
    }).catch(function(){addMsg('Sorry, connection error.','bot');});
  };
  function addMsg(t, cls) {
    var m = d.createElement('div');
    m.className = 'cb-msg cb-' + cls;
    m.textContent = t;
    var c = d.getElementById('cbMsgs');
    c.appendChild(m); c.scrollTop = c.scrollHeight;
  }
})();`;

  return c.text(script, 200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=3600' });
});

// ============================================================
// HELPERS
// ============================================================

function checkBusinessHours(config: any): boolean {
  if (!config.business_hours_start || !config.business_hours_end) return true;
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon...
  const businessDays: number[] = config.business_days ? JSON.parse(config.business_days) : [1, 2, 3, 4, 5];
  if (!businessDays.includes(day)) return false;

  const [startH, startM] = config.business_hours_start.split(':').map(Number);
  const [endH, endM] = config.business_hours_end.split(':').map(Number);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

export default app;
