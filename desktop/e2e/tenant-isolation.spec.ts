import { test, expect } from './fixtures';
import { API_URL } from './helpers/auth';
import {
  type Agency,
  apiLogin,
  completeFirstLogin,
  createAgency,
  createSuperAdminToken,
  signInViaUI,
} from './helpers/tenants';

/**
 * Tier 1 exit test (R121): three agencies on three plans, provisioned through the real admin API, cannot see each
 * other's leads, files, settings or live updates, and plan gates follow each agency's own plan.
 * Needs the multi-tenant stack: `node scripts/fix-stack.mjs up --slot N --reset-db --multi` (demo + 3 pool databases).
 */

test.use({ storageState: undefined });

const RUN = Date.now().toString(36);
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const WS_QUIET_MS = 3_000;

type Key = 'A' | 'B' | 'C';
interface Fixture {
  agency: Agency;
  leadId: string;
  leadTitle: string;
  contactName: string;
  fileKey: string;
  company: string;
}

const PLANS: Record<Key, 'basic' | 'pro' | 'enterprise'> = { A: 'basic', B: 'pro', C: 'enterprise' };
const ctx = {} as Record<Key, Fixture>;
const KEYS: Key[] = ['A', 'B', 'C'];
const others = (k: Key): Key[] => KEYS.filter((x) => x !== k);

function auth(k: Key): Record<string, string> {
  return { Authorization: `Bearer ${ctx[k].agency.accessToken}` };
}

async function get(k: Key, path: string): Promise<{ status: number; text: string; json: any }> {
  const res = await fetch(`${API_URL}${path}`, { headers: auth(k) });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON (a served file) */
  }
  return { status: res.status, text, json };
}

/** A realtime socket exactly as the desktop opens it: token in the query string. Collects every message. */
async function openSocket(k: Key): Promise<{ messages: string[]; close: () => void }> {
  const wsUrl = `${API_URL.replace(/^http/, 'ws')}/ws?userId=ignored&token=${encodeURIComponent(ctx[k].agency.accessToken!)}`;
  const ws = new WebSocket(wsUrl);
  const messages: string[] = [];
  ws.addEventListener('message', (e) => messages.push(String(e.data)));
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`socket of ${k} did not open`)), 15_000);
    ws.addEventListener('open', () => {
      clearTimeout(t);
      resolve();
    });
    ws.addEventListener('error', () => {
      clearTimeout(t);
      reject(new Error(`socket of ${k} errored`));
    });
  });
  return { messages, close: () => ws.close() };
}

async function waitFor(cond: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return cond();
}

