'use client';

import * as React from 'react';
import {
  Search, Phone, Mail, MessageSquare, ChevronRight, Circle,
  MoreHorizontal, Delete, Archive, Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

import { useApiQuery } from '@/hooks/use-api';
import { communicationsApi, type CommunicationLog } from '@/lib/api/communications';
import { Loader, AlertCircle } from 'lucide-react';

interface Conversation extends Partial<CommunicationLog> {
  id: string;
  contactName: string;
  type: 'call' | 'email' | 'sms' | 'whatsapp';
  preview: string;
  time: string;
  unread: boolean;
}

function getInitials(name: string) {
  return name.split(' ').map((n: any) => n[0]).join('').toUpperCase().slice(0, 2);
}

/* ─── Conversation Detail Panel ─── */
function ConversationDetailPanel({ conversation }: { conversation: Conversation }) {
  const messages = [
    { id: 1, sender: conversation.contactName, text: 'Hi, I am interested in a trip to Maldives', time: '10:30 AM', direction: 'in' as const },
    { id: 2, sender: 'You', text: 'Great! Let me check available packages for your dates.', time: '10:32 AM', direction: 'out' as const },
    { id: 3, sender: conversation.contactName, text: 'I need it for 5 days, for 2 adults and 1 child', time: '10:35 AM', direction: 'in' as const },
    { id: 4, sender: 'You', text: conversation.preview, time: 'Just now', direction: 'out' as const },
  ];

  return (
    <div className="flex-1 flex flex-col border-l">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="text-sm">{getInitials(conversation.contactName)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-semibold">{conversation.contactName}</p>
            <p className="text-xs text-muted-foreground">Active now</p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>View contact</DropdownMenuItem>
            <DropdownMenuItem>Mute conversation</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg: any) => (
          <div key={msg.id} className={cn('flex gap-3', msg.direction === 'out' && 'flex-row-reverse')}>
            {msg.direction === 'in' && (
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-xs">{getInitials(msg.sender)}</AvatarFallback>
              </Avatar>
            )}
            <div className={cn('flex flex-col gap-1', msg.direction === 'out' && 'items-end')}>
              <p
                className={cn(
                  'text-sm px-3 py-2 rounded-lg max-w-xs',
                  msg.direction === 'out'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground',
                )}
              >
                {msg.text}
              </p>
              <p className="text-xs text-muted-foreground">{msg.time}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <Input placeholder="Type your message..." className="flex-1 h-9" />
          <Button size="sm">Send</Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Communication Page ─── */
export default function CommunicationPage() {
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [selectedConv, setSelectedConv] = React.useState<Conversation | null>(null);

  const { data: response = {}, loading, error } = useApiQuery<any>(
    () => communicationsApi.getHistory(typeFilter !== 'all' ? { channel: typeFilter } : undefined),
    [typeFilter],
  );

  const logs = ((response?.data ?? []) as CommunicationLog[]);

  const conversations: Conversation[] = React.useMemo(() => {
    if (!logs || !Array.isArray(logs)) return [];
    return logs.map((log, idx) => {
      const base = {
        id: log.id ?? `conv-${idx}`,
        contactName: log.recipient ?? 'Unknown',
        preview: log.message ?? log.subject ?? 'No preview',
        time: new Date(log.sentAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        unread: idx < 5,
      };
      return {
        ...base,
        type: (log.type as any) ?? 'email',
      } as Conversation;
    });
  }, [logs]);

  const filtered = React.useMemo(() => {
    let result = [...conversations];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((c: any) => c.contactName?.toLowerCase().includes(q) || c.preview?.toLowerCase().includes(q));
    }
    return result;
  }, [conversations, search]);

  // Set initial selected conversation
  React.useEffect(() => {
    if (filtered.length > 0 && !selectedConv) {
      setSelectedConv(filtered[0] ?? null);
    }
  }, [filtered, selectedConv]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Inbox
          </h1>
          <p className="text-sm text-muted-foreground">{filtered.length} conversations</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">New Message</Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-auto">
        {/* Left Panel - Conversations List */}
        <div className="w-80 border-r flex flex-col">
          {/* Tabs */}
          <div className="border-b px-4 pt-3">
            <Tabs value={typeFilter} onValueChange={setTypeFilter} className="w-full">
              <TabsList className="w-full justify-start bg-transparent border-b-0 p-0">
                <TabsTrigger value="all" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
                  All
                </TabsTrigger>
                <TabsTrigger value="call" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
                  Calls
                </TabsTrigger>
                <TabsTrigger value="email" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
                  Emails
                </TabsTrigger>
                <TabsTrigger value="whatsapp" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
                  WhatsApp
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Search */}
          <div className="px-4 py-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error || filtered.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-center p-4">
                <p>{error ? 'Failed to load communications' : 'No communications found'}</p>
              </div>
            ) : (
              filtered.map((conv: any) => (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConv(conv)}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3 border-b cursor-pointer hover:bg-muted/50 transition-colors',
                    selectedConv?.id === conv.id && 'bg-muted',
                  )}
                >
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="text-xs">{conv.contactName.split(' ').map((n: any) => n[0]).join('').slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    {conv.unread && <Circle className="absolute bottom-0 right-0 h-3 w-3 fill-primary text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={cn('text-sm', conv.unread && 'font-semibold')}>{conv.contactName}</p>
                      <span className="text-xs text-muted-foreground">{conv.time}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {conv.type === 'call' && <Phone className="h-3 w-3 text-blue-500" />}
                      {conv.type === 'email' && <Mail className="h-3 w-3 text-green-500" />}
                      {(conv.type === 'sms' || conv.type === 'whatsapp') && <MessageSquare className="h-3 w-3 text-emerald-500" />}
                      <p className={cn('text-xs truncate', conv.unread ? 'text-foreground' : 'text-muted-foreground')}>
                        {conv.preview}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Conversation Detail */}
        {selectedConv ? (
          <ConversationDetailPanel conversation={selectedConv} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-muted-foreground">Select a conversation to start</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
