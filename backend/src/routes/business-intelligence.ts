/**
 * AI Business Intelligence Routes — M26
 * TICKET-478 → TICKET-506
 *
 * Briefings, health scores, customer intelligence,
 * team analytics, and AI metering dashboard.
 */

import { Hono } from 'hono';
import type { AppContext } from '../types';
import { success, error, paginated, notFound } from '../utils/response';
import { generateId } from '../utils/uuid';
import { AIRouter, AiUnavailableError, type AITask, type AIResponse } from '../services/ai-router';

/** Runs the AI call only; resolves null when no provider is available so the caller can still return its SQL data. */
async function routeOrNull(router: AIRouter, task: AITask, prompt: string, system: string): Promise<AIResponse | null> {
  try {
    return await router.route(task, prompt, system);
  } catch (e) {
    if (e instanceof AiUnavailableError) return null;
    throw e;
  }
}
import { incrementUsage } from '../middleware/usage-cap';

import { aiAwareErrorHandler } from '../utils/ai-unavailable';

const app = new Hono<AppContext>();
app.onError(aiAwareErrorHandler);

// ============================================================
// BRIEFINGS (TICKET-482–485)
// ============================================================

// Generate a briefing on-demand
app.post('/briefings/generate', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const env = c.env;
  const { type } = await c.req.json<{ type: 'daily' | 'weekly' | 'monthly' }>();

  const now = new Date();
  const period = type === 'daily'
    ? now.toISOString().substring(0, 10)
    : type === 'weekly'
      ? `${now.getFullYear()}-W${String(Math.ceil(((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7)).padStart(2, '0')}`
      : now.toISOString().substring(0, 7);

  // Collect metrics
  const metrics: Record<string, number | string> = {};

  const daysBack = type === 'daily' ? 1 : type === 'weekly' ? 7 : 30;
  const since = new Date(Date.now() - daysBack * 86400000).toISOString();

  const [newLeads, wonLeads, lostLeads, totalRevenue, openFollowUps, newContacts] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as c FROM leads WHERE created_at >= ?`).bind(since).first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) as c FROM leads WHERE status = 'won' AND updated_at >= ?`).bind(since).first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) as c FROM leads WHERE status = 'lost' AND updated_at >= ?`).bind(since).first<{ c: number }>(),
    db.prepare(`SELECT COALESCE(SUM(total), 0) as t FROM invoices WHERE status = 'paid' AND updated_at >= ?`).bind(since).first<{ t: number }>(),
    db.prepare(`SELECT COUNT(*) as c FROM follow_ups WHERE status = 'pending' AND scheduled_at <= ?`).bind(now.toISOString()).first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) as c FROM contacts WHERE created_at >= ?`).bind(since).first<{ c: number }>(),
  ]);

  metrics.newLeads = newLeads?.c || 0;
  metrics.wonLeads = wonLeads?.c || 0;
  metrics.lostLeads = lostLeads?.c || 0;
  metrics.totalRevenue = totalRevenue?.t || 0;
  metrics.pendingFollowUps = openFollowUps?.c || 0;
  metrics.newContacts = newContacts?.c || 0;

  const conversionRate = (metrics.newLeads as number) > 0
    ? ((metrics.wonLeads as number) / (metrics.newLeads as number) * 100).toFixed(1)
    : '0.0';
  metrics.conversionRate = conversionRate;

  const taskType: AITask = type === 'daily' ? 'daily_briefing' : type === 'weekly' ? 'weekly_briefing' : 'monthly_briefing';
  const router = new AIRouter(env);
  const prompt = `Generate a ${type} business briefing for a travel agency CRM. Period: ${period}. Metrics: ${JSON.stringify(metrics)}. Output JSON with: { title, sections: [{ heading, body }], highlights: [string], actionItems: [string] }`;
  const aiResult = await router.route(taskType, prompt, 'You are a business intelligence analyst for a travel agency. Generate concise, actionable briefings. Always respond with valid JSON.');

  let parsed;
  try {
    parsed = JSON.parse(aiResult.result);
  } catch {
    parsed = { title: `${type.charAt(0).toUpperCase() + type.slice(1)} Briefing — ${period}`, sections: [{ heading: 'Summary', body: aiResult.result }], highlights: [], actionItems: [] };
  }

  const id = generateId();
  await db.prepare(`INSERT INTO ai_briefings (id, user_id, briefing_type, title, content, metrics, highlights, period, model_used, cost_estimate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, userId, type, parsed.title || `${type} Briefing`, JSON.stringify(parsed.sections || []), JSON.stringify(metrics), JSON.stringify(parsed.highlights || []), period, aiResult.model, aiResult.cost)
    .run();

  // Log usage
  const usageId = generateId();
  await db.prepare(`INSERT INTO ai_usage_log (id, task_type, model_name, input_tokens, output_tokens, cost_estimate, success) VALUES (?, ?, ?, ?, ?, ?, 1)`)
    .bind(usageId, taskType, aiResult.model, aiResult.inputTokens, aiResult.outputTokens, aiResult.cost)
    .run();

  const briefing = await db.prepare(`SELECT * FROM ai_briefings WHERE id = ?`).bind(id).first() as any;
  return success(c, { ...briefing, type: briefing?.briefing_type });
});

// List briefings
app.get('/briefings', async (c) => {
  const db = c.get('tenantDb');
  const type = c.req.query('type');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');

  let sql = 'SELECT * FROM ai_briefings';
  const params: string[] = [];
  if (type) {
    sql += ' WHERE briefing_type = ?';
    params.push(type);
  }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

  const result = await db.prepare(sql).bind(...params, limit, offset).all();
  const countSql = type
    ? `SELECT COUNT(*) as total FROM ai_briefings WHERE briefing_type = ?`
    : `SELECT COUNT(*) as total FROM ai_briefings`;
  const countResult = type
    ? await db.prepare(countSql).bind(type).first<{ total: number }>()
    : await db.prepare(countSql).first<{ total: number }>();

  return paginated(c, result.results || [], countResult?.total || 0, limit, offset);
});

// Get single briefing
app.get('/briefings/:id', async (c) => {
  const db = c.get('tenantDb');
  const briefing = await db.prepare(`SELECT * FROM ai_briefings WHERE id = ?`).bind(c.req.param('id')).first();
  if (!briefing) return notFound(c, 'Briefing');
  // Mark as read
  if (!briefing.read_at) {
    await db.prepare(`UPDATE ai_briefings SET read_at = ? WHERE id = ?`).bind(new Date().toISOString(), c.req.param('id')).run();
  }
  return success(c, briefing);
});

// ============================================================
// BUSINESS HEALTH SCORE (TICKET-502)
// ============================================================

app.post('/health-score/calculate', async (c) => {
  const db = c.get('tenantDb');
  const env = c.env;

  const now = new Date();
  const last30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const prev30 = new Date(Date.now() - 60 * 86400000).toISOString();

  // Gather data for scoring
  const [revenue, prevRevenue, leads, wonLeads, contacts, overdueFollowUps, paidInvoices, overdueInvoices] = await Promise.all([
    db.prepare(`SELECT COALESCE(SUM(total), 0) as t FROM invoices WHERE status = 'paid' AND updated_at >= ?`).bind(last30).first<{ t: number }>(),
    db.prepare(`SELECT COALESCE(SUM(total), 0) as t FROM invoices WHERE status = 'paid' AND updated_at >= ? AND updated_at < ?`).bind(prev30, last30).first<{ t: number }>(),
    db.prepare(`SELECT COUNT(*) as c FROM leads WHERE created_at >= ?`).bind(last30).first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) as c FROM leads WHERE status = 'won' AND updated_at >= ?`).bind(last30).first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) as c FROM contacts WHERE created_at >= ?`).bind(last30).first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) as c FROM follow_ups WHERE status = 'pending' AND scheduled_at < ?`).bind(now.toISOString()).first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) as c FROM invoices WHERE status = 'paid' AND updated_at >= ?`).bind(last30).first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) as c FROM invoices WHERE status = 'sent' AND due_date < ?`).bind(now.toISOString().substring(0, 10)).first<{ c: number }>(),
  ]);

  const metrics = {
    revenue: revenue?.t || 0,
    prevRevenue: prevRevenue?.t || 0,
    newLeads: leads?.c || 0,
    wonLeads: wonLeads?.c || 0,
    newContacts: contacts?.c || 0,
    overdueFollowUps: overdueFollowUps?.c || 0,
    paidInvoices: paidInvoices?.c || 0,
    overdueInvoices: overdueInvoices?.c || 0,
  };

  const router = new AIRouter(env);
  const prompt = `Analyze these travel agency CRM metrics for the last 30 days and output a business health score. Metrics: ${JSON.stringify(metrics)}. Output JSON: { overallScore: 0-100, revenueScore: 0-100, pipelineScore: 0-100, customerScore: 0-100, teamScore: 0-100, operationsScore: 0-100, alerts: [string], recommendations: [string], trends: { revenue: "up"|"down"|"stable", pipeline: "up"|"down"|"stable" } }`;
  const aiResult = await router.route('business_health_score', prompt, 'You are a business health analyst. Score each dimension 0-100. Be data-driven. Always respond with valid JSON.');

  const fallbackScore = { overallScore: 50, revenueScore: 50, pipelineScore: 50, customerScore: 50, teamScore: 50, operationsScore: 50, alerts: [], recommendations: [], trends: {} };
  let parsed;
  try {
    const p = JSON.parse(aiResult.result);
    // Validate required field; fall back if AI returned a stub or incomplete response
    parsed = (typeof p.overallScore === 'number') ? p : fallbackScore;
  } catch {
    parsed = fallbackScore;
  }

  const prevScore = await db.prepare(`SELECT overall_score FROM ai_business_health_scores ORDER BY calculated_at DESC LIMIT 1`).first<{ overall_score: number }>();

  const id = generateId();
  await db.prepare(`INSERT INTO ai_business_health_scores (id, overall_score, revenue_score, pipeline_score, customer_score, team_score, operations_score, breakdown, trends, alerts, recommendations, previous_score, score_change, model_used, cost_estimate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, parsed.overallScore, parsed.revenueScore, parsed.pipelineScore, parsed.customerScore, parsed.teamScore, parsed.operationsScore, JSON.stringify(metrics), JSON.stringify(parsed.trends || {}), JSON.stringify(parsed.alerts || []), JSON.stringify(parsed.recommendations || []), prevScore?.overall_score || null, prevScore ? parsed.overallScore - prevScore.overall_score : null, aiResult.model, aiResult.cost)
    .run();

  // Log usage
  const usageId = generateId();
  await db.prepare(`INSERT INTO ai_usage_log (id, task_type, model_name, input_tokens, output_tokens, cost_estimate, success) VALUES (?, ?, ?, ?, ?, ?, 1)`)
    .bind(usageId, 'business_health_score', aiResult.model, aiResult.inputTokens, aiResult.outputTokens, aiResult.cost)
    .run();

  const score = await db.prepare(`SELECT * FROM ai_business_health_scores WHERE id = ?`).bind(id).first<Record<string, any>>();
  if (!score) return success(c, { overallScore: parsed.overallScore, ...parsed, provider: aiResult.provider });
  return success(c, {
    id: score.id,
    overallScore: score.overall_score,
    revenueScore: score.revenue_score,
    pipelineScore: score.pipeline_score,
    customerScore: score.customer_score,
    teamScore: score.team_score,
    operationsScore: score.operations_score,
    breakdown: score.breakdown,
    trends: score.trends,
    alerts: score.alerts,
    recommendations: score.recommendations,
    previousScore: score.previous_score,
    scoreChange: score.score_change,
    modelUsed: score.model_used,
    costEstimate: score.cost_estimate,
    calculatedAt: score.calculated_at,
    provider: aiResult.provider,
  });
});

app.get('/health-score', async (c) => {
  const db = c.get('tenantDb');
  const score = await db.prepare(`SELECT * FROM ai_business_health_scores ORDER BY calculated_at DESC LIMIT 1`).first<Record<string, any>>();
  if (!score) return success(c, { overallScore: 0, status: 'no_data', lastCalculated: null });
  return success(c, {
    id: score.id,
    overallScore: score.overall_score,
    revenueScore: score.revenue_score,
    pipelineScore: score.pipeline_score,
    customerScore: score.customer_score,
    teamScore: score.team_score,
    operationsScore: score.operations_score,
    breakdown: score.breakdown,
    trends: score.trends,
    alerts: score.alerts,
    recommendations: score.recommendations,
    previousScore: score.previous_score,
    scoreChange: score.score_change,
    modelUsed: score.model_used,
    costEstimate: score.cost_estimate,
    calculatedAt: score.calculated_at,
  });
});

app.get('/health-score/history', async (c) => {
  const db = c.get('tenantDb');
  const limit = parseInt(c.req.query('limit') || '30');
  const result = await db.prepare(`SELECT * FROM ai_business_health_scores ORDER BY calculated_at DESC LIMIT ?`).bind(limit).all();
  return success(c, result.results || []);
});

// ============================================================
// DESTINATION PROFITABILITY (TICKET-487)
// ============================================================

app.get('/destination-profitability', async (c) => {
  const db = c.get('tenantDb');
  const env = c.env;

  const destinations = await db.prepare(`
    SELECT l.destination, COUNT(*) as lead_count,
      SUM(CASE WHEN l.status = 'won' THEN 1 ELSE 0 END) as won_count,
      SUM(CASE WHEN l.status = 'won' THEN l.estimated_value ELSE 0 END) as total_revenue,
      AVG(CASE WHEN l.status = 'won' THEN l.estimated_value ELSE NULL END) as avg_deal_size
    FROM leads l
    WHERE l.destination IS NOT NULL AND l.destination != ''
    GROUP BY l.destination
    ORDER BY total_revenue DESC
    LIMIT 20
  `).all();

  const router = new AIRouter(env);
  const prompt = `Analyze destination profitability for a travel agency. Data: ${JSON.stringify(destinations.results || [])}. Output JSON: { destinations: [{ name, revenue, margin, leadCount, conversionRate, recommendation }], topPerformer, underPerformer, insights: [string] }`;
  const aiResult = await routeOrNull(router, 'destination_profitability', prompt, 'You are a travel business analyst. Analyze destination data and provide actionable insights. Always respond with valid JSON.');

  if (!aiResult) {
    // No AI provider: the SQL aggregates are still real, only the commentary is missing.
    return success(c, {
      destinations: destinations.results || [], topPerformer: null, underPerformer: null, insights: null,
      rawData: destinations.results || [], aiUnavailable: true, model: null, cost: 0, provider: null,
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(aiResult.result);
  } catch {
    parsed = { destinations: destinations.results || [], insights: [] };
  }

  return success(c, { ...parsed, rawData: destinations.results || [], model: aiResult.model, cost: aiResult.cost, provider: aiResult.provider });
});

// ============================================================
// SEASONAL DEMAND (TICKET-488)
// ============================================================

app.get('/seasonal-demand', async (c) => {
  const db = c.get('tenantDb');
  const env = c.env;

  const monthly = await db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as lead_count,
      SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won_count
    FROM leads
    WHERE created_at >= datetime('now', '-12 months')
    GROUP BY month
    ORDER BY month
  `).all();

  const byDestMonth = await db.prepare(`
    SELECT destination, strftime('%m', created_at) as month_num, COUNT(*) as count
    FROM leads
    WHERE destination IS NOT NULL AND destination != '' AND created_at >= datetime('now', '-24 months')
    GROUP BY destination, month_num
    ORDER BY destination, month_num
  `).all();

  const router = new AIRouter(env);
  const prompt = `Analyze seasonal demand for a travel agency. Monthly data: ${JSON.stringify(monthly.results || [])}. By destination/month: ${JSON.stringify(byDestMonth.results || [])}. Output JSON: { peakMonths: [string], slowMonths: [string], forecast: [{ month, predictedLeads }], destinationSeasonality: [{ destination, peakMonths, slowMonths }], recommendations: [string] }`;
  const aiResult = await router.route('seasonal_demand', prompt, 'You are a travel demand analyst. Identify seasonal patterns and provide forecasts. Always respond with valid JSON.');

  let parsed;
  try {
    parsed = JSON.parse(aiResult.result);
  } catch {
    parsed = { peakMonths: [], slowMonths: [], forecast: [], recommendations: [] };
  }

  return success(c, { ...parsed, model: aiResult.model, cost: aiResult.cost, provider: aiResult.provider });
});

