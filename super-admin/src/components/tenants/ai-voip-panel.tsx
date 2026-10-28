'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';

interface UsageCap {
  id?: string;
  capKey: string;
  capValue: number;
  currentUsage: number;
  resetPeriod: string;
  lastResetAt: string | null;
  usagePercent: number;
}

interface AiVoipPanelProps {
  tenantId: string;
  currentPlan: string;
}

const CAP_LABELS: Record<string, { label: string; unit: string; description: string }> = {
  ai_actions_per_day: { label: 'AI Actions / Day', unit: 'actions', description: 'AI requests (assistant, extraction, intelligence)' },
  ai_tokens_per_month: { label: 'AI Tokens / Month', unit: 'tokens', description: 'Model tokens used by AI features' },
  voip_minutes_per_month: { label: 'Call Minutes / Month', unit: 'minutes', description: 'Inbound and outbound call minutes' },
  whatsapp_messages_per_month: { label: 'WhatsApp Messages / Month', unit: 'messages', description: 'WhatsApp messages sent via campaigns or direct' },
  email_sends_per_month: { label: 'Emails / Month', unit: 'emails', description: 'Emails sent through the communication hub' },
  sms_per_month: { label: 'SMS / Month', unit: 'messages', description: 'SMS messages sent' },
  storage_gb: { label: 'Storage (GB)', unit: 'GB', description: 'File storage for recordings and documents' },
};

export function AiVoipPanel({ tenantId, currentPlan }: AiVoipPanelProps) {
  const [caps, setCaps] = useState<UsageCap[]>([]);
  const [editCaps, setEditCaps] = useState<Record<string, number>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [planChanging, setPlanChanging] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(currentPlan);
  const [plans, setPlans] = useState<Array<{ key: string; name: string }>>([]);
  const [message, setMessage] = useState('');

  const fetchCaps = useCallback(async () => {
    const res = await fetch(`/api/tenants/${tenantId}/caps`);
    const data = (await res.json()) as { caps: UsageCap[]; error?: string };
    if (!res.ok) {
      setMessage(data.error || 'Could not load caps');
      return;
    }
    setCaps(data.caps || []);

    const edits: Record<string, number> = {};
    (data.caps || []).forEach((c) => { edits[c.capKey] = c.capValue; });
    // Add missing keys with default 0
    Object.keys(CAP_LABELS).forEach((key) => {
      if (!(key in edits)) edits[key] = 0;
    });
    setEditCaps(edits);
    setDirty(false);
  }, [tenantId]);

  useEffect(() => { fetchCaps(); }, [fetchCaps]);
  useEffect(() => {
    fetch('/api/catalogue')
      .then(async (res) => {
        if (!res.ok) return;
        const json = (await res.json()) as { plans: Array<{ key: string; name: string; isActive: boolean }> };
        setPlans(json.plans.filter((p) => p.isActive).map((p) => ({ key: p.key, name: p.name })));
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => { setSelectedPlan(currentPlan); }, [currentPlan]);

  const handleCapChange = (key: string, value: number) => {
    setEditCaps((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSaveCaps = async () => {
    setSaving(true);
    const current = Object.fromEntries(caps.map((c) => [c.capKey, c.capValue]));
    const capsToSave = Object.entries(editCaps)
      .filter(([key, val]) => (current[key] ?? 0) !== val)
      .map(([capKey, capValue]) => ({
        capKey,
        capValue,
        resetPeriod: capKey.endsWith('_per_day') ? 'daily' : 'monthly',
      }));

    if (capsToSave.length > 0) {
      const res = await fetch(`/api/tenants/${tenantId}/caps`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caps: capsToSave }),
      });
      if (!res.ok) setMessage(((await res.json()) as { error?: string }).error || 'Save failed');
    }

    await fetchCaps();
    setSaving(false);
  };

  const handlePlanChange = async () => {
    if (selectedPlan === currentPlan) return;
    setPlanChanging(true);
    const res = await fetch(`/api/tenants/${tenantId}/plan`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: selectedPlan }),
    });
    setPlanChanging(false);
    if (!res.ok) {
      setMessage(((await res.json()) as { error?: string }).error || 'Plan change failed');
      return;
    }
    window.location.reload();
  };

  const planOrder = plans.map((p) => p.key);
  const currentIdx = planOrder.indexOf(currentPlan);

  const capsMap = Object.fromEntries(caps.map((c) => [c.capKey, c]));

  return (
    <div className="space-y-6">
      {/* Plan Upgrade/Downgrade */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan Management</CardTitle>
          <CardDescription>
            Current plan: <Badge className="capitalize">{currentPlan}</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label>Change Plan</Label>
              <select
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedPlan}
                onChange={(e) => setSelectedPlan(e.target.value)}
              >
                {plans.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                    {p.key === currentPlan ? ' (Current)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <Button
              onClick={handlePlanChange}
              disabled={selectedPlan === currentPlan || planChanging}
              className="mb-0.5"
            >
              {planOrder.indexOf(selectedPlan) > currentIdx ? (
                <ArrowUpCircle className="mr-2 h-4 w-4" />
              ) : (
                <ArrowDownCircle className="mr-2 h-4 w-4" />
              )}
              {planChanging ? 'Changing...' : selectedPlan === currentPlan ? 'No Change' :
                planOrder.indexOf(selectedPlan) > currentIdx ? 'Upgrade' : 'Downgrade'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            The plan change is recorded in the audit log. Seats follow the new plan&apos;s included users plus any extra-user add-ons.
          </p>
        </CardContent>
      </Card>

      {message && <p className="text-sm text-destructive">{message}</p>}

      {/* Usage Caps */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Usage Caps</CardTitle>
            <CardDescription>
              Hard limits per agency. Set to 0 for no cap. AI credits and channel packs are managed under Usage &amp; add-ons.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {dirty && (
              <Button size="sm" onClick={handleSaveCaps} disabled={saving}>
                <Save className="mr-2 h-3.5 w-3.5" /> {saving ? 'Saving...' : 'Save Caps'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(CAP_LABELS).map(([key, meta]) => {
              const cap = capsMap[key];
              const usage = cap?.currentUsage || 0;
              const limit = editCaps[key] || 0;
              const pct = limit > 0 ? Math.min(100, Math.round((usage / limit) * 100)) : 0;

              return (
                <div key={key} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-sm font-medium">{meta.label}</span>
                      <p className="text-xs text-muted-foreground">{meta.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm tabular-nums">
                        {usage.toLocaleString()} / {limit > 0 ? limit.toLocaleString() : '∞'}
                      </span>
                      {limit > 0 && (
                        <Badge variant={pct >= 90 ? 'destructive' : pct >= 75 ? 'secondary' : 'outline'}>
                          {pct}%
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  {limit > 0 && (
                    <div className="h-2 rounded-full bg-muted mb-3">
                      <div
                        className={`h-full rounded-full transition-all ${
                          pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Label className="text-xs w-16">Limit:</Label>
                    <Input
                      type="number"
                      min={0}
                      value={editCaps[key] ?? 0}
                      onChange={(e) => handleCapChange(key, parseInt(e.target.value) || 0)}
                      className="w-32 h-8 text-sm"
                    />
                    <span className="text-xs text-muted-foreground">{meta.unit}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
