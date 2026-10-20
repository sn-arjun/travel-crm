'use client';


import { formatLocaleDateTime } from '@/lib/format';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Monitor, Smartphone, Trash2, LogOut, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { Button, DataTable, EmptyState, PageHeader, Badge, Skeleton, useConfirm } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import { useApiQuery } from '@/hooks/use-api';
import { authApi, type SessionData } from '@/lib/api/auth';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { PageContainer } from '@/components/layout/page-container';

function formatDate(iso: string) {
  try {
    return formatLocaleDateTime(iso);
  } catch {
    return iso;
  }
}

function SessionsSettingsPageContent() {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  const { data: sessionsResponse, loading, refetch } = useApiQuery(
    () => authApi.getSessions(),
    [],
  );

  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('desc');

  const sessions: SessionData[] = React.useMemo(() => {
    const list = sessionsResponse?.data ?? [];
    return [...list].sort((a, b) => {
      const diff = new Date(a.loginAt).getTime() - new Date(b.loginAt).getTime();
      return sortDirection === 'asc' ? diff : -diff;
    });
  }, [sessionsResponse, sortDirection]);

  const handleRevokeSession = async (session: SessionData) => {
    const ok = await confirm({
      title: 'Revoke session?',
      description: `This will sign out the session on ${session.device || 'this device'} (${session.browser || 'unknown browser'}).`,
      confirmLabel: 'Revoke',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await client.delete(`${API_ENDPOINTS.auth.sessions}/${session.id}`);
      toast.success('Session revoked');
      refetch();
    } catch {
      toast.error('Failed to revoke session');
    }
  };

  const handleRevokeAllOthers = async () => {
    const ok = await confirm({
      title: 'Revoke all other sessions?',
      description: 'Every device except this one will be signed out immediately.',
      confirmLabel: 'Revoke all',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await client.delete(API_ENDPOINTS.auth.sessions);
      toast.success('All other sessions revoked');
      refetch();
    } catch {
      toast.error('Failed to revoke sessions');
    }
  };

  const columns: DataTableColumn<SessionData>[] = [
    {
      key: 'device',
      header: 'Device',
      cell: (s) => {
        const isMobile = s.device?.toLowerCase() === 'mobile';
        return (
          <div className="flex items-center gap-ds-2">
            {isMobile ? (
              <Smartphone className="size-4 text-ds-foreground-muted" />
            ) : (
              <Monitor className="size-4 text-ds-foreground-muted" />
            )}
            <span className="capitalize">{s.device || 'Desktop'}</span>
          </div>
        );
      },
    },
    {
      key: 'browser',
      header: 'Browser / OS',
      cell: (s) => (
        <div>
          <p className="text-sm font-medium text-ds-foreground">{s.browser || 'Unknown'}</p>
          <p className="text-xs text-ds-foreground-muted">{s.os || 'Unknown'}</p>
        </div>
      ),
    },
    {
      key: 'ipAddress',
      header: 'IP Address',
      cell: (s) => <span className="font-mono text-sm">{s.ipAddress ?? '-'}</span>,
    },
    {
      key: 'loginAt',
      header: 'Login Time',
      sortable: true,
      cell: (s) => <span className="text-sm">{formatDate(s.loginAt)}</span>,
    },
    {
      key: 'isCurrent',
      header: 'Status',
      cell: (s) =>
        s.isCurrent ? (
          <Badge className="bg-ds-success-subtle text-ds-success-on-subtle">Current</Badge>
        ) : (
          <Badge variant="secondary">Active</Badge>
        ),
    },
  ];

  return (
    <div className="space-y-ds-6">
      <PageHeader
        title="Active Sessions"
        description="Manage your active login sessions across devices"
        count={sessions.length}
        back={
          <Button variant="ghost" size="icon-sm" aria-label="Back" onClick={() => router.push('/settings')}>
            <Shield className="size-4" />
          </Button>
        }
        actions={
          sessions.length > 1 ? (
            <Button variant="destructive" size="sm" className="gap-ds-2" onClick={handleRevokeAllOthers}>
              <LogOut className="size-4" />
              Revoke all others
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="space-y-ds-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<Shield className="size-10" />}
          title="No active sessions found"
          description="You currently have no recorded login sessions."
        />
      ) : (
        <DataTable<SessionData>
          columns={columns}
          data={sessions}
          getRowId={(s) => s.id}
          sortColumn="loginAt"
          sortDirection={sortDirection}
          onSort={(_column, direction) => setSortDirection(direction)}
          rowActions={(s) =>
            !s.isCurrent ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Revoke session"
                className="text-ds-danger hover:text-ds-danger"
                onClick={() => handleRevokeSession(s)}
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null
          }
        />
      )}
      {dialog}
    </div>
  );
}

export default function SessionsSettingsPage() {
  return (
    <PageContainer>
      <SessionsSettingsPageContent />
    </PageContainer>
  );
}
