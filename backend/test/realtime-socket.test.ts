import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

let token = '';

describe('Realtime socket', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset')).status).toBe(200);
    const login = await call('POST', '/auth/login', { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    token = ((await login.json()) as any).data.accessToken;
  });

  it('refuses a connection without a valid token', async () => {
    expect((await call('GET', '/ws?userId=anyone', undefined, { Upgrade: 'websocket' })).status).toBe(401);
    expect((await call('GET', '/ws?token=not-a-token', undefined, { Upgrade: 'websocket' })).status).toBe(401);
  });

  it('delivers workspace events to a client that connected with its token', async () => {
    const res = await call('GET', `/ws?token=${encodeURIComponent(token)}&userId=someone-else`, undefined, { Upgrade: 'websocket' });
    expect(res.status).toBe(101);
    const socket = res.webSocket!;
    socket.accept();

    const received: Array<{ type: string; data?: Record<string, unknown>; userId?: string }> = [];
    socket.addEventListener('message', (event) => {
      received.push(JSON.parse(event.data as string));
    });

    const sent = await call('POST', '/test/inbound', { tenantId: TENANT_ID, channel: 'whatsapp', from: '+919800000001', body: 'Planning a Goa trip, 3 nights, please share a quote' });
    expect(sent.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const types = received.map((m) => m.type);
    expect(types).toContain('connected');
    expect(types).toContain('message:received');
    // The suggestion raised by the message is announced too, so open screens can show it.
    expect(types).toContain('assistant:suggestion');
    socket.close();
  });
});
