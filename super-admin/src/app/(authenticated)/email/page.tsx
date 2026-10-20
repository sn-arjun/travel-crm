'use client';

import { useCallback, useEffect, useState } from 'react';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

type Source = 'console' | 'env' | 'default';

interface EmailState {
  settings: {
    systemProvider: 'cloudflare' | 'sendgrid' | 'mock';
    fallback: boolean;
    inboundEnabled: boolean;
    source: { systemProvider: Source; fallback: Source; inboundEnabled: Source };
  };
  routing: Array<{
    kind: string;
    label: string;
    why: string;
    provider: string;
    mayUseCloudflare: boolean;
    fallbackToSendgrid: boolean;
    note: string | null;
  }>;
  status: {
    cloudflareBinding: boolean;
    sendgridKey: boolean;
    sendgridEventWebhook: boolean;
    inboundDomain: string | null;
    fromAddress: string;
    testMode: boolean;
    variableProvider: string | null;
  };
  logRetentionDays: number;
}

interface LogRow {
  id: string;
  template: string | null;
  to: string;
  provider: string;
  fallbackFrom: string | null;
  messageId: string | null;
  status: string;
  deliveryStatus: string | null;
  error: string | null;
  note: string | null;
  createdAt: string;
}

async function send(method: string, path: string, body?: unknown): Promise<{ error: string | null; data: unknown }> {
  const res = await fetch(`/api/email${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  return res.ok ? { error: null, data: json } : { error: json.error || `Request failed (${res.status})`, data: null };
}

function Switch({ on, label, disabled, onClick }: { on: boolean; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

const SOURCE_LABEL: Record<Source, string> = { console: 'set in this console', env: 'from the deployed variable', default: 'built-in default' };

function Yes({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return <Badge variant={ok ? 'default' : 'outline'}>{ok ? yes : no}</Badge>;
}

/** Email routing: where platform mail goes, the provider status, a test send and the platform delivery log. Every change is audited. */
export default function EmailPage() {
  const [state, setState] = useState<EmailState | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [provider, setProvider] = useState<'cloudflare' | 'sendgrid'>('cloudflare');
  const [fallback, setFallback] = useState(true);
  const [inbound, setInbound] = useState(true);
  const [reason, setReason] = useState('');
  const [testTo, setTestTo] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/email');
    const json = (await res.json()) as EmailState & { error?: string };
    if (!res.ok) {
      setError(json.error || 'Could not load the email settings');
      return;
    }
    setState(json);
    setProvider(json.settings.systemProvider === 'sendgrid' ? 'sendgrid' : 'cloudflare');
    setFallback(json.settings.fallback);
    setInbound(json.settings.inboundEnabled);
  }, []);

  const loadLog = useCallback(async () => {
    const res = await fetch(`/api/email/log${filter ? `?status=${filter}` : ''}`);
    if (!res.ok) return;
    const json = (await res.json()) as { rows: LogRow[] };
    setLog(json.rows);
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadLog(); }, [loadLog]);

  const dirty = !!state && (provider !== state.settings.systemProvider || fallback !== state.settings.fallback || inbound !== state.settings.inboundEnabled);
  const mocked = state?.settings.systemProvider === 'mock';

  const save = async () => {
    if (!state) return;
    if (reason.trim().length < 3) {
      setError('Say why you are changing the email settings (the reason is kept in the audit log).');
      return;
    }
    setBusy(true);
    const r = await send('PUT', '/settings', {
      ...(provider !== state.settings.systemProvider && !mocked ? { systemProvider: provider } : {}),
      ...(fallback !== state.settings.fallback ? { fallback } : {}),
      ...(inbound !== state.settings.inboundEnabled ? { inboundEnabled: inbound } : {}),
      reason: reason.trim(),
    });
    setBusy(false);
    if (r.error) {
      setError(r.error);
      setNotice('');
      return;
    }
    setError('');
    setNotice('Saved. The change is live within a minute and is in the audit log.');
    setReason('');
    await load();
  };

  const sendTest = async () => {
    setBusy(true);
    const r = await send('POST', '/test', { to: testTo.trim() });
    setBusy(false);
    if (r.error) {
      setError(r.error);
      setNotice('');
    } else {
      const d = r.data as { via?: string; outbox?: boolean; fallbackFrom?: string | null };
      setError('');
      setNotice(d.outbox ? 'Test email written to the local outbox (nothing was sent).' : `Test email sent through ${d.via}${d.fallbackFrom ? ` (fallback from ${d.fallbackFrom})` : ''}.`);
    }
    await loadLog();
  };

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Email' }]} />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Email</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Where the platform sends its own mail. Agency mail (to their customers, including every campaign) always goes through SendGrid. Changes apply within a minute and are audited.
        </p>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {notice && <div className="rounded-md bg-green-100 p-3 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-300">{notice}</div>}

      {!state ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Routing by kind of mail</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Kind</th>
                    <th className="px-3 py-2 font-medium">Sent through</th>
                    <th className="px-3 py-2 font-medium">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {state.routing.map((r) => (
                    <tr key={r.kind} className="border-t align-top">
                      <td className="py-2 pr-4 font-medium">{r.label}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Badge variant={r.provider === 'cloudflare' ? 'default' : 'outline'}>{r.provider === 'cloudflare' ? 'Cloudflare' : r.provider === 'mock' ? 'Mock (local)' : 'SendGrid'}</Badge>
                        {r.fallbackToSendgrid && <div className="text-xs text-muted-foreground mt-1">falls back to SendGrid</div>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.why}
                        {r.note && <div className="text-xs text-amber-700 dark:text-amber-400 mt-1">{r.note}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Provider status</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="flex items-center justify-between gap-2"><span>Cloudflare send_email binding</span><Yes ok={state.status.cloudflareBinding} yes="Present" no="Missing (SendGrid sends)" /></div>
              <div className="flex items-center justify-between gap-2"><span>SendGrid API key</span><Yes ok={state.status.sendgridKey} yes="Present" no="Missing" /></div>
              <div className="flex items-center justify-between gap-2"><span>SendGrid event webhook key</span><Yes ok={state.status.sendgridEventWebhook} yes="Present" no="Missing" /></div>
              <div className="flex items-center justify-between gap-2"><span>Inbound reply domain</span><span className="font-mono text-xs">{state.status.inboundDomain ?? 'not set'}</span></div>
              <div className="flex items-center justify-between gap-2"><span>Sender address</span><span className="font-mono text-xs">{state.status.fromAddress}</span></div>
              <div className="flex items-center justify-between gap-2"><span>Local test mode</span><Yes ok={state.status.testMode} yes="On (outbox)" no="Off" /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Platform system mail</CardTitle></CardHeader>
            <CardContent className="space-y-5 text-sm">
              {mocked && <p className="text-muted-foreground">This stack runs with the mock provider (a local variable); the console cannot change it.</p>}
              <div className="space-y-2">
                <div className="font-medium">Send first through</div>
                <div className="flex flex-wrap gap-4">
                  {(['cloudflare', 'sendgrid'] as const).map((p) => (
                    <label key={p} className="flex items-center gap-2">
                      <input type="radio" name="provider" checked={provider === p} disabled={mocked} onChange={() => setProvider(p)} />
                      {p === 'cloudflare' ? 'Cloudflare (default)' : 'SendGrid'}
                    </label>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">Currently {SOURCE_LABEL[state.settings.source.systemProvider]}. Rollback: choose SendGrid and save.</div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium">Fall back to SendGrid</div>
                  <div className="text-xs text-muted-foreground">When Cloudflare is missing or refuses a message, send it through SendGrid instead ({SOURCE_LABEL[state.settings.source.fallback]}).</div>
                </div>
                <Switch on={fallback} label="Fall back to SendGrid" onClick={() => setFallback(!fallback)} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium">Customer reply addresses</div>
                  <div className="text-xs text-muted-foreground">
                    Issue reply+token addresses on agency mail and accept replies sent to them ({SOURCE_LABEL[state.settings.source.inboundEnabled]}). Needs the inbound domain above.
                  </div>
                </div>
                <Switch on={inbound} label="Customer reply addresses" onClick={() => setInbound(!inbound)} />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for the change (required, kept in the audit log)" aria-label="Reason" maxLength={500} />
                <Button onClick={save} disabled={!dirty || busy}>Save</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Send a test email</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2 sm:flex-row">
              <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" type="email" aria-label="Test recipient" />
              <Button onClick={sendTest} disabled={busy || !testTo.includes('@')}>Send test</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Delivery log (platform mail)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <label htmlFor="log-filter" className="text-muted-foreground">Show</label>
                <select id="log-filter" className="rounded-md border bg-background px-2 py-1" value={filter} onChange={(e) => setFilter(e.target.value)}>
                  <option value="">All</option>
                  <option value="sent">Sent</option>
                  <option value="fallback">Fallback</option>
                  <option value="failed">Failed</option>
                </select>
                <span className="text-xs text-muted-foreground">
                  Addresses are masked. Kept {state.logRetentionDays} days. SendGrid reports delivery; Cloudflare has no event feed, so its mail shows
                  &quot;accepted&quot; (check the Cloudflare dashboard, Email Sending, for what happened next).
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">When</th>
                      <th className="px-3 py-2 font-medium">Mail</th>
                      <th className="px-3 py-2 font-medium">To</th>
                      <th className="px-3 py-2 font-medium">Provider</th>
                      <th className="px-3 py-2 font-medium">Result</th>
                      <th className="px-3 py-2 font-medium">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {log.length === 0 && (
                      <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No platform mail yet.</td></tr>
                    )}
                    {log.map((r) => (
                      <tr key={r.id} className="border-t align-top">
                        <td className="py-2 pr-3 whitespace-nowrap text-xs">{r.createdAt.replace('T', ' ').replace('Z', '')}</td>
                        <td className="px-3 py-2">{r.template ?? '-'}</td>
                        <td className="px-3 py-2 font-mono text-xs">{r.to}</td>
                        <td className="px-3 py-2">{r.provider}{r.fallbackFrom ? ` (fallback from ${r.fallbackFrom})` : ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Badge variant={r.status === 'failed' ? 'destructive' : r.status === 'fallback' ? 'outline' : 'default'}>{r.status}</Badge>
                          {r.deliveryStatus && <div className="text-xs text-muted-foreground mt-1">{r.deliveryStatus === 'accepted' ? 'accepted by provider' : r.deliveryStatus}</div>}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{r.error || r.note || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
