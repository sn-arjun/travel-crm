'use client';

import * as React from 'react';
import {
  Star, Trash2, ExternalLink, Search, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { bookmarksApi } from '@/lib/api/bookmarks';
import type { Bookmark } from '@/lib/api/bookmarks';

const REF_DATE = Date.now();

function getEntityIcon(type: string) {
  switch (type) {
    case 'contact':
      return '👤';
    case 'lead':
      return '💼';
    case 'invoice':
      return '📄';
    case 'itinerary':
      return '🗺️';
    case 'task':
      return '✓';
    default:
      return '⭐';
  }
}

function getEntityColor(type: string) {
  switch (type) {
    case 'contact':
      return 'bg-blue-100 text-blue-800';
    case 'lead':
      return 'bg-purple-100 text-purple-800';
    case 'invoice':
      return 'bg-green-100 text-green-800';
    case 'itinerary':
      return 'bg-orange-100 text-orange-800';
    case 'task':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const today = new Date(REF_DATE);
  const yesterday = new Date(today.getTime() - 86400000);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

export default function BookmarksPage() {
  const { data: response, loading, error, refetch } = useApiQuery(
    () => bookmarksApi.list({ limit: 100 }),
    [],
  );

  const bookmarks = React.useMemo(() => {
    if (!response || !('data' in response)) return [];
    const data = response.data;
    return Array.isArray(data) ? data : (data?.data ?? []);
  }, [response]);

  const { mutate: deleteBookmark } = useApiMutation((id: string) => bookmarksApi.delete(id));

  const [search, setSearch] = React.useState('');
  const [filterType, setFilterType] = React.useState('all');

  const filtered = React.useMemo(() => {
    let result = [...bookmarks];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((b: any) => b.entityName.toLowerCase().includes(q));
    }

    if (filterType !== 'all') {
      result = result.filter((b: any) => b.entityType === filterType);
    }

    return result.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [bookmarks, search, filterType]);

  const groupedByType = React.useMemo(() => {
    const groups: Record<string, typeof bookmarks> = {};

    filtered.forEach((b: any) => {
      if (!groups[b.entityType]) {
        groups[b.entityType] = [];
      }
      groups[b.entityType]?.push(b);
    });

    return groups;
  }, [filtered]);

  const isEmpty = bookmarks.length === 0;

  const handleDeleteBookmark = async (id: string) => {
    const result = await deleteBookmark(id);
    if (result) {
      toast.success('Bookmark removed');
      refetch();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Bookmarks
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEmpty ? 'Star items to find them quickly' : `${bookmarks.length} bookmarked item${bookmarks.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* Search and Filter */}
      {!isEmpty && (
        <div className="px-6 py-3 border-b space-y-3 bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search bookmarks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="contact">Contacts</SelectItem>
                <SelectItem value="lead">Leads</SelectItem>
                <SelectItem value="invoice">Invoices</SelectItem>
                <SelectItem value="itinerary">Itineraries</SelectItem>
                <SelectItem value="task">Tasks</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {error && (
        <div className="px-6 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-800 dark:text-amber-200">Using sample data — connect to backend for real data</p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && isEmpty ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Star className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-lg font-semibold mb-2">No bookmarks yet</p>
              <p className="text-sm text-muted-foreground">Star items to find them quickly</p>
            </div>
          </div>
        ) : !loading && (
          <div className="max-w-4xl mx-auto space-y-6">
            {Object.entries(groupedByType).map(([entityType, bookmarksOfType]) => (
              bookmarksOfType.length > 0 && (
                <div key={entityType}>
                  <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                    <span>{getEntityIcon(entityType)}</span>
                    {entityType.charAt(0).toUpperCase() + entityType.slice(1)}s
                    <Badge variant="secondary" className="ml-auto">{bookmarksOfType.length}</Badge>
                  </h2>
                  <div className="space-y-2">
                    {bookmarksOfType.map((bookmark: any) => (
                      <BookmarkRow key={bookmark.id} bookmark={bookmark} onRemove={handleDeleteBookmark} />
                    ))}
                  </div>
                </div>
              )
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BookmarkRow({ bookmark, onRemove }: { bookmark: Bookmark; onRemove: (id: string) => void }) {
  return (
    <Card className="p-4 hover:bg-muted/50 transition-colors">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-xl shrink-0">{getEntityIcon(bookmark.entityType)}</span>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{bookmark.entityName}</p>
            <p className="text-xs text-muted-foreground">
              Bookmarked {formatDate(bookmark.createdAt)}
            </p>
          </div>
          <Badge className={cn('shrink-0', getEntityColor(bookmark.entityType))}>
            {bookmark.entityType.charAt(0).toUpperCase() + bookmark.entityType.slice(1)}
          </Badge>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            onClick={() => onRemove(bookmark.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
