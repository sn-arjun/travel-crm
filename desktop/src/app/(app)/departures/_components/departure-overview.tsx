'use client';

import * as React from 'react';
import { toast } from 'sonner';

import { Button, DatePicker, Input, Label, SectionCard, Spinner, Textarea } from '@/components/ui';
import {
  departuresApi, type ConfirmMode, type DepartureDetail, type GroupToursSettings,
} from '@/lib/api/departures';
import type { TourDetail } from '@/lib/api/tours';
import { parseLocalDate, toLocalDateString } from '@/lib/dates';
import { departureErrorText, effectiveSettings } from '@/lib/departures';
import { useT } from '@/lib/i18n';
import { DriverCombobox, UserCombobox } from './relation-pickers';
import { SeatsBar } from './seats-bar';
import { SimpleSelect } from './simple-select';
import { VehiclesEditor, fromVehicleRows, toVehicleRows, type VehicleRow } from './vehicles-editor';

interface DepartureOverviewProps {
  departure: DepartureDetail;
  tour: TourDetail | null;
  settings: GroupToursSettings | null;
  canEdit: boolean;
  onSaved: (departure: DepartureDetail) => void;
}

const numText = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

/**
 * Overview of a departure: the seats at a glance and the editable facts (dates, start time, cut-offs, the rules that override
 * the agency's, the tour leader, the coaches and capacity). A departure that is cancelled, departed or completed is read-only.
 */
