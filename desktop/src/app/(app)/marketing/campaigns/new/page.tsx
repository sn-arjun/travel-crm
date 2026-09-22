'use client';

import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import { Input, Textarea, SectionCard } from '@/components/ui';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { marketingApi, type MarketingSegment } from '@/lib/api/marketing';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  channel: z.enum(['email', 'sms', 'whatsapp', 'push', 'social']),
  subject: z.string().optional(),
  content: z.string().optional(),
  segmentId: z.string().optional(),
  scheduledFor: z.date().optional(),
});
type CampaignForm = z.infer<typeof schema>;

export default function NewMarketingCampaignPage() {
  const router = useRouter();

  return (
    <EntityForm<CampaignForm>
      title="New campaign"
      description="Create a multi-channel marketing campaign."
      schema={schema}
      defaultValues={{
        name: '',
        description: '',
        channel: 'email',
        subject: '',
        content: '',
        segmentId: '',
        scheduledFor: undefined,
      }}
      prefillFromParams={{ segmentId: 'segmentId' }}
      onCancel={() => router.back()}
      onSubmit={async (values) => {
        try {
          const res = await marketingApi.campaigns.create({
            name: values.name,
            description: values.description || undefined,
            channel: values.channel,
            subject: values.subject || undefined,
            content: values.content || undefined,
            segmentId: values.segmentId || undefined,
            scheduledFor: values.scheduledFor ? values.scheduledFor.toISOString() : undefined,
          });
          toast.success('Campaign created');
          router.push(`/marketing/campaigns/${res.data.id}`);
        } catch {
          toast.error('Failed to create campaign');
        }
      }}
      renderSections={(form) => (
        <>
          <SectionCard title="Details" required>
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="name" label="Campaign name" required wide>
                <Input {...form.register('name')} id="name" />
              </FormRow>
              <FormRow name="channel" label="Channel" required>
                <Select
                  value={form.watch('channel')}
                  onValueChange={(v) => form.setValue('channel', v as CampaignForm['channel'], { shouldDirty: true })}
                >
                  <SelectTrigger id="channel">
                    <SelectValue placeholder="Select channel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="push">Push</SelectItem>
                    <SelectItem value="social">Social</SelectItem>
                  </SelectContent>
                </Select>
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
              <FormRow name="description" label="Internal description" wide>
                <Textarea {...form.register('description')} id="description" rows={2} />
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="Message content">
            <div className="grid gap-ds-4">
              {form.watch('channel') === 'email' && (
                <FormRow name="subject" label="Subject line" required>
                  <Input {...form.register('subject')} id="subject" />
                </FormRow>
              )}
              <FormRow name="content" label="Message body" required wide>
                <Textarea {...form.register('content')} id="content" rows={8} />
              </FormRow>
            </div>
          </SectionCard>
        </>
      )}
    />
  );
}
