import type { Env } from '../../types';
import { generateId } from '../../utils/uuid';
import {
  PRIVACY_TABLES,
  LEADS,
  TRAVELLERS,
  INVOICES,
  ITINERARIES,
  ITINERARY_DAYS,
  VISAS,
  MESSAGES,
  CALLS,
  TRIPS,
  VOUCHERS,
  ENTITY_IDS,
  bindsFor,
} from './registry';
import { tenantKeyFromRef } from './export-contact';

/**
 * R208: erase one contact's personal data.
 *
 * Removed (hard delete): consent evidence, messages, emails, call logs and transcripts, campaign rows, chat transcripts, AI
 * suggestions, travellers, passport and visa records, documents and every R2 object they point at, notifications, audit details.
 * Kept, anonymised: the contact row itself (invoices and payments point at it and tax law requires them), leads, itineraries,
 * invoices, invoice lines and payments (free text that holds the contact's name, email or phone is rewritten), trip assignments.
 * The contact becomes "Erased contact <first 8 of its id>" with every personal field null, opted out, and flagged erased_at.
 * Consent rows stay (they prove the withdrawal) but lose their evidence. One audit-log entry records the erasure without the data.
 *
 * Idempotent: a second call finds erased_at set and does nothing.
 */

export interface EraseResult {
  alreadyErased: boolean;
  anonymisedAs: string;
  filesDeleted: number;
  /** Rows deleted or rewritten, by step label. Zero-change steps are left out. */
  changes: Record<string, number>;
}

interface Step {
  label: string;
  sql: string;
  binds: unknown[];
}

function step(label: string, sql: string, contactId: string, extra: unknown[] = []): Step {
  const count = (sql.match(/\?/g) ?? []).length - extra.length;
  return { label, sql, binds: [...Array.from({ length: count }, () => contactId), ...extra] };
}

const del = (label: string, table: string, where: string, contactId: string): Step =>
  step(label, `DELETE FROM ${table} WHERE ${where}`, contactId);

/** Text a data subject may have been quoted in: the agency's own free text that we keep for tax or operations. */
const REWRITE_TARGETS: Array<{ table: string; columns: string[]; where: string }> = [
  { table: 'invoices', columns: ['terms', 'tax_notes'], where: 'contact_id = ? OR lead_id IN ' + LEADS },
  { table: 'invoice_items', columns: ['description'], where: 'invoice_id IN ' + INVOICES },
  { table: 'payments', columns: ['reference'], where: 'contact_id = ? OR invoice_id IN ' + INVOICES },
  { table: 'itinerary_days', columns: ['title', 'description'], where: 'itinerary_id IN ' + ITINERARIES },
  { table: 'itinerary_items', columns: ['title', 'description', 'details_json'], where: 'day_id IN ' + ITINERARY_DAYS },
  { table: 'itineraries', columns: ['inclusions', 'exclusions', 'terms_conditions'], where: 'lead_id IN ' + LEADS },
];

/** Free-text tables that are not tied to the contact by id: rows that quote the contact are cleared. */
const TEXT_SCRUBS: Array<{ label: string; table: string; columns: string[]; action: 'delete' | 'null'; nullColumn?: string }> = [
  { label: 'activity_log_details', table: 'activity_logs', columns: ['details'], action: 'null', nullColumn: 'details' },
  { label: 'notifications_quoting', table: 'notifications', columns: ['title', 'message'], action: 'delete' },
  { label: 'ai_nl_queries', table: 'ai_nl_queries', columns: ['query', 'query_result', 'ai_narrative'], action: 'delete' },
  { label: 'sticky_notes', table: 'sticky_notes', columns: ['content'], action: 'delete' },
  { label: 'task_comments_quoting', table: 'task_comments', columns: ['content'], action: 'delete' },
  { label: 'import_errors', table: 'import_errors', columns: ['row_data'], action: 'delete' },
  { label: 'ai_conversations_quoting', table: 'ai_conversations', columns: ['messages', 'title'], action: 'delete' },
  { label: 'ai_briefings_quoting', table: 'ai_briefings', columns: ['content', 'highlights'], action: 'delete' },
];

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

interface Needles {
  /** Words/numbers to look for in free text. */
  terms: string[];
  /** What a name is rewritten to; emails and phones are removed. */
  replacementName: string;
  nameTerms: string[];
}

