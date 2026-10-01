'use client';

import * as React from 'react';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Eye, Mail, MessageSquare, Phone, Variable } from 'lucide-react';
import { toast } from 'sonner';
import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogHeader,
  DialogTitle, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator, Textarea,
} from '@/components/ui';
import { contactsApi } from '@/lib/api/contacts';
import type { Contact } from '@travelcrm/shared';
import { templatesApi } from '@/lib/api/templates';

type TemplateChannel = 'email' | 'sms' | 'whatsapp';

const categories = [
  { value: 'greeting', label: 'Greeting / Welcome' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'quotation', label: 'Quotation / Proposal' },
  { value: 'booking', label: 'Booking Confirmation' },
  { value: 'reminder', label: 'Payment Reminder' },
  { value: 'wish', label: 'Thank You / Wish' },
  { value: 'offer', label: 'Promotional / Offer' },
  { value: 'visa', label: 'Visa / Travel Docs' },
];

const languages = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'mr', label: 'Marathi' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'ar', label: 'Arabic' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'es', label: 'Spanish' },
];

const availableVariables = [
  { key: '{customer_name}', label: 'Contact Name' },
  { key: '{first_name}', label: 'First Name' },
  { key: '{email}', label: 'Email' },
  { key: '{phone}', label: 'Phone' },
  { key: '{company}', label: 'Company' },
  { key: '{destination}', label: 'Destination' },
  { key: '{travel_date}', label: 'Travel Date' },
  { key: '{amount}', label: 'Amount' },
  { key: '{booking_ref}', label: 'Booking Ref' },
  { key: '{agent_name}', label: 'Agent Name' },
];

const schema = z.object({
  name: z.string().min(1, 'Template name is required'),
  channel: z.enum(['email', 'sms', 'whatsapp']),
  category: z.string().min(1, 'Please select a category'),
  language: z.string(),
  subject: z.string().optional(),
  content: z.string().min(1, 'Template content is required'),
}).refine((v) => v.channel !== 'email' || !!v.subject?.trim(), {
  message: 'Subject is required for email templates',
  path: ['subject'],
});

type TemplateForm = z.infer<typeof schema>;

function fillVariables(text: string, contact: Contact | null) {
  if (!contact) return text;
  return text
    .replace(/\{customer_name\}/g, contact.name ?? 'John Doe')
    .replace(/\{first_name\}/g, contact.name?.split(' ')[0] ?? 'John')
    .replace(/\{email\}/g, contact.email ?? 'john@example.com')
    .replace(/\{phone\}/g, contact.phone ?? '+91 98765 43210')
    .replace(/\{company\}/g, contact.company ?? 'Acme Corp')
    .replace(/\{destination\}/g, 'Maldives')
    .replace(/\{travel_date\}/g, '2026-04-15')
    .replace(/\{amount\}/g, 'INR 1,50,000')
    .replace(/\{booking_ref\}/g, 'TCM-2026-0042')
    .replace(/\{agent_name\}/g, 'Sarah');
}

