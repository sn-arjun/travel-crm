'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import {
  Input, Textarea, SectionCard, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Separator, Button,
} from '@/components/ui';
import { debitNotesApi, type CreateDebitNoteRequest } from '@/lib/api/credit-notes';
import { invoicesApi } from '@/lib/api/invoices';

interface LineItem {
  id: number;
  description: string;
  quantity: number;
  rate: number;
  taxRate: number;
}

let lineIdCounter = 1;

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

const schema = z.object({
  invoiceId: z.string().min(1, 'Please select an invoice'),
  reason: z.string().min(1, 'Reason is required'),
  notes: z.string().optional(),
});
type DebitNoteFormValues = z.infer<typeof schema>;

export default function NewDebitNotePage() {
  const router = useRouter();
  const [lineItems, setLineItems] = React.useState<LineItem[]>([
    { id: lineIdCounter++, description: '', quantity: 1, rate: 0, taxRate: 18 },
  ]);

  function updateLineItem(id: number, field: keyof LineItem, value: string | number) {
    setLineItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  }
  function addLineItem() {
    setLineItems((prev) => [...prev, { id: lineIdCounter++, description: '', quantity: 1, rate: 0, taxRate: 18 }]);
  }
  function removeLineItem(id: number) {
    setLineItems((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  const tax = lineItems.reduce((sum, item) => sum + item.quantity * item.rate * (item.taxRate / 100), 0);
  const total = subtotal + tax;

  return (
    <EntityForm<DebitNoteFormValues>
      title="New debit note"
      description="Issue a debit note against an invoice"
      schema={schema}
      defaultValues={{ invoiceId: '', reason: '', notes: '' }}
      prefillFromParams={{ invoiceId: 'invoiceId' }}
      onCancel={() => router.back()}
      onSubmit={async (v) => {
        if (lineItems.every((item) => !item.description.trim())) {
          toast.error('At least one line item with description is required');
          return;
        }
        const request: CreateDebitNoteRequest = {
          invoiceId: v.invoiceId,
          reason: v.reason,
          notes: v.notes || undefined,
          items: lineItems
            .filter((item) => item.description.trim())
            .map((item) => ({
              description: item.description,
              quantity: item.quantity,
              rate: item.rate,
              taxRate: item.taxRate,
            })),
        };
        const result = await debitNotesApi.create(request);
        if (result) {
          toast.success('Debit note created successfully');
          router.push('/debit-notes');
        } else {
          toast.error('Failed to create debit note');
        }
      }}
      renderSections={(form) => (
        <>
          <SectionCard title="Invoice" required>
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="invoiceId" label="Invoice" required wide>
                <RelationCombobox
                  value={form.watch('invoiceId') || null}
                  onChange={(id) => form.setValue('invoiceId', id ?? '', { shouldDirty: true, shouldValidate: true })}
                  fetcher={async (q, page) => {
                    const r: any = await invoicesApi.list({ search: q, page, limit: 20 });
                    const items = r.data.map((inv: any) => ({
                      ...inv,
                      invoiceNumber: inv.invoiceNumber ?? inv.invoice_number,
                      contactName: inv.contactName ?? inv.contact_name ?? inv.contact?.name,
                    }));
                    return { items, total: r.pagination?.total ?? items.length };
                  }}
                  getOptionId={(inv) => inv.id}
                  getOptionLabel={(inv) => inv.invoiceNumber}
                  getOptionDescription={(inv) => inv.contactName ?? undefined}
                  resolveSelected={async (id) => {
                    const inv: any = (await invoicesApi.getById(id)).data;
                    return { ...inv, invoiceNumber: inv.invoiceNumber ?? inv.invoice_number, contactName: inv.contactName ?? inv.contact_name ?? inv.contact?.name };
                  }}
                  placeholder="Select an invoice"
                  searchPlaceholder="Search invoices..."
                  required
                  error={form.formState.errors.invoiceId?.message}
                />
              </FormRow>
              <FormRow name="reason" label="Reason" required wide>
                <Input id="reason" placeholder="e.g., Additional charges, Rate correction..." {...form.register('reason')} />
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
              <div className="grid grid-cols-[1fr_80px_120px_100px_120px_32px] gap-ds-2 text-xs font-medium text-ds-foreground-muted px-ds-1">
                <span>Description</span>
                <span>Qty</span>
                <span>Rate</span>
                <span>Tax %</span>
                <span>Amount</span>
                <span />
              </div>
              {lineItems.map((item) => (
                <div key={item.id} className="grid grid-cols-[1fr_80px_120px_100px_120px_32px] gap-ds-2 items-center">
                  <Input placeholder="e.g., Flight tickets, Hotel booking..." value={item.description} onChange={(e) => updateLineItem(item.id, 'description', e.target.value)} />
                  <Input type="number" min={1} value={item.quantity} onChange={(e) => updateLineItem(item.id, 'quantity', parseInt(e.target.value) || 1)} />
                  <Input type="number" min={0} value={item.rate || ''} onChange={(e) => updateLineItem(item.id, 'rate', parseFloat(e.target.value) || 0)} placeholder="0" />
                  <Select value={String(item.taxRate)} onValueChange={(v) => updateLineItem(item.id, 'taxRate', parseFloat(v))}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0%</SelectItem>
                      <SelectItem value="5">5%</SelectItem>
                      <SelectItem value="12">12%</SelectItem>
                      <SelectItem value="18">18%</SelectItem>
                      <SelectItem value="28">28%</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input value={(item.quantity * item.rate).toLocaleString('en-IN')} readOnly className="bg-ds-surface-sunken text-right font-medium" />
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeLineItem(item.id)} className="text-ds-foreground-muted hover:text-ds-danger">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              ))}

              <Separator className="my-ds-2" />

              <div className="flex flex-col gap-ds-2 max-w-sm ml-auto">
                <div className="flex justify-between text-sm">
                  <span className="text-ds-foreground-muted">Subtotal</span>
                  <span className="font-medium">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-ds-foreground-muted">Tax</span>
                  <span className="font-medium">{formatCurrency(tax)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-base">
                  <span className="font-semibold">Total</span>
                  <span className="font-bold text-lg">{formatCurrency(total)}</span>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Notes">
            <FormRow name="notes" label="Notes" wide>
              <Textarea placeholder="Internal notes about this debit note..." rows={3} {...form.register('notes')} />
            </FormRow>
          </SectionCard>
        </>
      )}
    />
  );
}
