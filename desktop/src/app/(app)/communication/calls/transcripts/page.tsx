'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search, FileText, Calendar, ArrowLeft, Loader,
  AlertCircle, ExternalLink, MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { voipApi, type Transcript } from '@/lib/api/voip';

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">{part}</mark>
    ) : (
      part
    ),
  );
}

function getSnippet(text: string, query: string, contextLength: number = 150): string {
  if (!query.trim()) return text.slice(0, contextLength * 2);
  const lowerText = text.toLowerCase();
  const idx = lowerText.indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, contextLength * 2);
  const start = Math.max(0, idx - contextLength);
  const end = Math.min(text.length, idx + query.length + contextLength);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  return snippet;
}

export default function TranscriptSearchPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [sentimentFilter, setSentimentFilter] = React.useState('all');
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: response, loading, error } = useApiQuery<any>(
    () => voipApi.transcripts.list({
      limit: 50,
      sentiment: sentimentFilter !== 'all' ? sentimentFilter : undefined,
    }),
    [sentimentFilter],
  );

  const transcripts: Transcript[] = React.useMemo(() => {
    const data = response?.data;
    const items: Transcript[] = Array.isArray(data) ? data : (data?.data ?? []);
    if (!debouncedSearch.trim()) return items;
    return items.filter((t) => t.text.toLowerCase().includes(debouncedSearch.toLowerCase()));
  }, [response, debouncedSearch]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Transcript Search
            </h1>
            <p className="text-sm text-muted-foreground">Search across all call transcripts</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-4 border-b space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search transcripts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue placeholder="Sentiment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sentiments</SelectItem>
              <SelectItem value="positive">Positive</SelectItem>
              <SelectItem value="neutral">Neutral</SelectItem>
              <SelectItem value="negative">Negative</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-8 w-36 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-8 w-36 text-xs"
            />
          </div>
          <p className="text-xs text-muted-foreground ml-auto">{transcripts.length} results</p>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <AlertCircle className="h-8 w-8" />
            <p>Failed to load transcripts</p>
          </div>
        ) : transcripts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <MessageSquare className="h-10 w-10 opacity-50" />
            <p className="text-sm">
              {debouncedSearch ? `No transcripts matching "${debouncedSearch}"` : 'No transcripts found'}
            </p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-4">
            {transcripts.map((transcript) => {
              const snippet = getSnippet(transcript.text, debouncedSearch);
              return (
                <Card key={transcript.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium">Call: {transcript.callId}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {transcript.sentiment && (
                          <Badge variant="outline" className={cn(
                            'text-xs border-transparent',
                            transcript.sentiment === 'positive' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                            transcript.sentiment === 'neutral' && 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
                            transcript.sentiment === 'negative' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                          )}>
                            {transcript.sentiment}
                          </Badge>
                        )}
                        {transcript.language && (
                          <Badge variant="secondary" className="text-xs">{transcript.language}</Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground leading-relaxed mb-3">
                      {highlightText(snippet, debouncedSearch)}
                    </div>
                    {transcript.keywords && transcript.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {transcript.keywords.map((kw, i) => (
                          <Badge key={i} variant="outline" className="text-[10px]">{kw}</Badge>
                        ))}
                      </div>
                    )}
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/communication/calls/${transcript.callId}`}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        View Full Call
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
