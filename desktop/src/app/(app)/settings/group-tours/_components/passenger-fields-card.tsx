'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button, Checkbox, Input, Label, SectionCard, Switch } from '@/components/ui';
import type { CollectOn, PassengerFieldDef, PassengerFieldType } from '@/lib/api/departures';
import { customFieldKey } from '@/lib/departures';
import { useT } from '@/lib/i18n';
import { SimpleSelect } from '../../../departures/_components/simple-select';

/** The standard passenger fields, with the label and when each is asked when it is added back. */
const STANDARD_FIELDS: ReadonlyArray<{ key: string; labelKey: string; collectOn: CollectOn; required: boolean }> = [
  { key: 'name', labelKey: 'groupTours.fields.name', collectOn: 'booking', required: true },
  { key: 'gender', labelKey: 'groupTours.fields.gender', collectOn: 'booking', required: false },
  { key: 'dateOfBirth', labelKey: 'groupTours.fields.dateOfBirth', collectOn: 'booking', required: false },
  { key: 'pickupPoint', labelKey: 'groupTours.fields.pickupPoint', collectOn: 'booking', required: true },
  { key: 'roomType', labelKey: 'groupTours.fields.roomType', collectOn: 'booking', required: false },
  { key: 'meal', labelKey: 'groupTours.fields.meal', collectOn: 'booking', required: false },
  { key: 'nationality', labelKey: 'groupTours.fields.nationality', collectOn: 'self_service', required: false },
  { key: 'documentType', labelKey: 'groupTours.fields.documentType', collectOn: 'self_service', required: false },
  { key: 'documentNumber', labelKey: 'groupTours.fields.documentNumber', collectOn: 'self_service', required: false },
  { key: 'documentExpiry', labelKey: 'groupTours.fields.documentExpiry', collectOn: 'self_service', required: false },
  { key: 'documentExpiry2', labelKey: 'groupTours.fields.documentExpiry2', collectOn: 'self_service', required: false },
];

interface PassengerFieldsCardProps {
  value: PassengerFieldDef[];
  onChange: (fields: PassengerFieldDef[]) => void;
  disabled?: boolean;
}

