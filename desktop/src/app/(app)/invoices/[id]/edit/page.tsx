'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import {
  Input, Textarea, SectionCard, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  DatePicker, Separator, Button, Skeleton, EmptyState,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/use-api';
import { invoicesApi, type InvoiceLineItem, type UpdateInvoiceRequest } from '@/lib/api/invoices';
import { contactsApi } from '@/lib/api/contacts';
import { toast } from 'sonner';
import { parseLocalDate, toLocalDateString } from '@/lib/dates';

interface LineItem {
  id: number;
  description: string;
  quantity: number;
  unitPrice: number;
}

let lineIdCounter = 1000;

function formatCurrency(amount: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

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

  const { data: invoiceResponse, loading, error } = useApiQuery<any>(
    () => invoicesApi.getById(invoiceId),
    [invoiceId],
  );

  React.useEffect(() => {
    if (!invoiceResponse?.data || initialized) return;
    const raw = invoiceResponse.data as any;

    const existingItems: any[] = raw.items ?? [];
    const items: LineItem[] = existingItems.length > 0
      ? existingItems.map((item: any) => ({
          id: lineIdCounter++,
          description: item.description ?? '',
          quantity: item.quantity ?? 1,
          unitPrice: item.rate ?? item.unitPrice ?? item.unit_price ?? 0,
        }))
      : [{ id: lineIdCounter++, description: '', quantity: 1, unitPrice: 0 }];
    setLineItems(items);
    setCurrency(raw.currency || 'INR');

    setDefaultValues({
      contactId: raw.contactId || raw.contact_id || '',
      issueDate: raw.issueDate || raw.issue_date ? parseLocalDate(raw.issueDate || raw.issue_date) : new Date(),
      dueDate: raw.dueDate || raw.due_date ? parseLocalDate(raw.dueDate || raw.due_date) : undefined,
      discountType: raw.discountType || raw.discount_type || 'percentage',
      discountValue: raw.discountValue || raw.discount_value ? Number(raw.discountValue || raw.discount_value) : undefined,
      gstRate: String(existingItems[0]?.taxRate ?? existingItems[0]?.tax_rate ?? 18),
      notes: raw.notes || '',
      termsAndConditions: raw.terms || raw.termsAndConditions || '',
    });

    setInitialized(true);
  }, [invoiceResponse, initialized]);

  function updateLineItem(id: number, field: keyof LineItem, value: string | number) {
    setLineItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  }
  function addLineItem() {
    setLineItems((prev) => [...prev, { id: lineIdCounter++, description: '', quantity: 1, unitPrice: 0 }]);
  }
  function removeLineItem(id: number) {
    setLineItems((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const rawInv = invoiceResponse?.data as any;
  const invoiceStatus = rawInv?.status || 'draft';
  const isEditable = invoiceStatus === 'draft';

  if (loading || !defaultValues) {
    return (
      <div className="flex flex-col gap-ds-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !invoiceResponse?.data) {
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
      title={`Edit Invoice ${rawInv?.invoiceNumber || rawInv?.invoice_number || ''}`}
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
        const discountAmount = v.discountType === 'percentage'
          ? subtotal * (v.discountValue ?? 0) / 100
          : (v.discountValue ?? 0);

        const apiLineItems: InvoiceLineItem[] = lineItems
          .filter((item) => item.description.trim())
          .map((item) => ({
            description: item.description,
            quantity: item.quantity,
            rate: item.unitPrice,
            taxRate: parseFloat(v.gstRate) || 0,
          }));

        const request: UpdateInvoiceRequest = {
          issueDate: v.issueDate ? toLocalDateString(v.issueDate) : undefined,
          dueDate: v.dueDate ? toLocalDateString(v.dueDate) : undefined,
          items: apiLineItems,
          discount: discountAmount > 0 ? discountAmount : undefined,
          notes: v.notes || undefined,
          terms: v.termsAndConditions || undefined,
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
        const taxableAmount = subtotal - discountAmount;
        const gstAmount = taxableAmount * (parseFloat(gstRate) || 0) / 100;
        const totalAmount = taxableAmount + gstAmount;

        return (
          <>
            <SectionCard title="Client Details" required>
              <div className="grid gap-ds-4 sm:grid-cols-2">
                <FormRow name="contactId" label="Contact" required>
                  <RelationCombobox
                    value={form.watch('contactId') || null}
                    onChange={(id) => form.setValue('contactId', id ?? '', { shouldDirty: true, shouldValidate: true })}
                    fetcher={async (q, page) => {
                      const r = await contactsApi.list({ search: q, page, limit: 20 });
                      const data = r.data as any;
                      const items = Array.isArray(data) ? data : (data?.data ?? []);
                      const total = data?.pagination?.total ?? items.length;
                      return { items, total };
                    }}
                    getOptionId={(c: any) => c.id}
                    getOptionLabel={(c: any) => c.name || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()}
                    getOptionDescription={(c: any) => c.email ?? undefined}
                    resolveSelected={async (id) => (await contactsApi.getById(id)).data as any}
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
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ds-foreground-muted">At least one item with a description is required</span>
                  <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                    <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />Add Item
                  </Button>
                </div>
                <div className="grid grid-cols-[1fr_80px_120px_120px_32px] gap-ds-2 text-xs font-medium text-ds-foreground-muted px-ds-1">
                  <span>Description</span>
                  <span>Qty</span>
                  <span>Unit Price</span>
                  <span>Amount</span>
                  <span />
                </div>
                {lineItems.map((item) => (
                  <div key={item.id} className="grid grid-cols-[1fr_80px_120px_120px_32px] gap-ds-2 items-center">
                    <Input placeholder="e.g., Flight tickets, Hotel booking..." value={item.description} onChange={(e) => updateLineItem(item.id, 'description', e.target.value)} />
                    <Input type="number" min={1} value={item.quantity} onChange={(e) => updateLineItem(item.id, 'quantity', parseInt(e.target.value) || 1)} />
                    <Input type="number" min={0} value={item.unitPrice || ''} onChange={(e) => updateLineItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)} placeholder="0" />
                    <Input value={(item.quantity * item.unitPrice).toLocaleString('en-IN')} readOnly className="bg-ds-surface-sunken text-right font-medium" />
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeLineItem(item.id)} className="text-ds-foreground-muted hover:text-ds-danger">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                ))}

                <Separator className="my-ds-2" />

                <div className="flex flex-col gap-ds-2 max-w-sm ml-auto">
                  <div className="flex justify-between text-sm">
                    <span className="text-ds-foreground-muted">Subtotal</span>
                    <span className="font-medium">{formatCurrency(subtotal, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-ds-2">
                    <span className="text-sm text-ds-foreground-muted shrink-0">Discount</span>
                    <div className="flex items-center gap-ds-1">
                      <Select value={discountType} onValueChange={(v) => form.setValue('discountType', v as 'percentage' | 'fixed', { shouldDirty: true })}>
                        <SelectTrigger className="w-20 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">%</SelectItem>
                          <SelectItem value="fixed">{'₹'}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input className="w-20 h-8 text-sm" type="number" min={0} value={discountValue} onChange={(e) => form.setValue('discountValue', parseFloat(e.target.value) || 0, { shouldDirty: true })} placeholder="0" />
                    </div>
                    <span className="text-sm font-medium w-24 text-right">-{formatCurrency(discountAmount, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-ds-2">
                    <span className="text-sm text-ds-foreground-muted shrink-0">GST</span>
                    <Select value={gstRate} onValueChange={(v) => form.setValue('gstRate', v, { shouldDirty: true })}>
                      <SelectTrigger className="w-20 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0%</SelectItem>
                        <SelectItem value="5">5%</SelectItem>
                        <SelectItem value="12">12%</SelectItem>
                        <SelectItem value="18">18%</SelectItem>
                        <SelectItem value="28">28%</SelectItem>
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
