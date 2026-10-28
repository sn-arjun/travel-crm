/**
 * Departure-relative messages (R154, design section 9.3).
 *
 * A rule says "send this template N days before or after the start or end of every departure (of one tour, or of all), at this local
 * time, to everyone on it". The cron job `departures.messages` finds, for every active rule, the departures whose send moment has
 * passed (and is less than 48 hours old), and sends one message per booking or per passenger through the Communication Hub with that
 * person's own pickup point and time. Nothing is ever sent twice: a row in departure_message_sends per rule, departure, booking and
 * passenger is written before the send (the unique key makes a rerun, or two runs at once, harmless).
 *
 * Rows that were skipped without a message leaving (cap reached, no address, opted out) are looked at again on the next run while the
 * send moment is still inside the 48 hour window: a renewed allowance or a corrected phone number then lets the message go.
 */

import type { Env } from '../../types';
import { generateId } from '../../utils/uuid';
import { addDaysLocal, getTenantTimeZone, localDateString } from '../../utils/tz';
import { AllowanceExhausted, insideFreeWhatsAppWindow } from '../metering/meter';
import { HubError, sendHubMessage, type HubChannel, type HubPurpose } from '../messaging/hub';
import { marketingBlockedReason } from '../privacy/consent';
import { resolveVariables, substituteVariables } from '../template-engine';
import { resolveFeature } from '../features/resolve';
import { createInAppNotification } from '../notification-service';
import { submitScheduledProposal } from '../automation/engine';
import { agencyDefaultLanguage, t } from '../../i18n';
import { localDateTimeToUtcIso } from './common';
import { createSelfServiceLink } from './self-service';
import { getGroupToursSettings } from './settings';

type Row = Record<string, any>;

export const RULE_KEY = 'departures.scheduled_messages';
/** A send moment older than this is never caught up: a message about "tomorrow's pickup" must not arrive a day later. */
export const LATE_WINDOW_MS = 48 * 3_600_000;
/** Departures in these states take part; draft and cancelled ones never do. */
const DEPARTURE_STATUSES = ['open', 'closed', 'departed', 'completed'];

export type SendStatus = 'sent' | 'suggested' | 'skipped_opt_out' | 'skipped_cap' | 'skipped_no_address' | 'failed';

export interface MessageRule {
  id: string;
  tour_id: string | null;
  name: string;
  template_id: string | null;
  channel: 'preferred' | 'whatsapp' | 'email' | 'sms';
  fallback_channel: 'whatsapp' | 'email' | 'sms' | null;
  anchor: 'start' | 'end' | 'extras_cutoff';
  offset_days: number;
  local_time: string | null;
  audience: 'confirmed' | 'confirmed_and_held' | 'waitlisted';
  recipient: 'booking_contact' | 'each_passenger_with_contact';
  purpose: 'service' | 'marketing';
  mode: 'auto' | 'suggest';
  is_active: number;
}

export interface Recipient {
  bookingId: string;
  leadId: string | null;
  passengerId: string | null;
  contactId: string | null;
  /** The contact the booking belongs to (names, lead fields, reply thread). */
  bookingContactId: string;
  name: string;
  phone: string | null;
  email: string | null;
  bookingStatus: string;
}

/** What would happen to one recipient. */
export interface Decision {
  kind: 'send' | 'skip';
  channel?: HubChannel;
  to?: string;
  status?: SendStatus;
  detail?: string;
}

export interface RunSummary {
  sent: number;
  suggested: number;
  skipped_opt_out: number;
  skipped_cap: number;
  skipped_no_address: number;
  failed: number;
  /** Rows that were already handled by an earlier run. */
  already: number;
  /** Recipients that newly hit the allowance in this run (drives the one notification). */
  capHit: number;
}

const emptySummary = (): RunSummary => ({ sent: 0, suggested: 0, skipped_opt_out: 0, skipped_cap: 0, skipped_no_address: 0, failed: 0, already: 0, capHit: 0 });

// ------------------------------------------------------------------ when

