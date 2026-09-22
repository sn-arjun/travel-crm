'use client';

import * as React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { FormRow } from '@/components/domain/entity-form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export const flyerColorSchemes = [
  { id: 'ocean', name: 'Ocean Blue', bg: 'bg-ds-info', text: 'text-ds-info-foreground' },
  { id: 'sunset', name: 'Sunset', bg: 'bg-ds-warning', text: 'text-ds-warning-foreground' },
  { id: 'forest', name: 'Forest Green', bg: 'bg-ds-success', text: 'text-ds-success-foreground' },
  { id: 'royal', name: 'Royal Purple', bg: 'bg-ds-primary', text: 'text-ds-primary-foreground' },
  { id: 'coral', name: 'Coral Pink', bg: 'bg-ds-danger', text: 'text-ds-danger-foreground' },
] as const;

export interface FlyerContentForm {
  title: string;
  templateId: string;
  headline: string;
  subheadline?: string;
  offerText?: string;
  contactInfo?: string;
  colorScheme: string;
  fontSize: 'small' | 'medium' | 'large';
}

export function FlyerPreview({ data }: { data: FlyerContentForm }) {
  const scheme = flyerColorSchemes.find((s) => s.id === data.colorScheme) ?? flyerColorSchemes[0];
  const sizeClass = data.fontSize === 'small' ? 'text-lg' : data.fontSize === 'large' ? 'text-3xl' : 'text-2xl';

  return (
    <div className="flex min-h-96 items-center justify-center rounded-ds-lg bg-ds-surface-sunken p-ds-4">
      <div className={cn('w-full max-w-xs rounded-ds-lg p-ds-6 text-center shadow-ds-3', scheme.bg, scheme.text)}>
        <h2 className={cn('mb-ds-2 font-bold', sizeClass)}>{data.headline || 'Your headline'}</h2>
        {data.subheadline && <p className="mb-ds-2 text-sm opacity-90">{data.subheadline}</p>}
        <div className="my-ds-3 border-t border-current opacity-50" />
        {data.offerText && <p className="mb-ds-3 text-base font-semibold">{data.offerText}</p>}
        {data.contactInfo && <p className="text-xs opacity-75">{data.contactInfo}</p>}
      </div>
    </div>
  );
}

export function FlyerContentFields({ form }: { form: UseFormReturn<FlyerContentForm> }) {
  const data = form.watch();

  return (
    <div className="grid gap-ds-6 lg:grid-cols-2">
      <div className="flex flex-col gap-ds-4">
        <FormRow name="title" label="Flyer title" required>
          <Input {...form.register('title')} id="title" placeholder="Internal name for this flyer" />
        </FormRow>
        <FormRow name="headline" label="Headline" required>
          <Input {...form.register('headline')} id="headline" placeholder="Main headline" />
        </FormRow>
        <FormRow name="subheadline" label="Subheadline">
          <Input {...form.register('subheadline')} id="subheadline" placeholder="Secondary text" />
        </FormRow>
        <FormRow name="offerText" label="Offer text">
          <Input {...form.register('offerText')} id="offerText" placeholder="Special offer" />
        </FormRow>
        <FormRow name="contactInfo" label="Contact info">
          <Input {...form.register('contactInfo')} id="contactInfo" placeholder="Phone or email" />
        </FormRow>
        <FormRow name="colorScheme" label="Color scheme">
          <div className="flex flex-wrap gap-ds-2">
            {flyerColorSchemes.map((scheme) => (
              <button
                key={scheme.id}
                type="button"
                onClick={() => form.setValue('colorScheme', scheme.id, { shouldDirty: true })}
                className={cn(
                  'size-8 rounded-ds-md border-2 transition-colors',
                  scheme.bg,
                  data.colorScheme === scheme.id ? 'border-ds-foreground' : 'border-transparent',
                )}
                title={scheme.name}
                aria-label={scheme.name}
                aria-pressed={data.colorScheme === scheme.id}
              />
            ))}
          </div>
        </FormRow>
        <FormRow name="fontSize" label="Font size">
          <Select
            value={data.fontSize}
            onValueChange={(v) => form.setValue('fontSize', v as FlyerContentForm['fontSize'], { shouldDirty: true })}
          >
            <SelectTrigger id="fontSize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="small">Small</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="large">Large</SelectItem>
            </SelectContent>
          </Select>
        </FormRow>
      </div>

      <FlyerPreview data={data} />
    </div>
  );
}
