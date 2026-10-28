'use client';


import { formatLocaleDateTime } from '@/lib/format';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BarChart3, Bot, Eye, Globe, Lock, MessageCircle, MessageSquare, Settings, Sparkles, X,
} from 'lucide-react';
import { ListPage } from '@/components/domain';
import {
  Button, Skeleton, Tag, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui';
import { useApiMutation } from '@/hooks/use-api';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { chatbotApi, type ChatbotConversation } from '@/lib/api/chatbot';
import { toast } from 'sonner';
import { toLocalDateString } from '@/lib/dates';

function statusTone(status: string): 'success' | 'danger' | 'info' | 'warning' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'handed_off') return 'warning';
  return 'neutral';
}

function channelIcon(channel: string) {
  if (channel === 'web') return <Globe className="size-3.5" aria-hidden="true" />;
  if (channel === 'whatsapp') return <MessageSquare className="size-3.5" aria-hidden="true" />;
  return <MessageCircle className="size-3.5" aria-hidden="true" />;
}

function toCsvValue(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function ChatbotConversationsContent() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = React.useState('');
  const [channelFilter, setChannelFilter] = React.useState('');

  const { mutate: closeConvo } = useApiMutation((id: string) => chatbotApi.conversations.close(id));

  const activeFilters = [
    statusFilter && { id: 'status', label: 'Status', value: statusFilter },
    channelFilter && { id: 'channel', label: 'Channel', value: channelFilter },
  ].filter(Boolean) as { id: string; label: string; value: string }[];

  function removeFilter(id: string) {
    if (id === 'status') setStatusFilter('');
    if (id === 'channel') setChannelFilter('');
  }

  return (
    <ListPage<ChatbotConversation>
      title="Chatbot"
      description="Conversations handled by your AI chatbot across web, WhatsApp, and more."
      getRowId={(c) => c.id}
      fetcher={({ page, limit, search }) =>
        chatbotApi.conversations.list({
          page,
          limit,
          status: statusFilter || undefined,
          channel: channelFilter || undefined,
          sortBy: 'startedAt',
          sortOrder: 'desc',
        }).then((res) => {
          if (!search.trim()) return res;
          const data = res.data;
          const items: ChatbotConversation[] = data?.data ?? [];
          const q = search.toLowerCase();
          const filtered = items.filter((c) =>
            (c.visitorName ?? '').toLowerCase().includes(q)
            || (c.visitorEmail ?? '').toLowerCase().includes(q)
            || c.messages?.some((m) => m.text.toLowerCase().includes(q)),
          );
          return {
            ...res,
            data: Array.isArray(data)
              ? filtered
              : { ...data, data: filtered, pagination: { ...data.pagination, total: filtered.length } },
          };
        })
      }
      searchPlaceholder="Search conversations..."
      columns={[
        {
          key: 'visitor', header: 'Visitor',
          cell: (c) => (
            <span className="text-sm font-medium">{c.visitorName || c.visitorEmail || 'Anonymous visitor'}</span>
          ),
        },
        {
          key: 'channel', header: 'Channel',
          cell: (c) => (
            <Tag tone="neutral" className="flex w-fit items-center gap-1 capitalize">
              {channelIcon(c.channel)} {c.channel}
            </Tag>
          ),
        },
        {
          key: 'status', header: 'Status',
          cell: (c) => <Tag tone={statusTone(c.status)}>{c.status.replace('_', ' ')}</Tag>,
        },
        {
          key: 'lastMessage', header: 'Last message',
          cell: (c) => {
            const last = c.messages?.[c.messages.length - 1];
            if (!last) return <span className="text-ds-foreground-muted">—</span>;
            return (
              <span className="block max-w-xs truncate text-sm text-ds-foreground-muted">
                {last.sender === 'bot' ? 'Bot: ' : ''}{last.text}
              </span>
            );
          },
        },
        {
          key: 'startedAt', header: 'Started', sortable: true,
          cell: (c) => formatLocaleDateTime(c.startedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
        },
      ]}
      headerActions={
        <>
          <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-9 w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="handed_off">Handed off</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={channelFilter || 'all'} onValueChange={(v) => setChannelFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-9 w-32"><SelectValue placeholder="All channels" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              <SelectItem value="website">Web</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
              <SelectItem value="telegram">Telegram</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" asChild>
            <Link href="/chatbot/analytics"><BarChart3 aria-hidden="true" /> Analytics</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings/chatbot"><Settings aria-hidden="true" /> Settings</Link>
          </Button>
        </>
      }
      filters={activeFilters}
      onRemoveFilter={removeFilter}
      onClearFilters={() => { setStatusFilter(''); setChannelFilter(''); }}
      rowActions={(c) => (
        <>
          <Button variant="ghost" size="icon-sm" aria-label="View" onClick={() => router.push(`/chatbot/conversations/${c.id}`)}>
            <Eye />
          </Button>
          {c.status === 'active' && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close conversation"
              onClick={async () => {
                const result = await closeConvo(c.id);
                if (result) toast.success('Conversation closed');
                else toast.error('Failed to close conversation');
              }}
            >
              <X />
            </Button>
          )}
        </>
      )}
      onRowClick={(c) => router.push(`/chatbot/conversations/${c.id}`)}
      bulkActions={[
        {
          label: 'Close',
          icon: <X aria-hidden="true" />,
          onSelect: async (rows) => {
            await Promise.all(rows.filter((r) => r.status === 'active').map((r) => chatbotApi.conversations.close(r.id)));
            toast.success(`${rows.length} conversation(s) closed`);
          },
        },
      ]}
      onExport={async (rows) => {
        try {
          const allItems: ChatbotConversation[] = [...rows];
          const seen = new Set(allItems.map((r) => r.id));
          let page = 1;
          const limit = 200;
          for (;;) {
            const res = await chatbotApi.conversations.list({
              page,
              limit,
              status: statusFilter || undefined,
              channel: channelFilter || undefined,
            });
            const data = res.data;
            const items: ChatbotConversation[] = data?.data ?? [];
            const total: number = data?.pagination?.total ?? items.length;
            for (const item of items) {
              if (!seen.has(item.id)) {
                seen.add(item.id);
                allItems.push(item);
              }
            }
            if (items.length === 0 || allItems.length >= total) break;
            page += 1;
          }

          const headers = ['Visitor', 'Email', 'Channel', 'Status', 'Started', 'Ended', 'Messages'];
          const csvRows = [headers.join(',')];
          for (const c of allItems) {
            csvRows.push([
              toCsvValue(c.visitorName ?? ''),
              toCsvValue(c.visitorEmail ?? ''),
              toCsvValue(c.channel),
              toCsvValue(c.status),
              toCsvValue(formatLocaleDateTime(c.startedAt)),
              toCsvValue(c.endedAt ? formatLocaleDateTime(c.endedAt) : ''),
              toCsvValue(c.messages?.length ?? 0),
            ].join(','));
          }
          const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `chatbot_conversations_${toLocalDateString(new Date())}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast.success('Conversations exported successfully');
        } catch {
          toast.error('Failed to export conversations');
        }
      }}
      exportLabel="Export CSV"
      emptyTitle="No conversations yet"
      emptyDescription="Conversations from your website, WhatsApp, and other channels will appear here once the chatbot is live."
      emptyIcon={<Bot className="size-8" aria-hidden="true" />}
      emptyAction={
        <Button size="sm" asChild>
          <Link href="/settings/chatbot"><Settings aria-hidden="true" /> Configure chatbot</Link>
        </Button>
      }
    />
  );
}

export default function ChatbotPage() {
  const { enabled, reason, upgradeHref, loading } = useFeatureGate('ai_chatbot');

  if (loading) {
    return (
      <div className="flex flex-col gap-ds-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-ds-3 rounded-ds-lg border border-dashed border-ds-border py-ds-9 text-center">
        <div className="flex size-12 items-center justify-center rounded-ds-full bg-ds-surface-sunken">
          <Lock className="size-5 text-ds-foreground-muted" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-medium text-ds-foreground">
            {reason === 'cap_exceeded' ? "Today's chatbot quota is used up" : 'AI Chatbot is not on your plan'}
          </p>
          <p className="mt-ds-1 text-xs text-ds-foreground-muted">
            {reason === 'cap_exceeded'
              ? 'Your quota resets automatically tomorrow, or upgrade for a higher daily limit.'
              : 'Upgrade your plan to unlock the AI chatbot across web and WhatsApp.'}
          </p>
        </div>
        <Button asChild size="sm" className="gap-ds-2">
          <Link href={upgradeHref}>
            <Sparkles className="size-3.5" aria-hidden="true" />
            {reason === 'cap_exceeded' ? 'Upgrade for more' : 'Upgrade to enable'}
          </Link>
        </Button>
      </div>
    );
  }

  return <ChatbotConversationsContent />;
}
