'use client';

import * as React from 'react';
import { aiApi, type AiFeatureFlag, type AiSettingsData } from '@/lib/api/ai';

interface AiFeatureState {
  loading: boolean;
  plan: string | null;
  features: AiFeatureFlag[];
  voipCalling: AiSettingsData['voipCalling'] | null;
  usageCaps: Record<string, { limit: number; used: number; remaining: number; percentUsed: number }>;
  provider: { anthropic: boolean; cloudflare: boolean; defaultProvider: string } | null;
  error: string | null;
  refetch: () => void;
}

// Shared cache so multiple components don't all re-fetch
let cachedSettings: AiSettingsData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000; // 1 minute

async function fetchSettings(): Promise<AiSettingsData | null> {
  const now = Date.now();
  if (cachedSettings && now - cacheTimestamp < CACHE_TTL) {
    return cachedSettings;
  }
  try {
    const res = await aiApi.settings.get();
    if (res && 'data' in res && res.data) {
      cachedSettings = res.data as AiSettingsData;
      cacheTimestamp = now;
      return cachedSettings;
    }
  } catch {
    // Non-critical
  }
  return null;
}

export function invalidateAiSettingsCache() {
  cachedSettings = null;
  cacheTimestamp = 0;
}

/**
 * Hook to get all AI features and settings for the current tenant.
 */
export function useAiSettings(): AiFeatureState {
  const [settings, setSettings] = React.useState<AiSettingsData | null>(cachedSettings);
  const [loading, setLoading] = React.useState(!cachedSettings);
  const [error, setError] = React.useState<string | null>(null);

  const fetch = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSettings();
      setSettings(data);
    } catch (e) {
      setError((e as Error).message || 'Failed to load AI settings');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { fetch(); }, [fetch]);

  // Another screen changed something that settings report (for example calling was turned on): load again.
  React.useEffect(() => {
    const onInvalidated = () => { void fetch(); };
    window.addEventListener(AI_SETTINGS_INVALIDATED_EVENT, onInvalidated);
    return () => window.removeEventListener(AI_SETTINGS_INVALIDATED_EVENT, onInvalidated);
  }, [fetch]);

  return {
    loading,
    plan: settings?.plan ?? null,
    features: settings?.aiFeatures ?? [],
    voipCalling: settings?.voipCalling ?? null,
    usageCaps: settings?.usageCaps ?? {},
    provider: settings?.provider ?? null,
    error,
    refetch: () => {
      invalidateAiSettingsCache();
      fetch();
    },
  };
}

/**
 * Hook to check if a specific AI feature is enabled.
 * Returns { enabled, loading, tier, plan }.
 */
export function useAiFeature(featureKey: string): {
  enabled: boolean;
  loading: boolean;
  tier: 'pro' | 'enterprise' | null;
  plan: string | null;
} {
  const { features, plan, loading } = useAiSettings();

  const feature = features.find(f => f.key === featureKey);

  return {
    enabled: feature?.enabled ?? false,
    loading,
    tier: feature?.tier ?? null,
    plan,
  };
}

/**
 * Hook to check usage quota for a specific cap key.
 */
export function useAiUsageCap(capKey: string): {
  loading: boolean;
  limit: number;
  used: number;
  remaining: number;
  percentUsed: number;
  isExhausted: boolean;
} {
  const { usageCaps, loading } = useAiSettings();
  const cap = usageCaps[capKey];

  return {
    loading,
    limit: cap?.limit ?? 0,
    used: cap?.used ?? 0,
    remaining: cap?.remaining ?? 0,
    percentUsed: cap?.percentUsed ?? 0,
    isExhausted: cap ? cap.remaining <= 0 : false,
  };
}
