'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Eye, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ListPage, type ListFilter } from '@/components/domain';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DataTableColumn } from '@/components/ui/data-table';
import { useApiMutation } from '@/hooks/use-api';
import { notificationsApi, type Notification } from '@/lib/api/notifications';

const REF_TYPE_ROUTES: Record<string, string> = {
  lead: '/leads',
  invoice: '/invoices',
  payment: '/payments',
  contact: '/contacts',
  task: '/tasks',
  follow_up: '/follow-ups',
};

function getNotificationRoute(n: Notification): string | null {
  if (n.actionUrl) return n.actionUrl;
  if (n.referenceType && n.referenceId) {
    const prefix = REF_TYPE_ROUTES[n.referenceType];
    if (prefix) return `${prefix}/${n.referenceId}`;
  }
  return null;
}

function formatTimeAgo(createdAt: string): string {
  const diff = Date.now() - new Date(createdAt).getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const NOTIFICATION_TYPES = [
  { value: 'lead_assigned', label: 'Lead Assigned' },
  { value: 'lead_status_change', label: 'Lead Status' },
  { value: 'follow_up_reminder', label: 'Follow-ups' },
  { value: 'payment_received', label: 'Payments' },
  { value: 'invoice_overdue', label: 'Invoice Overdue' },
  { value: 'task_assigned', label: 'Tasks' },
  { value: 'birthday', label: 'Birthdays' },
  { value: 'announcement', label: 'Announcements' },
];

function toCsv(rows: Notification[]): string {
  const header = ['Title', 'Message', 'Type', 'Status', 'Created At'];
  const lines = rows.map((n) =>
    [n.title, n.message, n.type, n.read ? 'Read' : 'Unread', n.createdAt]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n');
}

export default function NotificationsPage() {
  const router = useRouter();
  const [typeFilter, setTypeFilter] = React.useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const refresh = React.useCallback(() => {
    setRefreshKey((k) => k + 1);
    window.dispatchEvent(new Event('badge-counts:refresh'));
  }, []);

  const { mutate: markAsRead } = useApiMutation((id: string) => notificationsApi.markAsRead(id));
  const { mutate: markAllAsRead } = useApiMutation(() => notificationsApi.markAllAsRead());
  const { mutate: deleteNotification } = useApiMutation((id: string) => notificationsApi.delete(id));

  const fetcher = React.useCallback(
    ({ page, limit, search }: { page: number; limit: number; search: string; filters: ListFilter[] }) =>
      notificationsApi.list({
        page,
        limit,
        type: typeFilter ?? undefined,
        unreadOnly: unreadOnly || undefined,
        search: search || undefined,
      }),
    // refreshKey forces ListPage's internal infinite-scroll to refetch after mutations
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [typeFilter, unreadOnly, refreshKey],
  );

  const handleMarkRead = async (id: string) => {
    await markAsRead(id);
    refresh();
  };

  const handleDelete = async (id: string) => {
    await deleteNotification(id);
    toast.success('Notification deleted');
    refresh();
  };

  const handleMarkAllAsRead = async () => {
    const result = await markAllAsRead(undefined);
    if (result) {
      toast.success('All notifications marked as read');
      refresh();
    }
  };

  const handleRowClick = (n: Notification) => {
    if (!n.read) void handleMarkRead(n.id);
    const route = getNotificationRoute(n);
    if (route) router.push(route);
  };

  const activeFilters: ListFilter[] = [];
  if (typeFilter) {
    const label = NOTIFICATION_TYPES.find((t) => t.value === typeFilter)?.label ?? typeFilter;
    activeFilters.push({ id: 'type', label: 'Type', value: label });
  }
  if (unreadOnly) activeFilters.push({ id: 'unread', label: 'Status', value: 'Unread only' });

  const handleRemoveFilter = (id: string) => {
    if (id === 'type') setTypeFilter(null);
    if (id === 'unread') setUnreadOnly(false);
  };

  const columns: DataTableColumn<Notification>[] = [
    {
      key: 'title',
      header: 'Notification',
      sortable: false,
      cell: (n) => (
        <div className="flex items-start gap-ds-2">
          {!n.read && <div className="mt-1.5 size-2 shrink-0 rounded-ds-full bg-ds-primary" aria-hidden="true" />}
          <div className="min-w-0">
            <div className="flex items-center gap-ds-2">
              <span className={n.read ? 'text-ds-foreground-muted' : 'font-medium text-ds-foreground'}>
                {n.title}
              </span>
              {n.type === 'announcement' && (
                <Tag tone="info" size="sm">Announcement</Tag>
              )}
            </div>
            <p className="line-clamp-1 text-sm text-ds-foreground-subtle">{n.message}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      width: '160px',
      cell: (n) => (
        <Tag tone="neutral" size="sm">
          {NOTIFICATION_TYPES.find((t) => t.value === n.type)?.label ?? n.type}
        </Tag>
      ),
    },
    {
      key: 'read',
      header: 'Status',
      width: '110px',
      cell: (n) => <Tag tone={n.read ? 'neutral' : 'primary'} size="sm">{n.read ? 'Read' : 'Unread'}</Tag>,
    },
    {
      key: 'createdAt',
      header: 'When',
      width: '120px',
      align: 'right',
      cell: (n) => <span className="text-sm text-ds-foreground-subtle">{formatTimeAgo(n.createdAt)}</span>,
    },
  ];

  return (
    <ListPage<Notification>
      title="Notifications"
      description="Stay on top of what needs your attention."
      getRowId={(n) => n.id}
      fetcher={fetcher}
      extractItems={(r) => (r as { data: { data: Notification[] } }).data.data}
      extractTotal={(r) => (r as { data: { pagination: { total: number } } }).data.pagination.total}
      searchPlaceholder="Search notifications..."
      filters={activeFilters}
      onRemoveFilter={handleRemoveFilter}
      onClearFilters={() => { setTypeFilter(null); setUnreadOnly(false); }}
      headerActions={
        <>
          <Select value={typeFilter ?? 'all'} onValueChange={(v) => setTypeFilter(v === 'all' ? null : v)}>
            <SelectTrigger size="sm" aria-label="Filter by type" className="w-44">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {NOTIFICATION_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={unreadOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setUnreadOnly((v) => !v)}
          >
            Unread only
          </Button>
          <Button variant="outline" size="sm" onClick={handleMarkAllAsRead} className="gap-ds-2">
            <CheckCheck aria-hidden="true" />
            Mark all as read
          </Button>
        </>
      }
      onRowClick={handleRowClick}
      rowActions={(n) => (
        <>
          {getNotificationRoute(n) && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="View"
              onClick={(e) => { e.stopPropagation(); handleRowClick(n); }}
            >
              <Eye aria-hidden="true" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete"
            onClick={(e) => { e.stopPropagation(); void handleDelete(n.id); }}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </>
      )}
      bulkActions={[
        {
          label: 'Delete',
          icon: <Trash2 aria-hidden="true" />,
          destructive: true,
          onSelect: async (rows) => {
            await Promise.all(rows.map((r) => deleteNotification(r.id)));
            toast.success(`${rows.length} notification${rows.length !== 1 ? 's' : ''} deleted`);
            refresh();
          },
        },
        {
          label: 'Mark as read',
          icon: <CheckCheck aria-hidden="true" />,
          onSelect: async (rows) => {
            await Promise.all(rows.filter((r) => !r.read).map((r) => markAsRead(r.id)));
            refresh();
          },
        },
      ]}
      onExport={async () => {
        // Export the full filtered dataset, not just the loaded/selected rows.
        const first = await notificationsApi.list({
          page: 1,
          limit: 500,
          type: typeFilter ?? undefined,
          unreadOnly: unreadOnly || undefined,
        });
        const total = first.data.pagination.total;
        let items = first.data.data;
        const pages = Math.ceil(total / 500);
        for (let p = 2; p <= pages; p++) {
          const next = await notificationsApi.list({
            page: p,
            limit: 500,
            type: typeFilter ?? undefined,
            unreadOnly: unreadOnly || undefined,
          });
          items = items.concat(next.data.data);
        }
        const csv = toCsv(items);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `notifications-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }}
      columns={columns}
      emptyIcon={<Bell className="size-10" aria-hidden="true" />}
      emptyTitle="No notifications yet"
      emptyDescription="You're all caught up. New notifications will show up here."
    />
  );
}
