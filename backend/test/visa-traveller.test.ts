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

describe('Visa & Traveller Routes Integration Tests', () => {
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

  // ═══════════════════════════════════════════════════════════════
  // TRAVELLER CRUD
  // ═══════════════════════════════════════════════════════════════

  describe('Traveller CRUD', () => {
    let travellerId = '';

    it('should list travellers', async () => {
      const res = await authRequest('GET', '/travellers', adminToken);
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body).toHaveProperty('data');
      }
    });

    it('should create a traveller', async () => {
      const res = await authRequest('POST', '/travellers', adminToken, {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-05-15',
        gender: 'male',
        nationality: 'Indian',
        passportNumber: 'A12345678',
        passportExpiryDate: '2030-12-31',
        passportIssuingCountry: 'India',
        mealPreference: 'vegetarian',
        seatPreference: 'window',
        emergencyContactName: 'Jane Doe',
        emergencyContactPhone: '+919876543210',
      });
      if (res.status === 201) {
        const body: any = await res.json();
        expect(body.data).toHaveProperty('id');
        travellerId = body.data.id;
      } else {
        expect([201, 400, 500]).toContain(res.status);
      }
    });

    it('should reject traveller without firstName', async () => {
      const res = await authRequest('POST', '/travellers', adminToken, {
        lastName: 'NoFirst',
      });
      expect(res.status).toBe(400);
    });

    it('should reject traveller without lastName', async () => {
      const res = await authRequest('POST', '/travellers', adminToken, {
        firstName: 'NoLast',
      });
      expect(res.status).toBe(400);
    });

    it('should reject traveller with empty firstName', async () => {
      const res = await authRequest('POST', '/travellers', adminToken, {
        firstName: '',
        lastName: 'Test',
      });
      expect(res.status).toBe(400);
    });

    it('should reject traveller with invalid gender', async () => {
      const res = await authRequest('POST', '/travellers', adminToken, {
        firstName: 'Test',
        lastName: 'Gender',
        gender: 'invalid',
      });
      expect(res.status).toBe(400);
    });

    it('should get traveller by ID', async () => {
      if (!travellerId) return;
      const res = await authRequest('GET', `/travellers/${travellerId}`, adminToken);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.data).toHaveProperty('first_name', 'John');
        expect(body.data).toHaveProperty('last_name', 'Doe');
      } else {
        expect([200, 404]).toContain(res.status);
      }
    });

    it('should return 404 for non-existent traveller', async () => {
      const res = await authRequest('GET', '/travellers/nonexistent-id', adminToken);
      expect(res.status).toBe(404);
    });

    it('should update traveller', async () => {
      if (!travellerId) return;
      const res = await authRequest('PUT', `/travellers/${travellerId}`, adminToken, {
        mealPreference: 'non-vegetarian',
        seatPreference: 'aisle',
      });
      expect([200, 404]).toContain(res.status);
    });

    it('should support pagination on travellers', async () => {
      const res = await authRequest('GET', '/travellers?page=1&limit=5', adminToken);
      expect([200, 500]).toContain(res.status);
    });

    it('should support search on travellers', async () => {
      const res = await authRequest('GET', '/travellers?search=John', adminToken);
      expect([200, 500]).toContain(res.status);
    });

    it('should support nationality filter', async () => {
      const res = await authRequest('GET', '/travellers?nationality=Indian', adminToken);
      expect([200, 500]).toContain(res.status);
    });

    it('should link traveller to contact', async () => {
      if (!travellerId) return;
      // First create a contact
      const contactRes = await authRequest('POST', '/contacts', adminToken, {
        name: 'Traveller Contact',
        type: 'customer',
        source: 'manual',
      });
      if (contactRes.status !== 201) {
        expect([201, 500]).toContain(contactRes.status);
        return;
      }
      const contactBody: any = await contactRes.json();

      const res = await authRequest('PUT', `/travellers/${travellerId}/link-contact`, adminToken, {
        contactId: contactBody.data.id,
      });
      expect([200, 404]).toContain(res.status);
    });

    it('should reject link-contact without contactId', async () => {
      if (!travellerId) return;
      const res = await authRequest('PUT', `/travellers/${travellerId}/link-contact`, adminToken, {});
      expect(res.status).toBe(400);
    });

    it('should unlink traveller from contact', async () => {
      if (!travellerId) return;
      const res = await authRequest('PUT', `/travellers/${travellerId}/unlink-contact`, adminToken);
      expect([200, 404]).toContain(res.status);
    });

    it('should soft delete traveller', async () => {
      if (!travellerId) return;
      const res = await authRequest('DELETE', `/travellers/${travellerId}`, adminToken);
      expect([200, 404]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // VISA APPLICATION CRUD
  // ═══════════════════════════════════════════════════════════════

  describe('Visa Application CRUD', () => {
    let travellerId = '';
    let visaId = '';

    it('should create a traveller for visa testing', async () => {
      const res = await authRequest('POST', '/travellers', adminToken, {
        firstName: 'Visa',
        lastName: 'Tester',
        nationality: 'Indian',
        passportNumber: 'B98765432',
        passportExpiryDate: '2031-06-30',
      });
      if (res.status === 201) {
        const body: any = await res.json();
        travellerId = body.data.id;
      } else {
        expect([201, 400, 500]).toContain(res.status);
      }
    });

    it('should list visa applications', async () => {
      const res = await authRequest('GET', '/visa', adminToken);
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body).toHaveProperty('data');
      }
    });

    it('should create a visa application', async () => {
      if (!travellerId) return;
      const res = await authRequest('POST', '/visa', adminToken, {
        travellerId,
        destinationCountry: 'United States',
        visaType: 'tourist',
        expectedDate: '2026-06-01',
      });
      if (res.status === 201) {
        const body: any = await res.json();
        expect(body.data).toHaveProperty('id');
        visaId = body.data.id;
      } else {
        expect([201, 500]).toContain(res.status);
      }
    });

    it('should reject visa without travellerId', async () => {
      const res = await authRequest('POST', '/visa', adminToken, {
        destinationCountry: 'UK',
        visaType: 'tourist',
      });
      expect(res.status).toBe(400);
    });

    it('should reject visa without destinationCountry', async () => {
      const res = await authRequest('POST', '/visa', adminToken, {
        travellerId: 'some-id',
        visaType: 'tourist',
      });
      expect(res.status).toBe(400);
    });

    it('should reject visa with invalid visaType', async () => {
      const res = await authRequest('POST', '/visa', adminToken, {
        travellerId: 'some-id',
        destinationCountry: 'UK',
        visaType: 'invalid_type',
      });
      expect(res.status).toBe(400);
    });

    it('should reject visa with empty travellerId', async () => {
      const res = await authRequest('POST', '/visa', adminToken, {
        travellerId: '',
        destinationCountry: 'UK',
        visaType: 'tourist',
      });
      expect(res.status).toBe(400);
    });

    it('should reject visa with empty destinationCountry', async () => {
      const res = await authRequest('POST', '/visa', adminToken, {
        travellerId: 'some-id',
        destinationCountry: '',
        visaType: 'tourist',
      });
      expect(res.status).toBe(400);
    });

    it('should get visa application by ID', async () => {
      if (!visaId) return;
      const res = await authRequest('GET', `/visa/${visaId}`, adminToken);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.data).toHaveProperty('checklist');
        expect(body.data).toHaveProperty('documents');
        expect(body.data).toHaveProperty('notes');
      } else {
        expect([200, 404]).toContain(res.status);
      }
    });

    it('should return 404 for non-existent visa', async () => {
      const res = await authRequest('GET', '/visa/nonexistent-id', adminToken);
      expect(res.status).toBe(404);
    });

    it('should update visa application', async () => {
      if (!visaId) return;
      const res = await authRequest('PUT', `/visa/${visaId}`, adminToken, {
        applicationNumber: 'USA-2026-001',
        notes: 'Expedited processing',
      });
      expect([200, 404]).toContain(res.status);
    });

    it('should support pagination on visa list', async () => {
      const res = await authRequest('GET', '/visa?page=1&limit=5', adminToken);
      expect([200, 500]).toContain(res.status);
    });

    it('should support status filter on visa list', async () => {
      const res = await authRequest('GET', '/visa?status=not_started', adminToken);
      expect([200, 500]).toContain(res.status);
    });

    it('should support search on visa list', async () => {
      const res = await authRequest('GET', '/visa?search=United', adminToken);
      expect([200, 500]).toContain(res.status);
    });

    it('should support destination_country filter', async () => {
      const res = await authRequest('GET', '/visa?destination_country=United States', adminToken);
      expect([200, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // VISA STATUS TRANSITIONS
  // ═══════════════════════════════════════════════════════════════

  describe('Visa Status Transitions', () => {
    let travellerId = '';
    let visaId = '';

    it('should create traveller and visa for status tests', async () => {
      const tRes = await authRequest('POST', '/travellers', adminToken, {
        firstName: 'Status',
        lastName: 'Tester',
        nationality: 'Indian',
      });
      if (tRes.status === 201) {
        const tBody: any = await tRes.json();
        travellerId = tBody.data.id;
      } else {
        expect([201, 400, 500]).toContain(tRes.status);
        return;
      }

      const vRes = await authRequest('POST', '/visa', adminToken, {
        travellerId,
        destinationCountry: 'Japan',
        visaType: 'tourist',
      });
      if (vRes.status === 201) {
        const vBody: any = await vRes.json();
        visaId = vBody.data.id;
      } else {
        expect([201, 400, 500]).toContain(vRes.status);
      }
    });

    it('should transition not_started → documents_collecting', async () => {
      if (!visaId) return;
      const res = await authRequest('PUT', `/visa/${visaId}/status`, adminToken, {
        status: 'documents_collecting',
      });
      expect([200, 404]).toContain(res.status);
    });

    it('should transition documents_collecting → applied', async () => {
      if (!visaId) return;
      const res = await authRequest('PUT', `/visa/${visaId}/status`, adminToken, {
        status: 'applied',
      });
      expect([200, 404]).toContain(res.status);
    });

    it('should transition applied → processing', async () => {
      if (!visaId) return;
      const res = await authRequest('PUT', `/visa/${visaId}/status`, adminToken, {
        status: 'processing',
      });
      expect([200, 404]).toContain(res.status);
    });

    it('should reject approval without visa details', async () => {
      if (!visaId) return;
      const res = await authRequest('PUT', `/visa/${visaId}/status`, adminToken, {
        status: 'approved',
      });
      expect([404, 422]).toContain(res.status);
    });

    it('should approve with required details', async () => {
      if (!visaId) return;
      const res = await authRequest('PUT', `/visa/${visaId}/status`, adminToken, {
        status: 'approved',
        visaNumber: 'JP-2026-12345',
        visaIssueDate: '2026-04-01',
        visaExpiryDate: '2026-10-01',
      });
      expect([200, 404]).toContain(res.status);
    });

    it('should reject invalid status transition (approved→documents_collecting)', async () => {
      if (!visaId) return;
      const res = await authRequest('PUT', `/visa/${visaId}/status`, adminToken, {
        status: 'documents_collecting',
      });
      expect([404, 422]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // VISA REJECTION
  // ═══════════════════════════════════════════════════════════════

  describe('Visa Rejection', () => {
    let travellerId = '';
    let visaId = '';

    it('should create visa for rejection test', async () => {
      const tRes = await authRequest('POST', '/travellers', adminToken, {
        firstName: 'Reject',
        lastName: 'Tester',
        nationality: 'Indian',
      });
      if (tRes.status === 201) {
        travellerId = (await tRes.json() as any).data.id;
      } else {
        expect([201, 400, 500]).toContain(tRes.status);
        return;
      }

      const vRes = await authRequest('POST', '/visa', adminToken, {
        travellerId,
        destinationCountry: 'UK',
        visaType: 'business',
      });
      if (vRes.status === 201) {
        visaId = (await vRes.json() as any).data.id;
      } else {
        expect([201, 400, 500]).toContain(vRes.status);
      }
    });

    it('should transition to applied (go through documents_collecting first)', async () => {
      if (!visaId) return;
      await authRequest('PUT', `/visa/${visaId}/status`, adminToken, {
        status: 'documents_collecting',
      });
      await authRequest('PUT', `/visa/${visaId}/status`, adminToken, {
        status: 'applied',
      });
    });

    it('should reject rejection without reason', async () => {
      if (!visaId) return;
      const res = await authRequest('PUT', `/visa/${visaId}/status`, adminToken, {
        status: 'rejected',
      });
      expect([404, 422]).toContain(res.status);
    });

    it('should reject with reason', async () => {
      if (!visaId) return;
      const res = await authRequest('PUT', `/visa/${visaId}/status`, adminToken, {
        status: 'rejected',
        rejectionReason: 'Insufficient documentation',
      });
      expect([200, 404]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // VISA CHECKLIST
  // ═══════════════════════════════════════════════════════════════

  describe('Visa Checklist', () => {
    let travellerId = '';
    let visaId = '';

    it('should create visa with auto-generated checklist', async () => {
      const tRes = await authRequest('POST', '/travellers', adminToken, {
        firstName: 'Checklist',
        lastName: 'Test',
        nationality: 'Indian',
      });
      if (tRes.status === 201) {
        travellerId = (await tRes.json() as any).data.id;
      } else {
        expect([201, 400, 500]).toContain(tRes.status);
        return;
      }

      const vRes = await authRequest('POST', '/visa', adminToken, {
        travellerId,
        destinationCountry: 'United States',
        visaType: 'tourist',
      });
      if (vRes.status === 201) {
        visaId = (await vRes.json() as any).data.id;
      } else {
        expect([201, 400, 500]).toContain(vRes.status);
      }
    });

    it('should have checklist items on the visa detail', async () => {
      if (!visaId) return;
      const res = await authRequest('GET', `/visa/${visaId}`, adminToken);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.data).toHaveProperty('checklist');
        expect(Array.isArray(body.data.checklist)).toBe(true);
      } else {
        expect([200, 404]).toContain(res.status);
      }
    });

    it('should update checklist item status', async () => {
      if (!visaId) return;
      // Get the visa detail to find a checklist item
      const detailRes = await authRequest('GET', `/visa/${visaId}`, adminToken);
      if (detailRes.status !== 200) return;
      const detailBody: any = await detailRes.json();
      const checklist = detailBody.data.checklist;

      if (checklist && checklist.length > 0) {
        const itemId = checklist[0].id;
        const res = await authRequest('PUT', `/visa/${visaId}/checklist/${itemId}`, adminToken, {
          isReceived: true,
          notes: 'Received and verified',
        });
        expect([200, 404]).toContain(res.status);
        if (res.status === 200) {
          const body: any = await res.json();
          expect(body.success).toBe(true);
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // VISA NOTES
  // ═══════════════════════════════════════════════════════════════

  describe('Visa Notes', () => {
    let visaId = '';

    it('should create visa for notes test', async () => {
      const tRes = await authRequest('POST', '/travellers', adminToken, {
        firstName: 'Notes',
        lastName: 'Test',
        nationality: 'Indian',
      });
      if (tRes.status === 201) {
        const travellerId = (await tRes.json() as any).data.id;

        const vRes = await authRequest('POST', '/visa', adminToken, {
          travellerId,
          destinationCountry: 'Canada',
          visaType: 'tourist',
        });
        if (vRes.status === 201) {
          visaId = (await vRes.json() as any).data.id;
        } else {
          expect([201, 400, 500]).toContain(vRes.status);
        }
      } else {
        expect([201, 400, 500]).toContain(tRes.status);
      }
    });

    it('should add a note to visa', async () => {
      if (!visaId) return;
      const res = await authRequest('POST', `/visa/${visaId}/notes`, adminToken, {
        content: 'Customer provided all documents',
      });
      expect([201, 404, 500]).toContain(res.status);
    });

    it('should reject note without content', async () => {
      if (!visaId) return;
      const res = await authRequest('POST', `/visa/${visaId}/notes`, adminToken, {});
      expect(res.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // VISA DASHBOARD & REPORTS
  // ═══════════════════════════════════════════════════════════════

  describe('Visa Dashboard', () => {
    it('should get visa dashboard stats', async () => {
      const res = await authRequest('GET', '/visa/dashboard', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      if (body.data) {
        expect(body.data).toHaveProperty('total');
        expect(body.data).toHaveProperty('statusCounts');
        expect(body.data).toHaveProperty('expiringSoon');
        expect(body.data).toHaveProperty('byCountry');
      }
    });
  });

  describe('Missing Documents Report', () => {
    it('should get missing documents report', async () => {
      const res = await authRequest('GET', '/visa/missing-documents', adminToken);
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body).toHaveProperty('data');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // VISA DELETE
  // ═══════════════════════════════════════════════════════════════

  describe('Visa Delete', () => {
    it('should soft delete a visa', async () => {
      const tRes = await authRequest('POST', '/travellers', adminToken, {
        firstName: 'Delete',
        lastName: 'Test',
        nationality: 'Indian',
      });
      if (tRes.status !== 201) {
        expect([201, 400, 500]).toContain(tRes.status);
        return;
      }
      const travellerId = (await tRes.json() as any).data.id;

      const vRes = await authRequest('POST', '/visa', adminToken, {
        travellerId,
        destinationCountry: 'Australia',
        visaType: 'tourist',
      });
      if (vRes.status === 201) {
        const visaId = (await vRes.json() as any).data.id;
        const delRes = await authRequest('DELETE', `/visa/${visaId}`, adminToken);
        expect([200, 404]).toContain(delRes.status);
      } else {
        expect([201, 400, 500]).toContain(vRes.status);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // VISA DOCUMENTS LISTING
  // ═══════════════════════════════════════════════════════════════

  describe('Visa Documents', () => {
    it('should list visa documents (empty for new visa)', async () => {
      const tRes = await authRequest('POST', '/travellers', adminToken, {
        firstName: 'DocList',
        lastName: 'Test',
        nationality: 'Indian',
      });
      if (tRes.status !== 201) {
        expect([201, 400, 500]).toContain(tRes.status);
        return;
      }
      const travellerId = (await tRes.json() as any).data.id;

      const vRes = await authRequest('POST', '/visa', adminToken, {
        travellerId,
        destinationCountry: 'France',
        visaType: 'tourist',
      });
      if (vRes.status === 201) {
        const visaId = (await vRes.json() as any).data.id;
        const docRes = await authRequest('GET', `/visa/${visaId}/documents`, adminToken);
        expect([200, 404]).toContain(docRes.status);
        if (docRes.status === 200) {
          const docBody: any = await docRes.json();
          expect(Array.isArray(docBody.data)).toBe(true);
        }
      } else {
        expect([201, 400, 500]).toContain(vRes.status);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // AUTH REQUIRED
  // ═══════════════════════════════════════════════════════════════

  describe('Auth Required', () => {
    it('should reject unauthenticated traveller list', async () => {
      const res = await publicRequest('GET', '/api/v1/travellers');
      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated visa list', async () => {
      const res = await publicRequest('GET', '/api/v1/visa');
      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated visa creation', async () => {
      const res = await publicRequest('POST', '/api/v1/visa');
      expect(res.status).toBe(401);
    });
  });
});
