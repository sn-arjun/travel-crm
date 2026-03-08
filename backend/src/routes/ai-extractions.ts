/**
 * AI Extractions Routes — TICKET-398, 401, 406
 *
 * List, review (confirm/reject), and manage AI call extractions.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { AppContext } from '../types';
import { success, error, notFound, paginated } from '../utils/response';
import { generateId } from '../utils/uuid';
import { rbac } from '../middleware/rbac';

const aiExtractionRoutes = new Hono<AppContext>();

// ── Helper: parse extraction row ─────────────────────────────

function parseExtraction(row: Record<string, any>) {
  return {
    id: row.id,
    callLogId: row.call_log_id,
    transcriptId: row.transcript_id,
    destination: row.destination,
    travelDates: row.travel_dates ? JSON.parse(row.travel_dates) : null,
    paxCount: row.pax_count,
    paxDetails: row.pax_details ? JSON.parse(row.pax_details) : null,
    budget: row.budget,
    budgetCurrency: row.budget_currency,
    preferences: row.preferences ? JSON.parse(row.preferences) : [],
    tripType: row.trip_type,
    hotelPreference: row.hotel_preference,
    mealPreference: row.meal_preference,
    specialRequests: row.special_requests,
    summary: row.summary ? JSON.parse(row.summary) : [],
    keyTopics: row.key_topics ? JSON.parse(row.key_topics) : [],
    actionItems: row.action_items ? JSON.parse(row.action_items) : [],
    sentiment: row.sentiment,
    sentimentScore: row.sentiment_score,
    dealLikelihood: row.deal_likelihood,
    likelihoodSignals: row.likelihood_signals ? JSON.parse(row.likelihood_signals) : [],
    coachingHints: row.coaching_hints ? JSON.parse(row.coaching_hints) : [],
    overallConfidence: row.overall_confidence,
    fieldConfidences: row.field_confidences ? JSON.parse(row.field_confidences) : {},
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdLeadId: row.created_lead_id,
    createdContactId: row.created_contact_id,
    modelUsed: row.model_used,
    tokensUsed: row.tokens_used,
    costEstimate: row.cost_estimate,
    // Joined fields
    contactName: row.contact_name ?? null,
    fromNumber: row.from_number ?? null,
    toNumber: row.to_number ?? null,
    direction: row.direction ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── GET / — List extractions ─────────────────────────────────

aiExtractionRoutes.get('/', async (c) => {
  const db = c.get('tenantDb');
  const url = new URL(c.req.url);

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;
  const status = url.searchParams.get('status');
  const sentiment = url.searchParams.get('sentiment');

  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (status) { conditions.push('ae.status = ?'); values.push(status); }
  if (sentiment) { conditions.push('ae.sentiment = ?'); values.push(sentiment); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db.prepare(
    `SELECT COUNT(*) as total FROM ai_call_extractions ae ${where}`
  ).bind(...values).first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const rows = await db.prepare(`
    SELECT ae.*, cl.from_number, cl.to_number, cl.direction, c.name as contact_name
    FROM ai_call_extractions ae
    LEFT JOIN call_logs cl ON ae.call_log_id = cl.id
    LEFT JOIN contacts c ON cl.contact_id = c.id
    ${where}
    ORDER BY ae.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...values, limit, offset).all();

  return c.json({
    success: true,
    data: (rows.results || []).map(parseExtraction),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  });
});

// ── GET /pending-count — Count pending extractions ───────────

aiExtractionRoutes.get('/pending-count', async (c) => {
  const db = c.get('tenantDb');
  const count = await db.prepare(
    "SELECT COUNT(*) as count FROM ai_call_extractions WHERE status = 'pending'"
  ).first<{ count: number }>();
  return success(c, { count: count?.count || 0 });
});

// ── GET /:id — Single extraction detail ──────────────────────

aiExtractionRoutes.get('/:id', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const row = await db.prepare(`
    SELECT ae.*, cl.from_number, cl.to_number, cl.direction, c.name as contact_name
    FROM ai_call_extractions ae
    LEFT JOIN call_logs cl ON ae.call_log_id = cl.id
    LEFT JOIN contacts c ON cl.contact_id = c.id
    WHERE ae.id = ?
  `).bind(id).first<Record<string, any>>();

  if (!row) return notFound(c, 'Extraction');

  return success(c, parseExtraction(row));
});

// ── POST /:id/confirm — Confirm extraction and create lead ───

const confirmSchema = z.object({
  destination: z.string().optional(),
  travelDates: z.object({
    from: z.string(),
    to: z.string(),
    flexible: z.boolean(),
  }).optional(),
  paxCount: z.number().optional(),
  budget: z.number().optional(),
  tripType: z.string().optional(),
});

aiExtractionRoutes.post('/:id/confirm', zValidator('json', confirmSchema), async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const id = c.req.param('id');
  const overrides = c.req.valid('json');

  const extraction = await db.prepare(
    'SELECT * FROM ai_call_extractions WHERE id = ?'
  ).bind(id).first<Record<string, any>>();

  if (!extraction) return notFound(c, 'Extraction');
  if (extraction.status !== 'pending') {
    return error(c, 'Extraction already reviewed', 409);
  }

  const dest = overrides.destination || extraction.destination;
  const budget = overrides.budget ?? extraction.budget;
  const paxCount = overrides.paxCount ?? extraction.pax_count;

  // Get call log to find contact info
  const callLog = await db.prepare(
    'SELECT contact_id, lead_id, from_number FROM call_logs WHERE id = ?'
  ).bind(extraction.call_log_id).first<{
    contact_id: string | null;
    lead_id: string | null;
    from_number: string;
  }>();

  let leadId = callLog?.lead_id;
  let contactId = callLog?.contact_id;

  // Create contact if needed
  if (!contactId) {
    contactId = generateId();
    await db.prepare(`
      INSERT INTO contacts (id, name, phone, type, source, created_by, assigned_to)
      VALUES (?, 'Caller', ?, 'customer', 'ai_extraction', ?, ?)
    `).bind(
      contactId,
      callLog?.from_number || '',
      userId,
      userId,
    ).run();
  }

  // Create or update lead
  if (!leadId) {
    leadId = generateId();
    await db.prepare(`
      INSERT INTO leads (id, title, phone, contact_id, source, status, assigned_to, created_by, destination, budget, pax)
      VALUES (?, ?, ?, ?, 'ai_extraction', 'new', ?, ?, ?, ?, ?)
    `).bind(
      leadId,
      dest ? `${dest} Trip` : 'AI-Extracted Lead',
      callLog?.from_number || '',
      contactId,
      userId,
      userId,
      dest,
      budget,
      paxCount,
    ).run();
  } else {
    // Update existing lead with extracted data
    const updates: string[] = [];
    const vals: (string | number | null)[] = [];
    if (dest) { updates.push('destination = ?'); vals.push(dest); }
    if (budget) { updates.push('budget = ?'); vals.push(budget); }
    if (paxCount) { updates.push('pax = ?'); vals.push(paxCount); }
    if (updates.length > 0) {
      updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
      vals.push(leadId);
      await db.prepare(
        `UPDATE leads SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...vals).run();
    }
  }

  // Mark extraction as confirmed
  await db.prepare(`
    UPDATE ai_call_extractions
    SET status = 'confirmed', reviewed_by = ?, reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
        created_lead_id = ?, created_contact_id = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = ?
  `).bind(userId, leadId, contactId, id).run();

  return success(c, { message: 'Extraction confirmed', leadId, contactId });
});

// ── POST /:id/reject — Reject extraction ─────────────────────

aiExtractionRoutes.post('/:id/reject', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const id = c.req.param('id');

  const existing = await db.prepare(
    'SELECT id, status FROM ai_call_extractions WHERE id = ?'
  ).bind(id).first<{ id: string; status: string }>();

  if (!existing) return notFound(c, 'Extraction');
  if (existing.status !== 'pending') {
    return error(c, 'Extraction already reviewed', 409);
  }

  await db.prepare(`
    UPDATE ai_call_extractions
    SET status = 'rejected', reviewed_by = ?, reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = ?
  `).bind(userId, id).run();

  return success(c, { message: 'Extraction rejected' });
});

// ── POST /:id/create-itinerary — Create itinerary from confirmed extraction ──

const createItinerarySchema = z.object({
  notes: z.string().optional(),
});

aiExtractionRoutes.post('/:id/create-itinerary', zValidator('json', createItinerarySchema), async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const extraction = await db.prepare(
    'SELECT * FROM ai_call_extractions WHERE id = ? AND status = ?'
  ).bind(id, 'confirmed').first<Record<string, any>>();

  if (!extraction) return error(c, 'Extraction not found or not confirmed', 404);

  const leadId = extraction.created_lead_id;
  if (!leadId) return error(c, 'No lead associated with this extraction', 422);

  const dest = extraction.destination || 'Unknown Destination';
  const paxCount = extraction.pax_count || 2;
  const travelDates = extraction.travel_dates ? JSON.parse(extraction.travel_dates) : null;
  const preferences = extraction.preferences ? JSON.parse(extraction.preferences) : [];

  // Calculate number of days
  let numDays = 3; // default
  if (travelDates?.from && travelDates?.to) {
    const from = new Date(travelDates.from);
    const to = new Date(travelDates.to);
    numDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400000));
  }

  const itineraryId = generateId();
  const title = `${dest} - ${numDays}N/${numDays + 1}D (${paxCount} Pax)`;

  await db.prepare(`
    INSERT INTO itineraries (id, lead_id, title, status, notes, currency, created_by)
    VALUES (?, ?, ?, 'draft', ?, 'INR', ?)
  `).bind(itineraryId, leadId, title, body.notes || `AI-generated from call extraction. Preferences: ${preferences.join(', ')}`, userId).run();

  // Create day stubs
  const dayStmts = [];
  for (let d = 1; d <= numDays; d++) {
    const dayId = generateId();
    const dayDate = travelDates?.from
      ? new Date(new Date(travelDates.from).getTime() + (d - 1) * 86400000).toISOString().slice(0, 10)
      : null;
    dayStmts.push(
      db.prepare(`
        INSERT INTO itinerary_days (id, itinerary_id, day_number, title, city)
        VALUES (?, ?, ?, ?, ?)
      `).bind(dayId, itineraryId, d, `Day ${d}${dayDate ? ` (${dayDate})` : ''}`, d === 1 ? dest : null)
    );
  }
  if (dayStmts.length > 0) await db.batch(dayStmts);

  // Update lead status to requirement_gathered if currently new/contacted
  await db.prepare(`
    UPDATE leads SET status = 'requirement_gathered',
      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = ? AND status IN ('new', 'contacted')
  `).bind(leadId).run();

  // Log activity
  await db.prepare(`
    INSERT INTO lead_activities (id, lead_id, type, content, metadata, created_by)
    VALUES (?, ?, 'note', 'Itinerary created from AI call extraction', ?, ?)
  `).bind(generateId(), leadId, JSON.stringify({ itineraryId, extractionId: id }), userId).run();

  return success(c, { itineraryId, title, message: 'Itinerary created from extraction' });
});

// ── POST /:id/create-invoice — Create invoice from confirmed extraction ──

aiExtractionRoutes.post('/:id/create-invoice', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const id = c.req.param('id');

  const extraction = await db.prepare(
    'SELECT * FROM ai_call_extractions WHERE id = ? AND status = ?'
  ).bind(id, 'confirmed').first<Record<string, any>>();

  if (!extraction) return error(c, 'Extraction not found or not confirmed', 404);

  const leadId = extraction.created_lead_id;
  const contactId = extraction.created_contact_id;
  if (!leadId || !contactId) return error(c, 'No lead/contact associated', 422);

  const dest = extraction.destination || 'Travel Package';
  const budget = extraction.budget || 0;
  const paxCount = extraction.pax_count || 1;

  // Generate invoice number
  const countResult = await db.prepare(
    'SELECT COUNT(*) as cnt FROM invoices'
  ).first<{ cnt: number }>();
  const invoiceNum = `INV-${String((countResult?.cnt || 0) + 1).padStart(5, '0')}`;

  const invoiceId = generateId();
  const subtotal = budget > 0 ? budget : 0;
  const taxRate = 0.05; // 5% GST for travel
  const totalTax = Math.round(subtotal * taxRate * 100) / 100;
  const total = subtotal + totalTax;

  await db.prepare(`
    INSERT INTO invoices (id, lead_id, contact_id, invoice_number, type, subtotal, taxable_amount, tax_type, cgst, sgst, total_tax, total, currency, status, balance_due, notes, created_by)
    VALUES (?, ?, ?, ?, 'proforma', ?, ?, 'gst', ?, ?, ?, ?, 'INR', 'draft', ?, ?, ?)
  `).bind(
    invoiceId, leadId, contactId, invoiceNum,
    subtotal, subtotal,
    Math.round(totalTax / 2 * 100) / 100, // CGST
    Math.round(totalTax / 2 * 100) / 100, // SGST
    totalTax, total, total,
    `Auto-generated from AI extraction for ${dest} (${paxCount} pax)`,
    userId,
  ).run();

  // Add line item
  const itemId = generateId();
  await db.prepare(`
    INSERT INTO invoice_items (id, invoice_id, description, hsn_code, quantity, rate, taxable_amount, tax_rate, tax_amount, amount)
    VALUES (?, ?, ?, '998551', ?, ?, ?, 5, ?, ?)
  `).bind(
    itemId, invoiceId,
    `${dest} Travel Package (${paxCount} Pax)`,
    paxCount, budget > 0 ? Math.round(budget / paxCount) : 0,
    subtotal, totalTax, total,
  ).run();

  // Log activity
  await db.prepare(`
    INSERT INTO lead_activities (id, lead_id, type, content, metadata, created_by)
    VALUES (?, ?, 'note', 'Proforma invoice created from AI call extraction', ?, ?)
  `).bind(generateId(), leadId, JSON.stringify({ invoiceId, extractionId: id, invoiceNumber: invoiceNum }), userId).run();

  return success(c, { invoiceId, invoiceNumber: invoiceNum, total, message: 'Invoice created from extraction' });
});

// ── POST /:id/schedule-followup — Schedule follow-up from extraction ──

const scheduleFollowupSchema = z.object({
  scheduledAt: z.string(),
  type: z.enum(['call', 'email', 'whatsapp', 'visit']).default('call'),
  notes: z.string().optional(),
});

aiExtractionRoutes.post('/:id/schedule-followup', zValidator('json', scheduleFollowupSchema), async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const extraction = await db.prepare(
    'SELECT created_lead_id FROM ai_call_extractions WHERE id = ? AND status = ?'
  ).bind(id, 'confirmed').first<{ created_lead_id: string | null }>();

  if (!extraction) return error(c, 'Extraction not found or not confirmed', 404);
  if (!extraction.created_lead_id) return error(c, 'No lead associated with this extraction', 422);

  const followUpId = generateId();
  await db.prepare(`
    INSERT INTO follow_ups (id, lead_id, scheduled_at, type, notes, status, created_by)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).bind(
    followUpId,
    extraction.created_lead_id,
    body.scheduledAt,
    body.type,
    body.notes || `Follow-up from AI extraction review`,
    userId,
  ).run();

  // Log activity
  await db.prepare(`
    INSERT INTO lead_activities (id, lead_id, type, content, metadata, created_by)
    VALUES (?, ?, 'follow_up', ?, ?, ?)
  `).bind(
    generateId(),
    extraction.created_lead_id,
    `Follow-up scheduled: ${body.type} on ${body.scheduledAt}`,
    JSON.stringify({ followUpId, extractionId: id }),
    userId,
  ).run();

  return success(c, { followUpId, message: 'Follow-up scheduled' });
});

// ── GET /usage — AI usage summary (TICKET-411) ───────────────

aiExtractionRoutes.get('/usage/summary', rbac(['admin']), async (c) => {
  const db = c.get('tenantDb');
  const url = new URL(c.req.url);
  const period = url.searchParams.get('period') || '30d';

  let dateFilter: string;
  switch (period) {
    case '7d': dateFilter = "datetime('now', '-7 days')"; break;
    case '90d': dateFilter = "datetime('now', '-90 days')"; break;
    default: dateFilter = "datetime('now', '-30 days')";
  }

  const rows = await db.prepare(`
    SELECT
      task_type,
      model_name,
      COUNT(*) as request_count,
      SUM(input_tokens) as total_input_tokens,
      SUM(output_tokens) as total_output_tokens,
      SUM(cost_estimate) as total_cost,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
      AVG(duration_ms) as avg_duration_ms
    FROM ai_usage_log
    WHERE created_at >= ${dateFilter}
    GROUP BY task_type, model_name
    ORDER BY total_cost DESC
  `).all();

  const totalCost = (rows.results || []).reduce((sum: number, r: any) => sum + (r.total_cost || 0), 0);
  const totalRequests = (rows.results || []).reduce((sum: number, r: any) => sum + (r.request_count || 0), 0);

  return success(c, {
    period,
    totalCost: Math.round(totalCost * 10000) / 10000,
    totalRequests,
    breakdown: (rows.results || []).map((r: any) => ({
      taskType: r.task_type,
      modelName: r.model_name,
      requestCount: r.request_count,
      totalInputTokens: r.total_input_tokens,
      totalOutputTokens: r.total_output_tokens,
      totalCost: Math.round((r.total_cost || 0) * 10000) / 10000,
      successCount: r.success_count,
      avgDurationMs: Math.round(r.avg_duration_ms || 0),
    })),
  });
});

export default aiExtractionRoutes;
