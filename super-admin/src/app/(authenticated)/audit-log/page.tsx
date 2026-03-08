'use client';

import { useEffect, useState, useCallback } from 'react';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Download } from 'lucide-react';

interface AuditEntry {
  id: string;
  admin_name: string;
  admin_email: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: string;
  ip_address: string;
  created_at: string;
}

const actionColors: Record<string, string> = {
  tenant_provisioned: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  tenant_suspended: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  tenant_reactivated: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  features_updated: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  subscription_changed: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  announcement_created: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  login: 'bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-400',
  logout: 'bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-400',
};

function exportCSV(entries: AuditEntry[]) {
  const headers = ['Timestamp', 'Admin', 'Action', 'Entity Type', 'Entity ID', 'IP Address', 'Details'];
  const rows = entries.map((e) => [
    e.created_at,
    e.admin_name || e.admin_email || 'system',
    e.action,
    e.entity_type,
    e.entity_id || '',
    e.ip_address || '',
    e.details || '',
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'audit-log.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (actionFilter) params.set('action', actionFilter);
    if (entityFilter) params.set('entity_type', entityFilter);
    const res = await fetch(`/api/audit-log?${params}`);
    const data = await res.json() as { entries: AuditEntry[]; totalPages: number };
    setEntries(data.entries || []);
    setTotalPages(data.totalPages || 1);
    setLoading(false);
  }, [page, actionFilter, entityFilter]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);
  useEffect(() => { setPage(1); }, [actionFilter, entityFilter]);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Audit Log' }]} />
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
        <Button variant="outline" size="sm" onClick={() => exportCSV(entries)}>
          <Download className="mr-2 h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        >
          <option value="">All Actions</option>
          <option value="tenant_provisioned">Tenant Provisioned</option>
          <option value="tenant_suspended">Tenant Suspended</option>
          <option value="tenant_reactivated">Tenant Reactivated</option>
          <option value="features_updated">Features Updated</option>
          <option value="subscription_changed">Subscription Changed</option>
          <option value="announcement_created">Announcement Created</option>
          <option value="login">Login</option>
          <option value="logout">Logout</option>
        </select>
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
        >
          <option value="">All Entities</option>
          <option value="tenant">Tenant</option>
          <option value="subscription">Subscription</option>
          <option value="announcement">Announcement</option>
          <option value="support">Support</option>
          <option value="system">System</option>
        </select>
      </div>

      <div className="rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-3 px-4 font-medium">Timestamp</th>
              <th className="text-left py-3 px-4 font-medium">Admin</th>
              <th className="text-left py-3 px-4 font-medium">Action</th>
              <th className="text-left py-3 px-4 font-medium">Entity</th>
              <th className="text-left py-3 px-4 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="py-3 px-4"><Skeleton className="h-4 w-20" /></td>
                  ))}
                </tr>
              ))
            ) : entries.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No audit log entries</td></tr>
            ) : (
              entries.map((e) => (
                <tr
                  key={e.id}
                  className="border-b hover:bg-muted/50 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                >
                  <td className="py-3 px-4 text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="py-3 px-4">{e.admin_name || 'system'}</td>
                  <td className="py-3 px-4">
                    <Badge variant="outline" className={actionColors[e.action] || ''}>
                      {e.action.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 capitalize">
                    {e.entity_type}
                    {e.entity_id && <span className="text-muted-foreground ml-1 text-xs">({e.entity_id.slice(0, 8)}...)</span>}
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">{e.ip_address}</td>
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
