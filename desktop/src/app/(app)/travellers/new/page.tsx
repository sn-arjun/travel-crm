'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import { Input, SectionCard, Combobox, PhoneInput, DatePicker } from '@/components/ui';
import { travellersApi, toDateOnly } from '@/lib/api/visa';
import { contactsApi } from '@/lib/api/contacts';
import { unwrapEntity, unwrapList } from '@/lib/api/envelope';
import type { Contact } from '@travelcrm/shared';
import {
  COUNTRIES,
  travellerSchema,
  travellerExtraPayload,
  TravellerPreferencesSection,
  type TravellerFormValues,
} from '../_lib/form-shared';
import { toast } from 'sonner';



export default function NewTravellerPage() {
  const router = useRouter();
  const [nationalitySearch, setNationalitySearch] = React.useState('');

  const filteredNationalities = React.useMemo(() => {
    if (!nationalitySearch) return COUNTRIES;
    const q = nationalitySearch.toLowerCase();
    return COUNTRIES.filter((c) => c.label.toLowerCase().includes(q));
  }, [nationalitySearch]);

  return (
    <EntityForm<TravellerFormValues>
      title="New traveller"
      description="Capture passenger and passport details for travel bookings."
      schema={travellerSchema}
      defaultValues={{
        firstName: '', lastName: '', passportNumber: '', dateOfBirth: undefined,
        passportExpiryDate: undefined, nationality: '', email: '', phone: '', contactId: '',
        frequentFlyerNumbers: '', mealPreference: '', seatPreference: '',
        emergencyContactName: '', emergencyContactPhone: '', medicalNotes: '',
      }}
      prefillFromParams={{ contactId: 'contactId' }}
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
          contactId: v.contactId || undefined,
          ...travellerExtraPayload(v),
        };
        const result = await travellersApi.create(payload);
        if (result?.data) {
          toast.success('Traveller created successfully');
          router.push(result.data.id ? `/travellers/${result.data.id}` : '/travellers');
        } else {
          toast.error('Failed to create traveller');
        }
      }}
      renderSections={(form) => (
        <>
          <SectionCard title="Linked Contact">
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="contactId" label="Contact" wide hint="Optional — associate this traveller with an existing contact">
                <RelationCombobox
                  value={form.watch('contactId') || null}
                  onChange={(id) => form.setValue('contactId', id ?? '', { shouldDirty: true })}
                  fetcher={async (q, page) => {
                    const list = unwrapList<Contact>(await contactsApi.list({ search: q, page, limit: 20 }));
                    return { items: list.data, total: list.pagination?.total ?? list.data.length };
                  }}
                  getOptionId={(c: Contact) => c.id}
                  getOptionLabel={(c: Contact) => c.name}
                  getOptionDescription={(c: Contact) => c.email ?? undefined}
                  resolveSelected={async (id) => unwrapEntity<Contact>(await contactsApi.getById(id))}
                  placeholder="Select a contact"
                  searchPlaceholder="Search contacts..."
                />
              </FormRow>
            </div>
          </SectionCard>

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
                  minDate={new Date()}
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
