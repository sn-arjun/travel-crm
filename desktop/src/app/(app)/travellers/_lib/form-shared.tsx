import * as React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { FormRow } from '@/components/domain';
import { Input, SectionCard, Textarea } from '@/components/ui';

export const COUNTRIES = [
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

export const travellerSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  passportNumber: z.string().min(1, 'Passport number is required'),
  dateOfBirth: z.date().optional(),
  passportExpiryDate: z.date().optional(),
  nationality: z.string().optional(),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  contactId: z.string().optional(),
  frequentFlyerNumbers: z.string().optional(),
  mealPreference: z.string().optional(),
  seatPreference: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  medicalNotes: z.string().optional(),
});
export type TravellerFormValues = z.infer<typeof travellerSchema>;

/**
 * Optional traveller columns the backend stores but the shared request types
 * do not list yet. Empty strings are sent as undefined so they never clobber data.
 */
export function travellerExtraPayload(v: TravellerFormValues) {
  return {
    frequentFlyerNumbers: v.frequentFlyerNumbers || undefined,
    mealPreference: v.mealPreference || undefined,
    seatPreference: v.seatPreference || undefined,
    emergencyContactName: v.emergencyContactName || undefined,
    emergencyContactPhone: v.emergencyContactPhone || undefined,
    medicalNotes: v.medicalNotes || undefined,
  };
}

export function TravellerPreferencesSection({ form }: { form: UseFormReturn<TravellerFormValues> }) {
  return (
    <SectionCard title="Preferences & Emergency Contact">
      <div className="grid gap-ds-4 sm:grid-cols-2">
        <FormRow name="frequentFlyerNumbers" label="Frequent Flyer Numbers" hint="Airline and number, separated by commas" wide>
          <Input id="frequentFlyerNumbers" placeholder="e.g., AI 123456789, EK 987654321" {...form.register('frequentFlyerNumbers')} />
        </FormRow>
        <FormRow name="mealPreference" label="Meal Preference">
          <Input id="mealPreference" placeholder="e.g., Vegetarian" {...form.register('mealPreference')} />
        </FormRow>
        <FormRow name="seatPreference" label="Seat Preference">
          <Input id="seatPreference" placeholder="e.g., Window" {...form.register('seatPreference')} />
        </FormRow>
        <FormRow name="emergencyContactName" label="Emergency Contact Name">
          <Input id="emergencyContactName" placeholder="Full name" {...form.register('emergencyContactName')} />
        </FormRow>
        <FormRow name="emergencyContactPhone" label="Emergency Contact Phone">
          <Input id="emergencyContactPhone" placeholder="+91 98765 43210" {...form.register('emergencyContactPhone')} />
        </FormRow>
        <FormRow name="medicalNotes" label="Medical Notes" wide>
          <Textarea id="medicalNotes" rows={3} placeholder="Allergies, mobility needs or medication" {...form.register('medicalNotes')} />
        </FormRow>
      </div>
    </SectionCard>
  );
}
