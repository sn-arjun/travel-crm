import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import type { AppContext } from '../types';
import { settings, followUpSequences } from '../db/tenant-schema';
import { rbac } from '../middleware/rbac';
import { logActivity } from '../utils/activity-logger';
import { success, created, error, notFound } from '../utils/response';
import { generateId } from '../utils/uuid';

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
      ipAddress: c.get('clientIp'),
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
    ipAddress: c.get('clientIp'),
  });

  return success(c, { logoUrl });
});

// ============================================================
// GET /assignment-rules — Get assignment rules (TICKET-072)
// ============================================================

settingsRoutes.get('/assignment-rules', rbac(['admin', 'sales_manager']), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const [row] = await db.select().from(settings).where(eq(settings.key, 'assignment_rules')).limit(1);
  const rules = row?.value ? JSON.parse(row.value) : { mode: 'round_robin', rules: [] };
  return success(c, rules);
});

// ============================================================
// PUT /assignment-rules — Update assignment rules (TICKET-072)
// ============================================================

const assignmentRulesSchema = z.object({
  mode: z.enum(['round_robin', 'manual', 'source_based']),
  rules: z.array(z.object({
    userId: z.string(),
    weight: z.number().int().min(1).max(10).optional(),
  })).optional(),
});

settingsRoutes.put(
  '/assignment-rules',
  rbac(['admin']),
  zValidator('json', assignmentRulesSchema),
  async (c) => {
    const db = drizzle(c.get('tenantDb'));
    const userId = c.get('userId');
    const body = c.req.valid('json');
    const now = new Date().toISOString();
    const value = JSON.stringify(body);

    const [existing] = await db.select().from(settings).where(eq(settings.key, 'assignment_rules')).limit(1);
    if (existing) {
      await db.update(settings).set({ value, updatedBy: userId, updatedAt: now }).where(eq(settings.key, 'assignment_rules'));
    } else {
      await db.insert(settings).values({ key: 'assignment_rules', value, updatedBy: userId, updatedAt: now });
    }

    return success(c, { message: 'Assignment rules updated', rules: body });
  }
);

// ============================================================
// GET /routing-rules — Get source routing rules (TICKET-073)
// ============================================================

settingsRoutes.get('/routing-rules', rbac(['admin', 'sales_manager']), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const [row] = await db.select().from(settings).where(eq(settings.key, 'routing_rules')).limit(1);
  const rules = row?.value ? JSON.parse(row.value) : [];
  return success(c, rules);
});

// ============================================================
// PUT /routing-rules — Update source routing rules (TICKET-073)
// ============================================================

const routingRulesSchema = z.array(z.object({
  source: z.enum(['manual', 'website', 'facebook', 'google', 'referral', 'walkin']),
  assignToUserId: z.string(),
}));

settingsRoutes.put(
  '/routing-rules',
  rbac(['admin']),
  zValidator('json', routingRulesSchema),
  async (c) => {
    const db = drizzle(c.get('tenantDb'));
    const userId = c.get('userId');
    const body = c.req.valid('json');
    const now = new Date().toISOString();
    const value = JSON.stringify(body);

    const [existing] = await db.select().from(settings).where(eq(settings.key, 'routing_rules')).limit(1);
    if (existing) {
      await db.update(settings).set({ value, updatedBy: userId, updatedAt: now }).where(eq(settings.key, 'routing_rules'));
    } else {
      await db.insert(settings).values({ key: 'routing_rules', value, updatedBy: userId, updatedAt: now });
    }

    return success(c, { message: 'Routing rules updated', rules: body });
  }
);

// ============================================================
// GET /follow-up-sequences — List sequences (TICKET-077)
// ============================================================

settingsRoutes.get('/follow-up-sequences', rbac(['admin', 'sales_manager']), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const sequences = await db.select().from(followUpSequences);
  return success(c, sequences.map((s) => ({ ...s, steps: JSON.parse(s.steps) })));
});

// ============================================================
// POST /follow-up-sequences — Create sequence (TICKET-077)
// ============================================================

const sequenceStepSchema = z.object({
  day: z.number().int().min(0),
  type: z.enum(['call', 'email', 'whatsapp', 'visit', 'sms']),
  notes: z.string().optional(),
  templateId: z.string().optional(),
});

const createSequenceSchema = z.object({
  name: z.string().min(1).max(100),
  triggerStatus: z.string().min(1),
  steps: z.array(sequenceStepSchema).min(1),
  isActive: z.boolean().optional().default(true),
});

settingsRoutes.post(
  '/follow-up-sequences',
  rbac(['admin']),
  zValidator('json', createSequenceSchema),
  async (c) => {
    const db = drizzle(c.get('tenantDb'));
    const userId = c.get('userId');
    const body = c.req.valid('json');
    const id = generateId();
    const now = new Date().toISOString();

    await db.insert(followUpSequences).values({
      id,
      name: body.name,
      triggerStatus: body.triggerStatus,
      steps: JSON.stringify(body.steps),
      isActive: body.isActive ? 1 : 0,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    return created(c, { id, ...body });
  }
);

// ============================================================
// PUT /follow-up-sequences/:id — Update sequence (TICKET-077)
// ============================================================

const updateSequenceSchema = createSequenceSchema.partial();

settingsRoutes.put(
  '/follow-up-sequences/:id',
  rbac(['admin']),
  zValidator('json', updateSequenceSchema),
  async (c) => {
    const db = drizzle(c.get('tenantDb'));
    const sequenceId = c.req.param('id');
    const body = c.req.valid('json');

    const [existing] = await db.select().from(followUpSequences).where(eq(followUpSequences.id, sequenceId)).limit(1);
    if (!existing) return notFound(c, 'Follow-up sequence');

    const now = new Date().toISOString();
    await db.update(followUpSequences).set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.triggerStatus !== undefined && { triggerStatus: body.triggerStatus }),
      ...(body.steps !== undefined && { steps: JSON.stringify(body.steps) }),
      ...(body.isActive !== undefined && { isActive: body.isActive ? 1 : 0 }),
      updatedAt: now,
    }).where(eq(followUpSequences.id, sequenceId));

    const [updated] = await db.select().from(followUpSequences).where(eq(followUpSequences.id, sequenceId)).limit(1);
    return success(c, { ...updated, steps: JSON.parse(updated.steps) });
  }
);

// ============================================================
// DELETE /follow-up-sequences/:id — Delete sequence (TICKET-077)
// ============================================================

settingsRoutes.delete('/follow-up-sequences/:id', rbac(['admin']), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const sequenceId = c.req.param('id');

  const [existing] = await db.select().from(followUpSequences).where(eq(followUpSequences.id, sequenceId)).limit(1);
  if (!existing) return notFound(c, 'Follow-up sequence');

  await db.delete(followUpSequences).where(eq(followUpSequences.id, sequenceId));
  return success(c, { message: 'Sequence deleted' });
});

export default settingsRoutes;
