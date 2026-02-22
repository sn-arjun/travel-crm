import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import type { AppContext } from '../types';
import { requirePermission } from '../middleware/rbac';
import { generateId } from '../utils/uuid';
import { logActivity } from '../utils/activity-logger';
import { resolveSegment, type SegmentFilter } from '../services/segment-resolver';
import { success, created, paginated, error, notFound } from '../utils/response';

const campaignRoutes = new Hono<AppContext>();

// ============================================================
// Zod Schemas
// ============================================================

const segmentFilterSchema = z.object({
  tags: z.array(z.string()).optional(),
  cities: z.array(z.string()).optional(),
  countries: z.array(z.string()).optional(),
  contactTypes: z.array(z.enum(['customer', 'supplier', 'agent', 'partner'])).optional(),
  birthdayMonth: z.number().int().min(1).max(12).optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
});

const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  templateId: z.string().optional().nullable(),
  subject: z.string().min(1).max(300),
  body: z.string().optional().nullable(),
  segmentFilters: segmentFilterSchema,
});

const updateCampaignSchema = createCampaignSchema.partial();

const scheduleCampaignSchema = z.object({
  scheduledAt: z.string().datetime(),
});

// ============================================================
// POST / - Create campaign
// ============================================================

campaignRoutes.post(
  '/',
  requirePermission('campaigns', 'create'),
  zValidator('json', createCampaignSchema),
  async (c) => {
    const tenantDb = c.get('tenantDb');
    const db = drizzle(tenantDb);
    const userId = c.get('userId');
    const data = c.req.valid('json');

    const id = generateId();
    const now = new Date().toISOString();

    try {
      await tenantDb
        .prepare(`
          INSERT INTO email_campaigns (
            id, name, template_id, subject, body, segment_filters,
            status, total_recipients, sent_count, opened_count, clicked_count,
            bounced_count, unsubscribed_count, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          id,
          data.name,
          data.templateId || null,
          data.subject,
          data.body || null,
          JSON.stringify(data.segmentFilters),
          'draft',
          0,
          0,
          0,
          0,
          0,
          0,
          userId,
          now,
          now
        )
        .run();

      await logActivity(db, {
        userId,
        action: 'create',
        entityType: 'email_campaign',
        entityId: id,
        details: JSON.stringify({ name: data.name }),
      });

      const campaign = await tenantDb
        .prepare('SELECT * FROM email_campaigns WHERE id = ?')
        .bind(id)
        .first<any>();

      return created(c, parseCampaign(campaign));
    } catch (err: any) {
      console.error('[CAMPAIGNS] Create error:', err.message);
      return error(c, 'Failed to create campaign', 500);
    }
  }
);

// ============================================================
// GET / - List campaigns with pagination
// ============================================================

campaignRoutes.get('/', async (c) => {
  const tenantDb = c.get('tenantDb');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const status = c.req.query('status');

  const offset = (page - 1) * limit;

  try {
    let whereClause = '';
    const params: any[] = [];

    if (status) {
      whereClause = 'WHERE status = ?';
      params.push(status);
    }

    const countResult = await tenantDb
      .prepare(`SELECT COUNT(*) AS total FROM email_campaigns ${whereClause}`)
      .bind(...params)
      .first<{ total: number }>();

    const listResult = await tenantDb
      .prepare(
        `SELECT * FROM email_campaigns ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .bind(...params, limit, offset)
      .all();

    const campaigns = (listResult.results || []).map((row: any) => parseCampaign(row));

    return paginated(c, campaigns, countResult?.total || 0, page, limit);
  } catch (err: any) {
    console.error('[CAMPAIGNS] List error:', err.message);
    return error(c, 'Failed to list campaigns', 500);
  }
});

// ============================================================
// GET /:id - Campaign detail with per-recipient stats
// ============================================================

campaignRoutes.get('/:id', async (c) => {
  const tenantDb = c.get('tenantDb');
  const id = c.req.param('id');

  try {
    const campaign = await tenantDb
      .prepare('SELECT * FROM email_campaigns WHERE id = ?')
      .bind(id)
      .first<any>();

    if (!campaign) {
      return notFound(c, 'Campaign');
    }

    // Get recipient stats
    const statsResult = await tenantDb
      .prepare(`
        SELECT
          status,
          COUNT(*) as count
        FROM email_message_log
        WHERE campaign_id = ?
        GROUP BY status
      `)
      .bind(id)
      .all();

    const recipientStats: Record<string, number> = {};
    if (statsResult.results) {
      for (const row of statsResult.results) {
        recipientStats[(row as any).status] = (row as any).count;
      }
    }

    return success(c, {
      ...parseCampaign(campaign),
      recipientStats,
    });
  } catch (err: any) {
    console.error('[CAMPAIGNS] Get detail error:', err.message);
    return error(c, 'Failed to fetch campaign', 500);
  }
});

// ============================================================
// POST /:id/send - Send campaign immediately
// ============================================================

campaignRoutes.post(
  '/:id/send',
  requirePermission('campaigns', 'create'),
  async (c) => {
    const tenantDb = c.get('tenantDb');
    const db = drizzle(tenantDb);
    const userId = c.get('userId');
    const campaignId = c.req.param('id');

    try {
      const campaign = await tenantDb
        .prepare('SELECT * FROM email_campaigns WHERE id = ?')
        .bind(campaignId)
        .first<any>();

      if (!campaign) {
        return notFound(c, 'Campaign');
      }

      if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
        return error(c, `Cannot send campaign with status: ${campaign.status}`, 400);
      }

      // Resolve segment
      const filters = JSON.parse(campaign.segment_filters || '{}') as SegmentFilter;
      const contactIds = await resolveSegment(tenantDb, filters);

      if (contactIds.length === 0) {
        return error(c, 'No contacts matched the segment filters', 400);
      }

      // Queue emails
      const env = c.env;
      let queuedCount = 0;
      let failureCount = 0;

      for (const contactId of contactIds) {
        try {
          const contact = await tenantDb
            .prepare('SELECT id, email, name FROM contacts WHERE id = ?')
            .bind(contactId)
            .first<any>();

          if (!contact || !contact.email) {
            failureCount++;
            continue;
          }

          // Create message log entry
          const logId = generateId();
          const now = new Date().toISOString();

          await tenantDb
            .prepare(`
              INSERT INTO email_message_log (id, campaign_id, contact_id, recipient_email, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `)
            .bind(logId, campaignId, contactId, contact.email, 'queued', now, now)
            .run();

          // Queue email job
          await env.EMAIL_QUEUE.send({
            type: 'email',
            data: {
              to: contact.email,
              subject: campaign.subject,
              html: campaign.body || undefined,
              templateId: campaign.template_id || undefined,
              templateData: { contactName: contact.name },
              from: undefined,
              replyTo: undefined,
            },
          });

          queuedCount++;
        } catch (err: any) {
          console.error(
            `[CAMPAIGNS] Failed to queue email for contact ${contactId}:`,
            err
          );
          failureCount++;
        }
      }

      // Update campaign status
      const now = new Date().toISOString();
      await tenantDb
        .prepare(`
          UPDATE email_campaigns
          SET status = ?, total_recipients = ?, sent_count = ?, sent_at = ?, updated_at = ?
          WHERE id = ?
        `)
        .bind('sending', queuedCount, queuedCount, now, now, campaignId)
        .run();

      await logActivity(db, {
        userId,
        action: 'send',
        entityType: 'email_campaign',
        entityId: campaignId,
        details: JSON.stringify({ queuedCount, failureCount }),
      });

      return success(c, {
        message: `Campaign sent to ${queuedCount} recipients`,
        queuedCount,
        failureCount,
        totalContacts: contactIds.length,
      });
    } catch (err: any) {
      console.error('[CAMPAIGNS] Send error:', err.message);
      return error(c, 'Failed to send campaign', 500);
    }
  }
);

