/**
 * AI Intelligence Routes — M24 (TICKET-439 through TICKET-458)
 *
 * NL Query, Insights, Lead Scoring, Document OCR, Smart Follow-ups
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../types';
import { success, error } from '../utils/response';
import { generateId } from '../utils/uuid';
import { AIRouter, AiUnavailableError } from '../services/ai-router';
import { incrementUsage } from '../middleware/usage-cap';

import { aiAwareErrorHandler, aiUnavailableResponse } from '../utils/ai-unavailable';

const app = new Hono<AppContext>();
app.onError(aiAwareErrorHandler);

// ============================================================
// NL QUERY — "Ask Your CRM" (TICKET-439)
// ============================================================

app.post('/nl-query', async (c) => {
  const body = await c.req.json();
  const parsed = z.object({
    query: z.string().min(3).max(1000),
    conversationId: z.string().optional(),
  }).safeParse(body);
  if (!parsed.success) return error(c, 'Invalid input', 400);

  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const env = c.env;
  const { query, conversationId } = parsed.data;

  const id = generateId();
  const start = Date.now();

  try {
    const router = new AIRouter(env);
    const systemPrompt = `You are a CRM analytics assistant. Convert natural language questions to safe, read-only SQL queries for a SQLite database.

Available tables: leads (id, title, status, source, destination, estimated_value, pax_count, assignee_id, created_at),
contacts (id, name, email, phone, company, type, created_at),
invoices (id, invoice_number, contact_id, total_amount, status, due_date, created_at),
follow_ups (id, lead_id, title, due_date, status, assigned_to, created_at),
call_logs (id, contact_id, direction, duration, outcome, created_at).

IMPORTANT: Only generate SELECT queries. Never INSERT, UPDATE, DELETE, DROP, or ALTER.
Return JSON: { "sql": "SELECT ...", "explanation": "..." }
If the question can't be answered with a query, return { "sql": null, "explanation": "..." }`;

    const result = await router.route('nl_query', query, systemPrompt);

    let generatedSql: string | null = null;
    let queryResult: any = null;
    let narrative = '';
    let entityTypes: string[] = [];

    try {
      const sqlParsed = JSON.parse(result.result);
      generatedSql = sqlParsed.sql;

      if (generatedSql) {
        // Safety check
        const upper = generatedSql.toUpperCase().trim();
        if (upper.startsWith('SELECT') && !upper.includes('DROP') && !upper.includes('DELETE') && !upper.includes('INSERT') && !upper.includes('UPDATE') && !upper.includes('ALTER')) {
          const stmt = await db.prepare(generatedSql).all();
          queryResult = stmt.results || [];

          const tableMentions = ['leads', 'contacts', 'invoices', 'follow_ups', 'call_logs'];
          entityTypes = tableMentions.filter(t => generatedSql!.toLowerCase().includes(t));
        }

        const narrativeResult = await router.route(
          'nl_query',
          `Question: "${query}"\nResults: ${JSON.stringify(queryResult)}\nExplanation: ${sqlParsed.explanation}`,
          'Summarize database query results in a clear, concise natural language response. Be specific with numbers.',
        );
        narrative = narrativeResult.result;
      } else {
        narrative = sqlParsed.explanation || 'I couldn\'t generate a query for that question.';
      }
    } catch {
      narrative = result.result;
    }

    const durationMs = Date.now() - start;

    await db.prepare(`
      INSERT INTO ai_nl_queries (id, user_id, conversation_id, query, generated_sql, query_result, ai_narrative, entity_types, model_used, input_tokens, output_tokens, cost_estimate, duration_ms, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
    `).bind(id, userId, conversationId || null, query, generatedSql, queryResult ? JSON.stringify(queryResult) : null, narrative, entityTypes.length > 0 ? JSON.stringify(entityTypes) : null, result.model, result.inputTokens, result.outputTokens, result.cost, durationMs).run();

    return c.json({
      success: true,
      data: { id, query, sql: generatedSql, result: queryResult, narrative, entityTypes, model: result.model, cost: result.cost, durationMs, provider: result.provider },
    });
  } catch (e: any) {
    // No provider: not an error worth logging as a failed query, and no usage is consumed.
    if (e instanceof AiUnavailableError) return aiUnavailableResponse(c, e.message);
    await db.prepare(`
      INSERT INTO ai_nl_queries (id, user_id, query, status, error_message, duration_ms)
      VALUES (?, ?, ?, 'error', ?, ?)
    `).bind(id, userId, query, e.message, Date.now() - start).run();
    return error(c, 'Query failed: ' + e.message, 500);
  }
});

// NL Query history
app.get('/nl-queries', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');

  const rows = await db.prepare(`
    SELECT * FROM ai_nl_queries WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).bind(userId, limit, offset).all();

  return c.json({ success: true, data: rows.results || [] });
});

// ============================================================
// AI INSIGHTS (TICKET-442–444)
// ============================================================

app.get('/insights', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const type = c.req.query('type');
  const priority = c.req.query('priority');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');

  let where = `WHERE (user_id = ? OR user_id IS NULL) AND dismissed_at IS NULL`;
  const binds: any[] = [userId];
  if (type) { where += ` AND insight_type = ?`; binds.push(type); }
  if (priority) { where += ` AND priority = ?`; binds.push(priority); }

  const rows = await db.prepare(`
    SELECT * FROM ai_insights ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).bind(...binds, limit, offset).all();

  return c.json({ success: true, data: rows.results || [] });
});

app.get('/insights/:id', async (c) => {
  const db = c.get('tenantDb');
  const { id } = c.req.param();
  const row = await db.prepare(`SELECT * FROM ai_insights WHERE id = ?`).bind(id).first();
  if (!row) return error(c, 'Insight not found', 404);
  return c.json({ success: true, data: row });
});

app.post('/insights/:id/dismiss', async (c) => {
  const db = c.get('tenantDb');
  const { id } = c.req.param();
  await db.prepare(`UPDATE ai_insights SET dismissed_at = ? WHERE id = ?`).bind(new Date().toISOString(), id).run();
  return c.json({ success: true, data: { dismissed: true } });
});

app.post('/insights/:id/action', async (c) => {
  const db = c.get('tenantDb');
  const { id } = c.req.param();
  await db.prepare(`UPDATE ai_insights SET action_taken = 1, updated_at = ? WHERE id = ?`).bind(new Date().toISOString(), id).run();
  return c.json({ success: true, data: { actionTaken: true } });
});

// Generate customer insight (TICKET-442)
app.post('/insights/customer/:contactId', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const { contactId } = c.req.param();

  const contact = await db.prepare(`SELECT * FROM contacts WHERE id = ?`).bind(contactId).first();
  if (!contact) return error(c, 'Contact not found', 404);

  const leads = await db.prepare(`SELECT * FROM leads WHERE contact_id = ? ORDER BY created_at DESC LIMIT 20`).bind(contactId).all();
  const invoices = await db.prepare(`SELECT * FROM invoices WHERE contact_id = ? ORDER BY created_at DESC LIMIT 20`).bind(contactId).all();

  const router = new AIRouter(c.env);
  const result = await router.route(
    'customer_insight',
    JSON.stringify({ contact, leads: leads.results || [], invoices: invoices.results || [] }),
    `Analyze this customer's CRM data and provide: 1) A brief summary 2) Upsell opportunities 3) Risk signals 4) Recommended next actions. Return JSON: { "summary": "...", "upsellOpportunities": [...], "riskSignals": [...], "recommendations": [...], "lifetimeValue": number, "engagementLevel": "high|medium|low" }`,
  );

  const id = generateId();
  let insightData: any = {};
  try { insightData = JSON.parse(result.result); } catch { insightData = { summary: result.result }; }

  await db.prepare(`
    INSERT INTO ai_insights (id, user_id, insight_type, entity_type, entity_id, title, summary, data, confidence, priority, actionable, model_used, cost_estimate)
    VALUES (?, ?, 'customer_summary', 'contact', ?, ?, ?, ?, 0.8, ?, ?, ?, ?)
  `).bind(
    id, userId, contactId,
    `Customer Insight: ${(contact as any).name}`,
    insightData.summary || result.result,
    JSON.stringify(insightData),
    insightData.riskSignals?.length > 0 ? 'high' : 'medium',
    insightData.recommendations?.length > 0 ? 1 : 0,
    result.model, result.cost,
  ).run();

  return c.json({ success: true, data: { id, ...insightData, model: result.model, cost: result.cost } });
});

// Generate predictive suggestions (TICKET-443)
app.post('/insights/predictions', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');

  const leads = await db.prepare(`
    SELECT id, title, status, source, destination, estimated_value, pax_count, created_at
    FROM leads WHERE status NOT IN ('won', 'lost', 'cancelled')
    ORDER BY created_at DESC LIMIT 50
  `).all();

  const router = new AIRouter(c.env);
  const result = await router.route(
    'predictive_suggestion',
    JSON.stringify(leads.results || []),
    `Analyze these CRM leads and prioritize them. For each lead, assess urgency and conversion likelihood. Return JSON array: [{ "leadId": "...", "priority": 1-10, "reasoning": "...", "suggestedAction": "..." }]. Sort by priority descending.`,
  );

  let predictions: any[] = [];
  try { predictions = JSON.parse(result.result); } catch { /* */ }

  for (const pred of predictions.slice(0, 10)) {
    await db.prepare(`
      INSERT INTO ai_recommendations (id, user_id, recommendation_type, entity_type, entity_id, title, description, impact_score, confidence_score, action_url, model_used, cost_estimate)
      VALUES (?, ?, 'prioritize', 'lead', ?, ?, ?, ?, 0.7, ?, ?, ?)
    `).bind(
      generateId(), userId, pred.leadId,
      `Priority Lead: ${pred.suggestedAction || 'Follow up'}`,
      pred.reasoning || '',
      (pred.priority || 5) / 10,
      `/leads/${pred.leadId}`,
      result.model, result.cost / predictions.length,
    ).run();
  }

  return c.json({ success: true, data: { predictions, model: result.model, cost: result.cost } });
});

