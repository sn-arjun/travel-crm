/**
 * Action registry: everything an automation or a one-click suggestion can do.
 *
 * Actions that have an API endpoint call it in-process as the acting user, so they get the
 * same validation, numbering, RBAC and logging as a click in the UI. Only `risk: 'low'`
 * actions may run without a click; the engine enforces that, not the caller.
 */

import { z } from 'zod';
import { generateId } from '../../utils/uuid';
import { findOrCreateContact } from '../domain/contacts';
import { createLead } from '../domain/leads';
import type { ActionContext, ActionDefinition, ActionResult, ApiResult } from './types';

function must(result: ApiResult, what: string): ApiResult {
  if (!result.ok) throw new Error(`${what}: ${result.error ?? 'request failed'}`);
  return result;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/);

// ── Leads and contacts ───────────────────────────────────────

const createLeadFromEnquiry: ActionDefinition = {
  type: 'create_lead_from_enquiry',
  label: 'Create lead',
  module: 'leads',
  permission: 'create',
  risk: 'medium',
  schema: z.object({
    contactId: z.string().optional().nullable(),
    name: z.string().max(120).optional().nullable(),
    phone: z.string().max(40).optional().nullable(),
    email: z.string().max(200).optional().nullable(),
    title: z.string().min(3).max(200),
    destinations: z.array(z.string().max(80)).max(12).default([]),
    travelDate: isoDate.optional().nullable(),
    returnDate: isoDate.optional().nullable(),
    paxAdults: z.number().int().min(1).max(500).default(1),
    paxChildren: z.number().int().min(0).max(500).default(0),
    budget: z.number().positive().optional().nullable(),
    tripType: z.string().max(40).optional().nullable(),
    specialRequirements: z.string().max(2000).optional().nullable(),
    source: z.string().max(40).default('whatsapp'),
    messageIds: z.array(z.string()).max(50).default([]),
  }),
  async execute(ctx, p): Promise<ActionResult> {
    let contactId: string | null = p.contactId ?? null;
    let contactCreated = false;
    let contactName = p.name ?? '';

    if (contactId) {
      const row = await ctx.db.prepare('SELECT name FROM contacts WHERE id = ?').bind(contactId).first<{ name: string }>();
      if (!row) throw new Error('The contact for this enquiry no longer exists');
      contactName = row.name;
    } else {
      const contact = await findOrCreateContact(ctx.db, {
        name: p.name,
        phone: p.phone,
        email: p.email,
        source: p.source,
        createdBy: ctx.actorId,
      });
      if (!contact) throw new Error('A name, phone number or email is needed to create the contact');
      contactId = contact.id;
      contactCreated = contact.created;
      contactName = contact.name;
    }

    const lead = await createLead(
      ctx.env,
      ctx.tenantId,
      ctx.db,
      {
        contactId,
        title: p.title,
        destinations: p.destinations,
        travelDate: p.travelDate ?? null,
        returnDate: p.returnDate ?? null,
        paxAdults: p.paxAdults,
        paxChildren: p.paxChildren,
        budget: p.budget ?? null,
        tripType: p.tripType ?? null,
        specialRequirements: p.specialRequirements ?? null,
        source: p.source,
        priority: 'hot',
        // The person who turns the enquiry into a lead owns it; automatic runs use the routing rules.
        assignedTo: ctx.automatic ? undefined : ctx.actorId,
      },
      {
        userId: ctx.actorId,
        activityNote: `Lead created from a ${p.source} enquiry by the assistant`,
        depth: ctx.depth + 1,
        eventPayload: { sourceMessageIds: p.messageIds },
      },
    );

    // The enquiry itself, and anything else that sender wrote before being a contact, joins the lead.
    const linked: string[] = [];
    for (const messageId of p.messageIds as string[]) {
      const row = await ctx.db
        .prepare(`SELECT id, from_address FROM message_log WHERE id = ? AND direction = 'incoming'`)
        .bind(messageId)
        .first<{ id: string; from_address: string | null }>();
      if (!row) continue;
      await ctx.db.prepare('UPDATE message_log SET contact_id = ?, lead_id = ? WHERE id = ?').bind(contactId, lead.id, row.id).run();
      linked.push(row.id);
      if (row.from_address) {
        const others = await ctx.db
          .prepare(`SELECT id FROM message_log WHERE from_address = ? AND direction = 'incoming' AND contact_id IS NULL`)
          .bind(row.from_address)
          .all<{ id: string }>();
        for (const other of others.results) {
          await ctx.db.prepare('UPDATE message_log SET contact_id = ?, lead_id = ? WHERE id = ?').bind(contactId, lead.id, other.id).run();
          linked.push(other.id);
        }
      }
    }

    // Other suggestions raised by the same messages now belong to the contact and lead.
    for (const messageId of linked) {
      await ctx.db
        .prepare(
          `UPDATE assistant_suggestions SET contact_id = ?, lead_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
           WHERE source_type = 'message' AND source_id = ? AND status = 'pending'`,
        )
        .bind(contactId, lead.id, messageId)
        .run();
    }

    return {
      entities: [
        { type: 'lead', id: lead.id, label: p.title },
        { type: 'contact', id: contactId, label: contactName },
      ],
      undo: { leadId: lead.id, contactId, contactCreated, messageIds: linked },
      summary: contactCreated ? `Created ${contactName} and the lead "${p.title}"` : `Created the lead "${p.title}" for ${contactName}`,
    };
  },
  async undo(ctx, u) {
    const now = new Date().toISOString();
    await ctx.db.prepare('UPDATE leads SET is_deleted = 1, updated_at = ? WHERE id = ?').bind(now, u.leadId).run();
    for (const messageId of (u.messageIds ?? []) as string[]) {
      await ctx.db
        .prepare('UPDATE message_log SET lead_id = NULL, contact_id = CASE WHEN ? = 1 THEN NULL ELSE contact_id END WHERE id = ?')
        .bind(u.contactCreated ? 1 : 0, messageId)
        .run();
    }
    if (u.contactCreated) {
      const other = await ctx.db
        .prepare('SELECT id FROM leads WHERE contact_id = ? AND COALESCE(is_deleted, 0) = 0 LIMIT 1')
        .bind(u.contactId)
        .first();
      if (!other) await ctx.db.prepare('UPDATE contacts SET is_deleted = 1, updated_at = ? WHERE id = ?').bind(now, u.contactId).run();
    }
  },
};

