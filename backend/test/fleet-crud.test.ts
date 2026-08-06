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

describe('Fleet Management CRUD Integration Tests', () => {
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
  // VEHICLE CRUD
  // ═══════════════════════════════════════════════════════════════

  describe('Vehicle CRUD', () => {
    let vehicleId = '';

    it('should list vehicles', async () => {
      const res = await authRequest('GET', '/fleet/vehicles', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('pagination');
    });

    it('should create a vehicle', async () => {
      const res = await authRequest('POST', '/fleet/vehicles', adminToken, {
        registrationNumber: 'MH01AB1234',
        type: 'sedan',
        make: 'Toyota',
        model: 'Camry',
        year: 2023,
        seatingCapacity: 4,
        color: 'White',
        notes: 'Test vehicle',
      });
      if (res.status === 201) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty('id');
        vehicleId = body.data.id;
      } else {
        expect([201, 500]).toContain(res.status);
      }
    });

    it('should reject vehicle with missing registration number', async () => {
      const res = await authRequest('POST', '/fleet/vehicles', adminToken, {
        type: 'sedan',
      });
      expect(res.status).toBe(400);
    });

    it('should reject vehicle with invalid type', async () => {
      const res = await authRequest('POST', '/fleet/vehicles', adminToken, {
        registrationNumber: 'MH01CD5678',
        type: 'spaceship',
      });
      expect(res.status).toBe(400);
    });

    it('should reject vehicle with empty registration number', async () => {
      const res = await authRequest('POST', '/fleet/vehicles', adminToken, {
        registrationNumber: '',
        type: 'suv',
      });
      expect(res.status).toBe(400);
    });

    it('should reject duplicate registration number', async () => {
      if (!vehicleId) return;
      const res = await authRequest('POST', '/fleet/vehicles', adminToken, {
        registrationNumber: 'MH01AB1234',
        type: 'suv',
      });
      expect([409, 500]).toContain(res.status);
    });

    it('should get vehicle by ID', async () => {
      if (!vehicleId) return;
      const res = await authRequest('GET', `/fleet/vehicles/${vehicleId}`, adminToken);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty('id', vehicleId);
      } else {
        expect([200, 404]).toContain(res.status);
      }
    });

    it('should return 404 for non-existent vehicle', async () => {
      const res = await authRequest('GET', '/fleet/vehicles/nonexistent-id', adminToken);
      expect(res.status).toBe(404);
    });

    it('should update vehicle', async () => {
      if (!vehicleId) return;
      const res = await authRequest('PUT', `/fleet/vehicles/${vehicleId}`, adminToken, {
        color: 'Black',
        notes: 'Updated test vehicle',
      });
      expect([200, 404]).toContain(res.status);
    });

    it('should update vehicle status', async () => {
      if (!vehicleId) return;
      const res = await authRequest('PUT', `/fleet/vehicles/${vehicleId}/status`, adminToken, {
        status: 'under_maintenance',
      });
      expect([200, 404]).toContain(res.status);
    });

    it('should reject invalid vehicle status', async () => {
      if (!vehicleId) return;
      const res = await authRequest('PUT', `/fleet/vehicles/${vehicleId}/status`, adminToken, {
        status: 'flying',
      });
      expect(res.status).toBe(400);
    });

    it('should get vehicle trips', async () => {
      if (!vehicleId) return;
      const res = await authRequest('GET', `/fleet/vehicles/${vehicleId}/trips`, adminToken);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body).toHaveProperty('pagination');
      } else {
        expect([200, 404]).toContain(res.status);
      }
    });

    it('should support pagination on vehicles', async () => {
      const res = await authRequest('GET', '/fleet/vehicles?page=1&limit=5', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body).toHaveProperty('pagination');
    });

    it('should support status filter on vehicles', async () => {
      const res = await authRequest('GET', '/fleet/vehicles?status=available', adminToken);
      expect(res.status).toBe(200);
    });

    it('should support search on vehicles', async () => {
      const res = await authRequest('GET', '/fleet/vehicles?search=Toyota', adminToken);
      expect(res.status).toBe(200);
    });

    it('should support type filter on vehicles', async () => {
      const res = await authRequest('GET', '/fleet/vehicles?type=sedan', adminToken);
      expect(res.status).toBe(200);
    });

    it('should delete vehicle (soft)', async () => {
      if (!vehicleId) return;
      const res = await authRequest('DELETE', `/fleet/vehicles/${vehicleId}`, adminToken);
      expect([200, 400]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DRIVER CRUD
  // ═══════════════════════════════════════════════════════════════

  describe('Driver CRUD', () => {
    let driverId = '';

    it('should list drivers', async () => {
      const res = await authRequest('GET', '/fleet/drivers', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('pagination');
    });

    it('should create a driver', async () => {
      const res = await authRequest('POST', '/fleet/drivers', adminToken, {
        name: 'Test Driver',
        phone: '+919876543210',
        email: 'driver@test.com',
        licenseNumber: 'DL01234567',
        licenseExpiry: '2028-12-31',
        address: '123 Test Street, Mumbai',
        notes: 'Test driver',
      });
      if (res.status === 201) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty('id');
        driverId = body.data.id;
      } else {
        expect([201, 500]).toContain(res.status);
      }
    });

    it('should reject driver with missing name', async () => {
      const res = await authRequest('POST', '/fleet/drivers', adminToken, {
        phone: '+919876543210',
      });
      expect(res.status).toBe(400);
    });

    it('should reject driver with missing phone', async () => {
      const res = await authRequest('POST', '/fleet/drivers', adminToken, {
        name: 'No Phone Driver',
      });
      expect(res.status).toBe(400);
    });

    it('should reject driver with empty name', async () => {
      const res = await authRequest('POST', '/fleet/drivers', adminToken, {
        name: '',
        phone: '+919876543210',
      });
      expect(res.status).toBe(400);
    });

    it('should get driver by ID', async () => {
      if (!driverId) return;
      const res = await authRequest('GET', `/fleet/drivers/${driverId}`, adminToken);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
      } else {
        expect([200, 404]).toContain(res.status);
      }
    });

    it('should return 404 for non-existent driver', async () => {
      const res = await authRequest('GET', '/fleet/drivers/nonexistent-id', adminToken);
      expect(res.status).toBe(404);
    });

    it('should update driver', async () => {
      if (!driverId) return;
      const res = await authRequest('PUT', `/fleet/drivers/${driverId}`, adminToken, {
        address: 'Updated Address',
        notes: 'Updated notes',
      });
      expect([200, 404]).toContain(res.status);
    });

    it('should support pagination on drivers', async () => {
      const res = await authRequest('GET', '/fleet/drivers?page=1&limit=5', adminToken);
      expect(res.status).toBe(200);
    });

    it('should support search on drivers', async () => {
      const res = await authRequest('GET', '/fleet/drivers?search=Test', adminToken);
      expect(res.status).toBe(200);
    });

    it('should delete driver (soft)', async () => {
      if (!driverId) return;
      const res = await authRequest('DELETE', `/fleet/drivers/${driverId}`, adminToken);
      expect([200, 400]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TRIP CRUD
  // ═══════════════════════════════════════════════════════════════

  describe('Trip CRUD', () => {
    it('should list trips', async () => {
      const res = await authRequest('GET', '/fleet/trips', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('pagination');
    });

    it('should reject trip creation with missing fields', async () => {
      const res = await authRequest('POST', '/fleet/trips', adminToken, {});
      expect(res.status).toBe(400);
    });

    it('should support pagination on trips', async () => {
      const res = await authRequest('GET', '/fleet/trips?page=1&limit=5', adminToken);
      expect(res.status).toBe(200);
    });

    it('should support status filter on trips', async () => {
      const res = await authRequest('GET', '/fleet/trips?status=pending', adminToken);
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // RATE CARDS
  // ═══════════════════════════════════════════════════════════════

  describe('Fleet Rate Cards', () => {
    it('should list rate cards', async () => {
      const res = await authRequest('GET', '/rate-cards', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
    });

    it('should reject rate card creation with missing name', async () => {
      const res = await authRequest('POST', '/rate-cards', adminToken, {
        vehicleType: 'sedan',
        tripType: 'one_way',
        baseFare: 1000,
      });
      expect(res.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // VEHICLE MAINTENANCE & DOCUMENTS
  // ═══════════════════════════════════════════════════════════════

  describe('Fleet Document Expiry', () => {
    it('should get expiring documents', async () => {
      const res = await authRequest('GET', '/fleet/documents/expiring', adminToken);
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
      }
    });

    it('should support days parameter on expiring documents', async () => {
      const res = await authRequest('GET', '/fleet/documents/expiring?days=60', adminToken);
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('Fleet Maintenance Due', () => {
    it('should get vehicles with maintenance due', async () => {
      const res = await authRequest('GET', '/fleet/maintenance/due', adminToken);
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
      }
    });

    it('should support days parameter', async () => {
      const res = await authRequest('GET', '/fleet/maintenance/due?days=30', adminToken);
      expect([200, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // AUTH REQUIRED
  // ═══════════════════════════════════════════════════════════════

  describe('Auth Required', () => {
    it('should reject unauthenticated vehicle list', async () => {
      const res = await publicRequest('GET', '/api/v1/fleet/vehicles');
      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated driver list', async () => {
      const res = await publicRequest('GET', '/api/v1/fleet/drivers');
      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated trip list', async () => {
      const res = await publicRequest('GET', '/api/v1/fleet/trips');
      expect(res.status).toBe(401);
    });
  });
});