// ============================================================
// AI RECOMMENDATIONS (TICKET-442–444)
// ============================================================

app.get('/recommendations', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const type = c.req.query('type');
  const status = c.req.query('status') || 'active';
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');

  let where = `WHERE (user_id = ? OR user_id IS NULL) AND status = ?`;
  const binds: any[] = [userId, status];
  if (type) { where += ` AND recommendation_type = ?`; binds.push(type); }

  const rows = await db.prepare(`
    SELECT * FROM ai_recommendations ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).bind(...binds, limit, offset).all();

  return c.json({ success: true, data: rows.results || [] });
});

app.post('/recommendations/:id/dismiss', async (c) => {
  const db = c.get('tenantDb');
  const { id } = c.req.param();
  await db.prepare(`UPDATE ai_recommendations SET status = 'dismissed', dismissed_at = ? WHERE id = ?`).bind(new Date().toISOString(), id).run();
  return c.json({ success: true, data: { dismissed: true } });
});

app.post('/recommendations/:id/act', async (c) => {
  const db = c.get('tenantDb');
  const { id } = c.req.param();
  await db.prepare(`UPDATE ai_recommendations SET status = 'acted_on', acted_on_at = ? WHERE id = ?`).bind(new Date().toISOString(), id).run();
  return c.json({ success: true, data: { actedOn: true } });
});

// ============================================================
// AI LEAD SCORING (TICKET-445–449)
// ============================================================

app.post('/lead-score/:leadId', async (c) => {
  const db = c.get('tenantDb');
  const { leadId } = c.req.param();

  const lead = await db.prepare(`SELECT * FROM leads WHERE id = ?`).bind(leadId).first();
  if (!lead) return error(c, 'Lead not found', 404);

  const followUps = await db.prepare(`SELECT * FROM follow_ups WHERE lead_id = ? ORDER BY created_at DESC LIMIT 20`).bind(leadId).all();
  const prevScore = await db.prepare(`SELECT * FROM ai_lead_scores WHERE lead_id = ? ORDER BY calculated_at DESC LIMIT 1`).bind(leadId).first();

  const fuResults = followUps.results || [];
  const completedFu = fuResults.filter((f: any) => f.status === 'completed').length;
  const daysSince = Math.floor((Date.now() - new Date((lead as any).created_at || '').getTime()) / 86400000);

  const router = new AIRouter(c.env);
  const result = await router.route(
    'lead_scoring',
    JSON.stringify({ lead, followUps: fuResults.length, completedFollowUps: completedFu, noteCount: 0, daysSinceCreation: daysSince }),
    `Score this lead from 0-100 based on conversion likelihood. Analyze: response speed, budget indicators, engagement level, destination demand, travel dates proximity, pax count, follow-up responses.

Return JSON: {
  "score": number (0-100),
  "category": "hot" | "warm" | "cold",
  "signals": [{ "name": "...", "value": number, "weight": number, "contribution": number }],
  "breakdown": { "engagement": number, "budget": number, "timing": number, "intent": number, "responsiveness": number }
}`,
  );

  let scoreData: any = {};
  try {
    const jsonMatch = result.result.match(/\{[\s\S]*\}/);
    scoreData = JSON.parse(jsonMatch ? jsonMatch[0] : result.result);
  } catch {
    scoreData = {};
  }
  // Ensure required fields always present
  if (typeof scoreData.score !== 'number') scoreData.score = 50;
  if (!scoreData.category) scoreData.category = 'warm';
  if (!scoreData.signals) scoreData.signals = [];
  if (!scoreData.breakdown) scoreData.breakdown = { engagement: 50, budget: 50, timing: 50, intent: 50, responsiveness: 50 };

  const id = generateId();
  const prevScoreVal = prevScore ? (prevScore as any).score : null;
  const scoreChange = prevScoreVal !== null ? (scoreData.score || 50) - prevScoreVal : null;

  await db.prepare(`
    INSERT INTO ai_lead_scores (id, lead_id, score, category, signals, breakdown, previous_score, score_change, trigger_event, model_used, cost_estimate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)
  `).bind(
    id, leadId, scoreData.score || 50, scoreData.category || 'warm',
    scoreData.signals ? JSON.stringify(scoreData.signals) : null,
    scoreData.breakdown ? JSON.stringify(scoreData.breakdown) : null,
    prevScoreVal, scoreChange, result.model, result.cost,
  ).run();

  return c.json({
    success: true,
    data: {
      id, leadId, score: scoreData.score, category: scoreData.category,
      signals: scoreData.signals, breakdown: scoreData.breakdown,
      previousScore: prevScoreVal, scoreChange, model: result.model, cost: result.cost, provider: result.provider,
    },
  });
});

// Get lead score
app.get('/lead-score/:leadId', async (c) => {
  const db = c.get('tenantDb');
  const { leadId } = c.req.param();
  const score = await db.prepare(`SELECT * FROM ai_lead_scores WHERE lead_id = ? ORDER BY calculated_at DESC LIMIT 1`).bind(leadId).first();
  return c.json({ success: true, data: score || null });
});

// Get lead score history
app.get('/lead-score/:leadId/history', async (c) => {
  const db = c.get('tenantDb');
  const { leadId } = c.req.param();
  const limit = parseInt(c.req.query('limit') || '10');
  const rows = await db.prepare(`SELECT * FROM ai_lead_scores WHERE lead_id = ? ORDER BY calculated_at DESC LIMIT ?`).bind(leadId, limit).all();
  return c.json({ success: true, data: rows.results || [] });
});

// Bulk get scores
app.post('/lead-scores/bulk', async (c) => {
  const body = await c.req.json();
  const parsed = z.object({ leadIds: z.array(z.string()).min(1).max(50) }).safeParse(body);
  if (!parsed.success) return error(c, 'Invalid input', 400);

  const db = c.get('tenantDb');
  const scores: any[] = [];
  for (const leadId of parsed.data.leadIds) {
    const score = await db.prepare(`SELECT * FROM ai_lead_scores WHERE lead_id = ? ORDER BY calculated_at DESC LIMIT 1`).bind(leadId).first();
    if (score) scores.push(score);
  }
  return c.json({ success: true, data: scores });
});

// ============================================================
// DOCUMENT OCR (TICKET-450–454)
// ============================================================

// Passport OCR
app.post('/ocr/passport', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const env = c.env;
  const body = await c.req.json();
  const parsed = z.object({
    imageBase64: z.string().min(100),
    imageUrl: z.string().optional(),
  }).safeParse(body);
  if (!parsed.success) return error(c, 'Invalid input', 400);

  const router = new AIRouter(env);
  const textPrompt = `Extract passport data from this image. Return JSON: { "fullName": "...", "surname": "...", "givenNames": "...", "passportNumber": "...", "nationality": "...", "dateOfBirth": "YYYY-MM-DD", "sex": "M|F", "placeOfBirth": "...", "dateOfIssue": "YYYY-MM-DD", "dateOfExpiry": "YYYY-MM-DD", "issuingAuthority": "...", "mrz": "..." }`;

  const result = await router.routeVision('passport_ocr', parsed.data.imageBase64, 'image/jpeg', textPrompt);

  let extracted: any = {};
  try {
    const jsonMatch = result.result.match(/\{[\s\S]*\}/);
    if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
  } catch { extracted = { rawText: result.result }; }

  const id = generateId();
  await db.prepare(`
    INSERT INTO ai_document_scans (id, user_id, document_type, image_url, extracted_data, confidence, entity_type, status, model_used, input_tokens, output_tokens, cost_estimate)
    VALUES (?, ?, 'passport', ?, ?, 0.85, 'traveller', 'pending', ?, ?, ?, ?)
  `).bind(id, userId, parsed.data.imageUrl || null, JSON.stringify(extracted), result.model, result.inputTokens, result.outputTokens, result.cost).run();

  await router.logUsage(db, 'passport_ocr', result.model, result.inputTokens, result.outputTokens, result.cost);
  await incrementUsage(env.MASTER_DB, c.get('tenantId'), 'ai_actions_per_day');

  return c.json({ success: true, data: { id, extracted, model: result.model, provider: result.provider, cost: result.cost } });
});

// Visa document classification
app.post('/ocr/visa-classify', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const env = c.env;
  const body = await c.req.json();
  const parsed = z.object({
    images: z.array(z.object({
      imageBase64: z.string().min(100),
      fileName: z.string().optional(),
    })).min(1).max(10),
  }).safeParse(body);
  if (!parsed.success) return error(c, 'Invalid input', 400);

  const router = new AIRouter(env);
  const classifications: any[] = [];

  for (const img of parsed.data.images) {
    const textPrompt = `Classify this document for visa application. Return JSON: { "category": "passport_copy|photo|bank_statement|employment_letter|hotel_booking|flight_booking|travel_insurance|invitation_letter|other", "confidence": 0.0-1.0, "description": "...", "extractedInfo": { ... } }`;

    const result = await router.routeVision('visa_classification', img.imageBase64, 'image/jpeg', textPrompt);

    let classified: any = {};
    try {
      const jsonMatch = result.result.match(/\{[\s\S]*\}/);
      if (jsonMatch) classified = JSON.parse(jsonMatch[0]);
    } catch { classified = { category: 'other', description: result.result }; }

    const id = generateId();
    await db.prepare(`
      INSERT INTO ai_document_scans (id, user_id, document_type, extracted_data, confidence, status, model_used, input_tokens, output_tokens, cost_estimate)
      VALUES (?, ?, 'visa_document', ?, ?, 'pending', ?, ?, ?, ?)
    `).bind(id, userId, JSON.stringify(classified), classified.confidence || 0.7, result.model, result.inputTokens, result.outputTokens, result.cost).run();

    classifications.push({ id, fileName: img.fileName, ...classified });
  }

  await incrementUsage(env.MASTER_DB, c.get('tenantId'), 'ai_actions_per_day');

  return c.json({ success: true, data: classifications });
});

// Supplier invoice OCR
app.post('/ocr/supplier-invoice', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const env = c.env;
  const body = await c.req.json();
  const parsed = z.object({
    imageBase64: z.string().min(100),
    imageUrl: z.string().optional(),
  }).safeParse(body);
  if (!parsed.success) return error(c, 'Invalid input', 400);

  const router = new AIRouter(env);
  const textPrompt = `Extract invoice data from this supplier invoice image. Return JSON: { "supplierName": "...", "invoiceNumber": "...", "invoiceDate": "YYYY-MM-DD", "dueDate": "YYYY-MM-DD", "currency": "INR", "lineItems": [{ "description": "...", "quantity": number, "unitPrice": number, "amount": number, "hsnCode": "..." }], "subtotal": number, "taxAmount": number, "totalAmount": number, "gstNumber": "...", "panNumber": "..." }`;

  const result = await router.routeVision('supplier_invoice_ocr', parsed.data.imageBase64, 'image/jpeg', textPrompt);

  let extracted: any = {};
  try {
    const jsonMatch = result.result.match(/\{[\s\S]*\}/);
    if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
  } catch { extracted = { rawText: result.result }; }

  const id = generateId();
  await db.prepare(`
    INSERT INTO ai_document_scans (id, user_id, document_type, image_url, extracted_data, confidence, entity_type, status, model_used, input_tokens, output_tokens, cost_estimate)
    VALUES (?, ?, 'supplier_invoice', ?, ?, 0.8, 'invoice', 'pending', ?, ?, ?, ?)
  `).bind(id, userId, parsed.data.imageUrl || null, JSON.stringify(extracted), result.model, result.inputTokens, result.outputTokens, result.cost).run();

  await router.logUsage(db, 'supplier_invoice_ocr', result.model, result.inputTokens, result.outputTokens, result.cost);
  await incrementUsage(env.MASTER_DB, c.get('tenantId'), 'ai_actions_per_day');

  return c.json({ success: true, data: { id, extracted, model: result.model, provider: result.provider, cost: result.cost } });
});

// Get document scans
app.get('/document-scans', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const type = c.req.query('type');
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');

  let where = `WHERE user_id = ?`;
  const binds: any[] = [userId];
  if (type) { where += ` AND document_type = ?`; binds.push(type); }
  if (status) { where += ` AND status = ?`; binds.push(status); }

  const rows = await db.prepare(`SELECT * FROM ai_document_scans ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...binds, limit, offset).all();
  return c.json({ success: true, data: rows.results || [] });
});

