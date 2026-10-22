/**
 * Recipe library: the ready-made automations a workspace can switch off, leave as
 * one-click suggestions, or (where the action is low risk) let run on their own.
 *
 * A recipe looks at one event and returns proposals. It never changes data itself;
 * the engine turns proposals into suggestions or runs them through the action registry.
 */

import { getTenantTimeZone, localDateString, addDaysLocal, localClock, localDateStartUtcIso } from '../../utils/tz';
import { analyzeMessage, type MessageAnalysis, type MessageEntities } from './message-analysis';
import type { DomainEvent, Proposal, Recipe, RecipeContext } from './types';
import { formatMoney, loadLocaleContext } from '../../utils/money';
import { loadDepartureContext } from '../departures/seat-support';
import { nextFittingWaitlist } from '../departures/waitlist';
import { seatsLeft } from '../departures/seat-support';
import { childAgesFromMessages } from '../pricing/quote-fill';

/** "8 and 5", "9, 6 and 2". */
const joinAgesText = (ages: number[]): string => (ages.length < 2 ? ages.join('') : `${ages.slice(0, -1).join(', ')} and ${ages[ages.length - 1]}`);

const OPEN_LEAD_SQL = `status NOT IN ('won', 'lost', 'booking_confirmed', 'completed') AND COALESCE(is_deleted, 0) = 0`;

interface LeadRow {
  id: string;
  title: string;
  contact_id: string;
  status: string;
  destination: string | null;
  travel_date: string | null;
  return_date: string | null;
  pax_adults: number | null;
  pax_children: number | null;
  budget: number | null;
  trip_type: string | null;
  special_requirements: string | null;
  source: string | null;
  assigned_to: string | null;
}

async function loadLead(ctx: RecipeContext, leadId: string | null | undefined): Promise<LeadRow | null> {
  if (!leadId) return null;
  return ctx.db.prepare('SELECT * FROM leads WHERE id = ? AND COALESCE(is_deleted, 0) = 0').bind(leadId).first<LeadRow>();
}

async function loadContact(ctx: RecipeContext, contactId: string | null | undefined) {
  if (!contactId) return null;
  return ctx.db
    .prepare('SELECT id, name, phone, email, opted_out, dnd_enabled FROM contacts WHERE id = ? AND COALESCE(is_deleted, 0) = 0')
    .bind(contactId)
    .first<{ id: string; name: string; phone: string | null; email: string | null; opted_out: number | null; dnd_enabled: number | null }>();
}

async function companyName(ctx: RecipeContext): Promise<string | null> {
  const row = await ctx.db.prepare(`SELECT value FROM settings WHERE key = 'company_name'`).first<{ value: string }>();
  if (!row?.value) return null;
  try {
    const parsed = JSON.parse(row.value);
    return typeof parsed === 'string' ? parsed : row.value;
  } catch {
    return row.value;
  }
}

async function today(ctx: RecipeContext): Promise<string> {
  return localDateString(await getTenantTimeZone(ctx.db));
}

function parseDestinations(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === 'string' && d.trim().length > 0) : [];
  } catch {
    return raw.trim() ? [raw.trim()] : [];
  }
}

/** Place names this agency already sells or has quoted. */
async function knownDestinations(ctx: RecipeContext): Promise<string[]> {
  const names = new Set<string>();
  const add = (value: string | null | undefined) => {
    for (const part of (value ?? '').split(',')) {
      const name = part.trim();
      if (name.length >= 3 && name.length <= 40) names.add(name);
    }
  };

  const [templates, rateCards, leads] = await Promise.all([
    ctx.db.prepare('SELECT destination, template_data FROM itinerary_templates LIMIT 200').all<{ destination: string | null; template_data: string | null }>(),
    ctx.db.prepare('SELECT DISTINCT destination FROM rate_cards WHERE destination IS NOT NULL LIMIT 300').all<{ destination: string }>(),
    ctx.db.prepare('SELECT destination FROM leads WHERE destination IS NOT NULL ORDER BY created_at DESC LIMIT 300').all<{ destination: string }>(),
  ]);
  for (const row of templates.results) {
    add(row.destination);
    // The cities a template visits are destinations customers ask for by name.
    try {
      const days = row.template_data ? (JSON.parse(row.template_data).days ?? []) : [];
      for (const day of days) add(typeof day?.city === 'string' ? day.city : null);
    } catch {
      // an unreadable template simply adds nothing
    }
  }
  for (const row of rateCards.results) add(row.destination);
  for (const row of leads.results) for (const name of parseDestinations(row.destination)) add(name);
  return [...names];
}

type MoneyFmt = (amount: number) => string;
const moneyFmtCache = new WeakMap<object, Promise<MoneyFmt>>();

/** Whole-unit money text in the agency's own currency and number format (settings currency and locale). */
function moneyFmt(ctx: RecipeContext): Promise<MoneyFmt> {
  let p = moneyFmtCache.get(ctx);
  if (!p) {
    p = loadLocaleContext(ctx.db).then((loc) => (amount: number) => formatMoney(amount, loc.currency, loc.locale, { whole: true }));
    moneyFmtCache.set(ctx, p);
  }
  return p;
}

/**
 * A customer wrote an amount in a currency other than the one it is compared with (the agency's, or an invoice's).
 * The amount is kept as written and the suggestion says so; nothing is converted.
 */
function otherCurrencyNote(e: MessageEntities, amount: number | undefined, compareWith: string): string | null {
  if (!e.currency || amount === undefined || e.currency.toUpperCase() === compareWith.toUpperCase()) return null;
  return `Customer mentions ${e.currency} ${amount}; ${compareWith} is the currency here`;
}

function shortDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function describeTrip(e: MessageEntities, inr: MoneyFmt): string {
  const parts: string[] = [];
  if (e.destinations.length > 0) parts.push(e.destinations.slice(0, 3).join(', '));
  if (e.nights) parts.push(`${e.nights} night${e.nights === 1 ? '' : 's'}`);
  if (e.travelDate) parts.push(`from ${shortDate(e.travelDate)}`);
  if (e.paxAdults) parts.push(`${e.paxAdults} adult${e.paxAdults === 1 ? '' : 's'}${e.paxChildren ? ` + ${e.paxChildren} child${e.paxChildren === 1 ? '' : 'ren'}` : ''}`);
  if (e.budget) parts.push(inr(e.budget));
  return parts.join(', ');
}

function replyChannel(channel: string, contact: { phone: string | null; email: string | null }): 'whatsapp' | 'sms' | 'email' | null {
  if ((channel === 'whatsapp' || channel === 'sms') && contact.phone) return channel;
  if (channel === 'email' && contact.email) return 'email';
  if (contact.phone) return 'whatsapp';
  if (contact.email) return 'email';
  return null;
}

async function saveAnalysis(ctx: RecipeContext, messageId: string, analysis: MessageAnalysis): Promise<void> {
  await ctx.db
    .prepare(
      `INSERT OR REPLACE INTO assistant_message_analysis
         (message_id, intent, urgency, language, needs_work, entities, draft_reply, summary, source, model_used, cost_estimate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      messageId,
      analysis.intent,
      analysis.urgency,
      analysis.language,
      analysis.needsWork ? 1 : 0,
      JSON.stringify(analysis.entities),
      analysis.draftReply ?? null,
      analysis.summary ?? null,
      analysis.source,
      analysis.model ?? null,
      analysis.cost,
    )
    .run();
}

// ── Inbox ────────────────────────────────────────────────────

const readMessages: Recipe = {
  key: 'inbox.read_messages',
  area: 'Inbox',
  title: 'Read every incoming message',
  description:
    'Understands each WhatsApp, SMS, email and web enquiry: new enquiry, change request, confirmation or payment. Proposes the lead, the update or the payment, with a drafted reply.',
  triggers: ['message.received'],
  defaultMode: 'suggest',
  autoEligible: false,
  usesAi: true,
  async evaluate(ctx, event) {
    const inr = await moneyFmt(ctx);
    const loc = await loadLocaleContext(ctx.db);
    const message = await ctx.db
      .prepare(`SELECT id, contact_id, lead_id, channel, subject, content, from_address, metadata FROM message_log WHERE id = ? AND direction = 'incoming'`)
      .bind(event.entityId)
      .first<{ id: string; contact_id: string | null; lead_id: string | null; channel: string; subject: string | null; content: string | null; from_address: string | null; metadata: string | null }>();
    if (!message || !message.content || message.channel === 'web_form') return [];

    const contact = await loadContact(ctx, message.contact_id);
    let lead = await loadLead(ctx, message.lead_id);
    if (lead && !/^(new|contacted|qualified|requirement_gathered|proposal_sent|negotiation|on_hold)$/.test(lead.status)) lead = null;

    let fromName: string | null = null;
    try {
      fromName = message.metadata ? (JSON.parse(message.metadata).from_name ?? null) : null;
    } catch {
      fromName = null;
    }

    const text = message.subject ? `${message.subject}\n${message.content}` : message.content;
    const analysis = await analyzeMessage(
      ctx.env,
      ctx.tenantId,
      {
        text,
        channel: message.channel,
        senderName: contact?.name ?? fromName,
        companyName: await companyName(ctx),
        knownDestinations: await knownDestinations(ctx),
        today: await today(ctx),
        currency: loc.currency,
        locale: loc.locale,
        leadContext: lead ? `${lead.title} (${parseDestinations(lead.destination).join(', ') || 'destination open'}; status ${lead.status})` : null,
      },
      { aiAllowed: ctx.aiAllowed, db: ctx.db },
    );
    await saveAnalysis(ctx, message.id, analysis);
    if (!analysis.needsWork) return [];

    const e = analysis.entities;
    const origin = analysis.source === 'ai' ? 'ai' : 'rule';
    // A full name stated in the message beats a profile name; a bare first name does not.
    const statedName = e.name && (/\s/.test(e.name.trim()) || !fromName) ? e.name.trim() : null;
    const senderName = statedName ?? fromName ?? e.name ?? null;
    const sender = contact?.name ?? senderName ?? message.from_address ?? 'this sender';
    const where: Pick<Proposal, 'entityType' | 'entityId' | 'contactId' | 'leadId' | 'sourceType' | 'sourceId' | 'origin' | 'model'> = {
      entityType: contact ? 'contact' : 'message',
      entityId: contact ? contact.id : message.id,
      contactId: contact?.id ?? null,
      leadId: lead?.id ?? null,
      sourceType: 'message',
      sourceId: message.id,
      origin,
      model: analysis.model,
    };
    const proposals: Proposal[] = [];
    const day = (await today(ctx));
    // A budget written in another currency is kept on the analysis with its currency and said in the suggestion;
    // it is not put on the lead as if it were in the agency's currency.
    const budgetNote = otherCurrencyNote(e, e.budget, loc.currency);

    if (analysis.intent === 'enquiry' && !lead) {
      const isEmail = (message.from_address ?? '').includes('@');
      const headline = e.destinations[0] ?? 'Travel';
      const kind = e.tripType && e.tripType !== 'domestic' && e.tripType !== 'international' ? ` ${e.tripType}` : '';
      proposals.push({
        ...where,
        action: 'create_lead_from_enquiry',
        title: contact ? `Create a lead for ${sender}` : `Create contact and lead for ${sender}`,
        reason: [describeTrip(budgetNote ? { ...e, budget: undefined } : e, inr) || 'New travel enquiry', budgetNote].filter(Boolean).join('. '),
        params: {
          contactId: contact?.id ?? null,
          name: contact ? null : senderName,
          phone: contact || isEmail ? null : message.from_address,
          email: contact || !isEmail ? null : message.from_address,
          title: `${headline}${kind} trip: ${sender}`.slice(0, 200),
          destinations: e.destinations,
          travelDate: e.travelDate ?? null,
          returnDate: e.returnDate ?? null,
          paxAdults: e.paxAdults ?? 1,
          paxChildren: e.paxChildren ?? 0,
          budget: budgetNote ? null : (e.budget ?? null),
          tripType: e.tripType ?? null,
          specialRequirements: e.specialRequirements ?? null,
          source: message.channel,
          messageIds: [message.id],
        },
        // One enquiry suggestion per sender per day; further messages add to it.
        dedupeKey: `enquiry:${contact?.id ?? message.from_address ?? message.id}:${day}`,
        mergeIntoPending: true,
        confidence: analysis.source === 'ai' ? 0.9 : 0.7,
      });
    }

    if (lead && (analysis.intent === 'enquiry' || analysis.intent === 'change_request')) {
      const current = parseDestinations(lead.destination);
      const changes: Record<string, unknown> = {};
      const added = e.destinations.filter((d) => !current.some((c) => c.toLowerCase() === d.toLowerCase()));
      if (added.length > 0) changes.destinations = [...current, ...added];
      if (e.travelDate && e.travelDate !== lead.travel_date) changes.travelDate = e.travelDate;
      if (e.returnDate && e.returnDate !== lead.return_date) changes.returnDate = e.returnDate;
      if (e.paxAdults && e.paxAdults !== lead.pax_adults) changes.paxAdults = e.paxAdults;
      if (e.paxChildren !== undefined && e.paxChildren !== (lead.pax_children ?? 0)) changes.paxChildren = e.paxChildren;
      if (e.budget && !budgetNote && e.budget !== lead.budget) changes.budget = e.budget;
      if (Object.keys(changes).length > 0) {
        proposals.push({
          ...where,
          entityType: 'lead',
          entityId: lead.id,
          action: 'update_lead',
          title: `Update "${lead.title}" from ${sender}'s message`,
          reason: [describeTrip({ ...e, destinations: added, budget: budgetNote ? undefined : e.budget }, inr) || Object.keys(changes).join(', '), budgetNote].filter(Boolean).join('. '),
          params: { leadId: lead.id, changes },
          dedupeKey: `update-lead:${message.id}`,
          confidence: analysis.source === 'ai' ? 0.85 : 0.6,
        });
      }
    }

    // Saying yes, or paying, on an open enquiry both mean the booking is on.
    if (lead && (analysis.intent === 'confirmation' || !!e.paymentAmount)) {
      proposals.push({
        ...where,
        entityType: 'lead',
        entityId: lead.id,
        action: 'mark_lead_won',
        title: `${sender} confirmed: mark "${lead.title}" as won`,
        reason: e.paymentAmount
          ? `The customer says they paid ${e.currency && e.currency.toUpperCase() !== loc.currency.toUpperCase() ? `${e.currency} ${e.paymentAmount}` : inr(e.paymentAmount)}`
          : 'The customer agreed to go ahead',
        params: { leadId: lead.id },
        dedupeKey: `won:${lead.id}`,
        confidence: analysis.source === 'ai' ? 0.85 : 0.65,
      });
    }

    // A payment mentioned in any message (often inside a "yes, go ahead") is matched to the open invoice.
    if (contact && e.paymentAmount) {
      const invoice = await ctx.db
        .prepare(
          `SELECT id, invoice_number, balance_due, total, currency FROM invoices
           WHERE contact_id = ? AND status NOT IN ('paid', 'cancelled') ORDER BY created_at DESC LIMIT 1`,
        )
        .bind(contact.id)
        .first<{ id: string; invoice_number: string; balance_due: number | null; total: number; currency: string | null }>();
      if (invoice) {
        // A payment written in another currency than the invoice's is offered with a warning, at low confidence.
        const mismatch = otherCurrencyNote(e, e.paymentAmount, invoice.currency || loc.currency);
        proposals.push({
          ...where,
          entityType: 'invoice',
          entityId: invoice.id,
          action: 'record_payment',
          title: mismatch
            ? `Check before recording: ${e.currency} ${e.paymentAmount} from ${sender} on ${invoice.invoice_number}`
            : `Record ${inr(e.paymentAmount)} from ${sender} on ${invoice.invoice_number}`,
          reason: mismatch
            ? `Warning: ${mismatch}. Check the amount before recording it.`
            : e.paymentReference ? `Reference ${e.paymentReference} in the message` : 'The customer says they have paid',
          params: {
            invoiceId: invoice.id,
            amount: e.paymentAmount,
            method: 'transfer',
            reference: e.paymentReference,
            notes: 'Recorded from the customer\'s message by the assistant',
          },
          dedupeKey: `payment:${message.id}`,
          confidence: mismatch ? 0.3 : e.paymentReference ? 0.85 : 0.6,
        });
      }
    }

    if (contact && analysis.draftReply && !contact.opted_out) {
      const channel = replyChannel(message.channel, contact);
      if (channel) {
        proposals.push({
          ...where,
          action: 'draft_reply',
          title: `Reply to ${contact.name}`,
          reason: analysis.source === 'ai' ? 'Drafted from the message' : 'Standard acknowledgement',
          params: { contactId: contact.id, leadId: lead?.id ?? null, channel, subject: channel === 'email' ? `Re: ${message.subject ?? 'your enquiry'}` : null, body: analysis.draftReply },
          dedupeKey: `reply:${message.id}`,
        });
      }
    }

    return proposals;
  },
};

