'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { usePathname, useRouter } from 'next/navigation';
import {
  Search, Bell, Moon, Sun, Command, CheckCheck,
  Mail, AlertTriangle, Calendar, CreditCard, Users, Briefcase,
  MessageSquare, FileText, Truck, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { notificationsApi, type Notification } from '@/lib/api/notifications';
import { useAuthStore } from '@/stores/auth-store';
import { getInitials } from '@/lib/utils';
import { getPageTitle } from '@/components/layout/nav-config';
import { routeForNotification } from '@/lib/notifications/route';
import { useRealtimeEvent, useRealtimeConnected } from '@/hooks/use-realtime-event';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map notification type to an icon component. */
function notificationIcon(type: string) {
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    lead: Briefcase,
    invoice: CreditCard,
    payment: CreditCard,
    task: Calendar,
    follow_up: Calendar,
    followup: Calendar,
    communication: MessageSquare,
    email: Mail,
    alert: AlertTriangle,
    contact: Users,
    document: FileText,
    fleet: Truck,
    system: Info,
  };
  const Icon = iconMap[type?.toLowerCase()] ?? Bell;
  return <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

/** Format a timestamp into a relative string like "2m ago", "3h ago", "5d ago". */
function timeAgo(dateStr: string): string {
  try {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    if (diffMs < 0) return 'just now';
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Notification Bell Dropdown
// ---------------------------------------------------------------------------

function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [markingAll, setMarkingAll] = React.useState(false);

  // Fetch unread count
  const fetchUnreadCount = React.useCallback(async () => {
    try {
      const res = await notificationsApi.getUnreadCount();
      const data = (res as { data?: number | { total?: number; count?: number } })?.data;
      const count = typeof data === 'number' ? data : (data?.total ?? data?.count ?? 0);
      setUnreadCount(count);
    } catch {
      // Non-critical — keep previous count
    }
  }, []);

  // Fetch the 5 most recent notifications
  const fetchRecent = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationsApi.list({ page: 1, limit: 5, sortBy: 'createdAt', sortOrder: 'desc' });
      const data = (res as { data?: Notification[] | { data?: Notification[] } })?.data;
      // The response may be paginated: { data: [...], pagination: {...} }
      const items: Notification[] = Array.isArray(data) ? data : (data?.data ?? []);
      setNotifications(items);
    } catch {
      // Silently ignore — the dropdown will show a fallback
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  React.useEffect(() => { fetchUnreadCount(); }, [fetchUnreadCount]);

  // Real-time updates via WebSocket
  useRealtimeEvent('notification:new', () => {
    setUnreadCount((prev) => prev + 1);
  });
  useRealtimeEvent('notification:read', () => {
    fetchUnreadCount();
  });
  useRealtimeEvent('badge_counts:update', (data) => {
    if (typeof data?.unreadNotifications === 'number') {
      setUnreadCount(data.unreadNotifications);
    }
  });

  // Fallback: poll every 5 minutes if WS disconnected
  const wsConnected = useRealtimeConnected();
  React.useEffect(() => {
    if (wsConnected) return;
    const interval = setInterval(fetchUnreadCount, 300_000);
    return () => clearInterval(interval);
  }, [wsConnected, fetchUnreadCount]);

  // Fetch recent when opening
  React.useEffect(() => {
    if (open) {
      fetchRecent();
    }
  }, [open, fetchRecent]);

  // Mark all as read
  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await notificationsApi.markAllAsRead();
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // Ignore
    } finally {
      setMarkingAll(false);
    }
  };

  // Click a single notification
  const handleNotificationClick = async (n: Notification) => {
    // Mark as read
    if (!n.read) {
      try {
        await notificationsApi.markAsRead(n.id);
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // Ignore
      }
    }
    setOpen(false);
    // actionUrl wins; otherwise open whatever the notification references (FR-9)
    router.push(routeForNotification(n));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="h-8 w-8 relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ds-primary px-1 text-xs leading-none font-bold text-ds-primary-foreground animate-pulse">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-90 p-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={handleMarkAllRead}
              disabled={markingAll}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        {/* Notification list */}
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <ul>
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`w-full text-left flex gap-3 px-4 py-3 hover:bg-muted/50 transition-colors border-b last:border-0 ${
                      !n.read ? 'bg-primary/5' : ''
                    }`}
                    onClick={() => handleNotificationClick(n)}
                  >
                    {/* Icon */}
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      !n.read ? 'bg-primary/10' : 'bg-muted'
                    }`}>
                      {notificationIcon(n.type)}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug truncate ${!n.read ? 'font-medium' : 'text-muted-foreground'}`}>
                        {n.title}
                      </p>
                      {n.message && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {n.message}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                    {/* Unread dot */}
                    {!n.read && (
                      <div className="flex items-center">
                        <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2.5">
          <Link
            href="/notifications"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => setOpen(false)}
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// TopNavbar
// ---------------------------------------------------------------------------

export function TopNavbar() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);

  const isDark = mounted && resolvedTheme === 'dark';
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark');

  const displayName = user?.name?.trim() || user?.email?.split('@')[0] || 'User';
  const initials = getInitials(displayName) || 'U';

  const openSearch = () => window.dispatchEvent(new Event('travelcrm:open-command-palette'));

  return (
    <header className="electron-drag flex items-center justify-between h-12 px-6 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0">
      <div className="flex items-center gap-4">
        <p data-slot="topbar-title" className="text-sm font-semibold text-foreground">{getPageTitle(pathname)}</p>
      </div>

      <div className="electron-no-drag flex items-center gap-2">
        {/* Search shortcut hint */}
        <Button variant="outline" size="sm" className="h-8 gap-2 text-muted-foreground text-xs hidden md:flex" onClick={openSearch}>
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Search...</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground">
            <Command className="h-2.5 w-2.5" aria-hidden="true" />K
          </kbd>
        </Button>

        {/* Theme toggle (next-themes persists the choice) */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleTheme}
          className="h-8 w-8"
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {mounted ? (isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />) : <span className="h-4 w-4" aria-hidden="true" />}
        </Button>

        {/* Notification Bell Dropdown */}
        <NotificationBell />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 gap-2 px-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium hidden md:inline">{displayName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild><Link href="/settings/profile">Profile</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/settings">Settings</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/help">Help Center</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => {
              useAuthStore.getState().logout();
              window.location.href = '/login';
            }}>
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
