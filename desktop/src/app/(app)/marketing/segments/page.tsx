'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Users, Pencil, Trash2, Send, RefreshCw, Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { ListPage } from '@/components/domain';
import { Button, Tag, Skeleton, Separator } from '@/components/ui';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { marketingApi, type MarketingSegment, type SegmentContact } from '@/lib/api/marketing';
import { toLocalDateString } from '@/lib/dates';

function summarizeCriteria(criteria: Record<string, unknown> | null | undefined): string {
  if (!criteria) return 'No criteria set';
  const keys = Object.keys(criteria);
  if (keys.length === 0) return 'No criteria set';
  const parts: string[] = [];
  for (const key of keys.slice(0, 3)) {
    const val = criteria[key];
    if (typeof val === 'string') {
      parts.push(`${key}: ${val}`);
    } else if (Array.isArray(val)) {
      parts.push(`${key}: ${val.length} values`);
    } else {
      parts.push(key);
    }
  }
  if (keys.length > 3) parts.push(`+${keys.length - 3} more`);
  return parts.join(' | ');
}

function toCsv(rows: MarketingSegment[]) {
  const quoteRow = (values: string[]) =>
    values.map((v) => `"${v.replace(/"/g, '""')}"`).join(',');
  const header = quoteRow(['Name', 'Description', 'Criteria', 'Contacts', 'Created']);
  const lines = rows.map((s) =>
    quoteRow([s.name, s.description ?? '', summarizeCriteria(s.criteria), String(s.contactCount ?? 0), s.createdAt]),
  );
  return [header, ...lines].join('\n');
}

