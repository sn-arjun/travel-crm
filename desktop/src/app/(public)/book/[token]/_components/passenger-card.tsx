'use client';

import * as React from 'react';

import { Checkbox, Input } from '@/components/ui';
import { collects, isExtraField, topBand, type FieldProblem, type PartyMember, type PublicPage } from '@/lib/booking-form';
import { useT } from '@/lib/i18n';
import { Choice, Field, money, useBandName, useFieldLabel } from './booking-ui';

interface PassengerCardProps {
  page: PublicPage;
  member: PartyMember;
  index: number;
  problems: readonly FieldProblem[];
  onChange: (patch: Partial<PartyMember>) => void;
}

/** One traveller: name, age or date of birth, and every field the departure collects at booking. */
export function PassengerCard({ page, member, index, problems, onChange }: PassengerCardProps) {
  const t = useT();
  const bandName = useBandName();
  const fieldLabel = useFieldLabel();
  const band = page.prices.bands.find((b) => b.key === member.band);
  const pre = `p${index}`;
  const err = (field: string) => {
    const p = problems.find((x) => x.index === index && x.field === field);
    return p ? t(p.key) : undefined;
  };
  const required = (key: string) => page.passengerFields.find((f) => f.key === key)?.required ?? false;
  const isTop = member.band === topBand(page)?.key;
  const wantsDob = collects(page, 'dateOfBirth');
  // Anyone but an adult is priced by age, so the age is always asked; adults only when the departure collects the date of birth.
  const showDob = wantsDob;
  const showAge = !isTop && !wantsDob;
  const extras = page.passengerFields.filter(isExtraField);
  const supplements = new Map(page.prices.roomSupplements.map((r) => [r.key, r.amount]));

  return (
    <fieldset className="space-y-ds-3 rounded-xl border border-ds-border bg-ds-surface p-ds-4" data-testid={`passenger-${index}`}>
      <legend className="px-1 text-sm font-semibold">
        {band ? t('booking.passenger.titleBand', { number: index + 1, band: bandName(band) }) : t('booking.passenger.title', { number: index + 1 })}
      </legend>

      <div className="grid gap-ds-3 sm:grid-cols-2">
        <Field id={`${pre}-first`} label={t('booking.field.firstName')} required error={err('firstName')}>
          <Input id={`${pre}-first`} value={member.firstName} autoComplete={index === 0 ? 'given-name' : 'off'} maxLength={80} aria-invalid={!!err('firstName') || undefined} aria-describedby={err('firstName') ? `${pre}-first-error` : undefined} onChange={(e) => onChange({ firstName: e.target.value })} data-testid={`${pre}-first`} />
        </Field>
        <Field id={`${pre}-last`} label={t('booking.field.lastName')} error={err('lastName')}>
          <Input id={`${pre}-last`} value={member.lastName} autoComplete={index === 0 ? 'family-name' : 'off'} maxLength={80} onChange={(e) => onChange({ lastName: e.target.value })} data-testid={`${pre}-last`} />
        </Field>

        {collects(page, 'gender') && (
          <Field id={`${pre}-gender`} label={t('booking.field.gender')} required={required('gender')} error={err('gender')}>
            <Choice
              id={`${pre}-gender`}
              value={member.gender}
              onChange={(v) => onChange({ gender: v as PartyMember['gender'] })}
              noneLabel={required('gender') ? undefined : t('booking.select.none')}
              invalid={!!err('gender')}
              options={[
                { value: 'female', label: t('booking.field.gender.female') },
                { value: 'male', label: t('booking.field.gender.male') },
                { value: 'other', label: t('booking.field.gender.other') },
              ]}
              data-testid={`${pre}-gender`}
            />
          </Field>
        )}

        {showDob && (
          <Field id={`${pre}-dob`} label={t('booking.field.dateOfBirth')} required={required('dateOfBirth') || !isTop} error={err('dateOfBirth')}>
            <Input id={`${pre}-dob`} type="date" value={member.dateOfBirth} max={page.startDate} autoComplete={index === 0 ? 'bday' : 'off'} aria-invalid={!!err('dateOfBirth') || undefined} aria-describedby={err('dateOfBirth') ? `${pre}-dob-error` : undefined} onChange={(e) => onChange({ dateOfBirth: e.target.value })} data-testid={`${pre}-dob`} />
          </Field>
        )}
        {showAge && (
          <Field id={`${pre}-age`} label={t('booking.field.ageYears')} hint={t('booking.field.ageHint')} required error={err('ageYears')}>
            <Input id={`${pre}-age`} type="number" inputMode="numeric" min={0} max={120} value={member.ageYears} aria-invalid={!!err('ageYears') || undefined} aria-describedby={err('ageYears') ? `${pre}-age-error` : undefined} onChange={(e) => onChange({ ageYears: e.target.value })} data-testid={`${pre}-age`} />
          </Field>
        )}

        {collects(page, 'pickupPoint') && page.pickupPoints.length > 0 && (
          <Field id={`${pre}-pickup`} label={t('booking.field.pickupPoint')} required={required('pickupPoint')} error={err('pickupPoint')} className="sm:col-span-2">
            <Choice
              id={`${pre}-pickup`}
              value={member.pickupPoint}
              onChange={(v) => onChange({ pickupPoint: v })}
              noneLabel={required('pickupPoint') ? undefined : t('booking.select.none')}
              invalid={!!err('pickupPoint')}
              options={page.pickupPoints.map((p) => ({ value: p.ref, label: p.localTime ? t('booking.pickup.at', { name: p.name, time: p.localTime }) : p.name }))}
              data-testid={`${pre}-pickup`}
            />
          </Field>
        )}

        {collects(page, 'roomType') && page.prices.roomSupplements.length > 0 && (
          <>
            <Field id={`${pre}-room`} label={t('booking.field.roomType')} required={required('roomType')} error={err('roomType')}>
              <Choice
                id={`${pre}-room`}
                value={member.roomType}
                onChange={(v) => onChange({ roomType: v, ...(v ? {} : { shareOk: false, shareGender: false }) })}
                noneLabel={required('roomType') ? undefined : t('booking.select.none')}
                invalid={!!err('roomType')}
                options={page.prices.roomSupplements.map((r) => {
                  const extra = supplements.get(r.key);
                  return { value: r.key, label: extra && extra > 0 ? `${r.label} (${t('booking.room.supplement', { price: money(extra, page) })})` : r.label };
                })}
                data-testid={`${pre}-room`}
              />
            </Field>
            {page.shareMatching && member.roomType && (
              <div className="space-y-ds-2 self-end pb-1">
                <label className="flex items-center gap-ds-2 text-sm">
                  <Checkbox checked={member.shareOk} onCheckedChange={(c) => onChange({ shareOk: c === true, ...(c === true ? {} : { shareGender: false }) })} data-testid={`${pre}-share`} />
                  {t('booking.field.shareOk')}
                </label>
                {member.shareOk && (
                  <label className="flex items-center gap-ds-2 text-sm">
                    <Checkbox checked={member.shareGender} onCheckedChange={(c) => onChange({ shareGender: c === true })} data-testid={`${pre}-share-gender`} />
                    {t('booking.field.shareGender')}
                  </label>
                )}
              </div>
            )}
          </>
        )}

        {collects(page, 'meal') && (
          <Field id={`${pre}-meal`} label={t('booking.field.meal')} required={required('meal')} error={err('mealPreference')}>
            <Input id={`${pre}-meal`} value={member.mealPreference} maxLength={60} onChange={(e) => onChange({ mealPreference: e.target.value })} data-testid={`${pre}-meal`} />
          </Field>
        )}

        {page.preferredSeat && (
          <Field
            id={`${pre}-seat`}
            label={`${t('booking.field.preferredSeat')}${page.prices.seatSurcharge ? ` (${t('booking.room.supplement', { price: money(page.prices.seatSurcharge, page) })})` : ''}`}
            hint={t('booking.field.preferredSeatHint')}
            error={err('preferredSeat')}
          >
            <Input id={`${pre}-seat`} value={member.preferredSeat} maxLength={20} aria-invalid={!!err('preferredSeat') || undefined} aria-describedby={err('preferredSeat') ? `${pre}-seat-error` : undefined} onChange={(e) => onChange({ preferredSeat: e.target.value })} data-testid={`${pre}-seat`} />
          </Field>
        )}

        {extras.map((f) => {
          const id = `${pre}-x-${f.key}`;
          const label = fieldLabel(f);
          const value = member.extra[f.key];
          const setValue = (v: string | boolean) => onChange({ extra: { ...member.extra, [f.key]: v } });
          const error = err(`extra.${f.key}`);
          if (f.type === 'boolean') {
            return (
              <div key={f.key} className="flex items-center gap-ds-2 self-end pb-1 text-sm">
                <Checkbox id={id} checked={value === true} onCheckedChange={(c) => setValue(c === true)} />
                <label htmlFor={id}>{label}{f.required && <span aria-hidden="true" className="ms-1 text-ds-danger">*</span>}</label>
                {error && <span role="alert" className="text-xs text-ds-danger">{error}</span>}
              </div>
            );
          }
          return (
            <Field key={f.key} id={id} label={label} required={f.required} error={error}>
              {f.type === 'select' && f.options ? (
                <Choice id={id} value={typeof value === 'string' ? value : ''} onChange={setValue} noneLabel={f.required ? undefined : t('booking.select.none')} invalid={!!error} options={f.options.map((o) => ({ value: o, label: o }))} />
              ) : (
                <Input id={id} type={f.type === 'date' || /expiry/i.test(f.key) ? 'date' : 'text'} value={typeof value === 'string' ? value : ''} maxLength={300} aria-invalid={!!error || undefined} onChange={(e) => setValue(e.target.value)} />
              )}
            </Field>
          );
        })}
      </div>
    </fieldset>
  );
}
