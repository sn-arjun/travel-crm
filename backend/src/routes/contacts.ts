import { Hono } from 'hono';
import { zValidator } from '../utils/validator';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, and, or, like, sql, inArray, count } from 'drizzle-orm';
import type { AppContext } from '../types';
import {
  contacts,
  sharedContacts,
  contactCustomFieldDefs,
  contactCustomFieldValues,
  users,
  leads,
  invoices,
  payments,
  messageLog,
  activityLogs,
  notifications,
} from '../db/tenant-schema';
import { requirePermission, rbac } from '../middleware/rbac';
import { recordConsent, withdrawMarketing, grantMarketing, CONSENT_CHANNELS, CONSENT_PURPOSES, CONSENT_SOURCES, type ConsentChannel } from '../services/privacy/consent';
import { buildContactExport, storeContactExport } from '../services/privacy/export-contact';
import { eraseContact } from '../services/privacy/erase-contact';
import { generateId } from '../utils/uuid';
import { logActivity } from '../utils/activity-logger';
import { tenantToday } from '../utils/tz';
import { success, created, paginated, error, notFound } from '../utils/response';

const contactRoutes = new Hono<AppContext>();

// ============================================================
// Zod Schemas
// ============================================================

const createContactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  type: z.enum(['customer', 'supplier', 'agent', 'partner']),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  // Tax registration of a business customer (GSTIN / VAT number); drives reverse charge on invoices
  taxId: z.string().trim().max(50).optional().nullable(),
  isBusiness: z.union([z.boolean(), z.number()]).optional().transform((v) => (v === undefined ? undefined : v ? 1 : 0)),
  tags: z.array(z.string()).optional().default([]),
  notes: z.string().optional().nullable(),
  source: z.enum([
    'manual', 'website', 'referral', 'ad', 'facebook', 'google',
    // Values offered by the desktop contact edit form and lead/routing source lists
    'walkin', 'walk_in', 'social_media', 'google_ads', 'facebook_ads',
    'phone_inquiry', 'email_inquiry', 'trade_show', 'partner', 'other',
  ]).optional().nullable(),
  birthday: z.string().optional().nullable(),
  anniversary: z.string().optional().nullable(),
  preferredLanguage: z.string().optional().default('en'),
  customFields: z.record(z.string(), z.any()).optional(),
  // R208: consent given when the contact was created (recorded in contact_consents). Channels the person agreed to be marketed to on.
  consent: z
    .object({
      marketing: z.array(z.enum(CONSENT_CHANNELS)).max(5).optional(),
      source: z.enum(['form', 'manual', 'chatbot']).optional(),
      evidence: z.record(z.string(), z.any()).optional(),
    })
    .optional(),
});

const updateContactSchema = createContactSchema.omit({ consent: true }).partial();

const consentBodySchema = z.object({
  channel: z.enum(CONSENT_CHANNELS).default('any'),
  purpose: z.enum(CONSENT_PURPOSES).default('marketing'),
  status: z.enum(['granted', 'withdrawn']),
  source: z.enum(CONSENT_SOURCES).default('manual'),
  evidence: z.record(z.string(), z.any()).optional(),
});

const ERASE_PHRASE = 'ERASE CONTACT';
const eraseBodySchema = z.object({ confirmation: z.string() });

const duplicateCheckSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

const bulkTagSchema = z.object({
  contactIds: z.array(z.string()).min(1).max(100),
  tags: z.array(z.string()).min(1),
  action: z.enum(['add', 'remove']),
});

const shareContactSchema = z.object({
  sharedWith: z.string().min(1),
  note: z.string().optional(),
});

const mergeContactSchema = z.object({
  primaryId: z.string().min(1),
  secondaryId: z.string().min(1),
});

const customFieldDefSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-z_][a-z0-9_]*$/),
  label: z.string().min(1).max(100),
  fieldType: z.enum(['text', 'number', 'date', 'select', 'multi_select', 'boolean']),
  options: z.array(z.string()).optional(),
  isRequired: z.boolean().optional().default(false),
  sortOrder: z.number().optional().default(0),
});

// ============================================================
// GET / — List contacts (paginated, searchable, filterable)
// ============================================================

