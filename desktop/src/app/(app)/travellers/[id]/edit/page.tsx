'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { z } from 'zod';
import { Loader2, AlertCircle } from 'lucide-react';
import { EntityForm, FormRow } from '@/components/domain';
import { Button, Input, SectionCard, Combobox, PhoneInput, DatePicker } from '@/components/ui';
import { useApiQuery } from '@/hooks/use-api';
import { travellersApi } from '@/lib/api/visa';
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
});
type TravellerFormValues = z.infer<typeof schema>;

function normalize(raw: any) {
  return {
    firstName: raw.firstName ?? raw.first_name ?? '',
    lastName: raw.lastName ?? raw.last_name ?? '',
    passportNumber: raw.passportNumber ?? raw.passport_number ?? '',
    dateOfBirth: raw.dateOfBirth ?? raw.date_of_birth,
    passportExpiryDate: raw.passportExpiryDate ?? raw.passport_expiry_date,
    nationality: raw.nationality,
    email: raw.email,
    phone: raw.phone,
  };
}

export default function EditTravellerPage() {
  const router = useRouter();
  const params = useParams();
  const travellerId = params.id as string;
  const [nationalitySearch, setNationalitySearch] = React.useState('');

  const { data: travellerResponse, loading, error } = useApiQuery(() => travellersApi.getById(travellerId), [travellerId]);
  const travellerRaw = ((travellerResponse?.data as any)?.data ?? travellerResponse?.data) as any;
  const traveller = travellerRaw ? normalize(travellerRaw) : undefined;

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
      schema={schema}
      defaultValues={{
        firstName: traveller.firstName,
        lastName: traveller.lastName,
        passportNumber: traveller.passportNumber,
        dateOfBirth: traveller.dateOfBirth ? new Date(traveller.dateOfBirth) : undefined,
        passportExpiryDate: traveller.passportExpiryDate ? new Date(traveller.passportExpiryDate) : undefined,
        nationality: traveller.nationality || '',
        email: traveller.email || '',
        phone: traveller.phone || '',
      }}
      onCancel={() => router.back()}
      onSubmit={async (v) => {
        const result = await travellersApi.update(travellerId, {
          firstName: v.firstName,
          lastName: v.lastName || '',
          passportNumber: v.passportNumber,
          dateOfBirth: v.dateOfBirth ? v.dateOfBirth.toISOString().split('T')[0] : undefined,
          passportExpiryDate: v.passportExpiryDate ? v.passportExpiryDate.toISOString().split('T')[0] : undefined,
          nationality: v.nationality || undefined,
          email: v.email || undefined,
          phone: v.phone || undefined,
        });
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
