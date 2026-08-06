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
import { templatesApi } from './templates';

describe('templatesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should call GET /templates with no params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await templatesApi.list();
      expect(client.get).toHaveBeenCalledWith('/templates', { params: undefined });
    });

    it('should pass filter params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await templatesApi.list({ channel: 'email', category: 'marketing', language: 'en' });
      expect(client.get).toHaveBeenCalledWith('/templates', { params: { channel: 'email', category: 'marketing', language: 'en' } });
    });

    it('should pass pagination and search', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await templatesApi.list({ page: 1, limit: 20, search: 'welcome' });
      expect(client.get).toHaveBeenCalledWith('/templates', { params: { page: 1, limit: 20, search: 'welcome' } });
    });

    it('should pass is_active filter', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await templatesApi.list({ is_active: 1 });
      expect(client.get).toHaveBeenCalledWith('/templates', { params: { is_active: 1 } });
    });
  });

  describe('create', () => {
    it('should call POST /templates', async () => {
      const data = { channel: 'email' as const, name: 'Welcome Email', content: 'Hello {{name}}' };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 't1' } });
      await templatesApi.create(data);
      expect(client.post).toHaveBeenCalledWith('/templates', data);
    });

    it('should pass all optional fields', async () => {
      const data = { channel: 'whatsapp' as const, name: 'Order Update', subject: 'Order Status', content: 'Your order {{orderId}}', category: 'transactional', language: 'hi' };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 't2' } });
      await templatesApi.create(data);
      expect(client.post).toHaveBeenCalledWith('/templates', data);
    });

    it('should return created template', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 't3', name: 'New Template' } });
      const result = await templatesApi.create({ channel: 'sms', name: 'SMS Template', content: 'Hi' });
      expect(result.data.id).toBe('t3');
    });
  });

  describe('getById', () => {
    it('should call GET /templates/:id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 't1', name: 'Welcome' } });
      const result = await templatesApi.getById('t1');
      expect(client.get).toHaveBeenCalledWith('/templates/t1');
      expect(result.data.name).toBe('Welcome');
    });

    it('should use correct id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });
      await templatesApi.getById('tmpl-abc');
      expect(client.get).toHaveBeenCalledWith('/templates/tmpl-abc');
    });

    it('should return template data', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 't1', channel: 'email', name: 'Test', content: 'Body' } });
      const result = await templatesApi.getById('t1');
      expect(result.data).toHaveProperty('channel');
      expect(result.data).toHaveProperty('content');
    });
  });

  describe('update', () => {
    it('should call PUT /templates/:id', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 't1' } });
      await templatesApi.update('t1', { name: 'Updated Template' });
      expect(client.put).toHaveBeenCalledWith('/templates/t1', { name: 'Updated Template' });
    });

    it('should pass partial fields', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: {} });
      await templatesApi.update('t1', { content: 'Updated content', subject: 'New subject' });
      expect(client.put).toHaveBeenCalledWith('/templates/t1', { content: 'Updated content', subject: 'New subject' });
    });

    it('should return updated template', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 't1', name: 'Updated' } });
      const result = await templatesApi.update('t1', { name: 'Updated' });
      expect(result.data.name).toBe('Updated');
    });
  });

  describe('delete', () => {
    it('should call DELETE /templates/:id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: { success: true } });
      await templatesApi.delete('t1');
      expect(client.delete).toHaveBeenCalledWith('/templates/t1');
    });

    it('should use correct id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: { success: true } });
      await templatesApi.delete('tmpl-xyz');
      expect(client.delete).toHaveBeenCalledWith('/templates/tmpl-xyz');
    });

    it('should return success response', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: { success: true } });
      const result = await templatesApi.delete('t1');
      expect(result.data.success).toBe(true);
    });
  });
});