// ============================================================
// POST /:id/schedule - Schedule campaign for later
// ============================================================

campaignRoutes.post(
  '/:id/schedule',
  requirePermission('campaigns', 'create'),
  zValidator('json', scheduleCampaignSchema),
  async (c) => {
    const tenantDb = c.get('tenantDb');
    const db = drizzle(tenantDb);
    const userId = c.get('userId');
    const campaignId = c.req.param('id');
    const data = c.req.valid('json');

    try {
      const campaign = await tenantDb
        .prepare('SELECT * FROM email_campaigns WHERE id = ?')
        .bind(campaignId)
        .first<any>();

      if (!campaign) {
        return notFound(c, 'Campaign');
      }

      if (campaign.status !== 'draft') {
        return error(c, 'Only draft campaigns can be scheduled', 400);
      }

      const now = new Date().toISOString();

      // Validate scheduled time is in future
      if (new Date(data.scheduledAt) <= new Date()) {
        return error(c, 'Scheduled time must be in the future', 400);
      }

      await tenantDb
        .prepare(`
          UPDATE email_campaigns
          SET status = ?, scheduled_at = ?, updated_at = ?
          WHERE id = ?
        `)
        .bind('scheduled', data.scheduledAt, now, campaignId)
        .run();

      await logActivity(db, {
        userId,
        action: 'schedule',
        entityType: 'email_campaign',
        entityId: campaignId,
        details: JSON.stringify({ scheduledAt: data.scheduledAt }),
      });

      const updated = await tenantDb
        .prepare('SELECT * FROM email_campaigns WHERE id = ?')
        .bind(campaignId)
        .first<any>();

      return success(c, parseCampaign(updated));
    } catch (err: any) {
      console.error('[CAMPAIGNS] Schedule error:', err.message);
      return error(c, 'Failed to schedule campaign', 500);
    }
  }
);

