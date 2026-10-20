'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Building2, CreditCard, Globe,
  ScrollText, Activity, BarChart3, Tags,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tenants', label: 'Tenants', icon: Building2 },
  { href: '/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { href: '/catalogue', label: 'Plans & Pricing', icon: Tags },
  { href: '/reports', label: 'Platform Reports', icon: BarChart3 },
  { href: '/wordpress', label: 'WordPress', icon: Globe },
  { href: '/audit-log', label: 'Audit Log', icon: ScrollText },
  { href: '/system-health', label: 'System Health', icon: Activity },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r bg-card h-full flex flex-col">
      <div className="p-6 border-b">
        <h1 className="text-xl font-bold tracking-tight">TravelCRM Admin</h1>
        <p className="text-xs text-muted-foreground mt-1">Super Admin Portal</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t text-xs text-muted-foreground">
        v1.0.0
      </div>
    </aside>
  );
}