// ============================================================
// CUSTOMER LTV (TICKET-489)
// ============================================================

app.post('/customer-ltv/:contactId', async (c) => {
  const db = c.get('tenantDb');
  const env = c.env;
  const contactId = c.req.param('contactId');

  const contact = await db.prepare(`SELECT * FROM contacts WHERE id = ?`).bind(contactId).first();
  if (!contact) return notFound(c, 'Contact');

  const leads = await db.prepare(`SELECT status, estimated_value, created_at FROM leads WHERE contact_id = ? ORDER BY created_at`).bind(contactId).all();
  const invoices = await db.prepare(`SELECT total, status, created_at FROM invoices WHERE contact_id = ? ORDER BY created_at`).bind(contactId).all();

  const router = new AIRouter(env);
  const prompt = `Calculate customer lifetime value for this travel agency customer. Contact: ${JSON.stringify({ name: contact.name, email: contact.email, created_at: contact.created_at })}. Leads: ${JSON.stringify(leads.results || [])}. Invoices: ${JSON.stringify(invoices.results || [])}. Output JSON: { lifetimeValue, predictedNextValue, frequency, recency, monetaryValue, segment, prediction: string, confidence: 0.0-1.0 }`;
  const aiResult = await router.route('customer_ltv', prompt, 'You are a customer analytics expert. Calculate RFM-based LTV. Always respond with valid JSON.');

  let parsed;
  try {
    parsed = JSON.parse(aiResult.result);
  } catch {
    parsed = { lifetimeValue: 0, predictedNextValue: 0, segment: 'unknown', confidence: 0 };
  }

  return success(c, { contactId, ...parsed, model: aiResult.model, cost: aiResult.cost });
});

