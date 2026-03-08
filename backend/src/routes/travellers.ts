import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import type { AppContext } from '../types';
import { createTravellerSchema, updateTravellerSchema } from '../validators/traveller';

const travellerRouter = new Hono<AppContext>();
travellerRouter.use('*', authMiddleware);

travellerRouter.get('/', async (c) => {
    const db = c.get('tenantDb');
    const contactId = c.req.query('contact_id');
    const search = c.req.query('search');
    const nationality = c.req.query('nationality');
    const page = parseInt(c.req.query('page') ?? '1', 10);
    const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100);
    const offset = (page - 1) * limit;
    const sortBy = c.req.query('sort_by') ?? 'created_at';
    const sortOrder = c.req.query('sort_order') === 'asc' ? 'ASC' : 'DESC';

    const allowedSort: Record<string, string> = {
        created_at: 'created_at',
        first_name: 'first_name',
        last_name: 'last_name',
        passport_expiry_date: 'passport_expiry_date',
    };
    const orderCol = allowedSort[sortBy] ?? 'created_at';

    let query = 'SELECT * FROM travellers WHERE is_deleted = 0';
    const params: any[] = [];

    if (contactId) {
        query += ' AND contact_id = ?';
        params.push(contactId);
    }
    if (search) {
        query += ' AND (first_name LIKE ? OR last_name LIKE ? OR passport_number LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term, term);
    }
    if (nationality) {
        query += ' AND nationality = ?';
        params.push(nationality);
    }

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const countResult = await db.prepare(countQuery).bind(...params).first<{ total: number }>();
    const total = countResult?.total ?? 0;

    query += ` ORDER BY ${orderCol} ${sortOrder} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const results = await db.prepare(query).bind(...params).all();
    return c.json({
        data: {
            data: results.results,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        },
    });
});

travellerRouter.get('/:id', async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');

    const traveller = await db.prepare('SELECT * FROM travellers WHERE id = ?')
        .bind(id).first();

    if (!traveller) return c.json({ error: 'Traveller not found' }, 404);

    // traveller_documents may not exist yet — handle gracefully
    let documents: any[] = [];
    try {
        const docs = await db.prepare('SELECT * FROM traveller_documents WHERE traveller_id = ?')
            .bind(id).all();
        documents = docs.results || [];
    } catch {
        // table may not exist
    }

    return c.json({ data: { ...traveller, documents } });
});

travellerRouter.post('/', zValidator('json', createTravellerSchema), async (c) => {
    const db = c.get('tenantDb');
    const body = c.req.valid('json');
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const tenantId = c.get('tenantId');
    const userId = c.get('userId');

    await db.prepare(`
    INSERT INTO travellers (
      id, tenant_id, contact_id, first_name, last_name, full_name_passport,
      date_of_birth, gender, nationality, passport_number,
      passport_expiry_date, passport_issuing_country, frequent_flyer_numbers,
      meal_preference, seat_preference, medical_notes,
      emergency_contact_name, emergency_contact_phone,
      created_by, is_deleted, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).bind(
        id, tenantId, body.contactId || null, body.firstName, body.lastName,
        body.fullNamePassport || `${body.firstName} ${body.lastName}`,
        body.dateOfBirth || null, body.gender || null, body.nationality || null, body.passportNumber || null,
        body.passportExpiryDate || body.passportExpiry || null, body.passportIssuingCountry || null,
        body.frequentFlyerNumbers || null,
        body.mealPreference || null, body.seatPreference || null, body.medicalNotes || null,
        body.emergencyContactName || null, body.emergencyContactPhone || null,
        userId, now, now
    ).run();

    return c.json({ data: { id, ...body } }, 201);
});

travellerRouter.put('/:id', zValidator('json', updateTravellerSchema), async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const now = new Date().toISOString();

    const updates: string[] = [];
    const params: any[] = [];

    // Map known camelCase fields to actual DB column names
    const fieldMap: Record<string, string> = {
        contactId: 'contact_id',
        firstName: 'first_name',
        lastName: 'last_name',
        dateOfBirth: 'date_of_birth',
        passportNumber: 'passport_number',
        passportExpiry: 'passport_expiry_date',
        passportExpiryDate: 'passport_expiry_date',
        passportIssuingCountry: 'passport_issuing_country',
        frequentFlyerNumber: 'frequent_flyer_number',
        frequentFlyerNumbers: 'frequent_flyer_number',
        mealPreference: 'meal_preference',
        seatPreference: 'seat_preference',
        medicalNotes: 'medical_notes',
        emergencyContactName: 'emergency_contact_name',
        emergencyContactPhone: 'emergency_contact_phone',
    };

    for (const [key, value] of Object.entries(body)) {
        const col = fieldMap[key] || key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        updates.push(`${col} = ?`);
        params.push(value);
    }

    if (updates.length > 0) {
        updates.push('updated_at = ?');
        params.push(now);
        params.push(id);

        await db.prepare(`UPDATE travellers SET ${updates.join(', ')} WHERE id = ?`)
            .bind(...params).run();
    }

    const updated = await db.prepare('SELECT * FROM travellers WHERE id = ?')
        .bind(id).first();

    return c.json({ data: updated });
});

// Soft delete
travellerRouter.delete('/:id', async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    const now = new Date().toISOString();

    await db.prepare('UPDATE travellers SET is_deleted = 1, updated_at = ? WHERE id = ?')
        .bind(now, id).run();

    return c.json({ success: true });
});

// Link a traveller to a contact
travellerRouter.put('/:id/link-contact', async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    const body = await c.req.json<{ contactId: string }>();
    const now = new Date().toISOString();

    if (!body.contactId) return c.json({ error: 'contactId is required' }, 400);

    await db.prepare('UPDATE travellers SET contact_id = ?, updated_at = ? WHERE id = ?')
        .bind(body.contactId, now, id).run();

    const updated = await db.prepare('SELECT * FROM travellers WHERE id = ?').bind(id).first();
    return c.json({ data: updated });
});

// Unlink a traveller from its contact
travellerRouter.put('/:id/unlink-contact', async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    const now = new Date().toISOString();

    await db.prepare('UPDATE travellers SET contact_id = NULL, updated_at = ? WHERE id = ?')
        .bind(now, id).run();

    const updated = await db.prepare('SELECT * FROM travellers WHERE id = ?').bind(id).first();
    return c.json({ data: updated });
});

export default travellerRouter;
