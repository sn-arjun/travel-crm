import { test, expect } from '@playwright/test';
import { APIClient } from '../helpers/api-client';
import {
  createTestContact,
  createTestTemplate,
  TEST_ADMIN,
  API_ENDPOINTS,
} from '../helpers/test-data';

test.describe('M8: Communications & Message Templates', () => {
  const baseURL = process.env.API_BASE_URL || 'http://localhost:8787';

  test.describe.serial('Message Template CRUD', () => {
    let templateIdEmail: string;

    test('should create email message template', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const templateData = createTestTemplate('email');
      const response = await client.post(API_ENDPOINTS.TEMPLATES, templateData);

      expect(response).toHaveProperty('id');
      expect(response.channel).toBe('email');
      expect(response.name).toBe(templateData.name);
      templateIdEmail = response.id;
    });

    test('should create whatsapp message template', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const templateData = createTestTemplate('whatsapp');
      const response = await client.post(API_ENDPOINTS.TEMPLATES, templateData);

      expect(response).toHaveProperty('id');
      expect(response.channel).toBe('whatsapp');
    });

    test('should create sms message template', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const templateData = createTestTemplate('sms');
      const response = await client.post(API_ENDPOINTS.TEMPLATES, templateData);

      expect(response).toHaveProperty('id');
      expect(response.channel).toBe('sms');
    });

    test('should retrieve template by ID', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(`${API_ENDPOINTS.TEMPLATES}/${templateIdEmail}`);

      expect(response.id).toBe(templateIdEmail);
      expect(response.channel).toBe('email');
    });

    test('should list all message templates', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(API_ENDPOINTS.TEMPLATES);

      expect(Array.isArray(response)).toBe(true);
      expect(response.length).toBeGreaterThan(0);
    });

    test('should update template name', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const updateData = { name: 'Updated Template Name' };
      const response = await client.put(`${API_ENDPOINTS.TEMPLATES}/${templateIdEmail}`, updateData);

      expect(response.name).toBe(updateData.name);
    });

    test('should soft-delete message template', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const templateData = createTestTemplate('email');
      const createResponse = await client.post(API_ENDPOINTS.TEMPLATES, templateData);
      const tempTemplateId = createResponse.id;

      const deleteResponse = await client.delete(`${API_ENDPOINTS.TEMPLATES}/${tempTemplateId}`);
      expect(deleteResponse).toBeDefined();

      // After soft delete, template should be marked inactive
      const getResponse = await client.get(`${API_ENDPOINTS.TEMPLATES}/${tempTemplateId}`);
      expect(getResponse.isActive).toBe(0);
    });
  });

  test.describe.serial('Send Communications', () => {
    let contactId: string;
    let templateId: string;

    test('setup: create contact and template', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contactData = createTestContact();
      const contactResponse = await client.post(API_ENDPOINTS.CONTACTS, contactData);
      contactId = contactResponse.id;

      const templateData = createTestTemplate('email');
      const templateResponse = await client.post(API_ENDPOINTS.TEMPLATES, templateData);
      templateId = templateResponse.id;
    });

    test('should send email communication to contact', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      // Backend zod schema expects snake_case keys
      const communicationData = {
        contact_id: contactId,
        channel: 'email',
        message: 'Hello! Your booking is confirmed. Thank you for choosing us.',
      };

      const response = await client.post(API_ENDPOINTS.COMMUNICATIONS + '/send', communicationData);

      expect(response).toHaveProperty('messageId');
      expect(response.status).toBe('queued');
    });

    test('should send whatsapp communication to contact', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const communicationData = {
        contact_id: contactId,
        channel: 'whatsapp',
        message: 'Your booking confirmation has been sent. Thank you!',
      };

      const response = await client.post(API_ENDPOINTS.COMMUNICATIONS + '/send', communicationData);

      expect(response).toHaveProperty('messageId');
      expect(response.status).toBe('queued');
    });

    test('should send sms communication to contact', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const communicationData = {
        contact_id: contactId,
        channel: 'sms',
        message: 'Your booking is confirmed. Details: your-details-here',
      };

      const response = await client.post(API_ENDPOINTS.COMMUNICATIONS + '/send', communicationData);

      expect(response).toHaveProperty('messageId');
      expect(response.status).toBe('queued');
    });

    test('should send template message', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      // send-template expects snake_case: contact_id, template_id
      const communicationData = {
        contact_id: contactId,
        template_id: templateId,
      };

      const response = await client.post(
        API_ENDPOINTS.COMMUNICATIONS + '/send-template',
        communicationData
      );

      expect(response).toHaveProperty('messageId');
      expect(response.status).toBe('queued');
    });

    test('should send bulk communication to multiple contacts', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contact2Data = createTestContact();
      const contact2Response = await client.post(API_ENDPOINTS.CONTACTS, contact2Data);
      const contact2Id = contact2Response.id;

      const contact3Data = createTestContact();
      const contact3Response = await client.post(API_ENDPOINTS.CONTACTS, contact3Data);
      const contact3Id = contact3Response.id;

      // bulk-send expects snake_case: contact_ids
      const bulkData = {
        contact_ids: [contactId, contact2Id, contact3Id],
        channel: 'email',
        message: 'Bulk message to all customers',
      };

      const response = await client.post(API_ENDPOINTS.COMMUNICATIONS + '/bulk-send', bulkData);

      expect(response).toHaveProperty('batchId');
      expect(response.status).toBe('queued');
      expect(response.totalMessages).toBeGreaterThan(0);
    });
  });

  test.describe.serial('Communication History', () => {
    let contactId: string;

    test('setup: create contact and send message', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contactData = createTestContact();
      const contactResponse = await client.post(API_ENDPOINTS.CONTACTS, contactData);
      contactId = contactResponse.id;

      // Send a message to have history
      await client.post(API_ENDPOINTS.COMMUNICATIONS + '/send', {
        contact_id: contactResponse.id,
        channel: 'email',
        message: 'Test communication for history',
      });
    });

    test('should retrieve communication history for contact', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      // Backend history expects query param contact_id (snake_case)
      const response = await client.get(API_ENDPOINTS.COMMUNICATIONS + '/history', {
        contact_id: contactId,
      });

      expect(Array.isArray(response)).toBe(true);
    });

    test('should filter communication history by channel', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(API_ENDPOINTS.COMMUNICATIONS + '/history', {
        contact_id: contactId,
        channel: 'email',
      });

      expect(Array.isArray(response)).toBe(true);
      response.forEach((comm: any) => {
        expect(comm.channel).toBe('email');
      });
    });

    test('should retrieve communication with timestamp', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(API_ENDPOINTS.COMMUNICATIONS + '/history', {
        contact_id: contactId,
      });

      expect(Array.isArray(response)).toBe(true);
      if (response.length > 0) {
        response.forEach((comm: any) => {
          expect(comm).toHaveProperty('createdAt');
        });
      }
    });
  });

  test.describe.serial('Communication Log', () => {
    test('should retrieve communication log', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      // paginated() response: {success, data: [...], pagination: {...}}
      // After api-client unwrap, returns the array directly
      const response = await client.get(API_ENDPOINTS.COMMUNICATIONS + '/log', {
        page: 1,
        limit: 20,
      });

      expect(Array.isArray(response)).toBe(true);
    });

    test('should filter log by channel', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(API_ENDPOINTS.COMMUNICATIONS + '/log', {
        channel: 'email',
        page: 1,
      });

      expect(Array.isArray(response)).toBe(true);
    });

    test('should filter log by status', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(API_ENDPOINTS.COMMUNICATIONS + '/log', {
        status: 'queued',
        page: 1,
      });

      expect(Array.isArray(response)).toBe(true);
    });
  });

  test.describe.serial('Communication Validation', () => {
    test('should reject invalid contact', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invalidData = {
        contact_id: '00000000-0000-0000-0000-000000000000',
        channel: 'email',
        message: 'Test message',
      };

      const response = await client.raw('POST', API_ENDPOINTS.COMMUNICATIONS + '/send', {
        data: invalidData,
      });

      expect([400, 404]).toContain(response.status());
    });

    test('should validate channel is valid', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contactData = createTestContact();
      const contactResponse = await client.post(API_ENDPOINTS.CONTACTS, contactData);

      const invalidData = {
        contact_id: contactResponse.id,
        channel: 'invalid_channel',
        message: 'Test message',
      };

      const response = await client.raw('POST', API_ENDPOINTS.COMMUNICATIONS + '/send', {
        data: invalidData,
      });

      expect([400, 422]).toContain(response.status());
    });

    test('should validate message is required', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contactData = createTestContact();
      const contactResponse = await client.post(API_ENDPOINTS.CONTACTS, contactData);

      const invalidData = {
        contact_id: contactResponse.id,
        channel: 'email',
        // Missing message
      };

      const response = await client.raw('POST', API_ENDPOINTS.COMMUNICATIONS + '/send', {
        data: invalidData,
      });

      expect([400, 422]).toContain(response.status());
    });
  });
});