/** The date the rule counts from, 'YYYY-MM-DD'. Null for an extras cut-off the departure does not have. */
export function anchorDate(rule: Pick<MessageRule, 'anchor'>, dep: Row, extrasCutoffDays: number): string | null {
  if (rule.anchor === 'start') return String(dep.start_date).slice(0, 10);
  if (rule.anchor === 'end') return String(dep.end_date).slice(0, 10);
  if (dep.extras_cutoff_date) return String(dep.extras_cutoff_date).slice(0, 10);
  return addDaysLocal(String(dep.start_date).slice(0, 10), -extrasCutoffDays);
}

/** The UTC moment a rule sends for a departure: the anchor date plus the offset, at the rule's local time in the agency zone (09:00 when unset). */
export function dueAt(rule: Pick<MessageRule, 'anchor' | 'offset_days' | 'local_time'>, dep: Row, timeZone: string, extrasCutoffDays: number): string | null {
  const anchor = anchorDate(rule, dep, extrasCutoffDays);
  if (!anchor) return null;
  return localDateTimeToUtcIso(timeZone, addDaysLocal(anchor, rule.offset_days), rule.local_time || '09:00');
}

/** True while the moment has passed and is less than 48 hours old. */
export function inWindow(due: string | null, now: Date): boolean {
  if (!due) return false;
  const t = new Date(due).getTime();
  return t <= now.getTime() && now.getTime() - t < LATE_WINDOW_MS;
}

// ------------------------------------------------------------------ rules

export async function loadRules(db: D1Database): Promise<MessageRule[]> {
  const { results } = await db.prepare('SELECT * FROM departure_message_rules ORDER BY created_at, id').all<MessageRule>();
  return results ?? [];
}

/**
 * The rules that apply to the departures of one tour: the agency-wide rules, except those a rule of the tour replaces (same name, ignoring
 * case; an inactive rule of the tour switches the agency one off for that tour), plus the tour's own active rules.
 */
export function rulesForTour(all: MessageRule[], tourId: string): MessageRule[] {
  const key = (r: MessageRule) => r.name.trim().toLowerCase();
  const own = all.filter((r) => r.tour_id === tourId);
  const replaced = new Set(own.map(key));
  const global = all.filter((r) => !r.tour_id && !replaced.has(key(r)));
  return [...global, ...own].filter((r) => !!r.is_active);
}

async function loadTemplate(db: D1Database, id: string | null): Promise<Row | null> {
  if (!id) return null;
  const row = await db.prepare('SELECT * FROM message_templates WHERE id = ?').bind(id).first<Row>();
  return row && row.is_active !== 0 ? row : null;
}

// ------------------------------------------------------------------ who

const AUDIENCE_STATUSES: Record<MessageRule['audience'], string[]> = {
  confirmed: ['confirmed'],
  confirmed_and_held: ['confirmed', 'held'],
  waitlisted: ['waitlisted'],
};

/** The people a rule addresses on a departure, in a stable order. Passengers without an address of their own are not addressed. */
export async function audienceFor(db: D1Database, rule: MessageRule, departureId: string): Promise<Recipient[]> {
  const statuses = AUDIENCE_STATUSES[rule.audience];
  const marks = statuses.map(() => '?').join(',');
  const bookings = (
    await db
      .prepare(
        `SELECT sb.id, sb.lead_id, sb.contact_id, sb.status, c.name AS contact_name, c.phone AS contact_phone, c.email AS contact_email
         FROM seat_bookings sb JOIN contacts c ON c.id = sb.contact_id
         WHERE sb.departure_id = ? AND sb.status IN (${marks}) AND COALESCE(c.is_deleted, 0) = 0
         ORDER BY sb.created_at, sb.id`,
      )
      .bind(departureId, ...statuses)
      .all<Row>()
  ).results ?? [];

  if (rule.recipient === 'booking_contact') {
    return bookings.map((b) => ({
      bookingId: b.id, leadId: b.lead_id, passengerId: null, contactId: b.contact_id, bookingContactId: b.contact_id,
      name: b.contact_name, phone: b.contact_phone, email: b.contact_email, bookingStatus: b.status,
    }));
  }

  const out: Recipient[] = [];
  for (const b of bookings) {
    const pax = (
      await db
        .prepare(
          `SELECT sp.id, sp.first_name, sp.last_name, tr.contact_id AS tr_contact, tr.phone AS tr_phone, tr.email AS tr_email
           FROM seat_passengers sp LEFT JOIN travellers tr ON tr.id = sp.traveller_id
           WHERE sp.seat_booking_id = ? AND sp.status = 'active' ORDER BY sp.created_at, sp.id`,
        )
        .bind(b.id)
        .all<Row>()
    ).results ?? [];
    for (const p of pax) {
      const phone = (p.tr_phone as string | null)?.trim() || null;
      const email = (p.tr_email as string | null)?.trim() || null;
      if (!phone && !email) continue;
      let contactId: string | null = p.tr_contact ?? null;
      if (!contactId) {
        // The same person may already be a contact: their opt-out then applies to this message too.
        const match = await db
          .prepare(`SELECT id FROM contacts WHERE COALESCE(is_deleted, 0) = 0 AND ((? IS NOT NULL AND phone = ?) OR (? IS NOT NULL AND LOWER(email) = LOWER(?))) ORDER BY created_at LIMIT 1`)
          .bind(phone, phone, email, email)
          .first<{ id: string }>();
        contactId = match?.id ?? null;
      }
      out.push({
        bookingId: b.id, leadId: b.lead_id, passengerId: p.id, contactId, bookingContactId: b.contact_id,
        name: `${p.first_name} ${p.last_name}`.trim() || b.contact_name, phone, email, bookingStatus: b.status,
      });
    }
  }
  return out;
}

