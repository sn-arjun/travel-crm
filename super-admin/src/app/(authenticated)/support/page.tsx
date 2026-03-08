'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { StatCard } from '@/components/shared/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Inbox, Clock, CheckCircle, AlertCircle } from 'lucide-react';

interface Ticket {
  id: string;
  tenant_id: string;
  tenant_name: string;
  subject: string;
  status: string;
  priority: string;
  assignee_name: string | null;
  created_by_email: string;
  created_at: string;
  updated_at: string;
}

const statusColors: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  in_progress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  resolved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  closed: 'bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-400',
};

const priorityColors: Record<string, string> = {
  low: 'text-gray-500',
  medium: 'text-blue-500',
  high: 'text-orange-500',
  urgent: 'text-red-500 font-bold',
};

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (statusFilter) params.set('status', statusFilter);
    const res = await fetch(`/api/support/tickets?${params}`);
    const data = await res.json() as { tickets: Ticket[]; totalPages: number; stats: Record<string, number> };
    setTickets(data.tickets || []);
    setTotalPages(data.totalPages || 1);
    setStats(data.stats || {});
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);
  useEffect(() => { setPage(1); }, [statusFilter]);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Support' }]} />
      <h1 className="text-3xl font-bold tracking-tight">Support Tickets</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Open" value={stats.open || 0} icon={<Inbox className="h-4 w-4" />} />
        <StatCard title="In Progress" value={stats.in_progress || 0} icon={<Clock className="h-4 w-4" />} />
        <StatCard title="Resolved" value={stats.resolved || 0} icon={<CheckCircle className="h-4 w-4" />} />
        <StatCard title="Urgent" value={tickets.filter((t) => t.priority === 'urgent').length} icon={<AlertCircle className="h-4 w-4" />} />
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="">All</TabsTrigger>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="in_progress">In Progress</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
          <TabsTrigger value="closed">Closed</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-3 px-4 font-medium">Subject</th>
              <th className="text-left py-3 px-4 font-medium">Tenant</th>
              <th className="text-left py-3 px-4 font-medium">Priority</th>
              <th className="text-left py-3 px-4 font-medium">Status</th>
              <th className="text-left py-3 px-4 font-medium">Assigned To</th>
              <th className="text-left py-3 px-4 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="py-3 px-4"><Skeleton className="h-4 w-20" /></td>
                  ))}
                </tr>
              ))
            ) : tickets.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No tickets found</td></tr>
            ) : (
              tickets.map((t) => (
                <tr key={t.id} className="border-b hover:bg-muted/50">
                  <td className="py-3 px-4">
                    <Link href={`/support/${t.id}`} className="font-medium hover:underline">{t.subject}</Link>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">{t.tenant_name}</td>
                  <td className="py-3 px-4">
                    <span className={priorityColors[t.priority] || ''}>{t.priority}</span>
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant="outline" className={statusColors[t.status] || ''}>{t.status.replace('_', ' ')}</Badge>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">{t.assignee_name || 'Unassigned'}</td>
                  <td className="py-3 px-4 text-muted-foreground">
                    {t.updated_at ? new Date(t.updated_at).toLocaleDateString() : '—'}
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
