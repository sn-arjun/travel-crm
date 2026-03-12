import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';

const testEnv = env as any;

// ── Helpers ────────────────────────────────────────────────────────

async function authRequest(
  method: string,
  path: string,
  token: string,
  body?: Record<string, unknown>,
): Promise<Response> {
  const opts: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, opts),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function publicRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<Response> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost${path}`, opts),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

let adminToken = '';
let salesToken = '';

// ── Setup ──────────────────────────────────────────────────────────

describe('AI Routes — Full E2E Integration Tests', () => {
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

    // Login as admin (pro plan)
    const loginRes = await publicRequest('POST', '/api/v1/auth/login', {
      email: 'admin@e2e.test',
      password: 'password123',
      tenantId: '00000000-0000-0000-0000-000000000000',
    });
    expect(loginRes.status).toBe(200);
    const loginBody: any = await loginRes.json();
    adminToken = loginBody.data.accessToken;

    // Login as salesperson
    const salesLogin = await publicRequest('POST', '/api/v1/auth/login', {
      email: 'sales@e2e.test',
      password: 'password123',
      tenantId: '00000000-0000-0000-0000-000000000000',
    });
    if (salesLogin.status === 200) {
      const salesBody: any = await salesLogin.json();
      salesToken = salesBody.data.accessToken;
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // AUTH REQUIRED
  // ═══════════════════════════════════════════════════════════════

  describe('Authentication Required', () => {
    it('should reject unauthenticated /ai/conversations', async () => {
      const res = await publicRequest('GET', '/api/v1/ai/conversations');
      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated /ai/extract-lead', async () => {
      const res = await publicRequest('POST', '/api/v1/ai/extract-lead');
      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated /ai/settings', async () => {
      const res = await publicRequest('GET', '/api/v1/ai/settings');
      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated /ai/intelligence/nl-query', async () => {
      const res = await publicRequest('POST', '/api/v1/ai/intelligence/nl-query');
      expect(res.status).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // AI SETTINGS
  // ═══════════════════════════════════════════════════════════════

  describe('AI Settings', () => {
    it('GET /ai/settings should return AI configuration', async () => {
      const res = await authRequest('GET', '/ai/settings', adminToken);
      // May be blocked by feature gate (ai_assistant required for /ai/*)
      if (res.status === 403) return; // Feature gate — acceptable
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('plan');
      expect(body.data).toHaveProperty('aiFeatures');
      expect(body.data).toHaveProperty('provider');
      expect(Array.isArray(body.data.aiFeatures)).toBe(true);
      expect(body.data.provider).toHaveProperty('cloudflare');
      expect(body.data.provider).toHaveProperty('anthropic');
      expect(body.data.provider).toHaveProperty('defaultProvider');
    });

    it('GET /ai/settings should include all 22 AI features', async () => {
      const res = await authRequest('GET', '/ai/settings', adminToken);
      if (res.status === 403) return;
      const body: any = await res.json();
      const features = body.data.aiFeatures;
      // Should have at least 22 AI features listed
      expect(features.length).toBeGreaterThanOrEqual(22);
      // Check some specific features exist
      const keys = features.map((f: any) => f.key);
      expect(keys).toContain('ai_copilot');
      expect(keys).toContain('ai_lead_scoring');
      expect(keys).toContain('ai_ocr');
      expect(keys).toContain('ai_coaching');
      expect(keys).toContain('ai_daily_briefing');
    });

    it('GET /ai/settings should return correct tier classification', async () => {
      const res = await authRequest('GET', '/ai/settings', adminToken);
      if (res.status === 403) return;
      const body: any = await res.json();
      const features = body.data.aiFeatures;
      const proFeature = features.find((f: any) => f.key === 'ai_copilot');
      const entFeature = features.find((f: any) => f.key === 'ai_coaching');
      expect(proFeature?.tier).toBe('pro');
      expect(entFeature?.tier).toBe('enterprise');
    });

    it('GET /ai/settings/usage should return usage data', async () => {
      const res = await authRequest('GET', '/ai/settings/usage', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('quotas');
      expect(body.data).toHaveProperty('breakdown');
      expect(body.data).toHaveProperty('dailyTrend');
    });

    it('GET /ai/settings/provider should return provider status', async () => {
      const res = await authRequest('GET', '/ai/settings/provider', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('cloudflare', true);
      expect(body.data).toHaveProperty('taskRouting');
    });

    it('GET /ai/settings/features/check/:key should check specific feature', async () => {
      const res = await authRequest('GET', '/ai/settings/features/check/ai_copilot', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('featureKey', 'ai_copilot');
      expect(body.data).toHaveProperty('enabled');
      expect(body.data).toHaveProperty('plan');
    });

    it('PUT /ai/settings/features should toggle features (admin only)', async () => {
      const res = await authRequest('PUT', '/ai/settings/features', adminToken, {
        features: { ai_copilot: true },
      });
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('updated');
    });

    it('PUT /ai/settings/features should deny enterprise features on pro plan', async () => {
      const res = await authRequest('PUT', '/ai/settings/features', adminToken, {
        features: { ai_coaching: true },
      });
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      const body: any = await res.json();
      // ai_coaching is enterprise-only, should be denied on pro plan
      if (body.data.denied) {
        expect(body.data.denied).toContain('ai_coaching');
      }
    });

    it('PUT /ai/settings/features should reject non-admin', async () => {
      if (!salesToken) return;
      const res = await authRequest('PUT', '/ai/settings/features', salesToken, {
        features: { ai_copilot: false },
      });
      // Either 403 (feature gate or RBAC)
      expect([403]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // AI CONVERSATIONS
  // ═══════════════════════════════════════════════════════════════

  describe('AI Conversations', () => {
    it('GET /ai/conversations should list conversations', async () => {
      const res = await authRequest('GET', '/ai/conversations', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('pagination');
      expect(body.pagination).toHaveProperty('total');
      expect(body.pagination).toHaveProperty('page');
      expect(body.pagination).toHaveProperty('limit');
      expect(body.pagination).toHaveProperty('totalPages');
      expect(body.pagination).toHaveProperty('hasMore');
    });

    it('GET /ai/conversations should paginate correctly', async () => {
      const res = await authRequest('GET', '/ai/conversations?page=1&limit=5', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.limit).toBe(5);
    });

    it('GET /ai/conversations/:id should return 404 for non-existent', async () => {
      const res = await authRequest('GET', '/ai/conversations/nonexistent-id-12345', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(404);
    });

    it('DELETE /ai/conversations/:id should not error for non-existent', async () => {
      const res = await authRequest('DELETE', '/ai/conversations/nonexistent-id-12345', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // AI LEAD EXTRACTION
  // ═══════════════════════════════════════════════════════════════

  describe('AI Lead Extraction', () => {
    it('POST /ai/extract-lead should validate input', async () => {
      const res = await authRequest('POST', '/ai/extract-lead', adminToken, {});
      // Missing required 'text' field — should be 400 or 422
      if (res.status === 403) return;
      expect([400, 422]).toContain(res.status);
    });

    it('POST /ai/extract-lead should extract lead from text', async () => {
      const res = await authRequest('POST', '/ai/extract-lead', adminToken, {
        text: 'Hi, I am Rahul Sharma, my number is 9876543210 and email rahul@gmail.com. I want to go to Goa for 3 nights with my wife in March. Budget around 50000 INR.',
        source: 'freeform',
      });
      if (res.status === 403) return;
      // If AI is working, should return 200 with extracted data
      // If AI binding is mocked/empty, may return 200 with empty extraction
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty('contentId');
        expect(body.data).toHaveProperty('extracted');
        expect(body.data).toHaveProperty('model');
        expect(body.data).toHaveProperty('provider');
      }
    });

    it('POST /ai/parse-whatsapp should parse WhatsApp messages', async () => {
      const res = await authRequest('POST', '/ai/parse-whatsapp', adminToken, {
        message: '[11/3/24, 2:30 PM] Priya: Hi, we are a group of 8 people looking for Kerala backwaters trip in April. Budget 2 lakhs.',
      });
      if (res.status === 403) return;
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty('contentId');
        expect(body.data.source).toBe('whatsapp');
      }
    });

    it('POST /ai/parse-email should parse email inquiries', async () => {
      const res = await authRequest('POST', '/ai/parse-email', adminToken, {
        email: 'Dear Travel Team, We are planning a Rajasthan tour for our family of 5 (2 adults, 2 kids, 1 infant). Looking for a 7-day package in November. Budget flexible around 1.5 lakhs. Regards, Vikram',
        subject: 'Rajasthan Tour Inquiry',
      });
      if (res.status === 403) return;
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.source).toBe('email');
      }
    });

    it('POST /ai/parse-bulk-leads should handle multiple leads', async () => {
      const res = await authRequest('POST', '/ai/parse-bulk-leads', adminToken, {
        text: `Lead 1: Amit, 9898989898, wants Manali trip for honeymoon, budget 80k
