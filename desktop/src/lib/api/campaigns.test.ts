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
import { campaignsApi } from './campaigns';

describe('campaignsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should call GET /campaigns with no params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await campaignsApi.list();
      expect(client.get).toHaveBeenCalledWith('/campaigns', { params: undefined });
    });

    it('should pass filter params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await campaignsApi.list({ type: 'email', status: 'draft' });
      expect(client.get).toHaveBeenCalledWith('/campaigns', { params: { type: 'email', status: 'draft' } });
    });

    it('should pass pagination and sort', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await campaignsApi.list({ page: 2, limit: 15, sortBy: 'name', sortOrder: 'asc' });
      expect(client.get).toHaveBeenCalledWith('/campaigns', { params: { page: 2, limit: 15, sortBy: 'name', sortOrder: 'asc' } });
    });

    it('should pass search param', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await campaignsApi.list({ search: 'summer' });
      expect(client.get).toHaveBeenCalledWith('/campaigns', { params: { search: 'summer' } });
    });
  });

  describe('getById', () => {
    it('should call GET /campaigns/:id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'camp1', name: 'Summer Sale' } });
      const result = await campaignsApi.getById('camp1');
      expect(client.get).toHaveBeenCalledWith('/campaigns/camp1');
      expect(result.data.name).toBe('Summer Sale');
    });

    it('should use correct id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });
      await campaignsApi.getById('camp-xyz');
      expect(client.get).toHaveBeenCalledWith('/campaigns/camp-xyz');
    });

    it('should return campaign data', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'c1', name: 'Test', subject: 'Subj' } });
      const result = await campaignsApi.getById('c1');
      expect(result.data).toHaveProperty('name');
      expect(result.data).toHaveProperty('subject');
    });
  });

  describe('create', () => {
    it('should call POST /campaigns', async () => {
      const data = { name: 'New Campaign', subject: 'Hello!' };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'camp1' } });
      await campaignsApi.create(data);
      expect(client.post).toHaveBeenCalledWith('/campaigns', data);
    });

    it('should pass all optional fields', async () => {
      const data = { name: 'Full Campaign', subject: 'Subject', body: 'Body content', templateId: 'tmpl1', segmentFilters: { status: 'active' }, type: 'email' as const, status: 'draft' as const };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'camp2' } });
      await campaignsApi.create(data);
      expect(client.post).toHaveBeenCalledWith('/campaigns', data);
    });

    it('should return created campaign', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'camp3', name: 'Created' } });
      const result = await campaignsApi.create({ name: 'Created', subject: 'Test' });
      expect(result.data.id).toBe('camp3');
    });
  });

  describe('update', () => {
    it('should call PUT /campaigns/:id', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'camp1' } });
      await campaignsApi.update('camp1', { name: 'Updated' });
      expect(client.put).toHaveBeenCalledWith('/campaigns/camp1', { name: 'Updated' });
    });

    it('should pass partial fields', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: {} });
      await campaignsApi.update('camp1', { subject: 'New Subject', body: 'New Body' });
      expect(client.put).toHaveBeenCalledWith('/campaigns/camp1', { subject: 'New Subject', body: 'New Body' });
    });

    it('should return updated campaign', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'camp1', name: 'Updated' } });
      const result = await campaignsApi.update('camp1', { name: 'Updated' });
      expect(result.data.name).toBe('Updated');
    });
  });

  describe('delete', () => {
    it('should call DELETE /campaigns/:id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      await campaignsApi.delete('camp1');
      expect(client.delete).toHaveBeenCalledWith('/campaigns/camp1');
    });

    it('should return void', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      const result = await campaignsApi.delete('camp1');
      expect(result).toEqual({ data: undefined });
    });

    it('should use correct id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      await campaignsApi.delete('camp-xyz');
      expect(client.delete).toHaveBeenCalledWith('/campaigns/camp-xyz');
    });
  });

  describe('send', () => {
    it('should call POST /campaigns/:id/send', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { sent: 100 } });
      await campaignsApi.send('camp1');
      expect(client.post).toHaveBeenCalledWith('/campaigns/camp1/send', undefined);
    });

    it('should pass send options', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { sent: 50 } });
      await campaignsApi.send('camp1', { sendImmediately: true, targets: ['c1', 'c2'] });
      expect(client.post).toHaveBeenCalledWith('/campaigns/camp1/send', { sendImmediately: true, targets: ['c1', 'c2'] });
    });

    it('should return sent count', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { sent: 200 } });
      const result = await campaignsApi.send('camp1');
      expect(result.data.sent).toBe(200);
    });
  });

  describe('schedule', () => {
    it('should call POST /campaigns/:id/schedule', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'camp1', status: 'scheduled' } });
      await campaignsApi.schedule('camp1', { scheduledAt: '2026-04-01T10:00:00Z' });
      expect(client.post).toHaveBeenCalledWith('/campaigns/camp1/schedule', { scheduledAt: '2026-04-01T10:00:00Z' });
    });

    it('should pass timezone and recurring pattern', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: {} });
      await campaignsApi.schedule('camp1', { scheduledAt: '2026-04-01T10:00:00Z', timezone: 'Asia/Kolkata', recurringPattern: 'weekly' });
      expect(client.post).toHaveBeenCalledWith('/campaigns/camp1/schedule', { scheduledAt: '2026-04-01T10:00:00Z', timezone: 'Asia/Kolkata', recurringPattern: 'weekly' });
    });

    it('should return scheduled campaign', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'camp1', status: 'scheduled' } });
      const result = await campaignsApi.schedule('camp1', { scheduledAt: '2026-04-01T10:00:00Z' });
      expect(result.data.status).toBe('scheduled');
    });
  });

  describe('cancel', () => {
    it('should call POST /campaigns/:id/cancel', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'camp1', status: 'cancelled' } });
      await campaignsApi.cancel('camp1');
      expect(client.post).toHaveBeenCalledWith('/campaigns/camp1/cancel', undefined);
    });

    it('should pass reason', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: {} });
      await campaignsApi.cancel('camp1', { reason: 'Not needed anymore' });
      expect(client.post).toHaveBeenCalledWith('/campaigns/camp1/cancel', { reason: 'Not needed anymore' });
    });

    it('should return cancelled campaign', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'camp1', status: 'cancelled' } });
      const result = await campaignsApi.cancel('camp1');
      expect(result.data.status).toBe('cancelled');
    });
  });

  describe('getRecipients', () => {
    it('should call GET /campaigns/:id/recipients', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await campaignsApi.getRecipients('camp1');
      expect(client.get).toHaveBeenCalledWith('/campaigns/camp1/recipients', { params: undefined });
    });

    it('should pass pagination', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await campaignsApi.getRecipients('camp1', { page: 1, limit: 50 });
      expect(client.get).toHaveBeenCalledWith('/campaigns/camp1/recipients', { params: { page: 1, limit: 50 } });
    });

    it('should return recipients list', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [{ id: 'r1', name: 'John', email: 'john@test.com', status: 'sent' }], pagination: {} } });
      const result = await campaignsApi.getRecipients('camp1');
      expect(result.data.data).toHaveLength(1);
    });
  });
});
