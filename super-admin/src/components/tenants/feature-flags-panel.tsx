'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { RotateCcw } from 'lucide-react';

type Source = 'platform' | 'override' | 'plan';
type Choice = 'plan' | 'on' | 'off';

interface Feature {
  key: string;
  name: string;
  area: string | null;
  enabled: boolean;
  source: Source;
  override: boolean | null;
  planDefault: boolean;
  platformOff: boolean;
}

const SOURCE_LABEL: Record<Source, string> = {
  platform: 'Off for every agency',
  override: 'Agency override',
  plan: 'From plan',
};

function choiceOf(f: Feature): Choice {
  return f.override === null ? 'plan' : f.override ? 'on' : 'off';
}

/**
 * Feature switches for one agency (GET/PUT/DELETE /admin/tenants/:id/features). Each feature shows its effective state and
 * where it comes from (plan, agency override, or the platform switch), and can be set to on, off or follow the plan.
 */
export function FeatureFlagsPanel({ tenantId }: { tenantId: string }) {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [plan, setPlan] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const fetchFeatures = useCallback(async () => {
    const res = await fetch(`/api/tenants/${tenantId}/features`);
    const data = (await res.json()) as { features?: Feature[]; plan?: string; error?: string };
    if (!res.ok) {
      setMessage(data.error || 'Could not load features');
      return;
    }
    setMessage('');
    setFeatures(data.features || []);
    setPlan(data.plan || '');
  }, [tenantId]);

  useEffect(() => { fetchFeatures(); }, [fetchFeatures]);

  const setChoice = async (key: string, choice: Choice) => {
    setBusy(key);
    const value = choice === 'plan' ? null : choice === 'on';
    const res = await fetch(`/api/tenants/${tenantId}/features`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features: { [key]: value }, ...(reason.trim() ? { reason: reason.trim() } : {}) }),
    });
    if (!res.ok) setMessage(((await res.json().catch(() => ({}))) as { error?: string }).error || 'Save failed');
    await fetchFeatures();
    setBusy('');
  };

  const handleReset = async () => {
    await fetch(`/api/tenants/${tenantId}/features`, { method: 'DELETE' });
    await fetchFeatures();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Feature Flags</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Current plan: <Badge variant="outline" className="capitalize">{plan}</Badge>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleReset}>
          <RotateCcw className="mr-2 h-3.5 w-3.5" /> Follow plan for all
        </Button>
      </CardHeader>
      <CardContent>
        <Input
          className="mb-3 max-w-md"
          placeholder="Reason for the change (kept in the audit log)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="Reason"
        />
        {message && <p className="mb-3 text-sm text-destructive">{message}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {features.map((feature) => (
            <div key={feature.key} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{feature.name}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge variant={feature.enabled ? 'default' : 'secondary'} className="text-xs">{feature.enabled ? 'On' : 'Off'}</Badge>
                  <Badge variant="outline" className="text-xs">{SOURCE_LABEL[feature.source]}</Badge>
                </div>
              </div>
              <select
                className="rounded-md border bg-background px-2 py-1 text-sm"
                aria-label={`${feature.name} setting`}
                value={choiceOf(feature)}
                disabled={busy === feature.key}
                onChange={(e) => setChoice(feature.key, e.target.value as Choice)}
              >
                <option value="plan">Follow plan ({feature.planDefault ? 'on' : 'off'})</option>
                <option value="on">Always on</option>
                <option value="off">Always off</option>
              </select>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
