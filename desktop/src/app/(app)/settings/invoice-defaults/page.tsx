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
import { settingsApi, type TaxSystem } from '@/lib/api/settings';
import { useApiQuery } from '@/hooks/use-api';
import { PageContainer } from '@/components/layout/page-container';

const schema = z.object({
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  ifsc: z.string().optional(),
  branch: z.string().optional(),
  accountHolderName: z.string().optional(),
  upiId: z.string().optional(),
  gstin: z.string().optional(),
  companyState: z.string().optional(),
  country: z.string().optional(),
  vatRate: z.string().refine((v) => v === '' || (Number(v) >= 0 && Number(v) <= 100), 'Enter a rate between 0 and 100'),
  salesTaxRate: z.string().refine((v) => v === '' || (Number(v) >= 0 && Number(v) <= 100), 'Enter a rate between 0 and 100'),
  sellerTaxId: z.string().max(50).optional(),
  taxLabel: z.string().max(30).optional(),
  taxSystem: z.enum(['gst', 'vat', 'sales_tax', 'none']),
  defaultTaxRate: z.string().refine((v) => v !== '' && Number(v) >= 0 && Number(v) <= 100, 'Enter a rate between 0 and 100'),
  defaultDueDays: z.string().refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 365, 'Enter 1–365 days'),
  defaultPaymentTerms: z.string().optional(),
});
type InvoiceDefaultsForm = z.infer<typeof schema>;

