'use client';

import * as React from 'react';
import { Button, Input, Label, SectionCard, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton } from '@/components/ui';
import { invoicesApi, type PaymentDefaults } from '@/lib/api/invoices';
import { useT } from '@/lib/i18n';
import { toast } from 'sonner';

const STRIPE_METHODS = ['card', 'ideal', 'bancontact', 'sepa_debit'] as const;

/**
 * Payments card of Settings > Invoice defaults (R142, design 4.3): the default deposit of a payment link, the Stripe
 * methods to request and the reference for bank transfers. It saves on its own button (its own settings key), so it works
 * beside the invoice defaults form without joining its fields.
 */
export function PaymentsCard() {
  const t = useT();
  const [loaded, setLoaded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [depositType, setDepositType] = React.useState<PaymentDefaults['deposit']['type']>('none');
  const [depositValue, setDepositValue] = React.useState('');
  const [methods, setMethods] = React.useState<string[]>([]);
  const [bankReference, setBankReference] = React.useState('{invoice_number}');

  React.useEffect(() => {
    let cancelled = false;
    invoicesApi.paymentDefaults.get().then(
      (res) => {
        if (cancelled) return;
        const d = res.data;
        if (d) {
          setDepositType(d.deposit.type);
          setDepositValue(d.deposit.value != null ? String(d.deposit.value) : '');
          setMethods(d.stripeMethodTypes ?? []);
          setBankReference(d.bankReference);
        }
        setLoaded(true);
      },
      () => { if (!cancelled) setLoaded(true); },
    );
    return () => { cancelled = true; };
  }, []);

  const toggle = (m: string, on: boolean) => setMethods((prev) => (on ? [...prev.filter((x) => x !== m), m] : prev.filter((x) => x !== m)));

  const save = async () => {
    const value = Number(depositValue);
    if (depositType !== 'none' && (!(value > 0) || (depositType === 'percent' && value > 100))) {
      toast.error(t('payments.defaults.errDeposit'));
      return;
    }
    setSaving(true);
    try {
      await invoicesApi.paymentDefaults.update({
        deposit: { type: depositType, value: depositType === 'none' ? null : value },
        stripeMethodTypes: methods.length ? methods : null,
        bankReference: bankReference.trim() || '{invoice_number}',
      });
      toast.success(t('payments.defaults.saved'));
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t('payments.defaults.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title={t('payments.defaults.title')} description={t('payments.defaults.description')}>
      {!loaded ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="flex flex-col gap-ds-4" data-testid="payment-defaults-card">
          <div className="grid gap-ds-4 sm:grid-cols-2">
            <div className="flex flex-col gap-ds-1">
              <Label htmlFor="depositType">{t('payments.defaults.depositType')}</Label>
              <Select value={depositType} onValueChange={(v) => setDepositType(v as PaymentDefaults['deposit']['type'])}>
                <SelectTrigger id="depositType"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('payments.defaults.depositNone')}</SelectItem>
                  <SelectItem value="percent">{t('payments.defaults.depositPercent')}</SelectItem>
                  <SelectItem value="fixed">{t('payments.defaults.depositFixed')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {depositType !== 'none' && (
              <div className="flex flex-col gap-ds-1">
                <Label htmlFor="depositValue">{depositType === 'percent' ? t('payments.defaults.depositValuePercent') : t('payments.defaults.depositValueFixed')}</Label>
                <Input id="depositValue" type="number" min="0" step="0.01" value={depositValue} onChange={(e) => setDepositValue(e.target.value)} />
              </div>
            )}
          </div>

          <fieldset className="flex flex-col gap-ds-2">
            <legend className="text-sm font-medium">{t('payments.defaults.stripeMethods')}</legend>
            <div className="flex flex-wrap gap-ds-4">
              {STRIPE_METHODS.map((m) => (
                <label key={m} className="flex items-center gap-ds-2 text-sm">
                  <input type="checkbox" checked={methods.includes(m)} onChange={(e) => toggle(m, e.target.checked)} data-testid={`stripe-method-${m}`} />
                  {t(`payments.defaults.stripe.${m}`)}
                </label>
              ))}
            </div>
            <p className="text-xs text-ds-foreground-muted">{t('payments.defaults.stripeMethodsHint')}</p>
          </fieldset>

          <div className="flex flex-col gap-ds-1">
            <Label htmlFor="bankReference">{t('payments.defaults.bankReference')}</Label>
            <Input id="bankReference" value={bankReference} maxLength={80} onChange={(e) => setBankReference(e.target.value)} />
            <p className="text-xs text-ds-foreground-muted">{t('payments.defaults.bankReferenceHint', { token: '{invoice_number}' })}</p>
          </div>

          <div>
            <Button type="button" variant="outline" onClick={save} disabled={saving} data-testid="payment-defaults-save">
              {saving ? t('payments.defaults.saving') : t('payments.defaults.save')}
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
