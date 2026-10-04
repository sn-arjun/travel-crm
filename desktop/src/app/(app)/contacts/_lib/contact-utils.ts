import { formatCurrency } from '@/lib/utils';
import type { ContactTimeline } from '@/lib/api/contacts';

const LAKH = 100_000;
const CRORE = 10_000_000;

/** Money for stat tiles: exact for small amounts, compact lakhs/crores from 1 lakh up. */
export function formatRevenue(amount: number | null | undefined, currency = 'INR'): string {
  const value = Number.isFinite(amount) ? Number(amount) : 0;
  if (currency !== 'INR' || Math.abs(value) < LAKH) return formatCurrency(value, currency);
  if (Math.abs(value) >= CRORE) return `₹${trimZero(value / CRORE)} Cr`;
  return `₹${trimZero(value / LAKH)} L`;
}

function trimZero(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, '');
}

/** Country calling codes the PhoneInput offers, longest first so +971 wins over +9. */
const CALLING_CODES = [
  '+91', '+1', '+44', '+971', '+966', '+65', '+66', '+60', '+61', '+49', '+33', '+86', '+81',
  '+82', '+7', '+55', '+27', '+234', '+254', '+62', '+63', '+84', '+34', '+39', '+90', '+20',
  '+94', '+977', '+880', '+92',
].sort((a, b) => b.length - a.length);

/** Splits a stored phone number ("+919845023117") into the picker code and the national digits. */
export function splitPhone(phone: string | null | undefined): { countryCode: string; national: string } {
  const raw = (phone ?? '').trim();
  if (!raw) return { countryCode: '+91', national: '' };
  if (raw.startsWith('+')) {
    const compact = `+${raw.replace(/\D/g, '')}`;
    const code = CALLING_CODES.find((c) => compact.startsWith(c));
    if (code) return { countryCode: code, national: compact.slice(code.length) };
  }
  return { countryCode: '+91', national: raw.replace(/\D/g, '').replace(/^0+/, '') };
}

/** Joins the picker code and national digits back into the stored form. */
export function joinPhone(countryCode: string, national: string): string | null {
  const digits = national.replace(/\D/g, '').replace(/^0+/, '');
  return digits ? `${countryCode}${digits}` : null;
}

const INTERACTION_ACTIONS = /note|call|email|message|whatsapp|sms|meeting/i;

/**
 * The most recent real interaction at or before now: a sent message, or a logged
 * note/call/meeting. Creation, edits and future-dated rows never count.
 */
export function lastInteractionAt(timeline: ContactTimeline[], now: number = Date.now()): string | null {
  let best: number | null = null;
  for (const entry of timeline) {
    const counts =
      entry.type === 'message' || (entry.type === 'activity' && INTERACTION_ACTIONS.test(entry.title ?? ''));
    if (!counts) continue;
    const ts = Date.parse(entry.createdAt);
    if (Number.isNaN(ts) || ts > now) continue;
    if (best === null || ts > best) best = ts;
  }
  return best === null ? null : new Date(best).toISOString();
}

export type StatusTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const LEAD_TONES: Record<string, StatusTone> = {
  new: 'info',
  contacted: 'primary',
  qualified: 'info',
  proposal_sent: 'warning',
  negotiation: 'warning',
  won: 'success',
  lost: 'danger',
  on_hold: 'neutral',
};

const INVOICE_TONES: Record<string, StatusTone> = {
  paid: 'success',
  partial: 'warning',
  partially_paid: 'warning',
  sent: 'info',
  pending: 'warning',
  draft: 'neutral',
  overdue: 'danger',
  void: 'neutral',
  cancelled: 'neutral',
};

export function leadTone(status: string): StatusTone {
  return LEAD_TONES[status] ?? 'neutral';
}

export function invoiceTone(status: string): StatusTone {
  return INVOICE_TONES[status] ?? 'neutral';
}

export function humanize(value: string | null | undefined): string {
  if (!value) return '';
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
