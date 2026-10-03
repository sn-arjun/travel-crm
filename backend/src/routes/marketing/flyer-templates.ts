import { Hono } from 'hono';
import { zValidator } from '../../utils/validator';
import type { AppContext } from '../../types';
import { requirePermission } from '../../middleware/rbac';
import { generateId } from '../../utils/uuid';
import { success, created, paginated, error, notFound } from '../../utils/response';
import {
  createFlyerTemplateSchema,
  updateFlyerTemplateSchema,
  flyerTemplateListSchema,
} from '../../validators/marketing';

const flyerTemplateRoutes = new Hono<AppContext>();

// Raw D1 SQL returns snake_case columns; the desktop app expects camelCase.
function parseFlyerTemplate(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description ?? undefined,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    previewUrl: row.preview_url ?? undefined,
    layoutJson: row.layout_json ?? undefined,
    // Defaults keep packages/shared FlyerTemplateModel (required width/height/sizePreset) parseable
    width: row.width ?? 1080,
    height: row.height ?? 1080,
    sizePreset: row.size_preset ?? 'custom',
    placeholders: row.placeholders ?? undefined,
    isSystem: row.is_system === 1,
    isQuickCreate: row.is_quick_create === 1,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================
// LIST FLYER TEMPLATES
// ============================================================

flyerTemplateRoutes.get(
  '/',
  requirePermission('marketing', 'view'),
  zValidator('query', flyerTemplateListSchema),
  async (c) => {
    const db = c.get('tenantDb');
    const { page, limit, category, size_preset, search, is_quick_create } = c.req.valid('query');
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM flyer_templates WHERE is_active = 1';
    const params: any[] = [];

    // Show system templates + tenant-specific templates
    const tenantId = c.get('tenantId');
    query += ' AND (tenant_id IS NULL OR tenant_id = ?)';
    params.push(tenantId);

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    if (size_preset) {
      query += ' AND size_preset = ?';
      params.push(size_preset);
    }
    if (is_quick_create !== undefined) {
      query += ' AND is_quick_create = ?';
      params.push(is_quick_create ? 1 : 0);
    }
    if (search) {
      query += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Count
    let countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countResult = await db.prepare(countQuery).bind(...params).first();
    const total = Number(countResult?.count || 0);

    query += ' ORDER BY is_system DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const results = await db.prepare(query).bind(...params).all();

    return paginated(
      c,
      (results.results || []).map((t: any) => parseFlyerTemplate(t)),
      total,
      page,
      limit
    );
  }
);

// ============================================================
// GET SINGLE TEMPLATE
// ============================================================

flyerTemplateRoutes.get(
  '/:id',
  requirePermission('marketing', 'view'),
  async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');

    const template = await db
      .prepare('SELECT * FROM flyer_templates WHERE id = ? AND is_active = 1')
      .bind(id)
      .first();

    if (!template) return notFound(c, 'Flyer template');

    // Fetch assets
    const assets = await db
      .prepare('SELECT * FROM flyer_template_assets WHERE template_id = ? ORDER BY layer_order ASC')
      .bind(id)
      .all();

    return success(c, {
      ...parseFlyerTemplate(template as any),
      assets: assets.results || [],
    });
  }
);

// ============================================================
// CREATE TEMPLATE
// ============================================================

flyerTemplateRoutes.post(
  '/',
  requirePermission('marketing', 'create'),
  zValidator('json', createFlyerTemplateSchema),
  async (c) => {
    const db = c.get('tenantDb');
    const body = c.req.valid('json');
    const id = generateId();
    const userId = c.get('userId');
    const tenantId = c.get('tenantId');
    const now = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO flyer_templates (
        id, tenant_id, name, category, description, thumbnail_url, preview_url, layout_json,
        width, height, size_preset, placeholders, is_system, is_quick_create,
        is_active, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?, ?)`
      )
      .bind(
        id,
        tenantId,
        body.name,
        body.category || 'general',
        body.description || null,
        body.thumbnailUrl || null,
        body.previewUrl || null,
        body.layoutJson || null,
        body.width || null,
        body.height || null,
        body.sizePreset || null,
        body.placeholders || null,
        body.isQuickCreate ? 1 : 0,
        userId,
        now,
        now
      )
      .run();

    const inserted = await db.prepare('SELECT * FROM flyer_templates WHERE id = ?').bind(id).first();
    return created(c, parseFlyerTemplate(inserted as any));
  }
);

// ============================================================
// UPDATE TEMPLATE (tenant templates only)
// ============================================================

flyerTemplateRoutes.put(
  '/:id',
  requirePermission('marketing', 'edit'),
  zValidator('json', updateFlyerTemplateSchema),
  async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const now = new Date().toISOString();

    // Check it exists and is not a system template
    const existing = await db
      .prepare('SELECT * FROM flyer_templates WHERE id = ? AND is_active = 1')
      .bind(id)
      .first();

    if (!existing) return notFound(c, 'Flyer template');
    if ((existing as any).is_system === 1) {
      return error(c, 'Cannot modify system templates', 403);
    }

    const updates: string[] = [];
    const params: any[] = [];

    const fieldMap: Record<string, string> = {
      name: 'name',
      category: 'category',
      description: 'description',
      thumbnailUrl: 'thumbnail_url',
      previewUrl: 'preview_url',
      layoutJson: 'layout_json',
      width: 'width',
      height: 'height',
      sizePreset: 'size_preset',
      placeholders: 'placeholders',
      isQuickCreate: 'is_quick_create',
    };

    for (const [key, value] of Object.entries(body)) {
      const col = fieldMap[key];
      if (col) {
        updates.push(`${col} = ?`);
        params.push(key === 'isQuickCreate' ? (value ? 1 : 0) : value);
      }
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(now, id);
      await db.prepare(`UPDATE flyer_templates SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
    }

    const updated = await db.prepare('SELECT * FROM flyer_templates WHERE id = ?').bind(id).first();
    return success(c, parseFlyerTemplate(updated as any));
  }
);

