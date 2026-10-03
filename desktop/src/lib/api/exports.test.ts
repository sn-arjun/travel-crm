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
import { exportsApi } from './exports';

describe('exportsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('contacts', () => {
    it('should call GET /exports/contacts with blob responseType', async () => {
      vi.mocked(client.get).mockResolvedValue(new Blob(['csv']));
      await exportsApi.contacts();
      expect(client.get).toHaveBeenCalledWith('/exports/contacts', { params: undefined, responseType: 'blob' });
    });

    it('should pass format param', async () => {
      vi.mocked(client.get).mockResolvedValue(new Blob());
      await exportsApi.contacts({ format: 'xlsx' });
      expect(client.get).toHaveBeenCalledWith('/exports/contacts', { params: { format: 'xlsx' }, responseType: 'blob' });
    });

    it('should return blob', async () => {
      const blob = new Blob(['data']);
      vi.mocked(client.get).mockResolvedValue(blob);
      const result = await exportsApi.contacts();
      expect(result).toBeInstanceOf(Blob);
    });

    it('should pass includeFields', async () => {
      vi.mocked(client.get).mockResolvedValue(new Blob());
      await exportsApi.contacts({ includeFields: ['name', 'email'] });
      expect(client.get).toHaveBeenCalledWith('/exports/contacts', { params: { includeFields: ['name', 'email'] }, responseType: 'blob' });
    });
  });

  describe('leads', () => {
    it('should call GET /exports/leads with blob responseType', async () => {
      vi.mocked(client.get).mockResolvedValue(new Blob());
      await exportsApi.leads();
      expect(client.get).toHaveBeenCalledWith('/exports/leads', { params: undefined, responseType: 'blob' });
    });

    it('should pass format param', async () => {
      vi.mocked(client.get).mockResolvedValue(new Blob());
      await exportsApi.leads({ format: 'csv' });
      expect(client.get).toHaveBeenCalledWith('/exports/leads', { params: { format: 'csv' }, responseType: 'blob' });
    });

    it('should return blob', async () => {
      const blob = new Blob(['leads-data']);
      vi.mocked(client.get).mockResolvedValue(blob);
      const result = await exportsApi.leads();
      expect(result).toBeInstanceOf(Blob);
    });
  });

  describe('invoicesBulkPdf', () => {
    it('should call POST /exports/invoices/bulk-pdf', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'job1', status: 'pending' } });
      await exportsApi.invoicesBulkPdf({ invoiceIds: ['inv1', 'inv2'] });
      expect(client.post).toHaveBeenCalledWith('/exports/invoices/bulk-pdf', { invoiceIds: ['inv1', 'inv2'] });
    });

    it('should pass combineIntoSinglePdf', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'job1', status: 'pending' } });
      await exportsApi.invoicesBulkPdf({ invoiceIds: ['inv1'], combineIntoSinglePdf: true });
      expect(client.post).toHaveBeenCalledWith('/exports/invoices/bulk-pdf', { invoiceIds: ['inv1'], combineIntoSinglePdf: true });
    });

    it('should return the queued export job', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'job2', status: 'pending' } });
      const result = await exportsApi.invoicesBulkPdf({ invoiceIds: ['inv1'] });
      expect(result.data.id).toBe('job2');
    });
  });

  describe('full', () => {
    it('should call POST /exports/full', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'job1', status: 'pending' } });
      await exportsApi.full();
      expect(client.post).toHaveBeenCalledWith('/exports/full', undefined);
    });

    it('should pass export options', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'job2' } });
      await exportsApi.full({ includeContacts: true, includeLeads: true, includeInvoices: false });
      expect(client.post).toHaveBeenCalledWith('/exports/full', { includeContacts: true, includeLeads: true, includeInvoices: false });
    });

    it('should return job info', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'job3', status: 'pending', type: 'full' } });
      const result = await exportsApi.full();
      expect(result.data.id).toBe('job3');
      expect(result.data.status).toBe('pending');
    });
  });

  describe('getJobStatus', () => {
    it('should call GET /exports/jobs/:id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'job1', status: 'completed' } });
      const result = await exportsApi.getJobStatus('job1');
      expect(client.get).toHaveBeenCalledWith('/exports/jobs/job1');
      expect(result.data.status).toBe('completed');
    });

    it('should use correct id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });
      await exportsApi.getJobStatus('job-xyz');
      expect(client.get).toHaveBeenCalledWith('/exports/jobs/job-xyz');
    });

    it('should return job with all fields', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'j1', status: 'processing', type: 'contacts', createdAt: '2026-01-01' } });
      const result = await exportsApi.getJobStatus('j1');
      expect(result.data).toHaveProperty('status');
      expect(result.data).toHaveProperty('type');
    });
  });

  describe('downloadJob', () => {
    it('should call GET /exports/jobs/:id/download with blob responseType', async () => {
      vi.mocked(client.get).mockResolvedValue(new Blob());
      await exportsApi.downloadJob('job1');
      expect(client.get).toHaveBeenCalledWith('/exports/jobs/job1/download', { responseType: 'blob' });
    });

    it('should return blob', async () => {
      const blob = new Blob(['file-data']);
      vi.mocked(client.get).mockResolvedValue(blob);
      const result = await exportsApi.downloadJob('job1');
      expect(result).toBeInstanceOf(Blob);
    });

    it('should use correct id', async () => {
      vi.mocked(client.get).mockResolvedValue(new Blob());
      await exportsApi.downloadJob('job-abc');
      expect(client.get).toHaveBeenCalledWith('/exports/jobs/job-abc/download', { responseType: 'blob' });
    });
  });
});
