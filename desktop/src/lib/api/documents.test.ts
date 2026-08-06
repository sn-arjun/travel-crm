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
import { documentsApi } from './documents';

describe('documentsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should call GET /documents', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await documentsApi.list();
      expect(client.get).toHaveBeenCalledWith('/documents', { params: undefined });
    });

    it('should pass filter params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await documentsApi.list({ category: 'invoice', leadId: 'l1', search: 'receipt' });
      expect(client.get).toHaveBeenCalledWith('/documents', { params: { category: 'invoice', leadId: 'l1', search: 'receipt' } });
    });

    it('should pass pagination and sort', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await documentsApi.list({ page: 2, limit: 20, sortBy: 'uploadedAt', sortOrder: 'desc' });
      expect(client.get).toHaveBeenCalledWith('/documents', { params: { page: 2, limit: 20, sortBy: 'uploadedAt', sortOrder: 'desc' } });
    });

    it('should pass itineraryId filter', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await documentsApi.list({ itineraryId: 'itn1' });
      expect(client.get).toHaveBeenCalledWith('/documents', { params: { itineraryId: 'itn1' } });
    });
  });

  describe('getById', () => {
    it('should call GET /documents/:id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'd1', name: 'Receipt.pdf' } });
      const result = await documentsApi.getById('d1');
      expect(client.get).toHaveBeenCalledWith('/documents/d1');
      expect(result.data.name).toBe('Receipt.pdf');
    });

    it('should use correct id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });
      await documentsApi.getById('doc-xyz');
      expect(client.get).toHaveBeenCalledWith('/documents/doc-xyz');
    });

    it('should return document data', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'd1', name: 'test.pdf', mimeType: 'application/pdf', size: 1024 } });
      const result = await documentsApi.getById('d1');
      expect(result.data).toHaveProperty('mimeType');
      expect(result.data).toHaveProperty('size');
    });
  });

  describe('upload', () => {
    it('should call POST /documents/upload with FormData', async () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'd1' } });
      await documentsApi.upload({ file });
      expect(client.post).toHaveBeenCalledWith('/documents/upload', expect.any(FormData));
    });

    it('should include name and description in FormData', async () => {
      const file = new File(['content'], 'doc.pdf');
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'd2' } });
      await documentsApi.upload({ file, name: 'My Doc', description: 'Important document' });
      expect(client.post).toHaveBeenCalledWith('/documents/upload', expect.any(FormData));
    });

    it('should return uploaded document', async () => {
      const file = new File(['data'], 'file.pdf');
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'd3', name: 'file.pdf' } });
      const result = await documentsApi.upload({ file });
      expect(result.data.id).toBe('d3');
    });

    it('should include category and tags', async () => {
      const file = new File(['data'], 'tagged.pdf');
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'd4' } });
      await documentsApi.upload({ file, category: 'contract', tags: ['signed', 'important'] });
      expect(client.post).toHaveBeenCalledWith('/documents/upload', expect.any(FormData));
    });
  });

  describe('update', () => {
    it('should call PUT /documents/:id', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'd1' } });
      await documentsApi.update('d1', { name: 'Renamed.pdf' });
      expect(client.put).toHaveBeenCalledWith('/documents/d1', { name: 'Renamed.pdf' });
    });

    it('should pass partial fields', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: {} });
      await documentsApi.update('d1', { category: 'receipt', tags: ['updated'] });
      expect(client.put).toHaveBeenCalledWith('/documents/d1', { category: 'receipt', tags: ['updated'] });
    });

    it('should return updated document', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'd1', name: 'Updated.pdf' } });
      const result = await documentsApi.update('d1', { name: 'Updated.pdf' });
      expect(result.data.name).toBe('Updated.pdf');
    });
  });

  describe('delete', () => {
    it('should call DELETE /documents/:id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      await documentsApi.delete('d1');
      expect(client.delete).toHaveBeenCalledWith('/documents/d1');
    });

    it('should return void', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      const result = await documentsApi.delete('d1');
      expect(result).toEqual({ data: undefined });
    });
  });

  describe('download', () => {
    it('should call GET /documents/:id/download with blob responseType', async () => {
      vi.mocked(client.get).mockResolvedValue(new Blob(['file']));
      await documentsApi.download('d1');
      expect(client.get).toHaveBeenCalledWith('/documents/d1/download', { responseType: 'blob' });
    });

    it('should return blob', async () => {
      const blob = new Blob(['pdf-content']);
      vi.mocked(client.get).mockResolvedValue(blob);
      const result = await documentsApi.download('d1');
      expect(result).toBeInstanceOf(Blob);
    });

    it('should use correct id', async () => {
      vi.mocked(client.get).mockResolvedValue(new Blob());
      await documentsApi.download('doc-abc');
      expect(client.get).toHaveBeenCalledWith('/documents/doc-abc/download', { responseType: 'blob' });
    });
  });
});
