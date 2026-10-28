import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';

async function call(method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

describe('GET /invoices keeps credit notes out of the default list', () => {
  let admin = '';
  let invoiceId = '';
  let creditNoteId = '';

  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    admin = ((await login.json()) as any).data.accessToken;

    const contact = await call('POST', '/contacts', admin, { name: 'Invoice List Type Co', phone: '9000007001', type: 'customer' });
    const contactId = ((await contact.json()) as any).data.id;
    const inv = await call('POST', '/invoices', admin, { contactId, items: [{ description: 'Tour', quantity: 1, rate: 1000, taxRate: 0 }] });
    expect(inv.status).toBe(201);
    invoiceId = ((await inv.json()) as any).data.id;
    const cn = await call('POST', '/credit-notes', admin, {
      invoiceId, reason: 'Refund', items: [{ description: 'Refund', quantity: 1, rate: 100, taxRate: 0 }],
    });
    expect(cn.status).toBe(201);
    creditNoteId = ((await cn.json()) as any).data.id;
  });

  async function ids(query: string): Promise<string[]> {
    const res = await call('GET', `/invoices${query}`, admin);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    return (body.data?.items ?? body.data ?? body.items ?? []).map((r: any) => r.id);
  }

  it('lists invoices but not credit notes by default', async () => {
    const list = await ids('?limit=100');
    expect(list).toContain(invoiceId);
    expect(list).not.toContain(creditNoteId);
  });

  it('?type=credit_note returns only credit notes', async () => {
    const list = await ids('?limit=100&type=credit_note');
    expect(list).toContain(creditNoteId);
    expect(list).not.toContain(invoiceId);
  });

  it('?type=all returns both', async () => {
    const list = await ids('?limit=100&type=all');
    expect(list).toContain(invoiceId);
    expect(list).toContain(creditNoteId);
  });
});
