import { test, expect } from '@playwright/test';
import { APIClient } from '../helpers/api-client';
import {
  createTestContact,
  createTestLead,
  createTestFollowUp,
  TEST_ADMIN,
  API_ENDPOINTS,
} from '../helpers/test-data';

test.describe('M5: Follow-ups Management', () => {
  const baseURL = process.env.API_BASE_URL || 'http://localhost:8787';

  test.describe.serial('Follow-up CRUD Operations', () => {
    let contactId: string;
    let leadId: string;
    let followUpId: string;

    test('should create contact and lead for follow-up tests', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      // Create contact
      const contactData = createTestContact();
      const contactResponse = await client.post(API_ENDPOINTS.CONTACTS, contactData);
      expect(contactResponse).toHaveProperty('id');
      contactId = contactResponse.id;

      // Create lead
      const leadData = createTestLead(contactId);
      const leadResponse = await client.post(API_ENDPOINTS.LEADS, leadData);
      expect(leadResponse).toHaveProperty('id');
      leadId = leadResponse.id;
    });

    test('should create a follow-up for a lead', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const followUpData = createTestFollowUp(leadId);
      const response = await client.post(API_ENDPOINTS.FOLLOWUPS, followUpData);

      expect(response).toHaveProperty('id');
      expect(response.leadId).toBe(leadId);
      expect(response.type).toBe(followUpData.type);
      expect(response.status).toBe('pending');
      expect(response.notes).toBe(followUpData.notes);

      followUpId = response.id;
    });

    test('should find follow-up in list', async ({ request }) => {
      // No GET /:id endpoint exists — use the list endpoint instead
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(`${API_ENDPOINTS.FOLLOWUPS}?team=true`);

      expect(Array.isArray(response)).toBe(true);
      expect(response.length).toBeGreaterThan(0);

      const followUp = response.find((f: any) => f.id === followUpId);
      expect(followUp).toBeDefined();
      expect(followUp.leadId).toBe(leadId);
    });

    test('should list all follow-ups', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(`${API_ENDPOINTS.FOLLOWUPS}?team=true`);

      expect(Array.isArray(response)).toBe(true);
      expect(response.length).toBeGreaterThan(0);

      const followUp = response.find((f: any) => f.id === followUpId);
      expect(followUp).toBeDefined();
    });

    test('should update follow-up notes', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const updateData = {
        notes: 'Updated: Client will confirm after discussing with spouse',
      };

      const response = await client.put(
        `${API_ENDPOINTS.FOLLOWUPS}/${followUpId}`,
        updateData
      );

      expect(response.notes).toBe(updateData.notes);
    });

    test('should update follow-up type', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const updateData = { type: 'call' };
      const response = await client.put(`${API_ENDPOINTS.FOLLOWUPS}/${followUpId}`, updateData);

      expect(response.type).toBe('call');
    });

    test('should complete a follow-up via /complete endpoint', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      // Create a temp follow-up to complete
      const followUpData = createTestFollowUp(leadId);
      const createResponse = await client.post(API_ENDPOINTS.FOLLOWUPS, followUpData);
      const tempFollowUpId = createResponse.id;

      // Use the dedicated /complete endpoint
      const response = await client.put(
        `${API_ENDPOINTS.FOLLOWUPS}/${tempFollowUpId}/complete`,
        { outcomeNotes: 'client_agreed_to_booking' }
      );

      expect(response.status).toBe('completed');
      expect(response.completedAt).toBeDefined();
    });

    test('should delete a follow-up', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      // Create a temp follow-up to delete
      const followUpData = createTestFollowUp(leadId);
      const createResponse = await client.post(API_ENDPOINTS.FOLLOWUPS, followUpData);
      const tempFollowUpId = createResponse.id;

      const deleteResponse = await client.delete(`${API_ENDPOINTS.FOLLOWUPS}/${tempFollowUpId}`);
      expect(deleteResponse).toBeDefined();

      // Deleted follow-ups should no longer appear in list
      const listResponse = await client.get(`${API_ENDPOINTS.FOLLOWUPS}?team=true`);
      const found = listResponse.find((f: any) => f.id === tempFollowUpId);
      expect(found).toBeUndefined();
    });
  });

  test.describe.serial('Follow-up Status Management', () => {
    let contactId: string;
    let leadId: string;

    test('should create contact and lead for status tests', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contactData = createTestContact();
      const contactResponse = await client.post(API_ENDPOINTS.CONTACTS, contactData);
      contactId = contactResponse.id;

      const leadData = createTestLead(contactId);
      const leadResponse = await client.post(API_ENDPOINTS.LEADS, leadData);
      leadId = leadResponse.id;
    });

    test('should start follow-up with pending status', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const followUpData = createTestFollowUp(leadId);
      const response = await client.post(API_ENDPOINTS.FOLLOWUPS, followUpData);

      expect(response.status).toBe('pending');
    });

    test('should transition pending -> completed via /complete endpoint', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      // Create follow-up
      const followUpData = createTestFollowUp(leadId);
      const createResponse = await client.post(API_ENDPOINTS.FOLLOWUPS, followUpData);
      const followUpId = createResponse.id;

      // Complete via dedicated endpoint
      const response = await client.put(`${API_ENDPOINTS.FOLLOWUPS}/${followUpId}/complete`, {
        outcomeNotes: 'Client confirmed booking',
      });

      expect(response.status).toBe('completed');
      expect(response.completedAt).toBeDefined();
    });

    test('should cancel follow-up by deleting', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      // Create follow-up
      const followUpData = createTestFollowUp(leadId);
      const createResponse = await client.post(API_ENDPOINTS.FOLLOWUPS, followUpData);
      const followUpId = createResponse.id;

      // DELETE is the cancellation mechanism
      const response = await client.delete(`${API_ENDPOINTS.FOLLOWUPS}/${followUpId}`);
      expect(response).toBeDefined();
    });

    test('should not complete an already-completed follow-up', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      // Create and complete a follow-up
      const followUpData = createTestFollowUp(leadId);
      const createResponse = await client.post(API_ENDPOINTS.FOLLOWUPS, followUpData);
      const followUpId = createResponse.id;

      await client.put(`${API_ENDPOINTS.FOLLOWUPS}/${followUpId}/complete`, {});

      // Try to complete again — should fail
      const response = await client.raw('PUT', `${API_ENDPOINTS.FOLLOWUPS}/${followUpId}/complete`, {
        data: {},
      });
      expect(response.status()).toBe(400);
    });
  });

  test.describe.serial('Follow-up Validation', () => {
    let contactId: string;
    let leadId: string;

    test('should create contact and lead for validation tests', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contactData = createTestContact();
      const contactResponse = await client.post(API_ENDPOINTS.CONTACTS, contactData);
      contactId = contactResponse.id;

      const leadData = createTestLead(contactId);
      const leadResponse = await client.post(API_ENDPOINTS.LEADS, leadData);
      leadId = leadResponse.id;
    });

    test('should require leadId', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invalidData = {
        type: 'call',
        scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await client.raw('POST', API_ENDPOINTS.FOLLOWUPS, {
        data: invalidData,
      });

      expect([400, 422]).toContain(response.status());
    });

    test('should require type', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invalidData = {
        leadId,
        scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await client.raw('POST', API_ENDPOINTS.FOLLOWUPS, {
        data: invalidData,
      });

      expect([400, 422]).toContain(response.status());
    });

    test('should require scheduledAt', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invalidData = {
        leadId,
        type: 'call',
      };

      const response = await client.raw('POST', API_ENDPOINTS.FOLLOWUPS, {
        data: invalidData,
      });

      expect([400, 422]).toContain(response.status());
    });

    test('should accept valid follow-up types', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      // Valid types per backend schema: call, email, whatsapp, visit, sms
      const types = ['email', 'call', 'whatsapp', 'visit', 'sms'];

      for (const type of types) {
        const followUpData = {
          ...createTestFollowUp(leadId),
          type,
        };

        const response = await client.post(API_ENDPOINTS.FOLLOWUPS, followUpData);
        expect(response.type).toBe(type);
      }
    });

    test('should reject invalid follow-up type', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const followUpData = {
        ...createTestFollowUp(leadId),
        type: 'telegram',
      };

      const response = await client.raw('POST', API_ENDPOINTS.FOLLOWUPS, {
        data: followUpData,
      });

      expect([400, 422]).toContain(response.status());
    });

    test('should reject invalid date format for scheduledAt', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const followUpData = {
        ...createTestFollowUp(leadId),
        scheduledAt: 'not-a-date',
      };

      const response = await client.raw('POST', API_ENDPOINTS.FOLLOWUPS, {
        data: followUpData,
      });

      expect([400, 422]).toContain(response.status());
    });
  });
});
