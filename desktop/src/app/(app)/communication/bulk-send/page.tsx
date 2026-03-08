'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Send, Users, Mail, MessageSquare, Phone, Loader2,
  ChevronRight, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApiMutation } from '@/hooks/use-api';
import { communicationsApi, type BulkSendRequest } from '@/lib/api/communications';

type Channel = 'email' | 'sms' | 'whatsapp';
type RecipientMode = 'segment' | 'tag' | 'manual';

const availableSegments = [
  { id: 'all-contacts', name: 'All Contacts', count: 2450 },
  { id: 'active-leads', name: 'Active Leads', count: 340 },
  { id: 'vip-customers', name: 'VIP Customers', count: 128 },
  { id: 'past-travelers', name: 'Past Travelers', count: 890 },
  { id: 'cold-leads', name: 'Cold Leads (90+ days)', count: 456 },
  { id: 'honeymoon', name: 'Honeymoon Inquiries', count: 75 },
];

const availableTags = [
  'VIP', 'Frequent', 'Honeymoon', 'Family', 'Adventure', 'Budget', 'Luxury',
  'Corporate', 'Group', 'Solo',
];

const messageTemplates: Record<Channel, Array<{ id: string; name: string; body: string }>> = {
  email: [
    { id: 'promo-email', name: 'Promotional Offer', body: 'Dear {{name}},\n\nWe have an exciting offer for you! Get up to 30% off on select destinations.\n\nBook now and save big!\n\nBest regards,\nTravelCRM Team' },
    { id: 'newsletter-email', name: 'Monthly Newsletter', body: 'Dear {{name}},\n\nHere is your monthly travel newsletter with the best deals and destinations.\n\nHappy travels!' },
  ],
  sms: [
    { id: 'promo-sms', name: 'Promo SMS', body: 'Hi {{name}}! Special offer: 30% off select trips. Book now! Reply STOP to opt out.' },
    { id: 'reminder-sms', name: 'Reminder SMS', body: 'Hi {{name}}, just a reminder about your upcoming trip. Contact us for any questions.' },
  ],
  whatsapp: [
    { id: 'promo-wa', name: 'WhatsApp Promo', body: 'Hi {{name}}! We have an exclusive travel deal just for you. Check it out!' },
    { id: 'followup-wa', name: 'WhatsApp Follow-up', body: 'Hi {{name}}, following up on your recent inquiry. Would you like to proceed?' },
  ],
};

