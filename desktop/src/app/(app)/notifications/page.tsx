'use client';

import * as React from 'react';
import {
  Check, CheckCheck, Bell, AlertCircle, DollarSign, Truck, CheckCircle2, User, Calendar, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { notificationsApi, type Notification } from '@/lib/api/notifications';

const REF_DATE = Date.now();

function getNotificationIcon(type: string) {
  if (type.includes('lead')) return <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
  if (type.includes('follow')) return <Calendar className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
  if (type.includes('invoice') || type.includes('payment')) return <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />;
  if (type.includes('fleet') || type.includes('driver')) return <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
  if (type.includes('trip') || type.includes('completed')) return <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
  return <Bell className="h-4 w-4 text-muted-foreground" />;
}

function getNotificationBgColor(read: boolean) {
  return read ? 'bg-transparent hover:bg-muted/50' : 'bg-blue-50 dark:bg-blue-900/10 hover:bg-blue-100 dark:hover:bg-blue-900/20';
}

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

function NotificationItem({ notification, onMarkRead }: { notification: Notification; onMarkRead: (id: string) => void }) {
  return (
    <div
      className={cn('flex gap-3 p-4 rounded-lg transition-colors cursor-pointer group', getNotificationBgColor(notification.read ?? false))}
      onClick={() => !notification.read && onMarkRead(notification.id)}
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
          <h3 className={cn('text-sm font-semibold', !notification.read && 'text-foreground')}>{notification.title}</h3>
          {!notification.read && <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{notification.message}</p>
        <p className="text-[11px] text-muted-foreground mt-1.5">{formatTimeAgo(notification.createdAt)}</p>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const { data: response, loading, error, refetch } = useApiQuery(
    () => notificationsApi.list({ page: 1, limit: 100 }),
    [],
  );

  const notifications = React.useMemo(() => {
    if (!response || !('data' in response)) return [];
    const data = response.data;
    if (Array.isArray(data)) return data;
    // API returns { items: [], total: number } or { data: [] }
    return (data as any)?.items ?? (data as any)?.data ?? [];
  }, [response]);

  const { mutate: markAsRead } = useApiMutation((id: string) => notificationsApi.markAsRead(id));
  const { mutate: markAllAsRead } = useApiMutation(() => notificationsApi.markAllAsRead());

  const unreadCount = notifications.filter((n: any) => !n.read).length;

  // Group notifications by date
  const today = new Date(REF_DATE);
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groupedNotifications = {
    today: notifications.filter((n: any) => {
      const notifDate = new Date(n.createdAt);
      notifDate.setHours(0, 0, 0, 0);
      return notifDate.getTime() === today.getTime();
    }),
    yesterday: notifications.filter((n: any) => {
      const notifDate = new Date(n.createdAt);
      notifDate.setHours(0, 0, 0, 0);
      return notifDate.getTime() === yesterday.getTime();
    }),
    earlier: notifications.filter((n: any) => {
      const notifDate = new Date(n.createdAt);
      notifDate.setHours(0, 0, 0, 0);
      return notifDate.getTime() < yesterday.getTime();
    }),
  };

  const handleMarkAsRead = async (id: string) => {
    const result = await markAsRead(id);
    if (result) {
      refetch();
    }
  };

  const handleMarkAllAsRead = async () => {
    const result = await markAllAsRead(undefined);
    if (result) {
      toast.success('All notifications marked as read');
      refetch();
    }
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Notifications</h1>
          <p className="text-sm text-muted-foreground">{unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}` : 'All caught up!'}</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAllAsRead}>
            <CheckCheck className="h-4 w-4 mr-1.5" />
            Mark all as read
          </Button>
        )}
      </div>

      {error && (
        <div className="px-6 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-800 dark:text-amber-200">Using sample data — connect to backend for real data</p>
        </div>
      )}

      {/* Notifications List */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && (
          <div className="max-w-2xl mx-auto p-6 space-y-6">
            {/* Today */}
            {groupedNotifications.today.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Today</h2>
                <div className="space-y-2">
                  {groupedNotifications.today.map((notif: any) => (
                    <NotificationItem key={notif.id} notification={notif} onMarkRead={handleMarkAsRead} />
                  ))}
                </div>
              </div>
            )}

            {/* Yesterday */}
            {groupedNotifications.yesterday.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Yesterday</h2>
                <div className="space-y-2">
                  {groupedNotifications.yesterday.map((notif: any) => (
                    <NotificationItem key={notif.id} notification={notif} onMarkRead={handleMarkAsRead} />
                  ))}
                </div>
              </div>
            )}

            {/* Earlier */}
            {groupedNotifications.earlier.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Earlier</h2>
                <div className="space-y-2">
                  {groupedNotifications.earlier.map((notif: any) => (
                    <NotificationItem key={notif.id} notification={notif} onMarkRead={handleMarkAsRead} />
                  ))}
                </div>
              </div>
            )}

            {notifications.length === 0 && (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <Bell className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">No notifications yet</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
