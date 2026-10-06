'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Send, Users, Mail, MessageSquare, Phone, Loader2, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/ui/page-header';
import { PageContainer } from '@/components/layout/page-container';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { communicationsApi, type BulkSendRequest } from '@/lib/api/communications';
import { templatesApi, type MessageTemplate } from '@/lib/api/templates';
import { contactsApi } from '@/lib/api/contacts';
import type { Contact } from '@travelcrm/shared';

type Channel = 'email' | 'sms' | 'whatsapp';
type RecipientMode = 'tag' | 'manual';

export default function BulkSendPage() {
  const router = useRouter();
  const [channel, setChannel] = React.useState<Channel>('email');
  const [recipientMode, setRecipientMode] = React.useState<RecipientMode>('tag');
  const [selectedTag, setSelectedTag] = React.useState('');
  const [manualSearch, setManualSearch] = React.useState('');
  const [selectedContactIds, setSelectedContactIds] = React.useState<Set<string>>(new Set());
  const [selectedTemplate, setSelectedTemplate] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');

  const { data: tagsResponse, loading: loadingTags } = useApiQuery(
    () => contactsApi.getTags(),
    [],
  );
  const tags: string[] = tagsResponse?.data ?? [];

  const { data: tagContactsResponse, loading: loadingTagContacts } = useApiQuery(
    () => (selectedTag ? contactsApi.list({ tag: selectedTag, limit: 100 }) : Promise.resolve(null)),
    [selectedTag],
  );
  const tagContacts: Contact[] = (tagContactsResponse?.data?.data
    ?? (Array.isArray(tagContactsResponse?.data) ? tagContactsResponse.data : [])) as Contact[];

  const { data: manualContactsResponse, loading: loadingManualContacts } = useApiQuery(
    () => contactsApi.list({ search: manualSearch || undefined, limit: 30 }),
    [manualSearch],
  );
  const manualContacts: Contact[] = (manualContactsResponse?.data?.data
    ?? (Array.isArray(manualContactsResponse?.data) ? manualContactsResponse.data : [])) as Contact[];

  const { data: templatesResponse } = useApiQuery(
    () => templatesApi.list({ channel, limit: 50 }),
    [channel],
  );
  const templates: MessageTemplate[] = (templatesResponse?.data?.data ?? templatesResponse?.data ?? []) as MessageTemplate[];

  const { mutate: bulkSend, loading: isSending } = useApiMutation(
    (data: BulkSendRequest) => communicationsApi.bulkSend(data),
  );

  const [batchId, setBatchId] = React.useState<string | null>(null);
  const [batchStatus, setBatchStatus] = React.useState<{ status: string; total: number; sent: number; failed: number } | null>(null);

  React.useEffect(() => {
    if (!batchId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await communicationsApi.bulkSendStatus(batchId);
        if (cancelled) return;
        setBatchStatus(res.data);
        if (res.data.status !== 'completed' && res.data.status !== 'failed') {
          setTimeout(poll, 2000);
        }
      } catch {
        // Stop polling silently on failure; the summary card just stops updating.
      }
    };
    void poll();
    return () => { cancelled = true; };
  }, [batchId]);

  const recipientIds = React.useMemo(() => {
    if (recipientMode === 'tag') return tagContacts.map((c) => c.id);
    return [...selectedContactIds];
  }, [recipientMode, tagContacts, selectedContactIds]);

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    if (templateId === 'none') return;
    const tpl = templates.find((t) => t.id === templateId);
    if (tpl) {
      if (tpl.subject) setSubject(tpl.subject);
      setBody(tpl.content);
    }
  };

  const toggleManualContact = (id: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (recipientIds.length === 0) {
      toast.error('Please select at least one recipient');
      return;
    }
    if (!body.trim()) {
      toast.error('Please enter a message');
      return;
    }
    if (channel === 'email' && !subject.trim()) {
      toast.error('Please enter an email subject');
      return;
    }

    const result = await bulkSend({
      channel,
      contact_ids: recipientIds,
      message: channel === 'email' && subject ? `[Subject: ${subject}]\n${body}` : body,
      template_id: selectedTemplate && selectedTemplate !== 'none' ? selectedTemplate : undefined,
    });

    if (result) {
      toast.success(`Bulk send initiated! Sending to ${recipientIds.length} recipients.`);
      setBatchId(result.data.batch_id);
    } else {
      toast.error('Failed to initiate bulk send');
    }
  };

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Bulk send"
        description="Send a message to multiple contacts through the Communication Hub."
        back={
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()} aria-label="Go back">
            ←
          </Button>
        }
      />

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-ds-6">
        {/* Step 1: Channel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Select channel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-ds-3">
              {([
                { value: 'email' as Channel, label: 'Email', icon: Mail },
                { value: 'sms' as Channel, label: 'SMS', icon: Phone },
                { value: 'whatsapp' as Channel, label: 'WhatsApp', icon: MessageSquare },
              ]).map((ch) => (
                <button
                  key={ch.value}
                  type="button"
                  onClick={() => {
                    setChannel(ch.value);
                    setSelectedTemplate('');
                    setBody('');
                    setSubject('');
                  }}
                  className={cn(
                    'flex items-center gap-ds-3 rounded-ds-lg border-2 p-ds-4 transition-colors',
                    channel === ch.value ? 'border-ds-primary bg-ds-primary-subtle' : 'border-ds-border hover:border-ds-border-strong',
                  )}
                >
                  <ch.icon className="size-5" aria-hidden="true" />
                  <span className="text-sm font-medium">{ch.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Step 2: Recipients */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Select recipients</CardTitle>
          </CardHeader>
          <CardContent className="space-y-ds-4">
            <Tabs value={recipientMode} onValueChange={(v) => setRecipientMode(v as RecipientMode)}>
              <TabsList>
                <TabsTrigger value="tag">By tag</TabsTrigger>
                <TabsTrigger value="manual">Choose contacts</TabsTrigger>
              </TabsList>

              <TabsContent value="tag" className="mt-ds-4">
                {loadingTags ? (
                  <Skeleton className="h-9 w-64" />
                ) : tags.length === 0 ? (
                  <p className="text-sm text-ds-foreground-muted">No contact tags found yet.</p>
                ) : (
                  <Select value={selectedTag} onValueChange={setSelectedTag}>
                    <SelectTrigger className="h-9 w-64">
                      <SelectValue placeholder="Choose a tag…" />
                    </SelectTrigger>
                    <SelectContent>
                      {tags.map((tag) => (
                        <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedTag && (
                  <p className="mt-ds-2 text-xs text-ds-foreground-muted">
                    {loadingTagContacts ? 'Counting…' : `${tagContacts.length} contact${tagContacts.length === 1 ? '' : 's'} tagged “${selectedTag}”`}
                  </p>
                )}
              </TabsContent>

              <TabsContent value="manual" className="mt-ds-4">
                <Input
                  value={manualSearch}
                  onChange={(e) => setManualSearch(e.target.value)}
                  placeholder="Search contacts…"
                  className="h-9"
                />
                <div className="mt-ds-3 max-h-64 space-y-ds-1 overflow-y-auto">
                  {loadingManualContacts ? (
                    Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)
                  ) : manualContacts.length === 0 ? (
                    <p className="py-ds-4 text-center text-sm text-ds-foreground-muted">No contacts found.</p>
                  ) : (
                    manualContacts.map((c) => (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-ds-3 rounded-ds-md px-ds-2 py-ds-2 hover:bg-ds-surface-sunken"
                      >
                        <Checkbox
                          checked={selectedContactIds.has(c.id)}
                          onCheckedChange={() => toggleManualContact(c.id)}
                        />
                        <span className="text-sm">{c.name}</span>
                        {c.email && <span className="text-xs text-ds-foreground-muted">{c.email}</span>}
                      </label>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>

            {recipientIds.length > 0 && (
              <div className="flex items-center gap-ds-2 rounded-ds-lg border border-ds-info bg-ds-info-subtle p-ds-3">
                <Users className="size-4 text-ds-info-on-subtle" aria-hidden="true" />
                <span className="text-sm text-ds-info-on-subtle">
                  Recipients: <strong>{recipientIds.length}</strong>
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 3: Message */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Compose message</CardTitle>
          </CardHeader>
          <CardContent className="space-y-ds-4">
            <div>
              <Label className="mb-ds-1 block text-sm">Template</Label>
              <Select value={selectedTemplate || 'none'} onValueChange={handleTemplateChange}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Choose a template (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No template</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {channel === 'email' && (
              <div>
                <Label className="mb-ds-1 block text-sm">Subject *</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject line"
                  className="h-9"
                />
              </div>
            )}

            <div>
              <Label className="mb-ds-1 block text-sm">Message *</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your message here... Use {{name}}, {{email}}, {{phone}} for personalization."
                rows={6}
              />
            </div>

            <div className="flex flex-wrap gap-ds-2">
              <span className="text-xs text-ds-foreground-muted">Variables:</span>
              {['{{name}}', '{{email}}', '{{phone}}', '{{company}}'].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setBody((prev) => `${prev} ${v}`)}
                  className="rounded-ds-sm bg-ds-surface-sunken px-ds-2 py-ds-1 font-mono text-xs hover:bg-ds-border"
                >
                  {v}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Summary & Send */}
        <Card className="border-ds-primary bg-ds-primary-subtle">
          <CardContent className="flex items-center justify-between p-ds-4">
            <div className="space-y-ds-1">
              <p className="text-sm font-medium">Ready to send</p>
              <p className="text-xs text-ds-foreground-muted">
                {channel.toUpperCase()} to {recipientIds.length} recipient{recipientIds.length === 1 ? '' : 's'}
              </p>
            </div>
            <Button onClick={handleSend} disabled={isSending || recipientIds.length === 0} className="gap-ds-2">
              {isSending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
              Send now
            </Button>
          </CardContent>
        </Card>

        {/* Batch status */}
        {batchId && batchStatus && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Batch status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-ds-3">
              <div className="flex items-center justify-between text-sm">
                <span className="capitalize">{batchStatus.status}</span>
                <span className="text-ds-foreground-muted">{batchStatus.sent + batchStatus.failed} / {batchStatus.total}</span>
              </div>
              <Progress value={batchStatus.total ? ((batchStatus.sent + batchStatus.failed) / batchStatus.total) * 100 : 0} />
              <div className="flex items-center gap-ds-4 text-xs text-ds-foreground-muted">
                <span className="flex items-center gap-ds-1"><CheckCircle2 className="size-3.5 text-ds-success" aria-hidden="true" /> {batchStatus.sent} sent</span>
                {batchStatus.failed > 0 && <span className="text-ds-danger">{batchStatus.failed} failed</span>}
              </div>
              {(batchStatus.status === 'completed' || batchStatus.status === 'failed') && (
                <Button size="sm" variant="outline" onClick={() => router.push('/communication')}>
                  Back to inbox
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
