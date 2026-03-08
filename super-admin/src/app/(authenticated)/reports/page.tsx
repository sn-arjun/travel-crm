'use client';

import { useEffect, useState, useCallback } from 'react';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Target, Users, Receipt, DollarSign, Download } from 'lucide-react';

interface PlatformSummary {
  total_leads: number;
  total_contacts: number;
  total_users: number;
  total_invoices: number;
  avg_leads_per_tenant: number;
  tenant_count: number;
  total_revenue: number;
  by_status: Record<string, number>;
  by_plan: Record<string, number>;
}

interface FeatureUsage {
  feature: string;
  enabled_count: number;
  total_tenants: number;
  adoption_pct: number;
}

interface GeoRow {
  country: string;
  tenant_count: number;
  active_count: number;
}

const FEATURE_LABELS: Record<string, string> = {
  fleet_management: 'Fleet Mgmt',
  driver_app: 'Driver App',
  bulk_sms: 'Bulk SMS',
  bulk_whatsapp: 'Bulk WhatsApp',
  bulk_email: 'Bulk Email',
  marketing_flyers: 'Flyers',
  visa_management: 'Visa',
  supplier_management: 'Suppliers',
  advanced_reports: 'Reports',
  api_access: 'API Access',
  custom_domain: 'Custom Domain',
  white_label: 'White Label',
  priority_support: 'Priority Support',
};

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function exportCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(','),
    ...data.map((row) => headers.map((h) => String(row[h] ?? '')).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [features, setFeatures] = useState<FeatureUsage[]>([]);
  const [geo, setGeo] = useState<GeoRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [sumRes, featRes, geoRes] = await Promise.all([
      fetch('/api/reports/platform-summary').then((r) => r.json() as Promise<PlatformSummary>),
      fetch('/api/reports/feature-usage').then((r) => r.json() as Promise<{ features: FeatureUsage[] }>),
      fetch('/api/reports/geographic-distribution').then((r) => r.json() as Promise<{ distribution: GeoRow[] }>),
    ]);
    setSummary(sumRes);
    setFeatures(featRes.features || []);
    setGeo(geoRes.distribution || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const planData = summary
    ? Object.entries(summary.by_plan).map(([plan, count]) => ({ name: plan, value: count }))
    : [];

  const statusData = summary
    ? Object.entries(summary.by_status).map(([status, count]) => ({ name: status, value: count }))
    : [];

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Platform Reports' }]} />
      <h1 className="text-3xl font-bold tracking-tight">Platform Reports</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Leads" value={(summary?.total_leads || 0).toLocaleString()} icon={<Target className="h-4 w-4" />} />
        <StatCard title="Total Users" value={(summary?.total_users || 0).toLocaleString()} icon={<Users className="h-4 w-4" />} />
        <StatCard title="Total Revenue" value={`₹${(summary?.total_revenue || 0).toLocaleString('en-IN')}`} icon={<DollarSign className="h-4 w-4" />} />
        <StatCard title="Avg Leads/Tenant" value={summary?.avg_leads_per_tenant || 0} icon={<Receipt className="h-4 w-4" />} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plan Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tenants by Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={planData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {planData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tenants by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {statusData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Feature Adoption */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Feature Adoption</CardTitle>
          <Button variant="outline" size="sm" onClick={() => exportCSV(features as unknown as Record<string, unknown>[], 'feature-adoption')}>
            <Download className="mr-2 h-3.5 w-3.5" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={features.map((f) => ({ ...f, label: FEATURE_LABELS[f.feature] || f.feature }))} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis type="number" domain={[0, 100]} unit="%" className="text-xs" />
              <YAxis dataKey="label" type="category" width={120} className="text-xs" />
              <Tooltip
                formatter={(val) => [`${Number(val)}%`, 'Adoption']}
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
              />
              <Bar dataKey="adoption_pct" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Geographic Distribution */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Geographic Distribution</CardTitle>
          <Button variant="outline" size="sm" onClick={() => exportCSV(geo as unknown as Record<string, unknown>[], 'geographic-distribution')}>
            <Download className="mr-2 h-3.5 w-3.5" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-3 px-4 font-medium">Country</th>
                  <th className="text-right py-3 px-4 font-medium">Total Tenants</th>
                  <th className="text-right py-3 px-4 font-medium">Active</th>
                  <th className="text-right py-3 px-4 font-medium">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {geo.length === 0 ? (
                  <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">No data available</td></tr>
                ) : (
                  geo.map((row) => {
                    const totalAll = geo.reduce((s, r) => s + r.tenant_count, 0);
                    return (
                      <tr key={row.country} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4 font-medium">{row.country}</td>
                        <td className="py-3 px-4 text-right">{row.tenant_count}</td>
                        <td className="py-3 px-4 text-right">{row.active_count}</td>
                        <td className="py-3 px-4 text-right">{totalAll > 0 ? Math.round((row.tenant_count / totalAll) * 100) : 0}%</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
