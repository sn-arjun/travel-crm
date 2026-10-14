import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations, runInDurableObject } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { signAccessToken } from '../src/utils/jwt';
import { broadcastToTenant } from '../src/utils/realtime';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const OTHER_TENANT = '0198aaaa-0000-7000-8000-0000000000b1';

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

  async function connect(tok: string) {
    const res = await call('GET', `/ws?token=${encodeURIComponent(tok)}`, undefined, { Upgrade: 'websocket' });
    expect(res.status).toBe(101);
    const socket = res.webSocket!;
    socket.accept();
    const received: Array<{ type: string; data?: Record<string, unknown> }> = [];
    socket.addEventListener("message", (event) => { received.push(JSON.parse(event.data as string)); });
    return { socket, received };
  }
  const room = (tenantId: string) => testEnv.REALTIME.get(testEnv.REALTIME.idFromName(tenantId));
  const wait = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

  describe('hibernation API', () => {
    it('broadcast reaches sockets accepted through acceptWebSocket (listed by state.getWebSockets)', async () => {
      const a = await connect(token);
      const b = await connect(token);
      const sockets: number = await (runInDurableObject as any)(room(TENANT_ID), async (_instance: any, state: DurableObjectState) => state.getWebSockets().length);
      expect(sockets).toBeGreaterThanOrEqual(2);
      await broadcastToTenant(testEnv, TENANT_ID, { type: 'hibernation:test', data: { n: 1 } });
      await wait();
      expect(a.received.map((m) => m.type)).toContain('hibernation:test');
      expect(b.received.map((m) => m.type)).toContain('hibernation:test');
      a.socket.close();
      b.socket.close();
    });

    it('answers {"type":"ping"} with pong without invoking webSocketMessage; other messages do reach the handler', async () => {
      const { socket, received } = await connect(token);
      const before = await runInDurableObject(room(TENANT_ID), async (instance: any) => instance.messageHandlerCalls as number);
      socket.send(JSON.stringify({ type: 'ping' }));
      await wait();
      expect(received.map((m) => m.type)).toContain('pong');
      const afterPing = await runInDurableObject(room(TENANT_ID), async (instance: any) => instance.messageHandlerCalls as number);
      expect(afterPing).toBe(before);

      socket.send(JSON.stringify({ type: 'ping', extra: true })); // not an exact match: handled by the class
      await wait();
      const afterOther = await runInDurableObject(room(TENANT_ID), async (instance: any) => instance.messageHandlerCalls as number);
      expect(afterOther).toBe(before + 1);
      expect(received.filter((m) => m.type === 'pong').length).toBe(2);
      socket.close();
    });

    it("a broadcast for tenant A never reaches tenant B's sockets, and sendToUser stays with its user", async () => {
      const tokenB = await signAccessToken({ userId: 'user-b-1', tenantId: OTHER_TENANT, role: 'admin', email: 'b@other.test' }, testEnv.JWT_SECRET);
      const a = await connect(token);
      const b = await connect(tokenB);
      await broadcastToTenant(testEnv, TENANT_ID, { type: 'only:tenant-a', data: {} });
      await broadcastToTenant(testEnv, OTHER_TENANT, { type: 'only:tenant-b', data: {} }, { targetUserId: 'user-b-1' });
      await wait();
      const typesA = a.received.map((m) => m.type);
      const typesB = b.received.map((m) => m.type);
      expect(typesA).toContain('only:tenant-a');
      expect(typesA).not.toContain('only:tenant-b');
      expect(typesB).toContain('only:tenant-b');
      expect(typesB).not.toContain('only:tenant-a');
      a.socket.close();
      b.socket.close();
    });
  });
});
