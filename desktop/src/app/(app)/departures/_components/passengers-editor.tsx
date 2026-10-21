'use client';

import * as React from 'react';
import { Plus, Trash2, UserPlus } from 'lucide-react';

import { Button, Checkbox, DatePicker, Input, Label, Tag } from '@/components/ui';
import type { PassengerFieldDef, PassengerInput, Passenger, RoomTypeDef } from '@/lib/api/departures';
import type { Stop } from '@/lib/api/tours';
import { ageOn, bandLabel, defaultBandKey, passengerField, passengerFieldOn } from '@/lib/departures';
import { parseLocalDate, toLocalDateString } from '@/lib/dates';
import { useT } from '@/lib/i18n';
import { SimpleSelect } from './simple-select';
import { TravellerCombobox } from './relation-pickers';

/** A passenger being edited: the API input plus a local key and the read-only facts of a saved passenger. */
export interface PassengerRow extends PassengerInput {
  _key: string;
  bandKey?: string | null;
  seatNumber?: string | null;
  documentsStatus?: Passenger['documentsStatus'];
}

let counter = 0;
const newKey = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`;

export function emptyPassenger(): PassengerRow {
  return { _key: newKey(), firstName: '', lastName: '', shareOk: false, shareGender: false, extraFields: {} };
}

export function rowFromPassenger(p: Passenger): PassengerRow {
  return {
    _key: p.id,
    id: p.id,
    travellerId: p.travellerId,
    firstName: p.firstName,
    lastName: p.lastName,
    gender: (p.gender as PassengerInput['gender']) ?? null,
    dateOfBirth: p.dateOfBirth,
    ageYears: p.ageYears,
    pickupStopId: p.pickupStopId,
    roomType: p.roomType,
    shareOk: p.shareOk,
    shareGender: p.shareGender,
    mealPreference: p.mealPreference,
    extraFields: (p.extraFields ?? {}) as PassengerInput['extraFields'],
    bandKey: p.bandKey,
    seatNumber: p.seatNumber,
    documentsStatus: p.documentsStatus,
  };
}

/** The body of PUT /seat-bookings/:id/passengers for these rows. */
export function inputsFromRows(rows: readonly PassengerRow[]): PassengerInput[] {
  return rows.map(({ _key, bandKey: _b, seatNumber: _s, documentsStatus: _d, ...input }) => ({
    ...input,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
  }));
}

const BUILT_IN_EXTRA = ['nationality', 'documentType', 'documentNumber', 'documentExpiry', 'documentExpiry2'] as const;
const EXTRA_DATE_KEYS: ReadonlySet<string> = new Set(['documentExpiry', 'documentExpiry2']);

interface PassengersEditorProps {
  value: PassengerRow[];
  onChange: (rows: PassengerRow[]) => void;
  /** The agency's (or tour's) passenger fields; a field that is not listed is not asked. */
  fields: readonly PassengerFieldDef[];
  roomTypes: readonly RoomTypeDef[];
  /** Pickup points of the departure (stops of kind pickup or both). */
  stops: readonly Stop[];
  /** The departure's first day: ages are worked out on it. */
  travelDate: string;
  preferredSeat?: boolean;
  disabled?: boolean;
}

function DateField({ value, onChange, disabled, label, from, to }: { value: string | null | undefined; onChange: (v: string | null) => void; disabled?: boolean; label: string; from?: number; to?: number }) {
  return (
    <DatePicker
      value={value ? parseLocalDate(value) : undefined}
      onChange={(d) => onChange(d ? toLocalDateString(d) : null)}
      disabled={disabled}
      aria-label={label}
      fromYear={from}
      toYear={to}
    />
  );
}

/**
 * One card per passenger with the passenger fields the agency asks for, plus the agency's own fields. The age band is worked
 * out from the date of birth (or the age) on the departure's first day; the API re-derives it with the agency's band list on
 * save. A traveller can be linked from the travellers list, or created from the booking on save.
 */
export function PassengersEditor({ value, onChange, fields, roomTypes, stops, travelDate, preferredSeat, disabled }: PassengersEditorProps) {
  const t = useT();
  const pickups = stops.filter((s) => s.id && (s.kind === 'pickup' || s.kind === 'both' || !s.kind));
  const thisYear = new Date().getFullYear();

  const patch = (key: string, change: Partial<PassengerRow>) => onChange(value.map((r) => (r._key === key ? { ...r, ...change } : r)));
  const patchExtra = (key: string, field: string, v: string | number | boolean | null) =>
    onChange(value.map((r) => (r._key === key ? { ...r, extraFields: { ...(r.extraFields ?? {}), [field]: v } } : r)));
  const customFields = fields.filter((f) => f.custom);

  return (
    <div className="space-y-ds-3" data-testid="passengers-editor">
      {value.length === 0 && <p className="text-sm text-ds-foreground-muted">{t('departures.passengers.none')}</p>}
      {value.map((row, i) => {
        const age = row.dateOfBirth && travelDate ? ageOn(row.dateOfBirth, travelDate) : (row.ageYears ?? null);
        const band = row.dateOfBirth || row.ageYears != null ? defaultBandKey(age) : (row.bandKey ?? null);
        const id = `pax-${row._key}`;
        const extra = (k: string) => String((row.extraFields ?? {})[k] ?? '');
        return (
          <div key={row._key} className="rounded-ds-md border border-ds-border bg-ds-surface p-ds-3" data-testid="passenger-row">
            <div className="mb-ds-3 flex items-center justify-between gap-ds-2">
              <div className="flex items-center gap-ds-2">
                <span className="text-sm font-medium">{t('departures.passengers.number', { n: i + 1 })}</span>
                {band && <Tag tone="info">{t('departures.passengers.band', { band: bandLabel(band, t) })}</Tag>}
                {row.documentsStatus && row.documentsStatus !== 'unknown' && (
                  <Tag tone={row.documentsStatus === 'problem' ? 'danger' : 'success'}>{t('departures.passengers.docs', { status: t(`departures.passengers.docsStatus.${row.documentsStatus}`) })}</Tag>
                )}
                {preferredSeat && row.seatNumber && <Tag>{t('departures.passengers.seat', { seat: row.seatNumber })}</Tag>}
              </div>
              <Button variant="ghost" size="icon-sm" aria-label={t('departures.passengers.remove')} disabled={disabled} onClick={() => onChange(value.filter((r) => r._key !== row._key))}>
                <Trash2 aria-hidden="true" />
              </Button>
            </div>

            <div className="grid gap-ds-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-ds-1">
                <Label htmlFor={`${id}-first`}>{t('departures.passengers.firstName')}</Label>
                <Input id={`${id}-first`} value={row.firstName} disabled={disabled} onChange={(e) => patch(row._key, { firstName: e.target.value })} />
              </div>
              <div className="space-y-ds-1">
                <Label htmlFor={`${id}-last`}>{t('departures.passengers.lastName')}</Label>
                <Input id={`${id}-last`} value={row.lastName} disabled={disabled} onChange={(e) => patch(row._key, { lastName: e.target.value })} />
              </div>

              {passengerFieldOn(fields, 'gender') && (
                <div className="space-y-ds-1">
                  <Label htmlFor={`${id}-gender`}>{t('departures.passengers.gender')}</Label>
                  <SimpleSelect
                    id={`${id}-gender`}
                    value={row.gender ?? null}
                    onChange={(v) => patch(row._key, { gender: (v as PassengerInput['gender']) ?? null })}
                    noneLabel={t('departures.passengers.notSet')}
                    disabled={disabled}
                    options={[
                      { value: 'male', label: t('departures.passengers.genderMale') },
                      { value: 'female', label: t('departures.passengers.genderFemale') },
                      { value: 'other', label: t('departures.passengers.genderOther') },
                    ]}
                  />
                </div>
              )}

              {passengerFieldOn(fields, 'dateOfBirth') && (
                <div className="space-y-ds-1">
                  <Label>{t('departures.passengers.dateOfBirth')}</Label>
                  <DateField
                    value={row.dateOfBirth}
                    onChange={(v) => patch(row._key, { dateOfBirth: v })}
                    disabled={disabled}
                    label={t('departures.passengers.dateOfBirth')}
                    from={thisYear - 110}
                    to={thisYear}
                  />
                  {age !== null && <p className="text-xs text-ds-foreground-muted">{t('departures.passengers.age', { age })}</p>}
                </div>
              )}
              {passengerFieldOn(fields, 'dateOfBirth') && !row.dateOfBirth && (
                <div className="space-y-ds-1">
                  <Label htmlFor={`${id}-age`}>{t('departures.passengers.ageYears')}</Label>
                  <Input
                    id={`${id}-age`}
                    type="number"
                    min={0}
                    max={120}
                    value={row.ageYears ?? ''}
                    disabled={disabled}
                    onChange={(e) => patch(row._key, { ageYears: e.target.value === '' ? null : Math.max(0, Math.min(120, Number(e.target.value))) })}
                  />
                </div>
              )}

              {passengerFieldOn(fields, 'pickupPoint') && (
                <div className="space-y-ds-1">
                  <Label htmlFor={`${id}-pickup`}>{t('departures.passengers.pickup')}</Label>
                  <SimpleSelect
                    id={`${id}-pickup`}
                    value={row.pickupStopId ?? null}
                    onChange={(v) => patch(row._key, { pickupStopId: v })}
                    noneLabel={t('departures.passengers.notSet')}
                    disabled={disabled}
                    options={pickups.map((s) => ({ value: s.id as string, label: s.localTime ? `${s.name} (${s.localTime})` : s.name }))}
                  />
                </div>
              )}

              {passengerFieldOn(fields, 'roomType') && (
                <div className="space-y-ds-1">
                  <Label htmlFor={`${id}-room`}>{t('departures.passengers.roomType')}</Label>
                  <SimpleSelect
                    id={`${id}-room`}
                    value={row.roomType ?? null}
                    onChange={(v) => patch(row._key, { roomType: v })}
                    noneLabel={t('departures.passengers.notSet')}
                    disabled={disabled}
                    options={roomTypes.map((r) => ({ value: r.key, label: t('departures.passengers.roomOption', { label: r.label, count: r.occupancy }) }))}
                  />
                  <label className="flex items-center gap-ds-2 text-xs text-ds-foreground-muted">
                    <Checkbox checked={Boolean(row.shareOk)} disabled={disabled} onCheckedChange={(c) => patch(row._key, { shareOk: c === true })} />
                    {t('departures.passengers.shareOk')}
                  </label>
                  {row.shareOk && (
                    <label className="flex items-center gap-ds-2 text-xs text-ds-foreground-muted">
                      <Checkbox checked={Boolean(row.shareGender)} disabled={disabled} onCheckedChange={(c) => patch(row._key, { shareGender: c === true })} />
                      {t('departures.passengers.shareGender')}
                    </label>
                  )}
                </div>
              )}

              {passengerFieldOn(fields, 'meal') && (
                <div className="space-y-ds-1">
                  <Label htmlFor={`${id}-meal`}>{t('departures.passengers.meal')}</Label>
                  <Input id={`${id}-meal`} value={row.mealPreference ?? ''} disabled={disabled} onChange={(e) => patch(row._key, { mealPreference: e.target.value || null })} />
                </div>
              )}

              {BUILT_IN_EXTRA.filter((k) => passengerFieldOn(fields, k)).map((k) => (
                <div key={k} className="space-y-ds-1">
                  <Label htmlFor={`${id}-${k}`}>{passengerField(fields, k)?.label ?? k}</Label>
                  {EXTRA_DATE_KEYS.has(k) ? (
                    <DateField
                      value={extra(k) || null}
                      onChange={(v) => patchExtra(row._key, k, v)}
                      disabled={disabled}
                      label={passengerField(fields, k)?.label ?? k}
                      from={thisYear - 5}
                      to={thisYear + 20}
                    />
                  ) : (
                    <Input id={`${id}-${k}`} value={extra(k)} disabled={disabled} onChange={(e) => patchExtra(row._key, k, e.target.value || null)} />
                  )}
                </div>
              ))}

              {customFields.map((f) => (
                <div key={f.key} className="space-y-ds-1">
                  <Label htmlFor={`${id}-${f.key}`}>{f.label}</Label>
                  {f.type === 'date' ? (
                    <DateField value={extra(f.key) || null} onChange={(v) => patchExtra(row._key, f.key, v)} disabled={disabled} label={f.label} from={thisYear - 100} to={thisYear + 20} />
                  ) : f.type === 'select' ? (
                    <SimpleSelect
                      id={`${id}-${f.key}`}
                      value={extra(f.key) || null}
                      onChange={(v) => patchExtra(row._key, f.key, v)}
                      noneLabel={t('departures.passengers.notSet')}
                      disabled={disabled}
                      options={(f.options ?? []).map((o) => ({ value: o, label: o }))}
                    />
                  ) : f.type === 'boolean' ? (
                    <div>
                      <Checkbox id={`${id}-${f.key}`} checked={(row.extraFields ?? {})[f.key] === true} disabled={disabled} onCheckedChange={(c) => patchExtra(row._key, f.key, c === true)} />
                    </div>
                  ) : (
                    <Input id={`${id}-${f.key}`} value={extra(f.key)} disabled={disabled} onChange={(e) => patchExtra(row._key, f.key, e.target.value || null)} />
                  )}
                </div>
              ))}

              <div className="space-y-ds-1 sm:col-span-2 lg:col-span-3">
                <Label>{t('departures.passengers.traveller')}</Label>
                <TravellerCombobox
                  value={row.travellerId ?? null}
                  disabled={disabled}
                  aria-label={t('departures.passengers.traveller')}
                  placeholder={t('departures.passengers.travellerPlaceholder')}
                  onChange={(id) => patch(row._key, { travellerId: id })}
                  onPick={(trav) => {
                    if (!trav) return;
                    patch(row._key, {
                      travellerId: trav.id,
                      firstName: row.firstName || trav.firstName,
                      lastName: row.lastName || trav.lastName,
                      dateOfBirth: row.dateOfBirth ?? (trav.dateOfBirth ? trav.dateOfBirth.slice(0, 10) : null),
                    });
                  }}
                />
                {!row.travellerId && <p className="text-xs text-ds-foreground-muted">{t('departures.passengers.travellerHint')}</p>}
              </div>
            </div>
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange([...value, emptyPassenger()])}>
        {value.length === 0 ? <UserPlus aria-hidden="true" /> : <Plus aria-hidden="true" />}
        {t('departures.passengers.add')}
      </Button>
    </div>
  );
}
