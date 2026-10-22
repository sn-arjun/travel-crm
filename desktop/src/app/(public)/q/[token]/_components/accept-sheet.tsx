'use client';

import * as React from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

import { Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input } from '@/components/ui';
import { getApiBaseUrl } from '@/lib/api/config';
import { formatDisplayDateTime } from '@/lib/dates';
import { formatExactCurrency } from '@/lib/format';
import { useT } from '@/lib/i18n';

/** The accept block of GET /public/quotation/:token (R155). */
export interface AcceptBlock {
  enabled: true;
  language: 'en' | 'nl';
  label: string | null;
  requireName: boolean;
  requireTerms: boolean;
  state: 'open' | 'accepted' | 'expired' | 'full_waitlist' | 'full';
  departure?: { startDate: string; endDate: string; seatsLeft: number | null; seatsRequested: number };
  result?: AcceptAnswer;
}

/** The answer of POST /public/quotation/:token/accept. */
export interface AcceptAnswer {
  status: 'accepted';
  acceptedAt: string;
  name: string | null;
  seats?: { status: 'held' | 'confirmed' | 'waitlisted' | 'unavailable'; seats: number; holdExpiresAt: string | null; departureCode: string | null };
  invoice?: { number: string; total: number; currency: string; type: string };
  payment?: { url: string; amount: number; currency: string; purpose: 'deposit' | 'balance' };
  bank?: { lines: Array<{ field: string; label: string; value: string }>; reference: string; amount: number; currency: string };
}

interface SheetProps {
  token: string;
  title: string;
  total: string;
  accept: AcceptBlock;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccepted: (answer: AcceptAnswer) => void;
}

/** The confirm sheet: name and terms, then one request. The page shows the result. */
export function AcceptSheet({ token, title, total, accept, open, onOpenChange, onAccepted }: SheetProps) {
  const t = useT();
  const [name, setName] = React.useState('');
  const [terms, setTerms] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    if (accept.requireName && !name.trim()) return setError(t('quotes.accept.nameRequired'));
    if (accept.requireTerms && !terms) return setError(t('quotes.accept.termsRequired'));
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/public/quotation/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name: name.trim(), termsAccepted: terms }),
      });
      const body = (await res.json().catch(() => ({}))) as AcceptAnswer & { error?: string };
      if (!res.ok) return setError(body.error ?? t('quotes.accept.failed'));
      onAccepted(body);
    } catch {
      setError(t('quotes.accept.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent data-testid="accept-sheet">
        <DialogHeader>
          <DialogTitle>{t('quotes.accept.sheetTitle')}</DialogTitle>
          <DialogDescription>{t('quotes.accept.sheetBody', { title, total })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {accept.requireName && (
            <div className="space-y-1">
              <label htmlFor="accept-name" className="text-sm font-medium">{t('quotes.accept.name')}</label>
              <Input id="accept-name" value={name} maxLength={120} autoComplete="name" onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          {accept.requireTerms && (
            <div className="flex items-start gap-2">
              <Checkbox id="accept-terms" checked={terms} onCheckedChange={(v) => setTerms(v === true)} />
              <label htmlFor="accept-terms" className="text-sm">{t('quotes.accept.terms')}</label>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-destructive" data-testid="accept-error">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>{t('quotes.accept.cancel')}</Button>
          <Button type="button" disabled={busy} onClick={() => void submit()} data-testid="accept-confirm">
            {busy ? <Loader2 className="me-1 size-4 animate-spin" aria-hidden="true" /> : null}
            {busy ? t('quotes.accept.sending') : t('quotes.accept.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** What the customer sees once the quote is accepted: the seats, the invoice and how to pay the deposit. */
export function AcceptedPanel({ answer }: { answer: AcceptAnswer }) {
  const t = useT();
  const seats = answer.seats;
  const seatsText = seats
    ? seats.status === 'held'
      ? seats.holdExpiresAt
        ? t('quotes.accept.seats.held', { count: seats.seats, until: formatDisplayDateTime(seats.holdExpiresAt) })
        : t('quotes.accept.seats.heldNoLimit', { count: seats.seats })
      : t(`quotes.accept.seats.${seats.status}`, { count: seats.seats })
    : null;

  return (
    <section className="rounded-xl border bg-card p-5 text-center" aria-live="polite" data-testid="quote-accepted">
      <CheckCircle2 className="mx-auto size-10 text-ds-success" aria-hidden="true" />
      <h2 className="mt-2 text-lg font-semibold" data-testid="accepted-title">{t('quotes.accept.done.title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('quotes.accept.done.body')}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t('quotes.accept.done.on', { date: formatDisplayDateTime(answer.acceptedAt) })}</p>
      {seatsText && <p className="mt-3 text-sm font-medium" data-testid="accepted-seats" data-status={seats?.status}>{seatsText}</p>}
      {answer.invoice && (
        <p className="mt-2 text-sm" data-testid="accepted-invoice">
          {t(answer.invoice.type === 'proforma' ? 'quotes.accept.proforma' : 'quotes.accept.invoice', { number: answer.invoice.number })}
        </p>
      )}
      {answer.payment && (
        <a
          href={answer.payment.url}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground"
          data-testid="pay-deposit"
        >
          {t(answer.payment.purpose === 'deposit' ? 'quotes.accept.pay.deposit' : 'quotes.accept.pay.balance', {
            amount: formatExactCurrency(answer.payment.amount, answer.payment.currency),
          })}
        </a>
      )}
      {answer.bank && (
        <div className="mt-4 rounded-lg bg-muted p-4 text-start text-sm" data-testid="accepted-bank">
          <p className="font-medium">{t('quotes.accept.bank.title')}</p>
          <p className="mt-1">{t('quotes.accept.bank.amount', { amount: formatExactCurrency(answer.bank.amount, answer.bank.currency) })}</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {answer.bank.lines.map((l) => (
              <React.Fragment key={l.field}>
                <dt className="text-muted-foreground">{l.label}</dt>
                <dd dir="ltr" className="text-end tabular-nums">{l.value}</dd>
              </React.Fragment>
            ))}
            <dt className="text-muted-foreground">{t('quotes.accept.bank.reference')}</dt>
            <dd dir="ltr" className="text-end font-semibold tabular-nums">{answer.bank.reference}</dd>
          </dl>
        </div>
      )}
    </section>
  );
}
