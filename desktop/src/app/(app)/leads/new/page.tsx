'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { LEAD_SOURCES, LEAD_STATUS_LABELS } from '@travelcrm/shared';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { leadsApi } from '@/lib/api/leads';
import { contactsApi } from '@/lib/api/contacts';
import { usersApi } from '@/lib/api/users';
import { toast } from 'sonner';

export default function NewLeadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillContactId = searchParams.get('contactId') ?? '';
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const { data: contactsResponse } = useApiQuery(() => contactsApi.list({ limit: 100 }), []);
  const contactsData = contactsResponse?.data;
  const contacts = Array.isArray(contactsData) ? contactsData : (contactsData?.data ?? []);

  const { data: usersResponse } = useApiQuery(() => usersApi.list({ limit: 100 }), []);
  const usersData = usersResponse?.data;
  const teamUsers = Array.isArray(usersData) ? usersData : ((usersData as any)?.data ?? []);

  const { mutate: createLead, loading: isSubmitting } = useApiMutation(leadsApi.create);

  const [destInput, setDestInput] = React.useState('');
  const [form, setForm] = React.useState({
    contactId: prefillContactId,
    title: '',
    destinations: [] as string[],
    travelDate: new Date().toISOString().split('T')[0],
    returnDate: '',
    paxAdults: 1,
    paxChildren: 0,
    paxInfants: 0,
    budget: '',
    currency: 'INR',
    tripType: 'domestic',
    source: 'manual',
    priority: 'warm',
    assignedTo: '',
    specialRequirements: '',
    estimatedValue: '',
    probability: '',
    expectedCloseDate: '',
    notes: '',
  });

  function updateField(field: string, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const newErrors: Record<string, string> = {};
    if (!form.title.trim()) newErrors.title = 'Title is required';
    if (!form.contactId) newErrors.contactId = 'Contact is required';
    if (form.destinations.length === 0) newErrors.destinations = 'At least one destination is required';
    if (!form.travelDate) newErrors.travelDate = 'Travel date is required';
    if (!form.tripType) newErrors.tripType = 'Trip type is required';
    if (!form.source) newErrors.source = 'Source is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const result = await createLead({
      contactId: form.contactId,
      title: form.title,
      destinations: form.destinations,
      travelDate: (form.travelDate || new Date().toISOString().split('T')[0]) as string,
      returnDate: form.returnDate || undefined,
      paxAdults: form.paxAdults,
      paxChildren: form.paxChildren,
      paxInfants: form.paxInfants,
      budget: form.budget ? parseFloat(form.budget) : undefined,
      currency: form.currency || 'INR',
      tripType: form.tripType as any,
      source: form.source as any,
      priority: (form.priority as any) || undefined,
      assignedTo: form.assignedTo || undefined,
      specialRequirements: form.specialRequirements || undefined,
      estimatedValue: form.estimatedValue ? parseFloat(form.estimatedValue) : undefined,
      probability: form.probability ? parseInt(form.probability) : undefined,
      expectedCloseDate: form.expectedCloseDate || undefined,
      notes: form.notes || undefined,
    } as any);

    if (result) {
      toast.success('Lead created successfully');
      router.push('/leads');
    } else {
      toast.error('Failed to create lead');
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
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>New Lead</h1>
            <p className="text-sm text-muted-foreground">Create a new sales lead</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save Lead
          </Button>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-auto p-6">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
          {/* Contact Selection */}
          <Card>
            <CardHeader><CardTitle className="text-base">Contact</CardTitle></CardHeader>
            <CardContent>
              <Select value={form.contactId} onValueChange={(v) => updateField('contactId', v)}>
                <SelectTrigger className={errors.contactId ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Select a contact" />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()} {c.email ? `(${c.email})` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.contactId && <p className="text-xs text-destructive mt-1">{errors.contactId}</p>}
            </CardContent>
          </Card>

          {/* Lead Details */}
          <Card>
            <CardHeader><CardTitle className="text-base">Lead Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title <span className="text-destructive">*</span></Label>
                <Input id="title" placeholder="e.g., Maldives Honeymoon Package" value={form.title} onChange={(e) => updateField('title', e.target.value)} className={errors.title ? 'border-destructive' : ''} required />
                {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Destinations <span className="text-destructive">*</span></Label>
                  <div className={cn('flex flex-wrap gap-1.5 p-2 border rounded-md min-h-[36px] bg-background', errors.destinations && 'border-destructive')}>
                    {form.destinations.map((dest, i) => (
                      <span key={i} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">
                        {dest}
                        <button type="button" className="hover:text-destructive" onClick={() => setForm({ ...form, destinations: form.destinations.filter((_, j) => j !== i) })}>×</button>
                      </span>
                    ))}
                    <input
                      className="flex-1 min-w-[120px] text-sm bg-transparent outline-none"
                      placeholder={form.destinations.length === 0 ? 'Type & press Enter...' : 'Add more...'}
                      value={destInput}
                      onChange={(e) => setDestInput(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ',') && destInput.trim()) {
                          e.preventDefault();
                          if (!form.destinations.includes(destInput.trim())) {
                            setForm({ ...form, destinations: [...form.destinations, destInput.trim()] });
                          }
                          setDestInput('');
                        }
                        if (e.key === 'Backspace' && !destInput && form.destinations.length > 0) {
                          setForm({ ...form, destinations: form.destinations.slice(0, -1) });
                        }
                      }}
                    />
                  </div>
                  {errors.destinations && <p className="text-xs text-destructive">{errors.destinations}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tripType">Trip Type <span className="text-destructive">*</span></Label>
                  <Select value={form.tripType} onValueChange={(v) => updateField('tripType', v)}>
                    <SelectTrigger className={errors.tripType ? 'border-destructive' : ''}><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="domestic">Domestic</SelectItem>
                      <SelectItem value="international">International</SelectItem>
                      <SelectItem value="honeymoon">Honeymoon</SelectItem>
                      <SelectItem value="family">Family</SelectItem>
                      <SelectItem value="group">Group</SelectItem>
                      <SelectItem value="corporate">Corporate</SelectItem>
                      <SelectItem value="adventure">Adventure</SelectItem>
                      <SelectItem value="pilgrimage">Pilgrimage</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.tripType && <p className="text-xs text-destructive">{errors.tripType}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="travelDate">Travel Date <span className="text-destructive">*</span></Label>
                  <Input id="travelDate" type="date" value={form.travelDate} min={new Date().toISOString().split('T')[0]} onChange={(e) => updateField('travelDate', e.target.value)} className={errors.travelDate ? 'border-destructive' : ''} />
                  {errors.travelDate && <p className="text-xs text-destructive">{errors.travelDate}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="returnDate">Return Date</Label>
                  <Input id="returnDate" type="date" value={form.returnDate} min={form.travelDate || new Date().toISOString().split('T')[0]} onChange={(e) => updateField('returnDate', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Passengers & Budget */}
          <Card>
            <CardHeader><CardTitle className="text-base">Passengers & Budget</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paxAdults">Adults</Label>
                  <Input id="paxAdults" type="number" min={1} value={form.paxAdults} onChange={(e) => updateField('paxAdults', parseInt(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paxChildren">Children</Label>
                  <Input id="paxChildren" type="number" min={0} value={form.paxChildren} onChange={(e) => updateField('paxChildren', parseInt(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paxInfants">Infants</Label>
                  <Input id="paxInfants" type="number" min={0} value={form.paxInfants} onChange={(e) => updateField('paxInfants', parseInt(e.target.value) || 0)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="budget">Budget</Label>
                  <Input id="budget" type="number" placeholder="0" value={form.budget} onChange={(e) => updateField('budget', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select value={form.currency} onValueChange={(v) => updateField('currency', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['INR', 'USD', 'EUR', 'GBP', 'AED'].map((c: any) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Classification */}
          <Card>
            <CardHeader><CardTitle className="text-base">Classification</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={form.priority} onValueChange={(v) => updateField('priority', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hot">Hot</SelectItem>
                      <SelectItem value="warm">Warm</SelectItem>
                      <SelectItem value="cold">Cold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Source <span className="text-destructive">*</span></Label>
                  <Select value={form.source} onValueChange={(v) => updateField('source', v)}>
                    <SelectTrigger className={errors.source ? 'border-destructive' : ''}><SelectValue placeholder="Select source" /></SelectTrigger>
                    <SelectContent>
                      {LEAD_SOURCES.map((s: any) => (
                        <SelectItem key={s} value={s} className="capitalize">{s.replace('_', ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Assigned To</Label>
                  <Select value={form.assignedTo} onValueChange={(v) => updateField('assignedTo', v)}>
                    <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                    <SelectContent>
                      {teamUsers.map((u: any) => (
                        <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Financial */}
          <Card>
            <CardHeader><CardTitle className="text-base">Financial</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="estimatedValue">Estimated Value</Label>
                  <Input
                    id="estimatedValue"
                    type="number"
                    placeholder="0"
                    value={form.estimatedValue}
                    onChange={(e) => updateField('estimatedValue', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="probability">Probability (%)</Label>
                  <Input
                    id="probability"
                    type="number"
                    min={0}
                    max={100}
                    placeholder="0"
                    value={form.probability}
                    onChange={(e) => updateField('probability', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expectedCloseDate">Expected Close Date</Label>
                  <Input
                    id="expectedCloseDate"
                    type="date"
                    value={form.expectedCloseDate}
                    onChange={(e) => updateField('expectedCloseDate', e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Additional Details */}
          <Card>
            <CardHeader><CardTitle className="text-base">Additional Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="specialRequirements">Special Requirements</Label>
                <Textarea
                  id="specialRequirements"
                  placeholder="Any special requirements, preferences, or notes..."
                  value={form.specialRequirements}
                  onChange={(e) => updateField('specialRequirements', e.target.value)}
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Internal notes about this lead..."
                  value={form.notes}
                  onChange={(e) => updateField('notes', e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}
