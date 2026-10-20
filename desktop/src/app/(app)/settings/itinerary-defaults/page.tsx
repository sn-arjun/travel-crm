'use client';

import { getLocaleContext } from '@/lib/locale';
import { currencyOptions, CURRENCY_NAMES } from '@/lib/locale-options';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { EntityForm, FormRow } from '@/components/domain';
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SectionCard,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { toast } from 'sonner';
import { settingsApi } from '@/lib/api/settings';
import { useApiQuery } from '@/hooks/use-api';
import { PageContainer } from '@/components/layout/page-container';

const percent = (message: string) =>
  z.string().refine((v) => v !== '' && Number(v) >= 0 && Number(v) <= 100, message);

const schema = z.object({
  defaultCurrency: z.string().min(1),
  validityDays: z.string().refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 365, 'Enter 1–365 days'),
  childPricePercent: percent('Enter a percentage between 0 and 100'),
  groupDiscountThreshold: z.string().refine((v) => /^\d+$/.test(v) && Number(v) >= 1, 'Enter a whole number of at least 1'),
  groupDiscountPercent: percent('Enter a percentage between 0 and 100'),
  defaultInclusions: z.string().optional(),
  defaultExclusions: z.string().optional(),
  defaultTerms: z.string().optional(),
});
type ItineraryDefaultsForm = z.infer<typeof schema>;

const toLines = (text: string | undefined) =>
  (text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

export default function ItineraryDefaultsPage() {
  const router = useRouter();
  const { data: response, loading } = useApiQuery(() => settingsApi.itineraryDefaults.get(), []);

  const d = React.useMemo(() => {
    if (!response || !('data' in response)) return null;
    return response.data ?? null;
  }, [response]);

  if (loading) {
    return (
      <PageContainer>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </PageContainer>
    );
  }

  return (
    <EntityForm<ItineraryDefaultsForm>
      title="Itinerary Defaults"
      description="Default values applied to newly created itineraries."
      schema={schema}
      defaultValues={{
        defaultCurrency: d?.defaultCurrency ?? getLocaleContext().currency,
        validityDays: String(d?.validityDays ?? 7),
        childPricePercent: String(d?.childPricePercent ?? 50),
        groupDiscountThreshold: String(d?.groupDiscountThreshold ?? 10),
        groupDiscountPercent: String(d?.groupDiscountPercent ?? 5),
        defaultInclusions: (d?.defaultInclusions ?? []).join('\n'),
        defaultExclusions: (d?.defaultExclusions ?? []).join('\n'),
        defaultTerms: d?.defaultTerms ?? '',
      }}
      onCancel={() => router.push('/settings')}
      onSubmit={async (v) => {
        try {
          await settingsApi.itineraryDefaults.update({
            defaultCurrency: v.defaultCurrency,
            validityDays: Number(v.validityDays),
            childPricePercent: Number(v.childPricePercent),
            groupDiscountThreshold: Number(v.groupDiscountThreshold),
            groupDiscountPercent: Number(v.groupDiscountPercent),
            defaultInclusions: toLines(v.defaultInclusions),
            defaultExclusions: toLines(v.defaultExclusions),
            defaultTerms: v.defaultTerms ?? '',
          });
        } catch {
          toast.error('Failed to save itinerary defaults');
          return;
        }
        toast.success('Itinerary defaults saved successfully');
        router.push('/settings');
      }}
      renderSections={(form) => (
        <>
          <SectionCard title="Pricing & Validity" required>
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="defaultCurrency" label="Default Currency" required>
                <Select value={form.watch('defaultCurrency')} onValueChange={(v) => form.setValue('defaultCurrency', v, { shouldDirty: true })}>
                  <SelectTrigger id="defaultCurrency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {currencyOptions(form.watch('defaultCurrency')).map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.value} - {CURRENCY_NAMES[o.value] ?? o.value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow name="validityDays" label="Quote Validity (days)" required>
                <Input {...form.register('validityDays')} id="validityDays" type="number" min="1" max="365" placeholder="7" />
              </FormRow>
              <FormRow name="childPricePercent" label="Child Price (% of adult)" required>
                <Input {...form.register('childPricePercent')} id="childPricePercent" type="number" min="0" max="100" placeholder="50" />
              </FormRow>
              <FormRow name="groupDiscountThreshold" label="Group Discount From (travellers)" required>
                <Input {...form.register('groupDiscountThreshold')} id="groupDiscountThreshold" type="number" min="1" placeholder="10" />
              </FormRow>
              <FormRow name="groupDiscountPercent" label="Group Discount (%)" required>
                <Input {...form.register('groupDiscountPercent')} id="groupDiscountPercent" type="number" min="0" max="100" placeholder="5" />
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="Default Content" description="Pre-filled on every new itinerary">
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="defaultInclusions" label="Default Inclusions" hint="One item per line.">
                <Textarea {...form.register('defaultInclusions')} id="defaultInclusions" rows={5} placeholder="Airport transfers&#10;Daily breakfast" />
              </FormRow>
              <FormRow name="defaultExclusions" label="Default Exclusions" hint="One item per line.">
                <Textarea {...form.register('defaultExclusions')} id="defaultExclusions" rows={5} placeholder="Airfare&#10;Travel insurance" />
              </FormRow>
              <FormRow name="defaultTerms" label="Default Terms & Conditions" wide>
                <Textarea {...form.register('defaultTerms')} id="defaultTerms" rows={4} placeholder="Terms & conditions shown on every itinerary by default..." />
              </FormRow>
            </div>
          </SectionCard>
        </>
      )}
    />
  );
}