async function exportAllSegments(search: string) {
  const pageSize = 200;
  let page = 1;
  let all: MarketingSegment[] = [];
  for (;;) {
    const res = await marketingApi.segments.list({ page, limit: pageSize, search: search || undefined });
    const items = res.data.data;
    all = all.concat(items);
    if (all.length >= res.data.pagination.total || items.length === 0) break;
    page += 1;
  }
  const csv = toCsv(all);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `marketing-segments-${toLocalDateString(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function SegmentDetail({ segment, onDelete, onRefresh, refreshing }: {
  segment: MarketingSegment;
  onDelete: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const router = useRouter();
  const [contacts, setContacts] = React.useState<SegmentContact[] | null>(null);
  const [loadingContacts, setLoadingContacts] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoadingContacts(true);
    setContacts(null);
    marketingApi.segments
      .contacts(segment.id, { page: 1, limit: 10 })
      .then((res) => {
        if (!cancelled) setContacts(res.data.data);
      })
      .catch(() => {
        if (!cancelled) setContacts([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingContacts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [segment.id]);

  return (
    <div className="flex flex-col gap-ds-4">
      <div className="rounded-ds-md border border-ds-border p-ds-4">
        <div className="flex items-center justify-between">
          <p className="text-3xl font-bold text-ds-primary">{(segment.contactCount ?? 0).toLocaleString()}</p>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing} className="gap-ds-2">
            <RefreshCw className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
            Refresh count
          </Button>
        </div>
        <p className="text-sm text-ds-foreground-muted">Contacts matched</p>
      </div>

      {segment.description && (
        <div>
          <p className="mb-ds-1 text-xs font-medium text-ds-foreground-muted">Description</p>
          <p className="text-sm text-ds-foreground">{segment.description}</p>
        </div>
      )}

      <div>
        <p className="mb-ds-1 text-xs font-medium text-ds-foreground-muted">Filter criteria</p>
        <p className="text-sm text-ds-foreground">{summarizeCriteria(segment.criteria)}</p>
      </div>

      <div>
        <p className="mb-ds-2 text-xs font-medium text-ds-foreground-muted">Matching contacts (preview)</p>
        {loadingContacts ? (
          <div className="flex flex-col gap-ds-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : contacts && contacts.length > 0 ? (
          <div className="flex flex-col gap-ds-2">
            {contacts.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-ds-md border border-ds-border px-ds-3 py-ds-2">
                <span className="text-sm font-medium text-ds-foreground">{c.name}</span>
                <div className="flex items-center gap-ds-2 text-ds-foreground-subtle">
                  {c.email && <Mail className="size-3.5" aria-hidden="true" />}
                  {c.phone && <Phone className="size-3.5" aria-hidden="true" />}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ds-foreground-subtle">No matching contacts.</p>
        )}
      </div>

      <p className="text-xs text-ds-foreground-subtle">
        Created {new Date(segment.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
      </p>

      <Separator />

      <div className="flex flex-col gap-ds-2">
        <Button variant="outline" className="w-full" onClick={() => router.push(`/marketing/segments/${segment.id}/edit`)}>
          <Pencil aria-hidden="true" /> Edit segment
        </Button>
        <Button
          className="w-full"
          onClick={() => router.push(`/campaigns/new?segmentId=${segment.id}&segmentName=${encodeURIComponent(segment.name)}`)}
        >
          <Send aria-hidden="true" /> Use in campaign
        </Button>
        <Button variant="destructive" className="w-full" onClick={onDelete}>
          <Trash2 aria-hidden="true" /> Delete segment
        </Button>
      </div>
    </div>
  );
}

export default function SegmentsPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [deleteTarget, setDeleteTarget] = React.useState<MarketingSegment | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [refreshingId, setRefreshingId] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await marketingApi.segments.delete(deleteTarget.id);
      toast.success('Segment deleted');
      setReloadKey((k) => k + 1);
    } catch {
      toast.error('Failed to delete segment');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  async function handleRefreshCount(segment: MarketingSegment) {
    setRefreshingId(segment.id);
    try {
      await marketingApi.segments.refreshCount(segment.id);
      toast.success(`Refreshed contact count for "${segment.name}"`);
      setReloadKey((k) => k + 1);
    } catch {
      toast.error('Failed to refresh contact count');
    } finally {
      setRefreshingId(null);
    }
  }

  return (
    <>
      <ListPage<MarketingSegment>
        refreshKey={reloadKey}
        title="Segments"
        description="Group contacts by rules to target campaigns."
        getRowId={(s) => s.id}
        fetcher={({ page, limit, search: s }) => {
          setSearch(s);
          return marketingApi.segments.list({ page, limit, search: s || undefined });
        }}
        columns={[
          {
            key: 'name',
            header: 'Name',
            sortable: true,
            cell: (s) => (
              <div className="flex items-center gap-ds-3">
                <div className="flex size-8 items-center justify-center rounded-ds-full bg-ds-primary-subtle text-ds-primary-on-subtle">
                  <Users className="size-3.5" aria-hidden="true" />
                </div>
                <span className="font-medium text-ds-foreground">{s.name}</span>
              </div>
            ),
          },
          {
            key: 'criteria',
            header: 'Criteria',
            cell: (s) => (
              <span className="block max-w-xs truncate text-ds-foreground-muted" title={summarizeCriteria(s.criteria)}>
                {summarizeCriteria(s.criteria)}
              </span>
            ),
          },
          {
            key: 'contactCount',
            header: 'Contacts',
            align: 'right',
            sortable: true,
            cell: (s) => <Tag tone="info">{(s.contactCount ?? 0).toLocaleString()}</Tag>,
          },
          {
            key: 'createdAt',
            header: 'Created',
            sortable: true,
            cell: (s) =>
              new Date(s.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
          },
        ]}
        primaryAction={
          <Button size="sm" onClick={() => router.push('/marketing/segments/new')}>
            <Users aria-hidden="true" /> New segment
          </Button>
        }
        searchPlaceholder="Search segments..."
        rowActions={(s) => (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Refresh count"
              disabled={refreshingId === s.id}
              onClick={() => void handleRefreshCount(s)}
            >
              <RefreshCw className={refreshingId === s.id ? 'animate-spin' : ''} aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Edit"
              onClick={() => router.push(`/marketing/segments/${s.id}/edit`)}
            >
              <Pencil aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Use in campaign"
              onClick={() => router.push(`/campaigns/new?segmentId=${s.id}&segmentName=${encodeURIComponent(s.name)}`)}
            >
              <Send aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete"
              onClick={() => setDeleteTarget(s)}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </>
        )}
        renderDetail={(s) => (
          <SegmentDetail
            segment={s}
            refreshing={refreshingId === s.id}
            onRefresh={() => void handleRefreshCount(s)}
            onDelete={() => setDeleteTarget(s)}
          />
        )}
        detailTitle={(s) => s.name}
        bulkActions={[
          {
            label: 'Delete',
            destructive: true,
            onSelect: async (rows) => {
              await Promise.all(rows.map((r) => marketingApi.segments.delete(r.id)));
              toast.success(`${rows.length} segment${rows.length !== 1 ? 's' : ''} deleted`);
              setReloadKey((k) => k + 1);
            },
          },
        ]}
        onExport={async () => {
          await exportAllSegments(search);
        }}
        exportLabel="Export all"
        emptyIcon={<Users className="size-10" aria-hidden="true" />}
        emptyTitle="No segments yet"
        emptyDescription="Start building your pipeline by creating your first segment."
        emptyAction={
          <Button size="sm" onClick={() => router.push('/marketing/segments/new')}>
            Create your first segment
          </Button>
        }
      />

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete segment</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-ds-foreground-muted">
            Are you sure you want to delete{' '}
            <span className="font-medium text-ds-foreground">{deleteTarget?.name}</span>? This action cannot be
            undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
