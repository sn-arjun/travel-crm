'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Check, CheckCheck, Bell, AlertCircle, DollarSign, CheckCircle2, User, Calendar,
  Trash2, ExternalLink, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useApiMutation } from '@/hooks/use-api';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { FilterBar } from '@/components/domain/filter-bar';
import { notificationsApi, type Notification } from '@/lib/api/notifications';

// Mapping referenceType → route prefix
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

function getNotificationIcon(type: string) {
  if (type.includes('lead') || type.includes('assigned')) return <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
  if (type.includes('follow')) return <Calendar className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
  if (type.includes('invoice') || type.includes('payment')) return <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />;
  if (type.includes('fleet') || type.includes('driver')) return <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
  if (type.includes('trip') || type.includes('completed')) return <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
  if (type === 'announcement') return <Bell className="h-4 w-4 text-purple-600 dark:text-purple-400" />;
  return <Bell className="h-4 w-4 text-muted-foreground" />;
}

function getNotificationBgColor(read: boolean, type: string) {
  if (type === 'announcement') {
    return read
      ? 'bg-purple-50/50 dark:bg-purple-900/5 hover:bg-purple-50 dark:hover:bg-purple-900/10'
      : 'bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 border border-purple-200 dark:border-purple-800';
  }
  return read ? 'bg-transparent hover:bg-muted/50' : 'bg-blue-50 dark:bg-blue-900/10 hover:bg-blue-100 dark:hover:bg-blue-900/20';
}

const REF_DATE = Date.now();

