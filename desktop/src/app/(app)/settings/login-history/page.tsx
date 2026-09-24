'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, History, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiQuery } from '@/hooks/use-api';
import { usersApi, type LoginHistoryEntry } from '@/lib/api/users';
import { cn } from '@/lib/utils';

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const statusConfig = {
  success: { label: 'Success', icon: CheckCircle2, className: 'text-ds-success-on-subtle bg-ds-success-subtle' },
  failed: { label: 'Failed', icon: XCircle, className: 'text-ds-danger-on-subtle bg-ds-danger-subtle' },
  locked: { label: 'Locked', icon: AlertTriangle, className: 'text-ds-warning-on-subtle bg-ds-warning-subtle' },
};

export default function LoginHistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams?.get('userId') ?? null;

  const { data: response, loading } = useApiQuery(
    () => (userId ? usersApi.getLoginHistory(userId) : usersApi.getMyLoginHistory()),
    [userId],
  );

  const entries: LoginHistoryEntry[] = React.useMemo(() => {
    if (!response || !('data' in response)) return [];
    return (response.data as LoginHistoryEntry[]) ?? [];
  }, [response]);

  const columns: DataTableColumn<LoginHistoryEntry>[] = [
    { key: 'createdAt', header: 'Date & time', cell: (e) => formatDate(e.createdAt), sortable: true },
    { key: 'ipAddress', header: 'IP address', cell: (e) => <span className="font-mono text-sm">{e.ipAddress ?? '—'}</span> },
    { key: 'location', header: 'Location', cell: (e) => [e.city, e.country].filter(Boolean).join(', ') || '—' },
    { key: 'browser', header: 'Browser', cell: (e) => e.browser ?? '—' },
    { key: 'device', header: 'OS / device', cell: (e) => [e.os, e.device].filter(Boolean).join(' / ') || '—' },
    {
      key: 'status',
      header: 'Status',
      cell: (e) => {
        const config = statusConfig[e.status] ?? statusConfig.success;
        const Icon = config.icon;
        return (
          <Badge className={cn('gap-ds-1', config.className)}>
            <Icon aria-hidden="true" className="size-3" />
            {config.label}
          </Badge>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-ds-4">
      <PageHeader
        title="Login history"
        description={userId ? 'Login activity for this team member.' : 'Review your recent login activity.'}
        count={loading ? undefined : entries.length}
        back={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Go back"
            onClick={() => (userId ? router.push('/settings/team') : router.push('/settings'))}
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
        }
      />

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <DataTable
          columns={columns}
          data={entries}
          getRowId={(e) => e.id}
          emptyState={
            <EmptyState
              icon={<History aria-hidden="true" className="size-10" />}
              title="No login history found"
              description="Login attempts will appear here once they happen."
            />
          }
        />
      )}
    </div>
  );
}
