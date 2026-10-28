import { client } from './client';
import { unwrapEntity } from './envelope';

// Messages sent N days before or after a departure (R154 API): the rules, a preview per person, and "send now".

export type RuleChannel = 'preferred' | 'whatsapp' | 'email' | 'sms';
export type FallbackChannel = 'whatsapp' | 'email' | 'sms';
export type RuleAnchor = 'start' | 'end' | 'extras_cutoff';
export type RuleAudience = 'confirmed' | 'confirmed_and_held' | 'waitlisted';
export type RuleRecipient = 'booking_contact' | 'each_passenger_with_contact';
export type RulePurpose = 'service' | 'marketing';
export type RuleMode = 'auto' | 'suggest';
export type SendOutcome = 'send' | 'sent' | 'suggested' | 'skipped_opt_out' | 'skipped_cap' | 'skipped_no_address' | 'failed';

export interface MessageRule {
  id: string;
  /** Null for a rule of the whole agency. */
  tourId: string | null;
  name: string;
  templateId: string | null;
  templateName: string | null;
  channel: RuleChannel;
  fallbackChannel: FallbackChannel | null;
  anchor: RuleAnchor;
  offsetDays: number;
  localTime: string | null;
  audience: RuleAudience;
  recipient: RuleRecipient;
  purpose: RulePurpose;
  mode: RuleMode;
  isActive: boolean;
}

export interface MessageRuleInput {
  tourId?: string | null;
  name: string;
  templateId: string | null;
  channel: RuleChannel;
  fallbackChannel: FallbackChannel | null;
  anchor: RuleAnchor;
  offsetDays: number;
  localTime: string | null;
  audience: RuleAudience;
  recipient: RuleRecipient;
  purpose: RulePurpose;
  mode: RuleMode;
  isActive: boolean;
}

export interface PreviewItem {
  bookingId: string;
  passengerId: string | null;
  name: string;
  channel: 'whatsapp' | 'sms' | 'email' | null;
  to: string | null;
  subject: string | null;
  body: string;
  outcome: SendOutcome;
  detail: string | null;
  sentStatus: SendOutcome | null;
}

export interface RulePreview {
  /** The moment the rule sends on this departure (UTC ISO), null when the rule has no template. */
  dueAt: string | null;
  items: PreviewItem[];
}

export interface SendSummary {
  sent: number;
  suggested: number;
  skipped_opt_out: number;
  skipped_cap: number;
  skipped_no_address: number;
  failed: number;
  already: number;
}

export const departureMessagesApi = {
  /** `tourId`: the agency rules and the rules of that tour. `scope: 'agency'`: the agency rules only. */
  list: async (params: { tourId?: string; scope?: 'agency' | 'all' } = {}) =>
    unwrapEntity<MessageRule[]>(await client.get<unknown>('/departure-message-rules', { params })),

  create: async (input: MessageRuleInput) => unwrapEntity<MessageRule>(await client.post<unknown>('/departure-message-rules', input)),

  update: async (id: string, input: Partial<MessageRuleInput>) =>
    unwrapEntity<MessageRule>(await client.put<unknown>(`/departure-message-rules/${id}`, input)),

  remove: async (id: string) => unwrapEntity<{ id: string }>(await client.delete<unknown>(`/departure-message-rules/${id}`)),

  /** What the rule would send on a departure, person by person. Nothing is sent. */
  preview: async (id: string, departureId: string) =>
    unwrapEntity<RulePreview>(await client.post<unknown>(`/departure-message-rules/${id}/preview`, undefined, { params: { departureId } })),

  /** Sends the rule to everyone on the departure who has not been messaged yet. */
  send: async (id: string, departureId: string) =>
    unwrapEntity<SendSummary>(await client.post<unknown>(`/departure-message-rules/${id}/send`, { departureId })),
};
