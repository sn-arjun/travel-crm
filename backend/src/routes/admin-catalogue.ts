import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { zValidator } from '../utils/validator';
import type { AppContext, Env } from '../types';
import { success, error, notFound } from '../utils/response';
import { generateId } from '../utils/uuid';
import { superAdminIdFor } from '../middleware/require-super-admin';
import {
  ALLOWANCE_KEYS,
  bumpCatalogueVersion,
  currentPeriodKey,
  getAllowance,
  getCatalogue,
  seatLimit,
  tenantPlanKey,
} from '../services/plans/catalogue';
import { catalogueView } from '../services/plans/view';

/**
 * Plan catalogue administration (R109). Mounted by routes/admin.ts at /admin/catalogue (behind requireSuperAdmin)
 * plus POST /admin/tenants/:id/addons. Every write is audited in super_admin_audit_log and bumps the catalogue
 * version, so readers pick the change up immediately instead of after the 5-minute cache.
 * R111/R112 build the rest of the super admin API and console around these endpoints.
 */
export const catalogueAdminRoutes = new Hono<AppContext>();

async function audit(c: Context<AppContext>, action: string, entityType: string, entityId: string, details: Record<string, unknown>): Promise<void> {
  const env = c.env as Env;
  const email = c.get('jwtPayload')?.email;
  const adminId = await superAdminIdFor(env, email);
  await env.MASTER_DB
    .prepare(
      `INSERT INTO super_admin_audit_log (id, admin_id, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      generateId(),
      adminId,
      action,
      entityType,
      entityId,
      JSON.stringify({ actor: email ?? null, ...details }),
      c.get('clientIp') ?? null,
      c.req.header('User-Agent') ?? null,
    )
    .run();
}

/** Build "col = ?" assignments from the defined keys of a patch. Column names come from the code, never the client. */
function patchSql(patch: Record<string, unknown>, columns: Record<string, string>): { sql: string; binds: unknown[] } | null {
  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const [key, column] of Object.entries(columns)) {
    if (patch[key] === undefined) continue;
    sets.push(`${column} = ?`);
    const v = patch[key];
    binds.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
  }
  return sets.length ? { sql: sets.join(', '), binds } : null;
}

// GET /admin/catalogue — everything, with computed add-on prices
catalogueAdminRoutes.get('/', async (c) => {
  const catalogue = await getCatalogue(c.env);
  const notes = await c.env.MASTER_DB.prepare(`SELECT value FROM catalogue_notes WHERE key = 'drafts'`).first<{ value: string }>();
  return success(c, { ...catalogueView(catalogue), notes: notes?.value ?? null });
});

const planSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(400).nullable().optional(),
  isPublic: z.boolean().optional(),
  isActive: z.boolean().optional(),
  trialDays: z.number().int().min(0).max(365).optional(),
  sortOrder: z.number().int().optional(),
  features: z.array(z.string().trim().min(1).max(64)).max(200).optional(),
});

catalogueAdminRoutes.put('/plans/:key', zValidator('json', planSchema), async (c) => {
  const key = c.req.param('key');
  const body = c.req.valid('json');
  const db = c.env.MASTER_DB;
  const plan = await db.prepare('SELECT key FROM plans WHERE key = ?').bind(key).first();
  if (!plan) return notFound(c, 'Plan');

  const stmts: D1PreparedStatement[] = [];
  const patch = patchSql(body, { name: 'name', description: 'description', isPublic: 'is_public', isActive: 'is_active', trialDays: 'trial_days', sortOrder: 'sort_order' });
  if (patch) {
    stmts.push(db.prepare(`UPDATE plans SET ${patch.sql}, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE key = ?`).bind(...patch.binds, key));
  }
  if (body.features) {
    const unique = [...new Set(body.features)];
    stmts.push(db.prepare('DELETE FROM plan_features WHERE plan_key = ?').bind(key));
    for (const f of unique) stmts.push(db.prepare('INSERT INTO plan_features (plan_key, feature_key) VALUES (?, ?)').bind(key, f));
  }
  if (stmts.length) await db.batch(stmts);
  await bumpCatalogueVersion(c.env);
  await audit(c, 'catalogue.plan.update', 'plan', key, { changes: body });
  const updated = (await getCatalogue(c.env)).plans.find((p) => p.key === key);
  return success(c, updated);
});

const priceSchema = z.object({
  currency: z.string().trim().length(3).optional(),
  yearlyPrice: z.number().min(0).optional(),
  includedUsers: z.number().int().min(1).optional(),
  extraUserYearlyPrice: z.number().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
});

catalogueAdminRoutes.put('/prices/:id', zValidator('json', priceSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const row = await c.env.MASTER_DB.prepare('SELECT id FROM plan_prices WHERE id = ?').bind(id).first();
  if (!row) return notFound(c, 'Price');
  const patch = patchSql(
    { ...body, currency: body.currency?.toUpperCase() },
    { currency: 'currency', yearlyPrice: 'yearly_price', includedUsers: 'included_users', extraUserYearlyPrice: 'extra_user_yearly_price', isActive: 'is_active' },
  );
  if (patch) await c.env.MASTER_DB.prepare(`UPDATE plan_prices SET ${patch.sql} WHERE id = ?`).bind(...patch.binds, id).run();
  await bumpCatalogueVersion(c.env);
  await audit(c, 'catalogue.price.update', 'plan_price', id, { changes: body });
  const catalogue = await getCatalogue(c.env);
  return success(c, catalogue.plans.flatMap((p) => p.prices).find((p) => p.id === id));
});

const newPriceSchema = priceSchema.extend({
  planKey: z.string().trim().min(1),
  market: z.string().trim().min(2).max(16),
  currency: z.string().trim().length(3),
  yearlyPrice: z.number().min(0),
  includedUsers: z.number().int().min(1),
});

// POST /admin/catalogue/prices — price a plan for another market
catalogueAdminRoutes.post('/prices', zValidator('json', newPriceSchema), async (c) => {
  const body = c.req.valid('json');
  const plan = await c.env.MASTER_DB.prepare('SELECT key FROM plans WHERE key = ?').bind(body.planKey).first();
  if (!plan) return notFound(c, 'Plan');
  const id = generateId();
  await c.env.MASTER_DB
    .prepare(
      `INSERT INTO plan_prices (id, plan_key, market, currency, yearly_price, included_users, extra_user_yearly_price, is_active, valid_from)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
    )
    .bind(id, body.planKey, body.market.toUpperCase(), body.currency.toUpperCase(), body.yearlyPrice, body.includedUsers, body.extraUserYearlyPrice ?? null, body.isActive === false ? 0 : 1)
    .run();
  await bumpCatalogueVersion(c.env);
  await audit(c, 'catalogue.price.create', 'plan_price', id, { ...body });
  return success(c, { id }, 201);
});

