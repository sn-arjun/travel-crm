'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { z } from 'zod';
import { toast } from 'sonner';
import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import { Button, Input, Skeleton, Textarea } from '@/components/ui';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SectionCard } from '@/components/ui';
import { marketingApi, type MarketingSegment } from '@/lib/api/marketing';
import { unwrapList } from '@/lib/api/envelope';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  channel: z.enum(['email', 'sms', 'whatsapp']),
  subject: z.string().optional(),
  content: z.string().optional(),
  segmentId: z.string().optional(),
  scheduledFor: z.date().optional(),
});
type CampaignForm = z.infer<typeof schema>;

export default function EditMarketingCampaignPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [defaultValues, setDefaultValues] = React.useState<CampaignForm | null>(null);
  const [loadError, setLoadError] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    marketingApi.campaigns
      .get(id)
      .then((res) => {
        if (cancelled) return;
        const c = res.data;
        setDefaultValues({
          name: c.name,
          description: c.description ?? '',
          channel: c.channel,
          subject: c.subject ?? '',
          content: c.content ?? '',
          segmentId: c.segmentId ?? '',
          scheduledFor: c.scheduledFor ? new Date(c.scheduledFor) : undefined,
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
      <div className="flex flex-col items-center justify-center gap-ds-4 min-h-64">
        <p className="text-ds-danger">Failed to load campaign</p>
        <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  if (!defaultValues) {
    return (
      <div className="flex flex-col gap-ds-4 p-ds-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <EntityForm<CampaignForm>
      title="Edit campaign"
      description="Update campaign details and message content."
      schema={schema}
      defaultValues={defaultValues}
      onCancel={() => router.back()}
      submitLabel="Save changes"
      onSubmit={async (values) => {
        try {
          await marketingApi.campaigns.update(id, {
            name: values.name,
            description: values.description || undefined,
            channel: values.channel,
            subject: values.subject || undefined,
            content: values.content || undefined,
            segmentId: values.segmentId || undefined,
            scheduledFor: values.scheduledFor ? values.scheduledFor.toISOString() : undefined,
          });
          toast.success('Campaign updated');
          router.push(`/marketing/campaigns/${id}`);
        } catch {
          toast.error('Failed to update campaign');
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
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow name="segmentId" label="Audience segment" hint="Leave blank to target all contacts">
                <RelationCombobox<MarketingSegment>
                  value={form.watch('segmentId') || null}
                  onChange={(sid) => form.setValue('segmentId', sid ?? '', { shouldDirty: true })}
                  fetcher={async (query, page) => {
                    const r = unwrapList<MarketingSegment>(
                      await marketingApi.segments.list({ search: query || undefined, page, limit: 20 }),
                    );
                    return { items: r.data, total: r.pagination.total };
                  }}
                  getOptionId={(s) => s.id}
                  getOptionLabel={(s) => s.name}
                  getOptionDescription={(s) => `${s.contactCount} contacts`}
                  resolveSelected={async (sid) => marketingApi.segments.get(sid).then((r) => r.data)}
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
