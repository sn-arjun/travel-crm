'use client';


import { formatLocaleNumber } from '@/lib/format';
import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { z } from 'zod';
import { Mail, MessageSquare } from 'lucide-react';
import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import {
  Input, Textarea, SectionCard, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  DatePicker, Tag, Checkbox,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/use-api';
import { campaignsApi } from '@/lib/api/campaigns';
import { templatesApi, type MessageTemplate } from '@/lib/api/templates';
import { contactsApi } from '@/lib/api/contacts';
import { marketingApi, type MarketingSegment } from '@/lib/api/marketing';
import { unwrapList } from '@/lib/api/envelope';
import { toast } from 'sonner';

const SMS_LIMIT = 160;

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

const leadStatuses = ['new', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost'];

const schema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  type: z.enum(['email', 'sms', 'whatsapp']),
  description: z.string().optional(),
  audienceType: z.enum(['tags', 'lead_status', 'segment']),
  tags: z.array(z.string()),
  statuses: z.array(z.string()),
  segmentId: z.string().optional(),
  contentSource: z.enum(['template', 'custom']),
  templateId: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  scheduleType: z.enum(['now', 'later']),
  scheduleDate: z.date().optional(),
  scheduleTime: z.string().optional(),
}).refine((v) => v.audienceType !== 'tags' || v.tags.length > 0, {
  message: 'Select at least one tag', path: ['tags'],
}).refine((v) => v.audienceType !== 'lead_status' || v.statuses.length > 0, {
  message: 'Select at least one status', path: ['statuses'],
}).refine((v) => v.audienceType !== 'segment' || !!v.segmentId, {
  message: 'Select a segment', path: ['segmentId'],
}).refine((v) => v.contentSource !== 'template' || !!v.templateId, {
  message: 'Select a template', path: ['templateId'],
}).refine((v) => v.contentSource !== 'custom' || !!v.body?.trim(), {
  message: 'Write the message content', path: ['body'],
}).refine((v) => v.type !== 'email' || v.contentSource !== 'custom' || !!v.subject?.trim(), {
  message: 'Email subject is required', path: ['subject'],
}).refine((v) => v.scheduleType !== 'later' || (!!v.scheduleDate && !!v.scheduleTime), {
  message: 'Pick a date and time', path: ['scheduleDate'],
});
type CampaignFormValues = z.infer<typeof schema>;