/** The passenger fields the agency asks for: required or not, and who fills them in; plus a builder for the agency's own fields. */
export function PassengerFieldsCard({ value, onChange, disabled }: PassengerFieldsCardProps) {
  const t = useT();
  const [label, setLabel] = React.useState('');
  const [type, setType] = React.useState<PassengerFieldType>('text');
  const [options, setOptions] = React.useState('');
  const [required, setRequired] = React.useState(false);
  const [collectOn, setCollectOn] = React.useState<CollectOn>('booking');

  const patch = (key: string, change: Partial<PassengerFieldDef>) => onChange(value.map((f) => (f.key === key ? { ...f, ...change } : f)));
  const missing = STANDARD_FIELDS.filter((s) => !value.some((f) => f.key === s.key));
  const collectOptions = [
    { value: 'booking', label: t('groupTours.collectOn.booking') },
    { value: 'self_service', label: t('groupTours.collectOn.selfService') },
    { value: 'staff_only', label: t('groupTours.collectOn.staffOnly') },
  ];
  const optionList = options.split(',').map((o) => o.trim()).filter(Boolean);
  const canAdd = label.trim().length > 0 && (type !== 'select' || optionList.length > 0);

  function addCustom() {
    if (!canAdd) return;
    const key = customFieldKey(label, value.map((f) => f.key));
    onChange([
      ...value,
      { key, label: label.trim(), required, collectOn, type, custom: true, ...(type === 'select' ? { options: optionList } : {}) },
    ]);
    setLabel('');
    setOptions('');
    setRequired(false);
    setType('text');
    setCollectOn('booking');
  }

  return (
    <SectionCard title={t('groupTours.passengerFields.title')} description={t('groupTours.passengerFields.description')}>
      <div className="space-y-ds-3" data-testid="passenger-fields-card">
        <ul className="divide-y divide-ds-border">
          {value.map((f) => (
            <li key={f.key} className="grid items-center gap-ds-3 py-ds-2 sm:grid-cols-[1fr_9rem_14rem_auto]" data-testid="passenger-field-row">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{f.label}</p>
                {f.custom && <p className="text-xs text-ds-foreground-muted">{t('groupTours.passengerFields.custom', { type: t(`groupTours.fieldType.${f.type ?? 'text'}`) })}</p>}
              </div>
              <label className="flex items-center gap-ds-2 text-sm">
                <Switch checked={f.required || f.key === 'name'} disabled={disabled || f.key === 'name'} onCheckedChange={(c) => patch(f.key, { required: c })} aria-label={t('groupTours.passengerFields.requiredFor', { label: f.label })} />
                {t('groupTours.passengerFields.required')}
              </label>
              <SimpleSelect
                value={f.collectOn}
                disabled={disabled}
                aria-label={t('groupTours.passengerFields.collectFor', { label: f.label })}
                onChange={(v) => patch(f.key, { collectOn: (v as CollectOn) ?? 'booking' })}
                options={collectOptions}
              />
              {f.key !== 'name' ? (
                <Button variant="ghost" size="icon-sm" aria-label={t('groupTours.passengerFields.remove', { label: f.label })} disabled={disabled} onClick={() => onChange(value.filter((x) => x.key !== f.key))}>
                  <Trash2 aria-hidden="true" />
                </Button>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ul>

        {missing.length > 0 && (
          <div className="flex flex-wrap items-center gap-ds-2">
            <span className="text-xs text-ds-foreground-muted">{t('groupTours.passengerFields.addStandard')}</span>
            {missing.map((s) => (
              <Button
                key={s.key}
                type="button"
                variant="outline"
                size="xs"
                disabled={disabled}
                onClick={() => onChange([...value, { key: s.key, label: t(s.labelKey), required: s.required, collectOn: s.collectOn }])}
              >
                <Plus aria-hidden="true" /> {t(s.labelKey)}
              </Button>
            ))}
          </div>
        )}

        <div className="rounded-ds-md border border-ds-border bg-ds-surface-sunken p-ds-3">
          <p className="mb-ds-2 text-sm font-medium">{t('groupTours.passengerFields.builderTitle')}</p>
          <div className="grid gap-ds-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-ds-1">
              <Label htmlFor="custom-field-label">{t('groupTours.passengerFields.label')}</Label>
              <Input id="custom-field-label" value={label} disabled={disabled} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div className="space-y-ds-1">
              <Label htmlFor="custom-field-type">{t('groupTours.passengerFields.type')}</Label>
              <SimpleSelect
                id="custom-field-type"
                value={type}
                disabled={disabled}
                onChange={(v) => setType((v as PassengerFieldType) ?? 'text')}
                options={[
                  { value: 'text', label: t('groupTours.fieldType.text') },
                  { value: 'date', label: t('groupTours.fieldType.date') },
                  { value: 'select', label: t('groupTours.fieldType.select') },
                  { value: 'boolean', label: t('groupTours.fieldType.boolean') },
                ]}
              />
            </div>
            <div className="space-y-ds-1">
              <Label htmlFor="custom-field-collect">{t('groupTours.passengerFields.collect')}</Label>
              <SimpleSelect id="custom-field-collect" value={collectOn} disabled={disabled} onChange={(v) => setCollectOn((v as CollectOn) ?? 'booking')} options={collectOptions} />
            </div>
            <label className="flex items-end gap-ds-2 pb-ds-2 text-sm">
              <Checkbox checked={required} disabled={disabled} onCheckedChange={(c) => setRequired(c === true)} />
              {t('groupTours.passengerFields.required')}
            </label>
            {type === 'select' && (
              <div className="space-y-ds-1 sm:col-span-2 lg:col-span-4">
                <Label htmlFor="custom-field-options">{t('groupTours.passengerFields.options')}</Label>
                <Input id="custom-field-options" value={options} disabled={disabled} placeholder={t('groupTours.passengerFields.optionsPlaceholder')} onChange={(e) => setOptions(e.target.value)} />
              </div>
            )}
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-ds-3" disabled={disabled || !canAdd} onClick={addCustom} data-testid="add-custom-field">
            <Plus aria-hidden="true" /> {t('groupTours.passengerFields.addCustom')}
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
