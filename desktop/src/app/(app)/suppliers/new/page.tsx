'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Save, Building2, MapPin, FileText, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { PhoneInput } from '@/components/ui/phone-input';
import { useApiMutation } from '@/hooks/use-api';
import { suppliersApi } from '@/lib/api/suppliers';
import { toast } from 'sonner';

const SUPPLIER_CATEGORY_OPTIONS = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'airline', label: 'Airline' },
  { value: 'transport', label: 'Transport' },
  { value: 'activity_provider', label: 'Activity Provider' },
  { value: 'guide', label: 'Guide' },
  { value: 'visa_agent', label: 'Visa Agent' },
  { value: 'insurance', label: 'Insurance' },
];

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export default function NewSupplierPage() {
  const router = useRouter();

  const { mutate: createSupplier, loading: isSubmitting } = useApiMutation(
    (data: any) => suppliersApi.create(data),
  );

  const [form, setForm] = React.useState({
    companyName: '',
    category: 'hotel',
    contactPerson: '',
    phone: '',
    phoneCountryCode: '+91',
    email: '',
    website: '',
    street: '',
    city: '',
    state: '',
    country: 'India',
    postalCode: '',
    gstNumber: '',
    taxId: '',
    notes: '',
    status: 'active' as 'active' | 'inactive',
    isPreferred: false,
  });

  function updateField(field: string, value: any) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.companyName.trim()) {
      toast.error('Company name is required');
      return;
    }
    const result = await createSupplier({
      companyName: form.companyName,
      category: form.category as any,
      contactPerson: form.contactPerson || undefined,
      phone: form.phone ? `${form.phoneCountryCode} ${form.phone}` : undefined,
      email: form.email || undefined,
      website: form.website || undefined,
      address: form.street || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      country: form.country || undefined,
      postalCode: form.postalCode || undefined,
      gstNumber: form.gstNumber || undefined,
      taxId: form.taxId || undefined,
      notes: form.notes || undefined,
      status: form.status,
      isPreferred: form.isPreferred,
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
                  <Label htmlFor="companyName">Supplier Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="companyName"
                    placeholder="e.g., Taj Hotels"
                    value={form.companyName}
                    onChange={(e) => updateField('companyName', e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category <span className="text-destructive">*</span></Label>
                  <Select value={form.category} onValueChange={(v) => updateField('category', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SUPPLIER_CATEGORY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactPerson">Contact Person</Label>
                  <Input
                    id="contactPerson"
                    placeholder="e.g., Rajesh Kumar"
                    value={form.contactPerson}
                    onChange={(e) => updateField('contactPerson', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <PhoneInput
                    value={form.phone}
                    onChange={(v) => updateField('phone', v)}
                    countryCode={form.phoneCountryCode}
                    onCountryCodeChange={(c) => updateField('phoneCountryCode', c)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@example.com"
                    value={form.email}
                    onChange={(e) => updateField('email', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    type="url"
                    placeholder="https://example.com"
                    value={form.website}
                    onChange={(e) => updateField('website', e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => updateField('status', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="block mb-3">Preferred Supplier</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <Switch
                      checked={form.isPreferred}
                      onCheckedChange={(v) => updateField('isPreferred', v)}
                    />
                    <span className="text-sm text-muted-foreground">
                      {form.isPreferred ? 'Marked as preferred' : 'Not preferred'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Address */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" />Address</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {MAPS_API_KEY ? (
                <p className="text-xs text-muted-foreground">Address autocomplete available</p>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="street">Street Address</Label>
                <Input
                  id="street"
                  placeholder="Street address"
                  value={form.street}
                  onChange={(e) => updateField('street', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" placeholder="City" value={form.city} onChange={(e) => updateField('city', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input id="state" placeholder="State" value={form.state} onChange={(e) => updateField('state', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input id="country" value={form.country} onChange={(e) => updateField('country', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postalCode">Postal Code</Label>
                  <Input
                    id="postalCode"
                    placeholder="400001"
                    value={form.postalCode}
                    onChange={(e) => updateField('postalCode', e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tax & Compliance */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Tax & Compliance</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gstNumber">GST Number</Label>
                  <Input
                    id="gstNumber"
                    placeholder="22AAAAA0000A1Z5"
                    value={form.gstNumber}
                    onChange={(e) => updateField('gstNumber', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxId">Tax ID / PAN</Label>
                  <Input
                    id="taxId"
                    placeholder="AAAAA0000A"
                    value={form.taxId}
                    onChange={(e) => updateField('taxId', e.target.value)}
                  />
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
                value={form.notes}
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
