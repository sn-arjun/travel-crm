'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { PageContainer } from '@/components/layout/page-container';
import { Button, DatePicker, Input, Label, PageHeader, SectionCard, Spinner, Tag, Textarea } from '@/components/ui';
import { useGroupTours } from '@/hooks/use-group-tours';
import { departuresApi, type DepartureInput } from '@/lib/api/departures';
import { toursApi, type TourDetail } from '@/lib/api/tours';
import { formatDisplayDate, toLocalDateString } from '@/lib/dates';
import { datesEvery, departureErrorText } from '@/lib/departures';
import { useT } from '@/lib/i18n';
import { DriverCombobox, TourCombobox, UserCombobox } from '../_components/relation-pickers';
import { SimpleSelect } from '../_components/simple-select';
import { VehiclesEditor, fromVehicleRows, type VehicleRow } from '../_components/vehicles-editor';

export default function NewDeparturePage() {
  const t = useT();
  const router = useRouter();
  const search = useSearchParams();
  const { settings } = useGroupTours();

  const [tourId, setTourId] = React.useState<string | null>(search.get('tourId'));
  const [tour, setTour] = React.useState<TourDetail | null>(null);
  const [dates, setDates] = React.useState<string[]>([]);
  const [pickerValue, setPickerValue] = React.useState<Date | undefined>(undefined);
  const [repeatEvery, setRepeatEvery] = React.useState('7');
  const [repeatCount, setRepeatCount] = React.useState('4');
  const [startTime, setStartTime] = React.useState('');
  const [capacityMode, setCapacityMode] = React.useState<'vehicles' | 'manual'>('vehicles');
  const [capacity, setCapacity] = React.useState('');
  const [vehicles, setVehicles] = React.useState<VehicleRow[]>([]);
  const [leaderDriver, setLeaderDriver] = React.useState<string | null>(null);
  const [leaderUser, setLeaderUser] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // The tour's own numbers (its default capacity, its length) are the starting point.
  React.useEffect(() => {
    if (!tourId) {
      setTour(null);
      return;
    }
    let cancelled = false;
    toursApi
      .get(tourId)
      .then((x) => !cancelled && setTour(x))
      .catch(() => !cancelled && setTour(null));
    return () => {
      cancelled = true;
    };
  }, [tourId]);

  const sorted = React.useMemo(() => [...new Set(dates)].sort(), [dates]);
  const addDate = (d: Date | undefined) => {
    setPickerValue(undefined);
    if (!d) return;
    const iso = toLocalDateString(d);
    setDates((list) => (list.includes(iso) ? list : [...list, iso]));
  };

  function repeatFromFirst() {
    const first = sorted[0];
    if (!first) return;
    setDates(datesEvery(first, Number(repeatEvery) || 7, Number(repeatCount) || 1));
  }

  async function save() {
    setError(null);
    if (!tourId) return setError(t('departures.form.errors.tour'));
    if (sorted.length === 0) return setError(t('departures.form.errors.dates'));
    if (capacityMode === 'manual' && !(Number(capacity) >= 0 && capacity.trim() !== '')) return setError(t('departures.form.errors.capacity'));
    setSaving(true);
    const body: DepartureInput = {
      startTime: startTime || null,
      capacityMode,
      ...(capacityMode === 'manual' ? { capacity: Math.floor(Number(capacity)) } : { vehicles: fromVehicleRows(vehicles) }),
      tourLeaderDriverId: leaderDriver,
      tourLeaderUserId: leaderUser,
      notes: notes.trim() || null,
    };
    try {
      if (sorted.length === 1) {
        const created = await departuresApi.create({ ...body, tourId, startDate: sorted[0] as string });
        toast.success(t('departures.form.created', { code: created.code }));
        router.push(`/departures/${created.id}`);
      } else {
        const r = await departuresApi.createBulk({ ...body, tourId, dates: sorted });
        toast.success(t('departures.form.createdMany', { count: r.created.length }));
        if (r.skipped.length > 0) toast.warning(t('departures.form.skipped', { count: r.skipped.length, dates: r.skipped.map((s) => formatDisplayDate(s.date)).join(', ') }));
        router.push(`/tours/${tourId}`);
      }
    } catch (err) {
      setError(departureErrorText(err, t, 'departures.form.failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        title={t('departures.form.title')}
        description={t('departures.form.description')}
        actions={
          <>
            <Button variant="outline" onClick={() => router.back()} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void save()} disabled={saving} data-testid="departure-save">
              {saving && <Spinner className="size-4" />}
              {sorted.length > 1 ? t('departures.form.createMany', { count: sorted.length }) : t('departures.form.create')}
            </Button>
          </>
        }
      />

      {error && (
        <p role="alert" className="rounded-ds-md border border-ds-danger bg-ds-danger-subtle px-ds-3 py-ds-2 text-sm text-ds-danger-on-subtle" data-testid="departure-form-error">
          {error}
        </p>
      )}

      <SectionCard title={t('departures.form.tourAndDates')} required>
        <div className="space-y-ds-4">
          <div className="space-y-ds-1">
            <Label>{t('departures.form.tour')} *</Label>
            <TourCombobox value={tourId} onChange={setTourId} required aria-label={t('departures.form.tour')} />
            {tour && (
              <p className="text-xs text-ds-foreground-muted">
                {t('departures.form.tourSummary', { days: tour.durationDays ?? 1, capacity: tour.defaultCapacity ?? 0 })}
              </p>
            )}
          </div>

          <div className="space-y-ds-2">
            <Label>{t('departures.form.dates')} *</Label>
            <div className="flex flex-wrap items-center gap-ds-2">
              <DatePicker
                value={pickerValue}
                onChange={addDate}
                placeholder={t('departures.form.addDate')}
                aria-label={t('departures.form.addDate')}
                minDate={new Date()}
                fromYear={new Date().getFullYear()}
                toYear={new Date().getFullYear() + 5}
                className="w-56"
              />
              <span className="text-xs text-ds-foreground-muted">{t('departures.form.datesHint')}</span>
            </div>
            {sorted.length > 0 && (
              <div className="flex flex-wrap gap-ds-2" data-testid="departure-dates">
                {sorted.map((d) => (
                  <Tag key={d} tone="primary" size="lg" onRemove={() => setDates((list) => list.filter((x) => x !== d))} removeLabel={t('departures.form.removeDate', { date: formatDisplayDate(d) })}>
                    {formatDisplayDate(d)}
                  </Tag>
                ))}
              </div>
            )}
            {sorted.length > 0 && (
              <div className="flex flex-wrap items-end gap-ds-2 rounded-ds-md border border-ds-border bg-ds-surface-sunken p-ds-3">
                <div className="space-y-ds-1">
                  <Label htmlFor="repeat-every">{t('departures.form.repeatEvery')}</Label>
                  <Input id="repeat-every" type="number" min={1} max={365} value={repeatEvery} onChange={(e) => setRepeatEvery(e.target.value)} className="w-24" />
                </div>
                <div className="space-y-ds-1">
                  <Label htmlFor="repeat-count">{t('departures.form.repeatCount')}</Label>
                  <Input id="repeat-count" type="number" min={1} max={60} value={repeatCount} onChange={(e) => setRepeatCount(e.target.value)} className="w-24" />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={repeatFromFirst}>
                  {t('departures.form.repeatApply')}
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-ds-1">
            <Label htmlFor="departure-time">{t('departures.form.startTime')}</Label>
            <Input id="departure-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-40" />
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t('departures.form.seatsTitle')} description={t('departures.form.seatsDescription')}>
        <div className="space-y-ds-4">
          <div className="space-y-ds-1">
            <Label htmlFor="capacity-mode">{t('departures.form.capacityMode')}</Label>
            <SimpleSelect
              id="capacity-mode"
              value={capacityMode}
              onChange={(v) => setCapacityMode((v as 'vehicles' | 'manual') ?? 'vehicles')}
              className="w-72"
              options={[
                { value: 'vehicles', label: t('departures.form.capacityVehicles') },
                { value: 'manual', label: t('departures.form.capacityManual') },
              ]}
            />
          </div>
          {capacityMode === 'manual' ? (
            <div className="space-y-ds-1">
              <Label htmlFor="capacity-manual">{t('departures.form.capacity')}</Label>
              <Input
                id="capacity-manual"
                type="number"
                min={0}
                value={capacity}
                placeholder={tour?.defaultCapacity ? String(tour.defaultCapacity) : undefined}
                onChange={(e) => setCapacity(e.target.value)}
                className="w-40"
              />
            </div>
          ) : (
            <VehiclesEditor value={vehicles} onChange={setVehicles} defaultCapacity={settings?.defaultVehicleCapacity ?? 49} />
          )}
        </div>
      </SectionCard>

      <SectionCard title={t('departures.form.crewTitle')}>
        <div className="grid gap-ds-4 sm:grid-cols-2">
          <div className="space-y-ds-1">
            <Label>{t('departures.form.leaderDriver')}</Label>
            <DriverCombobox value={leaderDriver} onChange={setLeaderDriver} aria-label={t('departures.form.leaderDriver')} />
          </div>
          <div className="space-y-ds-1">
            <Label>{t('departures.form.leaderUser')}</Label>
            <UserCombobox value={leaderUser} onChange={setLeaderUser} aria-label={t('departures.form.leaderUser')} />
          </div>
          <div className="space-y-ds-1 sm:col-span-2">
            <Label htmlFor="departure-notes">{t('departures.form.notes')}</Label>
            <Textarea id="departure-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </SectionCard>
      <p className="text-xs text-ds-foreground-muted">{t('departures.form.draftNote')}</p>
    </PageContainer>
  );
}
