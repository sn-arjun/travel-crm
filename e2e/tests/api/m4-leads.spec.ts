import { test, expect } from '@playwright/test';
import { APIClient } from '../helpers/api-client';
import {
  createTestContact,
  createTestLead,
  TEST_ADMIN,
  API_ENDPOINTS,
} from '../helpers/test-data';

test.describe('M4: Lead Management & Pipeline', () => {
  const baseURL = process.env.API_BASE_URL || 'http://localhost:8787';

  test.describe.serial('Lead CRUD Operations', () => {
    let contactId: string;
    let leadId: string;

    test('should create contact and lead for CRUD tests', async ({ request }) => {
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
      expect(leadResponse.contactId).toBe(contactId);
      expect(leadResponse.title).toBe(leadData.title);
      expect(leadResponse.destinations).toEqual(leadData.destinations);
      expect(leadResponse.priority).toBe('warm');

      leadId = leadResponse.id;
    });

    test('should retrieve lead by ID', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(`${API_ENDPOINTS.LEADS}/${leadId}`);

      expect(response).toHaveProperty('id');
      expect(response.id).toBe(leadId);
      expect(response.contactId).toBe(contactId);
      expect(Array.isArray(response.destinations)).toBe(true);
    });

    test('should list all leads', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(API_ENDPOINTS.LEADS);

      expect(Array.isArray(response)).toBe(true);
      expect(response.length).toBeGreaterThan(0);

      const lead = response.find((l: any) => l.id === leadId);
      expect(lead).toBeDefined();
    });

    test('should update lead information', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const updateData = {
        title: 'Updated Bali Trip',
        budget: 750000,
        paxAdults: 3,
      };

      const response = await client.put(
        `${API_ENDPOINTS.LEADS}/${leadId}`,
        updateData
      );

      expect(response.title).toBe(updateData.title);
      expect(response.budget).toBe(updateData.budget);
      expect(response.paxAdults).toBe(updateData.paxAdults);
    });

    test('should delete a lead', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      // Create a temp lead to delete
      const leadData = createTestLead(contactId);
      const createResponse = await client.post(API_ENDPOINTS.LEADS, leadData);
      const tempLeadId = createResponse.id;

      // Delete it
      const deleteResponse = await client.delete(`${API_ENDPOINTS.LEADS}/${tempLeadId}`);
      expect(deleteResponse).toBeDefined();

      // Verify deletion
      const getResponse = await client.raw('GET', `${API_ENDPOINTS.LEADS}/${tempLeadId}`);
      expect(getResponse.status()).toBe(404);
    });
  });

  test.describe.serial('Lead Status Transitions', () => {
    let contactId: string;
    let leadId: string;

    test('should create contact and lead for status tests', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      // Create contact
      const contactData = createTestContact();
      const contactResponse = await client.post(API_ENDPOINTS.CONTACTS, contactData);
      contactId = contactResponse.id;

      // Create lead
      const leadData = createTestLead(contactId);
      const leadResponse = await client.post(API_ENDPOINTS.LEADS, leadData);
      leadId = leadResponse.id;

      // Verify initial status is 'new'
      const freshLead = await client.get(`${API_ENDPOINTS.LEADS}/${leadId}`);
      expect(freshLead.status).toBe('new');
    });

    test('should transition new -> contacted -> requirement_gathered -> booking_confirmed', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      // new -> contacted (use dedicated status endpoint)
      let response = await client.put(`${API_ENDPOINTS.LEADS}/${leadId}/status`, {
        status: 'contacted',
      });
      expect(response.status).toBe('contacted');

      // contacted -> requirement_gathered
      response = await client.put(`${API_ENDPOINTS.LEADS}/${leadId}/status`, {
        status: 'requirement_gathered',
      });
      expect(response.status).toBe('requirement_gathered');

      // requirement_gathered -> booking_confirmed (skip proposal_sent which requires itinerary)
      response = await client.put(`${API_ENDPOINTS.LEADS}/${leadId}/status`, {
        status: 'booking_confirmed',
      });
      expect(response.status).toBe('booking_confirmed');
    });

    test('should mark lead as lost with notes', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      // Create a new lead to mark as lost
      const leadData = createTestLead(contactId);
      const createResponse = await client.post(API_ENDPOINTS.LEADS, leadData);
      const tempLeadId = createResponse.id;

      // Backend requires lostReason when changing to 'lost'
      const response = await client.put(`${API_ENDPOINTS.LEADS}/${tempLeadId}/status`, {
        status: 'lost',
        lostReason: 'Client chose competitor',
      });
      expect(response.status).toBe('lost');
    });

    test('should reject invalid status value', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const updateData = { status: 'invalid_status_xyz' };
      const response = await client.raw('PUT', `${API_ENDPOINTS.LEADS}/${leadId}/status`, {
        data: updateData,
      });

      expect([400, 422]).toContain(response.status());
    });
  });

  test.describe.serial('Lead Validation', () => {
    let contactId: string;

    test('should create contact for validation tests', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contactData = createTestContact();
      const response = await client.post(API_ENDPOINTS.CONTACTS, contactData);
      contactId = response.id;
    });

    test('should require contactId', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invalidData = {
        title: 'Test Lead',
        destinations: ['Bali'],
        // Missing contactId
      };

      const response = await client.raw('POST', API_ENDPOINTS.LEADS, {
        data: invalidData,
      });

      expect([400, 422]).toContain(response.status());
    });

    test('should require title', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invalidData = {
        contactId,
        destinations: ['Bali'],
        // Missing title
      };

      const response = await client.raw('POST', API_ENDPOINTS.LEADS, {
        data: invalidData,
      });

      expect([400, 422]).toContain(response.status());
    });

    test('should validate destinations is an array', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invalidData = {
        ...createTestLead(contactId),
        destinations: 'Bali', // Should be array, not string
      };

      const response = await client.raw('POST', API_ENDPOINTS.LEADS, {
        data: invalidData,
      });

      expect([400, 422]).toContain(response.status());
    });

    test('should accept valid priority values', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const validData = {
        ...createTestLead(contactId),
        priority: 'hot',
      };

      const response = await client.post(API_ENDPOINTS.LEADS, validData);
      expect(response.priority).toBe('hot');
    });

    test('should reject invalid priority values', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invalidData = {
        ...createTestLead(contactId),
        priority: 'mega-hot',
      };

      const response = await client.raw('POST', API_ENDPOINTS.LEADS, {
        data: invalidData,
      });

      expect([400, 422]).toContain(response.status());
    });

    test('should reject negative budget', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invalidData = {
        ...createTestLead(contactId),
        budget: -100000,
      };

      const response = await client.raw('POST', API_ENDPOINTS.LEADS, {
        data: invalidData,
      });

      expect([400, 422]).toContain(response.status());
    });
  });
});
