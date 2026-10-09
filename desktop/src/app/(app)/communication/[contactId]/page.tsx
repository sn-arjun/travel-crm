'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Mail, MessageSquare, Phone } from 'lucide-react';

import { DetailPage } from '@/components/domain';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tag } from '@/components/ui/tag';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { useApiQuery } from '@/hooks/use-api';
import { communicationsApi, isIncomingMessage, type CommunicationLog } from '@/lib/api/communications';
import { contactsApi } from '@/lib/api/contacts';

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
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

function statusTone(status: string): 'success' | 'info' | 'danger' | 'warning' | 'neutral' {
  switch (status) {
    case 'sent':
    case 'delivered':
      return 'info';
    case 'read':
      return 'success';
    case 'failed':
      return 'danger';
    case 'queued':
      return 'warning';
    default:
      return 'neutral';
  }
}

export default function ContactCommunicationHubPage() {
  const router = useRouter();
  const params = useParams();
  const contactId = params.contactId as string;

  const [channelFilter, setChannelFilter] = React.useState('all');

  const { data: contactResponse, loading: loadingContact } = useApiQuery(
    () => contactsApi.getById(contactId),
    [contactId],
  );
  const contact = contactResponse?.data;

  const { data: logResponse, loading, error, refetch: refetchLog } = useApiQuery(
    () => communicationsApi.getHistory({
      contact_id: contactId,
      channel: channelFilter !== 'all' ? channelFilter : undefined,
      sortBy: 'sentAt',
      sortOrder: 'asc',
    }),
    [contactId, channelFilter],
  );
  const logs = (Array.isArray(logResponse?.data) ? logResponse.data : (logResponse?.data?.data ?? [])) as CommunicationLog[];

  const contactName = contact?.name ?? `Contact ${contactId.slice(0, 8)}`;

  return (
    <DetailPage
      assistant={{ contactId, onChanged: () => void refetchLog({ silent: true }) }}
      entity={contact}
      title={loadingContact ? 'Loading…' : contactName}
      subtitle={contact ? [contact.email, contact.phone].filter(Boolean).join(' · ') : undefined}
      onBack={() => router.back()}
      status={<Tag tone="neutral">{logs.length} messages</Tag>}
      messaging={contact ? {
        recipientId: contact.id,
        recipientName: contact.name,
        email: contact.email ?? undefined,
        phone: contact.phone ?? undefined,
      } : undefined}
      overview={
        <div className="flex flex-col gap-ds-4">
          <div className="flex items-center justify-end">
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="call">Calls</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex flex-col gap-ds-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : error ? (
            <EmptyState title="Failed to load communications" description="Please try again." />
          ) : logs.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="size-8" aria-hidden="true" />}
              title="No messages yet"
              description="Use “Send message” above to start a conversation."
            />
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-ds-4">
              {logs.map((log) => {
                const isOutbound = !isIncomingMessage(log);
                const channel = log.channel ?? log.type ?? 'email';
                const sentAt = log.sentAt ?? log.createdAt;
                const sentDate = sentAt ? new Date(sentAt) : null;

                return (
                  <div key={log.id} className={`flex gap-ds-3 ${isOutbound ? 'flex-row-reverse' : ''}`}>
                    {!isOutbound && (
                      <Avatar className="size-8 shrink-0">
                        <AvatarFallback className="text-xs">{getInitials(contactName)}</AvatarFallback>
                      </Avatar>
                    )}
                    <div className={`flex max-w-md flex-col ${isOutbound ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`rounded-ds-lg px-ds-4 py-ds-3 ${
                          isOutbound ? 'bg-ds-primary text-ds-primary-foreground' : 'bg-ds-surface-sunken'
                        }`}
                      >
                        <div className={`mb-ds-1 flex items-center gap-ds-1 ${isOutbound ? 'justify-end' : ''}`}>
                          {channelIcon(channel)}
                          <span className="text-xs font-medium uppercase">{channel}</span>
                        </div>
                        {log.subject && (
                          <p className="mb-ds-1 text-xs font-semibold">{log.subject}</p>
                        )}
                        <p className="whitespace-pre-wrap text-sm">{log.message ?? log.content}</p>
                      </div>
                      <div className={`mt-ds-1 flex items-center gap-ds-2 ${isOutbound ? 'justify-end' : ''}`}>
                        <span className="text-xs text-ds-foreground-subtle">
                          {sentDate ? sentDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}{' '}
                          {sentDate ? sentDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                        {isOutbound && <Tag tone={statusTone(log.status)} size="sm">{log.status}</Tag>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      }
    />
  );
}