function formatTimeAgo(createdAt: string): string {
  const now = new Date(REF_DATE).getTime();
  const notifTime = new Date(createdAt).getTime();
  const diff = now - notifTime;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function NotificationSkeleton() {
  return (
    <div className="flex gap-3 p-4 rounded-lg">
      <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

function NotificationItem({
  notification,
  onMarkRead,
  onDelete,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const router = useRouter();
  const route = getNotificationRoute(notification);

  const handleClick = () => {
    if (!notification.read) onMarkRead(notification.id);
    if (route) router.push(route);
  };

  return (
    <div
      className={cn(
        'flex gap-3 p-4 rounded-lg transition-colors group relative',
        route ? 'cursor-pointer' : 'cursor-default',
        getNotificationBgColor(notification.read ?? false, notification.type ?? ''),
      )}
      onClick={handleClick}
    >
      {/* Icon */}
      <div className="flex-shrink-0 pt-1">
        <div className={cn('h-8 w-8 rounded-full flex items-center justify-center', !notification.read && 'ring-2 ring-offset-2 ring-primary/50')}>
          {getNotificationIcon(notification.type ?? '')}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className={cn('text-sm font-semibold', !notification.read && 'text-foreground')}>
            {notification.title}
            {notification.type === 'announcement' && (
              <Badge variant="secondary" className="ml-2 text-[10px] py-0">Announcement</Badge>
            )}
          </h3>
          <div className="flex items-center gap-1 flex-shrink-0">
            {!notification.read && <div className="h-2 w-2 rounded-full bg-primary mt-1.5" />}
          </div>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{notification.message}</p>
        <p className="text-[11px] text-muted-foreground mt-1.5">{formatTimeAgo(notification.createdAt)}</p>
      </div>

      {/* Hover actions */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {route && (
          <button
            onClick={(e) => { e.stopPropagation(); router.push(route); }}
            className="p-1.5 rounded hover:bg-background/80 text-muted-foreground hover:text-foreground transition-colors"
            title="View entity"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(notification.id); }}
          className="p-1.5 rounded hover:bg-background/80 text-muted-foreground hover:text-destructive transition-colors"
          title="Delete notification"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        {route && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
    </div>
  );
}

const NOTIFICATION_TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'lead_assigned', label: 'Lead Assigned' },
  { value: 'lead_status_change', label: 'Lead Status' },
  { value: 'follow_up_reminder', label: 'Follow-ups' },
  { value: 'payment_received', label: 'Payments' },
  { value: 'invoice_overdue', label: 'Invoice Overdue' },
  { value: 'task_assigned', label: 'Tasks' },
  { value: 'birthday', label: 'Birthdays' },
  { value: 'announcement', label: 'Announcements' },
];

export default function NotificationsPage() {
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [unreadOnly, setUnreadOnly] = React.useState(false);

  const fetcher = React.useCallback(
    (page: number, limit: number) =>
      notificationsApi.list({
        page,
        limit,
        type: typeFilter !== 'all' ? typeFilter : undefined,
        unreadOnly: unreadOnly || undefined,
      }),
    [typeFilter, unreadOnly],
  );

  const extractItems = React.useCallback((res: any) => {
    const data = res?.data;
    if (Array.isArray(data)) return data;
    return data?.items ?? data?.data ?? [];
  }, []);

  const extractTotal = React.useCallback(
    (res: any) => res?.data?.pagination?.total ?? res?.data?.total ?? 0,
    [],
  );

  const { items: notifications, loading, loadingMore, hasMore, total, refetch, sentinelRef } =
    useInfiniteScroll<Notification>({
      fetcher,
      limit: 20,
      extractItems,
      extractTotal,
    });

  // Re-fetch when filters change
  React.useEffect(() => {
    refetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, unreadOnly]);

  const filteredNotifications = React.useMemo(() => {
    if (!search) return notifications;
    const q = search.toLowerCase();
    return notifications.filter(
      (n) => n.title.toLowerCase().includes(q) || n.message.toLowerCase().includes(q),
    );
  }, [notifications, search]);

  const { mutate: markAsRead } = useApiMutation((id: string) => notificationsApi.markAsRead(id));
  const { mutate: markAllAsRead } = useApiMutation(() => notificationsApi.markAllAsRead());
  const { mutate: deleteNotification } = useApiMutation((id: string) => notificationsApi.delete(id));

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Group by date
  const today = new Date(REF_DATE);
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const grouped = React.useMemo(() => {
    return {
      today: filteredNotifications.filter((n) => {
        const d = new Date(n.createdAt); d.setHours(0, 0, 0, 0);
        return d.getTime() === today.getTime();
      }),
      yesterday: filteredNotifications.filter((n) => {
        const d = new Date(n.createdAt); d.setHours(0, 0, 0, 0);
        return d.getTime() === yesterday.getTime();
      }),
      earlier: filteredNotifications.filter((n) => {
        const d = new Date(n.createdAt); d.setHours(0, 0, 0, 0);
        return d.getTime() < yesterday.getTime();
      }),
    };
  }, [filteredNotifications]);

  const handleMarkAsRead = async (id: string) => {
    await markAsRead(id);
    refetch();
  };

  const handleDelete = async (id: string) => {
    await deleteNotification(id);
    refetch();
  };

  const handleMarkAllAsRead = async () => {
    const result = await markAllAsRead(undefined);
    if (result) {
      toast.success('All notifications marked as read');
      refetch();
    }
  };

  const activeFilters = [];
  if (typeFilter !== 'all') {
    const label = NOTIFICATION_TYPES.find((t) => t.value === typeFilter)?.label ?? typeFilter;
    activeFilters.push({ id: 'type', label: 'Type', value: label });
  }
  if (unreadOnly) activeFilters.push({ id: 'unread', label: 'Status', value: 'Unread only' });

  const handleRemoveFilter = (id: string) => {
    if (id === 'type') setTypeFilter('all');
    if (id === 'unread') setUnreadOnly(false);
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Notifications
            {total > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">({total})</span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAllAsRead}>
            <CheckCheck className="h-4 w-4 mr-1.5" />
            Mark all as read
          </Button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="px-6 py-3 border-b">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search notifications..."
          activeFilters={activeFilters}
          onRemoveFilter={handleRemoveFilter}
          onClearFilters={() => { setTypeFilter('all'); setUnreadOnly(false); }}
          actions={
            <div className="flex items-center gap-2">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9 w-44">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
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
                {unreadOnly ? <Check className="h-3.5 w-3.5 mr-1.5" /> : null}
                Unread only
              </Button>
            </div>
          }
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="max-w-2xl mx-auto p-6 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <NotificationSkeleton key={i} />)}
          </div>
        )}

        {!loading && (
          <div className="max-w-2xl mx-auto p-6 space-y-6">
            {grouped.today.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Today</h2>
                <div className="space-y-1">
                  {grouped.today.map((n) => (
                    <NotificationItem key={n.id} notification={n} onMarkRead={handleMarkAsRead} onDelete={handleDelete} />
                  ))}
                </div>
              </div>
            )}

            {grouped.yesterday.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Yesterday</h2>
                <div className="space-y-1">
                  {grouped.yesterday.map((n) => (
                    <NotificationItem key={n.id} notification={n} onMarkRead={handleMarkAsRead} onDelete={handleDelete} />
                  ))}
                </div>
              </div>
            )}

            {grouped.earlier.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Earlier</h2>
                <div className="space-y-1">
                  {grouped.earlier.map((n) => (
                    <NotificationItem key={n.id} notification={n} onMarkRead={handleMarkAsRead} onDelete={handleDelete} />
                  ))}
                </div>
              </div>
            )}

            {filteredNotifications.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 gap-3">
                <Bell className="h-12 w-12 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                  {search || typeFilter !== 'all' || unreadOnly ? 'No notifications match your filters' : 'No notifications yet'}
                </p>
                {(search || typeFilter !== 'all' || unreadOnly) && (
                  <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setTypeFilter('all'); setUnreadOnly(false); }}>
                    Clear filters
                  </Button>
                )}
              </div>
            )}

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="py-2">
              {loadingMore && (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <NotificationSkeleton key={i} />)}
                </div>
              )}
              {!hasMore && filteredNotifications.length > 0 && (
                <p className="text-center text-xs text-muted-foreground py-2">All notifications loaded</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
