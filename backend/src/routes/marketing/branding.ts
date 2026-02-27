import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppContext } from '../../types';
import { requirePermission } from '../../middleware/rbac';
import { generateId } from '../../utils/uuid';
import { success, created, error } from '../../utils/response';
import { updateBrandingSchema } from '../../validators/marketing';

const brandingRoutes = new Hono<AppContext>();

// ============================================================
// GET TENANT BRANDING
// ============================================================

brandingRoutes.get(
  '/',
  requirePermission('marketing', 'view'),
  async (c) => {
    const db = c.get('tenantDb');
    const tenantId = c.get('tenantId');

    const branding = await db
      .prepare('SELECT * FROM tenant_branding WHERE tenant_id = ?')
      .bind(tenantId)
      .first();

    if (!branding) {
      // Return defaults if no branding set
      return success(c, {
        tenant_id: tenantId,
        primary_color: '#1976D2',
        secondary_color: '#424242',
        accent_color: '#FF9800',
        primary_font: 'Roboto',
        secondary_font: 'Open Sans',
      });
    }

    return success(c, branding);
  }
);

// ============================================================
// UPDATE TENANT BRANDING (upsert)
// ============================================================

brandingRoutes.put(
  '/',
  requirePermission('marketing', 'edit'),
  zValidator('json', updateBrandingSchema),
  async (c) => {
    const db = c.get('tenantDb');
    const tenantId = c.get('tenantId');
    const body = c.req.valid('json');
    const now = new Date().toISOString();

    const existing = await db
      .prepare('SELECT id FROM tenant_branding WHERE tenant_id = ?')
      .bind(tenantId)
      .first();

    if (existing) {
      // Update
      const updates: string[] = [];
      const params: any[] = [];

      const fieldMap: Record<string, string> = {
        logoUrl: 'logo_url',
        primaryColor: 'primary_color',
        secondaryColor: 'secondary_color',
        accentColor: 'accent_color',
        primaryFont: 'primary_font',
        secondaryFont: 'secondary_font',
        agencyName: 'agency_name',
        agencyPhone: 'agency_phone',
        agencyEmail: 'agency_email',
        agencyWebsite: 'agency_website',
        tagline: 'tagline',
      };

      for (const [key, value] of Object.entries(body)) {
        const col = fieldMap[key];
        if (col) {
          updates.push(`${col} = ?`);
          params.push(value);
        }
      }

      if (updates.length > 0) {
        updates.push('updated_at = ?');
        params.push(now, tenantId);
        await db
          .prepare(`UPDATE tenant_branding SET ${updates.join(', ')} WHERE tenant_id = ?`)
          .bind(...params)
          .run();
      }
    } else {
      // Insert
      const id = generateId();
      await db
        .prepare(
          `INSERT INTO tenant_branding (
            id, tenant_id, logo_url, primary_color, secondary_color, accent_color,
            primary_font, secondary_font, agency_name, agency_phone, agency_email,
            agency_website, tagline, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          tenantId,
          body.logoUrl || null,
          body.primaryColor || '#1976D2',
          body.secondaryColor || '#424242',
          body.accentColor || '#FF9800',
          body.primaryFont || 'Roboto',
          body.secondaryFont || 'Open Sans',
          body.agencyName || null,
          body.agencyPhone || null,
          body.agencyEmail || null,
          body.agencyWebsite || null,
          body.tagline || null,
          now,
          now
        )
        .run();
    }

    const result = await db
      .prepare('SELECT * FROM tenant_branding WHERE tenant_id = ?')
      .bind(tenantId)
      .first();
    return success(c, result);
  }
);

export default brandingRoutes;
