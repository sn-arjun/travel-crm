import { test, expect } from '@playwright/test';

test.describe('M1: Infrastructure - API Health & Status', () => {
  const baseURL = process.env.API_BASE_URL || 'http://localhost:8787';

  test('should respond to health check endpoint with status ok', async ({ request }) => {
    const response = await request.get(`${baseURL}/api/health`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('status');
    expect(data.status).toBe('ok');
  });

  test('should return version string in health check', async ({ request }) => {
    const response = await request.get(`${baseURL}/api/health`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('version');
    expect(typeof data.version).toBe('string');
  });

  test('should return database field with connected status', async ({ request }) => {
    const response = await request.get(`${baseURL}/api/health`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('database');
    expect(['connected', 'ok']).toContain(data.database);
  });

  test('should return uptime as number', async ({ request }) => {
    const response = await request.get(`${baseURL}/api/health`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('uptime');
    expect(typeof data.uptime).toBe('number');
    expect(data.uptime).toBeGreaterThanOrEqual(0);
  });

  test('should return timestamp in health check', async ({ request }) => {
    const response = await request.get(`${baseURL}/api/health`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('timestamp');
  });

  test('should return CORS headers on OPTIONS request', async ({ request }) => {
    // Playwright doesn't have .options() — use fetch with OPTIONS method
    const response = await request.fetch(`${baseURL}/api/health`, { method: 'OPTIONS' });
    const headers = response.headers();
    // CORS middleware should set allow-origin or allow-methods
    const hasCors =
      headers['access-control-allow-origin'] !== undefined ||
      headers['access-control-allow-methods'] !== undefined;
    expect(hasCors).toBe(true);
  });

  test('should return 401 or 404 for non-existent protected endpoints', async ({ request }) => {
    const response = await request.get(`${baseURL}/api/non-existent-endpoint-xyz123`);
    // Auth middleware may intercept before 404 handler, both are acceptable
    expect([401, 404]).toContain(response.status());
  });

  test('should handle rate limiting with multiple rapid requests', async ({ request }) => {
    // Make 50 rapid requests to health endpoint
    const promises = Array.from({ length: 50 }).map(() =>
      request.get(`${baseURL}/api/health`)
    );

    const responses = await Promise.all(promises);
    const statuses = responses.map(r => r.status());

    // At least most should succeed (some may be rate limited)
    const successCount = statuses.filter(s => s === 200).length;
    expect(successCount).toBeGreaterThan(0);
  });

  test('should provide meaningful error messages on bad login request', async ({ request }) => {
    const response = await request.post(`${baseURL}/api/auth/login`, {
      data: {
        email: 'invalid-email-format',
        password: '',
        tenantId: '',
      },
    });

    expect(response.status()).toBeLessThan(500);
    const data = await response.json();
    // Response should have error structure: {success: false, error: {message: "..."}}
    if (!data.success) {
      expect(data).toHaveProperty('error');
      expect(data.error).toHaveProperty('message');
    }
  });

  test('should handle missing Content-Type gracefully', async ({ request }) => {
    const response = await request.post(`${baseURL}/api/auth/login`, {
      headers: {
        'Content-Type': '',
      },
      data: {
        email: 'test@example.com',
        password: 'password',
        tenantId: 'test-tenant',
      },
    });

    // Should handle gracefully - either reject with 400/415 or still process
    expect([400, 415, 200, 201, 401, 422]).toContain(response.status());
  });

  test('should have consistent response structure', async ({ request }) => {
    const response = await request.get(`${baseURL}/api/health`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    // Health check should return full status object
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('database');
    expect(data).toHaveProperty('uptime');
    expect(data).toHaveProperty('timestamp');
  });
});
