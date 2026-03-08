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
}

interface FeatureFlagsPanelProps {
  tenantId: string;
}

const FEATURE_CATEGORIES: Record<string, { label: string; features: string[] }> = {
  operations: {
    label: 'Operations',
    features: ['fleet_management', 'driver_app', 'visa_management', 'supplier_management'],
  },
  communication: {
    label: 'Communication',
    features: ['bulk_sms', 'bulk_whatsapp', 'bulk_email'],
  },
  marketing: {
    label: 'Marketing & Reports',
    features: ['marketing_flyers', 'advanced_reports'],
  },
  ai_voip: {
    label: 'AI & VoIP',
    features: ['voip_calling', 'ai_assistant', 'ai_chatbot', 'ai_intelligence', 'ai_extraction', 'whatsapp_campaigns'],
  },
  advanced: {
    label: 'Advanced',
    features: ['api_access', 'custom_domain', 'white_label', 'priority_support'],
  },
};

const FEATURE_LABELS: Record<string, string> = {
  fleet_management: 'Fleet Management',
  driver_app: 'Driver App',
  bulk_sms: 'Bulk SMS',
  bulk_whatsapp: 'Bulk WhatsApp',
  bulk_email: 'Bulk Email',
  marketing_flyers: 'Marketing Flyers',
  visa_management: 'Visa Management',
  supplier_management: 'Supplier Management',
  advanced_reports: 'Advanced Reports',
  api_access: 'API Access',
  custom_domain: 'Custom Domain',
  white_label: 'White Label',
  priority_support: 'Priority Support',
  voip_calling: 'VoIP Calling (Twilio/Plivo)',
  ai_assistant: 'AI Assistant',
  ai_chatbot: 'AI Chatbot',
  ai_intelligence: 'AI Intelligence',
  ai_extraction: 'AI Call Extraction',
  whatsapp_campaigns: 'WhatsApp Campaigns',
};

export function FeatureFlagsPanel({ tenantId }: FeatureFlagsPanelProps) {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [plan, setPlan] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchFeatures = useCallback(async () => {
    const res = await fetch(`/api/tenants/${tenantId}/features`);
    const data = (await res.json()) as { features: Feature[]; plan: string };
    setFeatures(data.features || []);
    setPlan(data.plan || '');
    setDirty(false);
  }, [tenantId]);

  useEffect(() => { fetchFeatures(); }, [fetchFeatures]);

  const toggleFeature = (key: string) => {
    setFeatures(features.map((f) =>
      f.key === key ? { ...f, enabled: !f.enabled } : f
    ));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const featureMap: Record<string, boolean> = {};
    features.forEach((f) => { featureMap[f.key] = f.enabled; });

    await fetch(`/api/tenants/${tenantId}/features`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features: featureMap }),
    });

    setSaving(false);
    setDirty(false);
  };

  const handleReset = async () => {
    await fetch(`/api/tenants/${tenantId}/features`, { method: 'DELETE' });
    await fetchFeatures();
  };

  const featureMap = Object.fromEntries(features.map((f) => [f.key, f]));

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
        <div className="space-y-6">
          {Object.entries(FEATURE_CATEGORIES).map(([catKey, cat]) => (
            <div key={catKey}>
              <h4 className="text-sm font-semibold mb-3 text-muted-foreground">{cat.label}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {cat.features.map((fKey) => {
                  const feature = featureMap[fKey];
                  if (!feature) return null;
                  return (
                    <div
                      key={fKey}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div>
                        <span className="text-sm font-medium">{FEATURE_LABELS[fKey] || fKey}</span>
                        {feature.isOverride && (
                          <Badge variant="outline" className="ml-2 text-xs">Custom</Badge>
                        )}
                      </div>
                      <button
                        onClick={() => toggleFeature(fKey)}
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
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
