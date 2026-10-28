import { Hono } from 'hono';
import { zValidator } from '../../utils/validator';
import type { AppContext } from '../../types';
import { requirePermission } from '../../middleware/rbac';
import { generateId } from '../../utils/uuid';
import { success, created, paginated, error, notFound } from '../../utils/response';
import { createCampaignSchema, updateCampaignSchema, campaignListSchema } from '../../validators/marketing';
import { buildSegmentQuery } from '../../services/segmentation-engine';
import { marketingConsentSql } from '../../services/privacy/consent';

const mktCampaignRoutes = new Hono<AppContext>();

// ============================================================
// LIST CAMPAIGNS
// ============================================================

mktCampaignRoutes.get(
  '/',
  requirePermission('marketing', 'view'),
  zValidator('query', campaignListSchema),
  async (c) => {
    const db = c.get('tenantDb');
    const { page, limit, type, status, search } = c.req.valid('query');
    const offset = (page - 1) * limit;
    const tenantId = c.get('tenantId');

    let query = 'SELECT * FROM marketing_campaigns WHERE tenant_id = ?';
    const params: any[] = [tenantId];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (search) {
      query += ' AND name LIKE ?';
      params.push(`%${search}%`);
    }

    let countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countResult = await db.prepare(countQuery).bind(...params).first();
    const total = Number(countResult?.count || 0);

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const results = await db.prepare(query).bind(...params).all();
    return paginated(c, results.results || [], total, page, limit);
  }
);

// ============================================================
// GET SINGLE CAMPAIGN
// ============================================================

mktCampaignRoutes.get(
  '/:id',
  requirePermission('marketing', 'view'),
  async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');

    const campaign = await db
      .prepare('SELECT * FROM marketing_campaigns WHERE id = ?')
      .bind(id)
      .first();
    if (!campaign) return notFound(c, 'Campaign');

    // Get recipient summary
    const recipientStats = await db
      .prepare(
        `SELECT status, COUNT(*) as count FROM campaign_recipients WHERE campaign_id = ? GROUP BY status`
      )
      .bind(id)
      .all();

    return success(c, {
      ...campaign,
      recipient_stats: recipientStats.results || [],
    });
  }
);

// ============================================================
// GET CAMPAIGN ANALYTICS
// ============================================================

mktCampaignRoutes.get(
  '/:id/analytics',
  requirePermission('marketing', 'view'),
  async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');

    const campaign = await db
      .prepare('SELECT * FROM marketing_campaigns WHERE id = ?')
      .bind(id)
      .first();
    if (!campaign) return notFound(c, 'Campaign');

    const stats = await db
      .prepare(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
          SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'opted_out' THEN 1 ELSE 0 END) as opted_out,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
        FROM campaign_recipients WHERE campaign_id = ?`
      )
      .bind(id)
      .first();

    const total = Number((campaign as any).total_recipients) || 0;
    const delivered = Number((stats as any)?.delivered || 0);

    return success(c, {
      campaign_id: id,
      name: (campaign as any).name,
      type: (campaign as any).type,
      status: (campaign as any).status,
      total_recipients: total,
      sent: Number((stats as any)?.sent || 0),
      delivered,
      failed: Number((stats as any)?.failed || 0),
      opted_out: Number((stats as any)?.opted_out || 0),
      pending: Number((stats as any)?.pending || 0),
      delivery_rate: total > 0 ? ((delivered / total) * 100).toFixed(1) : '0.0',
      opened: (campaign as any).opened_count || 0,
      clicked: (campaign as any).clicked_count || 0,
    });
  }
);

// ============================================================
// GET CAMPAIGN RECIPIENTS
// ============================================================

mktCampaignRoutes.get(
  '/:id/recipients',
  requirePermission('marketing', 'view'),
  async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const statusFilter = c.req.query('status');
    const offset = (page - 1) * limit;

    let query = `SELECT cr.*, c.name as contact_name FROM campaign_recipients cr
      LEFT JOIN contacts c ON cr.contact_id = c.id
      WHERE cr.campaign_id = ?`;
    const params: any[] = [id];

    if (statusFilter) {
      query += ' AND cr.status = ?';
      params.push(statusFilter);
    }

    let countQuery = `SELECT COUNT(*) as count FROM campaign_recipients WHERE campaign_id = ?`;
    const countParams: any[] = [id];
    if (statusFilter) {
      countQuery += ' AND status = ?';
      countParams.push(statusFilter);
    }
    const countResult = await db.prepare(countQuery).bind(...countParams).first();
    const total = Number(countResult?.count || 0);

    query += ' ORDER BY cr.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const results = await db.prepare(query).bind(...params).all();
    return paginated(c, results.results || [], total, page, limit);
  }
);

// ============================================================
// CREATE CAMPAIGN
// ============================================================

mktCampaignRoutes.post(
  '/',
  requirePermission('marketing', 'create'),
  zValidator('json', createCampaignSchema),
  async (c) => {
    const db = c.get('tenantDb');
    const body = c.req.valid('json');
    const id = generateId();
    const userId = c.get('userId');
    const tenantId = c.get('tenantId');
    const now = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO marketing_campaigns (
          id, tenant_id, name, type, segment_id, template_id, template_variables,
          message_body, email_subject, status, scheduled_at, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`
      )
      .bind(
        id,
        tenantId,
        body.name,
        body.type,
        body.segmentId || null,
        body.templateId || null,
        body.templateVariables || null,
        body.messageBody || null,
        body.emailSubject || null,
        body.scheduledAt || null,
        userId,
        now,
        now
      )
      .run();

    const inserted = await db.prepare('SELECT * FROM marketing_campaigns WHERE id = ?').bind(id).first();
    return created(c, inserted);
  }
);

