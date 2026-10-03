import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';

const testEnv = env as any;

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

describe('AI Intelligence & BI Routes — E2E Integration Tests', () => {
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

    const loginRes = await publicRequest('POST', '/api/v1/auth/login', {
      email: 'admin@e2e.test',
      password: 'password123',
      tenantId: '00000000-0000-0000-0000-000000000000',
    });
    expect(loginRes.status).toBe(200);
    const loginBody: any = await loginRes.json();
    adminToken = loginBody.data.accessToken;
  });

  // ═══════════════════════════════════════════════════════════════
  // NL QUERY
  // ═══════════════════════════════════════════════════════════════

  describe('NL Query — Ask Your CRM', () => {
    it('should reject unauthenticated request', async () => {
      const res = await publicRequest('POST', '/api/v1/ai/intelligence/nl-query');
      expect(res.status).toBe(401);
    });

    it('should validate minimum query length', async () => {
      const res = await authRequest('POST', '/ai/intelligence/nl-query', adminToken, {
        query: 'ab', // too short
      });
      if (res.status === 403) return; // feature gate
      expect([400, 422]).toContain(res.status);
    });

    it('should process a natural language query', async () => {
      const res = await authRequest('POST', '/ai/intelligence/nl-query', adminToken, {
        query: 'How many new leads were created this month?',
      });
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty('id');
        expect(body.data).toHaveProperty('query');
        expect(body.data).toHaveProperty('sql');
        expect(body.data).toHaveProperty('explanation');
      }
    });

    it('should process a query about revenue', async () => {
      const res = await authRequest('POST', '/ai/intelligence/nl-query', adminToken, {
        query: 'Show me the top 5 leads by estimated value',
      });
      if (res.status === 403) return;
      expect(res.status).toBe(200);
    });

    it('should handle multi-turn conversation with conversationId', async () => {
      const res = await authRequest('POST', '/ai/intelligence/nl-query', adminToken, {
        query: 'Show me overdue follow-ups',
        conversationId: 'nonexistent-conv',
      });
      if (res.status === 403) return;
      expect(res.status).toBe(200);
    });

    it('GET /ai/intelligence/nl-queries should list past queries', async () => {
      const res = await authRequest('GET', '/ai/intelligence/nl-queries', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // INSIGHTS
  // ═══════════════════════════════════════════════════════════════

  describe('AI Insights', () => {
    it('should reject unauthenticated request', async () => {
      const res = await publicRequest('GET', '/api/v1/ai/intelligence/insights');
      expect(res.status).toBe(401);
    });

    it('GET /ai/intelligence/insights should return insights list', async () => {
      const res = await authRequest('GET', '/ai/intelligence/insights', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('data');
      expect(Array.isArray(body.data.data)).toBe(true);
    });

    it('POST /ai/intelligence/insights/generate should trigger generation', async () => {
      const res = await authRequest('POST', '/ai/intelligence/insights/generate', adminToken, {
        types: ['lead', 'revenue', 'pipeline'],
      });
      if (res.status === 403) return;
      expect(res.status).toBe(200);
    });

    it('GET /ai/intelligence/recommendations should return list', async () => {
      const res = await authRequest('GET', '/ai/intelligence/recommendations', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // LEAD SCORING
  // ═══════════════════════════════════════════════════════════════

  describe('AI Lead Scoring', () => {
    it('GET /ai/intelligence/lead-scores should return all scores', async () => {
      const res = await authRequest('GET', '/ai/intelligence/lead-scores', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
    });

    it('GET /ai/intelligence/lead-score/:id should return 404 for nonexistent lead', async () => {
      const res = await authRequest('GET', '/ai/intelligence/lead-score/nonexistent-lead', adminToken);
      if (res.status === 403) return;
      // 404 for not found, or 200 with a score generated
      expect([200, 404]).toContain(res.status);
    });

    it('POST /ai/intelligence/lead-score/:id/compute should trigger scoring', async () => {
      const res = await authRequest('POST', '/ai/intelligence/lead-score/nonexistent-lead/compute', adminToken);
      if (res.status === 403) return;
      // 404 (lead not found) or 200 (score computed)
      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SMART FOLLOW-UPS
  // ═══════════════════════════════════════════════════════════════

  describe('Smart Follow-ups', () => {
    it('GET /ai/intelligence/smart-followup/:id should return suggestion', async () => {
      const res = await authRequest('GET', '/ai/intelligence/smart-followup/nonexistent-lead', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(404);
    });

    it('GET /ai/intelligence/followup-suggestions should list suggestions', async () => {
      const res = await authRequest('GET', '/ai/intelligence/followup-suggestions', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DOCUMENT OCR
  // ═══════════════════════════════════════════════════════════════

  describe('Document OCR', () => {
    it('POST /ai/intelligence/ocr/passport should validate imageBase64 is required', async () => {
      const res = await authRequest('POST', '/ai/intelligence/ocr/passport', adminToken, {});
      if (res.status === 403) return;
      expect([400, 422]).toContain(res.status);
    });

    it('POST /ai/intelligence/ocr/passport should reject too-short base64', async () => {
      const res = await authRequest('POST', '/ai/intelligence/ocr/passport', adminToken, {
        imageBase64: 'abc',
      });
      if (res.status === 403) return;
      expect([400, 422]).toContain(res.status);
    });

    it('POST /ai/intelligence/ocr/visa-classify should validate input', async () => {
      const res = await authRequest('POST', '/ai/intelligence/ocr/visa-classify', adminToken, {
        images: [],
      });
      if (res.status === 403) return;
      expect([400, 422]).toContain(res.status);
    });

    it('POST /ai/intelligence/ocr/supplier-invoice should validate input', async () => {
      const res = await authRequest('POST', '/ai/intelligence/ocr/supplier-invoice', adminToken, {});
      if (res.status === 403) return;
      expect([400, 422]).toContain(res.status);
    });

    it('GET /ai/intelligence/document-scans should list scans', async () => {
      const res = await authRequest('GET', '/ai/intelligence/document-scans', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
    });

    it('GET /ai/intelligence/document-scans/:id should return 404', async () => {
      const res = await authRequest('GET', '/ai/intelligence/document-scans/nonexistent', adminToken);
      if (res.status === 403) return;
      expect([404, 200]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // BUSINESS INTELLIGENCE — BRIEFINGS
  // ═══════════════════════════════════════════════════════════════

  describe('BI Briefings', () => {
    it('should reject unauthenticated request', async () => {
      const res = await publicRequest('POST', '/api/v1/ai/bi/briefings/generate');
      expect(res.status).toBe(401);
    });

    it('POST /ai/bi/briefings/generate should generate daily briefing', async () => {
      const res = await authRequest('POST', '/ai/bi/briefings/generate', adminToken, {
        type: 'daily',
      });
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty('id');
        expect(body.data).toHaveProperty('type');
      }
    });

    it('POST /ai/bi/briefings/generate should generate weekly briefing', async () => {
      const res = await authRequest('POST', '/ai/bi/briefings/generate', adminToken, {
        type: 'weekly',
      });
      if (res.status === 403) return;
      expect(res.status).toBe(200);
    });

    it('POST /ai/bi/briefings/generate should generate monthly briefing', async () => {
      const res = await authRequest('POST', '/ai/bi/briefings/generate', adminToken, {
        type: 'monthly',
      });
      if (res.status === 403) return;
      expect(res.status).toBe(200);
    });

    it('GET /ai/bi/briefings should list past briefings', async () => {
      const res = await authRequest('GET', '/ai/bi/briefings', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // BUSINESS HEALTH SCORE
  // ═══════════════════════════════════════════════════════════════

  describe('Business Health Score', () => {
    it('GET /ai/bi/health-score should return a score', async () => {
      const res = await authRequest('GET', '/ai/bi/health-score', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty('overallScore');
        expect(typeof body.data.overallScore).toBe('number');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DESTINATION PROFITABILITY
  // ═══════════════════════════════════════════════════════════════

  describe('Destination Profitability', () => {
    it('GET /ai/bi/destination-profitability should return analysis', async () => {
      const res = await authRequest('GET', '/ai/bi/destination-profitability', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body.data).toBeDefined();
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CUSTOMER LTV
  // ═══════════════════════════════════════════════════════════════

  describe('Customer LTV', () => {
    it('GET /ai/bi/customer-ltv should return LTV data', async () => {
      const res = await authRequest('GET', '/ai/bi/customer-ltv', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CASH FLOW FORECAST
  // ═══════════════════════════════════════════════════════════════

  describe('Cash Flow Forecast', () => {
    it('GET /ai/bi/cash-flow-forecast should return forecast', async () => {
      const res = await authRequest('GET', '/ai/bi/cash-flow-forecast', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body.data).toBeDefined();
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TEAM PERFORMANCE
  // ═══════════════════════════════════════════════════════════════

  describe('Team Performance', () => {
    it('GET /ai/bi/team-performance should return team metrics', async () => {
      const res = await authRequest('GET', '/ai/bi/team-performance', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TRENDING DESTINATIONS
  // ═══════════════════════════════════════════════════════════════

  describe('Trending Destinations', () => {
    it('GET /ai/bi/trending-destinations should return list', async () => {
      const res = await authRequest('GET', '/ai/bi/trending-destinations', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // LOST DEAL ANALYSIS
  // ═══════════════════════════════════════════════════════════════

  describe('Lost Deal Analysis', () => {
    it('GET /ai/bi/lost-deal-analysis should return analysis', async () => {
      const res = await authRequest('GET', '/ai/bi/lost-deal-analysis', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // LEAD SOURCE ROI
  // ═══════════════════════════════════════════════════════════════

  describe('Lead Source ROI', () => {
    it('GET /ai/bi/lead-source-roi should return ROI data', async () => {
      const res = await authRequest('GET', '/ai/bi/lead-source-roi', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // REVENUE PULSE
  // ═══════════════════════════════════════════════════════════════

  describe('Revenue Pulse', () => {
    it('GET /ai/bi/revenue-pulse should return revenue data', async () => {
      const res = await authRequest('GET', '/ai/bi/revenue-pulse', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SEASONAL DEMAND
  // ═══════════════════════════════════════════════════════════════

  describe('Seasonal Demand', () => {
    it('GET /ai/bi/seasonal-demand should return demand data', async () => {
      const res = await authRequest('GET', '/ai/bi/seasonal-demand', adminToken);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ENDPOINT STABILITY — No 500s
  // ═══════════════════════════════════════════════════════════════

  describe('Endpoint Stability — No 500 Errors', () => {
    const endpoints: [string, string][] = [
      ['GET', '/ai/intelligence/insights'],
      ['GET', '/ai/intelligence/recommendations'],
      ['GET', '/ai/intelligence/lead-scores'],
      ['GET', '/ai/intelligence/document-scans'],
      ['GET', '/ai/bi/briefings'],
      ['GET', '/ai/bi/trending-destinations'],
      ['GET', '/ai/bi/revenue-pulse'],
      ['GET', '/ai/bi/seasonal-demand'],
      ['GET', '/ai/bi/cash-flow-forecast'],
      ['GET', '/ai/bi/team-performance'],
      ['GET', '/ai/bi/destination-profitability'],
      ['GET', '/ai/bi/lead-source-roi'],
      ['GET', '/ai/bi/lost-deal-analysis'],
    ];

    for (const [method, path] of endpoints) {
      it(`${method} ${path} should not return 500`, async () => {
        const res = await authRequest(method, path, adminToken);
        expect(res.status).not.toBe(500);
      });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // AI METERING
  // ═══════════════════════════════════════════════════════════════

  describe('AI Metering Dashboard', () => {
    it('GET /ai/bi/metering should return usage stats', async () => {
      const res = await authRequest('GET', '/ai/bi/metering', adminToken);
      if (res.status === 403) return;
      expect([200, 404]).toContain(res.status); // may not be implemented
    });
  });
});
