import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppContext } from '../../types';
import { requirePermission } from '../../middleware/rbac';
import { generateId } from '../../utils/uuid';
import { success, created, paginated, error, notFound } from '../../utils/response';
import {
  createGeneratedFlyerSchema,
  updateGeneratedFlyerSchema,
  flyerListSchema,
  createFlyerShareSchema,
} from '../../validators/marketing';

const flyerRoutes = new Hono<AppContext>();

// Raw D1 SQL returns snake_case columns; the desktop app expects camelCase.
function parseFlyer(row: Record<string, unknown>) {
  let content: Record<string, unknown> | undefined;
  try {
    content = row.content_json ? JSON.parse(row.content_json as string) : undefined;
  } catch {
    content = undefined;
  }

  return {
    id: row.id,
    templateId: row.template_id ?? undefined,
    title: (row.title ?? row.name) as string,
    content,
    imageUrl: row.image_url ?? row.url ?? undefined,
    status: row.status ?? 'draft',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================
// LIST GENERATED FLYERS
// ============================================================

flyerRoutes.get(
  '/',
  requirePermission('marketing', 'view'),
  zValidator('query', flyerListSchema),
  async (c) => {
    const db = c.get('tenantDb');
    const { page, limit, status, search, sortBy, sortOrder } = c.req.valid('query');
    const offset = (page - 1) * limit;
    const tenantId = c.get('tenantId');

    let query = 'SELECT * FROM generated_flyers WHERE tenant_id = ?';
    const params: any[] = [tenantId];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (search) {
      query += ' AND (title LIKE ? OR name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    let countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countResult = await db.prepare(countQuery).bind(...params).first();
    const total = Number(countResult?.count || 0);

    const sortCol = sortBy === 'title' ? 'title' : 'created_at';
    query += ` ORDER BY ${sortCol} ${sortOrder === 'asc' ? 'ASC' : 'DESC'} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const results = await db.prepare(query).bind(...params).all();
    return paginated(c, (results.results || []).map((f: any) => parseFlyer(f)), total, page, limit);
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

    return success(c, parseFlyer(flyer as any));
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
          id, tenant_id, template_id, name, title, content_json, image_url, status,
          layout_json, format, width, height, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        tenantId,
        body.templateId,
        body.name || body.title,
        body.title,
        body.content ? JSON.stringify(body.content) : null,
        body.imageUrl || null,
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
    return created(c, parseFlyer(inserted as any));
  }
);

// ============================================================
// UPDATE GENERATED FLYER
// ============================================================

flyerRoutes.put(
  '/:id',
  requirePermission('marketing', 'edit'),
  zValidator('json', updateGeneratedFlyerSchema),
  async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const now = new Date().toISOString();

    const existing = await db.prepare('SELECT * FROM generated_flyers WHERE id = ?').bind(id).first();
    if (!existing) return notFound(c, 'Flyer');

    const updates: string[] = [];
    const params: any[] = [];

    if (body.title !== undefined) {
      updates.push('title = ?', 'name = ?');
      params.push(body.title, body.title);
    }
    if (body.content !== undefined) {
      updates.push('content_json = ?');
      params.push(JSON.stringify(body.content));
    }
    if (body.imageUrl !== undefined) {
      updates.push('image_url = ?');
      params.push(body.imageUrl);
    }
    if (body.status !== undefined) {
      updates.push('status = ?');
      params.push(body.status);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(now, id);
      await db.prepare(`UPDATE generated_flyers SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
    }

    const updated = await db.prepare('SELECT * FROM generated_flyers WHERE id = ?').bind(id).first();
    return success(c, parseFlyer(updated as any));
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
        'UPDATE generated_flyers SET r2_key = ?, url = ?, image_url = ?, file_size = ?, format = ?, updated_at = ? WHERE id = ?'
      )
      .bind(r2Key, url, url, file.size, ext, new Date().toISOString(), id)
      .run();

    const updated = await db.prepare('SELECT * FROM generated_flyers WHERE id = ?').bind(id).first();
    return success(c, parseFlyer(updated as any));
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

    if (!body.segmentId && !body.contactIds?.length && !body.recipientInfo) {
      return error(c, 'A segment, contacts, or recipient is required to share', 400);
    }

    let recipientCount = 0;

    if (body.segmentId) {
      const segment = await db
        .prepare('SELECT * FROM contact_segments WHERE id = ? AND is_deleted = 0')
        .bind(body.segmentId)
        .first();
      if (!segment) return error(c, 'Segment not found', 400);

      const contacts = await db
        .prepare('SELECT id, email, phone FROM contacts WHERE is_deleted = 0 AND opted_out = 0')
        .all();
      const contactList = contacts.results || [];
      recipientCount = contactList.length;

      const flyerUrl = (flyer as any).image_url ?? (flyer as any).url;
      const flyerTitle = (flyer as any).title ?? (flyer as any).name;

      for (const contact of contactList) {
        const phone = (contact as any).phone;
        const emailAddr = (contact as any).email;
        if (body.channel === 'whatsapp' && phone) {
          // eslint-disable-next-line no-await-in-loop
          await c.env.SMS_QUEUE.send({
            type: 'sms',
            data: { to: phone, body: `Check out this flyer: ${flyerUrl}`, isWhatsApp: true },
          });
        } else if (body.channel === 'sms' && phone) {
          // eslint-disable-next-line no-await-in-loop
          await c.env.SMS_QUEUE.send({
            type: 'sms',
            data: { to: phone, body: `Check out this flyer: ${flyerUrl}` },
          });
        } else if (body.channel === 'email' && emailAddr) {
          // eslint-disable-next-line no-await-in-loop
          await c.env.EMAIL_QUEUE.send({
            type: 'email',
            data: { to: emailAddr, subject: `Flyer: ${flyerTitle}`, html: `<p>Here's the flyer: <a href="${flyerUrl}">View Flyer</a></p>` },
          });
        }
      }
    } else if (body.channel === 'whatsapp' && body.recipientInfo) {
      await c.env.SMS_QUEUE.send({
        type: 'sms',
        data: { to: body.recipientInfo, body: `Check out this flyer: ${(flyer as any).image_url ?? (flyer as any).url}`, isWhatsApp: true },
      });
      recipientCount = 1;
    } else if (body.channel === 'email' && body.recipientInfo) {
      await c.env.EMAIL_QUEUE.send({
        type: 'email',
        data: {
          to: body.recipientInfo,
          subject: `Flyer: ${(flyer as any).title ?? (flyer as any).name}`,
          html: `<p>Here's the flyer: <a href="${(flyer as any).image_url ?? (flyer as any).url}">View Flyer</a></p>`,
        },
      });
      recipientCount = 1;
    }

    await db
      .prepare(
        `INSERT INTO flyer_shares (id, flyer_id, channel, recipient_info, segment_id, shared_by, shared_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, body.flyerId, body.channel, body.recipientInfo || null, body.segmentId || null, userId, now)
      .run();

    return created(c, { id, channel: body.channel, recipientCount });
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
