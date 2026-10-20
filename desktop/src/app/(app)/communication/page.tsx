'use client';


import { formatLocaleDateTime } from '@/lib/format';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Mail, MessageSquare, Phone, Eye, Trash2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { ListPage } from '@/components/domain';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { communicationsApi, isIncomingMessage, senderLabel, type CommunicationLog } from '@/lib/api/communications';
import { contactsApi } from '@/lib/api/contacts';
import { toLocalDateString } from '@/lib/dates';
import { AssistantPanel } from '@/components/domain/assistant/assistant-panel';
import { useSuggestions } from '@/hooks/use-suggestions';

// The log endpoint returns raw contactId only — resolve display names client-side
// for the page of rows currently shown, caching across re-fetches.
const contactNameCache = new Map<string, string>();

async function resolveRecipients(rows: CommunicationLog[]): Promise<CommunicationLog[]> {
  const idsToFetch = [...new Set(
    rows.filter((r) => r.contactId && !r.recipient && !contactNameCache.has(r.contactId)).map((r) => r.contactId!),
  )];
  if (idsToFetch.length > 0) {
    await Promise.all(idsToFetch.map(async (id) => {
      try {
        const res = await contactsApi.getById(id);
        if (res.data?.name) contactNameCache.set(id, res.data.name);
      } catch {
        // Leave unresolved — row falls back to "Unknown contact".
      }
    }));
  }
  return rows.map((r) => {
    if (r.recipient) return r;
    if (r.contactId && contactNameCache.has(r.contactId)) return { ...r, recipient: contactNameCache.get(r.contactId) };
    // A received message from someone who is not a contact yet: show who wrote.
    if (!r.contactId && senderLabel(r)) return { ...r, recipient: senderLabel(r) ?? undefined };
    return r;
  });
}

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function channelTone(channel: string): 'info' | 'success' | 'warning' | 'neutral' {
  switch (channel) {
    case 'email': return 'info';
    case 'whatsapp': return 'success';
    case 'sms': return 'warning';
    default: return 'neutral';
  }
}

function channelIcon(channel: string) {
  switch (channel) {
    case 'email': return <Mail className="size-3.5" aria-hidden="true" />;
    case 'sms': return <Phone className="size-3.5" aria-hidden="true" />;
    case 'whatsapp': return <MessageSquare className="size-3.5" aria-hidden="true" />;
    case 'call': return <Phone className="size-3.5" aria-hidden="true" />;
    default: return <Mail className="size-3.5" aria-hidden="true" />;
  }
}

