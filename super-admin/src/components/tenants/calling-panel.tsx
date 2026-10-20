'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Doc {
  country: string;
  status: 'pending' | 'approved' | 'rejected';
  details: { businessName?: string; address?: string; registrationNumber?: string } | null;
  files: Array<{ name: string; url: string }>;
  reviewNote: string | null;
}

interface NumberRow {
  id: string;
  phoneNumber: string;
  status: string;
  country: string;
  monthlyPrice: number | null;
  currency: string | null;
  paidThrough: string | null;
  releaseAt: string | null;
  releaseReason: string | null;
}

interface FraudEvent {
  id: string;
  kind: string;
  day: string;
  blocking: boolean;
  status: 'active' | 'lifted';
  detail: Record<string, unknown> | null;
  occurrences: number;
  createdAt: string;
  liftedBy: string | null;
}

interface CallingState {
  usage?: {
    month: string;
    minutesCounted: number;
    providerCost: number;
    calls: number;
    cursor: { at: string; lastRunAt: string | null; lastError: string | null; imported: number } | null;
  };
  fraud?: { events: FraudEvent[]; allowedCountries: string[]; dailyMinuteCeiling: number };
  plan: string;
  country: string;
  calling: { allowed: boolean; reason: string | null; message: string | null; position: string | null; kycRequired: boolean };
  account: { status: string; provider: string; subAccountId: string | null } | null;
  documents: Doc[];
  numbers: NumberRow[];
}

const FRAUD_LABELS: Record<string, string> = {
  daily_minutes: 'Daily minute ceiling reached - outbound calling is blocked',
  spend_spike: 'Provider spend more than 3 times the 14-day average',
  platform_ceiling: 'Platform-wide daily spend ceiling passed',
  velocity: 'Call rate or concurrency limit hit',
  blocked_destination: 'Calls to a blocked or not-allowed destination were refused',
};

const REASONS: Record<string, string> = {
  trial_not_allowed: 'Calling is not included in the free trial.',
  country_not_set: 'The agency has not set its country.',
  country_not_supported: 'The country is not on the calling allow-list.',
  country_not_offered: 'Calling is not offered in this country.',
};

/**
 * Calling for one agency (R304): its provider sub-account (enable, suspend, resume, close), number documents (approve or
 * reject), and the numbers it rents (release). Also the platform-wide switch for calling on free trials.
 */
