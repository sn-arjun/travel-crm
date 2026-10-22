'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

import { PageContainer } from '@/components/layout/page-container';
import {
  Alert, AlertDescription, Button, CurrencyInput, Input, Label, PageHeader, SectionCard, Skeleton, Spinner, Tabs, TabsContent, TabsList,
  TabsTrigger, Textarea,
} from '@/components/ui';
import { useGroupTours } from '@/hooks/use-group-tours';
import { useLocale } from '@/lib/locale';
import { currencyOptions } from '@/lib/locale-options';
import { toursApi, type TourDetail, type TourInput } from '@/lib/api/tours';
import { rowsFromBands, rowsToRequest, type BandRow } from '../../itineraries/_components/age-bands-editor';
import type { ConfirmMode, DepositType } from '@/lib/api/departures';
import { departureErrorText } from '@/lib/departures';
import { useT } from '@/lib/i18n';
import { ItineraryTemplateCombobox } from '../../departures/_components/relation-pickers';
import { SimpleSelect } from '../../departures/_components/simple-select';
import { StopsEditor, fromStopRows, toStopRows, type StopRow } from '../../departures/_components/stops-editor';
import { PricesEditor, fromPriceRows, toPriceRows, type PriceRow } from '../../departures/_components/prices-editor';
import { ExtrasEditor, fromExtraRows, toExtraRows, type ExtraRow } from './extras-editor';
import { TourAgeBands, tourBandsError, tourBandsInForce, useAgencyBands } from './tour-age-bands';

interface Details {
  title: string;
  code: string;
  destination: string;
  itineraryTemplateId: string | null;
  durationDays: string;
  currency: string;
  defaultCapacity: string;
  holdExpiryHours: string;
  confirmMode: ConfirmMode | null;
  bookingCutoffDays: string;
  extrasCutoffDays: string;
  depositType: DepositType | null;
  depositValue: number | undefined;
  description: string;
  terms: string;
}

const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

const text = (v: string | null | undefined) => v ?? '';
const numText = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
/** '' is "not set" (null); anything else a whole number at least `min`. */
const intOrNull = (v: string, min: number): number | null => (v.trim() === '' ? null : Math.max(min, Math.floor(Number(v) || 0)));

/** A short code proposed from the title: "Golden Triangle Express" -> "GOLDEN-TRIANGL". */
function suggestCode(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()
    .slice(0, 14)
    .replace(/-+$/, '');
}

function detailsFrom(tour: TourDetail | null, currency: string): Details {
  return {
    title: text(tour?.title),
    code: text(tour?.code),
    destination: text(tour?.destination),
    itineraryTemplateId: tour?.itineraryTemplateId ?? null,
    durationDays: numText(tour?.durationDays),
    currency: tour?.currency ?? currency,
    defaultCapacity: numText(tour?.defaultCapacity),
    holdExpiryHours: numText(tour?.holdExpiryHours),
    confirmMode: tour?.confirmMode ?? null,
    bookingCutoffDays: numText(tour?.bookingCutoffDays),
    extrasCutoffDays: numText(tour?.extrasCutoffDays),
    depositType: tour?.depositType ?? null,
    depositValue: tour?.depositValue ?? undefined,
    description: text(tour?.description),
    terms: text(tour?.terms),
  };
}

function inputFrom(d: Details): TourInput & { code: string; title: string } {
  return {
    title: d.title.trim(),
    code: d.code.trim(),
    destination: d.destination.trim() || null,
    itineraryTemplateId: d.itineraryTemplateId,
    durationDays: intOrNull(d.durationDays, 1),
    currency: d.currency || null,
    defaultCapacity: intOrNull(d.defaultCapacity, 0),
    holdExpiryHours: intOrNull(d.holdExpiryHours, 1),
    confirmMode: d.confirmMode,
    bookingCutoffDays: intOrNull(d.bookingCutoffDays, 0),
    extrasCutoffDays: intOrNull(d.extrasCutoffDays, 0),
    depositType: d.depositType,
    depositValue: d.depositType && d.depositType !== 'none' ? (d.depositValue ?? null) : null,
    description: d.description.trim() || null,
    terms: d.terms.trim() || null,
  };
}

