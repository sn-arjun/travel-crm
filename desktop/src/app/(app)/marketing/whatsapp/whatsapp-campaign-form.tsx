'use client';

import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import { Input, SectionCard } from '@/components/ui';
import { DatePicker } from '@/components/ui/date-picker';
import { listWhatsappTemplates, whatsappCampaignsApi } from '@/lib/api/whatsapp-campaigns';
import { templatesApi, type MessageTemplate } from '@/lib/api/templates';
import { marketingApi, type MarketingSegment } from '@/lib/api/marketing';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  templateId: z.string().min(1, 'Pick an approved WhatsApp template'),
  segmentId: z.string().optional(),
  scheduledFor: z.date().optional(),
});
type WhatsappCampaignForm = z.infer<typeof schema>;

interface Props {
  /** Present when editing a draft campaign. */
  campaignId?: string;
  initial?: Partial<WhatsappCampaignForm>;
}

export function WhatsappCampaignFormPage({ campaignId, initial }: Props) {
  const router = useRouter();

  return (
    <EntityForm<WhatsappCampaignForm>
      title={campaignId ? 'Edit WhatsApp campaign' : 'New WhatsApp campaign'}
      description="Send a bulk WhatsApp message from an approved template to a segment of contacts."
      schema={schema}
      defaultValues={{ name: '', templateId: '', segmentId: '', scheduledFor: undefined, ...initial }}
      prefillFromParams={campaignId ? undefined : { segmentId: 'segmentId' }}
      onCancel={() => router.back()}
      onSubmit={async (values) => {
        const payload = {
          name: values.name,
          templateId: values.templateId,
          segmentId: values.segmentId || '',
          scheduledFor: values.scheduledFor ? values.scheduledFor.toISOString() : undefined,
        };
        try {
          if (campaignId) {
            await whatsappCampaignsApi.update(campaignId, payload);
            toast.success('Campaign updated');
            router.push(`/marketing/whatsapp/${campaignId}`);
          } else {
            const res = await whatsappCampaignsApi.create(payload);
            toast.success('Campaign created');
            router.push(`/marketing/whatsapp/${res.data.id}`);
          }
        } catch {
          toast.error(campaignId ? 'Failed to update campaign' : 'Failed to create campaign');
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
                onChange={(id) => form.setValue('templateId', id ?? '', { shouldDirty: true, shouldValidate: true })}
                fetcher={(query, page) => listWhatsappTemplates(query, page)}
                getOptionId={(t) => t.id}
                getOptionLabel={(t) => t.name}
                getOptionDescription={(t) => t.category ?? undefined}
                resolveSelected={async (id) => (await templatesApi.getById(id)).data}
                aria-label="WhatsApp template"
                placeholder="Select a template"
                searchPlaceholder="Search templates..."
                emptyText="No approved WhatsApp templates found."
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
                resolveSelected={async (id) => (await marketingApi.segments.get(id)).data}
                aria-label="Audience segment"
                placeholder="All contacts"
                searchPlaceholder="Search segments..."
              />
            </FormRow>
            <FormRow name="scheduledFor" label="Schedule for" hint="Leave blank to send manually">
              <DatePicker
                value={form.watch('scheduledFor')}
                onChange={(d) => form.setValue('scheduledFor', d, { shouldDirty: true })}
                minDate={campaignId ? undefined : new Date()}
              />
            </FormRow>
          </div>
        </SectionCard>
      )}
    />
  );
}
