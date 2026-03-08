'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Save, Building2, MapPin, FileText, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { PhoneInput } from '@/components/ui/phone-input';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { suppliersApi, type UpdateSupplierRequest } from '@/lib/api/suppliers';
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

export default function SupplierEditPage() {
  const router = useRouter();
  const params = useParams();
  const supplierId = params.id as string;

  const [phoneCountryCode, setPhoneCountryCode] = React.useState('+91');
  const [phoneNumber, setPhoneNumber] = React.useState('');
  const [form, setForm] = React.useState<UpdateSupplierRequest & { street?: string }>({});

  const { data: supplierResponse, loading, error } = useApiQuery(
    () => suppliersApi.getById(supplierId),
    [supplierId],
  );

  const { mutate: updateSupplier, loading: isSaving } = useApiMutation<UpdateSupplierRequest, any>(
    (data) => suppliersApi.update(supplierId, data),
  );

  const supplier = supplierResponse?.data;

  React.useEffect(() => {
    if (supplier) {
      const s = supplier as any;
      // Parse phone: if it starts with a country code like "+91 ...", split it
      const rawPhone = s.phone ?? '';
      const phoneMatch = rawPhone.match(/^(\+\d+)\s+(.*)$/);
      if (phoneMatch) {
        setPhoneCountryCode(phoneMatch[1]);
        setPhoneNumber(phoneMatch[2]);
      } else {
        setPhoneNumber(rawPhone);
      }
      setForm({
        companyName: s.company_name ?? s.name ?? '',
        category: s.category ?? '',
        contactPerson: s.contact_person ?? s.contactPerson ?? '',
        email: s.email ?? '',
        website: s.website ?? '',
        address: s.address ?? '',
        city: s.city ?? '',
        state: s.state ?? '',
        country: s.country ?? '',
        postalCode: s.postal_code ?? s.postalCode ?? '',
        gstNumber: s.gst_number ?? s.gstNumber ?? '',
        taxId: s.tax_id ?? s.taxId ?? '',
        notes: s.notes ?? '',
        isPreferred: s.is_preferred ?? s.isPreferred ?? false,
        status: s.status ?? 'active',
      });
    }
  }, [supplier]);

  async function handleSave() {
    const result = await updateSupplier({
      ...form,
      phone: phoneNumber ? `${phoneCountryCode} ${phoneNumber}` : undefined,
    });
    if (result) {
      toast.success('Supplier updated successfully');
      router.push(`/suppliers/${supplierId}`);
    } else {
      toast.error('Failed to update supplier');
    }
  }

  function updateField(field: keyof (UpdateSupplierRequest & { street?: string }), value: any) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Loading supplier...</p>
      </div>
    );
  }

  if (error || !supplier) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-destructive">Failed to load supplier</p>
        <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Edit Supplier
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save Changes
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" />Basic Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Supplier Name *</Label>
                  <Input
                    id="companyName"
                    value={form.companyName ?? ''}
                    onChange={(e) => updateField('companyName', e.target.value)}
                    placeholder="Supplier name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={form.category ?? ''} onValueChange={(v) => updateField('category', v)}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
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
                    value={form.contactPerson ?? ''}
                    onChange={(e) => updateField('contactPerson', e.target.value)}
                    placeholder="Primary contact name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <PhoneInput
                    value={phoneNumber}
                    onChange={setPhoneNumber}
                    countryCode={phoneCountryCode}
                    onCountryCodeChange={setPhoneCountryCode}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email ?? ''}
                    onChange={(e) => updateField('email', e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    value={form.website ?? ''}
                    onChange={(e) => updateField('website', e.target.value)}
                    placeholder="https://example.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status ?? 'active'} onValueChange={(v) => updateField('status', v as any)}>
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
                      checked={form.isPreferred ?? false}
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
              <div className="space-y-2">
                <Label htmlFor="address">Street Address</Label>
                <Input
                  id="address"
                  value={form.address ?? ''}
                  onChange={(e) => updateField('address', e.target.value)}
                  placeholder="Street address"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" value={form.city ?? ''} onChange={(e) => updateField('city', e.target.value)} placeholder="City" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input id="state" value={form.state ?? ''} onChange={(e) => updateField('state', e.target.value)} placeholder="State" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input id="country" value={form.country ?? ''} onChange={(e) => updateField('country', e.target.value)} placeholder="Country" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postalCode">Postal Code</Label>
                  <Input id="postalCode" value={form.postalCode ?? ''} onChange={(e) => updateField('postalCode', e.target.value)} placeholder="400001" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tax */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Tax & Compliance</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gstNumber">GST Number</Label>
                  <Input
                    id="gstNumber"
                    value={form.gstNumber ?? ''}
                    onChange={(e) => updateField('gstNumber', e.target.value)}
                    placeholder="22AAAAA0000A1Z5"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxId">Tax ID / PAN</Label>
                  <Input
                    id="taxId"
                    value={form.taxId ?? ''}
                    onChange={(e) => updateField('taxId', e.target.value)}
                    placeholder="AAAAA0000A"
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
                value={form.notes ?? ''}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="Internal notes about this supplier..."
                rows={4}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