export function TourForm({ tourId }: { tourId?: string }) {
  const t = useT();
  const router = useRouter();
  const locale = useLocale();
  const { settings } = useGroupTours();
  const editing = Boolean(tourId);

  const [loading, setLoading] = React.useState(editing);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [details, setDetails] = React.useState<Details>(() => detailsFrom(null, locale.currency));
  const [codeTouched, setCodeTouched] = React.useState(false);
  const [stops, setStops] = React.useState<StopRow[]>([]);
  const [prices, setPrices] = React.useState<PriceRow[]>([]);
  const [extras, setExtras] = React.useState<ExtraRow[]>([]);
  const agencyBands = useAgencyBands();
  const [ownBands, setOwnBands] = React.useState<{ custom: boolean; rows: BandRow[] }>({ custom: false, rows: [] });
  const [tab, setTab] = React.useState('details');
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<{ title?: string; code?: string }>({});

  React.useEffect(() => {
    if (!tourId) return;
    let cancelled = false;
    setLoading(true);
    toursApi
      .get(tourId)
      .then((tour) => {
        if (cancelled) return;
        setDetails(detailsFrom(tour, locale.currency));
        setCodeTouched(true);
        setStops(toStopRows(tour.stops));
        setPrices(toPriceRows(tour.prices));
        setOwnBands(tour.ageBands && tour.ageBands.length > 0 ? { custom: true, rows: rowsFromBands(tour.ageBands) } : { custom: false, rows: [] });
        // Extras of one departure belong to that departure; the tour form edits the tour's own catalogue.
        setExtras(toExtraRows(tour.extras.filter((x) => !x.departureId)));
      })
      .catch((err) => !cancelled && setLoadError(departureErrorText(err, t, 'tours.form.loadFailed')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // Load once per tour id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId]);

  const set = <K extends keyof Details>(key: K, value: Details[K]) => setDetails((d) => ({ ...d, [key]: value }));

  function validate(): boolean {
    const next: { title?: string; code?: string } = {};
    if (!details.title.trim()) next.title = t('tours.form.errors.title');
    if (!details.code.trim()) next.code = t('tours.form.errors.code');
    else if (!CODE_PATTERN.test(details.code.trim()) || details.code.trim().length > 24) next.code = t('tours.form.errors.codeFormat');
    setErrors(next);
    if (!next.title && !next.code && tourBandsError(ownBands.custom, ownBands.rows)) {
      setTab('prices');
      toast.error(t('tours.bands.invalid'));
      return false;
    }
    if (next.title || next.code) {
      setTab('details');
      toast.error(t('tours.form.errors.fix'));
      return false;
    }
    return true;
  }

  async function save() {
    if (!validate()) return;
    setSaving(true);
    let savedId = tourId;
    try {
      const input = { ...inputFrom(details), ageBands: ownBands.custom ? rowsToRequest(ownBands.rows) : null };
      const saved = editing ? await toursApi.update(tourId as string, input) : await toursApi.create(input);
      savedId = saved.id;
      const currency = details.currency || null;
      if (editing || stops.length > 0) await toursApi.replaceStops(saved.id, fromStopRows(stops));
      if (editing || prices.length > 0) await toursApi.replacePrices(saved.id, fromPriceRows(prices, currency));
      if (editing || extras.length > 0) await toursApi.replaceExtras(saved.id, fromExtraRows(extras, currency));
      toast.success(editing ? t('tours.form.updated') : t('tours.form.created'));
      router.push(`/tours/${saved.id}`);
    } catch (err) {
      toast.error(departureErrorText(err, t, 'tours.form.saveFailed'));
      // The tour itself exists already: continue on its edit page rather than creating it twice.
      if (!editing && savedId) router.replace(`/tours/${savedId}/edit`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <PageContainer width="narrow">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </PageContainer>
    );
  }
  if (loadError) {
    return (
      <PageContainer width="narrow">
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  const roomTypes = settings?.roomTypes ?? [];
  const currency = details.currency || locale.currency;
  const confirmModes = [
    { value: 'manual', label: t('groupTours.confirmMode.manual') },
    { value: 'auto_when_available', label: t('groupTours.confirmMode.auto') },
    { value: 'on_deposit', label: t('groupTours.confirmMode.deposit') },
  ];
  const depositTypes = [
    { value: 'none', label: t('groupTours.deposit.none') },
    { value: 'percent', label: t('groupTours.deposit.percent') },
    { value: 'per_seat', label: t('groupTours.deposit.perSeat') },
    { value: 'fixed', label: t('groupTours.deposit.fixed') },
  ];

  return (
    <PageContainer width="narrow">
      <PageHeader
        title={editing ? t('tours.form.editTitle') : t('tours.form.newTitle')}
        description={t('tours.form.description')}
        actions={
          <>
            <Button variant="outline" onClick={() => router.back()} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void save()} disabled={saving} data-testid="tour-save">
              {saving && <Spinner className="size-4" />}
              {editing ? t('tours.form.saveChanges') : t('tours.form.create')}
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="details">{t('tours.form.tabDetails')}</TabsTrigger>
          <TabsTrigger value="stops">{t('tours.form.tabStops', { count: stops.length })}</TabsTrigger>
          <TabsTrigger value="prices">{t('tours.form.tabPrices', { count: prices.length })}</TabsTrigger>
          <TabsTrigger value="extras">{t('tours.form.tabExtras', { count: extras.length })}</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-ds-4 pt-ds-4">
          <SectionCard title={t('tours.form.basics')} required>
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <div className="space-y-ds-1">
                <Label htmlFor="tour-title">{t('tours.form.title')} *</Label>
                <Input
                  id="tour-title"
                  value={details.title}
                  aria-invalid={Boolean(errors.title)}
                  onChange={(e) => {
                    const title = e.target.value;
                    setDetails((d) => ({ ...d, title, ...(!editing && !codeTouched ? { code: suggestCode(title) } : {}) }));
                  }}
                />
                {errors.title && <p className="text-xs text-ds-danger">{errors.title}</p>}
              </div>
              <div className="space-y-ds-1">
                <Label htmlFor="tour-code">{t('tours.form.code')} *</Label>
                <Input
                  id="tour-code"
                  value={details.code}
                  aria-invalid={Boolean(errors.code)}
                  onChange={(e) => {
                    setCodeTouched(true);
                    set('code', e.target.value);
                  }}
                />
                {errors.code ? <p className="text-xs text-ds-danger">{errors.code}</p> : <p className="text-xs text-ds-foreground-muted">{t('tours.form.codeHint')}</p>}
              </div>
              <div className="space-y-ds-1">
                <Label htmlFor="tour-destination">{t('tours.form.destination')}</Label>
                <Input id="tour-destination" value={details.destination} onChange={(e) => set('destination', e.target.value)} />
              </div>
              <div className="space-y-ds-1">
                <Label>{t('tours.form.template')}</Label>
                <ItineraryTemplateCombobox
                  value={details.itineraryTemplateId}
                  aria-label={t('tours.form.template')}
                  onChange={(id) => set('itineraryTemplateId', id)}
                  onPick={(tpl) => {
                    if (!tpl) return;
                    setDetails((d) => ({
                      ...d,
                      destination: d.destination || tpl.destination || '',
                      durationDays: d.durationDays || (tpl.durationDays ? String(tpl.durationDays) : ''),
                      title: d.title || tpl.title || '',
                    }));
                  }}
                />
                <p className="text-xs text-ds-foreground-muted">{t('tours.form.templateHint')}</p>
              </div>
              <div className="space-y-ds-1">
                <Label htmlFor="tour-duration">{t('tours.form.duration')}</Label>
                <Input id="tour-duration" type="number" min={1} max={365} value={details.durationDays} onChange={(e) => set('durationDays', e.target.value)} />
              </div>
              <div className="space-y-ds-1">
                <Label htmlFor="tour-capacity">{t('tours.form.capacity')}</Label>
                <Input id="tour-capacity" type="number" min={0} max={1000} value={details.defaultCapacity} onChange={(e) => set('defaultCapacity', e.target.value)} />
                <p className="text-xs text-ds-foreground-muted">{t('tours.form.capacityHint')}</p>
              </div>
              <div className="space-y-ds-1">
                <Label htmlFor="tour-currency">{t('tours.form.currency')}</Label>
                <SimpleSelect id="tour-currency" value={currency} onChange={(v) => set('currency', v ?? locale.currency)} options={currencyOptions(currency)} />
              </div>
              <div className="space-y-ds-1 sm:col-span-2">
                <Label htmlFor="tour-description">{t('tours.form.descriptionLabel')}</Label>
                <Textarea id="tour-description" rows={3} value={details.description} onChange={(e) => set('description', e.target.value)} />
              </div>
            </div>
          </SectionCard>

          <SectionCard title={t('tours.form.rules')} description={t('tours.form.rulesDescription')}>
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <div className="space-y-ds-1">
                <Label htmlFor="tour-hold">{t('tours.form.holdHours')}</Label>
                <Input
                  id="tour-hold"
                  type="number"
                  min={1}
                  value={details.holdExpiryHours}
                  placeholder={settings ? t('tours.form.agencyDefault', { value: settings.holdExpiryHours }) : undefined}
                  onChange={(e) => set('holdExpiryHours', e.target.value)}
                />
              </div>
              <div className="space-y-ds-1">
                <Label htmlFor="tour-confirm">{t('tours.form.confirmMode')}</Label>
                <SimpleSelect
                  id="tour-confirm"
                  value={details.confirmMode}
                  noneLabel={t('tours.form.useAgencySetting')}
                  onChange={(v) => set('confirmMode', v as ConfirmMode | null)}
                  options={confirmModes}
                />
              </div>
              <div className="space-y-ds-1">
                <Label htmlFor="tour-cutoff">{t('tours.form.bookingCutoff')}</Label>
                <Input
                  id="tour-cutoff"
                  type="number"
                  min={0}
                  value={details.bookingCutoffDays}
                  placeholder={settings ? t('tours.form.agencyDefault', { value: settings.bookingCutoffDays }) : undefined}
                  onChange={(e) => set('bookingCutoffDays', e.target.value)}
                />
              </div>
              <div className="space-y-ds-1">
                <Label htmlFor="tour-extras-cutoff">{t('tours.form.extrasCutoff')}</Label>
                <Input
                  id="tour-extras-cutoff"
                  type="number"
                  min={0}
                  value={details.extrasCutoffDays}
                  placeholder={settings ? t('tours.form.agencyDefault', { value: settings.extrasCutoffDays }) : undefined}
                  onChange={(e) => set('extrasCutoffDays', e.target.value)}
                />
              </div>
              <div className="space-y-ds-1">
                <Label htmlFor="tour-deposit-type">{t('tours.form.deposit')}</Label>
                <SimpleSelect
                  id="tour-deposit-type"
                  value={details.depositType}
                  noneLabel={t('tours.form.useAgencySetting')}
                  onChange={(v) => set('depositType', v as DepositType | null)}
                  options={depositTypes}
                />
              </div>
              {details.depositType && details.depositType !== 'none' && (
                <div className="space-y-ds-1">
                  <Label htmlFor="tour-deposit-value">{t('tours.form.depositValue')}</Label>
                  {details.depositType === 'percent' ? (
                    <Input
                      id="tour-deposit-value"
                      type="number"
                      min={0}
                      max={100}
                      value={details.depositValue ?? ''}
                      onChange={(e) => set('depositValue', e.target.value === '' ? undefined : Number(e.target.value))}
                    />
                  ) : (
                    <CurrencyInput id="tour-deposit-value" value={details.depositValue} currency={currency} onChange={(v) => set('depositValue', v)} />
                  )}
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title={t('tours.form.termsTitle')}>
            <Textarea id="tour-terms" aria-label={t('tours.form.termsTitle')} rows={4} value={details.terms} onChange={(e) => set('terms', e.target.value)} />
            <p className="mt-ds-1 text-xs text-ds-foreground-muted">{t('tours.form.termsHint')}</p>
          </SectionCard>
        </TabsContent>

        <TabsContent value="stops" className="pt-ds-4">
          <SectionCard title={t('tours.form.stopsTitle')} description={t('tours.form.stopsDescription')}>
            <StopsEditor value={stops} onChange={setStops} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="prices" className="pt-ds-4">
          <div className="space-y-ds-4">
            <SectionCard title={t('tours.bands.title')} description={t('tours.bands.description')}>
              <TourAgeBands custom={ownBands.custom} rows={ownBands.rows} agencyBands={agencyBands} onChange={setOwnBands} disabled={saving} />
            </SectionCard>
            <SectionCard title={t('tours.form.pricesTitle')} description={t('tours.form.pricesDescription', { currency })}>
              <PricesEditor value={prices} onChange={setPrices} currency={currency} roomTypes={roomTypes} bands={tourBandsInForce(ownBands.custom, ownBands.rows, agencyBands)} />
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="extras" className="pt-ds-4">
          <SectionCard title={t('tours.form.extrasTitle')}>
            <ExtrasEditor value={extras} onChange={setExtras} currency={currency} />
          </SectionCard>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
