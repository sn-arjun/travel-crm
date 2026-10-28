import type { Env } from '../../types';
import { normalizePhone, tenantPhoneCountry } from '../../utils/phone';
import { loadLocaleContext } from '../../utils/money';
import { textLanguage, t } from '../../i18n';
import { findOrCreateContact } from './contacts';
import { createLead } from './leads';
import { emitEvent } from '../automation/events';
import { grantMarketing, latestMarketingConsent, recordConsent } from '../privacy/consent';

// ── The agency's setting: when and what the website chat asks for (design 4.8) ──

export const CAPTURE_MODES = ['off', 'before_chat', 'after_first_reply', 'before_handoff'] as const;
export type CaptureMode = (typeof CAPTURE_MODES)[number];
export const CAPTURE_FIELD_NAMES = ['name', 'email', 'phone'] as const;
export type CaptureFieldName = (typeof CAPTURE_FIELD_NAMES)[number];
export type CaptureFieldState = 'required' | 'optional' | 'hidden';
export const CAPTURE_LABEL_KEYS = ['title', 'name', 'email', 'phone', 'consent', 'marketing', 'submit', 'skip'] as const;
export type CaptureLabelKey = (typeof CAPTURE_LABEL_KEYS)[number];

export interface ContactCaptureConfig {
  mode: CaptureMode;
  fields: Record<CaptureFieldName, CaptureFieldState>;
  requireOneOf: Array<'email' | 'phone'>;
  consentText: string;
  marketingOptIn: boolean;
  autoCreateLead: boolean;
  /** Wording the agency chose; a label left out reads from the backend texts in the agency's language. */
  labels: Partial<Record<CaptureLabelKey, string>>;
}

export const DEFAULT_CONTACT_CAPTURE: ContactCaptureConfig = {
  mode: 'off',
  fields: { name: 'optional', email: 'optional', phone: 'optional' },
  requireOneOf: ['email', 'phone'],
  consentText: '',
  marketingOptIn: false,
  autoCreateLead: false,
  labels: {},
};

const MAX_LABEL = 160;
const MAX_CONSENT_TEXT = 600;

/** Anything stored or submitted -> a complete, safe config. Unknown values fall back to the defaults. */
export function normalizeContactCapture(input: unknown): ContactCaptureConfig {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const d = DEFAULT_CONTACT_CAPTURE;
  const mode = (CAPTURE_MODES as readonly string[]).includes(raw.mode as string) ? (raw.mode as CaptureMode) : d.mode;

  const rawFields = raw.fields && typeof raw.fields === 'object' ? (raw.fields as Record<string, unknown>) : {};
  const fields = { ...d.fields };
  for (const name of CAPTURE_FIELD_NAMES) {
    const v = rawFields[name];
    if (v === 'required' || v === 'optional' || v === 'hidden') fields[name] = v;
  }

  const rawOne = Array.isArray(raw.requireOneOf) ? raw.requireOneOf : d.requireOneOf;
  const requireOneOf = Array.from(new Set(rawOne.filter((f): f is 'email' | 'phone' => f === 'email' || f === 'phone')));

  const labels: ContactCaptureConfig['labels'] = {};
  if (raw.labels && typeof raw.labels === 'object') {
    for (const key of CAPTURE_LABEL_KEYS) {
      const v = (raw.labels as Record<string, unknown>)[key];
      if (typeof v === 'string' && v.trim()) labels[key] = v.trim().slice(0, MAX_LABEL);
    }
  }

  return {
    mode,
    fields,
    requireOneOf,
    consentText: typeof raw.consentText === 'string' ? raw.consentText.trim().slice(0, MAX_CONSENT_TEXT) : '',
    marketingOptIn: raw.marketingOptIn === true,
    autoCreateLead: raw.autoCreateLead === true,
    labels,
  };
}

/** The stored JSON column -> config (NULL or broken JSON means off). */
export function parseContactCapture(stored: string | null | undefined): ContactCaptureConfig {
  if (!stored) return DEFAULT_CONTACT_CAPTURE;
  try {
    return normalizeContactCapture(JSON.parse(stored));
  } catch {
    return DEFAULT_CONTACT_CAPTURE;
  }
}

/** The language the widget's own words are written in: the agency's locale when it is nl, else English. */
async function agencyTextLanguage(db: D1Database): Promise<'en' | 'nl'> {
  try {
    return textLanguage((await loadLocaleContext(db)).locale.split('-')[0]);
  } catch {
    return 'en';
  }
}

