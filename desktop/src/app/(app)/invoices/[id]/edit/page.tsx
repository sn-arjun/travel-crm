'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { z } from 'zod';
import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import {
  Textarea, SectionCard, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  CurrencyInput, DatePicker, Separator, Button, Skeleton, EmptyState,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/use-api';
import { invoicesApi, type InvoiceLineItem, type UpdateInvoiceRequest } from '@/lib/api/invoices';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { parseLocalDate, toLocalDateString } from '@/lib/dates';
import {
  LineItemsEditor, TaxAndTotal, fetchContactOptions, newLineItem, resolveContact, type LineItem,
} from '../../_form-shared';

let lineIdCounter = 1000;

const schema = z.object({
  contactId: z.string().min(1, 'Please select a contact'),
  issueDate: z.date(),
  dueDate: z.date().optional(),
  discountType: z.enum(['percentage', 'fixed']),
  discountValue: z.number().optional(),
  gstRate: z.string(),
  notes: z.string().optional(),
  termsAndConditions: z.string().optional(),
});
type InvoiceFormValues = z.infer<typeof schema>;

export default function EditInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;

  const [lineItems, setLineItems] = React.useState<LineItem[]>([]);
  const [currency, setCurrency] = React.useState('INR');
  const [initialized, setInitialized] = React.useState(false);
  const [defaultValues, setDefaultValues] = React.useState<InvoiceFormValues | null>(null);
  const [priceErrors, setPriceErrors] = React.useState<Set<number>>(new Set());

  const { data: invoice, loading, error } = useApiQuery(() => invoicesApi.getDetail(invoiceId), [invoiceId]);

  React.useEffect(() => {
    if (!invoice || initialized) return;

    const items: LineItem[] = invoice.items.length > 0
      ? invoice.items.map((item) => ({
          id: lineIdCounter++,
          description: item.description,
          hsnCode: item.hsnCode ?? '',
          quantity: item.quantity || 1,
          unitPrice: item.rate,
        }))
      : [newLineItem(lineIdCounter++)];
    setLineItems(items);
    setCurrency(invoice.currency || 'INR');

    setDefaultValues({
      contactId: invoice.contactId,
      issueDate: invoice.issueDate ? parseLocalDate(invoice.issueDate) : new Date(),
      dueDate: invoice.dueDate ? parseLocalDate(invoice.dueDate) : undefined,
      discountType: invoice.discountType ?? 'percentage',
      discountValue: invoice.discountValue > 0 ? invoice.discountValue : undefined,
      gstRate: String(invoice.items[0]?.taxRate ?? 18),
      notes: invoice.notes ?? '',
      termsAndConditions: invoice.terms ?? '',
    });

    setInitialized(true);
  }, [invoice, initialized]);

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

  const invoiceStatus = invoice?.status ?? 'draft';
  const isEditable = invoiceStatus === 'draft';

  if (loading || (invoice && !defaultValues)) {
    return (
      <div className="flex flex-col gap-ds-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !invoice || !defaultValues) {
    return (
      <EmptyState
        title="Invoice not found"
        description="This invoice may have been removed."
        action={<Button variant="outline" onClick={() => router.push('/invoices')}>Back to invoices</Button>}
      />
    );
  }

  if (!isEditable) {
    return (
      <EmptyState
        title="Invoice cannot be edited"
        description={`Only invoices with "Draft" status can be edited. This invoice is currently "${invoiceStatus.replace('_', ' ')}".`}
        action={<Button variant="outline" onClick={() => router.push(`/invoices/${invoiceId}`)}>Back to invoice</Button>}
      />
    );
  }

  return (
    <EntityForm<InvoiceFormValues>
      title={`Edit Invoice ${invoice.invoiceNumber}`}
      description="Modify draft invoice details"
      schema={schema}
      defaultValues={defaultValues}
      onCancel={() => router.push(`/invoices/${invoiceId}`)}
      submitLabel="Save changes"
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
          }));

        const request: UpdateInvoiceRequest = {
          issueDate: v.issueDate ? toLocalDateString(v.issueDate) : undefined,
          dueDate: v.dueDate ? toLocalDateString(v.dueDate) : undefined,
          terms: v.termsAndConditions?.trim() ?? "",
          items: apiLineItems,
          discountType: v.discountType,
          discountValue: v.discountValue && v.discountValue > 0 ? v.discountValue : 0,
          notes: v.notes || undefined,
          gstRate: parseFloat(v.gstRate) || 0,
        };

        const result = await invoicesApi.update(invoiceId, request);
        if (result) {
          toast.success('Invoice updated successfully');
          router.push(`/invoices/${invoiceId}`);
        } else {
          toast.error('Failed to update invoice');
        }
      }}
      renderSections={(form) => {
        const discountType = form.watch('discountType');
        const discountValue = form.watch('discountValue') ?? 0;
        const gstRate = form.watch('gstRate');
        const discountAmount = discountType === 'percentage' ? subtotal * discountValue / 100 : discountValue;

        return (
          <>
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
                    disabled
                    placeholder="Contact"
                    error={form.formState.errors.contactId?.message}
                  />
                </FormRow>
                <FormRow name="issueDate" label="Issue Date">
                  <DatePicker value={form.watch('issueDate')} onChange={(d) => form.setValue('issueDate', d as Date, { shouldDirty: true })} />
                </FormRow>
                <FormRow name="dueDate" label="Due Date">
                  <DatePicker value={form.watch('dueDate')} onChange={(d) => form.setValue('dueDate', d, { shouldDirty: true })} minDate={form.watch('issueDate')} />
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
                  <TaxAndTotal
                    contactId={form.watch('contactId')}
                    invoiceId={invoiceId}
                    items={lineItems}
                    discountType={discountType}
                    discountValue={discountValue}
                    gstRate={gstRate}
                    currency={currency}
                    baseTotal={subtotal - discountAmount}
                    onGstRateChange={(r) => form.setValue('gstRate', r, { shouldDirty: true })}
                  />
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
