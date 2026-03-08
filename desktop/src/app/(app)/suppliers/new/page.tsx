'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Save, Building2, MapPin, DollarSign, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApiMutation } from '@/hooks/use-api';
import { suppliersApi } from '@/lib/api/suppliers';
import { toast } from 'sonner';

const SUPPLIER_TYPE_OPTIONS = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'airline', label: 'Airline' },
  { value: 'transport', label: 'Transport' },
  { value: 'activity', label: 'Activity' },
  { value: 'visa', label: 'Visa' },
  { value: 'tour_operator', label: 'Tour Operator' },
  { value: 'resort', label: 'Resort' },
  { value: 'ota', label: 'OTA' },
];

export default function NewSupplierPage() {
  const router = useRouter();

  const { mutate: createSupplier, loading: isSubmitting } = useApiMutation(
    (data: any) => suppliersApi.create(data),
  );

  const [form, setForm] = React.useState({
    name: '',
    category: 'hotel',
    contactPerson: '',
    phone: '',
    email: '',
    website: '',
    city: '',
    state: '',
    country: 'India',
    notes: '',
  });

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Company name is required');
      return;
    }
    const result = await createSupplier({
      companyName: form.name,
      category: form.category,
      contactPerson: form.contactPerson || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      website: form.website || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      country: form.country || undefined,
      notes: form.notes || undefined,
    });
    if (result) {
      toast.success('Supplier created successfully');
      router.push('/suppliers');
    } else {
      toast.error('Failed to create supplier');
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
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>New Supplier</h1>
            <p className="text-sm text-muted-foreground">Add a new supplier to your network</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save Supplier
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" />Basic Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Supplier Name <span className="text-destructive">*</span></Label>
                  <Input id="name" placeholder="e.g., Taj Hotels" value={(form as any).name} onChange={(e) => updateField('name', e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Category <span className="text-destructive">*</span></Label>
                  <Select value={form.category} onValueChange={(v) => updateField('category', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SUPPLIER_TYPE_OPTIONS.map((opt: any) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactPerson">Contact Person <span className="text-destructive">*</span></Label>
                  <Input id="contactPerson" placeholder="e.g., Rajesh Kumar" value={(form as any).contactPerson} onChange={(e) => updateField('contactPerson', e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone <span className="text-destructive">*</span></Label>
                  <Input id="phone" placeholder="+91 XXXXX XXXXX" value={(form as any).phone} onChange={(e) => updateField('phone', e.target.value)} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
                  <Input id="email" type="email" placeholder="email@example.com" value={(form as any).email} onChange={(e) => updateField('email', e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input id="website" type="url" placeholder="https://example.com" value={(form as any).website} onChange={(e) => updateField('website', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Address */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" />Address</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="street">Street Address</Label>

                <Input id="street" placeholder="Street address" value={(form as any).street} onChange={(e) => updateField('street', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" placeholder="City" value={(form as any).city} onChange={(e) => updateField('city', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input id="state" placeholder="State" value={(form as any).state} onChange={(e) => updateField('state', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input id="country" value={(form as any).country} onChange={(e) => updateField('country', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pincode">PIN Code</Label>

                  <Input id="pincode" placeholder="400001" value={(form as any).pincode} onChange={(e) => updateField('pincode', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Banking */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4" />Banking Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bankName">Bank Name</Label>

                  <Input id="bankName" placeholder="Bank name" value={(form as any).bankName} onChange={(e) => updateField('bankName', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountNumber">Account Number</Label>

                  <Input id="accountNumber" placeholder="Account number" value={(form as any).accountNumber} onChange={(e) => updateField('accountNumber', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ifscCode">IFSC Code</Label>

                  <Input id="ifscCode" placeholder="IFSC code" value={(form as any).ifscCode} onChange={(e) => updateField('ifscCode', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gstNumber">GST Number</Label>

                  <Input id="gstNumber" placeholder="22AAAAA0000A1Z5" value={(form as any).gstNumber} onChange={(e) => updateField('gstNumber', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Notes</CardTitle></CardHeader>
            <CardContent>
              <Textarea
                placeholder="Any additional notes about this supplier..."
                value={(form as any).notes}
                onChange={(e) => updateField('notes', e.target.value)}
                rows={3}
              />
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}
