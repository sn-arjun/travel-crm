'use client';

import * as React from 'react';
import { toast } from 'sonner';

import {
  Button, Input, Label, SectionCard, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Textarea,
} from '@/components/ui';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { settingsApi, type MarginSchemeSettings } from '@/lib/api/settings';
import { useT } from '@/lib/i18n';
import { WORDING_PRESETS } from '@/lib/margin-scheme';

/**
 * Margin scheme card of Settings > Invoice defaults (R152, design 4.5). It saves on its own button (its own settings key), like
 * the Payments card. Nothing is filled in for the agency: the wording is typed or picked from a preset it chooses, and the VAT rate
 * stays empty until the agency enters its own. Every preset says to check it with an accountant.
 */
export function MarginSchemeCard() {
  const t = useT();
  const gate = useFeatureGate('margin_scheme');
  const [loaded, setLoaded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [enabled, setEnabled] = React.useState(false);
  const [defaultFor, setDefaultFor] = React.useState<MarginSchemeSettings['defaultFor']>('none');
  const [wording, setWording] = React.useState('');
  const [vatRate, setVatRate] = React.useState('');
  const [costSource, setCostSource] = React.useState<MarginSchemeSettings['costSource']>('auto');

  React.useEffect(() => {
    if (gate.loading || !gate.enabled) return;
    let cancelled = false;
    settingsApi.marginScheme.get().then(
      (res) => {
        if (cancelled) return;
        const d = res && 'data' in res ? res.data : null;
        if (d) {
          setEnabled(d.enabled);
          setDefaultFor(d.defaultFor);
          setWording(d.wording);
          setVatRate(d.vatRate != null ? String(d.vatRate) : '');
          setCostSource(d.costSource);
        }
        setLoaded(true);
      },
      () => { if (!cancelled) setLoaded(true); },
    );
    return () => { cancelled = true; };
  }, [gate.loading, gate.enabled]);

  // An agency without the feature does not see the card at all
  if (gate.loading || !gate.enabled) return null;

  const save = async () => {
    const rate = vatRate.trim() === '' ? null : Number(vatRate);
    if (rate !== null && !(rate >= 0 && rate <= 100)) {
      toast.error(t('margin.settings.errRate'));
      return;
    }
    if (enabled && !wording.trim()) {
      toast.error(t('margin.settings.errWording'));
      return;
    }
    setSaving(true);
    try {
      await settingsApi.marginScheme.update({ enabled, defaultFor, wording: wording.trim(), vatRate: rate, costSource });
      toast.success(t('margin.settings.saved'));
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t('margin.settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title={t('margin.settings.title')} description={t('margin.settings.description')}>
      {!loaded ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className="flex flex-col gap-ds-4" data-testid="margin-scheme-card">
          <label className="flex items-center gap-ds-2 text-sm font-medium">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} data-testid="margin-enabled" />
            {t('margin.settings.enabled')}
          </label>

          <div className="grid gap-ds-4 sm:grid-cols-2">
            <div className="flex flex-col gap-ds-1">
              <Label htmlFor="marginDefaultFor">{t('margin.settings.defaultFor')}</Label>
              <Select value={defaultFor} onValueChange={(v) => setDefaultFor(v as MarginSchemeSettings['defaultFor'])}>
                <SelectTrigger id="marginDefaultFor"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('margin.settings.defaultNone')}</SelectItem>
                  <SelectItem value="tour_bookings">{t('margin.settings.defaultTours')}</SelectItem>
                  <SelectItem value="all_invoices">{t('margin.settings.defaultAll')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-ds-1">
              <Label htmlFor="marginCostSource">{t('margin.settings.costSource')}</Label>
              <Select value={costSource} onValueChange={(v) => setCostSource(v as MarginSchemeSettings['costSource'])}>
                <SelectTrigger id="marginCostSource"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t('margin.settings.costAuto')}</SelectItem>
                  <SelectItem value="manual">{t('margin.settings.costManual')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-ds-foreground-muted">{t('margin.settings.costHint')}</p>
            </div>
          </div>

          <div className="flex flex-col gap-ds-2">
            <Label htmlFor="marginWording">{t('margin.settings.wording')}</Label>
            <Textarea
              id="marginWording"
              rows={2}
              maxLength={500}
              value={wording}
              onChange={(e) => setWording(e.target.value)}
              placeholder={t('margin.settings.wordingPlaceholder')}
              data-testid="margin-wording"
            />
            <p className="text-xs text-ds-foreground-muted">{t('margin.settings.wordingHint')}</p>
            <div className="flex flex-col gap-ds-2" data-testid="margin-presets">
              <p className="text-xs font-medium">{t('margin.settings.presets')}</p>
              {WORDING_PRESETS.map((preset) => (
                <div key={preset.id} className="flex flex-wrap items-center gap-ds-2 text-xs">
                  <Button type="button" variant="outline" size="sm" onClick={() => setWording(preset.wording)} data-testid={`margin-preset-${preset.id}`}>
                    {t(preset.labelKey)}
                  </Button>
                  <span className="text-ds-foreground-muted">{preset.wording}</span>
                  <span className="text-ds-foreground-muted">({t('margin.settings.checkAccountant')})</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-ds-1 sm:max-w-xs">
            <Label htmlFor="marginVatRate">{t('margin.settings.vatRate')}</Label>
            <Input
              id="marginVatRate"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={vatRate}
              onChange={(e) => setVatRate(e.target.value)}
              data-testid="margin-vat-rate"
            />
            <p className="text-xs text-ds-foreground-muted">{t('margin.settings.vatRateHint')}</p>
          </div>

          <p className="text-xs text-ds-foreground-muted">{t('margin.settings.accountantNote')}</p>

          <div>
            <Button type="button" variant="outline" onClick={save} disabled={saving} data-testid="margin-save">
              {saving ? t('margin.settings.saving') : t('margin.settings.save')}
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
