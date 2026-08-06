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
import { bookmarksApi } from './bookmarks';

describe('bookmarksApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should call GET /bookmarks', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await bookmarksApi.list();
      expect(client.get).toHaveBeenCalledWith('/bookmarks', { params: undefined });
    });

    it('should pass entityType filter', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await bookmarksApi.list({ entityType: 'lead' });
      expect(client.get).toHaveBeenCalledWith('/bookmarks', { params: { entityType: 'lead' } });
    });

    it('should pass pagination and sort', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await bookmarksApi.list({ page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' });
      expect(client.get).toHaveBeenCalledWith('/bookmarks', { params: { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' } });
    });

    it('should return bookmarks list', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [{ id: 'b1', entityType: 'contact', entityId: 'c1', entityName: 'John' }], pagination: {} } });
      const result = await bookmarksApi.list();
      expect(result.data.data).toHaveLength(1);
    });
  });

  describe('create', () => {
    it('should call POST /bookmarks', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'b1', entityType: 'lead', entityId: 'l1' } });
      await bookmarksApi.create({ entityType: 'lead', entityId: 'l1' });
      expect(client.post).toHaveBeenCalledWith('/bookmarks', { entityType: 'lead', entityId: 'l1' });
    });

    it('should accept contact bookmark', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'b2' } });
      await bookmarksApi.create({ entityType: 'contact', entityId: 'c1' });
      expect(client.post).toHaveBeenCalledWith('/bookmarks', { entityType: 'contact', entityId: 'c1' });
    });

    it('should return created bookmark', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'b3', entityType: 'itinerary', entityId: 'itn1', entityName: 'Bali Trip' } });
      const result = await bookmarksApi.create({ entityType: 'itinerary', entityId: 'itn1' });
      expect(result.data.id).toBe('b3');
    });

    it('should accept task bookmark', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'b4' } });
      await bookmarksApi.create({ entityType: 'task', entityId: 't1' });
      expect(client.post).toHaveBeenCalledWith('/bookmarks', { entityType: 'task', entityId: 't1' });
    });
  });

  describe('check', () => {
    it('should call POST /bookmarks/check', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { bookmarked: true } });
      const result = await bookmarksApi.check({ entityType: 'lead', entityId: 'l1' });
      expect(client.post).toHaveBeenCalledWith('/bookmarks/check', { entityType: 'lead', entityId: 'l1' });
      expect(result.data.bookmarked).toBe(true);
    });

    it('should return false when not bookmarked', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { bookmarked: false } });
      const result = await bookmarksApi.check({ entityType: 'contact', entityId: 'c99' });
      expect(result.data.bookmarked).toBe(false);
    });

    it('should check invoice bookmark', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { bookmarked: true } });
      await bookmarksApi.check({ entityType: 'invoice', entityId: 'inv1' });
      expect(client.post).toHaveBeenCalledWith('/bookmarks/check', { entityType: 'invoice', entityId: 'inv1' });
    });
  });

  describe('delete', () => {
    it('should call DELETE /bookmarks/:id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      await bookmarksApi.delete('b1');
      expect(client.delete).toHaveBeenCalledWith('/bookmarks/b1');
    });

    it('should use correct id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      await bookmarksApi.delete('bm-xyz');
      expect(client.delete).toHaveBeenCalledWith('/bookmarks/bm-xyz');
    });

    it('should return void', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      const result = await bookmarksApi.delete('b1');
      expect(result).toEqual({ data: undefined });
    });
  });
});