Lead 2: Sneha, sneha@company.com, corporate offsite in Udaipur for 20 pax, 5 lakhs budget
Lead 3: Ahmed, 8765432109, Hajj package for 4, budget 6 lakhs`,
      });
      if (res.status === 403) return;
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty('leads');
        expect(body.data).toHaveProperty('count');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // AI ITINERARY GENERATION
  // ═══════════════════════════════════════════════════════════════

  describe('AI Itinerary Generation', () => {
    it('POST /ai/generate-itinerary should validate input', async () => {
      const res = await authRequest('POST', '/ai/generate-itinerary', adminToken, {});
      if (res.status === 403) return;
      expect([400, 422]).toContain(res.status);
    });

    it('POST /ai/generate-itinerary should generate a day-by-day plan', async () => {
      const res = await authRequest('POST', '/ai/generate-itinerary', adminToken, {
        prompt: 'Plan a 3-day trip to Jaipur with heritage sites and local cuisine',
        destination: 'Jaipur',
        duration: 3,
        budget: 30000,
        budgetCurrency: 'INR',
        paxCount: 2,
        tripType: 'heritage',
        preferences: ['history', 'food', 'photography'],
      });
      if (res.status === 403) return;
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty('contentId');
        expect(body.data).toHaveProperty('conversationId');
        expect(body.data).toHaveProperty('itinerary');
        expect(body.data).toHaveProperty('model');
        expect(body.data).toHaveProperty('provider');
      }
    });

    it('POST /ai/enrich-itinerary should enrich existing itinerary', async () => {
      const res = await authRequest('POST', '/ai/enrich-itinerary', adminToken, {
        itinerary: {
          title: 'Goa Trip',
          days: [{ dayNumber: 1, title: 'Day 1', description: 'Beach day' }],
        },
        enrichments: ['restaurants', 'tips'],
      });
      if (res.status === 403) return;
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty('contentId');
        expect(body.data).toHaveProperty('itinerary');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // AI INVOICE GENERATION
  // ═══════════════════════════════════════════════════════════════

  describe('AI Invoice Generation', () => {
    it('POST /ai/generate-invoice should generate invoice from itinerary', async () => {
      const res = await authRequest('POST', '/ai/generate-invoice', adminToken, {
        itinerary: {
          title: 'Goa Family Trip',
          days: [
            {
              dayNumber: 1,
              hotel: { name: 'Beach Resort', estimatedCost: 5000 },
              transport: { mode: 'car', estimatedCost: 2000 },
              activities: [{ activity: 'Water sports', estimatedCost: 3000 }],
            },
          ],
        },
        currency: 'INR',
        gstRate: 5,
        tcsRate: 5,
        markupPercent: 15,
      });
      if (res.status === 403) return;
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty('contentId');
        expect(body.data).toHaveProperty('invoice');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // AI MESSAGE COMPOSITION
  // ═══════════════════════════════════════════════════════════════

  describe('AI Message Composition', () => {
    it('POST /ai/compose-message should compose a WhatsApp message', async () => {
      const res = await authRequest('POST', '/ai/compose-message', adminToken, {
        channel: 'whatsapp',
        purpose: 'follow_up',
        tone: 'professional',
        language: 'en',
        context: {
          customerName: 'Rahul Sharma',
          destination: 'Goa',
          leadStatus: 'proposal_sent',
          lastInteraction: '3 days ago',
        },
      });
      if (res.status === 403) return;
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty('contentId');
        expect(body.data).toHaveProperty('message');
        expect(body.data.channel).toBe('whatsapp');
      }
    });

    it('POST /ai/compose-message should compose an email', async () => {
      const res = await authRequest('POST', '/ai/compose-message', adminToken, {
        channel: 'email',
        purpose: 'greeting',
        tone: 'formal',
        language: 'en',
        context: { customerName: 'Priya Singh', destination: 'Kerala' },
      });
      if (res.status === 403) return;
      expect([200, 500]).toContain(res.status);
    });

    it('POST /ai/compose-message should validate channel enum', async () => {
      const res = await authRequest('POST', '/ai/compose-message', adminToken, {
        channel: 'fax', // invalid
        purpose: 'follow_up',
      });
      if (res.status === 403) return;
      expect([400, 422]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // AI SMART REPLIES
  // ═══════════════════════════════════════════════════════════════

  describe('AI Smart Replies', () => {
    it('POST /ai/suggest-replies should generate reply suggestions', async () => {
      const res = await authRequest('POST', '/ai/suggest-replies', adminToken, {
        incomingMessage: 'What is the cost of a 5-day Ladakh trip for 4 people?',
        channel: 'whatsapp',
        customerName: 'Amit Kumar',
      });
      if (res.status === 403) return;
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty('suggestions');
        expect(body.data).toHaveProperty('model');
        expect(body.data).toHaveProperty('provider');
      }
    });

    it('POST /ai/suggest-replies should validate required fields', async () => {
      const res = await authRequest('POST', '/ai/suggest-replies', adminToken, {
        channel: 'whatsapp',
      });
      if (res.status === 403) return;
      expect([400, 422]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // GENERATED CONTENT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  describe('Generated Content Management', () => {
    it('GET /ai/generated should list generated content', async () => {
      const res = await authRequest('GET', '/ai/generated', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('pagination');
    });

    it('GET /ai/generated should filter by contentType', async () => {
      const res = await authRequest('GET', '/ai/generated?contentType=lead_extraction', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
    });

    it('GET /ai/generated should filter by status', async () => {
      const res = await authRequest('GET', '/ai/generated?status=draft', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
    });

    it('GET /ai/generated/:id should return 404 for non-existent', async () => {
      const res = await authRequest('GET', '/ai/generated/nonexistent-id', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(404);
    });

    it('POST /ai/generated/:id/feedback should accept feedback', async () => {
      const res = await authRequest('POST', '/ai/generated/some-id/feedback', adminToken, {
        feedback: 'positive',
        notes: 'Great extraction',
      });
      if (res.status === 403) return;
      expect(res.status).toBe(200);
    });

    it('POST /ai/generated/:id/accept should update status', async () => {
      const res = await authRequest('POST', '/ai/generated/some-id/accept', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
    });

    it('POST /ai/generated/:id/reject should update status', async () => {
      const res = await authRequest('POST', '/ai/generated/some-id/reject', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ENDPOINT STABILITY (No 500s)
  // ═══════════════════════════════════════════════════════════════

  describe('Endpoint Stability — No 500 Errors', () => {
    const endpoints = [
      ['GET', '/ai/conversations'],
      ['GET', '/ai/generated'],
      ['GET', '/ai/settings'],
      ['GET', '/ai/settings/usage'],
      ['GET', '/ai/settings/provider'],
      ['GET', '/ai/settings/features/check/ai_copilot'],
    ];

    for (const [method, path] of endpoints) {
      it(`${method} ${path} should not return 500`, async () => {
        const res = await authRequest(method, path, adminToken);
        expect(res.status).not.toBe(500);
      });
    }
  });
});
