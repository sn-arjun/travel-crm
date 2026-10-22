/**
 * Where the travellers' ages for a quote come from (R149, design 14): ages typed in, linked travellers' dates of birth on the
 * travel date, or the lead's pax counts plus the children's ages the message reader found (assistant_message_analysis.entities.childAges).
 */

import { ageOn, type PaxInput } from './age-bands';

type Row = Record<string, any>;

export type FillSource = 'ages' | 'travellers' | 'lead';

export interface ResolvedPax extends PaxInput {
  source: FillSource;
  /** Travellers with no usable date of birth, counted as adults. */
  unknown: number;
  /** Where the children's ages of the lead came from. */
  fromMessage?: boolean;
}

const cleanAges = (ages: unknown): number[] =>
  (Array.isArray(ages) ? ages : []).map(Number).filter((a) => Number.isFinite(a) && a >= 0 && a <= 120);

/**
 * The date ages are measured on: the start of the group departure the quote is for, else the lead's travel date, else today
 * (design 4.2: age on the travel date).
 */
export async function travelDateFor(db: D1Database, itinerary: { departureId?: string | null; leadId: string }): Promise<string> {
  if (itinerary.departureId) {
    const dep = await db.prepare('SELECT start_date FROM departures WHERE id = ?').bind(itinerary.departureId).first<{ start_date: string | null }>();
    if (dep?.start_date) return dep.start_date.slice(0, 10);
  }
  const lead = await db.prepare('SELECT travel_date FROM leads WHERE id = ?').bind(itinerary.leadId).first<{ travel_date: string | null }>();
  return (lead?.travel_date ?? new Date().toISOString()).slice(0, 10);
}

/** The latest ages the message reader found in a message of the lead (or of its contact, before the lead existed). */
export async function childAgesFromMessages(db: D1Database, leadId: string, contactId: string | null, messageIds?: string[]): Promise<number[]> {
  const rows = messageIds?.length
    ? await db
        .prepare(
          `SELECT a.entities FROM assistant_message_analysis a JOIN message_log m ON m.id = a.message_id
           WHERE a.message_id IN (${messageIds.map(() => '?').join(', ')}) AND a.entities LIKE '%"childAges"%'
           ORDER BY m.created_at DESC LIMIT 5`,
        )
        .bind(...messageIds)
        .all<Row>()
    : await db
        .prepare(
          `SELECT a.entities FROM assistant_message_analysis a JOIN message_log m ON m.id = a.message_id
           WHERE (m.lead_id = ?1 OR (?2 IS NOT NULL AND m.contact_id = ?2)) AND COALESCE(m.direction, 'outgoing') = 'incoming'
             AND a.entities LIKE '%"childAges"%'
           ORDER BY m.created_at DESC LIMIT 5`,
        )
        .bind(leadId, contactId)
        .all<Row>();
  for (const row of rows.results ?? []) {
    try {
      const ages = cleanAges(JSON.parse(row.entities)?.childAges);
      if (ages.length > 0) return ages;
    } catch {
      // an unreadable analysis is skipped
    }
  }
  return [];
}

/** Adults and the children's ages of a lead: its pax counts, with the ages from the message reader where it found them. */
export async function paxFromLead(db: D1Database, leadId: string, messageIds?: string[]): Promise<ResolvedPax | null> {
  const lead = await db
    .prepare('SELECT contact_id, pax_adults, pax_children, pax_infants FROM leads WHERE id = ?')
    .bind(leadId)
    .first<{ contact_id: string | null; pax_adults: number | null; pax_children: number | null; pax_infants: number | null }>();
  if (!lead) return null;
  const ages = await childAgesFromMessages(db, leadId, lead.contact_id, messageIds);
  const children = lead.pax_children ?? 0;
  return {
    source: 'lead',
    adults: lead.pax_adults ?? 1,
    ages,
    // Children counted on the lead beyond the ages we know are priced as the "child" band.
    children: Math.max(0, children - ages.length),
    infants: lead.pax_infants ?? 0,
    unknown: 0,
    fromMessage: ages.length > 0,
  };
}

/** The ages of linked travellers on the travel date; a traveller without a date of birth counts as an adult. */
export async function paxFromTravellers(db: D1Database, travellerIds: string[], travelDate: string): Promise<ResolvedPax> {
  const ids = [...new Set(travellerIds)].slice(0, 200);
  const ages: number[] = [];
  let unknown = 0;
  if (ids.length > 0) {
    const { results } = await db
      .prepare(`SELECT id, date_of_birth FROM travellers WHERE COALESCE(is_deleted, 0) = 0 AND id IN (${ids.map(() => '?').join(', ')})`)
      .bind(...ids)
      .all<{ id: string; date_of_birth: string | null }>();
    for (const t of results ?? []) {
      const dob = t.date_of_birth?.slice(0, 10);
      if (dob && /^\d{4}-\d{2}-\d{2}$/.test(dob) && dob <= travelDate) ages.push(ageOn(dob, travelDate));
      else unknown++;
    }
  }
  return { source: 'travellers', adults: unknown, ages, unknown };
}

export function paxFromAges(adults: number, ages: unknown): ResolvedPax {
  return { source: 'ages', adults, ages: cleanAges(ages), unknown: 0 };
}

export { cleanAges };
