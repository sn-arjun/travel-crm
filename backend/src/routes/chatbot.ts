/**
 * Chatbot Routes — M25 (TICKET-459 through TICKET-477)
 *
 * Website & WhatsApp chatbot with AI engine, qualification, handoff.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../types';
import { success, error } from '../utils/response';
import { generateId } from '../utils/uuid';
import { normalizePhone, phoneLookupVariants, inPlaceholders } from '../utils/phone';
import { AIRouter } from '../services/ai-router';

import { aiAwareErrorHandler, aiUnavailableResponse } from '../utils/ai-unavailable';
import { AiUnavailableError } from '../services/ai-router';
import { getTenantTimeZone, localClock } from '../utils/tz';

const app = new Hono<AppContext>();
app.onError(aiAwareErrorHandler);

// ============================================================
// CHATBOT CONFIG (TICKET-459, 475)
// ============================================================

/** Random, unguessable, URL-safe key the website widget uses to name its agency. */
function newWidgetKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return 'wk_' + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * The agency's widget key: master tenant_channel_addresses (channel 'widget', address = key) maps it to exactly
 * one tenant. Created on first use; a key is never reassigned.
 */
export async function ensureWidgetKey(masterDb: D1Database, tenantId: string): Promise<string> {
  const existing = await masterDb
    .prepare("SELECT address FROM tenant_channel_addresses WHERE tenant_id = ? AND channel = 'widget' AND is_active = 1 ORDER BY created_at LIMIT 1")
    .bind(tenantId)
    .first<{ address: string }>();
  if (existing) return existing.address;
  const key = newWidgetKey();
  await masterDb
    .prepare("INSERT INTO tenant_channel_addresses (id, tenant_id, channel, address, provider, label) VALUES (?, ?, 'widget', ?, NULL, 'Website chat widget')")
    .bind(generateId(), tenantId, key)
    .run();
  // A concurrent request may have inserted first; read back whichever key won.
  const winner = await masterDb
    .prepare("SELECT address FROM tenant_channel_addresses WHERE tenant_id = ? AND channel = 'widget' AND is_active = 1 ORDER BY created_at, id LIMIT 1")
    .bind(tenantId)
    .first<{ address: string }>();
  return winner?.address ?? key;
}

// The embed snippet for the agency's website (the desktop settings page shows it).
app.get('/widget', async (c) => {
  const db = c.get('tenantDb');
  const widgetKey = await ensureWidgetKey(c.env.MASTER_DB, c.get('tenantId'));
  const base = (c.env.API_PUBLIC_URL?.trim() || new URL(c.req.url).origin).replace(/\/+$/, '');
  const scriptUrl = `${base}/api/v1/public/chatbot/${widgetKey}/widget.js`;
  const cfg = await db.prepare("SELECT allowed_origins FROM chatbot_config WHERE channel = 'website'").first<{ allowed_origins: string | null }>();
  let allowedOrigins: string[] = [];
  try { allowedOrigins = cfg?.allowed_origins ? JSON.parse(cfg.allowed_origins) : []; } catch { allowedOrigins = []; }
  return c.json({
    success: true,
    data: { widgetKey, scriptUrl, snippet: `<script async src="${scriptUrl}"></script>`, allowedOrigins },
  });
});

app.get('/config', async (c) => {
  const db = c.get('tenantDb');
  // Turning the chatbot settings on is when the agency gets its widget key.
  await ensureWidgetKey(c.env.MASTER_DB, c.get('tenantId')).catch((e) => console.error('widget key', e));
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
    const fields = ['enabled', 'greeting', 'business_hours_start', 'business_hours_end', 'business_days', 'after_hours_message', 'qualification_questions', 'faq_entries', 'branding_color', 'branding_logo', 'max_auto_replies', 'handoff_threshold', 'system_prompt', 'allowed_origins'];
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
      INSERT INTO chatbot_config (id, channel, enabled, greeting, business_hours_start, business_hours_end, business_days, after_hours_message, qualification_questions, faq_entries, branding_color, branding_logo, max_auto_replies, handoff_threshold, system_prompt, allowed_origins)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      body.allowedOrigins ? JSON.stringify(body.allowedOrigins) : null,
    ).run();
    const row = await db.prepare(`SELECT * FROM chatbot_config WHERE id = ?`).bind(id).first();
    return c.json({ success: true, data: row }, 201);
  }
});

// ============================================================
// PUBLIC CHATBOT WEBHOOK (TICKET-460, 462, 469)
// ============================================================

/**
 * One visitor message in, one reply out. Shared by the public widget mount (public-chatbot.ts) and the
 * signed WhatsApp webhook; the caller resolves the tenant and sets `tenantDb` / `tenantId` on the context.
 */