const allowancesSchema = z
  .record(z.string(), z.number().int().min(0))
  .refine((v) => Object.keys(v).every((k) => (ALLOWANCE_KEYS as readonly string[]).includes(k)), {
    message: `Allowance keys must be among ${ALLOWANCE_KEYS.join(', ')}`,
  });

catalogueAdminRoutes.put('/allowances/:plan', zValidator('json', allowancesSchema), async (c) => {
  const planKey = c.req.param('plan');
  const body = c.req.valid('json');
  const db = c.env.MASTER_DB;
  const plan = await db.prepare('SELECT key FROM plans WHERE key = ?').bind(planKey).first();
  if (!plan) return notFound(c, 'Plan');
  const entries = Object.entries(body);
  if (!entries.length) return error(c, 'Send at least one allowance', 400);
  await db.batch(
    entries.map(([key, amount]) =>
      db
        .prepare(
          `INSERT INTO plan_allowances (plan_key, allowance_key, monthly_amount) VALUES (?, ?, ?)
           ON CONFLICT (plan_key, allowance_key) DO UPDATE SET monthly_amount = excluded.monthly_amount`,
        )
        .bind(planKey, key, amount),
    ),
  );
  await bumpCatalogueVersion(c.env);
  await audit(c, 'catalogue.allowances.update', 'plan', planKey, { changes: body });
  const updated = (await getCatalogue(c.env)).plans.find((p) => p.key === planKey);
  return success(c, updated?.allowances);
});

const unitCostSchema = z.object({
  unitCost: z.number().min(0).optional(),
  marginPct: z.number().min(0).max(1000).optional(),
  provider: z.string().trim().min(1).max(80).optional(),
  currency: z.string().trim().length(3).optional(),
  isActive: z.boolean().optional(),
});

