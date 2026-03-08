'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useApiQuery } from '@/hooks/use-api';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { toast } from 'sonner';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Users, Building2, TrendingUp, Activity, RefreshCw } from 'lucide-react';

interface DashboardStats {
  totalTenants: number;
  activeUsers: number;
  totalRevenue: number;
  platformHealth: number;
  recentSignups: { date: string; count: number }[];
  tenantBreakdown: { name: string; value: number }[];
  revenueByPlan: { plan: string; revenue: number }[];
}

export default function SuperAdminDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: stats, loading, error, refetch } = useApiQuery<DashboardStats>(
    async () => {
      const response = await client.get<{ data: DashboardStats }>(API_ENDPOINTS.admin.dashboard);
      return response.data;
    },
    [refreshKey],
  );

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Error Loading Dashboard</h1>
          <p className="text-gray-600 mt-2">{error.message}</p>
        </div>
        <Button onClick={handleRefresh}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Platform Dashboard</h1>
          <p className="text-gray-600 mt-1">SaaS Administration & Analytics</p>
        </div>
        <Button onClick={handleRefresh} disabled={loading} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total Tenants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{loading ? '-' : stats?.totalTenants ?? 0}</p>
                <p className="text-xs text-gray-500">SaaS Customers</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Active Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{loading ? '-' : stats?.activeUsers ?? 0}</p>
                <p className="text-xs text-gray-500">Across All Tenants</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">${loading ? '-' : (stats?.totalRevenue ?? 0).toLocaleString()}</p>
                <p className="text-xs text-gray-500">All Time</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Platform Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Activity className="w-8 h-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{loading ? '-' : `${stats?.platformHealth ?? 0}%`}</p>
                <p className="text-xs text-gray-500">System Status</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Signups */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Signups</CardTitle>
            <CardDescription>New tenant registrations over time</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-64 flex items-center justify-center text-gray-400">Loading...</div>
            ) : stats?.recentSignups && stats.recentSignups.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={stats.recentSignups}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="count" stroke="#3b82f6" name="New Tenants" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-400">No data available</div>
            )}
          </CardContent>
        </Card>

        {/* Revenue by Plan */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Plan</CardTitle>
            <CardDescription>Distribution across subscription tiers</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-64 flex items-center justify-center text-gray-400">Loading...</div>
            ) : stats?.revenueByPlan && stats.revenueByPlan.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={stats.revenueByPlan} dataKey="revenue" nameKey="plan" cx="50%" cy="50%" outerRadius={80} label>
                    {stats.revenueByPlan.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444'][index % 4]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-400">No data available</div>
            )}
          </CardContent>
        </Card>

        {/* Tenant Breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tenant Breakdown by Status</CardTitle>
            <CardDescription>Tenants distribution across active states</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-64 flex items-center justify-center text-gray-400">Loading...</div>
            ) : stats?.tenantBreakdown && stats.tenantBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.tenantBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" fill="#3b82f6" name="Tenant Count" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-400">No data available</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Navigate to management sections</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <a href="/super-admin/tenants" className="block p-4 border rounded-lg hover:bg-gray-50 transition">
              <Building2 className="w-6 h-6 mb-2 text-blue-500" />
              <p className="font-semibold text-sm">Manage Tenants</p>
              <p className="text-xs text-gray-500">View & edit tenants</p>
            </a>
            <a href="/super-admin/users" className="block p-4 border rounded-lg hover:bg-gray-50 transition">
              <Users className="w-6 h-6 mb-2 text-green-500" />
              <p className="font-semibold text-sm">All Users</p>
              <p className="text-xs text-gray-500">Cross-tenant users</p>
            </a>
            <a href="/super-admin/plans" className="block p-4 border rounded-lg hover:bg-gray-50 transition">
              <TrendingUp className="w-6 h-6 mb-2 text-purple-500" />
              <p className="font-semibold text-sm">Plans & Pricing</p>
              <p className="text-xs text-gray-500">Manage subscriptions</p>
            </a>
            <a href="/super-admin/billing" className="block p-4 border rounded-lg hover:bg-gray-50 transition">
              <Activity className="w-6 h-6 mb-2 text-yellow-500" />
              <p className="font-semibold text-sm">Billing</p>
              <p className="text-xs text-gray-500">Revenue & invoices</p>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