// ============================================================
// POST /:id/cancel - Cancel scheduled campaign
// ============================================================

campaignRoutes.post(
  '/:id/cancel',
  requirePermission('campaigns', 'create'),
  async (c) => {
    const tenantDb = c.get('tenantDb');
    const db = drizzle(tenantDb);
    const userId = c.get('userId');
    const campaignId = c.req.param('id');

    try {
      const campaign = await tenantDb
        .prepare('SELECT * FROM email_campaigns WHERE id = ?')
        .bind(campaignId)
        .first<any>();

      if (!campaign) {
        return notFound(c, 'Campaign');
      }

      if (campaign.status !== 'scheduled') {
        return error(c, `Cannot cancel campaign with status: ${campaign.status}`, 400);
      }

      const now = new Date().toISOString();

      await tenantDb
        .prepare(`
          UPDATE email_campaigns
          SET status = ?, updated_at = ?
          WHERE id = ?
        `)
        .bind('cancelled', now, campaignId)
        .run();

      await logActivity(db, {
        userId,
        action: 'cancel',
        entityType: 'email_campaign',
        entityId: campaignId,
      });

      const updated = await tenantDb
        .prepare('SELECT * FROM email_campaigns WHERE id = ?')
        .bind(campaignId)
        .first<any>();

      return success(c, parseCampaign(updated));
    } catch (err: any) {
      console.error('[CAMPAIGNS] Cancel error:', err.message);
      return error(c, 'Failed to cancel campaign', 500);
    }
  }
);

// ============================================================
// PUT /:id - Update campaign (only when draft)
// ============================================================

