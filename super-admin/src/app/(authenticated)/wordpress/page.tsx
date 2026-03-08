'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Globe, MoreHorizontal, ExternalLink, RefreshCw, Trash2 } from 'lucide-react';

interface WpSite {
  id: string;
  tenant_id: string;
  tenant_name: string;
  subdomain: string;
  domain: string | null;
  status: string;
  template: string | null;
  wp_admin_url: string | null;
  error_message: string | null;
  provisioned_at: string | null;
  created_at: string;
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  queued: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  provisioning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  dns_created: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  deploying: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  configuring: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  suspended: 'bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-400',
  deleted: 'bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-400',
};

export default function WordPressPage() {
  const [sites, setSites] = useState<WpSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchSites = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/wordpress?page=${page}`);
    const data = await res.json() as { sites: WpSite[]; totalPages: number };
    setSites(data.sites || []);
    setTotalPages(data.totalPages || 1);
    setLoading(false);
  }, [page]);

  useEffect(() => { fetchSites(); }, [fetchSites]);

  const handleReprovision = async (site: WpSite) => {
    await fetch('/api/wordpress/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: site.tenant_id, subdomain: site.subdomain }),
    });
    fetchSites();
  };

  const handleSuspend = async (siteId: string) => {
    if (!confirm('Suspend this WordPress site?')) return;
    await fetch(`/api/wordpress/${siteId}`, { method: 'DELETE' });
    fetchSites();
  };

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'WordPress Sites' }]} />
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">WordPress Sites</h1>
      </div>

      <div className="rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-3 px-4 font-medium">Site</th>
              <th className="text-left py-3 px-4 font-medium">Tenant</th>
              <th className="text-left py-3 px-4 font-medium">Template</th>
              <th className="text-left py-3 px-4 font-medium">Status</th>
              <th className="text-left py-3 px-4 font-medium">Provisioned</th>
              <th className="text-right py-3 px-4 font-medium w-12" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="py-3 px-4"><Skeleton className="h-4 w-20" /></td>
                  ))}
                </tr>
              ))
            ) : sites.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No WordPress sites provisioned</td></tr>
            ) : (
              sites.map((s) => (
                <tr key={s.id} className="border-b hover:bg-muted/50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <span className="font-medium">{s.subdomain}.travelcrmpro.com</span>
                        {s.error_message && (
                          <p className="text-xs text-red-500 truncate max-w-xs">{s.error_message}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <Link href={`/tenants/${s.tenant_id}`} className="hover:underline">{s.tenant_name}</Link>
                  </td>
                  <td className="py-3 px-4 capitalize text-muted-foreground">{s.template || '—'}</td>
                  <td className="py-3 px-4">
                    <Badge variant="outline" className={statusColors[s.status] || ''}>{s.status}</Badge>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">
                    {s.provisioned_at ? new Date(s.provisioned_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {s.status === 'active' && s.wp_admin_url && (
                          <DropdownMenuItem asChild>
                            <a href={s.wp_admin_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="mr-2 h-4 w-4" /> WP Admin
                            </a>
                          </DropdownMenuItem>
                        )}
                        {s.status === 'active' && (
                          <DropdownMenuItem asChild>
                            <a href={`https://${s.subdomain}.travelcrmpro.com`} target="_blank" rel="noopener noreferrer">
                              <Globe className="mr-2 h-4 w-4" /> View Site
                            </a>
                          </DropdownMenuItem>
                        )}
                        {(s.status === 'error' || s.status === 'suspended') && (
                          <DropdownMenuItem onClick={() => handleReprovision(s)}>
                            <RefreshCw className="mr-2 h-4 w-4" /> Reprovision
                          </DropdownMenuItem>
                        )}
                        {s.status !== 'suspended' && s.status !== 'deleted' && (
                          <DropdownMenuItem onClick={() => handleSuspend(s.id)} className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" /> Suspend
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        )}
      </div>
    </div>
  );
}
