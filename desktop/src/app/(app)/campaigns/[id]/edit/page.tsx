'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { z } from 'zod';
import { Loader2, Mail, MessageSquare } from 'lucide-react';
import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import {
  Input, Textarea, SectionCard, EmptyState, Button,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/use-api';
import { campaignsApi } from '@/lib/api/campaigns';
import { templatesApi, type MessageTemplate } from '@/lib/api/templates';
import { unwrapList } from '@/lib/api/envelope';
import type { Campaign } from '@travelcrm/shared';
import { toast } from 'sonner';

const schema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  subject: z.string().optional(),
  contentSource: z.enum(['template', 'custom']),
  templateId: z.string().optional(),
  body: z.string().optional(),
}).refine((v) => v.contentSource !== 'template' || !!v.templateId, {
  message: 'Select a template', path: ['templateId'],
}).refine((v) => v.contentSource !== 'custom' || !!v.body?.trim(), {
  message: 'Write the message content', path: ['body'],
});
type CampaignFormValues = z.infer<typeof schema>;

export default function EditCampaignPage() {
  const router = useRouter();
  const params = useParams();
  const campaignId = params.id as string;

  const { data: campaignResponse, loading, error } = useApiQuery(() => campaignsApi.getById(campaignId), [campaignId]);
  const campaign = (campaignResponse?.data ?? null) as Campaign | null;

  if (loading) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-ds-4">
        <Loader2 className="size-10 animate-spin text-ds-foreground-muted" aria-hidden="true" />
        <p className="text-ds-foreground-muted">Loading campaign...</p>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <EmptyState
        title="Campaign not found"
        description="This campaign could not be loaded."
        action={<Button variant="outline" onClick={() => router.back()}>Go back</Button>}
      />
    );
  }

  if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
    return (
      <EmptyState
        title="Campaign can no longer be edited"
        description="Only draft or scheduled campaigns can be edited."
        action={<Button variant="outline" onClick={() => router.push(`/campaigns/${campaignId}`)}>Back to campaign</Button>}
      />
    );
  }

  return (
    <EntityForm<CampaignFormValues>
      title="Edit campaign"
      description="Update campaign details before it sends."
      schema={schema}
      defaultValues={{
        name: campaign.name,
        subject: campaign.subject || '',
        contentSource: campaign.templateId ? 'template' : 'custom',
        templateId: campaign.templateId || '',
        body: campaign.body || '',
      }}
      onCancel={() => router.push(`/campaigns/${campaignId}`)}
      onSubmit={async (v) => {
        const result = await campaignsApi.update(campaignId, {
          name: v.name,
          subject: v.subject || v.name,
          body: v.contentSource === 'custom' ? v.body : undefined,
          templateId: v.contentSource === 'template' ? v.templateId : undefined,
        });
        if (result) {
          toast.success('Campaign updated');
          router.push(`/campaigns/${campaignId}`);
        } else {
          toast.error('Failed to update campaign');
        }
      }}
      renderSections={(form) => {
        const contentSource = form.watch('contentSource');

        return (
          <>
            <SectionCard title="Campaign details" required>
              <div className="grid gap-ds-4 sm:grid-cols-2">
                <FormRow name="name" label="Campaign name" required wide>
                  <Input id="name" {...form.register('name')} />
                </FormRow>
                {campaign.type === 'email' && (
                  <FormRow name="subject" label="Email subject" wide>
                    <Input id="subject" {...form.register('subject')} />
                  </FormRow>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Content" required>
              <div className="flex flex-col gap-ds-4">
                {contentSource === 'template' && (
                  <FormRow name="templateId" label="Template" required wide>
                    <RelationCombobox
                      value={form.watch('templateId') || null}
                      onChange={(id) => form.setValue('templateId', id ?? '', { shouldDirty: true, shouldValidate: true })}
                      fetcher={async (q, page) => {
                        const r = unwrapList<MessageTemplate>(
                          await templatesApi.list({ channel: campaign.type, search: q || undefined, page, limit: 20 }),
                        );
                        return { items: r.data, total: r.pagination.total };
                      }}
                      getOptionId={(t: MessageTemplate) => t.id}
                      getOptionLabel={(t: MessageTemplate) => t.name}
                      getOptionDescription={(t: MessageTemplate) => t.subject}
                      resolveSelected={async (id) => {
                        const r = unwrapList<MessageTemplate>(
                          await templatesApi.list({ channel: campaign.type, limit: 100 }),
                        );
                        return r.data.find((t) => t.id === id) ?? null;
                      }}
                      placeholder="Choose a template"
                      searchPlaceholder="Search templates..."
                      error={form.formState.errors.templateId?.message}
                    />
                  </FormRow>
                )}
                {contentSource === 'custom' && (
                  <FormRow name="body" label="Message content" required wide>
                    <Textarea id="body" rows={8} {...form.register('body')} />
                  </FormRow>
                )}
                <p className="flex items-center gap-ds-1 text-xs text-ds-foreground-muted">
                  {campaign.type === 'email' ? <Mail className="size-3.5" /> : <MessageSquare className="size-3.5" />}
                  Channel: {campaign.type?.toUpperCase()} (cannot be changed)
                </p>
              </div>
            </SectionCard>
          </>
        );
      }}
    />
  );
}
