'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  MessageCircle, Search, Clock, User, ArrowRight,
  Loader, AlertCircle, Filter, Globe, MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { chatbotApi, type ChatbotConversation } from '@/lib/api/chatbot';

function statusBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-transparent">Active</Badge>;
    case 'closed':
      return <Badge variant="outline" className="text-muted-foreground">Closed</Badge>;
    case 'handed_off':
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-transparent">Handed Off</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function channelIcon(channel: string) {
  switch (channel) {
    case 'web': return <Globe className="h-3.5 w-3.5" />;
    case 'whatsapp': return <MessageSquare className="h-3.5 w-3.5" />;
    case 'facebook': return <MessageCircle className="h-3.5 w-3.5" />;
    default: return <MessageCircle className="h-3.5 w-3.5" />;
  }
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ChatbotConversationsPage() {
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [channelFilter, setChannelFilter] = React.useState('all');

  const { data: response, loading, error } = useApiQuery<any>(
    () => chatbotApi.conversations.list({
      limit: 50,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      channel: channelFilter !== 'all' ? channelFilter : undefined,
    }),
    [statusFilter, channelFilter],
  );

  const conversations: ChatbotConversation[] = React.useMemo(() => {
    const data = response?.data;
    const items: ChatbotConversation[] = Array.isArray(data) ? data : (data?.data ?? []);
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((c) =>
      (c.visitorName ?? '').toLowerCase().includes(q)
      || (c.visitorEmail ?? '').toLowerCase().includes(q)
      || c.messages?.some((m) => m.text.toLowerCase().includes(q)),
    );
  }, [response, search]);

  // Stats
  const activeCount = conversations.filter((c) => c.status === 'active').length;
  const handedOffCount = conversations.filter((c) => c.status === 'handed_off').length;
  const closedCount = conversations.filter((c) => c.status === 'closed').length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Chatbot Conversations
          </h1>
          <p className="text-sm text-muted-foreground">{conversations.length} conversations</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/chatbot/analytics">Analytics</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings/chatbot">Settings</Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-lg font-bold">{activeCount}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <User className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-lg font-bold">{handedOffCount}</p>
              <p className="text-xs text-muted-foreground">Handed Off</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <Clock className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <p className="text-lg font-bold">{closedCount}</p>
              <p className="text-xs text-muted-foreground">Closed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="handed_off">Handed Off</SelectItem>
          </SelectContent>
        </Select>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-28 h-9">
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="web">Web</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="telegram">Telegram</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <AlertCircle className="h-8 w-8" />
            <p>Failed to load conversations</p>
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <MessageCircle className="h-10 w-10 opacity-50" />
            <p className="text-sm">No conversations found</p>
          </div>
        ) : (
          <div className="divide-y">
            {conversations.map((convo) => {
              const lastMessage = convo.messages?.[convo.messages.length - 1];
              return (
                <Link
                  key={convo.id}
                  href={`/chatbot/conversations/${convo.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-muted/50 transition-colors"
                >
                  <div className={cn(
                    'h-10 w-10 rounded-full flex items-center justify-center shrink-0',
                    convo.status === 'active'
                      ? 'bg-green-100 dark:bg-green-900/30'
                      : convo.status === 'handed_off'
                      ? 'bg-amber-100 dark:bg-amber-900/30'
                      : 'bg-gray-100 dark:bg-gray-800',
                  )}>
                    <User className={cn(
                      'h-5 w-5',
                      convo.status === 'active'
                        ? 'text-green-600 dark:text-green-400'
                        : convo.status === 'handed_off'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-gray-500',
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium truncate">
                        {convo.visitorName || convo.visitorEmail || 'Anonymous Visitor'}
                      </p>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        {channelIcon(convo.channel)}
                        <span className="text-[10px] capitalize">{convo.channel}</span>
                      </div>
                    </div>
                    {lastMessage && (
                      <p className="text-xs text-muted-foreground truncate">
                        {lastMessage.sender === 'bot' ? 'Bot: ' : ''}
                        {lastMessage.text}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {statusBadge(convo.status)}
                    <span className="text-[10px] text-muted-foreground">
                      {timeAgo(convo.startedAt)}
                    </span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
