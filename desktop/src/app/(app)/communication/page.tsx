'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Phone, Mail, MessageSquare, Circle, Eye, Trash2, Loader,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FilterBar } from '@/components/domain/filter-bar';
import { cn } from '@/lib/utils';

import { useApiQuery } from '@/hooks/use-api';
import { communicationsApi, type CommunicationLog } from '@/lib/api/communications';

interface Conversation extends Partial<CommunicationLog> {
  id: string;
  contactName: string;
  contactId?: string;
  channel: 'call' | 'email' | 'sms' | 'whatsapp';
  preview: string;
  time: string;
  unread: boolean;
}

function getInitials(name: string) {
  return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
}

/* ─── Main Communication Page ─── */
export default function CommunicationPage() {
  const [search, setSearch] = React.useState('');
  const [channelFilter, setChannelFilter] = React.useState('all');
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  const { data: response, loading, error } = useApiQuery<any>(
    () => communicationsApi.getLog({
      channel: channelFilter !== 'all' ? channelFilter : undefined,
      search: search || undefined,
      sortBy: 'sentAt',
      sortOrder: 'desc',
    }),
    [channelFilter, search],
  );

  const logs = ((response?.data?.data ?? response?.data ?? []) as CommunicationLog[]);

  const conversations: Conversation[] = React.useMemo(() => {
    if (!logs || !Array.isArray(logs)) return [];
    return logs.map((log, idx): Conversation => ({
      ...log,
      id: log.id ?? `conv-${idx}`,
      contactName: log.recipient ?? `Contact ${idx + 1}`,
      contactId: log.contactId,
      channel: (log.channel ?? log.type ?? 'email') as Conversation['channel'],
      preview: log.message ?? log.content ?? log.subject ?? 'No preview',
      time: log.sentAt
        ? new Date(log.sentAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        : '',
      unread: idx < 3,
    }));
  }, [logs]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Inbox
          </h1>
          <p className="text-sm text-muted-foreground">
            {loading ? '...' : `${conversations.length} conversations`}
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/communication/compose">New Message</Link>
        </Button>
      </div>

      {/* Channel Tabs */}
      <div className="border-b px-6 pt-3">
        <Tabs value={channelFilter} onValueChange={setChannelFilter} className="w-full">
          <TabsList className="w-full justify-start bg-transparent border-b-0 p-0">
            {([
              { value: 'all', label: 'All' },
              { value: 'call', label: 'Calls', icon: Phone },
              { value: 'email', label: 'Emails', icon: Mail },
              { value: 'sms', label: 'SMS', icon: Phone },
              { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
            ] as const).map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary gap-1.5"
              >
                {'icon' in tab && tab.icon && (
                  <tab.icon className="h-3.5 w-3.5" />
                )}
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-auto">
        {/* Left Panel - Conversations List */}
        <div className="w-80 border-r flex flex-col">
          {/* Search */}
          <div className="px-4 py-3 border-b">
            <FilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search conversations..."
            />
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error || conversations.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-center p-4">
                <p>{error ? 'Failed to load communications' : 'No conversations found'}</p>
              </div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  onMouseEnter={() => setHoveredId(conv.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3 border-b cursor-pointer hover:bg-muted/50 transition-colors relative',
                  )}
                >
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="text-xs">
                        {getInitials(conv.contactName)}
                      </AvatarFallback>
                    </Avatar>
                    {conv.unread && (
                      <Circle className="absolute bottom-0 right-0 h-3 w-3 fill-primary text-primary" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={cn('text-sm', conv.unread && 'font-semibold')}>
                        {conv.contactName}
                      </p>
                      <span className="text-xs text-muted-foreground">{conv.time}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {conv.channel === 'call' && <Phone className="h-3 w-3 text-blue-500 shrink-0" />}
                      {conv.channel === 'email' && <Mail className="h-3 w-3 text-green-500 shrink-0" />}
                      {(conv.channel === 'sms' || conv.channel === 'whatsapp') && (
                        <MessageSquare className="h-3 w-3 text-emerald-500 shrink-0" />
                      )}
                      <p className={cn(
                        'text-xs truncate',
                        conv.unread ? 'text-foreground' : 'text-muted-foreground',
                      )}>
                        {conv.preview}
                      </p>
                    </div>
                  </div>

                  {/* Hover actions */}
                  {hoveredId === conv.id && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-background border rounded-md shadow-sm px-1 py-0.5">
                      {conv.contactId && (
                        <Link href={`/communication/${conv.contactId}`}>
                          <Button variant="ghost" size="icon-sm" title="View conversation">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Delete"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Prompt to select */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-4 opacity-20 mx-auto" />
            <p className="text-sm">Select a conversation or open a contact to view messages</p>
            <p className="text-xs mt-2">
              Or{' '}
              <Link href="/communication/compose" className="text-primary hover:underline">
                compose a new message
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
