'use client';

import * as React from 'react';

import { settingsApi, type MarginSchemeSettings } from '@/lib/api/settings';
import { useFeatureGate } from './use-feature-gate';
import { usePermission } from './use-permission';

export interface MarginSchemeState {
  /** The feature is on for the plan (the setting may still be off). */
  featureOn: boolean;
  /** The agency's margin_scheme setting, once loaded. */
  scheme: MarginSchemeSettings | null;
  /** The feature is on and the agency switched the scheme on: invoices may use the margin regime. */
  available: boolean;
  /** Cost and margin are shown only to staff who can edit invoices. */
  canSeeCost: boolean;
  loading: boolean;
}

/**
 * The margin scheme (R152) as the invoice screens need it. The settings are read only when the feature is on, so an agency
 * without the feature never calls the endpoint and never sees an error.
 */
export function useMarginScheme(): MarginSchemeState {
  const gate = useFeatureGate('margin_scheme');
  const canSeeCost = usePermission('invoices', 'edit');
  const [scheme, setScheme] = React.useState<MarginSchemeSettings | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    if (gate.loading) return;
    if (!gate.enabled) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    settingsApi.marginScheme.get().then(
      (res) => {
        if (cancelled) return;
        setScheme(res && 'data' in res ? (res.data ?? null) : null);
        setLoaded(true);
      },
      () => {
        if (!cancelled) setLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [gate.loading, gate.enabled]);

  return {
    featureOn: gate.enabled,
    scheme,
    available: gate.enabled && !!scheme?.enabled,
    canSeeCost,
    loading: gate.loading || !loaded,
  };
}
