'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { EntityForm, FormRow } from '@/components/domain';
import { Input, Textarea, SectionCard, PhoneInput, DatePicker } from '@/components/ui';
import { useApiQuery } from '@/hooks/use-api';
import { fleetApi } from '@/lib/api/fleet';
import { toast } from 'sonner';
import { parseLocalDate, toLocalDateString } from '@/lib/dates';
import { useT } from '@/lib/i18n';
import { useLocale } from '@/lib/locale';
import { bankCountryOf } from '@/lib/bank-details';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  dateOfBirth: z.date().optional(),
  address: z.string().optional(),
  licenseNumber: z.string().optional(),
  licenseExpiry: z.date().optional(),
  licenseType: z.string().optional(),
  badgeNumber: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactRelation: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankIFSC: z.string().optional(),
  bankIBAN: z.string().optional(),
  notes: z.string().optional(),
});
type DriverFormValues = z.infer<typeof schema>;

function toDate(v?: string): Date | undefined {
  return v ? parseLocalDate(v) : undefined;
}

export default function EditDriverPage() {
  const router = useRouter();
  const t = useT();
  const { country, currency } = useLocale();
  // The IFSC is an Indian code; every other country gets an IBAN next to the account number.
  const inIndia = bankCountryOf('', country, currency) === 'IN';
  const params = useParams();
  const driverId = params.id as string;

  const { data: driverResponse, loading, error } = useApiQuery(
    () => fleetApi.drivers.getById(driverId),
    [driverId],
  );

  const driver = driverResponse?.data;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-ds-foreground-muted">
        <Loader2 className="h-5 w-5 animate-spin" /><span>Loading driver...</span>
      </div>
    );
  }

  if (error || !driver) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-ds-foreground-muted">Driver not found</p>
      </div>
    );
  }

  return (
    <EntityForm<DriverFormValues>
      title="Edit driver"
      description={driver.name}
      schema={schema}
      defaultValues={{
        name: driver.name || '',
        phone: driver.phone || '',
        email: driver.email || '',
        dateOfBirth: toDate(driver.dateOfBirth),
        address: driver.address || '',
        licenseNumber: driver.licenseNumber || '',
        licenseExpiry: toDate(driver.licenseExpiry),
        licenseType: driver.licenseType || '',
        badgeNumber: driver.badgeNumber || '',
        emergencyContactName: driver.emergencyContactName || '',
        emergencyContactPhone: driver.emergencyContactPhone || '',
        emergencyContactRelation: driver.emergencyContactRelation || '',
        bankAccountName: driver.bankAccountName || '',
        bankAccountNumber: driver.bankAccountNumber || '',
        bankIFSC: driver.bankIFSC || '',
        bankIBAN: driver.bankIBAN || '',
        notes: driver.notes || '',
      }}
      onCancel={() => router.back()}
      onSubmit={async (v) => {
        const result = await fleetApi.drivers.update(driverId, {
          name: v.name,
          phone: v.phone,
          email: v.email || undefined,
          dateOfBirth: v.dateOfBirth ? toLocalDateString(v.dateOfBirth) : undefined,
          address: v.address || undefined,
          licenseNumber: v.licenseNumber || undefined,
          licenseExpiry: v.licenseExpiry ? toLocalDateString(v.licenseExpiry) : undefined,
          licenseType: v.licenseType || undefined,
          badgeNumber: v.badgeNumber || undefined,
          emergencyContactName: v.emergencyContactName || undefined,
          emergencyContactPhone: v.emergencyContactPhone || undefined,
          emergencyContactRelation: v.emergencyContactRelation || undefined,
          bankAccountName: v.bankAccountName || undefined,
          bankAccountNumber: v.bankAccountNumber || undefined,
          bankIFSC: inIndia ? v.bankIFSC || undefined : undefined,
          bankIBAN: inIndia ? undefined : v.bankIBAN || undefined,
          notes: v.notes || undefined,
        });
        if (result) {
          toast.success('Driver updated successfully');
          router.push(`/fleet/drivers/${driverId}`);
        } else {
          toast.error('Failed to update driver');
        }
      }}
      renderSections={(form) => (
        <>
          <SectionCard title="Personal information" required>
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="name" label="Full name" required wide>
                <Input {...form.register('name')} id="name" placeholder="e.g., Rajesh Kumar" />
              </FormRow>
              <FormRow name="phone" label="Phone number" required>
                <PhoneInput
                  value={form.watch('phone') || ''}
                  onChange={(v) => form.setValue('phone', v, { shouldDirty: true })}
                />
              </FormRow>
              <FormRow name="email" label="Email">
                <Input {...form.register('email')} id="email" type="email" placeholder="driver@example.com" />
              </FormRow>
              <FormRow name="dateOfBirth" label="Date of birth">
                <DatePicker
                  value={form.watch('dateOfBirth')}
                  onChange={(d) => form.setValue('dateOfBirth', d, { shouldDirty: true })}
                  maxDate={new Date()}
                />
              </FormRow>
              <FormRow name="address" label="Address" wide>
                <Input {...form.register('address')} id="address" placeholder="City, State" />
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="License & credentials">
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="licenseNumber" label="License number">
                <Input {...form.register('licenseNumber')} id="licenseNumber" placeholder="e.g., DL-0001-2024" />
              </FormRow>
              <FormRow name="licenseExpiry" label="License expiry" hint={form.formState.errors.licenseExpiry?.message}>
                <DatePicker
                  value={form.watch('licenseExpiry')}
                  onChange={(d) => form.setValue('licenseExpiry', d as Date, { shouldDirty: true })}
                />
              </FormRow>
              <FormRow name="licenseType" label="License type">
                <Input {...form.register('licenseType')} id="licenseType" placeholder="e.g., LMV, HMV, Transport" />
              </FormRow>
              <FormRow name="badgeNumber" label="Badge number">
                <Input {...form.register('badgeNumber')} id="badgeNumber" placeholder="Police verification badge" />
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="Emergency contact">
            <div className="grid gap-ds-4 sm:grid-cols-3">
              <FormRow name="emergencyContactName" label="Contact name">
                <Input {...form.register('emergencyContactName')} id="emergencyContactName" placeholder="Name" />
              </FormRow>
              <FormRow name="emergencyContactPhone" label="Contact phone">
                <PhoneInput
                  value={form.watch('emergencyContactPhone') || ''}
                  onChange={(v) => form.setValue('emergencyContactPhone', v, { shouldDirty: true })}
                />
              </FormRow>
              <FormRow name="emergencyContactRelation" label="Relation">
                <Input {...form.register('emergencyContactRelation')} id="emergencyContactRelation" placeholder="e.g., Spouse, Parent" />
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="Bank details" description="For payouts">
            <div className="grid gap-ds-4 sm:grid-cols-3">
              <FormRow name="bankAccountName" label={t('banks.field.accountName')}>
                <Input {...form.register('bankAccountName')} id="bankAccountName" placeholder={t('banks.placeholder.accountName')} />
              </FormRow>
              <FormRow name="bankAccountNumber" label={t('banks.field.accountNumber')}>
                <Input {...form.register('bankAccountNumber')} id="bankAccountNumber" placeholder={t('banks.placeholder.accountNumber')} />
              </FormRow>
              {inIndia ? (
                <FormRow name="bankIFSC" label={t('banks.field.ifsc')}>
                  <Input {...form.register('bankIFSC')} id="bankIFSC" placeholder={t('banks.placeholder.ifsc')} />
                </FormRow>
              ) : (
                <FormRow name="bankIBAN" label={t('banks.field.iban')}>
                  <Input {...form.register('bankIBAN')} id="bankIBAN" placeholder={t('banks.placeholder.iban')} />
                </FormRow>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Additional notes">
            <FormRow name="notes" label="Notes">
              <Textarea {...form.register('notes')} id="notes" placeholder="Any notes about the driver..." rows={3} />
            </FormRow>
          </SectionCard>
        </>
      )}
    />
  );
}
