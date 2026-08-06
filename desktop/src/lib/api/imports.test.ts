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
import { importsApi } from './imports';

describe('importsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should call GET /imports with no params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await importsApi.list();
      expect(client.get).toHaveBeenCalledWith('/imports', { params: undefined });
    });

    it('should pass filter params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await importsApi.list({ type: 'contacts', status: 'completed' });
      expect(client.get).toHaveBeenCalledWith('/imports', { params: { type: 'contacts', status: 'completed' } });
    });

    it('should pass pagination and sort', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await importsApi.list({ page: 2, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' });
      expect(client.get).toHaveBeenCalledWith('/imports', { params: { page: 2, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' } });
    });

    it('should return paginated import jobs', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [{ id: 'imp1', type: 'contacts' }], pagination: { total: 1 } } });
      const result = await importsApi.list();
      expect(result.data.data).toHaveLength(1);
    });
  });

  describe('upload', () => {
    it('should call POST /imports/upload with FormData', async () => {
      const file = new File(['content'], 'contacts.csv', { type: 'text/csv' });
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'imp1', status: 'pending' } });
      await importsApi.upload({ file, type: 'contacts' });
      expect(client.post).toHaveBeenCalledWith('/imports/upload', expect.any(FormData));
    });

    it('should include importType in FormData', async () => {
      const file = new File(['data'], 'leads.csv');
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'imp2' } });
      await importsApi.upload({ file, type: 'leads' });
      const callArgs = vi.mocked(client.post).mock.calls[0];
      expect(callArgs[0]).toBe('/imports/upload');
    });

    it('should return import job', async () => {
      const file = new File(['data'], 'test.csv');
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'imp3', status: 'pending', totalRecords: 100 } });
      const result = await importsApi.upload({ file, type: 'contacts' });
      expect(result.data.id).toBe('imp3');
    });
  });

  describe('execute', () => {
    it('should call POST /imports/:id/execute with mapping', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'imp1', status: 'processing' } });
      await importsApi.execute('imp1', { mapping: { name: 'Name', email: 'Email' } });
      expect(client.post).toHaveBeenCalledWith('/imports/imp1/execute', { columnMapping: { name: 'Name', email: 'Email' }, duplicateStrategy: 'create' });
    });

    it('should pass duplicateStrategy', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'imp1' } });
      await importsApi.execute('imp1', { mapping: { name: 'Name' }, duplicateStrategy: 'skip' });
      expect(client.post).toHaveBeenCalledWith('/imports/imp1/execute', { columnMapping: { name: 'Name' }, duplicateStrategy: 'skip' });
    });

    it('should handle legacy skipDuplicates flag', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'imp1' } });
      await importsApi.execute('imp1', { mapping: { name: 'Name' }, skipDuplicates: true });
      expect(client.post).toHaveBeenCalledWith('/imports/imp1/execute', { columnMapping: { name: 'Name' }, duplicateStrategy: 'skip' });
    });

    it('should return job status', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'imp1', status: 'processing' } });
      const result = await importsApi.execute('imp1', { mapping: {} });
      expect(result.data.status).toBe('processing');
    });
  });

  describe('getProgress', () => {
    it('should call GET /imports/:id/progress', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'imp1', processedRecords: 50, totalRecords: 100 } });
      const result = await importsApi.getProgress('imp1');
      expect(client.get).toHaveBeenCalledWith('/imports/imp1/progress');
      expect(result.data.processedRecords).toBe(50);
    });

    it('should use correct id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });
      await importsApi.getProgress('imp-xyz');
      expect(client.get).toHaveBeenCalledWith('/imports/imp-xyz/progress');
    });

    it('should return progress data', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'imp1', totalRecords: 200, processedRecords: 150, failedRecords: 3 } });
      const result = await importsApi.getProgress('imp1');
      expect(result.data.failedRecords).toBe(3);
    });
  });

  describe('getErrors', () => {
    it('should call GET /imports/:id/errors', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await importsApi.getErrors('imp1');
      expect(client.get).toHaveBeenCalledWith('/imports/imp1/errors', { params: undefined });
    });

    it('should pass pagination', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await importsApi.getErrors('imp1', { page: 1, limit: 50 });
      expect(client.get).toHaveBeenCalledWith('/imports/imp1/errors', { params: { page: 1, limit: 50 } });
    });

    it('should return error details', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [{ row: 5, column: 'email', error: 'Invalid format' }], pagination: {} } });
      const result = await importsApi.getErrors('imp1');
      expect(result.data.data[0].row).toBe(5);
    });
  });

  describe('getTemplate', () => {
    it('should call GET /imports/templates/:type with blob responseType', async () => {
      vi.mocked(client.get).mockResolvedValue(new Blob());
      await importsApi.getTemplate('contacts');
      expect(client.get).toHaveBeenCalledWith('/imports/templates/contacts', { responseType: 'blob' });
    });

    it('should return blob', async () => {
      vi.mocked(client.get).mockResolvedValue(new Blob(['template']));
      const result = await importsApi.getTemplate('leads');
      expect(result).toBeInstanceOf(Blob);
    });

    it('should use correct type in URL', async () => {
      vi.mocked(client.get).mockResolvedValue(new Blob());
      await importsApi.getTemplate('leads');
      expect(client.get).toHaveBeenCalledWith('/imports/templates/leads', { responseType: 'blob' });
    });
  });

  describe('downloadErrors', () => {
    it('should call GET /imports/:id/errors/download with blob responseType', async () => {
      vi.mocked(client.get).mockResolvedValue(new Blob());
      await importsApi.downloadErrors('imp1');
      expect(client.get).toHaveBeenCalledWith('/imports/imp1/errors/download', { responseType: 'blob' });
    });

    it('should return blob', async () => {
      vi.mocked(client.get).mockResolvedValue(new Blob(['errors-csv']));
      const result = await importsApi.downloadErrors('imp1');
      expect(result).toBeInstanceOf(Blob);
    });
  });

  describe('cancel', () => {
    it('should call POST /imports/:id/cancel', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'imp1', status: 'failed' } });
      await importsApi.cancel('imp1');
      expect(client.post).toHaveBeenCalledWith('/imports/imp1/cancel', {});
    });

    it('should return cancelled job', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'imp1', status: 'failed' } });
      const result = await importsApi.cancel('imp1');
      expect(result.data.status).toBe('failed');
    });

    it('should use correct id', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: {} });
      await importsApi.cancel('imp-xyz');
      expect(client.post).toHaveBeenCalledWith('/imports/imp-xyz/cancel', {});
    });
  });
});