// ============================================================
// CASH FLOW FORECAST (TICKET-490)
// ============================================================

app.get('/cash-flow-forecast', async (c) => {
  const db = c.get('tenantDb');
  const env = c.env;

  const pipeline = await db.prepare(`
    SELECT status, COUNT(*) as count, COALESCE(SUM(estimated_value), 0) as value
    FROM leads WHERE status IN ('new', 'contacted', 'qualified', 'proposal_sent', 'negotiation')
    GROUP BY status
  `).all();

  const pendingInvoices = await db.prepare(`
    SELECT COALESCE(SUM(total - COALESCE(paid_amount, 0)), 0) as receivable,
      COUNT(*) as count
    FROM invoices WHERE status IN ('sent', 'partially_paid')
  `).first<{ receivable: number; count: number }>();

  const recentPayments = await db.prepare(`
    SELECT strftime('%Y-%m', updated_at) as month, SUM(total) as amount
    FROM invoices WHERE status = 'paid' AND updated_at >= datetime('now', '-6 months')
    GROUP BY month ORDER BY month
  `).all();

  const router = new AIRouter(env);
  const prompt = `Forecast cash flow for next 3 months for a travel agency. Pipeline: ${JSON.stringify(pipeline.results || [])}. Pending receivables: ${JSON.stringify(pendingInvoices)}. Recent payments: ${JSON.stringify(recentPayments.results || [])}. Output JSON: { forecast: [{ month, predictedInflow, predictedOutflow, netCashFlow }], totalExpectedInflow, riskFactors: [string], recommendations: [string] }`;
  const aiResult = await router.route('cash_flow_forecast', prompt, 'You are a financial analyst for a travel agency. Provide realistic cash flow forecasts. Always respond with valid JSON.');

  let parsed;
  try {
    parsed = JSON.parse(aiResult.result);
  } catch {
    parsed = { forecast: [], riskFactors: [], recommendations: [] };
  }

  return success(c, { ...parsed, model: aiResult.model, cost: aiResult.cost, provider: aiResult.provider });
});

