'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Mail, MessageSquare, Phone, Send, Loader2,
  User, Clock, ChevronDown, Paperclip,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { communicationsApi, type CommunicationLog, type SendCommunicationRequest } from '@/lib/api/communications';

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function getChannelIcon(type: string) {
  switch (type) {
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
    case 'failed':
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px]">Failed</Badge>;
    case 'pending':
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">Pending</Badge>;
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

  // Fetch communication log for this contact
  const { data: logResponse, loading, error, refetch } = useApiQuery(
    () => communicationsApi.getLog({
      contactId,
      type: channelFilter !== 'all' ? channelFilter : undefined,
      sortBy: 'sentAt',
      sortOrder: 'desc',
    }),
    [contactId, channelFilter],
  );

  const logs = (logResponse?.data?.data ?? []) as CommunicationLog[];

  const { mutate: sendMessage, loading: isSending } = useApiMutation(
    (data: SendCommunicationRequest) => communicationsApi.send(data),
  );

  // Mock contact info - in production fetched from contacts API
  const contactInfo = React.useMemo(() => ({
    name: logs[0]?.recipient || `Contact ${contactId.slice(0, 8)}`,
    email: 'contact@example.com',
    phone: '+91 98765 43210',
  }), [logs, contactId]);

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
      to: [composeChannel === 'email' ? contactInfo.email : contactInfo.phone],
      subject: composeChannel === 'email' ? composeSubject : undefined,
      body: composeMessage,
      type: composeChannel,
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar className="h-10 w-10">
            <AvatarFallback className="text-sm">{getInitials(contactInfo.name)}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-lg font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              {contactInfo.name}
            </h1>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{contactInfo.email}</span>
              <span>{contactInfo.phone}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {logs.length} messages
          </Badge>
        </div>
      </div>

      {/* Channel Filter */}
      <div className="px-6 py-2 border-b">
        <Tabs value={channelFilter} onValueChange={setChannelFilter}>
          <TabsList className="bg-transparent border-b-0 p-0">
            <TabsTrigger value="all" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              All
            </TabsTrigger>
            <TabsTrigger value="email" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              <Mail className="h-3.5 w-3.5 mr-1.5" /> Email
            </TabsTrigger>
            <TabsTrigger value="sms" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              <Phone className="h-3.5 w-3.5 mr-1.5" /> SMS
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> WhatsApp
            </TabsTrigger>
            <TabsTrigger value="call" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              <Phone className="h-3.5 w-3.5 mr-1.5" /> Calls
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Message Timeline */}
      <div className="flex-1 overflow-auto p-6">
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

              return (
                <div
                  key={log.id}
                  className={cn(
                    'flex gap-3',
                    isOutbound ? 'flex-row-reverse' : '',
                  )}
                >
                  {!isOutbound && (
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-xs">{getInitials(contactInfo.name)}</AvatarFallback>
                    </Avatar>
                  )}

                  <div className={cn('max-w-md', isOutbound ? 'items-end' : '')}>
                    <div
                      className={cn(
                        'rounded-lg px-4 py-3',
                        isOutbound
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted',
                      )}
                    >
                      {/* Channel indicator */}
                      <div className={cn(
                        'flex items-center gap-1.5 mb-1',
                        isOutbound ? 'justify-end' : '',
                      )}>
                        {getChannelIcon(log.type)}
                        <span className={cn(
                          'text-[10px] uppercase font-medium',
                          isOutbound ? 'text-primary-foreground/70' : 'text-muted-foreground',
                        )}>
                          {log.type}
                        </span>
                      </div>

                      {/* Subject for emails */}
                      {log.subject && (
                        <p className={cn(
                          'text-xs font-semibold mb-1',
                          isOutbound ? 'text-primary-foreground/90' : 'text-foreground',
                        )}>
                          {log.subject}
                        </p>
                      )}

                      {/* Message body */}
                      <p className={cn(
                        'text-sm whitespace-pre-wrap',
                        isOutbound ? 'text-primary-foreground' : 'text-foreground',
                      )}>
                        {log.message}
                      </p>
                    </div>

                    {/* Timestamp and status */}
                    <div className={cn(
                      'flex items-center gap-2 mt-1',
                      isOutbound ? 'justify-end' : '',
                    )}>
                      <span className="text-[10px] text-muted-foreground">
                        {sentDate.toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}{' '}
                        {sentDate.toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
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
            <Button size="sm" onClick={handleSend} disabled={isSending}>
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
