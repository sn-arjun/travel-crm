'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  FileText,
  Calendar,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
  Map,
  Receipt,
  BarChart3,
  Building2,
  HelpCircle,
  Bell,
  Truck,
  Phone,
  Megaphone,
  PackageSearch,
  CreditCard,
  CheckSquare,
  Stamp,
  Inbox,
  ClipboardList,
  Upload,
  Bookmark,
  Bot,
  Sparkles,
  UserCheck,
  Tag,
  Palette,
  CalendarClock,
  Plane,
  Send,
  ScanSearch,
  Lightbulb,
  Target,
  ScanLine,
  BellRing,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/stores/sidebar-store';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { notificationsApi } from '@/lib/api/notifications';
import { useRealtimeEvent, useRealtimeConnected } from '@/hooks/use-realtime-event';
import { ConnectionStatus } from '@/components/layout/connection-status';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeKey?: 'unread_notifications' | 'pending_tasks' | 'overdue_followups' | 'overdue_invoices';
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navigation: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { title: 'Calendar', href: '/calendar', icon: Calendar },
      { title: 'Tasks', href: '/tasks', icon: CheckSquare, badgeKey: 'pending_tasks' },
    ],
  },
  {
    label: 'CRM',
    items: [
      { title: 'Leads', href: '/leads', icon: Briefcase, badgeKey: 'overdue_followups' },
      { title: 'Contacts', href: '/contacts', icon: Users },
    ],
  },
  {
    label: 'Operations',
    items: [
      { title: 'Fleet', href: '/fleet', icon: Truck },
      { title: 'Itineraries', href: '/itineraries', icon: Map },
      { title: 'Itinerary Templates', href: '/itineraries/templates', icon: Bookmark },
      { title: 'Rate Cards', href: '/rate-cards', icon: Tag },
      { title: 'Suppliers', href: '/suppliers', icon: PackageSearch },
      { title: 'Accounts (Suppliers view)', href: '/accounts', icon: Building2 },
      { title: 'Rate Comparison', href: '/suppliers/compare', icon: BarChart3 },
      { title: 'Visa & Travellers', href: '/visa', icon: Stamp },
      { title: 'Vouchers', href: '/vouchers', icon: ClipboardList },
    ],
  },
  {
    label: 'Revenue',
    items: [
      { title: 'Invoices', href: '/invoices', icon: Receipt, badgeKey: 'overdue_invoices' },
      { title: 'Payments', href: '/payments', icon: CreditCard },
      { title: 'Credit Notes', href: '/credit-notes', icon: FileText },
      { title: 'Debit Notes', href: '/debit-notes', icon: FileText },
    ],
  },
  {
    label: 'Communication',
    items: [
      { title: 'Inbox', href: '/communication', icon: Inbox },
      { title: 'Call Log', href: '/communication/calls', icon: Phone },
      { title: 'Templates', href: '/communication/templates', icon: MessageSquare },
      { title: 'Bulk Send', href: '/communication/bulk-send', icon: Send },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { title: 'Reports', href: '/reports', icon: BarChart3 },
      { title: 'AI Assistant', href: '/ai', icon: Sparkles },
      { title: 'AI Extractions', href: '/ai/extractions', icon: ScanSearch },
      { title: 'AI Insights', href: '/ai/insights', icon: Lightbulb },
      { title: 'AI Lead Scoring', href: '/ai/lead-score', icon: Target },
      { title: 'AI Document Scans', href: '/ai/document-scans', icon: ScanLine },
      { title: 'AI OCR', href: '/ai/ocr', icon: ScanSearch },
      { title: 'AI Smart Follow-ups', href: '/ai/smart-followups', icon: BellRing },
      { title: 'Chatbot', href: '/chatbot', icon: Bot },
      { title: 'Notifications', href: '/notifications', icon: Bell, badgeKey: 'unread_notifications' },
      { title: 'Documents', href: '/documents', icon: FileText },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { title: 'Dashboard', href: '/marketing', icon: LayoutDashboard },
      { title: 'Campaigns', href: '/marketing/campaigns', icon: Megaphone },
      { title: 'Segments', href: '/marketing/segments', icon: Users },
      { title: 'Flyers', href: '/marketing/flyers', icon: Palette },
      { title: 'Branding', href: '/marketing/branding', icon: Palette },
      { title: 'Festival Offers', href: '/marketing/festivals', icon: CalendarClock },
      { title: 'Opted-Out', href: '/marketing/opted-out', icon: UserCheck },
      { title: 'Social Content', href: '/marketing/social', icon: Megaphone },
    ],
  },
  {
    label: 'Tools',
    items: [
      { title: 'Follow-ups', href: '/follow-ups', icon: CalendarClock },
      { title: 'Import / Export', href: '/import', icon: Upload },
      { title: 'Bookmarks', href: '/bookmarks', icon: Bookmark },
    ],
  },
];

