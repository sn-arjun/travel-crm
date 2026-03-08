'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { StatCard } from '@/components/shared/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Users,
  Globe,
  CreditCard,
  Ban,
  RotateCcw,
  Save,
  ToggleLeft,
} from 'lucide-react';
import { FeatureFlagsPanel } from '@/components/tenants/feature-flags-panel';
import { UsageStatsPanel } from '@/components/tenants/usage-stats-panel';
import { AiVoipPanel } from '@/components/tenants/ai-voip-panel';

interface TenantDetail {
  id: string;
  company_name: string;
  subdomain: string;
  d1_database_id: string;
  plan: string;
  status: string;
  max_users: number;
  settings: string;
  created_at: string;
  updated_at: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  country: string;
  timezone: string;
  user_count: number;
  sub_plan: string;
  amount: number;
  sub_status: string;
  billing_cycle: string;
  start_date: string;
  next_billing_date: string;
  wp_id: string | null;
  wp_subdomain: string | null;
  wp_status: string | null;
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  trial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  suspended: 'bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export default function TenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ company_name: '', owner_email: '', owner_phone: '', country: '', timezone: '' });

  useEffect(() => {
    fetch(`/api/tenants/${id}`)
      .then((r) => r.json() as Promise<TenantDetail>)
      .then((data) => {
        setTenant(data);
        setEditForm({
          company_name: data.company_name || '',
          owner_email: data.owner_email || '',
          owner_phone: data.owner_phone || '',
          country: data.country || '',
          timezone: data.timezone || '',
        });
        setLoading(false);
      });
  }, [id]);

  const handleSave = async () => {
    await fetch(`/api/tenants/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    setEditing(false);
    // Reload
    const res = await fetch(`/api/tenants/${id}`);
    setTenant(await res.json() as TenantDetail);
  };

  const handleSuspend = async () => {
    const reason = prompt('Reason for suspension:');
    if (!reason) return;
    await fetch(`/api/tenants/${id}/suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const res = await fetch(`/api/tenants/${id}`);
    setTenant(await res.json() as TenantDetail);
  };

  const handleReactivate = async () => {
    await fetch(`/api/tenants/${id}/reactivate`, { method: 'POST' });
    const res = await fetch(`/api/tenants/${id}`);
    setTenant(await res.json() as TenantDetail);
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

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { label: 'Tenants', href: '/tenants' },
        { label: tenant.company_name },
      ]} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{tenant.company_name}</h1>
          <p className="text-muted-foreground">{tenant.subdomain}.travelcrmpro.com</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={statusColors[tenant.status] || ''}>
            {tenant.status}
          </Badge>
          {tenant.status !== 'suspended' ? (
            <Button variant="outline" size="sm" onClick={handleSuspend}>
              <Ban className="mr-2 h-4 w-4" /> Suspend
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={handleReactivate}>
              <RotateCcw className="mr-2 h-4 w-4" /> Reactivate
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Users" value={tenant.user_count} icon={<Users className="h-4 w-4" />} />
        <StatCard title="Plan" value={tenant.plan || tenant.sub_plan || 'N/A'} icon={<CreditCard className="h-4 w-4" />} />
        <StatCard
          title="MRR"
          value={tenant.amount ? `₹${tenant.amount.toLocaleString('en-IN')}` : '₹0'}
          icon={<CreditCard className="h-4 w-4" />}
        />
        <StatCard title="WordPress" value={tenant.wp_status || 'None'} icon={<Globe className="h-4 w-4" />} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="ai-voip">AI & VoIP</TabsTrigger>
          <TabsTrigger value="wordpress">WordPress</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Tenant Information</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setEditing(!editing)}>
                {editing ? 'Cancel' : 'Edit'}
              </Button>
            </CardHeader>
            <CardContent>
              {editing ? (
                <div className="space-y-3 max-w-md">
                  <Field label="Company Name">
                    <Input value={editForm.company_name} onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })} />
                  </Field>
                  <Field label="Owner Email">
                    <Input value={editForm.owner_email} onChange={(e) => setEditForm({ ...editForm, owner_email: e.target.value })} />
                  </Field>
                  <Field label="Owner Phone">
                    <Input value={editForm.owner_phone} onChange={(e) => setEditForm({ ...editForm, owner_phone: e.target.value })} />
                  </Field>
                  <Field label="Country">
                    <Input value={editForm.country} onChange={(e) => setEditForm({ ...editForm, country: e.target.value })} />
                  </Field>
                  <Field label="Timezone">
                    <Input value={editForm.timezone} onChange={(e) => setEditForm({ ...editForm, timezone: e.target.value })} />
                  </Field>
                  <Button onClick={handleSave}>
                    <Save className="mr-2 h-4 w-4" /> Save Changes
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <InfoRow label="Company" value={tenant.company_name} />
                  <InfoRow label="Subdomain" value={tenant.subdomain} />
                  <InfoRow label="Owner" value={`${tenant.owner_name} (${tenant.owner_email})`} />
                  <InfoRow label="Phone" value={tenant.owner_phone || '—'} />
                  <InfoRow label="Country" value={tenant.country || '—'} />
                  <InfoRow label="Timezone" value={tenant.timezone || '—'} />
                  <InfoRow label="D1 Database" value={tenant.d1_database_id || 'Not provisioned'} />
                  <InfoRow label="Created" value={tenant.created_at ? new Date(tenant.created_at).toLocaleString() : '—'} />
                </div>
              )}
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
                <InfoRow label="Plan" value={tenant.sub_plan || tenant.plan || '—'} />
                <InfoRow label="Amount" value={tenant.amount ? `₹${tenant.amount}/mo` : '—'} />
                <InfoRow label="Status" value={tenant.sub_status || '—'} />
                <InfoRow label="Billing Cycle" value={tenant.billing_cycle || '—'} />
                <InfoRow label="Start Date" value={tenant.start_date ? new Date(tenant.start_date).toLocaleDateString() : '—'} />
                <InfoRow label="Next Billing" value={tenant.next_billing_date ? new Date(tenant.next_billing_date).toLocaleDateString() : '—'} />
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

        <TabsContent value="ai-voip">
          <AiVoipPanel tenantId={id} currentPlan={tenant.plan || 'trial'} />
        </TabsContent>

        <TabsContent value="wordpress">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">WordPress Site</CardTitle>
            </CardHeader>
            <CardContent>
              {tenant.wp_id ? (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <InfoRow label="Subdomain" value={`${tenant.wp_subdomain}.travelcrmpro.com`} />
                  <InfoRow label="Status" value={tenant.wp_status || '—'} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No WordPress site provisioned for this tenant.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      {children}
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