function toCsv(rows: CommunicationLog[]) {
  const header = ['Contact', 'Channel', 'Message', 'Status', 'Sent At'];
  const statusOf = (r: CommunicationLog) => (isIncomingMessage(r) ? 'received' : r.status);
  const lines = rows.map((r) => [
    r.recipient ?? '',
    r.channel ?? r.type ?? '',
    (r.message ?? r.content ?? r.subject ?? '').replace(/\n/g, ' ').replace(/"/g, '""'),
    statusOf(r),
    r.sentAt ?? r.createdAt,
  ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
  return [header.join(','), ...lines].join('\n');
}

function downloadCsv(rows: CommunicationLog[]) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `communication-log-${toLocalDateString(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const CHANNEL_OPTIONS = [
  { value: 'all', label: 'All channels' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'call', label: 'Calls' },
];

export default function CommunicationPage() {
  const router = useRouter();
  const [channel, setChannel] = React.useState('all');

  // Which rows the assistant has something waiting for: by the message itself or by its contact.
  const { suggestions: waiting } = useSuggestions({ status: 'pending', limit: 100 });
  const waitingFor = React.useCallback(
    (l: CommunicationLog) =>
      waiting.filter((s) => s.sourceId === l.id || (!!l.contactId && s.contactId === l.contactId && isIncomingMessage(l))).length,
    [waiting],
  );

  const filters = channel !== 'all'
    ? [{ id: 'channel', label: 'Channel', value: channel }]
    : [];

  return (
    <ListPage<CommunicationLog>
      title="Inbox"
      description="All messages sent and received across every channel."
      getRowId={(l) => l.id}
      fetcher={async ({ page, limit, search }) => {
        const res = await communicationsApi.getLog({
          page,
          limit,
          search: search || undefined,
          channel: channel !== 'all' ? channel : undefined,
          sortBy: 'sentAt',
          sortOrder: 'desc',
        });
        const rows = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
        const resolved = await resolveRecipients(rows);
        if (Array.isArray(res.data)) {
          (res as { data: unknown }).data = resolved;
        } else if (res.data) {
          res.data.data = resolved;
        }
        return res;
      }}
      searchPlaceholder="Search conversations…"
      filters={filters}
      onRemoveFilter={() => setChannel('all')}
      onClearFilters={() => setChannel('all')}
      headerActions={
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHANNEL_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      columns={[
        {
          key: 'contact',
          header: 'Contact',
          cell: (l) => (
            <div className="flex items-center gap-ds-3">
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">{getInitials(l.recipient ?? 'NA')}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{l.recipient ?? 'Unknown contact'}</span>
            </div>
          ),
        },
        {
          key: 'channel',
          header: 'Channel',
          cell: (l) => (
            <Tag tone={channelTone(l.channel ?? l.type ?? 'email')}>
              <span className="flex items-center gap-ds-1">
                {channelIcon(l.channel ?? l.type ?? 'email')}
                {(l.channel ?? l.type ?? 'email').toUpperCase()}
              </span>
            </Tag>
          ),
        },
        {
          key: 'preview',
          header: 'Message',
          cell: (l) => (
            <span className="flex items-center gap-ds-2">
              {waitingFor(l) > 0 && (
                <Tag tone="primary" size="sm" className="shrink-0">
                  <span className="flex items-center gap-ds-1">
                    <Sparkles className="size-3" aria-hidden="true" />
                    {waitingFor(l) === 1 ? 'Suggestion' : `${waitingFor(l)} suggestions`}
                  </span>
                </Tag>
              )}
              <span className="line-clamp-1 max-w-xs text-sm text-ds-foreground-muted">
                {l.message ?? l.content ?? l.subject ?? 'No preview'}
              </span>
            </span>
          ),
        },
        {
          key: 'status',
          header: 'Status',
          cell: (l) => (
            isIncomingMessage(l) ? (
              <Tag tone="info">received</Tag>
            ) : (
              <Tag tone={l.status === 'failed' ? 'danger' : l.status === 'sent' || l.status === 'delivered' || l.status === 'read' ? 'success' : 'warning'}>
                {l.status}
              </Tag>
            )
          ),
        },
        {
          key: 'sentAt',
          header: 'Sent',
          sortable: true,
          cell: (l) => {
            const when = l.sentAt ?? l.createdAt;
            return when ? formatLocaleDateTime(when, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
          },
        },
      ]}
      primaryAction={
        <Button size="sm" onClick={() => router.push('/communication/compose')}>
          New message
        </Button>
      }
      rowActions={(l) => (
        <>
          {l.contactId && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="View conversation"
              onClick={() => router.push(`/communication/${l.contactId}`)}
            >
              <Eye className="size-3.5" aria-hidden="true" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete"
            className="text-ds-danger hover:text-ds-danger"
            onClick={() => toast.error('Deleting communication log entries is not supported yet.')}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        </>
      )}
      renderDetail={(l) => (
        <div className="flex flex-col gap-ds-4 pt-ds-4">
          <div className="flex items-center gap-ds-3">
            <Avatar className="size-10">
              <AvatarFallback>{getInitials(l.recipient ?? 'NA')}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold">{l.recipient ?? 'Unknown contact'}</p>
              <p className="text-xs text-ds-foreground-muted">{(l.sentAt ?? l.createdAt) ? formatLocaleDateTime((l.sentAt ?? l.createdAt) as string) : ''}</p>
            </div>
          </div>
          {l.subject && <p className="text-sm font-medium">{l.subject}</p>}
          <p className="whitespace-pre-wrap text-sm text-ds-foreground-muted">{l.message ?? l.content ?? 'No content'}</p>
          {isIncomingMessage(l) && (
            <AssistantPanel entityType="message" entityId={l.id} contactId={l.contactId ?? undefined} className="[&>div:last-child]:grid-cols-1" />
          )}
          {l.contactId && (
            <Button size="sm" variant="outline" onClick={() => router.push(`/communication/${l.contactId}`)}>
              Open full conversation
            </Button>
          )}
        </div>
      )}
      detailTitle={(l) => l.recipient ?? 'Conversation'}
      onExport={(rows) => downloadCsv(rows)}
      emptyTitle="No conversations yet"
      emptyDescription="Messages you send or receive across email, SMS, and WhatsApp will show up here."
      emptyAction={
        <Button size="sm" onClick={() => router.push('/communication/compose')}>
          Compose a message
        </Button>
      }
    />
  );
}
