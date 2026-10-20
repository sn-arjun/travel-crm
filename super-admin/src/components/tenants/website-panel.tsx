'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe, RotateCcw } from 'lucide-react';
import { HistoryList, SiteStatusBadge, formatTime, isInFlight, type WpHistoryEntry, type WpSite } from '@/components/wordpress/site-status';

/** "Website" tab of an agency: create the WordPress site, then watch it build (status, attempts, last error, history) and retry a failure. */
export function WebsitePanel({ tenantId }: { tenantId: string }) {
  const [site, setSite] = useState<WpSite | null>(null);
  const [history, setHistory] = useState<WpHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const list = await fetch('/api/wordpress');
    if (!list.ok) {
      setMessage(((await list.json()) as { error?: string }).error || 'Could not load the website');
      setLoading(false);
      return;
    }
    const mine = ((await list.json()) as { sites: WpSite[] }).sites.find((s) => s.tenantId === tenantId) ?? null;
    setSite(mine);
    if (mine) {
      const detail = await fetch(`/api/wordpress/${mine.id}`);
      if (detail.ok) setHistory(((await detail.json()) as { history: WpHistoryEntry[] }).history);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const moving = site ? isInFlight(site.status) : false;
  useEffect(() => {
    if (!moving) return;
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [moving, load]);

  const post = async (path: string) => {
    setBusy(true);
    setMessage('');
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!res.ok) setMessage(((await res.json()) as { error?: string }).error || 'The request failed');
    setBusy(false);
    await load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4" /> Website</CardTitle>
        <CardDescription>A WordPress site for this agency, built on the platform&apos;s web server.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{message}</div>}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !site ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">This agency has no website yet.</p>
            <Button disabled={busy} onClick={() => post(`/api/tenants/${tenantId}/wordpress`)}>Create website</Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <SiteStatusBadge status={site.status} />
              <span className="text-muted-foreground">Attempts: {site.attempts}</span>
              <span className="text-muted-foreground">Updated {formatTime(site.updatedAt)}</span>
              {site.status === 'active' && site.siteUrl && (
                <a className="underline" href={site.siteUrl} target="_blank" rel="noopener noreferrer">{site.siteUrl}</a>
              )}
              {site.status === 'failed' && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => post(`/api/wordpress/${site.id}/retry`)}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />Retry
                </Button>
              )}
            </div>
            {site.lastError && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive break-words">{site.lastError}</div>}
            <div>
              <h3 className="text-sm font-medium mb-2">History</h3>
              <HistoryList history={history} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
