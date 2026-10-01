'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { z } from 'zod';
import { toast } from 'sonner';

import { EntityForm, FormRow } from '@/components/domain/entity-form';
import { SectionCard } from '@/components/ui/section-card';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useApiQuery } from '@/hooks/use-api';
import { visaService, visaTypeLabel, parseDateOnly, toDateOnly } from '@/lib/api/visa';

const STATUS_OPTIONS = [
  { label: 'Not Started', value: 'not_started' },
  { label: 'Documents Collecting', value: 'documents_collecting' },
  { label: 'Applied', value: 'applied' },
  { label: 'Processing', value: 'processing' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
];

const schema = z.object({
  status: z.enum(['not_started', 'documents_collecting', 'applied', 'approved', 'rejected', 'processing']),
  applicationDate: z.date().optional(),
  expiryDate: z.date().optional(),
  notes: z.string().optional(),
});
type VisaEditForm = z.infer<typeof schema>;

function parseDate(s?: string): Date | undefined {
  return s ? parseDateOnly(s) : undefined;
}

export default function EditVisaApplicationPage() {
  const router = useRouter();
  const params = useParams();
  const visaId = params.id as string;

  const { data: visa, loading } = useApiQuery(() => visaService.getById(visaId), [visaId]);

  if (loading || !visa) {
    return (
      <div className="flex flex-col gap-ds-4 p-ds-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <EntityForm<VisaEditForm>
      title={`Edit ${visa.travellerName}`}
      description="Update visa application details."
      schema={schema}
      defaultValues={{
        status: visa.status,
        applicationDate: parseDate(visa.applicationDate),
        expiryDate: parseDate(visa.expiryDate),
        notes: visa.notes ?? '',
      }}
      submitLabel="Save Changes"
      onCancel={() => router.back()}
      onSubmit={async (v) => {
        await visaService.update(visaId, {
          status: v.status,
          applicationDate: v.applicationDate ? toDateOnly(v.applicationDate) : undefined,
          expiryDate: v.expiryDate ? toDateOnly(v.expiryDate) : undefined,
          notes: v.notes ?? '',
        });
        toast.success('Visa application updated');
        router.push(`/visa/${visaId}`);
      }}
      renderSections={(form) => (
        <SectionCard title="Visa Details" required>
          <div className="grid gap-ds-4 sm:grid-cols-2">
            <FormRow name="travellerName" label="Traveller" hint="Fixed once the application is created.">
              <Input id="travellerName" value={visa.travellerName} disabled readOnly />
            </FormRow>

            <FormRow name="countryName" label="Destination Country" hint="Fixed once the application is created.">
              <Input id="countryName" value={visa.countryName} disabled readOnly />
            </FormRow>

            <FormRow name="visaType" label="Visa Type" hint="Fixed once the application is created.">
              <Input id="visaType" value={visaTypeLabel(visa.visaType)} disabled readOnly />
            </FormRow>

            <FormRow name="status" label="Status" required>
              <Select value={form.watch('status')} onValueChange={(val) => form.setValue('status', val as VisaEditForm['status'], { shouldDirty: true })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status…" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormRow>

            <FormRow name="applicationDate" label="Application Date">
              <DatePicker
                value={form.watch('applicationDate')}
                onChange={(d) => form.setValue('applicationDate', d, { shouldDirty: true })}
              />
            </FormRow>

            <FormRow name="expiryDate" label="Expiry Date">
              <DatePicker
                value={form.watch('expiryDate')}
                onChange={(d) => form.setValue('expiryDate', d, { shouldDirty: true })}
              />
            </FormRow>

            <FormRow name="notes" label="Notes" wide>
              <Textarea
                value={form.watch('notes')}
                onChange={(e) => form.setValue('notes', e.target.value, { shouldDirty: true })}
                placeholder="Any additional notes about this visa application…"
                rows={3}
              />
            </FormRow>
          </div>
        </SectionCard>
      )}
    />
  );
}
