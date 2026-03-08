'use client';

import * as React from 'react';
import {
  Users,
  TrendingUp,
  FileText,
  CheckSquare,
  Calendar,
  DollarSign,
  ArrowUpRight,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/stores/auth-store';
import { useApiQuery } from '@/hooks/use-api';
import { client, type ApiResponse } from '@/lib/api/client';

interface DashboardStats {
  totalLeads: number;
  totalContacts: number;
  openTasks: number;
  pendingInvoices: number;
  upcomingEvents: number;
  revenue: number;
}

const statCards = [
  { key: 'totalLeads' as const, label: 'Total Leads', icon: TrendingUp, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30' },
  { key: 'totalContacts' as const, label: 'Contacts', icon: Users, color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30' },
  { key: 'openTasks' as const, label: 'Open Tasks', icon: CheckSquare, color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30' },
  { key: 'pendingInvoices' as const, label: 'Pending Invoices', icon: FileText, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30' },
  { key: 'upcomingEvents' as const, label: 'Upcoming Events', icon: Calendar, color: 'text-pink-600 bg-pink-100 dark:bg-pink-900/30' },
  { key: 'revenue' as const, label: 'Revenue (MTD)', icon: DollarSign, color: 'text-green-600 bg-green-100 dark:bg-green-900/30' },
];

function formatValue(key: string, value: number) {
  if (key === 'revenue') {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
  }
  return value.toLocaleString();
}

export default function DashboardPage() {
  const { user } = useAuthStore();

  const { data: statsResponse, loading } = useApiQuery(
    () => client.get<ApiResponse<DashboardStats>>('/reports/dashboard-stats').catch(() => ({
      success: true,
      data: { totalLeads: 0, totalContacts: 0, openTasks: 0, pendingInvoices: 0, upcomingEvents: 0, revenue: 0 },
    } as any)),
    [],
  );

  const stats: DashboardStats = React.useMemo(() => {
    if (!statsResponse || !('data' in statsResponse)) {
      return { totalLeads: 0, totalContacts: 0, openTasks: 0, pendingInvoices: 0, upcomingEvents: 0, revenue: 0 };
    }
    return (statsResponse as any).data ?? { totalLeads: 0, totalContacts: 0, openTasks: 0, pendingInvoices: 0, upcomingEvents: 0, revenue: 0 };
  }, [statsResponse]);

  const greeting = React.useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {greeting}, {user?.name?.split(' ')[0] || 'there'}
        </h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s what&apos;s happening with your travel business today.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {statCards.map(({ key, label, icon: Icon, color }) => (
            <Card key={key} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatValue(key, stats[key])}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: 'Add new lead', href: '/leads' },
              { label: 'Create invoice', href: '/invoices' },
              { label: 'Schedule event', href: '/planner' },
              { label: 'View reports', href: '/reports' },
            ].map(({ label, href }) => (
              <a
                key={href}
                href={href}
                className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent transition-colors"
              >
                <span className="text-sm font-medium">{label}</span>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </a>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg">
                {(user?.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div>
                <p className="font-medium">{user?.name || 'User'}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Role:</span>{' '}
                <span className="capitalize font-medium">{user?.role?.replace('_', ' ') || 'N/A'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Department:</span>{' '}
                <span className="font-medium">{(user as any)?.department || 'N/A'}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