// ------------------------------------------------------------------ what

async function agencySettings(db: D1Database): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const row = await db.prepare(`SELECT value FROM settings WHERE key = 'company_name'`).first<{ value: string | null }>();
  if (row?.value) {
    try {
      const parsed = JSON.parse(row.value);
      out.company_name = typeof parsed === 'string' ? parsed : row.value;
    } catch {
      out.company_name = row.value;
    }
  }
  return out;
}

interface RenderEnv {
  env: Env;
  tenantId: string;
  db: D1Database;
  settings: Record<string, string>;
  /** Whether the agency may hand out self-service links (the public pages feature). */
  links: boolean;
}

async function renderEnv(env: Env, tenantId: string, db: D1Database): Promise<RenderEnv> {
  let links = false;
  try {
    links = (await resolveFeature(env, tenantId, 'public_booking')).enabled;
  } catch {
    links = false;
  }
  return { env, tenantId, db, settings: await agencySettings(db), links };
}

export interface Rendered {
  subject: string | null;
  body: string;
  variables: Record<string, string | null>;
}

/** The text for one recipient: the template with the person's own values. `preview` never makes a self-service link. */
export async function renderFor(re: RenderEnv, template: Row, rule: MessageRule, rec: Recipient, preview: boolean): Promise<Rendered> {
  const text = `${template.content ?? ''} ${template.subject ?? ''}`;
  const wantsLink = /{(details_link|extras_link)}/.test(text);
  let links: { details_link: string | null; extras_link: string | null } | undefined;
  if (wantsLink) {
    if (preview) {
      links = { details_link: 'https://…/trip/…?step=travellers', extras_link: 'https://…/trip/…?step=extras' };
    } else if (re.links && ['held', 'confirmed'].includes(rec.bookingStatus)) {
      try {
        const link = await createSelfServiceLink(re.env, re.tenantId, re.db, rec.bookingId, rec.passengerId ? 'passenger' : 'booking', rec.passengerId);
        links = { details_link: link.detailsLink, extras_link: link.extrasLink };
      } catch (err) {
        console.error('[departure-messages] self-service link not made:', err instanceof Error ? err.message : err);
      }
    }
  }
  const variables = await resolveVariables(re.db, rec.bookingContactId, rec.leadId ?? undefined, re.settings, links, { seatBookingId: rec.bookingId, passengerId: rec.passengerId });
  if (rec.passengerId) {
    // The message is for this passenger, not for whoever made the booking.
    variables.customer_name = rec.name;
    variables.first_name = rec.name.split(' ')[0] || rec.name;
  }
  return {
    body: substituteVariables(template.content ?? '', variables),
    subject: template.subject ? substituteVariables(template.subject, variables) : null,
    variables,
  };
}

// ------------------------------------------------------------------ how

const addressFor = (channel: HubChannel, rec: Recipient): string | null => (channel === 'email' ? rec.email : rec.phone);

