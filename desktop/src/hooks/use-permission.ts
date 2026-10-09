'use client';

import { useEffect, useState } from 'react';
import { client } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Role permissions come from the backend matrix (GET /users/me/permissions), so the
 * desktop never keeps its own copy of who may do what. Until the answer arrives, and
 * on any failure, every check is `false`: an action stays hidden rather than being
 * offered and then refused by the API.
 */
export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'export' | 'import';
export type PermissionMap = Record<string, PermissionAction[]>;

const PERMISSIONS_ENDPOINT = '/users/me/permissions';

/** Resolved maps for this page load, keyed by user id + role. */
const resolved = new Map<string, PermissionMap>();
const inflight = new Map<string, Promise<PermissionMap>>();

function cacheKey(userId: string, role: string): string {
  return `${userId}:${role}`;
}

/** Fetches the signed-in user's permission map once and caches it. Never rejects. */
export function fetchPermissions(userId: string, role: string): Promise<PermissionMap> {
  const key = cacheKey(userId, role);
  const known = resolved.get(key);
  if (known) return Promise.resolve(known);

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = client
    .get<{ data?: { permissions?: PermissionMap } }>(PERMISSIONS_ENDPOINT)
    .then((res) => {
      const map = res?.data?.permissions ?? {};
      resolved.set(key, map);
      return map;
    })
    .catch(() => ({}) as PermissionMap)
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, request);
  return request;
}

/** Test helper: forget every cached answer. */
export function resetPermissionCache(): void {
  resolved.clear();
  inflight.clear();
}

export interface UsePermissionsResult {
  /** True once the role's permissions are known. */
  loaded: boolean;
  can: (module: string, action: PermissionAction) => boolean;
}

export function usePermissions(): UsePermissionsResult {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const role = useAuthStore((s) => (s.user?.role as string | undefined) ?? null);
  const key = userId && role ? cacheKey(userId, role) : null;

  const [state, setState] = useState<{ key: string | null; map: PermissionMap | null }>(() => ({
    key,
    map: key ? resolved.get(key) ?? null : null,
  }));

  useEffect(() => {
    if (!userId || !role || !key) return;
    let cancelled = false;
    fetchPermissions(userId, role).then((map) => {
      if (!cancelled) setState({ key, map });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, role, key]);

  // A map fetched for a previous user must not answer for the current one.
  const map = state.key === key ? state.map : null;

  return {
    loaded: map !== null,
    can: (module, action) => map?.[module]?.includes(action) ?? false,
  };
}

/** `usePermission('invoices', 'create')` — may the signed-in user do this? */
export function usePermission(module: string, action: PermissionAction): boolean {
  return usePermissions().can(module, action);
}
