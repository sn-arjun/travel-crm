'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  HelpCircle,
  LogOut,
  Settings,
  UserRound,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { useSidebarStore } from '@/stores/sidebar-store';
import { useAuthStore } from '@/stores/auth-store';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { notificationsApi } from '@/lib/api/notifications';
import { assistantApi } from '@/lib/api/assistant';
import { useRealtimeEvent, useRealtimeConnected } from '@/hooks/use-realtime-event';
import { useElectron } from '@/hooks/use-electron';
import { ConnectionStatus } from '@/components/layout/connection-status';
import {
  navigation,
  bottomNav,
  findActiveHref,
  type NavItem,
} from '@/components/layout/nav-config';

interface BadgeCounts {
  unread_notifications: number;
  pending_tasks: number;
  overdue_followups: number;
  overdue_invoices: number;
  assistant_suggestions: number;
}

type RawCounts = Record<string, number | undefined>;

function toBadgeCounts(data: RawCounts, loose: boolean): BadgeCounts {
  return {
    unread_notifications:
      data.unreadNotifications ?? data.unread_notifications ?? (loose ? data.notifications : undefined) ?? 0,
    pending_tasks: data.pendingTasks ?? data.pending_tasks ?? (loose ? data.tasks : undefined) ?? 0,
    overdue_followups:
      data.overdueFollowups ?? data.overdue_followups ?? (loose ? data.followUps : undefined) ?? 0,
    overdue_invoices: data.overdueInvoices ?? data.overdue_invoices ?? 0,
    assistant_suggestions: 0,
  };
}

function useBadgeCounts() {
  const [counts, setCounts] = React.useState<BadgeCounts | null>(null);
  const [assistantPending, setAssistantPending] = React.useState(0);

  // Suggestions waiting for this user; kept apart from the notification counts, which arrive over their own channel.
  const fetchAssistant = React.useCallback(async () => {
    try {
      const res = await assistantApi.pendingCount();
      setAssistantPending(res.data?.pending ?? 0);
    } catch {
      // Non-critical
    }
  }, []);
  React.useEffect(() => { fetchAssistant(); }, [fetchAssistant]);
  useRealtimeEvent('assistant:suggestion', () => { fetchAssistant(); });

  const fetchCounts = React.useCallback(async () => {
    try {
      const res = await notificationsApi.getBadgeCounts();
      if (res && 'data' in res && res.data) {
        setCounts(toBadgeCounts(res.data as unknown as RawCounts, true));
      }
    } catch {
      // Non-critical
    }
  }, []);

  // Initial fetch
  React.useEffect(() => { fetchCounts(); }, [fetchCounts]);

  // Pages that change read/delete state (e.g. Notifications) ask for a refresh
  React.useEffect(() => {
    window.addEventListener('badge-counts:refresh', fetchCounts);
    return () => window.removeEventListener('badge-counts:refresh', fetchCounts);
  }, [fetchCounts]);

  // Real-time updates via WebSocket
  useRealtimeEvent('badge_counts:update', (data) => {
    if (data) {
      setCounts(toBadgeCounts(data as RawCounts, false));
    }
  });
  // Refetch on events that affect counts
  useRealtimeEvent([
    'task:assigned', 'task:completed',
    'payment:received', 'notification:new',
  ], () => { fetchCounts(); });

  // Fallback polling if WS disconnected
  const wsConnected = useRealtimeConnected();
  React.useEffect(() => {
    if (wsConnected) return;
    const interval = setInterval(() => { fetchCounts(); fetchAssistant(); }, 90_000);
    return () => clearInterval(interval);
  }, [wsConnected, fetchCounts, fetchAssistant]);

  return counts ? { ...counts, assistant_suggestions: assistantPending } : counts;
}

function NavItemLink({
  item,
  isCollapsed,
  isActive,
  badgeCounts,
}: {
  item: NavItem;
  isCollapsed: boolean;
  isActive: boolean;
  badgeCounts: BadgeCounts | null;
}) {
  const badge = item.badgeKey && badgeCounts ? (badgeCounts[item.badgeKey] ?? 0) : 0;
  const badgeDisplay = badge > 0 ? (badge > 99 ? '99+' : badge) : null;

  const linkContent = (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      aria-label={isCollapsed ? item.title : undefined}
      className={cn(
        'group flex items-center gap-3 rounded-ds-md px-3 py-1.5 text-sm font-medium transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-ring',
        isActive
          ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        isCollapsed && 'justify-center px-2',
      )}
    >
      <item.icon
        aria-hidden="true"
        className={cn(
          'h-4 w-4 shrink-0 transition-colors',
          isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-muted-foreground',
        )}
      />
      {!isCollapsed && (
        <>
          <span className="truncate">{item.title}</span>
          {badgeDisplay && (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-ds-full bg-ds-primary px-1.5 text-xs font-bold text-ds-primary-foreground animate-pop-in">
              {badgeDisplay}
            </span>
          )}
        </>
      )}
    </Link>
  );

  if (isCollapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2">
          {item.title}
          {badgeDisplay && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-ds-full bg-ds-primary px-1.5 text-xs font-bold text-ds-primary-foreground">
              {badgeDisplay}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return linkContent;
}

/** Icon-only link used in the compact footer (Help, Settings). */
function FooterIconLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <Link
          href={item.href}
          aria-label={item.title}
          aria-current={isActive ? 'page' : undefined}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-ds-md transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-ring',
            isActive
              ? 'bg-primary/10 text-primary dark:bg-primary/20'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <item.icon aria-hidden="true" className="h-4 w-4" />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{item.title}</TooltipContent>
    </Tooltip>
  );
}

