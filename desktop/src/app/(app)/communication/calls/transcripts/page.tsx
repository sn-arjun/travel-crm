'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, FileText, PhoneOff } from 'lucide-react';
import { ListPage } from '@/components/domain';
import { Button, Tag, Skeleton } from '@/components/ui';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { voipApi, type Transcript } from '@/lib/api/voip';

function sentimentTone(sentiment?: Transcript['sentiment']): 'success' | 'danger' | 'neutral' {
  if (sentiment === 'positive') return 'success';
  if (sentiment === 'negative') return 'danger';
  return 'neutral';
}

function getSnippet(text: string, query: string, contextLength = 150): string {
  if (!query.trim()) return text.slice(0, contextLength * 2);
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, contextLength * 2);
  const start = Math.max(0, idx - contextLength);
  const end = Math.min(text.length, idx + query.length + contextLength);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet += '...';
  return snippet;
}

export default function TranscriptSearchPage() {
  const router = useRouter();
  const { enabled, reason, upgradeHref, loading: gateLoading } = useFeatureGate('voip_calling');
  const [sentimentFilter, setSentimentFilter] = React.useState<string | null>(null);

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

  const filters = sentimentFilter
    ? [{ id: 'sentiment', label: `Sentiment: ${sentimentFilter}`, value: sentimentFilter }]
    : [];

  return (
    <ListPage<Transcript>
      title="Transcript search"
      description="Search across all call transcripts."
      getRowId={(t) => t.id}
      fetcher={({ page, limit, search }) =>
        voipApi.transcripts.list({ page, limit, sentiment: sentimentFilter ?? undefined }).then((r) => {
          if (!search) return r;
          const q = search.toLowerCase();
          const filtered = r.data.data.filter((t) => t.text.toLowerCase().includes(q));
          return { ...r, data: { ...r.data, data: filtered } };
        })
      }
      filters={filters}
      onRemoveFilter={() => setSentimentFilter(null)}
      onClearFilters={() => setSentimentFilter(null)}
      onOpenFilters={() => {
        setSentimentFilter((prev) =>
          prev === 'positive' ? 'neutral' : prev === 'neutral' ? 'negative' : prev === 'negative' ? null : 'positive');
      }}
      searchPlaceholder="Search transcripts…"
      columns={[
        {
          key: 'callId', header: 'Call',
          cell: (t) => (
            <div className="flex items-center gap-ds-2">
              <FileText className="size-3.5 shrink-0 text-ds-foreground-muted" aria-hidden="true" />
              <span className="font-mono text-sm">{t.callId}</span>
            </div>
          ),
        },
        {
          key: 'snippet', header: 'Snippet',
          cell: (t) => <span className="line-clamp-2 text-sm text-ds-foreground-muted">{getSnippet(t.text, '')}</span>,
        },
        {
          key: 'sentiment', header: 'Sentiment',
          cell: (t) => (t.sentiment ? <Tag tone={sentimentTone(t.sentiment)}>{t.sentiment}</Tag> : <span className="text-xs text-ds-foreground-subtle">—</span>),
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
      emptyDescription="Transcripts appear here once calls are recorded and transcribed."
      emptyIcon={<FileText className="size-8" />}
    />
  );
}
