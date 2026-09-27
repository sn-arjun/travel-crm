'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, FileText, PhoneOff } from 'lucide-react';
import { ListPage } from '@/components/domain';
import { Button, Tag, Skeleton, EmptyState } from '@/components/ui';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { voipApi, type TranscriptSearchResult } from '@/lib/api/voip';

export default function TranscriptSearchPage() {
  const router = useRouter();
  const { enabled, reason, upgradeHref, loading: gateLoading } = useFeatureGate('voip_calling');

  if (gateLoading) return <Skeleton className="h-9 w-32" />;

  if (!enabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-ds-3 p-ds-9 text-center">
        <PhoneOff className="size-10 text-ds-foreground-subtle" aria-hidden="true" />
        <p className="text-sm text-ds-foreground-muted">
          {reason === 'cap_exceeded' ? 'Call limit reached for your plan.' : 'VoIP calling is not enabled on your plan.'}
        </p>
        <Button asChild size="sm">
          <a href={upgradeHref}>Upgrade to enable</a>
        </Button>
      </div>
    );
  }

  return (
    <ListPage<TranscriptSearchResult>
      title="Transcript search"
      description="Search across all call transcripts."
      getRowId={(t) => t.id}
      fetcher={({ page, limit, search }) => {
        // Backend is FTS-only — it 400s on an empty query, so don't call it
        // until the user has typed something.
        if (!search.trim()) {
          return Promise.resolve({ data: { data: [], pagination: { total: 0 } } });
        }
        return voipApi.transcripts.search({ q: search, page, limit });
      }}
      searchPlaceholder="Search transcripts…"
      columns={[
        {
          key: 'callId', header: 'Call',
          cell: (t) => (
            <div className="flex items-center gap-ds-2">
              <FileText className="size-3.5 shrink-0 text-ds-foreground-muted" aria-hidden="true" />
              <span className="text-sm">{t.contactName || t.fromNumber || t.toNumber || t.callId}</span>
            </div>
          ),
        },
        {
          key: 'snippet', header: 'Snippet',
          cell: (t) => <span className="line-clamp-2 text-sm text-ds-foreground-muted">{t.snippet.replace(/<\/?mark>/g, '')}</span>,
        },
        {
          key: 'direction', header: 'Direction',
          cell: (t) => (t.direction ? <Tag tone="neutral">{t.direction}</Tag> : <span className="text-xs text-ds-foreground-subtle">—</span>),
        },
        {
          key: 'language', header: 'Language',
          cell: (t) => (t.language ? <Tag tone="neutral">{t.language}</Tag> : <span className="text-xs text-ds-foreground-subtle">—</span>),
        },
      ]}
      rowActions={(t) => (
        <Button variant="ghost" size="icon-sm" aria-label="View call"
          onClick={() => router.push(`/communication/calls/${t.callId}`)}><Eye /></Button>
      )}
      onRowClick={(t) => router.push(`/communication/calls/${t.callId}`)}
      emptyTitle="No transcripts found"
      emptyDescription="Type a search term to find matching call transcripts."
      emptyIcon={<FileText className="size-8" />}
    />
  );
}
