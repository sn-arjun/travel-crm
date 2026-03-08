'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { useApiMutation, useApiQuery } from '@/hooks/use-api';
import { client, type ApiResponse } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { suppliersApi } from '@/lib/api/suppliers';
import { toast } from 'sonner';

interface CreateRateCardRequest {
  serviceName: string;
  supplierId?: string;
  category: string;
  rate: number;
  currency?: string;
  validFrom?: string;
  validTo?: string;
  notes?: string;
}

export default function NewRateCardPage() {
  const router = useRouter();

  const [form, setForm] = React.useState<CreateRateCardRequest>({
    serviceName: '',
    category: '',
    rate: 0,
    currency: 'INR',
    validFrom: '',
    validTo: '',
    notes: '',
  });

  const [supplierSearch, setSupplierSearch] = React.useState('');

  const { data: suppliersResponse } = useApiQuery(
    () => suppliersApi.list({ page: 1, limit: 100, search: supplierSearch || undefined }),
    [supplierSearch],
  );

  const supplierOptions = React.useMemo(() => {
    if (!suppliersResponse?.data) return [];
    const data = suppliersResponse.data;
    const items: any[] = Array.isArray(data) ? data : (data as any)?.data ?? [];
    return items.map((s: any) => ({ value: s.id, label: s.name ?? s.companyName ?? s.id }));
  }, [suppliersResponse]);

  const { mutate: createRateCard, loading: isSaving } = useApiMutation<CreateRateCardRequest, any>(
    (data) => client.post<ApiResponse<any>>(API_ENDPOINTS.rateCards.create, data),
  );

  function updateField(field: keyof CreateRateCardRequest, value: any) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!form.serviceName.trim()) {
      toast.error('Service name is required');
      return;
    }
    if (!form.category) {
      toast.error('Category is required');
      return;
    }
    if (!form.rate || form.rate <= 0) {
      toast.error('Rate must be greater than 0');
      return;
    }

    // Map frontend fields to backend schema
    const payload = {
      name: form.serviceName,
      serviceType: form.category as 'hotel' | 'transport' | 'activity' | 'meal' | 'flight',
      costPrice: form.rate,
      sellingPrice: form.rate,
      supplierId: form.supplierId,
      currency: form.currency,
      validFrom: form.validFrom || undefined,
      validTo: form.validTo || undefined,
      description: form.notes,
    };
    const result = await createRateCard(payload as any);
    if (result) {
      toast.success('Rate card created successfully');
      router.push('/rate-cards');
    } else {
      toast.error('Failed to create rate card');
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            New Rate Card
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save Rate Card
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Service Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="serviceName">Service Name *</Label>
                <Input
                  id="serviceName"
                  value={form.serviceName}
                  onChange={(e) => updateField('serviceName', e.target.value)}
                  placeholder="e.g., Deluxe Room, Airport Transfer"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select value={form.category} onValueChange={(v) => updateField('category', v)}>
                  <SelectTrigger id="category"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hotel">Hotel</SelectItem>
                    <SelectItem value="transport">Transport</SelectItem>
                    <SelectItem value="activity">Activity</SelectItem>
                    <SelectItem value="meal">Meal</SelectItem>
                    <SelectItem value="flight">Flight</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Supplier</Label>
                <Combobox
                  options={supplierOptions}
                  value={form.supplierId ?? ''}
                  onValueChange={(v) => updateField('supplierId', v || undefined)}
                  onSearch={setSupplierSearch}
                  placeholder="Select supplier (optional)"
                  searchPlaceholder="Search suppliers..."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Pricing</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rate">Rate *</Label>
                  <Input
                    id="rate"
                    type="number"
                    value={form.rate || ''}
                    onChange={(e) => updateField('rate', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select value={form.currency ?? 'INR'} onValueChange={(v) => updateField('currency', v)}>
                    <SelectTrigger id="currency"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INR">INR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Validity Period</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="validFrom">Valid From</Label>
                  <Input
                    id="validFrom"
                    type="date"
                    value={form.validFrom ?? ''}
                    onChange={(e) => updateField('validFrom', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="validTo">Valid To</Label>
                  <Input
                    id="validTo"
                    type="date"
                    value={form.validTo ?? ''}
                    onChange={(e) => updateField('validTo', e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Additional Information</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={form.notes ?? ''}
                  onChange={(e) => updateField('notes', e.target.value)}
                  placeholder="Additional notes or terms..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
