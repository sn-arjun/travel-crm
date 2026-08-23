'use client';

import * as React from 'react';
import { Layers, RotateCw, Users, DollarSign, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  SectionCard,
  Tag,
} from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import { RelationCombobox } from '@/components/domain';
import { AiGate } from '@/components/domain/ai/ai-gate';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { aiApi, type CustomerLtv, type CustomerSegment } from '@/lib/api/ai';
import { contactsApi } from '@/lib/api/contacts';
import type { Contact } from '@travelcrm/shared';

function SegmentsContent() {
  const [selectedContactId, setSelectedContactId] = React.useState<string | null>(null);
  const [ltv, setLtv] = React.useState<CustomerLtv | null>(null);

  const { data, loading, refetch } = useApiQuery(() => aiApi.bi.getCustomerSegments(), []);
  const { mutate: recalculate, loading: recalculating } = useApiMutation(() => aiApi.bi.calculateCustomerSegments());
  const { mutate: fetchLtv, loading: ltvLoading } = useApiMutation((contactId: string) =>
    aiApi.bi.getCustomerLtv(contactId),
  );

  const segments: CustomerSegment[] = (data as { data?: CustomerSegment[] })?.data ?? [];

  const handleRecalculate = async () => {
    const result = await recalculate(undefined);
    if (result) {
      toast.success('Customer segments recalculated');
      refetch();
    } else {
      toast.error('Could not recalculate customer segments');
    }
  };

  const handleContactChange = async (id: string | null) => {
    setSelectedContactId(id);
    setLtv(null);
    if (!id) return;
    const result = await fetchLtv(id);
    const value = (result as { data?: CustomerLtv })?.data ?? null;
    if (value) {
      setLtv(value);
    } else {
      toast.error('Could not compute lifetime value for this customer');
    }
  };

  const columns: DataTableColumn<CustomerSegment>[] = [
    { key: 'segment', header: 'Segment', sortable: true },
    { key: 'customerCount', header: 'Customers', align: 'right', sortable: true },
    {
      key: 'avgLtv',
      header: 'Avg LTV',
      align: 'right',
      sortable: true,
      cell: (r) => r.avgLtv.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }),
    },
    {
      key: 'totalRevenue',
      header: 'Total revenue',
      align: 'right',
      cell: (r) => r.totalRevenue.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }),
    },
    {
      key: 'characteristics',
      header: 'Characteristics',
      cell: (r) => (
        <div className="flex flex-wrap gap-ds-1">
          {r.characteristics.map((c) => (
            <Tag key={c} tone="info">{c}</Tag>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-ds-6">
      <div className="flex justify-end">
        <Button size="sm" className="gap-ds-2" onClick={handleRecalculate} disabled={recalculating}>
          <RotateCw className="size-4" aria-hidden="true" />
          {recalculating ? 'Recalculating…' : 'Recalculate segments'}
        </Button>
      </div>

      <SectionCard title="Customer segments" description="AI-clustered customer segments by behavior and value" flush>
        <DataTable<CustomerSegment>
          columns={columns}
          data={segments}
          getRowId={(r) => r.segment}
          loading={loading}
          emptyState={
            <EmptyState
              icon={<Layers className="size-8" aria-hidden="true" />}
              title="No customer segments yet"
              description="Recalculate segments to cluster your customers by value and behavior."
              action={
                <Button size="sm" onClick={handleRecalculate} disabled={recalculating}>
                  Recalculate segments
                </Button>
              }
            />
          }
        />
      </SectionCard>

      <SectionCard title="Customer lifetime value" description="Look up predicted and historical LTV for a customer">
        <div className="flex flex-col gap-ds-4">
          <div className="max-w-sm">
            <RelationCombobox<Contact>
              value={selectedContactId}
              onChange={(id) => void handleContactChange(id)}
              fetcher={async (query, page) => {
                const r = await contactsApi.list({ search: query, page, limit: 20 });
                const payload = r.data;
                return { items: payload.data, total: payload.pagination.total };
              }}
              getOptionId={(c) => c.id}
              getOptionLabel={(c) => c.name}
              getOptionDescription={(c) => c.email ?? undefined}
              placeholder="Search customers…"
              searchPlaceholder="Search by name or email"
            />
          </div>

          {ltvLoading ? (
            <p className="text-xs text-ds-foreground-muted">Calculating…</p>
          ) : ltv ? (
            <div className="grid grid-cols-1 gap-ds-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-ds-md border border-ds-border p-ds-3">
                <p className="text-xs text-ds-foreground-muted">Lifetime value</p>
                <p className="mt-ds-1 text-lg font-bold text-ds-foreground">
                  {ltv.lifetimeValue.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                </p>
              </div>
              <div className="rounded-ds-md border border-ds-border p-ds-3">
                <p className="text-xs text-ds-foreground-muted">Predicted value</p>
                <p className="mt-ds-1 text-lg font-bold text-ds-foreground">
                  {ltv.predictedValue.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                </p>
              </div>
              <div className="rounded-ds-md border border-ds-border p-ds-3">
                <p className="text-xs text-ds-foreground-muted">Bookings</p>
                <p className="mt-ds-1 text-lg font-bold text-ds-foreground">{ltv.bookingCount}</p>
              </div>
              <div className="rounded-ds-md border border-ds-border p-ds-3">
                <p className="text-xs text-ds-foreground-muted">Segment</p>
                <p className="mt-ds-1 text-lg font-bold text-ds-foreground">{ltv.segment ?? '--'}</p>
              </div>
            </div>
          ) : selectedContactId ? null : (
            <EmptyState
              icon={<Search className="size-8" aria-hidden="true" />}
              title="Select a customer"
              description="Search for a customer above to see their AI-predicted lifetime value."
            />
          )}
        </div>
      </SectionCard>
    </div>
  );
}

export default function SegmentsPage() {
  return (
    <div className="flex flex-col gap-ds-4">
      <PageHeader
        title="Customer Segments"
        description="AI-clustered customer segments with lifetime value"
        breadcrumbs={[
          { label: 'AI Hub', href: '/ai' },
          { label: 'Business Intelligence', href: '/ai/bi' },
          { label: 'Segments' },
        ]}
      />
      <AiGate>
        <SegmentsContent />
      </AiGate>
    </div>
  );
}
