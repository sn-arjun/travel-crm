'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { z } from 'zod';
import { toast } from 'sonner';
import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import { Button, CurrencyInput, DatePicker, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Textarea } from '@/components/ui';
import { fetchSupplierOptions, fromDateOnly, rateCardsApi, supplierLabel, toDateOnly } from '@/lib/api/rate-cards';
import { PageContainer } from '@/components/layout/page-container';
import { suppliersApi } from '@/lib/api/suppliers';
import type { Supplier } from '@travelcrm/shared';

const schema = z.object({
  name: z.string().min(1, 'Service name is required'),
  serviceType: z.enum(['hotel', 'transport', 'activity', 'meal', 'flight'], { message: 'Category is required' }),
  supplierId: z.string().nullable(),
  costPrice: z.number({ message: 'Rate is required' }).min(0.01, 'Rate must be greater than 0'),
  sellingPrice: z.number().optional(),
  currency: z.string(),
  season: z.enum(['peak', 'off_peak', 'shoulder']).nullable().optional(),
  unit: z.enum(['per_person', 'per_room', 'per_vehicle', 'per_day']).nullable().optional(),
  validFrom: z.date().optional(),
  validTo: z.date().optional(),
  description: z.string().optional(),
});
type RateCardForm = z.infer<typeof schema>;

export default function EditRateCardPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [defaultValues, setDefaultValues] = React.useState<RateCardForm | null>(null);
  const [loadError, setLoadError] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    rateCardsApi
      .getById(id)
      .then((res) => {
        if (cancelled) return;
        const rc = res.data;
        setDefaultValues({
          name: rc.name,
          serviceType: rc.serviceType,
          supplierId: rc.supplierId ?? null,
          costPrice: rc.costPrice,
          sellingPrice: rc.sellingPrice ?? undefined,
          currency: rc.currency,
          season: rc.season ?? null,
          unit: rc.unit ?? null,
          validFrom: rc.validFrom ? fromDateOnly(rc.validFrom) : undefined,
          validTo: rc.validTo ? fromDateOnly(rc.validTo) : undefined,
          description: rc.description ?? '',
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center gap-ds-4 h-full">
        <p className="text-ds-danger">Failed to load rate card</p>
        <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  if (!defaultValues) {
    return (
      <PageContainer>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </PageContainer>
    );
  }

  return (
    <EntityForm<RateCardForm>
      title="Edit Rate Card"
      schema={schema}
      defaultValues={defaultValues}
      onCancel={() => router.back()}
      submitLabel="Save Changes"
      onSubmit={async (v) => {
        try {
          await rateCardsApi.update(id, {
            name: v.name,
            serviceType: v.serviceType,
            supplierId: v.supplierId,
            costPrice: v.costPrice,
            sellingPrice: v.sellingPrice,
            currency: v.currency,
            season: v.season,
            unit: v.unit,
            validFrom: v.validFrom ? toDateOnly(v.validFrom) : undefined,
            validTo: v.validTo ? toDateOnly(v.validTo) : undefined,
            description: v.description,
          });
          toast.success('Rate card updated');
          router.push('/rate-cards');
        } catch {
          toast.error('Failed to update rate card');
        }
      }}
      renderSections={(form) => (
        <>
          <FormRow name="name" label="Service Name" required wide>
            <Input id="name" placeholder="e.g., Deluxe Room, Airport Transfer" {...form.register('name')} />
          </FormRow>

          <FormRow name="serviceType" label="Category" required>
            <Select value={form.watch('serviceType')} onValueChange={(v) => form.setValue('serviceType', v as RateCardForm['serviceType'], { shouldDirty: true })}>
              <SelectTrigger id="serviceType"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hotel">Hotel</SelectItem>
                <SelectItem value="transport">Transport</SelectItem>
                <SelectItem value="activity">Activity</SelectItem>
                <SelectItem value="meal">Meal</SelectItem>
                <SelectItem value="flight">Flight</SelectItem>
              </SelectContent>
            </Select>
          </FormRow>

          <FormRow name="supplierId" label="Supplier" hint="Optional">
            <RelationCombobox<Supplier>
              value={form.watch('supplierId')}
              onChange={(sid) => form.setValue('supplierId', sid, { shouldDirty: true })}
              fetcher={fetchSupplierOptions}
              getOptionId={(s) => s.id}
              getOptionLabel={(s) => supplierLabel(s)}
              resolveSelected={async (sid) => (await suppliersApi.getById(sid)).data}
              placeholder="Select supplier (optional)"
              searchPlaceholder="Search suppliers..."
            />
          </FormRow>

          <FormRow name="season" label="Season" hint="Optional">
            <Select value={form.watch('season') ?? 'none'} onValueChange={(v) => form.setValue('season', v === 'none' ? null : (v as RateCardForm['season']), { shouldDirty: true })}>
              <SelectTrigger id="season"><SelectValue placeholder="Select season" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="peak">Peak</SelectItem>
                <SelectItem value="off_peak">Off Peak</SelectItem>
                <SelectItem value="shoulder">Shoulder</SelectItem>
              </SelectContent>
            </Select>
          </FormRow>

          <FormRow name="costPrice" label="Cost Price" required>
            <CurrencyInput
              id="costPrice"
              value={form.watch('costPrice')}
              onChange={(v) => form.setValue('costPrice', v as number, { shouldDirty: true })}
              currency={form.watch('currency')}
            />
          </FormRow>

          <FormRow name="sellingPrice" label="Selling Price" hint="Optional — defaults to cost price">
            <CurrencyInput
              id="sellingPrice"
              value={form.watch('sellingPrice')}
              onChange={(v) => form.setValue('sellingPrice', v, { shouldDirty: true })}
              currency={form.watch('currency')}
            />
          </FormRow>

          <FormRow name="currency" label="Currency">
            <Select value={form.watch('currency')} onValueChange={(v) => form.setValue('currency', v, { shouldDirty: true })}>
              <SelectTrigger id="currency"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="INR">INR</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
              </SelectContent>
            </Select>
          </FormRow>

          <FormRow name="unit" label="Unit" hint="Optional">
            <Select value={form.watch('unit') ?? 'none'} onValueChange={(v) => form.setValue('unit', v === 'none' ? null : (v as RateCardForm['unit']), { shouldDirty: true })}>
              <SelectTrigger id="unit"><SelectValue placeholder="Select unit" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="per_person">Per Person</SelectItem>
                <SelectItem value="per_room">Per Room</SelectItem>
                <SelectItem value="per_vehicle">Per Vehicle</SelectItem>
                <SelectItem value="per_day">Per Day</SelectItem>
              </SelectContent>
            </Select>
          </FormRow>

          <FormRow name="validFrom" label="Valid From" hint="Optional">
            <DatePicker value={form.watch('validFrom')} onChange={(d) => form.setValue('validFrom', d, { shouldDirty: true })} />
          </FormRow>

          <FormRow name="validTo" label="Valid To" hint="Optional">
            <DatePicker value={form.watch('validTo')} onChange={(d) => form.setValue('validTo', d, { shouldDirty: true })} minDate={form.watch('validFrom')} />
          </FormRow>

          <FormRow name="description" label="Notes" wide hint="Optional">
            <Textarea id="description" rows={4} placeholder="Additional notes or terms..." {...form.register('description')} />
          </FormRow>
        </>
      )}
    />
  );
}
