'use client';

import * as React from 'react';
import { toast } from 'sonner';

import {
  Button, Checkbox, Input, SectionCard, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton,
} from '@/components/ui';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { errorMessage, quoteAcceptApi, type QuoteAcceptSettings } from '@/lib/api/itineraries';
import { unwrapEntity } from '@/lib/api/envelope';
import { useAuthStore } from '@/stores/auth-store';
import { useT } from '@/lib/i18n';

/**
 * Settings > Itinerary defaults > Quote link: "Accept and book" on the shared quote page (design 4.6).
 * It saves on its own, apart from the page's form. Renders nothing while the plan does not include quote acceptance.
 */
export function QuoteLinkCard() {
  const gate = useFeatureGate('quote_acceptance');
  if (gate.loading) return <Skeleton className="h-40 w-full" />;
  if (!gate.enabled) return null;
  return <QuoteLinkCardBody />;
}

function QuoteLinkCardBody() {
  const t = useT();
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const [value, setValue] = React.useState<QuoteAcceptSettings | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setValue(unwrapEntity<QuoteAcceptSettings>(await quoteAcceptApi.get()));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!value) return;
    setBusy(true);
    try {
      setValue(unwrapEntity<QuoteAcceptSettings>(await quoteAcceptApi.save(value)));
      toast.success(t('quotes.settings.saved'));
    } catch (err) {
      toast.error(errorMessage(err, t('quotes.settings.saveFailed')));
    } finally {
      setBusy(false);
    }
  }

  const set = <K extends keyof QuoteAcceptSettings>(key: K, v: QuoteAcceptSettings[K]) => setValue((cur) => (cur ? { ...cur, [key]: v } : cur));
  const disabled = busy || !isAdmin;

  const check = (key: 'enabled' | 'requireName' | 'requireTerms' | 'holdSeats' | 'offerDeposit', label: string) => (
    <div className="flex items-start gap-ds-2">
      <Checkbox id={`quote-${key}`} checked={value?.[key] ?? false} disabled={disabled} onCheckedChange={(v) => set(key, v === true)} data-testid={`quote-accept-${key}`} />
      <label htmlFor={`quote-${key}`} className="text-sm">{label}</label>
    </div>
  );

  return (
    <SectionCard title={t('quotes.settings.title')} description={t('quotes.settings.description')}>
      {failed ? (
        <div className="flex items-center gap-ds-3">
          <p className="text-sm text-ds-foreground-muted">{t('quotes.settings.loadFailed')}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>{t('quotes.settings.retry')}</Button>
        </div>
      ) : !value ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="space-y-ds-4" data-testid="quote-link-card">
          {check('enabled', t('quotes.settings.enabled'))}
          <div className="space-y-1">
            <label htmlFor="quote-accept-label" className="text-sm font-medium">{t('quotes.settings.label')}</label>
            <Input id="quote-accept-label" value={value.label} maxLength={60} disabled={disabled} onChange={(e) => set('label', e.target.value)} />
            <p className="text-xs text-ds-foreground-muted">{t('quotes.settings.labelHint')}</p>
          </div>
          {check('requireName', t('quotes.settings.requireName'))}
          {check('requireTerms', t('quotes.settings.requireTerms'))}
          {check('holdSeats', t('quotes.settings.holdSeats'))}
          <div className="space-y-1">
            <label htmlFor="quote-accept-invoice" className="text-sm font-medium">{t('quotes.settings.createInvoice')}</label>
            <Select value={value.createInvoice} disabled={disabled} onValueChange={(v) => set('createInvoice', v as QuoteAcceptSettings['createInvoice'])}>
              <SelectTrigger id="quote-accept-invoice" data-testid="quote-accept-invoice"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('quotes.settings.invoice.none')}</SelectItem>
                <SelectItem value="proforma">{t('quotes.settings.invoice.proforma')}</SelectItem>
                <SelectItem value="invoice">{t('quotes.settings.invoice.invoice')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {check('offerDeposit', t('quotes.settings.offerDeposit'))}
          {!isAdmin && <p className="text-xs text-ds-foreground-muted">{t('quotes.settings.adminOnly')}</p>}
          {isAdmin && (
            <Button type="button" size="sm" disabled={busy} onClick={() => void save()} data-testid="quote-accept-save">
              {t('quotes.settings.save')}
            </Button>
          )}
        </div>
      )}
    </SectionCard>
  );
}
