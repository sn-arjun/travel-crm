'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Mail, MessageSquare, Phone, Send, Loader2, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { communicationsApi, type CommunicationLog, type SendCommunicationRequest } from '@/lib/api/communications';
import { contactsApi } from '@/lib/api/contacts';
import { templatesApi, type MessageTemplate } from '@/lib/api/templates';

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function getChannelIcon(channel: string) {
  switch (channel) {
    case 'email': return <Mail className="h-3.5 w-3.5 text-blue-500" />;
    case 'sms': return <Phone className="h-3.5 w-3.5 text-green-500" />;
    case 'whatsapp': return <MessageSquare className="h-3.5 w-3.5 text-emerald-500" />;
    case 'call': return <Phone className="h-3.5 w-3.5 text-purple-500" />;
    default: return <Mail className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'sent':
      return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px]">Sent</Badge>;
    case 'delivered':
      return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px]">Delivered</Badge>;
    case 'read':
      return <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 text-[10px]">Read</Badge>;
    case 'failed':
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px]">Failed</Badge>;
    case 'queued':
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">Queued</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  }
}

export default function ContactCommunicationHubPage() {
  const router = useRouter();
  const params = useParams();
  const contactId = params.contactId as string;

  const [channelFilter, setChannelFilter] = React.useState('all');
  const [composeChannel, setComposeChannel] = React.useState<'email' | 'sms' | 'whatsapp'>('email');
  const [composeMessage, setComposeMessage] = React.useState('');
  const [composeSubject, setComposeSubject] = React.useState('');
  const [showTemplatePicker, setShowTemplatePicker] = React.useState(false);
  const [templateSearch, setTemplateSearch] = React.useState('');

  const messageListRef = React.useRef<HTMLDivElement>(null);

  // Fetch real contact info
  const { data: contactResponse, loading: loadingContact } = useApiQuery(
    () => contactsApi.getById(contactId),
    [contactId],
  );
  const contact = contactResponse?.data;

  // Fetch communication log for this contact
  const { data: logResponse, loading, error, refetch } = useApiQuery(
    () => communicationsApi.getHistory({
      contact_id: contactId,
      channel: channelFilter !== 'all' ? channelFilter : undefined,
      sortBy: 'sentAt',
      sortOrder: 'asc',
    }),
    [contactId, channelFilter],
  );

  const logs = (logResponse?.data?.data ?? []) as CommunicationLog[];

  // Fetch templates for template picker
  const { data: templatesResponse } = useApiQuery(
    () => templatesApi.list({
      channel: composeChannel,
      search: templateSearch || undefined,
      is_active: 1,
    }),
    [composeChannel, templateSearch],
  );
  const templates: MessageTemplate[] = (templatesResponse?.data?.data ?? templatesResponse?.data ?? []) as MessageTemplate[];

  const { mutate: sendMessage, loading: isSending } = useApiMutation(
    (data: SendCommunicationRequest) => communicationsApi.send(data),
  );

  // Auto-scroll to bottom when new messages arrive
  React.useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [logs]);

  const handleSend = async () => {
    if (!composeMessage.trim()) {
      toast.error('Please enter a message');
      return;
    }
    if (composeChannel === 'email' && !composeSubject.trim()) {
      toast.error('Please enter a subject for email');
      return;
    }

    const result = await sendMessage({
      contact_id: contactId,
      channel: composeChannel,
      message: composeChannel === 'email' && composeSubject ? `[Subject: ${composeSubject}]\n${composeMessage}` : composeMessage,
    });

    if (result) {
      toast.success('Message sent!');
      setComposeMessage('');
      setComposeSubject('');
      await refetch();
    } else {
      toast.error('Failed to send message');
    }
  };

  const handleApplyTemplate = (tpl: MessageTemplate) => {
    setComposeMessage(tpl.content);
    if (tpl.subject) setComposeSubject(tpl.subject);
    setShowTemplatePicker(false);
    toast.success(`Template "${tpl.name}" applied`);
  };

  const contactName = contact?.name ?? `Contact ${contactId.slice(0, 8)}`;
  const contactEmail = contact?.email ?? '';
  const contactPhone = contact?.phone ?? '';

  const smsChars = composeMessage.length;
  const smsSegments = composeChannel === 'sms' ? Math.ceil(smsChars / 160) : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          {loadingContact ? (
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ) : (
            <>
              <Avatar className="h-10 w-10">
                <AvatarFallback className="text-sm">{getInitials(contactName)}</AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-lg font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                  {contactName}
                </h1>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {contactEmail && <span>{contactEmail}</span>}
                  {contactPhone && <span>{contactPhone}</span>}
                </div>
              </div>
            </>
          )}
        </div>
        <Badge variant="outline" className="text-xs">
          {logs.length} messages
        </Badge>
      </div>

      {/* Channel Filter */}
      <div className="px-6 py-2 border-b">
        <Tabs value={channelFilter} onValueChange={setChannelFilter}>
          <TabsList className="bg-transparent border-b-0 p-0">
            {(['all', 'email', 'sms', 'whatsapp', 'call'] as const).map((ch) => (
              <TabsTrigger
                key={ch}
                value={ch}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary capitalize"
              >
                {ch === 'email' && <Mail className="h-3.5 w-3.5 mr-1.5" />}
                {ch === 'sms' && <Phone className="h-3.5 w-3.5 mr-1.5" />}
                {ch === 'whatsapp' && <MessageSquare className="h-3.5 w-3.5 mr-1.5" />}
                {ch === 'call' && <Phone className="h-3.5 w-3.5 mr-1.5" />}
                {ch === 'all' ? 'All' : ch === 'sms' ? 'SMS' : ch.charAt(0).toUpperCase() + ch.slice(1)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Message Timeline */}
      <div ref={messageListRef} className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Failed to load communications</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-lg font-medium">No messages yet</p>
            <p className="text-sm">Start a conversation below</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {logs.map((log) => {
              const isOutbound = log.direction !== 'inbound';
              const sentDate = new Date(log.sentAt);
              const channel = log.channel ?? log.type ?? 'email';

              return (
                <div
                  key={log.id}
                  className={cn('flex gap-3', isOutbound ? 'flex-row-reverse' : '')}
                >
                  {!isOutbound && (
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-xs">{getInitials(contactName)}</AvatarFallback>
                    </Avatar>
                  )}

                  <div className={cn('max-w-md flex flex-col', isOutbound ? 'items-end' : 'items-start')}>
                    <div
                      className={cn(
                        'rounded-lg px-4 py-3',
                        isOutbound ? 'bg-primary text-primary-foreground' : 'bg-muted',
                      )}
                    >
                      <div className={cn('flex items-center gap-1.5 mb-1', isOutbound ? 'justify-end' : '')}>
                        {getChannelIcon(channel)}
                        <span className={cn(
                          'text-[10px] uppercase font-medium',
                          isOutbound ? 'text-primary-foreground/70' : 'text-muted-foreground',
                        )}>
                          {channel}
                        </span>
                      </div>

                      {log.subject && (
                        <p className={cn(
                          'text-xs font-semibold mb-1',
                          isOutbound ? 'text-primary-foreground/90' : 'text-foreground',
                        )}>
                          {log.subject}
                        </p>
                      )}

                      <p className={cn(
                        'text-sm whitespace-pre-wrap',
                        isOutbound ? 'text-primary-foreground' : 'text-foreground',
                      )}>
                        {log.message ?? log.content}
                      </p>
                    </div>

                    <div className={cn('flex items-center gap-2 mt-1', isOutbound ? 'justify-end' : '')}>
                      <span className="text-[10px] text-muted-foreground">
                        {sentDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{' '}
                        {sentDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isOutbound && getStatusBadge(log.status)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Compose Bar */}
      <div className="border-t bg-background p-4">
        <div className="max-w-3xl mx-auto space-y-3">
          {/* Channel selector and subject for email */}
          <div className="flex items-center gap-3">
            <Select value={composeChannel} onValueChange={(v) => setComposeChannel(v as typeof composeChannel)}>
              <SelectTrigger className="w-36 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">
                  <span className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5" /> Email
                  </span>
                </SelectItem>
                <SelectItem value="sms">
                  <span className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5" /> SMS
                  </span>
                </SelectItem>
                <SelectItem value="whatsapp">
                  <span className="flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>

            {composeChannel === 'email' && (
              <Input
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                placeholder="Subject"
                className="h-8 flex-1"
              />
            )}
          </div>

          {/* Message input */}
          <div className="flex gap-2">
            <Input
              value={composeMessage}
              onChange={(e) => setComposeMessage(e.target.value)}
              placeholder={`Type your ${composeChannel} message...`}
              className="flex-1 h-9"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              title="Use template"
              onClick={() => setShowTemplatePicker(true)}
            >
              <FileText className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={handleSend} disabled={isSending} className="h-9">
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* SMS character counter */}
          {composeChannel === 'sms' && (
            <p className="text-xs text-muted-foreground">
              {smsChars} characters
              {smsChars > 0 && (
                <span className={cn('ml-2', smsChars > 160 ? 'text-amber-600' : 'text-muted-foreground')}>
                  ({smsSegments} segment{smsSegments !== 1 ? 's' : ''})
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Template Picker Dialog */}
      <Dialog open={showTemplatePicker} onOpenChange={setShowTemplatePicker}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Search templates..."
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              className="h-9"
            />
            <div className="max-h-80 overflow-y-auto space-y-2">
              {templates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No {composeChannel} templates found
                </p>
              ) : (
                templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => handleApplyTemplate(tpl)}
                    className="w-full text-left p-3 rounded-lg border hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium">{tpl.name}</p>
                      {tpl.category && (
                        <Badge variant="secondary" className="text-[10px]">{tpl.category}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{tpl.content}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
