import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import type { AppContext } from '../types';
import { createTravellerSchema, updateTravellerSchema } from '../validators/traveller';

const travellerRouter = new Hono<AppContext>();
travellerRouter.use('*', authMiddleware);

travellerRouter.get('/', async (c) => {
    const db = c.get('tenantDb');
    const tenantId = c.get('tenantId');
    const contactId = c.req.query('contact_id');

    let query = 'SELECT * FROM travellers WHERE tenant_id = ? AND is_deleted = 0';
    const params: any[] = [tenantId];

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
    const tenantId = c.get('tenantId');
    const id = c.req.param('id');

    const traveller = await db.prepare('SELECT * FROM travellers WHERE id = ? AND tenant_id = ? AND is_deleted = 0')
        .bind(id, tenantId).first();

    if (!traveller) return c.json({ error: 'Traveller not found' }, 404);

    const documents = await db.prepare('SELECT * FROM traveller_documents WHERE traveller_id = ? AND tenant_id = ? AND is_deleted = 0')
        .bind(id, tenantId).all();

    return c.json({ data: { ...traveller, documents: documents.results } });
});

travellerRouter.post('/', zValidator('json', createTravellerSchema), async (c) => {
    const db = c.get('tenantDb');
    const tenantId = c.get('tenantId');
    const userId = c.get('userId');
    const body = c.req.valid('json');
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.prepare(`
    INSERT INTO travellers (
      id, tenant_id, contact_id, first_name, last_name, full_name_passport, 
      date_of_birth, gender, nationality, passport_number, passport_issue_date, 
      passport_expiry_date, passport_issuing_country, frequent_flyer_numbers, 
      meal_preference, seat_preference, room_preference, medical_notes, 
      emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
      profile_photo_url, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
        id, tenantId, body.contactId || null, body.firstName, body.lastName, body.fullNamePassport,
        body.dateOfBirth || null, body.gender || null, body.nationality || null, body.passportNumber || null,
        body.passportIssueDate || null, body.passportExpiryDate || null, body.passportIssuingCountry || null,
        body.frequentFlyerNumbers || null, body.mealPreference || null, body.seatPreference || null,
        body.roomPreference || null, body.medicalNotes || null, body.emergencyContactName || null,
        body.emergencyContactPhone || null, body.emergencyContactRelationship || null,
        body.profilePhotoUrl || null, userId, now, now
    ).run();

    return c.json({ data: { id, ...body } }, 201);
});

travellerRouter.put('/:id', zValidator('json', updateTravellerSchema), async (c) => {
    const db = c.get('tenantDb');
    const tenantId = c.get('tenantId');
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const now = new Date().toISOString();

    const updates: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(body)) {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        updates.push(`${snakeKey} = ?`);
        params.push(value);
    }

    if (updates.length > 0) {
        updates.push('updated_at = ?');
        params.push(now);
        params.push(id, tenantId);

        await db.prepare(`UPDATE travellers SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`)
            .bind(...params).run();
    }

    const updated = await db.prepare('SELECT * FROM travellers WHERE id = ? AND tenant_id = ?')
        .bind(id, tenantId).first();

    return c.json({ data: updated });
});

travellerRouter.delete('/:id', async (c) => {
    const db = c.get('tenantDb');
    const tenantId = c.get('tenantId');
    const id = c.req.param('id');

    await db.prepare('UPDATE travellers SET is_deleted = 1, updated_at = ? WHERE id = ? AND tenant_id = ?')
        .bind(new Date().toISOString(), id, tenantId).run();

    return c.json({ success: true });
});

export default travellerRouter;
