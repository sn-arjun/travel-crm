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
import { eventsApi } from './events';

describe('eventsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should call GET /events', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await eventsApi.list();
      expect(client.get).toHaveBeenCalledWith('/events', { params: undefined });
    });

    it('should pass filter params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await eventsApi.list({ event_type: 'meeting', assigned_to: 'u1' });
      expect(client.get).toHaveBeenCalledWith('/events', { params: { event_type: 'meeting', assigned_to: 'u1' } });
    });

    it('should pass date range', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await eventsApi.list({ start_date: '2026-03-01', end_date: '2026-03-31' });
      expect(client.get).toHaveBeenCalledWith('/events', { params: { start_date: '2026-03-01', end_date: '2026-03-31' } });
    });

    it('should pass pagination and sort', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await eventsApi.list({ page: 2, limit: 10, sortBy: 'start_at', sortOrder: 'asc' });
      expect(client.get).toHaveBeenCalledWith('/events', { params: { page: 2, limit: 10, sortBy: 'start_at', sortOrder: 'asc' } });
    });

    it('should pass search and view', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await eventsApi.list({ search: 'meeting', view: 'month' });
      expect(client.get).toHaveBeenCalledWith('/events', { params: { search: 'meeting', view: 'month' } });
    });

    it('should return events list', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [{ id: 'e1', title: 'Team Meeting' }], pagination: { total: 1 } } });
      const result = await eventsApi.list();
      expect(result.data.data).toHaveLength(1);
    });
  });

  describe('getById', () => {
    it('should call GET /events/:id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'e1', title: 'Meeting' } });
      const result = await eventsApi.getById('e1');
      expect(client.get).toHaveBeenCalledWith('/events/e1');
      expect(result.data.title).toBe('Meeting');
    });

    it('should use correct id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });
      await eventsApi.getById('ev-xyz');
      expect(client.get).toHaveBeenCalledWith('/events/ev-xyz');
    });

    it('should return event data', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'e1', title: 'Call', event_type: 'call', start_at: '2026-03-15T10:00:00Z' } });
      const result = await eventsApi.getById('e1');
      expect(result.data).toHaveProperty('event_type');
      expect(result.data).toHaveProperty('start_at');
    });
  });

  describe('create', () => {
    it('should call POST /events with mapped fields', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'e1' } });
      await eventsApi.create({ title: 'New Meeting', event_type: 'meeting', start_at: '2026-03-15T10:00:00Z' });
      expect(client.post).toHaveBeenCalledWith('/events', expect.objectContaining({
        title: 'New Meeting',
        event_type: 'meeting',
        start_at: '2026-03-15T10:00:00Z',
      }));
    });

    it('should map startTime to start_at and endTime to end_at', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'e2' } });
      await eventsApi.create({ title: 'Event', startTime: '2026-04-01T09:00:00Z', endTime: '2026-04-01T10:00:00Z' });
      expect(client.post).toHaveBeenCalledWith('/events', expect.objectContaining({
        start_at: '2026-04-01T09:00:00Z',
        end_at: '2026-04-01T10:00:00Z',
      }));
    });

    it('should map type to event_type with fallback', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'e3' } });
      await eventsApi.create({ title: 'Call', type: 'call' });
      expect(client.post).toHaveBeenCalledWith('/events', expect.objectContaining({
        event_type: 'call',
      }));
    });

    it('should default event_type to meeting when neither event_type nor type provided', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'e4' } });
      await eventsApi.create({ title: 'Quick Sync' });
      expect(client.post).toHaveBeenCalledWith('/events', expect.objectContaining({
        event_type: 'meeting',
      }));
    });

    it('should pass all optional fields', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'e5' } });
      await eventsApi.create({
        title: 'Full Event',
        description: 'A detailed event',
        event_type: 'reminder',
        start_at: '2026-03-20T08:00:00Z',
        end_at: '2026-03-20T09:00:00Z',
        all_day: false,
        location: 'Office',
        color: '#ff0000',
        recurrence_rule: 'FREQ=WEEKLY',
        related_lead_id: 'l1',
        assigned_to: 'u1',
        timezone: 'Asia/Kolkata',
      });
      expect(client.post).toHaveBeenCalledWith('/events', {
        title: 'Full Event',
        description: 'A detailed event',
        event_type: 'reminder',
        start_at: '2026-03-20T08:00:00Z',
        end_at: '2026-03-20T09:00:00Z',
        all_day: false,
        location: 'Office',
        color: '#ff0000',
        recurrence_rule: 'FREQ=WEEKLY',
        related_lead_id: 'l1',
        assigned_to: 'u1',
        timezone: 'Asia/Kolkata',
      });
    });

    it('should return created event', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'e1', title: 'Created' } });
      const result = await eventsApi.create({ title: 'Created' });
      expect(result.data.id).toBe('e1');
    });
  });

  describe('update', () => {
    it('should call PUT /events/:id', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'e1' } });
      await eventsApi.update('e1', { title: 'Updated Meeting' });
      expect(client.put).toHaveBeenCalledWith('/events/e1', { title: 'Updated Meeting' });
    });

    it('should pass partial fields', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: {} });
      await eventsApi.update('e1', { location: 'New Office', color: '#00ff00' });
      expect(client.put).toHaveBeenCalledWith('/events/e1', { location: 'New Office', color: '#00ff00' });
    });

    it('should pass update_scope', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: {} });
      await eventsApi.update('e1', { title: 'Renamed', update_scope: 'all' });
      expect(client.put).toHaveBeenCalledWith('/events/e1', { title: 'Renamed', update_scope: 'all' });
    });

    it('should return updated event', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'e1', title: 'Updated' } });
      const result = await eventsApi.update('e1', { title: 'Updated' });
      expect(result.data.title).toBe('Updated');
    });
  });

  describe('delete', () => {
    it('should call DELETE /events/:id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      await eventsApi.delete('e1');
      expect(client.delete).toHaveBeenCalledWith('/events/e1');
    });

    it('should use correct id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      await eventsApi.delete('ev-abc');
      expect(client.delete).toHaveBeenCalledWith('/events/ev-abc');
    });

    it('should return void', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      const result = await eventsApi.delete('e1');
      expect(result).toEqual({ data: undefined });
    });
  });

  describe('reschedule', () => {
    it('should call PATCH /events/:id/reschedule', async () => {
      vi.mocked(client.patch).mockResolvedValue({ data: { id: 'e1', start_at: '2026-04-01T10:00:00Z' } });
      await eventsApi.reschedule('e1', { start_at: '2026-04-01T10:00:00Z' });
      expect(client.patch).toHaveBeenCalledWith('/events/e1/reschedule', { start_at: '2026-04-01T10:00:00Z' });
    });

    it('should pass end_at', async () => {
      vi.mocked(client.patch).mockResolvedValue({ data: {} });
      await eventsApi.reschedule('e1', { start_at: '2026-04-01T10:00:00Z', end_at: '2026-04-01T12:00:00Z' });
      expect(client.patch).toHaveBeenCalledWith('/events/e1/reschedule', { start_at: '2026-04-01T10:00:00Z', end_at: '2026-04-01T12:00:00Z' });
    });

    it('should return rescheduled event', async () => {
      vi.mocked(client.patch).mockResolvedValue({ data: { id: 'e1', start_at: '2026-05-01T09:00:00Z' } });
      const result = await eventsApi.reschedule('e1', { start_at: '2026-05-01T09:00:00Z' });
      expect(result.data.start_at).toBe('2026-05-01T09:00:00Z');
    });
  });
});
