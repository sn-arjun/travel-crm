import type { D1Database } from '@cloudflare/workers-types';

export interface SegmentFilter {
  tags?: string[];
  cities?: string[];
  countries?: string[];
  contactTypes?: string[];
  birthdayMonth?: number; // 1-12
  createdAfter?: string; // ISO date
  createdBefore?: string; // ISO date
}

/**
 * Resolve contacts matching the given segment filters.
 * Excludes unsubscribed contacts and deleted contacts.
 * Returns a maximum of 5000 contact IDs to prevent memory issues.
 *
 * Filters can include:
 * - tags: Array of tags (matches contacts with ANY of the tags)
 * - cities: Array of cities (matches contacts from ANY of the cities)
 * - countries: Array of countries (matches contacts from ANY of the countries)
 * - contactTypes: Array of types (matches contacts of ANY of the types)
 * - birthdayMonth: Month number (1-12) to match birthdays in that month
 * - createdAfter: ISO date string to filter contacts created after this date
 * - createdBefore: ISO date string to filter contacts created before this date
 */
export async function resolveSegment(
  db: D1Database,
  filters: SegmentFilter
): Promise<string[]> {
  let query = `
    SELECT DISTINCT c.id
    FROM contacts c
    WHERE c.is_deleted = 0 AND (c.opted_out = 0 OR c.opted_out IS NULL)
  `;

  const params: any[] = [];

  // Filter by tags (if provided)
  if (filters.tags && filters.tags.length > 0) {
    const tagConditions = filters.tags.map(() => "c.tags LIKE ?").join(' OR ');
    query += ` AND (${tagConditions})`;
    filters.tags.forEach((tag) => {
      // SQLite LIKE pattern for JSON array match
      params.push(`%"${tag}"%`);
    });
  }

  // Filter by cities (if provided)
  if (filters.cities && filters.cities.length > 0) {
    const cityPlaceholders = filters.cities.map(() => '?').join(', ');
    query += ` AND c.city IN (${cityPlaceholders})`;
    params.push(...filters.cities);
  }

  // Filter by countries (if provided)
  if (filters.countries && filters.countries.length > 0) {
    const countryPlaceholders = filters.countries.map(() => '?').join(', ');
    query += ` AND c.country IN (${countryPlaceholders})`;
    params.push(...filters.countries);
  }

  // Filter by contact types (if provided)
  if (filters.contactTypes && filters.contactTypes.length > 0) {
    const typePlaceholders = filters.contactTypes.map(() => '?').join(', ');
    query += ` AND c.type IN (${typePlaceholders})`;
    params.push(...filters.contactTypes);
  }

  // Filter by birthday month (if provided)
  if (filters.birthdayMonth !== undefined && filters.birthdayMonth > 0 && filters.birthdayMonth <= 12) {
    query += ` AND CAST(strftime('%m', c.birthday) AS INTEGER) = ?`;
    params.push(filters.birthdayMonth);
  }

  // Filter by creation date range (if provided)
  if (filters.createdAfter) {
    query += ` AND c.created_at >= ?`;
    params.push(filters.createdAfter);
  }

  if (filters.createdBefore) {
    query += ` AND c.created_at <= ?`;
    params.push(filters.createdBefore);
  }

  // Limit to prevent memory issues
  query += ` LIMIT 5000`;

  try {
    const stmt = db.prepare(query);
    const result = await stmt.bind(...params).all();

    if (!result.success || !result.results) {
      console.error('[SEGMENT RESOLVER] Query failed:', result);
      return [];
    }

    const contactIds = result.results.map((row: any) => row.id as string);
    console.log(`[SEGMENT RESOLVER] Found ${contactIds.length} contacts matching filters`);

    return contactIds;
  } catch (error: any) {
    console.error('[SEGMENT RESOLVER] Error resolving segment:', error.message);
    return [];
  }
}
