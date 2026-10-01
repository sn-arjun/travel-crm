'use client';

import * as React from 'react';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import { CurrencyInput, DatePicker, Input, SectionCard, Switch, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { toast } from 'sonner';
import { paymentsApi, type CreatePaymentRequest } from '@/lib/api/payments';
import { invoicesApi } from '@/lib/api/invoices';
import { leadsApi } from '@/lib/api/leads';

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

const schema = z.object({
  amount: z.number({ message: 'Amount is required' }).positive('Amount must be greater than zero'),
  paymentDate: z.date({ message: 'Payment date is required' }),
  paymentMethod: z.string().min(1),
  reference: z.string().optional(),
  notes: z.string().optional(),
  invoiceId: z.string().optional(),
  isAdvance: z.boolean(),
  leadId: z.string().optional(),
}).refine((v) => v.isAdvance || !!v.invoiceId, {
  message: 'Please select an invoice to record payment against',
  path: ['invoiceId'],
});

type PaymentForm = z.infer<typeof schema>;

/**
 * When the invoice id arrives via ?invoiceId= (or any path other than the
 * combobox), load the invoice so the summary card and default amount appear.
 */
function InvoicePrefill({
  invoiceId,
  loaded,
  onLoaded,
}: {
  invoiceId: string;
  loaded: boolean;
  onLoaded: (invoice: any) => void;
}) {
  React.useEffect(() => {
    if (!invoiceId || loaded) return;
    let cancelled = false;
    invoicesApi.getById(invoiceId).then((res) => {
      if (!cancelled && res?.data) onLoaded(res.data);
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId, loaded]);
  return null;
}

export default function NewPaymentPage() {
  const router = useRouter();
  const [selectedInvoice, setSelectedInvoice] = React.useState<any>(null);

  return (
    <EntityForm<PaymentForm>
      title="Record payment"
      description="Add a new payment to the system"
      schema={schema}
      defaultValues={{
        amount: undefined as unknown as number,
        paymentDate: new Date(),
        paymentMethod: 'bank_transfer',
        reference: '',
        notes: '',
        invoiceId: '',
        isAdvance: false,
        leadId: '',
      }}
      prefillFromParams={{ invoiceId: 'invoiceId', leadId: 'leadId' }}
      onCancel={() => router.back()}
      onSubmit={async (v) => {
        if (selectedInvoice && !v.isAdvance) {
          const balanceDue = selectedInvoice.balanceDue ?? selectedInvoice.balance_due ?? 0;
          if (balanceDue > 0 && v.amount > balanceDue) {
            toast.error(`Amount (${formatCurrency(v.amount)}) exceeds invoice balance due (${formatCurrency(balanceDue)})`);
            throw new Error('amount exceeds balance');
          }
        }
        const payload: CreatePaymentRequest = {
          invoiceId: v.invoiceId || '',
          amount: v.amount,
          method: v.paymentMethod,
          date: [
            v.paymentDate.getFullYear(),
            String(v.paymentDate.getMonth() + 1).padStart(2, '0'),
            String(v.paymentDate.getDate()).padStart(2, '0'),
          ].join('-'),
          reference: v.reference || undefined,
          notes: v.notes || undefined,
          isAdvance: v.isAdvance || undefined,
          leadId: v.leadId || undefined,
        };
        await paymentsApi.create(payload);
        toast.success('Payment recorded successfully');
        router.push('/payments');
      }}
      renderSections={(form) => (
        <>
          <SectionCard title="Payment details" required>
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="amount" label="Amount" required hint={selectedInvoice && (selectedInvoice.balanceDue ?? selectedInvoice.balance_due ?? 0) > 0
                ? `Invoice balance due: ${formatCurrency(selectedInvoice.balanceDue ?? selectedInvoice.balance_due ?? 0)}`
                : undefined}>
                <CurrencyInput
                  value={form.watch('amount')}
                  onChange={(v) => form.setValue('amount', v as number, { shouldDirty: true, shouldValidate: true })}
                  currency="INR"
                />
              </FormRow>
              <FormRow name="paymentDate" label="Payment date" required>
                <DatePicker
                  value={form.watch('paymentDate')}
                  onChange={(d) => form.setValue('paymentDate', d as Date, { shouldDirty: true, shouldValidate: true })}
                />
              </FormRow>
              <FormRow name="paymentMethod" label="Payment method" required>
                <Select value={form.watch('paymentMethod')} onValueChange={(v) => form.setValue('paymentMethod', v, { shouldDirty: true })}>
                  <SelectTrigger id="paymentMethod"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="check">Cheque</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow name="reference" label="Reference number" hint="e.g., Cheque #123, UTR #456">
                <Input id="reference" {...form.register('reference')} />
              </FormRow>
            </div>
            <div className="flex items-center justify-between rounded-ds-lg border border-ds-border p-ds-3 mt-ds-4">
              <div>
                <p className="text-sm font-medium">Advance payment</p>
                <p className="text-xs text-ds-foreground-muted">Mark this as an advance payment (before invoicing)</p>
              </div>
              <Switch
                checked={form.watch('isAdvance')}
                onCheckedChange={(checked) => {
                  form.setValue('isAdvance', checked, { shouldDirty: true, shouldValidate: true });
                  if (checked) {
                    form.setValue('invoiceId', '', { shouldDirty: true });
                    setSelectedInvoice(null);
                  }
                }}
              />
            </div>
          </SectionCard>

          {form.watch('isAdvance') ? (
            <SectionCard title="Lead reference" description="Link this advance payment to a lead for tracking before an invoice is created.">
              <FormRow name="leadId" label="Lead">
                <RelationCombobox
                  value={form.watch('leadId') || null}
                  onChange={(id) => form.setValue('leadId', id ?? '', { shouldDirty: true })}
                  fetcher={async (q, page) => {
                    // client.get resolves to the response body: { data: rows[], pagination }
                    const r = (await leadsApi.list({ search: q, page, limit: 20 })) as unknown as { data: any[]; pagination?: { total: number } };
                    return { items: r.data ?? [], total: r.pagination?.total ?? r.data?.length ?? 0 };
                  }}
                  getOptionId={(l: any) => l.id}
                  getOptionLabel={(l: any) => l.title ?? l.id}
                  resolveSelected={async (id) => (await leadsApi.getById(id)).data}
                  placeholder="Search leads..."
                />
              </FormRow>
            </SectionCard>
          ) : (
            <SectionCard title="Link to invoice" required>
              <InvoicePrefill
                invoiceId={form.watch('invoiceId') || ''}
                loaded={!!selectedInvoice}
                onLoaded={(inv) => {
                  setSelectedInvoice(inv);
                  const balance = inv.balanceDue ?? inv.balance_due ?? 0;
                  if (balance > 0 && form.getValues('amount') === undefined) {
                    form.setValue('amount', balance, { shouldDirty: true, shouldValidate: true });
                  }
                }}
              />
              <FormRow name="invoiceId" label="Invoice" required>
                <RelationCombobox
                  value={form.watch('invoiceId') || null}
                  onChange={(id, item: any) => {
                    form.setValue('invoiceId', id ?? '', { shouldDirty: true, shouldValidate: true });
                    setSelectedInvoice(item ?? null);
                    if (item) {
                      const balance = item.balanceDue ?? item.balance_due ?? 0;
                      if (balance > 0) form.setValue('amount', balance, { shouldDirty: true, shouldValidate: true });
                    }
                  }}
                  fetcher={async (q, page) => {
                    const r = (await invoicesApi.list({ search: q, page, limit: 20 })) as unknown as { data: any[]; pagination?: { total: number } };
                    return { items: r.data ?? [], total: r.pagination?.total ?? r.data?.length ?? 0 };
                  }}
                  getOptionId={(inv: any) => inv.id}
                  getOptionLabel={(inv: any) => inv.invoiceNumber ?? inv.invoice_number ?? inv.id}
                  getOptionDescription={(inv: any) => formatCurrency(inv.totalAmount ?? inv.total ?? 0)}
                  resolveSelected={async (id) => (await invoicesApi.getById(id)).data}
                  placeholder="Search invoices..."
                  error={form.formState.errors.invoiceId?.message}
                />
              </FormRow>
              {selectedInvoice && (
                <div className="bg-ds-surface-sunken rounded-ds-md p-ds-3 text-sm flex flex-col gap-ds-1 mt-ds-2">
                  <div className="flex justify-between">
                    <span className="text-ds-foreground-muted">Invoice total</span>
                    <span className="font-medium">{formatCurrency(selectedInvoice.totalAmount ?? selectedInvoice.total ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ds-foreground-muted">Paid</span>
                    <span className="font-medium text-ds-success">{formatCurrency(selectedInvoice.paidAmount ?? selectedInvoice.paid_amount ?? 0)}</span>
                  </div>
                  <div className="flex justify-between border-t border-ds-border pt-ds-1">
                    <span className="font-semibold">Balance due</span>
                    <span className="font-bold text-ds-warning">{formatCurrency(selectedInvoice.balanceDue ?? selectedInvoice.balance_due ?? 0)}</span>
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          <SectionCard title="Notes">
            <Textarea
              placeholder="Any additional notes about this payment..."
              {...form.register('notes')}
              rows={4}
            />
          </SectionCard>
        </>
      )}
    />
  );
}
