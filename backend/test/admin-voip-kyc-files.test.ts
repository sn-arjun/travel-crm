import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import worker from '../src/index';
import { superAdminToken } from './utils/super-admin';

// R151-carry: the super admin console opens the files an agency uploaded for its number application.
// GET /admin/tenants/:id/voip/documents/:country/files/:index streams one file of that agency's own document set.

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const OTHER_TENANT = '0196b151-0000-7000-8000-0000000000b1';
const SA_ID = '0196b151-0000-7000-8000-0000000000a1';
const PDF = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10]); // "%PDF-1.4\n"
const KEY_A = `${TENANT_ID}/kyc/r151-extract.pdf`;
const KEY_A_HTML = `${TENANT_ID}/kyc/r151-note.html`;
const KEY_B = `${OTHER_TENANT}/kyc/r151-secret.pdf`;

async function call(method: string, path: string, token: string | null): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost/api/v1${path}`, { method, headers }), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const db = () => testEnv.MASTER_DB as D1Database;
const file = (i: number, country = 'NL', tenant = TENANT_ID) => `/admin/tenants/${tenant}/voip/documents/${country}/files/${i}`;
const opens = async () =>
  ((await db().prepare("SELECT COUNT(*) AS n FROM super_admin_audit_log WHERE action = 'voip.documents.file_open'").first()) as any).n as number;

let sa = '';
let agencyAdmin = '';

async function seedDoc(tenantId: string, country: string, files: unknown[]) {
  await db()
    .prepare(
      `INSERT OR REPLACE INTO number_documents (id, tenant_id, country, status, details, files) VALUES (?, ?, ?, 'pending', '{}', ?)`,
    )
    .bind(`r151-doc-${tenantId.slice(-2)}-${country}`, tenantId, country, JSON.stringify(files))
    .run();
}

beforeAll(async () => {
  await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
  expect((await call('POST', '/test/reset', null)).status).toBe(200);
  await db()
    .prepare(`INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status) VALUES (?, 'R151 other agency', 'r151-other', 'pro', 'active')`)
    .bind(OTHER_TENANT)
    .run();
  await testEnv.FILE_STORAGE.put(KEY_A, PDF, { httpMetadata: { contentType: 'application/pdf' } });
  await testEnv.FILE_STORAGE.put(KEY_A_HTML, '<script>alert(1)</script>', { httpMetadata: { contentType: 'text/html' } });
  await testEnv.FILE_STORAGE.put(KEY_B, new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: 'application/pdf' } });

  await seedDoc(TENANT_ID, 'NL', [
    { name: 'kvk extract.pdf', key: KEY_A, field: 'registrationExtract', contentType: 'application/pdf' },
    { name: 'old-link.pdf', url: 'https://files.example.test/old.pdf', field: 'registrationExtract' },
    { name: 'note.html', key: KEY_A_HTML, field: 'other' },
    // A row that points outside this agency's own folder must never be served.
    { name: 'tampered.pdf', key: KEY_B, field: 'other' },
    { name: 'traversal.pdf', key: `${TENANT_ID}/kyc/../privacy/export.zip`, field: 'other' },
  ]);
  await seedDoc(OTHER_TENANT, 'NL', [{ name: 'secret.pdf', key: KEY_B, field: 'registrationExtract', contentType: 'application/pdf' }]);

  sa = await superAdminToken(testEnv, { id: SA_ID, email: 'r151-sa@test.local' });
  const login = await fetchLogin();
  agencyAdmin = login;
});

async function fetchLogin(): Promise<string> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID }),
    }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return ((await res.json()) as any).data.accessToken;
}

afterAll(async () => {
  await db().prepare("DELETE FROM number_documents WHERE id LIKE 'r151-doc-%'").run();
  await db().prepare('DELETE FROM tenants WHERE id = ?').bind(OTHER_TENANT).run();
  for (const key of [KEY_A, KEY_A_HTML, KEY_B]) await testEnv.FILE_STORAGE.delete(key);
});

describe('super admin opens an uploaded number document', () => {
  it('streams the file to a super admin and records the open in the audit log', async () => {
    const before = await opens();
    const res = await call('GET', file(0), sa);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('inline');
    expect(res.headers.get('content-disposition')).toContain('kvk extract.pdf');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');

    expect(await opens()).toBe(before + 1);
    const log = (await db()
      .prepare("SELECT entity_id, details FROM super_admin_audit_log WHERE action = 'voip.documents.file_open' ORDER BY created_at DESC LIMIT 1")
      .first()) as any;
    expect(log.entity_id).toBe(TENANT_ID);
    expect(log.details).toContain('kvk extract.pdf');
    expect(log.details).toContain('r151-sa@test.local');
    // The storage key is not copied into the log.
    expect(log.details).not.toContain('/kyc/');
  });

  it('shows only upload types inline: anything else downloads as an opaque file', async () => {
    const res = await call('GET', file(2), sa);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(res.headers.get('content-disposition')).toContain('attachment');
  });

  it('refuses an agency user, other tokens and no token, and records nothing', async () => {
    const before = await opens();
    expect((await call('GET', file(0), agencyAdmin)).status).toBeGreaterThanOrEqual(401);
    expect((await call('GET', file(0), agencyAdmin)).status).toBeLessThan(500);
    expect((await call('GET', file(0), 'not-a-token')).status).toBeGreaterThanOrEqual(401);
    expect((await call('GET', file(0), null)).status).toBe(401);
    expect(await opens()).toBe(before);
  });

  it('only opens files of that agency\'s own document set', async () => {
    const before = await opens();
    // A row that points at another agency's object, or climbs out of the folder, is refused.
    expect((await call('GET', file(3), sa)).status).toBe(403);
    expect((await call('GET', file(4), sa)).status).toBe(403);
    // The other agency's file is reachable only through the other agency's own set.
    const own = await call('GET', file(0, 'NL', OTHER_TENANT), sa);
    expect(own.status).toBe(200);
    expect(new Uint8Array(await own.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    // Past the end of the list, not a number, a link-only entry, an unknown country or tenant: nothing to open.
    expect((await call('GET', file(1, 'NL', OTHER_TENANT), sa)).status).toBe(404);
    expect((await call('GET', file(7), sa)).status).toBe(404);
    expect((await call('GET', file('x' as any), sa)).status).toBe(404);
    expect((await call('GET', file(1), sa)).status).toBe(404);
    expect((await call('GET', file(0, 'DE'), sa)).status).toBe(404);
    expect((await call('GET', file(0, 'NL', '0196b151-0000-7000-8000-00000000dead'), sa)).status).toBe(404);
    // Only the successful open of the other agency's own file was recorded.
    expect(await opens()).toBe(before + 1);
  });

  it('reports a stored file that has gone missing as 404', async () => {
    await testEnv.FILE_STORAGE.delete(KEY_A_HTML);
    expect((await call('GET', file(2), sa)).status).toBe(404);
    await testEnv.FILE_STORAGE.put(KEY_A_HTML, '<p>x</p>', { httpMetadata: { contentType: 'text/html' } });
  });
});
