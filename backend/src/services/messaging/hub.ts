/**
 * The Communication Hub domain sender (R154).
 *
 * Everything that puts one outbound message on the queue for one person goes through sendHubMessage: the staff route
 * POST /communications/send and the departure-relative messages job. It finds the destination, takes one unit of the agency's
 * allowance (throws AllowanceExhausted at the cap), writes the message_log row and queues the delivery job. The consent rule lives
 * here too: a `marketing` message is refused when marketingBlockedReason says so, a `service` message only when the address is
 * missing or the email is known to be undeliverable.
 */

import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import type { Env } from '../../types';
import { contacts, messageLog, messageTemplates } from '../../db/tenant-schema';
import { generateId } from '../../utils/uuid';
import { substituteVariables } from '../template-engine';
import { marketingBlockedReason } from '../privacy/consent';
import { resolveReplyTo } from '../mail/delivery';
import {
  insideFreeWhatsAppWindow,
  meterUsage,
  refundUsage,
  whatsappMeterChannel,
  type MeterChannel,
} from '../metering/meter';
import { metaCategoryForTemplate, whatsappTemplateJob } from './whatsapp-sender';

export type HubChannel = 'whatsapp' | 'sms' | 'email';
export type HubPurpose = 'service' | 'marketing';

/** Why nothing was queued. `status` is the HTTP answer the staff route gives for it. */
export class HubError extends Error {
  constructor(
    readonly code: 'contact_not_found' | 'template_not_found' | 'no_phone' | 'no_email' | 'no_content' | 'opted_out' | 'email_undeliverable',
    message: string,
    readonly status: 400 | 404 = 400,
  ) {
    super(message);
    this.name = 'HubError';
  }
}

export interface HubMessageInput {
  /** The contact the message belongs to. Optional only for a recipient without a contact record (then `to` is required). */
  contactId?: string | null;
  leadId?: string | null;
  channel: HubChannel;
  /** A saved template: its content and subject get the variables substituted. */
  templateId?: string | null;
  /** Free text, used when there is no template. */
  body?: string | null;
  subject?: string | null;
  /** Values for {placeholders} in a template body or subject. */
  variables?: Record<string, string | null | undefined>;
  purpose?: HubPurpose;
  /** The user who sends; null for an automatic send. */
  actorId?: string | null;
  mediaUrl?: string | null;
  /** Overrides the contact's address (a passenger with an address of their own). */
  to?: string | null;
  /** Extra JSON stored with the log row. */
  metadata?: Record<string, unknown> | null;
  /** Fallback subject for an email without one. */
  defaultSubject?: string;
  /** Refuse an email to an address that hard-bounced before (automatic sends; the queue suppresses it later anyway). */
  blockUndeliverable?: boolean;
}

export interface HubSendResult {
  messageId: string;
  channel: HubChannel;
  to: string;
}

/**
 * Take one unit of the agency's allowance for an outbound message before it is queued (R110).
 * Returns the metered channel (the queue refunds it if the provider rejects the send), or null when nothing was
 * taken: a free-form WhatsApp reply inside the 24 hour window the contact opened is free.
 * Throws AllowanceExhausted at the cap.
 */
export async function meterOutboundMessage(
  env: Env,
  tenantId: string,
  db: D1Database,
  channel: HubChannel,
  opts: { contactId?: string | null; template?: boolean; templateCategory?: string | null } = {},
): Promise<MeterChannel | null> {
  if (channel === 'whatsapp' && !opts.template && opts.contactId && (await insideFreeWhatsAppWindow(db, opts.contactId))) {
    return null;
  }
  // R130: a marketing template takes the marketing WhatsApp allowance, everything else paid the utility one.
  const meterChannel: MeterChannel =
    channel === 'whatsapp' ? whatsappMeterChannel(opts.template ? metaCategoryForTemplate(opts.templateCategory) : 'utility') : channel;
  await meterUsage(env, tenantId, meterChannel);
  return meterChannel;
}

/**
 * Queue one message. Throws HubError (nothing metered, nothing written) or AllowanceExhausted (nothing written).
 * A failed enqueue after metering gives the unit back.
 */
