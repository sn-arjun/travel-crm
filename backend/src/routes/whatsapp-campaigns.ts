/**
 * WhatsApp Campaigns Routes
 *
 * Bulk WhatsApp messaging with campaign tracking.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '../utils/validator';
import type { AppContext } from '../types';
import { success, created, error, notFound } from '../utils/response';
import { generateId } from '../utils/uuid';
import { rbac } from '../middleware/rbac';
import { marketingConsentSql } from '../services/privacy/consent';

const whatsappCampaignRoutes = new Hono<AppContext>();

// ── Schemas ───────────────────────────────────────────────────

const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  templateContent: z.string().min(1),
  templateName: z.string().optional(),
  templateVariables: z.record(z.string(), z.string()).optional(),
  audienceFilter: z.object({
    tags: z.array(z.string()).optional(),
    source: z.string().optional(),
    leadStatus: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
  scheduledAt: z.string().optional(),
});

const updateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  templateContent: z.string().min(1).optional(),
  templateName: z.string().optional(),
  templateVariables: z.record(z.string(), z.string()).optional(),
  audienceFilter: z.object({
    tags: z.array(z.string()).optional(),
    source: z.string().optional(),
    leadStatus: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
  scheduledAt: z.string().optional(),
});

// ── Helper: parse campaign row ────────────────────────────────

function parseCampaign(row: Record<string, any>) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    templateName: row.template_name,
    templateContent: row.template_content,
    templateVariables: row.template_variables ? JSON.parse(row.template_variables) : null,
    audienceFilter: row.audience_filter ? JSON.parse(row.audience_filter) : null,
    totalRecipients: row.total_recipients || 0,
    sentCount: row.sent_count || 0,
    deliveredCount: row.delivered_count || 0,
    readCount: row.read_count || 0,
    failedCount: row.failed_count || 0,
    optedOutCount: row.opted_out_count || 0,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── GET / — List campaigns ───────────────────────────────────

whatsappCampaignRoutes.get('/', async (c) => {
  const db = c.get('tenantDb');
  const url = new URL(c.req.url);

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;
  const status = url.searchParams.get('status');

  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (status) { conditions.push('wc.status = ?'); values.push(status); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db.prepare(
    `SELECT COUNT(*) as total FROM whatsapp_campaigns wc ${where}`
  ).bind(...values).first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const rows = await db.prepare(`
    SELECT wc.*, u.name as created_by_name
    FROM whatsapp_campaigns wc
    LEFT JOIN users u ON wc.created_by = u.id
    ${where}
    ORDER BY wc.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...values, limit, offset).all();

  return c.json({
    success: true,
    data: (rows.results || []).map(parseCampaign),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  });
});

// ── POST / — Create campaign (draft) ─────────────────────────

whatsappCampaignRoutes.post('/', rbac(['admin', 'sales_manager']), zValidator('json', createCampaignSchema), async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const data = c.req.valid('json');

  const id = generateId();
  await db.prepare(`
    INSERT INTO whatsapp_campaigns (id, name, template_content, template_name, template_variables, audience_filter, scheduled_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    data.name,
    data.templateContent,
    data.templateName || null,
    data.templateVariables ? JSON.stringify(data.templateVariables) : null,
    data.audienceFilter ? JSON.stringify(data.audienceFilter) : null,
    data.scheduledAt || null,
    userId,
  ).run();

  return created(c, { id, status: 'draft' });
});

// ── GET /:id — Campaign detail ───────────────────────────────

whatsappCampaignRoutes.get('/:id', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const row = await db.prepare(`
    SELECT wc.*, u.name as created_by_name
    FROM whatsapp_campaigns wc
    LEFT JOIN users u ON wc.created_by = u.id
    WHERE wc.id = ?
  `).bind(id).first();

  if (!row) return notFound(c, 'Campaign');
  return success(c, parseCampaign(row));
});

// ── PUT /:id — Update draft campaign ─────────────────────────

whatsappCampaignRoutes.put('/:id', rbac(['admin', 'sales_manager']), zValidator('json', updateCampaignSchema), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const data = c.req.valid('json');

  const existing = await db.prepare('SELECT id, status FROM whatsapp_campaigns WHERE id = ?').bind(id).first<{ id: string; status: string }>();
  if (!existing) return notFound(c, 'Campaign');
  if (existing.status !== 'draft') return error(c, 'Can only update draft campaigns', 409);

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
  if (data.templateContent !== undefined) { updates.push('template_content = ?'); values.push(data.templateContent); }
  if (data.templateName !== undefined) { updates.push('template_name = ?'); values.push(data.templateName); }
  if (data.templateVariables !== undefined) { updates.push('template_variables = ?'); values.push(JSON.stringify(data.templateVariables)); }
  if (data.audienceFilter !== undefined) { updates.push('audience_filter = ?'); values.push(JSON.stringify(data.audienceFilter)); }
  if (data.scheduledAt !== undefined) { updates.push('scheduled_at = ?'); values.push(data.scheduledAt); }

  if (updates.length === 0) return success(c, { message: 'No changes' });

  updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
  values.push(id);

  await db.prepare(`UPDATE whatsapp_campaigns SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

  return success(c, { message: 'Campaign updated' });
});

// ── DELETE /:id — Delete draft campaign ──────────────────────

whatsappCampaignRoutes.delete('/:id', rbac(['admin', 'sales_manager']), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const existing = await db.prepare('SELECT id, status FROM whatsapp_campaigns WHERE id = ?').bind(id).first<{ id: string; status: string }>();
  if (!existing) return notFound(c, 'Campaign');
  if (existing.status !== 'draft') return error(c, 'Can only delete draft campaigns', 409);

  await db.prepare('DELETE FROM whatsapp_campaigns WHERE id = ?').bind(id).run();
  return success(c, { message: 'Campaign deleted' });
});

// ── POST /:id/send — Queue campaign for sending ─────────────

whatsappCampaignRoutes.post('/:id/send', rbac(['admin', 'sales_manager']), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const campaign = await db.prepare('SELECT * FROM whatsapp_campaigns WHERE id = ?').bind(id).first<Record<string, any>>();
  if (!campaign) return notFound(c, 'Campaign');
  if (!['draft', 'paused'].includes(campaign.status)) {
    return error(c, `Cannot send campaign in '${campaign.status}' status`, 409);
  }

  // Build recipient list from audience filter
  const audienceFilter = campaign.audience_filter ? JSON.parse(campaign.audience_filter) : {};

  // R208: opted-out contacts and contacts whose latest WhatsApp marketing consent is a withdrawal never enter the audience
  const conditions: string[] = ['c.phone IS NOT NULL', "c.phone != ''", 'c.is_deleted = 0', 'COALESCE(c.opted_out, 0) = 0', marketingConsentSql('whatsapp', 'c')];
  const vals: (string | number)[] = [];

  if (audienceFilter.source) { conditions.push('c.source = ?'); vals.push(audienceFilter.source); }
  if (audienceFilter.country) { conditions.push('c.country = ?'); vals.push(audienceFilter.country); }

  // If lead status filter, join leads
  let joinLeads = '';
  if (audienceFilter.leadStatus) {
    joinLeads = 'INNER JOIN leads l ON l.contact_id = c.id';
    conditions.push('l.status = ?');
    vals.push(audienceFilter.leadStatus);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const contacts = await db.prepare(`
    SELECT DISTINCT c.id, c.phone, c.name FROM contacts c ${joinLeads} ${where}
  `).bind(...vals).all();

  const recipients = contacts.results || [];
  if (recipients.length === 0) return error(c, 'No recipients match the audience filter', 422);

  // Insert recipients
  const batchSize = 50;
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    const stmts = batch.map((r: any) =>
      db.prepare(`
        INSERT INTO whatsapp_campaign_recipients (id, campaign_id, contact_id, phone, name)
        VALUES (?, ?, ?, ?, ?)
      `).bind(generateId(), id, r.id, r.phone, r.name || null)
    );
    await db.batch(stmts);
  }

  // Update campaign status
  await db.prepare(`
    UPDATE whatsapp_campaigns
    SET status = 'sending', total_recipients = ?,
        started_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = ?
  `).bind(recipients.length, id).run();

  // Queue for processing
  try {
    await c.env.CAMPAIGN_QUEUE.send({
      type: 'whatsapp_campaign',
      campaignId: id,
      tenantId: c.get('tenantId'),
    });
  } catch (_e) {
    console.error('Failed to queue WhatsApp campaign:', _e);
  }

  return success(c, {
    message: `Campaign queued for sending to ${recipients.length} recipients`,
    totalRecipients: recipients.length,
  });
});

// ── POST /:id/pause — Pause sending ─────────────────────────

whatsappCampaignRoutes.post('/:id/pause', rbac(['admin', 'sales_manager']), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const existing = await db.prepare('SELECT status FROM whatsapp_campaigns WHERE id = ?').bind(id).first<{ status: string }>();
  if (!existing) return notFound(c, 'Campaign');
  if (existing.status !== 'sending') return error(c, 'Can only pause sending campaigns', 409);

  await db.prepare(`
    UPDATE whatsapp_campaigns SET status = 'paused', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?
  `).bind(id).run();

  return success(c, { message: 'Campaign paused' });
});

// ── POST /:id/cancel — Cancel campaign ──────────────────────

whatsappCampaignRoutes.post('/:id/cancel', rbac(['admin', 'sales_manager']), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const existing = await db.prepare('SELECT status FROM whatsapp_campaigns WHERE id = ?').bind(id).first<{ status: string }>();
  if (!existing) return notFound(c, 'Campaign');
  if (!['draft', 'scheduled', 'sending', 'paused'].includes(existing.status)) {
    return error(c, 'Cannot cancel campaign in current status', 409);
  }

  await db.prepare(`
    UPDATE whatsapp_campaigns SET status = 'cancelled', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?
  `).bind(id).run();

  return success(c, { message: 'Campaign cancelled' });
});

// ── GET /:id/recipients — List recipients ───────────────────

whatsappCampaignRoutes.get('/:id/recipients', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const url = new URL(c.req.url);

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
  const offset = (page - 1) * limit;
  const status = url.searchParams.get('status');

  const conditions: string[] = ['wr.campaign_id = ?'];
  const values: (string | number)[] = [id];

  if (status) { conditions.push('wr.status = ?'); values.push(status); }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await db.prepare(
    `SELECT COUNT(*) as total FROM whatsapp_campaign_recipients wr ${where}`
  ).bind(...values).first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const rows = await db.prepare(`
    SELECT wr.* FROM whatsapp_campaign_recipients wr ${where}
    ORDER BY wr.created_at ASC
    LIMIT ? OFFSET ?
  `).bind(...values, limit, offset).all();

  return c.json({
    success: true,
    data: (rows.results || []).map((r: any) => ({
      id: r.id,
      contactId: r.contact_id,
      phone: r.phone,
      name: r.name,
      status: r.status,
      providerMessageId: r.provider_message_id,
      errorMessage: r.error_message,
      sentAt: r.sent_at,
      deliveredAt: r.delivered_at,
      readAt: r.read_at,
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

// ── GET /:id/analytics — Campaign analytics ─────────────────

whatsappCampaignRoutes.get('/:id/analytics', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const campaign = await db.prepare('SELECT * FROM whatsapp_campaigns WHERE id = ?').bind(id).first<Record<string, any>>();
  if (!campaign) return notFound(c, 'Campaign');

  const statusCounts = await db.prepare(`
    SELECT status, COUNT(*) as count FROM whatsapp_campaign_recipients
    WHERE campaign_id = ? GROUP BY status
  `).bind(id).all();

  const stats: Record<string, number> = {};
  (statusCounts.results || []).forEach((r: any) => { stats[r.status] = r.count; });

  const total = campaign.total_recipients || 0;
  const sent = stats['sent'] || 0 + (stats['delivered'] || 0) + (stats['read'] || 0);
  const delivered = (stats['delivered'] || 0) + (stats['read'] || 0);
  const read = stats['read'] || 0;

  return success(c, {
    campaignId: id,
    status: campaign.status,
    totalRecipients: total,
    statusBreakdown: stats,
    rates: {
      sendRate: total > 0 ? Math.round((sent / total) * 100) : 0,
      deliveryRate: sent > 0 ? Math.round((delivered / sent) * 100) : 0,
      readRate: delivered > 0 ? Math.round((read / delivered) * 100) : 0,
      failRate: total > 0 ? Math.round(((stats['failed'] || 0) / total) * 100) : 0,
      optOutRate: total > 0 ? Math.round(((stats['opted_out'] || 0) / total) * 100) : 0,
    },
  });
});

export default whatsappCampaignRoutes;