const replyAfterCapture: Recipe = {
  key: 'inbox.reply_after_capture',
  area: 'Inbox',
  title: 'Draft the first reply to a new enquiry',
  description: 'Once an enquiry from an unknown sender becomes a contact and lead, offers the drafted acknowledgement to send.',
  triggers: ['lead.created'],
  defaultMode: 'suggest',
  autoEligible: false,
  async evaluate(ctx, event) {
    const messageIds = Array.isArray(event.payload.sourceMessageIds) ? (event.payload.sourceMessageIds as string[]) : [];
    if (messageIds.length === 0) return [];
    const lead = await loadLead(ctx, event.entityId);
    const contact = await loadContact(ctx, lead?.contact_id);
    if (!lead || !contact || contact.opted_out) return [];

    const message = await ctx.db
      .prepare(
        `SELECT m.id, m.channel, m.subject, a.draft_reply FROM message_log m
         JOIN assistant_message_analysis a ON a.message_id = m.id
         WHERE m.id IN (${messageIds.map(() => '?').join(', ')}) AND a.draft_reply IS NOT NULL
         ORDER BY m.created_at DESC LIMIT 1`,
      )
      .bind(...messageIds)
      .first<{ id: string; channel: string; subject: string | null; draft_reply: string }>();
    if (!message) return [];
    const channel = replyChannel(message.channel, contact);
    if (!channel) return [];

    // The draft was written before we knew the name; greet the contact properly.
    const body = message.draft_reply.replace(/^Hi there,/, `Hi ${contact.name.split(' ')[0]},`);
    return [{
      action: 'draft_reply',
      title: `Reply to ${contact.name}`,
      reason: 'Acknowledge the enquiry while you prepare the plan',
      params: { contactId: contact.id, leadId: lead.id, channel, subject: channel === 'email' ? `Re: ${message.subject ?? 'your enquiry'}` : null, body },
      entityType: 'lead',
      entityId: lead.id,
      contactId: contact.id,
      leadId: lead.id,
      dedupeKey: `reply:${message.id}`,
      sourceType: 'message',
      sourceId: message.id,
    }];
  },
};

// ── Leads ────────────────────────────────────────────────────

const firstFollowUp: Recipe = {
  key: 'leads.first_follow_up',
  area: 'Leads',
  title: 'Schedule the first follow-up on every new lead',
  description: 'Adds a follow-up a set number of hours after a lead is created, so no enquiry is left without a next step.',
  triggers: ['lead.created'],
  defaultMode: 'auto',
  autoEligible: true,
  settings: [{ key: 'hours', label: 'Follow up after', type: 'number', default: 24, min: 1, max: 168, unit: 'hours' }],
  async evaluate(ctx, event) {
    const lead = await loadLead(ctx, event.entityId);
    if (!lead) return [];
    const existing = await ctx.db.prepare(`SELECT id FROM follow_ups WHERE lead_id = ? LIMIT 1`).bind(lead.id).first();
    if (existing) return [];
    const type = lead.source === 'whatsapp' ? 'whatsapp' : lead.source === 'email' ? 'email' : 'call';
    return [{
      action: 'create_follow_up',
      title: `Follow up on "${lead.title}"`,
      reason: `New lead: first follow-up in ${ctx.settings.hours} hours`,
      params: {
        leadId: lead.id,
        scheduledAt: new Date(Date.now() + ctx.settings.hours * 3600_000).toISOString(),
        type,
        notes: 'First follow-up on the new enquiry (scheduled automatically)',
      },
      entityType: 'lead',
      entityId: lead.id,
      contactId: lead.contact_id,
      leadId: lead.id,
      assignedTo: lead.assigned_to,
      dedupeKey: `first-follow-up:${lead.id}`,
    }];
  },
};

const suggestTemplate: Recipe = {
  key: 'itineraries.suggest_template',
  area: 'Itineraries',
  title: 'Suggest the best-matching itinerary template',
  description: 'Compares a new lead\'s destinations, trip length and trip type with your templates and offers to build the itinerary from the closest one.',
  triggers: ['lead.created'],
  defaultMode: 'suggest',
  autoEligible: false,
  async evaluate(ctx, event) {
    const lead = await loadLead(ctx, event.entityId);
    if (!lead) return [];
    const destinations = parseDestinations(lead.destination).map((d) => d.toLowerCase());
    if (destinations.length === 0) return [];
    const already = await ctx.db.prepare('SELECT id FROM itineraries WHERE lead_id = ? AND COALESCE(is_deleted, 0) = 0 LIMIT 1').bind(lead.id).first();
    if (already) return [];

    const nights = lead.travel_date && lead.return_date
      ? Math.round((Date.parse(lead.return_date.slice(0, 10)) - Date.parse(lead.travel_date.slice(0, 10))) / 86_400_000)
      : null;

    const templates = await ctx.db
      .prepare('SELECT id, title, description, destination, duration_days, category, template_data FROM itinerary_templates LIMIT 300')
      .all<{ id: string; title: string; description: string | null; destination: string | null; duration_days: number | null; category: string | null; template_data: string | null }>();

    let best: { id: string; title: string; score: number; why: string[] } | null = null;
    for (const template of templates.results) {
      const haystack = `${template.destination ?? ''} ${template.title} ${template.description ?? ''} ${template.template_data ?? ''}`.toLowerCase();
      const matched = destinations.filter((d) => haystack.includes(d));
      if (matched.length === 0) continue;
      const why = [`covers ${matched.length} of ${destinations.length} destination${destinations.length === 1 ? '' : 's'}`];
      let score = matched.length * 3;
      if (nights !== null && template.duration_days !== null) {
        const gap = Math.abs(template.duration_days - (nights + 1));
        if (gap === 0) { score += 3; why.push(`${nights} nights`); }
        else if (gap === 1) score += 1;
      }
      if (template.category && lead.trip_type && template.category === lead.trip_type) { score += 1; why.push(`${lead.trip_type} trip`); }
      if (!best || score > best.score) best = { id: template.id, title: template.title, score, why };
    }
    if (!best) return [];

    const contact = await loadContact(ctx, lead.contact_id);
    // R149: the children's ages the message reader found, so the one-click quote already has the band quantities.
    const messageIds = Array.isArray(event.payload.sourceMessageIds) ? (event.payload.sourceMessageIds as string[]) : undefined;
    const ages = await childAgesFromMessages(ctx.db, lead.id, lead.contact_id, messageIds);
    const adults = lead.pax_adults ?? 1;
    const party = ages.length > 0 ? { adults, ages } : {};
    const partyNote = ages.length > 0 ? `${adults} adult${adults === 1 ? '' : 's'}, ${ages.length === 1 ? 'child' : 'children'} ${joinAgesText(ages)}` : null;
    return [{
      action: 'create_itinerary_from_template',
      title: `Build the itinerary from "${best.title}"`,
      reason: `Closest template: ${[...best.why, ...(partyNote ? [partyNote] : [])].join(', ')}`,
      params: { templateId: best.id, leadId: lead.id, title: `${contact?.name ?? lead.title}: ${best.title}`.slice(0, 200), ...party },
      entityType: 'lead',
      entityId: lead.id,
      contactId: lead.contact_id,
      leadId: lead.id,
      assignedTo: lead.assigned_to,
      dedupeKey: `template:${lead.id}`,
    }];
  },
};

/** Which lead was a quote sent for: the message is on a lead, or it carries one of our share links. */
async function quoteSentLead(ctx: RecipeContext, event: DomainEvent): Promise<LeadRow | null> {
  if (event.type === 'itinerary.sent') {
    const row = await ctx.db.prepare('SELECT lead_id FROM itineraries WHERE id = ?').bind(event.entityId).first<{ lead_id: string }>();
    return loadLead(ctx, row?.lead_id);
  }
  const message = await ctx.db
    .prepare(`SELECT content, lead_id, contact_id FROM message_log WHERE id = ? AND COALESCE(direction, 'outgoing') = 'outgoing'`)
    .bind(event.entityId)
    .first<{ content: string | null; lead_id: string | null; contact_id: string | null }>();
  const token = message?.content?.match(/\/q\/([0-9a-zA-Z-]{8,})/)?.[1];
  if (!token) return null;
  const itinerary = await ctx.db.prepare('SELECT lead_id FROM itineraries WHERE share_token = ? AND COALESCE(is_deleted, 0) = 0').bind(token).first<{ lead_id: string }>();
  return loadLead(ctx, itinerary?.lead_id);
}

const quoteSentStatus: Recipe = {
  key: 'leads.quote_sent_status',
  area: 'Leads',
  title: 'Move the lead to Proposal Sent when the quote goes out',
  description: 'When a message carrying the itinerary share link is sent to the customer, the lead moves to Proposal Sent.',
  triggers: ['message.sent', 'itinerary.sent'],
  defaultMode: 'auto',
  autoEligible: true,
  async evaluate(ctx, event) {
    const lead = await quoteSentLead(ctx, event);
    if (!lead || !/^(new|contacted|qualified|requirement_gathered)$/.test(lead.status)) return [];
    return [{
      action: 'advance_lead_status',
      title: `Move "${lead.title}" to Proposal Sent`,
      reason: 'The quote was sent to the customer',
      params: { leadId: lead.id, status: 'proposal_sent' },
      entityType: 'lead',
      entityId: lead.id,
      contactId: lead.contact_id,
      leadId: lead.id,
      assignedTo: lead.assigned_to,
      dedupeKey: `proposal-sent:${lead.id}`,
    }];
  },
};

const followUpAfterQuote: Recipe = {
  key: 'leads.follow_up_after_quote',
  area: 'Leads',
  title: 'Follow up after sending a quote',
  description: 'Schedules a follow-up a set number of days after the quote is sent.',
  triggers: ['message.sent', 'itinerary.sent'],
  defaultMode: 'auto',
  autoEligible: true,
  settings: [{ key: 'days', label: 'Follow up after', type: 'number', default: 2, min: 1, max: 30, unit: 'days' }],
  async evaluate(ctx, event) {
    const lead = await quoteSentLead(ctx, event);
    if (!lead) return [];
    return [{
      action: 'create_follow_up',
      title: `Check whether ${lead.title} reviewed the quote`,
      reason: `Quote sent: follow up in ${ctx.settings.days} days`,
      params: {
        leadId: lead.id,
        scheduledAt: new Date(Date.now() + ctx.settings.days * 86_400_000).toISOString(),
        type: lead.source === 'email' ? 'email' : 'whatsapp',
        notes: 'Ask whether the quote was reviewed and if anything should change (scheduled automatically)',
      },
      entityType: 'lead',
      entityId: lead.id,
      contactId: lead.contact_id,
      leadId: lead.id,
      assignedTo: lead.assigned_to,
      dedupeKey: `quote-follow-up:${lead.id}`,
    }];
  },
};