const LEAD_COLUMNS: Record<string, string> = {
  travelDate: 'travel_date',
  returnDate: 'return_date',
  paxAdults: 'pax_adults',
  paxChildren: 'pax_children',
  budget: 'budget',
  tripType: 'trip_type',
  specialRequirements: 'special_requirements',
};

const updateLead: ActionDefinition = {
  type: 'update_lead',
  label: 'Update lead',
  module: 'leads',
  permission: 'edit',
  risk: 'medium',
  schema: z.object({
    leadId: z.string().min(1),
    changes: z.object({
      destinations: z.array(z.string().max(80)).max(12).optional(),
      travelDate: isoDate.optional(),
      returnDate: isoDate.optional(),
      paxAdults: z.number().int().min(1).max(500).optional(),
      paxChildren: z.number().int().min(0).max(500).optional(),
      budget: z.number().positive().optional(),
      tripType: z.string().max(40).optional(),
      specialRequirements: z.string().max(2000).optional(),
    }),
  }),
  async execute(ctx, p) {
    const lead = await ctx.db
      .prepare('SELECT * FROM leads WHERE id = ? AND COALESCE(is_deleted, 0) = 0')
      .bind(p.leadId)
      .first<Record<string, unknown>>();
    if (!lead) throw new Error('This lead no longer exists');

    const sets: string[] = [];
    const values: unknown[] = [];
    const previous: Record<string, unknown> = {};
    const changed: string[] = [];

    for (const [field, value] of Object.entries(p.changes as Record<string, unknown>)) {
      if (value === undefined) continue;
      const column = field === 'destinations' ? 'destination' : LEAD_COLUMNS[field];
      if (!column) continue;
      const stored = field === 'destinations' ? JSON.stringify(value) : value;
      if (lead[column] === stored) continue;
      previous[column] = lead[column] ?? null;
      sets.push(`${column} = ?`);
      values.push(stored);
      changed.push(field);
    }
    if (sets.length === 0) return { entities: [{ type: 'lead', id: p.leadId }], summary: 'The lead already has these details' };

    await ctx.db
      .prepare(`UPDATE leads SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`)
      .bind(...values, new Date().toISOString(), p.leadId)
      .run();
    await ctx.db
      .prepare(`INSERT INTO lead_activities (id, lead_id, type, content, created_by) VALUES (?, ?, 'note', ?, ?)`)
      .bind(generateId(), p.leadId, `Lead updated by the assistant: ${changed.join(', ')}`, ctx.actorId)
      .run();

    return { entities: [{ type: 'lead', id: p.leadId }], undo: { leadId: p.leadId, previous }, summary: `Updated ${changed.join(', ')}` };
  },
  async undo(ctx, u) {
    const entries = Object.entries((u.previous ?? {}) as Record<string, unknown>);
    if (entries.length === 0) return;
    await ctx.db
      .prepare(`UPDATE leads SET ${entries.map(([column]) => `${column} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
      .bind(...entries.map(([, value]) => value), new Date().toISOString(), u.leadId)
      .run();
  },
};

const STAGE_ORDER = ['new', 'contacted', 'qualified', 'requirement_gathered', 'proposal_sent', 'negotiation', 'won'];

async function setLeadStatus(ctx: ActionContext, leadId: string, status: string): Promise<ActionResult> {
  const lead = await ctx.db
    .prepare('SELECT status, title FROM leads WHERE id = ? AND COALESCE(is_deleted, 0) = 0')
    .bind(leadId)
    .first<{ status: string; title: string }>();
  if (!lead) throw new Error('This lead no longer exists');

  // Never move a lead backwards, and leave closed leads alone.
  const from = STAGE_ORDER.indexOf(lead.status);
  const to = STAGE_ORDER.indexOf(status);
  if (from === -1 || from >= to) {
    return { entities: [{ type: 'lead', id: leadId, label: lead.title }], summary: `The lead is already ${lead.status.replace(/_/g, ' ')}` };
  }

  must(await ctx.api('PUT', `/leads/${leadId}/status`, { status }), 'Could not change the lead status');
  return {
    entities: [{ type: 'lead', id: leadId, label: lead.title }],
    undo: { leadId, previousStatus: lead.status },
    summary: `Moved to ${status.replace(/_/g, ' ')}`,
  };
}

async function restoreLeadStatus(ctx: ActionContext, u: { leadId: string; previousStatus?: string }): Promise<void> {
  if (!u.previousStatus) return;
  must(await ctx.api('PUT', `/leads/${u.leadId}/status`, { status: u.previousStatus }), 'Could not restore the lead status');
}

const advanceLeadStatus: ActionDefinition = {
  type: 'advance_lead_status',
  label: 'Move lead forward',
  module: 'leads',
  permission: 'edit',
  risk: 'low',
  schema: z.object({ leadId: z.string().min(1), status: z.enum(['contacted', 'qualified', 'proposal_sent']) }),
  execute: (ctx, p) => setLeadStatus(ctx, p.leadId, p.status),
  undo: restoreLeadStatus,
};

const markLeadWon: ActionDefinition = {
  type: 'mark_lead_won',
  label: 'Mark as won',
  module: 'leads',
  permission: 'edit',
  risk: 'medium',
  schema: z.object({ leadId: z.string().min(1) }),
  execute: (ctx, p) => setLeadStatus(ctx, p.leadId, 'won'),
  undo: restoreLeadStatus,
};

// ── Follow-ups and tasks ─────────────────────────────────────

const createFollowUp: ActionDefinition = {
  type: 'create_follow_up',
  label: 'Schedule follow-up',
  module: 'leads',
  permission: 'edit',
  risk: 'low',
  schema: z.object({
    leadId: z.string().min(1),
    scheduledAt: z.string().datetime(),
    type: z.enum(['call', 'email', 'whatsapp', 'visit', 'sms']).default('call'),
    notes: z.string().max(500).optional(),
  }),
  async execute(ctx, p) {
    const res = must(await ctx.api('POST', '/follow-ups', p), 'Could not schedule the follow-up');
    return { entities: [{ type: 'follow_up', id: res.data.id }], undo: { followUpId: res.data.id }, summary: 'Follow-up scheduled' };
  },
  async undo(ctx, u) {
    must(await ctx.api('DELETE', `/follow-ups/${u.followUpId}`), 'Could not remove the follow-up');
  },
};

const createTask: ActionDefinition = {
  type: 'create_task',
  label: 'Create task',
  module: 'tasks',
  permission: 'create',
  risk: 'low',
  schema: z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    dueDate: isoDate.optional(),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    assignedTo: z.string().optional().nullable(),
    relatedLeadId: z.string().optional().nullable(),
  }),
  async execute(ctx, p) {
    // Written directly so the task can belong to the lead owner rather than to whoever triggered it.
    const id = generateId();
    await ctx.db
      .prepare(
        `INSERT INTO tasks (id, title, description, status, priority, category, due_date, assigned_to, related_lead_id, created_by)
         VALUES (?, ?, ?, 'todo', ?, 'general', ?, ?, ?, ?)`,
      )
      .bind(id, p.title, p.description ?? null, p.priority, p.dueDate ?? null, p.assignedTo ?? ctx.actorId, p.relatedLeadId ?? null, ctx.actorId)
      .run();
    return { entities: [{ type: 'task', id, label: p.title }], undo: { taskId: id }, summary: `Task "${p.title}" created` };
  },
  async undo(ctx, u) {
    await ctx.db.prepare('DELETE FROM tasks WHERE id = ?').bind(u.taskId).run();
  },
};