async function changeLeadStatus(k: Key, status: string) {
  const res = await fetch(`${API_URL}/leads/${ctx[k].leadId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...auth(k) },
    body: JSON.stringify({ status }),
  });
  expect(res.status, await res.clone().text()).toBe(200);
}

test.describe('Tenant isolation: three agencies, three plans', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    const sa = await createSuperAdminToken(API_URL);
    for (const k of KEYS) {
      const slug = `iso-${k.toLowerCase()}-${RUN}`;
      const created = await createAgency(API_URL, sa, { plan: PLANS[k], slug, companyName: `Provisioned ${k} ${RUN}` });
      const agency = await completeFirstLogin(API_URL, created);
      const company = `Isolation Co ${k} ${RUN}`;
      const bearer = `Bearer ${agency.accessToken}`;
      const headers = { 'Content-Type': 'application/json', Authorization: bearer };

      const set = await fetch(`${API_URL}/settings/company`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ company_name: company, company_city: `City${k}` }),
      });
      expect(set.status).toBe(200);

      const contactName = `Contact ${k} ${RUN}`;
      const contact = await fetch(`${API_URL}/contacts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: contactName, type: 'customer', phone: '+919876543210' }),
      });
      expect(contact.status, await contact.clone().text()).toBe(201);
      const contactId = ((await contact.json()) as any).data.id;

      const leadTitle = `Secret Lead ${k} ${RUN}`;
      const lead = await fetch(`${API_URL}/leads`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contactId,
          title: leadTitle,
          destinations: [`Dest${k}`],
          travelDate: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
          tripType: 'domestic',
          source: 'website',
        }),
      });
      expect(lead.status, await lead.clone().text()).toBe(201);
      const leadId = ((await lead.json()) as any).data.id;

      const form = new FormData();
      form.append('file', new Blob([PNG_1X1], { type: 'image/png' }), `isolation-${k}.png`);
      const up = await fetch(`${API_URL}/files/upload`, { method: 'POST', headers: { Authorization: bearer }, body: form });
      expect(up.status, await up.clone().text()).toBe(200);
      const fileKey = ((await up.json()) as any).data.key as string;
      expect(fileKey.startsWith(`${agency.tenantId}/`)).toBe(true);

      ctx[k] = { agency, leadId, leadTitle, contactName, fileKey, company };
    }
    expect(new Set(KEYS.map((k) => ctx[k].agency.tenantId)).size).toBe(3);
  });

  test('the three agencies are on their own plans', async () => {
    for (const k of KEYS) {
      const { body } = await apiLogin(API_URL, ctx[k].agency, ctx[k].agency.password!);
      expect(body.data.tenant.id).toBe(ctx[k].agency.tenantId);
      expect(body.data.tenant.plan.key ?? body.data.tenant.plan).toBe(PLANS[k]);
    }
  });

  test("leads: each agency sees only its own and cannot read or change another agency's lead by id", async () => {
    for (const k of KEYS) {
      const own = await get(k, '/leads?limit=100');
      expect(own.status).toBe(200);
      expect(own.text).toContain(ctx[k].leadTitle);
      for (const o of others(k)) {
        expect(own.text).not.toContain(ctx[o].leadTitle);
        expect(own.text).not.toContain(ctx[o].leadId);
        const byId = await get(k, `/leads/${ctx[o].leadId}`);
        expect(byId.status, `${k} reading ${o}'s lead`).toBe(404);
        expect(byId.text).not.toContain(ctx[o].leadTitle);
        const put = await fetch(`${API_URL}/leads/${ctx[o].leadId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...auth(k) },
          body: JSON.stringify({ status: 'contacted' }),
        });
        expect(put.status, `${k} changing ${o}'s lead status`).toBe(404);
        const del = await fetch(`${API_URL}/leads/${ctx[o].leadId}`, { method: 'DELETE', headers: auth(k) });
        expect(del.status, `${k} deleting ${o}'s lead`).toBe(404);
      }
      const contacts = await get(k, '/contacts?limit=100');
      expect(contacts.text).toContain(ctx[k].contactName);
      for (const o of others(k)) expect(contacts.text).not.toContain(ctx[o].contactName);
    }
    // The refused foreign writes above did not remove or alter anything.
    for (const k of KEYS) {
      const own = await get(k, `/leads/${ctx[k].leadId}`);
      expect(own.status).toBe(200);
      expect(own.text).toContain('"new"');
    }
  });

  test("files: own key is served, another agency's key answers 403 for GET and DELETE", async () => {
    for (const k of KEYS) {
      const own = await fetch(`${API_URL}/files/${ctx[k].fileKey}`, { headers: auth(k) });
      expect(own.status).toBe(200);
      expect(own.headers.get('content-type')).toContain('image/png');
      for (const o of others(k)) {
        const foreign = await fetch(`${API_URL}/files/${ctx[o].fileKey}`, { headers: auth(k) });
        expect(foreign.status, `${k} GET ${o}'s file`).toBe(403);
        const encoded = await fetch(`${API_URL}/files/${encodeURIComponent(ctx[o].fileKey)}`, { headers: auth(k) });
        expect(encoded.status, `${k} GET encoded ${o}'s file`).toBe(403);
        const del = await fetch(`${API_URL}/files/${ctx[o].fileKey}`, { method: 'DELETE', headers: auth(k) });
        expect(del.status, `${k} DELETE ${o}'s file`).toBe(403);
      }
    }
    // Nothing was deleted by the refused attempts.
    for (const k of KEYS) expect((await fetch(`${API_URL}/files/${ctx[k].fileKey}`, { headers: auth(k) })).status).toBe(200);
  });

  test('settings: each agency has its own company settings and a write stays in its agency', async () => {
    for (const k of KEYS) {
      const s = await get(k, '/settings/company');
      expect(s.status).toBe(200);
      expect(s.json.data.company_name).toBe(ctx[k].company);
      expect(s.json.data.company_city).toBe(`City${k}`);
      for (const o of others(k)) expect(s.text).not.toContain(ctx[o].company);
    }
    const put = await fetch(`${API_URL}/settings/company`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...auth('A') },
      body: JSON.stringify({ company_city: `Changed${RUN}` }),
    });
    expect(put.status).toBe(200);
    expect((await get('A', '/settings/company')).json.data.company_city).toBe(`Changed${RUN}`);
    for (const o of ['B', 'C'] as Key[]) expect((await get(o, '/settings/company')).json.data.company_city).toBe(`City${o}`);
  });

  test('logins do not cross agencies', async () => {
    const wrongTenant = await apiLogin(API_URL, { ...ctx.A.agency, tenantId: ctx.B.agency.tenantId }, ctx.A.agency.password!);
    expect(wrongTenant.status).toBe(401);
  });

  test("plan gates follow each agency's own plan", async () => {
    // ai_intelligence is an enterprise-only feature in the plan catalogue (R109).
    for (const k of ['A', 'B'] as Key[]) {
      const gated = await get(k, '/ai/intelligence/anything');
      expect(gated.status, `${PLANS[k]} must be refused`).toBe(403);
      expect(gated.json.upgrade).toBe(true);
      expect(gated.json.currentPlan).toBe(PLANS[k]);
    }
    const open = await get('C', '/ai/intelligence/anything');
    expect(open.status, 'enterprise passes the gate').not.toBe(403);
  });

  test("realtime: a broadcast in one agency is not received by another agency's socket", async () => {
    const sockets = { A: await openSocket('A'), B: await openSocket('B'), C: await openSocket('C') };
    try {
      await new Promise((r) => setTimeout(r, 500)); // let any greeting land before the baseline
      const base = { A: sockets.A.messages.length, B: sockets.B.messages.length, C: sockets.C.messages.length };

      await changeLeadStatus('B', 'contacted');
      expect(await waitFor(() => sockets.B.messages.some((m) => m.includes(ctx.B.leadId)), 10_000), 'B receives its own event').toBe(true);
      await new Promise((r) => setTimeout(r, WS_QUIET_MS));
      expect(sockets.A.messages.slice(base.A), 'A received nothing from B').toEqual([]);
      expect(sockets.C.messages.slice(base.C), 'C received nothing from B').toEqual([]);

      // And the other way round: A's event reaches A only.
      const baseB = sockets.B.messages.length;
      await changeLeadStatus('A', 'contacted');
      expect(await waitFor(() => sockets.A.messages.some((m) => m.includes(ctx.A.leadId)), 10_000), 'A receives its own event').toBe(true);
      await new Promise((r) => setTimeout(r, WS_QUIET_MS));
      expect(sockets.B.messages.slice(baseB), 'B received nothing from A').toEqual([]);
      expect(sockets.C.messages.slice(base.C), 'C received nothing from A or B').toEqual([]);
    } finally {
      for (const s of Object.values(sockets)) s.close();
    }
    const bad = await fetch(`${API_URL}/ws?token=nope`);
    expect(bad.status).toBe(401);
  });

  test("UI: agency A's leads page shows only A's lead", async ({ page }) => {
    await signInViaUI(page, ctx.A.agency);
    await page.goto('/leads');
    await expect(page.getByText(ctx.A.leadTitle).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(ctx.B.leadTitle)).toHaveCount(0);
    await expect(page.getByText(ctx.C.leadTitle)).toHaveCount(0);
    // Searching for another agency's lead finds nothing.
    await page.getByPlaceholder(/Search leads/i).fill(ctx.B.leadTitle);
    await expect(page.getByText(ctx.A.leadTitle)).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText(ctx.B.leadTitle)).toHaveCount(0);
  });
});