contactRoutes.get('/', requirePermission('contacts', 'view'), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const url = new URL(c.req.url);

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;
  const search = url.searchParams.get('search') || '';
  const sortBy = url.searchParams.get('sortBy') || 'createdAt';
  const sortOrder = url.searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';

  // Filters
  const typeFilter = url.searchParams.get('type');
  const sourceFilter = url.searchParams.get('source');
  const cityFilter = url.searchParams.get('city');
  const countryFilter = url.searchParams.get('country');
  const tagFilter = url.searchParams.get('tag');
  const languageFilter = url.searchParams.get('language');

  // Build conditions
  const conditions: ReturnType<typeof eq>[] = [eq(contacts.isDeleted, 0)];

  if (typeFilter) conditions.push(eq(contacts.type, typeFilter));
  if (sourceFilter) conditions.push(eq(contacts.source, sourceFilter));
  if (cityFilter) conditions.push(eq(contacts.city, cityFilter));
  if (countryFilter) conditions.push(eq(contacts.country, countryFilter));
  if (languageFilter) conditions.push(eq(contacts.preferredLanguage, languageFilter));
  if (tagFilter) conditions.push(like(contacts.tags, `%"${tagFilter}"%`));

  // FTS5 search with LIKE fallback
  if (search) {
    let ftsIds: string[] = [];
    try {
      const ftsResults = await db.all<{ id: string }>(
        sql`SELECT c.id FROM contacts c JOIN contacts_fts fts ON c.rowid = fts.rowid WHERE contacts_fts MATCH ${search + '*'} AND c.is_deleted = 0`
      );
      ftsIds = ftsResults.map((r) => r.id);
    } catch {
      // FTS may not be populated; fall through to LIKE
    }
    if (ftsIds.length > 0) {
      conditions.push(inArray(contacts.id, ftsIds));
    } else {
      // Fallback: LIKE search on name, email, phone, company
      const pattern = `%${search}%`;
      conditions.push(
        or(
          like(contacts.name, pattern),
          like(contacts.email, pattern),
          like(contacts.phone, pattern),
          like(contacts.company, pattern),
        )!
      );
    }
  }

  const where = and(...conditions);

  // Count
  const [{ total }] = await db
    .select({ total: count() })
    .from(contacts)
    .where(where);

  // Sort column mapping
  const sortColumns: Record<string, any> = {
    name: contacts.name,
    email: contacts.email,
    company: contacts.company,
    city: contacts.city,
    type: contacts.type,
    createdAt: contacts.createdAt,
    updatedAt: contacts.updatedAt,
  };
  const sortCol = sortColumns[sortBy] || contacts.createdAt;
  const orderFn = sortOrder === 'asc' ? sql`${sortCol} asc` : sql`${sortCol} desc`;

  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
      phone: contacts.phone,
      company: contacts.company,
      type: contacts.type,
      address: contacts.address,
      city: contacts.city,
      state: contacts.state,
      country: contacts.country,
      postalCode: contacts.postalCode,
      taxId: contacts.taxId,
      isBusiness: contacts.isBusiness,
      tags: contacts.tags,
      notes: contacts.notes,
      source: contacts.source,
      birthday: contacts.birthday,
      anniversary: contacts.anniversary,
      preferredLanguage: contacts.preferredLanguage,
      createdBy: contacts.createdBy,
      createdAt: contacts.createdAt,
      updatedAt: contacts.updatedAt,
    })
    .from(contacts)
    .where(where)
    .orderBy(orderFn)
    .limit(limit)
    .offset(offset);

  const data = rows.map((r) => ({
    ...r,
    tags: r.tags ? JSON.parse(r.tags) : [],
  }));

  return paginated(c, data, total, page, limit);
});

// ============================================================
// POST / — Create contact
// ============================================================

contactRoutes.post(
  '/',
  requirePermission('contacts', 'create'),
  zValidator('json', createContactSchema),
  async (c) => {
    const data = c.req.valid('json');
    const userId = c.get('userId');
    const db = drizzle(c.get('tenantDb'));

    const id = generateId();
    const { customFields, consent, ...contactData } = data;

    await db.insert(contacts).values({
      id,
      ...contactData,
      tags: JSON.stringify(contactData.tags || []),
      createdBy: userId,
    });

    // Save custom fields if provided
    if (customFields && Object.keys(customFields).length > 0) {
      const fieldDefs = await db.select().from(contactCustomFieldDefs);
      const fieldMap = new Map(fieldDefs.map((f) => [f.name, f.id]));

      const cfValues = Object.entries(customFields)
        .filter(([key]) => fieldMap.has(key))
        .map(([key, value]) => ({
          id: generateId(),
          contactId: id,
          fieldId: fieldMap.get(key)!,
          value: String(value),
        }));

      if (cfValues.length > 0) {
        await db.insert(contactCustomFieldValues).values(cfValues);
      }
    }

    if (consent?.marketing?.length) {
      for (const channel of consent.marketing) {
        await recordConsent(c.get('tenantDb'), {
          contactId: id,
          channel,
          purpose: 'marketing',
          status: 'granted',
          source: consent.source ?? 'manual',
          evidence: consent.evidence ?? null,
          capturedBy: userId,
        });
      }
    }

    await logActivity(db, {
      userId,
      action: 'create',
      entityType: 'contact',
      entityId: id,
      details: JSON.stringify({ name: data.name, type: data.type }),
      ipAddress: c.get('clientIp'),
    });

    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
    return created(c, {
      ...contact,
      tags: contact.tags ? JSON.parse(contact.tags) : [],
    });
  }
);

// ============================================================
// GET /tags — Distinct tags across all contacts
// ============================================================

contactRoutes.get('/tags', requirePermission('contacts', 'view'), async (c) => {
  const db = drizzle(c.get('tenantDb'));

  const rows = await db.all<{ tag: string }>(
    sql`SELECT DISTINCT j.value as tag FROM contacts, json_each(contacts.tags) j WHERE contacts.is_deleted = 0 ORDER BY j.value`
  );

  return success(c, rows.map((r) => r.tag));
});

// ============================================================
// POST /check-duplicate — Check for duplicate contacts
// ============================================================

contactRoutes.post(
  '/check-duplicate',
  requirePermission('contacts', 'view'),
  zValidator('json', duplicateCheckSchema),
  async (c) => {
    const { email, phone } = c.req.valid('json');
    const db = drizzle(c.get('tenantDb'));

    if (!email && !phone) {
      return error(c, 'Provide email or phone to check', 400);
    }

    const conditions: ReturnType<typeof eq>[] = [];
    if (email) conditions.push(eq(contacts.email, email));
    if (phone) conditions.push(eq(contacts.phone, phone));

    const matches = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.isDeleted, 0), or(...conditions)))
      .limit(10);

    const data = matches.map((r) => ({
      ...r,
      tags: r.tags ? JSON.parse(r.tags) : [],
    }));

    return success(c, {
      hasDuplicates: data.length > 0,
      matches: data,
    });
  }
);

// ============================================================
// POST /bulk-tag — Add/remove tags from multiple contacts
// ============================================================