// ── Quote to cash ────────────────────────────────────────────

const createItineraryFromTemplate: ActionDefinition = {
  type: 'create_itinerary_from_template',
  label: 'Create itinerary',
  module: 'itineraries',
  permission: 'create',
  risk: 'medium',
  schema: z.object({ templateId: z.string().min(1), leadId: z.string().min(1), title: z.string().min(1).max(200) }),
  async execute(ctx, p) {
    const res = must(await ctx.api('POST', '/itinerary-templates/create-from', p), 'Could not create the itinerary');
    return {
      entities: [{ type: 'itinerary', id: res.data.id, label: res.data.title ?? p.title }],
      undo: { itineraryId: res.data.id },
      summary: `Itinerary "${res.data.title ?? p.title}" created`,
    };
  },
  async undo(ctx, u) {
    must(await ctx.api('DELETE', `/itineraries/${u.itineraryId}`), 'Could not remove the itinerary');
  },
};

const createInvoiceFromItinerary: ActionDefinition = {
  type: 'create_invoice_from_itinerary',
  label: 'Create invoice',
  module: 'invoices',
  permission: 'create',
  risk: 'high',
  schema: z.object({ itineraryId: z.string().min(1) }),
  async execute(ctx, p) {
    const res = must(await ctx.api('POST', '/invoices/from-itinerary', p), 'Could not create the invoice');
    return {
      entities: [{ type: 'invoice', id: res.data.id, label: res.data.invoiceNumber }],
      undo: { invoiceId: res.data.id },
      summary: `Draft invoice ${res.data.invoiceNumber ?? ''} created`.trim(),
    };
  },
  async undo(ctx, u) {
    must(await ctx.api('DELETE', `/invoices/${u.invoiceId}`), 'Could not remove the invoice');
  },
};

