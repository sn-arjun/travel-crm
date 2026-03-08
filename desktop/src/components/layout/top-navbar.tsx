'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Search, Bell, Moon, Sun, Command,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useApiQuery } from '@/hooks/use-api';
import { notificationsApi } from '@/lib/api/notifications';
import { useAuthStore } from '@/stores/auth-store';

function getPageTitle(pathname: string): string {
  const titles: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/leads': 'Leads',
    '/contacts': 'Contacts',
    '/accounts': 'Accounts & Suppliers',
    '/itineraries': 'Itineraries',
    '/invoices': 'Invoices',
    '/payments': 'Payments',
    '/tasks': 'Tasks',
    '/calendar': 'Calendar',
    '/fleet': 'Fleet Management',
    '/suppliers': 'Suppliers',
    '/rate-cards': 'Rate Cards',
    '/visa': 'Visa & Travellers',
    '/vouchers': 'Vouchers',
    '/communication': 'Inbox',
    '/campaigns': 'Campaigns',
    '/reports': 'Reports',
    '/ai': 'AI Assistant',
    '/chatbot': 'Chatbot',
    '/notifications': 'Notifications',
    '/documents': 'Documents',
    '/bookmarks': 'Bookmarks',
    '/follow-ups': 'Follow-ups',
    '/settings': 'Settings',
    '/marketing': 'Marketing',
  };

  for (const [path, title] of Object.entries(titles)) {
    if (pathname === path || pathname.startsWith(path + '/')) return title;
  }
  return '';
}

export function TopNavbar() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const [theme, setTheme] = React.useState<'light' | 'dark'>('light');

  const { data: unreadResponse } = useApiQuery(
    () => notificationsApi.getUnreadCount(),
    [],
  );

  const unreadCount = (unreadResponse as any)?.data?.count ?? (unreadResponse as any)?.data ?? 0;

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <header className="flex items-center justify-between h-12 px-6 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0">
      <div className="flex items-center gap-4">
        <h2 className="text-sm font-semibold text-foreground">{getPageTitle(pathname)}</h2>
      </div>

      <div className="flex items-center gap-2">
        {/* Search shortcut hint */}
        <Button variant="outline" size="sm" className="h-8 gap-2 text-muted-foreground text-xs hidden md:flex" onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}>
          <Search className="h-3.5 w-3.5" />
          <span>Search...</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </Button>

        {/* Theme toggle */}
        <Button variant="ghost" size="icon-sm" onClick={toggleTheme} className="h-8 w-8">
          {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>

        {/* Notifications */}
        <Link href="/notifications">
          <Button variant="ghost" size="icon-sm" className="h-8 w-8 relative">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Button>
        </Link>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 gap-2 px-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{initials}</AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium hidden md:inline">{user?.name || 'User'}</span>
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