export default function InvoiceDefaultsPage() {
  const router = useRouter();
  const { data: response, loading } = useApiQuery(() => settingsApi.invoiceDefaults.get(), []);

  const d = React.useMemo(() => {
    if (!response || !('data' in response)) return null;
    return response.data ?? null;
  }, [response]);

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
    <EntityForm<InvoiceDefaultsForm>
      title="Invoice Defaults"
      description="Bank details, tax and payment defaults applied to new invoices."
      schema={schema}
      defaultValues={{
        bankName: d?.bankName ?? '',
        accountNumber: d?.accountNumber ?? '',
        ifsc: d?.ifsc ?? '',
        branch: d?.branch ?? '',
        accountHolderName: d?.accountHolderName ?? '',
        upiId: d?.upiId ?? '',
        gstin: d?.gstin ?? '',
        companyState: d?.companyState ?? '',
        country: d?.country ?? '',
        vatRate: d?.vatRate != null ? String(d.vatRate) : '',
        salesTaxRate: d?.salesTaxRate != null ? String(d.salesTaxRate) : '',
        sellerTaxId: d?.sellerTaxId ?? '',
        taxLabel: d?.taxLabel ?? '',
        taxSystem: d?.taxSystem ?? 'gst',
        defaultTaxRate: String(d?.defaultTaxRate ?? 18),
        defaultDueDays: String(d?.defaultDueDays ?? 30),
        defaultPaymentTerms: d?.defaultPaymentTerms ?? '',
      }}
      onCancel={() => router.push('/settings')}
      onSubmit={async (v) => {
        try {
          await settingsApi.invoiceDefaults.update({
            bankName: v.bankName ?? '',
            accountNumber: v.accountNumber ?? '',
            ifsc: v.ifsc ?? '',
            branch: v.branch ?? '',
            accountHolderName: v.accountHolderName ?? '',
            upiId: v.upiId ?? '',
            gstin: v.gstin ?? '',
            companyState: v.companyState ?? '',
            country: v.country ?? '',
            vatRate: v.vatRate !== '' ? Number(v.vatRate) : null,
            salesTaxRate: v.salesTaxRate !== '' ? Number(v.salesTaxRate) : null,
            sellerTaxId: v.sellerTaxId ?? '',
            taxLabel: v.taxLabel ?? '',
            taxSystem: v.taxSystem as TaxSystem,
            defaultTaxRate: Number(v.defaultTaxRate),
            defaultDueDays: Number(v.defaultDueDays),
            defaultPaymentTerms: v.defaultPaymentTerms ?? '',
          });
        } catch (e) {
          toast.error(e instanceof Error && e.message && !e.message.startsWith('HTTP') ? e.message : (e as { message?: string } | null)?.message || 'Failed to save invoice defaults');
          return;
        }
        toast.success('Invoice defaults saved successfully');
        router.push('/settings');
      }}
      renderSections={(form) => {
        const taxSystem = form.watch('taxSystem');
        return (
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

          <SectionCard title="Tax" description="Registration and default tax applied to new invoices" required>
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="taxSystem" label="Tax System" required>
                <Select value={form.watch('taxSystem')} onValueChange={(v) => form.setValue('taxSystem', v as TaxSystem, { shouldDirty: true })}>
                  <SelectTrigger id="taxSystem"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gst">GST</SelectItem>
                    <SelectItem value="vat">VAT</SelectItem>
                    <SelectItem value="sales_tax">Sales Tax</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow name="country" label="Country" hint="Your business country. A buyer in another country gets an export (GST) or reverse-charge (VAT) invoice.">
                <Input {...form.register('country')} id="country" placeholder="e.g., India, United Kingdom, AE" />
              </FormRow>
              <FormRow name="defaultTaxRate" label="Default Tax Rate (%)" required>
                <Input {...form.register('defaultTaxRate')} id="defaultTaxRate" type="number" min="0" max="100" step="0.01" placeholder="18" />
              </FormRow>
              {taxSystem === 'gst' && (
                <>
                  <FormRow name="gstin" label="GSTIN">
                    <Input {...form.register('gstin')} id="gstin" placeholder="22AAAAA0000A1Z5" />
                  </FormRow>
                  <FormRow name="companyState" label="Company State" hint="Used to decide between CGST/SGST and IGST.">
                    <Input {...form.register('companyState')} id="companyState" placeholder="e.g., Karnataka" />
                  </FormRow>
                </>
              )}
              {taxSystem === 'vat' && (
                <>
                  <FormRow name="vatRate" label="VAT Rate (%)" hint="Leave blank to use the standard rate for UK (20), UAE (5), Saudi Arabia (15) or Germany (19). Confirm it with your accountant.">
                    <Input {...form.register('vatRate')} id="vatRate" type="number" min="0" max="100" step="0.01" placeholder="e.g., 20" />
                  </FormRow>
                  <FormRow name="sellerTaxId" label="VAT Number">
                    <Input {...form.register('sellerTaxId')} id="sellerTaxId" placeholder="e.g., GB123456789" />
                  </FormRow>
                  <FormRow name="taxLabel" label="Tax Name on Invoices" hint="Optional, for example GST instead of VAT.">
                    <Input {...form.register('taxLabel')} id="taxLabel" placeholder="VAT" />
                  </FormRow>
                </>
              )}
              {taxSystem === 'sales_tax' && (
                <>
                  <FormRow name="salesTaxRate" label="Sales Tax Rate (%)" required hint="One combined state and local rate, for example 8.875.">
                    <Input {...form.register('salesTaxRate')} id="salesTaxRate" type="number" min="0" max="100" step="0.001" placeholder="e.g., 8.875" />
                  </FormRow>
                  <FormRow name="sellerTaxId" label="Tax ID">
                    <Input {...form.register('sellerTaxId')} id="sellerTaxId" placeholder="e.g., seller permit number" />
                  </FormRow>
                  <FormRow name="companyState" label="Company State">
                    <Input {...form.register('companyState')} id="companyState" placeholder="e.g., New York" />
                  </FormRow>
                </>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Payment" description="Default due date and terms for new invoices" required>
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="defaultDueDays" label="Payment Due (days)" required>
                <Input {...form.register('defaultDueDays')} id="defaultDueDays" type="number" min="1" max="365" placeholder="30" />
              </FormRow>
              <FormRow name="defaultPaymentTerms" label="Payment Terms" wide>
                <Textarea {...form.register('defaultPaymentTerms')} id="defaultPaymentTerms" rows={3} placeholder="Terms that appear on every invoice by default..." />
              </FormRow>
            </div>
          </SectionCard>
        </>
        );
      }}
    />
  );
}