const recordPayment: ActionDefinition = {
  type: 'record_payment',
  label: 'Record payment',
  module: 'payments',
  permission: 'create',
  risk: 'high',
  schema: z.object({
    invoiceId: z.string().min(1),
    amount: z.number().positive(),
    method: z.string().min(1).default('transfer'),
    reference: z.string().max(80).optional(),
    date: isoDate.optional(),
    notes: z.string().max(500).optional(),
  }),
  async execute(ctx, p) {
    const res = must(await ctx.api('POST', '/payments', p), 'Could not record the payment');
    return {
      entities: [
        { type: 'payment', id: res.data.id },
        { type: 'invoice', id: p.invoiceId },
      ],
      undo: { paymentId: res.data.id },
      summary: `Payment recorded; invoice is now ${String(res.data.invoiceStatus ?? '').replace(/_/g, ' ')}`.trim(),
    };
  },
  async undo(ctx, u) {
    must(await ctx.api('DELETE', `/payments/${u.paymentId}`), 'Could not remove the payment');
  },
};

const voucherDraft = z.object({
  type: z.enum(['hotel', 'transport', 'activity']),
  title: z.string().min(1).max(200),
  supplierId: z.string().optional().nullable(),
  details: z.record(z.string(), z.any()),
});

const createVouchers: ActionDefinition = {
  type: 'create_vouchers',
  label: 'Create vouchers',
  module: 'vouchers',
  permission: 'create',
  risk: 'medium',
  schema: z.object({ leadId: z.string().min(1), vouchers: z.array(voucherDraft).min(1).max(30) }),
  async execute(ctx, p) {
    const created: Array<{ id: string; title: string }> = [];
    try {
      for (const voucher of p.vouchers as Array<z.infer<typeof voucherDraft>>) {
        const res = must(
          await ctx.api('POST', '/vouchers', { leadId: p.leadId, type: voucher.type, title: voucher.title, supplierId: voucher.supplierId ?? null, details: voucher.details }),
          `Could not create the voucher "${voucher.title}"`,
        );
        created.push({ id: res.data.id, title: voucher.title });
      }
    } catch (err) {
      // All or nothing: a half-made set of vouchers is worse than none.
      for (const voucher of created) await ctx.api('DELETE', `/vouchers/${voucher.id}`);
      throw err;
    }
    return {
      entities: created.map((v) => ({ type: 'voucher', id: v.id, label: v.title })),
      undo: { voucherIds: created.map((v) => v.id) },
      summary: `${created.length} draft voucher${created.length === 1 ? '' : 's'} created`,
    };
  },
  async undo(ctx, u) {
    for (const id of (u.voucherIds ?? []) as string[]) {
      must(await ctx.api('DELETE', `/vouchers/${id}`), 'Could not remove a voucher');
    }
  },
};

