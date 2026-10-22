'use client';

import * as React from 'react';

import { Alert, AlertDescription, Button, Checkbox, Input, Spinner, Textarea } from '@/components/ui';
import { E164PhoneInput } from '@/components/ui/phone-input';
import { getApiBaseUrl } from '@/lib/api/config';
import {
  buildBookingRequest, collects, initialParty, mayWaitlist, quote, validateContact, validateParty,
  type FieldProblem, type PartyMember, type PublicPage,
} from '@/lib/booking-form';
import { useI18n } from '@/lib/i18n';
import { Field, brandStyle } from './booking-ui';
import type { BookingResult } from './confirmation';
import { PartyBuilder } from './party-builder';
import { PassengerCard } from './passenger-card';
import { PriceSummary } from './price-summary';
import { TurnstileWidget } from './turnstile';

interface BookingFormProps {
  page: PublicPage;
  token: string;
  onBooked: (result: BookingResult) => void;
  /** The page changed under the visitor (the departure closed, the form token ran out): read it again. */
  onStale: () => void;
  /** The seats shown on the page after a refused booking. */
  onSeats: (seats: PublicPage['seats']) => void;
}

/** Answer of a refused booking: `{ success: false, error: { code, message, field?, errors?, seats? } }`. */
interface ApiRefusal {
  code?: string;
  message?: string;
  field?: string;
  errors?: Array<{ index: number; field: string }>;
  seats?: PublicPage['seats'];
}

