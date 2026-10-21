'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type RegulatoryState = 'none' | 'submitted' | 'platform_review' | 'provider_review' | 'approved' | 'rejected';

/** The provider side of a document set (R137): where it stands, why it failed, and the provider's ids. */
interface Regulatory {
  state: RegulatoryState;
  providerStatus: string | null;
  providerStatusAt: string | null;
  failureReason: string | null;
  numberType: string;
  bundleSid?: string | null;
  addressSid?: string | null;
}

interface Doc {
  country: string;
  status: 'pending' | 'approved' | 'rejected';
  details: Record<string, unknown> | null;
  files: Array<{ name: string; url?: string; key?: string; field?: string }>;
  reviewNote: string | null;
  regulatory?: Regulatory;
}

/** One field or document a country's regulatory bundle asks for (call_country_policy.kyc_requirements). */
interface Requirement {
  key: string;
  label: string;
  type: 'text' | 'address' | 'file' | 'date';
  required: boolean;
}

interface CountryPolicy {
  country: string;
  kycRequired: boolean;
  kycRequirements: Requirement[] | null;
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

const STATE_LABELS: Record<RegulatoryState, string> = {
  none: 'Not started',
  submitted: 'Submitted',
  platform_review: 'Platform review',
  provider_review: 'Provider review',
  approved: 'Approved',
  rejected: 'Rejected',
};

/** What each state means for the operator, so the next step is clear. */
const STATE_HELP: Record<RegulatoryState, string> = {
  none: 'Nothing sent yet.',
  submitted: 'Waiting for your decision. Approving also submits the bundle to the phone provider.',
  platform_review: 'You approved the documents but the bundle is not with the provider. Submit it again.',
  provider_review: 'With the phone provider. Use Refresh status to ask for the latest result.',
  approved: 'The provider approved the bundle. The agency can buy numbers.',
  rejected: 'Rejected. The agency has to correct and send the documents again.',
};

/** A stored answer as one line: an address object reads "Street, 1234 AB City". */
function showValue(value: unknown): string {
  if (value == null || value === '') return '-';
  if (typeof value === 'object') {
    const a = value as { street?: string; postalCode?: string; city?: string; region?: string };
    const line = [a.street, [a.postalCode, a.city].filter(Boolean).join(' '), a.region].filter(Boolean).join(', ');
    return line || JSON.stringify(value);
  }
  return String(value);
}

const humanize = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

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
  const [policies, setPolicies] = useState<CountryPolicy[]>([]);

  const load = useCallback(async () => {
    const [res, settings, policy] = await Promise.all([fetch(`/api/tenants/${tenantId}/voip`), fetch('/api/voip/settings'), fetch('/api/voip/country-policy')]);
    const body = (await res.json()) as CallingState & { error?: string };
    if (!res.ok) {
      setMessage(body.error || 'Could not load calling');
      return;
    }
    setState(body);
    if (settings.ok) setTrial(((await settings.json()) as { callingOnTrial: boolean }).callingOnTrial);
    // Without the policy list the documents still show; they just read as a country without a provider bundle.
    if (policy.ok) setPolicies((await policy.json()) as CountryPolicy[]);
  }, [tenantId]);

  useEffect(() => {
    load().catch(() => setMessage('Could not load calling'));
  }, [load]);

  /** Runs one action and reloads. Returns the response body, or null when the action failed (the message says why). */
  const act = async (path: string, method: string, body?: unknown, confirmText?: string): Promise<Record<string, unknown> | null> => {
    if (confirmText && !window.confirm(confirmText)) return null;
    setBusy(true);
    setMessage('');
    const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    setBusy(false);
    if (!res.ok) {
      setMessage(((await res.json().catch(() => ({}))) as { error?: string }).error || 'The action failed');
      // A failed hand-over to the provider still changes the row (submit_failed and its reason), so show it.
      await load();
      return null;
    }
    const result = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    await load();
    return result;
  };