contactRoutes.post(
  '/bulk-tag',
  requirePermission('contacts', 'edit'),
  zValidator('json', bulkTagSchema),
  async (c) => {
    const { contactIds, tags, action } = c.req.valid('json');
    const db = drizzle(c.get('tenantDb'));

    const existing = await db
      .select({ id: contacts.id, tags: contacts.tags })
      .from(contacts)
      .where(inArray(contacts.id, contactIds));

    let updated = 0;
    for (const row of existing) {
      const currentTags: string[] = row.tags ? JSON.parse(row.tags) : [];
      let newTags: string[];

      if (action === 'add') {
        const tagSet = new Set([...currentTags, ...tags]);
        newTags = [...tagSet];
      } else {
        newTags = currentTags.filter((t) => !tags.includes(t));
      }

      await db
        .update(contacts)
        .set({ tags: JSON.stringify(newTags), updatedAt: new Date().toISOString() })
        .where(eq(contacts.id, row.id));
      updated++;
    }

    await logActivity(db, {
      userId: c.get('userId'),
      action: 'bulk_tag',
      entityType: 'contact',
      details: JSON.stringify({ action, tags, count: updated }),
      ipAddress: c.get('clientIp'),
    });

    return success(c, { updated });
  }
);

// ============================================================
// GET /filter-options — Distinct values for filter dropdowns
// ============================================================

contactRoutes.get('/filter-options', requirePermission('contacts', 'view'), async (c) => {
  const db = drizzle(c.get('tenantDb'));

  const [types, sources, cities, countries, tags, languages] = await Promise.all([
    db.all<{ value: string }>(sql`SELECT DISTINCT type as value FROM contacts WHERE is_deleted = 0 AND type IS NOT NULL ORDER BY type`),
    db.all<{ value: string }>(sql`SELECT DISTINCT source as value FROM contacts WHERE is_deleted = 0 AND source IS NOT NULL ORDER BY source`),
    db.all<{ value: string }>(sql`SELECT DISTINCT city as value FROM contacts WHERE is_deleted = 0 AND city IS NOT NULL ORDER BY city`),
    db.all<{ value: string }>(sql`SELECT DISTINCT country as value FROM contacts WHERE is_deleted = 0 AND country IS NOT NULL ORDER BY country`),
    db.all<{ value: string }>(sql`SELECT DISTINCT j.value as value FROM contacts, json_each(contacts.tags) j WHERE contacts.is_deleted = 0 ORDER BY j.value`),
    db.all<{ value: string }>(sql`SELECT DISTINCT preferred_language as value FROM contacts WHERE is_deleted = 0 AND preferred_language IS NOT NULL ORDER BY preferred_language`),
  ]);

  return success(c, {
    types: types.map((r) => r.value),
    sources: sources.map((r) => r.value),
    cities: cities.map((r) => r.value),
    countries: countries.map((r) => r.value),
    tags: tags.map((r) => r.value),
    languages: languages.map((r) => r.value),
  });
});

// ============================================================
// POST /import — Import contacts from CSV
// ============================================================

contactRoutes.post('/import', requirePermission('contacts', 'import'), async (c) => {
  const userId = c.get('userId');
  const db = drizzle(c.get('tenantDb'));

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return error(c, 'No file provided', 400);
  }

  const text = await file.text();
  const lines = text.split('\n').filter((l) => l.trim());

  if (lines.length < 2) {
    return error(c, 'CSV must have a header row and at least one data row', 400);
  }

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  // A single "name" column, or first name (+ optional last name); "name" wins when a row has it
  const hasNameColumn = ['name', 'firstname', 'first_name', 'first name'].some((h) => headers.includes(h));
  if (!hasNameColumn) {
    return error(c, 'CSV must have a "name" column (or a "first name" column)', 400);
  }

  const fieldMap: Record<string, string> = {
    name: 'name', firstname: 'firstName', first_name: 'firstName', 'first name': 'firstName',
    lastname: 'lastName', last_name: 'lastName', 'last name': 'lastName', email: 'email', phone: 'phone', company: 'company',
    type: 'type', address: 'address', city: 'city', state: 'state',
    country: 'country', postal_code: 'postalCode', postalcode: 'postalCode',
    tags: 'tags', notes: 'notes', source: 'source', birthday: 'birthday',
    anniversary: 'anniversary', preferred_language: 'preferredLanguage',
    language: 'preferredLanguage',
    // R208: a yes/true/1 here records marketing consent (source import) for the imported contact
    marketing_consent: 'marketingConsent', consent: 'marketingConsent',
  };

  let imported = 0;
  let skipped = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim());
    try {
      const record: Record<string, any> = {};
      headers.forEach((h, idx) => {
        const field = fieldMap[h];
        if (field && values[idx]) {
          record[field] = values[idx];
        }
      });

      record.name = (record.name ?? '').trim() || [record.firstName, record.lastName].filter(Boolean).join(' ').trim();
      if (!record.name) {
        skipped++;
        errors.push({ row: i + 1, message: 'Missing name' });
        continue;
      }

      record.type = record.type || 'customer';
      record.tags = record.tags ? JSON.stringify(record.tags.split(';').map((t: string) => t.trim())) : '[]';

      const importedId = generateId();
      await db.insert(contacts).values({
        id: importedId,
        name: record.name as string,
        type: record.type as string,
        email: record.email || null,
        phone: record.phone || null,
        company: record.company || null,
        address: record.address || null,
        city: record.city || null,
        state: record.state || null,
        country: record.country || null,
        postalCode: record.postalCode || null,
        tags: record.tags || '[]',
        notes: record.notes || null,
        source: record.source || null,
        birthday: record.birthday || null,
        anniversary: record.anniversary || null,
        preferredLanguage: record.preferredLanguage || 'en',
        createdBy: userId,
      });
      if (/^(yes|true|1|y)$/i.test(String(record.marketingConsent ?? '').trim())) {
        await recordConsent(c.get('tenantDb'), {
          contactId: importedId,
          channel: 'any',
          purpose: 'marketing',
          status: 'granted',
          source: 'import',
          evidence: { file: file.name },
          capturedBy: userId,
        });
      }
      imported++;
    } catch (err: any) {
      skipped++;
      errors.push({ row: i + 1, message: err.message || 'Unknown error' });
    }
  }

  await logActivity(db, {
    userId,
    action: 'import',
    entityType: 'contact',
    details: JSON.stringify({ imported, skipped, total: lines.length - 1 }),
    ipAddress: c.get('clientIp'),
  });

  return success(c, { imported, skipped, total: lines.length - 1, errors });
});

