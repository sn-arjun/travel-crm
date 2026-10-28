'use client';

import * as React from 'react';
import { z } from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import { Input, SectionCard, Textarea, useConfirm } from '@/components/ui';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { communicationsApi } from '@/lib/api/communications';
import { contactsApi } from '@/lib/api/contacts';
import { templatesApi, type MessageTemplate } from '@/lib/api/templates';
import { useApiQuery } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import type { Contact } from '@travelcrm/shared';

const PLACEHOLDER_RE = /\{\{\s*([a-z_]+)\s*\}\}/gi;

/** Fill the placeholders we know from the recipient; anything else is left as {{name}}. */
function fillPlaceholders(text: string, values: Record<string, string | undefined>): string {
  return text.replace(PLACEHOLDER_RE, (whole, key: string) => values[key.toLowerCase()] ?? whole);
}

function unresolvedPlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER_RE)].map((m) => m[1] ?? ''))];
}

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
  const { confirm, dialog: confirmDialog } = useConfirm();
  const agentName = useAuthStore((st) => st.user?.name);

  const { data: templatesResponse } = useApiQuery(
    () => templatesApi.list({ channel: 'email', limit: 50 }),
    [],
  );
  const apiTemplates: MessageTemplate[] = (templatesResponse?.data?.data ?? templatesResponse?.data ?? []) as MessageTemplate[];

  return (
    <>
    <EntityForm<ComposeForm>
      title="Compose email"
      description="Send a new email through the Communication Hub."
      schema={schema}
      defaultValues={{ contactId: '', subject: '', body: '', templateId: '' }}
      prefillFromParams={{ contactId: 'contactId' }}
      onCancel={() => router.back()}
      submitLabel="Send"
      onSubmit={async (values) => {
        const recipient = (await contactsApi.getById(values.contactId)).data;
        const known: Record<string, string | undefined> = {
          customer_name: recipient?.name,
          name: recipient?.name,
          first_name: recipient?.name?.split(' ')[0],
          email: recipient?.email ?? undefined,
          agent_name: agentName,
        };
        const subject = fillPlaceholders(values.subject ?? '', known);
        const body = fillPlaceholders(values.body, known);
        const left = unresolvedPlaceholders(`${subject}\n${body}`);
        if (left.length > 0) {
          const ok = await confirm({
            title: 'Placeholders still need values',
            description: `This message still contains ${left.map((k) => `{{${k}}}`).join(', ')}. Send anyway?`,
            confirmLabel: 'Send anyway',
          });
          if (!ok) return;
        }
        await communicationsApi.send({
          contact_id: values.contactId,
          channel: 'email',
          message: subject ? `[Subject: ${subject}]\n${body}` : body,
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
                    const items = r.data?.data ?? (Array.isArray(r.data) ? r.data : []);
                    const total = r.data?.pagination?.total ?? items.length;
                    return { items, total };
                  }}
                  getOptionId={(c) => c.id}
                  getOptionLabel={(c) => c.name}
                  getOptionDescription={(c) => c.email ?? undefined}
                  resolveSelected={async (id) => (await contactsApi.getById(id)).data}
                  placeholder="Search contacts…"
                  searchPlaceholder="Search contacts…"
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
    {confirmDialog}
    </>
  );
}
