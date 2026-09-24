'use client';

import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { toast } from 'sonner';
import { EntityForm, FormRow } from '@/components/domain';
import {
  Input, Textarea, SectionCard, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch,
} from '@/components/ui';
import { PhoneInput } from '@/components/ui/phone-input';
import { AddressAutocomplete, type AddressParts } from '@/components/ui/address-autocomplete';
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

export default function NewSupplierPage() {
  const router = useRouter();

  return (
    <EntityForm<SupplierFormValues>
      title="New Supplier"
      description="Add a new supplier to your network"
      schema={schema}
      defaultValues={{
        companyName: '',
        category: 'hotel',
        contactPerson: '',
        phone: '',
        phoneCountryCode: '+91',
        email: '',
        website: '',
        address: '',
        city: '',
        state: '',
        country: 'India',
        postalCode: '',
        gstNumber: '',
        taxId: '',
        notes: '',
        status: 'active',
        isPreferred: false,
      }}
      onCancel={() => router.back()}
      submitLabel="Save Supplier"
      onSubmit={async (v) => {
        try {
          await suppliersApi.create({
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
          });
          toast.success('Supplier created successfully');
          router.push('/suppliers');
        } catch {
          toast.error('Failed to create supplier');
        }
      }}
      renderSections={(form) => (
        <>
          <SectionCard title="Basic Information" required>
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="companyName" label="Supplier Name" required>
                <Input id="companyName" placeholder="e.g., Taj Hotels" {...form.register('companyName')} />
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
                <Input id="contactPerson" placeholder="e.g., Rajesh Kumar" {...form.register('contactPerson')} />
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
                <Input id="email" type="email" placeholder="email@example.com" {...form.register('email')} />
              </FormRow>
              <FormRow name="website" label="Website">
                <Input id="website" type="url" placeholder="https://example.com" {...form.register('website')} />
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
                <Input id="city" placeholder="City" {...form.register('city')} />
              </FormRow>
              <FormRow name="state" label="State">
                <Input id="state" placeholder="State" {...form.register('state')} />
              </FormRow>
              <FormRow name="country" label="Country">
                <Input id="country" {...form.register('country')} />
              </FormRow>
              <FormRow name="postalCode" label="Postal Code">
                <Input id="postalCode" placeholder="400001" {...form.register('postalCode')} />
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="Tax & Compliance">
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="gstNumber" label="GST Number">
                <Input id="gstNumber" placeholder="22AAAAA0000A1Z5" {...form.register('gstNumber')} />
              </FormRow>
              <FormRow name="taxId" label="Tax ID / PAN">
                <Input id="taxId" placeholder="AAAAA0000A" {...form.register('taxId')} />
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="Notes">
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="notes" label="Notes" wide>
                <Textarea id="notes" placeholder="Any additional notes about this supplier..." rows={3} {...form.register('notes')} />
              </FormRow>
            </div>
          </SectionCard>
        </>
      )}
    />
  );
}
