'use client';

import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { toast } from 'sonner';

import { EntityForm, FormRow } from '@/components/domain/entity-form';
import { RelationCombobox } from '@/components/domain/relation-combobox';
import { Input } from '@/components/ui/input';
import { SectionCard } from '@/components/ui/section-card';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { visaApi, travellersApi, type CreateVisaRequest, type Traveller } from '@/lib/api/visa';

const DESTINATION_COUNTRIES = [
  'Australia', 'Bahrain', 'Canada', 'China', 'Dubai (UAE)', 'Egypt', 'France', 'Germany',
  'Greece', 'Indonesia', 'Italy', 'Japan', 'Jordan', 'Kenya', 'Malaysia', 'Maldives',
  'Morocco', 'Nepal', 'Netherlands', 'New Zealand', 'Oman', 'Portugal', 'Qatar',
  'Saudi Arabia', 'Schengen', 'Singapore', 'South Africa', 'Spain', 'Sri Lanka',
  'Switzerland', 'Thailand', 'Turkey', 'United Kingdom', 'United States', 'Vietnam',
];

const VISA_TYPES = ['Tourist', 'Business', 'Student', 'Work', 'Medical', 'Transit', 'Visit', 'Residence'];

const schema = z.object({
  travellerId: z.string().min(1, 'Traveller is required'),
  travellerName: z.string().min(1),
  passportNumber: z.string().optional(),
  destinationCountry: z.string().min(1, 'Destination country is required'),
  visaType: z.string().optional(),
  applicationDate: z.date().optional(),
  expiryDate: z.date().optional(),
  notes: z.string().optional(),
});
type VisaForm = z.infer<typeof schema>;

function toDateOnly(d?: Date): string | undefined {
  return d ? d.toISOString().split('T')[0] : undefined;
}

async function fetchTravellers(query: string, page: number) {
  const r = await travellersApi.list({ search: query || undefined, page, limit: 20 });
  const data = r.data as unknown;
  const items = Array.isArray(data)
    ? (data as Traveller[])
    : ((data as { data?: Traveller[] })?.data ?? []);
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
        travellerName: '',
        passportNumber: '',
        destinationCountry: '',
        visaType: '',
        applicationDate: new Date(),
        notes: '',
      }}
      prefillFromParams={{ travellerId: 'travellerId' }}
      onCancel={() => router.back()}
      onSubmit={async (v) => {
        const payload: CreateVisaRequest = {
          travellerName: v.travellerName,
          passportNumber: v.passportNumber ?? '',
          countryName: v.destinationCountry,
          visaType: v.visaType || undefined,
          applicationDate: toDateOnly(v.applicationDate),
          expiryDate: toDateOnly(v.expiryDate),
          notes: v.notes || undefined,
          status: 'not_started',
        };
        await visaApi.create(payload);
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
                  onChange={(id, item) => {
                    form.setValue('travellerId', id ?? '', { shouldDirty: true, shouldValidate: true });
                    form.setValue('travellerName', item ? `${item.firstName} ${item.lastName}` : '', { shouldDirty: true });
                    form.setValue('passportNumber', item?.passportNumber ?? '', { shouldDirty: true });
                  }}
                  fetcher={fetchTravellers}
                  getOptionId={(t) => t.id}
                  getOptionLabel={(t) => `${t.firstName} ${t.lastName}`}
                  getOptionDescription={(t) => t.passportNumber}
                  resolveSelected={async (id) => (await travellersApi.getById(id)).data}
                  placeholder="Select a traveller…"
                  searchPlaceholder="Search by name or passport…"
                  required
                  error={form.formState.errors.travellerId?.message}
                />
              </FormRow>
              {form.watch('passportNumber') && (
                <FormRow name="passportNumber" label="Passport Number" wide>
                  <Input value={form.watch('passportNumber')} disabled readOnly />
                </FormRow>
              )}
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

              <FormRow name="visaType" label="Visa Type">
                <Select value={form.watch('visaType')} onValueChange={(val) => form.setValue('visaType', val, { shouldDirty: true })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select visa type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {VISA_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
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
