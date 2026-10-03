import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { normalizePhone, phoneLookupVariants } from '../src/utils/phone';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';

async function call(method: string, path: string, token: string, body?: unknown): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost/api/v1${path}`, init), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

let token = '';

describe('Travellers: email, phone and frequent flyer numbers', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    const ctx = createExecutionContext();
    const reset = await worker.fetch(new Request('http://localhost/api/v1/test/reset', { method: 'POST' }), testEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect(reset.status).toBe(200);

    const ctx2 = createExecutionContext();
    const login = await worker.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID }),
      }),
      testEnv,
      ctx2,
    );
    await waitOnExecutionContext(ctx2);
    expect(login.status).toBe(200);
    token = ((await login.json()) as any).data.accessToken;
  });

  it('round-trips email and phone through POST, GET detail and GET list', async () => {
    const create = await call('POST', '/travellers', token, {
      firstName: 'Meera',
      lastName: 'Iyer',
      email: 'meera.iyer@example.com',
      phone: '9820144562',
      passportNumber: 'Z1234567',
      passportExpiryDate: '2032-04-01',
    });
    expect(create.status).toBe(201);
    const created: any = await create.json();
    const id = created.data.id;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/); // UUIDv7
    expect(created.data.email).toBe('meera.iyer@example.com');
    expect(created.data.phone).toBe('+919820144562');

    const detail = await call('GET', `/travellers/${id}`, token);
    expect(detail.status).toBe(200);
    const d: any = await detail.json();
    expect(d.data.email).toBe('meera.iyer@example.com');
    expect(d.data.phone).toBe('+919820144562');
    expect(d.data.first_name).toBe('Meera'); // existing snake_case envelope unchanged
    expect(d.data.passport_expiry_date).toBe('2032-04-01');

    const list = await call('GET', '/travellers?search=meera.iyer', token);
    const l: any = await list.json();
    expect(l.data.data.some((t: any) => t.id === id && t.email === 'meera.iyer@example.com' && t.phone === '+919820144562')).toBe(true);
  });

  it('rejects a malformed email but accepts an empty one', async () => {
    const bad = await call('POST', '/travellers', token, { firstName: 'A', lastName: 'B', email: 'not-an-email' });
    expect(bad.status).toBe(400);

    const empty = await call('POST', '/travellers', token, { firstName: 'Empty', lastName: 'Email', email: '', phone: '' });
    expect(empty.status).toBe(201);
    const id = ((await empty.json()) as any).data.id;
    const d: any = await (await call('GET', `/travellers/${id}`, token)).json();
    expect(d.data.email).toBeNull();
    expect(d.data.phone).toBeNull();
  });

  it('updates email, phone and frequent flyer numbers on PUT', async () => {
    const create = await call('POST', '/travellers', token, { firstName: 'Kiran', lastName: 'Rao' });
    const id = ((await create.json()) as any).data.id;

    const put = await call('PUT', `/travellers/${id}`, token, {
      email: 'kiran.rao@example.com',
      phone: '+91 98450 44153',
      frequentFlyerNumbers: 'AI123456',
    });
    expect(put.status).toBe(200);
    const p: any = await put.json();
    expect(p.data.email).toBe('kiran.rao@example.com');
    expect(p.data.phone).toBe('+919845044153');
    expect(p.data.frequent_flyer_numbers).toBe('AI123456');

    // singular alias maps to the same column; arrays are stored as a JSON string
    const put2 = await call('PUT', `/travellers/${id}`, token, { frequentFlyerNumber: 'EK777' });
    expect(put2.status).toBe(200);
    expect(((await put2.json()) as any).data.frequent_flyer_numbers).toBe('EK777');

    const put3 = await call('PUT', `/travellers/${id}`, token, { frequentFlyerNumbers: ['AI1', 'EK2'] });
    expect(((await put3.json()) as any).data.frequent_flyer_numbers).toBe('["AI1","EK2"]');

    const d: any = await (await call('GET', `/travellers/${id}`, token)).json();
    expect(d.data.frequent_flyer_numbers).toBe('["AI1","EK2"]');
  });

  it('stores frequent flyer numbers sent on create', async () => {
    const create = await call('POST', '/travellers', token, {
      firstName: 'Dev', lastName: 'Patel', frequentFlyerNumbers: '6E99887',
    });
    expect(create.status).toBe(201);
    const id = ((await create.json()) as any).data.id;
    const d: any = await (await call('GET', `/travellers/${id}`, token)).json();
    expect(d.data.frequent_flyer_numbers).toBe('6E99887');
  });
});

describe('phone utils', () => {
  it('normalizePhone produces E.164', () => {
    expect(normalizePhone('9876543210')).toBe('+919876543210');
    expect(normalizePhone('09876543210')).toBe('+919876543210');
    expect(normalizePhone('919876543210')).toBe('+919876543210');
    expect(normalizePhone('+91 98765-43210')).toBe('+919876543210');
    expect(normalizePhone('+14155550123')).toBe('+14155550123');
    expect(normalizePhone('')).toBe('');
  });

  it('phoneLookupVariants returns unique [e164, last 10, digits]', () => {
    expect(phoneLookupVariants('9876543210')).toEqual(['+919876543210', '9876543210', '919876543210']);
    expect(phoneLookupVariants('+919876543210')).toEqual(['+919876543210', '9876543210', '919876543210']);
    expect(phoneLookupVariants('')).toEqual([]);
  });
});
