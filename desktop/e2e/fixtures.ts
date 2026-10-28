/**
 * Shared Playwright fixtures for the desktop e2e suite.
 *
 * Refresh tokens are single-use. If every test context started from the one
 * storage state written by global-setup, the first context that refreshed
 * (after the 15-minute access-token TTL) would burn the shared refresh token and
 * every later context would be bounced to /login. Instead each worker mints a
 * fresh session through the API and re-mints it before it can get near expiry,
 * so no test ever needs to refresh.
 *
 * `test.use({ storageState: undefined })` in a spec still yields a logged-out
 * context.
 */
import * as fs from 'fs';
import * as path from 'path';

import { test as base, expect, type BrowserContextOptions, type Page, type BrowserContext, type Locator, type APIRequestContext } from '@playwright/test';

import { API_URL, ADMIN_EMAIL, ADMIN_PASSWORD, TENANT_ID, BASE_URL } from './helpers/auth';

export { expect };
export type { Page, BrowserContext, Locator, APIRequestContext };

const AUTH_KEY = 'travelcrm-auth';
const TEMPLATE_PATH = path.join(__dirname, '.auth', 'admin.json');
// Access tokens live 15 minutes and the app refreshes proactively inside the last 2.
// 8 minutes leaves a wide margin even for a 90s test that starts at the end of the window.
const DEFAULT_MAX_AGE_MS = 8 * 60_000;

interface LocalStorageEntry {
  name: string;
  value: string;
}
interface OriginState {
  origin: string;
  localStorage: LocalStorageEntry[];
}
export type AuthState = Exclude<NonNullable<BrowserContextOptions['storageState']>, string> & {
  origins: OriginState[];
};

interface LoginData {
  accessToken: string;
  refreshToken: string;
  user?: unknown;
  tenant?: unknown;
}

function maxAgeMs(): number {
  const raw = Number(process.env.E2E_AUTH_MAX_AGE_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_AGE_MS;
}

function loadTemplate(): AuthState {
  try {
    const parsed = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8')) as Partial<AuthState>;
    return { cookies: parsed.cookies ?? [], origins: parsed.origins ?? [] };
  } catch {
    return { cookies: [], origins: [] };
  }
}

async function login(): Promise<LoginData> {
  let lastError = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, tenantId: TENANT_ID }),
      });
      const json = (await res.json().catch(() => ({}))) as { data?: Partial<LoginData> };
      if (json.data?.accessToken && json.data.refreshToken) return json.data as LoginData;
      lastError = `${res.status} ${JSON.stringify(json)}`;
    } catch (err) {
      lastError = String(err);
    }
    await new Promise((r) => setTimeout(r, 1_000 * attempt));
  }
  throw new Error(`e2e fixtures: API login failed: ${lastError}`);
}

async function mintAuthState(): Promise<AuthState> {
  const tokens = await login();
  const state = loadTemplate();
  const origin = new URL(BASE_URL).origin;

  // Reuse the persisted shape from the UI login (global-setup) when present.
  const existing = state.origins.flatMap((o) => o.localStorage).find((e) => e.name === AUTH_KEY);
  let persisted: { state?: Record<string, unknown>; version?: number } = {};
  try {
    if (existing) persisted = JSON.parse(existing.value);
  } catch {
    persisted = {};
  }
  const nextState: Record<string, unknown> = {
    ...(persisted.state ?? {}),
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    isAuthenticated: true,
  };
  if (tokens.user) nextState.user = tokens.user;
  if (tokens.tenant) nextState.tenant = tokens.tenant;
  const value = JSON.stringify({ state: nextState, version: persisted.version ?? 0 });

  // The session lives on exactly one origin: the one under test (the template may have
  // been written for another port).
  const own = state.origins.find((o) => o.origin === origin);
  const ownStorage = (own?.localStorage ?? []).filter((e) => e.name !== AUTH_KEY);
  const others = state.origins
    .filter((o) => o.origin !== origin)
    .map((o) => ({ ...o, localStorage: o.localStorage.filter((e) => e.name !== AUTH_KEY) }))
    .filter((o) => o.localStorage.length > 0);
  state.origins = [...others, { origin, localStorage: [...ownStorage, { name: AUTH_KEY, value }] }];
  return state;
}

// Module scope = one cache per Playwright worker process.
let cache: { state: AuthState; mintedAt: number } | null = null;
let inflight: Promise<AuthState> | null = null;

/** A storage state whose tokens are fresh enough that no test will have to refresh them. */
export async function freshAuthState(): Promise<AuthState> {
  if (cache && Date.now() - cache.mintedAt < maxAgeMs()) return structuredClone(cache.state);
  inflight ??= mintAuthState()
    .then((state) => {
      cache = { state, mintedAt: Date.now() };
      return state;
    })
    .finally(() => {
      inflight = null;
    });
  return structuredClone(await inflight);
}

/** Forget the cached session. Call after `/test/reset`: it replaces the user rows, so a session minted before it names a user that no longer exists. */
export function invalidateAuthState(): void {
  cache = null;
}

export const test = base.extend({
  // The callback is named `provide`, not `use`: the react-hooks lint rule mistakes `use(...)` for a React hook.
  storageState: async ({}, provide) => {
    await provide(await freshAuthState());
  },
});
