'use client';

import { defaultCountryCode } from '@/lib/phone';
import { useLocale } from '@/lib/locale';
import { getLocaleContext } from '@/lib/locale';
import { currencyOptions, timezoneOptions, systemTimeZone } from '@/lib/locale-options';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Upload } from 'lucide-react';
import { EntityForm, FormRow } from '@/components/domain';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Input,
  PhoneInput,
  AddressAutocomplete,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SectionCard,
  Skeleton,
} from '@/components/ui';
import { toast } from 'sonner';
import { settingsApi, type UpdateCompanySettingsRequest } from '@/lib/api/settings';
import { useApiQuery } from '@/hooks/use-api';
import { getApiBaseUrl } from '@/lib/api/config';
import { PageContainer } from '@/components/layout/page-container';

const schema = z.object({
  name: z.string().min(1, 'Company name is required'),
  email: z.string().email('Enter a valid email').or(z.literal('')),
  phone: z.string().optional(),
  website: z.string().optional(),
  gstin: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  timezone: z.string().optional(),
  currency: z.string().optional(),
  language: z.string().optional(),
});
type CompanyForm = z.infer<typeof schema>;

const defaultValues: CompanyForm = {
  name: '',
  email: '',
  phone: '',
  website: '',
  gstin: '',
  address: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  timezone: '',
  currency: '',
  language: 'en',
};

// The stored phone is "<country code> <number>"; the form edits the two halves separately.
function splitPhone(stored: string | undefined): { code: string; number: string } {
  const m = (stored ?? '').trim().match(/^(\+\d{1,4})\s+(.*)$/);
  return m ? { code: m[1]!, number: m[2]! } : { code: defaultCountryCode(), number: (stored ?? '').trim() };
}