// ── Quote to cash ────────────────────────────────────────────

async function latestItinerary(ctx: RecipeContext, leadId: string) {
  return ctx.db
    .prepare('SELECT id, title, grand_total FROM itineraries WHERE lead_id = ? AND COALESCE(is_deleted, 0) = 0 ORDER BY version DESC, created_at DESC LIMIT 1')
    .bind(leadId)
    .first<{ id: string; title: string; grand_total: number | null }>();
}

const invoiceOnWon: Recipe = {
  key: 'invoices.from_confirmed_booking',
  area: 'Invoices',
  title: 'Offer the invoice when a booking is confirmed',
  description: 'When a lead is won and has an itinerary but no invoice, offers to create the invoice from the itinerary.',
  triggers: ['lead.status_changed'],
  defaultMode: 'suggest',
  autoEligible: false,
  async evaluate(ctx, event) {
    const inr = await moneyFmt(ctx);
    if (event.payload.to !== 'won') return [];
    const lead = await loadLead(ctx, event.entityId);
    if (!lead) return [];
    const itinerary = await latestItinerary(ctx, lead.id);
    if (!itinerary) return [];
    const invoice = await ctx.db.prepare(`SELECT id FROM invoices WHERE lead_id = ? AND status != 'cancelled' LIMIT 1`).bind(lead.id).first();
    if (invoice) return [];
    return [{
      action: 'create_invoice_from_itinerary',
      title: `Create the invoice for "${lead.title}"`,
      reason: `From the itinerary "${itinerary.title}"${itinerary.grand_total ? `, ${inr(itinerary.grand_total)}` : ''}`,
      params: { itineraryId: itinerary.id },
      entityType: 'lead',
      entityId: lead.id,
      contactId: lead.contact_id,
      leadId: lead.id,
      dedupeKey: `invoice:${lead.id}`,
    }];
  },
};

const bookingChecklist: Recipe = {
  key: 'tasks.booking_checklist',
  area: 'Tasks',
  title: 'Create the booking checklist when a lead is won',
  description: 'Adds the standard tasks for a confirmed booking: vouchers, traveller documents, transfers and the balance payment.',
  triggers: ['lead.status_changed'],
  defaultMode: 'auto',
  autoEligible: true,
  async evaluate(ctx, event) {
    if (event.payload.to !== 'won') return [];
    const lead = await loadLead(ctx, event.entityId);
    if (!lead) return [];
    const day = await today(ctx);
    // The balance is chased three weeks before travel, or in a week when that has already passed.
    const balanceDue = lead.travel_date && addDaysLocal(lead.travel_date.slice(0, 10), -21) > day ? addDaysLocal(lead.travel_date.slice(0, 10), -21) : addDaysLocal(day, 7);
    const steps: Array<{ key: string; title: string; due: string; priority: 'high' | 'medium' }> = [
      { key: 'vouchers', title: 'Send hotel and transport vouchers', due: addDaysLocal(day, 2), priority: 'high' },
      { key: 'documents', title: 'Collect traveller names and ID documents', due: addDaysLocal(day, 3), priority: 'medium' },
      { key: 'transfers', title: 'Arrange airport transfers and vehicle', due: addDaysLocal(day, 5), priority: 'medium' },
      { key: 'balance', title: 'Collect the balance payment', due: balanceDue, priority: 'high' },
    ];
    return steps.map((step) => ({
      action: 'create_task',
      title: step.title,
      reason: `Booking confirmed: ${lead.title}`,
      params: { title: `${step.title}: ${lead.title}`.slice(0, 200), dueDate: step.due, priority: step.priority, assignedTo: lead.assigned_to, relatedLeadId: lead.id },
      entityType: 'lead',
      entityId: lead.id,
      contactId: lead.contact_id,
      leadId: lead.id,
      assignedTo: lead.assigned_to,
      dedupeKey: `checklist:${lead.id}:${step.key}`,
    }));
  },
};

const paymentFromMessage: Recipe = {
  key: 'payments.from_message',
  area: 'Payments',
  title: 'Match a payment the customer already told you about',
  description: 'When an invoice is created and the customer recently wrote that they paid, offers to record that payment against it.',
  triggers: ['invoice.created'],
  defaultMode: 'suggest',
  autoEligible: false,
  async evaluate(ctx, event) {
    const inr = await moneyFmt(ctx);
    const invoice = await ctx.db
      .prepare(`SELECT id, invoice_number, contact_id, lead_id, total, paid_amount, currency FROM invoices WHERE id = ? AND status NOT IN ('paid', 'cancelled')`)
      .bind(event.entityId)
      .first<{ id: string; invoice_number: string; contact_id: string; lead_id: string | null; total: number; paid_amount: number | null; currency: string | null }>();
    if (!invoice) return [];
    const recent = await ctx.db
      .prepare(
        `SELECT m.id, a.entities FROM message_log m JOIN assistant_message_analysis a ON a.message_id = m.id
         WHERE m.contact_id = ? AND m.direction = 'incoming' AND a.entities LIKE '%"paymentAmount"%'
           AND m.created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')
         ORDER BY m.created_at DESC LIMIT 1`,
      )
      .bind(invoice.contact_id)
      .first<{ id: string; entities: string | null }>();
    if (!recent?.entities) return [];
    let entities: MessageEntities;
    try {
      entities = JSON.parse(recent.entities);
    } catch {
      return [];
    }
    if (!entities.paymentAmount) return [];
    // In another currency than the invoice the amount cannot be compared with the total: the payment is still offered,
    // with a warning, and is never applied by itself (recording a payment always waits for a click).
    const invoiceCurrency = invoice.currency || (await loadLocaleContext(ctx.db)).currency;
    const mismatch = otherCurrencyNote(entities, entities.paymentAmount, invoiceCurrency);
    if (!mismatch && entities.paymentAmount > invoice.total) return [];
    const contact = await loadContact(ctx, invoice.contact_id);
    return [{
      action: 'record_payment',
      title: mismatch
        ? `Check before recording: ${entities.currency} ${entities.paymentAmount} from ${contact?.name ?? 'the customer'} on ${invoice.invoice_number}`
        : `Record ${inr(entities.paymentAmount)} from ${contact?.name ?? 'the customer'} on ${invoice.invoice_number}`,
      reason: mismatch
        ? `Warning: ${mismatch}. Check the amount before recording it.`
        : entities.paymentReference ? `Reference ${entities.paymentReference} in their message` : 'The customer wrote that they have paid',
      params: { invoiceId: invoice.id, amount: entities.paymentAmount, method: 'transfer', reference: entities.paymentReference, notes: 'Recorded from the customer\'s message by the assistant' },
      entityType: 'invoice',
      entityId: invoice.id,
      contactId: invoice.contact_id,
      leadId: invoice.lead_id,
      dedupeKey: `payment:${recent.id}`,
      sourceType: 'message',
      sourceId: recent.id,
      ...(mismatch ? { confidence: 0.3 } : {}),
    }];
  },
};

function parseHotelItem(title: string): { hotelName: string; roomType: string; mealPlan: 'EP' | 'CP' | 'MAP' | 'AP' | 'AI' } {
  const [name, rest = ''] = title.split(/\s+[—–-]\s+/, 2);
  const meal = title.match(/\((EP|CP|MAP|AP|AI)\)/i)?.[1]?.toUpperCase() as 'EP' | 'CP' | 'MAP' | 'AP' | 'AI' | undefined;
  const room = rest.replace(/\(.*?\)/g, '').split(',')[0].trim();
  return { hotelName: name.trim(), roomType: room || 'As per itinerary', mealPlan: meal ?? 'EP' };
}

const vouchersAfterPayment: Recipe = {
  key: 'vouchers.after_payment',
  area: 'Vouchers',
  title: 'Draft hotel vouchers once the advance is in',
  description: 'After a payment is recorded on a booking, drafts one voucher per hotel stay in the itinerary, with dates worked out from the travel date.',
  triggers: ['payment.recorded'],
  defaultMode: 'suggest',
  autoEligible: false,
  async evaluate(ctx, event) {
    const lead = await loadLead(ctx, event.payload.leadId as string | undefined);
    if (!lead || !lead.travel_date) return [];
    const existing = await ctx.db.prepare('SELECT id FROM vouchers WHERE lead_id = ? LIMIT 1').bind(lead.id).first();
    if (existing) return [];
    const itinerary = await latestItinerary(ctx, lead.id);
    if (!itinerary) return [];
    const contact = await loadContact(ctx, lead.contact_id);

    const items = await ctx.db
      .prepare(
        `SELECT i.title, i.quantity, i.supplier_id, d.day_number FROM itinerary_items i
         JOIN itinerary_days d ON d.id = i.day_id
         WHERE d.itinerary_id = ? AND i.type = 'hotel' ORDER BY d.day_number, i.sort_order`,
      )
      .bind(itinerary.id)
      .all<{ title: string; quantity: number | null; supplier_id: string | null; day_number: number }>();
    if (items.results.length === 0) return [];

    const start = lead.travel_date.slice(0, 10);
    const vouchers = items.results.map((item) => {
      const hotel = parseHotelItem(item.title);
      const checkIn = addDaysLocal(start, item.day_number - 1);
      return {
        type: 'hotel' as const,
        title: `${hotel.hotelName}: ${contact?.name ?? lead.title}`.slice(0, 200),
        supplierId: item.supplier_id,
        details: {
          guestNames: [contact?.name ?? 'Guest'],
          hotelName: hotel.hotelName,
          checkIn,
          checkOut: addDaysLocal(checkIn, Math.max(1, item.quantity ?? 1)),
          roomType: hotel.roomType,
          roomCount: 1,
          mealPlan: hotel.mealPlan,
        },
      };
    });

    return [{
      action: 'create_vouchers',
      title: `Draft ${vouchers.length} hotel voucher${vouchers.length === 1 ? '' : 's'} for "${lead.title}"`,
      reason: `Advance received: ${vouchers.map((v) => v.details.hotelName).join(', ')}`,
      params: { leadId: lead.id, vouchers },
      entityType: 'lead',
      entityId: lead.id,
      contactId: lead.contact_id,
      leadId: lead.id,
      dedupeKey: `vouchers:${lead.id}`,
    }];
  },
};

const wonOnPayment: Recipe = {
  key: 'leads.won_on_payment',
  area: 'Leads',
  title: 'Offer to mark the lead won when the advance arrives',
  description: 'A payment recorded on a lead that is still open is a strong sign the booking is confirmed.',
  triggers: ['payment.recorded'],
  defaultMode: 'suggest',
  autoEligible: false,
  async evaluate(ctx, event) {
    const inr = await moneyFmt(ctx);
    const lead = await loadLead(ctx, event.payload.leadId as string | undefined);
    if (!lead || !/^(new|contacted|qualified|requirement_gathered|proposal_sent|negotiation)$/.test(lead.status)) return [];
    return [{
      action: 'mark_lead_won',
      title: `Payment received: mark "${lead.title}" as won`,
      reason: `${inr(Number(event.payload.amount) || 0)} recorded on this booking`,
      params: { leadId: lead.id },
      entityType: 'lead',
      entityId: lead.id,
      contactId: lead.contact_id,
      leadId: lead.id,
      dedupeKey: `won:${lead.id}`,
    }];
  },
};

// ── Scheduled ────────────────────────────────────────────────

const staleQuoteNudge: Recipe = {
  key: 'leads.stale_quote_nudge',
  area: 'Leads',
  title: 'Nudge customers who have gone quiet on a quote',
  description: 'For leads in Proposal Sent with no message either way for a set number of days, drafts a polite check-in to send.',
  triggers: ['schedule.tick'],
  defaultMode: 'suggest',
  autoEligible: false,
  settings: [{ key: 'days', label: 'Quiet for', type: 'number', default: 3, min: 1, max: 60, unit: 'days' }],
  async evaluate(ctx) {
    const cutoff = new Date(Date.now() - ctx.settings.days * 86_400_000).toISOString();
    const leads = await ctx.db
      .prepare(
        `SELECT l.id, l.title, l.contact_id, l.assigned_to, l.source FROM leads l
         WHERE l.status = 'proposal_sent' AND COALESCE(l.is_deleted, 0) = 0 AND l.updated_at < ?
           AND NOT EXISTS (SELECT 1 FROM message_log m WHERE m.lead_id = l.id AND m.created_at >= ?)
         ORDER BY l.updated_at LIMIT 25`,
      )
      .bind(cutoff, cutoff)
      .all<{ id: string; title: string; contact_id: string; assigned_to: string | null; source: string | null }>();

    const company = await companyName(ctx);
    const week = (await today(ctx)).slice(0, 8) + String(Math.ceil(Number((await today(ctx)).slice(8)) / 7));
    const proposals: Proposal[] = [];
    for (const lead of leads.results) {
      const contact = await loadContact(ctx, lead.contact_id);
      if (!contact || contact.opted_out) continue;
      const channel = replyChannel(lead.source ?? 'whatsapp', contact);
      if (!channel) continue;
      proposals.push({
        action: 'draft_reply',
        title: `Check in with ${contact.name} about the quote`,
        reason: `No reply for ${ctx.settings.days} days since the proposal`,
        params: {
          contactId: contact.id,
          leadId: lead.id,
          channel,
          subject: channel === 'email' ? `Your plan: ${lead.title}` : null,
          body: `Hi ${contact.name.split(' ')[0]},\n\nJust checking whether you had a chance to look at the plan I shared. Happy to adjust dates, hotels or budget if anything does not fit.${company ? `\n\nWarm regards,\n${company}` : ''}`,
        },
        entityType: 'lead',
        entityId: lead.id,
        contactId: contact.id,
        leadId: lead.id,
        assignedTo: lead.assigned_to,
        // At most one nudge per lead per week.
        dedupeKey: `nudge:${lead.id}:${week}`,
      });
    }
    return proposals;
  },
};

