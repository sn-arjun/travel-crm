import { test, expect } from '@playwright/test';
import { APIClient } from '../helpers/api-client';
import {
  createTestContact,
  createTestLead,
  createTestItinerary,
  TEST_ADMIN,
  API_ENDPOINTS,
} from '../helpers/test-data';

test.describe('M6: Itinerary Management', () => {
  const baseURL = process.env.API_BASE_URL || 'http://localhost:8787';

  test.describe.serial('Itinerary CRUD Operations', () => {
    let contactId: string;
    let leadId: string;
    let itineraryId: string;

    test('should create contact and lead for itinerary tests', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contactData = createTestContact();
      const contactResponse = await client.post(API_ENDPOINTS.CONTACTS, contactData);
      expect(contactResponse).toHaveProperty('id');
      contactId = contactResponse.id;

      const leadData = createTestLead(contactId);
      const leadResponse = await client.post(API_ENDPOINTS.LEADS, leadData);
      expect(leadResponse).toHaveProperty('id');
      leadId = leadResponse.id;
    });

    test('should create itinerary with days and items', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const itineraryData = createTestItinerary(leadId);
      const response = await client.post(API_ENDPOINTS.ITINERARIES, itineraryData);

      expect(response).toHaveProperty('id');
      expect(response.leadId).toBe(leadId);
      expect(response.title).toBe(itineraryData.title);
      expect(Array.isArray(response.days)).toBe(true);
      expect(response.days.length).toBeGreaterThan(0);
      expect(response.notes).toBe(itineraryData.notes);

      itineraryId = response.id;
    });

    test('should retrieve itinerary by ID', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(`${API_ENDPOINTS.ITINERARIES}/${itineraryId}`);

      expect(response.id).toBe(itineraryId);
      expect(response.leadId).toBe(leadId);
      expect(Array.isArray(response.days)).toBe(true);
    });

    test('should list all itineraries', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(API_ENDPOINTS.ITINERARIES);

      expect(Array.isArray(response)).toBe(true);
      expect(response.length).toBeGreaterThan(0);

      const itinerary = response.find((it: any) => it.id === itineraryId);
      expect(itinerary).toBeDefined();
    });

    test('should update itinerary title and description', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const updateData = {
        title: 'Updated Bali Getaway',
        notes: 'Updated itinerary notes',
      };

      const response = await client.put(
        `${API_ENDPOINTS.ITINERARIES}/${itineraryId}`,
        updateData
      );

      expect(response.title).toBe(updateData.title);
      expect(response.notes).toBe(updateData.notes);
    });

    test('should delete an itinerary', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      // Create a temp itinerary to delete
      const itineraryData = createTestItinerary(leadId);
      const createResponse = await client.post(API_ENDPOINTS.ITINERARIES, itineraryData);
      const tempItineraryId = createResponse.id;

      const deleteResponse = await client.delete(`${API_ENDPOINTS.ITINERARIES}/${tempItineraryId}`);
      expect(deleteResponse).toBeDefined();

      // Verify deletion
      const getResponse = await client.raw('GET', `${API_ENDPOINTS.ITINERARIES}/${tempItineraryId}`);
      expect(getResponse.status()).toBe(404);
    });
  });

  test.describe.serial('Itinerary Days & Items Management', () => {
    let contactId: string;
    let leadId: string;
    let itineraryId: string;

    test('should create contact, lead, and itinerary for day tests', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contactData = createTestContact();
      const contactResponse = await client.post(API_ENDPOINTS.CONTACTS, contactData);
      contactId = contactResponse.id;

      const leadData = createTestLead(contactId);
      const leadResponse = await client.post(API_ENDPOINTS.LEADS, leadData);
      leadId = leadResponse.id;

      const itineraryData = createTestItinerary(leadId);
      const itineraryResponse = await client.post(API_ENDPOINTS.ITINERARIES, itineraryData);
      itineraryId = itineraryResponse.id;
    });

    test('should add a new day via itinerary update', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      // Get current itinerary
      const current = await client.get(`${API_ENDPOINTS.ITINERARIES}/${itineraryId}`);
      const existingDays = current.days || [];

      // Add a new day by updating with the full days array
      const updatedDays = [
        ...existingDays.map((d: any) => ({
          dayNumber: d.dayNumber,
          title: d.title,
          description: d.description,
          items: (d.items || []).map((item: any) => ({
            type: item.type,
            title: item.title,
            description: item.description,
            timeStart: item.timeStart,
            timeEnd: item.timeEnd,
          })),
        })),
        {
          dayNumber: existingDays.length + 1,
          title: 'Departure Day',
          description: 'Final day of trip',
          items: [],
        },
      ];

      const response = await client.put(`${API_ENDPOINTS.ITINERARIES}/${itineraryId}`, {
        days: updatedDays,
      });

      expect(response.days.length).toBe(existingDays.length + 1);
      const newDay = response.days.find((d: any) => d.title === 'Departure Day');
      expect(newDay).toBeDefined();
    });

    test('should update an existing day title', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      // Get current itinerary
      const current = await client.get(`${API_ENDPOINTS.ITINERARIES}/${itineraryId}`);

      // Update first day title
      const updatedDays = current.days.map((d: any, i: number) => ({
        dayNumber: d.dayNumber,
        title: i === 0 ? 'Updated Day 1 Title' : d.title,
        description: d.description,
        items: (d.items || []).map((item: any) => ({
          type: item.type,
          title: item.title,
          description: item.description,
          time: item.time,
          location: item.location,
        })),
      }));

      const response = await client.put(`${API_ENDPOINTS.ITINERARIES}/${itineraryId}`, {
        days: updatedDays,
      });

      expect(response.days[0].title).toBe('Updated Day 1 Title');
    });

    test('should add item to day via itinerary update', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const current = await client.get(`${API_ENDPOINTS.ITINERARIES}/${itineraryId}`);

      // Add a new item to first day
      const updatedDays = current.days.map((d: any, i: number) => ({
        dayNumber: d.dayNumber,
        title: d.title,
        description: d.description,
        items: [
          ...(d.items || []).map((item: any) => ({
            type: item.type,
            title: item.title,
            description: item.description,
            timeStart: item.timeStart,
            timeEnd: item.timeEnd,
          })),
          ...(i === 0
            ? [
                {
                  type: 'meal',
                  timeStart: '19:00',
                  title: 'Dinner',
                  description: 'Fine dining experience at Beach Restaurant',
                },
              ]
            : []),
        ],
      }));

      const response = await client.put(`${API_ENDPOINTS.ITINERARIES}/${itineraryId}`, {
        days: updatedDays,
      });

      const dinnerItem = response.days[0].items.find((item: any) => item.title === 'Dinner');
      expect(dinnerItem).toBeDefined();
      expect(dinnerItem.type).toBe('meal');
    });

    test('should remove a day via itinerary update', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const current = await client.get(`${API_ENDPOINTS.ITINERARIES}/${itineraryId}`);
      const originalCount = current.days.length;

      // Remove last day
      const updatedDays = current.days.slice(0, -1).map((d: any) => ({
        dayNumber: d.dayNumber,
        title: d.title,
        description: d.description,
        items: (d.items || []).map((item: any) => ({
          type: item.type,
          title: item.title,
          description: item.description,
          time: item.time,
          location: item.location,
        })),
      }));

      const response = await client.put(`${API_ENDPOINTS.ITINERARIES}/${itineraryId}`, {
        days: updatedDays,
      });

      expect(response.days.length).toBe(originalCount - 1);
    });
  });

  test.describe.serial('Itinerary Version Management', () => {
    let contactId: string;
    let leadId: string;
    let itineraryId: string;

    test('should create contact, lead, and itinerary for version tests', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contactData = createTestContact();
      const contactResponse = await client.post(API_ENDPOINTS.CONTACTS, contactData);
      contactId = contactResponse.id;

      const leadData = createTestLead(contactId);
      const leadResponse = await client.post(API_ENDPOINTS.LEADS, leadData);
      leadId = leadResponse.id;

      const itineraryData = createTestItinerary(leadId);
      const itineraryResponse = await client.post(API_ENDPOINTS.ITINERARIES, itineraryData);
      itineraryId = itineraryResponse.id;
    });

    test('should track version on creation', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(`${API_ENDPOINTS.ITINERARIES}/${itineraryId}`);

      expect(response).toHaveProperty('version');
      expect(response.version).toBeGreaterThanOrEqual(1);
    });

    test('should create new version via /new-version endpoint', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      // Use the dedicated new-version endpoint
      const response = await client.post(`${API_ENDPOINTS.ITINERARIES}/${itineraryId}/new-version`, {});

      expect(response).toHaveProperty('id');
      expect(response.version).toBeGreaterThanOrEqual(2);
    });

    test('should retrieve version history', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get(`${API_ENDPOINTS.ITINERARIES}/${itineraryId}/versions`);

      expect(Array.isArray(response)).toBe(true);
      expect(response.length).toBeGreaterThanOrEqual(1);
    });
  });

  test.describe.serial('Itinerary Validation', () => {
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
        title: 'Test Itinerary',
        days: [{ dayNumber: 1, title: 'Day 1', items: [] }],
      };

      const response = await client.raw('POST', API_ENDPOINTS.ITINERARIES, {
        data: invalidData,
      });

      expect([400, 422]).toContain(response.status());
    });

    test('should require title', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invalidData = {
        leadId,
        days: [{ dayNumber: 1, title: 'Day 1', items: [] }],
      };

      const response = await client.raw('POST', API_ENDPOINTS.ITINERARIES, {
        data: invalidData,
      });

      expect([400, 422]).toContain(response.status());
    });

    test('should require at least one day', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invalidData = {
        leadId,
        title: 'Test',
        days: [],
      };

      const response = await client.raw('POST', API_ENDPOINTS.ITINERARIES, {
        data: invalidData,
      });

      expect([400, 422]).toContain(response.status());
    });

    test('should validate days is an array', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invalidData = {
        leadId,
        title: 'Test',
        days: 'not-an-array',
      };

      const response = await client.raw('POST', API_ENDPOINTS.ITINERARIES, {
        data: invalidData,
      });

      expect([400, 422]).toContain(response.status());
    });

    test('should validate day has dayNumber', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const invalidData = {
        leadId,
        title: 'Test',
        days: [{ title: 'Day 1', items: [] }],
      };

      const response = await client.raw('POST', API_ENDPOINTS.ITINERARIES, {
        data: invalidData,
      });

      expect([400, 422]).toContain(response.status());
    });
  });
});
