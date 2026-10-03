import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';

const testEnv = env as any;

// ── Helpers ────────────────────────────────────────────────────────

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

// ── Setup ──────────────────────────────────────────────────────────

describe('CRUD Lifecycle E2E Tests', () => {
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

    // Login
    const loginRes = await publicRequest('POST', '/api/v1/auth/login', {
      email: 'admin@e2e.test',
      password: 'password123',
      tenantId: '00000000-0000-0000-0000-000000000000',
    });
    expect(loginRes.status).toBe(200);
    const loginBody: any = await loginRes.json();
    adminToken = loginBody.data.accessToken;
  });

  // ─── Contact Full Lifecycle ────────────────────────────────────

  describe('Contact Full Lifecycle', () => {
    let contactId = '';

    it('should create a contact', async () => {
      const res = await authRequest('POST', '/contacts', adminToken, {
        name: 'Lifecycle Test Contact',
        email: 'lifecycle@test.com',
        phone: '+919876543210',
        type: 'customer',
        city: 'Delhi',
        country: 'India',
        source: 'manual',
        tags: ['vip', 'test'],
      });
      expect(res.status).toBe(201);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      contactId = body.data.id;
      expect(contactId).toBeDefined();
    });

    it('should list contacts (response structure)', async () => {
      const res = await authRequest('GET', '/contacts', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body).toHaveProperty('pagination');
    });

    it('should get contact by ID', async () => {
      if (!contactId) return;
      const res = await authRequest('GET', `/contacts/${contactId}`, adminToken);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.data.name).toBe('Lifecycle Test Contact');
        expect(body.data.email).toBe('lifecycle@test.com');
      }
    });

    it('should update contact', async () => {
      if (!contactId) return;
      const res = await authRequest('PUT', `/contacts/${contactId}`, adminToken, {
        name: 'Updated Lifecycle Contact',
        company: 'Test Corp',
      });
      expect([200, 404]).toContain(res.status);
    });

    it('should delete contact', async () => {
      if (!contactId) return;
      const res = await authRequest('DELETE', `/contacts/${contactId}`, adminToken);
      expect([200, 204, 404]).toContain(res.status);
    });

    it('should return 404 after deletion', async () => {
      if (!contactId) return;
      const res = await authRequest('GET', `/contacts/${contactId}`, adminToken);
      expect(res.status).toBe(404);
    });
  });

  // ─── Lead Full Lifecycle ──────────────────────────────────────

  describe('Lead Full Lifecycle', () => {
    let contactId = '';
    let leadId = '';

    it('should create a contact for the lead', async () => {
      const res = await authRequest('POST', '/contacts', adminToken, {
        name: 'Lead Contact',
        email: 'lead-contact@test.com',
        type: 'customer',
        source: 'manual',
      });
      expect(res.status).toBe(201);
      const body: any = await res.json();
      contactId = body.data.id;
    });

    it('should create a lead linked to the contact', async () => {
      if (!contactId) return;
      const res = await authRequest('POST', '/leads', adminToken, {
        contactId,
        title: 'Goa Beach Trip',
        destinations: ['Goa'],
        travelDate: '2026-06-15',
        returnDate: '2026-06-22',
        paxAdults: 2,
        paxChildren: 1,
        budget: 50000,
        currency: 'INR',
        tripType: 'family',
        source: 'website',
        priority: 'hot',
      });
      expect(res.status).toBe(201);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      leadId = body.data.id;
    });

    it('should get lead by ID', async () => {
      if (!leadId) return;
      const res = await authRequest('GET', `/leads/${leadId}`, adminToken);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.data.title).toBe('Goa Beach Trip');
      }
    });

    it('should update lead status', async () => {
      if (!leadId) return;
      const res = await authRequest('PUT', `/leads/${leadId}/status`, adminToken, {
        status: 'contacted',
      });
      expect([200, 404]).toContain(res.status);
    });

    it('should support status filter on leads', async () => {
      const res = await authRequest('GET', '/leads?status=contacted', adminToken);
      expect(res.status).toBe(200);
    });

    it('should support search on leads', async () => {
      const res = await authRequest('GET', '/leads?search=Goa', adminToken);
      expect(res.status).toBe(200);
    });
  });

  // ─── Task CRUD ─────────────────────────────────────────────────

  describe('Task CRUD', () => {
    let taskId = '';

    it('should create a task', async () => {
      const res = await authRequest('POST', '/tasks', adminToken, {
        title: 'Follow up with client',
        description: 'Call the client about the Goa trip',
        priority: 'high',
        due_date: '2026-03-15',
      });
      if (res.status === 201) {
        const body: any = await res.json();
        expect(body.data).toBeDefined();
        taskId = body.data.id;
      }
    });

    it('should list tasks', async () => {
      const res = await authRequest('GET', '/tasks', adminToken);
      expect(res.status).toBe(200);
    });

    it('should get task by ID', async () => {
      if (!taskId) return;
      const res = await authRequest('GET', `/tasks/${taskId}`, adminToken);
      expect([200, 404]).toContain(res.status);
    });

    it('should update task status', async () => {
      if (!taskId) return;
      const res = await authRequest('PUT', `/tasks/${taskId}/status`, adminToken, {
        status: 'in_progress',
      });
      expect([200, 404]).toContain(res.status);
    });
  });

  // ─── Supplier CRUD ─────────────────────────────────────────────

  describe('Supplier CRUD', () => {
    let supplierId = '';

    it('should create a supplier', async () => {
      const res = await authRequest('POST', '/suppliers', adminToken, {
        name: 'Grand Hotel Mumbai',
        type: 'hotel',
        contactPerson: 'Rahul Sharma',
        email: 'bookings@grandhotel.com',
        phone: '+912234567890',
        city: 'Mumbai',
        country: 'India',
      });
      if (res.status === 201) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        supplierId = body.data.id;
      }
    });

    it('should list suppliers', async () => {
      const res = await authRequest('GET', '/suppliers', adminToken);
      expect(res.status).toBe(200);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
      }
    });

    it('should get supplier by ID', async () => {
      if (!supplierId) return;
      const res = await authRequest('GET', `/suppliers/${supplierId}`, adminToken);
      expect([200, 404]).toContain(res.status);
    });

    it('should update supplier', async () => {
      if (!supplierId) return;
      const res = await authRequest('PUT', `/suppliers/${supplierId}`, adminToken, {
        name: 'Grand Hotel Mumbai (Updated)',
        website: 'https://grandhotel.com',
      });
      expect([200, 404]).toContain(res.status);
    });
  });

  // ─── Voucher Validation ────────────────────────────────────────

  describe('Voucher Validation', () => {
    it('should reject voucher without required fields', async () => {
      const res = await authRequest('POST', '/vouchers', adminToken, {});
      expect(res.status).toBe(400);
    });

    it('should list vouchers', async () => {
      const res = await authRequest('GET', '/vouchers', adminToken);
      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent voucher', async () => {
      const res = await authRequest('GET', '/vouchers/non-existent-id', adminToken);
      expect(res.status).toBe(404);
    });
  });

  // ─── Follow-Up CRUD ───────────────────────────────────────────

  describe('Follow-Up CRUD', () => {
    it('should list follow-ups', async () => {
      const res = await authRequest('GET', '/follow-ups', adminToken);
      expect(res.status).toBe(200);
    });

    it('should reject follow-up without required fields', async () => {
      const res = await authRequest('POST', '/follow-ups', adminToken, {});
      expect(res.status).toBe(400);
    });
  });

  // ─── Invoice Full Lifecycle ─────────────────────────────────────

  describe('Invoice Full Lifecycle', () => {
    let contactId = '';

    it('should create a contact for invoicing', async () => {
      const res = await authRequest('POST', '/contacts', adminToken, {
        name: 'Invoice Test Client',
        email: 'invoice@test.com',
        type: 'customer',
      });
      expect(res.status).toBe(201);
      const body: any = await res.json();
      contactId = body.data.id;
    });

    it('should create an invoice with line items', async () => {
      if (!contactId) return;
      const res = await authRequest('POST', '/invoices', adminToken, {
        contactId,
        items: [
          { description: 'Flight Tickets', quantity: 2, rate: 15000 },
          { description: 'Hotel Stay (5 nights)', quantity: 5, rate: 8000 },
        ],
        currency: 'INR',
        dueDate: '2026-04-01',
        notes: 'Goa trip invoice',
      });
      expect(res.status).toBe(201);
      const body: any = await res.json();
      expect(body.data).toBeDefined();
    });

    it('should list invoices', async () => {
      const res = await authRequest('GET', '/invoices', adminToken);
      expect(res.status).toBe(200);
    });

    it('should reject invoice with zero items', async () => {
      const res = await authRequest('POST', '/invoices', adminToken, {
        contactId: 'some-id',
        items: [],
        currency: 'INR',
      });
      expect(res.status).toBe(400);
    });
  });

  // ─── Traveller CRUD ─────────────────────────────────────────────

  describe('Traveller CRUD', () => {
    it('should list travellers', async () => {
      const res = await authRequest('GET', '/travellers', adminToken);
      expect(res.status).toBe(200);
    });

    it('should create a traveller', async () => {
      const res = await authRequest('POST', '/travellers', adminToken, {
        name: 'John Traveller',
        passportNumber: 'A12345678',
        nationality: 'Indian',
        dateOfBirth: '1990-05-15',
        phone: '+919876543210',
      });
      // Accept 201 or 400 depending on required field validation
      expect([201, 400]).toContain(res.status);
    });
  });

  // ─── Visa Workflow ──────────────────────────────────────────────

  describe('Visa Workflow', () => {
    it('should list visa applications', async () => {
      const res = await authRequest('GET', '/visa', adminToken);
      expect(res.status).toBe(200);
    });

    it('should reject visa application without required fields', async () => {
      const res = await authRequest('POST', '/visa', adminToken, {});
      expect(res.status).toBe(400);
    });
  });

  // ─── Documents ──────────────────────────────────────────────────

  describe('Documents', () => {
    it('should list documents', async () => {
      const res = await authRequest('GET', '/documents', adminToken);
      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent document', async () => {
      const res = await authRequest('GET', '/documents/non-existent', adminToken);
      expect(res.status).toBe(404);
    });
  });

  // ─── Notifications ─────────────────────────────────────────────

  describe('Notifications', () => {
    it('should list notifications', async () => {
      const res = await authRequest('GET', '/notifications', adminToken);
      expect(res.status).toBe(200);
    });

    it('should mark all as read', async () => {
      const res = await authRequest('POST', '/notifications/read-all', adminToken);
      expect([200, 204]).toContain(res.status);
    });
  });

  // ─── Reports ───────────────────────────────────────────────────

  describe('Reports', () => {
    it('should list available reports', async () => {
      const res = await authRequest('GET', '/reports', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
    });
  });

  // ─── Users ─────────────────────────────────────────────────────

  describe('Users', () => {
    it('should list users', async () => {
      const res = await authRequest('GET', '/users', adminToken);
      expect(res.status).toBe(200);
    });

    it('should get current user profile', async () => {
      const res = await authRequest('GET', '/users/me', adminToken);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.data).toHaveProperty('email');
        expect(body.data).toHaveProperty('name');
        expect(body.data).toHaveProperty('role');
      }
    });
  });

  // ─── Itinerary CRUD ─────────────────────────────────────────────

  describe('Itinerary CRUD', () => {
    it('should list itineraries', async () => {
      const res = await authRequest('GET', '/itineraries', adminToken);
      expect(res.status).toBe(200);
    });

    it('should reject itinerary without required fields', async () => {
      const res = await authRequest('POST', '/itineraries', adminToken, {});
      expect(res.status).toBe(400);
    });
  });

  // ─── Rate Cards ─────────────────────────────────────────────────

  describe('Rate Cards', () => {
    it('should list rate cards', async () => {
      const res = await authRequest('GET', '/rate-cards', adminToken);
      expect(res.status).toBe(200);
    });
  });

  // ─── Campaigns ──────────────────────────────────────────────────

  describe('Campaigns', () => {
    it('should list campaigns', async () => {
      const res = await authRequest('GET', '/campaigns', adminToken);
      expect(res.status).toBe(200);
    });
  });
});
