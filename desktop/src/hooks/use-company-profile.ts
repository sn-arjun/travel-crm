'use client';

import { useEffect, useState } from 'react';
import { settingsApi, type CompanySettings } from '@/lib/api/settings';
import { useAuthStore } from '@/stores/auth-store';

const TTL_MS = 60_000;

interface CacheEntry {
  key: string;
  at: number;
  promise: Promise<CompanySettings | null>;
}

let cache: CacheEntry | null = null;

function load(key: string): Promise<CompanySettings | null> {
  if (cache && cache.key === key && Date.now() - cache.at < TTL_MS) return cache.promise;
  const promise = settingsApi.company
    .get()
    .then((res) => (res.data ?? null) as CompanySettings | null)
    .catch(() => null);
  const entry: CacheEntry = { key, at: Date.now(), promise };
  cache = entry;
  // A failed lookup must not stick for the whole TTL
  void promise.then((value) => {
    if (value === null && cache === entry) cache = null;
  });
  return promise;
}

/** Drop the cached company profile (e.g. after the company settings are saved). */
export function invalidateCompanyProfile(): void {
  cache = null;
}

/**
 * The tenant's company profile (name, phone, email ...), read from the settings API and cached
 * briefly. The login response carries no tenant object, so this is the source for
 * `{{company_name}}` and friends. Returns null until loaded or when the lookup fails.
 */
export function useCompanyProfile(enabled = true): CompanySettings | null {
  const token = useAuthStore((s) => s.accessToken);
  const tenantId = useAuthStore((s) => s.tenant?.id) ?? '';
  const [profile, setProfile] = useState<CompanySettings | null>(null);

  useEffect(() => {
    if (!enabled || !token) return;
    let cancelled = false;
    void load(tenantId).then((value) => {
      if (!cancelled && value) setProfile(value);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, token, tenantId]);

  return profile;
}