/** Can a WhatsApp message with this template go to this person now? An approved template always; free text only inside the 24 hour window. */
async function whatsappPossible(db: D1Database, template: Row, rec: Recipient): Promise<boolean> {
  if (template.channel === 'whatsapp' && template.whatsapp_status === 'approved') return true;
  return rec.contactId ? insideFreeWhatsAppWindow(db, rec.contactId) : false;
}

/** Channel, address and consent for one recipient, without sending anything. */
export async function decide(db: D1Database, rule: MessageRule, template: Row, rec: Recipient): Promise<Decision> {
  const primary = (rule.channel === 'preferred' ? template.channel : rule.channel) as HubChannel;
  const order: HubChannel[] = [primary];
  if (rule.fallback_channel && rule.fallback_channel !== primary) order.push(rule.fallback_channel);

  let sawAddress = false;
  let chosen: { channel: HubChannel; to: string } | null = null;
  for (const channel of order) {
    const to = addressFor(channel, rec);
    if (!to) continue;
    sawAddress = true;
    if (channel === 'whatsapp' && !(await whatsappPossible(db, template, rec))) continue;
    chosen = { channel, to };
    break;
  }
  if (!chosen) {
    return sawAddress
      ? { kind: 'skip', status: 'failed', detail: 'No approved WhatsApp template for this message and no fallback channel' }
      : { kind: 'skip', status: 'skipped_no_address', detail: 'No phone number or email address for this channel' };
  }

  if (rule.purpose === 'marketing') {
    const reason = await marketingBlockedReason(db, rec.contactId, chosen.channel);
    if (reason) return { kind: 'skip', status: 'skipped_opt_out', detail: reason };
  } else if (chosen.channel === 'email' && rec.contactId) {
    const c = await db.prepare('SELECT email_undeliverable FROM contacts WHERE id = ?').bind(rec.contactId).first<{ email_undeliverable: number | null }>();
    if (c?.email_undeliverable && rec.email) return { kind: 'skip', status: 'skipped_no_address', detail: 'The email address bounced before' };
  }
  return { kind: 'send', channel: chosen.channel, to: chosen.to };
}

// ------------------------------------------------------------------ rows

interface SendRow {
  id: string;
  status: SendStatus;
}

const SKIPPED: SendStatus[] = ['skipped_opt_out', 'skipped_cap', 'skipped_no_address'];

async function findRow(db: D1Database, ruleId: string, departureId: string, rec: Recipient): Promise<SendRow | null> {
  return db
    .prepare(
      `SELECT id, status FROM departure_message_sends WHERE rule_id = ? AND departure_id = ? AND seat_booking_id = ? AND IFNULL(seat_passenger_id, '') = IFNULL(?, '')`,
    )
    .bind(ruleId, departureId, rec.bookingId, rec.passengerId)
    .first<SendRow>();
}

