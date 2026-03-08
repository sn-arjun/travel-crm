'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApiMutation } from '@/hooks/use-api';
import { visaApi, type CreateVisaRequest } from '@/lib/api/visa';

interface FormState {
  travellerName: string;
  passportNumber: string;
  countryName: string;
  visaType: string;
  applicationDate: string;
  expiryDate: string;
  notes: string;
}

const initialFormState: FormState = {
  travellerName: '',
  passportNumber: '',
  countryName: '',
  visaType: '',
  applicationDate: new Date().toISOString().split('T')[0] ?? '',
  expiryDate: '',
  notes: '',
};

export default function NewVisaApplicationPage() {
  const router = useRouter();
  const [form, setForm] = React.useState<FormState>(initialFormState);

  const createMutation = useApiMutation<CreateVisaRequest, any>((data) => visaApi.create(data));

  const updateField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const isFormValid =
    form.travellerName.trim() !== '' &&
    form.passportNumber.trim() !== '' &&
    form.countryName.trim() !== '' &&
    form.applicationDate !== '';

  async function handleSave() {
    if (!isFormValid) {
      toast.error('Please fill in all required fields');
      return;
    }

    const visaData: CreateVisaRequest = {
      travellerName: form.travellerName,
      passportNumber: form.passportNumber,
      countryName: form.countryName,
      visaType: form.visaType || undefined,
      applicationDate: form.applicationDate,
      expiryDate: form.expiryDate || undefined,
      notes: form.notes || undefined,
      status: 'applied',
    };

    const result = await createMutation.mutate(visaData);
    if (result) {
      toast.success('Visa application created successfully!');
      router.push('/visa');
    } else {
      toast.error(createMutation.error?.message ?? 'Failed to create visa application');
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              New Visa Application
            </h1>
            <p className="text-sm text-muted-foreground">Create a new visa record for a traveller</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={createMutation.loading || !isFormValid} className="gap-2">
            {createMutation.loading && <Loader2 className="h-4 w-4 animate-spin" />}
            <Save className="h-4 w-4" />
            Create Application
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Visa Application Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Traveller Name */}
              <div className="space-y-2">
                <Label htmlFor="travellerName">Traveller Name *</Label>
                <Input
                  id="travellerName"
                  value={form.travellerName}
                  onChange={(e) => updateField('travellerName', e.target.value)}
                  placeholder="Full name"
                  required
                />
              </div>

              {/* Passport Number */}
              <div className="space-y-2">
                <Label htmlFor="passportNumber">Passport Number *</Label>
                <Input
                  id="passportNumber"
                  value={form.passportNumber}
                  onChange={(e) => updateField('passportNumber', e.target.value)}
                  placeholder="e.g., P123456789"
                  required
                />
              </div>

              {/* Destination Country */}
              <div className="space-y-2">
                <Label htmlFor="countryName">Destination Country *</Label>
                <Input
                  id="countryName"
                  value={form.countryName}
                  onChange={(e) => updateField('countryName', e.target.value)}
                  placeholder="e.g., Thailand, Singapore"
                  required
                />
              </div>

              {/* Visa Type */}
              <div className="space-y-2">
                <Label htmlFor="visaType">Visa Type</Label>
                <Input
                  id="visaType"
                  value={form.visaType}
                  onChange={(e) => updateField('visaType', e.target.value)}
                  placeholder="e.g., Tourist, Business, Visit"
                />
              </div>

              {/* Application Date */}
              <div className="space-y-2">
                <Label htmlFor="applicationDate">Application Date *</Label>
                <Input
                  id="applicationDate"
                  type="date"
                  value={form.applicationDate}
                  onChange={(e) => updateField('applicationDate', e.target.value)}
                  required
                />
              </div>

              {/* Expiry Date */}
              <div className="space-y-2">
                <Label htmlFor="expiryDate">Expiry Date</Label>
                <Input
                  id="expiryDate"
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => updateField('expiryDate', e.target.value)}
                />
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => updateField('notes', e.target.value)}
                  placeholder="Any additional notes about the visa application..."
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
