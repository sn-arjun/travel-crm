'use client';

import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import { Button, Input, SectionCard, Skeleton } from '@/components/ui';
import { DatePicker } from '@/components/ui/date-picker';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { whatsappCampaignsApi } from '@/lib/api/whatsapp-campaigns';
import { templatesApi, type MessageTemplate } from '@/lib/api/templates';
import { marketingApi, type MarketingSegment } from '@/lib/api/marketing';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  templateId: z.string().min(1, 'Pick an approved WhatsApp template'),
  segmentId: z.string().optional(),
  scheduledFor: z.date().optional(),
});
type WhatsappCampaignForm = z.infer<typeof schema>;

export default function NewWhatsappCampaignPage() {
  const router = useRouter();
  const { enabled, reason, loading: gateLoading } = useFeatureGate('whatsapp_campaigns');

  if (gateLoading) {
    return (
      <div className="flex flex-col gap-ds-4 p-ds-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-ds-3 p-ds-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-ds-full bg-ds-warning-subtle text-ds-warning-on-subtle">
          <Lock className="size-6" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-ds-foreground">WhatsApp Campaigns is not available on your plan</p>
        <p className="max-w-sm text-sm text-ds-foreground-subtle">
          {reason === 'cap_exceeded'
            ? 'You have reached your WhatsApp messaging limit for this billing period.'
            : 'Upgrade your plan to send bulk WhatsApp campaigns from approved templates.'}
        </p>
        <Button size="sm" variant="outline" asChild>
          <a href="/settings/billing">{reason === 'cap_exceeded' ? 'View usage' : 'Upgrade plan'}</a>
        </Button>
      </div>
    );
  }

  return (
    <EntityForm<WhatsappCampaignForm>
      title="New WhatsApp campaign"
      description="Send a bulk WhatsApp message from an approved template to a segment of contacts."
      schema={schema}
      defaultValues={{ name: '', templateId: '', segmentId: '', scheduledFor: undefined }}
      prefillFromParams={{ segmentId: 'segmentId' }}
      onCancel={() => router.back()}
      onSubmit={async (values) => {
        try {
          const res = await whatsappCampaignsApi.create({
            name: values.name,
            templateId: values.templateId,
            segmentId: values.segmentId || undefined,
            scheduledFor: values.scheduledFor ? values.scheduledFor.toISOString() : undefined,
          });
          toast.success('Campaign created');
          router.push(`/marketing/whatsapp/${res.data.id}`);
        } catch {
          toast.error('Failed to create campaign');
        }
      }}
      renderSections={(form) => (
        <SectionCard title="Details" required>
          <div className="grid gap-ds-4 sm:grid-cols-2">
            <FormRow name="name" label="Campaign name" required wide>
              <Input {...form.register('name')} id="name" placeholder="e.g., Summer sale blast" />
            </FormRow>
            <FormRow name="templateId" label="WhatsApp template" required hint="Only approved templates can be used">
              <RelationCombobox<MessageTemplate>
                value={form.watch('templateId') || null}
                onChange={(id) => form.setValue('templateId', id ?? '', { shouldDirty: true })}
                fetcher={async (query, page) => {
                  const r = await templatesApi.list({ channel: 'whatsapp', is_active: 1, search: query, page, limit: 20 });
                  return { items: r.data.data, total: r.data.pagination.total };
                }}
                getOptionId={(t) => t.id}
                getOptionLabel={(t) => t.name}
                getOptionDescription={(t) => t.category ?? undefined}
                resolveSelected={async (id) => (await templatesApi.getById(id)).data}
                placeholder="Select a template"
                searchPlaceholder="Search templates..."
                emptyText="No approved WhatsApp templates found."
                error={form.formState.errors.templateId?.message}
                required
              />
            </FormRow>
            <FormRow name="segmentId" label="Audience segment" hint="Leave blank to target all contacts">
              <RelationCombobox<MarketingSegment>
                value={form.watch('segmentId') || null}
                onChange={(id) => form.setValue('segmentId', id ?? '', { shouldDirty: true })}
                fetcher={async (query, page) => {
                  const r = await marketingApi.segments.list({ search: query, page, limit: 20 });
                  return { items: r.data.data, total: r.data.pagination.total };
                }}
                getOptionId={(s) => s.id}
                getOptionLabel={(s) => s.name}
                getOptionDescription={(s) => `${s.contactCount} contacts`}
                resolveSelected={async () => null}
                placeholder="All contacts"
                searchPlaceholder="Search segments..."
              />
            </FormRow>
            <FormRow name="scheduledFor" label="Schedule for" hint="Leave blank to send manually">
              <DatePicker
                value={form.watch('scheduledFor')}
                onChange={(d) => form.setValue('scheduledFor', d, { shouldDirty: true })}
                minDate={new Date()}
              />
            </FormRow>
          </div>
        </SectionCard>
      )}
    />
  );
}
