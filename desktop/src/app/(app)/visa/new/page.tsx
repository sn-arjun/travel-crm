'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { useApiMutation, useApiQuery } from '@/hooks/use-api';
import { visaApi, travellersApi, type CreateVisaRequest, type Traveller } from '@/lib/api/visa';

// Popular destination countries for visa combobox
const DESTINATION_COUNTRIES = [
  'Australia', 'Bahrain', 'Canada', 'China', 'Dubai (UAE)', 'Egypt', 'France', 'Germany',
  'Greece', 'Indonesia', 'Italy', 'Japan', 'Jordan', 'Kenya', 'Malaysia', 'Maldives',
  'Morocco', 'Nepal', 'Netherlands', 'New Zealand', 'Oman', 'Portugal', 'Qatar',
  'Saudi Arabia', 'Schengen', 'Singapore', 'South Africa', 'Spain', 'Sri Lanka',
  'Switzerland', 'Thailand', 'Turkey', 'United Kingdom', 'United States', 'Vietnam',
].map((c) => ({ value: c, label: c }));

const VISA_TYPES = ['Tourist', 'Business', 'Student', 'Work', 'Medical', 'Transit', 'Visit', 'Residence'];

interface FormState {
  travellerId: string;
  travellerName: string;
  passportNumber: string;
  destinationCountry: string;
  visaType: string;
  applicationDate: string;
  expectedDate: string;
  notes: string;
}

export default function NewVisaApplicationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Auto-populate from URL params (when navigating from traveller detail)
  const prefillTravellerId = searchParams.get('travellerId') ?? '';
  const prefillTravellerName = searchParams.get('travellerName') ?? '';

  const [form, setForm] = React.useState<FormState>({
    travellerId: prefillTravellerId,
    travellerName: prefillTravellerName,
    passportNumber: '',
    destinationCountry: '',
    visaType: '',
    applicationDate: new Date().toISOString().split('T')[0] ?? '',
    expectedDate: '',
    notes: '',
  });

  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [travellerSearch, setTravellerSearch] = React.useState('');
  const [countrySearch, setCountrySearch] = React.useState('');

  // Search travellers
  const { data: travellersResponse } = useApiQuery(
    () => travellersApi.list({ search: travellerSearch || undefined, limit: 20 }),
    [travellerSearch],
  );

  const travellers: Traveller[] = React.useMemo(() => {
    const d = travellersResponse?.data;
    if (!d) return [];
    if (Array.isArray(d)) return d;
    return (d as any)?.data ?? [];
  }, [travellersResponse]);

  const travellerOptions = travellers.map((t) => ({
    value: t.id,
    label: `${t.firstName} ${t.lastName} (${t.passportNumber})`,
  }));

  // If pre-filled, add the pre-fill as an option too
  const allTravellerOptions = React.useMemo(() => {
    if (prefillTravellerId && !travellerOptions.find((o) => o.value === prefillTravellerId)) {
      return [{ value: prefillTravellerId, label: prefillTravellerName }, ...travellerOptions];
    }
    return travellerOptions;
  }, [travellerOptions, prefillTravellerId, prefillTravellerName]);

  const filteredCountries = React.useMemo(() => {
    if (!countrySearch) return DESTINATION_COUNTRIES;
    const q = countrySearch.toLowerCase();
    return DESTINATION_COUNTRIES.filter((c) => c.label.toLowerCase().includes(q));
  }, [countrySearch]);

  const createMutation = useApiMutation<CreateVisaRequest, any>((data) => visaApi.create(data));

  function updateField(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  }

  function handleTravellerSelect(travellerId: string) {
    const t = travellers.find((t) => t.id === travellerId);
    if (t) {
      setForm((prev) => ({
        ...prev,
        travellerId,
        travellerName: `${t.firstName} ${t.lastName}`,
        passportNumber: t.passportNumber ?? '',
      }));
    } else if (travellerId === prefillTravellerId) {
      setForm((prev) => ({ ...prev, travellerId, travellerName: prefillTravellerName }));
    }
    setErrors((prev) => { const next = { ...prev }; delete next.travellerId; return next; });
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!form.travellerId.trim() && !form.travellerName.trim()) errs.travellerId = 'Traveller is required';
    if (!form.destinationCountry.trim()) errs.destinationCountry = 'Destination country is required';
    if (!form.applicationDate) errs.applicationDate = 'Application date is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;

    const visaData: CreateVisaRequest = {
      travellerName: form.travellerName,
      passportNumber: form.passportNumber,
      countryName: form.destinationCountry,
      visaType: form.visaType || undefined,
      applicationDate: form.applicationDate,
      expiryDate: undefined,
      notes: form.notes || undefined,
      status: 'not_started',
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
          <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button onClick={handleSave} disabled={createMutation.loading} className="gap-2">
            {createMutation.loading && <Loader2 className="h-4 w-4 animate-spin" />}
            <Save className="h-4 w-4" />
            Create Application
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Traveller</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Select Traveller <span className="text-destructive">*</span></Label>
                <Combobox
                  options={allTravellerOptions}
                  value={form.travellerId}
                  onValueChange={handleTravellerSelect}
                  onSearch={setTravellerSearch}
                  placeholder="Search travellers..."
                  searchPlaceholder="Search by name or passport..."
                  className={errors.travellerId ? 'border-destructive' : ''}
                />
                {errors.travellerId && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.travellerId}</p>}
              </div>
              {form.passportNumber && (
                <div className="text-sm text-muted-foreground">
                  Passport: <span className="font-mono font-medium text-foreground">{form.passportNumber}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Visa Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Destination Country <span className="text-destructive">*</span></Label>
                <Combobox
                  options={filteredCountries}
                  value={form.destinationCountry}
                  onValueChange={(val) => updateField('destinationCountry', val)}
                  onSearch={setCountrySearch}
                  placeholder="Select destination country..."
                  searchPlaceholder="Search countries..."
                  className={errors.destinationCountry ? 'border-destructive' : ''}
                />
                {errors.destinationCountry && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.destinationCountry}</p>}
              </div>

              <div className="space-y-2">
                <Label>Visa Type</Label>
                <Select value={form.visaType} onValueChange={(val) => updateField('visaType', val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select visa type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {VISA_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="applicationDate">Application Date <span className="text-destructive">*</span></Label>
                  <Input
                    id="applicationDate"
                    type="date"
                    value={form.applicationDate}
                    onChange={(e) => updateField('applicationDate', e.target.value)}
                    className={errors.applicationDate ? 'border-destructive' : ''}
                  />
                  {errors.applicationDate && <p className="text-xs text-destructive">{errors.applicationDate}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expectedDate">Expected Date</Label>
                  <Input
                    id="expectedDate"
                    type="date"
                    value={form.expectedDate}
                    onChange={(e) => updateField('expectedDate', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => updateField('notes', e.target.value)}
                  placeholder="Any additional notes about this visa application..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
