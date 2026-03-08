'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Save, Plus, Trash2, FileText, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { invoicesApi, type InvoiceLineItem, type CreateInvoiceRequest } from '@/lib/api/invoices';
import { contactsApi } from '@/lib/api/contacts';

interface LineItem {
  id: number;
  description: string;
  hsnCode: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

let lineIdCounter = 1;

function formatCurrency(amount: number, currency: string = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

export default function NewInvoicePage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const [form, setForm] = React.useState({
    contactId: '',
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    clientAddress: '',
    leadTitle: '',
    issueDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    currency: 'INR',
    gstRate: '18',
    discountType: 'percentage' as 'percentage' | 'fixed',
    discountValue: '',
    notes: '',
    termsAndConditions: 'Payment due within 30 days of invoice date.\nCancellation charges apply as per company policy.\nGST applicable as per Government regulations.',
  });

  // Fetch contacts for the dropdown
  const { data: contactsResponse } = useApiQuery(() => contactsApi.list({ limit: 100 }), []);
  const contactsData = contactsResponse?.data;
  const contacts = Array.isArray(contactsData) ? contactsData : (contactsData?.data ?? []);

  const [lineItems, setLineItems] = React.useState<LineItem[]>([
    { id: lineIdCounter++, description: '', hsnCode: '', quantity: 1, unitPrice: 0, amount: 0 },
  ]);

  const { mutate: createInvoice } = useApiMutation(
    (data: CreateInvoiceRequest) => invoicesApi.create(data),
  );

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateLineItem(id: number, field: keyof LineItem, value: string | number) {
    setLineItems((prev) => prev.map((item: any) => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      updated.amount = updated.quantity * updated.unitPrice;
      return updated;
    }));
  }

  function addLineItem() {
    setLineItems((prev) => [...prev, { id: lineIdCounter++, description: '', hsnCode: '', quantity: 1, unitPrice: 0, amount: 0 }]);
  }

  function removeLineItem(id: number) {
    setLineItems((prev) => prev.length > 1 ? prev.filter((item: any) => item.id !== id) : prev);
  }

  const subtotal = lineItems.reduce((sum: any, item: any) => sum + item.amount, 0);
  const discountAmount = form.discountType === 'percentage'
    ? subtotal * (parseFloat(form.discountValue) || 0) / 100
    : parseFloat(form.discountValue) || 0;
  const taxableAmount = subtotal - discountAmount;
  const gstAmount = taxableAmount * (parseFloat(form.gstRate) || 0) / 100;
  const totalAmount = taxableAmount + gstAmount;

