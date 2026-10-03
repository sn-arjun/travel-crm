import { Hono } from 'hono';
import { zValidator } from '../utils/validator';
import { authMiddleware } from '../middleware/auth';
import {
    createSupplierSchema,
    updateSupplierSchema,
    supplierListSchema,
    rateSupplierSchema
} from '../validators/supplier';
import {
    createRateCardSchema,
    updateRateCardSchema,
    compareRatesSchema
} from '../validators/rate-card';
import {
    supplierPaymentSchema,
    reconcilePaymentsSchema
} from '../validators/supplier-payment';
import type { AppContext } from '../types';
import { generateId } from '../utils/uuid';

const supplierRouter = new Hono<AppContext>();

supplierRouter.use('*', authMiddleware);

// ============================================================================
// SUPPLIER CRUD
// ============================================================================

// List Suppliers
supplierRouter.get('/', zValidator('query', supplierListSchema), async (c) => {
    const db = c.get('tenantDb');
    const { page, limit, category, status, search, sort_by, sort_order, is_preferred } = c.req.valid('query');
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM suppliers WHERE is_deleted = 0';
    const params: any[] = [];

    if (category) { query += ' AND category = ?'; params.push(category); }
    if (status) { query += ' AND status = ?'; params.push(status); }
    if (is_preferred !== undefined) { query += ' AND is_preferred = ?'; params.push(is_preferred ? 1 : 0); }

    // NOTE: Simple LIKE search since FTS5 is not strictly defined in Drizzle table schemas
    if (search) {
        query += ' AND (company_name LIKE ? OR contact_person LIKE ? OR email LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const orderBy = sort_by || 'company_name';
    const orderDir = sort_order === 'desc' ? 'DESC' : 'ASC';
    query += ` ORDER BY ${orderBy} ${orderDir} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const results = await db.prepare(query).bind(...params).all();

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM suppliers WHERE is_deleted = 0';
    const countParams: any[] = [];
    if (category) { countQuery += ' AND category = ?'; countParams.push(category); }
    if (status) { countQuery += ' AND status = ?'; countParams.push(status); }
    if (is_preferred !== undefined) { countQuery += ' AND is_preferred = ?'; countParams.push(is_preferred ? 1 : 0); }
    if (search) {
        countQuery += ' AND (company_name LIKE ? OR contact_person LIKE ? OR email LIKE ?)';
        countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    const countResult = await db.prepare(countQuery).bind(...countParams).first();
    const total = Number(countResult?.count || 0);

    return c.json({
        success: true,
        data: (results.results || []).map((s: any) => ({
            ...s,
            is_preferred: s.is_preferred === 1
        })),
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            hasMore: page * limit < total
        }
    });
});

// Category Summary
supplierRouter.get('/categories/summary', async (c) => {
    const db = c.get('tenantDb');
    const results = await db.prepare(
        'SELECT category, COUNT(*) as count FROM suppliers WHERE is_deleted = 0 GROUP BY category'
    ).all();

    const summary: Record<string, number> = {};
    for (const row of results.results) {
        summary[row.category as string] = row.count as number;
    }
    return c.json({ data: summary });
});

// Compare Rates
supplierRouter.get('/compare-rates', zValidator('query', compareRatesSchema), async (c) => {
    const db = c.get('tenantDb');
    const { service_type, destination, season, date } = c.req.valid('query');

    let query = `
    SELECT rc.*, s.company_name, s.category, s.rating, s.is_preferred
    FROM rate_cards rc
    JOIN suppliers s ON rc.supplier_id = s.id
    WHERE rc.service_type = ? AND rc.destination = ? 
      AND rc.is_active = 1 AND s.is_deleted = 0
  `;
    const params: any[] = [service_type, destination];

    if (season) { query += ' AND rc.season = ?'; params.push(season); }
    if (date) { query += ' AND rc.valid_from <= ? AND rc.valid_to >= ?'; params.push(date, date); }

    query += ' ORDER BY rc.cost_price ASC';
    const results = await db.prepare(query).bind(...params).all();
    const data = (results.results as any[]).map((r) => ({
        supplierId: r.supplier_id,
        supplierName: r.company_name,
        rate: r.cost_price,
        currency: r.currency,
        season: r.season,
        unit: r.unit,
        isPreferred: !!r.is_preferred,
    }));
    return c.json({ data });
});

// Get Supplier by ID
supplierRouter.get('/:id', async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');

    const supplier = await db.prepare('SELECT * FROM suppliers WHERE id = ? AND is_deleted = 0').bind(id).first();
    if (!supplier) return c.json({ error: 'Supplier not found' }, 404);

    // Aggregate stats
    const rateCardsCount = await db.prepare('SELECT COUNT(*) as count FROM rate_cards WHERE supplier_id = ?').bind(id).first();
    const totalPayments = await db.prepare('SELECT SUM(amount) as total FROM payments WHERE supplier_id = ? AND type = "outgoing"').bind(id).first();

    return c.json({
        data: {
            ...supplier,
            is_preferred: supplier.is_preferred === 1,
            total_rate_cards: rateCardsCount?.count || 0,
            total_payments: totalPayments?.total || 0,
        }
    });
});

// Create Supplier
supplierRouter.post('/', zValidator('json', createSupplierSchema), async (c) => {
    const db = c.get('tenantDb');
    const body = c.req.valid('json');
    const id = generateId();
    const userId = c.get('userId');
    const now = new Date().toISOString();

    await db.prepare(`
    INSERT INTO suppliers (
      id, company_name, contact_person, email, phone, address, city, state, country, 
      postal_code, gst_number, tax_id, category, website, notes, is_preferred, status, 
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
        id, body.companyName, body.contactPerson || null, body.email || null, body.phone || null,
        body.address || null, body.city || null, body.state || null, body.country || null,
        body.postalCode || null, body.gstNumber || null, body.taxId || null, body.category,
        body.website || null, body.notes || null, body.isPreferred ? 1 : 0, body.status || 'active',
        userId, now, now
    ).run();

    // Fetch the inserted row to return snake_case keys matching the Dart model
    const inserted = await db.prepare('SELECT * FROM suppliers WHERE id = ?').bind(id).first();
    return c.json({ data: { ...inserted, is_preferred: (inserted as any)?.is_preferred === 1 } }, 201);
});

// Update Supplier
supplierRouter.put('/:id', zValidator('json', updateSupplierSchema), async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const now = new Date().toISOString();

    const updates: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(body)) {
        // Map camelCase to snake_case
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        updates.push(`${snakeKey} = ?`);
        params.push(value);
    }

    if (updates.length > 0) {
        updates.push('updated_at = ?');
        params.push(now);
        params.push(id);
        await db.prepare(`UPDATE suppliers SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
    }

    const updated = await db.prepare('SELECT * FROM suppliers WHERE id = ?').bind(id).first();
    return c.json({ data: updated });
});

// Delete Supplier
supplierRouter.delete('/:id', async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    await db.prepare('UPDATE suppliers SET is_deleted = 1, updated_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run();
    return c.json({ success: true });
});

// Toggle Preferred
supplierRouter.post('/:id/toggle-preferred', async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    const supplier = await db.prepare('SELECT is_preferred FROM suppliers WHERE id = ?').bind(id).first();
    if (!supplier) return c.json({ error: 'Not found' }, 404);

    const newPreferred = supplier.is_preferred ? 0 : 1;
    await db.prepare('UPDATE suppliers SET is_preferred = ?, updated_at = ? WHERE id = ?').bind(newPreferred, new Date().toISOString(), id).run();
    return c.json({ success: true, is_preferred: Boolean(newPreferred) });
});

// Rate Supplier
supplierRouter.post('/:id/rate', zValidator('json', rateSupplierSchema), async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    const { rating } = c.req.valid('json');
    // Simplistic rating replacement, a real system might average it out
    await db.prepare('UPDATE suppliers SET rating = ?, updated_at = ? WHERE id = ?').bind(rating, new Date().toISOString(), id).run();
    return c.json({ success: true, rating });
});

// ============================================================================
// SUPPLIER RATE CARDS
// ============================================================================

supplierRouter.get('/:id/rate-cards', async (c) => {
    const db = c.get('tenantDb');
    const supplierId = c.req.param('id');
    const { service_type, destination, season, page = '1', limit = '20' } = c.req.query();

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let query = 'SELECT * FROM rate_cards WHERE supplier_id = ? AND is_active = 1';
    const params: any[] = [supplierId];

    if (service_type) { query += ' AND service_type = ?'; params.push(service_type); }
    if (destination) { query += ' AND destination = ?'; params.push(destination); }
    if (season) { query += ' AND season = ?'; params.push(season); }

    query += ' ORDER BY service_type ASC, destination ASC, valid_from DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const results = await db.prepare(query).bind(...params).all();
    return c.json({ data: results.results });
});

supplierRouter.post('/:id/rate-cards', zValidator('json', createRateCardSchema), async (c) => {
    const db = c.get('tenantDb');
    const supplierId = c.req.param('id');
    const body = c.req.valid('json');
    const id = generateId();
    const userId = c.get('userId');

    await db.prepare(`
    INSERT INTO rate_cards (
      id, supplier_id, service_type, destination, name, description, season, 
      cost_price, selling_price, currency, unit, valid_from, valid_to, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
        id, supplierId, body.service_type, body.destination || null, body.name, body.description || null,
        body.season || null, body.cost_price, body.selling_price || null, body.currency || 'INR',
        body.unit, body.valid_from || null, body.valid_to || null, userId, new Date().toISOString()
    ).run();

    return c.json({ id }, 201);
});

// ============================================================================
// SUPPLIER PAYMENTS & LEDGER
// ============================================================================

supplierRouter.post('/:id/payments', zValidator('json', supplierPaymentSchema), async (c) => {
    const db = c.get('tenantDb');
    const supplierId = c.req.param('id');
    const body = c.req.valid('json');
    const paymentId = generateId();
    const userId = c.get('userId');

    await db.prepare(`
    INSERT INTO payments (
      id, supplier_id, amount, method, reference, date, type, notes, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
        paymentId, supplierId, body.amount, body.method, body.reference_number || null,
        body.payment_date, 'outgoing', body.notes || null, userId, new Date().toISOString()
    ).run();

    return c.json({ id: paymentId }, 201);
});

supplierRouter.get('/:id/payments', async (c) => {
    const db = c.get('tenantDb');
    const supplierId = c.req.param('id');

    const results = await db.prepare(
        'SELECT * FROM payments WHERE supplier_id = ? AND type = "outgoing" ORDER BY date DESC'
    ).bind(supplierId).all();

    return c.json({ data: results.results });
});

supplierRouter.get('/:id/ledger', async (c) => {
    const db = c.get('tenantDb');
    const supplierId = c.req.param('id');

    // Fetch payments (credits - outgoing money to supplier reduces balance)
    const payments = await db.prepare(
        "SELECT id, amount, date, method, reference as description, 'credit' as entry_type, notes FROM payments WHERE supplier_id = ? AND type = 'outgoing' ORDER BY date ASC"
    ).bind(supplierId).all();

    // In a real system, we'd fetch actual vendor bills/itinerary costs (debits)
    // For now, we return payments as credits and build a simple ledger
    let balance = 0;
    const ledgerEntries = payments.results.map((p: any) => {
        balance -= p.amount;
        return {
            id: p.id,
            date: p.date,
            description: p.description || `Payment via ${p.method}`,
            debitAmount: 0,
            creditAmount: p.amount,
            runningBalance: balance,
            entryType: p.entry_type,
            isReconciled: 0,
        };
    });

    return c.json({ data: ledgerEntries, total_paid: Math.abs(balance) });
});

export default supplierRouter;
