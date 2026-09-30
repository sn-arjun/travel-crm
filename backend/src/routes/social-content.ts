/**
 * AI Social Content Routes
 *
 * Generate social media content using AI for travel marketing.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { AppContext } from '../types';
import { success, created, error, notFound } from '../utils/response';
import { generateId } from '../utils/uuid';
import { AIRouter } from '../services/ai-router';

const socialContentRoutes = new Hono<AppContext>();

// ── Schemas ───────────────────────────────────────────────────

const generateSchema = z.object({
  platform: z.enum(['instagram', 'facebook', 'linkedin', 'twitter', 'blog']),
  topic: z.string().min(1).max(500),
  tone: z.enum(['professional', 'casual', 'exciting', 'informative']).default('professional'),
  language: z.string().default('en'),
  additionalContext: z.string().optional(),
});

const generateBatchSchema = z.object({
  platforms: z.array(z.enum(['instagram', 'facebook', 'linkedin', 'twitter', 'blog'])).min(1).max(5),
  topic: z.string().min(1).max(500),
  tone: z.enum(['professional', 'casual', 'exciting', 'informative']).default('professional'),
  language: z.string().default('en'),
  additionalContext: z.string().optional(),
});

const updateContentSchema = z.object({
  content: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  cta: z.string().optional(),
  status: z.enum(['draft', 'approved', 'published', 'archived']).optional(),
});

// ── Helper: parse content row ────────────────────────────────

function parseContent(row: Record<string, any>) {
  return {
    id: row.id,
    contentType: row.content_type,
    platform: row.platform,
    topic: row.topic,
    prompt: row.prompt,
    content: row.generated_text,
    hashtags: row.hashtags ? JSON.parse(row.hashtags) : [],
    mediaSuggestions: row.media_suggestions ? JSON.parse(row.media_suggestions) : [],
    cta: row.cta,
    tone: row.tone,
    language: row.language,
    status: row.status,
    modelUsed: row.model_used,
    tokensUsed: row.tokens_used,
    costEstimate: row.cost_estimate,
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── GET / — List content ─────────────────────────────────────

socialContentRoutes.get('/', async (c) => {
  const db = c.get('tenantDb');
  const url = new URL(c.req.url);

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;
  const platform = url.searchParams.get('platform');
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('search');

  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (platform) { conditions.push('sc.platform = ?'); values.push(platform); }
  if (status) { conditions.push('sc.status = ?'); values.push(status); }
  if (search) {
    conditions.push('(sc.generated_text LIKE ? OR sc.topic LIKE ?)');
    values.push(`%${search}%`, `%${search}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db.prepare(
    `SELECT COUNT(*) as total FROM ai_social_content sc ${where}`
  ).bind(...values).first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const rows = await db.prepare(`
    SELECT sc.*, u.name as created_by_name
    FROM ai_social_content sc
    LEFT JOIN users u ON sc.created_by = u.id
    ${where}
    ORDER BY sc.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...values, limit, offset).all();

  return c.json({
    success: true,
    data: (rows.results || []).map(parseContent),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  });
});

// ── POST /generate — Generate social content ─────────────────

socialContentRoutes.post('/generate', zValidator('json', generateSchema), async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const data = c.req.valid('json');

  const contentType = `${data.platform}_post`;

  const systemPrompt = `You are a travel marketing content expert. Generate engaging social media content for a travel agency.
Output format: JSON with fields: text, hashtags (array), media_suggestions (array of image/video ideas), cta (call to action)
Platform: ${data.platform}
Tone: ${data.tone}
Language: ${data.language}
Keep content authentic, engaging, and optimized for the platform's best practices.
For Instagram: use emojis, compelling visuals description, max 2200 chars.
For Facebook: longer form, storytelling, include a question.
For LinkedIn: professional, industry insights, travel trends.
For Twitter: concise, punchy, max 280 chars.
For Blog: outline with headings, key points, SEO-friendly.`;

  const userPrompt = `Topic: ${data.topic}${data.additionalContext ? `\nAdditional context: ${data.additionalContext}` : ''}`;

  const aiRouter = new AIRouter(c.env);
  const startTime = Date.now();
  const aiResult = await aiRouter.route('social_content_instagram' as any, userPrompt, systemPrompt);
  const durationMs = Date.now() - startTime;

  // Parse AI output
  let parsed: any = {};
  try {
    // Try to extract JSON from the response
    const jsonMatch = aiResult.result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    }
  } catch (_e) {
    parsed = { text: aiResult.result, hashtags: [], media_suggestions: [], cta: '' };
  }

  const id = generateId();
  await db.prepare(`
    INSERT INTO ai_social_content (id, content_type, platform, topic, prompt, generated_text, hashtags, media_suggestions, cta, tone, language, model_used, tokens_used, cost_estimate, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, contentType, data.platform, data.topic, userPrompt,
    parsed.text || aiResult.result,
    JSON.stringify(parsed.hashtags || []),
    JSON.stringify(parsed.media_suggestions || []),
    parsed.cta || '',
    data.tone, data.language,
    aiResult.model, aiResult.inputTokens + aiResult.outputTokens, aiResult.cost,
    userId,
  ).run();

  // Log AI usage
  await aiRouter.logUsage(db, 'social_content_instagram' as any, aiResult.model, aiResult.inputTokens, aiResult.outputTokens, aiResult.cost, undefined, durationMs);

  return created(c, parseContent({
    id,
    content_type: contentType,
    platform: data.platform,
    topic: data.topic,
    prompt: userPrompt,
    generated_text: parsed.text || aiResult.result,
    hashtags: JSON.stringify(parsed.hashtags || []),
    media_suggestions: JSON.stringify(parsed.media_suggestions || []),
    cta: parsed.cta || '',
    tone: data.tone,
    language: data.language,
    status: 'draft',
    model_used: aiResult.model,
    tokens_used: aiResult.inputTokens + aiResult.outputTokens,
    cost_estimate: aiResult.cost,
    created_by: userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
});

// ── POST /generate-batch — Generate for multiple platforms ───

socialContentRoutes.post('/generate-batch', zValidator('json', generateBatchSchema), async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const data = c.req.valid('json');

  const results: any[] = [];
  const aiRouter = new AIRouter(c.env);

  for (const platform of data.platforms) {
    const contentType = `${platform}_post`;

    const systemPrompt = `You are a travel marketing content expert. Generate engaging ${platform} content for a travel agency.
Output format: JSON with fields: text, hashtags (array), media_suggestions (array), cta (call to action)
Tone: ${data.tone}. Language: ${data.language}.`;

    const userPrompt = `Topic: ${data.topic}${data.additionalContext ? `\nContext: ${data.additionalContext}` : ''}`;

    const startTime = Date.now();
    const aiResult = await aiRouter.route('social_content_instagram' as any, userPrompt, systemPrompt);
    const durationMs = Date.now() - startTime;

    let parsed: any = {};
    try {
      const jsonMatch = aiResult.result.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch (_e) {
      parsed = { text: aiResult.result, hashtags: [], media_suggestions: [], cta: '' };
    }

    const id = generateId();
    await db.prepare(`
      INSERT INTO ai_social_content (id, content_type, platform, topic, prompt, generated_text, hashtags, media_suggestions, cta, tone, language, model_used, tokens_used, cost_estimate, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, contentType, platform, data.topic, userPrompt,
      parsed.text || aiResult.result,
      JSON.stringify(parsed.hashtags || []),
      JSON.stringify(parsed.media_suggestions || []),
      parsed.cta || '',
      data.tone, data.language,
      aiResult.model, aiResult.inputTokens + aiResult.outputTokens, aiResult.cost,
      userId,
    ).run();

    await aiRouter.logUsage(db, 'social_content_instagram' as any, aiResult.model, aiResult.inputTokens, aiResult.outputTokens, aiResult.cost, undefined, durationMs);

    results.push({ id, platform, contentType });
  }

  return created(c, { generated: results, count: results.length });
});

// ── GET /:id — Single content detail ─────────────────────────

socialContentRoutes.get('/:id', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const row = await db.prepare(`
    SELECT sc.*, u.name as created_by_name
    FROM ai_social_content sc
    LEFT JOIN users u ON sc.created_by = u.id
    WHERE sc.id = ?
  `).bind(id).first();

  if (!row) return notFound(c, 'Content');
  return success(c, parseContent(row));
});

// ── PUT /:id — Update content ────────────────────────────────

socialContentRoutes.put('/:id', zValidator('json', updateContentSchema), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const data = c.req.valid('json');

  const existing = await db.prepare('SELECT id FROM ai_social_content WHERE id = ?').bind(id).first();
  if (!existing) return notFound(c, 'Content');

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (data.content !== undefined) { updates.push('generated_text = ?'); values.push(data.content); }
  if (data.hashtags !== undefined) { updates.push('hashtags = ?'); values.push(JSON.stringify(data.hashtags)); }
  if (data.cta !== undefined) { updates.push('cta = ?'); values.push(data.cta); }
  if (data.status !== undefined) { updates.push('status = ?'); values.push(data.status); }

  if (updates.length === 0) return success(c, { message: 'No changes' });

  updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
  values.push(id);

  await db.prepare(`UPDATE ai_social_content SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

  return success(c, { message: 'Content updated' });
});

// ── DELETE /:id — Delete content ─────────────────────────────

socialContentRoutes.delete('/:id', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const existing = await db.prepare('SELECT id FROM ai_social_content WHERE id = ?').bind(id).first();
  if (!existing) return notFound(c, 'Content');

  await db.prepare('DELETE FROM ai_social_content WHERE id = ?').bind(id).run();
  return success(c, { message: 'Content deleted' });
});

export default socialContentRoutes;
