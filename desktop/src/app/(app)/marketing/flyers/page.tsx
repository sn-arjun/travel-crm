'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Pencil, Plus, Share2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ListPage } from '@/components/domain';
import { Button, Tag } from '@/components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { marketingApi, type MarketingFlyer } from '@/lib/api/marketing';
import { ShareFlyerDialog } from '@/components/domain/marketing/share-flyer-dialog';

function toCsv(rows: MarketingFlyer[]) {
  const header = ['Title', 'Status', 'Template', 'Created'];
  const lines = rows.map((f) => [f.title, f.status, f.templateId, f.createdAt].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  return [header.join(','), ...lines].join('\n');
}

async function exportAllFlyers(search: string, status?: string) {
  const pageSize = 200;
  let page = 1;
  let all: MarketingFlyer[] = [];
  for (;;) {
    const res = await marketingApi.flyers.list({ page, limit: pageSize, search: search || undefined, status });
    const raw = res.data as unknown as MarketingFlyer[] | { data: MarketingFlyer[] };
    const items = Array.isArray(raw) ? raw : raw.data;
    const total = (res as unknown as { pagination?: { total: number } }).pagination?.total ?? res.data.pagination?.total ?? items.length;
    all = all.concat(items);
    if (all.length >= total || items.length === 0) break;
    page += 1;
  }
  const csv = toCsv(all);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `flyers-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FlyersPage() {
  const router = useRouter();
  const [status, setStatus] = React.useState<string | undefined>(undefined);
  const [search, setSearch] = React.useState('');
  const [reloadKey, setReloadKey] = React.useState(0);
  const [shareFlyer, setShareFlyer] = React.useState<MarketingFlyer | null>(null);

  async function handleDelete(id: string) {
    try {
      await marketingApi.flyers.delete(id);
      toast.success('Flyer deleted');
      setReloadKey((k) => k + 1);
    } catch {
      toast.error('Failed to delete flyer');
    }
  }

  const activeFilters = status ? [{ id: 'status', label: 'Status', value: status }] : [];

  return (
    <>
      <ListPage<MarketingFlyer>
        refreshKey={reloadKey}
        title="My Flyers"
        description="Create, share, and track marketing flyers built from your templates."
        getRowId={(f) => f.id}
        fetcher={({ page, limit, search: s }) => {
          setSearch(s);
          return marketingApi.flyers.list({ page, limit, search: s, status });
        }}
        columns={[
          {
            key: 'title',
            header: 'Flyer',
            sortable: true,
            cell: (f) => (
              <div className="flex items-center gap-ds-3">
                {f.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.imageUrl} alt={f.title} className="h-10 w-10 rounded-ds-md object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-ds-md bg-ds-surface-sunken text-ds-foreground-subtle">
                    —
                  </div>
                )}
                <p className="font-medium text-ds-foreground">{f.title}</p>
              </div>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            cell: (f) => <Tag tone={f.status === 'published' ? 'success' : 'neutral'}>{f.status}</Tag>,
          },
          {
            key: 'createdAt',
            header: 'Created',
            sortable: true,
            cell: (f) => new Date(f.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
          },
        ]}
        primaryAction={
          <Button size="sm" onClick={() => router.push('/marketing/flyers/new')}>
            <Plus aria-hidden="true" /> New flyer
          </Button>
        }
        headerActions={
          <div className="flex items-center gap-ds-2">
            <Select value={status ?? 'all'} onValueChange={(v) => setStatus(v === 'all' ? undefined : v)}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => router.push('/marketing/flyers/templates')}>
              Manage templates
            </Button>
          </div>
        }
        searchPlaceholder="Search flyers..."
        filters={activeFilters}
        onRemoveFilter={() => setStatus(undefined)}
        onClearFilters={() => setStatus(undefined)}
        rowActions={(f) => (
          <>
            <Button variant="ghost" size="icon-sm" aria-label="View" onClick={() => router.push(`/marketing/flyers/${f.id}`)}>
              <Eye aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Edit"
              onClick={() => router.push(`/marketing/flyers/${f.id}/edit`)}
            >
              <Pencil aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Share" onClick={() => setShareFlyer(f)}>
              <Share2 aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => void handleDelete(f.id)}>
              <Trash2 aria-hidden="true" />
            </Button>
          </>
        )}
        onRowClick={(f) => router.push(`/marketing/flyers/${f.id}`)}
        bulkActions={[
          {
            label: 'Delete',
            destructive: true,
            onSelect: (rows) => Promise.all(rows.map((r) => marketingApi.flyers.delete(r.id))).then(() => setReloadKey((k) => k + 1)),
          },
        ]}
        onExport={async () => {
          await exportAllFlyers(search, status);
        }}
        exportLabel="Export all"
        emptyTitle="No flyers yet"
        emptyDescription="Pick a template and create your first marketing flyer."
        emptyAction={
          <Button onClick={() => router.push('/marketing/flyers/new')}>
            <Plus aria-hidden="true" /> New flyer
          </Button>
        }
      />

      <ShareFlyerDialog flyer={shareFlyer} open={!!shareFlyer} onOpenChange={(open) => !open && setShareFlyer(null)} />
    </>
  );
}
