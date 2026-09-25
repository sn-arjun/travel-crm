'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { EntityForm, FormRow } from '@/components/domain';
import { Input, SectionCard, Skeleton, Switch, Textarea } from '@/components/ui';
import { toast } from 'sonner';
import { settingsApi } from '@/lib/api/settings';
import { useApiQuery } from '@/hooks/use-api';

const schema = z.object({
  defaultValidityDays: z.string(),
  defaultTerms: z.string().optional(),
  defaultNotes: z.string().optional(),
  defaultInclusions: z.string().optional(),
  defaultExclusions: z.string().optional(),
  showPricePerPerson: z.boolean(),
});
type ItineraryDefaultsForm = z.infer<typeof schema>;

const defaultValues: ItineraryDefaultsForm = {
  defaultValidityDays: '7',
  defaultTerms: '',
  defaultNotes: '',
  defaultInclusions: '',
  defaultExclusions: '',
  showPricePerPerson: true,
};

export default function ItineraryDefaultsPage() {
  const router = useRouter();
  const { data: response, loading } = useApiQuery(() => settingsApi.itineraryDefaults.get(), []);

  const d = React.useMemo(() => {
    if (!response || !('data' in response)) return null;
    return response.data ?? null;
  }, [response]);

  if (loading) {
    return (
      <div className="space-y-ds-4 p-ds-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <EntityForm<ItineraryDefaultsForm>
      title="Itinerary Defaults"
      description="Default values applied to newly created itineraries."
      schema={schema}
      defaultValues={{
        defaultValidityDays: String(d?.defaultValidityDays ?? defaultValues.defaultValidityDays),
        defaultTerms: d?.defaultTerms ?? '',
        defaultNotes: d?.defaultNotes ?? '',
        defaultInclusions: d?.defaultInclusions ?? '',
        defaultExclusions: d?.defaultExclusions ?? '',
        showPricePerPerson: d?.showPricePerPerson ?? true,
      }}
      onCancel={() => router.push('/settings')}
      onSubmit={async (v) => {
        const result = await settingsApi.itineraryDefaults.update({
          ...v,
          defaultValidityDays: parseInt(v.defaultValidityDays, 10),
        });
        if (result && 'data' in result) {
          toast.success('Itinerary defaults saved successfully');
          router.push('/settings');
        } else {
          toast.error('Failed to save itinerary defaults');
        }
      }}
      renderSections={(form) => (
        <SectionCard title="Itinerary Defaults" required>
          <div className="grid gap-ds-4 sm:grid-cols-2">
            <FormRow name="defaultValidityDays" label="Default Validity (days)" required>
              <Input {...form.register('defaultValidityDays')} id="defaultValidityDays" type="number" min="1" placeholder="7" />
            </FormRow>
            <FormRow name="showPricePerPerson" label="Show Price Per Person" wide>
              <div className="flex items-center gap-ds-3">
                <Switch
                  checked={form.watch('showPricePerPerson')}
                  onCheckedChange={(v) => form.setValue('showPricePerPerson', v, { shouldDirty: true })}
                />
                <span className="text-sm text-ds-foreground-muted">
                  {form.watch('showPricePerPerson') ? 'Per-person pricing shown by default' : 'Total pricing shown by default'}
                </span>
              </div>
            </FormRow>
            <FormRow name="defaultInclusions" label="Default Inclusions" wide>
              <Textarea {...form.register('defaultInclusions')} id="defaultInclusions" rows={3} placeholder="Standard inclusions for new itineraries..." />
            </FormRow>
            <FormRow name="defaultExclusions" label="Default Exclusions" wide>
              <Textarea {...form.register('defaultExclusions')} id="defaultExclusions" rows={3} placeholder="Standard exclusions for new itineraries..." />
            </FormRow>
            <FormRow name="defaultNotes" label="Default Notes" wide>
              <Textarea {...form.register('defaultNotes')} id="defaultNotes" rows={3} placeholder="Notes shown on every itinerary by default..." />
            </FormRow>
            <FormRow name="defaultTerms" label="Default Terms & Conditions" wide>
              <Textarea {...form.register('defaultTerms')} id="defaultTerms" rows={4} placeholder="Terms & conditions shown on every itinerary by default..." />
            </FormRow>
          </div>
        </SectionCard>
      )}
    />
  );
}
