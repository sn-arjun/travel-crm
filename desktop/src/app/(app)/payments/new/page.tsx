'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Save, Search, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useApiMutation, useApiQuery } from '@/hooks/use-api';
import { paymentsApi, type CreatePaymentRequest } from '@/lib/api/payments';
import { invoicesApi } from '@/lib/api/invoices';
import { leadsApi } from '@/lib/api/leads';

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

export default function NewPaymentPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [showInvoiceSearch, setShowInvoiceSearch] = React.useState(false);
  const [invoiceSearch, setInvoiceSearch] = React.useState('');

  const [form, setForm] = React.useState({
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0] ?? '',
    paymentMethod: 'bank_transfer' as 'cash' | 'check' | 'card' | 'transfer' | 'other',
    reference: '',
    notes: '',
    invoiceId: '',
    isAdvance: false,
    leadId: '',
  });
  const [leadSearch, setLeadSearch] = React.useState('');
  const [showLeadSearch, setShowLeadSearch] = React.useState(false);

  const { data: invoicesResponse } = useApiQuery(
    () => invoicesApi.list({ limit: 50, search: invoiceSearch || undefined }),
    [invoiceSearch],
  );

  const { data: leadsResponse } = useApiQuery(
    () => leadsApi.list({ limit: 50, search: leadSearch || undefined }),
    [leadSearch],
  );

  const { mutate: createPayment } = useApiMutation(
    (data: CreatePaymentRequest) => paymentsApi.create(data),
  );

  function updateField(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function validateForm(): boolean {
    if (!form.amount || parseFloat(form.amount) <= 0) {
      toast.error('Payment amount must be greater than zero');
      return false;
    }
    if (!form.paymentDate) {
      toast.error('Payment date is required');
      return false;
    }
    if (!form.isAdvance && !form.invoiceId) {
      toast.error('Please select an invoice to record payment against');
      return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const createRequest: CreatePaymentRequest = {
        invoiceId: form.invoiceId || '',
        amount: parseFloat(form.amount),
        method: form.paymentMethod,
        date: form.paymentDate,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
        isAdvance: form.isAdvance || undefined,
        leadId: form.leadId || undefined,
      };

      const result = await createPayment(createRequest);
      if (result) {
        toast.success('Payment recorded successfully');
        router.push('/payments');
      } else {
        toast.error('Failed to record payment');
      }
    } catch (err) {
      toast.error('Error recording payment');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  const invoicesList = invoicesResponse?.data;
  const invoices = Array.isArray(invoicesList) ? invoicesList : (invoicesList?.data ?? []);

  const leadsList = leadsResponse?.data;
  const leads = Array.isArray(leadsList) ? leadsList : (leadsList?.data ?? []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Record Payment</h1>
            <p className="text-sm text-muted-foreground">Add a new payment to the system</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save Payment
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">
          {/* Payment Details */}
          <Card>
            <CardHeader><CardTitle className="text-base">Payment Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                    <Input
                      id="amount"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={form.amount}
                      onChange={(e) => updateField('amount', e.target.value)}
                      className="pl-7"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paymentDate">Payment Date <span className="text-destructive">*</span></Label>
                  <Input
                    id="paymentDate"
                    type="date"
                    value={form.paymentDate}
                    onChange={(e) => updateField('paymentDate', e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paymentMethod">Payment Method <span className="text-destructive">*</span></Label>
                  <Select value={form.paymentMethod} onValueChange={(v) => updateField('paymentMethod', v)}>
                    <SelectTrigger id="paymentMethod">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="check">Check</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="transfer">Bank Transfer</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reference">Reference Number</Label>
                  <Input
                    id="reference"
                    placeholder="e.g., Cheque #123, UTR #456"
                    value={form.reference}
                    onChange={(e) => updateField('reference', e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="isAdvance" className="text-sm font-medium">Advance Payment</Label>
                  <p className="text-xs text-muted-foreground">Mark this as an advance payment (before invoicing)</p>
                </div>
                <Switch
                  id="isAdvance"
                  checked={form.isAdvance}
                  onCheckedChange={(checked) => {
                    updateField('isAdvance', checked);
                    if (checked) updateField('invoiceId', '');
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Lead Reference (for advance payments) */}
          {form.isAdvance && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Lead Reference
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">Link this advance payment to a lead for tracking before an invoice is created.</p>
                <div className="space-y-2">
                  <Label htmlFor="leadId">Lead</Label>
                  <div className="relative">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search by lead title..."
                          value={leadSearch}
                          onChange={(e) => setLeadSearch(e.target.value)}
                          onFocus={() => setShowLeadSearch(true)}
                          className="pl-9"
                        />
                      </div>
                    </div>
                    {showLeadSearch && leadSearch && leads.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-950 border rounded-md shadow-lg z-10 max-h-64 overflow-auto">
                        {leads.slice(0, 10).map((lead: any) => (
                          <button
                            key={lead.id}
                            type="button"
                            onClick={() => {
                              updateField('leadId', lead.id);
                              setLeadSearch('');
                              setShowLeadSearch(false);
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-900 border-b last:border-b-0 flex justify-between items-center"
                          >
                            <span className="text-sm">{lead.title}</span>
                            <span className="text-xs text-muted-foreground">{lead.status}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {form.leadId && (
                    <div className="bg-slate-50 dark:bg-slate-900/30 rounded-md p-3 text-sm">
                      <p className="font-medium">Selected Lead</p>
                      <p className="text-muted-foreground text-xs mt-1">{form.leadId}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-6 text-xs"
                        onClick={() => updateField('leadId', '')}
                      >
                        Clear Selection
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Invoice Link */}
          {!form.isAdvance && <Card>
            <CardHeader><CardTitle className="text-base">Link to Invoice (Optional)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invoiceId">Invoice</Label>
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by invoice number..."
                        value={invoiceSearch}
                        onChange={(e) => setInvoiceSearch(e.target.value)}
                        onFocus={() => setShowInvoiceSearch(true)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  {showInvoiceSearch && invoiceSearch && invoices.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-950 border rounded-md shadow-lg z-10 max-h-64 overflow-auto">
                      {invoices.slice(0, 10).map((inv: any) => (
                        <button
                          key={inv.id}
                          type="button"
                          onClick={() => {
                            updateField('invoiceId', inv.id);
                            setInvoiceSearch('');
                            setShowInvoiceSearch(false);
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-900 border-b last:border-b-0 flex justify-between items-center"
                        >
                          <span className="font-mono text-sm">{inv.invoiceNumber ?? inv.id}</span>
                          <span className="text-xs text-muted-foreground">{formatCurrency(inv.totalAmount ?? 0)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {form.invoiceId && (
                  <div className="bg-slate-50 dark:bg-slate-900/30 rounded-md p-3 text-sm">
                    <p className="font-medium">Selected Invoice</p>
                    <p className="text-muted-foreground text-xs mt-1">{form.invoiceId}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-6 text-xs"
                      onClick={() => updateField('invoiceId', '')}
                    >
                      Clear Selection
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>}

          {/* Notes */}
          <Card>
            <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
            <CardContent>
              <Textarea
                placeholder="Any additional notes about this payment..."
                value={form.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                rows={4}
              />
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}
