/**
 * AI Assistant Routes — TICKET-412 to TICKET-438
 *
 * Conversations, NL lead creation, itinerary generation,
 * invoice generation, communication composer, semantic search.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { AppContext } from '../types';
import { success, error, notFound, paginated } from '../utils/response';
import { generateId } from '../utils/uuid';
import { AIRouter } from '../services/ai-router';
import { incrementUsage } from '../middleware/usage-cap';

const aiRoutes = new Hono<AppContext>();

// ═══════════════════════════════════════════════════════════
// CONVERSATIONS (TICKET-412)
// ═══════════════════════════════════════════════════════════

// ── GET /conversations ──────────────────────────────────

aiRoutes.get('/conversations', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const url = new URL(c.req.url);

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;
  const feature = url.searchParams.get('feature');

  const conditions = ['user_id = ?'];
  const values: (string | number)[] = [userId];
  if (feature) { conditions.push('feature = ?'); values.push(feature); }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const countResult = await db.prepare(
    `SELECT COUNT(*) as total FROM ai_conversations ${where}`
  ).bind(...values).first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const rows = await db.prepare(`
    SELECT id, title, feature, entity_type, entity_id, model_used, is_active,
           total_input_tokens, total_output_tokens, total_cost,
           created_at, updated_at
    FROM ai_conversations ${where}
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `).bind(...values, limit, offset).all();

  return c.json({
    success: true,
    data: (rows.results || []).map((r: any) => ({
      id: r.id,
      title: r.title,
      feature: r.feature,
      entityType: r.entity_type,
      entityId: r.entity_id,
      modelUsed: r.model_used,
      isActive: !!r.is_active,
      totalInputTokens: r.total_input_tokens,
      totalOutputTokens: r.total_output_tokens,
      totalCost: r.total_cost,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  });
});

// ── GET /conversations/:id ─────────────────────────────

aiRoutes.get('/conversations/:id', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const id = c.req.param('id');

  const row = await db.prepare(
    'SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?'
  ).bind(id, userId).first<Record<string, any>>();

  if (!row) return notFound(c, 'Conversation');

  return success(c, {
    id: row.id,
    title: row.title,
    feature: row.feature,
    entityType: row.entity_type,
    entityId: row.entity_id,
    messages: JSON.parse(row.messages || '[]'),
    modelUsed: row.model_used,
    isActive: !!row.is_active,
    totalInputTokens: row.total_input_tokens,
    totalOutputTokens: row.total_output_tokens,
    totalCost: row.total_cost,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
});

// ── DELETE /conversations/:id ──────────────────────────

aiRoutes.delete('/conversations/:id', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const id = c.req.param('id');

  await db.prepare(
    'DELETE FROM ai_conversations WHERE id = ? AND user_id = ?'
  ).bind(id, userId).run();

  return success(c, { message: 'Conversation deleted' });
});

// ═══════════════════════════════════════════════════════════
// NL LEAD CREATION (TICKET-414–420)
// ═══════════════════════════════════════════════════════════

const extractLeadSchema = z.object({
  text: z.string().min(1),
  source: z.string().optional(), // freeform, whatsapp, email, voice, bulk
});

aiRoutes.post('/extract-lead', zValidator('json', extractLeadSchema), async (c) => {
  const db = c.get('tenantDb');
  const env = c.env;
  const userId = c.get('userId');
  const { text, source } = c.req.valid('json');

  const startTime = Date.now();
  const router = new AIRouter(env);

  const systemPrompt = `You are a travel CRM assistant that extracts lead data from text.
Extract the following fields from the input text and return as JSON:
{
  "name": "customer name if found",
  "phone": "phone number if found",
  "email": "email if found",
  "destination": "travel destination",
  "travelDates": {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "flexible": true/false},
  "paxCount": number_of_travelers,
  "paxDetails": [{"type": "adult/child/infant", "count": N}],
  "budget": number_or_null,
  "budgetCurrency": "INR/USD/etc",
  "tripType": "honeymoon/family/adventure/business/pilgrimage/group/solo",
  "preferences": ["preference1", "preference2"],
  "hotelPreference": "budget/mid-range/luxury",
  "mealPreference": "vegetarian/non-vegetarian/halal/any",
  "specialRequests": "any special requests",
  "notes": "any additional context",
  "confidence": 0.0_to_1.0
}
Only include fields you can confidently extract. Set others to null.`;

  const result = await router.route('extraction', text, systemPrompt);
  const durationMs = Date.now() - startTime;

  let extracted: any = {};
  try {
    const jsonMatch = result.result.match(/\{[\s\S]*\}/);
    if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
  } catch {
    extracted = { error: 'Failed to parse', raw: result.result };
  }

  // Save as generated content
  const contentId = generateId();
  await db.prepare(`
    INSERT INTO ai_generated_content (id, user_id, content_type, prompt, raw_output, structured_output, status, model_used, input_tokens, output_tokens, cost_estimate, duration_ms)
    VALUES (?, ?, 'lead_extraction', ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
  `).bind(
    contentId, userId, text, result.result, JSON.stringify(extracted),
    result.model, result.inputTokens, result.outputTokens, result.cost, durationMs,
  ).run();

  await router.logUsage(db, 'lead_extraction', result.model, result.inputTokens, result.outputTokens, result.cost, undefined, durationMs);

  await incrementUsage(env.MASTER_DB, c.get('tenantId'), 'ai_actions_per_day');

  return success(c, {
    contentId,
    extracted,
    source: source || 'freeform',
    model: result.model,
    provider: result.provider,
    cost: result.cost,
  });
});

// ── Parse WhatsApp message (TICKET-416) ──────────────────

aiRoutes.post('/parse-whatsapp', zValidator('json', z.object({ message: z.string().min(1) })), async (c) => {
  const db = c.get('tenantDb');
  const env = c.env;
  const userId = c.get('userId');
  const { message } = c.req.valid('json');

  const startTime = Date.now();
  const router = new AIRouter(env);

  const systemPrompt = `You are a travel CRM assistant. Parse this forwarded WhatsApp message and extract travel inquiry data.
The message may contain customer name, phone, destination, dates, budget, and preferences.
Return as JSON with the same schema as a lead extraction. Handle forwarded message headers like "[11/3/24, 2:30 PM] John: ...".`;

  const result = await router.route('extraction', message, systemPrompt);
  const durationMs = Date.now() - startTime;

  let extracted: any = {};
  try {
    const jsonMatch = result.result.match(/\{[\s\S]*\}/);
    if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
  } catch {
    extracted = { error: 'Failed to parse', raw: result.result };
  }

  const contentId = generateId();
  await db.prepare(`
    INSERT INTO ai_generated_content (id, user_id, content_type, prompt, raw_output, structured_output, status, model_used, input_tokens, output_tokens, cost_estimate, duration_ms)
    VALUES (?, ?, 'lead_extraction', ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
  `).bind(
    contentId, userId, message, result.result, JSON.stringify(extracted),
    result.model, result.inputTokens, result.outputTokens, result.cost, durationMs,
  ).run();

  await router.logUsage(db, 'whatsapp_parse', result.model, result.inputTokens, result.outputTokens, result.cost, undefined, durationMs);

  await incrementUsage(env.MASTER_DB, c.get('tenantId'), 'ai_actions_per_day');

  return success(c, { contentId, extracted, source: 'whatsapp', model: result.model, provider: result.provider, cost: result.cost });
});

// ── Parse email (TICKET-417) ─────────────────────────────

aiRoutes.post('/parse-email', zValidator('json', z.object({ email: z.string().min(1), subject: z.string().optional() })), async (c) => {
  const db = c.get('tenantDb');
  const env = c.env;
  const userId = c.get('userId');
  const { email, subject } = c.req.valid('json');

  const startTime = Date.now();
  const router = new AIRouter(env);

  const input = subject ? `Subject: ${subject}\n\n${email}` : email;

  const systemPrompt = `You are a travel CRM assistant. Parse this email and extract travel inquiry data.
Return as JSON with: name, phone, email, destination, travelDates, paxCount, budget, tripType, preferences, specialRequests, confidence.`;

  const result = await router.route('extraction', input, systemPrompt);
  const durationMs = Date.now() - startTime;

  let extracted: any = {};
  try {
    const jsonMatch = result.result.match(/\{[\s\S]*\}/);
    if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
  } catch {
    extracted = { error: 'Failed to parse', raw: result.result };
  }

  const contentId = generateId();
  await db.prepare(`
    INSERT INTO ai_generated_content (id, user_id, content_type, prompt, raw_output, structured_output, status, model_used, input_tokens, output_tokens, cost_estimate, duration_ms)
    VALUES (?, ?, 'lead_extraction', ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
  `).bind(
    contentId, userId, input, result.result, JSON.stringify(extracted),
    result.model, result.inputTokens, result.outputTokens, result.cost, durationMs,
  ).run();

  await router.logUsage(db, 'email_parse', result.model, result.inputTokens, result.outputTokens, result.cost, undefined, durationMs);

  await incrementUsage(env.MASTER_DB, c.get('tenantId'), 'ai_actions_per_day');

  return success(c, { contentId, extracted, source: 'email', model: result.model, provider: result.provider, cost: result.cost });
});

// ── Business card OCR (TICKET-418) — requires base64 image ───

aiRoutes.post('/scan-business-card', zValidator('json', z.object({
  image: z.string().min(1), // base64 encoded image
  mimeType: z.string().default('image/jpeg'),
})), async (c) => {
  const db = c.get('tenantDb');
  const env = c.env;
  const userId = c.get('userId');
  const tenantId = c.get('tenantId');
  const { image, mimeType } = c.req.valid('json');

  const startTime = Date.now();
  const router = new AIRouter(env);

  const textPrompt = `Extract contact information from this business card. Return as JSON:
{
  "name": "full name",
  "company": "company name",
  "title": "job title",
  "phone": "phone number",
  "email": "email address",
  "website": "website",
  "address": "full address",
  "confidence": 0.0_to_1.0
}`;

  const result = await router.routeVision('business_card_ocr', image, mimeType, textPrompt);
  const durationMs = Date.now() - startTime;

  let extracted: any = {};
  try {
    const jsonMatch = result.result.match(/\{[\s\S]*\}/);
    if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
  } catch {
    extracted = { error: 'Failed to parse', raw: result.result };
  }

  const contentId = generateId();
  await db.prepare(`
    INSERT INTO ai_generated_content (id, user_id, content_type, prompt, raw_output, structured_output, status, model_used, input_tokens, output_tokens, cost_estimate, duration_ms)
    VALUES (?, ?, 'business_card_ocr', '[image]', ?, ?, 'draft', ?, ?, ?, ?, ?)
  `).bind(
    contentId, userId, result.result, JSON.stringify(extracted),
    result.model, result.inputTokens, result.outputTokens, result.cost, durationMs,
  ).run();

  await router.logUsage(db, 'business_card_ocr', result.model, result.inputTokens, result.outputTokens, result.cost, undefined, durationMs);
  await incrementUsage(env.MASTER_DB, tenantId, 'ai_actions_per_day');

  return success(c, { contentId, extracted, model: result.model, provider: result.provider, cost: result.cost });
});

// ── Bulk lead parsing (TICKET-420) ─────────────────────────

aiRoutes.post('/parse-bulk-leads', zValidator('json', z.object({ text: z.string().min(1) })), async (c) => {
  const db = c.get('tenantDb');
  const env = c.env;
  const userId = c.get('userId');
  const { text } = c.req.valid('json');

  const startTime = Date.now();
  const router = new AIRouter(env);

  const systemPrompt = `You are a travel CRM assistant. Parse this text block which may contain multiple travel inquiries.
Extract each inquiry as a separate lead. Return as JSON array:
[{
  "name": "...", "phone": "...", "email": "...",
  "destination": "...", "travelDates": {...}, "paxCount": N,
  "budget": N, "tripType": "...", "confidence": 0.0_to_1.0
}, ...]`;

  const result = await router.route('extraction', text, systemPrompt);
  const durationMs = Date.now() - startTime;

  let extracted: any[] = [];
  try {
    const jsonMatch = result.result.match(/\[[\s\S]*\]/);
    if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
  } catch {
    extracted = [];
  }

  const contentId = generateId();
  await db.prepare(`
    INSERT INTO ai_generated_content (id, user_id, content_type, prompt, raw_output, structured_output, status, model_used, input_tokens, output_tokens, cost_estimate, duration_ms)
    VALUES (?, ?, 'bulk_lead_extraction', ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
  `).bind(
    contentId, userId, text, result.result, JSON.stringify(extracted),
    result.model, result.inputTokens, result.outputTokens, result.cost, durationMs,
  ).run();

  await router.logUsage(db, 'bulk_lead_extraction', result.model, result.inputTokens, result.outputTokens, result.cost, undefined, durationMs);

  await incrementUsage(env.MASTER_DB, c.get('tenantId'), 'ai_actions_per_day');

  return success(c, { contentId, leads: extracted, count: extracted.length, model: result.model, provider: result.provider, cost: result.cost });
});

// ═══════════════════════════════════════════════════════════
// AI ITINERARY GENERATION (TICKET-421–426)
// ═══════════════════════════════════════════════════════════

const generateItinerarySchema = z.object({
  prompt: z.string().min(1),
  destination: z.string().optional(),
  duration: z.number().optional(),
  budget: z.number().optional(),
  budgetCurrency: z.string().optional(),
  paxCount: z.number().optional(),
  tripType: z.string().optional(),
  preferences: z.array(z.string()).optional(),
  leadId: z.string().optional(),
  conversationId: z.string().optional(),
});

aiRoutes.post('/generate-itinerary', zValidator('json', generateItinerarySchema), async (c) => {
  const db = c.get('tenantDb');
  const env = c.env;
  const userId = c.get('userId');
  const body = c.req.valid('json');

  const startTime = Date.now();
  const router = new AIRouter(env);

  // Build context
  let context = '';
  if (body.destination) context += `Destination: ${body.destination}\n`;
  if (body.duration) context += `Duration: ${body.duration} days\n`;
  if (body.budget) context += `Budget: ${body.budgetCurrency || 'INR'} ${body.budget}\n`;
  if (body.paxCount) context += `Travelers: ${body.paxCount}\n`;
  if (body.tripType) context += `Trip type: ${body.tripType}\n`;
  if (body.preferences?.length) context += `Preferences: ${body.preferences.join(', ')}\n`;

  const systemPrompt = `You are a travel itinerary planner for a Tours & Travels agency.
Generate a detailed day-by-day itinerary based on the request.
Return as JSON:
{
  "title": "Trip title",
  "destination": "Primary destination",
  "duration": number_of_days,
  "days": [
    {
      "dayNumber": 1,
      "title": "Day 1 title",
      "description": "Overview",
      "activities": [
        {"time": "09:00", "activity": "...", "description": "...", "location": "...", "estimatedCost": 0}
      ],
      "hotel": {"name": "...", "category": "3-star/4-star/5-star", "estimatedCost": 0},
      "meals": {"breakfast": "included/self", "lunch": "...", "dinner": "..."},
      "transport": {"mode": "car/bus/train/flight", "description": "...", "estimatedCost": 0}
    }
  ],
  "totalEstimatedCost": 0,
  "inclusions": ["..."],
  "exclusions": ["..."],
  "tips": ["..."]
}`;

  const fullPrompt = context ? `${context}\nUser request: ${body.prompt}` : body.prompt;
  const result = await router.route('itinerary', fullPrompt, systemPrompt);
  const durationMs = Date.now() - startTime;

  let itinerary: any = {};
  try {
    const jsonMatch = result.result.match(/\{[\s\S]*\}/);
    if (jsonMatch) itinerary = JSON.parse(jsonMatch[0]);
  } catch {
    itinerary = { error: 'Failed to parse', raw: result.result };
  }

  // Handle conversation
  let conversationId = body.conversationId;
  if (!conversationId) {
    conversationId = generateId();
    await db.prepare(`
      INSERT INTO ai_conversations (id, user_id, title, feature, entity_type, entity_id, messages, model_used)
      VALUES (?, ?, ?, 'itinerary_gen', 'lead', ?, ?, ?)
    `).bind(
      conversationId, userId, itinerary.title || 'Itinerary Generation',
      body.leadId || null,
      JSON.stringify([
        { role: 'user', content: fullPrompt, timestamp: new Date().toISOString() },
        { role: 'assistant', content: result.result, timestamp: new Date().toISOString() },
      ]),
      result.model,
    ).run();
  } else {
    // Append to existing conversation
    const existing = await db.prepare(
      'SELECT messages, total_input_tokens, total_output_tokens, total_cost FROM ai_conversations WHERE id = ?'
    ).bind(conversationId).first<Record<string, any>>();
    if (existing) {
      const messages = JSON.parse(existing.messages || '[]');
      messages.push(
        { role: 'user', content: fullPrompt, timestamp: new Date().toISOString() },
        { role: 'assistant', content: result.result, timestamp: new Date().toISOString() },
      );
      await db.prepare(`
        UPDATE ai_conversations
        SET messages = ?, total_input_tokens = ?, total_output_tokens = ?, total_cost = ?,
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?
      `).bind(
        JSON.stringify(messages),
        (existing.total_input_tokens || 0) + result.inputTokens,
        (existing.total_output_tokens || 0) + result.outputTokens,
        (existing.total_cost || 0) + result.cost,
        conversationId,
      ).run();
    }
  }

  // Save generated content
  const contentId = generateId();
  await db.prepare(`
    INSERT INTO ai_generated_content (id, conversation_id, user_id, content_type, prompt, raw_output, structured_output, status, model_used, input_tokens, output_tokens, cost_estimate, duration_ms)
    VALUES (?, ?, ?, 'itinerary', ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
  `).bind(
    contentId, conversationId, userId, fullPrompt, result.result, JSON.stringify(itinerary),
    result.model, result.inputTokens, result.outputTokens, result.cost, durationMs,
  ).run();

  await router.logUsage(db, 'itinerary_generation', result.model, result.inputTokens, result.outputTokens, result.cost, undefined, durationMs);

  await incrementUsage(env.MASTER_DB, c.get('tenantId'), 'ai_actions_per_day');

  return success(c, {
    contentId,
    conversationId,
    itinerary,
    model: result.model,
    provider: result.provider,
    cost: result.cost,
  });
});

// ── Enrich itinerary (TICKET-423) ─────────────────────────

aiRoutes.post('/enrich-itinerary', zValidator('json', z.object({
  itinerary: z.any(),
  enrichments: z.array(z.string()).optional(), // ["restaurants", "tips", "culture", "photos"]
})), async (c) => {
  const db = c.get('tenantDb');
  const env = c.env;
  const userId = c.get('userId');
  const { itinerary, enrichments } = c.req.valid('json');

  const startTime = Date.now();
  const router = new AIRouter(env);

  const enrichTypes = enrichments || ['descriptions', 'restaurants', 'tips'];
  const systemPrompt = `You are a travel enrichment assistant. Enhance this itinerary with: ${enrichTypes.join(', ')}.
Return the same JSON structure but with enriched descriptions, added restaurant recommendations, local tips, and cultural notes.`;

  const result = await router.route('itinerary', JSON.stringify(itinerary), systemPrompt);
  const durationMs = Date.now() - startTime;

  let enriched: any = {};
  try {
    const jsonMatch = result.result.match(/\{[\s\S]*\}/);
    if (jsonMatch) enriched = JSON.parse(jsonMatch[0]);
  } catch {
    enriched = itinerary;
  }

  const contentId = generateId();
  await db.prepare(`
    INSERT INTO ai_generated_content (id, user_id, content_type, prompt, raw_output, structured_output, status, model_used, input_tokens, output_tokens, cost_estimate, duration_ms)
    VALUES (?, ?, 'itinerary_enrichment', ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
  `).bind(
    contentId, userId, `Enrich: ${enrichTypes.join(', ')}`, result.result, JSON.stringify(enriched),
    result.model, result.inputTokens, result.outputTokens, result.cost, durationMs,
  ).run();

  await router.logUsage(db, 'itinerary_enrichment', result.model, result.inputTokens, result.outputTokens, result.cost, undefined, durationMs);

  await incrementUsage(env.MASTER_DB, c.get('tenantId'), 'ai_actions_per_day');

  return success(c, { contentId, itinerary: enriched, model: result.model, provider: result.provider, cost: result.cost });
});

// ═══════════════════════════════════════════════════════════
// AI INVOICE GENERATION (TICKET-427–430)
// ═══════════════════════════════════════════════════════════

aiRoutes.post('/generate-invoice', zValidator('json', z.object({
  itinerary: z.any(),
  currency: z.string().default('INR'),
  gstRate: z.number().default(5),
  tcsRate: z.number().default(5),
  markupPercent: z.number().default(15),
})), async (c) => {
  const db = c.get('tenantDb');
  const env = c.env;
  const userId = c.get('userId');
  const body = c.req.valid('json');

  const startTime = Date.now();
  const router = new AIRouter(env);

  const systemPrompt = `You are a travel invoice generator. Convert this itinerary into structured invoice line items.
Apply markup of ${body.markupPercent}%, GST at ${body.gstRate}%, and TCS at ${body.tcsRate}%.
Group items by category: accommodation, transport, activities, meals, miscellaneous.
Return as JSON:
{
  "lineItems": [
    {"description": "...", "category": "accommodation", "quantity": 1, "unitPrice": 0, "amount": 0, "hsnSac": "9963"}
  ],
  "subtotal": 0,
  "gstAmount": 0,
  "tcsAmount": 0,
  "totalAmount": 0,
  "currency": "${body.currency}",
  "notes": "..."
}`;

  const result = await router.route('invoice', JSON.stringify(body.itinerary), systemPrompt);
  const durationMs = Date.now() - startTime;

  let invoice: any = {};
  try {
    const jsonMatch = result.result.match(/\{[\s\S]*\}/);
    if (jsonMatch) invoice = JSON.parse(jsonMatch[0]);
  } catch {
    invoice = { error: 'Failed to generate', raw: result.result };
  }

  const contentId = generateId();
  await db.prepare(`
    INSERT INTO ai_generated_content (id, user_id, content_type, prompt, raw_output, structured_output, status, model_used, input_tokens, output_tokens, cost_estimate, duration_ms)
    VALUES (?, ?, 'invoice', ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
  `).bind(
    contentId, userId, 'Generate invoice from itinerary', result.result, JSON.stringify(invoice),
    result.model, result.inputTokens, result.outputTokens, result.cost, durationMs,
  ).run();

  await router.logUsage(db, 'invoice_generation', result.model, result.inputTokens, result.outputTokens, result.cost, undefined, durationMs);

  await incrementUsage(env.MASTER_DB, c.get('tenantId'), 'ai_actions_per_day');

  return success(c, { contentId, invoice, model: result.model, provider: result.provider, cost: result.cost });
});

// ═══════════════════════════════════════════════════════════
// AI COMMUNICATION COMPOSER (TICKET-431–434)
// ═══════════════════════════════════════════════════════════

const composeMessageSchema = z.object({
  channel: z.enum(['whatsapp', 'email', 'sms']),
  purpose: z.string(), // follow_up, greeting, promotion, inquiry_response, payment_reminder
  tone: z.enum(['formal', 'casual', 'enthusiastic', 'professional']).default('professional'),
  language: z.string().default('en'), // en, hi, ar, etc.
  context: z.object({
    customerName: z.string().optional(),
    destination: z.string().optional(),
    leadStatus: z.string().optional(),
    lastInteraction: z.string().optional(),
    additionalContext: z.string().optional(),
  }).optional(),
});

aiRoutes.post('/compose-message', zValidator('json', composeMessageSchema), async (c) => {
  const db = c.get('tenantDb');
  const env = c.env;
  const userId = c.get('userId');
  const body = c.req.valid('json');

  const startTime = Date.now();
  const router = new AIRouter(env);

  let contextStr = '';
  if (body.context) {
    if (body.context.customerName) contextStr += `Customer: ${body.context.customerName}\n`;
    if (body.context.destination) contextStr += `Destination: ${body.context.destination}\n`;
    if (body.context.leadStatus) contextStr += `Lead status: ${body.context.leadStatus}\n`;
    if (body.context.lastInteraction) contextStr += `Last interaction: ${body.context.lastInteraction}\n`;
    if (body.context.additionalContext) contextStr += `${body.context.additionalContext}\n`;
  }

  const systemPrompt = `You are a travel agency communication assistant.
Compose a ${body.channel} message for: ${body.purpose}
Tone: ${body.tone}
Language: ${body.language === 'hi' ? 'Hindi' : body.language === 'ar' ? 'Arabic' : 'English'}
Channel constraints: ${body.channel === 'sms' ? 'Max 160 characters' : body.channel === 'whatsapp' ? 'Include emojis, keep concise' : 'Professional email format with subject line'}

Return as JSON:
{
  "subject": "only for email",
  "body": "the message",
  "suggestedActions": ["action1", "action2"],
  "followUpSuggestion": "when to follow up next"
}`;

  const result = await router.route('communication', contextStr || body.purpose, systemPrompt);
  const durationMs = Date.now() - startTime;

  let message: any = {};
  try {
    const jsonMatch = result.result.match(/\{[\s\S]*\}/);
    if (jsonMatch) message = JSON.parse(jsonMatch[0]);
  } catch {
    message = { body: result.result };
  }

  const contentId = generateId();
  await db.prepare(`
    INSERT INTO ai_generated_content (id, user_id, content_type, prompt, raw_output, structured_output, status, model_used, input_tokens, output_tokens, cost_estimate, duration_ms)
    VALUES (?, ?, 'message', ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
  `).bind(
    contentId, userId, `${body.channel}/${body.purpose}`, result.result, JSON.stringify(message),
    result.model, result.inputTokens, result.outputTokens, result.cost, durationMs,
  ).run();

  await router.logUsage(db, 'communication_compose', result.model, result.inputTokens, result.outputTokens, result.cost, undefined, durationMs);

  await incrementUsage(env.MASTER_DB, c.get('tenantId'), 'ai_actions_per_day');

  return success(c, { contentId, message, channel: body.channel, model: result.model, provider: result.provider, cost: result.cost });
});

// ── Smart reply suggestions (TICKET-432) ──────────────────

aiRoutes.post('/suggest-replies', zValidator('json', z.object({
  incomingMessage: z.string().min(1),
  channel: z.enum(['whatsapp', 'email', 'sms']),
  customerName: z.string().optional(),
})), async (c) => {
  const db = c.get('tenantDb');
  const env = c.env;
  const userId = c.get('userId');
  const { incomingMessage, channel, customerName } = c.req.valid('json');

  const startTime = Date.now();
  const router = new AIRouter(env);

  const systemPrompt = `You are a travel agency assistant. Generate 3 quick reply suggestions for this incoming ${channel} message${customerName ? ` from ${customerName}` : ''}.
Return as JSON array: ["reply1", "reply2", "reply3"]
Keep replies concise and professional.`;

  const result = await router.route('communication', incomingMessage, systemPrompt);
  const durationMs = Date.now() - startTime;

  let suggestions: string[] = [];
  try {
    const jsonMatch = result.result.match(/\[[\s\S]*\]/);
    if (jsonMatch) suggestions = JSON.parse(jsonMatch[0]);
  } catch {
    suggestions = [result.result];
  }

  await router.logUsage(db, 'smart_reply', result.model, result.inputTokens, result.outputTokens, result.cost, undefined, durationMs);

  await incrementUsage(env.MASTER_DB, c.get('tenantId'), 'ai_actions_per_day');

  return success(c, { suggestions, model: result.model, provider: result.provider, cost: result.cost });
});

// ═══════════════════════════════════════════════════════════
// GENERATED CONTENT MANAGEMENT (TICKET-413)
// ═══════════════════════════════════════════════════════════

// ── GET /generated — List generated content ──────────────

aiRoutes.get('/generated', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const url = new URL(c.req.url);

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;
  const contentType = url.searchParams.get('contentType');
  const status = url.searchParams.get('status');

  const conditions = ['user_id = ?'];
  const values: (string | number)[] = [userId];
  if (contentType) { conditions.push('content_type = ?'); values.push(contentType); }
  if (status) { conditions.push('status = ?'); values.push(status); }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const countResult = await db.prepare(
    `SELECT COUNT(*) as total FROM ai_generated_content ${where}`
  ).bind(...values).first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const rows = await db.prepare(`
    SELECT id, conversation_id, content_type, status, entity_type, entity_id,
           model_used, input_tokens, output_tokens, cost_estimate, duration_ms,
           feedback, created_at
    FROM ai_generated_content ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...values, limit, offset).all();

  return c.json({
    success: true,
    data: (rows.results || []).map((r: any) => ({
      id: r.id,
      conversationId: r.conversation_id,
      contentType: r.content_type,
      status: r.status,
      entityType: r.entity_type,
      entityId: r.entity_id,
      modelUsed: r.model_used,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      costEstimate: r.cost_estimate,
      durationMs: r.duration_ms,
      feedback: r.feedback,
      createdAt: r.created_at,
    })),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit), hasMore: page * limit < total },
  });
});

// ── GET /generated/:id ─────────────────────────────────

aiRoutes.get('/generated/:id', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const id = c.req.param('id');

  const row = await db.prepare(
    'SELECT * FROM ai_generated_content WHERE id = ? AND user_id = ?'
  ).bind(id, userId).first<Record<string, any>>();

  if (!row) return notFound(c, 'Generated content');

  return success(c, {
    id: row.id,
    conversationId: row.conversation_id,
    contentType: row.content_type,
    prompt: row.prompt,
    rawOutput: row.raw_output,
    structuredOutput: row.structured_output ? JSON.parse(row.structured_output) : null,
    entityType: row.entity_type,
    entityId: row.entity_id,
    status: row.status,
    feedback: row.feedback,
    feedbackNotes: row.feedback_notes,
    modelUsed: row.model_used,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    costEstimate: row.cost_estimate,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  });
});

// ── POST /generated/:id/feedback ─────────────────────────

aiRoutes.post('/generated/:id/feedback', zValidator('json', z.object({
  feedback: z.enum(['positive', 'negative']),
  notes: z.string().optional(),
})), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const { feedback, notes } = c.req.valid('json');

  await db.prepare(`
    UPDATE ai_generated_content
    SET feedback = ?, feedback_notes = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = ?
  `).bind(feedback, notes || null, id).run();

  return success(c, { message: 'Feedback saved' });
});

// ── POST /generated/:id/accept ──────────────────────────

aiRoutes.post('/generated/:id/accept', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  await db.prepare(`
    UPDATE ai_generated_content
    SET status = 'accepted', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = ?
  `).bind(id).run();

  return success(c, { message: 'Content accepted' });
});

// ── POST /generated/:id/reject ──────────────────────────

aiRoutes.post('/generated/:id/reject', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  await db.prepare(`
    UPDATE ai_generated_content
    SET status = 'rejected', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = ?
  `).bind(id).run();

  return success(c, { message: 'Content rejected' });
});

export default aiRoutes;