const overdueInvoiceReminder: Recipe = {
  key: 'invoices.overdue_reminder',
  area: 'Invoices',
  title: 'Draft a reminder for overdue invoices',
  description: 'For invoices past their due date with a balance outstanding, drafts a payment reminder for you to review and send.',
  triggers: ['schedule.tick'],
  defaultMode: 'suggest',
  autoEligible: false,
  settings: [{ key: 'days', label: 'Overdue by at least', type: 'number', default: 1, min: 1, max: 90, unit: 'days' }],
  async evaluate(ctx) {
    const inr = await moneyFmt(ctx);
    const day = await today(ctx);
    const cutoff = addDaysLocal(day, -ctx.settings.days);
    const invoices = await ctx.db
      .prepare(
        `SELECT id, invoice_number, contact_id, lead_id, total, balance_due, due_date FROM invoices
         WHERE status IN ('sent', 'partially_paid', 'overdue') AND due_date IS NOT NULL AND due_date <= ?
         ORDER BY due_date LIMIT 25`,
      )
      .bind(cutoff)
      .all<{ id: string; invoice_number: string; contact_id: string; lead_id: string | null; total: number; balance_due: number | null; due_date: string }>();

    const company = await companyName(ctx);
    const week = day.slice(0, 8) + String(Math.ceil(Number(day.slice(8)) / 7));
    const proposals: Proposal[] = [];
    for (const invoice of invoices.results) {
      const contact = await loadContact(ctx, invoice.contact_id);
      if (!contact || contact.opted_out) continue;
      const channel = replyChannel('whatsapp', contact);
      if (!channel) continue;
      const due = invoice.balance_due && invoice.balance_due > 0 ? invoice.balance_due : invoice.total;
      proposals.push({
        action: 'draft_reply',
        title: `Remind ${contact.name} about ${invoice.invoice_number}`,
        reason: `${inr(due)} was due on ${shortDate(invoice.due_date)}`,
        params: {
          contactId: contact.id,
          leadId: invoice.lead_id,
          channel,
          subject: channel === 'email' ? `Payment reminder: ${invoice.invoice_number}` : null,
          body: `Hi ${contact.name.split(' ')[0]},\n\nA gentle reminder that ${inr(due)} on invoice ${invoice.invoice_number} was due on ${shortDate(invoice.due_date)}. Please let me know once it is paid, or if you would like the payment details again.${company ? `\n\nWarm regards,\n${company}` : ''}`,
        },
        entityType: 'invoice',
        entityId: invoice.id,
        contactId: contact.id,
        leadId: invoice.lead_id,
        dedupeKey: `overdue:${invoice.id}:${week}`,
      });
    }
    return proposals;
  },
};

// ── Calls and trips ──────────────────────────────────────────

const missedCallCallback: Recipe = {
  key: 'calls.missed_callback',
  area: 'Calls',
  title: 'Create a call-back task for every missed call',
  description: 'A missed call becomes a high-priority task for the person the call was routed to.',
  triggers: ['call.missed'],
  defaultMode: 'auto',
  autoEligible: true,
  async evaluate(ctx, event) {
    const contact = await loadContact(ctx, event.payload.contactId as string | undefined);
    const who = contact?.name ?? String(event.payload.from ?? 'unknown number');
    return [{
      action: 'create_task',
      title: `Call back ${who}`,
      reason: 'Missed call',
      params: {
        title: `Call back ${who}`,
        description: `Missed call from ${String(event.payload.from ?? who)}.`,
        dueDate: await today(ctx),
        priority: 'high',
        assignedTo: (event.payload.routedTo as string | null) ?? null,
        relatedLeadId: (event.payload.leadId as string | null) ?? null,
      },
      entityType: contact ? 'contact' : 'call',
      entityId: contact ? contact.id : event.entityId,
      contactId: contact?.id ?? null,
      leadId: (event.payload.leadId as string | null) ?? null,
      assignedTo: (event.payload.routedTo as string | null) ?? null,
      dedupeKey: `callback:${event.entityId}`,
    }];
  },
};

const leadFromMissedCall: Recipe = {
  key: 'calls.lead_from_missed_call',
  area: 'Calls',
  title: 'Offer a lead when an unknown number calls and nobody answers',
  description: 'A missed call from a number that is not in your contacts becomes a one-click suggestion to create the contact and a lead. Follows the "lead from missed call" switch in the call settings.',
  triggers: ['call.missed'],
  defaultMode: 'suggest',
  autoEligible: false,
  async evaluate(ctx, event) {
    const from = typeof event.payload.from === 'string' ? event.payload.from.trim() : '';
    if (!from || event.payload.contactId || event.payload.leadId || event.payload.offerLead === false) return [];
    // The number may belong to a contact the call log did not match.
    const { findContactByIdentity } = await import('../domain/contacts');
    if (await findContactByIdentity(ctx.db, { phone: from })) return [];
    return [{
      action: 'create_lead_from_enquiry',
      title: `Create contact and lead for missed caller ${from}`,
      reason: 'Missed call from a number that is not in your contacts',
      params: { phone: from, title: `Missed call from ${from}`, source: 'missed_call' },
      entityType: 'call',
      entityId: event.entityId,
      assignedTo: (event.payload.routedTo as string | null) ?? null,
      // One suggestion per number per day, however often they ring.
      dedupeKey: `missed-lead:${from.replace(/\D/g, '').slice(-10)}:${await today(ctx)}`,
    }];
  },
};

// ── Call lifecycle recipes (R303) ────────────────────────────
// All rule-based (0 credits). Nothing here places a call. Anything the customer would see stays a suggestion.

/** Minutes since local midnight for "HH:MM" ("24:00" allowed as an end); null when unreadable. */
function clockMinutes(value: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value ?? '').trim());
  if (!m) return null;
  const total = Number(m[1]) * 60 + Number(m[2]);
  return total >= 0 && total <= 1440 ? total : null;
}

async function settingText(ctx: RecipeContext, key: string): Promise<string | null> {
  const row = await ctx.db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string | null }>();
  if (!row?.value) return null;
  try {
    const parsed = JSON.parse(row.value);
    return typeof parsed === 'string' ? parsed : row.value;
  } catch {
    return row.value;
  }
}

/**
 * Customer quiet hours (settings `customer_quiet_start` / `customer_quiet_end`, default 21:00 to 09:00 in the agency's time
 * zone). Inside them a message suggestion is still created, but carries the moment it may go out; null when it may go now.
 */