function buildNeedles(subject: SubjectIdentity, replacementName: string): Needles {
  const nameTerms = new Set<string>();
  const terms = new Set<string>();
  const addName = (v: string | null | undefined) => {
    const t = (v ?? '').trim();
    if (t.length >= 4) nameTerms.add(t);
  };
  const addOther = (v: string | null | undefined, minLen = 6) => {
    const t = (v ?? '').trim();
    if (t.length >= minLen) terms.add(t);
  };
  addName(subject.name);
  addOther(subject.email, 5);
  addOther(subject.phone, 6);
  const digits = (subject.phone ?? '').replace(/\D/g, '');
  if (digits.length >= 8) {
    terms.add(digits);
    terms.add(digits.slice(-10));
  }
  for (const t of subject.travellers) {
    addName(t.fullName);
    addName(t.passportName);
    addOther(t.email, 5);
    addOther(t.phone, 6);
    addOther(t.passportNumber, 6);
  }
  for (const n of nameTerms) terms.add(n);
  return { terms: [...terms], replacementName, nameTerms: [...nameTerms] };
}

interface SubjectIdentity {
  name: string;
  email: string | null;
  phone: string | null;
  travellers: Array<{ fullName: string; passportName: string | null; email: string | null; phone: string | null; passportNumber: string | null }>;
}

