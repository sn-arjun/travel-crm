'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import { Input, SectionCard, Combobox, PhoneInput, DatePicker } from '@/components/ui';
import { travellersApi } from '@/lib/api/visa';
import { contactsApi } from '@/lib/api/contacts';
import { toast } from 'sonner';

const COUNTRIES = [
  'Afghan', 'Albanian', 'Algerian', 'American', 'Andorran', 'Angolan', 'Argentine', 'Armenian',
  'Australian', 'Austrian', 'Azerbaijani', 'Bahamian', 'Bahraini', 'Bangladeshi', 'Belgian',
  'Belizean', 'Beninese', 'Bhutanese', 'Bolivian', 'Bosnian', 'Brazilian', 'British', 'Bruneian',
  'Bulgarian', 'Burkinabe', 'Burmese', 'Burundian', 'Cambodian', 'Cameroonian', 'Canadian',
  'Chilean', 'Chinese', 'Colombian', 'Congolese', 'Costa Rican', 'Croatian', 'Cuban', 'Cypriot',
  'Czech', 'Danish', 'Djiboutian', 'Dominican', 'Dutch', 'Ecuadorian', 'Egyptian', 'Emirati',
  'Eritrean', 'Estonian', 'Ethiopian', 'Fijian', 'Filipino', 'Finnish', 'French', 'Gabonese',
  'Gambian', 'Georgian', 'German', 'Ghanaian', 'Greek', 'Guatemalan', 'Guinean', 'Haitian',
  'Honduran', 'Hungarian', 'Icelandic', 'Indian', 'Indonesian', 'Iranian', 'Iraqi', 'Irish',
  'Israeli', 'Italian', 'Ivorian', 'Jamaican', 'Japanese', 'Jordanian', 'Kazakhstani', 'Kenyan',
  'Korean', 'Kuwaiti', 'Kyrgyz', 'Laotian', 'Latvian', 'Lebanese', 'Liberian', 'Libyan',
  'Lithuanian', 'Luxembourgish', 'Macedonian', 'Malagasy', 'Malawian', 'Malaysian', 'Maldivian',
  'Malian', 'Maltese', 'Mauritanian', 'Mauritian', 'Mexican', 'Moldovan', 'Mongolian', 'Montenegrin',
  'Moroccan', 'Mozambican', 'Namibian', 'Nepalese', 'New Zealander', 'Nicaraguan', 'Nigerian',
  'Norwegian', 'Omani', 'Pakistani', 'Palestinian', 'Panamanian', 'Paraguayan', 'Peruvian', 'Polish',
  'Portuguese', 'Qatari', 'Romanian', 'Russian', 'Rwandan', 'Saudi Arabian', 'Senegalese', 'Serbian',
  'Singaporean', 'Slovakian', 'Slovenian', 'Somali', 'South African', 'South Sudanese', 'Spanish',
  'Sri Lankan', 'Sudanese', 'Surinamese', 'Swedish', 'Swiss', 'Syrian', 'Taiwanese', 'Tajikistani',
  'Tanzanian', 'Thai', 'Togolese', 'Tunisian', 'Turkish', 'Turkmen', 'Ugandan', 'Ukrainian',
  'Uruguayan', 'Uzbekistani', 'Venezuelan', 'Vietnamese', 'Yemeni', 'Zambian', 'Zimbabwean',
].map((n) => ({ value: n, label: n }));

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().optional(),
  passportNumber: z.string().min(1, 'Passport number is required'),
  dateOfBirth: z.date().optional(),
  passportExpiryDate: z.date().optional(),
  nationality: z.string().optional(),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  contactId: z.string().optional(),
});
type TravellerFormValues = z.infer<typeof schema>;

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
      schema={schema}
      defaultValues={{
        firstName: '', lastName: '', passportNumber: '', dateOfBirth: undefined,
        passportExpiryDate: undefined, nationality: '', email: '', phone: '', contactId: '',
      }}
      prefillFromParams={{ contactId: 'contactId' }}
      onCancel={() => router.back()}
      onSubmit={async (v) => {
        const result = await travellersApi.create({
          firstName: v.firstName,
          lastName: v.lastName || '',
          passportNumber: v.passportNumber,
          dateOfBirth: v.dateOfBirth ? v.dateOfBirth.toISOString().split('T')[0] : undefined,
          nationality: v.nationality || undefined,
          email: v.email || undefined,
          phone: v.phone || undefined,
          contactId: v.contactId || undefined,
        });
        if (result?.data) {
          toast.success('Traveller created successfully');
          const data = result.data as any;
          router.push(data?.id ? `/travellers/${data.id}` : '/travellers');
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
                    const r = await contactsApi.list({ search: q, page, limit: 20 });
                    const data = r.data as any;
                    const items = Array.isArray(data) ? data : (data?.data ?? []);
                    const total = data?.pagination?.total ?? items.length;
                    return { items, total };
                  }}
                  getOptionId={(c: any) => c.id}
                  getOptionLabel={(c: any) => c.name || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()}
                  getOptionDescription={(c: any) => c.email ?? undefined}
                  resolveSelected={async (id) => (await contactsApi.getById(id)).data as any}
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
              <FormRow name="lastName" label="Last Name">
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
        </>
      )}
    />
  );
}
