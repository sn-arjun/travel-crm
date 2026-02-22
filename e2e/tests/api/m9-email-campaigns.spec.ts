import { test, expect } from '@playwright/test';
import { APIClient } from '../helpers/api-client';
import { createTestTemplate, TEST_ADMIN, API_ENDPOINTS } from '../helpers/test-data';

test.describe('M9: Email Campaigns & Campaign Management', () => {
  const baseURL = process.env.API_BASE_URL || 'http://localhost:8787';

  test.describe.serial('Campaign CRUD Operations', () => {
    let campaignId: string;
    let templateId: string;

    test('setup: create template', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const templateData = createTestTemplate('email');
      const templateResponse = await client.post(API_ENDPOINTS.TEMPLATES, templateData);
      templateId = templateResponse.id;
    });

    test('should create a new campaign in draft status', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const campaignData = {
        name: `Campaign-${Math.random().toString(36).substring(7)}`,
        templateId,
        subject: 'Test Campaign Subject',
        body: 'Test campaign body content',
        segmentFilters: {
          contactTypes: ['customer'],
          cities: ['Mumbai'],
        },
      };

      const response = await client.post(API_ENDPOINTS.CAMPAIGNS, campaignData);

      expect(response).toHaveProperty('id');
      expect(response.name).toBe(campaignData.name);
      expect(response.status).toBe('draft');
      campaignId = response.id;
    });

    test('should retrieve campaign by ID', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(`${API_ENDPOINTS.CAMPAIGNS}/${campaignId}`);

      expect(response.id).toBe(campaignId);
      expect(response.name).toBeDefined();
      expect(response.status).toBeDefined();
    });

    test('should list all campaigns', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      // paginated() response unwraps to array
      const response = await client.get(API_ENDPOINTS.CAMPAIGNS);

      expect(Array.isArray(response)).toBe(true);
    });

    test('should list campaigns filtered by status', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(API_ENDPOINTS.CAMPAIGNS, { status: 'draft' });

      expect(Array.isArray(response)).toBe(true);
      response.forEach((campaign: any) => {
        expect(campaign.status).toBe('draft');
      });
    });

    test('should update campaign name', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const newName = `Updated-${Math.random().toString(36).substring(7)}`;
      const updateData = { name: newName };

      const response = await client.put(`${API_ENDPOINTS.CAMPAIGNS}/${campaignId}`, updateData);

      expect(response.name).toBe(newName);
    });

    test('should update campaign subject', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const newSubject = 'Updated Subject';
      const updateData = { subject: newSubject };

      const response = await client.put(`${API_ENDPOINTS.CAMPAIGNS}/${campaignId}`, updateData);

      expect(response.subject).toBe(newSubject);
    });

    test('should delete draft campaign', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const campaignData = {
        name: `Delete-Test-${Math.random().toString(36).substring(7)}`,
        templateId,
        subject: 'Test',
        body: 'Test',
        segmentFilters: {},
      };

      const createResponse = await client.post(API_ENDPOINTS.CAMPAIGNS, campaignData);
      const tempCampaignId = createResponse.id;

      await client.delete(`${API_ENDPOINTS.CAMPAIGNS}/${tempCampaignId}`);

      const getResponse = await client.raw('GET', `${API_ENDPOINTS.CAMPAIGNS}/${tempCampaignId}`);
      expect(getResponse.status()).toBe(404);
    });
  });

  test.describe.serial('Campaign Lifecycle - Scheduling and Sending', () => {
    let campaignId: string;
    let templateId: string;

    test('setup: create template', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const templateData = createTestTemplate('email');
      const templateResponse = await client.post(API_ENDPOINTS.TEMPLATES, templateData);
      templateId = templateResponse.id;
    });

    test('should create draft campaign', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const campaignData = {
        name: `Lifecycle-${Math.random().toString(36).substring(7)}`,
        templateId,
        subject: 'Lifecycle Test',
        body: 'Test body',
        segmentFilters: { contactTypes: ['customer'] },
      };

      const response = await client.post(API_ENDPOINTS.CAMPAIGNS, campaignData);

      expect(response.status).toBe('draft');
      campaignId = response.id;
    });

    test('should schedule campaign for later', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const response = await client.post(`${API_ENDPOINTS.CAMPAIGNS}/${campaignId}/schedule`, {
        scheduledAt: futureDate,
      });

      expect(response.status).toBe('scheduled');
      expect(response.scheduledAt).toBeDefined();
    });

    test('should cancel scheduled campaign', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.post(`${API_ENDPOINTS.CAMPAIGNS}/${campaignId}/cancel`, {});

      expect(response.status).toBe('cancelled');
    });
  });

  test.describe.serial('Campaign Send Operation', () => {
    let campaignId: string;
    let templateId: string;

    test('setup: create template and campaign', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const templateData = createTestTemplate('email');
      const templateResponse = await client.post(API_ENDPOINTS.TEMPLATES, templateData);
      templateId = templateResponse.id;

      const campaignData = {
        name: `Send-Test-${Math.random().toString(36).substring(7)}`,
        templateId,
        subject: 'Send Test',
        body: 'Test content',
        segmentFilters: { contactTypes: ['customer'] },
      };

      const campaignResponse = await client.post(API_ENDPOINTS.CAMPAIGNS, campaignData);
      campaignId = campaignResponse.id;
    });

    test('should send campaign immediately', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.post(`${API_ENDPOINTS.CAMPAIGNS}/${campaignId}/send`, {});

      expect(response).toHaveProperty('message');
      expect(response).toHaveProperty('queuedCount');
    });

    test('should retrieve campaign with updated status', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(`${API_ENDPOINTS.CAMPAIGNS}/${campaignId}`);

      expect(response.status).toBe('sending');
    });
  });

  test.describe.serial('Campaign Segmentation', () => {
    let templateId: string;

    test('setup: create template', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const templateData = createTestTemplate('email');
      const templateResponse = await client.post(API_ENDPOINTS.TEMPLATES, templateData);
      templateId = templateResponse.id;
    });

    test('should create campaign with customer type filter', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const campaignData = {
        name: `Type-Filter-${Math.random().toString(36).substring(7)}`,
        templateId,
        subject: 'Type Filter Test',
        body: 'Test',
        segmentFilters: { contactTypes: ['customer'] },
      };

      const response = await client.post(API_ENDPOINTS.CAMPAIGNS, campaignData);

      expect(response.segmentFilters.contactTypes).toContain('customer');
    });

    test('should create campaign with geographic filter', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const campaignData = {
        name: `Geo-Filter-${Math.random().toString(36).substring(7)}`,
        templateId,
        subject: 'Geo Test',
        body: 'Test',
        segmentFilters: { cities: ['Mumbai'], countries: ['India'] },
      };

      const response = await client.post(API_ENDPOINTS.CAMPAIGNS, campaignData);

      expect(response.segmentFilters.cities).toContain('Mumbai');
      expect(response.segmentFilters.countries).toContain('India');
    });

    test('should create campaign with birthday month filter', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const campaignData = {
        name: `Birthday-Filter-${Math.random().toString(36).substring(7)}`,
        templateId,
        subject: 'Birthday Test',
        body: 'Test',
        segmentFilters: { birthdayMonth: 12 },
      };

      const response = await client.post(API_ENDPOINTS.CAMPAIGNS, campaignData);

      expect(response.segmentFilters.birthdayMonth).toBe(12);
    });
  });

  test.describe.serial('Campaign Validation', () => {
    test('should validate required fields on campaign creation', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invalidData = {};

      const response = await client.raw('POST', API_ENDPOINTS.CAMPAIGNS, {
        data: invalidData,
      });

      expect([400, 422]).toContain(response.status());
    });

    test('should validate campaign name is not empty', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const templateData = createTestTemplate('email');
      const templateResponse = await client.post(API_ENDPOINTS.TEMPLATES, templateData);

      const invalidData = {
        name: '',
        templateId: templateResponse.id,
        subject: 'Test',
        body: 'Test',
        segmentFilters: {},
      };

      const response = await client.raw('POST', API_ENDPOINTS.CAMPAIGNS, {
        data: invalidData,
      });

      expect([400, 422]).toContain(response.status());
    });

    test('should validate subject is required', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const templateData = createTestTemplate('email');
      const templateResponse = await client.post(API_ENDPOINTS.TEMPLATES, templateData);

      const invalidData = {
        name: 'Test Campaign',
        templateId: templateResponse.id,
        segmentFilters: {},
      };

      const response = await client.raw('POST', API_ENDPOINTS.CAMPAIGNS, {
        data: invalidData,
      });

      expect([400, 422]).toContain(response.status());
    });

    test('should reject schedule with past date', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const templateData = createTestTemplate('email');
      const templateResponse = await client.post(API_ENDPOINTS.TEMPLATES, templateData);

      const campaignData = {
        name: `Past-Date-${Math.random().toString(36).substring(7)}`,
        templateId: templateResponse.id,
        subject: 'Test',
        body: 'Test',
        segmentFilters: {},
      };

      const campaignResponse = await client.post(API_ENDPOINTS.CAMPAIGNS, campaignData);

      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const response = await client.raw(
        'POST',
        `${API_ENDPOINTS.CAMPAIGNS}/${campaignResponse.id}/schedule`,
        {
          data: { scheduledAt: pastDate },
        }
      );

      expect([400, 422]).toContain(response.status());
    });

    test('should validate only draft campaigns can be updated', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const templateData = createTestTemplate('email');
      const templateResponse = await client.post(API_ENDPOINTS.TEMPLATES, templateData);

      const campaignData = {
        name: `Send-Then-Update-${Math.random().toString(36).substring(7)}`,
        templateId: templateResponse.id,
        subject: 'Test',
        body: 'Test',
        segmentFilters: { contactTypes: ['customer'] },
      };

      const campaignResponse = await client.post(API_ENDPOINTS.CAMPAIGNS, campaignData);

      await client.post(`${API_ENDPOINTS.CAMPAIGNS}/${campaignResponse.id}/send`, {});

      const response = await client.raw('PUT', `${API_ENDPOINTS.CAMPAIGNS}/${campaignResponse.id}`, {
        data: { name: 'Updated Name' },
      });

      expect([400, 409]).toContain(response.status());
    });
  });
});