// ============================================================
// UPDATE CAMPAIGN (draft only)
// ============================================================

mktCampaignRoutes.put(
  '/:id',
  requirePermission('marketing', 'edit'),
  zValidator('json', updateCampaignSchema),
  async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const now = new Date().toISOString();

    const existing = await db.prepare('SELECT * FROM marketing_campaigns WHERE id = ?').bind(id).first();
    if (!existing) return notFound(c, 'Campaign');
    if ((existing as any).status !== 'draft') {
      return error(c, 'Can only edit draft campaigns', 400);
    }

    const updates: string[] = [];
    const params: any[] = [];

    const fieldMap: Record<string, string> = {
      name: 'name',
      type: 'type',
      segmentId: 'segment_id',
      templateId: 'template_id',
      templateVariables: 'template_variables',
      messageBody: 'message_body',
      emailSubject: 'email_subject',
      scheduledAt: 'scheduled_at',
    };

    for (const [key, value] of Object.entries(body)) {
      const col = fieldMap[key];
      if (col) {
        updates.push(`${col} = ?`);
        params.push(value ?? null);
      }
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(now, id);
      await db
        .prepare(`UPDATE marketing_campaigns SET ${updates.join(', ')} WHERE id = ?`)
        .bind(...params)
        .run();
    }

    const updated = await db.prepare('SELECT * FROM marketing_campaigns WHERE id = ?').bind(id).first();
    return success(c, updated);
  }
);

// ============================================================
// SEND CAMPAIGN
// ============================================================