export async function handleChatbotMessage(c: Context<AppContext>, channel: string, body: unknown): Promise<Response> {
  const db = c.get('tenantDb');

  const parsed = z.object({
    visitorId: z.string().min(1).max(100),
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
  const isBusinessHours = checkBusinessHours(config, await getTenantTimeZone(db));

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
    const router = new AIRouter(c.env, undefined, c.get('tenantId'));
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
      },
    });
  } catch (e: any) {
    if (e instanceof AiUnavailableError) return aiUnavailableResponse(c, e.message);
    return error(c, 'Chatbot error: ' + e.message, 500);
  }
}

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

  // Idempotent: a conversation yields at most one lead.
  if (conv.lead_id) {
    return c.json({ success: true, data: { leadId: conv.lead_id, contactId: conv.contact_id ?? null, created: false } });
  }

  let qualData: Record<string, unknown> = {};
  try {
    qualData = conv.qualification_data ? JSON.parse(conv.qualification_data) : {};
  } catch {
    qualData = {};
  }
  const now = new Date().toISOString();

  // A lead always belongs to a contact: use the linked one, else match the visitor by
  // phone or email, else create a contact from what the visitor told us.
  const visitorName = typeof conv.visitor_name === 'string' ? conv.visitor_name.trim() : '';
  const visitorEmail = typeof conv.visitor_email === 'string' ? conv.visitor_email.trim().toLowerCase() : '';
  const visitorPhone = typeof conv.visitor_phone === 'string' ? normalizePhone(conv.visitor_phone) : '';

  let contactId: string | null = conv.contact_id || null;
  if (!contactId && visitorPhone) {
    const variants = phoneLookupVariants(visitorPhone);
    const match = await db
      .prepare(`SELECT id FROM contacts WHERE COALESCE(is_deleted, 0) = 0 AND phone IN (${inPlaceholders(variants)}) LIMIT 1`)
      .bind(...variants)
      .first<{ id: string }>();
    contactId = match?.id ?? null;
  }
  if (!contactId && visitorEmail) {
    const match = await db
      .prepare(`SELECT id FROM contacts WHERE COALESCE(is_deleted, 0) = 0 AND lower(email) = ? LIMIT 1`)
      .bind(visitorEmail)
      .first<{ id: string }>();
    contactId = match?.id ?? null;
  }
  if (!contactId) {
    if (!visitorName && !visitorPhone && !visitorEmail) {
      return error(c, "Add the visitor's name, phone or email before creating a lead", 400);
    }
    contactId = generateId();
    await db
      .prepare(
        `INSERT INTO contacts (id, name, email, phone, type, source, tags, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'customer', ?, '[]', ?, ?, ?)`,
      )
      .bind(
        contactId,
        visitorName || visitorPhone || visitorEmail,
        visitorEmail || null,
        visitorPhone || null,
        conv.channel === 'whatsapp' ? 'whatsapp' : 'website',
        userId,
        now,
        now,
      )
      .run();
  }

  const destination = typeof qualData.destination === 'string' ? qualData.destination.trim() : '';
  const travelers = Number(qualData.travelers);
  const budget = qualData.budget != null ? parseFloat(String(qualData.budget).replace(/[^0-9.]/g, '')) : NaN;
  const channelLabel = conv.channel === 'whatsapp' ? 'WhatsApp' : 'Website';

  const leadId = generateId();
  await db
    .prepare(
      `INSERT INTO leads (id, contact_id, title, destination, pax_adults, budget, source, status, priority,
                          assigned_to, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'new', 'warm', ?, ?, ?, ?, ?)`,
    )
    .bind(
      leadId,
      contactId,
      `${channelLabel} enquiry: ${destination || visitorName || 'new visitor'}`,
      JSON.stringify(destination ? [destination] : []),
      Number.isFinite(travelers) && travelers > 0 ? Math.round(travelers) : 1,
      Number.isFinite(budget) && budget > 0 ? budget : null,
      conv.channel === 'whatsapp' ? 'whatsapp' : 'website',
      userId,
      `Created from a ${channelLabel} chatbot conversation.`,
      userId,
      now,
      now,
    )
    .run();

  await db
    .prepare(`UPDATE chatbot_conversations SET lead_id = ?, contact_id = ?, status = 'qualified', updated_at = ? WHERE id = ?`)
    .bind(leadId, contactId, now, id)
    .run();

  return c.json({ success: true, data: { leadId, contactId, created: true } }, 201);
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
// HELPERS
// ============================================================

export function checkBusinessHours(config: any, timeZone: string, now: Date = new Date()): boolean {
  if (!config.business_hours_start || !config.business_hours_end) return true;
  // business hours are the tenant's local wall-clock hours, not the server's (UTC)
  const clock = localClock(timeZone, now);
  const day = clock.dow; // 0=Sun, 1=Mon...
  const businessDays: number[] = config.business_days ? JSON.parse(config.business_days) : [1, 2, 3, 4, 5];
  if (!businessDays.includes(day)) return false;

  const [startH, startM] = config.business_hours_start.split(':').map(Number);
  const [endH, endM] = config.business_hours_end.split(':').map(Number);
  const currentMinutes = clock.hour * 60 + clock.minute;
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

export default app;
