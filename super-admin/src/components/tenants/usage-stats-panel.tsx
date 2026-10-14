'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/shared/stat-card';
import { Plus, Users, Target, BookUser, Receipt } from 'lucide-react';
import { UsageTrendChart } from './usage-trend-chart';
import { GrantAddonDialog } from '@/components/grant-addon-dialog';

interface UsageData {
  plan: string;
  status: string;
  period: string;
  seats: { used: number; limit: number };
  allowances: Record<string, { allowance: number; used: number | null; remaining: number | null }>;
  snapshot: { users_count?: number; leads_count?: number; contacts_count?: number; invoices_count?: number } | null;
  trend: Array<{
    snapshot_date: string;
    leads_count: number;
    contacts_count: number;
    invoices_count: number;
    users_count: number;
  }>;
  addons: Array<{
    id: string;
    product_key: string;
    quantity: number;
    units_granted: number;
    period_key: string | null;
    source: string;
    granted_by: string | null;
    reference: string | null;
    created_at: string;
  }>;
}

const ALLOWANCE_LABELS: Record<string, string> = {
  ai_credits: 'AI credits',
  sms: 'SMS',
  whatsapp: 'WhatsApp messages',
  otp: 'OTP messages',
  call_minutes: 'Call minutes',
  email: 'Emails',
};

function UsageBar({ used, limit, label }: { used: number | null; limit: number; label: string }) {
  const pct = used === null || limit <= 0 ? 0 : Math.min((used / limit) * 100, 100);
  const isDanger = pct >= 95;
  const isWarning = pct >= 80;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {used === null ? 'not metered' : used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isDanger ? 'bg-red-500' : isWarning ? 'bg-yellow-500' : 'bg-green-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function UsageStatsPanel({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<UsageData | null>(null);
  const [error, setError] = useState('');
  const [grantOpen, setGrantOpen] = useState(false);

  const fetchUsage = useCallback(async () => {
    const res = await fetch(`/api/tenants/${tenantId}/usage`);
    const json = (await res.json()) as UsageData & { error?: string };
    if (!res.ok) {
      setError(json.error || 'Could not load usage');
      return;
    }
    setError('');
    setData(json);
  }, [tenantId]);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  if (error) return <Card><CardContent className="py-8 text-center text-destructive">{error}</CardContent></Card>;
  if (!data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">Loading usage data...</CardContent>
      </Card>
    );
  }

  const { snapshot, trend } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="capitalize">{data.plan} plan</Badge>
          <span className="text-sm text-muted-foreground">Period {data.period}</span>
        </div>
        <Button size="sm" onClick={() => setGrantOpen(true)}>
          <Plus className="mr-2 h-3.5 w-3.5" /> Grant add-on
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Users" value={`${data.seats.used} / ${data.seats.limit}`} icon={<Users className="h-4 w-4" />} />
        <StatCard title="Leads" value={snapshot?.leads_count ?? 0} icon={<Target className="h-4 w-4" />} />
        <StatCard title="Contacts" value={snapshot?.contacts_count ?? 0} icon={<BookUser className="h-4 w-4" />} />
        <StatCard title="Invoices" value={snapshot?.invoices_count ?? 0} icon={<Receipt className="h-4 w-4" />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly allowances by channel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(data.allowances).map(([key, a]) => (
            <UsageBar key={key} used={a.used} limit={a.allowance} label={ALLOWANCE_LABELS[key] ?? key} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Granted add-ons</CardTitle>
        </CardHeader>
        <CardContent>
          {data.addons.length === 0 ? (
            <p className="text-sm text-muted-foreground">No add-ons granted yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 font-medium">Product</th>
                  <th className="text-right py-2 font-medium">Units</th>
                  <th className="text-left py-2 px-4 font-medium">Period</th>
                  <th className="text-left py-2 font-medium">Granted by</th>
                  <th className="text-left py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {data.addons.map((a) => (
                  <tr key={a.id} className="border-b">
                    <td className="py-2">{a.product_key}</td>
                    <td className="py-2 text-right">{a.units_granted.toLocaleString()}</td>
                    <td className="py-2 px-4">{a.period_key ?? 'until removed'}</td>
                    <td className="py-2">{a.granted_by ?? a.source}</td>
                    <td className="py-2 text-muted-foreground">{a.reference ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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

      <GrantAddonDialog open={grantOpen} onOpenChange={setGrantOpen} tenantId={tenantId} onGranted={fetchUsage} />
    </div>
  );
}
