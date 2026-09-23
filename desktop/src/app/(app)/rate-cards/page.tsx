'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ListPage } from '@/components/domain';
import { Badge, Button, SectionCard, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, useConfirm } from '@/components/ui';
import { rateCardsApi, type RateCard } from '@/lib/api/rate-cards';

const CATEGORY_OPTIONS = [
  { label: 'Hotel', value: 'hotel' },
  { label: 'Transport', value: 'transport' },
  { label: 'Activity', value: 'activity' },
  { label: 'Meal', value: 'meal' },
  { label: 'Flight', value: 'flight' },
];

function getRateCardPrice(rc: RateCard): number {
  return rc.sellingPrice ?? rc.costPrice ?? 0;
}

function isExpired(validTo?: string | null) {
  if (!validTo) return false;
  return new Date(validTo).getTime() < Date.now();
}

function formatDate(value?: string | null) {
  return value
    ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
}

function formatMoney(value: number, currency: string) {
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '₹';
  return `${symbol}${value.toLocaleString('en-IN')}`;
}

function toCsv(rows: RateCard[]) {
  const header = ['Name', 'Supplier', 'Category', 'Rate', 'Currency', 'Valid From', 'Valid To', 'Status'];
  const lines = rows.map((rc) =>
    [
      rc.name,
      rc.supplierName ?? '',
      rc.serviceType,
      getRateCardPrice(rc),
      rc.currency,
      rc.validFrom ?? '',
      rc.validTo ?? '',
      rc.isActive && !isExpired(rc.validTo) ? 'Active' : 'Expired',
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n');
}

function downloadCsv(csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rate-cards-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RateCardsPage() {
  const router = useRouter();
  const [categoryFilter, setCategoryFilter] = React.useState('');
  const { confirm, dialog: confirmDialog } = useConfirm();

  const filters = categoryFilter
    ? [{ id: 'category', label: 'Category', value: CATEGORY_OPTIONS.find((o) => o.value === categoryFilter)?.label ?? categoryFilter }]
    : [];

  const handleDelete = async (rc: RateCard) => {
    const ok = await confirm({
      title: 'Delete rate card',
      description: `Delete "${rc.name}"? This cannot be undone.`,
      tone: 'destructive',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await rateCardsApi.delete(rc.id);
      toast.success('Rate card deleted');
    } catch {
      toast.error('Failed to delete rate card');
    }
  };

  const handleExport = async (rows: RateCard[]) => {
    try {
      const res = await rateCardsApi.list({
        search: undefined,
        serviceType: categoryFilter || undefined,
        limit: 1000,
        page: 1,
      });
      downloadCsv(toCsv(res.data.data));
    } catch {
      downloadCsv(toCsv(rows));
    }
  };

  return (
    <>
      <ListPage<RateCard>
        title="Rate Cards"
        description="Manage supplier pricing and seasonal rates."
        getRowId={(rc) => rc.id}
        fetcher={({ page, limit, search }) =>
          rateCardsApi.list({
            page,
            limit,
            search: search || undefined,
            serviceType: categoryFilter || undefined,
            isActive: true,
          })
        }
        searchPlaceholder="Search rate cards..."
        filters={filters}
        onRemoveFilter={() => setCategoryFilter('')}
        onClearFilters={() => setCategoryFilter('')}
        headerActions={
          <Select value={categoryFilter || 'all'} onValueChange={(v) => setCategoryFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        primaryAction={
          <Button size="sm" onClick={() => router.push('/rate-cards/new')} className="gap-ds-2">
            <Plus aria-hidden="true" /> Add Rate Card
          </Button>
        }
        columns={[
          { key: 'name', header: 'Service Name', sortable: true },
          { key: 'supplierName', header: 'Supplier', cell: (rc) => rc.supplierName ?? 'N/A' },
          {
            key: 'serviceType',
            header: 'Category',
            cell: (rc) => <Badge variant="outline" className="text-xs capitalize">{rc.serviceType.replace('_', ' ')}</Badge>,
          },
          {
            key: 'price',
            header: 'Rate',
            align: 'right',
            sortable: true,
            cell: (rc) => <span className="font-mono font-semibold">{formatMoney(getRateCardPrice(rc), rc.currency)}</span>,
          },
          { key: 'validFrom', header: 'Valid From', cell: (rc) => formatDate(rc.validFrom) },
          { key: 'validTo', header: 'Valid To', cell: (rc) => formatDate(rc.validTo) },
          {
            key: 'status',
            header: 'Status',
            cell: (rc) =>
              rc.isActive && !isExpired(rc.validTo) ? (
                <Badge className="text-xs bg-ds-success-subtle text-ds-success-on-subtle">Active</Badge>
              ) : (
                <Badge className="text-xs bg-ds-danger-subtle text-ds-danger-on-subtle">Expired</Badge>
              ),
          },
        ]}
        rowActions={(rc) => (
          <>
            <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => router.push(`/rate-cards/${rc.id}/edit`)}>
              <Pencil className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Delete" className="text-ds-danger hover:text-ds-danger" onClick={() => void handleDelete(rc)}>
              <Trash2 className="size-3.5" />
            </Button>
          </>
        )}
        renderDetail={(rc) => (
          <div className="flex flex-col gap-ds-4 pt-ds-4">
            <div className="flex items-center gap-ds-2">
              <Badge variant="outline" className="capitalize">{rc.serviceType.replace('_', ' ')}</Badge>
              {rc.isActive && !isExpired(rc.validTo) ? (
                <Badge className="bg-ds-success-subtle text-ds-success-on-subtle">Active</Badge>
              ) : (
                <Badge className="bg-ds-danger-subtle text-ds-danger-on-subtle">Expired</Badge>
              )}
            </div>
            <SectionCard title="Pricing">
              <div className="grid grid-cols-2 gap-ds-4 text-sm">
                <div>
                  <p className="text-ds-foreground-muted">Supplier</p>
                  <p className="font-medium">{rc.supplierName ?? 'N/A'}</p>
                </div>
                <div>
                  <p className="text-ds-foreground-muted">Rate</p>
                  <p className="font-mono font-semibold">{formatMoney(getRateCardPrice(rc), rc.currency)}</p>
                </div>
                <div>
                  <p className="text-ds-foreground-muted">Valid From</p>
                  <p className="font-medium">{formatDate(rc.validFrom)}</p>
                </div>
                <div>
                  <p className="text-ds-foreground-muted">Valid To</p>
                  <p className="font-medium">{formatDate(rc.validTo)}</p>
                </div>
                {rc.season && (
                  <div>
                    <p className="text-ds-foreground-muted">Season</p>
                    <p className="font-medium capitalize">{rc.season.replace('_', ' ')}</p>
                  </div>
                )}
                {rc.unit && (
                  <div>
                    <p className="text-ds-foreground-muted">Unit</p>
                    <p className="font-medium capitalize">{rc.unit.replace('_', ' ')}</p>
                  </div>
                )}
              </div>
            </SectionCard>
            {rc.description && (
              <SectionCard title="Notes">
                <p className="text-sm">{rc.description}</p>
              </SectionCard>
            )}
            <Button className="w-full" onClick={() => router.push(`/rate-cards/${rc.id}/edit`)}>
              <Pencil className="size-4" /> Edit
            </Button>
          </div>
        )}
        detailTitle={(rc) => rc.name}
        bulkActions={[
          {
            label: 'Delete',
            destructive: true,
            onSelect: async (rows) => {
              const ok = await confirm({
                title: 'Delete rate cards',
                description: `Delete ${rows.length} rate card${rows.length === 1 ? '' : 's'}? This cannot be undone.`,
                tone: 'destructive',
                confirmLabel: 'Delete',
              });
              if (!ok) return;
              await Promise.all(rows.map((r) => rateCardsApi.delete(r.id)));
              toast.success('Rate cards deleted');
            },
          },
        ]}
        onExport={handleExport}
        exportLabel="Export CSV"
        emptyTitle="No rate cards yet"
        emptyDescription="Add supplier pricing to start building seasonal rate cards."
        emptyIcon={<CreditCard className="size-10 text-ds-foreground-subtle" aria-hidden="true" />}
      />
      {confirmDialog}
    </>
  );
}
