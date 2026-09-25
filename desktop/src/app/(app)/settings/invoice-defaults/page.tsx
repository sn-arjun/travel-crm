'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { EntityForm, FormRow } from '@/components/domain';
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SectionCard,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { toast } from 'sonner';
import { settingsApi } from '@/lib/api/settings';
import { useApiQuery } from '@/hooks/use-api';

const schema = z.object({
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  ifsc: z.string().optional(),
  branch: z.string().optional(),
  accountHolderName: z.string().optional(),
  upiId: z.string().optional(),
  defaultCurrency: z.string(),
  defaultTaxSystem: z.string(),
  defaultPaymentTerms: z.string(),
  defaultNotes: z.string().optional(),
  defaultTerms: z.string().optional(),
});
type InvoiceDefaultsForm = z.infer<typeof schema>;

const defaultValues: InvoiceDefaultsForm = {
  bankName: '',
  accountNumber: '',
  ifsc: '',
  branch: '',
  accountHolderName: '',
  upiId: '',
  defaultCurrency: 'INR',
  defaultTaxSystem: 'GST',
  defaultPaymentTerms: '30',
  defaultNotes: '',
  defaultTerms: '',
};

export default function InvoiceDefaultsPage() {
  const router = useRouter();
  const { data: response, loading } = useApiQuery(() => settingsApi.invoiceDefaults.get(), []);

  const d = React.useMemo(() => {
    if (!response || !('data' in response)) return null;
    return response.data ?? null;
  }, [response]);

  if (loading) {
    return (
      <div className="space-y-ds-4 p-ds-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <EntityForm<InvoiceDefaultsForm>
      title="Invoice Defaults"
      description="Bank details and default values applied to new invoices."
      schema={schema}
      defaultValues={{
        bankName: d?.bankName ?? '',
        accountNumber: d?.accountNumber ?? '',
        ifsc: d?.ifsc ?? '',
        branch: d?.branch ?? '',
        accountHolderName: d?.accountHolderName ?? '',
        upiId: d?.upiId ?? '',
        defaultCurrency: d?.defaultCurrency ?? 'INR',
        defaultTaxSystem: d?.defaultTaxSystem ?? 'GST',
        defaultPaymentTerms: String(d?.defaultPaymentTerms ?? '30'),
        defaultNotes: d?.defaultNotes ?? '',
        defaultTerms: d?.defaultTerms ?? '',
      }}
      onCancel={() => router.push('/settings')}
      onSubmit={async (v) => {
        const result = await settingsApi.invoiceDefaults.update({
          ...v,
          defaultPaymentTerms: parseInt(v.defaultPaymentTerms, 10),
        });
        if (result && 'data' in result) {
          toast.success('Invoice defaults saved successfully');
          router.push('/settings');
        } else {
          toast.error('Failed to save invoice defaults');
        }
      }}
      renderSections={(form) => (
        <>
          <SectionCard title="Bank Details" description="Your bank account details for invoices">
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="bankName" label="Bank Name">
                <Input {...form.register('bankName')} id="bankName" placeholder="e.g., State Bank of India" />
              </FormRow>
              <FormRow name="accountNumber" label="Account Number">
                <Input {...form.register('accountNumber')} id="accountNumber" placeholder="e.g., 1234567890" />
              </FormRow>
              <FormRow name="ifsc" label="IFSC Code">
                <Input {...form.register('ifsc')} id="ifsc" placeholder="e.g., SBIN0001234" />
              </FormRow>
              <FormRow name="branch" label="Branch">
                <Input {...form.register('branch')} id="branch" placeholder="e.g., MG Road Branch" />
              </FormRow>
              <FormRow name="accountHolderName" label="Account Holder Name">
                <Input {...form.register('accountHolderName')} id="accountHolderName" placeholder="e.g., TravelCRM Pvt Ltd" />
              </FormRow>
              <FormRow name="upiId" label="UPI ID">
                <Input {...form.register('upiId')} id="upiId" placeholder="e.g., company@upi" />
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="Invoice Defaults" description="Default values applied to new invoices" required>
            <div className="grid gap-ds-4 sm:grid-cols-3">
              <FormRow name="defaultCurrency" label="Default Currency" required>
                <Select value={form.watch('defaultCurrency')} onValueChange={(v) => form.setValue('defaultCurrency', v, { shouldDirty: true })}>
                  <SelectTrigger id="defaultCurrency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">INR - Indian Rupee</SelectItem>
                    <SelectItem value="USD">USD - US Dollar</SelectItem>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                    <SelectItem value="GBP">GBP - British Pound</SelectItem>
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow name="defaultTaxSystem" label="Default Tax System" required>
                <Select value={form.watch('defaultTaxSystem')} onValueChange={(v) => form.setValue('defaultTaxSystem', v, { shouldDirty: true })}>
                  <SelectTrigger id="defaultTaxSystem"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GST">GST</SelectItem>
                    <SelectItem value="VAT">VAT</SelectItem>
                    <SelectItem value="None">None</SelectItem>
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow name="defaultPaymentTerms" label="Payment Terms (days)" required>
                <Input
                  {...form.register('defaultPaymentTerms')}
                  id="defaultPaymentTerms"
                  type="number"
                  min="0"
                  placeholder="30"
                />
              </FormRow>
              <FormRow name="defaultNotes" label="Default Notes" wide>
                <Textarea {...form.register('defaultNotes')} id="defaultNotes" rows={3} placeholder="Notes that appear on every invoice by default..." />
              </FormRow>
              <FormRow name="defaultTerms" label="Default Terms & Conditions" wide>
                <Textarea {...form.register('defaultTerms')} id="defaultTerms" rows={4} placeholder="Terms & conditions that appear on every invoice by default..." />
              </FormRow>
            </div>
          </SectionCard>
        </>
      )}
    />
  );
}