app.get('/document-scans/:id', async (c) => {
  const db = c.get('tenantDb');
  const { id } = c.req.param();
  const row = await db.prepare(`SELECT * FROM ai_document_scans WHERE id = ?`).bind(id).first();
  if (!row) return error(c, 'Scan not found', 404);
  return c.json({ success: true, data: row });
});

app.post('/document-scans/:id/apply', async (c) => {
  const db = c.get('tenantDb');
  const { id } = c.req.param();
  const body = await c.req.json();
  await db.prepare(`UPDATE ai_document_scans SET status = 'applied', entity_id = ?, updated_at = ? WHERE id = ?`).bind(body.entityId || null, new Date().toISOString(), id).run();
  return c.json({ success: true, data: { applied: true } });
});

app.post('/document-scans/:id/reject', async (c) => {
  const db = c.get('tenantDb');
  const { id } = c.req.param();
  await db.prepare(`UPDATE ai_document_scans SET status = 'rejected', updated_at = ? WHERE id = ?`).bind(new Date().toISOString(), id).run();
  return c.json({ success: true, data: { rejected: true } });
});

// ============================================================
// SMART FOLLOW-UPS (TICKET-455–458)
// ============================================================

app.post('/smart-followup/:leadId', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const { leadId } = c.req.param();

  const lead = await db.prepare(`SELECT * FROM leads WHERE id = ?`).bind(leadId).first();
  if (!lead) return error(c, 'Lead not found', 404);

  const followUps = await db.prepare(`SELECT * FROM follow_ups WHERE lead_id = ? ORDER BY created_at DESC LIMIT 10`).bind(leadId).all();
  const fuResults = followUps.results || [];
  const daysSinceLastContact = fuResults.length > 0 ? Math.floor((Date.now() - new Date((fuResults[0] as any).created_at || '').getTime()) / 86400000) : null;

  const router = new AIRouter(c.env);
  const result = await router.route(
    'followup_timing',
    JSON.stringify({
      lead: { title: (lead as any).title, status: (lead as any).status, source: (lead as any).source, destination: (lead as any).destination, createdAt: (lead as any).created_at },
      followUps: fuResults.map((f: any) => ({ title: f.title, status: f.status, type: f.type, dueDate: f.due_date, completedAt: f.completed_at })),
      daysSinceLastContact,
    }),
    `Analyze this lead's interaction history and suggest the optimal follow-up strategy. Return JSON: {
  "suggestedChannel": "whatsapp|email|call",
  "suggestedTiming": "ISO timestamp of best time",
  "timingReasoning": "...",
  "channelReasoning": "...",
  "messageContent": "Draft message...",
  "escalationLevel": 0-2,
  "isWinBack": boolean,
  "confidence": 0.0-1.0
}`,
  );

  let suggestion: any = {};
  try {
    const jsonMatch = result.result.match(/\{[\s\S]*\}/);
    suggestion = JSON.parse(jsonMatch ? jsonMatch[0] : result.result);
  } catch {
    suggestion = {};
  }
  // Ensure required fields always present
  if (!suggestion.suggestedChannel) suggestion.suggestedChannel = 'whatsapp';
  if (!suggestion.suggestedTiming) suggestion.suggestedTiming = new Date(Date.now() + 86400000).toISOString();
  if (!suggestion.messageContent) suggestion.messageContent = result.result || '';
  if (typeof suggestion.confidence !== 'number') suggestion.confidence = 0.7;

  const id = generateId();
  await db.prepare(`
    INSERT INTO ai_followup_suggestions (id, user_id, lead_id, contact_id, suggested_channel, suggested_timing, timing_reasoning, channel_reasoning, message_content, escalation_level, is_win_back, confidence_score, model_used, cost_estimate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, userId, leadId, (lead as any).contact_id || null,
    suggestion.suggestedChannel || 'whatsapp',
    suggestion.suggestedTiming || null,
    suggestion.timingReasoning || null,
    suggestion.channelReasoning || null,
    suggestion.messageContent || null,
    suggestion.escalationLevel || 0,
    suggestion.isWinBack ? 1 : 0,
    suggestion.confidence || 0.7,
    result.model, result.cost,
  ).run();

  return c.json({ success: true, data: { id, ...suggestion, model: result.model, cost: result.cost, provider: result.provider } });
});

// Get follow-up suggestions
app.get('/smart-followups', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const status = c.req.query('status') || 'pending';
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');

  const rows = await db.prepare(`
    SELECT * FROM ai_followup_suggestions WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).bind(userId, status, limit, offset).all();

  return c.json({ success: true, data: rows.results || [] });
});

