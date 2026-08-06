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
import { stickyNotesApi } from './sticky-notes';

describe('stickyNotesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should call GET /sticky-notes', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await stickyNotesApi.list();
      expect(client.get).toHaveBeenCalledWith('/sticky-notes', { params: undefined });
    });

    it('should pass pagination params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await stickyNotesApi.list({ page: 1, limit: 20 });
      expect(client.get).toHaveBeenCalledWith('/sticky-notes', { params: { page: 1, limit: 20 } });
    });

    it('should pass sort params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await stickyNotesApi.list({ sortBy: 'createdAt', sortOrder: 'desc' });
      expect(client.get).toHaveBeenCalledWith('/sticky-notes', { params: { sortBy: 'createdAt', sortOrder: 'desc' } });
    });

    it('should return sticky notes list', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [{ id: 'sn1', content: 'Remember to call', color: 'yellow' }], pagination: { total: 1 } } });
      const result = await stickyNotesApi.list();
      expect(result.data.data).toHaveLength(1);
    });
  });

  describe('getById', () => {
    it('should call GET /sticky-notes/:id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'sn1', content: 'Note content' } });
      const result = await stickyNotesApi.getById('sn1');
      expect(client.get).toHaveBeenCalledWith('/sticky-notes/sn1');
      expect(result.data.content).toBe('Note content');
    });

    it('should use correct id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });
      await stickyNotesApi.getById('sn-xyz');
      expect(client.get).toHaveBeenCalledWith('/sticky-notes/sn-xyz');
    });

    it('should return sticky note data', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'sn1', title: 'Important', content: 'Call John', color: 'red', pinned: true } });
      const result = await stickyNotesApi.getById('sn1');
      expect(result.data).toHaveProperty('title');
      expect(result.data).toHaveProperty('color');
      expect(result.data).toHaveProperty('pinned');
    });
  });

  describe('create', () => {
    it('should call POST /sticky-notes', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'sn1' } });
      await stickyNotesApi.create({ content: 'New note' });
      expect(client.post).toHaveBeenCalledWith('/sticky-notes', { content: 'New note' });
    });

    it('should pass title and color', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'sn2' } });
      await stickyNotesApi.create({ content: 'Colored note', title: 'Reminder', color: 'blue' });
      expect(client.post).toHaveBeenCalledWith('/sticky-notes', { content: 'Colored note', title: 'Reminder', color: 'blue' });
    });

    it('should pass position and pinned', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'sn3' } });
      await stickyNotesApi.create({ content: 'Positioned note', position: { x: 100, y: 200 }, pinned: true });
      expect(client.post).toHaveBeenCalledWith('/sticky-notes', { content: 'Positioned note', position: { x: 100, y: 200 }, pinned: true });
    });

    it('should return created sticky note', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'sn4', content: 'Created', color: 'green' } });
      const result = await stickyNotesApi.create({ content: 'Created', color: 'green' });
      expect(result.data.id).toBe('sn4');
      expect(result.data.color).toBe('green');
    });
  });

  describe('update', () => {
    it('should call PUT /sticky-notes/:id', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'sn1' } });
      await stickyNotesApi.update('sn1', { content: 'Updated content' });
      expect(client.put).toHaveBeenCalledWith('/sticky-notes/sn1', { content: 'Updated content' });
    });

    it('should pass partial fields', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: {} });
      await stickyNotesApi.update('sn1', { color: 'red', pinned: false });
      expect(client.put).toHaveBeenCalledWith('/sticky-notes/sn1', { color: 'red', pinned: false });
    });

    it('should pass position update', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: {} });
      await stickyNotesApi.update('sn1', { position: { x: 300, y: 400 } });
      expect(client.put).toHaveBeenCalledWith('/sticky-notes/sn1', { position: { x: 300, y: 400 } });
    });

    it('should return updated sticky note', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'sn1', content: 'Updated', color: 'yellow' } });
      const result = await stickyNotesApi.update('sn1', { content: 'Updated' });
      expect(result.data.content).toBe('Updated');
    });
  });

  describe('delete', () => {
    it('should call DELETE /sticky-notes/:id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      await stickyNotesApi.delete('sn1');
      expect(client.delete).toHaveBeenCalledWith('/sticky-notes/sn1');
    });

    it('should use correct id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      await stickyNotesApi.delete('sn-abc');
      expect(client.delete).toHaveBeenCalledWith('/sticky-notes/sn-abc');
    });

    it('should return void', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      const result = await stickyNotesApi.delete('sn1');
      expect(result).toEqual({ data: undefined });
    });
  });
});