mktCampaignRoutes.post(
  '/:id/send',
  requirePermission('marketing', 'create'),
  async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    const tenantId = c.get('tenantId');

    const campaign = await db.prepare('SELECT * FROM marketing_campaigns WHERE id = ?').bind(id).first();
    if (!campaign) return notFound(c, 'Campaign');
    if ((campaign as any).status !== 'draft') {
      return error(c, 'Campaign already sent or in progress', 400);
    }

    const segmentId = (campaign as any).segment_id;
    if (!segmentId) {
      return error(c, 'Campaign must have a segment', 400);
    }

    // Get segment contacts
    const segment = await db
      .prepare('SELECT * FROM contact_segments WHERE id = ? AND is_deleted = 0')
      .bind(segmentId)
      .first();
    if (!segment) return error(c, 'Segment not found', 400);

    const filtersJson = (segment as any).filters_json;
    const consentChannel = (campaign as any).type as 'email' | 'whatsapp' | 'sms';
    let contactsQuery = `SELECT id, name, email, phone FROM contacts WHERE is_deleted = 0 AND opted_out = 0 AND ${marketingConsentSql(consentChannel)}`;
    let bindings: any[] = [];

    if (filtersJson) {
      const filters = JSON.parse(filtersJson);
      const segQuery = buildSegmentQuery(filters);
      contactsQuery += ` ${segQuery.whereClause}`;
      bindings = segQuery.bindings;
    }

    const contacts = await db.prepare(contactsQuery).bind(...bindings).all();
    const contactList = contacts.results || [];

    if (contactList.length === 0) {
      return error(c, 'No contacts match the segment filters', 400);
    }

    // Create recipient records
    const now = new Date().toISOString();
    const campaignType = (campaign as any).type;

    for (const contact of contactList) {
      const recipientId = generateId();
      const contactPhone = (contact as any).phone;
      const contactEmail = (contact as any).email;

      // Skip contacts without required channel info
      if (campaignType === 'whatsapp' && !contactPhone) continue;
      if (campaignType === 'sms' && !contactPhone) continue;
      if (campaignType === 'email' && !contactEmail) continue;

      await db
        .prepare(
          `INSERT INTO campaign_recipients (id, campaign_id, contact_id, phone, email, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'pending', ?)`
        )
        .bind(recipientId, id, (contact as any).id, contactPhone || null, contactEmail || null, now)
        .run();
    }

    // Count actual recipients created
    const recipientCount = await db
      .prepare('SELECT COUNT(*) as count FROM campaign_recipients WHERE campaign_id = ?')
      .bind(id)
      .first();
    const totalRecipients = Number(recipientCount?.count || 0);

    // Update campaign status
    await db
      .prepare(
        `UPDATE marketing_campaigns SET status = 'sending', total_recipients = ?, updated_at = ? WHERE id = ?`
      )
      .bind(totalRecipients, now, id)
      .run();

    // Enqueue for processing
    await c.env.CAMPAIGN_QUEUE.send({
      type: `${campaignType}_campaign`,
      data: {
        campaignId: id,
        tenantId,
        campaignType,
      },
    });

    return success(c, {
      message: 'Campaign sending started',
      total_recipients: totalRecipients,
    });
  }
);

// ============================================================
// CANCEL CAMPAIGN
// ============================================================

mktCampaignRoutes.post(
  '/:id/cancel',
  requirePermission('marketing', 'edit'),
  async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');

    const campaign = await db.prepare('SELECT * FROM marketing_campaigns WHERE id = ?').bind(id).first();
    if (!campaign) return notFound(c, 'Campaign');

    const status = (campaign as any).status;
    if (status === 'sent' || status === 'cancelled') {
      return error(c, `Cannot cancel a ${status} campaign`, 400);
    }

    await db
      .prepare('UPDATE marketing_campaigns SET status = ?, updated_at = ? WHERE id = ?')
      .bind('cancelled', new Date().toISOString(), id)
      .run();

    // Cancel pending recipients
    await db
      .prepare(
        `UPDATE campaign_recipients SET status = 'failed', error_message = 'Campaign cancelled' WHERE campaign_id = ? AND status = 'pending'`
      )
      .bind(id)
      .run();

    return success(c, { cancelled: true });
  }
);

// ============================================================
// DELETE CAMPAIGN (draft only)
// ============================================================

mktCampaignRoutes.delete(
  '/:id',
  requirePermission('marketing', 'delete'),
  async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');

    const campaign = await db.prepare('SELECT * FROM marketing_campaigns WHERE id = ?').bind(id).first();
    if (!campaign) return notFound(c, 'Campaign');
    if ((campaign as any).status !== 'draft') {
      return error(c, 'Can only delete draft campaigns', 400);
    }

    await db.prepare('DELETE FROM marketing_campaigns WHERE id = ?').bind(id).run();
    return success(c, { deleted: true });
  }
);

export default mktCampaignRoutes;
