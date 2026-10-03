import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';

/**
 * Contract tests for the Flutter CRM app (packages/crm_app + packages/shared).
 *
 * The verify-phase backend commits changed several response/request shapes; these tests pin
 * the additive compatibility layer (both casings, legacy payloads) so the mobile app keeps
 * working, and cover the fresh-DB migration chain (opt-out columns, festival_campaigns).
 */

const testEnv = env as any;

const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';

async function request(
  method: string,
  path: string,
  token: string | null,
  body?: Record<string, unknown> | FormData,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const opts: RequestInit = { method, headers };
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost/api/v1${path}`, opts), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function login(email: string): Promise<string> {
  const res = await request('POST', '/auth/login', null, {
    email,
    password: 'password123',
    tenantId: TENANT_ID,
  });
  expect(res.status).toBe(200);
  const body: any = await res.json();
  return body.data.accessToken;
}

let adminToken = '';
let salesToken = '';

describe('Flutter CRM contract + fresh-DB migrations', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('http://localhost/api/v1/test/reset', { method: 'POST' }),
      testEnv,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);

    adminToken = await login('admin@e2e.test');
    salesToken = await login('sales@e2e.test');
  });

  // ── Migration chain ────────────────────────────────────────────

  describe('migrations (fresh DB)', () => {
    it('creates a contact (opt-out columns from 0030 exist)', async () => {
      const res = await request('POST', '/contacts', adminToken, {
        name: 'Contract Test Contact',
        email: 'contract.contact@example.com',
        phone: '+919812345678',
        type: 'customer',
      });
      expect(res.status).toBe(201);

      const cols: any = await testEnv.MASTER_DB.prepare('PRAGMA table_info(contacts)').all();
      const names = (cols.results as any[]).map((c) => c.name);
      expect(names).toEqual(expect.arrayContaining(['dnd_enabled', 'opted_out_at', 'opt_out_channel', 'opt_out_reason']));
    });

    it('rebuilt flyer tables (0033) and festival_campaigns (0035) exist', async () => {
      for (const table of ['flyer_templates', 'generated_flyers', 'flyer_shares', 'festival_campaigns']) {
        const row = await testEnv.MASTER_DB
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
          .bind(table)
          .first();
        expect(row, table).toBeTruthy();
      }
      const tplCols: any = await testEnv.MASTER_DB.prepare('PRAGMA table_info(flyer_templates)').all();
      expect((tplCols.results as any[]).map((c) => c.name)).toContain('preview_url');
    });
  });

  // ── Bookmarks ──────────────────────────────────────────────────

  describe('bookmarks', () => {
    const entityId = '0196aaaa-0000-7000-8000-00000000b001';
    let bookmarkId = '';

    it('creates a bookmark from a snake_case body (Flutter) with both casings in the response', async () => {
      const res = await request('POST', '/bookmarks', adminToken, {
        entity_type: 'lead',
        entity_id: entityId,
      });
      expect(res.status).toBe(201);
      const body: any = await res.json();
      bookmarkId = body.data.id;
      expect(body.data).toMatchObject({
        entity_type: 'lead',
        entityType: 'lead',
        entity_id: entityId,
        entityId,
        user_id: ADMIN_ID,
      });
      expect(typeof body.data.created_at).toBe('string');
      expect(body.data.createdAt).toBe(body.data.created_at);
    });

    it('rejects a duplicate bookmark', async () => {
      const res = await request('POST', '/bookmarks', adminToken, { entityType: 'lead', entityId });
      expect(res.status).toBe(409);
    });

    it('still accepts a camelCase body (desktop)', async () => {
      const res = await request('POST', '/bookmarks', adminToken, {
        entityType: 'contact',
        entityId: '0196aaaa-0000-7000-8000-00000000b002',
      });
      expect(res.status).toBe(201);
    });

    it('GET /check with snake_case query returns bookmarked + bookmark_id', async () => {
      const res = await request('GET', `/bookmarks/check?entity_type=lead&entity_id=${entityId}`, adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.bookmarked).toBe(true);
      expect(body.data.bookmark_id).toBe(bookmarkId);
      expect(body.data.bookmarkId).toBe(bookmarkId);
    });

    it('GET /check with camelCase query works and reports not bookmarked', async () => {
      const res = await request('GET', '/bookmarks/check?entityType=lead&entityId=does-not-exist', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.bookmarked).toBe(false);
      expect(body.data.bookmark_id).toBeNull();
    });

    it('GET /check without params is a 400', async () => {
      const res = await request('GET', '/bookmarks/check', adminToken);
      expect(res.status).toBe(400);
    });

    it('POST /check still works with a body (desktop) in both casings', async () => {
      const camel = await request('POST', '/bookmarks/check', adminToken, { entityType: 'lead', entityId });
      expect(((await camel.json()) as any).data.bookmarked).toBe(true);
      const snake = await request('POST', '/bookmarks/check', adminToken, { entity_type: 'lead', entity_id: entityId });
      expect(((await snake.json()) as any).data.bookmark_id).toBe(bookmarkId);
    });

    it('lists bookmarks as an array with both casings plus pagination', async () => {
      const res = await request('GET', '/bookmarks?entity_type=lead', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.pagination).toBeDefined();
      const item = body.data.find((b: any) => b.id === bookmarkId);
      expect(item).toBeDefined();
      for (const key of [
        'user_id', 'userId', 'entity_type', 'entityType', 'entity_id', 'entityId',
        'entity_name', 'entityName', 'created_at', 'createdAt',
      ]) {
        expect(item, key).toHaveProperty(key);
      }
    });

    it('deletes a bookmark', async () => {
      const res = await request('DELETE', `/bookmarks/${bookmarkId}`, adminToken);
      expect(res.status).toBe(200);
    });
  });

  // ── Documents ──────────────────────────────────────────────────

  describe('documents', () => {
    it('upload + list expose file_url / fileUrl (DocumentModel requires file_url)', async () => {
      const form = new FormData();
      form.append('file', new File(['hello world'], 'itinerary-notes.csv', { type: 'text/csv' }));
      form.append('category', 'other');
      const up = await request('POST', '/documents/upload', adminToken, form);
      expect(up.status).toBe(201);
      const uploaded: any = await up.json();
      expect(typeof uploaded.data.file_url).toBe('string');
      expect(uploaded.data.file_url.length).toBeGreaterThan(0);
      expect(uploaded.data.fileUrl).toBe(uploaded.data.file_url);

      const res = await request('GET', '/documents', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
      const doc = body.data.find((d: any) => d.id === uploaded.data.id);
      expect(doc).toBeDefined();
      expect(doc.fileUrl).toBeTruthy();
      expect(doc.file_url).toBe(doc.fileUrl);
      expect(doc.mime_type).toBe('text/csv');
      expect(doc.created_at).toBeTruthy();
      // desktop keys are still present
      expect(doc).toHaveProperty('mimeType');
      expect(doc).toHaveProperty('uploadedAt');
    });
  });

  // ── Social content ─────────────────────────────────────────────

  describe('social content', () => {
    it('returns both generatedText (Flutter) and content (desktop)', async () => {
      const id = '0196aaaa-0000-7000-8000-00000000c001';
      await testEnv.MASTER_DB
        .prepare(
          `INSERT INTO ai_social_content (id, content_type, platform, topic, generated_text, created_by)
           VALUES (?, 'post', 'instagram', 'Goa monsoon escape', 'Chase the monsoon in Goa.', ?)`,
        )
        .bind(id, ADMIN_ID)
        .run();

      const res = await request('GET', '/marketing/social-content', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      const item = body.data.find((d: any) => d.id === id);
      expect(item).toBeDefined();
      expect(item.generatedText).toBe('Chase the monsoon in Goa.');
      expect(item.content).toBe('Chase the monsoon in Goa.');
    });
  });

  // ── Flyers ─────────────────────────────────────────────────────

  describe('flyers (legacy Flutter payloads)', () => {
    it('creates a template with a legacy category and exposes width/height/sizePreset', async () => {
      const res = await request('POST', '/marketing/flyer-templates', adminToken, {
        name: 'Goa Beach Escape',
        category: 'destination',
        width: 1080,
        height: 1080,
        sizePreset: 'instagram_post',
      });
      expect(res.status).toBe(201);
      const body: any = await res.json();
      expect(body.data.category).toBe('destination');
      expect(body.data.width).toBe(1080);
      expect(body.data.sizePreset).toBe('instagram_post');

      const offer = await request('POST', '/marketing/flyer-templates', adminToken, {
        name: 'Winter Offer',
        category: 'offer',
      });
      expect(offer.status).toBe(201);
      const offerBody: any = await offer.json();
      expect(offerBody.data.width).toBeDefined();
      expect(offerBody.data.height).toBeDefined();
      expect(offerBody.data.sizePreset).toBeDefined();
    });

    it('still accepts the new category values', async () => {
      const res = await request('POST', '/marketing/flyer-templates', adminToken, {
        name: 'Diwali Special',
        category: 'seasonal',
      });
      expect(res.status).toBe(201);
    });

    it('creates a flyer with legacy `name` and no templateId, and returns name + title', async () => {
      const res = await request('POST', '/marketing/flyers', adminToken, {
        name: 'Kerala Backwaters',
        layoutJson: '{"elements":[]}',
        format: 'png',
        width: 1080,
        height: 1080,
      });
      expect(res.status).toBe(201);
      const body: any = await res.json();
      expect(body.data.name).toBe('Kerala Backwaters');
      expect(body.data.title).toBe('Kerala Backwaters');
      expect(body.data.layoutJson).toBe('{"elements":[]}');
      expect(body.data.format).toBe('png');
    });

    it('creates a flyer with the new title payload', async () => {
      const res = await request('POST', '/marketing/flyers', adminToken, {
        title: 'Summer in Shimla',
        content: { headline: 'Shimla from Rs 9,999' },
      });
      expect(res.status).toBe(201);
      const body: any = await res.json();
      expect(body.data.title).toBe('Summer in Shimla');
      expect(body.data.name).toBe('Summer in Shimla');
    });

    it('rejects a flyer with neither title nor name', async () => {
      const res = await request('POST', '/marketing/flyers', adminToken, { format: 'png' });
      expect(res.status).toBe(400);
    });
  });

  // ── Festival campaigns ─────────────────────────────────────────

  describe('festival campaigns', () => {
    let festivalId = '';

    it('lists festival campaigns (paginated) instead of 500', async () => {
      const res = await request('GET', '/marketing/festivals', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.pagination).toMatchObject({ page: 1 });
    });

    it('creates, activates, deactivates and deletes a campaign (admin)', async () => {
      const create = await request('POST', '/marketing/festivals', adminToken, {
        name: 'Diwali Offer 2026',
        festivalName: 'Diwali',
        festivalDate: '2026-11-08',
        daysBefore: 5,
        campaignType: 'whatsapp',
        messageBody: 'Celebrate Diwali with our festive packages.',
      });
      expect(create.status).toBe(201);
      const created: any = await create.json();
      festivalId = created.data.id;
      expect(festivalId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/); // UUIDv7
      expect(created.data.isActive).toBe(false);

      const activate = await request('PUT', `/marketing/festivals/${festivalId}/activate`, adminToken);
      expect(activate.status).toBe(200);
      expect(((await activate.json()) as any).data.isActive).toBe(true);

      const deactivate = await request('PUT', `/marketing/festivals/${festivalId}/deactivate`, adminToken);
      expect(((await deactivate.json()) as any).data.isActive).toBe(false);

      const get = await request('GET', `/marketing/festivals/${festivalId}`, adminToken);
      expect(get.status).toBe(200);

      const del = await request('DELETE', `/marketing/festivals/${festivalId}`, adminToken);
      expect(del.status).toBe(200);
      const gone = await request('GET', `/marketing/festivals/${festivalId}`, adminToken);
      expect(gone.status).toBe(404);
    });

    it('returns 403 for a salesperson (no marketing permission) on every route', async () => {
      const payload = {
        name: 'Holi Offer',
        festivalName: 'Holi',
        festivalDate: '2027-03-14',
      };
      expect((await request('GET', '/marketing/festivals', salesToken)).status).toBe(403);
      expect((await request('GET', '/marketing/festivals/any-id', salesToken)).status).toBe(403);
      expect((await request('POST', '/marketing/festivals', salesToken, payload)).status).toBe(403);
      expect((await request('PUT', '/marketing/festivals/any-id/activate', salesToken)).status).toBe(403);
      expect((await request('PUT', '/marketing/festivals/any-id/deactivate', salesToken)).status).toBe(403);
      expect((await request('DELETE', '/marketing/festivals/any-id', salesToken)).status).toBe(403);
    });
  });
});