export default function CompanySettingsPage() {
  const router = useRouter();
  // GSTIN is an India field: shown for an Indian (or not yet located) agency, or when one is already on file.
  const { country } = useLocale();
  const indiaAgency = country === 'IN' || country === '';
  const [countryCode, setCountryCode] = React.useState(() => defaultCountryCode());
  const { data: settingsResponse, loading, refetch } = useApiQuery(
    () => settingsApi.company.get(),
    [],
  );

  const companySettings = React.useMemo(() => {
    if (!settingsResponse || !('data' in settingsResponse)) return null;
    return settingsResponse.data ?? null;
  }, [settingsResponse]);

  React.useEffect(() => {
    if (companySettings) setCountryCode(splitPhone(companySettings.phone).code);
  }, [companySettings]);

  const companyInitials = (companySettings?.name || 'TC')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    try {
      await settingsApi.logo.upload({ file });
      toast.success('Logo uploaded successfully');
      refetch();
    } catch {
      toast.error('Failed to upload logo');
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </PageContainer>
    );
  }

  return (
    <EntityForm<CompanyForm>
      title="Company Settings"
      description="Manage your company profile, address, and regional preferences."
      schema={schema}
      defaultValues={{
        ...defaultValues,
        name: companySettings?.name ?? '',
        email: companySettings?.email ?? '',
        phone: splitPhone(companySettings?.phone).number,
        website: companySettings?.website ?? '',
        gstin: companySettings?.gstin ?? '',
        address: companySettings?.address ?? '',
        city: companySettings?.city ?? '',
        state: companySettings?.state ?? '',
        postalCode: companySettings?.postalCode ?? '',
        country: companySettings?.country ?? '',
        timezone: companySettings?.timezone ?? (getLocaleContext().timeZone || systemTimeZone()),
        currency: companySettings?.currency ?? getLocaleContext().currency,
        language: companySettings?.language ?? 'en',
      }}
      onCancel={() => router.push('/settings')}
      onSubmit={async (v) => {
        const payload: UpdateCompanySettingsRequest = {
          ...v,
          phone: v.phone?.trim() ? `${countryCode} ${v.phone.trim()}` : '',
        };
        try {
          await settingsApi.company.update(payload);
        } catch {
          toast.error('Failed to save settings');
          return;
        }
        toast.success('Company settings saved successfully');
        router.push('/settings');
      }}
      renderSections={(form) => (
        <>
          <SectionCard title="Company Profile" description="Basic company information and branding" required>
            <div className="space-y-ds-4">
              <div className="flex items-center gap-ds-4">
                <Avatar className="h-16 w-16">
                  {companySettings?.logoUrl && (
                    <AvatarImage
                      src={`${getApiBaseUrl()}${companySettings.logoUrl}`}
                      alt="Company logo"
                    />
                  )}
                  <AvatarFallback className="bg-primary-subtle text-primary-on-subtle font-bold">
                    {companyInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="absolute inset-0 cursor-pointer opacity-0"
                      aria-label="Upload company logo"
                    />
                    <Button variant="outline" className="w-full gap-ds-2" type="button">
                      <Upload className="h-4 w-4" aria-hidden="true" />
                      Upload Logo
                    </Button>
                  </div>
                  <p className="text-xs text-ds-foreground-subtle mt-ds-2">PNG or JPG, max 2MB</p>
                </div>
              </div>

              <div className="grid gap-ds-4 sm:grid-cols-2">
                <FormRow name="name" label="Company Name" required wide>
                  <Input {...form.register('name')} id="name" placeholder="Your Company Name" />
                </FormRow>
                <FormRow name="email" label="Email">
                  <Input {...form.register('email')} id="email" type="email" placeholder="contact@company.com" />
                </FormRow>
                <FormRow name="phone" label="Phone">
                  <PhoneInput
                    value={form.watch('phone') || ''}
                    countryCode={countryCode}
                    onCountryCodeChange={setCountryCode}
                    onChange={(v) => form.setValue('phone', v, { shouldDirty: true })}
                  />
                </FormRow>
                <FormRow name="website" label="Website">
                  <Input {...form.register('website')} id="website" placeholder="https://yourcompany.com" />
                </FormRow>
                {(indiaAgency || Boolean(form.watch('gstin'))) && (
                  <FormRow name="gstin" label="GSTIN">
                    <Input {...form.register('gstin')} id="gstin" placeholder="22AAAAA0000A1Z5" />
                  </FormRow>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Address">
            <div className="grid gap-ds-4">
              <FormRow name="address" label="Street Address" wide>
                <AddressAutocomplete
                  value={form.watch('address') || ''}
                  onChange={(v) => form.setValue('address', v, { shouldDirty: true })}
                  onAddressSelect={(details) => {
                    if (details.city) form.setValue('city', details.city, { shouldDirty: true });
                    if (details.state) form.setValue('state', details.state, { shouldDirty: true });
                    if (details.postalCode) form.setValue('postalCode', details.postalCode, { shouldDirty: true });
                    if (details.country) form.setValue('country', details.country, { shouldDirty: true });
                  }}
                />
              </FormRow>
              <div className="grid gap-ds-4 sm:grid-cols-3">
                <FormRow name="city" label="City">
                  <Input {...form.register('city')} id="city" />
                </FormRow>
                <FormRow name="state" label="State">
                  <Input {...form.register('state')} id="state" />
                </FormRow>
                <FormRow name="postalCode" label="Postal Code">
                  <Input {...form.register('postalCode')} id="postalCode" />
                </FormRow>
              </div>
              <FormRow name="country" label="Country">
                <Input {...form.register('country')} id="country" placeholder="India" />
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="Regional Settings" description="Currency, timezone, and language">
            <div className="grid gap-ds-4 sm:grid-cols-3">
              <FormRow name="currency" label="Currency">
                <Select value={form.watch('currency')} onValueChange={(v) => form.setValue('currency', v, { shouldDirty: true })}>
                  <SelectTrigger id="currency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {currencyOptions(form.watch('currency')).map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow name="timezone" label="Timezone">
                <Select value={form.watch('timezone')} onValueChange={(v) => form.setValue('timezone', v, { shouldDirty: true })}>
                  <SelectTrigger id="timezone"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {timezoneOptions(form.watch('timezone')).map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow name="language" label="Language">
                <Select value={form.watch('language')} onValueChange={(v) => form.setValue('language', v, { shouldDirty: true })}>
                  <SelectTrigger id="language"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="hi">हिंदी (Hindi)</SelectItem>
                    <SelectItem value="ar">العربية (Arabic)</SelectItem>
                  </SelectContent>
                </Select>
              </FormRow>
            </div>
          </SectionCard>
        </>
      )}
    />
  );
}
