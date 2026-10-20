'use client';

import { getLocaleContext } from '@/lib/locale';
import { currencyCodes } from '@/lib/locale-options';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { toast } from 'sonner';
import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import { CurrencyInput, DatePicker, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/ui';
import { fetchSupplierOptions, rateCardsApi, supplierLabel, toDateOnly } from '@/lib/api/rate-cards';
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

export default function NewRateCardPage() {
  const router = useRouter();

  return (
    <EntityForm<RateCardForm>
      title="New Rate Card"
      schema={schema}
      defaultValues={{
        name: '',
        serviceType: 'hotel',
        supplierId: null,
        costPrice: undefined as unknown as number,
        sellingPrice: undefined,
        currency: getLocaleContext().currency,
        season: null,
        unit: null,
        validFrom: undefined,
        validTo: undefined,
        description: '',
      }}
      prefillFromParams={{ supplierId: 'supplierId' }}
      onCancel={() => router.back()}
      onSubmit={async (v) => {
        try {
          await rateCardsApi.create({
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
          toast.success('Rate card created');
          router.push('/rate-cards');
        } catch {
          toast.error('Failed to create rate card');
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
              onChange={(id) => form.setValue('supplierId', id, { shouldDirty: true })}
              fetcher={fetchSupplierOptions}
              getOptionId={(s) => s.id}
              getOptionLabel={(s) => supplierLabel(s)}
              resolveSelected={async (id) => (await suppliersApi.getById(id)).data}
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
                {currencyCodes(form.watch('currency')).map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
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
