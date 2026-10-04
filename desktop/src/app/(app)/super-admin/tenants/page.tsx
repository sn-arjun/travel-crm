'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye } from 'lucide-react';
import { ListPage } from '@/components/domain';
import type { DataTableColumn } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { toLocalDateString } from '@/lib/dates';

interface Tenant {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'suspended' | 'inactive';
  createdAt: string;
  subscription?: { plan: string; status: 'active' | 'cancelled' | 'expired' };
  userCount?: number;
}

function statusTone(status: Tenant['status']) {
  if (status === 'active') return 'success' as const;
  if (status === 'suspended') return 'danger' as const;
  return 'info' as const;
}

export default function TenantsPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active' | 'suspended' | 'inactive'>('all');

  const columns: DataTableColumn<Tenant>[] = [
    { key: 'name', header: 'Name', sortable: true, hideable: false },
    { key: 'email', header: 'Email', cell: (t) => <span className="text-sm text-ds-foreground-muted">{t.email}</span> },
    { key: 'plan', header: 'Plan', cell: (t) => <span className="text-sm capitalize">{t.subscription?.plan ?? 'N/A'}</span> },
    { key: 'userCount', header: 'Users', align: 'right', cell: (t) => t.userCount ?? 0 },
    {
      key: 'status',
      header: 'Status',
      cell: (t) => <Tag tone={statusTone(t.status)}>{t.status}</Tag>,
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      cell: (t) => <span className="text-sm text-ds-foreground-muted">{new Date(t.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>,
    },
  ];

  return (
    <div className="p-ds-6">
      <ListPage<Tenant>
        title="Tenants"
        description="Every SaaS customer on the platform."
        getRowId={(t) => t.id}
        fetcher={({ page, limit, search }) =>
          client.get(API_ENDPOINTS.admin.tenants, {
            params: {
              page,
              limit,
              search: search || undefined,
              status: statusFilter !== 'all' ? statusFilter : undefined,
            },
          })
        }
        extractItems={(r: any) => r?.data ?? []}
        extractTotal={(r: any) => r?.pagination?.total ?? 0}
        columns={columns}
        searchPlaceholder="Search by name or email..."
        filters={statusFilter !== 'all' ? [{ id: 'status', label: 'Status', value: statusFilter }] : []}
        onRemoveFilter={() => setStatusFilter('all')}
        onClearFilters={() => setStatusFilter('all')}
        headerActions={
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        }
        rowActions={(t) => (
          <Button variant="ghost" size="icon-sm" aria-label="View" onClick={() => router.push(`/super-admin/tenants/${t.id}`)}>
            <Eye aria-hidden="true" />
          </Button>
        )}
        onRowClick={(t) => router.push(`/super-admin/tenants/${t.id}`)}
        onExport={async (rows) => {
          const header = ['Name', 'Email', 'Plan', 'Users', 'Status', 'Created'];
          const lines = rows.map((t) => [t.name, t.email, t.subscription?.plan ?? '', String(t.userCount ?? 0), t.status, t.createdAt].join(','));
          const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `tenants-${toLocalDateString(new Date())}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        }}
        emptyTitle="No tenants yet"
        emptyDescription="Tenants will appear here once they sign up."
      />
    </div>
  );
}
