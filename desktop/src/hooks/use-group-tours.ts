'use client';

import * as React from 'react';

import { departuresApi, type GroupToursSettings } from '@/lib/api/departures';
import { useAuthStore } from '@/stores/auth-store';
import { useFeatureGate, type FeatureGateReason } from './use-feature-gate';

/**
 * The two layers that switch group departures on (design section 2).
 *   available: the plan has the feature (platform side, `group_departures`).
 *   enabled:   available AND the agency admin switched Settings > Group tours on.
 * Nothing in the group tours area renders, and no call is made, unless `enabled`. The agency settings are read only when
 * `available` (the API refuses them otherwise), once per sign-in and shared by every component that asks.
 */
export interface UseGroupTours {
  available: boolean;
  enabled: boolean;
  /** True while the plan or the settings are still loading: show a skeleton, not a gate. */
  loading: boolean;
  settings: GroupToursSettings | null;
  reason: FeatureGateReason;
  upgradeHref: string;
  /** Reloads the settings from the API. */
  refresh: () => Promise<void>;
}

export const GROUP_TOURS_CHANGED_EVENT = 'travelcrm:group-tours-changed';

let cache: { userId: string; settings: GroupToursSettings | null } | null = null;
let inflight: Promise<GroupToursSettings | null> | null = null;

/** Tells every mounted hook the settings changed (the sidebar shows or hides the entries at once). */
export function publishGroupToursSettings(settings: GroupToursSettings | null, userId?: string): void {
  cache = { userId: userId ?? cache?.userId ?? useAuthStore.getState().user?.id ?? '', settings };
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(GROUP_TOURS_CHANGED_EVENT));
}

/** Test helper: forget the cached settings. */
export function resetGroupToursCache(): void {
  cache = null;
  inflight = null;
}

async function load(userId: string, force: boolean): Promise<GroupToursSettings | null> {
  if (!force && cache && cache.userId === userId) return cache.settings;
  if (!inflight || force) {
    inflight = departuresApi
      .getSettings()
      .then((s) => s)
      .catch(() => null) // not allowed or not reachable: the area stays hidden, nothing to toast
      .then((s) => {
        cache = { userId, settings: s };
        return s;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useGroupTours(): UseGroupTours {
  const gate = useFeatureGate('group_departures');
  const userId = useAuthStore((s) => s.user?.id ?? '');
  const available = gate.enabled;
  const [settings, setSettings] = React.useState<GroupToursSettings | null>(cache && cache.userId === userId ? cache.settings : null);
  const [loaded, setLoaded] = React.useState(Boolean(cache && cache.userId === userId));

  const refresh = React.useCallback(async () => {
    if (!available || !userId) return;
    const s = await load(userId, true);
    setSettings(s);
    setLoaded(true);
    publishGroupToursSettings(s, userId);
  }, [available, userId]);

  React.useEffect(() => {
    if (!available || !userId) return;
    let cancelled = false;
    void load(userId, false).then((s) => {
      if (cancelled) return;
      setSettings(s);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [available, userId]);

  React.useEffect(() => {
    const onChanged = () => {
      if (cache && cache.userId === userId) {
        setSettings(cache.settings);
        setLoaded(true);
      }
    };
    window.addEventListener(GROUP_TOURS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(GROUP_TOURS_CHANGED_EVENT, onChanged);
  }, [userId]);

  return {
    available,
    enabled: available && loaded && settings?.enabled === true,
    loading: gate.loading || (available && !loaded),
    settings: available ? settings : null,
    reason: gate.reason,
    upgradeHref: gate.upgradeHref,
    refresh,
  };
}
