'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { EntityForm, FormRow } from '@/components/domain';
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SectionCard,
  Skeleton,
  Switch,
} from '@/components/ui';
import { toast } from 'sonner';
import { settingsApi } from '@/lib/api/settings';
import { useApiQuery } from '@/hooks/use-api';
import { PageContainer } from '@/components/layout/page-container';

const schema = z.object({
  invoicePrefix: z.string().min(1, 'Required'),
  proformaPrefix: z.string().min(1, 'Required'),
  receiptPrefix: z.string().min(1, 'Required'),
  creditNotePrefix: z.string().min(1, 'Required'),
  debitNotePrefix: z.string().min(1, 'Required'),
  voucherPrefix: z.string().min(1, 'Required'),
  fyStartMonth: z.string(),
  resetYearly: z.boolean(),
});
type NumberingForm = z.infer<typeof schema>;

const defaultValues: NumberingForm = {
  invoicePrefix: 'INV',
  proformaPrefix: 'PI',
  receiptPrefix: 'RCP',
  creditNotePrefix: 'CN',
  debitNotePrefix: 'DN',
  voucherPrefix: 'VCH',
  fyStartMonth: '4',
  resetYearly: true,
};

const months: Array<[string, string]> = [
  ['1', 'January'], ['2', 'February'], ['3', 'March'], ['4', 'April'],
  ['5', 'May'], ['6', 'June'], ['7', 'July'], ['8', 'August'],
  ['9', 'September'], ['10', 'October'], ['11', 'November'], ['12', 'December'],
];

export default function NumberingSettingsPage() {
  const router = useRouter();
  const { data: response, loading } = useApiQuery(() => settingsApi.numberingConfig.get(), []);

  const config = React.useMemo(() => {
    if (!response || !('data' in response)) return null;
    return response.data ?? null;
  }, [response]);

  if (loading) {
    return (
      <PageContainer>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </PageContainer>
    );
  }

  return (
    <EntityForm<NumberingForm>
      title="Document Numbering"
      description="Configure prefixes and numbering rules for invoices and documents."
      schema={schema}
      defaultValues={{
        invoicePrefix: config?.invoicePrefix ?? defaultValues.invoicePrefix,
        proformaPrefix: config?.proformaPrefix ?? defaultValues.proformaPrefix,
        receiptPrefix: config?.receiptPrefix ?? defaultValues.receiptPrefix,
        creditNotePrefix: config?.creditNotePrefix ?? defaultValues.creditNotePrefix,
        debitNotePrefix: config?.debitNotePrefix ?? defaultValues.debitNotePrefix,
        voucherPrefix: config?.voucherPrefix ?? defaultValues.voucherPrefix,
        fyStartMonth: String(config?.fyStartMonth ?? defaultValues.fyStartMonth),
        resetYearly: config?.resetYearly ?? defaultValues.resetYearly,
      }}
      onCancel={() => router.push('/settings')}
      onSubmit={async (v) => {
        try {
          await settingsApi.numberingConfig.update({
            ...v,
            fyStartMonth: parseInt(v.fyStartMonth, 10),
          });
        } catch {
          toast.error('Failed to save numbering configuration');
          return;
        }
        toast.success('Numbering configuration saved successfully');
        router.push('/settings');
      }}
      renderSections={(form) => (
        <SectionCard title="Document Prefixes" required>
          <div className="grid gap-ds-4 sm:grid-cols-3">
            <FormRow name="invoicePrefix" label="Invoice Prefix" required>
              <Input {...form.register('invoicePrefix')} id="invoicePrefix" placeholder="INV" />
            </FormRow>
            <FormRow name="proformaPrefix" label="Proforma Prefix" required>
              <Input {...form.register('proformaPrefix')} id="proformaPrefix" placeholder="PI" />
            </FormRow>
            <FormRow name="receiptPrefix" label="Receipt Prefix" required>
              <Input {...form.register('receiptPrefix')} id="receiptPrefix" placeholder="RCP" />
            </FormRow>
            <FormRow name="creditNotePrefix" label="Credit Note Prefix" required>
              <Input {...form.register('creditNotePrefix')} id="creditNotePrefix" placeholder="CN" />
            </FormRow>
            <FormRow name="debitNotePrefix" label="Debit Note Prefix" required>
              <Input {...form.register('debitNotePrefix')} id="debitNotePrefix" placeholder="DN" />
            </FormRow>
            <FormRow name="voucherPrefix" label="Voucher Prefix" required>
              <Input {...form.register('voucherPrefix')} id="voucherPrefix" placeholder="VCH" />
            </FormRow>
            <FormRow name="fyStartMonth" label="Financial Year Start Month">
              <Select value={form.watch('fyStartMonth')} onValueChange={(v) => form.setValue('fyStartMonth', v, { shouldDirty: true })}>
                <SelectTrigger id="fyStartMonth"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {months.map(([v, label]) => (
                    <SelectItem key={v} value={v}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormRow>
            <FormRow name="resetYearly" label="Reset Numbering Yearly" wide>
              <div className="flex items-center gap-ds-3">
                <Switch
                  checked={form.watch('resetYearly')}
                  onCheckedChange={(v) => form.setValue('resetYearly', v, { shouldDirty: true })}
                />
                <span className="text-sm text-ds-foreground-muted">
                  {form.watch('resetYearly') ? 'Numbers reset at FY start' : 'Continuous numbering'}
                </span>
              </div>
            </FormRow>
          </div>
        </SectionCard>
      )}
    />
  );
}