export default function NewTemplatePage() {
  const router = useRouter();
  const [showPreview, setShowPreview] = React.useState(false);
  const [previewContact, setPreviewContact] = React.useState<Contact | null>(null);
  const bodyRef = React.useRef<HTMLTextAreaElement | null>(null);

  return (
    <EntityForm<TemplateForm>
      title="Create Template"
      description="Create a new message template"
      schema={schema}
      defaultValues={{ name: '', channel: 'email', category: '', language: 'en', subject: '', content: '' }}
      onCancel={() => router.back()}
      onSubmit={async (v) => {
        await templatesApi.create({
          name: v.name,
          channel: v.channel,
          category: v.category,
          language: v.language,
          subject: v.channel === 'email' ? v.subject : undefined,
          content: v.content,
        });
        toast.success('Template saved successfully!');
        router.push('/communication/templates');
      }}
      submitLabel="Save Template"
      renderSections={(form) => {
        const channel = form.watch('channel');
        const content = form.watch('content');
        const subject = form.watch('subject') ?? '';

        const insertVariable = (variable: string) => {
          const textarea = bodyRef.current;
          const current = form.getValues('content') ?? '';
          if (textarea) {
            const start = textarea.selectionStart ?? current.length;
            const end = textarea.selectionEnd ?? current.length;
            const next = current.substring(0, start) + variable + current.substring(end);
            form.setValue('content', next, { shouldDirty: true, shouldValidate: true });
            requestAnimationFrame(() => {
              textarea.focus();
              textarea.setSelectionRange(start + variable.length, start + variable.length);
            });
          } else {
            form.setValue('content', current + variable, { shouldDirty: true, shouldValidate: true });
          }
        };

        return (
          <>
            <div className="grid gap-ds-4 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-ds-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-ds-sm">Template Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-ds-4">
                    <FormRow name="name" label="Template Name" required>
                      <Input {...form.register('name')} id="name" placeholder="e.g., Welcome Email - Standard" />
                    </FormRow>
                    <div className="grid grid-cols-3 gap-ds-4">
                      <FormRow name="channel" label="Channel" required>
                        <Select
                          value={channel}
                          onValueChange={(v) => form.setValue('channel', v as TemplateChannel, { shouldDirty: true })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="email"><span className="flex items-center gap-ds-2"><Mail className="h-3.5 w-3.5" /> Email</span></SelectItem>
                            <SelectItem value="sms"><span className="flex items-center gap-ds-2"><Phone className="h-3.5 w-3.5" /> SMS</span></SelectItem>
                            <SelectItem value="whatsapp"><span className="flex items-center gap-ds-2"><MessageSquare className="h-3.5 w-3.5" /> WhatsApp</span></SelectItem>
                          </SelectContent>
                        </Select>
                      </FormRow>
                      <FormRow name="category" label="Category" required hint={form.formState.errors.category?.message}>
                        <Select value={form.watch('category')} onValueChange={(v) => form.setValue('category', v, { shouldDirty: true, shouldValidate: true })}>
                          <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                          <SelectContent>
                            {categories.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormRow>
                      <FormRow name="language" label="Language">
                        <Select value={form.watch('language')} onValueChange={(v) => form.setValue('language', v, { shouldDirty: true })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {languages.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormRow>
                    </div>
                    {channel === 'email' && (
                      <FormRow name="subject" label="Subject" required hint={form.formState.errors.subject?.message}>
                        <Input {...form.register('subject')} id="subject" placeholder="Email subject line (variables allowed)" />
                      </FormRow>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-ds-sm">Template Content</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <FormRow name="content" label="Content" required hint={form.formState.errors.content?.message}>
                      <Textarea
                        {...form.register('content')}
                        ref={(el) => {
                          form.register('content').ref(el);
                          bodyRef.current = el;
                        }}
                        placeholder={`Write your ${channel} template here...\n\nUse variables like {customer_name}, {destination} for personalization.`}
                        className="min-h-[280px] font-mono leading-relaxed resize-none"
                      />
                    </FormRow>
                    <p className="text-ds-xs text-ds-foreground-subtle mt-ds-2">
                      {content.length} characters
                      {channel === 'sms' && content.length > 160 && (
                        <span className="text-ds-warning ml-ds-2">({Math.ceil(content.length / 160)} SMS segments)</span>
                      )}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-ds-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-ds-sm flex items-center gap-ds-2">
                      <Variable className="h-4 w-4" /> Insert Variables
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-ds-2">
                    {availableVariables.map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => insertVariable(v.key)}
                        className="w-full flex items-center justify-between px-ds-3 py-ds-2 rounded-ds-md text-left text-ds-sm hover:bg-ds-surface-sunken transition-colors"
                      >
                        <span className="text-ds-foreground-muted">{v.label}</span>
                        <code className="text-ds-xs font-mono text-ds-primary">{v.key}</code>
                      </button>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-ds-sm">Preview with a contact</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-ds-3">
                    <RelationCombobox<Contact>
                      value={previewContact?.id ?? null}
                      onChange={(_id, item) => setPreviewContact(item)}
                      fetcher={async (q, page) => {
                        const r = await contactsApi.list({ search: q, page, limit: 20 });
                        const items = r.data?.data ?? (Array.isArray(r.data) ? r.data : []);
                        return { items, total: r.data?.pagination?.total ?? items.length };
                      }}
                      getOptionId={(c) => c.id}
                      getOptionLabel={(c) => c.name}
                      getOptionDescription={(c) => c.email ?? undefined}
                      placeholder="Pick a contact to preview"
                    />
                    <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setShowPreview(true)}>
                      <Eye className="h-4 w-4 mr-ds-1" /> Preview
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>

            <Dialog open={showPreview} onOpenChange={setShowPreview}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Template Preview</DialogTitle>
                </DialogHeader>
                <div className="space-y-ds-4">
                  <div className="flex items-center gap-ds-2">
                    <Badge variant="outline">{channel.toUpperCase()}</Badge>
                    {form.watch('category') && <Badge variant="secondary">{form.watch('category')}</Badge>}
                  </div>
                  {channel === 'email' && subject && (
                    <div>
                      <p className="text-ds-xs text-ds-foreground-subtle mb-ds-1">Subject</p>
                      <p className="text-ds-sm font-medium">{fillVariables(subject, previewContact)}</p>
                    </div>
                  )}
                  <Separator />
                  <div className="rounded-ds-lg border border-ds-border p-ds-4 bg-ds-surface-sunken min-h-[200px]">
                    <pre className="text-ds-sm whitespace-pre-wrap font-sans leading-relaxed">
                      {fillVariables(content, previewContact) || 'No content yet'}
                    </pre>
                  </div>
                  <p className="text-ds-xs text-ds-foreground-subtle">
                    {previewContact ? `Showing sample data for ${previewContact.name}.` : 'Pick a contact for a real preview, or view with sample data.'}
                  </p>
                </div>
              </DialogContent>
            </Dialog>
          </>
        );
      }}
    />
  );
}
