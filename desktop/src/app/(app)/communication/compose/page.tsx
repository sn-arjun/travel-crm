'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Send, Paperclip, X, Search, ChevronDown, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { communicationsApi, type SendCommunicationRequest } from '@/lib/api/communications';

// Local templates for template selector
const emailTemplates = [
  { id: 'welcome', name: 'Welcome Email', subject: 'Welcome to TravelCRM!' },
  { id: 'followup', name: 'Follow-up Email', subject: 'Following up on your inquiry' },
  { id: 'proposal', name: 'Proposal Email', subject: 'Your customized travel proposal' },
  { id: 'booking-confirm', name: 'Booking Confirmation', subject: 'Booking Confirmed!' },
  { id: 'payment-reminder', name: 'Payment Reminder', subject: 'Payment Reminder' },
  { id: 'thankyou', name: 'Thank You Email', subject: 'Thank you for traveling with us!' },
];

const templateBodies: Record<string, string> = {
  welcome: 'Dear {{name}},\n\nWelcome to our travel services! We\'re excited to help you plan your perfect trip.\n\nBest regards,\nTravelCRM Team',
  followup: 'Dear {{name}},\n\nI wanted to follow up on your recent inquiry. Are you available for a quick call this week?\n\nBest regards',
  proposal: 'Dear {{name}},\n\nPlease find your customized travel proposal below.\n\nTotal cost: {{amount}}\n\nPlease review and let me know if you\'d like any modifications.',
  'booking-confirm': 'Dear {{name}},\n\nYour booking is confirmed!\n\nDestination: {{destination}}\nTravel Date: {{date}}\nBooking Reference: {{ref}}\n\nThank you!',
  'payment-reminder': 'Dear {{name}},\n\nThis is a friendly reminder that payment of {{amount}} is due by {{dueDate}}.\n\nPlease complete the payment at your earliest convenience.\n\nThank you!',
  thankyou: 'Dear {{name}},\n\nThank you for choosing us for your trip! We hope you had an amazing experience.\n\nWarm regards,\nTravelCRM Team',
};

interface RecipientChip {
  id: string;
  label: string;
  email?: string;
}

function RecipientInput({
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
  const [inputValue, setInputValue] = React.useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const trimmed = inputValue.trim().replace(/,$/, '');
      if (trimmed) {
        onAdd({ id: trimmed, label: trimmed, email: trimmed });
        setInputValue('');
      }
    }
    if (e.key === 'Backspace' && !inputValue && recipients.length > 0) {
      onRemove(recipients[recipients.length - 1]!.id);
    }
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
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={recipients.length === 0 ? 'Type email and press Enter...' : ''}
          className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}

export default function ComposeEmailPage() {
  const router = useRouter();
  const [showCc, setShowCc] = React.useState(false);
  const [showBcc, setShowBcc] = React.useState(false);

  const [toRecipients, setToRecipients] = React.useState<RecipientChip[]>([]);
  const [ccRecipients, setCcRecipients] = React.useState<RecipientChip[]>([]);
  const [bccRecipients, setBccRecipients] = React.useState<RecipientChip[]>([]);
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');
  const [selectedTemplate, setSelectedTemplate] = React.useState('');
  const [attachments, setAttachments] = React.useState<string[]>([]);

  const { mutate: sendEmail, loading: isSending } = useApiMutation(
    (data: SendCommunicationRequest) => communicationsApi.send(data),
  );

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = emailTemplates.find((t) => t.id === templateId);
    if (template) {
      setSubject(template.subject);
      setBody(templateBodies[templateId] || '');
    }
  };

  const handleAttachFile = () => {
    // In production, this would open a file picker and upload
    const fileName = `attachment-${Date.now()}.pdf`;
    setAttachments((prev) => [...prev, fileName]);
    toast.success('File attached (simulated)');
  };

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

    const allRecipients = [
      ...toRecipients.map((r) => r.email || r.label),
      ...ccRecipients.map((r) => r.email || r.label),
      ...bccRecipients.map((r) => r.email || r.label),
    ];

    const result = await sendEmail({
      to: allRecipients,
      subject,
      body,
      type: 'email',
      template: selectedTemplate || undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
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
          {/* Template Selector */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Label className="text-sm font-medium text-muted-foreground shrink-0">Template</Label>
                <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
                  <SelectTrigger className="w-72 h-9">
                    <SelectValue placeholder="Choose a template (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Template</SelectItem>
                    {emailTemplates.map((t) => (
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
              <RecipientInput
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
                <RecipientInput
                  label="CC"
                  recipients={ccRecipients}
                  onAdd={(r) => setCcRecipients((prev) => [...prev, r])}
                  onRemove={(id) => setCcRecipients((prev) => prev.filter((r) => r.id !== id))}
                />
              )}

              {showBcc && (
                <RecipientInput
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
                      {file}
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
          </div>
        </div>
      </div>
    </div>
  );
}
