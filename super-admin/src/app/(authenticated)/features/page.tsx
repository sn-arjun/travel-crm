'use client';

import { useCallback, useEffect, useState } from 'react';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface RegistryFeature {
  key: string;
  name: string;
  description: string;
  area: string;
}
interface PlanRow {
  key: string;
  name: string;
  isActive: boolean;
  features: string[];
}
interface PlatformSwitch {
  enabled: boolean;
  reason: string | null;
  updatedBy: string | null;
  updatedAt: string;
}
interface FeatureGrid {
  registry: RegistryFeature[];
  unregistered: string[];
  plans: PlanRow[];
  platform: Record<string, PlatformSwitch>;
}

async function put(path: string, body: unknown): Promise<string | null> {
  const res = await fetch(`/api/features${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) return null;
  return ((await res.json().catch(() => ({}))) as { error?: string }).error || `Request failed (${res.status})`;
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

/** Feature switches: one row per feature, one column per plan, and the platform-wide switch. One save per change, each audited. */
export default function FeaturesPage() {
  const [data, setData] = useState<FeatureGrid | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/features');
    const json = (await res.json()) as FeatureGrid & { error?: string };
    if (!res.ok) {
      setError(json.error || 'Could not load the features');
      return;
    }
    setError('');
    setData(json);
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (id: string, path: string, body: unknown, ok: string) => {
    setBusy(id);
    const err = await put(path, body);
    setBusy('');
    if (err) {
      setError(err);
      setNotice('');
      return;
    }
    setError('');
    setNotice(ok);
    await load();
  };

  const togglePlan = (plan: PlanRow, f: { key: string; name: string }) => {
    const enabled = !plan.features.includes(f.key);
    return run(`${plan.key}:${f.key}`, `/plans/${plan.key}/${f.key}`, { enabled }, `${f.name} ${enabled ? 'added to' : 'removed from'} ${plan.name}`);
  };

  const togglePlatform = (f: { key: string; name: string }, currentlyOn: boolean) => {
    if (currentlyOn) {
      const reason = window.prompt(`Switch "${f.name}" off for EVERY agency. Reason (required):`);
      if (!reason || !reason.trim()) return Promise.resolve();
      return run(`platform:${f.key}`, `/platform/${f.key}`, { enabled: false, reason: reason.trim() }, `${f.name} is off for every agency`);
    }
    return run(`platform:${f.key}`, `/platform/${f.key}`, { enabled: true }, `${f.name} is back on for the plans that include it`);
  };

  const areas = data ? [...new Set(data.registry.map((f) => f.area))] : [];

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Features' }]} />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Features</h1>
        <p className="text-sm text-muted-foreground mt-1">
          A plan column adds or removes a feature for every agency on that plan. The platform switch turns it off for all agencies at once and
          beats any agency override. Individual agencies are set on the agency page. Changes apply within a minute and are audited.
        </p>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {notice && <div className="rounded-md bg-green-100 p-3 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-300">{notice}</div>}

      {!data ? (
        <Skeleton className="h-64" />
      ) : (
        areas.map((area) => (
          <Card key={area}>
            <CardHeader>
              <CardTitle className="text-base">{area}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Feature</th>
                    {data.plans.map((p) => (
                      <th key={p.key} className="px-3 py-2 font-medium text-center">{p.name}</th>
                    ))}
                    <th className="px-3 py-2 font-medium text-center">Platform</th>
                  </tr>
                </thead>
                <tbody>
                  {data.registry.filter((f) => f.area === area).map((f) => {
                    const sw = data.platform[f.key];
                    const platformOn = !sw || sw.enabled;
                    return (
                      <tr key={f.key} className="border-t">
                        <td className="py-2 pr-4">
                          <div className="font-medium">{f.name}</div>
                          <div className="text-xs text-muted-foreground">{f.description}</div>
                          {!platformOn && (
                            <div className="text-xs text-destructive mt-1">
                              Off for every agency{sw?.reason ? `: ${sw.reason}` : ''}{sw?.updatedBy ? ` (${sw.updatedBy})` : ''}
                            </div>
                          )}
                        </td>
                        {data.plans.map((p) => (
                          <td key={p.key} className="px-3 py-2 text-center">
                            <Switch
                              on={p.features.includes(f.key)}
                              label={`${f.name} on ${p.name}`}
                              disabled={busy === `${p.key}:${f.key}`}
                              onClick={() => togglePlan(p, f)}
                            />
                          </td>
                        ))}
                        <td className="px-3 py-2 text-center">
                          <Switch on={platformOn} label={`${f.name} platform-wide`} disabled={busy === `platform:${f.key}`} onClick={() => togglePlatform(f, platformOn)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))
      )}

      {data && data.unregistered.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Not in the registry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">These keys are on a plan but no feature uses them. Remove them from the plan.</p>
            <div className="flex flex-wrap gap-2">
              {data.unregistered.map((k) => (
                <Badge key={k} variant="outline">{k}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
