'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { RotateCcw, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import { HistoryList, SiteStatusBadge, formatTime, isInFlight, type WpHistoryEntry, type WpSite } from '@/components/wordpress/site-status';

interface ListResponse {
  sites: WpSite[];
  counts: Record<string, number>;
}

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'queued', label: 'Queued' },
  { value: 'provisioning', label: 'Building' },
  { value: 'active', label: 'Live' },
  { value: 'failed', label: 'Failed' },
];

export default function WordPressPage() {
  const [filter, setFilter] = useState('all');
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [history, setHistory] = useState<WpHistoryEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/wordpress${filter === 'all' ? '' : `?status=${filter}`}`);
    if (res.ok) setData((await res.json()) as ListResponse);
    else setMessage(((await res.json()) as { error?: string }).error || 'Could not load the sites');
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  // While anything is queued or being built, look again every 10 seconds.
  const moving = data?.sites.some((s) => isInFlight(s.status)) ?? false;
  useEffect(() => {
    if (!moving) return;
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [moving, load]);

  const toggle = async (id: string) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setHistory([]);
    const res = await fetch(`/api/wordpress/${id}`);
    if (res.ok) setHistory(((await res.json()) as { history: WpHistoryEntry[] }).history);
  };

  const retry = async (id: string) => {
    setBusy(id);
    setMessage('');
    const res = await fetch(`/api/wordpress/${id}/retry`, { method: 'POST' });
    if (!res.ok) setMessage(((await res.json()) as { error?: string }).error || 'Retry failed');
    setBusy(null);
    await load();
  };

  const counts = data?.counts ?? {};
  const sites = data?.sites ?? [];

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'WordPress' }]} />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">WordPress Sites</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Agency websites. Create one from an agency&apos;s page under Tenants &rarr; Website. A site is built in the background; failed builds are retried
          automatically three times, then wait here for you.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        {(['active', 'provisioning', 'queued', 'failed'] as const).map((s) => (
          <div key={s} className="rounded-lg border bg-card p-3">
            <div className="text-muted-foreground">{FILTERS.find((f) => f.value === s)?.label}</div>
            <div className="text-2xl font-semibold tabular-nums">{counts[s] ?? 0}</div>
          </div>
        ))}
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          {FILTERS.map((f) => <TabsTrigger key={f.value} value={f.value}>{f.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      {message && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{message}</div>}

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="w-8" />
              <th className="text-left py-3 px-4 font-medium">Agency</th>
              <th className="text-left py-3 px-4 font-medium">Status</th>
              <th className="text-left py-3 px-4 font-medium">Attempts</th>
              <th className="text-left py-3 px-4 font-medium">Last error</th>
              <th className="text-left py-3 px-4 font-medium">Updated</th>
              <th className="text-right py-3 px-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 7 }).map((__, j) => <td key={j} className="py-3 px-4"><Skeleton className="h-4 w-20" /></td>)}
                </tr>
              ))
            ) : sites.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No websites yet</td></tr>
            ) : (
              sites.map((s) => (
                <Fragment key={s.id}>
                  <tr className="border-b hover:bg-muted/50">
                    <td className="pl-2">
                      <Button variant="ghost" size="icon" aria-label="Show history" onClick={() => toggle(s.id)}>
                        {openId === s.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                    </td>
                    <td className="py-3 px-4">
                      <Link href={`/tenants/${s.tenantId}`} className="font-medium hover:underline">{s.companyName || s.subdomain}</Link>
                      <div className="text-xs text-muted-foreground">{s.siteUrl ?? s.subdomain}</div>
                    </td>
                    <td className="py-3 px-4"><SiteStatusBadge status={s.status} /></td>
                    <td className="py-3 px-4 tabular-nums">{s.attempts}</td>
                    <td className="py-3 px-4 text-muted-foreground max-w-xs truncate" title={s.lastError ?? ''}>{s.lastError ?? '—'}</td>
                    <td className="py-3 px-4 text-muted-foreground">{formatTime(s.updatedAt)}</td>
                    <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                      {s.status === 'active' && s.siteUrl && (
                        <Button size="sm" variant="outline" asChild>
                          <a href={s.siteUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1" />Open</a>
                        </Button>
                      )}
                      {s.status === 'failed' && (
                        <Button size="sm" variant="outline" disabled={busy === s.id} onClick={() => retry(s.id)}>
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />Retry
                        </Button>
                      )}
                    </td>
                  </tr>
                  {openId === s.id && (
                    <tr className="border-b bg-muted/30">
                      <td />
                      <td colSpan={6} className="py-3 px-4"><HistoryList history={history} /></td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