app.post('/smart-followups/:id/send', async (c) => {
  const db = c.get('tenantDb');
  const { id } = c.req.param();
  await db.prepare(`UPDATE ai_followup_suggestions SET status = 'sent', sent_at = ? WHERE id = ?`).bind(new Date().toISOString(), id).run();
  return c.json({ success: true, data: { sent: true } });
});

app.post('/smart-followups/:id/dismiss', async (c) => {
  const db = c.get('tenantDb');
  const { id } = c.req.param();
  await db.prepare(`UPDATE ai_followup_suggestions SET status = 'dismissed', dismissed_at = ? WHERE id = ?`).bind(new Date().toISOString(), id).run();
  return c.json({ success: true, data: { dismissed: true } });
});

// Trend detection (TICKET-444)
app.post('/insights/trends', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString();

  const recentLeads = await db.prepare(`SELECT COUNT(*) as count FROM leads WHERE created_at >= ?`).bind(thirtyDaysAgo).first<{ count: number }>();
  const prevLeads = await db.prepare(`SELECT COUNT(*) as count FROM leads WHERE created_at >= ? AND created_at < ?`).bind(sixtyDaysAgo, thirtyDaysAgo).first<{ count: number }>();
  const recentWon = await db.prepare(`SELECT COUNT(*) as count FROM leads WHERE status = 'won' AND updated_at >= ?`).bind(thirtyDaysAgo).first<{ count: number }>();
  const recentRevenue = await db.prepare(`SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE status = 'paid' AND created_at >= ?`).bind(thirtyDaysAgo).first<{ total: number }>();

  const router = new AIRouter(c.env);
  const result = await router.route(
    'trend_detection',
    JSON.stringify({
      recentLeads: recentLeads?.count || 0,
      previousLeads: prevLeads?.count || 0,
      recentWon: recentWon?.count || 0,
      recentRevenue: recentRevenue?.total || 0,
    }),
    `Analyze these CRM metrics and detect trends, anomalies (>25% deviation), and actionable insights. Return JSON: {
  "trends": [{ "metric": "...", "direction": "up|down|stable", "change": number, "description": "..." }],
  "anomalies": [{ "metric": "...", "deviation": number, "severity": "warning|critical", "description": "..." }],
  "recommendations": [{ "action": "...", "reasoning": "...", "priority": "high|medium|low" }]
}`,
  );

  let trendData: any = {};
  try { trendData = JSON.parse(result.result); } catch { trendData = { trends: [], anomalies: [], recommendations: [] }; }

  for (const anomaly of (trendData.anomalies || [])) {
    await db.prepare(`
      INSERT INTO ai_insights (id, user_id, insight_type, title, summary, data, priority, actionable, model_used, cost_estimate)
      VALUES (?, ?, 'anomaly', ?, ?, ?, ?, 1, ?, ?)
    `).bind(
      generateId(), userId,
      `Anomaly: ${anomaly.metric}`,
      anomaly.description,
      JSON.stringify(anomaly),
      anomaly.severity === 'critical' ? 'urgent' : 'high',
      result.model, result.cost / ((trendData.anomalies?.length || 1) + (trendData.trends?.length || 0)),
    ).run();
  }

  return c.json({ success: true, data: { ...trendData, model: result.model, cost: result.cost, provider: result.provider } });
});

export default app;