campaignRoutes.put(
  '/:id',
  requirePermission('campaigns', 'edit'),
  zValidator('json', updateCampaignSchema),
  async (c) => {
    const tenantDb = c.get('tenantDb');
    const db = drizzle(tenantDb);
    const userId = c.get('userId');
    const campaignId = c.req.param('id');
    const data = c.req.valid('json');

    try {
      const campaign = await tenantDb
        .prepare('SELECT * FROM email_campaigns WHERE id = ?')
        .bind(campaignId)
        .first<any>();

      if (!campaign) {
        return notFound(c, 'Campaign');
      }

      if (campaign.status !== 'draft') {
        return error(c, 'Only draft campaigns can be updated', 400);
      }

      const now = new Date().toISOString();

      // Build dynamic UPDATE query
      const updates: string[] = ['updated_at = ?'];
      const values: any[] = [now];

      if (data.name) {
        updates.push('name = ?');
        values.push(data.name);
      }
      if (data.subject) {
        updates.push('subject = ?');
        values.push(data.subject);
      }
      if (data.body !== undefined) {
        updates.push('body = ?');
        values.push(data.body);
      }
      if (data.templateId !== undefined) {
        updates.push('template_id = ?');
        values.push(data.templateId);
      }
      if (data.segmentFilters) {
        updates.push('segment_filters = ?');
        values.push(JSON.stringify(data.segmentFilters));
      }

      values.push(campaignId);

      const sql = `UPDATE email_campaigns SET ${updates.join(', ')} WHERE id = ?`;
      await tenantDb.prepare(sql).bind(...values).run();

      await logActivity(db, {
        userId,
        action: 'update',
        entityType: 'email_campaign',
        entityId: campaignId,
        details: JSON.stringify(data),
      });

      const updated = await tenantDb
        .prepare('SELECT * FROM email_campaigns WHERE id = ?')
        .bind(campaignId)
        .first<any>();

      return success(c, parseCampaign(updated));
    } catch (err: any) {
      console.error('[CAMPAIGNS] Update error:', err.message);
      return error(c, 'Failed to update campaign', 500);
    }
  }
);

// ============================================================
// DELETE /:id - Delete campaign (only when draft)
// ============================================================

campaignRoutes.delete(
  '/:id',
  requirePermission('campaigns', 'delete'),
  async (c) => {
    const tenantDb = c.get('tenantDb');
    const db = drizzle(tenantDb);
    const userId = c.get('userId');
    const campaignId = c.req.param('id');

    try {
      const campaign = await tenantDb
        .prepare('SELECT * FROM email_campaigns WHERE id = ?')
        .bind(campaignId)
        .first<any>();

      if (!campaign) {
        return notFound(c, 'Campaign');
      }

      if (campaign.status !== 'draft') {
        return error(c, 'Only draft campaigns can be deleted', 400);
      }

      // Delete associated message logs
      await tenantDb
        .prepare('DELETE FROM email_message_log WHERE campaign_id = ?')
        .bind(campaignId)
        .run();

      // Delete campaign
      await tenantDb
        .prepare('DELETE FROM email_campaigns WHERE id = ?')
        .bind(campaignId)
        .run();

      await logActivity(db, {
        userId,
        action: 'delete',
        entityType: 'email_campaign',
        entityId: campaignId,
      });

      return success(c, { message: 'Campaign deleted' });
    } catch (err: any) {
      console.error('[CAMPAIGNS] Delete error:', err.message);
      return error(c, 'Failed to delete campaign', 500);
    }
  }
);

// ============================================================
// Helper function: parse campaign response
// ============================================================

function parseCampaign(row: any) {
  return {
    id: row.id,
    name: row.name,
    templateId: row.template_id,
    subject: row.subject,
    body: row.body,
    segmentFilters: row.segment_filters ? JSON.parse(row.segment_filters) : {},
    status: row.status,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    totalRecipients: row.total_recipients,
    sentCount: row.sent_count,
    openedCount: row.opened_count,
    clickedCount: row.clicked_count,
    bouncedCount: row.bounced_count,
    unsubscribedCount: row.unsubscribed_count,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default campaignRoutes;
