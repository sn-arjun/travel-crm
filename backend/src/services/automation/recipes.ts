/**
 * Recipe library: the ready-made automations a workspace can switch off, leave as
 * one-click suggestions, or (where the action is low risk) let run on their own.
 *
 * A recipe looks at one event and returns proposals. It never changes data itself;
 * the engine turns proposals into suggestions or runs them through the action registry.
 */

import { getTenantTimeZone, localDateString, addDaysLocal } from '../../utils/tz';
import { analyzeMessage, type MessageAnalysis, type MessageEntities } from './message-analysis';
import type { DomainEvent, Proposal, Recipe, RecipeContext } from './types';
import { formatMoney, loadLocaleContext } from '../../utils/money';

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

    if (analysis.intent === 'enquiry' && !lead) {
      const isEmail = (message.from_address ?? '').includes('@');
      const headline = e.destinations[0] ?? 'Travel';
      const kind = e.tripType && e.tripType !== 'domestic' && e.tripType !== 'international' ? ` ${e.tripType}` : '';
      proposals.push({
        ...where,
        action: 'create_lead_from_enquiry',
        title: contact ? `Create a lead for ${sender}` : `Create contact and lead for ${sender}`,
        reason: describeTrip(e, inr) || 'New travel enquiry',
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
          budget: e.budget ?? null,
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
      if (e.budget && e.budget !== lead.budget) changes.budget = e.budget;
      if (Object.keys(changes).length > 0) {
        proposals.push({
          ...where,
          entityType: 'lead',
          entityId: lead.id,
          action: 'update_lead',
          title: `Update "${lead.title}" from ${sender}'s message`,
          reason: describeTrip({ ...e, destinations: added }, inr) || Object.keys(changes).join(', '),
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
        reason: e.paymentAmount ? `The customer says they paid ${inr(e.paymentAmount)}` : 'The customer agreed to go ahead',
        params: { leadId: lead.id },
        dedupeKey: `won:${lead.id}`,
        confidence: analysis.source === 'ai' ? 0.85 : 0.65,
      });
    }

    // A payment mentioned in any message (often inside a "yes, go ahead") is matched to the open invoice.
    if (contact && e.paymentAmount) {
      const invoice = await ctx.db
        .prepare(
          `SELECT id, invoice_number, balance_due, total FROM invoices
           WHERE contact_id = ? AND status NOT IN ('paid', 'cancelled') ORDER BY created_at DESC LIMIT 1`,
        )
        .bind(contact.id)
        .first<{ id: string; invoice_number: string; balance_due: number | null; total: number }>();
      if (invoice) {
        proposals.push({
          ...where,
          entityType: 'invoice',
          entityId: invoice.id,
          action: 'record_payment',
          title: `Record ${inr(e.paymentAmount)} from ${sender} on ${invoice.invoice_number}`,
          reason: e.paymentReference ? `Reference ${e.paymentReference} in the message` : 'The customer says they have paid',
          params: {
            invoiceId: invoice.id,
            amount: e.paymentAmount,
            method: 'transfer',
            reference: e.paymentReference,
            notes: 'Recorded from the customer\'s message by the assistant',
          },
          dedupeKey: `payment:${message.id}`,
          confidence: e.paymentReference ? 0.85 : 0.6,
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
    return [{
      action: 'create_itinerary_from_template',
      title: `Build the itinerary from "${best.title}"`,
      reason: `Closest template: ${best.why.join(', ')}`,
      params: { templateId: best.id, leadId: lead.id, title: `${contact?.name ?? lead.title}: ${best.title}`.slice(0, 200) },
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
      .prepare(`SELECT id, invoice_number, contact_id, lead_id, total, paid_amount FROM invoices WHERE id = ? AND status NOT IN ('paid', 'cancelled')`)
      .bind(event.entityId)
      .first<{ id: string; invoice_number: string; contact_id: string; lead_id: string | null; total: number; paid_amount: number | null }>();
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
    if (!entities.paymentAmount || entities.paymentAmount > invoice.total) return [];
    const contact = await loadContact(ctx, invoice.contact_id);
    return [{
      action: 'record_payment',
      title: `Record ${inr(entities.paymentAmount)} from ${contact?.name ?? 'the customer'} on ${invoice.invoice_number}`,
      reason: entities.paymentReference ? `Reference ${entities.paymentReference} in their message` : 'The customer wrote that they have paid',
      params: { invoiceId: invoice.id, amount: entities.paymentAmount, method: 'transfer', reference: entities.paymentReference, notes: 'Recorded from the customer\'s message by the assistant' },
      entityType: 'invoice',
      entityId: invoice.id,
      contactId: invoice.contact_id,
      leadId: invoice.lead_id,
      dedupeKey: `payment:${recent.id}`,
      sourceType: 'message',
      sourceId: recent.id,
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
        `SELECT i.id, i.invoice_number, i.balance_due, i.contact_id, l.id AS lead_id, l.title, l.travel_date FROM invoices i
         JOIN leads l ON l.id = i.lead_id
         WHERE i.status = 'partially_paid' AND COALESCE(i.balance_due, 0) > 0
           AND l.travel_date IS NOT NULL AND substr(l.travel_date, 1, 10) >= ? AND substr(l.travel_date, 1, 10) <= ?
         ORDER BY l.travel_date LIMIT 25`,
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
    const pax = (lead.pax_adults ?? 1) + (lead.pax_children ?? 0);
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
];

export const RECIPES_BY_KEY: Record<string, Recipe> = Object.fromEntries(RECIPES.map((recipe) => [recipe.key, recipe]));