/** What the widget needs to render the form: nothing but wording and which fields to show. Null when the setting is off. */
export async function publicCaptureConfig(db: D1Database, cfg: ContactCaptureConfig) {
  if (cfg.mode === 'off') return null;
  const lang = await agencyTextLanguage(db);
  const label = (key: CaptureLabelKey) => cfg.labels[key] ?? t(lang, `chatCapture.${key}`);
  return {
    mode: cfg.mode,
    fields: cfg.fields,
    requireOneOf: cfg.requireOneOf.filter((f) => cfg.fields[f] !== 'hidden'),
    consentText: cfg.consentText || label('consent'),
    marketingOptIn: cfg.marketingOptIn,
    labels: {
      title: label('title'),
      name: label('name'),
      email: label('email'),
      phone: label('phone'),
      marketing: label('marketing'),
      submit: label('submit'),
      skip: label('skip'),
      error: t(lang, 'chatCapture.error'),
    },
  };
}

// ── Validating what the visitor typed ──

export interface CapturedDetails {
  name: string | null;
  email: string | null;
  phone: string | null;
}
export type CaptureValidation = { ok: true; details: CapturedDetails } | { ok: false; error: string; field?: CaptureFieldName };

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateCapturedDetails(
  cfg: ContactCaptureConfig,
  input: { name?: unknown; email?: unknown; phone?: unknown },
  phoneCountry: string,
): CaptureValidation {
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const given: CapturedDetails = {
    name: cfg.fields.name === 'hidden' ? null : text(input.name, 120) || null,
    email: cfg.fields.email === 'hidden' ? null : text(input.email, 200).toLowerCase() || null,
    phone: null,
  };
  if (cfg.fields.phone !== 'hidden') {
    const rawPhone = text(input.phone, 40);
    if (rawPhone) {
      const e164 = normalizePhone(rawPhone, phoneCountry);
      const digits = e164.replace(/\D/g, '');
      if (digits.length < 6 || digits.length > 15) return { ok: false, error: 'Enter a valid phone number', field: 'phone' };
      given.phone = e164;
    }
  }
  if (given.email && !EMAIL_SHAPE.test(given.email)) return { ok: false, error: 'Enter a valid email address', field: 'email' };

  for (const name of CAPTURE_FIELD_NAMES) {
    if (cfg.fields[name] === 'required' && !given[name]) return { ok: false, error: `${name[0].toUpperCase()}${name.slice(1)} is required`, field: name };
  }
  const oneOf = cfg.requireOneOf.filter((f) => cfg.fields[f] !== 'hidden');
  if (oneOf.length > 0 && !oneOf.some((f) => given[f])) {
    return { ok: false, error: `Add your ${oneOf.join(' or ')} so the agency can reach you`, field: oneOf[0] };
  }
  return { ok: true, details: given };
}

// ── Consent rows ──

interface ConversationRow {
  id: string;
  channel: string;
  contact_id?: string | null;
  lead_id?: string | null;
  visitor_name?: string | null;
  visitor_email?: string | null;
  visitor_phone?: string | null;
  qualification_data?: string | null;
  contact_consent_at?: string | null;
  contact_consent_text?: string | null;
  contact_marketing_opt_in?: number | null;
}

/**
 * Turns the consent the visitor gave in the chat into consent rows on the contact (source 'chatbot'). Once per conversation.
 * Agreement to be contacted about the enquiry is a 'service' record; a 'marketing' grant is written only when the visitor ticked
 * the box, and never over an unsubscribe the contact already made (someone could type another person's number).
 */
export async function recordConversationConsent(db: D1Database, conv: ConversationRow, contactId: string): Promise<void> {
  if (!conv.contact_consent_at) return;
  const mark = `%"conversationId":"${conv.id.replace(/[^A-Za-z0-9-]/g, '')}"%`;
  const done = await db
    .prepare(`SELECT 1 AS x FROM contact_consents WHERE contact_id = ? AND source = 'chatbot' AND evidence LIKE ? LIMIT 1`)
    .bind(contactId, mark)
    .first();
  if (done) return;

  const evidence = { conversationId: conv.id, text: conv.contact_consent_text ?? '', capturedAt: conv.contact_consent_at, via: 'website_chat' };
  await recordConsent(db, { contactId, channel: 'any', purpose: 'service', status: 'granted', source: 'chatbot', evidence });
  if (conv.contact_marketing_opt_in) {
    const contact = await db.prepare('SELECT opted_out FROM contacts WHERE id = ?').bind(contactId).first<{ opted_out: number | null }>();
    const withdrawn = contact?.opted_out || (await latestMarketingConsent(db, contactId, 'any')) === 'withdrawn';
    if (!withdrawn) await grantMarketing(db, contactId, 'any', 'chatbot', { evidence });
  }
}

// ── Lead from a conversation (staff click or automatic) ──