  /** Approve the documents. In a bundle country the approval also hands the bundle to the provider; say when that failed. */
  const approve = async (country: string) => {
    const result = await act(`/api/tenants/${tenantId}/voip/documents/${country}`, 'PUT', { status: 'approved' });
    if (result && typeof result.submitError === 'string' && result.submitError) {
      setMessage(`Approved, but the provider did not take the bundle: ${result.submitError}`);
    }
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
            <DocumentCard
              key={d.country}
              tenantId={tenantId}
              doc={d}
              policy={policies.find((p) => p.country === d.country)}
              busy={busy}
              note={notes[d.country] ?? ''}
              onNote={(value) => setNotes((n) => ({ ...n, [d.country]: value }))}
              onApprove={() => approve(d.country)}
              onReject={() => act(`/api/tenants/${tenantId}/voip/documents/${d.country}`, 'PUT', { status: 'rejected', note: notes[d.country] })}
              onSubmit={() => act(`/api/tenants/${tenantId}/voip/documents/${d.country}/submit-to-provider`, 'POST')}
              onRefresh={() => act(`/api/tenants/${tenantId}/voip/documents/${d.country}/refresh-status`, 'POST')}
              onReset={() =>
                act(
                  `/api/tenants/${tenantId}/voip/documents/${d.country}/reset`,
                  'POST',
                  undefined,
                  'Forget the provider bundle for this agency? The bundle at the provider is left as it is; you can submit the documents again afterwards.',
                )
              }
            />
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

interface DocumentCardProps {
  tenantId: string;
  doc: Doc;
  policy: CountryPolicy | undefined;
  busy: boolean;
  note: string;
  onNote: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onSubmit: () => void;
  onRefresh: () => void;
  onReset: () => void;
}

/**
 * One country's number documents (R141-3): what the agency sent, where the provider bundle stands, and the actions that move
 * it on: approve (which submits to the provider in a bundle country), reject, submit again, refresh the status, reset.
 */
function DocumentCard({ tenantId, doc: d, policy, busy, note, onNote, onApprove, onReject, onSubmit, onRefresh, onReset }: DocumentCardProps) {
  const requirements = policy?.kycRequired && policy.kycRequirements && policy.kycRequirements.length > 0 ? policy.kycRequirements : null;
  const bundle = requirements !== null;
  const reg = d.regulatory;
  const regState: RegulatoryState = reg?.state ?? (d.status === 'pending' ? 'submitted' : d.status);
  const details = d.details ?? {};
  const fields: Array<[string, string]> = requirements
    ? requirements.filter((r) => r.type !== 'file').map((r) => [r.label, showValue(details[r.key])])
    : Object.entries(details).map(([k, v]) => [humanize(k), showValue(v)]);
  const fileLabel = (field?: string) => requirements?.find((r) => r.key === field)?.label ?? field;
  const withProvider = !!reg?.bundleSid || !!reg?.providerStatus;

  return (
    <div className="rounded-md border p-3 text-sm space-y-3" data-testid={`document-${d.country}`} data-state={regState}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{d.country}</span>
        <Badge variant={d.status === 'approved' ? 'default' : 'outline'} data-testid="document-review-status">{d.status}</Badge>
        {bundle && (
          <Badge variant={regState === 'rejected' ? 'destructive' : regState === 'approved' ? 'default' : 'secondary'} data-testid="document-bundle-state">
            {STATE_LABELS[regState]}
          </Badge>
        )}
        {bundle && reg?.numberType && <span className="text-xs text-muted-foreground">number type: {reg.numberType}</span>}
      </div>

      {bundle && <p className="text-muted-foreground">{STATE_HELP[regState]}</p>}

      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[minmax(10rem,auto)_1fr]">
        {fields.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd data-testid="document-field">{value}</dd>
          </div>
        ))}
      </dl>

      {d.files.length > 0 && (
        <ul className="space-y-1">
          {d.files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              {f.url ? (
                <a className="underline" href={f.url} target="_blank" rel="noreferrer">{f.name}</a>
              ) : f.key ? (
                // An uploaded file is stored privately: the console fetches it with the operator's session, and each open is logged.
                <a
                  className="underline"
                  href={`/api/tenants/${tenantId}/voip/documents/${d.country}/files/${i}`}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="document-file-link"
                >
                  {f.name} (open)
                </a>
              ) : (
                <span>{f.name}</span>
              )}
              {fileLabel(f.field) && <span className="text-muted-foreground"> ({fileLabel(f.field)}{f.url ? '' : ', uploaded file'})</span>}
            </li>
          ))}
        </ul>
      )}

      {d.reviewNote && <p className="text-muted-foreground">Note: {d.reviewNote}</p>}

      {bundle && (
        <div className="rounded-md bg-muted/40 p-2 space-y-1" data-testid="document-provider">
          <p>
            Provider status: <span className="font-mono">{reg?.providerStatus ?? 'not submitted'}</span>
            {reg?.providerStatusAt && <span className="text-muted-foreground"> at {new Date(reg.providerStatusAt).toLocaleString()}</span>}
          </p>
          {reg?.bundleSid && (
            <p className="font-mono text-xs text-muted-foreground">
              Bundle {reg.bundleSid}
              {reg.addressSid ? ` / address ${reg.addressSid}` : ''}
            </p>
          )}
          {reg?.failureReason && <p className="text-destructive" data-testid="document-failure">Failure reason: {reg.failureReason}</p>}
        </div>
      )}

      {d.status === 'pending' && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={busy} onClick={onApprove} data-testid="document-approve">
            {bundle ? 'Approve and submit to provider' : 'Approve'}
          </Button>
          <Input className="max-w-xs" placeholder="Reason for rejecting" value={note} onChange={(e) => onNote(e.target.value)} />
          <Button size="sm" variant="outline" disabled={busy || !note.trim()} onClick={onReject}>
            Reject
          </Button>
        </div>
      )}

      {bundle && d.status === 'approved' && (
        <div className="flex flex-wrap items-center gap-2">
          {regState !== 'approved' && regState !== 'provider_review' && (
            <Button size="sm" disabled={busy} onClick={onSubmit} data-testid="document-submit">
              Submit to provider
            </Button>
          )}
          {reg?.bundleSid && (
            <Button size="sm" variant="outline" disabled={busy} onClick={onRefresh} data-testid="document-refresh">
              Refresh status
            </Button>
          )}
          {withProvider && (
            <Button size="sm" variant="outline" disabled={busy} onClick={onReset} data-testid="document-reset">
              Reset
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
