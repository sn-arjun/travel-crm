/**
 * AI Marketing Suggestions Routes
 *
 * Generate and manage AI-powered marketing suggestions based on business data.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { AppContext } from '../types';
import { success, created, error, notFound } from '../utils/response';
import { generateId } from '../utils/uuid';
import { AIRouter } from '../services/ai-router';
import { rbac } from '../middleware/rbac';

const marketingSuggestionRoutes = new Hono<AppContext>();

// ── Schemas ───────────────────────────────────────────────────

const generateSchema = z.object({
  focusArea: z.enum(['campaigns', 'content', 'reengagement', 'seasonal', 'general']).default('general'),
  context: z.string().optional(),
});

// ── Helper: parse suggestion row ─────────────────────────────

function parseSuggestion(row: Record<string, any>) {
  return {
    id: row.id,
    suggestionType: row.suggestion_type,
    title: row.title,
    description: row.description,
    details: row.details ? JSON.parse(row.details) : null,
    priority: row.priority,
    status: row.status,
    targetSegment: row.target_segment,
    estimatedImpact: row.estimated_impact,
    basis: row.basis,
    modelUsed: row.model_used,
    tokensUsed: row.tokens_used,
    costEstimate: row.cost_estimate,
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── GET / — List suggestions ─────────────────────────────────

marketingSuggestionRoutes.get('/', async (c) => {
  const db = c.get('tenantDb');
  const url = new URL(c.req.url);

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;
  const suggestionType = url.searchParams.get('type');
  const status = url.searchParams.get('status');
  const priority = url.searchParams.get('priority');

  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (suggestionType) { conditions.push('ms.suggestion_type = ?'); values.push(suggestionType); }
  if (status) { conditions.push('ms.status = ?'); values.push(status); }
  if (priority) { conditions.push('ms.priority = ?'); values.push(priority); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db.prepare(
    `SELECT COUNT(*) as total FROM ai_marketing_suggestions ms ${where}`
  ).bind(...values).first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const rows = await db.prepare(`
    SELECT ms.*, u.name as created_by_name
    FROM ai_marketing_suggestions ms
    LEFT JOIN users u ON ms.created_by = u.id
    ${where}
    ORDER BY CASE ms.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, ms.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...values, limit, offset).all();

  return c.json({
    success: true,
    data: (rows.results || []).map(parseSuggestion),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  });
});

// ── POST /generate — Generate marketing suggestions ──────────

marketingSuggestionRoutes.post('/generate', rbac(['admin', 'sales_manager']), zValidator('json', generateSchema), async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const data = c.req.valid('json');

  // Gather business context from the DB
  const [leadStats, recentDeals, topDestinations] = await Promise.all([
    db.prepare(`
      SELECT status, COUNT(*) as count FROM leads
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY status
    `).all(),
    db.prepare(`
      SELECT destination, COUNT(*) as count, SUM(budget) as total_budget
      FROM leads WHERE status IN ('won', 'booked') AND destination IS NOT NULL
      AND created_at >= datetime('now', '-90 days')
      GROUP BY destination ORDER BY count DESC LIMIT 10
    `).all(),
    db.prepare(`
      SELECT destination, COUNT(*) as count FROM leads
      WHERE destination IS NOT NULL AND created_at >= datetime('now', '-30 days')
      GROUP BY destination ORDER BY count DESC LIMIT 10
    `).all(),
  ]);

  const businessContext = {
    leadStats: (leadStats.results || []).map((r: any) => ({ status: r.status, count: r.count })),
    recentDeals: (recentDeals.results || []).map((r: any) => ({ destination: r.destination, count: r.count, revenue: r.total_budget })),
    trendingDestinations: (topDestinations.results || []).map((r: any) => ({ destination: r.destination, inquiries: r.count })),
  };

  const systemPrompt = `You are a travel marketing strategist for a travel agency CRM. Analyze business data and generate actionable marketing suggestions.
Output format: JSON array of objects, each with: suggestion_type (campaign_idea|content_calendar|trending_topic|seasonal_offer|reengagement), title, description, details (object with specifics), priority (low|medium|high|urgent), target_segment, estimated_impact, basis.
Focus area: ${data.focusArea}
Generate 3-5 diverse, actionable suggestions based on the data provided.`;

  const userPrompt = `Business data:\n${JSON.stringify(businessContext, null, 2)}${data.context ? `\n\nAdditional context: ${data.context}` : ''}`;

  const aiRouter = new AIRouter(c.env);
  const startTime = Date.now();
  const aiResult = await aiRouter.route('marketing_suggestion' as any, userPrompt, systemPrompt);
  const durationMs = Date.now() - startTime;

  // Parse suggestions from AI output
  let suggestions: any[] = [];
  try {
    const jsonMatch = aiResult.result.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      suggestions = JSON.parse(jsonMatch[0]);
    }
  } catch (_e) {
    return error(c, 'Failed to parse AI suggestions', 500);
  }

  if (suggestions.length === 0) {
    return error(c, 'AI did not generate any suggestions', 500);
  }

  // Insert suggestions
  const costPerSuggestion = aiResult.cost / suggestions.length;
  const tokensPerSuggestion = Math.ceil((aiResult.inputTokens + aiResult.outputTokens) / suggestions.length);
  const ids: string[] = [];

  const stmts = suggestions.map((s: any) => {
    const id = generateId();
    ids.push(id);
    return db.prepare(`
      INSERT INTO ai_marketing_suggestions (id, suggestion_type, title, description, details, priority, target_segment, estimated_impact, basis, model_used, tokens_used, cost_estimate, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      s.suggestion_type || 'campaign_idea',
      s.title || 'Marketing Suggestion',
      s.description || '',
      s.details ? JSON.stringify(s.details) : null,
      s.priority || 'medium',
      s.target_segment || null,
      s.estimated_impact || null,
      s.basis || null,
      aiResult.model,
      tokensPerSuggestion,
      costPerSuggestion,
      userId,
    );
  });

  await db.batch(stmts);

  await aiRouter.logUsage(db, 'marketing_suggestion' as any, aiResult.model, aiResult.inputTokens, aiResult.outputTokens, aiResult.cost, undefined, durationMs);

  return created(c, { ids, count: ids.length, message: `Generated ${ids.length} marketing suggestions` });
});

// ── PUT /:id/accept — Accept suggestion ──────────────────────

marketingSuggestionRoutes.put('/:id/accept', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const existing = await db.prepare('SELECT id, status FROM ai_marketing_suggestions WHERE id = ?').bind(id).first<{ id: string; status: string }>();
  if (!existing) return notFound(c, 'Suggestion');
  if (existing.status !== 'pending') return error(c, 'Suggestion already reviewed', 409);

  await db.prepare(`
    UPDATE ai_marketing_suggestions SET status = 'accepted', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?
  `).bind(id).run();

  return success(c, { message: 'Suggestion accepted' });
});

// ── PUT /:id/dismiss — Dismiss suggestion ────────────────────

marketingSuggestionRoutes.put('/:id/dismiss', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const existing = await db.prepare('SELECT id, status FROM ai_marketing_suggestions WHERE id = ?').bind(id).first<{ id: string; status: string }>();
  if (!existing) return notFound(c, 'Suggestion');
  if (existing.status !== 'pending') return error(c, 'Suggestion already reviewed', 409);

  await db.prepare(`
    UPDATE ai_marketing_suggestions SET status = 'dismissed', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?
  `).bind(id).run();

  return success(c, { message: 'Suggestion dismissed' });
});

export default marketingSuggestionRoutes;
