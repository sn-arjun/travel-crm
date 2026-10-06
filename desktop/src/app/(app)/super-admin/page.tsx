'use client';

import { Building2, Users, TrendingUp, Activity } from 'lucide-react';
import { StatCard } from '@/components/domain';
import { LineChart, BarChart, PieChart } from '@/components/ui/chart';
import { PageHeader } from '@/components/ui/page-header';
import { useApiQuery } from '@/hooks/use-api';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { PageContainer } from '@/components/layout/page-container';

interface DashboardStats {
  totalTenants: number;
  activeUsers: number;
  totalRevenue: number;
  platformHealth: number;
  recentSignups: { date: string; count: number }[];
  tenantBreakdown: { name: string; value: number }[];
  revenueByPlan: { plan: string; revenue: number }[];
}

function SuperAdminDashboardContent() {
  const { data: stats, loading } = useApiQuery<DashboardStats>(async () => {
    const response = await client.get<{ data: DashboardStats }>(API_ENDPOINTS.admin.dashboard);
    return response.data;
  }, []);

  return (
    <div className="flex flex-col gap-ds-6">
      <PageHeader title="Platform dashboard" description="SaaS administration & analytics across every tenant." />

      <div className="grid grid-cols-1 gap-ds-4 md:grid-cols-4">
        <StatCard title="Total tenants" value={stats?.totalTenants ?? 0} icon={<Building2 />} loading={loading} />
        <StatCard title="Active users" value={stats?.activeUsers ?? 0} icon={<Users />} loading={loading} />
        <StatCard
          title="Total revenue"
          value={(stats?.totalRevenue ?? 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
          icon={<TrendingUp />}
          loading={loading}
        />
        <StatCard title="Platform health" value={`${stats?.platformHealth ?? 0}%`} icon={<Activity />} loading={loading} />
      </div>

      <div className="grid grid-cols-1 gap-ds-4 lg:grid-cols-2">
        <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-ds-4">
          <h3 className="mb-ds-3 text-sm font-semibold text-ds-foreground">Recent signups</h3>
          <LineChart
            data={stats?.recentSignups ?? []}
            categoryKey="date"
            series={[{ dataKey: 'count', label: 'New tenants' }]}
            loading={loading}
            emptyMessage="No signups in the last 30 days"
          />
        </div>

        <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-ds-4">
          <h3 className="mb-ds-3 text-sm font-semibold text-ds-foreground">Revenue by plan</h3>
          <PieChart
            data={stats?.revenueByPlan ?? []}
            dataKey="revenue"
            nameKey="plan"
            loading={loading}
            emptyMessage="No revenue recorded yet"
          />
        </div>

        <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-ds-4 lg:col-span-2">
          <h3 className="mb-ds-3 text-sm font-semibold text-ds-foreground">Tenant breakdown by status</h3>
          <BarChart
            data={stats?.tenantBreakdown ?? []}
            categoryKey="name"
            series={[{ dataKey: 'value', label: 'Tenants' }]}
            loading={loading}
            emptyMessage="No tenants yet"
          />
        </div>
      </div>
    </div>
  );
}

export default function SuperAdminDashboard() {
  return (
    <PageContainer>
      <SuperAdminDashboardContent />
    </PageContainer>
  );
}