// ── Messages ─────────────────────────────────────────────────

/**
 * A drafted message. Sending always goes through the Communication Hub dialog on the
 * client, where the person reads and edits it first; the server only records that it was used.
 */
const draftReply: ActionDefinition = {
  type: 'draft_reply',
  label: 'Review and send',
  module: 'communications',
  permission: 'create',
  risk: 'medium',
  clientHandled: true,
  schema: z.object({
    contactId: z.string().min(1),
    leadId: z.string().optional().nullable(),
    channel: z.enum(['whatsapp', 'sms', 'email']),
    subject: z.string().max(200).optional().nullable(),
    body: z.string().min(1).max(4000),
  }),
  async execute(_ctx, p) {
    return { entities: [{ type: 'contact', id: p.contactId }], summary: 'Message sent' };
  },
};

/**
 * Opens one of the app's own forms with the values worked out. Used where a step needs facts only a person
 * has (a flight time, a pickup point): nothing is created until they save the form.
 */
const openPrefilledForm: ActionDefinition = {
  type: 'open_prefilled_form',
  label: 'Open form',
  module: 'fleet',
  permission: 'create',
  risk: 'medium',
  clientHandled: true,
  schema: z.object({
    // Only in-app paths: a suggestion can never send someone to another site.
    href: z.string().regex(/^\/[a-z0-9\-/]*(\?[^#\s]*)?$/i).max(1000),
    buttonLabel: z.string().min(1).max(40),
    details: z.array(z.object({ label: z.string().max(40), value: z.string().max(200) })).max(8).default([]),
  }),
  async execute() {
    return { entities: [], summary: 'Form opened' };
  },
};

const linkMessageToLead: ActionDefinition = {
  type: 'link_message_to_lead',
  label: 'Link to lead',
  module: 'leads',
  permission: 'edit',
  risk: 'low',
  schema: z.object({ messageId: z.string().min(1), leadId: z.string().min(1) }),
  async execute(ctx, p) {
    const message = await ctx.db.prepare('SELECT lead_id FROM message_log WHERE id = ?').bind(p.messageId).first<{ lead_id: string | null }>();
    if (!message) throw new Error('This message no longer exists');
    await ctx.db.prepare('UPDATE message_log SET lead_id = ? WHERE id = ?').bind(p.leadId, p.messageId).run();
    return { entities: [{ type: 'lead', id: p.leadId }], undo: { messageId: p.messageId, previousLeadId: message.lead_id }, summary: 'Message linked to the lead' };
  },
  async undo(ctx, u) {
    await ctx.db.prepare('UPDATE message_log SET lead_id = ? WHERE id = ?').bind(u.previousLeadId ?? null, u.messageId).run();
  },
};

export const ACTIONS: Record<string, ActionDefinition> = Object.fromEntries(
  [
    createLeadFromEnquiry,
    updateLead,
    advanceLeadStatus,
    markLeadWon,
    createFollowUp,
    createTask,
    createItineraryFromTemplate,
    createInvoiceFromItinerary,
    recordPayment,
    createVouchers,
    draftReply,
    openPrefilledForm,
    linkMessageToLead,
  ].map((action) => [action.type, action]),
);