export async function sendHubMessage(env: Env, tenantId: string, tenantDb: D1Database, input: HubMessageInput): Promise<HubSendResult> {
  const db = drizzle(tenantDb);
  const purpose: HubPurpose = input.purpose ?? 'service';

  // The recipient
  let destination = input.to?.trim() || '';
  let undeliverable = false;
  if (input.contactId) {
    const contact = await db.select().from(contacts).where(eq(contacts.id, input.contactId)).limit(1).then((rows) => rows[0]);
    if (!contact) throw new HubError('contact_not_found', 'Contact not found', 404);
    undeliverable = !!contact.emailUndeliverable && !input.to;
    if (!destination) {
      if (input.channel === 'email') {
        destination = contact.email || '';
        if (!destination) throw new HubError('no_email', 'Contact has no email address');
      } else {
        destination = contact.phone || '';
        if (!destination) throw new HubError('no_phone', 'Contact has no phone number');
      }
    }
  } else if (!destination) {
    throw new HubError(input.channel === 'email' ? 'no_email' : 'no_phone', input.channel === 'email' ? 'Recipient has no email address' : 'Recipient has no phone number');
  }

  // Consent
  if (purpose === 'marketing') {
    const reason = await marketingBlockedReason(tenantDb, input.contactId ?? null, input.channel);
    if (reason) throw new HubError('opted_out', `Marketing message blocked: ${reason}`);
  } else if (input.blockUndeliverable && input.channel === 'email' && undeliverable) {
    throw new HubError('email_undeliverable', 'The email address of this contact bounces');
  }

  // The content
  let template: typeof messageTemplates.$inferSelect | undefined;
  if (input.templateId) {
    template = await db.select().from(messageTemplates).where(eq(messageTemplates.id, input.templateId)).limit(1).then((rows) => rows[0]);
    if (!template) throw new HubError('template_not_found', 'Template not found', 404);
  }
  const variables = input.variables ?? {};
  const content = template ? substituteVariables(template.content, variables) : (input.body ?? '');
  if (!content) throw new HubError('no_content', 'The message is empty');
  const subject = template?.subject ? substituteVariables(template.subject, variables) : (input.subject ?? null);

  const metered = await meterOutboundMessage(env, tenantId, tenantDb, input.channel, {
    contactId: input.contactId,
    template: !!template,
    templateCategory: template?.category,
  });

  const messageId = generateId();
  const now = new Date().toISOString();
  try {
    await db.insert(messageLog).values({
      id: messageId,
      contactId: input.contactId ?? null,
      leadId: input.leadId || null,
      channel: input.channel,
      templateId: template?.id ?? null,
      subject,
      content,
      mediaUrl: input.mediaUrl ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      status: 'queued',
      externalId: null,
      errorMessage: null,
      sentBy: input.actorId ?? null,
      sentAt: null,
      deliveredAt: null,
      readAt: null,
      createdAt: now,
    });

    const replyTo = input.channel === 'email' ? await resolveReplyTo(env, tenantDb, tenantId, input.actorId, { contactId: input.contactId, leadId: input.leadId }) : undefined;

    await env.SMS_QUEUE.send({
      type: input.channel === 'email' ? 'email' : 'sms',
      data: {
        to: destination,
        ...(input.channel === 'email' && { subject: subject || input.defaultSubject || 'Message', html: content, replyTo }),
        ...(input.channel !== 'email' && { body: content }),
        messageLogId: messageId,
        contactId: input.contactId ?? undefined,
        tenantId,
        channel: input.channel,
        metered: true,
        refundOnFailure: metered !== null,
        ...(metered && { meterChannel: metered }),
        ...(input.mediaUrl && { mediaUrl: input.mediaUrl }),
        ...(input.channel === 'whatsapp' && template && { whatsappTemplate: whatsappTemplateJob(template, variables) }),
      },
    });
  } catch (err) {
    if (metered) await refundUsage(env, tenantId, metered);
    throw err;
  }

  return { messageId, channel: input.channel, to: destination };
}