catalogueAdminRoutes.put('/unit-costs/:id', zValidator('json', unitCostSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const row = await c.env.MASTER_DB.prepare('SELECT id FROM comm_unit_costs WHERE id = ?').bind(id).first();
  if (!row) return notFound(c, 'Unit cost');
  const patch = patchSql(
    { ...body, currency: body.currency?.toUpperCase() },
    { unitCost: 'unit_cost', marginPct: 'margin_pct', provider: 'provider', currency: 'currency', isActive: 'is_active' },
  );
  if (patch) await c.env.MASTER_DB.prepare(`UPDATE comm_unit_costs SET ${patch.sql} WHERE id = ?`).bind(...patch.binds, id).run();
  await bumpCatalogueVersion(c.env);
  await audit(c, 'catalogue.unit_cost.update', 'comm_unit_cost', id, { changes: body });
  const catalogue = await getCatalogue(c.env);
  return success(c, catalogue.unitCosts.find((u) => u.id === id));
});

const addonSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  units: z.number().int().min(1).optional(),
  fixedPrice: z.number().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
});

catalogueAdminRoutes.put('/addons/:key', zValidator('json', addonSchema), async (c) => {
  const key = c.req.param('key');
  const body = c.req.valid('json');
  const row = await c.env.MASTER_DB.prepare('SELECT key FROM addon_products WHERE key = ?').bind(key).first();
  if (!row) return notFound(c, 'Add-on');
  const patch = patchSql(body, { name: 'name', units: 'units', fixedPrice: 'fixed_price', isActive: 'is_active' });
  if (patch) await c.env.MASTER_DB.prepare(`UPDATE addon_products SET ${patch.sql} WHERE key = ?`).bind(...patch.binds, key).run();
  await bumpCatalogueVersion(c.env);
  await audit(c, 'catalogue.addon.update', 'addon_product', key, { changes: body });
  const view = catalogueView(await getCatalogue(c.env));
  return success(c, view.addons.find((a) => a.key === key));
});

const grantSchema = z.object({
  productKey: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(10000).default(1),
  note: z.string().trim().max(400).optional(),
});

/**
 * POST /admin/tenants/:id/addons — grant extra users, an AI credit pack or a communication pack.
 * Extra users have no period (they last until removed); packs count for the current month only.
 * Mounted by routes/admin.ts under the same super admin guard.
 */
export async function grantAddon(c: Context<AppContext>): Promise<Response> {
  const tenantId = c.req.param('id') ?? '';
  const parsed = grantSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return error(c, parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 400);
  const body = parsed.data;
  const db = c.env.MASTER_DB;

  const tenant = await db.prepare('SELECT id FROM tenants WHERE id = ?').bind(tenantId).first();
  if (!tenant) return notFound(c, 'Tenant');
  const catalogue = await getCatalogue(c.env);
  const product = catalogue.addons.find((a) => a.key === body.productKey);
  if (!product) return notFound(c, 'Add-on');

  const id = generateId();
  const periodKey = product.kind === 'extra_user' ? null : currentPeriodKey();
  const unitsGranted = product.kind === 'extra_user' ? body.quantity : product.units * body.quantity;
  const email = c.get('jwtPayload')?.email ?? null;
  await db
    .prepare(
      `INSERT INTO tenant_addons (id, tenant_id, product_key, quantity, units_granted, period_key, source, granted_by, reference)
       VALUES (?, ?, ?, ?, ?, ?, 'super_admin_grant', ?, ?)`,
    )
    .bind(id, tenantId, product.key, body.quantity, unitsGranted, periodKey, email, body.note ?? null)
    .run();

  let seats: number | undefined;
  if (product.kind === 'extra_user') {
    seats = await seatLimit(c.env, tenantId);
    await db.prepare('UPDATE tenants SET max_users = ? WHERE id = ?').bind(seats, tenantId).run();
  }
  await audit(c, 'tenant.addon.grant', 'tenant', tenantId, { productKey: product.key, kind: product.kind, quantity: body.quantity, unitsGranted, periodKey, note: body.note ?? null });

  const allowanceKey =
    product.kind === 'ai_credit_pack' ? 'ai_credits' : ALLOWANCE_KEYS.find((k) => k !== 'ai_credits' && (k === product.channel || (k === 'call_minutes' && product.channel === 'call_minute')));
  return success(
    c,
    {
      id,
      tenantId,
      productKey: product.key,
      quantity: body.quantity,
      unitsGranted,
      periodKey,
      plan: await tenantPlanKey(c.env, tenantId),
      ...(seats !== undefined && { seatLimit: seats }),
      ...(allowanceKey && { allowanceKey, allowanceThisMonth: await getAllowance(c.env, tenantId, allowanceKey) }),
    },
    201,
  );
}
