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

    let query = 'SELECT * FROM travellers WHERE 1=1';
    const params: any[] = [];

    if (contactId) {
        query += ' AND contact_id = ?';
        params.push(contactId);
    }

    query += ' ORDER BY created_at DESC';

    const results = await db.prepare(query).bind(...params).all();
    return c.json({ data: results.results });
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

    await db.prepare(`
    INSERT INTO travellers (
      id, contact_id, first_name, last_name,
      date_of_birth, gender, nationality, passport_number,
      passport_expiry, passport_issuing_country, frequent_flyer_number,
      meal_preference, seat_preference, medical_notes,
      emergency_contact_name, emergency_contact_phone,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
        id, body.contactId || null, body.firstName, body.lastName,
        body.dateOfBirth || null, body.gender || null, body.nationality || null, body.passportNumber || null,
        body.passportExpiryDate || body.passportExpiry || null, body.passportIssuingCountry || null,
        body.frequentFlyerNumber || body.frequentFlyerNumbers || null,
        body.mealPreference || null, body.seatPreference || null, body.medicalNotes || null,
        body.emergencyContactName || null, body.emergencyContactPhone || null,
        now, now
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
        passportExpiry: 'passport_expiry',
        passportExpiryDate: 'passport_expiry',
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

travellerRouter.delete('/:id', async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');

    await db.prepare('DELETE FROM travellers WHERE id = ?')
        .bind(id).run();

    return c.json({ success: true });
});

export default travellerRouter;