// ============================================================
// GET /export — Export contacts as CSV
// ============================================================

contactRoutes.get('/export', requirePermission('contacts', 'export'), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const url = new URL(c.req.url);

  // Apply same filters as list
  const conditions: ReturnType<typeof eq>[] = [eq(contacts.isDeleted, 0)];
  const typeFilter = url.searchParams.get('type');
  const sourceFilter = url.searchParams.get('source');
  const cityFilter = url.searchParams.get('city');
  const countryFilter = url.searchParams.get('country');

  if (typeFilter) conditions.push(eq(contacts.type, typeFilter));
  if (sourceFilter) conditions.push(eq(contacts.source, sourceFilter));
  if (cityFilter) conditions.push(eq(contacts.city, cityFilter));
  if (countryFilter) conditions.push(eq(contacts.country, countryFilter));

  const rows = await db.select().from(contacts).where(and(...conditions)).orderBy(desc(contacts.createdAt));

  const headers = ['Name', 'Email', 'Phone', 'Company', 'Type', 'Address', 'City', 'State', 'Country', 'Postal Code', 'Tags', 'Source', 'Birthday', 'Anniversary', 'Language', 'Notes'];
  const csvLines = [headers.join(',')];

  for (const r of rows) {
    const tags = r.tags ? JSON.parse(r.tags).join(';') : '';
    const line = [
      r.name, r.email || '', r.phone || '', r.company || '', r.type,
      r.address || '', r.city || '', r.state || '', r.country || '',
      r.postalCode || '', tags, r.source || '', r.birthday || '',
      r.anniversary || '', r.preferredLanguage || '', (r.notes || '').replace(/,/g, ' '),
    ].map((v) => `"${v}"`).join(',');
    csvLines.push(line);
  }

  await logActivity(db, {
    userId: c.get('userId'),
    action: 'export',
    entityType: 'contact',
    details: JSON.stringify({ count: rows.length }),
    ipAddress: c.get('clientIp'),
  });

  return new Response(csvLines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="contacts-${(await tenantToday(c)).today}.csv"`,
    },
  });
});

// ============================================================
// GET /upcoming-occasions — Birthdays/anniversaries in next N days
// ============================================================

contactRoutes.get('/upcoming-occasions', requirePermission('contacts', 'view'), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const days = Math.min(90, Math.max(1, parseInt(new URL(c.req.url).searchParams.get('days') || '30')));
  // birthdays / anniversaries are counted from the tenant-local today
  const { today: occToday } = await tenantToday(c);

  const rows = await db.all<{
    id: string;
    name: string;
    type: string;
    date: string;
    days_until: number;
  }>(sql`
    WITH upcoming AS (
      SELECT id, name, 'birthday' as type, birthday as date,
        CAST(julianday(strftime('%Y', ${occToday}) || '-' || strftime('%m-%d', birthday)) - julianday(${occToday}) AS INTEGER) as days_until
      FROM contacts WHERE birthday IS NOT NULL AND is_deleted = 0
      UNION ALL
      SELECT id, name, 'anniversary' as type, anniversary as date,
        CAST(julianday(strftime('%Y', ${occToday}) || '-' || strftime('%m-%d', anniversary)) - julianday(${occToday}) AS INTEGER) as days_until
      FROM contacts WHERE anniversary IS NOT NULL AND is_deleted = 0
    )
    SELECT * FROM upcoming
    WHERE days_until BETWEEN 0 AND ${days}
       OR (days_until + 365) BETWEEN 0 AND ${days}
    ORDER BY CASE WHEN days_until >= 0 THEN days_until ELSE days_until + 365 END
  `);

  const data = rows.map((r) => ({
    contactId: r.id,
    contactName: r.name,
    occasionType: r.type,
    date: r.date,
    daysUntil: r.days_until >= 0 ? r.days_until : r.days_until + 365,
  }));

  return success(c, data);
});

// ============================================================
// GET /shared-with-me — Contacts shared with current user
// ============================================================

contactRoutes.get('/shared-with-me', async (c) => {
  const userId = c.get('userId');
  const db = drizzle(c.get('tenantDb'));

  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
      phone: contacts.phone,
      company: contacts.company,
      type: contacts.type,
      city: contacts.city,
      country: contacts.country,
      tags: contacts.tags,
      sharedBy: sharedContacts.sharedBy,
      sharedByName: users.name,
      note: sharedContacts.note,
      sharedAt: sharedContacts.createdAt,
    })
    .from(sharedContacts)
    .innerJoin(contacts, eq(sharedContacts.contactId, contacts.id))
    .innerJoin(users, eq(sharedContacts.sharedBy, users.id))
    .where(and(eq(sharedContacts.sharedWith, userId), eq(contacts.isDeleted, 0)))
    .orderBy(desc(sharedContacts.createdAt));

  const data = rows.map((r) => ({
    ...r,
    tags: r.tags ? JSON.parse(r.tags) : [],
  }));

  return success(c, data);
});

// ============================================================
// POST /merge/preview — Preview a contact merge
// ============================================================

contactRoutes.post(
  '/merge/preview',
  requirePermission('contacts', 'edit'),
  zValidator('json', mergeContactSchema),
  async (c) => {
    const { primaryId, secondaryId } = c.req.valid('json');
    const db = drizzle(c.get('tenantDb'));

    const [primary] = await db.select().from(contacts).where(eq(contacts.id, primaryId)).limit(1);
    const [secondary] = await db.select().from(contacts).where(eq(contacts.id, secondaryId)).limit(1);

    if (!primary || !secondary) {
      return notFound(c, 'Contact');
    }

    // Count related records
    const [[leadsCount], [invoicesCount], [paymentsCount], [messagesCount]] = await Promise.all([
      db.select({ count: count() }).from(leads).where(eq(leads.contactId, secondaryId)),
      db.select({ count: count() }).from(invoices).where(eq(invoices.contactId, secondaryId)),
      db.select({ count: count() }).from(payments).where(eq(payments.contactId, secondaryId)),
      db.select({ count: count() }).from(messageLog).where(eq(messageLog.contactId, secondaryId)),
    ]);

    // Build merged preview
    const primaryTags: string[] = primary.tags ? JSON.parse(primary.tags) : [];
    const secondaryTags: string[] = secondary.tags ? JSON.parse(secondary.tags) : [];
    const mergedTags = [...new Set([...primaryTags, ...secondaryTags])];

    const merged = {
      ...primary,
      email: primary.email || secondary.email,
      phone: primary.phone || secondary.phone,
      company: primary.company || secondary.company,
      address: primary.address || secondary.address,
      city: primary.city || secondary.city,
      state: primary.state || secondary.state,
      country: primary.country || secondary.country,
      postalCode: primary.postalCode || secondary.postalCode,
      notes: [primary.notes, secondary.notes].filter(Boolean).join('\n---\n'),
      tags: JSON.stringify(mergedTags),
    };

    const format = (r: any) => ({ ...r, tags: r.tags ? JSON.parse(r.tags) : [] });

    return success(c, {
      primary: format(primary),
      secondary: format(secondary),
      merged: format(merged),
      leadsToMigrate: leadsCount.count,
      invoicesToMigrate: invoicesCount.count,
      paymentsToMigrate: paymentsCount.count,
      messagesToMigrate: messagesCount.count,
    });
  }
);

// ============================================================
// POST /merge — Execute contact merge
// ============================================================

contactRoutes.post(
  '/merge',
  requirePermission('contacts', 'edit'),
  zValidator('json', mergeContactSchema),
  async (c) => {
    const { primaryId, secondaryId } = c.req.valid('json');
    const userId = c.get('userId');
    const db = drizzle(c.get('tenantDb'));

    const [primary] = await db.select().from(contacts).where(eq(contacts.id, primaryId)).limit(1);
    const [secondary] = await db.select().from(contacts).where(eq(contacts.id, secondaryId)).limit(1);

    if (!primary || !secondary) {
      return notFound(c, 'Contact');
    }

    // Merge tags
    const primaryTags: string[] = primary.tags ? JSON.parse(primary.tags) : [];
    const secondaryTags: string[] = secondary.tags ? JSON.parse(secondary.tags) : [];
    const mergedTags = [...new Set([...primaryTags, ...secondaryTags])];

    // Update primary with missing fields from secondary
    await db.update(contacts).set({
      email: primary.email || secondary.email,
      phone: primary.phone || secondary.phone,
      company: primary.company || secondary.company,
      address: primary.address || secondary.address,
      city: primary.city || secondary.city,
      state: primary.state || secondary.state,
      country: primary.country || secondary.country,
      postalCode: primary.postalCode || secondary.postalCode,
      notes: [primary.notes, secondary.notes].filter(Boolean).join('\n---\n') || null,
      tags: JSON.stringify(mergedTags),
      updatedAt: new Date().toISOString(),
    }).where(eq(contacts.id, primaryId));

    // Migrate related records from secondary to primary
    await db.update(leads).set({ contactId: primaryId }).where(eq(leads.contactId, secondaryId));
    await db.update(invoices).set({ contactId: primaryId }).where(eq(invoices.contactId, secondaryId));
    await db.update(payments).set({ contactId: primaryId }).where(eq(payments.contactId, secondaryId));
    await db.update(messageLog).set({ contactId: primaryId }).where(eq(messageLog.contactId, secondaryId));

    // Migrate custom field values (skip conflicts)
    const existingFields = await db
      .select({ fieldId: contactCustomFieldValues.fieldId })
      .from(contactCustomFieldValues)
      .where(eq(contactCustomFieldValues.contactId, primaryId));
    const existingFieldIds = new Set(existingFields.map((f) => f.fieldId));

    const secondaryFields = await db
      .select()
      .from(contactCustomFieldValues)
      .where(eq(contactCustomFieldValues.contactId, secondaryId));

    for (const cf of secondaryFields) {
      if (!existingFieldIds.has(cf.fieldId)) {
        await db.update(contactCustomFieldValues)
          .set({ contactId: primaryId })
          .where(eq(contactCustomFieldValues.id, cf.id));
      }
    }

    // Soft-delete secondary
    await db.update(contacts).set({ isDeleted: 1, updatedAt: new Date().toISOString() }).where(eq(contacts.id, secondaryId));

    await logActivity(db, {
      userId,
      action: 'merge',
      entityType: 'contact',
      entityId: primaryId,
      details: JSON.stringify({ mergedFrom: secondaryId }),
      ipAddress: c.get('clientIp'),
    });

    const [merged] = await db.select().from(contacts).where(eq(contacts.id, primaryId)).limit(1);
    return success(c, { ...merged, tags: merged.tags ? JSON.parse(merged.tags) : [] });
  }
);

// ============================================================
// GET /custom-fields — List custom field definitions
// ============================================================

contactRoutes.get('/custom-fields', requirePermission('contacts', 'view'), async (c) => {
  const db = drizzle(c.get('tenantDb'));

  const fields = await db
    .select()
    .from(contactCustomFieldDefs)
    .orderBy(contactCustomFieldDefs.sortOrder);

  return success(c, fields.map((f) => ({
    ...f,
    options: f.options ? JSON.parse(f.options) : null,
    isRequired: !!f.isRequired,
  })));
});

// ============================================================
// POST /custom-fields — Create custom field definition
// ============================================================

contactRoutes.post(
  '/custom-fields',
  requirePermission('contacts', 'edit'),
  zValidator('json', customFieldDefSchema),
  async (c) => {
    const data = c.req.valid('json');
    const db = drizzle(c.get('tenantDb'));

    // Check max 20 fields
    const [{ total }] = await db.select({ total: count() }).from(contactCustomFieldDefs);
    if (total >= 20) {
      return error(c, 'Maximum 20 custom fields allowed', 400);
    }

    // Check unique name
    const [existing] = await db.select().from(contactCustomFieldDefs).where(eq(contactCustomFieldDefs.name, data.name)).limit(1);
    if (existing) {
      return error(c, 'A custom field with this name already exists', 409);
    }

    const id = generateId();
    await db.insert(contactCustomFieldDefs).values({
      id,
      name: data.name,
      label: data.label,
      fieldType: data.fieldType,
      options: data.options ? JSON.stringify(data.options) : null,
      isRequired: data.isRequired ? 1 : 0,
      sortOrder: data.sortOrder,
      createdBy: c.get('userId'),
    });

    const [field] = await db.select().from(contactCustomFieldDefs).where(eq(contactCustomFieldDefs.id, id)).limit(1);
    return created(c, {
      ...field,
      options: field.options ? JSON.parse(field.options) : null,
      isRequired: !!field.isRequired,
    });
  }
);

// ============================================================
// PUT /custom-fields/:id — Update custom field definition
// ============================================================

contactRoutes.put(
  '/custom-fields/:id',
  requirePermission('contacts', 'edit'),
  zValidator('json', customFieldDefSchema.partial()),
  async (c) => {
    const fieldId = c.req.param('id');
    const data = c.req.valid('json');
    const db = drizzle(c.get('tenantDb'));

    const [existing] = await db.select().from(contactCustomFieldDefs).where(eq(contactCustomFieldDefs.id, fieldId)).limit(1);
    if (!existing) {
      return notFound(c, 'Custom field');
    }

    await db.update(contactCustomFieldDefs).set({
      ...(data.label !== undefined && { label: data.label }),
      ...(data.fieldType !== undefined && { fieldType: data.fieldType }),
      ...(data.options !== undefined && { options: JSON.stringify(data.options) }),
      ...(data.isRequired !== undefined && { isRequired: data.isRequired ? 1 : 0 }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      updatedAt: new Date().toISOString(),
    }).where(eq(contactCustomFieldDefs.id, fieldId));

    const [updated] = await db.select().from(contactCustomFieldDefs).where(eq(contactCustomFieldDefs.id, fieldId)).limit(1);
    return success(c, {
      ...updated,
      options: updated.options ? JSON.parse(updated.options) : null,
      isRequired: !!updated.isRequired,
    });
  }
);

// ============================================================
// DELETE /custom-fields/:id — Delete custom field + cascade values
// ============================================================

contactRoutes.delete('/custom-fields/:id', requirePermission('contacts', 'edit'), async (c) => {
  const fieldId = c.req.param('id');
  const db = drizzle(c.get('tenantDb'));

  const [existing] = await db.select().from(contactCustomFieldDefs).where(eq(contactCustomFieldDefs.id, fieldId)).limit(1);
  if (!existing) {
    return notFound(c, 'Custom field');
  }

  // Cascade: delete all values for this field
  await db.delete(contactCustomFieldValues).where(eq(contactCustomFieldValues.fieldId, fieldId));
  await db.delete(contactCustomFieldDefs).where(eq(contactCustomFieldDefs.id, fieldId));

  return success(c, { message: 'Custom field deleted' });
});

// ============================================================
// GET /:id — Get contact by ID
// ============================================================

contactRoutes.get('/:id', requirePermission('contacts', 'view'), async (c) => {
  const contactId = c.req.param('id');
  const db = drizzle(c.get('tenantDb'));

  const [contact] = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
      phone: contacts.phone,
      company: contacts.company,
      type: contacts.type,
      address: contacts.address,
      city: contacts.city,
      state: contacts.state,
      country: contacts.country,
      postalCode: contacts.postalCode,
      taxId: contacts.taxId,
      isBusiness: contacts.isBusiness,
      tags: contacts.tags,
      notes: contacts.notes,
      source: contacts.source,
      birthday: contacts.birthday,
      anniversary: contacts.anniversary,
      preferredLanguage: contacts.preferredLanguage,
      createdBy: contacts.createdBy,
      createdByName: users.name,
      createdAt: contacts.createdAt,
      updatedAt: contacts.updatedAt,
    })
    .from(contacts)
    .leftJoin(users, eq(contacts.createdBy, users.id))
    .where(and(eq(contacts.id, contactId), eq(contacts.isDeleted, 0)))
    .limit(1);

  if (!contact) {
    return notFound(c, 'Contact');
  }

  // Get counts
  const [[leadsCount], [invoicesCount], [paymentsTotal]] = await Promise.all([
    db.select({ count: count() }).from(leads).where(eq(leads.contactId, contactId)),
    db.select({ count: count() }).from(invoices).where(eq(invoices.contactId, contactId)),
    db.select({ total: sql<number>`COALESCE(SUM(${payments.amount}), 0)` }).from(payments).where(eq(payments.contactId, contactId)),
  ]);

  // Get custom fields
  const cfValues = await db
    .select({
      name: contactCustomFieldDefs.name,
      value: contactCustomFieldValues.value,
    })
    .from(contactCustomFieldValues)
    .innerJoin(contactCustomFieldDefs, eq(contactCustomFieldValues.fieldId, contactCustomFieldDefs.id))
    .where(eq(contactCustomFieldValues.contactId, contactId));

  const customFields: Record<string, string> = {};
  cfValues.forEach((cf) => { customFields[cf.name] = cf.value || ''; });

  return success(c, {
    ...contact,
    tags: contact.tags ? JSON.parse(contact.tags) : [],
    leadsCount: leadsCount.count,
    invoicesCount: invoicesCount.count,
    paymentsTotal: paymentsTotal.total,
    customFields,
  });
});

// ============================================================
// PUT /:id — Update contact
// ============================================================

contactRoutes.put(
  '/:id',
  requirePermission('contacts', 'edit'),
  zValidator('json', updateContactSchema),
  async (c) => {
    const contactId = c.req.param('id');
    const data = c.req.valid('json');
    const db = drizzle(c.get('tenantDb'));

    const [existing] = await db.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.isDeleted, 0))).limit(1);
    if (!existing) {
      return notFound(c, 'Contact');
    }

    const { customFields, tags, ...updateData } = data;

    await db.update(contacts).set({
      ...updateData,
      ...(tags !== undefined && { tags: JSON.stringify(tags) }),
      updatedAt: new Date().toISOString(),
    }).where(eq(contacts.id, contactId));

    // Update custom fields
    if (customFields && Object.keys(customFields).length > 0) {
      const fieldDefs = await db.select().from(contactCustomFieldDefs);
      const fieldMap = new Map(fieldDefs.map((f) => [f.name, f.id]));

      for (const [key, value] of Object.entries(customFields)) {
        const fieldId = fieldMap.get(key);
        if (!fieldId) continue;

        const [existingVal] = await db
          .select()
          .from(contactCustomFieldValues)
          .where(and(
            eq(contactCustomFieldValues.contactId, contactId),
            eq(contactCustomFieldValues.fieldId, fieldId),
          ))
          .limit(1);

        if (existingVal) {
          await db.update(contactCustomFieldValues)
            .set({ value: String(value), updatedAt: new Date().toISOString() })
            .where(eq(contactCustomFieldValues.id, existingVal.id));
        } else {
          await db.insert(contactCustomFieldValues).values({
            id: generateId(),
            contactId,
            fieldId,
            value: String(value),
          });
        }
      }
    }

    await logActivity(db, {
      userId: c.get('userId'),
      action: 'update',
      entityType: 'contact',
      entityId: contactId,
      details: JSON.stringify({ fields: Object.keys(data) }),
      ipAddress: c.get('clientIp'),
    });

    const [updated] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
    return success(c, { ...updated, tags: updated.tags ? JSON.parse(updated.tags) : [] });
  }
);

// ============================================================
// DELETE /:id — Soft delete contact
// ============================================================

contactRoutes.delete('/:id', requirePermission('contacts', 'delete'), async (c) => {
  const contactId = c.req.param('id');
  const db = drizzle(c.get('tenantDb'));

  const [existing] = await db.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.isDeleted, 0))).limit(1);
  if (!existing) {
    return notFound(c, 'Contact');
  }

  await db.update(contacts).set({ isDeleted: 1, updatedAt: new Date().toISOString() }).where(eq(contacts.id, contactId));

  await logActivity(db, {
    userId: c.get('userId'),
    action: 'delete',
    entityType: 'contact',
    entityId: contactId,
    details: JSON.stringify({ name: existing.name }),
    ipAddress: c.get('clientIp'),
  });

  return success(c, { message: 'Contact deleted' });
});

// ============================================================
// R208 privacy: consent history, data export and erasure
// ============================================================

async function consentHistory(tenantDb: D1Database, contactId: string) {
  const { results } = await tenantDb
    .prepare(
      `SELECT k.id, k.channel, k.purpose, k.status, k.source, k.captured_at, k.evidence, k.captured_by, u.name AS captured_by_name
       FROM contact_consents k LEFT JOIN users u ON u.id = k.captured_by
       WHERE k.contact_id = ? ORDER BY k.captured_at DESC, k.id DESC`
    )
    .bind(contactId)
    .all<any>();
  const history = (results ?? []).map((r) => ({
    id: r.id,
    channel: r.channel,
    purpose: r.purpose,
    status: r.status,
    source: r.source,
    capturedAt: r.captured_at,
    evidence: r.evidence ? safeJson(r.evidence) : null,
    capturedBy: r.captured_by,
    capturedByName: r.captured_by_name ?? null,
  }));
  // The newest record per purpose and channel is the current state.
  const current: Record<string, string> = {};
  for (const h of [...history].reverse()) current[`${h.purpose}:${h.channel}`] = h.status;
  return { history, current };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

contactRoutes.get('/:id/consents', requirePermission('contacts', 'view'), async (c) => {
  const contactId = c.req.param('id');
  const tenantDb = c.get('tenantDb');
  const exists = await tenantDb.prepare('SELECT id FROM contacts WHERE id = ?').bind(contactId).first();
  if (!exists) return notFound(c, 'Contact');
  return success(c, await consentHistory(tenantDb, contactId));
});

// Append one consent record. Marketing records also move the contact's opted_out switch.
contactRoutes.post('/:id/consents', requirePermission('contacts', 'edit'), zValidator('json', consentBodySchema), async (c) => {
  const contactId = c.req.param('id');
  const body = c.req.valid('json');
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const contact = await tenantDb.prepare('SELECT id, erased_at FROM contacts WHERE id = ? AND is_deleted = 0').bind(contactId).first<{ id: string; erased_at: string | null }>();
  if (!contact) return notFound(c, 'Contact');

  const opts = { capturedBy: userId, evidence: body.evidence ?? null };
  if (body.purpose === 'marketing' && body.status === 'withdrawn') {
    await withdrawMarketing(tenantDb, contactId, body.channel as ConsentChannel, body.source, opts);
  } else if (body.purpose === 'marketing') {
    await grantMarketing(tenantDb, contactId, body.channel as ConsentChannel, body.source, opts);
  } else {
    await recordConsent(tenantDb, { contactId, channel: body.channel, purpose: body.purpose, status: body.status, source: body.source, ...opts });
  }
  return created(c, await consentHistory(tenantDb, contactId));
});

// Everything held about the contact, as JSON stored in R2 and handed back as a signed link that expires in 15 minutes.
contactRoutes.post('/:id/privacy-export', rbac(['admin']), async (c) => {
  const contactId = c.req.param('id');
  const tenantDb = c.get('tenantDb');
  const tenantId = c.get('tenantId');
  const contact = await tenantDb.prepare('SELECT id, erased_at FROM contacts WHERE id = ?').bind(contactId).first<{ id: string; erased_at: string | null }>();
  if (!contact) return notFound(c, 'Contact');
  if (contact.erased_at) return error(c, 'This contact was erased; nothing is held to export', 410);

  const bundle = await buildContactExport(c.env, tenantDb, tenantId, contactId);
  const stored = await storeContactExport(c.env, tenantId, contactId, bundle);
  await logActivity(tenantDb, {
    userId: c.get('userId'),
    action: 'privacy_export',
    entityType: 'contact',
    entityId: contactId,
    details: JSON.stringify({ tables: Object.keys(stored.summary).length, files: stored.fileCount }),
    ipAddress: c.get('clientIp'),
  });
  return success(c, stored);
});

// Erase the contact's personal data. The body must carry the confirmation phrase.
contactRoutes.post('/:id/erase', rbac(['admin']), zValidator('json', eraseBodySchema), async (c) => {
  const contactId = c.req.param('id');
  const { confirmation } = c.req.valid('json');
  if (confirmation.trim() !== ERASE_PHRASE) return error(c, `Type ${ERASE_PHRASE} to confirm`, 400);
  const result = await eraseContact(c.env, c.get('tenantDb'), c.get('tenantId'), contactId, c.get('userId'));
  if (!result) return notFound(c, 'Contact');
  return success(c, result);
});

// ============================================================
// POST /:id/share — Share contact with another user
// ============================================================

contactRoutes.post(
  '/:id/share',
  requirePermission('contacts', 'edit'),
  zValidator('json', shareContactSchema),
  async (c) => {
    const contactId = c.req.param('id');
    const { sharedWith, note } = c.req.valid('json');
    const userId = c.get('userId');
    const db = drizzle(c.get('tenantDb'));

    const [contact] = await db.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.isDeleted, 0))).limit(1);
    if (!contact) {
      return notFound(c, 'Contact');
    }

    const [targetUser] = await db.select().from(users).where(eq(users.id, sharedWith)).limit(1);
    if (!targetUser) {
      return error(c, 'Target user not found', 404);
    }

    const id = generateId();
    await db.insert(sharedContacts).values({
      id,
      contactId,
      sharedBy: userId,
      sharedWith,
      note: note || null,
    });

    // Create notification for target user
    await db.insert(notifications).values({
      id: generateId(),
      userId: sharedWith,
      title: 'Contact shared with you',
      message: `${c.get('userName')} shared contact "${contact.name}" with you`,
      type: 'system',
      referenceType: 'contact',
      referenceId: contactId,
    });

    await logActivity(db, {
      userId,
      action: 'share',
      entityType: 'contact',
      entityId: contactId,
      details: JSON.stringify({ sharedWith, targetUserName: targetUser.name }),
      ipAddress: c.get('clientIp'),
    });

    return created(c, { message: 'Contact shared' });
  }
);

// ============================================================
// GET /:id/timeline — Contact timeline (aggregated)
// ============================================================

contactRoutes.get('/:id/timeline', requirePermission('contacts', 'view'), async (c) => {
  const contactId = c.req.param('id');
  const db = drizzle(c.get('tenantDb'));

  const [contact] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.isDeleted, 0))).limit(1);
  if (!contact) {
    return notFound(c, 'Contact');
  }

  const entries = await db.all<{
    id: string;
    type: string;
    title: string;
    description: string | null;
    metadata: string | null;
    created_at: string;
    created_by_name: string | null;
  }>(sql`
    SELECT id, 'lead' as type, title, destination as description, status as metadata, created_at, NULL as created_by_name
    FROM leads WHERE contact_id = ${contactId}
    UNION ALL
    SELECT id, 'invoice' as type, invoice_number as title, CAST(total AS TEXT) as description, status as metadata, created_at, NULL as created_by_name
    FROM invoices WHERE contact_id = ${contactId}
    UNION ALL
    SELECT id, 'payment' as type, CAST(amount AS TEXT) as title, method as description, reference as metadata, created_at, NULL as created_by_name
    FROM payments WHERE contact_id = ${contactId}
    UNION ALL
    SELECT ml.id, 'message' as type, ml.channel as title, ml.subject as description, ml.status as metadata, ml.created_at, u.name as created_by_name
    FROM message_log ml LEFT JOIN users u ON ml.sent_by = u.id WHERE ml.contact_id = ${contactId}
    UNION ALL
    SELECT al.id, 'activity' as type, al.action as title, al.entity_type as description, al.details as metadata, al.created_at, u.name as created_by_name
    FROM activity_logs al LEFT JOIN users u ON al.user_id = u.id WHERE al.entity_type = 'contact' AND al.entity_id = ${contactId}
    ORDER BY created_at DESC
    LIMIT 100
  `);

  const data = entries.map((e) => ({
    id: e.id,
    type: e.type,
    title: e.title,
    description: e.description,
    metadata: e.metadata,
    createdAt: e.created_at,
    createdByName: e.created_by_name,
  }));

  return success(c, data);
});

export default contactRoutes;
