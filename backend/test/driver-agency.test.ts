import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';

const baseEnv = env as any;

async function get(path: string, opts: { ip?: string; bindings?: Record<string, unknown> } = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.ip) headers['CF-Connecting-IP'] = opts.ip;
  const e = opts.bindings ? { ...baseEnv, ...opts.bindings } : baseEnv;
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost${path}`, { method: 'GET', headers }), e, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function setTenant(id: string, name: string, subdomain: string, status: string, provisioning = 'active') {
  await baseEnv.MASTER_DB.prepare(
    `INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status, provisioning_status, created_at, updated_at)
     VALUES (?, ?, ?, 'pro', ?, ?, datetime('now'), datetime('now'))`,
  ).bind(id, name, subdomain, status, provisioning).run();
  await baseEnv.CACHE.delete(`tenant:v2:${id}`);
}

describe('Driver agency-code lookup (R115)', () => {
  beforeAll(async () => {
    await applyD1Migrations(baseEnv.MASTER_DB, baseEnv.TEST_MIGRATIONS);
    const reset = await worker.fetch(
      new Request('http://localhost/api/v1/test/reset', { method: 'POST' }),
      baseEnv,
      createExecutionContext(),
    );
    expect(reset.status).toBe(200);
    await setTenant('01960000-0000-7000-8000-0000000000a1', 'Sahyadri Holidays', 'sahyadri', 'active');
    await setTenant('01960000-0000-7000-8000-0000000000a2', 'Trial Travels', 'trialco', 'trial');
    await setTenant('01960000-0000-7000-8000-0000000000a3', 'Suspended Tours', 'suspendedco', 'suspended');
    await setTenant('01960000-0000-7000-8000-0000000000a4', 'Expired Tours', 'expiredco', 'expired');
    await setTenant('01960000-0000-7000-8000-0000000000a5', 'Half Built', 'halfbuilt', 'active', 'migrating');
  });

  it('resolves a known code to the agency id and display name, no auth needed', async () => {
    const res = await get('/api/v1/driver/agency/sahyadri', { ip: '10.1.0.1' });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Sahyadri Holidays');
    expect(body.data.tenantId).toBe('01960000-0000-7000-8000-0000000000a1');
    // Nothing beyond id, name and logo.
    expect(Object.keys(body.data).sort()).toEqual(['logoUrl', 'name', 'tenantId']);
  });

  it('is case-insensitive and trims whitespace, and also serves the /api/driver alias', async () => {
    const res = await get('/api/driver/agency/%20SaHyAdRi%20', { ip: '10.1.0.2' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).data.name).toBe('Sahyadri Holidays');
  });

  it('resolves a trial agency', async () => {
    const res = await get('/api/v1/driver/agency/trialco', { ip: '10.1.0.3' });
    expect(res.status).toBe(200);
  });

  it('answers 404 with the same body for unknown, malformed, suspended, expired and half-provisioned codes', async () => {
    const bodies: string[] = [];
    for (const code of ['nosuchagency', 'bad_code!', 'suspendedco', 'expiredco', 'halfbuilt', 'x'.repeat(200)]) {
      const res = await get(`/api/v1/driver/agency/${encodeURIComponent(code)}`, { ip: '10.1.0.4' });
      expect(res.status, code).toBe(404);
      bodies.push(JSON.stringify(await res.json()));
    }
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).not.toMatch(/suspended|expired|provision/i);
  });

  it('allows 10 lookups per minute per IP and answers the 11th with 429', async () => {
    const bindings = { RATE_LIMIT_MULTIPLIER: '1' };
    for (let i = 0; i < 10; i++) {
      const res = await get('/api/v1/driver/agency/nosuchagency', { ip: '10.2.0.9', bindings });
      expect(res.status).toBe(404);
    }
    const blocked = await get('/api/v1/driver/agency/sahyadri', { ip: '10.2.0.9', bindings });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
    // Another address is unaffected.
    const other = await get('/api/v1/driver/agency/sahyadri', { ip: '10.2.0.10', bindings });
    expect(other.status).toBe(200);
  });

  it('resolves the seeded demo agency by its slug', async () => {
    const res = await get('/api/v1/driver/agency/demo', { ip: '10.1.0.5' });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data.name).toBe('Demo Travels');
  });
});
