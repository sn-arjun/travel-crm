import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./client', () => ({
  client: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { client } from './client';
import { fleetApi } from './fleet';

describe('fleetApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── dashboard ─────────────────────────────────────────────────
  describe('dashboard', () => {
    it('should call GET /fleet/dashboard', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { totalVehicles: 10, totalDrivers: 8 } });
      const result = await fleetApi.dashboard();
      expect(client.get).toHaveBeenCalledWith('/fleet/dashboard');
      expect(result.data.totalVehicles).toBe(10);
    });

    it('should return all dashboard fields', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { totalVehicles: 0, availableVehicles: 0, totalDrivers: 0, activeDrivers: 0, activeTrips: 0 } });
      const result = await fleetApi.dashboard();
      expect(result.data).toHaveProperty('totalVehicles');
      expect(result.data).toHaveProperty('activeTrips');
    });

    it('should not require parameters', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });
      await fleetApi.dashboard();
      expect(client.get).toHaveBeenCalledTimes(1);
    });
  });

  // ─── vehicles ──────────────────────────────────────────────────
  describe('vehicles', () => {
    describe('list', () => {
      it('should call GET /fleet/vehicles', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await fleetApi.vehicles.list();
        expect(client.get).toHaveBeenCalledWith('/fleet/vehicles', { params: undefined });
      });

      it('should pass filter params', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await fleetApi.vehicles.list({ status: 'active', type: 'sedan' });
        expect(client.get).toHaveBeenCalledWith('/fleet/vehicles', { params: { status: 'active', type: 'sedan' } });
      });

      it('should pass pagination', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await fleetApi.vehicles.list({ page: 2, limit: 10, sortBy: 'make', sortOrder: 'asc' });
        expect(client.get).toHaveBeenCalledWith('/fleet/vehicles', { params: { page: 2, limit: 10, sortBy: 'make', sortOrder: 'asc' } });
      });
    });

    describe('getById', () => {
      it('should call GET /fleet/vehicles/:id', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { id: 'v1', make: 'Toyota' } });
        const result = await fleetApi.vehicles.getById('v1');
        expect(client.get).toHaveBeenCalledWith('/fleet/vehicles/v1');
        expect(result.data.make).toBe('Toyota');
      });

      it('should use correct id', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: {} });
        await fleetApi.vehicles.getById('veh-abc');
        expect(client.get).toHaveBeenCalledWith('/fleet/vehicles/veh-abc');
      });
    });

    describe('create', () => {
      it('should call POST /fleet/vehicles', async () => {
        const data = { registrationNumber: 'MH01AB1234', type: 'sedan' as const };
        vi.mocked(client.post).mockResolvedValue({ data: { id: 'v1' } });
        await fleetApi.vehicles.create(data);
        expect(client.post).toHaveBeenCalledWith('/fleet/vehicles', data);
      });

      it('should pass all optional fields', async () => {
        const data = { registrationNumber: 'MH01', type: 'suv' as const, make: 'Toyota', model: 'Fortuner', year: 2024, seatingCapacity: 7 };
        vi.mocked(client.post).mockResolvedValue({ data: { id: 'v2' } });
        await fleetApi.vehicles.create(data);
        expect(client.post).toHaveBeenCalledWith('/fleet/vehicles', data);
      });

      it('should return created vehicle', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: { id: 'v3' } });
        const result = await fleetApi.vehicles.create({ registrationNumber: 'MH02', type: 'bus' as const });
        expect(result.data.id).toBe('v3');
      });
    });

    describe('update', () => {
      it('should call PUT /fleet/vehicles/:id', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: { id: 'v1' } });
        await fleetApi.vehicles.update('v1', { make: 'Honda' });
        expect(client.put).toHaveBeenCalledWith('/fleet/vehicles/v1', { make: 'Honda' });
      });
    });

    describe('delete', () => {
      it('should call DELETE /fleet/vehicles/:id', async () => {
        vi.mocked(client.delete).mockResolvedValue({ data: undefined });
        await fleetApi.vehicles.delete('v1');
        expect(client.delete).toHaveBeenCalledWith('/fleet/vehicles/v1');
      });
    });

    describe('updateStatus', () => {
      it('should call PUT /fleet/vehicles/:id/status', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: {} });
        await fleetApi.vehicles.updateStatus('v1', 'maintenance');
        expect(client.put).toHaveBeenCalledWith('/fleet/vehicles/v1/status', { status: 'maintenance' });
      });
    });

    describe('listDocuments', () => {
      it('should call GET /fleet/vehicles/:id/documents', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [] });
        await fleetApi.vehicles.listDocuments('v1');
        expect(client.get).toHaveBeenCalledWith('/fleet/vehicles/v1/documents');
      });
    });

    describe('getExpiringDocuments', () => {
      it('should call GET with default 30 days', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [] });
        await fleetApi.vehicles.getExpiringDocuments();
        expect(client.get).toHaveBeenCalledWith('/fleet/documents/expiring', { params: { days: 30 } });
      });

      it('should pass custom days', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [] });
        await fleetApi.vehicles.getExpiringDocuments(7);
        expect(client.get).toHaveBeenCalledWith('/fleet/documents/expiring', { params: { days: 7 } });
      });
    });

    describe('recordMaintenance', () => {
      it('should call POST /fleet/vehicles/:id/maintenance', async () => {
        const data = { serviceType: 'oil_change', serviceDate: '2026-03-01' };
        vi.mocked(client.post).mockResolvedValue({ data: { id: 'm1' } });
        await fleetApi.vehicles.recordMaintenance('v1', data);
        expect(client.post).toHaveBeenCalledWith('/fleet/vehicles/v1/maintenance', data);
      });
    });

    describe('getMaintenanceHistory', () => {
      it('should call GET /fleet/vehicles/:id/maintenance', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [] });
        await fleetApi.vehicles.getMaintenanceHistory('v1');
        expect(client.get).toHaveBeenCalledWith('/fleet/vehicles/v1/maintenance');
      });
    });

    describe('updateOdometer', () => {
      it('should call PUT /fleet/vehicles/:id/odometer', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: {} });
        await fleetApi.vehicles.updateOdometer('v1', 50000);
        expect(client.put).toHaveBeenCalledWith('/fleet/vehicles/v1/odometer', { odometerKm: 50000 });
      });
    });

    describe('getAvailability', () => {
      it('should call GET /fleet/vehicles/availability', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: {} });
        await fleetApi.vehicles.getAvailability({ from: '2026-04-01', to: '2026-04-07' });
        expect(client.get).toHaveBeenCalledWith('/fleet/vehicles/availability', { params: { from: '2026-04-01', to: '2026-04-07' } });
      });
    });
  });

  // ─── drivers ───────────────────────────────────────────────────
  describe('drivers', () => {
    describe('list', () => {
      it('should call GET /fleet/drivers', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await fleetApi.drivers.list();
        expect(client.get).toHaveBeenCalledWith('/fleet/drivers', { params: undefined });
      });

      it('should pass filter params', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await fleetApi.drivers.list({ status: 'active', search: 'John' });
        expect(client.get).toHaveBeenCalledWith('/fleet/drivers', { params: { status: 'active', search: 'John' } });
      });
    });

    describe('getById', () => {
      it('should call GET /fleet/drivers/:id', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { id: 'd1', name: 'John' } });
        await fleetApi.drivers.getById('d1');
        expect(client.get).toHaveBeenCalledWith('/fleet/drivers/d1');
      });
    });

    describe('create', () => {
      it('should call POST /fleet/drivers', async () => {
        const data = { name: 'New Driver', phone: '+91999' };
        vi.mocked(client.post).mockResolvedValue({ data: { id: 'd1' } });
        await fleetApi.drivers.create(data);
        expect(client.post).toHaveBeenCalledWith('/fleet/drivers', data);
      });
    });

    describe('update', () => {
      it('should call PUT /fleet/drivers/:id', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: {} });
        await fleetApi.drivers.update('d1', { phone: '+91888' });
        expect(client.put).toHaveBeenCalledWith('/fleet/drivers/d1', { phone: '+91888' });
      });
    });

    describe('delete', () => {
      it('should call DELETE /fleet/drivers/:id', async () => {
        vi.mocked(client.delete).mockResolvedValue({ data: undefined });
        await fleetApi.drivers.delete('d1');
        expect(client.delete).toHaveBeenCalledWith('/fleet/drivers/d1');
      });
    });

    describe('updateStatus', () => {
      it('should call PUT /fleet/drivers/:id/status', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: {} });
        await fleetApi.drivers.updateStatus('d1', 'on_leave');
        expect(client.put).toHaveBeenCalledWith('/fleet/drivers/d1/status', { status: 'on_leave' });
      });
    });

    describe('getSchedule', () => {
      it('should call GET /fleet/drivers/schedule', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: {} });
        await fleetApi.drivers.getSchedule({ from: '2026-04-01', to: '2026-04-07' });
        expect(client.get).toHaveBeenCalledWith('/fleet/drivers/schedule', { params: { from: '2026-04-01', to: '2026-04-07' } });
      });
    });
  });

  // ─── trips ─────────────────────────────────────────────────────
  describe('trips', () => {
    describe('list', () => {
      it('should call GET /fleet/trips', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await fleetApi.trips.list();
        expect(client.get).toHaveBeenCalledWith('/fleet/trips', { params: undefined });
      });

      it('should pass filter params', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await fleetApi.trips.list({ status: 'completed', vehicleId: 'v1', driverId: 'd1' });
        expect(client.get).toHaveBeenCalledWith('/fleet/trips', { params: { status: 'completed', vehicleId: 'v1', driverId: 'd1' } });
      });
    });

    describe('getById', () => {
      it('should call GET /fleet/trips/:id', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { id: 'trip1' } });
        await fleetApi.trips.getById('trip1');
        expect(client.get).toHaveBeenCalledWith('/fleet/trips/trip1');
      });
    });

    describe('create', () => {
      it('should call POST /fleet/trips with mapped fields', async () => {
        const data = { vehicleId: 'v1', driverId: 'd1', startLocation: 'Airport', endLocation: 'Hotel', startTime: '2026-04-01T10:00:00Z', endTime: '2026-04-01T12:00:00Z' };
        vi.mocked(client.post).mockResolvedValue({ data: { id: 'trip1' } });
        await fleetApi.trips.create(data);
        expect(client.post).toHaveBeenCalledWith('/fleet/trips', expect.objectContaining({ vehicleId: 'v1', driverId: 'd1', pickupLocation: 'Airport', dropLocation: 'Hotel' }));
      });
    });

    describe('update', () => {
      it('should call PUT /fleet/trips/:id', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: {} });
        await fleetApi.trips.update('trip1', { status: 'completed' });
        expect(client.put).toHaveBeenCalledWith('/fleet/trips/trip1', { status: 'completed' });
      });
    });

    describe('delete', () => {
      it('should call DELETE /fleet/trips/:id', async () => {
        vi.mocked(client.delete).mockResolvedValue({ data: undefined });
        await fleetApi.trips.delete('trip1');
        expect(client.delete).toHaveBeenCalledWith('/fleet/trips/trip1');
      });
    });

    describe('updateStatus', () => {
      it('should call PUT /fleet/trips/:id/status', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: {} });
        await fleetApi.trips.updateStatus('trip1', 'completed', 'Trip finished');
        expect(client.put).toHaveBeenCalledWith('/fleet/trips/trip1/status', { status: 'completed', notes: 'Trip finished' });
      });
    });

    describe('getTimeline', () => {
      it('should call GET /fleet/trips/:id/timeline', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [] });
        await fleetApi.trips.getTimeline('trip1');
        expect(client.get).toHaveBeenCalledWith('/fleet/trips/trip1/timeline');
      });
    });

    describe('addCost', () => {
      it('should call POST /fleet/trips/:id/costs', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: { id: 'cost1' } });
        await fleetApi.trips.addCost('trip1', { costType: 'fuel', amount: 500 });
        expect(client.post).toHaveBeenCalledWith('/fleet/trips/trip1/costs', { costType: 'fuel', amount: 500 });
      });
    });

    describe('listCosts', () => {
      it('should call GET /fleet/trips/:id/costs', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [] });
        await fleetApi.trips.listCosts('trip1');
        expect(client.get).toHaveBeenCalledWith('/fleet/trips/trip1/costs');
      });
    });

    describe('deleteCost', () => {
      it('should call DELETE /fleet/trips/:tripId/costs/:costId', async () => {
        vi.mocked(client.delete).mockResolvedValue({ data: undefined });
        await fleetApi.trips.deleteCost('trip1', 'cost1');
        expect(client.delete).toHaveBeenCalledWith('/fleet/trips/trip1/costs/cost1');
      });
    });

    describe('getCostSummary', () => {
      it('should call GET /fleet/trips/:id/costs/summary', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { total: 1500, byType: { fuel: 500 } } });
        await fleetApi.trips.getCostSummary('trip1');
        expect(client.get).toHaveBeenCalledWith('/fleet/trips/trip1/costs/summary');
      });
    });
  });

  // ─── rateCards ─────────────────────────────────────────────────
  describe('rateCards', () => {
    describe('list', () => {
      it('should call GET /fleet/rate-cards', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await fleetApi.rateCards.list();
        expect(client.get).toHaveBeenCalledWith('/fleet/rate-cards', { params: undefined });
      });

      it('should pass filter params', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await fleetApi.rateCards.list({ vehicleType: 'sedan' });
        expect(client.get).toHaveBeenCalledWith('/fleet/rate-cards', { params: { vehicleType: 'sedan' } });
      });
    });

    describe('getById', () => {
      it('should call GET /fleet/rate-cards/:id', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { id: 'rc1' } });
        await fleetApi.rateCards.getById('rc1');
        expect(client.get).toHaveBeenCalledWith('/fleet/rate-cards/rc1');
      });
    });

    describe('create', () => {
      it('should call POST /fleet/rate-cards', async () => {
        const data = { name: 'Standard', vehicleType: 'sedan', baseFare: 500, perKmRate: 15 };
        vi.mocked(client.post).mockResolvedValue({ data: { id: 'rc1' } });
        await fleetApi.rateCards.create(data);
        expect(client.post).toHaveBeenCalledWith('/fleet/rate-cards', data);
      });
    });

    describe('update', () => {
      it('should call PUT /fleet/rate-cards/:id', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: {} });
        await fleetApi.rateCards.update('rc1', { baseFare: 600 });
        expect(client.put).toHaveBeenCalledWith('/fleet/rate-cards/rc1', { baseFare: 600 });
      });
    });

    describe('delete', () => {
      it('should call DELETE /fleet/rate-cards/:id', async () => {
        vi.mocked(client.delete).mockResolvedValue({ data: undefined });
        await fleetApi.rateCards.delete('rc1');
        expect(client.delete).toHaveBeenCalledWith('/fleet/rate-cards/rc1');
      });
    });
  });
});