const bottomNav: NavItem[] = [
  { title: 'Help Center', href: '/help', icon: HelpCircle },
  { title: 'Settings', href: '/settings', icon: Settings },
];

interface BadgeCounts {
  unread_notifications: number;
  pending_tasks: number;
  overdue_followups: number;
  overdue_invoices: number;
}

function useBadgeCounts() {
  const [counts, setCounts] = React.useState<BadgeCounts | null>(null);

  const fetchCounts = React.useCallback(async () => {
    try {
      const res = await notificationsApi.getBadgeCounts();
      if (res && 'data' in res && res.data) {
        const data = res.data as any;
        setCounts({
          unread_notifications: data.unread_notifications ?? data.notifications ?? 0,
          pending_tasks: data.pending_tasks ?? data.tasks ?? 0,
          overdue_followups: data.overdue_followups ?? data.followUps ?? 0,
          overdue_invoices: data.overdue_invoices ?? 0,
        });
      }
    } catch {
      // Non-critical
    }
  }, []);

  // Initial fetch
  React.useEffect(() => { fetchCounts(); }, [fetchCounts]);

  // Real-time updates via WebSocket
  useRealtimeEvent('badge_counts:update', (data) => {
    if (data) {
      setCounts({
        unread_notifications: data.unreadNotifications ?? data.unread_notifications ?? 0,
        pending_tasks: data.pendingTasks ?? data.pending_tasks ?? 0,
        overdue_followups: data.overdueFollowups ?? data.overdue_followups ?? 0,
        overdue_invoices: data.overdueInvoices ?? data.overdue_invoices ?? 0,
      });
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
    const interval = setInterval(fetchCounts, 90_000);
    return () => clearInterval(interval);
  }, [wsConnected, fetchCounts]);

  return counts;
}

function NavItemLink({ item, isCollapsed, badgeCounts }: { item: NavItem; isCollapsed: boolean; badgeCounts: BadgeCounts | null }) {
  const pathname = usePathname();
  const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');

  const badge = item.badgeKey && badgeCounts ? (badgeCounts[item.badgeKey] ?? 0) : 0;
  const badgeDisplay = badge > 0 ? (badge > 99 ? '99+' : badge) : null;

  const linkContent = (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] font-medium transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isActive
          ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        isCollapsed && 'justify-center px-2',
      )}
    >
      <item.icon
        className={cn(
          'h-4 w-4 shrink-0 transition-colors',
          isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-muted-foreground',
        )}
      />
      {!isCollapsed && (
        <>
          <span className="truncate">{item.title}</span>
          {badgeDisplay && (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white animate-pop-in">
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
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">
              {badgeDisplay}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return linkContent;
}

export function Sidebar() {
  const { isCollapsed, toggle } = useSidebarStore();
  const badgeCounts = useBadgeCounts();

  return (
    <TooltipProvider>
      <aside
        className={cn(
          'relative flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          isCollapsed ? 'w-[var(--sidebar-collapsed)]' : 'w-[240px]',
        )}
      >
        {/* Logo */}
        <div className={cn('flex h-14 items-center border-b border-sidebar-border px-4 gap-3', isCollapsed && 'justify-center px-2')}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary-400 via-primary-500 to-primary-600 text-white font-bold text-sm shadow-sm">
            T
          </div>
          {!isCollapsed && (
            <div className="animate-fade-in flex items-baseline gap-0.5">
              <span className="font-semibold text-[15px] tracking-tight text-sidebar-foreground" style={{ fontFamily: 'var(--font-display)' }}>TravelCRM</span>
              <span className="font-normal text-xs text-muted-foreground tracking-wide">Pro</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <ScrollArea className="min-h-0 flex-1 px-3 py-4">
          <nav className="space-y-6">
            {navigation.map((group: any) => (
              <div key={group.label}>
                {!isCollapsed && (
                  <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item: any) => (
                    <NavItemLink key={item.href} item={item} isCollapsed={isCollapsed} badgeCounts={badgeCounts} />
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* Bottom Nav */}
        <div className="border-t border-sidebar-border px-3 py-3 space-y-0.5">
          {bottomNav.map((item: any) => (
            <NavItemLink key={item.href} item={item} isCollapsed={isCollapsed} badgeCounts={badgeCounts} />
          ))}
          <ConnectionStatus />
        </div>

        {/* User Profile Area */}
        {!isCollapsed && (
          <div className="border-t border-sidebar-border px-3 py-3">
            <div className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted transition-colors cursor-pointer">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                AS
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-sidebar-foreground truncate">Arjun S</p>
                <p className="text-[11px] text-muted-foreground truncate">arjun@travelcrm.io</p>
              </div>
            </div>
          </div>
        )}

        {/* Collapse Toggle */}
        <button
          onClick={toggle}
          className={cn(
            'absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card shadow-sm hover:shadow-md transition-all',
            'active:scale-90',
          )}
        >
          {isCollapsed ? (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronLeft className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
      </aside>
    </TooltipProvider>
  );
}
