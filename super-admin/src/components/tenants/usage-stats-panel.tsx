'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/shared/stat-card';
import { RefreshCw, Users, Target, BookUser, FileText, Receipt, HardDrive, Activity } from 'lucide-react';
import { UsageTrendChart } from './usage-trend-chart';

interface UsageData {
  usage: {
    users: number;
    leads: number;
    contacts: number;
    itineraries: number;
    invoices: number;
    total_payments: number;
    storage_mb: number;
    api_calls: number;
  };
  limits: {
    users: number;
    leads: number;
    storage_gb: number;
  };
  plan: string;
  trend: Array<{
    snapshot_date: string;
    leads_count: number;
    contacts_count: number;
    invoices_count: number;
    users_count: number;
  }>;
}

interface UsageStatsPanelProps {
  tenantId: string;
}

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const isUnlimited = limit === -1;
  const pct = isUnlimited ? 0 : limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const isWarning = !isUnlimited && pct >= 80;
  const isDanger = !isUnlimited && pct >= 95;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {used.toLocaleString()} / {isUnlimited ? 'Unlimited' : limit.toLocaleString()}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isDanger ? 'bg-red-500' : isWarning ? 'bg-yellow-500' : 'bg-green-500'
          }`}
          style={{ width: isUnlimited ? '5%' : `${pct}%` }}
        />
      </div>
      {isDanger && (
        <p className="text-xs text-red-500 font-medium">Approaching limit! ({Math.round(pct)}% used)</p>
      )}
      {isWarning && !isDanger && (
        <p className="text-xs text-yellow-600 font-medium">High usage ({Math.round(pct)}%)</p>
      )}
    </div>
  );
}

export function UsageStatsPanel({ tenantId }: UsageStatsPanelProps) {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchUsage = useCallback(async () => {
    const res = await fetch(`/api/tenants/${tenantId}/usage`);
    const json = await res.json() as UsageData;
    setData(json);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetch(`/api/tenants/${tenantId}/usage`, { method: 'POST' });
    await fetchUsage();
    setRefreshing(false);
  };

  if (loading || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">Loading usage data...</CardContent>
      </Card>
    );
  }

  const { usage, limits, plan, trend } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="capitalize">{plan} Plan</Badge>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh Snapshot'}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Users" value={usage.users} icon={<Users className="h-4 w-4" />} />
        <StatCard title="Leads" value={usage.leads} icon={<Target className="h-4 w-4" />} />
        <StatCard title="Contacts" value={usage.contacts} icon={<BookUser className="h-4 w-4" />} />
        <StatCard title="Itineraries" value={usage.itineraries} icon={<FileText className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Invoices" value={usage.invoices} icon={<Receipt className="h-4 w-4" />} />
        <StatCard
          title="Payments"
          value={`₹${(usage.total_payments || 0).toLocaleString('en-IN')}`}
          icon={<Receipt className="h-4 w-4" />}
        />
        <StatCard title="Storage" value={`${usage.storage_mb} MB`} icon={<HardDrive className="h-4 w-4" />} />
        <StatCard title="API Calls" value={usage.api_calls} icon={<Activity className="h-4 w-4" />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan Limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <UsageBar used={usage.users} limit={limits.users} label="Users" />
          <UsageBar used={usage.leads} limit={limits.leads} label="Leads" />
          <UsageBar
            used={usage.storage_mb}
            limit={limits.storage_gb === -1 ? -1 : limits.storage_gb * 1024}
            label="Storage (MB)"
          />
        </CardContent>
      </Card>

      {trend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage Trend (30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <UsageTrendChart data={trend} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
