'use client';

import * as React from 'react';

import { useAiSettings } from './use-ai-feature';

/**
 * Plan-gated features. The backend enforces these in middleware and returns
 * 403 — the UI anticipates that rather than reacting to it, so a 403 never
 * surfaces as an error toast.
 */
export type GatedFeature =
  | 'voip_calling'
  | 'ai_assistant'
  | 'ai_extraction'
  | 'ai_intelligence'
  | 'ai_chatbot'
  | 'whatsapp_campaigns'
  | 'group_departures'
  | 'public_booking'
  | 'coach_trips'
  | 'age_band_pricing'
  | 'margin_scheme'
  | 'quote_acceptance';

export type FeatureGateReason = 'ok' | 'platform_disabled' | 'not_in_plan' | 'cap_exceeded' | 'country_unavailable';

export interface FeatureGate {
  enabled: boolean;
  reason: FeatureGateReason;
  upgradeHref: string;
  /** True while plan/settings are still loading — render a skeleton, not a gate. */
  loading: boolean;
}

/**
 * Usage-cap key for each gated feature, when the feature is metered.
 * Features absent from this map are plan-gated only.
 */
const CAP_KEYS: Partial<Record<GatedFeature, string>> = {
  ai_assistant: 'ai_requests',
  ai_extraction: 'ai_extractions',
  ai_intelligence: 'ai_requests',
  ai_chatbot: 'chatbot_messages',
  whatsapp_campaigns: 'whatsapp_messages',
};

/** Plan + usage live on the AI settings page; there is no separate billing page. */
export const UPGRADE_HREF = '/settings/ai';

/**
 * Resolve whether a plan-gated feature may be used.
 *
 * Gated surfaces render a disabled or upgrade state — they must not call the
 * endpoint and let it 403.
 *
 * @example
 * const { enabled, reason, upgradeHref } = useFeatureGate('voip_calling');
 * if (!enabled) {
 *   return <UpgradePrompt reason={reason} href={upgradeHref} />;
 * }
 * return <CallButton />;
 */
export function useFeatureGate(feature: GatedFeature): FeatureGate {
  const { features, usageCaps, voipCalling, loading } = useAiSettings();

  return React.useMemo(() => {
    // While loading, report disabled but reason 'ok' so callers show a
    // skeleton rather than an upgrade prompt that may be wrong.
    if (loading) {
      return { enabled: false, reason: 'ok' as const, upgradeHref: UPGRADE_HREF, loading: true };
    }

    // Calling is resold only in some countries: there is nothing to upgrade to elsewhere.
    if (feature === 'voip_calling' && voipCalling && !voipCalling.available) {
      return { enabled: false, reason: 'country_unavailable' as const, upgradeHref: UPGRADE_HREF, loading: false };
    }

    const flag = features.find((f) => f.key === feature);
    // Switched off for every agency: show the locked state, but there is no plan to upgrade to.
    if (flag?.platformDisabled) {
      return { enabled: false, reason: 'platform_disabled' as const, upgradeHref: UPGRADE_HREF, loading: false };
    }
    if (!flag?.enabled) {
      return {
        enabled: false,
        reason: 'not_in_plan' as const,
        upgradeHref: UPGRADE_HREF,
        loading: false,
      };
    }

    const capKey = CAP_KEYS[feature];
    if (capKey) {
      const cap = usageCaps[capKey];
      if (cap && cap.remaining <= 0) {
        return {
          enabled: false,
          reason: 'cap_exceeded' as const,
          upgradeHref: UPGRADE_HREF,
          loading: false,
        };
      }
    }

    return { enabled: true, reason: 'ok' as const, upgradeHref: UPGRADE_HREF, loading: false };
  }, [feature, features, usageCaps, voipCalling, loading]);
}

/**
 * False only once settings have loaded and say the agency's country is outside the calling allow-list.
 * Navigation, settings cards and the call buttons use it to hide calling entirely.
 */
export function useCallingOffered(): boolean {
  const { voipCalling, loading } = useAiSettings();
  return loading || !voipCalling || voipCalling.available;
}

/**
 * True when the given error is a plan-gate 403. Callers should swallow these
 * rather than toasting them.
 */
export function isFeatureGateError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && 'status' in err && (err as { status: number }).status === 403
  );
}