function SidebarUserMenu({ isCollapsed }: { isCollapsed: boolean }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const email = user?.email ?? '';
  const displayName = user?.name?.trim() || email.split('@')[0] || 'User';
  const initials = getInitials(displayName) || 'U';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${displayName}`}
          data-testid="sidebar-user-menu"
          className={cn(
            'flex w-full items-center gap-3 rounded-ds-md px-2 py-1.5 text-left transition-colors hover:bg-muted',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-ring',
            isCollapsed && 'justify-center px-0',
          )}
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ds-full bg-primary/10 text-xs font-semibold text-primary"
          >
            {initials}
          </span>
          {!isCollapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-sidebar-foreground">{displayName}</span>
                {email && <span className="block truncate text-xs text-muted-foreground">{email}</span>}
              </span>
              <ChevronsUpDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={isCollapsed ? 'right' : 'top'}
        align={isCollapsed ? 'end' : 'start'}
        className="w-56"
      >
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium">{displayName}</span>
          {email && <span className="block truncate text-xs text-muted-foreground">{email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/settings/profile')}>
          <UserRound aria-hidden="true" /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push('/help')}>
          <HelpCircle aria-hidden="true" /> Help Center
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push('/settings')}>
          <Settings aria-hidden="true" /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive"
          onSelect={() => {
            useAuthStore.getState().logout();
            window.location.href = '/login';
          }}
        >
          <LogOut aria-hidden="true" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Sidebar() {
  const { isCollapsed, toggle } = useSidebarStore();
  const pathname = usePathname();
  const badgeCounts = useBadgeCounts();
  const { isElectron } = useElectron();

  const activeHref = React.useMemo(() => findActiveHref(pathname), [pathname]);

  // macOS draws its window buttons over the top-left corner of the sidebar.
  const insetForWindowButtons =
    isElectron && typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

  return (
    <TooltipProvider>
      <aside
        aria-label="Primary"
        className={cn(
          'relative flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          isCollapsed ? 'w-16' : 'w-60',
        )}
      >
        {insetForWindowButtons && <div aria-hidden="true" className="h-7 shrink-0 electron-drag" />}

        {/* Logo */}
        <div className={cn('flex h-12 shrink-0 items-center border-b border-sidebar-border px-4 gap-3', isCollapsed && 'justify-center px-2')}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ds-md bg-ds-primary text-sm font-bold text-ds-primary-foreground shadow-sm">
            T
          </div>
          {!isCollapsed && (
            <div className="animate-fade-in flex items-baseline gap-0.5">
              <span className="font-semibold text-base tracking-tight text-sidebar-foreground" style={{ fontFamily: 'var(--font-display)' }}>TravelCRM</span>
              <span className="font-normal text-xs text-muted-foreground tracking-wide">Pro</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <ScrollArea className="min-h-0 flex-1 px-3 py-3">
          <nav aria-label="Main" className="space-y-4">
            {navigation.map((group) => (
              <div key={group.label}>
                {!isCollapsed && (
                  <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavItemLink
                      key={item.href}
                      item={item}
                      isCollapsed={isCollapsed}
                      isActive={activeHref === item.href}
                      badgeCounts={badgeCounts}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* Compact footer: shortcuts, connection state, signed-in user */}
        <div className="shrink-0 space-y-1 border-t border-sidebar-border p-2">
          <div className={cn('flex items-center gap-1 px-1', isCollapsed ? 'flex-col' : 'justify-between')}>
            <div className={cn('flex items-center gap-1', isCollapsed && 'flex-col')}>
              {bottomNav.map((item) => (
                <FooterIconLink key={item.href} item={item} isActive={activeHref === item.href} />
              ))}
            </div>
            <ConnectionStatus />
          </div>
          <SidebarUserMenu isCollapsed={isCollapsed} />
        </div>

        {/* Collapse Toggle */}
        <button
          type="button"
          onClick={toggle}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!isCollapsed}
          className={cn(
            'absolute -right-3 top-16 z-10 flex h-6 w-6 items-center justify-center rounded-ds-full border border-border bg-card shadow-sm hover:shadow-md transition-all',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-ring',
            'active:scale-90',
          )}
        >
          {isCollapsed ? (
            <ChevronRight aria-hidden="true" className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronLeft aria-hidden="true" className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
      </aside>
    </TooltipProvider>
  );
}
