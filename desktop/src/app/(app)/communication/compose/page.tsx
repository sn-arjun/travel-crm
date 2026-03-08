'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Send, Paperclip, X, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { communicationsApi } from '@/lib/api/communications';
import { templatesApi, type MessageTemplate } from '@/lib/api/templates';
import { contactsApi } from '@/lib/api/contacts';
import type { Contact } from '@travelcrm/shared';
import { Combobox } from '@/components/ui/combobox';

interface RecipientChip {
  id: string;
  label: string;
  email?: string;
}

function ContactCombobox({
  label,
  recipients,
  onAdd,
  onRemove,
}: {
  label: string;
  recipients: RecipientChip[];
  onAdd: (recipient: RecipientChip) => void;
  onRemove: (id: string) => void;
}) {
  const [search, setSearch] = React.useState('');

  const { data: contactsResponse } = useApiQuery(
    () => contactsApi.list({ search: search || undefined, limit: 20 }),
    [search],
  );
  const contacts: Contact[] = (contactsResponse?.data?.data ?? contactsResponse?.data ?? []) as Contact[];

  const options = contacts
    .filter((c) => !recipients.find((r) => r.id === c.id))
    .map((c) => ({
      value: c.id,
      label: c.email ? `${c.name} <${c.email}>` : c.name,
    }));

  const handleSelect = (contactId: string) => {
    const contact = contacts.find((c) => c.id === contactId);
    if (contact) {
      onAdd({ id: contact.id, label: contact.email ? `${contact.name} <${contact.email}>` : contact.name, email: contact.email ?? '' });
    }
    setSearch('');
  };

  return (
    <div className="flex items-start gap-3">
      <Label className="text-sm font-medium text-muted-foreground w-10 pt-2 shrink-0">{label}</Label>
      <div className="flex-1 flex flex-wrap items-center gap-1.5 min-h-[36px] rounded-md border border-input bg-background px-3 py-1.5 focus-within:ring-2 focus-within:ring-ring">
        {recipients.map((r) => (
          <Badge key={r.id} variant="secondary" className="gap-1 text-xs py-0.5">
            {r.label}
            <button onClick={() => onRemove(r.id)} className="ml-0.5 hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <div className="flex-1 min-w-[200px]">
          <Combobox
            options={options}
            onSearch={setSearch}
            placeholder={recipients.length === 0 ? 'Search contacts...' : 'Add more...'}
            onValueChange={handleSelect}
            className="border-0 shadow-none h-7 px-0 focus-visible:ring-0"
          />
        </div>
      </div>
    </div>
  );
}

export default function ComposeEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showCc, setShowCc] = React.useState(false);
  const [showBcc, setShowBcc] = React.useState(false);
  const [toRecipients, setToRecipients] = React.useState<RecipientChip[]>([]);
  const [ccRecipients, setCcRecipients] = React.useState<RecipientChip[]>([]);
  const [bccRecipients, setBccRecipients] = React.useState<RecipientChip[]>([]);
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');
  const [selectedTemplateId, setSelectedTemplateId] = React.useState('');
  const [attachments, setAttachments] = React.useState<{ name: string; data: string; type: string }[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Auto-populate from URL params
  const prefillContactId = searchParams.get('contactId');
  const prefillContactName = searchParams.get('contactName');
  const prefillLeadId = searchParams.get('leadId');

  React.useEffect(() => {
    if (prefillContactId && prefillContactName) {
      setToRecipients([{ id: prefillContactId, label: prefillContactName }]);
    }
  }, [prefillContactId, prefillContactName]);

  // Fetch API templates
  const { data: templatesResponse } = useApiQuery(
    () => templatesApi.list({ channel: 'email', limit: 50 }),
    [],
  );
  const apiTemplates: MessageTemplate[] = (templatesResponse?.data?.data ?? templatesResponse?.data ?? []) as MessageTemplate[];

  const { mutate: sendEmail, loading: isSending } = useApiMutation(
    (data: Parameters<typeof communicationsApi.send>[0]) => communicationsApi.send(data),
  );

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId === 'none') return;
    const template = apiTemplates.find((t) => t.id === templateId);
    if (template) {
      if (template.subject) setSubject(template.subject);
      setBody(template.content);
    }
  };

  const handleAttachFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
    const MAX_TOTAL = 25 * 1024 * 1024; // 25MB total
    const MAX_FILES = 5;

    if (attachments.length + files.length > MAX_FILES) {
      toast.error(`Maximum ${MAX_FILES} attachments allowed`);
      return;
    }

    const currentTotal = attachments.reduce((sum, a) => sum + (a.data.length * 0.75), 0); // approx bytes from base64

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`File "${file.name}" exceeds 10MB limit`);
        continue;
      }
      if (currentTotal + file.size > MAX_TOTAL) {
        toast.error('Total attachment size would exceed 25MB');
        break;
      }
      const base64 = await fileToBase64(file);
      setAttachments((prev) => [...prev, { name: file.name, data: base64, type: file.type }]);
    }

    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Strip data URL prefix, keep only base64 content
        resolve(result.split(',')[1] ?? '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (toRecipients.length === 0) {
      toast.error('Please add at least one recipient');
      return;
    }
    if (!subject.trim()) {
      toast.error('Please enter a subject');
      return;
    }
    if (!body.trim()) {
      toast.error('Please enter a message body');
      return;
    }

    // Use first recipient's contact_id; send to all recipients via message field
    const firstRecipient = toRecipients[0]!;
    const result = await sendEmail({
      contact_id: firstRecipient.id,
      channel: 'email',
      message: body,
      subject,
      lead_id: prefillLeadId ?? undefined,
    });

    if (result) {
      toast.success('Email sent successfully!');
      router.push('/communication');
    } else {
      toast.error('Failed to send email');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="*/*"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Compose Email
            </h1>
            <p className="text-sm text-muted-foreground">Send a new email message</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            Discard
          </Button>
          <Button size="sm" onClick={handleSend} disabled={isSending}>
            {isSending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1.5" />
            )}
            Send
          </Button>
        </div>
      </div>

      {/* Compose Form */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-4">
          {/* Template Selector (from API) */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Label className="text-sm font-medium text-muted-foreground shrink-0">Template</Label>
                <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
                  <SelectTrigger className="w-72 h-9">
                    <SelectValue placeholder="Choose a template (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Template</SelectItem>
                    {apiTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Recipients & Subject */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <ContactCombobox
                label="To"
                recipients={toRecipients}
                onAdd={(r) => setToRecipients((prev) => [...prev, r])}
                onRemove={(id) => setToRecipients((prev) => prev.filter((r) => r.id !== id))}
              />

              {/* CC/BCC toggle */}
              {!showCc && !showBcc && (
                <div className="flex items-center gap-2 pl-[52px]">
                  <button
                    onClick={() => setShowCc(true)}
                    className="text-xs text-primary hover:underline"
                  >
                    CC
                  </button>
                  <button
                    onClick={() => setShowBcc(true)}
                    className="text-xs text-primary hover:underline"
                  >
                    BCC
                  </button>
                </div>
              )}

              {showCc && (
                <ContactCombobox
                  label="CC"
                  recipients={ccRecipients}
                  onAdd={(r) => setCcRecipients((prev) => [...prev, r])}
                  onRemove={(id) => setCcRecipients((prev) => prev.filter((r) => r.id !== id))}
                />
              )}

              {showBcc && (
                <ContactCombobox
                  label="BCC"
                  recipients={bccRecipients}
                  onAdd={(r) => setBccRecipients((prev) => [...prev, r])}
                  onRemove={(id) => setBccRecipients((prev) => prev.filter((r) => r.id !== id))}
                />
              )}

              <Separator />

              <div className="flex items-center gap-3">
                <Label className="text-sm font-medium text-muted-foreground w-10 shrink-0">Subj</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject"
                  className="h-9 border-0 shadow-none focus-visible:ring-0 px-0"
                />
              </div>
            </CardContent>
          </Card>

          {/* Body */}
          <Card>
            <CardContent className="p-4">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your email here...

You can use variables like {{name}}, {{company}}, {{destination}} for personalization."
                className="w-full min-h-[320px] bg-transparent text-sm outline-none resize-none placeholder:text-muted-foreground leading-relaxed"
              />
            </CardContent>
          </Card>

          {/* Attachments */}
          {attachments.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <Label className="text-sm font-medium mb-2 block">Attachments</Label>
                <div className="flex flex-wrap gap-2">
                  {attachments.map((file, idx) => (
                    <Badge key={idx} variant="secondary" className="gap-1.5 py-1">
                      <Paperclip className="h-3 w-3" />
                      {file.name}
                      <button onClick={() => handleRemoveAttachment(idx)} className="ml-1 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bottom Actions */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleAttachFile}>
              <Paperclip className="h-4 w-4 mr-1.5" />
              Attach File
            </Button>
            <p className="text-xs text-muted-foreground">Max 5 files, 10MB each, 25MB total</p>
          </div>
        </div>
      </div>
    </div>
  );
}
