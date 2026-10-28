'use client';

import { getLocaleContext } from '@/lib/locale';
import { currencyCodes } from '@/lib/locale-options';
import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { z } from 'zod';
import { Loader2, AlertCircle } from 'lucide-react';
import { EntityForm, FormRow } from '@/components/domain';
import {
  Input, Textarea, SectionCard, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  CurrencyInput, DatePicker, Tag, Button,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/use-api';
import { leadsApi, type UpdateLeadRequest } from '@/lib/api/leads';
import { LEAD_SOURCES, LEAD_STATUS_LABELS, type Lead } from '@travelcrm/shared';
import { LeadAssigneeField, LeadContactField } from '../../lead-form-fields';
import { LEAD_SOURCE_LABELS, PRIORITY_LABELS, TRIP_TYPE_LABELS, leadSourceLabel } from '../../lead-labels';
import { toast } from 'sonner';
import { parseLocalDate, toLocalDateString } from '@/lib/dates';

const schema = z.object({
  contactId: z.string().min(1, 'Contact is required'),
  title: z.string().min(1, 'Title is required'),
  destinations: z.array(z.string()),
  travelDate: z.date().optional(),
  returnDate: z.date().optional(),
  paxAdults: z.number().min(1),
  paxChildren: z.number().min(0),
  paxInfants: z.number().min(0),
  budget: z.number().optional(),
  currency: z.string(),
  tripType: z.string(),
  source: z.string(),
  status: z.string(),
  priority: z.string(),
  assignedTo: z.string().optional(),
  unassigned: z.boolean(),
  specialRequirements: z.string().optional(),
  notes: z.string().optional(),
});
type LeadFormValues = z.infer<typeof schema>;

export default function EditLeadPage() {
  const router = useRouter();
  const params = useParams();
  const leadId = params.id as string;
  const [destInput, setDestInput] = React.useState('');

  const { data: leadResponse, loading, error } = useApiQuery(() => leadsApi.getById(leadId), [leadId]);
  const lead = leadResponse?.data as (Lead & { destinations?: string[]; notes?: string }) | undefined;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-ds-foreground-muted" />
        <p className="text-ds-foreground-muted">Loading lead...</p>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-12 w-12 text-ds-danger" />
        <p className="text-ds-danger">Failed to load lead</p>
        <Button variant="outline" onClick={() => router.push('/leads')}>Back to Leads</Button>
      </div>
    );
  }

  return (
    <EntityForm<LeadFormValues>
      title="Edit lead"
      description={lead.title}
      submitLabel="Save Changes"
      schema={schema}
      defaultValues={{
        contactId: lead.contactId || '',
        title: lead.title || '',
        destinations: lead.destinations || (lead.destination ? [lead.destination] : []),
        travelDate: lead.travelDate ? parseLocalDate(lead.travelDate) : undefined,
        returnDate: lead.returnDate ? parseLocalDate(lead.returnDate) : undefined,
        paxAdults: lead.paxAdults ?? 1,
        paxChildren: lead.paxChildren ?? 0,
        paxInfants: lead.paxInfants ?? 0,
        budget: lead.budget ?? undefined,
        currency: lead.currency || getLocaleContext().currency,
        tripType: lead.tripType || 'domestic',
        source: lead.source || 'manual',
        status: lead.status || 'new',
        priority: lead.priority || 'warm',
        assignedTo: lead.assignedTo || '',
        unassigned: !lead.assignedTo,
        specialRequirements: lead.specialRequirements || '',
        notes: lead.notes || '',
      }}
      onCancel={() => router.back()}
      onSubmit={async (v) => {
        const result = await leadsApi.update(leadId, {
          contactId: v.contactId,
          title: v.title,
          destinations: v.destinations,
          travelDate: v.travelDate ? toLocalDateString(v.travelDate) : undefined,
          returnDate: v.returnDate ? toLocalDateString(v.returnDate) : undefined,
          paxAdults: v.paxAdults,
          paxChildren: v.paxChildren,
          paxInfants: v.paxInfants,
          budget: v.budget,
          currency: v.currency,
          tripType: v.tripType as UpdateLeadRequest['tripType'],
          source: v.source,
          status: v.status,
          priority: v.priority as UpdateLeadRequest['priority'],
          // Unassigned sends an explicit null; otherwise keep the chosen agent.
          assignedTo: v.unassigned ? null : v.assignedTo || undefined,
          specialRequirements: v.specialRequirements || undefined,
          notes: v.notes || undefined,
        });
        if (result) {
          toast.success('Lead updated successfully');
          router.push(`/leads/${leadId}`);
        } else {
          toast.error('Failed to update lead');
        }
      }}
      renderSections={(form) => {
        const destinations = form.watch('destinations') || [];
        return (
          <>
            <SectionCard title="Customer">
              <div className="grid gap-ds-4 sm:grid-cols-2">
                <FormRow name="contactId" label="Contact" required wide>
                  <LeadContactField
                    value={form.watch('contactId')}
                    onChange={(id) => form.setValue('contactId', id, { shouldDirty: true, shouldValidate: true })}
                    error={form.formState.errors.contactId?.message}
                  />
                </FormRow>
              </div>
            </SectionCard>

            <SectionCard title="Basic information">
              <div className="grid gap-ds-4 sm:grid-cols-2">
                <FormRow name="title" label="Title" required wide>
                  <Input id="title" placeholder="e.g., Maldives Honeymoon Package" {...form.register('title')} />
                </FormRow>
                <FormRow name="status" label="Status">
                  <Select value={form.watch('status')} onValueChange={(v) => form.setValue('status', v, { shouldDirty: true })}>
                    <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(LEAD_STATUS_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormRow>
                <FormRow name="priority" label="Priority">
                  <Select value={form.watch('priority')} onValueChange={(v) => form.setValue('priority', v, { shouldDirty: true })}>
                    <SelectTrigger id="priority"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormRow>
                <FormRow name="source" label="Source">
                  <Select value={form.watch('source')} onValueChange={(v) => form.setValue('source', v, { shouldDirty: true })}>
                    <SelectTrigger id="source"><SelectValue placeholder="Select source" /></SelectTrigger>
                    <SelectContent>
                      {LEAD_SOURCES.map((s) => (
                        <SelectItem key={s} value={s}>{LEAD_SOURCE_LABELS[s] ?? leadSourceLabel(s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormRow>
                <FormRow name="assignedTo" label="Assigned to" wide>
                  <LeadAssigneeField
                    assignedTo={form.watch('assignedTo') ?? ''}
                    unassigned={form.watch('unassigned')}
                    onAssignedToChange={(id) => form.setValue('assignedTo', id, { shouldDirty: true })}
                    onUnassignedChange={(u) => {
                      form.setValue('unassigned', u, { shouldDirty: true });
                      if (u) form.setValue('assignedTo', '', { shouldDirty: true });
                    }}
                  />
                </FormRow>
              </div>
            </SectionCard>

            <SectionCard title="Trip Details">
              <div className="grid gap-ds-4 sm:grid-cols-2">
                <FormRow name="destinations" label="Destinations" wide>
                  <div className="flex flex-wrap gap-1.5 p-2 border border-ds-border rounded-ds-md min-h-9 bg-ds-background">
                    {destinations.map((dest: string, i: number) => (
                      <Tag key={i} tone="primary" onRemove={() => form.setValue('destinations', destinations.filter((_: string, j: number) => j !== i), { shouldDirty: true })}>
                        {dest}
                      </Tag>
                    ))}
                    <input
                      className="flex-1 min-w-32 text-sm bg-transparent outline-none"
                      placeholder={destinations.length === 0 ? 'Type & press Enter...' : 'Add more...'}
                      value={destInput}
                      onChange={(e) => setDestInput(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ',') && destInput.trim()) {
                          e.preventDefault();
                          if (!destinations.includes(destInput.trim())) {
                            form.setValue('destinations', [...destinations, destInput.trim()], { shouldDirty: true });
                          }
                          setDestInput('');
                        }
                        if (e.key === 'Backspace' && !destInput && destinations.length > 0) {
                          form.setValue('destinations', destinations.slice(0, -1), { shouldDirty: true });
                        }
                      }}
                    />
                  </div>
                </FormRow>
                <FormRow name="tripType" label="Trip Type">
                  <Select value={form.watch('tripType')} onValueChange={(v) => form.setValue('tripType', v, { shouldDirty: true })}>
                    <SelectTrigger id="tripType"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TRIP_TYPE_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormRow>
                <FormRow name="travelDate" label="Travel Date">
                  <DatePicker
                    value={form.watch('travelDate')}
                    onChange={(d) => form.setValue('travelDate', d, { shouldDirty: true })}
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
                <FormRow name="paxAdults" label="Adults">
                  <Input id="paxAdults" type="number" min={1} {...form.register('paxAdults', { valueAsNumber: true })} />
                </FormRow>
                <FormRow name="paxChildren" label="Children">
                  <Input id="paxChildren" type="number" min={0} {...form.register('paxChildren', { valueAsNumber: true })} />
                </FormRow>
                <FormRow name="paxInfants" label="Infants">
                  <Input id="paxInfants" type="number" min={0} {...form.register('paxInfants', { valueAsNumber: true })} />
                </FormRow>
              </div>
            </SectionCard>

            <SectionCard title="Financial">
              <div className="grid gap-ds-4 sm:grid-cols-2">
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
                      {currencyCodes(form.watch('currency')).map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