export async function eraseContact(
  env: Pick<Env, 'FILE_STORAGE' | 'MASTER_DB'>,
  db: D1Database,
  tenantId: string,
  contactId: string,
  actorUserId: string
): Promise<EraseResult | null> {
  const contact = await db
    .prepare('SELECT id, name, email, phone, erased_at FROM contacts WHERE id = ?')
    .bind(contactId)
    .first<{ id: string; name: string; email: string | null; phone: string | null; erased_at: string | null }>();
  if (!contact) return null;
  const anonymisedAs = `Erased contact ${contactId.slice(0, 8)}`;
  if (contact.erased_at) return { alreadyErased: true, anonymisedAs, filesDeleted: 0, changes: {} };

  const travRows = await db
    .prepare('SELECT first_name, last_name, full_name_passport, email, phone, passport_number FROM travellers WHERE contact_id = ?')
    .bind(contactId)
    .all<{ first_name: string | null; last_name: string | null; full_name_passport: string | null; email: string | null; phone: string | null; passport_number: string | null }>();
  const subject: SubjectIdentity = {
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    travellers: (travRows.results ?? []).map((t) => ({
      fullName: [t.first_name, t.last_name].filter(Boolean).join(' '),
      passportName: t.full_name_passport,
      email: t.email,
      phone: t.phone,
      passportNumber: t.passport_number,
    })),
  };
  const needles = buildNeedles(subject, anonymisedAs);

  // ---- 1. R2 objects first: if the database step fails the whole call can be repeated.
  const keys = new Set<string>();
  for (const spec of PRIVACY_TABLES) {
    if (!spec.fileColumns?.length) continue;
    const { results } = await db
      .prepare(`SELECT ${spec.fileColumns.join(', ')} FROM ${spec.table} WHERE ${spec.where}`)
      .bind(...bindsFor(spec.where, contactId))
      .all<Record<string, unknown>>();
    for (const row of results ?? []) {
      for (const col of spec.fileColumns) {
        const key = tenantKeyFromRef(row[col], tenantId);
        if (key) keys.add(key);
      }
    }
  }
  // Earlier privacy exports of this contact hold everything we are erasing.
  const exportPrefix = `${tenantId}/privacy/${contactId}/`;
  let cursor: string | undefined;
  do {
    const listed = await env.FILE_STORAGE.list({ prefix: exportPrefix, cursor });
    for (const obj of listed.objects) keys.add(obj.key);
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  const keyList = [...keys];
  for (let i = 0; i < keyList.length; i += 500) await env.FILE_STORAGE.delete(keyList.slice(i, i + 500));

  // ---- 2. Public quotation links of the contact's itineraries stop working.
  const itins = await db
    .prepare(`SELECT id FROM itineraries WHERE lead_id IN ${LEADS}`)
    .bind(contactId)
    .all<{ id: string }>();
  const itineraryIds = (itins.results ?? []).map((r) => r.id);
  for (let i = 0; i < itineraryIds.length; i += 50) {
    const chunk = itineraryIds.slice(i, i + 50);
    await env.MASTER_DB
      .prepare(`UPDATE quotation_links SET is_active = 0 WHERE tenant_id = ? AND itinerary_id IN (${chunk.map(() => '?').join(',')})`)
      .bind(tenantId, ...chunk)
      .run();
  }

  // ---- 3. One atomic batch of deletes and rewrites. Dependents first, because the id sets are sub-selects.
  const now = new Date().toISOString();
  const steps: Step[] = [];

  // Rows found through entity_id / reference_id (they must run while the travellers still exist).
  steps.push(
    step('activity_log_details', `UPDATE activity_logs SET details = NULL, ip_address = NULL WHERE entity_id IN ${ENTITY_IDS}`, contactId),
    del('notifications', 'notifications', `reference_id IN ${ENTITY_IDS}`, contactId),
    del('ai_generated_content', 'ai_generated_content', `entity_id IN ${ENTITY_IDS}`, contactId),
    del('ai_insights', 'ai_insights', `entity_id IN ${ENTITY_IDS}`, contactId),
    del('ai_recommendations', 'ai_recommendations', `entity_id IN ${ENTITY_IDS}`, contactId),
    del('ai_document_scans', 'ai_document_scans', `entity_id IN ${ENTITY_IDS}`, contactId),
    del('ai_conversations', 'ai_conversations', `entity_id IN ${ENTITY_IDS}`, contactId),
    del('domain_events', 'domain_events', `entity_id IN ${ENTITY_IDS}`, contactId),
    del('automation_runs', 'automation_runs', `entity_id IN ${ENTITY_IDS}`, contactId),
    del('reminder_log', 'reminder_log', `entity_id IN ${ENTITY_IDS}`, contactId),
    del('expiry_alerts', 'expiry_alerts_log', `entity_id IN ${ENTITY_IDS}`, contactId),
    del('bookmarks', 'bookmarks', `entity_id IN ${ENTITY_IDS}`, contactId)
  );

  // Messages, calls, campaigns
  steps.push(
    del('message_analysis', 'assistant_message_analysis', `message_id IN ${MESSAGES}`, contactId),
    del('ai_call_extractions', 'ai_call_extractions', `call_log_id IN ${CALLS} OR created_contact_id = ?`, contactId),
    del('call_transcripts', 'call_transcripts', `call_log_id IN ${CALLS}`, contactId),
    del('call_logs', 'call_logs', `id IN ${CALLS}`, contactId),
    del('messages', 'message_log', `id IN ${MESSAGES}`, contactId),
    del('email_log', 'email_message_log', 'contact_id = ?', contactId),
    del('unsubscribes', 'unsubscribes', 'contact_id = ?', contactId),
    del('campaign_recipients', 'campaign_recipients', 'contact_id = ?', contactId),
    del('whatsapp_campaign_recipients', 'whatsapp_campaign_recipients', 'contact_id = ?', contactId),
    del('chatbot_conversations', 'chatbot_conversations', `contact_id = ? OR lead_id IN ${LEADS}`, contactId),
    del('ai_followup_suggestions', 'ai_followup_suggestions', `contact_id = ? OR lead_id IN ${LEADS}`, contactId),
    del('ai_customer_segments', 'ai_customer_segments', 'contact_id = ?', contactId),
    del('assistant_suggestions', 'assistant_suggestions', `contact_id = ? OR lead_id IN ${LEADS}`, contactId),
    del('shared_contacts', 'shared_contacts', 'contact_id = ?', contactId),
    del('custom_field_values', 'contact_custom_field_values', 'contact_id = ?', contactId)
  );

  // Leads' dependents
  steps.push(
    del('lead_activities', 'lead_activities', `lead_id IN ${LEADS}`, contactId),
    del('follow_ups', 'follow_ups', `lead_id IN ${LEADS}`, contactId),
    del('ai_lead_scores', 'ai_lead_scores', `lead_id IN ${LEADS}`, contactId),
    step('trip_voucher_links', `UPDATE trip_assignments SET voucher_id = NULL WHERE voucher_id IN ${VOUCHERS}`, contactId),
    del('vouchers', 'vouchers', `lead_id IN ${LEADS}`, contactId),
    step('task_comments', `UPDATE task_comments SET content = 'Erased' WHERE task_id IN (SELECT id FROM tasks WHERE related_lead_id IN ${LEADS})`, contactId),
    step('tasks', `UPDATE tasks SET title = 'Erased task', description = NULL WHERE related_lead_id IN ${LEADS}`, contactId),
    step('events', `UPDATE events SET title = 'Erased event', description = NULL, location = NULL WHERE related_lead_id IN ${LEADS}`, contactId)
  );

  // Visa and travellers (documents and files first)
  steps.push(
    del('visa_checklist_items', 'visa_checklist_items', `visa_application_id IN ${VISAS}`, contactId),
    del('visa_documents', 'visa_documents', `visa_application_id IN ${VISAS}`, contactId),
    del('visa_notes', 'visa_notes', `visa_application_id IN ${VISAS}`, contactId),
    del('visa_applications', 'visa_applications', `id IN ${VISAS}`, contactId),
    del('traveller_documents', 'traveller_documents', `traveller_id IN ${TRAVELLERS}`, contactId),
    del('documents', 'documents', PRIVACY_TABLES.find((t) => t.key === 'documents')!.where, contactId)
  );

  // Kept for tax or operations, personal fields cleared
  steps.push(
    step('trip_timeline', `UPDATE trip_timeline SET notes = NULL, latitude = NULL, longitude = NULL WHERE trip_id IN ${TRIPS}`, contactId),
    step('trip_assignments', `UPDATE trip_assignments SET passenger_name = 'Erased', passenger_phone = NULL, special_instructions = NULL, pickup_location = NULL, drop_location = NULL, cancellation_reason = NULL, contact_id = NULL WHERE id IN ${TRIPS}`, contactId),
    step('invoices', `UPDATE invoices SET notes = NULL, payment_link = NULL, payment_link_id = NULL, payment_link_url = NULL, payment_link_status = NULL, payment_link_gateway = NULL WHERE contact_id = ? OR lead_id IN ${LEADS}`, contactId),
    step('payments', `UPDATE payments SET notes = NULL, receipt_url = NULL WHERE contact_id = ? OR invoice_id IN ${INVOICES}`, contactId),
    step('itineraries', `UPDATE itineraries SET title = 'Erased itinerary', notes = NULL, share_token = NULL, share_link_active = 0 WHERE lead_id IN ${LEADS}`, contactId),
    step('leads', `UPDATE leads SET title = 'Erased lead', notes = NULL, special_requirements = NULL, lost_reason = NULL, hotel_preference = NULL, meal_preference = NULL WHERE contact_id = ?`, contactId)
  );

  // Rewrite the contact's name, email and phone out of free text we keep
  for (const target of REWRITE_TARGETS) {
    for (const col of target.columns) {
      for (const term of needles.terms) {
        const replacement = needles.nameTerms.includes(term) ? needles.replacementName : '';
        const sql = `UPDATE ${target.table} SET ${col} = REPLACE(${col}, ?, ?) WHERE (${target.where}) AND ${col} LIKE ? ESCAPE '\\'`;
        steps.push({ label: `rewrite_${target.table}`, sql, binds: [term, replacement, ...bindsFor(target.where, contactId), `%${likeEscape(term)}%`] });
      }
    }
  }
  // The contact's own travellers are gone by now; only a trailing pass over unscoped text remains.
  for (const scrub of TEXT_SCRUBS) {
    for (const term of needles.terms) {
      const like = `%${likeEscape(term)}%`;
      const cond = scrub.columns.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(' OR ');
      const binds = scrub.columns.map(() => like);
      steps.push({
        label: scrub.label,
        sql: scrub.action === 'delete' ? `DELETE FROM ${scrub.table} WHERE ${cond}` : `UPDATE ${scrub.table} SET ${scrub.nullColumn} = NULL WHERE ${cond}`,
        binds,
      });
    }
  }

  // Travellers last: their ids were needed by the steps above
  steps.push(del('travellers', 'travellers', 'contact_id = ?', contactId));

  // Consents keep proving the withdrawal; evidence (IP, email, form text) goes. Then the erasure marker and the contact row.
  steps.push(
    step('consent_evidence', `UPDATE contact_consents SET evidence = NULL WHERE contact_id = ?`, contactId),
    {
      label: 'consent_withdrawn',
      sql: `INSERT INTO contact_consents (id, contact_id, channel, purpose, status, source, captured_at, evidence, captured_by) VALUES (?, ?, 'any', 'marketing', 'withdrawn', 'manual', ?, NULL, ?)`,
      binds: [generateId(), contactId, now, actorUserId],
    },
    {
      label: 'contact',
      sql: `UPDATE contacts SET name = ?, email = NULL, phone = NULL, company = NULL, address = NULL, city = NULL, state = NULL, country = NULL, postal_code = NULL,
              tax_id = NULL, is_business = 0, tags = '[]', notes = NULL, source = NULL, birthday = NULL, anniversary = NULL, preferred_language = 'en',
              dnd_enabled = 0, opted_out = 1, opted_out_at = COALESCE(opted_out_at, ?), opt_out_channel = 'erased', opt_out_reason = NULL,
              is_deleted = 1, erased_at = ?, updated_at = ? WHERE id = ?`,
      binds: [anonymisedAs, now, now, now, contactId],
    },
    {
      label: 'audit',
      sql: `INSERT INTO activity_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at) VALUES (?, ?, 'erase', 'contact', ?, ?, NULL, ?)`,
      binds: [generateId(), actorUserId, contactId, JSON.stringify({ reason: 'data subject erasure', filesDeleted: keys.size }), now],
    }
  );

  const results = await db.batch(steps.map((s) => db.prepare(s.sql).bind(...s.binds)));
  const changes: Record<string, number> = {};
  results.forEach((r, i) => {
    const n = r.meta?.changes ?? 0;
    if (n > 0) changes[steps[i].label] = (changes[steps[i].label] ?? 0) + n;
  });
  return { alreadyErased: false, anonymisedAs, filesDeleted: keys.size, changes };
}