// ============================================================
// DELETE TEMPLATE (soft delete, tenant only)
// ============================================================

flyerTemplateRoutes.delete(
  '/:id',
  requirePermission('marketing', 'delete'),
  async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');

    const existing = await db
      .prepare('SELECT * FROM flyer_templates WHERE id = ? AND is_active = 1')
      .bind(id)
      .first();

    if (!existing) return notFound(c, 'Flyer template');
    if ((existing as any).is_system === 1) {
      return error(c, 'Cannot delete system templates', 403);
    }

    await db
      .prepare('UPDATE flyer_templates SET is_active = 0, updated_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), id)
      .run();

    return success(c, { deleted: true });
  }
);

// ============================================================
// MANAGE TEMPLATE ASSETS
// ============================================================

flyerTemplateRoutes.post(
  '/:id/assets',
  requirePermission('marketing', 'edit'),
  async (c) => {
    const db = c.get('tenantDb');
    const templateId = c.req.param('id');
    const body = await c.req.json();
    const id = generateId();

    await db
      .prepare(
        `INSERT INTO flyer_template_assets (id, template_id, asset_type, asset_url, position_json, layer_order, properties_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        templateId,
        body.assetType,
        body.assetUrl || null,
        body.positionJson || null,
        body.layerOrder || 0,
        body.propertiesJson || null,
        new Date().toISOString()
      )
      .run();

    return created(c, { id });
  }
);

flyerTemplateRoutes.delete(
  '/:templateId/assets/:assetId',
  requirePermission('marketing', 'edit'),
  async (c) => {
    const db = c.get('tenantDb');
    const assetId = c.req.param('assetId');

    await db.prepare('DELETE FROM flyer_template_assets WHERE id = ?').bind(assetId).run();
    return success(c, { deleted: true });
  }
);

export default flyerTemplateRoutes;
