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
import { notificationsApi } from './notifications';

describe('notificationsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should call GET /notifications with no params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await notificationsApi.list();
      expect(client.get).toHaveBeenCalledWith('/notifications', { params: undefined });
    });

    it('should pass filter params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await notificationsApi.list({ unreadOnly: true, type: 'task' });
      expect(client.get).toHaveBeenCalledWith('/notifications', { params: { unreadOnly: true, type: 'task' } });
    });

    it('should pass pagination and sort', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await notificationsApi.list({ page: 2, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' });
      expect(client.get).toHaveBeenCalledWith('/notifications', { params: { page: 2, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' } });
    });

    it('should return paginated notifications', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [{ id: 'n1', title: 'New task' }], pagination: { total: 1 } } });
      const result = await notificationsApi.list();
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getUnreadCount', () => {
    it('should call GET /notifications/unread-count', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { total: 5 } });
      const result = await notificationsApi.getUnreadCount();
      expect(client.get).toHaveBeenCalledWith('/notifications/unread-count');
      expect(result.data.total).toBe(5);
    });

    it('should return count with byType breakdown', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { total: 10, byType: { task: 3, lead: 7 } } });
      const result = await notificationsApi.getUnreadCount();
      expect(result.data.byType).toBeDefined();
    });

    it('should not require parameters', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { total: 0 } });
      await notificationsApi.getUnreadCount();
      expect(client.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('markAllAsRead', () => {
    it('should call POST /notifications/read-all', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { updated: 5 } });
      const result = await notificationsApi.markAllAsRead();
      expect(client.post).toHaveBeenCalledWith('/notifications/read-all');
      expect(result.data.updated).toBe(5);
    });

    it('should return updated count', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { updated: 0 } });
      const result = await notificationsApi.markAllAsRead();
      expect(result.data.updated).toBe(0);
    });

    it('should not require parameters', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { updated: 3 } });
      await notificationsApi.markAllAsRead();
      expect(client.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('markAsRead', () => {
    it('should call POST /notifications/:id/read', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'n1', read: true } });
      await notificationsApi.markAsRead('n1');
      expect(client.post).toHaveBeenCalledWith('/notifications/n1/read');
    });

    it('should use correct id', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: {} });
      await notificationsApi.markAsRead('notif-xyz');
      expect(client.post).toHaveBeenCalledWith('/notifications/notif-xyz/read');
    });

    it('should return updated notification', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'n1', read: true, readAt: '2026-03-09' } });
      const result = await notificationsApi.markAsRead('n1');
      expect(result.data.read).toBe(true);
    });
  });

  describe('delete', () => {
    it('should call DELETE /notifications/:id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      await notificationsApi.delete('n1');
      expect(client.delete).toHaveBeenCalledWith('/notifications/n1');
    });

    it('should use correct id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      await notificationsApi.delete('notif-abc');
      expect(client.delete).toHaveBeenCalledWith('/notifications/notif-abc');
    });

    it('should return void', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      const result = await notificationsApi.delete('n1');
      expect(result).toEqual({ data: undefined });
    });
  });

  describe('getBadgeCounts', () => {
    it('should call GET /notifications/badge-counts', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { notifications: 3, tasks: 5, followUps: 2, messages: 1 } });
      const result = await notificationsApi.getBadgeCounts();
      expect(client.get).toHaveBeenCalledWith('/notifications/badge-counts');
      expect(result.data.notifications).toBe(3);
    });

    it('should return all badge count fields', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { notifications: 0, tasks: 0, followUps: 0, messages: 0 } });
      const result = await notificationsApi.getBadgeCounts();
      expect(result.data).toHaveProperty('notifications');
      expect(result.data).toHaveProperty('tasks');
      expect(result.data).toHaveProperty('followUps');
      expect(result.data).toHaveProperty('messages');
    });

    it('should not require parameters', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });
      await notificationsApi.getBadgeCounts();
      expect(client.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('announce', () => {
    it('should call POST /notifications/announce', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { sent: 10 } });
      await notificationsApi.announce({ title: 'Announcement', body: 'Important update' });
      expect(client.post).toHaveBeenCalledWith('/notifications/announce', { title: 'Announcement', body: 'Important update' });
    });

    it('should pass targetRole', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { sent: 5 } });
      await notificationsApi.announce({ title: 'Admin Notice', body: 'For admins only', targetRole: 'admin' });
      expect(client.post).toHaveBeenCalledWith('/notifications/announce', { title: 'Admin Notice', body: 'For admins only', targetRole: 'admin' });
    });

    it('should pass userIds for targeted announcement', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { sent: 2 } });
      await notificationsApi.announce({ title: 'Direct', body: 'For you', userIds: ['u1', 'u2'] });
      expect(client.post).toHaveBeenCalledWith('/notifications/announce', { title: 'Direct', body: 'For you', userIds: ['u1', 'u2'] });
    });

    it('should return sent count', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { sent: 25 } });
      const result = await notificationsApi.announce({ title: 'Test', body: 'Test body' });
      expect(result.data.sent).toBe(25);
    });
  });
});

describe('notificationsApi envelope normalisation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('list flattens { data: { items, total, page, limit, data, pagination } }', async () => {
    vi.mocked(client.get).mockResolvedValue({
      success: true,
      data: {
        items: [{ id: 'n1' }],
        total: 12,
        page: 2,
        limit: 5,
        data: [{ id: 'n1' }],
        pagination: { page: 2, limit: 5, total: 12, totalPages: 3 },
      },
    });
    const result = await notificationsApi.list({ page: 2, limit: 5 });
    expect(result.data).toHaveLength(1);
    expect(result.pagination).toEqual({ page: 2, limit: 5, total: 12, totalPages: 3 });
  });

  it('maps reference_type, reference_id and is_read onto the Notification contract', async () => {
    vi.mocked(client.get).mockResolvedValue({
      data: {
        data: [
          { id: 'n1', title: 'Lead', message: 'New lead', reference_type: 'lead', reference_id: 'l1', is_read: 1, created_at: '2026-01-01T00:00:00Z' },
          { id: 'n2', title: 'Task', message: 'Due', referenceType: 'task', referenceId: 't1', read: false, createdAt: '2026-01-02T00:00:00Z' },
          { id: 'n3', title: 'Old', body: 'Legacy body', is_read: 0 },
        ],
        pagination: { page: 1, limit: 20, total: 3, totalPages: 1 },
      },
    });
    const result = await notificationsApi.list();
    expect(result.data[0]).toMatchObject({ referenceType: 'lead', referenceId: 'l1', read: true, createdAt: '2026-01-01T00:00:00Z' });
    expect(result.data[0]).not.toHaveProperty('is_read');
    expect(result.data[0]).not.toHaveProperty('isRead');
    expect(result.data[1]).toMatchObject({ referenceType: 'task', referenceId: 't1', read: false });
    expect(result.data[2]).toMatchObject({ message: 'Legacy body', read: false });
  });
});
