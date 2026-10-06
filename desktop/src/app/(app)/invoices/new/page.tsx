'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import {
  Textarea, SectionCard, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  CurrencyInput, DatePicker, Separator,
} from '@/components/ui';
import { invoicesApi, type InvoiceLineItem, type CreateInvoiceRequest } from '@/lib/api/invoices';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { toLocalDateString } from '@/lib/dates';
import {
  GST_RATES, LineItemsEditor, fetchContactOptions, fetchLeadOptions, newLineItem, resolveContact, resolveLead,
  type LineItem,
} from '../_form-shared';

let lineIdCounter = 1;

const schema = z.object({
  contactId: z.string().min(1, 'Please select a contact'),
  leadId: z.string().optional(),
  invoiceType: z.enum(['tax_invoice', 'proforma']),
  issueDate: z.date(),
  dueDate: z.date().optional(),
  currency: z.string(),
  discountType: z.enum(['percentage', 'fixed']),
  discountValue: z.number().optional(),
  gstRate: z.string(),
  notes: z.string().optional(),
  termsAndConditions: z.string().optional(),
});
type InvoiceFormValues = z.infer<typeof schema>;

export default function NewInvoicePage() {
  const router = useRouter();
  const [lineItems, setLineItems] = React.useState<LineItem[]>([newLineItem(lineIdCounter++)]);
  const [priceErrors, setPriceErrors] = React.useState<Set<number>>(new Set());

  function updateLineItem(id: number, field: keyof LineItem, value: string | number | undefined) {
    setLineItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
    if (field === 'unitPrice' && Number(value) > 0) {
      setPriceErrors((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }
  function addLineItem() {
    setLineItems((prev) => [...prev, newLineItem(lineIdCounter++)]);
  }
  function removeLineItem(id: number) {
    setLineItems((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  return (
    <EntityForm<InvoiceFormValues>
      title="New invoice"
      description="Create a new invoice for a client"
      schema={schema}
      defaultValues={{
        contactId: '',
        leadId: '',
        invoiceType: 'tax_invoice',
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 86400000),
        currency: 'INR',
        discountType: 'percentage',
        discountValue: undefined,
        gstRate: '18',
        notes: '',
        termsAndConditions: 'Payment due within 30 days of invoice date.\nCancellation charges apply as per company policy.\nGST applicable as per Government regulations.',
      }}
      prefillFromParams={{ contactId: 'contactId', leadId: 'leadId' }}
      onCancel={() => router.back()}
      onSubmit={async (v) => {
        if (lineItems.every((item) => !item.description.trim())) {
          toast.error('At least one line item with description is required');
          return;
        }
        const badPrice = lineItems.filter((item) => item.description.trim() && !(item.unitPrice > 0));
        if (badPrice.length > 0) {
          setPriceErrors(new Set(badPrice.map((item) => item.id)));
          throw new Error('Unit price must be greater than 0');
        }

        const apiLineItems: InvoiceLineItem[] = lineItems
          .filter((item) => item.description.trim())
          .map((item) => ({
            description: item.description,
            hsnCode: item.hsnCode || undefined,
            quantity: item.quantity,
            rate: item.unitPrice,
            taxRate: parseFloat(v.gstRate) || 0,
          }));

        const request: CreateInvoiceRequest = {
          contactId: v.contactId,
          leadId: v.leadId || undefined,
          type: v.invoiceType,
          items: apiLineItems,
          discountType: v.discountType,
          discountValue: v.discountValue && v.discountValue > 0 ? v.discountValue : undefined,
          dueDate: v.dueDate ? toLocalDateString(v.dueDate) : undefined,
          notes: v.notes || undefined,
          currency: v.currency,
        };

        const result = await invoicesApi.create(request);
        if (result) {
          toast.success('Invoice created successfully');
          router.push('/invoices');
        } else {
          toast.error('Failed to create invoice');
        }
      }}
      renderSections={(form) => {
        const currency = form.watch('currency');
        const discountType = form.watch('discountType');
        const discountValue = form.watch('discountValue') ?? 0;
        const gstRate = form.watch('gstRate');
        const discountAmount = discountType === 'percentage' ? subtotal * discountValue / 100 : discountValue;
        const taxableAmount = subtotal - discountAmount;
        const gstAmount = taxableAmount * (parseFloat(gstRate) || 0) / 100;
        const totalAmount = taxableAmount + gstAmount;

        return (
          <>
            <SectionCard title="Invoice Type">
              <div className="flex gap-ds-4">
                {[
                  { value: 'tax_invoice', label: 'Tax Invoice' },
                  { value: 'proforma', label: 'Proforma Invoice' },
                ].map((type) => (
                  <label key={type.value} className="flex items-center gap-ds-2 cursor-pointer">
                    <input
                      type="radio"
                      name="invoiceType"
                      value={type.value}
                      checked={form.watch('invoiceType') === type.value}
                      onChange={() => form.setValue('invoiceType', type.value as 'tax_invoice' | 'proforma', { shouldDirty: true })}
                    />
                    <span className="text-sm font-medium">{type.label}</span>
                  </label>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Client Details" required>
              <div className="grid gap-ds-4 sm:grid-cols-2">
                <FormRow name="contactId" label="Contact" required>
                  <RelationCombobox
                    value={form.watch('contactId') || null}
                    onChange={(id) => form.setValue('contactId', id ?? '', { shouldDirty: true, shouldValidate: true })}
                    fetcher={fetchContactOptions}
                    getOptionId={(c) => c.id}
                    getOptionLabel={(c) => c.name}
                    getOptionDescription={(c) => c.email ?? undefined}
                    resolveSelected={resolveContact}
                    placeholder="Search contacts..."
                    searchPlaceholder="Type to search contacts..."
                    required
                    error={form.formState.errors.contactId?.message}
                  />
                </FormRow>
                <FormRow name="leadId" label="Lead / Trip Reference">
                  <RelationCombobox
                    value={form.watch('leadId') || null}
                    onChange={(id) => form.setValue('leadId', id ?? '', { shouldDirty: true })}
                    fetcher={fetchLeadOptions}
                    getOptionId={(l) => l.id}
                    getOptionLabel={(l) => l.title ?? l.id}
                    resolveSelected={resolveLead}
                    placeholder="Search leads..."
                    searchPlaceholder="Type to search leads..."
                  />
                </FormRow>
                <FormRow name="issueDate" label="Issue Date">
                  <DatePicker value={form.watch('issueDate')} onChange={(d) => form.setValue('issueDate', d as Date, { shouldDirty: true })} />
                </FormRow>
                <FormRow name="dueDate" label="Due Date">
                  <DatePicker value={form.watch('dueDate')} onChange={(d) => form.setValue('dueDate', d, { shouldDirty: true })} minDate={form.watch('issueDate')} />
                </FormRow>
                <FormRow name="currency" label="Currency">
                  <Select value={currency} onValueChange={(v) => form.setValue('currency', v, { shouldDirty: true })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INR">INR ({'₹'})</SelectItem>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="EUR">EUR ({'€'})</SelectItem>
                      <SelectItem value="GBP">GBP ({'£'})</SelectItem>
                      <SelectItem value="AED">AED ({'د.إ'})</SelectItem>
                      <SelectItem value="THB">THB ({'฿'})</SelectItem>
                    </SelectContent>
                  </Select>
                </FormRow>
              </div>
            </SectionCard>

            <SectionCard title="Line Items" required>
              <div className="flex flex-col gap-ds-3">
                <LineItemsEditor
                  items={lineItems}
                  currency={currency}
                  priceErrors={priceErrors}
                  onChange={updateLineItem}
                  onAdd={addLineItem}
                  onRemove={removeLineItem}
                />

                <Separator className="my-ds-2" />

                <div className="flex flex-col gap-ds-2 max-w-sm ml-auto w-full">
                  <div className="flex justify-between text-sm">
                    <span className="text-ds-foreground-muted">Subtotal</span>
                    <span className="font-medium">{formatCurrency(subtotal, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-ds-2">
                    <span className="text-sm text-ds-foreground-muted shrink-0">Discount</span>
                    <div className="flex items-center gap-ds-1">
                      <Select value={discountType} onValueChange={(v) => form.setValue('discountType', v as 'percentage' | 'fixed', { shouldDirty: true })}>
                        <SelectTrigger className="w-20 h-8 text-xs" aria-label="Discount type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">%</SelectItem>
                          <SelectItem value="fixed">{'₹'}</SelectItem>
                        </SelectContent>
                      </Select>
                      <CurrencyInput
                        value={form.watch('discountValue')}
                        onChange={(v) => form.setValue('discountValue', v, { shouldDirty: true })}
                        currency={currency}
                        aria-label="Discount value"
                      />
                    </div>
                    <span className="text-sm font-medium w-24 text-right">-{formatCurrency(discountAmount, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-ds-2">
                    <span className="text-sm text-ds-foreground-muted shrink-0">GST</span>
                    <Select value={gstRate} onValueChange={(v) => form.setValue('gstRate', v, { shouldDirty: true })}>
                      <SelectTrigger className="w-20 h-8 text-xs" aria-label="GST rate"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {GST_RATES.map((rate) => (
                          <SelectItem key={rate} value={rate}>{rate}%</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-sm font-medium w-24 text-right">+{formatCurrency(gstAmount, currency)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-base">
                    <span className="font-semibold">Total</span>
                    <span className="font-bold text-lg">{formatCurrency(totalAmount, currency)}</span>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Notes & Terms">
              <div className="grid gap-ds-4 sm:grid-cols-2">
                <FormRow name="notes" label="Notes">
                  <Textarea placeholder="Any notes for the client..." rows={4} {...form.register('notes')} />
                </FormRow>
                <FormRow name="termsAndConditions" label="Terms & Conditions">
                  <Textarea rows={4} {...form.register('termsAndConditions')} />
                </FormRow>
              </div>
            </SectionCard>
          </>
        );
      }}
    />
  );
}
