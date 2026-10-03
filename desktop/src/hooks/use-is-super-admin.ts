'use client';

import { useEffect, useState } from 'react';
import { client } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Platform super admins live in the master registry, not in the tenant `role`
 * column, so only the backend can say who one is. GET /admin/whoami answers
 * for the signed-in user: { success: true, data: { isSuperAdmin: boolean } }.
 *
 * Any failure (404 while the endpoint is not deployed, 401, 403, offline)
 * resolves to `false` silently so the Super Admin link just stays hidden.
 */
const WHOAMI_ENDPOINT = '/admin/whoami';
const STORAGE_PREFIX = 'travelcrm:is-super-admin:';

/** Resolved answers for this page load, keyed by user id. */
const resolved = new Map<string, boolean>();
const inflight = new Map<string, Promise<boolean>>();

function readSession(userId: string): boolean | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + userId);
    return raw === null ? null : raw === '1';
  } catch {
    return null;
  }
}

function writeSession(userId: string, value: boolean): void {
  try {
    window.sessionStorage.setItem(STORAGE_PREFIX + userId, value ? '1' : '0');
  } catch {
    // Storage can be unavailable (private mode); the in-memory cache still applies.
  }
}

/** Looks the answer up once per session and caches it. Never rejects. */
export function fetchIsSuperAdmin(userId: string): Promise<boolean> {
  const known = resolved.get(userId);
  if (known !== undefined) return Promise.resolve(known);

  const stored = typeof window !== 'undefined' ? readSession(userId) : null;
  if (stored !== null) {
    resolved.set(userId, stored);
    return Promise.resolve(stored);
  }

  const pending = inflight.get(userId);
  if (pending) return pending;

  const request = client
    .get<{ success?: boolean; data?: { isSuperAdmin?: boolean } }>(WHOAMI_ENDPOINT)
    .then((res) => {
      const value = res?.data?.isSuperAdmin === true;
      resolved.set(userId, value);
      writeSession(userId, value);
      return value;
    })
    .catch(() => {
      // Remember the failure for this page load only, so a later session retries.
      resolved.set(userId, false);
      return false;
    })
    .finally(() => {
      inflight.delete(userId);
    });

  inflight.set(userId, request);
  return request;
}

/** Test helper: forget every cached answer. */
export function resetIsSuperAdminCache(): void {
  resolved.clear();
  inflight.clear();
  try {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith(STORAGE_PREFIX)) window.sessionStorage.removeItem(key);
    }
  } catch {
    // Nothing to clear.
  }
}

export function useIsSuperAdmin(): { isSuperAdmin: boolean; loading: boolean } {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [state, setState] = useState<{ userId: string | null; value: boolean } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void fetchIsSuperAdmin(userId).then((value) => {
      if (!cancelled) setState({ userId, value });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!userId) return { isSuperAdmin: false, loading: false };
  if (!state || state.userId !== userId) return { isSuperAdmin: false, loading: true };
  return { isSuperAdmin: state.value, loading: false };
}
