'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Star, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { ListPage } from '@/components/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { bookmarksApi } from '@/lib/api/bookmarks';
import type { Bookmark } from '@/lib/api/bookmarks';
import { toLocalDateString } from '@/lib/dates';

const ENTITY_ROUTES: Record<Bookmark['entityType'], string> = {
  contact: '/contacts',
  lead: '/leads',
  invoice: '/invoices',
  itinerary: '/itineraries',
  task: '/tasks',
};

const ENTITY_TONE: Record<Bookmark['entityType'], 'info' | 'default'> = {
  contact: 'info',
  lead: 'default',
  invoice: 'default',
  itinerary: 'default',
  task: 'default',
};

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toCsv(rows: Bookmark[]) {
  const header = ['Name', 'Type', 'Bookmarked At'];
  const lines = rows.map((b) => [b.entityName, b.entityType, b.createdAt].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  return [header.join(','), ...lines].join('\n');
}

export default function BookmarksPage() {
  const router = useRouter();
  const [filterType, setFilterType] = React.useState<string | null>(null);
  const [refetchKey, setRefetchKey] = React.useState(0);

  const openEntity = (bookmark: Bookmark) => {
    router.push(`${ENTITY_ROUTES[bookmark.entityType]}/${bookmark.entityId}`);
  };

  const handleDelete = async (id: string) => {
    try {
      await bookmarksApi.delete(id);
      toast.success('Bookmark removed');
      setRefetchKey((k) => k + 1);
    } catch {
      toast.error('Failed to remove bookmark');
    }
  };

  const handleExport = (rows: Bookmark[]) => {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookmarks-${toLocalDateString(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filters = filterType
    ? [{ id: 'entityType', label: 'Type', value: filterType }]
    : [];

  return (
    <ListPage<Bookmark>
      refreshKey={refetchKey}
      title="Bookmarks"
      description="Items you've starred for quick access."
      getRowId={(b) => b.id}
      fetcher={async ({ page, limit, search }) => {
        const res = await bookmarksApi.list({ page, limit, entityType: filterType ?? undefined });
        if (!search) return res;
        const data = res.data as unknown;
        const items = Array.isArray(data) ? data : ((data as { data?: Bookmark[] })?.data ?? []);
        const filtered = items.filter((b) =>
          b.entityName.toLowerCase().includes(search.toLowerCase()),
        );
        return { ...res, data: filtered, pagination: { ...(res as any).pagination, total: filtered.length } };
      }}
      searchPlaceholder="Search bookmarks..."
      filters={filters}
      onRemoveFilter={() => setFilterType(null)}
      onClearFilters={() => setFilterType(null)}
      columns={[
        {
          key: 'entityName',
          header: 'Name',
          sortable: true,
          cell: (b) => (
            <div className="flex items-center gap-ds-2">
              <Star className="size-4 shrink-0 text-ds-warning" aria-hidden="true" />
              <span className="truncate font-medium">{b.entityName}</span>
            </div>
          ),
        },
        {
          key: 'entityType',
          header: 'Type',
          cell: (b) => (
            <Badge variant={ENTITY_TONE[b.entityType] === 'info' ? 'secondary' : 'outline'}>
              {b.entityType.charAt(0).toUpperCase() + b.entityType.slice(1)}
            </Badge>
          ),
        },
        {
          key: 'createdAt',
          header: 'Bookmarked',
          sortable: true,
          cell: (b) => <span className="text-ds-foreground-muted">{formatDate(b.createdAt)}</span>,
        },
      ]}
      onRowClick={openEntity}
      rowActions={(b) => (
        <>
          <Button variant="ghost" size="icon-sm" aria-label="Open" onClick={() => openEntity(b)}>
            <ExternalLink />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remove bookmark"
            onClick={() => void handleDelete(b.id)}
          >
            <Trash2 />
          </Button>
        </>
      )}
      bulkActions={[
        {
          label: 'Remove',
          icon: <Trash2 />,
          destructive: true,
          onSelect: async (rows) => {
            await Promise.all(rows.map((r) => bookmarksApi.delete(r.id)));
            toast.success(`${rows.length} bookmark${rows.length === 1 ? '' : 's'} removed`);
            setRefetchKey((k) => k + 1);
          },
        },
      ]}
      onExport={handleExport}
      exportLabel="Export CSV"
      emptyTitle="No bookmarks yet"
      emptyDescription="Star items across the CRM to find them quickly here."
      emptyIcon={<Star className="size-10 text-ds-foreground-subtle" aria-hidden="true" />}
    />
  );
}
