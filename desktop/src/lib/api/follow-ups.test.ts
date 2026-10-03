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
import { followUpsApi } from './follow-ups';

describe('followUpsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should call GET /follow-ups', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await followUpsApi.list();
      expect(client.get).toHaveBeenCalledWith('/follow-ups', { params: undefined });
    });

    it('should pass filter params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await followUpsApi.list({ status: 'pending', type: 'call', priority: 'high' });
      expect(client.get).toHaveBeenCalledWith('/follow-ups', { params: { status: 'pending', type: 'call', priority: 'high' } });
    });

    it('should pass pagination and sort', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await followUpsApi.list({ page: 2, limit: 10, sortBy: 'dueDate', sortOrder: 'asc' });
      expect(client.get).toHaveBeenCalledWith('/follow-ups', { params: { page: 2, limit: 10, sortBy: 'dueDate', sortOrder: 'asc' } });
    });

    it('should pass assignedTo and leadId', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await followUpsApi.list({ assignedTo: 'u1', leadId: 'l1' });
      expect(client.get).toHaveBeenCalledWith('/follow-ups', { params: { assignedTo: 'u1', leadId: 'l1' } });
    });

    it('should return follow-ups list', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [{ id: 'f1', type: 'call' }], pagination: { total: 1 } } });
      const result = await followUpsApi.list();
      expect(result.data.data).toHaveLength(1);
    });
  });

  describe('getById', () => {
    it('should call GET /follow-ups/:id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'f1', type: 'call' } });
      const result = await followUpsApi.getById('f1');
      expect(client.get).toHaveBeenCalledWith('/follow-ups/f1');
      expect(result.data.type).toBe('call');
    });

    it('should use correct id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });
      await followUpsApi.getById('fu-xyz');
      expect(client.get).toHaveBeenCalledWith('/follow-ups/fu-xyz');
    });

    it('should return follow-up data', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'f1', leadId: 'l1', scheduledAt: '2026-03-15' } });
      const result = await followUpsApi.getById('f1');
      expect(result.data).toHaveProperty('leadId');
    });
  });

  describe('create', () => {
    it('should call POST /follow-ups', async () => {
      const data = { leadId: 'l1', scheduledAt: '2026-03-15T10:00:00Z', type: 'call' as const };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'f1' } });
      await followUpsApi.create(data);
      expect(client.post).toHaveBeenCalledWith('/follow-ups', data);
    });

    it('should pass notes', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'f2' } });
      await followUpsApi.create({ leadId: 'l1', scheduledAt: '2026-03-20T14:00:00Z', type: 'email', notes: 'Send proposal' });
      expect(client.post).toHaveBeenCalledWith('/follow-ups', expect.objectContaining({ notes: 'Send proposal' }));
    });

    it('should return created follow-up', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'f3', type: 'whatsapp' } });
      const result = await followUpsApi.create({ leadId: 'l1', scheduledAt: '2026-04-01', type: 'whatsapp' });
      expect(result.data.id).toBe('f3');
    });
  });

  describe('update', () => {
    it('should call PUT /follow-ups/:id', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'f1' } });
      await followUpsApi.update('f1', { title: 'Updated Follow-up' });
      expect(client.put).toHaveBeenCalledWith('/follow-ups/f1', { title: 'Updated Follow-up' });
    });

    it('should pass partial fields', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: {} });
      await followUpsApi.update('f1', { priority: 'high', dueDate: '2026-04-01' });
      expect(client.put).toHaveBeenCalledWith('/follow-ups/f1', { priority: 'high', dueDate: '2026-04-01' });
    });

    it('should return updated follow-up', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'f1', title: 'Updated' } });
      const result = await followUpsApi.update('f1', { title: 'Updated' });
      expect(result.data).toMatchObject({ title: 'Updated' });
    });
  });

  describe('delete', () => {
    it('should call DELETE /follow-ups/:id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      await followUpsApi.delete('f1');
      expect(client.delete).toHaveBeenCalledWith('/follow-ups/f1');
    });

    it('should return void', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      const result = await followUpsApi.delete('f1');
      expect(result).toEqual({ data: undefined });
    });

    it('should use correct id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      await followUpsApi.delete('fu-abc');
      expect(client.delete).toHaveBeenCalledWith('/follow-ups/fu-abc');
    });
  });

  describe('complete', () => {
    it('should call PUT /follow-ups/:id/complete', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'f1', status: 'completed' } });
      await followUpsApi.complete('f1');
      expect(client.put).toHaveBeenCalledWith('/follow-ups/f1/complete', {});
    });

    it('should pass completion data', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'f1' } });
      await followUpsApi.complete('f1', { completedAt: '2026-03-10', notes: 'Called and confirmed', outcome: 'positive' });
      expect(client.put).toHaveBeenCalledWith('/follow-ups/f1/complete', { completedAt: '2026-03-10', notes: 'Called and confirmed', outcome: 'positive' });
    });

    it('should return completed follow-up', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'f1', status: 'completed' } });
      const result = await followUpsApi.complete('f1');
      expect(result.data).toMatchObject({ status: 'completed' });
    });
  });
});
