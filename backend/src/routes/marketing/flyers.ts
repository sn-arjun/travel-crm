import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppContext } from '../../types';
import { requirePermission } from '../../middleware/rbac';
import { generateId } from '../../utils/uuid';
import { success, created, paginated, error, notFound } from '../../utils/response';
import { createGeneratedFlyerSchema, flyerListSchema, createFlyerShareSchema } from '../../validators/marketing';

const flyerRoutes = new Hono<AppContext>();

// ============================================================
// LIST GENERATED FLYERS
// ============================================================

flyerRoutes.get(
  '/',
  requirePermission('marketing', 'view'),
  zValidator('query', flyerListSchema),
  async (c) => {
    const db = c.get('tenantDb');
    const { page, limit, search } = c.req.valid('query');
    const offset = (page - 1) * limit;
    const tenantId = c.get('tenantId');

    let query = 'SELECT * FROM generated_flyers WHERE tenant_id = ?';
    const params: any[] = [tenantId];

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
// GET SINGLE FLYER
// ============================================================

flyerRoutes.get(
  '/:id',
  requirePermission('marketing', 'view'),
  async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');

    const flyer = await db.prepare('SELECT * FROM generated_flyers WHERE id = ?').bind(id).first();
    if (!flyer) return notFound(c, 'Flyer');

    // Fetch share history
    const shares = await db
      .prepare('SELECT * FROM flyer_shares WHERE flyer_id = ? ORDER BY shared_at DESC')
      .bind(id)
      .all();

    return success(c, { ...flyer, shares: shares.results || [] });
  }
);

// ============================================================
// SAVE GENERATED FLYER
// ============================================================

flyerRoutes.post(
  '/',
  requirePermission('marketing', 'create'),
  zValidator('json', createGeneratedFlyerSchema),
  async (c) => {
    const db = c.get('tenantDb');
    const body = c.req.valid('json');
    const id = generateId();
    const userId = c.get('userId');
    const tenantId = c.get('tenantId');
    const now = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO generated_flyers (
          id, tenant_id, template_id, name, layout_json, format, width, height,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        tenantId,
        body.templateId || null,
        body.name,
        body.layoutJson || null,
        body.format || 'png',
        body.width || null,
        body.height || null,
        userId,
        now,
        now
      )
      .run();

    const inserted = await db.prepare('SELECT * FROM generated_flyers WHERE id = ?').bind(id).first();
    return created(c, inserted);
  }
);

// ============================================================
// UPLOAD EXPORTED FLYER IMAGE
// ============================================================

flyerRoutes.post(
  '/:id/upload',
  requirePermission('marketing', 'edit'),
  async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    const tenantId = c.get('tenantId');

    const flyer = await db.prepare('SELECT * FROM generated_flyers WHERE id = ?').bind(id).first();
    if (!flyer) return notFound(c, 'Flyer');

    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return error(c, 'No file uploaded', 400);

    const ext = file.name.split('.').pop() || 'png';
    const r2Key = `${tenantId}/marketing/flyers/${id}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    await c.env.FILE_STORAGE.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: file.type },
    });

    const url = `/api/v1/files/${r2Key}`;

    await db
      .prepare(
        'UPDATE generated_flyers SET r2_key = ?, url = ?, file_size = ?, format = ?, updated_at = ? WHERE id = ?'
      )
      .bind(r2Key, url, file.size, ext, new Date().toISOString(), id)
      .run();

    const updated = await db.prepare('SELECT * FROM generated_flyers WHERE id = ?').bind(id).first();
    return success(c, updated);
  }
);

// ============================================================
// SHARE FLYER
// ============================================================

flyerRoutes.post(
  '/share',
  requirePermission('marketing', 'create'),
  zValidator('json', createFlyerShareSchema),
  async (c) => {
    const db = c.get('tenantDb');
    const body = c.req.valid('json');
    const id = generateId();
    const userId = c.get('userId');
    const now = new Date().toISOString();

    const flyer = await db.prepare('SELECT * FROM generated_flyers WHERE id = ?').bind(body.flyerId).first();
    if (!flyer) return notFound(c, 'Flyer');

    await db
      .prepare(
        `INSERT INTO flyer_shares (id, flyer_id, channel, recipient_info, shared_by, shared_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(id, body.flyerId, body.channel, body.recipientInfo || null, userId, now)
      .run();

    // If sharing via WhatsApp or email, enqueue for sending
    if (body.channel === 'whatsapp' && body.recipientInfo) {
      await c.env.SMS_QUEUE.send({
        type: 'sms',
        data: {
          to: body.recipientInfo,
          body: `Check out this flyer: ${(flyer as any).url}`,
          isWhatsApp: true,
        },
      });
    } else if (body.channel === 'email' && body.recipientInfo) {
      await c.env.EMAIL_QUEUE.send({
        type: 'email',
        data: {
          to: body.recipientInfo,
          subject: `Flyer: ${(flyer as any).name}`,
          html: `<p>Here's the flyer: <a href="${(flyer as any).url}">View Flyer</a></p>`,
        },
      });
    }

    return created(c, { id, channel: body.channel });
  }
);

// ============================================================
// DELETE FLYER
// ============================================================

flyerRoutes.delete(
  '/:id',
  requirePermission('marketing', 'delete'),
  async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');

    const flyer = await db.prepare('SELECT * FROM generated_flyers WHERE id = ?').bind(id).first();
    if (!flyer) return notFound(c, 'Flyer');

    // Delete from R2
    if ((flyer as any).r2_key) {
      await c.env.FILE_STORAGE.delete((flyer as any).r2_key);
    }

    await db.prepare('DELETE FROM generated_flyers WHERE id = ?').bind(id).run();
    return success(c, { deleted: true });
  }
);

export default flyerRoutes;
