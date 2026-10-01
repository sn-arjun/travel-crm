'use client';

import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { toast } from 'sonner';

import { EntityForm, FormRow } from '@/components/domain/entity-form';
import { RelationCombobox } from '@/components/domain/relation-combobox';
import { SectionCard } from '@/components/ui/section-card';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  visaService,
  travellersApi,
  normalizeTraveller,
  toDateOnly,
  VISA_TYPE_OPTIONS,
  type Traveller,
} from '@/lib/api/visa';

const DESTINATION_COUNTRIES = [
  'Australia', 'Bahrain', 'Canada', 'China', 'Dubai (UAE)', 'Egypt', 'France', 'Germany',
  'Greece', 'Indonesia', 'Italy', 'Japan', 'Jordan', 'Kenya', 'Malaysia', 'Maldives',
  'Morocco', 'Nepal', 'Netherlands', 'New Zealand', 'Oman', 'Portugal', 'Qatar',
  'Saudi Arabia', 'Schengen', 'Singapore', 'South Africa', 'Spain', 'Sri Lanka',
  'Switzerland', 'Thailand', 'Turkey', 'United Kingdom', 'United States', 'Vietnam',
];

const schema = z.object({
  travellerId: z.string().min(1, 'Traveller is required'),
  destinationCountry: z.string().min(1, 'Destination country is required'),
  visaType: z.string().min(1, 'Visa type is required'),
  applicationDate: z.date().optional(),
  expiryDate: z.date().optional(),
  notes: z.string().optional(),
});
type VisaForm = z.infer<typeof schema>;

async function fetchTravellers(query: string, page: number) {
  const r = await travellersApi.list({ search: query || undefined, page, limit: 20 });
  const data = r.data as unknown;
  const raw = Array.isArray(data) ? data : ((data as { data?: unknown[] })?.data ?? []);
  const items = raw.map(normalizeTraveller);
  const total = (data as { pagination?: { total?: number } })?.pagination?.total ?? items.length;
  return { items, total };
}

export default function NewVisaApplicationPage() {
  const router = useRouter();

  return (
    <EntityForm<VisaForm>
      title="New Visa Application"
      description="Create a new visa record for a traveller."
      schema={schema}
      defaultValues={{
        travellerId: '',
        destinationCountry: '',
        visaType: '',
        applicationDate: new Date(),
        notes: '',
      }}
      submitLabel="Create Application"
      prefillFromParams={{ travellerId: 'travellerId' }}
      onCancel={() => router.back()}
      onSubmit={async (v) => {
        await visaService.create({
          travellerId: v.travellerId,
          destinationCountry: v.destinationCountry,
          visaType: v.visaType,
          applicationDate: v.applicationDate ? toDateOnly(v.applicationDate) : undefined,
          expiryDate: v.expiryDate ? toDateOnly(v.expiryDate) : undefined,
          notes: v.notes || undefined,
        });
        toast.success('Visa application created successfully!');
        router.push('/visa');
      }}
      renderSections={(form) => (
        <>
          <SectionCard title="Traveller" required>
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="travellerId" label="Traveller" required wide>
                <RelationCombobox<Traveller>
                  value={form.watch('travellerId') || null}
                  onChange={(id) => form.setValue('travellerId', id ?? '', { shouldDirty: true, shouldValidate: true })}
                  fetcher={fetchTravellers}
                  getOptionId={(t) => t.id}
                  getOptionLabel={(t) => `${t.firstName} ${t.lastName}`}
                  getOptionDescription={(t) => t.passportNumber}
                  resolveSelected={async (id) => normalizeTraveller((await travellersApi.getById(id)).data)}
                  placeholder="Select a traveller…"
                  searchPlaceholder="Search by name or passport…"
                  required
                  error={form.formState.errors.travellerId?.message}
                />
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="Visa Details" required>
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="destinationCountry" label="Destination Country" required>
                <RelationCombobox<{ id: string; name: string }>
                  value={form.watch('destinationCountry') || null}
                  onChange={(id) =>
                    form.setValue('destinationCountry', id ?? '', { shouldDirty: true, shouldValidate: true })
                  }
                  fetcher={async (query) => {
                    const items = DESTINATION_COUNTRIES.filter((c) =>
                      c.toLowerCase().includes(query.toLowerCase()),
                    ).map((c) => ({ id: c, name: c }));
                    return { items, total: items.length };
                  }}
                  getOptionId={(c) => c.id}
                  getOptionLabel={(c) => c.name}
                  placeholder="Select destination country…"
                  searchPlaceholder="Search countries…"
                  required
                  error={form.formState.errors.destinationCountry?.message}
                />
              </FormRow>

              <FormRow name="visaType" label="Visa Type" required>
                <Select value={form.watch('visaType')} onValueChange={(val) => form.setValue('visaType', val, { shouldDirty: true, shouldValidate: true })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select visa type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {VISA_TYPE_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormRow>

              <FormRow name="applicationDate" label="Application Date">
                <DatePicker
                  value={form.watch('applicationDate')}
                  onChange={(d) => form.setValue('applicationDate', d, { shouldDirty: true })}
                />
              </FormRow>

              <FormRow name="expiryDate" label="Expiry Date">
                <DatePicker
                  value={form.watch('expiryDate')}
                  onChange={(d) => form.setValue('expiryDate', d, { shouldDirty: true })}
                />
              </FormRow>

              <FormRow name="notes" label="Notes" wide>
                <Textarea
                  value={form.watch('notes')}
                  onChange={(e) => form.setValue('notes', e.target.value, { shouldDirty: true })}
                  placeholder="Any additional notes about this visa application…"
                  rows={3}
                />
              </FormRow>
            </div>
          </SectionCard>
        </>
      )}
    />
  );
}
