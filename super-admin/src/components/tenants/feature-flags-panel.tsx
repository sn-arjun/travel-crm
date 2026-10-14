'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RotateCcw, Save } from 'lucide-react';

interface Feature {
  key: string;
  enabled: boolean;
  isOverride: boolean;
  planDefault: boolean;
}

function labelFor(key: string): string {
  return key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** Feature flags per agency (GET/PUT/DELETE /admin/tenants/:id/features). The list comes from the plan catalogue. */
export function FeatureFlagsPanel({ tenantId }: { tenantId: string }) {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [plan, setPlan] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
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
    setDirty(false);
  }, [tenantId]);

  useEffect(() => { fetchFeatures(); }, [fetchFeatures]);

  const toggleFeature = (key: string) => {
    setFeatures(features.map((f) => (f.key === key ? { ...f, enabled: !f.enabled } : f)));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    // Only differences from the plan default (or existing overrides) are stored as overrides.
    const changes: Record<string, boolean> = {};
    features.forEach((f) => {
      if (f.isOverride || f.enabled !== f.planDefault) changes[f.key] = f.enabled;
    });
    if (Object.keys(changes).length > 0) {
      const res = await fetch(`/api/tenants/${tenantId}/features`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features: changes }),
      });
      if (!res.ok) setMessage(((await res.json()) as { error?: string }).error || 'Save failed');
    }
    await fetchFeatures();
    setSaving(false);
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reset to Plan Defaults
          </Button>
          {dirty && (
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="mr-2 h-3.5 w-3.5" /> {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {message && <p className="mb-3 text-sm text-destructive">{message}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {features.map((feature) => (
            <div key={feature.key} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <span className="text-sm font-medium">{labelFor(feature.key)}</span>
                {feature.isOverride && <Badge variant="outline" className="ml-2 text-xs">Custom</Badge>}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={feature.enabled}
                aria-label={labelFor(feature.key)}
                onClick={() => toggleFeature(feature.key)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  feature.enabled ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    feature.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
