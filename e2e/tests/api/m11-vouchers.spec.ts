import { test, expect } from '@playwright/test';
import { APIClient } from '../helpers/api-client';
import {
  createTestContact,
  createTestLead,
  createTestItinerary,
  createTestHotelVoucher,
  createTestTransportVoucher,
  createTestFlightVoucher,
  createTestActivityVoucher,
  TEST_ADMIN,
  TEST_SALESPERSON,
  API_ENDPOINTS,
} from '../helpers/test-data';

test.describe('M11: Voucher Management', () => {
  const baseURL = process.env.API_BASE_URL || 'http://localhost:8787';

  // ============================================================
  // 1. Hotel Voucher CRUD
  // ============================================================

  test.describe.serial('Hotel Voucher CRUD', () => {
    let contactId: string;
    let leadId: string;
    let voucherId: string;

    test('should create contact and lead for voucher tests', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contact = await client.post<any>(API_ENDPOINTS.CONTACTS, createTestContact());
      contactId = contact.id;
      expect(contactId).toBeDefined();

      const lead = await client.post<any>(API_ENDPOINTS.LEADS, createTestLead(contactId));
      leadId = lead.id;
      expect(leadId).toBeDefined();
    });

    test('should create a hotel voucher', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const voucherData = createTestHotelVoucher(leadId);
      const response = await client.post<any>(API_ENDPOINTS.VOUCHERS, voucherData);

      expect(response).toHaveProperty('id');
      expect(response.leadId).toBe(leadId);
      expect(response.type).toBe('hotel');
      expect(response.status).toBe('draft');
      expect(response.title).toContain('Hotel Voucher');

      voucherId = response.id;
    });

    test('should retrieve hotel voucher by ID', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get<any>(`${API_ENDPOINTS.VOUCHERS}/${voucherId}`);

      expect(response.id).toBe(voucherId);
      expect(response.leadId || response.lead_id).toBe(leadId);
      expect(response.type).toBe('hotel');
      expect(response.details).toBeDefined();
      expect(response.details.hotelName || response.details.hotel_name).toBe('Grand Hyatt Resort');
      expect(response.details.guestNames || response.details.guest_names).toContain('John Doe');
      expect(response.details.mealPlan || response.details.meal_plan).toBe('MAP');
    });

    test('should update hotel voucher (draft only)', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const updateData = {
        title: 'Updated Hotel Voucher',
        details: {
          guestNames: ['John Doe', 'Jane Doe', 'Baby Doe'],
          hotelName: 'Grand Hyatt Resort & Spa',
          checkIn: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          checkOut: new Date(Date.now() + 34 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          roomType: 'Suite',
          roomCount: 2,
          mealPlan: 'AI',
          specialRequests: 'Extra bed for child',
          confirmationNumber: 'HC-UPDATED',
          emergencyContact: '+91-9876543210',
        },
        notes: 'Updated notes',
      };

      const response = await client.put<any>(`${API_ENDPOINTS.VOUCHERS}/${voucherId}`, updateData);

      expect(response.title).toBe('Updated Hotel Voucher');
      const details = response.details || (response.detailsJson || response.details_json ? JSON.parse(response.detailsJson || response.details_json) : null);
      expect(details).toBeDefined();
    });

    test('should list vouchers and find created voucher', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get<any[]>(API_ENDPOINTS.VOUCHERS);

      expect(Array.isArray(response)).toBe(true);
      expect(response.length).toBeGreaterThan(0);

      const found = response.find((v: any) => v.id === voucherId);
      expect(found).toBeDefined();
      expect(found.type).toBe('hotel');
    });

    test('should filter vouchers by type', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get<any[]>(`${API_ENDPOINTS.VOUCHERS}?type=hotel`);

      expect(Array.isArray(response)).toBe(true);
      for (const v of response) {
        expect(v.type).toBe('hotel');
      }
    });

    test('should filter vouchers by lead', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get<any[]>(`${API_ENDPOINTS.VOUCHERS}?leadId=${leadId}`);

      expect(Array.isArray(response)).toBe(true);
      for (const v of response) {
        expect(v.leadId || v.lead_id).toBe(leadId);
      }
    });

    test('should filter vouchers by status', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get<any[]>(`${API_ENDPOINTS.VOUCHERS}?status=draft`);

      expect(Array.isArray(response)).toBe(true);
      for (const v of response) {
        expect(v.status).toBe('draft');
      }
    });
  });

  // ============================================================
  // 2. Transport Voucher CRUD
  // ============================================================

  test.describe.serial('Transport Voucher CRUD', () => {
    let leadId: string;
    let voucherId: string;

    test('should setup lead for transport voucher', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contact = await client.post<any>(API_ENDPOINTS.CONTACTS, createTestContact());
      const lead = await client.post<any>(API_ENDPOINTS.LEADS, createTestLead(contact.id));
      leadId = lead.id;
    });

    test('should create a transport voucher', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const voucherData = createTestTransportVoucher(leadId);
      const response = await client.post<any>(API_ENDPOINTS.VOUCHERS, voucherData);

      expect(response).toHaveProperty('id');
      expect(response.type).toBe('transport');
      expect(response.status).toBe('draft');

      voucherId = response.id;
    });

    test('should retrieve transport voucher with details', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get<any>(`${API_ENDPOINTS.VOUCHERS}/${voucherId}`);

      expect(response.type).toBe('transport');
      expect(response.details).toBeDefined();
      expect(response.details.vehicleType || response.details.vehicle_type).toBe('SUV');
      expect(response.details.driverName || response.details.driver_name).toBe('Rajesh Kumar');
      expect(response.details.pickupLocation || response.details.pickup_location).toBe('Airport Terminal 2');
    });

    test('should delete transport voucher (soft delete)', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.delete<any>(`${API_ENDPOINTS.VOUCHERS}/${voucherId}`);

      expect(response.deleted).toBe(true);

      // Verify it doesn't appear in list
      const list = await client.get<any[]>(`${API_ENDPOINTS.VOUCHERS}?leadId=${leadId}`);
      const found = list.find((v: any) => v.id === voucherId);
      expect(found).toBeUndefined();
    });
  });

  // ============================================================
  // 3. Flight Voucher CRUD
  // ============================================================

  test.describe.serial('Flight Voucher CRUD', () => {
    let leadId: string;
    let voucherId: string;

    test('should setup lead for flight voucher', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contact = await client.post<any>(API_ENDPOINTS.CONTACTS, createTestContact());
      const lead = await client.post<any>(API_ENDPOINTS.LEADS, createTestLead(contact.id));
      leadId = lead.id;
    });

    test('should create a flight voucher', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const voucherData = createTestFlightVoucher(leadId);
      const response = await client.post<any>(API_ENDPOINTS.VOUCHERS, voucherData);

      expect(response).toHaveProperty('id');
      expect(response.type).toBe('flight');
      expect(response.status).toBe('draft');

      voucherId = response.id;
    });

    test('should retrieve flight voucher with passenger details', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get<any>(`${API_ENDPOINTS.VOUCHERS}/${voucherId}`);

      expect(response.type).toBe('flight');
      expect(response.details).toBeDefined();
      expect(response.details.airline).toBe('Air India');
      expect(response.details.flightNumber || response.details.flight_number).toBe('AI-302');
      const passengers = response.details.passengers;
      expect(Array.isArray(passengers)).toBe(true);
      expect(passengers.length).toBe(2);
      expect(passengers[0].name).toBe('John Doe');
    });
  });

  // ============================================================
  // 4. Activity Voucher CRUD
  // ============================================================

  test.describe.serial('Activity Voucher CRUD', () => {
    let leadId: string;
    let voucherId: string;

    test('should setup lead for activity voucher', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contact = await client.post<any>(API_ENDPOINTS.CONTACTS, createTestContact());
      const lead = await client.post<any>(API_ENDPOINTS.LEADS, createTestLead(contact.id));
      leadId = lead.id;
    });

    test('should create an activity voucher', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const voucherData = createTestActivityVoucher(leadId);
      const response = await client.post<any>(API_ENDPOINTS.VOUCHERS, voucherData);

      expect(response).toHaveProperty('id');
      expect(response.type).toBe('activity');
      expect(response.status).toBe('draft');

      voucherId = response.id;
    });

    test('should retrieve activity voucher with details', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get<any>(`${API_ENDPOINTS.VOUCHERS}/${voucherId}`);

      expect(response.type).toBe('activity');
      expect(response.details).toBeDefined();
      expect(response.details.activityName || response.details.activity_name).toBe('Snorkeling at Nusa Penida');
      expect(response.details.meetingPoint || response.details.meeting_point).toBe('Sanur Beach Harbour');
      const whatToBring = response.details.whatToBring || response.details.what_to_bring;
      expect(Array.isArray(whatToBring)).toBe(true);
      expect(whatToBring).toContain('Swimwear');
    });
  });

  // ============================================================
  // 5. Status Management
  // ============================================================

  test.describe.serial('Voucher Status Management', () => {
    let leadId: string;
    let voucherId: string;

    test('should setup voucher for status tests', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contact = await client.post<any>(API_ENDPOINTS.CONTACTS, createTestContact());
      const lead = await client.post<any>(API_ENDPOINTS.LEADS, createTestLead(contact.id));
      leadId = lead.id;

      const voucher = await client.post<any>(API_ENDPOINTS.VOUCHERS, createTestHotelVoucher(leadId));
      voucherId = voucher.id;
      expect(voucher.status).toBe('draft');
    });

    test('should transition from draft to sent', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.raw('PATCH', `${API_ENDPOINTS.VOUCHERS}/${voucherId}/status`, {
        data: { status: 'sent' },
      });

      expect(response.status()).toBeLessThan(400);
      const body = await response.json();
      const data = body.data || body;

      expect(data.status).toBe('sent');
      expect(data.sentAt || data.sent_at).toBeDefined();
    });

    test('should not allow update on sent voucher', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.raw('PUT', `${API_ENDPOINTS.VOUCHERS}/${voucherId}`, {
        data: { title: 'Should fail' },
      });

      expect(response.status()).toBe(400);
    });

    test('should transition from sent to confirmed', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.raw('PATCH', `${API_ENDPOINTS.VOUCHERS}/${voucherId}/status`, {
        data: { status: 'confirmed' },
      });

      expect(response.status()).toBeLessThan(400);
      const body = await response.json();
      const data = body.data || body;

      expect(data.status).toBe('confirmed');
      expect(data.confirmedAt || data.confirmed_at).toBeDefined();
    });

    test('should not allow backward transition from confirmed', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.raw('PATCH', `${API_ENDPOINTS.VOUCHERS}/${voucherId}/status`, {
        data: { status: 'sent' },
      });

      expect(response.status()).toBe(400);
    });

    test('should allow direct draft to confirmed transition', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      // Create another draft voucher
      const voucher = await client.post<any>(API_ENDPOINTS.VOUCHERS, createTestHotelVoucher(leadId));

      const response = await client.raw('PATCH', `${API_ENDPOINTS.VOUCHERS}/${voucher.id}/status`, {
        data: { status: 'confirmed' },
      });

      expect(response.status()).toBeLessThan(400);
      const body = await response.json();
      const data = body.data || body;
      expect(data.status).toBe('confirmed');
    });
  });

  // ============================================================
  // 6. Send Voucher
  // ============================================================

  test.describe.serial('Voucher Send Operations', () => {
    let leadId: string;
    let voucherId: string;

    test('should setup voucher for send tests', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contact = await client.post<any>(API_ENDPOINTS.CONTACTS, createTestContact());
      const lead = await client.post<any>(API_ENDPOINTS.LEADS, createTestLead(contact.id));
      leadId = lead.id;

      const voucher = await client.post<any>(API_ENDPOINTS.VOUCHERS, createTestHotelVoucher(leadId));
      voucherId = voucher.id;
    });

    test('should send voucher via email', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.post<any>(`${API_ENDPOINTS.VOUCHERS}/${voucherId}/send`, {
        channel: 'email',
        to: 'guest@example.com',
      });

      expect(response.status).toBe('sent');
      expect(response.sentVia || response.sent_via).toBe('email');
      expect(response.sentAt || response.sent_at).toBeDefined();
    });

    test('should send same voucher via whatsapp (sentVia becomes both)', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.post<any>(`${API_ENDPOINTS.VOUCHERS}/${voucherId}/send`, {
        channel: 'whatsapp',
        to: '+919876543210',
      });

      expect(response.status).toBe('sent');
      expect(response.sentVia || response.sent_via).toBe('both');
    });

    test('should reject send with invalid channel', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.raw('POST', `${API_ENDPOINTS.VOUCHERS}/${voucherId}/send`, {
        data: { channel: 'invalid', to: 'test@example.com' },
      });

      expect(response.status()).toBe(400);
    });

    test('should reject send without recipient', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.raw('POST', `${API_ENDPOINTS.VOUCHERS}/${voucherId}/send`, {
        data: { channel: 'email' },
      });

      expect(response.status()).toBe(400);
    });
  });

  // ============================================================
  // 7. Bulk Send
  // ============================================================

  test.describe.serial('Voucher Bulk Send', () => {
    let leadId: string;
    let voucherIds: string[] = [];

    test('should setup multiple vouchers for bulk send', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contact = await client.post<any>(API_ENDPOINTS.CONTACTS, createTestContact());
      const lead = await client.post<any>(API_ENDPOINTS.LEADS, createTestLead(contact.id));
      leadId = lead.id;

      // Create 3 vouchers of different types
      const v1 = await client.post<any>(API_ENDPOINTS.VOUCHERS, createTestHotelVoucher(leadId));
      const v2 = await client.post<any>(API_ENDPOINTS.VOUCHERS, createTestTransportVoucher(leadId));
      const v3 = await client.post<any>(API_ENDPOINTS.VOUCHERS, createTestActivityVoucher(leadId));

      voucherIds = [v1.id, v2.id, v3.id];
      expect(voucherIds.length).toBe(3);
    });

    test('should bulk send specific vouchers by IDs', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.post<any>(API_ENDPOINTS.VOUCHERS_BULK_SEND, {
        leadId,
        voucherIds: [voucherIds[0], voucherIds[1]],
        channel: 'email',
        to: 'guest@example.com',
      });

      expect(response.count).toBe(2);
    });

    test('should bulk send all vouchers for a lead', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.post<any>(API_ENDPOINTS.VOUCHERS_BULK_SEND, {
        leadId,
        channel: 'whatsapp',
        to: '+919876543210',
      });

      expect(response.count).toBe(3);
    });

    test('should reject bulk send without lead_id or voucher_ids', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.raw('POST', API_ENDPOINTS.VOUCHERS_BULK_SEND, {
        data: { channel: 'email', to: 'guest@example.com' },
      });

      expect(response.status()).toBe(400);
    });
  });

  // ============================================================
  // 8. Vouchers by Lead (grouped)
  // ============================================================

  test.describe.serial('Vouchers By Lead', () => {
    let leadId: string;

    test('should setup multiple voucher types for one lead', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contact = await client.post<any>(API_ENDPOINTS.CONTACTS, createTestContact());
      const lead = await client.post<any>(API_ENDPOINTS.LEADS, createTestLead(contact.id));
      leadId = lead.id;

      await client.post<any>(API_ENDPOINTS.VOUCHERS, createTestHotelVoucher(leadId));
      await client.post<any>(API_ENDPOINTS.VOUCHERS, createTestTransportVoucher(leadId));
      await client.post<any>(API_ENDPOINTS.VOUCHERS, createTestFlightVoucher(leadId));
      await client.post<any>(API_ENDPOINTS.VOUCHERS, createTestActivityVoucher(leadId));
    });

    test('should get vouchers grouped by type for a lead', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get<any>(`${API_ENDPOINTS.VOUCHERS_BY_LEAD}/${leadId}`);

      expect(response).toBeDefined();
      expect(response.hotel).toBeDefined();
      expect(response.transport).toBeDefined();
      expect(response.flight).toBeDefined();
      expect(response.activity).toBeDefined();
      expect(Array.isArray(response.hotel)).toBe(true);
      expect(response.hotel.length).toBeGreaterThanOrEqual(1);
      expect(response.transport.length).toBeGreaterThanOrEqual(1);
      expect(response.flight.length).toBeGreaterThanOrEqual(1);
      expect(response.activity.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================
  // 9. Validation Tests
  // ============================================================

  test.describe.serial('Voucher Validation', () => {
    let leadId: string;

    test('should setup lead for validation tests', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contact = await client.post<any>(API_ENDPOINTS.CONTACTS, createTestContact());
      const lead = await client.post<any>(API_ENDPOINTS.LEADS, createTestLead(contact.id));
      leadId = lead.id;
    });

    test('should reject voucher without leadId', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.raw('POST', API_ENDPOINTS.VOUCHERS, {
        data: {
          type: 'hotel',
          title: 'No Lead Voucher',
          details: { guestNames: ['Test'], hotelName: 'Test', checkIn: '2025-01-01', checkOut: '2025-01-03', roomType: 'Deluxe' },
        },
      });

      expect(response.status()).toBeGreaterThanOrEqual(400);
    });

    test('should reject voucher with invalid type', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.raw('POST', API_ENDPOINTS.VOUCHERS, {
        data: {
          leadId,
          type: 'invalid_type',
          title: 'Bad Type Voucher',
          details: {},
        },
      });

      expect(response.status()).toBeGreaterThanOrEqual(400);
    });

    test('should reject hotel voucher with missing required details', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.raw('POST', API_ENDPOINTS.VOUCHERS, {
        data: {
          leadId,
          type: 'hotel',
          title: 'Bad Hotel Voucher',
          details: {
            // Missing guestNames, hotelName, checkIn, checkOut, roomType
          },
        },
      });

      expect(response.status()).toBeGreaterThanOrEqual(400);
    });

    test('should reject flight voucher with no passengers', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.raw('POST', API_ENDPOINTS.VOUCHERS, {
        data: {
          leadId,
          type: 'flight',
          title: 'Bad Flight Voucher',
          details: {
            airline: 'Test',
            flightNumber: 'T-001',
            departureAirport: 'DEL',
            departureTime: '2025-01-01T10:00:00Z',
            arrivalAirport: 'BOM',
            arrivalTime: '2025-01-01T12:00:00Z',
            passengers: [], // Empty — min 1 required
          },
        },
      });

      expect(response.status()).toBeGreaterThanOrEqual(400);
    });

    test('should reject voucher with non-existent lead', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.raw('POST', API_ENDPOINTS.VOUCHERS, {
        data: {
          leadId: 'non-existent-lead-id',
          type: 'hotel',
          title: 'Orphan Voucher',
          details: {
            guestNames: ['Test'],
            hotelName: 'Test Hotel',
            checkIn: '2025-01-01',
            checkOut: '2025-01-03',
            roomType: 'Standard',
          },
        },
      });

      expect(response.status()).toBe(404);
    });

    test('should reject deletion of non-existent voucher', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.raw('DELETE', `${API_ENDPOINTS.VOUCHERS}/non-existent-id`);

      expect(response.status()).toBe(404);
    });
  });

  // ============================================================
  // 10. RBAC Tests
  // ============================================================

  test.describe.serial('Voucher RBAC', () => {
    let leadId: string;
    let voucherId: string;

    test('should setup voucher for RBAC tests', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contact = await client.post<any>(API_ENDPOINTS.CONTACTS, createTestContact());
      const lead = await client.post<any>(API_ENDPOINTS.LEADS, createTestLead(contact.id));
      leadId = lead.id;

      const voucher = await client.post<any>(API_ENDPOINTS.VOUCHERS, createTestHotelVoucher(leadId));
      voucherId = voucher.id;
    });

    test('salesperson should be able to view vouchers', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_SALESPERSON.email, TEST_SALESPERSON.password, TEST_SALESPERSON.tenantId);

      const response = await client.raw('GET', API_ENDPOINTS.VOUCHERS);

      // Salesperson has 'view' permission on vouchers
      expect(response.status()).toBeLessThan(400);
    });

    test('salesperson should not be able to delete vouchers', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_SALESPERSON.email, TEST_SALESPERSON.password, TEST_SALESPERSON.tenantId);

      const response = await client.raw('DELETE', `${API_ENDPOINTS.VOUCHERS}/${voucherId}`);

      // Salesperson only has VIEW_ONLY_PERMS for vouchers — no delete
      expect(response.status()).toBe(403);
    });
  });

  // ============================================================
  // 11. Pagination Tests
  // ============================================================

  test.describe.serial('Voucher Pagination', () => {
    let leadId: string;

    test('should setup multiple vouchers for pagination', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contact = await client.post<any>(API_ENDPOINTS.CONTACTS, createTestContact());
      const lead = await client.post<any>(API_ENDPOINTS.LEADS, createTestLead(contact.id));
      leadId = lead.id;

      // Create 5 vouchers
      for (let i = 0; i < 5; i++) {
        await client.post<any>(API_ENDPOINTS.VOUCHERS, createTestHotelVoucher(leadId));
      }
    });

    test('should paginate vouchers with limit', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.raw('GET', `${API_ENDPOINTS.VOUCHERS}?leadId=${leadId}&limit=2&page=1`);
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.data.length).toBeLessThanOrEqual(2);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.total).toBeGreaterThanOrEqual(5);
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.limit).toBe(2);
      expect(body.pagination.hasMore).toBe(true);
    });

    test('should return second page', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.raw('GET', `${API_ENDPOINTS.VOUCHERS}?leadId=${leadId}&limit=2&page=2`);
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.data.length).toBeLessThanOrEqual(2);
      expect(body.pagination.page).toBe(2);
    });
  });

  // ============================================================
  // 12. Search Tests
  // ============================================================

  test.describe.serial('Voucher Search', () => {
    let leadId: string;

    test('should setup voucher with unique title for search', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contact = await client.post<any>(API_ENDPOINTS.CONTACTS, createTestContact());
      const lead = await client.post<any>(API_ENDPOINTS.LEADS, createTestLead(contact.id));
      leadId = lead.id;

      await client.post<any>(API_ENDPOINTS.VOUCHERS, {
        ...createTestHotelVoucher(leadId),
        title: 'UniqueSearchTerm-XYZ123-HotelVoucher',
      });
    });

    test('should search vouchers by title', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const response = await client.get<any[]>(`${API_ENDPOINTS.VOUCHERS}?search=UniqueSearchTerm-XYZ123`);

      expect(Array.isArray(response)).toBe(true);
      expect(response.length).toBeGreaterThanOrEqual(1);
      const found = response.find((v: any) => v.title?.includes('UniqueSearchTerm-XYZ123'));
      expect(found).toBeDefined();
    });
  });

  // ============================================================
  // 13. Language Support
  // ============================================================

  test.describe.serial('Voucher Language Support', () => {
    let leadId: string;

    test('should setup lead for language tests', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const contact = await client.post<any>(API_ENDPOINTS.CONTACTS, createTestContact());
      const lead = await client.post<any>(API_ENDPOINTS.LEADS, createTestLead(contact.id));
      leadId = lead.id;
    });

    test('should create voucher with Hindi language', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const voucherData = {
        ...createTestHotelVoucher(leadId),
        language: 'hi',
      };

      const response = await client.post<any>(API_ENDPOINTS.VOUCHERS, voucherData);
      expect(response.language).toBe('hi');

      // Verify it's stored correctly
      const detail = await client.get<any>(`${API_ENDPOINTS.VOUCHERS}/${response.id}`);
      expect(detail.language).toBe('hi');
    });

    test('should default to English language', async ({ request }) => {
      const client = new APIClient(request, baseURL);
      await client.login(TEST_ADMIN.email, TEST_ADMIN.password, TEST_ADMIN.tenantId);

      const voucherData = createTestHotelVoucher(leadId);
      const response = await client.post<any>(API_ENDPOINTS.VOUCHERS, voucherData);
      expect(response.language).toBe('en');
    });
  });
});
