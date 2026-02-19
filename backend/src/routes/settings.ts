import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import type { AppContext } from '../types';
import { settings } from '../db/tenant-schema';
import { rbac } from '../middleware/rbac';
import { logActivity } from '../utils/activity-logger';
import { success, error } from '../utils/response';

const settingsRoutes = new Hono<AppContext>();

// ============================================================
// GET /company — Get company settings
// ============================================================

settingsRoutes.get('/company', async (c) => {
  const db = drizzle(c.get('tenantDb'));

  const rows = await db.select().from(settings);

  const result: Record<string, string | null> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }

  return success(c, result);
});

// ============================================================
// PUT /company — Update company settings (admin only)
// ============================================================

const updateSettingsSchema = z.record(z.string(), z.string().nullable());

settingsRoutes.put(
  '/company',
  rbac(['admin']),
  zValidator('json', updateSettingsSchema),
  async (c) => {
    const data = c.req.valid('json');
    const db = drizzle(c.get('tenantDb'));
    const userId = c.get('userId');
    const now = new Date().toISOString();

    for (const [key, value] of Object.entries(data)) {
      const [existing] = await db
        .select()
        .from(settings)
        .where(eq(settings.key, key))
        .limit(1);

      if (existing) {
        await db
          .update(settings)
          .set({ value, updatedBy: userId, updatedAt: now })
          .where(eq(settings.key, key));
      } else {
        await db.insert(settings).values({
          key,
          value,
          updatedBy: userId,
          updatedAt: now,
        });
      }
    }

    await logActivity(db, {
      userId,
      action: 'update_settings',
      entityType: 'settings',
      details: JSON.stringify({ keys: Object.keys(data) }),
    });

    return success(c, { message: 'Settings updated' });
  }
);

// ============================================================
// POST /logo — Upload company logo (admin only)
// ============================================================

settingsRoutes.post('/logo', rbac(['admin']), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const userId = c.get('userId');
  const tenantId = c.get('tenantId');

  const formData = await c.req.formData();
  const file = formData.get('logo') as File | null;

  if (!file) {
    return error(c, 'No file provided', 400);
  }

  const ext = file.name.split('.').pop() || 'png';
  const key = `logos/${tenantId}/logo.${ext}`;

  await c.env.FILE_STORAGE.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  const logoUrl = `/files/${key}`;

  // Store as setting
  const [existing] = await db.select().from(settings).where(eq(settings.key, 'company_logo')).limit(1);
  if (existing) {
    await db.update(settings).set({ value: logoUrl, updatedBy: userId, updatedAt: new Date().toISOString() }).where(eq(settings.key, 'company_logo'));
  } else {
    await db.insert(settings).values({ key: 'company_logo', value: logoUrl, updatedBy: userId, updatedAt: new Date().toISOString() });
  }

  await logActivity(db, {
    userId,
    action: 'upload_logo',
    entityType: 'settings',
  });

  return success(c, { logoUrl });
});

export default settingsRoutes;
