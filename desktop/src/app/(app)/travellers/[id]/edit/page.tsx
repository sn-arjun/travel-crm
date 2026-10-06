'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Loader2, AlertCircle } from 'lucide-react';
import { EntityForm, FormRow } from '@/components/domain';
import { Button, Input, SectionCard, Combobox, PhoneInput, DatePicker } from '@/components/ui';
import { useApiQuery } from '@/hooks/use-api';
import { travellersApi, toDateOnly, parseDateOnly, normalizeTraveller } from '@/lib/api/visa';
import { unwrapEntity } from '@/lib/api/envelope';
import {
  COUNTRIES,
  travellerSchema,
  travellerExtraPayload,
  TravellerPreferencesSection,
  type TravellerFormValues,
} from '../../_lib/form-shared';
import { toast } from 'sonner';



export default function EditTravellerPage() {
  const router = useRouter();
  const params = useParams();
  const travellerId = params.id as string;
  const [nationalitySearch, setNationalitySearch] = React.useState('');

  const { data: travellerResponse, loading, error } = useApiQuery(() => travellersApi.getById(travellerId), [travellerId]);
  const travellerRaw = unwrapEntity<unknown>(travellerResponse);
  const traveller = travellerRaw && typeof travellerRaw === 'object' ? normalizeTraveller(travellerRaw) : undefined;

  const filteredNationalities = React.useMemo(() => {
    if (!nationalitySearch) return COUNTRIES;
    const q = nationalitySearch.toLowerCase();
    return COUNTRIES.filter((c) => c.label.toLowerCase().includes(q));
  }, [nationalitySearch]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-ds-foreground-muted" />
        <p className="text-ds-foreground-muted">Loading traveller...</p>
      </div>
    );
  }

  if (error || !traveller) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-12 w-12 text-ds-danger" />
        <p className="text-ds-danger">Failed to load traveller</p>
        <Button variant="outline" onClick={() => router.push('/travellers')}>Back to Travellers</Button>
      </div>
    );
  }

  return (
    <EntityForm<TravellerFormValues>
      title="Edit traveller"
      description={`${traveller.firstName} ${traveller.lastName}`.trim()}
      schema={travellerSchema}
      defaultValues={{
        firstName: traveller.firstName,
        lastName: traveller.lastName,
        passportNumber: traveller.passportNumber,
        dateOfBirth: traveller.dateOfBirth ? parseDateOnly(traveller.dateOfBirth) : undefined,
        passportExpiryDate: traveller.passportExpiryDate ? parseDateOnly(traveller.passportExpiryDate) : undefined,
        nationality: traveller.nationality || '',
        email: traveller.email || '',
        phone: traveller.phone || '',
        frequentFlyerNumbers: traveller.frequentFlyerNumbers || '',
        mealPreference: traveller.mealPreference || '',
        seatPreference: traveller.seatPreference || '',
        emergencyContactName: traveller.emergencyContactName || '',
        emergencyContactPhone: traveller.emergencyContactPhone || '',
        medicalNotes: traveller.medicalNotes || '',
      }}
      onCancel={() => router.back()}
      onSubmit={async (v) => {
        const payload = {
          firstName: v.firstName,
          lastName: v.lastName || '',
          passportNumber: v.passportNumber,
          dateOfBirth: v.dateOfBirth ? toDateOnly(v.dateOfBirth) : undefined,
          passportExpiryDate: v.passportExpiryDate ? toDateOnly(v.passportExpiryDate) : undefined,
          nationality: v.nationality || undefined,
          email: v.email || undefined,
          phone: v.phone || undefined,
          ...travellerExtraPayload(v),
        };
        const result = await travellersApi.update(travellerId, payload);
        if (result?.data) {
          toast.success('Traveller updated successfully');
          router.push(`/travellers/${travellerId}`);
        } else {
          toast.error('Failed to update traveller');
        }
      }}
      renderSections={(form) => (
        <>
          <SectionCard title="Personal Information" required>
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="firstName" label="First Name" required>
                <Input id="firstName" placeholder="First name" {...form.register('firstName')} />
              </FormRow>
              <FormRow name="lastName" label="Last Name" required>
                <Input id="lastName" placeholder="Last name" {...form.register('lastName')} />
              </FormRow>
              <FormRow name="dateOfBirth" label="Date of Birth">
                <DatePicker
                  value={form.watch('dateOfBirth')}
                  onChange={(d) => form.setValue('dateOfBirth', d, { shouldDirty: true })}
                  maxDate={new Date()}
                  placeholder="Pick date of birth"
                />
              </FormRow>
              <FormRow name="nationality" label="Nationality">
                <Combobox
                  options={filteredNationalities}
                  value={form.watch('nationality') || ''}
                  onValueChange={(val) => form.setValue('nationality', val, { shouldDirty: true })}
                  onSearch={setNationalitySearch}
                  placeholder="Select nationality..."
                  searchPlaceholder="Search nationality..."
                />
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="Passport Details" required>
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="passportNumber" label="Passport Number" required>
                <Input
                  id="passportNumber"
                  placeholder="e.g., A12345678"
                  className="font-mono"
                  {...form.register('passportNumber', {
                    onChange: (e) => form.setValue('passportNumber', e.target.value.toUpperCase(), { shouldDirty: true }),
                  })}
                />
              </FormRow>
              <FormRow name="passportExpiryDate" label="Passport Expiry">
                <DatePicker
                  value={form.watch('passportExpiryDate')}
                  onChange={(d) => form.setValue('passportExpiryDate', d, { shouldDirty: true })}
                  placeholder="Pick expiry date"
                />
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="Contact Information">
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="email" label="Email">
                <Input id="email" type="email" placeholder="email@example.com" {...form.register('email')} />
              </FormRow>
              <FormRow name="phone" label="Phone">
                <PhoneInput
                  value={form.watch('phone') || ''}
                  onChange={(value) => form.setValue('phone', value, { shouldDirty: true })}
                />
              </FormRow>
            </div>
          </SectionCard>

          <TravellerPreferencesSection form={form} />
        </>
      )}
    />
  );
}