/** Writes the row that owns this send, or returns null when someone else owns it. A status that did not leave a message can be taken over. */
async function claimRow(db: D1Database, ruleId: string, departureId: string, rec: Recipient, existing: SendRow | null, takeable: SendStatus[]): Promise<string | null> {
  if (existing) {
    if (!takeable.includes(existing.status)) return null;
    const res = await db
      .prepare(`UPDATE departure_message_sends SET status = 'failed', detail = 'in progress' WHERE id = ? AND status = ?`)
      .bind(existing.id, existing.status)
      .run();
    return (res.meta.changes ?? 0) > 0 ? existing.id : null;
  }
  const id = generateId();
  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO departure_message_sends (id, rule_id, departure_id, seat_booking_id, seat_passenger_id, contact_id, status, detail)
       VALUES (?, ?, ?, ?, ?, ?, 'failed', 'in progress')`,
    )
    .bind(id, ruleId, departureId, rec.bookingId, rec.passengerId, rec.contactId)
    .run();
  return (res.meta.changes ?? 0) > 0 ? id : null;
}

async function finishRow(db: D1Database, id: string, status: SendStatus, detail: string | null, extra: { messageLogId?: string | null; suggestionId?: string | null } = {}): Promise<void> {
  await db
    .prepare(`UPDATE departure_message_sends SET status = ?, detail = ?, message_log_id = COALESCE(?, message_log_id), suggestion_id = COALESCE(?, suggestion_id) WHERE id = ?`)
    .bind(status, detail, extra.messageLogId ?? null, extra.suggestionId ?? null, id)
    .run();
}

// ------------------------------------------------------------------ one rule on one departure

export interface ProcessOptions {
  now: Date;
  /** A person pressed "send": ignore the rule's mode and take over rows that were only suggested. */
  force?: boolean;
}

/**
 * Handles every recipient of one rule on one departure. In `auto` mode (or when forced) messages are sent; in `suggest` mode the people
 * who can be reached get a 'suggested' row and the departure one assistant suggestion.
 */
export async function processRuleOnDeparture(re: RenderEnv, rule: MessageRule, dep: Row, template: Row, opts: ProcessOptions): Promise<RunSummary> {
  const summary = emptySummary();
  const sending = opts.force || rule.mode === 'auto';
  const takeable: SendStatus[] = opts.force ? [...SKIPPED, 'suggested'] : SKIPPED;
  const recipients = await audienceFor(re.db, rule, dep.id);
  const capped = new Set<HubChannel>();

  for (const rec of recipients) {
    const existing = await findRow(re.db, rule.id, dep.id, rec);
    if (existing && !takeable.includes(existing.status)) {
      summary.already++;
      continue;
    }
    const decision = await decide(re.db, rule, template, rec);

    if (decision.kind === 'skip') {
      const status = decision.status!;
      if (existing) {
        if (existing.status !== status) await finishRow(re.db, existing.id, status, decision.detail ?? null);
      } else {
        const id = await claimRow(re.db, rule.id, dep.id, rec, null, takeable);
        if (id) await finishRow(re.db, id, status, decision.detail ?? null);
      }
      summary[status]++;
      continue;
    }

    if (!sending) {
      const id = await claimRow(re.db, rule.id, dep.id, rec, existing, takeable);
      if (!id) continue;
      await finishRow(re.db, id, 'suggested', null);
      summary.suggested++;
      continue;
    }

    if (capped.has(decision.channel!)) {
      if (!existing) {
        const id = await claimRow(re.db, rule.id, dep.id, rec, null, takeable);
        if (id) await finishRow(re.db, id, 'skipped_cap', 'The monthly allowance for this channel is used up');
      }
      summary.skipped_cap++;
      continue;
    }

    const id = await claimRow(re.db, rule.id, dep.id, rec, existing, takeable);
    if (!id) continue;
    try {
      const rendered = await renderFor(re, template, rule, rec, false);
      const sameChannel = template.channel === decision.channel;
      const sent = await sendHubMessage(re.env, re.tenantId, re.db, {
        contactId: rec.contactId,
        leadId: rec.leadId,
        channel: decision.channel!,
        to: rec.passengerId ? decision.to : undefined,
        templateId: sameChannel ? template.id : undefined,
        body: sameChannel ? undefined : rendered.body,
        subject: rendered.subject,
        variables: rendered.variables,
        purpose: rule.purpose as HubPurpose,
        actorId: null,
        blockUndeliverable: true,
        defaultSubject: rule.name,
        metadata: { departureMessage: { ruleId: rule.id, departureId: dep.id, seatBookingId: rec.bookingId, seatPassengerId: rec.passengerId } },
      });
      await finishRow(re.db, id, 'sent', null, { messageLogId: sent.messageId });
      summary.sent++;
    } catch (err) {
      if (err instanceof AllowanceExhausted) {
        capped.add(decision.channel!);
        await finishRow(re.db, id, 'skipped_cap', 'The monthly allowance for this channel is used up');
        summary.skipped_cap++;
        if (!existing || existing.status !== 'skipped_cap') summary.capHit++;
      } else if (err instanceof HubError && err.code === 'opted_out') {
        await finishRow(re.db, id, 'skipped_opt_out', err.message);
        summary.skipped_opt_out++;
      } else if (err instanceof HubError && (err.code === 'no_email' || err.code === 'no_phone' || err.code === 'email_undeliverable')) {
        await finishRow(re.db, id, 'skipped_no_address', err.message);
        summary.skipped_no_address++;
      } else {
        await finishRow(re.db, id, 'failed', (err instanceof Error ? err.message : String(err)).slice(0, 300));
        summary.failed++;
      }
    }
  }
  return summary;
}

function add(into: RunSummary, from: RunSummary): void {
  for (const k of Object.keys(into) as Array<keyof RunSummary>) into[k] += from[k];
}

/** One staff notification for the whole run, to the agency's administrators. */
async function notifyCap(db: D1Database, rule: MessageRule, dep: Row, count: number): Promise<void> {
  try {
    const admins = (await db.prepare(`SELECT id FROM users WHERE role = 'admin' AND is_active = 1`).all<{ id: string }>()).results ?? [];
    const lang = await agencyDefaultLanguage(db);
    for (const a of admins) {
      await createInAppNotification(
        db, a.id, t(lang, 'departureMessages.capNotice.title'),
        t(lang, 'departureMessages.capNotice.body', { count, rule: rule.name, code: dep.code }),
        'usage_alert', 'departure', dep.id,
      );
    }
  } catch (err) {
    console.error('[departure-messages] cap notification failed:', err);
  }
}

/** Suggest mode: one assistant suggestion per rule and departure, "Review and send N messages". */
async function suggestReview(env: Env, tenantId: string, db: D1Database, rule: MessageRule, dep: Row): Promise<void> {
  const n = (await db.prepare(`SELECT COUNT(*) AS n FROM departure_message_sends WHERE rule_id = ? AND departure_id = ? AND status = 'suggested'`).bind(rule.id, dep.id).first<{ n: number }>())?.n ?? 0;
  if (n === 0) return;
  const lang = await agencyDefaultLanguage(db);
  await submitScheduledProposal(env, tenantId, db, { key: RULE_KEY }, {
    action: 'open_prefilled_form',
    params: {
      href: `/settings/group-tours?tab=messages&rule=${rule.id}&departure=${dep.id}`,
      buttonLabel: t(lang, 'departureMessages.suggest.button'),
      details: [
        { label: t(lang, 'departureMessages.suggest.departure'), value: String(dep.code).slice(0, 200) },
        { label: t(lang, 'departureMessages.suggest.messages'), value: String(n) },
      ],
    },
    title: t(lang, 'departureMessages.suggest.title', { count: n, rule: rule.name }),
    reason: t(lang, 'departureMessages.suggest.reason', { code: dep.code, date: String(dep.start_date).slice(0, 10) }),
    entityType: 'departure',
    entityId: dep.id,
    sourceType: 'departure',
    sourceId: dep.id,
    assignedTo: dep.created_by ?? null,
    dedupeKey: `departure-messages:${rule.id}:${dep.id}`,
  });
}

// ------------------------------------------------------------------ the job

/** Departures a rule may be due on today: by the date window of its anchor, so finished departures from long ago are not read every tick. */
async function candidateDepartures(db: D1Database, rule: MessageRule, today: string): Promise<Row[]> {
  const marks = DEPARTURE_STATUSES.map(() => '?').join(',');
  const from = addDaysLocal(today, -rule.offset_days - 3);
  const to = addDaysLocal(today, -rule.offset_days + 1);
  const tour = rule.tour_id ? ' AND d.tour_id = ?' : '';
  const binds: unknown[] = [...DEPARTURE_STATUSES];
  let dateClause: string;
  if (rule.anchor === 'extras_cutoff') {
    // The cut-off is computed from the start date when the departure has none: look at every upcoming departure and let dueAt decide.
    dateClause = 'd.start_date >= ?';
    binds.push(addDaysLocal(today, -3));
  } else {
    dateClause = `d.${rule.anchor === 'start' ? 'start_date' : 'end_date'} BETWEEN ? AND ?`;
    binds.push(from, to);
  }
  if (rule.tour_id) binds.push(rule.tour_id);
  return (
    (
      await db
        .prepare(
          `SELECT d.*, t.extras_cutoff_days AS tour_extras_cutoff_days FROM departures d JOIN tours t ON t.id = d.tour_id
           WHERE COALESCE(d.is_deleted, 0) = 0 AND d.status IN (${marks}) AND ${dateClause}${tour} ORDER BY d.start_date, d.id LIMIT 200`,
        )
        .bind(...binds)
        .all<Row>()
    ).results ?? []
  );
}

/** The job: every active rule on every departure whose send moment has come. Idempotent; safe to run at any time. */
export async function runDepartureMessages(env: Env, tenantId: string, db: D1Database, now: Date = new Date()): Promise<RunSummary> {
  const total = emptySummary();
  const settings = await getGroupToursSettings(db);
  if (!settings.enabled) return total;
  // Switched off on the automations page: every rule is paused.
  const recipe = await db.prepare('SELECT mode FROM automation_rules WHERE recipe_key = ?').bind(RULE_KEY).first<{ mode: string }>();
  if (recipe?.mode === 'off') return total;
  try {
    if (!(await resolveFeature(env, tenantId, 'group_departures')).enabled) return total;
  } catch {
    // no plan registry (single-tenant stack): the agency switch above is enough
  }
  const all = await loadRules(db);
  const active = all.filter((r) => r.is_active);
  if (active.length === 0) return total;
  const tz = await getTenantTimeZone(db);
  const today = localDateString(tz, now);
  const re = await renderEnv(env, tenantId, db);

  for (const rule of active) {
    const template = await loadTemplate(db, rule.template_id);
    if (!template) continue;
    for (const dep of await candidateDepartures(db, rule, today)) {
      // An agency-wide rule yields to a rule of the same name on this departure's tour.
      if (!rule.tour_id && !rulesForTour(all, dep.tour_id).some((r) => r.id === rule.id)) continue;
      const due = dueAt(rule, dep, tz, dep.tour_extras_cutoff_days ?? settings.extrasCutoffDays);
      if (!inWindow(due, now)) continue;
      const summary = await processRuleOnDeparture(re, rule, dep, template, { now });
      add(total, summary);
      if (summary.capHit > 0) await notifyCap(db, rule, dep, summary.skipped_cap);
      if (rule.mode === 'suggest' && summary.suggested > 0) await suggestReview(env, tenantId, db, rule, dep);
    }
  }
  return total;
}

/** A person pressed "send" on a suggestion (or sends a rule by hand): the rule runs on that departure now, whatever the time or mode. */
export async function sendRuleNow(env: Env, tenantId: string, db: D1Database, rule: MessageRule, departureId: string, now: Date = new Date()): Promise<RunSummary | null> {
  const dep = await db
    .prepare(`SELECT d.*, t.extras_cutoff_days AS tour_extras_cutoff_days FROM departures d JOIN tours t ON t.id = d.tour_id WHERE d.id = ? AND COALESCE(d.is_deleted, 0) = 0`)
    .bind(departureId)
    .first<Row>();
  const template = await loadTemplate(db, rule.template_id);
  if (!dep || !template || !DEPARTURE_STATUSES.includes(dep.status)) return null;
  const summary = await processRuleOnDeparture(await renderEnv(env, tenantId, db), rule, dep, template, { now, force: true });
  if (summary.capHit > 0) await notifyCap(db, rule, dep, summary.skipped_cap);
  await db
    .prepare(`UPDATE assistant_suggestions SET status = 'applied', applied_at = ?, updated_at = ? WHERE dedupe_key = ? AND status = 'pending'`)
    .bind(now.toISOString(), now.toISOString(), `departure-messages:${rule.id}:${dep.id}`)
    .run();
  return summary;
}

// ------------------------------------------------------------------ preview

export interface PreviewItem {
  bookingId: string;
  passengerId: string | null;
  name: string;
  channel: HubChannel | null;
  to: string | null;
  subject: string | null;
  body: string;
  /** What a run would do now: send, or why not. */
  outcome: 'send' | SendStatus;
  detail: string | null;
  /** The status of the row an earlier run wrote, if any. */
  sentStatus: SendStatus | null;
}

/** The per-person messages a rule would send on a departure, nothing sent and no row written. */
export async function previewRule(env: Env, tenantId: string, db: D1Database, rule: MessageRule, departureId: string): Promise<{ dueAt: string | null; items: PreviewItem[] } | null> {
  const dep = await db
    .prepare(`SELECT d.*, t.extras_cutoff_days AS tour_extras_cutoff_days FROM departures d JOIN tours t ON t.id = d.tour_id WHERE d.id = ? AND COALESCE(d.is_deleted, 0) = 0`)
    .bind(departureId)
    .first<Row>();
  if (!dep) return null;
  const template = await loadTemplate(db, rule.template_id);
  if (!template) return { dueAt: null, items: [] };
  const settings = await getGroupToursSettings(db);
  const tz = await getTenantTimeZone(db);
  const re = await renderEnv(env, tenantId, db);
  const items: PreviewItem[] = [];
  for (const rec of await audienceFor(db, rule, dep.id)) {
    const decision = await decide(db, rule, template, rec);
    const rendered = await renderFor(re, template, rule, rec, true);
    const existing = await findRow(db, rule.id, dep.id, rec);
    items.push({
      bookingId: rec.bookingId,
      passengerId: rec.passengerId,
      name: rec.name,
      channel: decision.channel ?? null,
      to: decision.to ?? null,
      subject: rendered.subject,
      body: rendered.body,
      outcome: decision.kind === 'send' ? 'send' : decision.status!,
      detail: decision.detail ?? null,
      sentStatus: existing?.status ?? null,
    });
  }
  return { dueAt: dueAt(rule, dep, tz, dep.tour_extras_cutoff_days ?? settings.extrasCutoffDays), items };
}

// ------------------------------------------------------------------ defaults

interface DefaultRule {
  key: 'extras' | 'pickup' | 'review';
  anchor: MessageRule['anchor'];
  offset_days: number;
  local_time: string;
  purpose: MessageRule['purpose'];
  recipient: MessageRule['recipient'];
  category: string;
}

const DEFAULT_RULES: DefaultRule[] = [
  { key: 'extras', anchor: 'start', offset_days: -7, local_time: '10:00', purpose: 'service', recipient: 'booking_contact', category: 'reminder' },
  { key: 'pickup', anchor: 'start', offset_days: -2, local_time: '18:00', purpose: 'service', recipient: 'each_passenger_with_contact', category: 'reminder' },
  { key: 'review', anchor: 'end', offset_days: 2, local_time: '12:00', purpose: 'marketing', recipient: 'booking_contact', category: 'follow_up' },
];

/**
 * The three inactive starter rules (extras reminder 7 days before, pickup time 2 days before, review request 2 days after the end), with
 * their email templates. Runs once, the first time group tours are switched on; later calls change nothing.
 */
export async function seedDefaultRules(db: D1Database, userId: string | null): Promise<boolean> {
  const done = await db.prepare(`SELECT value FROM settings WHERE key = 'departure_message_rules_seeded'`).first();
  if (done) return false;
  const exists = await db.prepare('SELECT 1 AS hit FROM departure_message_rules LIMIT 1').first();
  const now = new Date().toISOString();
  if (!exists) {
    const lang = await agencyDefaultLanguage(db);
    for (const d of DEFAULT_RULES) {
      const name = t(lang, `departureMessages.default.${d.key}.name`);
      const templateId = generateId();
      await db
        .prepare(
          `INSERT INTO message_templates (id, channel, name, subject, content, category, language, is_active, is_system, created_by, created_at)
           VALUES (?, 'email', ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
        )
        .bind(templateId, `${t(lang, 'departureMessages.templatePrefix')}: ${name}`, t(lang, `departureMessages.default.${d.key}.subject`), t(lang, `departureMessages.default.${d.key}.content`), d.category, lang, userId, now)
        .run();
      await db
        .prepare(
          `INSERT INTO departure_message_rules (id, tour_id, name, template_id, channel, fallback_channel, anchor, offset_days, local_time, audience, recipient, purpose, mode, is_active, created_by, created_at, updated_at)
           VALUES (?, NULL, ?, ?, 'preferred', NULL, ?, ?, ?, 'confirmed', ?, ?, 'suggest', 0, ?, ?, ?)`,
        )
        .bind(generateId(), name, templateId, d.anchor, d.offset_days, d.local_time, d.recipient, d.purpose, userId, now, now)
        .run();
    }
  }
  await db
    .prepare(`INSERT INTO settings (key, value, updated_by, updated_at) VALUES ('departure_message_rules_seeded', '1', ?, ?) ON CONFLICT(key) DO NOTHING`)
    .bind(userId, now)
    .run();
  return !exists;
}
