'use client';

import { PLATFORM_DOMAIN } from '@/lib/domain';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { StatCard } from '@/components/shared/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, CreditCard, Ban, RotateCcw, LifeBuoy, Target, Receipt } from 'lucide-react';
import { FeatureFlagsPanel } from '@/components/tenants/feature-flags-panel';
import { UsageStatsPanel } from '@/components/tenants/usage-stats-panel';
import { AiVoipPanel } from '@/components/tenants/ai-voip-panel';
import { CallingPanel } from '@/components/tenants/calling-panel';
import { ImpersonationDialog } from '@/components/impersonation-dialog';

interface TenantDetail {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: string;
  planId: string;
  website?: string;
  createdAt: string;
  subscription: { plan: string; status: string; renewalDate?: string };
  stats: { userCount: number; contactCount: number; leadCount: number; invoiceCount: number };
}

interface Provisioning {
  slug: string;
  tenantStatus: string;
  provisioningStatus: string;
  provisioningError: string | null;
  dbBinding: string | null;
  deployNeeded: boolean;
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  trial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  suspended: 'bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  provisioning: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
};

export default function TenantDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [prov, setProv] = useState<Provisioning | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [supportOpen, setSupportOpen] = useState(false);

  const load = useCallback(async () => {
    const [detail, provisioning] = await Promise.all([
      fetch(`/api/tenants/${id}`),
      fetch(`/api/tenants/${id}/provisioning`),
    ]);
    setTenant(detail.ok ? ((await detail.json()) as TenantDetail) : null);
    setProv(provisioning.ok ? ((await provisioning.json()) as Provisioning) : null);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const act = async (path: string, body?: object) => {
    setMessage('');
    const res = await fetch(`/api/tenants/${id}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) setMessage(((await res.json()) as { error?: string }).error || 'The action failed');
    await load();
  };

  const handleSuspend = async () => {
    const reason = prompt('Reason for suspension:');
    if (!reason) return;
    await act('suspend', { reason });
  };

  const handleRetry = async () => {
    setMessage('');
    const res = await fetch(`/api/tenants/${id}/retry`, { method: 'POST' });
    if (!res.ok) setMessage(((await res.json()) as { error?: string }).error || 'Retry failed');
    await load();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (!tenant) {
    return <div className="p-8 text-center text-muted-foreground">Tenant not found</div>;
  }

  const status = prov?.tenantStatus ?? tenant.status;
  const live = status === 'active' || status === 'trial';

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { label: 'Tenants', href: '/tenants' },
        { label: tenant.name },
      ]} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{tenant.name}</h1>
          <p className="text-muted-foreground">{prov?.slug ? `${prov.slug}.${PLATFORM_DOMAIN}` : tenant.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={statusColors[status] || ''}>{status}</Badge>
          {live && (
            <Button variant="outline" size="sm" onClick={() => setSupportOpen(true)}>
              <LifeBuoy className="mr-2 h-4 w-4" /> Support session
            </Button>
          )}
          {live ? (
            <Button variant="outline" size="sm" onClick={handleSuspend}>
              <Ban className="mr-2 h-4 w-4" /> Suspend
            </Button>
          ) : status === 'suspended' || status === 'cancelled' ? (
            <Button variant="outline" size="sm" onClick={() => act('reactivate')}>
              <RotateCcw className="mr-2 h-4 w-4" /> Reactivate
            </Button>
          ) : null}
        </div>
      </div>

      {message && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{message}</div>}

      {prov?.deployNeeded && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-200">
          Deploy needed: this agency&apos;s database is created, but the backend must be deployed with its binding before it can sign in.
        </div>
      )}
      {prov?.provisioningStatus === 'failed' && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center justify-between">
          <span>Provisioning failed{prov.provisioningError ? `: ${prov.provisioningError}` : ''}</span>
          <Button size="sm" variant="outline" onClick={handleRetry}>Retry</Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Users" value={tenant.stats.userCount} icon={<Users className="h-4 w-4" />} />
        <StatCard title="Plan" value={tenant.planId || 'N/A'} icon={<CreditCard className="h-4 w-4" />} />
        <StatCard title="Leads" value={tenant.stats.leadCount} icon={<Target className="h-4 w-4" />} />
        <StatCard title="Invoices" value={tenant.stats.invoiceCount} icon={<Receipt className="h-4 w-4" />} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="usage">Usage &amp; add-ons</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="plan">Plan &amp; caps</TabsTrigger>
          <TabsTrigger value="calling">Calling</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tenant Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <InfoRow label="Company" value={tenant.name} />
                <InfoRow label="Subdomain" value={prov?.slug || '—'} />
                <InfoRow label="Admin email" value={tenant.email} />
                <InfoRow label="Phone" value={tenant.phone || '—'} />
                <InfoRow label="Website" value={tenant.website || '—'} />
                <InfoRow label="Database" value={prov?.dbBinding || 'Not bound'} />
                <InfoRow label="Provisioning" value={prov?.provisioningStatus || '—'} />
                <InfoRow label="Created" value={tenant.createdAt ? new Date(tenant.createdAt).toLocaleString() : '—'} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscription">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Subscription Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <InfoRow label="Plan" value={tenant.subscription.plan || tenant.planId || '—'} />
                <InfoRow label="Status" value={tenant.subscription.status || '—'} />
                <InfoRow label="Renews" value={tenant.subscription.renewalDate ? new Date(tenant.subscription.renewalDate).toLocaleDateString() : '—'} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage">
          <UsageStatsPanel tenantId={id} />
        </TabsContent>

        <TabsContent value="features">
          <FeatureFlagsPanel tenantId={id} />
        </TabsContent>

        <TabsContent value="plan">
          <AiVoipPanel tenantId={id} currentPlan={tenant.planId || 'trial'} />
        </TabsContent>

        <TabsContent value="calling">
          <CallingPanel tenantId={id} />
        </TabsContent>
      </Tabs>

      <ImpersonationDialog open={supportOpen} onOpenChange={setSupportOpen} tenantId={id} tenantName={tenant.name} />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>{' '}
      <span className="font-medium">{value}</span>
    </div>
  );
}