export type ConversationLeadResult =
  | { ok: true; leadId: string; contactId: string | null; created: boolean }
  | { ok: false; status: 404 | 400; error: string };

/**
 * One conversation yields at most one lead. The contact is the linked one, else the one that owns the visitor's phone or
 * email, else a new customer made from what the visitor told us. `userId` is the staff member who clicked (null = automatic;
 * the lead is then assigned by the agency's normal rules).
 */
export async function createLeadFromConversation(
  env: Env,
  tenantId: string,
  db: D1Database,
  conversationId: string,
  actor: { userId: string | null; clientIp?: string; waiter?: { waitUntil(p: Promise<unknown>): void } },
): Promise<ConversationLeadResult> {
  const conv = await db.prepare(`SELECT * FROM chatbot_conversations WHERE id = ?`).bind(conversationId).first<ConversationRow>();
  if (!conv) return { ok: false, status: 404, error: 'Conversation not found' };

  // Idempotent: a conversation yields at most one lead.
  if (conv.lead_id) return { ok: true, leadId: conv.lead_id, contactId: conv.contact_id ?? null, created: false };

  let qualData: Record<string, unknown> = {};
  try {
    qualData = conv.qualification_data ? JSON.parse(conv.qualification_data) : {};
  } catch {
    qualData = {};
  }
  const now = new Date().toISOString();

  const visitorName = typeof conv.visitor_name === 'string' ? conv.visitor_name.trim() : '';
  const visitorEmail = typeof conv.visitor_email === 'string' ? conv.visitor_email.trim().toLowerCase() : '';
  const phoneCountry = await tenantPhoneCountry(db);
  const visitorPhone = typeof conv.visitor_phone === 'string' ? normalizePhone(conv.visitor_phone, phoneCountry) : '';

  let contactId: string | null = conv.contact_id || null;
  if (!contactId) {
    const contact = await findOrCreateContact(db, {
      name: visitorName,
      phone: visitorPhone,
      email: visitorEmail,
      source: conv.channel === 'whatsapp' ? 'whatsapp' : 'website',
      createdBy: actor.userId,
    });
    if (!contact) return { ok: false, status: 400, error: "Add the visitor's name, phone or email before creating a lead" };
    contactId = contact.id;
  }

  const destination = typeof qualData.destination === 'string' ? qualData.destination.trim() : '';
  const travelers = Number(qualData.travelers);
  const budget = qualData.budget != null ? parseFloat(String(qualData.budget).replace(/[^0-9.]/g, '')) : NaN;
  const channelLabel = conv.channel === 'whatsapp' ? 'WhatsApp' : 'Website';

  const lead = await createLead(
    env,
    tenantId,
    db,
    {
      contactId,
      title: `${channelLabel} enquiry: ${destination || visitorName || 'new visitor'}`,
      destinations: destination ? [destination] : [],
      paxAdults: Number.isFinite(travelers) && travelers > 0 ? Math.round(travelers) : 1,
      budget: Number.isFinite(budget) && budget > 0 ? budget : null,
      source: conv.channel === 'whatsapp' ? 'whatsapp' : 'website',
      priority: 'warm',
      // A person who clicks keeps the lead; an automatic one goes through the normal assignment rules.
      assignedTo: actor.userId ?? undefined,
      notes: `Created from a ${channelLabel} chatbot conversation.`,
    },
    {
      userId: actor.userId,
      clientIp: actor.clientIp,
      activityNote: `Created from a ${channelLabel} chatbot conversation${actor.userId ? '' : ' automatically'}`,
      waiter: actor.waiter,
    },
  );

  await db
    .prepare(`UPDATE chatbot_conversations SET lead_id = ?, contact_id = ?, status = 'qualified', updated_at = ? WHERE id = ?`)
    .bind(lead.id, contactId, now, conversationId)
    .run();

  await recordConversationConsent(db, conv, contactId);

  return { ok: true, leadId: lead.id, contactId, created: true };
}

/** Announce that a visitor left contact details in a chat. Ids and flags only, no personal data. */
export async function emitContactCaptured(
  env: Env,
  tenantId: string,
  db: D1Database,
  conversationId: string,
  details: CapturedDetails,
  marketingOptIn: boolean,
  waiter?: { waitUntil(p: Promise<unknown>): void },
): Promise<void> {
  await emitEvent(
    env,
    tenantId,
    db,
    {
      type: 'chatbot.contact_captured',
      entityType: 'chatbot_conversation',
      entityId: conversationId,
      payload: { conversationId, hasName: !!details.name, hasEmail: !!details.email, hasPhone: !!details.phone, marketingOptIn },
    },
    waiter,
  );
}