export function DepartureOverview({ departure, tour, settings, canEdit, onSaved }: DepartureOverviewProps) {
  const t = useT();
  const locked = !canEdit || ['cancelled', 'completed', 'departed'].includes(departure.status);
  const [startDate, setStartDate] = React.useState(departure.startDate);
  const [endDate, setEndDate] = React.useState(departure.endDate);
  const [startTime, setStartTime] = React.useState(departure.startTime ?? '');
  const [bookingCutoff, setBookingCutoff] = React.useState<string | null>(departure.bookingCutoffDate);
  const [extrasCutoff, setExtrasCutoff] = React.useState<string | null>(departure.extrasCutoffDate);
  const [holdHours, setHoldHours] = React.useState(numText(departure.holdExpiryHours));
  const [confirmMode, setConfirmMode] = React.useState<ConfirmMode | null>(departure.confirmMode);
  const [leaderDriver, setLeaderDriver] = React.useState<string | null>(departure.tourLeaderDriverId);
  const [leaderUser, setLeaderUser] = React.useState<string | null>(departure.tourLeaderUserId);
  const [notes, setNotes] = React.useState(departure.notes ?? '');
  const [mode, setMode] = React.useState<'vehicles' | 'manual'>(departure.capacityMode);
  const [capacity, setCapacity] = React.useState(String(departure.capacity));
  const [vehicles, setVehicles] = React.useState<VehicleRow[]>(() => toVehicleRows(departure.vehicles));
  const [saving, setSaving] = React.useState(false);

  const eff = settings ? effectiveSettings(departure, tour, settings) : null;
  const vehicleSeats = vehicles.reduce((n, v) => n + v.capacity, 0);

  async function save() {
    setSaving(true);
    try {
      // Coaches first: in vehicles mode the capacity follows them, and the API refuses a capacity below the seats in use.
      if (mode === 'vehicles') await departuresApi.replaceVehicles(departure.id, fromVehicleRows(vehicles));
      const updated = await departuresApi.update(departure.id, {
        startDate,
        endDate,
        startTime: startTime || null,
        bookingCutoffDate: bookingCutoff,
        extrasCutoffDate: extrasCutoff,
        holdExpiryHours: holdHours.trim() === '' ? null : Math.max(1, Math.floor(Number(holdHours) || 1)),
        confirmMode,
        tourLeaderDriverId: leaderDriver,
        tourLeaderUserId: leaderUser,
        notes: notes.trim() || null,
        capacityMode: mode,
        ...(mode === 'manual' ? { capacity: Math.max(0, Math.floor(Number(capacity) || 0)) } : {}),
      });
      toast.success(t('departures.overview.saved'));
      onSaved(updated);
    } catch (err) {
      toast.error(departureErrorText(err, t, 'departures.overview.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  const dateField = (id: string, label: string, value: string | null, onChange: (v: string | null) => void) => (
    <div className="space-y-ds-1">
      <Label htmlFor={id}>{label}</Label>
      <DatePicker
        id={id}
        value={value ? parseLocalDate(value) : undefined}
        onChange={(d) => onChange(d ? toLocalDateString(d) : null)}
        disabled={locked}
        aria-label={label}
        fromYear={new Date().getFullYear() - 1}
        toYear={new Date().getFullYear() + 6}
      />
    </div>
  );

  return (
    <div className="grid gap-ds-4 lg:grid-cols-3">
      <SectionCard title={t('departures.overview.seats')} className="lg:col-span-1">
        <SeatsBar seats={departure.seats} variant="full" />
        <dl className="mt-ds-3 grid grid-cols-2 gap-ds-2 text-sm">
          <div>
            <dt className="text-ds-foreground-muted">{t('departures.overview.capacity')}</dt>
            <dd className="tabular-nums" data-testid="overview-capacity">{departure.seats.capacity}</dd>
          </div>
          <div>
            <dt className="text-ds-foreground-muted">{t('departures.overview.left')}</dt>
            <dd className="tabular-nums" data-testid="overview-left">{departure.seats.left}</dd>
          </div>
          <div>
            <dt className="text-ds-foreground-muted">{t('departures.overview.confirmed')}</dt>
            <dd className="tabular-nums">{departure.seats.confirmed}</dd>
          </div>
          <div>
            <dt className="text-ds-foreground-muted">{t('departures.overview.held')}</dt>
            <dd className="tabular-nums">{departure.seats.held}</dd>
          </div>
          <div>
            <dt className="text-ds-foreground-muted">{t('departures.overview.waitlisted')}</dt>
            <dd className="tabular-nums">{departure.seats.waitlisted}</dd>
          </div>
        </dl>
        {departure.status === 'cancelled' && departure.cancelledReason && (
          <p className="mt-ds-3 text-sm text-ds-danger-on-subtle">{t('departures.overview.cancelledBecause', { reason: departure.cancelledReason })}</p>
        )}
      </SectionCard>

      <SectionCard title={t('departures.overview.dates')} className="lg:col-span-2">
        <div className="grid gap-ds-4 sm:grid-cols-2">
          {dateField('dep-start', t('departures.overview.startDate'), startDate, (v) => v && setStartDate(v))}
          {dateField('dep-end', t('departures.overview.endDate'), endDate, (v) => v && setEndDate(v))}
          <div className="space-y-ds-1">
            <Label htmlFor="dep-time">{t('departures.overview.startTime')}</Label>
            <Input id="dep-time" type="time" value={startTime} disabled={locked} onChange={(e) => setStartTime(e.target.value)} className="w-40" />
          </div>
          <div />
          {dateField('dep-booking-cutoff', t('departures.overview.bookingCutoff'), bookingCutoff, setBookingCutoff)}
          {dateField('dep-extras-cutoff', t('departures.overview.extrasCutoff'), extrasCutoff, setExtrasCutoff)}
        </div>
      </SectionCard>

      <SectionCard title={t('departures.overview.rules')} description={t('departures.overview.rulesDescription')} className="lg:col-span-1">
        <div className="space-y-ds-4">
          <div className="space-y-ds-1">
            <Label htmlFor="dep-hold">{t('departures.overview.holdHours')}</Label>
            <Input
              id="dep-hold"
              type="number"
              min={1}
              value={holdHours}
              disabled={locked}
              placeholder={eff ? t('tours.form.agencyDefault', { value: eff.holdExpiryHours }) : undefined}
              onChange={(e) => setHoldHours(e.target.value)}
            />
          </div>
          <div className="space-y-ds-1">
            <Label htmlFor="dep-confirm">{t('departures.overview.confirmMode')}</Label>
            <SimpleSelect
              id="dep-confirm"
              value={confirmMode}
              disabled={locked}
              noneLabel={t('departures.overview.inherit')}
              onChange={(v) => setConfirmMode(v as ConfirmMode | null)}
              options={[
                { value: 'manual', label: t('groupTours.confirmMode.manual') },
                { value: 'auto_when_available', label: t('groupTours.confirmMode.auto') },
                { value: 'on_deposit', label: t('groupTours.confirmMode.deposit') },
              ]}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t('departures.overview.crew')} className="lg:col-span-2">
        <div className="grid gap-ds-4 sm:grid-cols-2">
          <div className="space-y-ds-1">
            <Label>{t('departures.form.leaderDriver')}</Label>
            <DriverCombobox value={leaderDriver} onChange={setLeaderDriver} disabled={locked} aria-label={t('departures.form.leaderDriver')} />
          </div>
          <div className="space-y-ds-1">
            <Label>{t('departures.form.leaderUser')}</Label>
            <UserCombobox value={leaderUser} onChange={setLeaderUser} disabled={locked} aria-label={t('departures.form.leaderUser')} />
          </div>
          <div className="space-y-ds-1 sm:col-span-2">
            <Label htmlFor="dep-notes">{t('departures.form.notes')}</Label>
            <Textarea id="dep-notes" rows={2} value={notes} disabled={locked} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t('departures.overview.coaches')} description={t('departures.overview.coachesDescription')} className="lg:col-span-3">
        <div className="space-y-ds-4">
          <div className="space-y-ds-1">
            <Label htmlFor="dep-capacity-mode">{t('departures.form.capacityMode')}</Label>
            <SimpleSelect
              id="dep-capacity-mode"
              value={mode}
              disabled={locked}
              className="w-72"
              onChange={(v) => setMode((v as 'vehicles' | 'manual') ?? 'vehicles')}
              options={[
                { value: 'vehicles', label: t('departures.form.capacityVehicles') },
                { value: 'manual', label: t('departures.form.capacityManual') },
              ]}
            />
          </div>
          {mode === 'manual' ? (
            <div className="space-y-ds-1">
              <Label htmlFor="dep-capacity">{t('departures.form.capacity')}</Label>
              <Input id="dep-capacity" type="number" min={departure.seats.held + departure.seats.confirmed} value={capacity} disabled={locked} onChange={(e) => setCapacity(e.target.value)} className="w-40" />
              <p className="text-xs text-ds-foreground-muted">{t('departures.overview.capacityFloor', { count: departure.seats.held + departure.seats.confirmed })}</p>
            </div>
          ) : (
            <>
              <VehiclesEditor value={vehicles} onChange={setVehicles} defaultCapacity={settings?.defaultVehicleCapacity ?? 49} disabled={locked} />
              {vehicles.length > 0 && <p className="text-xs text-ds-foreground-muted">{t('departures.overview.capacityFromCoaches', { count: vehicleSeats })}</p>}
            </>
          )}
        </div>
      </SectionCard>

      {!locked && (
        <div className="lg:col-span-3">
          <Button onClick={() => void save()} disabled={saving} data-testid="overview-save">
            {saving && <Spinner className="size-4" />}
            {t('departures.overview.save')}
          </Button>
        </div>
      )}
    </div>
  );
}
