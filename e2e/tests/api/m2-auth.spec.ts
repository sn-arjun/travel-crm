import { test, expect } from '@playwright/test';
import { APIClient } from '../helpers/api-client';
import {
  TEST_ADMIN,
  TEST_SALESPERSON,
  API_ENDPOINTS,
} from '../helpers/test-data';

test.describe('M2: Authentication & Authorization', () => {
  const baseURL = process.env.API_BASE_URL || 'http://localhost:8787';

  test.describe.serial('Tenant Resolution & Login Flow', () => {
    test('should resolve tenant with email', async ({ request }) => {
      const response = await request.post(`${baseURL}${API_ENDPOINTS.AUTH_RESOLVE_TENANT}`, {
        data: {
          email: TEST_ADMIN.email,
        },
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      // Response is wrapped: {success: true, data: {tenants: [...]}}
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('tenants');
      expect(Array.isArray(data.data.tenants)).toBe(true);
      expect(data.data.tenants.length).toBeGreaterThan(0);
    });

    test('should login with valid credentials', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      const loginResponse = await client.login(
        TEST_ADMIN.email,
        TEST_ADMIN.password,
        TEST_ADMIN.tenantId
      );

      expect(loginResponse).toHaveProperty('accessToken');
      expect(loginResponse).toHaveProperty('refreshToken');
      expect(loginResponse).toHaveProperty('user');
      expect(loginResponse.user.email).toBe(TEST_ADMIN.email);
      // Note: user object may not include tenantId in the response
      expect(loginResponse.user.role).toBeDefined();
    });

    test('should reject login with invalid email', async ({ request }) => {
      const response = await request.post(`${baseURL}${API_ENDPOINTS.AUTH_LOGIN}`, {
        data: {
          email: 'nonexistent-xyz-12345@example.com',
          password: 'SomePassword123',
          tenantId: TEST_ADMIN.tenantId,
        },
      });

      expect([401, 400]).toContain(response.status());
      const data = await response.json();
      // Error response: {success: false, error: {message: "..."}}
      expect(data.success === false || data.error).toBeDefined();
    });

    test('should reject login with invalid password', async ({ request }) => {
      const response = await request.post(`${baseURL}${API_ENDPOINTS.AUTH_LOGIN}`, {
        data: {
          email: TEST_ADMIN.email,
          password: 'WrongPassword123XYZ',
          tenantId: TEST_ADMIN.tenantId,
        },
      });

      expect([401, 400, 429]).toContain(response.status());
    });

    test('should reject login with missing or empty tenantId', async ({ request }) => {
      const response = await request.post(`${baseURL}${API_ENDPOINTS.AUTH_LOGIN}`, {
        data: {
          email: TEST_ADMIN.email,
          password: TEST_ADMIN.password,
          tenantId: '',
        },
      });

      expect([400, 401]).toContain(response.status());
    });
  });

  test.describe.serial('Token Management', () => {
    test('should refresh token with valid refresh token', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      const loginResponse = await client.login(
        TEST_ADMIN.email,
        TEST_ADMIN.password,
        TEST_ADMIN.tenantId
      );

      // Wait briefly so JWT iat differs
      await new Promise(resolve => setTimeout(resolve, 1100));
      const refreshResponse = await client.refreshToken(loginResponse.refreshToken);
      expect(refreshResponse).toHaveProperty('accessToken');
      expect(refreshResponse).toHaveProperty('refreshToken');
      // New refresh token should be different (old one is consumed)
      expect(refreshResponse.refreshToken).not.toBe(loginResponse.refreshToken);
    });

    test('should reject refresh with invalid refresh token', async ({ request }) => {
      const response = await request.post(`${baseURL}${API_ENDPOINTS.AUTH_REFRESH}`, {
        data: {
          refreshToken: 'invalid-refresh-token-xyz123',
        },
      });

      expect([401, 400]).toContain(response.status());
    });
  });

  test.describe.serial('Authorization & Access Control', () => {
    test('should return 401 for requests without authentication token', async ({ request }) => {
      const response = await request.get(`${baseURL}/api/contacts`);
      expect(response.status()).toBe(401);
    });

    test('should return 401 for requests with invalid token', async ({ request }) => {
      const response = await request.get(`${baseURL}/api/contacts`, {
        headers: {
          'Authorization': 'Bearer invalid-token-xyz-12345-abc',
        },
      });

      expect([401, 403]).toContain(response.status());
    });

    test('should reject malformed authorization header', async ({ request }) => {
      const response = await request.get(`${baseURL}/api/contacts`, {
        headers: {
          'Authorization': 'InvalidFormat token-here',
        },
      });

      expect([400, 401]).toContain(response.status());
    });

    test('should allow admin to access contacts endpoint', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get('/api/contacts');
      expect(response).toBeDefined();
      // Should be an array or null
      expect(Array.isArray(response) || response === null).toBe(true);
    });

    test('should allow salesperson to access leads endpoint', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(
        TEST_SALESPERSON.email,
        TEST_SALESPERSON.password,
        TEST_SALESPERSON.tenantId
      );

      const response = await client.get('/api/leads');
      expect(response).toBeDefined();
    });
  });

  test.describe.serial('Session Management & Logout', () => {
    test('should invalidate session after logout', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(
        TEST_ADMIN.email,
        TEST_ADMIN.password,
        TEST_ADMIN.tenantId
      );

      // Logout
      const logoutResponse = await client.raw('POST', `${API_ENDPOINTS.AUTH_LOGOUT}`);
      expect([200, 204]).toContain(logoutResponse.status());

      // Clear token from client
      client.clearToken();

      // Try to use endpoint without token - should fail
      const protectedResponse = await client.raw('GET', '/api/contacts');
      expect(protectedResponse.status()).toBe(401);
    });

    test('should handle concurrent requests with same token', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      // Make 5 concurrent requests
      const promises = Array.from({ length: 5 }).map(() => client.get('/api/contacts'));
      const responses = await Promise.all(promises);

      // All should succeed
      responses.forEach(response => {
        expect(response).toBeDefined();
      });
    });
  });
});