export default function BulkSendPage() {
  const router = useRouter();
  const [channel, setChannel] = React.useState<Channel>('email');
  const [recipientMode, setRecipientMode] = React.useState<RecipientMode>('segment');
  const [selectedSegment, setSelectedSegment] = React.useState('');
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
  const [manualRecipients, setManualRecipients] = React.useState('');
  const [contentSource, setContentSource] = React.useState<'template' | 'custom'>('template');
  const [selectedTemplate, setSelectedTemplate] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');
  const [scheduleType, setScheduleType] = React.useState<'now' | 'later'>('now');
  const [scheduleDate, setScheduleDate] = React.useState('');
  const [scheduleTime, setScheduleTime] = React.useState('');

  const { mutate: bulkSend, loading: isSending } = useApiMutation(
    (data: BulkSendRequest) => communicationsApi.bulkSend(data),
  );

  // Estimate recipient count
  const estimatedCount = React.useMemo(() => {
    if (recipientMode === 'segment') {
      const seg = availableSegments.find((s) => s.id === selectedSegment);
      return seg?.count ?? 0;
    }
    if (recipientMode === 'tag') {
      return selectedTags.length * 50; // rough estimate
    }
    if (recipientMode === 'manual') {
      return manualRecipients.split('\n').filter((l) => l.trim()).length;
    }
    return 0;
  }, [recipientMode, selectedSegment, selectedTags, manualRecipients]);

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    const templates = messageTemplates[channel] || [];
    const tpl = templates.find((t) => t.id === templateId);
    if (tpl) {
      setBody(tpl.body);
    }
  };

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleSend = async () => {
    if (estimatedCount === 0) {
      toast.error('Please select recipients');
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

    // Build recipients list
    let recipients: BulkSendRequest['recipients'] = [];
    if (recipientMode === 'manual') {
      recipients = manualRecipients
        .split('\n')
        .filter((l) => l.trim())
        .map((line, idx) => {
          const parts = line.split(',').map((p) => p.trim());
          return {
            id: `manual-${idx}`,
            email: channel === 'email' ? parts[0] : undefined,
            phone: channel !== 'email' ? parts[0] : undefined,
            name: parts[1] || parts[0],
          };
        });
    } else {
      // For segment/tag modes, send segment info and let backend resolve
      recipients = [
        {
          id: recipientMode === 'segment' ? selectedSegment : selectedTags.join(','),
          name: recipientMode === 'segment' ? selectedSegment : `tags:${selectedTags.join(',')}`,
        },
      ];
    }

    const result = await bulkSend({
      recipients,
      subject: channel === 'email' ? subject : undefined,
      body,
      type: channel,
    });

    if (result) {
      toast.success(`Bulk send initiated! Sending to ~${estimatedCount} recipients.`);
      router.push('/communication');
    } else {
      toast.error('Failed to initiate bulk send');
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
              Bulk Send
            </h1>
            <p className="text-sm text-muted-foreground">Send messages to multiple recipients</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* Step 1: Channel */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. Select Channel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { value: 'email' as Channel, label: 'Email', icon: Mail, color: 'text-blue-500' },
                  { value: 'sms' as Channel, label: 'SMS', icon: Phone, color: 'text-green-500' },
                  { value: 'whatsapp' as Channel, label: 'WhatsApp', icon: MessageSquare, color: 'text-emerald-500' },
                ]).map((ch) => (
                  <button
                    key={ch.value}
                    onClick={() => {
                      setChannel(ch.value);
                      setSelectedTemplate('');
                      setBody('');
                    }}
                    className={cn(
                      'flex items-center gap-3 p-4 rounded-lg border-2 transition-colors',
                      channel === ch.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/30',
                    )}
                  >
                    <ch.icon className={cn('h-5 w-5', ch.color)} />
                    <span className="text-sm font-medium">{ch.label}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Recipients */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Select Recipients</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={recipientMode} onValueChange={(v) => setRecipientMode(v as RecipientMode)}>
                <TabsList>
                  <TabsTrigger value="segment">By Segment</TabsTrigger>
                  <TabsTrigger value="tag">By Tag</TabsTrigger>
                  <TabsTrigger value="manual">Manual Entry</TabsTrigger>
                </TabsList>

                <TabsContent value="segment" className="mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    {availableSegments.map((seg) => (
                      <button
                        key={seg.id}
                        onClick={() => setSelectedSegment(seg.id)}
                        className={cn(
                          'flex items-center justify-between p-3 rounded-lg border transition-colors text-left',
                          selectedSegment === seg.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-muted-foreground/30',
                        )}
                      >
                        <div>
                          <p className="text-sm font-medium">{seg.name}</p>
                          <p className="text-xs text-muted-foreground">{seg.count.toLocaleString('en-IN')} contacts</p>
                        </div>
                        {selectedSegment === seg.id && (
                          <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="tag" className="mt-4">
                  <p className="text-sm text-muted-foreground mb-3">Select one or more tags to target</p>
                  <div className="flex flex-wrap gap-2">
                    {availableTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant={selectedTags.includes(tag) ? 'default' : 'outline'}
                        className="cursor-pointer px-3 py-1.5"
                        onClick={() => handleTagToggle(tag)}
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="manual" className="mt-4">
                  <div>
                    <Label className="text-sm mb-2 block">
                      Enter recipients (one per line, {channel === 'email' ? 'email' : 'phone number'})
                    </Label>
                    <textarea
                      value={manualRecipients}
                      onChange={(e) => setManualRecipients(e.target.value)}
                      placeholder={channel === 'email'
                        ? 'john@example.com, John Doe\njane@example.com, Jane Smith'
                        : '+919876543210, John Doe\n+919876543211, Jane Smith'}
                      className="w-full h-32 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </TabsContent>
              </Tabs>

              {estimatedCount > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm text-blue-700 dark:text-blue-300">
                    Estimated recipients: <strong>{estimatedCount.toLocaleString('en-IN')}</strong>
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 3: Message */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Compose Message</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Template or Custom toggle */}
              <div className="flex items-center gap-3">
                <Button
                  variant={contentSource === 'template' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setContentSource('template')}
                >
                  Use Template
                </Button>
                <Button
                  variant={contentSource === 'custom' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setContentSource('custom')}
                >
                  Write Custom
                </Button>
              </div>

              {contentSource === 'template' && (
                <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Choose a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(messageTemplates[channel] || []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {channel === 'email' && (
                <div>
                  <Label className="text-sm mb-1.5 block">Subject *</Label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Email subject line"
                    className="h-9"
                  />
                </div>
              )}

              <div>
                <Label className="text-sm mb-1.5 block">Message *</Label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your message here... Use {{name}}, {{email}}, {{phone}} for personalization."
                  className="w-full h-40 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Variable hints */}
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs text-muted-foreground">Available variables:</span>
                {['{{name}}', '{{email}}', '{{phone}}', '{{company}}'].map((v) => (
                  <button
                    key={v}
                    onClick={() => setBody((prev) => prev + ' ' + v)}
                    className="text-xs px-2 py-0.5 rounded bg-muted hover:bg-muted/80 font-mono"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Step 4: Schedule */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">4. Send or Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setScheduleType('now')}
                  className={cn(
                    'flex items-center gap-3 p-4 rounded-lg border-2 transition-colors',
                    scheduleType === 'now'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30',
                  )}
                >
                  <Send className="h-5 w-5 text-primary" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Send Now</p>
                    <p className="text-xs text-muted-foreground">Send immediately</p>
                  </div>
                </button>
                <button
                  onClick={() => setScheduleType('later')}
                  className={cn(
                    'flex items-center gap-3 p-4 rounded-lg border-2 transition-colors',
                    scheduleType === 'later'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30',
                  )}
                >
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Schedule</p>
                    <p className="text-xs text-muted-foreground">Send later</p>
                  </div>
                </button>
              </div>

              {scheduleType === 'later' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm mb-1.5 block">Date</Label>
                    <Input
                      type="date"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Time</Label>
                    <Input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Summary & Send */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Ready to send</p>
                  <p className="text-xs text-muted-foreground">
                    {channel.toUpperCase()} to ~{estimatedCount.toLocaleString('en-IN')} recipients
                    {scheduleType === 'later' && scheduleDate ? ` on ${scheduleDate} at ${scheduleTime}` : ' immediately'}
                  </p>
                </div>
                <Button onClick={handleSend} disabled={isSending || estimatedCount === 0}>
                  {isSending ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-1.5" />
                  )}
                  {scheduleType === 'now' ? 'Send Now' : 'Schedule'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
