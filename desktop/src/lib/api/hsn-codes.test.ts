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
import { hsnCodesApi } from './hsn-codes';

describe('hsnCodesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should call GET /hsn-codes', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [] });
      await hsnCodesApi.list();
      expect(client.get).toHaveBeenCalledWith('/hsn-codes', { params: undefined });
    });

    it('should pass search param', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [] });
      await hsnCodesApi.list({ search: '9985' });
      expect(client.get).toHaveBeenCalledWith('/hsn-codes', { params: { search: '9985' } });
    });

    it('should return HSN codes list', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [{ code: '9985', description: 'Travel and tourism services' }, { code: '9986', description: 'Transport services' }] });
      const result = await hsnCodesApi.list();
      expect(result.data).toHaveLength(2);
    });

    it('should return empty array when no matches', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [] });
      const result = await hsnCodesApi.list({ search: 'nonexistent' });
      expect(result.data).toHaveLength(0);
    });
  });

  describe('create', () => {
    it('should call POST /hsn-codes', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { code: '9985', description: 'Travel services' } });
      await hsnCodesApi.create({ code: '9985', description: 'Travel services' });
      expect(client.post).toHaveBeenCalledWith('/hsn-codes', { code: '9985', description: 'Travel services' });
    });

    it('should pass category', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { code: '9986', description: 'Transport', category: 'services' } });
      await hsnCodesApi.create({ code: '9986', description: 'Transport', category: 'services' });
      expect(client.post).toHaveBeenCalledWith('/hsn-codes', { code: '9986', description: 'Transport', category: 'services' });
    });

    it('should return created HSN code', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { code: '9987', description: 'Accommodation services', isCustom: true } });
      const result = await hsnCodesApi.create({ code: '9987', description: 'Accommodation services' });
      expect(result.data.code).toBe('9987');
    });

    it('should create without category', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { code: '9988', description: 'Other services' } });
      await hsnCodesApi.create({ code: '9988', description: 'Other services' });
      expect(client.post).toHaveBeenCalledWith('/hsn-codes', { code: '9988', description: 'Other services' });
    });
  });
});
