'use client';

import { useEffect, useState, useCallback } from 'react';
import { StatCard } from '@/components/shared/stat-card';
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton';
import { RecentActivityFeed } from '@/components/dashboard/recent-activity-feed';
import { TopTenantsTable } from '@/components/dashboard/top-tenants-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Building2,
  Users,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  UserCheck,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface DashboardData {
  stats: {
    tenantStats: { total: number; active: number; trial: number; expired: number };
    revenueStats: { mrr: number; total_revenue: number };
    planDistribution: { plan: string; count: number }[];
    growthRate: number;
    churnRate: number;
  };
  growth: { month: string; count: number }[];
  revenue: { month: string; amount: number }[];
  activities: { id: string; action: string; description: string; timestamp: string; actor: string }[];
  topTenants: { id: string; company_name: string; plan: string; status: string; user_count: number }[];
}

const PIE_COLORS = ['#2563eb', '#16a34a', '#eab308', '#dc2626', '#8b5cf6'];

const planLabels: Record<string, string> = {
  trial: 'Free Trial',
  basic: 'Starter',
  pro: 'Professional',
  enterprise: 'Enterprise',
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [stats, growth, revenue, activity, topTenants] = await Promise.all([
        fetch('/api/dashboard/stats').then((r) => r.json()) as Promise<DashboardData['stats']>,
        fetch('/api/dashboard/growth').then((r) => r.json()) as Promise<{ months: DashboardData['growth'] }>,
        fetch('/api/dashboard/revenue').then((r) => r.json()) as Promise<{ months: DashboardData['revenue'] }>,
        fetch('/api/dashboard/recent-activity').then((r) => r.json()) as Promise<{ activities: DashboardData['activities'] }>,
        fetch('/api/dashboard/top-tenants').then((r) => r.json()) as Promise<{ tenants: DashboardData['topTenants'] }>,
      ]);

      setData({
        stats,
        growth: growth.months || [],
        revenue: revenue.months || [],
        activities: activity.activities || [],
        topTenants: topTenants.tenants || [],
      });
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000); // Auto-refresh every 5 min
    return () => clearInterval(interval);
  }, [fetchData]);

  if (!data) return <DashboardSkeleton />;

  const { stats, growth, revenue, activities, topTenants } = data;
  const pieData = stats.planDistribution.map((d) => ({
    name: planLabels[d.plan] || d.plan,
    value: d.count,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>

      {/* Tenant Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Tenants"
          value={stats.tenantStats.total}
          icon={<Building2 className="h-4 w-4" />}
          trend={{ value: stats.growthRate, label: 'from last month' }}
        />
        <StatCard
          title="Active Tenants"
          value={stats.tenantStats.active}
          icon={<UserCheck className="h-4 w-4" />}
        />
        <StatCard
          title="Trial Tenants"
          value={stats.tenantStats.trial}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          title="Expired / Suspended"
          value={stats.tenantStats.expired}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </div>

      {/* Revenue Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Monthly Revenue (MRR)"
          value={`₹${stats.revenueStats.mrr.toLocaleString('en-IN')}`}
          icon={<CreditCard className="h-4 w-4" />}
        />
        <StatCard
          title="Total Revenue (All-time)"
          value={`₹${stats.revenueStats.total_revenue.toLocaleString('en-IN')}`}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          title="Churn Rate (30d)"
          value={`${stats.churnRate}%`}
          icon={<AlertTriangle className="h-4 w-4" />}
          description="Cancelled in last 30 days"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tenant Growth (Last 12 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={growth}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="New Tenants"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Revenue (Last 12 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={revenue}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(val) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Revenue']} />
                <Bar dataKey="amount" fill="#16a34a" radius={[4, 4, 0, 0]} name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Activity + Plan Distribution + Top Tenants */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentActivityFeed activities={activities} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plan Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {pieData.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No plan data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Tenants</CardTitle>
          </CardHeader>
          <CardContent>
            <TopTenantsTable tenants={topTenants} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
