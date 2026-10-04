'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import {
  Input, Textarea, SectionCard, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  CurrencyInput, DatePicker, Tag,
} from '@/components/ui';
import { leadsApi } from '@/lib/api/leads';
import { contactsApi } from '@/lib/api/contacts';
import { usersApi } from '@/lib/api/users';
import { LEAD_SOURCES } from '@travelcrm/shared';
import { toast } from 'sonner';
import { toLocalDateString } from '@/lib/dates';

const schema = z.object({
  contactId: z.string().min(1, 'Contact is required'),
  title: z.string().min(1, 'Title is required'),
  destinations: z.array(z.string()).min(1, 'At least one destination is required'),
  travelDate: z.date({ error: 'Travel date is required' }),
  returnDate: z.date().optional(),
  paxAdults: z.number().min(1),
  paxChildren: z.number().min(0),
  paxInfants: z.number().min(0),
  budget: z.number().optional(),
  currency: z.string(),
  tripType: z.string().min(1, 'Trip type is required'),
  source: z.string().min(1, 'Source is required'),
  priority: z.string(),
  assignedTo: z.string().optional(),
  specialRequirements: z.string().optional(),
  notes: z.string().optional(),
});
type LeadFormValues = z.infer<typeof schema>;

export default function NewLeadPage() {
  const router = useRouter();
  const [destInput, setDestInput] = React.useState('');

  return (
    <EntityForm<LeadFormValues>
      title="New lead"
      description="Create a new sales lead"
      submitLabel="Save Lead"
      schema={schema}
      defaultValues={{
        contactId: '',
        title: '',
        destinations: [],
        travelDate: undefined,
        returnDate: undefined,
        paxAdults: 1,
        paxChildren: 0,
        paxInfants: 0,
        budget: undefined,
        currency: 'INR',
        tripType: 'domestic',
        source: 'manual',
        priority: 'warm',
        assignedTo: '',
        specialRequirements: '',
        notes: '',
      }}
      prefillFromParams={{ contactId: 'contactId' }}
      onCancel={() => router.back()}
      onSubmit={async (v) => {
        const result = await leadsApi.create({
          contactId: v.contactId,
          title: v.title,
          destinations: v.destinations,
          travelDate: toLocalDateString(v.travelDate) as string,
          returnDate: v.returnDate ? toLocalDateString(v.returnDate) : undefined,
          paxAdults: v.paxAdults,
          paxChildren: v.paxChildren,
          paxInfants: v.paxInfants,
          budget: v.budget,
          currency: v.currency,
          tripType: v.tripType as any,
          source: v.source as any,
          priority: v.priority as any,
          assignedTo: v.assignedTo || undefined,
          specialRequirements: v.specialRequirements || undefined,
          notes: v.notes || undefined,
        });
        if (result) {
          toast.success('Lead created successfully');
          router.push('/leads');
        } else {
          toast.error('Failed to create lead');
        }
      }}
      renderSections={(form) => {
        const destinations = form.watch('destinations') || [];
        return (
          <>
            <SectionCard title="Contact" required>
              <div className="grid gap-ds-4 sm:grid-cols-2">
                <FormRow name="contactId" label="Contact" required wide>
                  <RelationCombobox
                    value={form.watch('contactId') || null}
                    onChange={(id) => form.setValue('contactId', id ?? '', { shouldDirty: true, shouldValidate: true })}
                    fetcher={async (q, page) => {
                      const r = await contactsApi.list({ search: q, page, limit: 20 });
                      const data = r.data as any;
                      const items = Array.isArray(data) ? data : (data?.data ?? []);
                      const total = data?.pagination?.total ?? items.length;
                      return { items, total };
                    }}
                    getOptionId={(c: any) => c.id}
                    getOptionLabel={(c: any) => c.name || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()}
                    getOptionDescription={(c: any) => c.email ?? undefined}
                    resolveSelected={async (id) => (await contactsApi.getById(id)).data as any}
                    placeholder="Select a contact"
                    searchPlaceholder="Search contacts..."
                    required
                    error={form.formState.errors.contactId?.message}
                  />
                </FormRow>
              </div>
            </SectionCard>

            <SectionCard title="Lead Details" required>
              <div className="grid gap-ds-4 sm:grid-cols-2">
                <FormRow name="title" label="Title" required wide>
                  <Input id="title" placeholder="e.g., Maldives Honeymoon Package" {...form.register('title')} />
                </FormRow>
                <FormRow name="destinations" label="Destinations" required>
                  <div className="flex flex-wrap gap-1.5 p-2 border border-ds-border rounded-ds-md min-h-[36px] bg-ds-background">
                    {destinations.map((dest: string, i: number) => (
                      <Tag key={i} tone="primary" onRemove={() => form.setValue('destinations', destinations.filter((_: string, j: number) => j !== i), { shouldDirty: true, shouldValidate: true })}>
                        {dest}
                      </Tag>
                    ))}
                    <input
                      className="flex-1 min-w-[120px] text-sm bg-transparent outline-none"
                      placeholder={destinations.length === 0 ? 'Type & press Enter...' : 'Add more...'}
                      value={destInput}
                      onChange={(e) => setDestInput(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ',') && destInput.trim()) {
                          e.preventDefault();
                          if (!destinations.includes(destInput.trim())) {
                            form.setValue('destinations', [...destinations, destInput.trim()], { shouldDirty: true, shouldValidate: true });
                          }
                          setDestInput('');
                        }
                        if (e.key === 'Backspace' && !destInput && destinations.length > 0) {
                          form.setValue('destinations', destinations.slice(0, -1), { shouldDirty: true, shouldValidate: true });
                        }
                      }}
                    />
                  </div>
                </FormRow>
                <FormRow name="tripType" label="Trip Type" required>
                  <Select value={form.watch('tripType')} onValueChange={(v) => form.setValue('tripType', v, { shouldDirty: true })}>
                    <SelectTrigger id="tripType"><SelectValue placeholder="Select" /></SelectTrigger>
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
                </FormRow>
                <FormRow name="travelDate" label="Travel Date" required>
                  <DatePicker
                    value={form.watch('travelDate')}
                    onChange={(d) => form.setValue('travelDate', d as Date, { shouldDirty: true, shouldValidate: true })}
                    minDate={new Date()}
                    placeholder="Pick travel date"
                  />
                </FormRow>
                <FormRow name="returnDate" label="Return Date">
                  <DatePicker
                    value={form.watch('returnDate')}
                    onChange={(d) => form.setValue('returnDate', d, { shouldDirty: true })}
                    minDate={form.watch('travelDate') || new Date()}
                    placeholder="Pick return date"
                  />
                </FormRow>
              </div>
            </SectionCard>

            <SectionCard title="Passengers & Budget">
              <div className="grid gap-ds-4 sm:grid-cols-2">
                <FormRow name="paxAdults" label="Adults">
                  <Input id="paxAdults" type="number" min={1} {...form.register('paxAdults', { valueAsNumber: true })} />
                </FormRow>
                <FormRow name="paxChildren" label="Children">
                  <Input id="paxChildren" type="number" min={0} {...form.register('paxChildren', { valueAsNumber: true })} />
                </FormRow>
                <FormRow name="paxInfants" label="Infants">
                  <Input id="paxInfants" type="number" min={0} {...form.register('paxInfants', { valueAsNumber: true })} />
                </FormRow>
                <FormRow name="budget" label="Budget">
                  <CurrencyInput
                    value={form.watch('budget')}
                    onChange={(v) => form.setValue('budget', v, { shouldDirty: true })}
                    currency={form.watch('currency')}
                  />
                </FormRow>
                <FormRow name="currency" label="Currency">
                  <Select value={form.watch('currency')} onValueChange={(v) => form.setValue('currency', v, { shouldDirty: true })}>
                    <SelectTrigger id="currency"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['INR', 'USD', 'EUR', 'GBP', 'AED'].map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormRow>
              </div>
            </SectionCard>

            <SectionCard title="Classification">
              <div className="grid gap-ds-4 sm:grid-cols-2">
                <FormRow name="priority" label="Priority">
                  <Select value={form.watch('priority')} onValueChange={(v) => form.setValue('priority', v, { shouldDirty: true })}>
                    <SelectTrigger id="priority"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hot">Hot</SelectItem>
                      <SelectItem value="warm">Warm</SelectItem>
                      <SelectItem value="cold">Cold</SelectItem>
                    </SelectContent>
                  </Select>
                </FormRow>
                <FormRow name="source" label="Source" required>
                  <Select value={form.watch('source')} onValueChange={(v) => form.setValue('source', v, { shouldDirty: true, shouldValidate: true })}>
                    <SelectTrigger id="source"><SelectValue placeholder="Select source" /></SelectTrigger>
                    <SelectContent>
                      {LEAD_SOURCES.map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">{s.replace('_', ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormRow>
                <FormRow name="assignedTo" label="Assigned To" wide>
                  <RelationCombobox
                    value={form.watch('assignedTo') || null}
                    onChange={(id) => form.setValue('assignedTo', id ?? '', { shouldDirty: true })}
                    fetcher={async (q, page) => {
                      const r = await usersApi.list({ search: q, page, limit: 20 });
                      return { items: r.data, total: r.pagination.total };
                    }}
                    getOptionId={(u: any) => u.id}
                    getOptionLabel={(u: any) => u.name || u.email}
                    resolveSelected={async (id) => (await usersApi.getById(id)).data as any}
                    placeholder="Select agent"
                    searchPlaceholder="Search team..."
                  />
                </FormRow>
              </div>
            </SectionCard>

            <SectionCard title="Additional Details">
              <div className="grid gap-ds-4 sm:grid-cols-2">
                <FormRow name="specialRequirements" label="Special Requirements" wide>
                  <Textarea id="specialRequirements" placeholder="Any special requirements, preferences..." rows={4} {...form.register('specialRequirements')} />
                </FormRow>
                <FormRow name="notes" label="Notes" wide>
                  <Textarea id="notes" placeholder="Internal notes about this lead..." rows={3} {...form.register('notes')} />
                </FormRow>
              </div>
            </SectionCard>
          </>
        );
      }}
    />
  );
}
