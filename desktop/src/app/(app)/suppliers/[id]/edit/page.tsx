'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { z } from 'zod';
import { toast } from 'sonner';
import { EntityForm, FormRow } from '@/components/domain';
import {
  Input, Textarea, SectionCard, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Spinner,
} from '@/components/ui';
import { PhoneInput } from '@/components/ui/phone-input';
import { AddressAutocomplete, type AddressParts } from '@/components/ui/address-autocomplete';
import { useApiQuery } from '@/hooks/use-api';
import { suppliersApi } from '@/lib/api/suppliers';

const CATEGORY_OPTIONS = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'airline', label: 'Airline' },
  { value: 'transport', label: 'Transport' },
  { value: 'activity_provider', label: 'Activity Provider' },
  { value: 'guide', label: 'Guide' },
  { value: 'visa_agent', label: 'Visa Agent' },
  { value: 'insurance', label: 'Insurance' },
];

const schema = z.object({
  companyName: z.string().min(1, 'Supplier name is required'),
  category: z.enum(['hotel', 'transport', 'airline', 'activity_provider', 'guide', 'visa_agent', 'insurance']),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  phoneCountryCode: z.string(),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  website: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  gstNumber: z.string().optional(),
  taxId: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['active', 'inactive']),
  isPreferred: z.boolean(),
});
type SupplierFormValues = z.infer<typeof schema>;

export default function SupplierEditPage() {
  const router = useRouter();
  const params = useParams();
  const supplierId = params.id as string;

  const { data: supplierResponse, loading, error } = useApiQuery(
    () => suppliersApi.getById(supplierId),
    [supplierId],
  );

  const supplier = supplierResponse?.data as any;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-ds-4">
        <Spinner className="size-8" />
        <p className="text-ds-foreground-muted">Loading supplier...</p>
      </div>
    );
  }

  if (error || !supplier) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-ds-4">
        <p className="text-ds-danger">Failed to load supplier</p>
      </div>
    );
  }

  const rawPhone: string = supplier.phone ?? '';
  const phoneMatch = rawPhone.match(/^(\+\d+)\s+(.*)$/);
  const phoneCountryCode = phoneMatch ? phoneMatch[1] : '+91';
  const phone = phoneMatch ? phoneMatch[2] : rawPhone;

  return (
    <EntityForm<SupplierFormValues>
      title="Edit Supplier"
      schema={schema}
      defaultValues={{
        companyName: supplier.company_name ?? supplier.name ?? '',
        category: supplier.category ?? 'hotel',
        contactPerson: supplier.contact_person ?? supplier.contactPerson ?? '',
        phone,
        phoneCountryCode,
        email: supplier.email ?? '',
        website: supplier.website ?? '',
        address: supplier.address ?? '',
        city: supplier.city ?? '',
        state: supplier.state ?? '',
        country: supplier.country ?? '',
        postalCode: supplier.postal_code ?? supplier.postalCode ?? '',
        gstNumber: supplier.gst_number ?? supplier.gstNumber ?? '',
        taxId: supplier.tax_id ?? supplier.taxId ?? '',
        notes: supplier.notes ?? '',
        status: supplier.status ?? 'active',
        isPreferred: supplier.is_preferred ?? supplier.isPreferred ?? false,
      }}
      onCancel={() => router.back()}
      submitLabel="Save Changes"
      onSubmit={async (v) => {
        try {
          await suppliersApi.update(supplierId, {
            companyName: v.companyName,
            category: v.category,
            contactPerson: v.contactPerson || undefined,
            phone: v.phone ? `${v.phoneCountryCode} ${v.phone}` : undefined,
            email: v.email || undefined,
            website: v.website || undefined,
            address: v.address || undefined,
            city: v.city || undefined,
            state: v.state || undefined,
            country: v.country || undefined,
            postalCode: v.postalCode || undefined,
            gstNumber: v.gstNumber || undefined,
            taxId: v.taxId || undefined,
            notes: v.notes || undefined,
            isPreferred: v.isPreferred,
            status: v.status,
          });
          toast.success('Supplier updated successfully');
          router.push(`/suppliers/${supplierId}`);
        } catch {
          toast.error('Failed to update supplier');
        }
      }}
      renderSections={(form) => (
        <>
          <SectionCard title="Basic Information" required>
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="companyName" label="Supplier Name" required>
                <Input id="companyName" {...form.register('companyName')} />
              </FormRow>
              <FormRow name="category" label="Category" required>
                <Select value={form.watch('category')} onValueChange={(v) => form.setValue('category', v as SupplierFormValues['category'], { shouldDirty: true })}>
                  <SelectTrigger id="category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow name="contactPerson" label="Contact Person">
                <Input id="contactPerson" {...form.register('contactPerson')} />
              </FormRow>
              <FormRow name="phone" label="Phone">
                <PhoneInput
                  value={form.watch('phone') ?? ''}
                  onChange={(v) => form.setValue('phone', v, { shouldDirty: true })}
                  countryCode={form.watch('phoneCountryCode')}
                  onCountryCodeChange={(c) => form.setValue('phoneCountryCode', c, { shouldDirty: true })}
                />
              </FormRow>
              <FormRow name="email" label="Email">
                <Input id="email" type="email" {...form.register('email')} />
              </FormRow>
              <FormRow name="website" label="Website">
                <Input id="website" type="url" {...form.register('website')} />
              </FormRow>
              <FormRow name="status" label="Status">
                <Select value={form.watch('status')} onValueChange={(v) => form.setValue('status', v as SupplierFormValues['status'], { shouldDirty: true })}>
                  <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow name="isPreferred" label="Preferred Supplier">
                <div className="flex items-center gap-ds-2 h-9">
                  <Switch
                    checked={form.watch('isPreferred')}
                    onCheckedChange={(v) => form.setValue('isPreferred', v, { shouldDirty: true })}
                  />
                  <span className="text-sm text-ds-foreground-muted">
                    {form.watch('isPreferred') ? 'Marked as preferred' : 'Not preferred'}
                  </span>
                </div>
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="Address">
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="address" label="Street Address" wide>
                <AddressAutocomplete
                  value={form.watch('address') ?? ''}
                  onChange={(v: string) => form.setValue('address', v, { shouldDirty: true })}
                  onAddressSelect={(parts: AddressParts) => {
                    form.setValue('address', parts.address, { shouldDirty: true });
                    form.setValue('city', parts.city, { shouldDirty: true });
                    form.setValue('state', parts.state, { shouldDirty: true });
                    form.setValue('country', parts.country, { shouldDirty: true });
                    form.setValue('postalCode', parts.postalCode, { shouldDirty: true });
                  }}
                  placeholder="Start typing an address..."
                />
              </FormRow>
              <FormRow name="city" label="City">
                <Input id="city" {...form.register('city')} />
              </FormRow>
              <FormRow name="state" label="State">
                <Input id="state" {...form.register('state')} />
              </FormRow>
              <FormRow name="country" label="Country">
                <Input id="country" {...form.register('country')} />
              </FormRow>
              <FormRow name="postalCode" label="Postal Code">
                <Input id="postalCode" {...form.register('postalCode')} />
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="Tax & Compliance">
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="gstNumber" label="GST Number">
                <Input id="gstNumber" {...form.register('gstNumber')} />
              </FormRow>
              <FormRow name="taxId" label="Tax ID / PAN">
                <Input id="taxId" {...form.register('taxId')} />
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="Notes">
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="notes" label="Notes" wide>
                <Textarea id="notes" rows={3} {...form.register('notes')} />
              </FormRow>
            </div>
          </SectionCard>
        </>
      )}
    />
  );
}
