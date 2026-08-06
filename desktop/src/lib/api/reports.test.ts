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
import { reportsApi } from './reports';

describe('reportsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should call GET /reports', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await reportsApi.list();
      expect(client.get).toHaveBeenCalledWith('/reports', { params: undefined });
    });

    it('should pass filter params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await reportsApi.list({ type: 'sales', search: 'revenue' });
      expect(client.get).toHaveBeenCalledWith('/reports', { params: { type: 'sales', search: 'revenue' } });
    });

    it('should pass pagination and sort', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await reportsApi.list({ page: 2, limit: 10, sortBy: 'name', sortOrder: 'asc' });
      expect(client.get).toHaveBeenCalledWith('/reports', { params: { page: 2, limit: 10, sortBy: 'name', sortOrder: 'asc' } });
    });
  });

  describe('getById', () => {
    it('should call GET /reports/:id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'r1', name: 'Sales Report' } });
      const result = await reportsApi.getById('r1');
      expect(client.get).toHaveBeenCalledWith('/reports/r1');
      expect(result.data.name).toBe('Sales Report');
    });

    it('should use correct id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });
      await reportsApi.getById('report-abc');
      expect(client.get).toHaveBeenCalledWith('/reports/report-abc');
    });

    it('should return report data', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'r1', name: 'Test', type: 'sales', config: {} } });
      const result = await reportsApi.getById('r1');
      expect(result.data).toHaveProperty('name');
      expect(result.data).toHaveProperty('type');
    });
  });

  describe('create', () => {
    it('should call POST /reports (uses list endpoint)', async () => {
      const data = { name: 'New Report', type: 'sales', config: { metrics: ['revenue'] } };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'r1' } });
      await reportsApi.create(data);
      expect(client.post).toHaveBeenCalledWith('/reports', data);
    });

    it('should pass description', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'r2' } });
      await reportsApi.create({ name: 'Desc Report', description: 'Monthly sales', type: 'financial', config: {} });
      expect(client.post).toHaveBeenCalledWith('/reports', expect.objectContaining({ description: 'Monthly sales' }));
    });

    it('should return created report', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'r3', name: 'Created' } });
      const result = await reportsApi.create({ name: 'Created', type: 'sales', config: {} });
      expect(result.data.id).toBe('r3');
    });
  });

  describe('update', () => {
    it('should call PUT /reports/:id', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'r1' } });
      await reportsApi.update('r1', { name: 'Updated Report' });
      expect(client.put).toHaveBeenCalledWith('/reports/r1', { name: 'Updated Report' });
    });

    it('should pass partial fields', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: {} });
      await reportsApi.update('r1', { config: { metrics: ['profit'] } });
      expect(client.put).toHaveBeenCalledWith('/reports/r1', { config: { metrics: ['profit'] } });
    });

    it('should return updated report', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'r1', name: 'Updated' } });
      const result = await reportsApi.update('r1', { name: 'Updated' });
      expect(result.data.name).toBe('Updated');
    });
  });

  describe('delete', () => {
    it('should call DELETE /reports/:id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      await reportsApi.delete('r1');
      expect(client.delete).toHaveBeenCalledWith('/reports/r1');
    });

    it('should return void', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      const result = await reportsApi.delete('r1');
      expect(result).toEqual({ data: undefined });
    });
  });

  describe('execute', () => {
    it('should call GET /reports/:id with params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], columns: [], meta: {} } });
      await reportsApi.execute('sales');
      expect(client.get).toHaveBeenCalledWith('/reports/sales', { params: {} });
    });

    it('should pass date range params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });
      await reportsApi.execute('sales', { date_from: '2026-01-01', date_to: '2026-03-31' });
      expect(client.get).toHaveBeenCalledWith('/reports/sales', { params: { date_from: '2026-01-01', date_to: '2026-03-31' } });
    });

    it('should convert compare to string', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });
      await reportsApi.execute('sales', { compare: true });
      expect(client.get).toHaveBeenCalledWith('/reports/sales', { params: { compare: 'true' } });
    });

    it('should pass pagination and grouping', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });
      await reportsApi.execute('sales', { page: 1, per_page: 50, group_by: 'month' });
      expect(client.get).toHaveBeenCalledWith('/reports/sales', { params: { page: 1, per_page: 50, group_by: 'month' } });
    });
  });

  describe('export', () => {
    it('should call GET /reports/:id/export with blob responseType', async () => {
      vi.mocked(client.get).mockResolvedValue(new Blob());
      await reportsApi.export('r1', 'pdf');
      expect(client.get).toHaveBeenCalledWith('/reports/r1/export', { params: { format: 'pdf' }, responseType: 'blob' });
    });

    it('should pass excel format', async () => {
      vi.mocked(client.get).mockResolvedValue(new Blob());
      await reportsApi.export('r1', 'excel');
      expect(client.get).toHaveBeenCalledWith('/reports/r1/export', { params: { format: 'excel' }, responseType: 'blob' });
    });

    it('should pass report params', async () => {
      vi.mocked(client.get).mockResolvedValue(new Blob());
      await reportsApi.export('r1', 'pdf', { date_from: '2026-01-01' });
      expect(client.get).toHaveBeenCalledWith('/reports/r1/export', { params: { format: 'pdf', date_from: '2026-01-01' }, responseType: 'blob' });
    });
  });

  describe('getDashboard', () => {
    it('should call GET /reports/dashboard', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { pipeline: [], hotLeads: [], followUps: {}, financial: {} } });
      const result = await reportsApi.getDashboard();
      expect(client.get).toHaveBeenCalledWith('/reports/dashboard');
      expect(result.data).toHaveProperty('pipeline');
    });

    it('should return financial data', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { pipeline: [], hotLeads: [], followUps: {}, financial: { revenueThisMonth: 100000 } } });
      const result = await reportsApi.getDashboard();
      expect(result.data.financial.revenueThisMonth).toBe(100000);
    });
  });

  describe('getOutstandingReport', () => {
    it('should call GET /reports/outstanding', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });
      await reportsApi.getOutstandingReport();
      expect(client.get).toHaveBeenCalledWith('/reports/outstanding', { params: undefined });
    });

    it('should pass date range', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });
      await reportsApi.getOutstandingReport({ date_from: '2026-01-01', date_to: '2026-03-31' });
      expect(client.get).toHaveBeenCalledWith('/reports/outstanding', { params: { date_from: '2026-01-01', date_to: '2026-03-31' } });
    });
  });

  describe('getAgeingReport', () => {
    it('should call GET /reports/ageing', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });
      await reportsApi.getAgeingReport();
      expect(client.get).toHaveBeenCalledWith('/reports/ageing', { params: undefined });
    });

    it('should pass date range', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });
      await reportsApi.getAgeingReport({ date_from: '2026-01-01' });
      expect(client.get).toHaveBeenCalledWith('/reports/ageing', { params: { date_from: '2026-01-01' } });
    });
  });

  describe('invalidateCache', () => {
    it('should call DELETE /reports/:id/cache for specific report', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      await reportsApi.invalidateCache('r1');
      expect(client.delete).toHaveBeenCalledWith('/reports/r1/cache');
    });

    it('should call DELETE /reports/cache for all reports', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      await reportsApi.invalidateCache();
      expect(client.delete).toHaveBeenCalledWith('/reports/cache');
    });

    it('should return void', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      const result = await reportsApi.invalidateCache('r1');
      expect(result).toEqual({ data: undefined });
    });
  });
});