export default function NewCampaignPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { data: tagsResponse } = useApiQuery(() => contactsApi.getTags(), []);
  const availableTags: string[] = (tagsResponse?.data ?? []) as string[];
  const prefillSegmentId = searchParams.get('segmentId') || '';
  const prefillFestival = searchParams.get('festivalName') || '';
  const prefillSubject = searchParams.get('subject') || '';

  return (
    <EntityForm<CampaignFormValues>
      title="New campaign"
      description="Reach contacts by email, SMS or WhatsApp."
      schema={schema}
      defaultValues={{
        name: prefillFestival && prefillFestival !== 'Custom' ? `${prefillFestival} Campaign` : '',
        type: 'email',
        description: '',
        audienceType: prefillSegmentId ? 'segment' : 'tags',
        tags: [],
        statuses: [],
        segmentId: prefillSegmentId,
        contentSource: prefillSubject ? 'custom' : 'template',
        templateId: '',
        subject: prefillSubject,
        body: '',
        scheduleType: 'now',
        scheduleDate: undefined,
        scheduleTime: '',
      }}
      prefillFromParams={{ segmentId: 'segmentId' }}
      onCancel={() => router.back()}
      onSubmit={async (v) => {
        const segmentFilters: Record<string, unknown> = {};
        if (v.audienceType === 'tags') segmentFilters.tags = v.tags;
        if (v.audienceType === 'lead_status') segmentFilters.statuses = v.statuses;
        if (v.audienceType === 'segment' && v.segmentId) segmentFilters.segmentId = v.segmentId;

        const scheduledAt = v.scheduleType === 'later' && v.scheduleDate && v.scheduleTime
          ? (() => {
              const [h, m] = (v.scheduleTime as string).split(':').map(Number);
              const d = new Date(v.scheduleDate as Date);
              d.setHours(h ?? 0, m ?? 0, 0, 0);
              return d;
            })()
          : undefined;

        const result = await campaignsApi.create({
          name: v.name,
          type: v.type as 'email' | 'sms',
          subject: v.contentSource === 'custom' ? (v.subject || v.name) : v.name,
          body: v.contentSource === 'custom' ? v.body : undefined,
          templateId: v.contentSource === 'template' ? v.templateId : undefined,
          segmentFilters,
          description: v.description || undefined,
        });

        if (!result?.data) {
          toast.error('Failed to create campaign');
          return;
        }
        const created = result.data;

        if (v.scheduleType === 'later' && scheduledAt) {
          try {
            await campaignsApi.schedule(created.id, { scheduledAt: scheduledAt.toISOString() });
            toast.success('Campaign scheduled successfully');
          } catch {
            toast.error('Campaign saved as a draft, but it could not be scheduled');
          }
        } else if (v.scheduleType === 'now') {
          try {
            await campaignsApi.send(created.id, { sendImmediately: true });
            toast.success('Campaign launched successfully');
          } catch {
            toast.error('Campaign saved as a draft, but it could not be sent');
          }
        } else {
          toast.success('Campaign saved as draft');
        }
        router.push('/campaigns');
      }}
      renderSections={(form) => {
        const type = form.watch('type');
        const audienceType = form.watch('audienceType');
        const contentSource = form.watch('contentSource');
        const tags = form.watch('tags') || [];
        const statuses = form.watch('statuses') || [];
        const body = form.watch('body') || '';
        const scheduleType = form.watch('scheduleType');

        return (
          <>
            <SectionCard title="Campaign details" required>
              <div className="grid gap-ds-4 sm:grid-cols-2">
                <FormRow name="name" label="Campaign name" required wide>
                  <Input id="name" placeholder="e.g., Summer Holiday Offers" {...form.register('name')} />
                </FormRow>
                <FormRow name="type" label="Channel" required>
                  <Select value={type} onValueChange={(v) => form.setValue('type', v as CampaignFormValues['type'], { shouldDirty: true })}>
                    <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email"><span className="flex items-center gap-ds-2"><Mail className="size-4" /> Email</span></SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="whatsapp"><span className="flex items-center gap-ds-2"><MessageSquare className="size-4" /> WhatsApp</span></SelectItem>
                    </SelectContent>
                  </Select>
                </FormRow>
                <FormRow name="description" label="Description" wide>
                  <Textarea id="description" placeholder="What is this campaign about?" rows={3} {...form.register('description')} />
                </FormRow>
              </div>
            </SectionCard>

            <SectionCard title="Audience" required>
              <div className="flex flex-col gap-ds-4">
                <FormRow name="audienceType" label="Audience type" required>
                  <Select
                    value={audienceType}
                    onValueChange={(v) => form.setValue('audienceType', v as CampaignFormValues['audienceType'], { shouldDirty: true, shouldValidate: true })}
                  >
                    <SelectTrigger id="audienceType"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tags">By tags</SelectItem>
                      <SelectItem value="lead_status">By lead status</SelectItem>
                      <SelectItem value="segment">Custom segment</SelectItem>
                    </SelectContent>
                  </Select>
                </FormRow>

                {audienceType === 'tags' && (
                  <FormRow name="tags" label="Select tags" required>
                    <div className="flex flex-wrap gap-ds-2">
                      {availableTags.length === 0 && (
                        <p className="text-sm text-ds-foreground-muted">No tags found on your contacts yet.</p>
                      )}
                      {availableTags.map((tag) => (
                        <Tag
                          key={tag}
                          tone={tags.includes(tag) ? 'primary' : 'neutral'}
                          className="cursor-pointer px-ds-3 py-ds-2"
                          onClick={() => form.setValue(
                            'tags',
                            tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag],
                            { shouldDirty: true, shouldValidate: true },
                          )}
                        >
                          {tag}
                        </Tag>
                      ))}
                    </div>
                  </FormRow>
                )}

                {audienceType === 'lead_status' && (
                  <FormRow name="statuses" label="Select lead statuses" required>
                    <div className="grid grid-cols-2 gap-ds-2">
                      {leadStatuses.map((status) => (
                        <label key={status} className="flex items-center gap-ds-3 rounded-ds-md border border-ds-border p-ds-3 cursor-pointer hover:bg-ds-surface-sunken">
                          <Checkbox
                            checked={statuses.includes(status)}
                            onCheckedChange={() => form.setValue(
                              'statuses',
                              statuses.includes(status) ? statuses.filter((s) => s !== status) : [...statuses, status],
                              { shouldDirty: true, shouldValidate: true },
                            )}
                          />
                          <span className="text-sm capitalize">{status.replace('_', ' ')}</span>
                        </label>
                      ))}
                    </div>
                  </FormRow>
                )}

                {audienceType === 'segment' && (
                  <FormRow name="segmentId" label="Segment" required wide hint="Pick a saved audience segment.">
                    <RelationCombobox
                      value={form.watch('segmentId') || null}
                      onChange={(id) => form.setValue('segmentId', id ?? '', { shouldDirty: true, shouldValidate: true })}
                      fetcher={async (q, page) => {
                        const r = unwrapList<MarketingSegment>(
                          await marketingApi.segments.list({ search: q || undefined, page, limit: 20 }),
                        );
                        return { items: r.data, total: r.pagination.total };
                      }}
                      resolveSelected={async (id) => {
                        try {
                          return (await marketingApi.segments.get(id)).data;
                        } catch {
                          return null;
                        }
                      }}
                      getOptionId={(s: MarketingSegment) => s.id}
                      getOptionLabel={(s: MarketingSegment) => s.name}
                      getOptionDescription={(s: MarketingSegment) => `${formatLocaleNumber(s.contactCount)} contacts`}
                      placeholder="Choose a segment"
                      searchPlaceholder="Search segments..."
                      emptyText="No segments found"
                      aria-label="Segment"
                      error={form.formState.errors.segmentId?.message}
                    />
                  </FormRow>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Content" required>
              <div className="flex flex-col gap-ds-4">
                <FormRow name="contentSource" label="Content source" required>
                  <Select
                    value={contentSource}
                    onValueChange={(v) => form.setValue('contentSource', v as CampaignFormValues['contentSource'], { shouldDirty: true, shouldValidate: true })}
                  >
                    <SelectTrigger id="contentSource"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="template">Use a template</SelectItem>
                      <SelectItem value="custom">Write custom content</SelectItem>
                    </SelectContent>
                  </Select>
                </FormRow>

                {contentSource === 'template' && (
                  <FormRow name="templateId" label="Template" required wide>
                    <RelationCombobox
                      value={form.watch('templateId') || null}
                      onChange={(id) => form.setValue('templateId', id ?? '', { shouldDirty: true, shouldValidate: true })}
                      fetcher={async (q, page) => {
                        const r = unwrapList<MessageTemplate>(
                          await templatesApi.list({ channel: type, search: q || undefined, page, limit: 20 }),
                        );
                        return { items: r.data, total: r.pagination.total };
                      }}
                      aria-label="Template"
                      getOptionId={(t: MessageTemplate) => t.id}
                      getOptionLabel={(t: MessageTemplate) => t.name}
                      getOptionDescription={(t: MessageTemplate) => t.subject}
                      placeholder="Choose a template"
                      searchPlaceholder="Search templates..."
                      emptyText={`No ${type} templates found`}
                      error={form.formState.errors.templateId?.message}
                    />
                    <p className="mt-ds-1 text-xs text-ds-foreground-muted">
                      Need a new {type} template?{' '}
                      <Link href="/communication/templates/new" className="text-ds-primary hover:underline">Create one</Link>.
                    </p>
                  </FormRow>
                )}

                {contentSource === 'custom' && (
                  <>
                    {type === 'email' && (
                      <FormRow name="subject" label="Email subject" required wide>
                        <Input id="subject" placeholder="e.g., Special Offer: 30% Off Your Next Trip!" {...form.register('subject')} />
                      </FormRow>
                    )}
                    <FormRow
                      name="body"
                      label="Message content"
                      required
                      wide
                      hint={type === 'sms' ? `${body.length}/${SMS_LIMIT}${body.length > SMS_LIMIT ? ` (${Math.ceil(body.length / SMS_LIMIT)} parts)` : ''}` : undefined}
                    >
                      <Textarea
                        id="body"
                        placeholder="Write your message here... You can use {{firstName}}, {{email}} for personalization"
                        rows={6}
                        {...form.register('body')}
                      />
                    </FormRow>
                  </>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Schedule">
              <div className="flex flex-col gap-ds-4">
                <FormRow name="scheduleType" label="Send schedule">
                  <Select
                    value={scheduleType}
                    onValueChange={(v) => form.setValue('scheduleType', v as CampaignFormValues['scheduleType'], { shouldDirty: true })}
                  >
                    <SelectTrigger id="scheduleType"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="now">Send immediately</SelectItem>
                      <SelectItem value="later">Schedule for later</SelectItem>
                    </SelectContent>
                  </Select>
                </FormRow>

                {scheduleType === 'later' && (
                  <div className="grid gap-ds-4 sm:grid-cols-2">
                    <FormRow name="scheduleDate" label="Date" required>
                      <DatePicker
                        value={form.watch('scheduleDate')}
                        onChange={(d) => form.setValue('scheduleDate', d, { shouldDirty: true, shouldValidate: true })}
                        minDate={new Date()}
                        maxDate={daysFromNow(90)}
                        placeholder="Pick a date"
                      />
                    </FormRow>
                    <FormRow name="scheduleTime" label="Time" required>
                      <Input
                        type="time"
                        value={form.watch('scheduleTime') || ''}
                        onChange={(e) => form.setValue('scheduleTime', e.target.value, { shouldDirty: true, shouldValidate: true })}
                      />
                    </FormRow>
                  </div>
                )}
              </div>
            </SectionCard>
          </>
        );
      }}
    />
  );
}