// ============================================================
// SALESPERSON EFFECTIVENESS (TICKET-492)
// ============================================================

app.get('/team-performance', async (c) => {
  const db = c.get('tenantDb');
  const env = c.env;
  const since = new Date(Date.now() - 30 * 86400000).toISOString();

  const teamStats = await db.prepare(`
    SELECT u.id, u.name, u.email,
      COUNT(l.id) as total_leads,
      SUM(CASE WHEN l.status = 'won' THEN 1 ELSE 0 END) as won_leads,
      SUM(CASE WHEN l.status = 'lost' THEN 1 ELSE 0 END) as lost_leads,
      SUM(CASE WHEN l.status = 'won' THEN l.estimated_value ELSE 0 END) as revenue,
      AVG(CASE WHEN l.status = 'won' THEN l.estimated_value ELSE NULL END) as avg_deal_size
    FROM users u
    LEFT JOIN leads l ON l.assigned_to = u.id AND l.created_at >= ?
    WHERE u.role IN ('sales_agent', 'sales_manager', 'admin')
    GROUP BY u.id
  `).bind(since).all();

  const router = new AIRouter(env);
  const prompt = `Score salesperson effectiveness for a travel agency team. Data: ${JSON.stringify(teamStats.results || [])}. Output JSON: { rankings: [{ userId, name, score: 0-100, strengths: [string], improvements: [string] }], topPerformer, insights: [string], coachingNeeds: [{ userId, area, suggestion }] }`;
  const aiResult = await routeOrNull(router, 'salesperson_scoring', prompt, 'You are a sales performance analyst. Be constructive and specific. Always respond with valid JSON.');

  if (!aiResult) {
    return success(c, {
      rankings: null, topPerformer: null, insights: null, coachingNeeds: null,
      rawData: teamStats.results || [], aiUnavailable: true, model: null, cost: 0, provider: null,
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(aiResult.result);
  } catch {
    parsed = { rankings: [], insights: [] };
  }

  return success(c, { ...parsed, rawData: teamStats.results || [], model: aiResult.model, cost: aiResult.cost, provider: aiResult.provider });
});

// ============================================================
// WORKLOAD BALANCING (TICKET-495)
// ============================================================

app.get('/workload-analysis', async (c) => {
  const db = c.get('tenantDb');

  const workload = await db.prepare(`
    SELECT u.id, u.name,
      (SELECT COUNT(*) FROM leads WHERE assigned_to = u.id AND status NOT IN ('won', 'lost', 'closed')) as active_leads,
      (SELECT COUNT(*) FROM follow_ups WHERE user_id = u.id AND status = 'pending') as pending_followups,
      (SELECT COUNT(*) FROM tasks WHERE assignee_id = u.id AND status IN ('pending', 'in_progress')) as active_tasks
    FROM users u
    WHERE u.role IN ('sales_agent', 'sales_manager', 'admin') AND u.is_active = 1
  `).all();

  const users = workload.results || [];
  const totalActiveLeads = users.reduce((s: number, u: any) => s + (u.active_leads || 0), 0);
  const avgLeadsPerUser = users.length > 0 ? totalActiveLeads / users.length : 0;
  const alerts: string[] = [];

  for (const u of users as any[]) {
    if (u.active_leads > avgLeadsPerUser * 1.5) {
      alerts.push(`${u.name} is overloaded with ${u.active_leads} active leads (avg: ${avgLeadsPerUser.toFixed(0)})`);
    }
    if (u.active_leads < avgLeadsPerUser * 0.5 && avgLeadsPerUser > 2) {
      alerts.push(`${u.name} has low workload (${u.active_leads} leads vs avg ${avgLeadsPerUser.toFixed(0)})`);
    }
    if (u.pending_followups > 20) {
      alerts.push(`${u.name} has ${u.pending_followups} overdue follow-ups`);
    }
  }

  return success(c, { users, avgLeadsPerUser, totalActiveLeads, alerts });
});

// ============================================================
// CUSTOMER SEGMENTATION (TICKET-496)
// ============================================================

app.post('/customer-segments/calculate', async (c) => {
  const db = c.get('tenantDb');
  const env = c.env;
  const limit = parseInt(c.req.query('limit') || '50');

  const contacts = await db.prepare(`
    SELECT c.id, c.name, c.email,
      (SELECT COUNT(*) FROM leads WHERE contact_id = c.id) as lead_count,
      (SELECT COUNT(*) FROM leads WHERE contact_id = c.id AND status = 'won') as won_count,
      (SELECT COALESCE(SUM(estimated_value), 0) FROM leads WHERE contact_id = c.id AND status = 'won') as total_value,
      (SELECT MAX(created_at) FROM leads WHERE contact_id = c.id) as last_lead_at,
      c.created_at
    FROM contacts c
    ORDER BY total_value DESC
    LIMIT ?
  `).bind(limit).all();

  const router = new AIRouter(env);
  const prompt = `Segment these travel agency customers. Data: ${JSON.stringify(contacts.results || [])}. For each customer, assign a segment (vip, high_potential, churn_risk, seasonal, dormant, new), confidence (0-1), churn risk (0-1), and predicted next booking date. Output JSON: { segments: [{ contactId, segment, confidence, churnRisk, nextTripPrediction, lifetimeValue, preferredChannel }] }`;
  const aiResult = await router.route('customer_segmentation', prompt, 'You are a customer segmentation expert. Use RFM analysis principles. Always respond with valid JSON.');

  let parsed;
  try {
    parsed = JSON.parse(aiResult.result);
  } catch {
    parsed = { segments: [] };
  }

  // Upsert segments
  const now = new Date().toISOString();
  for (const seg of (parsed.segments || [])) {
    const existing = await db.prepare(`SELECT id FROM ai_customer_segments WHERE contact_id = ?`).bind(seg.contactId).first();
    if (existing) {
      await db.prepare(`UPDATE ai_customer_segments SET segment = ?, confidence = ?, churn_risk = ?, next_trip_prediction = ?, lifetime_value = ?, preferred_channel = ?, last_calculated_at = ?, updated_at = ? WHERE contact_id = ?`)
        .bind(seg.segment, seg.confidence, seg.churnRisk, seg.nextTripPrediction, seg.lifetimeValue, seg.preferredChannel, now, now, seg.contactId)
        .run();
    } else {
      await db.prepare(`INSERT INTO ai_customer_segments (id, contact_id, segment, confidence, churn_risk, next_trip_prediction, lifetime_value, preferred_channel, last_calculated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(generateId(), seg.contactId, seg.segment, seg.confidence, seg.churnRisk, seg.nextTripPrediction, seg.lifetimeValue, seg.preferredChannel, now)
        .run();
    }
  }

  return success(c, { segmented: (parsed.segments || []).length, model: aiResult.model, cost: aiResult.cost });
});

app.get('/customer-segments', async (c) => {
  const db = c.get('tenantDb');
  const segment = c.req.query('segment');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  let sql = 'SELECT cs.*, c.name as contact_name, c.email as contact_email FROM ai_customer_segments cs LEFT JOIN contacts c ON cs.contact_id = c.id';
  const params: (string | number)[] = [];
  if (segment) {
    sql += ' WHERE cs.segment = ?';
    params.push(segment);
  }
  sql += ' ORDER BY cs.lifetime_value DESC LIMIT ? OFFSET ?';

  const result = await db.prepare(sql).bind(...params, limit, offset).all();
  const countSql = segment
    ? `SELECT COUNT(*) as total FROM ai_customer_segments WHERE segment = ?`
    : `SELECT COUNT(*) as total FROM ai_customer_segments`;
  const countResult = segment
    ? await db.prepare(countSql).bind(segment).first<{ total: number }>()
    : await db.prepare(countSql).first<{ total: number }>();

  return paginated(c, result.results || [], countResult?.total || 0, limit, offset);
});

// ============================================================
// TRENDING DESTINATIONS (TICKET-499)
// ============================================================

app.get('/trending-destinations', async (c) => {
  const db = c.get('tenantDb');
  const last30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const prev30 = new Date(Date.now() - 60 * 86400000).toISOString();

  const current = await db.prepare(`
    SELECT destination, COUNT(*) as count
    FROM leads WHERE destination IS NOT NULL AND destination != '' AND created_at >= ?
    GROUP BY destination ORDER BY count DESC LIMIT 10
  `).bind(last30).all();

  const previous = await db.prepare(`
    SELECT destination, COUNT(*) as count
    FROM leads WHERE destination IS NOT NULL AND destination != '' AND created_at >= ? AND created_at < ?
    GROUP BY destination ORDER BY count DESC LIMIT 10
  `).bind(prev30, last30).all();

  const currentMap = new Map((current.results || []).map((r: any) => [r.destination, r.count]));
  const prevMap = new Map((previous.results || []).map((r: any) => [r.destination, r.count]));

  const trending = (current.results || []).map((d: any) => ({
    destination: d.destination,
    currentCount: d.count,
    previousCount: prevMap.get(d.destination) || 0,
    growth: prevMap.has(d.destination) ? ((d.count - (prevMap.get(d.destination) as number)) / (prevMap.get(d.destination) as number) * 100).toFixed(1) : 'new',
  }));

  return success(c, { trending, period: 'last_30_days' });
});

// ============================================================
// LOST DEAL ANALYSIS (TICKET-500)
// ============================================================

app.get('/lost-deal-analysis', async (c) => {
  const db = c.get('tenantDb');
  const env = c.env;

  const lostLeads = await db.prepare(`
    SELECT destination, source, lost_reason, estimated_value, pax_adults, created_at, updated_at
    FROM leads WHERE status = 'lost'
    ORDER BY updated_at DESC LIMIT 50
  `).all();

  const byReason = await db.prepare(`
    SELECT lost_reason, COUNT(*) as count, COALESCE(SUM(estimated_value), 0) as lost_value
    FROM leads WHERE status = 'lost' AND lost_reason IS NOT NULL
    GROUP BY lost_reason ORDER BY count DESC
  `).all();

  const byStatus = await db.prepare(`
    SELECT status, COUNT(*) as count
    FROM leads WHERE status IN ('lost', 'cancelled', 'completed')
    GROUP BY status ORDER BY count DESC
  `).all();

  const router = new AIRouter(env);
  const prompt = `Analyze lost deals for a travel agency. By reason: ${JSON.stringify(byReason.results || [])}. By status breakdown: ${JSON.stringify(byStatus.results || [])}. Recent lost: ${JSON.stringify((lostLeads.results || []).slice(0, 20))}. Output JSON: { patterns: [string], topReasons: [{ reason, count, lostValue, actionItem }], stageDropoffs: [{ stage, count, suggestion }], recoverable: number, recommendations: [string] }`;
  const aiResult = await routeOrNull(router, 'lost_deal_analysis', prompt, 'You are a sales strategy analyst. Identify patterns in lost deals and suggest recovery actions. Always respond with valid JSON.');

  if (!aiResult) {
    return success(c, {
      patterns: null, topReasons: byReason.results || [], stageDropoffs: null, recoverable: null, recommendations: null,
      rawByReason: byReason.results || [], rawByStatus: byStatus.results || [],
      aiUnavailable: true, model: null, cost: 0, provider: null,
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(aiResult.result);
  } catch {
    parsed = { patterns: [], topReasons: byReason.results || [], recommendations: [] };
  }

  return success(c, { ...parsed, rawByReason: byReason.results || [], rawByStatus: byStatus.results || [], model: aiResult.model, cost: aiResult.cost, provider: aiResult.provider });
});

// ============================================================
// LEAD SOURCE ROI (TICKET-501)
// ============================================================

app.get('/lead-source-roi', async (c) => {
  const db = c.get('tenantDb');

  const sources = await db.prepare(`
    SELECT source,
      COUNT(*) as total_leads,
      SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won_leads,
      SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost_leads,
      COALESCE(SUM(CASE WHEN status = 'won' THEN estimated_value ELSE 0 END), 0) as total_revenue,
      COALESCE(AVG(CASE WHEN status = 'won' THEN estimated_value ELSE NULL END), 0) as avg_deal_size
    FROM leads
    WHERE source IS NOT NULL AND source != ''
    GROUP BY source
    ORDER BY total_revenue DESC
  `).all();

  const results = (sources.results || []).map((s: any) => ({
    source: s.source,
    totalLeads: s.total_leads,
    wonLeads: s.won_leads,
    lostLeads: s.lost_leads,
    totalRevenue: s.total_revenue,
    avgDealSize: s.avg_deal_size,
    conversionRate: s.total_leads > 0 ? ((s.won_leads / s.total_leads) * 100).toFixed(1) : '0.0',
  }));

  return success(c, results);
});

// ============================================================
// AI RECOMMENDATIONS FEED (TICKET-503)
// ============================================================

app.post('/recommendations/generate', async (c) => {
  const db = c.get('tenantDb');
  const env = c.env;
  const userId = c.get('userId');

  // Gather high-level metrics
  const [overdueFollowUps, hotLeads, staleLeads, overdueInvoices] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as c FROM follow_ups WHERE created_by = ? AND status = 'pending' AND scheduled_at < ?`).bind(userId, new Date().toISOString()).first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) as c FROM leads WHERE assigned_to = ? AND status NOT IN ('won', 'lost', 'closed') AND estimated_value > 100000`).bind(userId).first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) as c FROM leads WHERE assigned_to = ? AND status NOT IN ('won', 'lost', 'closed') AND updated_at < ?`).bind(userId, new Date(Date.now() - 7 * 86400000).toISOString()).first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) as c FROM invoices WHERE created_by = ? AND status = 'sent' AND due_date < ?`).bind(userId, new Date().toISOString().substring(0, 10)).first<{ c: number }>(),
  ]);

  const context = {
    overdueFollowUps: overdueFollowUps?.c || 0,
    hotLeads: hotLeads?.c || 0,
    staleLeads: staleLeads?.c || 0,
    overdueInvoices: overdueInvoices?.c || 0,
  };

  const router = new AIRouter(env);
  const prompt = `Generate actionable recommendations for a travel agency salesperson. Context: ${JSON.stringify(context)}. Output JSON: { recommendations: [{ title, description, reasoning, impactScore: 0.0-1.0, confidenceScore: 0.0-1.0, recommendationType: "prioritize"|"re_engage"|"upsell"|"timing"|"channel", actionUrl: "/leads?status=stale" }] }. Max 5 recommendations.`;
  const aiResult = await router.route('ai_recommendation_gen', prompt, 'You are a sales coach. Give practical, specific recommendations. Always respond with valid JSON.');

  let parsed;
  try {
    parsed = JSON.parse(aiResult.result);
  } catch {
    parsed = { recommendations: [] };
  }

  // Store recommendations
  const now = new Date().toISOString();
  for (const rec of (parsed.recommendations || [])) {
    const recId = generateId();
    await db.prepare(`INSERT INTO ai_recommendations (id, user_id, recommendation_type, title, description, reasoning, impact_score, confidence_score, action_url, status, model_used, cost_estimate, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`)
      .bind(recId, userId, rec.recommendationType || 'prioritize', rec.title, rec.description, rec.reasoning || '', rec.impactScore || 0.5, rec.confidenceScore || 0.5, rec.actionUrl || '', aiResult.model, aiResult.cost / Math.max((parsed.recommendations || []).length, 1), now, now)
      .run();
  }

  return success(c, { generated: (parsed.recommendations || []).length, model: aiResult.model, cost: aiResult.cost, provider: aiResult.provider });
});

// ============================================================
// AI USAGE METERING (TICKET-506)
// ============================================================

app.get('/usage', async (c) => {
  const db = c.get('tenantDb');
  const period = c.req.query('period') || '30d';
  const days = parseInt(period.replace('d', '')) || 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [totalUsage, byTask, byModel, byDay] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as calls, COALESCE(SUM(input_tokens), 0) as input_tokens, COALESCE(SUM(output_tokens), 0) as output_tokens, COALESCE(SUM(cost_estimate), 0) as total_cost FROM ai_usage_log WHERE created_at >= ?`).bind(since).first<{ calls: number; input_tokens: number; output_tokens: number; total_cost: number }>(),
    db.prepare(`SELECT task_type, COUNT(*) as calls, COALESCE(SUM(input_tokens + output_tokens), 0) as tokens, COALESCE(SUM(cost_estimate), 0) as cost FROM ai_usage_log WHERE created_at >= ? GROUP BY task_type ORDER BY cost DESC`).bind(since).all(),
    db.prepare(`SELECT model_name, COUNT(*) as calls, COALESCE(SUM(cost_estimate), 0) as cost FROM ai_usage_log WHERE created_at >= ? GROUP BY model_name ORDER BY cost DESC`).bind(since).all(),
    db.prepare(`SELECT strftime('%Y-%m-%d', created_at) as day, COUNT(*) as calls, COALESCE(SUM(cost_estimate), 0) as cost FROM ai_usage_log WHERE created_at >= ? GROUP BY day ORDER BY day`).bind(since).all(),
  ]);

  return success(c, {
    period,
    summary: totalUsage,
    byTask: byTask.results || [],
    byModel: byModel.results || [],
    daily: byDay.results || [],
  });
});