export function CallingPanel({ tenantId }: { tenantId: string }) {
  const [state, setState] = useState<CallingState | null>(null);
  const [trial, setTrial] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [countries, setCountries] = useState<string | null>(null);
  const [ceiling, setCeiling] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [res, settings] = await Promise.all([fetch(`/api/tenants/${tenantId}/voip`), fetch('/api/voip/settings')]);
    const body = (await res.json()) as CallingState & { error?: string };
    if (!res.ok) {
      setMessage(body.error || 'Could not load calling');
      return;
    }
    setState(body);
    if (settings.ok) setTrial(((await settings.json()) as { callingOnTrial: boolean }).callingOnTrial);
  }, [tenantId]);

  useEffect(() => {
    load().catch(() => setMessage('Could not load calling'));
  }, [load]);

  const act = async (path: string, method: string, body?: unknown, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMessage('');
    const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    setBusy(false);
    if (!res.ok) {
      setMessage(((await res.json().catch(() => ({}))) as { error?: string }).error || 'The action failed');
      return;
    }
    await load();
  };

  if (!state) return <p className="text-sm text-muted-foreground">{message || 'Loading...'}</p>;
  const status = state.account?.status ?? 'off';

  return (
    <div className="space-y-4">
      {message && <p className="text-sm text-destructive">{message}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calling account</CardTitle>
          <CardDescription>
            One provider sub-account per agency. Country {state.country || 'not set'}; position {state.calling.position ?? 'unknown'}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant={status === 'active' ? 'default' : 'outline'}>{status}</Badge>
            {state.account?.subAccountId && <span className="font-mono text-xs text-muted-foreground">{state.account.subAccountId}</span>}
            {!state.calling.allowed && <span className="text-muted-foreground">{REASONS[state.calling.reason ?? ''] ?? state.calling.message}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {(status === 'off' || status === 'closed') && (
              <Button size="sm" disabled={busy || !state.calling.allowed} onClick={() => act(`/api/tenants/${tenantId}/voip/enable`, 'POST')}>
                Enable calling
              </Button>
            )}
            {status === 'active' && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => act(`/api/tenants/${tenantId}/voip/suspend`, 'POST', undefined, 'Suspend calling? Calls stop and the numbers stop ringing, but the numbers are kept.')}>
                Suspend
              </Button>
            )}
            {status === 'suspended' && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => act(`/api/tenants/${tenantId}/voip/resume`, 'POST')}>
                Resume
              </Button>
            )}
            {(status === 'active' || status === 'suspended') && (
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => act(`/api/tenants/${tenantId}/voip/close`, 'POST', undefined, 'Close the calling account now? Every number is released at once and cannot be recovered.')}>
                Close and release numbers
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Minutes and safety limits</CardTitle>
          <CardDescription>
            Minutes are counted from the provider call records (every 5 minutes, once per provider call). Limits stop pumped or runaway calling.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {state.usage && (
            <p>
              {state.usage.month}: {state.usage.minutesCounted} minutes counted over {state.usage.calls} provider calls, provider cost {state.usage.providerCost}.
              {state.usage.cursor
                ? ` Last import ${state.usage.cursor.lastRunAt ? new Date(state.usage.cursor.lastRunAt).toLocaleString() : 'never'}.`
                : ' No import has run yet.'}
              {state.usage.cursor?.lastError && <span className="text-destructive"> Last error: {state.usage.cursor.lastError}</span>}
            </p>
          )}
          {state.fraud && (
            <>
              <div className="space-y-2">
                <p className="font-medium">Limits that fired</p>
                {state.fraud.events.length === 0 && <p className="text-muted-foreground">None.</p>}
                {state.fraud.events.map((e) => (
                  <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={e.blocking ? 'destructive' : 'outline'}>{e.blocking ? 'blocked' : e.status}</Badge>
                        <span>{FRAUD_LABELS[e.kind] ?? e.kind}</span>
                        <span className="text-muted-foreground">{e.day} x{e.occurrences}</span>
                      </div>
                      {e.detail && <p className="font-mono text-xs text-muted-foreground">{JSON.stringify(e.detail)}</p>}
                      {e.liftedBy && <p className="text-xs text-muted-foreground">Lifted by {e.liftedBy}</p>}
                    </div>
                    {e.status === 'active' && (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(`/api/voip/fraud-events/${e.id}/lift`, 'POST', undefined, e.blocking ? 'Lift this block? The agency can place outbound calls again today.' : undefined)}>
                        {e.blocking ? 'Lift block' : 'Dismiss'}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <p className="font-medium">Countries the agency may call besides its own</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="max-w-xs"
                    placeholder="e.g. FR, DE"
                    value={countries ?? state.fraud.allowedCountries.join(', ')}
                    onChange={(e) => setCountries(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || countries === null}
                    onClick={() => act(`/api/tenants/${tenantId}/voip/countries`, 'PUT', { countries: (countries ?? '').split(/[\s,]+/).filter(Boolean) }).then(() => setCountries(null))}
                  >
                    Save countries
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <p className="font-medium">Daily outbound minute ceiling</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input className="max-w-[8rem]" inputMode="numeric" value={ceiling ?? String(state.fraud.dailyMinuteCeiling)} onChange={(e) => setCeiling(e.target.value)} />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || ceiling === null || !/^[0-9]+$/.test(ceiling) || Number(ceiling) < 1}
                    onClick={() => act(`/api/tenants/${tenantId}/voip/limits`, 'PUT', { dailyMinutes: Number(ceiling) }).then(() => setCeiling(null))}
                  >
                    Save ceiling
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Number documents</CardTitle>
          <CardDescription>{state.calling.kycRequired ? 'Numbers in this country need approved documents before purchase.' : 'No documents are needed in this country.'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {state.documents.length === 0 && <p className="text-sm text-muted-foreground">Nothing submitted.</p>}
          {state.documents.map((d) => (
            <div key={d.country} className="rounded-md border p-3 text-sm space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{d.country}</span>
                <Badge variant={d.status === 'approved' ? 'default' : 'outline'}>{d.status}</Badge>
              </div>
              <p className="text-muted-foreground">
                {d.details?.businessName} - {d.details?.address}
                {d.details?.registrationNumber ? ` - ${d.details.registrationNumber}` : ''}
              </p>
              {d.files.map((f) => (
                <p key={f.url}>
                  <a className="underline" href={f.url} target="_blank" rel="noreferrer">{f.name}</a>
                </p>
              ))}
              {d.reviewNote && <p className="text-muted-foreground">Note: {d.reviewNote}</p>}
              {d.status === 'pending' && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" disabled={busy} onClick={() => act(`/api/tenants/${tenantId}/voip/documents/${d.country}`, 'PUT', { status: 'approved' })}>Approve</Button>
                  <Input
                    className="max-w-xs"
                    placeholder="Reason for rejecting"
                    value={notes[d.country] ?? ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [d.country]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !(notes[d.country] ?? '').trim()}
                    onClick={() => act(`/api/tenants/${tenantId}/voip/documents/${d.country}`, 'PUT', { status: 'rejected', note: notes[d.country] })}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Numbers</CardTitle>
          <CardDescription>Rented through the phone number add-on (grant one under Usage and add-ons).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {state.numbers.filter((n) => n.status !== 'released').length === 0 && <p className="text-sm text-muted-foreground">No numbers.</p>}
          {state.numbers.filter((n) => n.status !== 'released').map((n) => (
            <div key={n.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{n.phoneNumber}</span>
                <Badge variant="outline">{n.status}</Badge>
                {n.paidThrough && <span className="text-muted-foreground">paid through {n.paidThrough}</span>}
                {n.releaseAt && <span className="text-muted-foreground">releases {new Date(n.releaseAt).toLocaleDateString()} ({n.releaseReason})</span>}
              </div>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => act(`/api/tenants/${tenantId}/voip/numbers/${n.id}/release`, 'POST', undefined, `Release ${n.phoneNumber} now?`)}>
                Release
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {trial !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Platform setting: calling on free trials</CardTitle>
            <CardDescription>Applies to every agency. Off by default; not yet confirmed by the owner. Fraud sign-ups use trials, so switch on with care.</CardDescription>
          </CardHeader>
          <CardContent>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={trial}
                disabled={busy}
                onChange={(e) => act('/api/voip/settings', 'PUT', { callingOnTrial: e.target.checked }, e.target.checked ? 'Allow calling for agencies on a free trial?' : undefined)}
              />
              Allow calling on free trials
            </label>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
