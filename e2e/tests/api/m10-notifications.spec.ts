import { test, expect } from '@playwright/test';
import { APIClient } from '../helpers/api-client';
import { TEST_ADMIN, API_ENDPOINTS } from '../helpers/test-data';

test.describe('M10: Notifications & Push Tokens', () => {
  const baseURL = process.env.API_BASE_URL || 'http://localhost:8787';

  test.describe.serial('Push Token Management', () => {
    let tokenId: string;

    test('should register android push token', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const tokenData = {
        fcmToken: `android-token-${Math.random().toString(36).substring(7)}`,
        deviceType: 'android',
        deviceName: 'Samsung Galaxy S21',
      };

      const response = await client.post(API_ENDPOINTS.PUSH_TOKENS, tokenData);

      expect(response).toHaveProperty('id');
      expect(response.fcmToken).toBe(tokenData.fcmToken);
      expect(response.deviceType).toBe('android');
      tokenId = response.id;
    });

    test('should register ios push token', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const tokenData = {
        fcmToken: `ios-token-${Math.random().toString(36).substring(7)}`,
        deviceType: 'ios',
        deviceName: 'iPhone 13 Pro',
      };

      const response = await client.post(API_ENDPOINTS.PUSH_TOKENS, tokenData);

      expect(response).toHaveProperty('id');
      expect(response.deviceType).toBe('ios');
    });

    test('should register web push token', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const tokenData = {
        fcmToken: `web-token-${Math.random().toString(36).substring(7)}`,
        deviceType: 'web',
        deviceName: 'Chrome on Desktop',
      };

      const response = await client.post(API_ENDPOINTS.PUSH_TOKENS, tokenData);

      expect(response.deviceType).toBe('web');
    });

    test('should list all push tokens for user', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(API_ENDPOINTS.PUSH_TOKENS);

      expect(response).toHaveProperty('items');
      expect(Array.isArray(response.items)).toBe(true);
      expect(response).toHaveProperty('total');
    });

    test('should handle duplicate FCM tokens gracefully', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const token = `duplicate-${Math.random().toString(36).substring(7)}`;
      const tokenData = {
        fcmToken: token,
        deviceType: 'android',
        deviceName: 'Device 1',
      };

      const firstResponse = await client.post(API_ENDPOINTS.PUSH_TOKENS, tokenData);
      expect(firstResponse).toHaveProperty('id');

      const secondResponse = await client.post(API_ENDPOINTS.PUSH_TOKENS, tokenData);
      expect(secondResponse).toHaveProperty('id');
      expect(secondResponse.id).toBe(firstResponse.id);
    });

    test('should delete push token by ID', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const tokenData = {
        fcmToken: `delete-test-${Math.random().toString(36).substring(7)}`,
        deviceType: 'android',
        deviceName: 'Device to Delete',
      };

      const createResponse = await client.post(API_ENDPOINTS.PUSH_TOKENS, tokenData);
      const tempTokenId = createResponse.id;

      await client.delete(`${API_ENDPOINTS.PUSH_TOKENS}/${tempTokenId}`);

      // Verify deletion by listing and checking token is gone
      const listResponse = await client.get(API_ENDPOINTS.PUSH_TOKENS);
      const found = listResponse.items.find((t: any) => t.id === tempTokenId);
      expect(found).toBeUndefined();
    });

    test('should deregister push token by FCM token value', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const fcmToken = `deregister-${Math.random().toString(36).substring(7)}`;
      const tokenData = {
        fcmToken,
        deviceType: 'web',
        deviceName: 'Browser',
      };

      await client.post(API_ENDPOINTS.PUSH_TOKENS, tokenData);

      // Backend uses DELETE /push-tokens/token/:fcmToken
      await client.delete(`${API_ENDPOINTS.PUSH_TOKENS}/token/${fcmToken}`);

      // Verify it's gone
      const listResponse = await client.get(API_ENDPOINTS.PUSH_TOKENS);
      const found = listResponse.items.find((t: any) => t.fcmToken === fcmToken);
      expect(found).toBeUndefined();
    });
  });

  test.describe.serial('Notification CRUD Operations', () => {
    test('should list current user notifications', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(API_ENDPOINTS.NOTIFICATIONS);

      expect(response).toHaveProperty('items');
      expect(Array.isArray(response.items)).toBe(true);
      expect(response).toHaveProperty('total');
      expect(response).toHaveProperty('page');
    });

    test('should get unread notifications', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(API_ENDPOINTS.NOTIFICATIONS, { unread: 'true' });

      expect(response).toHaveProperty('items');
      expect(Array.isArray(response.items)).toBe(true);
    });

    test('should get badge counts for dashboard', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(API_ENDPOINTS.NOTIFICATIONS + '/badge-counts');

      expect(response).toHaveProperty('unreadNotifications');
      expect(response).toHaveProperty('overdueFollowups');
      expect(response).toHaveProperty('pendingTasks');
      expect(response).toHaveProperty('overdueInvoices');
    });

    test('should mark all notifications as read', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.put(API_ENDPOINTS.NOTIFICATIONS + '/read-all', {});

      expect(response).toBeDefined();
      expect(response).toHaveProperty('message');
    });
  });

  test.describe.serial('Notification Preferences', () => {
    test('should get current user notification preferences', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(API_ENDPOINTS.NOTIFICATIONS_PREFERENCES + '/me');

      expect(response).toHaveProperty('preferences');
      expect(response).toHaveProperty('quietHours');
    });

    test('should update notification preferences', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const updateData = {
        preferences: {
          lead_assigned: {
            push_enabled: false,
            in_app_enabled: true,
            email_enabled: false,
          },
        },
      };

      const response = await client.put(API_ENDPOINTS.NOTIFICATIONS_PREFERENCES + '/me', updateData);

      expect(response).toHaveProperty('preferences');
    });

    test('should get quiet hours', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(
        API_ENDPOINTS.NOTIFICATIONS_PREFERENCES + '/me/quiet-hours'
      );

      expect(response).toHaveProperty('startHour');
      expect(response).toHaveProperty('endHour');
      expect(response.startHour).toBeGreaterThanOrEqual(0);
      expect(response.endHour).toBeLessThanOrEqual(23);
    });

    test('should set quiet hours', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const quietHoursData = {
        startHour: 22,
        endHour: 8,
      };

      const response = await client.put(
        API_ENDPOINTS.NOTIFICATIONS_PREFERENCES + '/me/quiet-hours',
        quietHoursData
      );

      expect(response.startHour).toBe(22);
      expect(response.endHour).toBe(8);
    });

    test('should validate quiet hours range - reject too high', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invalidData = {
        startHour: 25,
        endHour: 8,
      };

      const response = await client.raw(
        'PUT',
        API_ENDPOINTS.NOTIFICATIONS_PREFERENCES + '/me/quiet-hours',
        {
          data: invalidData,
        }
      );

      expect([400, 422]).toContain(response.status());
    });

    test('should validate quiet hours range - reject negative', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invalidData = {
        startHour: -1,
        endHour: 8,
      };

      const response = await client.raw(
        'PUT',
        API_ENDPOINTS.NOTIFICATIONS_PREFERENCES + '/me/quiet-hours',
        {
          data: invalidData,
        }
      );

      expect([400, 422]).toContain(response.status());
    });
  });

  test.describe.serial('Announcements', () => {
    test('should send announcement to all users', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const announcementData = {
        title: 'System Maintenance',
        body: 'The system will be under maintenance tonight',
        target: 'all',
      };

      const response = await client.post(
        API_ENDPOINTS.NOTIFICATIONS + '/announce',
        announcementData
      );

      expect(response).toHaveProperty('sentCount');
    });

    test('should send announcement to specific role', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const announcementData = {
        title: 'Manager Announcement',
        body: 'Important update for managers',
        target: 'role:sales_manager',
      };

      const response = await client.post(
        API_ENDPOINTS.NOTIFICATIONS + '/announce',
        announcementData
      );

      expect(response).toHaveProperty('sentCount');
    });
  });

  test.describe.serial('Unread Count', () => {
    test('should get unread count via query param', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(API_ENDPOINTS.NOTIFICATIONS, { count: 'true' });

      expect(response).toHaveProperty('count');
      expect(response.count).toBeGreaterThanOrEqual(0);
    });

    test('should get unread count endpoint', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(API_ENDPOINTS.NOTIFICATIONS + '/unread-count');

      expect(response).toHaveProperty('unreadCount');
      expect(response.unreadCount).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe.serial('Push Token Validation', () => {
    test('should validate fcmToken is required', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invalidData = {
        deviceType: 'android',
        deviceName: 'Test Device',
      };

      const response = await client.raw('POST', API_ENDPOINTS.PUSH_TOKENS, {
        data: invalidData,
      });

      expect([400, 422]).toContain(response.status());
    });

    test('should accept minimal token data (only fcmToken)', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const tokenData = {
        fcmToken: `minimal-${Math.random().toString(36).substring(7)}`,
      };

      const response = await client.post(API_ENDPOINTS.PUSH_TOKENS, tokenData);

      expect(response).toHaveProperty('id');
      expect(response.deviceType).toBe('web'); // default
    });
  });
});
