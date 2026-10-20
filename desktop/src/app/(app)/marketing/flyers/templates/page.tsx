'use client';


import { formatLocaleDate } from '@/lib/format';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ListPage } from '@/components/domain';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { marketingApi, type FlyerTemplate } from '@/lib/api/marketing';
import { toLocalDateString } from '@/lib/dates';

const templateCategories = ['festival', 'seasonal', 'promotional', 'general'];

function toCsv(rows: FlyerTemplate[]) {
  const header = ['Name', 'Category', 'Created'];
  const lines = rows.map((t) => [t.name, t.category ?? '', t.createdAt ?? ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  return [header.join(','), ...lines].join('\n');
}

async function exportAllTemplates(search: string, category?: string) {
  const pageSize = 200;
  let page = 1;
  let all: FlyerTemplate[] = [];
  for (;;) {
    const res = await marketingApi.flyerTemplates.list({ page, limit: pageSize, search: search || undefined, category });
    const raw = res.data as unknown as FlyerTemplate[] | { data: FlyerTemplate[] };
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
  a.download = `flyer-templates-${toLocalDateString(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FlyerTemplatesPage() {
  const router = useRouter();
  const [category, setCategory] = React.useState<string | undefined>(undefined);
  const [search, setSearch] = React.useState('');
  const [reloadKey, setReloadKey] = React.useState(0);

  async function handleDelete(id: string) {
    try {
      await marketingApi.flyerTemplates.delete(id);
      toast.success('Template deleted');
      setReloadKey((k) => k + 1);
    } catch {
      toast.error('Failed to delete template');
    }
  }

  const activeFilters = category ? [{ id: 'category', label: 'Category', value: category }] : [];

  return (
    <ListPage<FlyerTemplate>
      refreshKey={reloadKey}
      title="Flyer Templates"
      description="Manage reusable flyer templates for your marketing campaigns."
      getRowId={(t) => t.id}
      fetcher={({ page, limit, search: s }) => {
        setSearch(s);
        return marketingApi.flyerTemplates.list({ page, limit, search: s, category });
      }}
      columns={[
        {
          key: 'name',
          header: 'Template',
          sortable: true,
          cell: (t) => (
            <div className="flex items-center gap-ds-3">
              {t.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.thumbnailUrl} alt={t.name} className="h-10 w-10 rounded-ds-md object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-ds-md bg-ds-surface-sunken text-ds-foreground-subtle">
                  —
                </div>
              )}
              <p className="font-medium text-ds-foreground">{t.name}</p>
            </div>
          ),
        },
        { key: 'category', header: 'Category', cell: (t) => t.category ?? '—' },
        {
          key: 'createdAt',
          header: 'Created',
          sortable: true,
          cell: (t) => (t.createdAt ? formatLocaleDate(t.createdAt, { day: 'numeric', month: 'short' }) : '—'),
        },
      ]}
      primaryAction={
        <Button size="sm" onClick={() => router.push('/marketing/flyers/templates/new')}>
          <Plus aria-hidden="true" /> New template
        </Button>
      }
      headerActions={
        <Select value={category ?? 'all'} onValueChange={(v) => setCategory(v === 'all' ? undefined : v)}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {templateCategories.map((c) => (
              <SelectItem key={c} value={c} className="capitalize">
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      searchPlaceholder="Search templates..."
      filters={activeFilters}
      onRemoveFilter={() => setCategory(undefined)}
      onClearFilters={() => setCategory(undefined)}
      rowActions={(t) => (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Edit"
            onClick={() => router.push(`/marketing/flyers/templates/${t.id}/edit`)}
          >
            <Pencil aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => void handleDelete(t.id)}>
            <Trash2 aria-hidden="true" />
          </Button>
        </>
      )}
      onRowClick={(t) => router.push(`/marketing/flyers/templates/${t.id}/edit`)}
      bulkActions={[
        {
          label: 'Delete',
          destructive: true,
          onSelect: (rows) =>
            Promise.all(rows.map((r) => marketingApi.flyerTemplates.delete(r.id))).then(() => setReloadKey((k) => k + 1)),
        },
      ]}
      onExport={async () => {
        await exportAllTemplates(search, category);
      }}
      exportLabel="Export all"
      emptyTitle="No templates yet"
      emptyDescription="Create your first flyer template to reuse across campaigns."
      emptyAction={
        <Button onClick={() => router.push('/marketing/flyers/templates/new')}>
          <Plus aria-hidden="true" /> New template
        </Button>
      }
    />
  );
}