// Revenue pulse widget data (TICKET-491)
app.get('/revenue-pulse', async (c) => {
  const db = c.get('tenantDb');
  const now = new Date();
  const thisMonth = now.toISOString().substring(0, 7);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().substring(0, 7);

  const [currentRevenue, lastRevenue, pipelineValue, avgDealSize] = await Promise.all([
    db.prepare(`SELECT COALESCE(SUM(total), 0) as t FROM invoices WHERE status = 'paid' AND strftime('%Y-%m', updated_at) = ?`).bind(thisMonth).first<{ t: number }>(),
    db.prepare(`SELECT COALESCE(SUM(total), 0) as t FROM invoices WHERE status = 'paid' AND strftime('%Y-%m', updated_at) = ?`).bind(lastMonth).first<{ t: number }>(),
    db.prepare(`SELECT COALESCE(SUM(estimated_value), 0) as t FROM leads WHERE status NOT IN ('won', 'lost', 'closed')`).first<{ t: number }>(),
    db.prepare(`SELECT COALESCE(AVG(estimated_value), 0) as t FROM leads WHERE status = 'won' AND updated_at >= datetime('now', '-3 months')`).first<{ t: number }>(),
  ]);

  const current = currentRevenue?.t || 0;
  const last = lastRevenue?.t || 0;
  const momChange = last > 0 ? ((current - last) / last * 100) : 0;

  return success(c, {
    currentMonthRevenue: current,
    lastMonthRevenue: last,
    momChange: parseFloat(momChange.toFixed(1)),
    pipelineValue: pipelineValue?.t || 0,
    avgDealSize: avgDealSize?.t || 0,
  });
});

export default app;