async function quietHoursSendAfter(ctx: RecipeContext, now: Date = new Date()): Promise<string | null> {
  const start = clockMinutes(await settingText(ctx, 'customer_quiet_start')) ?? 21 * 60;
  const end = clockMinutes(await settingText(ctx, 'customer_quiet_end')) ?? 9 * 60;
  if (start === end) return null;
  const tz = await getTenantTimeZone(ctx.db);
  const clock = localClock(tz, now);
  const minute = clock.hour * 60 + clock.minute;
  const inside = start < end ? minute >= start && minute < end : minute >= start || minute < end;
  if (!inside) return null;
  // The next time the clock reads `end`: today when it is still ahead, else tomorrow.
  const day = end > minute ? clock.date : addDaysLocal(clock.date, 1);
  const endOfDay = end >= 1440;
  const base = localDateStartUtcIso(tz, endOfDay ? addDaysLocal(day, 1) : day);
  const at = new Date(new Date(base).getTime() + (endOfDay ? 0 : end) * 60000);
  return at.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function numericPayload(event: DomainEvent, key: string): number {
  const v = Number(event.payload[key]);
  return Number.isFinite(v) ? v : 0;
}

const missedAcknowledgement: Recipe = {
  key: 'calls.missed_acknowledgement',
  area: 'Calls',
  title: 'Draft a "sorry we missed your call" message',
  description: 'After a missed call from a known contact, drafts a short WhatsApp or SMS for you to send. Skipped for contacts who opted out or asked not to be disturbed. During the customer quiet hours the draft waits until they end.',
  triggers: ['call.missed'],
  defaultMode: 'suggest',
  autoEligible: false,
  async evaluate(ctx, event) {
    const contact = await loadContact(ctx, event.payload.contactId as string | undefined);
    if (!contact || contact.opted_out || contact.dnd_enabled || !contact.phone) return [];
    const channel = replyChannel('whatsapp', contact);
    if (!channel || channel === 'email') return [];
    const company = await companyName(ctx);
    const sendAfter = await quietHoursSendAfter(ctx);
    return [{
      action: 'draft_reply',
      title: `Tell ${contact.name} we will ring back`,
      reason: sendAfter ? 'Missed call; it is quiet hours for the customer, so this waits until they end' : 'Missed call',
      params: {
        contactId: contact.id,
        leadId: (event.payload.leadId as string | null) ?? null,
        channel,
        subject: null,
        body: `Hi ${contact.name.split(' ')[0]},\n\nSorry we missed your call. We will ring you back shortly.${company ? `\n\nWarm regards,\n${company}` : ''}`,
        sendAfter,
      },
      entityType: 'contact',
      entityId: contact.id,
      contactId: contact.id,
      leadId: (event.payload.leadId as string | null) ?? null,
      assignedTo: (event.payload.routedTo as string | null) ?? null,
      dedupeKey: `missed-ack:${event.entityId}`,
    }];
  },
};

const voicemailTask: Recipe = {
  key: 'calls.voicemail_task',
  area: 'Calls',
  title: 'Create a task to listen to every voicemail',
  description: 'A voicemail becomes a task for the person the call was routed to, and replaces the call-back task for the same call so there is one task, not two.',
  triggers: ['call.voicemail_left'],
  defaultMode: 'auto',
  autoEligible: true,
  async evaluate(ctx, event) {
    const contact = await loadContact(ctx, event.payload.contactId as string | undefined);
    const from = String(event.payload.from ?? 'unknown number');
    const who = contact?.name ?? from;
    const recording = typeof event.payload.recordingUrl === 'string' ? event.payload.recordingUrl : null;
    const seconds = numericPayload(event, 'durationSeconds');
    const routedTo = (event.payload.routedTo as string | null) ?? null;
    return [{
      action: 'create_task',
      title: `Listen to voicemail from ${who}`,
      reason: 'Voicemail left',
      params: {
        title: `Listen to voicemail from ${who}`,
        description: `Voicemail from ${from}${seconds ? `, ${seconds} s` : ''}.${recording ? ` Recording: ${recording}` : ''}`,
        dueDate: await today(ctx),
        priority: 'high',
        assignedTo: routedTo,
        relatedLeadId: (event.payload.leadId as string | null) ?? null,
        supersedes: `callback:${event.entityId}`,
      },
      entityType: contact ? 'contact' : 'call',
      entityId: contact ? contact.id : event.entityId,
      contactId: contact?.id ?? null,
      leadId: (event.payload.leadId as string | null) ?? null,
      assignedTo: routedTo,
      dedupeKey: `voicemail:${event.entityId}`,
    }];
  },
};

const logCallToTimeline: Recipe = {
  key: 'calls.log_to_timeline',
  area: 'Calls',
  title: 'Put every finished call on the contact and lead timeline',
  description: 'One entry with direction, duration, agent and note, on the contact and on the lead.',
  triggers: ['call.ended'],
  defaultMode: 'auto',
  autoEligible: true,
  async evaluate(ctx, event) {
    const contactId = (event.payload.contactId as string | null) ?? null;
    const leadId = (event.payload.leadId as string | null) ?? null;
    if (!contactId && !leadId) return [];
    return [{
      action: 'log_call_activity',
      title: 'Log the call on the timeline',
      reason: 'Call ended',
      params: {
        callId: event.entityId,
        contactId,
        leadId,
        direction: event.payload.direction === 'outbound' ? 'outbound' : 'inbound',
        result: String(event.payload.result ?? 'completed'),
        durationSeconds: Math.max(0, Math.floor(numericPayload(event, 'durationSeconds'))),
        agentId: (event.payload.agentId as string | null) ?? null,
      },
      entityType: leadId ? 'lead' : 'contact',
      entityId: (leadId ?? contactId) as string,
      contactId,
      leadId,
      dedupeKey: `call-timeline:${event.entityId}`,
    }];
  },
};

const contactedOnCall: Recipe = {
  key: 'leads.contacted_on_call',
  area: 'Leads',
  title: 'Mark a new lead Contacted after a real conversation',
  description: 'A lead still marked New moves to Contacted after a connected call of at least the minimum length. Undo is one click.',
  triggers: ['call.ended'],
  defaultMode: 'auto',
  autoEligible: true,
  settings: [{ key: 'minSeconds', label: 'Call at least', type: 'number', default: 30, min: 5, max: 600, unit: 'seconds' }],
  async evaluate(ctx, event) {
    if (event.payload.result !== 'completed') return [];
    if (numericPayload(event, 'durationSeconds') < (ctx.settings.minSeconds ?? 30)) return [];
    const lead = await loadLead(ctx, event.payload.leadId as string | undefined);
    if (!lead || lead.status !== 'new') return [];
    return [{
      action: 'advance_lead_status',
      title: `Mark "${lead.title}" as contacted`,
      reason: `Connected call of ${Math.round(numericPayload(event, 'durationSeconds'))} s`,
      params: { leadId: lead.id, status: 'contacted' },
      entityType: 'lead',
      entityId: lead.id,
      contactId: lead.contact_id,
      leadId: lead.id,
      assignedTo: lead.assigned_to,
      dedupeKey: `contacted-call:${lead.id}`,
    }];
  },
};

const nextStepPrompt: Recipe = {
  key: 'calls.next_step_prompt',
  area: 'Calls',
  title: 'Suggest a follow-up after a connected call',
  description: 'After a call that connected, suggests a follow-up call for tomorrow at 10:00 on the open lead. Change the time or dismiss it.',
  triggers: ['call.ended'],
  defaultMode: 'suggest',
  autoEligible: true,
  async evaluate(ctx, event) {
    if (event.payload.result !== 'completed' || numericPayload(event, 'durationSeconds') < 10) return [];
    const lead = await loadLead(ctx, event.payload.leadId as string | undefined);
    if (!lead || !isOpenStatus(lead.status)) return [];
    const tz = await getTenantTimeZone(ctx.db);
    const tomorrow = addDaysLocal(await today(ctx), 1);
    const at = new Date(new Date(localDateStartUtcIso(tz, tomorrow)).getTime() + 10 * 3600000);
    const contact = await loadContact(ctx, lead.contact_id);
    return [{
      action: 'create_follow_up',
      title: `Schedule a follow-up with ${contact?.name ?? lead.title}?`,
      reason: 'The call connected; set the next step while it is fresh',
      params: { leadId: lead.id, scheduledAt: at.toISOString().replace(/\.\d{3}Z$/, 'Z'), type: 'call', notes: 'Follow-up after call' },
      entityType: 'lead',
      entityId: lead.id,
      contactId: lead.contact_id,
      leadId: lead.id,
      assignedTo: (event.payload.agentId as string | null) ?? lead.assigned_to,
      dedupeKey: `next-step:${event.entityId}`,
    }];
  },
};

function isOpenStatus(status: string): boolean {
  return !['won', 'lost', 'booking_confirmed', 'completed'].includes(status);
}

const leadFromUnknownCaller: Recipe = {
  key: 'calls.lead_from_unknown_caller',
  area: 'Calls',
  title: 'Offer a contact and lead after a call with an unknown number',
  description: 'After a connected call with a number that is not in your contacts, suggests creating the contact and a lead with the phone number filled in.',
  triggers: ['call.ended'],
  defaultMode: 'suggest',
  autoEligible: false,
  async evaluate(ctx, event) {
    if (event.payload.result !== 'completed') return [];
    const number = typeof event.payload.number === 'string' ? event.payload.number.trim() : '';
    if (!number || event.payload.contactId || event.payload.leadId) return [];
    const { findContactByIdentity } = await import('../domain/contacts');
    if (await findContactByIdentity(ctx.db, { phone: number })) return [];
    return [{
      action: 'create_lead_from_enquiry',
      title: `Create contact and lead for ${number}`,
      reason: 'You spoke to a number that is not in your contacts',
      params: { phone: number, title: `Call with ${number}`, source: 'phone_call' },
      entityType: 'call',
      entityId: event.entityId,
      assignedTo: (event.payload.agentId as string | null) ?? null,
      dedupeKey: `call-lead:${number.replace(/\D/g, '').slice(-10)}:${await today(ctx)}`,
    }];
  },
};

const retryTask: Recipe = {
  key: 'calls.retry_task',
  area: 'Calls',
  title: 'Suggest trying again when an outbound call is not answered',
  description: 'When the person you called does not pick up, suggests a task to try again later today. One suggestion per lead per day.',
  triggers: ['call.ended'],
  defaultMode: 'suggest',
  autoEligible: true,
  async evaluate(ctx, event) {
    if (event.payload.direction !== 'outbound' || (event.payload.result !== 'no_answer' && event.payload.result !== 'busy')) return [];
    const lead = await loadLead(ctx, event.payload.leadId as string | undefined);
    if (!lead || !isOpenStatus(lead.status)) return [];
    const contact = await loadContact(ctx, lead.contact_id);
    const who = contact?.name ?? lead.title;
    const day = await today(ctx);
    const agentId = (event.payload.agentId as string | null) ?? lead.assigned_to;
    return [{
      action: 'create_task',
      title: `Try ${who} again`,
      reason: 'Your call was not answered',
      params: {
        title: `Try ${who} again`,
        description: `Outbound call to ${String(event.payload.number ?? who)} was not answered.`,
        dueDate: day,
        priority: 'medium',
        assignedTo: agentId,
        relatedLeadId: lead.id,
      },
      entityType: 'lead',
      entityId: lead.id,
      contactId: lead.contact_id,
      leadId: lead.id,
      assignedTo: agentId,
      dedupeKey: `call-retry:${lead.id}:${day}`,
    }];
  },
};

const tripFeedback: Recipe = {
  key: 'fleet.trip_feedback',
  area: 'Fleet',
  title: 'Ask for feedback when a trip is completed',
  description: 'When the driver marks a trip completed, drafts a thank-you and feedback request for the passenger.',
  triggers: ['trip.completed'],
  defaultMode: 'suggest',
  autoEligible: false,
  async evaluate(ctx, event) {
    const phone = String(event.payload.passengerPhone ?? '');
    if (!phone) return [];
    const { findContactByIdentity } = await import('../domain/contacts');
    const match = await findContactByIdentity(ctx.db, { phone });
    const contact = await loadContact(ctx, match?.id);
    if (!contact || contact.opted_out || !contact.phone) return [];
    const company = await companyName(ctx);
    return [{
      action: 'draft_reply',
      title: `Thank ${contact.name} and ask for feedback`,
      reason: `Trip completed${event.payload.driverName ? ` with ${String(event.payload.driverName)}` : ''}`,
      params: {
        contactId: contact.id,
        leadId: null,
        channel: 'whatsapp',
        subject: null,
        body: `Hi ${contact.name.split(' ')[0]},\n\nWe hope the ride was comfortable. Could you spare a moment to tell us how it went${event.payload.driverName ? ` with ${String(event.payload.driverName)}` : ''}? Your feedback helps us look after you better.${company ? `\n\nWarm regards,\n${company}` : ''}`,
      },
      entityType: 'trip',
      entityId: event.entityId,
      contactId: contact.id,
      dedupeKey: `trip-feedback:${event.entityId}`,
    }];
  },
};

// ── More rule-based recipes ──────────────────────────────────

const contactedOnFirstReply: Recipe = {
  key: 'leads.contacted_on_reply',
  area: 'Leads',
  title: 'Mark a new lead Contacted when you first reply',
  description: 'The first message sent on a new lead moves it from New to Contacted.',
  triggers: ['message.sent'],
  defaultMode: 'auto',
  autoEligible: true,
  async evaluate(ctx, event) {
    const lead = await loadLead(ctx, event.payload.leadId as string | undefined);
    if (!lead || lead.status !== 'new') return [];
    return [{
      action: 'advance_lead_status',
      title: `Move "${lead.title}" to Contacted`,
      reason: 'You replied to the customer',
      params: { leadId: lead.id, status: 'contacted' },
      entityType: 'lead',
      entityId: lead.id,
      contactId: lead.contact_id,
      leadId: lead.id,
      assignedTo: lead.assigned_to,
      dedupeKey: `contacted:${lead.id}`,
    }];
  },
};

const unansweredMessage: Recipe = {
  key: 'inbox.unanswered_message',
  area: 'Inbox',
  title: 'Flag customer messages left without a reply',
  description: 'A message from a contact that nobody has answered within the set time becomes a high-priority task for the lead owner.',
  triggers: ['schedule.tick'],
  defaultMode: 'auto',
  autoEligible: true,
  settings: [{ key: 'hours', label: 'Unanswered for', type: 'number', default: 4, min: 1, max: 72, unit: 'hours' }],
  async evaluate(ctx) {
    const cutoff = new Date(Date.now() - ctx.settings.hours * 3600_000).toISOString();
    const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const rows = await ctx.db
      .prepare(
        `SELECT m.id, m.contact_id, m.lead_id, c.name, l.assigned_to FROM message_log m
         JOIN contacts c ON c.id = m.contact_id
         LEFT JOIN leads l ON l.id = m.lead_id
         WHERE m.direction = 'incoming' AND m.created_at < ? AND m.created_at >= ?
           AND NOT EXISTS (
             SELECT 1 FROM message_log r WHERE r.contact_id = m.contact_id AND r.created_at > m.created_at
           )
         ORDER BY m.created_at LIMIT 25`,
      )
      .bind(cutoff, since)
      .all<{ id: string; contact_id: string; lead_id: string | null; name: string; assigned_to: string | null }>();
    const day = await today(ctx);
    return rows.results.map((row) => ({
      action: 'create_task',
      title: `Reply to ${row.name}`,
      reason: `No reply for more than ${ctx.settings.hours} hours`,
      params: { title: `Reply to the message from ${row.name}`, dueDate: day, priority: 'high', assignedTo: row.assigned_to, relatedLeadId: row.lead_id },
      entityType: 'contact',
      entityId: row.contact_id,
      contactId: row.contact_id,
      leadId: row.lead_id,
      assignedTo: row.assigned_to,
      dedupeKey: `unanswered:${row.id}`,
    }));
  },
};

const quoteExpiring: Recipe = {
  key: 'itineraries.quote_expiring',
  area: 'Itineraries',
  title: 'Remind the customer before a quote expires',
  description: 'For quotes whose validity date is close and whose lead is still open, drafts a reminder to send.',
  triggers: ['schedule.tick'],
  defaultMode: 'suggest',
  autoEligible: false,
  settings: [{ key: 'days', label: 'Days before expiry', type: 'number', default: 2, min: 1, max: 14, unit: 'days' }],
  async evaluate(ctx) {
    const day = await today(ctx);
    const until = addDaysLocal(day, ctx.settings.days);
    const rows = await ctx.db
      .prepare(
        `SELECT i.id, i.title, i.validity_date, l.id AS lead_id, l.contact_id, l.assigned_to, l.source FROM itineraries i
         JOIN leads l ON l.id = i.lead_id
         WHERE COALESCE(i.is_deleted, 0) = 0 AND i.validity_date IS NOT NULL AND i.validity_date >= ? AND i.validity_date <= ?
           AND l.status NOT IN ('won', 'lost', 'booking_confirmed', 'completed') AND COALESCE(l.is_deleted, 0) = 0
         LIMIT 25`,
      )
      .bind(day, until)
      .all<{ id: string; title: string; validity_date: string; lead_id: string; contact_id: string; assigned_to: string | null; source: string | null }>();
    const company = await companyName(ctx);
    const proposals: Proposal[] = [];
    for (const row of rows.results) {
      const contact = await loadContact(ctx, row.contact_id);
      if (!contact || contact.opted_out) continue;
      const channel = replyChannel(row.source ?? 'whatsapp', contact);
      if (!channel) continue;
      proposals.push({
        action: 'draft_reply',
        title: `Tell ${contact.name} the quote is valid until ${shortDate(row.validity_date)}`,
        reason: `"${row.title}" expires on ${shortDate(row.validity_date)}`,
        params: {
          contactId: contact.id,
          leadId: row.lead_id,
          channel,
          subject: channel === 'email' ? `Your quote is valid until ${shortDate(row.validity_date)}` : null,
          body: `Hi ${contact.name.split(' ')[0]},\n\nA quick note that the prices in your plan are held until ${shortDate(row.validity_date)}. Let me know if you would like to go ahead or change anything before then.${company ? `\n\nWarm regards,\n${company}` : ''}`,
        },
        entityType: 'itinerary',
        entityId: row.id,
        contactId: contact.id,
        leadId: row.lead_id,
        assignedTo: row.assigned_to,
        dedupeKey: `quote-expiring:${row.id}:${row.validity_date}`,
      });
    }
    return proposals;
  },
};

const paymentThankYou: Recipe = {
  key: 'payments.thank_you',
  area: 'Payments',
  title: 'Draft a thank-you when a payment is recorded',
  description: 'Drafts a message confirming the amount received and the balance still due.',
  triggers: ['payment.recorded'],
  defaultMode: 'suggest',
  autoEligible: false,
  async evaluate(ctx, event) {
    const inr = await moneyFmt(ctx);
    const invoice = await ctx.db
      .prepare('SELECT id, invoice_number, contact_id, lead_id, balance_due FROM invoices WHERE id = ?')
      .bind(event.payload.invoiceId as string)
      .first<{ id: string; invoice_number: string; contact_id: string; lead_id: string | null; balance_due: number | null }>();
    if (!invoice) return [];
    const contact = await loadContact(ctx, invoice.contact_id);
    if (!contact || contact.opted_out) return [];
    const channel = replyChannel('whatsapp', contact);
    if (!channel) return [];
    const amount = Number(event.payload.amount) || 0;
    const balance = invoice.balance_due ?? 0;
    const company = await companyName(ctx);
    return [{
      action: 'draft_reply',
      title: `Confirm ${inr(amount)} received to ${contact.name}`,
      reason: balance > 0 ? `${inr(balance)} still due on ${invoice.invoice_number}` : `${invoice.invoice_number} is fully paid`,
      params: {
        contactId: contact.id,
        leadId: invoice.lead_id,
        channel,
        subject: channel === 'email' ? `Payment received: ${invoice.invoice_number}` : null,
        body: `Hi ${contact.name.split(' ')[0]},\n\nThank you, we have received ${inr(amount)} against invoice ${invoice.invoice_number}. ${balance > 0 ? `The balance is ${inr(balance)}.` : 'The invoice is now fully paid.'}${company ? `\n\nWarm regards,\n${company}` : ''}`,
      },
      entityType: 'invoice',
      entityId: invoice.id,
      contactId: contact.id,
      leadId: invoice.lead_id,
      dedupeKey: `payment-thanks:${event.entityId}`,
    }];
  },
};

/** The date a lead travels: the start of its held or confirmed group departure (R143), else the lead's own travel date. Needs the alias l for leads. */
const TRAVEL_DATE_SQL = `COALESCE((SELECT d.start_date FROM seat_bookings sb JOIN departures d ON d.id = sb.departure_id
  WHERE sb.lead_id = l.id AND sb.status IN ('held', 'confirmed') ORDER BY d.start_date LIMIT 1), l.travel_date)`;

const balanceBeforeTravel: Recipe = {
  key: 'payments.balance_before_travel',
  area: 'Payments',
  title: 'Chase the balance before departure',
  description: 'For bookings travelling soon with a balance outstanding, drafts a payment reminder.',
  triggers: ['schedule.tick'],
  defaultMode: 'suggest',
  autoEligible: false,
  settings: [{ key: 'days', label: 'Days before travel', type: 'number', default: 21, min: 1, max: 90, unit: 'days' }],
  async evaluate(ctx) {
    const inr = await moneyFmt(ctx);
    const day = await today(ctx);
    const until = addDaysLocal(day, ctx.settings.days);
    const rows = await ctx.db
      .prepare(
        `SELECT i.id, i.invoice_number, i.balance_due, i.contact_id, l.id AS lead_id, l.title, ${TRAVEL_DATE_SQL} AS travel_date FROM invoices i
         JOIN leads l ON l.id = i.lead_id
         WHERE i.status = 'partially_paid' AND COALESCE(i.balance_due, 0) > 0
           AND ${TRAVEL_DATE_SQL} IS NOT NULL AND substr(${TRAVEL_DATE_SQL}, 1, 10) >= ? AND substr(${TRAVEL_DATE_SQL}, 1, 10) <= ?
         ORDER BY ${TRAVEL_DATE_SQL} LIMIT 25`,
      )
      .bind(day, until)
      .all<{ id: string; invoice_number: string; balance_due: number; contact_id: string; lead_id: string; title: string; travel_date: string }>();
    const company = await companyName(ctx);
    const proposals: Proposal[] = [];
    for (const row of rows.results) {
      const contact = await loadContact(ctx, row.contact_id);
      if (!contact || contact.opted_out) continue;
      const channel = replyChannel('whatsapp', contact);
      if (!channel) continue;
      proposals.push({
        action: 'draft_reply',
        title: `Ask ${contact.name} for the balance on ${row.invoice_number}`,
        reason: `${inr(row.balance_due)} due; travel starts ${shortDate(row.travel_date)}`,
        params: {
          contactId: contact.id,
          leadId: row.lead_id,
          channel,
          subject: channel === 'email' ? `Balance due before your trip: ${row.invoice_number}` : null,
          body: `Hi ${contact.name.split(' ')[0]},\n\nYour trip starts on ${shortDate(row.travel_date)}. The balance of ${inr(row.balance_due)} on invoice ${row.invoice_number} is now due so we can confirm everything with our partners.${company ? `\n\nWarm regards,\n${company}` : ''}`,
        },
        entityType: 'invoice',
        entityId: row.id,
        contactId: contact.id,
        leadId: row.lead_id,
        dedupeKey: `balance:${row.id}`,
      });
    }
    return proposals;
  },
};

const collectTravellerDetails: Recipe = {
  key: 'travellers.collect_details',
  area: 'Travellers',
  title: 'Ask for traveller details when a booking is confirmed',
  description: 'Drafts a message asking for full names as on ID and the documents needed for the trip.',
  triggers: ['lead.status_changed'],
  defaultMode: 'suggest',
  autoEligible: false,
  async evaluate(ctx, event) {
    if (event.payload.to !== 'won') return [];
    const lead = await loadLead(ctx, event.entityId);
    const contact = await loadContact(ctx, lead?.contact_id);
    if (!lead || !contact || contact.opted_out) return [];
    const channel = replyChannel(lead.source ?? 'whatsapp', contact);
    if (!channel) return [];
    const seatsBooked = (await ctx.db.prepare(`SELECT COALESCE(SUM(seats), 0) AS n FROM seat_bookings WHERE lead_id = ? AND status IN ('held', 'confirmed')`).bind(lead.id).first<{ n: number }>())?.n ?? 0;
    const pax = seatsBooked > 0 ? seatsBooked : (lead.pax_adults ?? 1) + (lead.pax_children ?? 0);
    const abroad = lead.trip_type === 'international';
    const company = await companyName(ctx);
    return [{
      action: 'draft_reply',
      title: `Ask ${contact.name} for traveller details`,
      reason: `Booking confirmed for ${pax} traveller${pax === 1 ? '' : 's'}`,
      params: {
        contactId: contact.id,
        leadId: lead.id,
        channel,
        subject: channel === 'email' ? 'Traveller details for your booking' : null,
        body: `Hi ${contact.name.split(' ')[0]},\n\nTo confirm your bookings, please send the full names of all ${pax} traveller${pax === 1 ? '' : 's'} exactly as on their ${abroad ? 'passports, with a copy of each passport' : 'photo ID, with the ages of any children'}.${company ? `\n\nWarm regards,\n${company}` : ''}`,
      },
      entityType: 'lead',
      entityId: lead.id,
      contactId: contact.id,
      leadId: lead.id,
      assignedTo: lead.assigned_to,
      dedupeKey: `traveller-details:${lead.id}`,
    }];
  },
};

const postTripReview: Recipe = {
  key: 'marketing.post_trip_review',
  area: 'Marketing',
  title: 'Ask for a review after the trip',
  description: 'In the days after a booked trip ends, drafts a welcome-back message asking for a review.',
  triggers: ['schedule.tick'],
  defaultMode: 'suggest',
  autoEligible: false,
  async evaluate(ctx) {
    const day = await today(ctx);
    const from = addDaysLocal(day, -3);
    const rows = await ctx.db
      .prepare(
        `SELECT id, title, contact_id, assigned_to, source FROM leads
         WHERE status IN ('won', 'booking_confirmed', 'completed') AND COALESCE(is_deleted, 0) = 0
           AND return_date IS NOT NULL AND substr(return_date, 1, 10) >= ? AND substr(return_date, 1, 10) < ?
         LIMIT 25`,
      )
      .bind(from, day)
      .all<{ id: string; title: string; contact_id: string; assigned_to: string | null; source: string | null }>();
    const company = await companyName(ctx);
    const proposals: Proposal[] = [];
    for (const row of rows.results) {
      const contact = await loadContact(ctx, row.contact_id);
      if (!contact || contact.opted_out) continue;
      const channel = replyChannel(row.source ?? 'whatsapp', contact);
      if (!channel) continue;
      proposals.push({
        action: 'draft_reply',
        title: `Welcome ${contact.name} back and ask for a review`,
        reason: `"${row.title}" has just ended`,
        params: {
          contactId: contact.id,
          leadId: row.id,
          channel,
          subject: channel === 'email' ? 'Welcome back! How was the trip?' : null,
          body: `Hi ${contact.name.split(' ')[0]},\n\nWelcome back! We hope the trip was everything you wanted. If you have a minute, we would be grateful for a short review, and for anything we could do better next time.${company ? `\n\nWarm regards,\n${company}` : ''}`,
        },
        entityType: 'lead',
        entityId: row.id,
        contactId: contact.id,
        leadId: row.id,
        assignedTo: row.assigned_to,
        dedupeKey: `review:${row.id}`,
      });
    }
    return proposals;
  },
};

const dormantWinBack: Recipe = {
  key: 'marketing.dormant_win_back',
  area: 'Marketing',
  title: 'Win back customers who have not travelled for a while',
  description: 'Drafts a check-in for past customers whose last trip was long ago and who have no enquiry open.',
  triggers: ['schedule.tick'],
  defaultMode: 'suggest',
  autoEligible: false,
  settings: [{ key: 'months', label: 'No trip for', type: 'number', default: 9, min: 3, max: 36, unit: 'months' }],
  async evaluate(ctx) {
    const day = await today(ctx);
    const cutoff = addDaysLocal(day, -Math.round(ctx.settings.months * 30.4));
    const rows = await ctx.db
      .prepare(
        `SELECT c.id, MAX(substr(COALESCE(l.return_date, l.travel_date), 1, 10)) AS last_trip FROM contacts c
         JOIN leads l ON l.contact_id = c.id AND l.status IN ('won', 'booking_confirmed', 'completed') AND COALESCE(l.is_deleted, 0) = 0
         WHERE COALESCE(c.is_deleted, 0) = 0 AND COALESCE(c.opted_out, 0) = 0
           AND NOT EXISTS (
             SELECT 1 FROM leads o WHERE o.contact_id = c.id AND COALESCE(o.is_deleted, 0) = 0
               AND o.status NOT IN ('won', 'lost', 'booking_confirmed', 'completed')
           )
         GROUP BY c.id HAVING last_trip IS NOT NULL AND last_trip < ?
         ORDER BY last_trip DESC LIMIT 5`,
      )
      .bind(cutoff)
      .all<{ id: string; last_trip: string }>();
    const company = await companyName(ctx);
    const quarter = `${day.slice(0, 4)}-Q${Math.ceil(Number(day.slice(5, 7)) / 3)}`;
    const proposals: Proposal[] = [];
    for (const row of rows.results) {
      const contact = await loadContact(ctx, row.id);
      if (!contact) continue;
      const channel = replyChannel('whatsapp', contact);
      if (!channel) continue;
      const lastTrip = new Date(`${row.last_trip}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      proposals.push({
        action: 'draft_reply',
        title: `Check in with ${contact.name}`,
        reason: `Last travelled with you in ${lastTrip}`,
        params: {
          contactId: contact.id,
          leadId: null,
          channel,
          subject: channel === 'email' ? 'Planning your next trip?' : null,
          body: `Hi ${contact.name.split(' ')[0]},\n\nIt has been a while since your last trip with us, and we would love to help plan the next one. Is there somewhere you have been thinking about?${company ? `\n\nWarm regards,\n${company}` : ''}`,
        },
        entityType: 'contact',
        entityId: contact.id,
        contactId: contact.id,
        // At most one win-back per customer per quarter.
        dedupeKey: `win-back:${contact.id}:${quarter}`,
      });
    }
    return proposals;
  },
};

const rateCardExpiry: Recipe = {
  key: 'rate_cards.expiry_task',
  area: 'Rate cards',
  title: 'Create a renewal task before a rate card expires',
  description: 'Rate cards that stop being valid soon become a task, so quotes are never priced from expired rates.',
  triggers: ['schedule.tick'],
  defaultMode: 'auto',
  autoEligible: true,
  settings: [{ key: 'days', label: 'Days before expiry', type: 'number', default: 14, min: 1, max: 90, unit: 'days' }],
  async evaluate(ctx) {
    const day = await today(ctx);
    const until = addDaysLocal(day, ctx.settings.days);
    const rows = await ctx.db
      .prepare(
        `SELECT id, name, valid_to FROM rate_cards
         WHERE COALESCE(is_active, 1) = 1 AND valid_to IS NOT NULL AND substr(valid_to, 1, 10) >= ? AND substr(valid_to, 1, 10) <= ?
         ORDER BY valid_to LIMIT 25`,
      )
      .bind(day, until)
      .all<{ id: string; name: string; valid_to: string }>();
    return rows.results.map((row) => ({
      action: 'create_task',
      title: `Renew rate card: ${row.name}`,
      reason: `Valid until ${shortDate(row.valid_to)}`,
      params: {
        title: `Renew rate card: ${row.name}`.slice(0, 200),
        description: `This rate card is valid until ${shortDate(row.valid_to)}. Get new rates from the supplier.`,
        dueDate: row.valid_to.slice(0, 10),
        priority: 'medium',
      },
      entityType: 'rate_card',
      entityId: row.id,
      dedupeKey: `rate-card-expiry:${row.id}:${row.valid_to.slice(0, 10)}`,
    }));
  },
};

const arrivalTransfer: Recipe = {
  key: 'fleet.arrival_transfer',
  area: 'Fleet',
  title: 'Line up a vehicle and driver for arrivals',
  description: 'For confirmed bookings travelling soon with no transfer booked, picks a vehicle that fits the group and a driver, both free that day, and opens the trip form filled in.',
  triggers: ['lead.status_changed', 'schedule.tick'],
  defaultMode: 'suggest',
  autoEligible: false,
  settings: [{ key: 'days', label: 'Days before travel', type: 'number', default: 7, min: 1, max: 60, unit: 'days' }],
  async evaluate(ctx, event) {
    if (event.type === 'lead.status_changed' && event.payload.to !== 'won') return [];
    const day = await today(ctx);
    const until = addDaysLocal(day, ctx.settings.days);
    const leads = await ctx.db
      .prepare(
        `SELECT l.* FROM leads l
         WHERE l.status IN ('won', 'booking_confirmed') AND COALESCE(l.is_deleted, 0) = 0
           AND l.travel_date IS NOT NULL AND substr(l.travel_date, 1, 10) >= ? AND substr(l.travel_date, 1, 10) <= ?
           ${event.type === 'lead.status_changed' ? 'AND l.id = ?' : ''}
           AND NOT EXISTS (SELECT 1 FROM trip_assignments t WHERE t.lead_id = l.id AND COALESCE(t.is_deleted, 0) = 0 AND t.status != 'cancelled')
         ORDER BY l.travel_date LIMIT 15`,
      )
      .bind(...(event.type === 'lead.status_changed' ? [day, until, event.entityId] : [day, until]))
      .all<LeadRow>();

    const proposals: Proposal[] = [];
    for (const lead of leads.results) {
      const date = lead.travel_date!.slice(0, 10);
      const pax = (lead.pax_adults ?? 1) + (lead.pax_children ?? 0);
      // Free that day: not in the workshop, and no trip overlapping the arrival date.
      const busy = `SELECT 1 FROM trip_assignments t WHERE COALESCE(t.is_deleted, 0) = 0 AND t.status NOT IN ('completed', 'cancelled')
                      AND substr(t.pickup_datetime, 1, 10) <= ? AND substr(t.drop_datetime, 1, 10) >= ?`;
      const vehicle = await ctx.db
        .prepare(
          `SELECT v.id, v.registration_number, v.make, v.model, v.seating_capacity FROM vehicles v
           WHERE COALESCE(v.is_deleted, 0) = 0 AND v.status IN ('available', 'on_trip') AND COALESCE(v.seating_capacity, 4) >= ?
             AND NOT EXISTS (${busy} AND t.vehicle_id = v.id)
           ORDER BY COALESCE(v.seating_capacity, 4), v.registration_number LIMIT 1`,
        )
        .bind(pax + 1, date, date)
        .first<{ id: string; registration_number: string; make: string | null; model: string | null; seating_capacity: number | null }>();
      const driver = await ctx.db
        .prepare(
          `SELECT d.id, d.name FROM drivers d
           WHERE COALESCE(d.is_deleted, 0) = 0 AND d.status IN ('active', 'on_trip')
             AND NOT EXISTS (${busy} AND t.driver_id = d.id)
           ORDER BY d.name LIMIT 1`,
        )
        .bind(date, date)
        .first<{ id: string; name: string }>();
      if (!vehicle || !driver) continue;

      const contact = await loadContact(ctx, lead.contact_id);
      const destination = parseDestinations(lead.destination)[0] ?? '';
      const params = new URLSearchParams({ leadId: lead.id, tripType: 'airport_pickup', vehicleId: vehicle.id, driverId: driver.id, date });
      if (contact?.name) params.set('passengerName', contact.name);
      if (contact?.phone) params.set('passengerPhone', contact.phone);
      if (destination) params.set('endLocation', destination);
      const car = [vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
      proposals.push({
        action: 'open_prefilled_form',
        title: `Book the arrival transfer for ${contact?.name ?? lead.title}`,
        reason: `Travelling ${shortDate(date)}, ${pax} passenger${pax === 1 ? '' : 's'}; no transfer booked yet`,
        params: {
          href: `/fleet/trips/new?${params.toString()}`,
          buttonLabel: 'Open trip form',
          details: [
            { label: 'Vehicle', value: `${car} (${vehicle.registration_number}), ${vehicle.seating_capacity ?? 4} seats` },
            { label: 'Driver', value: driver.name },
            { label: 'Free on', value: shortDate(date) },
          ],
        },
        entityType: 'lead',
        entityId: lead.id,
        contactId: lead.contact_id,
        leadId: lead.id,
        assignedTo: lead.assigned_to,
        dedupeKey: `arrival-transfer:${lead.id}`,
      });
    }
    return proposals;
  },
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * R306: the call summary (made by the call AI job, which already charged the credits) becomes suggestions. The recipe only
 * reads the event payload; it never calls a model. Everything is a suggestion: lead details, tasks, a dated follow-up and a
 * drafted message the agent reads and sends from the send dialog.
 */
const summariseCall: Recipe = {
  key: 'calls.summarise',
  area: 'Calls',
  title: 'Turn a summarised call into suggested next steps',
  description: 'When the call AI has summarised a call, suggests updating the lead with what was said, tasks for the action items, and a drafted message. Nothing changes until you click.',
  triggers: ['call.summary_ready'],
  defaultMode: 'suggest',
  autoEligible: false,
  usesAi: true,
  async evaluate(ctx, event) {
    const p = event.payload;
    const callId = event.entityId;
    const lead = await loadLead(ctx, p.leadId as string | undefined);
    const contact = await loadContact(ctx, (p.contactId as string | null | undefined) ?? lead?.contact_id);
    const openLead = lead && isOpenStatus(lead.status) ? lead : null;
    const assignedTo = (p.routedTo as string | null) ?? lead?.assigned_to ?? null;
    const day = await today(ctx);
    const where: Pick<Proposal, 'entityType' | 'entityId' | 'contactId' | 'leadId' | 'sourceType' | 'sourceId' | 'origin' | 'assignedTo'> = {
      entityType: openLead ? 'lead' : contact ? 'contact' : 'call',
      entityId: openLead ? openLead.id : contact ? contact.id : callId,
      contactId: contact?.id ?? null,
      leadId: openLead?.id ?? null,
      sourceType: 'call',
      sourceId: callId,
      origin: 'ai',
      assignedTo,
    };
    const proposals: Proposal[] = [];
    const who = contact?.name ?? lead?.title ?? 'this caller';

    // What was said about the trip, as a lead update (only the fields that differ from the lead).
    if (openLead) {
      const changes: Record<string, unknown> = {};
      const destination = typeof p.destination === 'string' ? p.destination.trim().slice(0, 80) : '';
      if (destination && !parseDestinations(openLead.destination).some((d) => d.toLowerCase() === destination.toLowerCase())) {
        changes.destinations = [destination];
      }
      const dates = (p.travelDates ?? null) as { from?: string; to?: string } | null;
      if (dates?.from && ISO_DAY.test(dates.from) && dates.from >= day && dates.from !== openLead.travel_date) changes.travelDate = dates.from;
      if (dates?.to && ISO_DAY.test(dates.to) && dates.to >= day && dates.to !== openLead.return_date) changes.returnDate = dates.to;
      const pax = (p.paxDetails ?? null) as { adults?: number; children?: number } | null;
      if (pax && Number.isInteger(pax.adults) && (pax.adults as number) >= 1 && pax.adults !== openLead.pax_adults) {
        changes.paxAdults = pax.adults;
        if (Number.isInteger(pax.children) && (pax.children as number) >= 0) changes.paxChildren = pax.children;
      }
      if (typeof p.budget === 'number' && p.budget > 0 && p.budget !== openLead.budget) changes.budget = p.budget;
      if (typeof p.tripType === 'string' && p.tripType.trim() && p.tripType.trim().length <= 40 && !openLead.trip_type) changes.tripType = p.tripType.trim();
      if (typeof p.specialRequests === 'string' && p.specialRequests.trim() && !openLead.special_requirements) changes.specialRequirements = p.specialRequests.trim().slice(0, 2000);
      if (Object.keys(changes).length > 0) {
        proposals.push({
          ...where,
          action: 'update_lead',
          title: `Update "${openLead.title}" with what was said on the call`,
          reason: 'The call summary mentions trip details the lead does not have',
          params: { leadId: openLead.id, changes },
          dedupeKey: `call-summary-lead:${callId}`,
        });
      }
    }

    // One task per action item the summary found.
    const items = Array.isArray(p.actionItems) ? (p.actionItems as Array<{ text?: string; dueDate?: string }>) : [];
    items.slice(0, 3).forEach((item, index) => {
      const text = typeof item?.text === 'string' ? item.text.trim() : '';
      if (!text) return;
      proposals.push({
        ...where,
        action: 'create_task',
        title: `Task: ${text.slice(0, 80)}`,
        reason: `From the call with ${who}`,
        params: {
          title: text.slice(0, 200),
          description: `From the summary of the call with ${who}.`,
          dueDate: typeof item.dueDate === 'string' && ISO_DAY.test(item.dueDate) && item.dueDate >= day ? item.dueDate : day,
          priority: 'medium',
          assignedTo,
          relatedLeadId: openLead?.id ?? null,
        },
        dedupeKey: `call-summary-task:${callId}:${index}`,
      });
    });

    // A message the agent reads, edits and sends from the send dialog.
    const draft = typeof p.draftReply === 'string' ? p.draftReply.trim() : '';
    if (draft && contact && !contact.opted_out) {
      const channel = contact.phone ? 'whatsapp' : contact.email ? 'email' : null;
      if (channel) {
        proposals.push({
          ...where,
          action: 'draft_reply',
          title: `Send ${contact.name} a follow-up after the call`,
          reason: 'Drafted from the call summary; review before sending',
          params: { contactId: contact.id, leadId: openLead?.id ?? null, channel, subject: channel === 'email' ? 'Following up on our call' : null, body: draft },
          dedupeKey: `call-summary-reply:${callId}`,
        });
      }
    }
    return proposals;
  },
};

// ── Group departures (R143) ──────────────────────────────────

interface BookingRow {
  id: string;
  departure_id: string;
  lead_id: string;
  contact_id: string;
  status: string;
  seats: number;
  invoice_id: string | null;
  hold_expires_at: string | null;
  dep_code: string;
  start_date: string;
  end_date: string;
  dep_status: string;
  tour_title: string;
  tour_leader_user_id: string | null;
  dep_created_by: string | null;
  public_booking_enabled: number | null;
}

const BOOKING_SQL = `SELECT sb.id, sb.departure_id, sb.lead_id, sb.contact_id, sb.status, sb.seats, sb.invoice_id, sb.hold_expires_at,
    d.code AS dep_code, d.start_date, d.end_date, d.status AS dep_status, d.tour_leader_user_id, d.created_by AS dep_created_by, d.public_booking_enabled,
    t.title AS tour_title
  FROM seat_bookings sb JOIN departures d ON d.id = sb.departure_id JOIN tours t ON t.id = d.tour_id`;

function loadBooking(ctx: RecipeContext, id: unknown): Promise<BookingRow | null> {
  if (typeof id !== 'string' || !id) return Promise.resolve(null);
  return ctx.db.prepare(`${BOOKING_SQL} WHERE sb.id = ?`).bind(id).first<BookingRow>();
}

/** The deposit a booking owes before it is confirmed (design 4.1): percent of the invoice, per seat, a fixed sum, or none (any payment counts). */
function depositAmount(deposit: { type: string; value: number | null }, seats: number, invoiceTotal: number): number {
  const v = deposit.value ?? 0;
  if (deposit.type === 'percent') return (invoiceTotal * v) / 100;
  if (deposit.type === 'per_seat') return v * seats;
  if (deposit.type === 'fixed') return v;
  return 0;
}

const confirmSeats: Recipe = {
  key: 'departures.confirm_seats',
  area: 'Group departures',
  title: 'Confirm held seats',
  description: 'Held seats are confirmed with one click (or automatically), and the customer is told. Follows the confirm mode of the departure: on deposit, the seats are confirmed when the deposit is paid.',
  triggers: ['seat_booking.held', 'seat_booking.confirmed', 'payment.recorded'],
  defaultMode: 'suggest',
  autoEligible: true,
  featureKey: 'group_departures',
  async evaluate(ctx, event) {
    if (event.type === 'seat_booking.held') {
      const b = await loadBooking(ctx, event.payload.seatBookingId ?? event.entityId);
      if (!b || b.status !== 'held') return [];
      // auto_when_available is confirmed by the request itself and on_deposit waits for the payment; only manual needs a person.
      if ((await loadDepartureContext(ctx.db, b.departure_id)).effective.confirmMode !== 'manual') return [];
      const contact = await loadContact(ctx, b.contact_id);
      return [{
        action: 'confirm_seat_booking',
        title: `Confirm ${b.seats} seat${b.seats === 1 ? '' : 's'} on ${b.dep_code}${contact ? ` for ${contact.name}` : ''}`,
        reason: `Held until ${b.hold_expires_at ? shortDate(b.hold_expires_at) : 'confirmed'}; ${b.tour_title} starts ${shortDate(b.start_date)}`,
        params: { seatBookingId: b.id },
        entityType: 'seat_booking', entityId: b.id, contactId: b.contact_id, leadId: b.lead_id,
        dedupeKey: `confirm-seats:${b.id}`,
      }];
    }

    if (event.type === 'payment.recorded') {
      const invoiceId = event.payload.invoiceId;
      if (typeof invoiceId !== 'string') return [];
      const invoice = await ctx.db.prepare('SELECT total, paid_amount FROM invoices WHERE id = ?').bind(invoiceId).first<{ total: number; paid_amount: number | null }>();
      if (!invoice) return [];
      const rows = await ctx.db.prepare(`${BOOKING_SQL} WHERE sb.invoice_id = ? AND sb.status = 'held'`).bind(invoiceId).all<BookingRow>();
      const proposals: Proposal[] = [];
      for (const b of rows.results) {
        const dep = await loadDepartureContext(ctx.db, b.departure_id);
        if (dep.effective.confirmMode !== 'on_deposit') continue;
        const due = depositAmount(dep.effective.deposit, b.seats, invoice.total ?? 0);
        const paid = invoice.paid_amount ?? 0;
        if (paid <= 0 || paid + 0.005 < due) continue;
        proposals.push({
          action: 'confirm_seat_booking',
          title: `Confirm ${b.seats} seat${b.seats === 1 ? '' : 's'} on ${b.dep_code}: the deposit is paid`,
          reason: 'The deposit for these seats has been received',
          params: { seatBookingId: b.id, by: 'deposit' },
          entityType: 'seat_booking', entityId: b.id, contactId: b.contact_id, leadId: b.lead_id,
          dedupeKey: `confirm-seats-deposit:${b.id}`,
        });
      }
      return proposals;
    }

    // seat_booking.confirmed: tell the customer.
    const b = await loadBooking(ctx, event.payload.seatBookingId ?? event.entityId);
    const contact = await loadContact(ctx, b?.contact_id);
    if (!b || !contact || contact.opted_out) return [];
    const channel = replyChannel('whatsapp', contact);
    if (!channel) return [];
    const company = await companyName(ctx);
    return [{
      action: 'draft_reply',
      title: `Tell ${contact.name} the seats are confirmed`,
      reason: `${b.seats} seat${b.seats === 1 ? '' : 's'} confirmed on ${b.dep_code}`,
      params: {
        contactId: contact.id, leadId: b.lead_id, channel,
        subject: channel === 'email' ? `Your seats are confirmed: ${b.tour_title}` : null,
        body: `Hi ${contact.name.split(' ')[0]},\n\nYour ${b.seats} seat${b.seats === 1 ? ' is' : 's are'} confirmed on ${b.tour_title}, departing ${shortDate(b.start_date)}.${company ? `\n\nWarm regards,\n${company}` : ''}`,
      },
      entityType: 'seat_booking', entityId: b.id, contactId: contact.id, leadId: b.lead_id,
      dedupeKey: `seats-confirmed:${b.id}`,
    }];
  },
};

const waitlistOffer: Recipe = {
  key: 'departures.waitlist_offer',
  area: 'Group departures',
  title: 'Offer freed seats to the waitlist',
  description: 'When seats are freed, suggests offering them to the next waitlisted party (or tells the party when seats were held for them automatically).',
  triggers: ['seat_booking.cancelled', 'seat_booking.expired', 'departure.status_changed', 'departure.capacity_changed', 'waitlist.offered'],
  defaultMode: 'suggest',
  autoEligible: false,
  featureKey: 'group_departures',
  async evaluate(ctx, event) {
    if (event.type === 'waitlist.offered') {
      const b = await loadBooking(ctx, event.payload.seatBookingId ?? event.entityId);
      const contact = await loadContact(ctx, b?.contact_id);
      if (!b || b.status !== 'held' || !contact || contact.opted_out) return [];
      const channel = replyChannel('whatsapp', contact);
      if (!channel) return [];
      const until = typeof event.payload.offeredUntil === 'string' ? event.payload.offeredUntil : b.hold_expires_at;
      const company = await companyName(ctx);
      return [{
        action: 'draft_reply',
        title: `Tell ${contact.name} seats are available`,
        reason: `${b.seats} seat${b.seats === 1 ? '' : 's'} held for them on ${b.dep_code}`,
        params: {
          contactId: contact.id, leadId: b.lead_id, channel,
          subject: channel === 'email' ? `Seats available: ${b.tour_title}` : null,
          body: `Hi ${contact.name.split(' ')[0]},\n\nGood news: ${b.seats} seat${b.seats === 1 ? ' has' : 's have'} become available on ${b.tour_title}, departing ${shortDate(b.start_date)}. We are holding ${b.seats === 1 ? 'it' : 'them'} for you${until ? ` until ${shortDate(until)}` : ''}. Reply to confirm.${company ? `\n\nWarm regards,\n${company}` : ''}`,
        },
        entityType: 'seat_booking', entityId: b.id, contactId: contact.id, leadId: b.lead_id,
        dedupeKey: `waitlist-offered:${b.id}:${until ?? ''}`,
      }];
    }

    const departureId = event.payload.departureId;
    if (typeof departureId !== 'string') return [];
    // auto_hold hands the seats over inside the service; this recipe only proposes in suggest mode.
    let dep;
    try {
      dep = await loadDepartureContext(ctx.db, departureId);
    } catch {
      return [];
    }
    if (dep.settings.waitlist.offerMode !== 'suggest') return [];
    const left = await seatsLeft(ctx.db, departureId, dep.row.capacity);
    const proposals: Proposal[] = [];
    for (const row of await nextFittingWaitlist(ctx.db, departureId)) {
      const b = await loadBooking(ctx, row.id);
      const contact = await loadContact(ctx, row.contact_id);
      if (!b || !contact) continue;
      proposals.push({
        action: 'offer_seats',
        title: `Offer ${b.seats} seat${b.seats === 1 ? '' : 's'} to ${contact.name}`,
        reason: `${left} seat${left === 1 ? ' is' : 's are'} free on ${b.dep_code}; they are next on the waitlist`,
        params: { seatBookingId: b.id },
        entityType: 'seat_booking', entityId: b.id, contactId: b.contact_id, leadId: b.lead_id,
        dedupeKey: `waitlist-offer:${b.id}:${left}`,
      });
    }
    return proposals;
  },
};

const holdExpiring: Recipe = {
  key: 'departures.hold_expiring',
  area: 'Group departures',
  title: 'Remind customers before a seat hold runs out',
  description: 'Holds that run out soon get a reminder draft to the customer, or a task for staff when there is no way to reach them.',
  triggers: ['schedule.tick'],
  defaultMode: 'suggest',
  autoEligible: false,
  featureKey: 'group_departures',
  settings: [{ key: 'hours', label: 'Hold runs out within', type: 'number', default: 24, min: 1, max: 168, unit: 'hours' }],
  async evaluate(ctx) {
    const now = new Date();
    const until = new Date(now.getTime() + ctx.settings.hours * 3_600_000).toISOString();
    const rows = await ctx.db
      .prepare(`${BOOKING_SQL} WHERE sb.status = 'held' AND sb.hold_expires_at IS NOT NULL AND sb.hold_expires_at > ? AND sb.hold_expires_at <= ? ORDER BY sb.hold_expires_at LIMIT 50`)
      .bind(now.toISOString(), until)
      .all<BookingRow>();
    const company = await companyName(ctx);
    const day = await today(ctx);
    const proposals: Proposal[] = [];
    for (const b of rows.results) {
      const contact = await loadContact(ctx, b.contact_id);
      if (!contact) continue;
      const channel = contact.opted_out ? null : replyChannel('whatsapp', contact);
      const expires = b.hold_expires_at!;
      const key = `hold-expiring:${b.id}:${expires}`;
      if (channel) {
        proposals.push({
          action: 'draft_reply',
          title: `Remind ${contact.name} their hold on ${b.dep_code} runs out`,
          reason: `${b.seats} seat${b.seats === 1 ? '' : 's'} held until ${shortDate(expires)}`,
          params: {
            contactId: contact.id, leadId: b.lead_id, channel,
            subject: channel === 'email' ? `Your held seats on ${b.tour_title}` : null,
            body: `Hi ${contact.name.split(' ')[0]},\n\nWe are holding ${b.seats} seat${b.seats === 1 ? '' : 's'} for you on ${b.tour_title} (${shortDate(b.start_date)}) until ${shortDate(expires)}. Let us know if you would like to confirm; after that the seats are released.${company ? `\n\nWarm regards,\n${company}` : ''}`,
          },
          entityType: 'seat_booking', entityId: b.id, contactId: contact.id, leadId: b.lead_id,
          dedupeKey: key,
        });
      } else {
        const lead = await loadLead(ctx, b.lead_id);
        proposals.push({
          action: 'create_task',
          title: `Contact ${contact.name}: the seat hold on ${b.dep_code} runs out`,
          reason: `No message can be sent to this customer; the hold ends ${shortDate(expires)}`,
          params: { title: `Call ${contact.name} about the held seats on ${b.dep_code}`, description: `${b.seats} seat(s) held until ${expires}`, dueDate: day, priority: 'high', assignedTo: lead?.assigned_to ?? null, relatedLeadId: b.lead_id },
          entityType: 'seat_booking', entityId: b.id, contactId: contact.id, leadId: b.lead_id,
          assignedTo: lead?.assigned_to ?? null,
          dedupeKey: key,
        });
      }
    }
    return proposals;
  },
};

const seatsLow: Recipe = {
  key: 'departures.seats_low',
  area: 'Group departures',
  title: 'Seats are running low',
  description: 'When a departure crosses the seats-left line, a task for the departure owner, and a prompt to promote the last seats when the departure takes public bookings.',
  triggers: ['departure.seats_low'],
  defaultMode: 'suggest',
  autoEligible: false,
  featureKey: 'group_departures',
  async evaluate(ctx, event) {
    const departureId = event.payload.departureId;
    if (typeof departureId !== 'string') return [];
    const d = await ctx.db
      .prepare(`SELECT d.id, d.code, d.start_date, d.public_booking_enabled, d.tour_leader_user_id, d.created_by, t.title AS tour_title
        FROM departures d JOIN tours t ON t.id = d.tour_id WHERE d.id = ? AND d.is_deleted = 0`)
      .bind(departureId)
      .first<{ id: string; code: string; start_date: string; public_booking_enabled: number | null; tour_leader_user_id: string | null; created_by: string | null; tour_title: string }>();
    if (!d) return [];
    const left = Number(event.payload.left ?? 0);
    const owner = d.tour_leader_user_id ?? d.created_by;
    const day = await today(ctx);
    const proposals: Proposal[] = [{
      action: 'create_task',
      title: `${left} seat${left === 1 ? '' : 's'} left on ${d.code}`,
      reason: `${d.tour_title} departs ${shortDate(d.start_date)}`,
      params: { title: `Review the last ${left} seat${left === 1 ? '' : 's'} on ${d.code}`, description: `${d.tour_title}, departing ${d.start_date}`, dueDate: day, priority: 'medium', assignedTo: owner },
      entityType: 'departure', entityId: d.id, assignedTo: owner,
      dedupeKey: `seats-low:${event.id}`,
    }];
    if (d.public_booking_enabled) {
      proposals.push({
        action: 'create_task',
        title: `Promote the last seats on ${d.code} to past travellers`,
        reason: 'The departure takes public bookings; a campaign to people who travelled this tour before can fill the last seats',
        params: { title: `Send a campaign for the last ${left} seat${left === 1 ? '' : 's'} on ${d.code}`, description: 'Segment: past travellers of this tour', dueDate: day, priority: 'medium', assignedTo: owner },
        entityType: 'departure', entityId: d.id, assignedTo: owner,
        dedupeKey: `seats-low-campaign:${event.id}`,
      });
    }
    return proposals;
  },
};

/**
 * The self-service link of a booking (details, extras, pay) exists from R150. Until then no link can be built, so the
 * collect-details recipe is listed but proposes nothing.
 */
async function selfServiceLink(_ctx: RecipeContext, _booking: BookingRow): Promise<string | null> {
  return null;
}

const collectDepartureDetails: Recipe = {
  key: 'departures.collect_details',
  area: 'Group departures',
  title: 'Send the self-service link when seats are confirmed',
  description: 'Drafts a message with the link where the customer adds passenger details, extras and payment. Needs the booking page (a later release); until then nothing is proposed.',
  triggers: ['seat_booking.confirmed'],
  defaultMode: 'suggest',
  autoEligible: false,
  featureKey: 'group_departures',
  async evaluate(ctx, event) {
    const b = await loadBooking(ctx, event.payload.seatBookingId ?? event.entityId);
    const contact = await loadContact(ctx, b?.contact_id);
    if (!b || !contact || contact.opted_out) return [];
    const link = await selfServiceLink(ctx, b);
    if (!link) return [];
    const channel = replyChannel('whatsapp', contact);
    if (!channel) return [];
    const company = await companyName(ctx);
    return [{
      action: 'draft_reply',
      title: `Send ${contact.name} the link for passenger details`,
      reason: `${b.seats} seat${b.seats === 1 ? '' : 's'} confirmed on ${b.dep_code}`,
      params: {
        contactId: contact.id, leadId: b.lead_id, channel,
        subject: channel === 'email' ? `Complete your booking: ${b.tour_title}` : null,
        body: `Hi ${contact.name.split(' ')[0]},\n\nPlease add the details of everyone travelling, choose any extras and pay here: ${link}${company ? `\n\nWarm regards,\n${company}` : ''}`,
      },
      entityType: 'seat_booking', entityId: b.id, contactId: contact.id, leadId: b.lead_id,
      dedupeKey: `departure-details:${b.id}`,
    }];
  },
};

export const RECIPES: Recipe[] = [
  readMessages,
  replyAfterCapture,
  firstFollowUp,
  suggestTemplate,
  quoteSentStatus,
  followUpAfterQuote,
  invoiceOnWon,
  bookingChecklist,
  paymentFromMessage,
  vouchersAfterPayment,
  wonOnPayment,
  staleQuoteNudge,
  overdueInvoiceReminder,
  missedCallCallback,
  leadFromMissedCall,
  missedAcknowledgement,
  voicemailTask,
  summariseCall,
  logCallToTimeline,
  contactedOnCall,
  nextStepPrompt,
  leadFromUnknownCaller,
  retryTask,
  tripFeedback,
  contactedOnFirstReply,
  unansweredMessage,
  quoteExpiring,
  paymentThankYou,
  balanceBeforeTravel,
  collectTravellerDetails,
  postTripReview,
  dormantWinBack,
  rateCardExpiry,
  arrivalTransfer,
  confirmSeats,
  waitlistOffer,
  holdExpiring,
  seatsLow,
  collectDepartureDetails,
];

export const RECIPES_BY_KEY: Record<string, Recipe> = Object.fromEntries(RECIPES.map((recipe) => [recipe.key, recipe]));
