'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TenantActions } from '@/components/tenants/tenant-actions';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus } from 'lucide-react';

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  email: string;
  status: string;
  createdAt: string;
  userCount: number;
  subscription: { plan: string; status: string };
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  trial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  inactive: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  suspended: 'bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export default function TenantsPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);

    const res = await fetch(`/api/tenants?${params}`);
    const data = (await res.json()) as { data?: TenantRow[]; pagination?: { totalPages: number }; error?: string };
    setError(res.ok ? '' : data.error || 'Could not load tenants');
    setTenants(data.data || []);
    setTotalPages(data.pagination?.totalPages || 1);
    setLoading(false);
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Tenants' }]} />

      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Tenants</h1>
        <Link href="/tenants/new">
          <Button><Plus className="mr-2 h-4 w-4" /> Onboard Tenant</Button>
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <Input
          placeholder="Search by name or subdomain..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="suspended">Suspended</TabsTrigger>
            <TabsTrigger value="inactive">Inactive</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <div className="rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-3 px-4 font-medium">Company</th>
              <th className="text-left py-3 px-4 font-medium">Subdomain</th>
              <th className="text-left py-3 px-4 font-medium">Owner</th>
              <th className="text-left py-3 px-4 font-medium">Plan</th>
              <th className="text-left py-3 px-4 font-medium">Status</th>
              <th className="text-right py-3 px-4 font-medium">Users</th>
              <th className="text-left py-3 px-4 font-medium">Created</th>
              <th className="text-right py-3 px-4 font-medium w-12" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="py-3 px-4"><Skeleton className="h-4 w-20" /></td>
                  ))}
                </tr>
              ))
            ) : tenants.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted-foreground">
                  No tenants found
                </td>
              </tr>
            ) : (
              tenants.map((t) => (
                <tr key={t.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="py-3 px-4">
                    <Link href={`/tenants/${t.id}`} className="font-medium hover:underline">
                      {t.name}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">{t.slug}</td>
                  <td className="py-3 px-4 text-muted-foreground">{t.email || '—'}</td>
                  <td className="py-3 px-4 capitalize">{t.subscription?.plan || '—'}</td>
                  <td className="py-3 px-4">
                    <Badge variant="outline" className={statusColors[t.status] || ''}>
                      {t.status}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-right">{t.userCount}</td>
                  <td className="py-3 px-4 text-muted-foreground">
                    {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <TenantActions tenant={t} onRefresh={fetchTenants} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