  function validateForm(): boolean {
    if (!form.contactId) {
      toast.error('Please select a contact');
      return false;
    }
    if (lineItems.length === 0 || lineItems.every((item) => !item.description)) {
      toast.error('At least one line item with description is required');
      return false;
    }
    if (totalAmount <= 0) {
      toast.error('Invoice total must be greater than zero');
      return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent, isDraft: boolean = false) {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const apiLineItems: InvoiceLineItem[] = lineItems
        .filter((item: any) => item.description.trim())
        .map((item: any) => ({
          description: item.description,
          hsnCode: item.hsnCode || undefined,
          quantity: item.quantity,
          rate: item.unitPrice,
          taxRate: parseFloat(form.gstRate) || 0,
          discountPercent: 0,
        }));

      const createRequest: CreateInvoiceRequest = {
        contactId: form.contactId,
        dueDate: form.dueDate || undefined,
        items: apiLineItems,
        discountType: form.discountType,
        discountValue: discountAmount > 0 ? discountAmount : undefined,
        notes: form.notes || undefined,
        currency: form.currency,
      };

      const result = await createInvoice(createRequest);
      if (result) {
        toast.success(isDraft ? 'Invoice saved as draft' : 'Invoice created and sent successfully');
        router.push('/invoices');
      } else {
        toast.error('Failed to create invoice');
      }
    } catch (err) {
      toast.error('Error creating invoice');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>New Invoice</h1>
            <p className="text-sm text-muted-foreground">Create a new invoice for a client</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button variant="outline" onClick={(e) => handleSubmit(e, true)} disabled={isSubmitting}>Save as Draft</Button>
          <Button onClick={(e) => handleSubmit(e, false)} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Create & Send
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-6">
          {/* Client Info */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Client Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contact <span className="text-destructive">*</span></Label>
                  <Select value={form.contactId} onValueChange={(v) => updateField('contactId', v)}>
                    <SelectTrigger><SelectValue placeholder="Select a contact" /></SelectTrigger>
                    <SelectContent>
                      {contacts.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name} {c.email ? `(${c.email})` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="leadTitle">Trip / Lead Reference</Label>
                  <Input id="leadTitle" placeholder="e.g., Maldives Honeymoon Package" value={form.leadTitle} onChange={(e) => updateField('leadTitle', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="issueDate">Issue Date</Label>
                  <Input id="issueDate" type="date" value={form.issueDate} onChange={(e) => updateField('issueDate', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dueDate">Due Date</Label>
                  <Input id="dueDate" type="date" value={form.dueDate} onChange={(e) => updateField('dueDate', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select value={form.currency} onValueChange={(v) => updateField('currency', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INR">INR ({'\u20B9'})</SelectItem>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="EUR">EUR ({'\u20AC'})</SelectItem>
                      <SelectItem value="GBP">GBP ({'\u00A3'})</SelectItem>
                      <SelectItem value="AED">AED ({'\u062F.\u0625'})</SelectItem>
                      <SelectItem value="THB">THB ({'\u0E3F'})</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><Calculator className="h-4 w-4" />Line Items</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Header */}
              <div className="grid grid-cols-[1fr_100px_80px_120px_120px_32px] gap-2 text-xs font-medium text-muted-foreground px-1">
                <span>Description</span>
                <span>HSN/SAC</span>
                <span>Qty</span>
                <span>Unit Price</span>
                <span>Amount</span>
                <span />
              </div>
              {lineItems.map((item: any) => (
                <div key={item.id} className="grid grid-cols-[1fr_100px_80px_120px_120px_32px] gap-2 items-center">
                  <Input placeholder="e.g., Flight tickets, Hotel booking..." value={item.description} onChange={(e) => updateLineItem(item.id, 'description', e.target.value)} />
                  <Input placeholder="HSN/SAC" value={item.hsnCode} onChange={(e) => updateLineItem(item.id, 'hsnCode', e.target.value)} className="text-xs" />
                  <Input type="number" min={1} value={item.quantity} onChange={(e) => updateLineItem(item.id, 'quantity', parseInt(e.target.value) || 1)} />
                  <Input type="number" min={0} value={item.unitPrice || ''} onChange={(e) => updateLineItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)} placeholder="0" />
                  <Input value={item.amount.toLocaleString('en-IN')} readOnly className="bg-muted text-right font-medium" />
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeLineItem(item.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}

              <Separator className="my-4" />

              {/* Totals */}
              <div className="space-y-2 max-w-sm ml-auto">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{formatCurrency(subtotal, form.currency)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground shrink-0">Discount</span>
                  <div className="flex items-center gap-1">
                    <Select value={form.discountType} onValueChange={(v) => updateField('discountType', v)}>
                      <SelectTrigger className="w-20 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">%</SelectItem>
                        <SelectItem value="fixed">₹</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input className="w-20 h-8 text-sm" type="number" min={0} value={form.discountValue} onChange={(e) => updateField('discountValue', e.target.value)} placeholder="0" />
                  </div>
                  <span className="text-sm font-medium w-24 text-right">-{formatCurrency(discountAmount, form.currency)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground shrink-0">GST</span>
                  <Select value={form.gstRate} onValueChange={(v) => updateField('gstRate', v)}>
                    <SelectTrigger className="w-20 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0%</SelectItem>
                      <SelectItem value="5">5%</SelectItem>
                      <SelectItem value="12">12%</SelectItem>
                      <SelectItem value="18">18%</SelectItem>
                      <SelectItem value="28">28%</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm font-medium w-24 text-right">+{formatCurrency(gstAmount, form.currency)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-base">
                  <span className="font-semibold">Total</span>
                  <span className="font-bold text-lg">{formatCurrency(totalAmount, form.currency)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes & Terms */}
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
              <CardContent>
                <Textarea placeholder="Any notes for the client..." value={form.notes} onChange={(e) => updateField('notes', e.target.value)} rows={4} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Terms & Conditions</CardTitle></CardHeader>
              <CardContent>
                <Textarea value={form.termsAndConditions} onChange={(e) => updateField('termsAndConditions', e.target.value)} rows={4} />
              </CardContent>
            </Card>
          </div>
        </form>
      </div>
    </div>
  );
}
