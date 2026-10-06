'use client';

import * as React from 'react';
import { ListPage } from '@/components/domain';
import type { DataTableColumn } from '@/components/ui/data-table';
import { Tag } from '@/components/ui/tag';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';

interface AuditLog {
  id: string;
  timestamp: string;
  userName: string;
  tenantName?: string;
  action: string;
  resourceType: string;
  resourceName?: string;
  ipAddress: string;
  userAgent?: string;
  status: 'success' | 'failure';
}

function actionTone(action: string) {
  const a = action.toLowerCase();
  if (a.includes('create')) return 'success' as const;
  if (a.includes('delete')) return 'danger' as const;
  if (a.includes('update')) return 'info' as const;
  return 'info' as const;
}

export default function AuditLogsPage() {
  const [actionFilter, setActionFilter] = React.useState<'all' | 'create' | 'update' | 'delete' | 'login'>('all');

  const columns: DataTableColumn<AuditLog>[] = [
    { key: 'action', header: 'Action', cell: (l) => <Tag tone={actionTone(l.action)}>{l.action}</Tag> },
    { key: 'resourceType', header: 'Resource', hideable: false },
    { key: 'userName', header: 'User', cell: (l) => <span className="text-sm">{l.userName}</span> },
    { key: 'tenantName', header: 'Tenant', cell: (l) => <span className="text-sm text-ds-foreground-muted">{l.tenantName ?? '—'}</span> },
    { key: 'status', header: 'Status', cell: (l) => <Tag tone={l.status === 'success' ? 'success' : 'danger'}>{l.status}</Tag> },
    { key: 'timestamp', header: 'Time', sortable: true, cell: (l) => new Date(l.timestamp).toLocaleString('en-IN') },
  ];

  return (
    <>
      <ListPage<AuditLog>
        title="Audit logs"
        description="Complete platform activity and admin action history."
        getRowId={(l) => l.id}
        fetcher={({ page, limit, search }) =>
          client.get(API_ENDPOINTS.admin.auditLogs, {
            params: { page, limit, search: search || undefined, action: actionFilter !== 'all' ? actionFilter : undefined },
          })
        }
        extractItems={(r) => (r as { data?: AuditLog[] })?.data ?? []}
        extractTotal={(r) => (r as { pagination?: { total?: number } })?.pagination?.total ?? 0}
        columns={columns}
        searchPlaceholder="Search by user, tenant, or action..."
        filters={actionFilter !== 'all' ? [{ id: 'action', label: 'Action', value: actionFilter }] : []}
        onRemoveFilter={() => setActionFilter('all')}
        onClearFilters={() => setActionFilter('all')}
        headerActions={
          <Select value={actionFilter} onValueChange={(v) => setActionFilter(v as typeof actionFilter)}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              <SelectItem value="create">Create</SelectItem>
              <SelectItem value="update">Update</SelectItem>
              <SelectItem value="delete">Delete</SelectItem>
              <SelectItem value="login">Login</SelectItem>
            </SelectContent>
          </Select>
        }
        renderDetail={(l) => (
          <div className="space-y-ds-4">
            <div className="grid grid-cols-2 gap-ds-4">
              <div>
                <p className="text-xs text-ds-foreground-muted">Action</p>
                <p className="font-medium">{l.action}</p>
              </div>
              <div>
                <p className="text-xs text-ds-foreground-muted">Resource type</p>
                <p className="font-medium">{l.resourceType}</p>
              </div>
            </div>
            {l.resourceName && (
              <div>
                <p className="text-xs text-ds-foreground-muted">Resource</p>
                <p className="font-medium">{l.resourceName}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-ds-4">
              <div>
                <p className="text-xs text-ds-foreground-muted">User</p>
                <p className="font-medium">{l.userName}</p>
              </div>
              <div>
                <p className="text-xs text-ds-foreground-muted">Timestamp</p>
                <p className="font-medium">{new Date(l.timestamp).toLocaleString('en-IN')}</p>
              </div>
            </div>
            {l.tenantName && (
              <div>
                <p className="text-xs text-ds-foreground-muted">Tenant</p>
                <p className="font-medium">{l.tenantName}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-ds-foreground-muted">IP address</p>
              <p className="font-mono text-sm">{l.ipAddress}</p>
            </div>
            {l.userAgent && (
              <div>
                <p className="text-xs text-ds-foreground-muted">User agent</p>
                <p className="break-words font-mono text-xs">{l.userAgent}</p>
              </div>
            )}
          </div>
        )}
        detailTitle={() => 'Audit log entry'}
        emptyTitle="No audit logs found"
      />
    </>
  );
}
