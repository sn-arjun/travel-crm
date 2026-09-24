'use client';

import { useParams, useRouter } from 'next/navigation';
import { DetailPage } from '@/components/domain';
import { SectionCard } from '@/components/ui/section-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { Stat } from '@/components/ui/stat';
import { useApiQuery } from '@/hooks/use-api';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';

interface TenantDetail {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: 'active' | 'suspended' | 'inactive';
  planId: string;
  website?: string;
  createdAt: string;
  subscription?: { plan: string; status: 'active' | 'cancelled' | 'expired'; renewalDate?: string };
  stats?: { userCount: number; contactCount: number; leadCount: number; invoiceCount: number };
}

function statusTone(status: TenantDetail['status']) {
  if (status === 'active') return 'success' as const;
  if (status === 'suspended') return 'danger' as const;
  return 'info' as const;
}

export default function TenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tenantId = params.id as string;

  const { data: tenant, loading } = useApiQuery<TenantDetail>(async () => {
    const response = await client.get<{ data: TenantDetail }>(API_ENDPOINTS.admin.tenantById(tenantId));
    return response.data;
  }, [tenantId]);

  if (loading || !tenant) {
    return (
      <div className="flex flex-col gap-ds-4 p-ds-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-ds-6">
      <DetailPage
        entity={tenant}
        title={tenant.name}
        subtitle={tenant.email}
        status={<Tag tone={statusTone(tenant.status)}>{tenant.status}</Tag>}
        onBack={() => router.push('/super-admin/tenants')}
        overview={
          <div className="grid grid-cols-1 gap-ds-4 lg:grid-cols-3">
            <SectionCard title="Basic information" className="lg:col-span-2">
              <div className="grid grid-cols-2 gap-ds-4">
                <div>
                  <p className="text-xs text-ds-foreground-muted">Company name</p>
                  <p className="font-medium">{tenant.name}</p>
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted">Email</p>
                  <p className="font-medium">{tenant.email}</p>
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted">Phone</p>
                  <p className="font-medium">{tenant.phone ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted">Website</p>
                  <p className="font-medium">{tenant.website ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted">Created</p>
                  <p className="font-medium">
                    {new Date(tenant.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
            </SectionCard>

            <div className="flex flex-col gap-ds-4">
              {tenant.subscription && (
                <SectionCard title="Subscription">
                  <div className="space-y-ds-3">
                    <div>
                      <p className="text-xs text-ds-foreground-muted">Plan</p>
                      <p className="font-medium capitalize">{tenant.subscription.plan}</p>
                    </div>
                    <div>
                      <p className="text-xs text-ds-foreground-muted">Status</p>
                      <p className="font-medium capitalize">{tenant.subscription.status}</p>
                    </div>
                    {tenant.subscription.renewalDate && (
                      <div>
                        <p className="text-xs text-ds-foreground-muted">Renewal date</p>
                        <p className="font-medium">
                          {new Date(tenant.subscription.renewalDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    )}
                  </div>
                </SectionCard>
              )}

              {tenant.stats && (
                <SectionCard title="Usage">
                  <div className="grid grid-cols-2 gap-ds-3">
                    <Stat label="Users" value={tenant.stats.userCount} />
                    <Stat label="Contacts" value={tenant.stats.contactCount} />
                    <Stat label="Leads" value={tenant.stats.leadCount} />
                    <Stat label="Invoices" value={tenant.stats.invoiceCount} />
                  </div>
                </SectionCard>
              )}
            </div>
          </div>
        }
      />
    </div>
  );
}
