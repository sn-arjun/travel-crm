'use client';

import * as React from 'react';
import { z } from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import { Input, SectionCard, Textarea } from '@/components/ui';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { communicationsApi } from '@/lib/api/communications';
import { contactsApi } from '@/lib/api/contacts';
import { templatesApi, type MessageTemplate } from '@/lib/api/templates';
import { useApiQuery } from '@/hooks/use-api';
import type { Contact } from '@travelcrm/shared';

const schema = z.object({
  contactId: z.string().min(1, 'Pick a recipient'),
  subject: z.string().optional(),
  body: z.string().min(1, 'Message body is required'),
  templateId: z.string().optional(),
});
type ComposeForm = z.infer<typeof schema>;

export default function ComposeEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadId = searchParams.get('leadId') ?? undefined;

  const { data: templatesResponse } = useApiQuery(
    () => templatesApi.list({ channel: 'email', limit: 50 }),
    [],
  );
  const apiTemplates: MessageTemplate[] = (templatesResponse?.data?.data ?? templatesResponse?.data ?? []) as MessageTemplate[];

  return (
    <EntityForm<ComposeForm>
      title="Compose email"
      description="Send a new email through the Communication Hub."
      schema={schema}
      defaultValues={{ contactId: '', subject: '', body: '', templateId: '' }}
      prefillFromParams={{ contactId: 'contactId' }}
      onCancel={() => router.back()}
      submitLabel="Send"
      onSubmit={async (values) => {
        await communicationsApi.send({
          contact_id: values.contactId,
          channel: 'email',
          message: values.subject ? `[Subject: ${values.subject}]\n${values.body}` : values.body,
          lead_id: leadId,
        });
        toast.success('Email sent successfully!');
        router.push('/communication');
      }}
      renderSections={(form) => (
        <>
          <SectionCard title="Recipient" required>
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="contactId" label="To" required wide>
                <RelationCombobox<Contact>
                  value={form.watch('contactId') || null}
                  onChange={(id) => form.setValue('contactId', id ?? '', { shouldDirty: true })}
                  fetcher={async (q, page) => {
                    const r = await contactsApi.list({ search: q, page, limit: 20 });
                    return { items: r.data.data, total: r.data.pagination.total };
                  }}
                  getOptionId={(c) => c.id}
                  getOptionLabel={(c) => c.name}
                  getOptionDescription={(c) => c.email ?? undefined}
                  resolveSelected={async (id) => (await contactsApi.getById(id)).data}
                  placeholder="Search contacts…"
                  error={form.formState.errors.contactId?.message}
                />
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="Message" required>
            <div className="grid gap-ds-4">
              <FormRow name="templateId" label="Template" hint="Optional — fills subject and body">
                <Select
                  value={form.watch('templateId') || 'none'}
                  onValueChange={(id) => {
                    form.setValue('templateId', id === 'none' ? '' : id);
                    if (id === 'none') return;
                    const tpl = apiTemplates.find((t) => t.id === id);
                    if (tpl) {
                      if (tpl.subject) form.setValue('subject', tpl.subject, { shouldDirty: true });
                      form.setValue('body', tpl.content, { shouldDirty: true });
                    }
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Choose a template (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No template</SelectItem>
                    {apiTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormRow>

              <FormRow name="subject" label="Subject" required>
                <Input {...form.register('subject')} id="subject" placeholder="Email subject" />
              </FormRow>

              <FormRow name="body" label="Body" required>
                <Textarea
                  {...form.register('body')}
                  id="body"
                  rows={12}
                  placeholder={'Write your email here...\n\nUse variables like {{name}}, {{company}}, {{destination}} for personalization.'}
                />
              </FormRow>
            </div>
          </SectionCard>
        </>
      )}
    />
  );
}
