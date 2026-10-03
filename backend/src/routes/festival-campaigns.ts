/**
 * Festival Campaign Routes
 *
 * Seasonal/festival-tied marketing campaigns (Diwali, Christmas, etc.).
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { AppContext } from '../types';
import { success, created, notFound } from '../utils/response';
import { generateId } from '../utils/uuid';
import { requirePermission } from '../middleware/rbac';

const festivalCampaignRoutes = new Hono<AppContext>();

const createSchema = z.object({
  name: z.string().min(1),
  festivalName: z.string().min(1),
  festivalDate: z.string().min(1),
  daysBefore: z.number().int().min(0).default(3),
  campaignType: z.enum(['whatsapp', 'sms', 'email']).default('whatsapp'),
  messageBody: z.string().optional(),
});

function parseFestival(row: Record<string, any>) {
  return {
    id: row.id,
    name: row.name,
    festivalName: row.festival_name,
    festivalDate: row.festival_date,
    daysBefore: row.days_before,
    campaignType: row.campaign_type,
    isActive: !!row.is_active,
    messageBody: row.message_body,
    lastRunAt: row.last_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── GET / — List festival campaigns ──────────────────────────

festivalCampaignRoutes.get('/', requirePermission('marketing', 'view'), async (c) => {
  const db = c.get('tenantDb');
  const url = new URL(c.req.url);

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;
  const search = url.searchParams.get('search');

  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (search) {
    conditions.push('(name LIKE ? OR festival_name LIKE ?)');
    values.push(`%${search}%`, `%${search}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db.prepare(
    `SELECT COUNT(*) as total FROM festival_campaigns ${where}`
  ).bind(...values).first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const rows = await db.prepare(`
    SELECT * FROM festival_campaigns
    ${where}
    ORDER BY festival_date ASC
    LIMIT ? OFFSET ?
  `).bind(...values, limit, offset).all();

  return c.json({
    success: true,
    data: (rows.results || []).map(parseFestival),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  });
});

// ── GET /:id — Single festival campaign detail ────────────────

festivalCampaignRoutes.get('/:id', requirePermission('marketing', 'view'), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const row = await db.prepare('SELECT * FROM festival_campaigns WHERE id = ?').bind(id).first();
  if (!row) return notFound(c, 'Festival campaign');
  return success(c, parseFestival(row as Record<string, any>));
});

// ── POST / — Create a festival campaign ───────────────────────

festivalCampaignRoutes.post('/', requirePermission('marketing', 'create'), zValidator('json', createSchema), async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const data = c.req.valid('json');

  const id = generateId();
  await db.prepare(`
    INSERT INTO festival_campaigns (id, name, festival_name, festival_date, days_before, campaign_type, message_body, is_active, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).bind(
    id, data.name, data.festivalName, data.festivalDate, data.daysBefore,
    data.campaignType, data.messageBody ?? null, userId,
  ).run();

  const row = await db.prepare('SELECT * FROM festival_campaigns WHERE id = ?').bind(id).first();
  return created(c, parseFestival(row as Record<string, any>));
});

// ── PUT /:id/activate — Activate a festival campaign ─────────

festivalCampaignRoutes.put('/:id/activate', requirePermission('marketing', 'edit'), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const existing = await db.prepare('SELECT id FROM festival_campaigns WHERE id = ?').bind(id).first();
  if (!existing) return notFound(c, 'Festival campaign');

  await db.prepare(`
    UPDATE festival_campaigns SET is_active = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?
  `).bind(id).run();

  const row = await db.prepare('SELECT * FROM festival_campaigns WHERE id = ?').bind(id).first();
  return success(c, parseFestival(row as Record<string, any>));
});

// ── PUT /:id/deactivate — Deactivate a festival campaign ─────

festivalCampaignRoutes.put('/:id/deactivate', requirePermission('marketing', 'edit'), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const existing = await db.prepare('SELECT id FROM festival_campaigns WHERE id = ?').bind(id).first();
  if (!existing) return notFound(c, 'Festival campaign');

  await db.prepare(`
    UPDATE festival_campaigns SET is_active = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?
  `).bind(id).run();

  const row = await db.prepare('SELECT * FROM festival_campaigns WHERE id = ?').bind(id).first();
  return success(c, parseFestival(row as Record<string, any>));
});

// ── DELETE /:id — Delete a festival campaign ──────────────────

festivalCampaignRoutes.delete('/:id', requirePermission('marketing', 'delete'), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const existing = await db.prepare('SELECT id FROM festival_campaigns WHERE id = ?').bind(id).first();
  if (!existing) return notFound(c, 'Festival campaign');

  await db.prepare('DELETE FROM festival_campaigns WHERE id = ?').bind(id).run();
  return success(c, { message: 'Festival campaign deleted' });
});

export default festivalCampaignRoutes;
