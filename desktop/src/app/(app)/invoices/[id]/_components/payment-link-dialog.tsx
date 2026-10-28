'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Copy, Send } from 'lucide-react';
import {
  Button, CurrencyInput, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Label,
} from '@/components/ui';
import { invoicesApi, type CreatedPaymentLink, type PaymentDefaults, type PaymentLinkPurpose } from '@/lib/api/invoices';
import { formatExactCurrency } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { toast } from 'sonner';

export type LinkAmountProblem = 'noDeposit' | 'required' | 'aboveBalance';

export interface LinkAmountResult {
  /** What the link will collect, or null while the choice cannot produce an amount. */
  amount: number | null;
  problem?: LinkAmountProblem;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * The amount a payment link collects, the same rules the API applies (POST /invoices/:id/payment-link):
 * balance = what is still owed; deposit = the agency's default (percent of the invoice total or a fixed amount), never more
 * than is owed; custom = what was typed, above 0 and at most what is owed.
 */
export function linkAmountFor(
  purpose: PaymentLinkPurpose,
  invoice: { total: number; balanceDue: number },
  defaults: PaymentDefaults | null,
  custom: number | undefined,
): LinkAmountResult {
  const balance = cents(invoice.balanceDue);
  if (purpose === 'balance') return { amount: balance };
  if (purpose === 'deposit') {
    const d = defaults?.deposit;
    if (!d || d.type === 'none' || !d.value || d.value <= 0) return { amount: null, problem: 'noDeposit' };
    const raw = d.type === 'percent' ? (invoice.total * d.value) / 100 : d.value;
    return { amount: Math.min(cents(raw), balance) };
  }
  if (custom === undefined || !(custom > 0)) return { amount: null, problem: 'required' };
  if (cents(custom) > balance) return { amount: null, problem: 'aboveBalance' };
  return { amount: cents(custom) };
}

interface PaymentLinkDialogProps {
  invoice: { id: string; invoiceNumber: string; currency: string; total: number; balanceDue: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A link was made; the invoice page refreshes. */
  onCreated: (link: CreatedPaymentLink) => void;
  /** "Send to customer": the page opens the Communication Hub dialog (never mailto: or wa.me). */
  onSend: (link: CreatedPaymentLink) => void;
}

/** Create a payment link for a deposit, the balance or a custom amount, then copy it or send it through the Hub. */
export function PaymentLinkDialog({ invoice, open, onOpenChange, onCreated, onSend }: PaymentLinkDialogProps) {
  const t = useT();
  const [purpose, setPurpose] = React.useState<PaymentLinkPurpose>('balance');
  const [custom, setCustom] = React.useState<number | undefined>(undefined);
  const [defaults, setDefaults] = React.useState<PaymentDefaults | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [needsGateway, setNeedsGateway] = React.useState(false);
  const [created, setCreated] = React.useState<CreatedPaymentLink | null>(null);
  const [copied, setCopied] = React.useState(false);

  // The agency's deposit default decides what "Deposit" collects. Not being able to read it only disables that option.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    invoicesApi.paymentDefaults.get().then(
      (res) => { if (!cancelled) setDefaults(res.data ?? null); },
      () => { if (!cancelled) setDefaults(null); },
    );
    return () => { cancelled = true; };
  }, [open]);

  const reset = () => {
    setPurpose('balance');
    setCustom(undefined);
    setCreated(null);
    setCopied(false);
    setNeedsGateway(false);
  };

  const money = (n: number) => formatExactCurrency(n, invoice.currency);
  const result = linkAmountFor(purpose, invoice, defaults, custom);
  const depositResult = linkAmountFor('deposit', invoice, defaults, undefined);
  const problemText: Record<LinkAmountProblem, string> = {
    noDeposit: t('payments.link.dialog.noDeposit'),
    required: t('payments.link.dialog.required'),
    aboveBalance: t('payments.link.dialog.aboveBalance', { max: money(invoice.balanceDue) }),
  };

  const handleCreate = async () => {
    if (result.amount === null) return;
    setBusy(true);
    setNeedsGateway(false);
    try {
      // A custom amount travels with the request; a deposit or the balance is worked out by the API from the same rules.
      const res = await invoicesApi.createPaymentLink(invoice.id, purpose === 'custom' ? { purpose, amount: result.amount } : { purpose });
      setCreated(res.data);
      toast.success(t('payments.link.dialog.created'));
      onCreated(res.data);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t('payments.link.dialog.failed');
      setNeedsGateway(/connect razorpay or stripe/i.test(message));
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
      toast.success(t('payments.link.dialog.copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('payments.link.dialog.copyFailed'));
    }
  };

  const options: Array<{ value: PaymentLinkPurpose; label: string; hint: string }> = [
    {
      value: 'deposit',
      label: t('payments.link.purpose.deposit'),
      hint: depositResult.amount !== null ? t('payments.link.dialog.depositHint', { amount: money(depositResult.amount) }) : problemText.noDeposit,
    },
    { value: 'balance', label: t('payments.link.purpose.balance'), hint: t('payments.link.dialog.balanceHint', { amount: money(invoice.balanceDue) }) },
    { value: 'custom', label: t('payments.link.purpose.custom'), hint: t('payments.link.dialog.customHint', { max: money(invoice.balanceDue) }) },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-lg" data-testid="payment-link-dialog">
        <DialogHeader>
          <DialogTitle>{t('payments.link.dialog.title')}</DialogTitle>
          <DialogDescription>
            {t('payments.link.dialog.description', { number: invoice.invoiceNumber, balance: money(invoice.balanceDue) })}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="flex flex-col gap-ds-3" data-testid="payment-link-created">
            <p className="text-sm">
              {t('payments.link.dialog.createdLine', { purpose: t(`payments.link.purpose.${created.purpose ?? 'balance'}`), amount: money(created.amount) })}
            </p>
            <div className="flex flex-col gap-ds-1">
              <Label htmlFor="payment-link-created-url">{t('payments.link.dialog.linkLabel')}</Label>
              <div className="flex items-center gap-ds-2">
                <input
                  id="payment-link-created-url"
                  readOnly
                  value={created.url}
                  data-testid="payment-link-created-url"
                  className="h-9 w-full rounded-ds-md border border-ds-border bg-ds-surface px-ds-2 font-mono text-xs"
                />
                <Button variant="outline" size="icon" aria-label={t('payments.link.dialog.copy')} onClick={handleCopy}>
                  {copied ? <Check className="size-4 text-ds-success" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t('payments.link.dialog.done')}</Button>
              <Button onClick={() => onSend(created)}>
                <Send aria-hidden="true" />
                {t('payments.link.dialog.send')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-ds-4">
            {needsGateway && (
              <p role="alert" className="text-sm text-ds-danger">
                {t('payments.link.noGateway')}{' '}
                <Link href="/settings/integrations" className="font-medium underline">{t('payments.link.connectGateway')}</Link>
              </p>
            )}
            <div role="radiogroup" aria-label={t('payments.link.dialog.title')} className="flex flex-col gap-ds-2">
              {options.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-start gap-ds-2 rounded-ds-md border border-ds-border p-ds-3 has-[:checked]:border-ds-primary"
                >
                  <input
                    type="radio"
                    name="payment-link-purpose"
                    value={o.value}
                    checked={purpose === o.value}
                    onChange={() => setPurpose(o.value)}
                    data-testid={`payment-link-purpose-${o.value}`}
                    className="mt-1"
                  />
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{o.label}</span>
                    <span className="text-xs text-ds-foreground-muted">{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {purpose === 'custom' && (
              <div className="flex flex-col gap-ds-1">
                <Label htmlFor="payment-link-custom-amount">{t('payments.link.dialog.customLabel')}</Label>
                <CurrencyInput id="payment-link-custom-amount" value={custom} onChange={setCustom} currency={invoice.currency} />
              </div>
            )}
            {result.problem && (purpose !== 'custom' || custom !== undefined) && (
              <p role="alert" className="text-sm text-ds-danger" data-testid="payment-link-problem">{problemText[result.problem]}</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t('payments.link.dialog.close')}</Button>
              <Button onClick={handleCreate} disabled={busy || result.amount === null} data-testid="payment-link-submit">
                {busy ? t('payments.link.dialog.creating') : result.amount !== null ? t('payments.link.dialog.submitAmount', { amount: money(result.amount) }) : t('payments.link.dialog.submit')}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
