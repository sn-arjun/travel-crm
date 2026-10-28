/**
 * Showcase fixtures: like e2e/fixtures.ts, but the session belongs to the demo user (ananya.menon@example.com, the one
 * constant DEMO_EMAIL in demo-data.ts), minted fresh through the API for every test so no recording ever has to refresh a token.
 */
import { test as base, expect } from '@playwright/test';

import { DEMO_EMAIL, DEMO_PASSWORD, TENANT_ID } from './demo-data';

export { expect };

const API_URL = (process.env.E2E_API_URL ?? 'http://localhost:8787/api/v1').replace(/\/+$/, '');
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';

async function mint(): Promise<{ cookies: []; origins: { origin: string; localStorage: { name: string; value: string }[] }[] }> {
  let last = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD, tenantId: TENANT_ID }),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: { accessToken?: string; refreshToken?: string; user?: unknown; tenant?: unknown } };
    const d = json.data;
    if (d?.accessToken && d.refreshToken) {
      const state = { accessToken: d.accessToken, refreshToken: d.refreshToken, isAuthenticated: true, user: d.user, tenant: d.tenant };
      return { cookies: [], origins: [{ origin: new URL(BASE_URL).origin, localStorage: [{ name: 'travelcrm-auth', value: JSON.stringify({ state, version: 0 }) }] }] };
    }
    last = `${res.status} ${JSON.stringify(json)}`;
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  throw new Error(`showcase login failed for ${DEMO_EMAIL}: ${last}`);
}

export const test = base.extend({
  storageState: async ({}, provide) => {
    await provide(await mint());
  },
});
