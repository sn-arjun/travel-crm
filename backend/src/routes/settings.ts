import { Hono } from 'hono';
import { zValidator } from '../utils/validator';
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

// ============================================================
// GET /itinerary-defaults — Get itinerary default settings (TICKET-089)
// ============================================================

settingsRoutes.get('/itinerary-defaults', async (c) => {
  const db = drizzle(c.get('tenantDb'));

  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, 'itinerary_defaults'))
    .limit(1);

  const defaults = row?.value
    ? JSON.parse(row.value)
    : {
        defaultCurrency: 'INR',
        defaultTerms: '',
        defaultInclusions: [],
        defaultExclusions: [],
        validityDays: 7,
        childPricePercent: 50,
        groupDiscountThreshold: 10,
        groupDiscountPercent: 5,
      };

  return success(c, defaults);
});

// ============================================================
// PUT /itinerary-defaults — Update itinerary default settings (TICKET-089)
// ============================================================

const itineraryDefaultsSchema = z.object({
  defaultCurrency: z.string().min(1).max(10).optional(),
  defaultTerms: z.string().optional(),
  defaultInclusions: z.array(z.string()).optional(),
  defaultExclusions: z.array(z.string()).optional(),
  validityDays: z.number().int().min(1).max(365).optional(),
  childPricePercent: z.number().min(0).max(100).optional(),
  groupDiscountThreshold: z.number().int().min(1).optional(),
  groupDiscountPercent: z.number().min(0).max(100).optional(),
});

settingsRoutes.put(
  '/itinerary-defaults',
  rbac(['admin']),
  zValidator('json', itineraryDefaultsSchema),
  async (c) => {
    const db = drizzle(c.get('tenantDb'));
    const userId = c.get('userId');
    const body = c.req.valid('json');
    const now = new Date().toISOString();
    const value = JSON.stringify(body);

    const [existing] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, 'itinerary_defaults'))
      .limit(1);

    if (existing) {
      await db
        .update(settings)
        .set({ value, updatedBy: userId, updatedAt: now })
        .where(eq(settings.key, 'itinerary_defaults'));
    } else {
      await db.insert(settings).values({
        key: 'itinerary_defaults',
        value,
        updatedBy: userId,
        updatedAt: now,
      });
    }

    await logActivity(db, {
      userId,
      action: 'update_settings',
      entityType: 'settings',
      details: JSON.stringify({ key: 'itinerary_defaults' }),
      ipAddress: c.get('clientIp'),
    });

    return success(c, { message: 'Itinerary defaults updated', defaults: body });
  }
);

// ============================================================
// GET /invoice-defaults — Get invoice default settings (TICKET-126)
// ============================================================

settingsRoutes.get('/invoice-defaults', async (c) => {
  const db = drizzle(c.get('tenantDb'));

  const keys = [
    'bank_details', 'default_payment_terms', 'default_due_days',
    'default_tax_type', 'default_tax_rate', 'gstin', 'company_state',
    'company_name', 'company_address', 'company_phone', 'company_email',
    'tax_system', 'upi_id',
  ];

  const rows = await db.select().from(settings);
  const result: Record<string, any> = {};

  for (const row of rows) {
    if (keys.includes(row.key)) {
      try {
        result[row.key] = JSON.parse(row.value || 'null');
      } catch {
        result[row.key] = row.value;
      }
    }
  }

  // Defaults
  if (!result.default_due_days) result.default_due_days = 30;
  if (!result.default_tax_type) result.default_tax_type = 'gst';
  if (!result.default_tax_rate) result.default_tax_rate = 18;
  if (!result.tax_system) result.tax_system = 'gst';

  return success(c, result);
});

// ============================================================
// PUT /invoice-defaults — Update invoice defaults (TICKET-126)
// ============================================================

const invoiceDefaultsSchema = z.object({
  bank_details: z.record(z.string(), z.any()).optional(),
  default_payment_terms: z.string().optional(),
  default_due_days: z.number().int().min(1).max(365).optional(),
  default_tax_type: z.enum(['gst', 'vat', 'sales_tax', 'none']).optional(),
  default_tax_rate: z.number().min(0).max(100).optional(),
  gstin: z.string().optional(),
  company_state: z.string().optional(),
  tax_system: z.enum(['gst', 'vat', 'sales_tax', 'none']).optional(),
  upi_id: z.string().optional(),
});

settingsRoutes.put(
  '/invoice-defaults',
  rbac(['admin']),
  zValidator('json', invoiceDefaultsSchema),
  async (c) => {
    const db = drizzle(c.get('tenantDb'));
    const userId = c.get('userId');
    const body = c.req.valid('json');
    const now = new Date().toISOString();

    for (const [key, value] of Object.entries(body)) {
      if (value === undefined) continue;
      const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

      const [existing] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
      if (existing) {
        await db.update(settings).set({ value: strValue, updatedBy: userId, updatedAt: now }).where(eq(settings.key, key));
      } else {
        await db.insert(settings).values({ key, value: strValue, updatedBy: userId, updatedAt: now });
      }
    }

    await logActivity(db, {
      userId,
      action: 'update_settings',
      entityType: 'settings',
      details: JSON.stringify({ key: 'invoice_defaults', keys: Object.keys(body) }),
      ipAddress: c.get('clientIp'),
    });

    return success(c, { message: 'Invoice defaults updated' });
  }
);

// ============================================================
// GET /numbering — Get auto-numbering config (TICKET-106)
// ============================================================

settingsRoutes.get('/numbering', async (c) => {
  const tenantDb = c.get('tenantDb');
  try {
    const result = await tenantDb.prepare(`SELECT * FROM settings WHERE key = 'numbering_config'`).first();
    const defaults = {
      invoice_prefix: 'INV',
      proforma_prefix: 'PI',
      receipt_prefix: 'RCP',
      credit_note_prefix: 'CN',
      debit_note_prefix: 'DN',
      voucher_prefix: 'VCH',
      fy_start_month: 4,
      reset_yearly: true,
    };
    if (result?.value) {
      try { return success(c, { ...defaults, ...JSON.parse(result.value as string) }); } catch {}
    }
    return success(c, defaults);
  } catch (err: any) {
    return error(c, err.message || 'Failed to fetch numbering config', 500);
  }
});

// ============================================================
// PUT /numbering — Update auto-numbering config (TICKET-106)
// ============================================================

settingsRoutes.put('/numbering', async (c) => {
  const tenantDb = c.get('tenantDb');
  const body = await c.req.json();
  try {
    const value = JSON.stringify(body);
    await tenantDb.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES ('numbering_config', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).bind(value).run();
    return success(c, body);
  } catch (err: any) {
    return error(c, err.message || 'Failed to update numbering config', 500);
  }
});

export default settingsRoutes;
