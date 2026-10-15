import { generateId } from '../../utils/uuid';
import { normalizePhone, phoneLookupVariants, inPlaceholders, tenantPhoneCountry } from '../../utils/phone';

export interface ContactIdentity {
  phone?: string | null;
  email?: string | null;
}

export interface ContactMatch {
  id: string;
  name: string;
}

export interface FindOrCreateContactInput extends ContactIdentity {
  name?: string | null;
  source?: string | null;
  createdBy?: string | null;
}

/**
 * Find a live contact by phone (any stored form), then by email.
 */
export async function findContactByIdentity(
  db: D1Database,
  identity: ContactIdentity,
): Promise<ContactMatch | null> {
  const country = identity.phone ? await tenantPhoneCountry(db) : undefined;
  const phone = identity.phone ? normalizePhone(identity.phone, country) : '';
  if (phone) {
    const variants = phoneLookupVariants(phone, country);
    const match = await db
      .prepare(`SELECT id, name FROM contacts WHERE COALESCE(is_deleted, 0) = 0 AND phone IN (${inPlaceholders(variants)}) LIMIT 1`)
      .bind(...variants)
      .first<ContactMatch>();
    if (match) return match;
  }

  const email = (identity.email ?? '').trim().toLowerCase();
  if (email) {
    const match = await db
      .prepare(`SELECT id, name FROM contacts WHERE COALESCE(is_deleted, 0) = 0 AND lower(email) = ? LIMIT 1`)
      .bind(email)
      .first<ContactMatch>();
    if (match) return match;
  }

  return null;
}

/**
 * Reuse the contact that already owns this phone or email, otherwise create a customer.
 * Returns null when there is nothing to identify the person by.
 */
export async function findOrCreateContact(
  db: D1Database,
  input: FindOrCreateContactInput,
): Promise<{ id: string; name: string; created: boolean } | null> {
  const existing = await findContactByIdentity(db, input);
  if (existing) return { ...existing, created: false };

  const name = (input.name ?? '').trim();
  const phone = input.phone ? normalizePhone(input.phone, await tenantPhoneCountry(db)) : '';
  const email = (input.email ?? '').trim().toLowerCase();
  if (!name && !phone && !email) return null;

  const id = generateId();
  const displayName = name || phone || email;
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO contacts (id, name, email, phone, type, source, tags, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'customer', ?, '[]', ?, ?, ?)`,
    )
    .bind(id, displayName, email || null, phone || null, input.source ?? null, input.createdBy ?? null, now, now)
    .run();

  return { id, name: displayName, created: true };
}
