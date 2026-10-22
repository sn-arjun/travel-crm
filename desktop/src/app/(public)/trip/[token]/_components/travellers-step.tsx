'use client';

import * as React from 'react';

import { Alert, AlertDescription, Button, Checkbox, Input, Spinner } from '@/components/ui';
import {
  draftsFrom, toTravellerRequest, validateTravellers, type TravellerDraft, type TravellerProblem, type TripPage,
} from '@/lib/extras';
import { useI18n } from '@/lib/i18n';
import { Choice, Field, brandStyle, useFieldLabel } from '@/app/(public)/book/[token]/_components/booking-ui';
import { tripRequest } from './use-trip';

interface TravellersStepProps {
  page: TripPage;
  token: string;
  onSaved: (page: TripPage) => void;
}

/** Whether a traveller already has the details this step asks for (names and every required field). */
export function travellerComplete(page: TripPage, p: TripPage['passengers'][number]): boolean {
  return Boolean(p.firstName.trim()) && page.fields.filter((f) => f.required && f.type !== 'boolean').every((f) => typeof p.values[f.key] === 'string' && String(p.values[f.key]).trim() !== '');
}

/** Names as on the travel document, date of birth, document, meal and the agency's own fields for every traveller in this link. */
export function TravellersStep({ page, token, onSaved }: TravellersStepProps) {
  const { t } = useI18n();
  const fieldLabel = useFieldLabel();
  const [drafts, setDrafts] = React.useState<TravellerDraft[]>(() => draftsFrom(page));
  const [problems, setProblems] = React.useState<TravellerProblem[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const update = (ref: string, patch: Partial<TravellerDraft>) => {
    setDrafts((list) => list.map((d) => (d.ref === ref ? { ...d, ...patch } : d)));
    setProblems((list) => list.filter((x) => !(x.ref === ref && x.field in patch)));
  };
  const setValue = (ref: string, key: string, value: string | boolean) => {
    setDrafts((list) => list.map((d) => (d.ref === ref ? { ...d, values: { ...d.values, [key]: value } } : d)));
    setProblems((list) => list.filter((x) => !(x.ref === ref && x.field === key)));
  };
  const err = (ref: string, field: string): string | undefined => {
    if (!problems.some((x) => x.ref === ref && x.field === field)) return undefined;
    const d = drafts.find((x) => x.ref === ref);
    const empty = field === 'firstName' ? !d?.firstName.trim() : !String(d?.values[field] ?? '').trim();
    return t(empty ? 'trip.error.required' : 'trip.error.invalid');
  };

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setMessage(null);
    const found = validateTravellers(page, drafts);
    setProblems(found);
    if (found.length) {
      setMessage(t('trip.error.fixBelow'));
      const first = found[0];
      if (first) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-ref="${first.ref}"] [aria-invalid="true"]`)?.focus());
      return;
    }
    setBusy(true);
    const result = await tripRequest<TripPage>(token, 'PUT', '/passengers', toTravellerRequest(page, drafts));
    setBusy(false);
    if (result.ok) {
      setDrafts(draftsFrom(result.data));
      return onSaved(result.data);
    }
    if (result.refusal.errors.length) setProblems(result.refusal.errors);
    setMessage(result.refusal.status === 0 ? t('trip.error.network') : result.refusal.message || t('trip.error.generic'));
  }

  return (
    <form onSubmit={save} noValidate className="space-y-ds-4" data-testid="travellers-step">
      <p className="text-sm text-ds-foreground-muted">{t('trip.travellers.intro')}</p>
      {drafts.length === 0 && <p className="rounded-xl border border-ds-border bg-ds-surface p-ds-4 text-sm" data-testid="travellers-none">{t('trip.travellers.none')}</p>}
      {drafts.map((d, i) => {
        const known = page.passengers.find((p) => p.ref === d.ref)!;
        const pre = `t${i}`;
        return (
          <fieldset key={d.ref} data-ref={d.ref} className="space-y-ds-3 rounded-xl border border-ds-border bg-ds-surface p-ds-4" data-testid={`traveller-${i}`}>
            <legend className="px-1 text-sm font-semibold">{t('trip.travellers.person', { number: i + 1 })}</legend>
            <div className="grid gap-ds-3 sm:grid-cols-2">
              <Field id={`${pre}-first`} label={t('trip.field.firstName')} hint={t('trip.field.nameHint')} required error={err(d.ref, 'firstName')}>
                <Input id={`${pre}-first`} value={d.firstName} maxLength={80} autoComplete="off" aria-invalid={!!err(d.ref, 'firstName') || undefined} onChange={(e) => update(d.ref, { firstName: e.target.value })} data-testid={`${pre}-first`} />
              </Field>
              <Field id={`${pre}-last`} label={t('trip.field.lastName')} error={err(d.ref, 'lastName')}>
                <Input id={`${pre}-last`} value={d.lastName} maxLength={80} autoComplete="off" onChange={(e) => update(d.ref, { lastName: e.target.value })} data-testid={`${pre}-last`} />
              </Field>

              {page.collects.gender && (
                <Field id={`${pre}-gender`} label={t('trip.field.gender')} error={err(d.ref, 'gender')}>
                  <Choice
                    id={`${pre}-gender`}
                    value={d.gender}
                    onChange={(v) => update(d.ref, { gender: v })}
                    noneLabel={t('booking.select.none')}
                    options={[
                      { value: 'female', label: t('booking.field.gender.female') },
                      { value: 'male', label: t('booking.field.gender.male') },
                      { value: 'other', label: t('booking.field.gender.other') },
                    ]}
                    data-testid={`${pre}-gender`}
                  />
                </Field>
              )}
              {page.collects.dateOfBirth && (
                <Field id={`${pre}-dob`} label={t('trip.field.dateOfBirth')} error={err(d.ref, 'dateOfBirth')}>
                  <Input id={`${pre}-dob`} type="date" value={d.dateOfBirth} max={page.startDate} readOnly={Boolean(known.dateOfBirth)} aria-invalid={!!err(d.ref, 'dateOfBirth') || undefined} onChange={(e) => update(d.ref, { dateOfBirth: e.target.value })} data-testid={`${pre}-dob`} />
                </Field>
              )}
              {page.collects.meal && (
                <Field id={`${pre}-meal`} label={t('trip.field.meal')} error={err(d.ref, 'mealPreference')}>
                  <Input id={`${pre}-meal`} value={d.mealPreference} maxLength={60} onChange={(e) => update(d.ref, { mealPreference: e.target.value })} data-testid={`${pre}-meal`} />
                </Field>
              )}

              {page.fields.map((f) => {
                const id = `${pre}-x-${f.key}`;
                const label = fieldLabel(f);
                const value = d.values[f.key];
                const error = err(d.ref, f.key);
                if (f.type === 'boolean') {
                  return (
                    <div key={f.key} className="flex items-center gap-ds-2 self-end pb-1 text-sm">
                      <Checkbox id={id} checked={value === true} onCheckedChange={(c) => setValue(d.ref, f.key, c === true)} />
                      <label htmlFor={id}>{label}</label>
                    </div>
                  );
                }
                return (
                  <Field key={f.key} id={id} label={label} required={f.required} error={error}>
                    {f.type === 'select' && f.options ? (
                      <Choice id={id} value={typeof value === 'string' ? value : ''} onChange={(v) => setValue(d.ref, f.key, v)} noneLabel={f.required ? undefined : t('booking.select.none')} invalid={!!error} options={f.options.map((o) => ({ value: o, label: o }))} data-testid={id} />
                    ) : (
                      <Input
                        id={id}
                        type={f.type === 'date' ? 'date' : 'text'}
                        value={typeof value === 'string' ? value : ''}
                        maxLength={300}
                        autoComplete="off"
                        dir={f.key === 'documentNumber' ? 'ltr' : undefined}
                        aria-invalid={!!error || undefined}
                        onChange={(e) => setValue(d.ref, f.key, e.target.value)}
                        data-testid={id}
                      />
                    )}
                  </Field>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      {message && (
        <Alert variant="destructive" role="alert" data-testid="travellers-error">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      {drafts.length > 0 && (
        <Button type="submit" disabled={busy} style={brandStyle(page.agency.primaryColor)} data-testid="travellers-save">
          {busy && <Spinner className="size-4" />}
          {t('trip.travellers.save')}
        </Button>
      )}
    </form>
  );
}
