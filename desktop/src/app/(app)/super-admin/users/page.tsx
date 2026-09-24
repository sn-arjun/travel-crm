'use client';

import * as React from 'react';
import { Eye } from 'lucide-react';
import { ListPage } from '@/components/domain';
import type { DataTableColumn } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  tenantId: string;
  tenantName: string;
  role: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export default function AllUsersPage() {
  const [roleFilter, setRoleFilter] = React.useState<'all' | 'admin' | 'user'>('all');
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active' | 'inactive'>('all');

  const columns: DataTableColumn<AdminUser>[] = [
    { key: 'name', header: 'Name', sortable: true, hideable: false },
    { key: 'email', header: 'Email', cell: (u) => <span className="text-sm text-ds-foreground-muted">{u.email}</span> },
    { key: 'tenantName', header: 'Tenant', cell: (u) => <span className="text-sm">{u.tenantName}</span> },
    { key: 'role', header: 'Role', cell: (u) => <Tag tone="info">{u.role}</Tag> },
    { key: 'status', header: 'Status', cell: (u) => <Tag tone={u.status === 'active' ? 'success' : 'info'}>{u.status}</Tag> },
    {
      key: 'createdAt',
      header: 'Joined',
      sortable: true,
      cell: (u) => <span className="text-sm text-ds-foreground-muted">{new Date(u.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>,
    },
  ];

  const activeFilters = React.useMemo(() => {
    const f: { id: string; label: string; value: string }[] = [];
    if (roleFilter !== 'all') f.push({ id: 'role', label: 'Role', value: roleFilter });
    if (statusFilter !== 'all') f.push({ id: 'status', label: 'Status', value: statusFilter });
    return f;
  }, [roleFilter, statusFilter]);

  return (
    <div className="p-ds-6">
      <ListPage<AdminUser>
        title="All users"
        description="Users across every tenant on the platform."
        getRowId={(u) => u.id}
        fetcher={({ page, limit, search }) =>
          client.get(API_ENDPOINTS.admin.allUsers, {
            params: {
              page,
              limit,
              search: search || undefined,
              role: roleFilter !== 'all' ? roleFilter : undefined,
              status: statusFilter !== 'all' ? statusFilter : undefined,
            },
          })
        }
        extractItems={(r: any) => r?.data ?? []}
        extractTotal={(r: any) => r?.pagination?.total ?? 0}
        columns={columns}
        searchPlaceholder="Search by name or email..."
        filters={activeFilters}
        onRemoveFilter={(id) => {
          if (id === 'role') setRoleFilter('all');
          if (id === 'status') setStatusFilter('all');
        }}
        onClearFilters={() => { setRoleFilter('all'); setStatusFilter('all'); }}
        headerActions={
          <>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="user">User</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        renderDetail={(u) => (
          <div className="space-y-ds-4">
            <div>
              <p className="text-xs text-ds-foreground-muted">Tenant</p>
              <p className="font-medium">{u.tenantName}</p>
            </div>
            <div>
              <p className="text-xs text-ds-foreground-muted">Role</p>
              <p className="font-medium capitalize">{u.role}</p>
            </div>
            <div>
              <p className="text-xs text-ds-foreground-muted">Status</p>
              <p className="font-medium capitalize">{u.status}</p>
            </div>
            <div>
              <p className="text-xs text-ds-foreground-muted">Joined</p>
              <p className="font-medium">{new Date(u.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
            </div>
          </div>
        )}
        detailTitle={(u) => u.name}
        rowActions={() => (
          <Button variant="ghost" size="icon-sm" aria-label="View">
            <Eye aria-hidden="true" />
          </Button>
        )}
        emptyTitle="No users found"
        emptyDescription="Users will appear here as tenants add their teams."
      />
    </div>
  );
}