/** The booking form: party, travellers, contact, terms, the price and the send button. */
export function BookingForm({ page, token, onBooked, onStale, onSeats }: BookingFormProps) {
  const { t, locale } = useI18n();
  const [party, setParty] = React.useState<PartyMember[]>(() => initialParty(page));
  const [contact, setContact] = React.useState({ name: '', email: '', phone: '' });
  const [notes, setNotes] = React.useState('');
  const [acceptTerms, setAcceptTerms] = React.useState(false);
  const [marketingOptIn, setMarketingOptIn] = React.useState(false);
  const [showTerms, setShowTerms] = React.useState(false);
  const [website, setWebsite] = React.useState('');
  const [captchaToken, setCaptchaToken] = React.useState('');
  const [problems, setProblems] = React.useState<FieldProblem[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  // One key per attempt: a double click or a retry after a lost connection sends the same key, so the agency gets one booking.
  const idempotencyKey = React.useRef<string>(newKey());

  const q = React.useMemo(() => quote(page, party), [page, party]);
  const waitlist = mayWaitlist(page.seats, party.length);

  const updateMember = (index: number, patch: Partial<PartyMember>) => {
    setParty((p) => p.map((m, i) => (i === index ? { ...m, ...patch } : m)));
    setProblems((list) => list.filter((x) => !(x.index === index && patchTouches(x.field, patch))));
  };

  const contactError = (field: string) => {
    const p = problems.find((x) => x.index === -1 && x.field === field);
    return p ? t(p.key) : undefined;
  };

  function focusFirstProblem(list: readonly FieldProblem[]) {
    const first = list[0];
    if (!first) return;
    const selector = first.index >= 0 ? `[data-testid="passenger-${first.index}"] [aria-invalid="true"], [data-testid="passenger-${first.index}"] input` : `#${first.field.replace('.', '-')}`;
    requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus());
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setMessage(null);
    const found = [...validateContact(contact), ...validateParty(page, party)];
    if (page.requireTerms && !acceptTerms) found.push({ index: -1, field: 'acceptTerms', key: 'booking.error.termsRequired' });
    if (page.captcha && !captchaToken) found.push({ index: -1, field: 'captcha', key: 'booking.error.captcha' });
    setProblems(found);
    if (found.length) {
      setMessage(t('booking.error.fixBelow'));
      focusFirstProblem(found);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/public/departures/${encodeURIComponent(token)}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': idempotencyKey.current },
        body: JSON.stringify(buildBookingRequest(page, { contact, party, acceptTerms, marketingOptIn, notes, website, language: locale, captchaToken })),
      });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; data?: BookingResult; error?: ApiRefusal };
      if (res.ok && body.success && body.data) {
        idempotencyKey.current = newKey();
        onBooked(body.data);
        return;
      }
      const refusal = body.error ?? {};
      if (res.status === 429) setMessage(t('booking.error.generic'));
      else setMessage(refusal.message || t('booking.error.generic'));
      if (refusal.errors?.length) setProblems(refusal.errors.map((e) => serverProblem(e, page)));
      if (refusal.seats) onSeats(refusal.seats);
      // A refused form is fixed and sent again with a new key; a stale form or a closed departure needs the page read again.
      idempotencyKey.current = newKey();
      if (refusal.code === 'CLOSED' || refusal.code === 'REJECTED' || refusal.code === 'EXPIRED') onStale();
    } catch {
      // The answer never arrived: the same key is kept, so sending again cannot book twice.
      setMessage(t('booking.error.network'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-ds-6" data-testid="booking-form">
      <PartyBuilder page={page} party={party} onChange={setParty} />

      <section className="space-y-ds-3" aria-label={t('booking.party.title')}>
        {party.map((m, i) => (
          <PassengerCard key={m.key} page={page} member={m} index={i} problems={problems} onChange={(patch) => updateMember(i, patch)} />
        ))}
      </section>

      <section className="space-y-ds-3 rounded-xl border border-ds-border bg-ds-surface p-ds-4" aria-labelledby="contact-title">
        <h2 id="contact-title" className="text-lg font-semibold">{t('booking.contact.title')}</h2>
        <div className="grid gap-ds-3 sm:grid-cols-2">
          <Field id="contact-name" label={t('booking.contact.name')} required error={contactError('contact.name')} className="sm:col-span-2">
            <Input id="contact-name" value={contact.name} autoComplete="name" maxLength={120} aria-invalid={!!contactError('contact.name') || undefined} aria-describedby={contactError('contact.name') ? 'contact-name-error' : undefined} onChange={(e) => setContact({ ...contact, name: e.target.value })} data-testid="contact-name" />
          </Field>
          <Field id="contact-email" label={t('booking.contact.email')} hint={t('booking.contact.emailHint')} required error={contactError('contact.email')}>
            <Input id="contact-email" type="email" inputMode="email" value={contact.email} autoComplete="email" maxLength={200} aria-invalid={!!contactError('contact.email') || undefined} aria-describedby={contactError('contact.email') ? 'contact-email-error' : 'contact-email-hint'} onChange={(e) => setContact({ ...contact, email: e.target.value })} data-testid="contact-email" />
          </Field>
          <Field id="contact-phone" label={t('booking.contact.phone')} error={contactError('contact.phone')}>
            <div data-testid="contact-phone">
              <E164PhoneInput value={contact.phone} onChange={(phone) => setContact({ ...contact, phone })} />
            </div>
          </Field>
          <Field id="contact-notes" label={t('booking.contact.notes')} className="sm:col-span-2">
            <Textarea id="contact-notes" value={notes} rows={2} maxLength={1000} onChange={(e) => setNotes(e.target.value)} data-testid="contact-notes" />
          </Field>
        </div>
      </section>

      <section className="space-y-ds-3 rounded-xl border border-ds-border bg-ds-surface p-ds-4" aria-labelledby="terms-title">
        <h2 id="terms-title" className="text-lg font-semibold">{t('booking.terms.title')}</h2>
        {page.terms && (
          <>
            <button type="button" className="text-sm text-ds-primary underline-offset-2 hover:underline" aria-expanded={showTerms} aria-controls="terms-text" onClick={() => setShowTerms((v) => !v)} data-testid="terms-toggle">
              {showTerms ? t('booking.terms.hide') : t('booking.terms.show')}
            </button>
            {showTerms && <div id="terms-text" className="max-h-56 overflow-y-auto whitespace-pre-line rounded-md bg-ds-surface-sunken p-ds-3 text-sm" data-testid="terms-text">{page.terms}</div>}
          </>
        )}
        <label className="flex items-start gap-ds-2 text-sm">
          <Checkbox id="acceptTerms" checked={acceptTerms} onCheckedChange={(c) => { setAcceptTerms(c === true); setProblems((p) => p.filter((x) => x.field !== 'acceptTerms')); }} aria-invalid={problems.some((x) => x.field === 'acceptTerms') || undefined} data-testid="accept-terms" className="mt-0.5" />
          <span>
            {t('booking.terms.accept')}
            {page.requireTerms && <span aria-hidden="true" className="ms-1 text-ds-danger">*</span>}
          </span>
        </label>
        {problems.some((x) => x.field === 'acceptTerms') && <p role="alert" className="text-xs text-ds-danger">{t('booking.error.termsRequired')}</p>}
        {page.marketingOptIn && (
          <label className="flex items-start gap-ds-2 text-sm">
            <Checkbox checked={marketingOptIn} onCheckedChange={(c) => setMarketingOptIn(c === true)} data-testid="marketing-opt-in" className="mt-0.5" />
            <span>{t('booking.marketing')}</span>
          </label>
        )}
        {/* Honeypot: hidden from people and assistive technology, filled in by bots. */}
        <div aria-hidden="true" className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0">
          {/* i18n-ignore: honeypot label, never shown */}
          <label htmlFor="website-url">Website</label>
          <input id="website-url" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
        {page.captcha && (
          <div>
            <TurnstileWidget siteKey={page.captcha.siteKey} onToken={setCaptchaToken} />
            {problems.some((x) => x.field === 'captcha') && <p role="alert" className="text-xs text-ds-danger">{t('booking.error.captcha')}</p>}
          </div>
        )}
      </section>

      <PriceSummary page={page} party={party} quote={q} />

      {message && (
        <Alert variant="destructive" data-testid="booking-error">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={busy} style={brandStyle(page.agency.primaryColor)} data-testid="booking-submit">
        {busy && <Spinner className="size-4" />}
        {busy ? t('booking.submit.busy') : waitlist ? t('booking.submit.waitlist') : t('booking.submit')}
      </Button>
    </form>
  );
}

function newKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

/** Which of a member's problems an edit clears. */
function patchTouches(field: string, patch: Partial<PartyMember>): boolean {
  if (field === 'dateOfBirth' || field === 'ageYears' || field === 'band') return 'dateOfBirth' in patch || 'ageYears' in patch;
  if (field.startsWith('extra.')) return 'extra' in patch;
  return field in patch;
}

/** A field the server refused, named as the form names its inputs, with the sentence that fits it. */
function serverProblem(e: { index: number; field: string }, page: PublicPage): FieldProblem {
  switch (e.field) {
    case 'name': return { index: e.index, field: 'firstName', key: 'booking.error.required' };
    case 'band': return { index: e.index, field: collects(page, 'dateOfBirth') ? 'dateOfBirth' : 'ageYears', key: 'booking.error.bandMismatch' };
    case 'seatNumber': return { index: e.index, field: 'preferredSeat', key: 'booking.error.seatTaken' };
    default: return { index: e.index, field: e.field, key: 'booking.error.required' };
  }
}
