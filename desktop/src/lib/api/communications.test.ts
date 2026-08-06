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
import { communicationsApi } from './communications';

describe('communicationsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('send', () => {
    it('should call POST /communications/send', async () => {
      const data = { contact_id: 'c1', channel: 'email' as const, message: 'Hello' };
      vi.mocked(client.post).mockResolvedValue({ data: { message_id: 'm1', status: 'queued' } });
      const result = await communicationsApi.send(data);
      expect(client.post).toHaveBeenCalledWith('/communications/send', data);
      expect(result.data.message_id).toBe('m1');
    });

    it('should send whatsapp message', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { message_id: 'm2', status: 'sent' } });
      await communicationsApi.send({ contact_id: 'c1', channel: 'whatsapp', message: 'Hi there' });
      expect(client.post).toHaveBeenCalledWith('/communications/send', { contact_id: 'c1', channel: 'whatsapp', message: 'Hi there' });
    });

    it('should pass optional media_url and lead_id', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { message_id: 'm3', status: 'queued' } });
      await communicationsApi.send({ contact_id: 'c1', channel: 'sms', message: 'Text', media_url: 'https://img.com/a.jpg', lead_id: 'l1' });
      expect(client.post).toHaveBeenCalledWith('/communications/send', { contact_id: 'c1', channel: 'sms', message: 'Text', media_url: 'https://img.com/a.jpg', lead_id: 'l1' });
    });

    it('should return message_id and status', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { message_id: 'msg-xyz', status: 'sent' } });
      const result = await communicationsApi.send({ contact_id: 'c1', channel: 'email', message: 'Test' });
      expect(result.data).toHaveProperty('message_id');
      expect(result.data).toHaveProperty('status');
    });
  });

  describe('sendTemplate', () => {
    it('should call POST /communications/send-template', async () => {
      const data = { contact_id: 'c1', template_id: 'tmpl1' };
      vi.mocked(client.post).mockResolvedValue({ data: { message_id: 'm1', status: 'queued' } });
      await communicationsApi.sendTemplate(data);
      expect(client.post).toHaveBeenCalledWith('/communications/send-template', data);
    });

    it('should pass variables', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { message_id: 'm2', status: 'sent' } });
      await communicationsApi.sendTemplate({ contact_id: 'c1', template_id: 'tmpl1', variables: { name: 'John' } });
      expect(client.post).toHaveBeenCalledWith('/communications/send-template', { contact_id: 'c1', template_id: 'tmpl1', variables: { name: 'John' } });
    });

    it('should pass lead_id', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { message_id: 'm3', status: 'queued' } });
      await communicationsApi.sendTemplate({ contact_id: 'c1', template_id: 'tmpl1', lead_id: 'l1' });
      expect(client.post).toHaveBeenCalledWith('/communications/send-template', { contact_id: 'c1', template_id: 'tmpl1', lead_id: 'l1' });
    });
  });

  describe('sendDocument', () => {
    it('should call POST /communications/send-document', async () => {
      const data = { contact_id: 'c1', channel: 'email' as const, document_type: 'invoice' as const, document_id: 'inv1' };
      vi.mocked(client.post).mockResolvedValue({ data: { message_id: 'm1', status: 'queued' } });
      await communicationsApi.sendDocument(data);
      expect(client.post).toHaveBeenCalledWith('/communications/send-document', data);
    });

    it('should pass caption', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { message_id: 'm2', status: 'sent' } });
      await communicationsApi.sendDocument({ contact_id: 'c1', channel: 'whatsapp', document_type: 'voucher', document_id: 'v1', caption: 'Your voucher' });
      expect(client.post).toHaveBeenCalledWith('/communications/send-document', expect.objectContaining({ caption: 'Your voucher' }));
    });

    it('should return message status', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { message_id: 'dm1', status: 'sent' } });
      const result = await communicationsApi.sendDocument({ contact_id: 'c1', channel: 'email', document_type: 'itinerary', document_id: 'itn1' });
      expect(result.data.status).toBe('sent');
    });
  });

  describe('bulkSend', () => {
    it('should call POST /communications/bulk-send', async () => {
      const data = { channel: 'email' as const, contact_ids: ['c1', 'c2'], message: 'Hello all' };
      vi.mocked(client.post).mockResolvedValue({ data: { batch_id: 'b1', total_messages: 2, status: 'queued' } });
      const result = await communicationsApi.bulkSend(data);
      expect(client.post).toHaveBeenCalledWith('/communications/bulk-send', data);
      expect(result.data.total_messages).toBe(2);
    });

    it('should pass template_id for template-based bulk send', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { batch_id: 'b2', total_messages: 3, status: 'queued' } });
      await communicationsApi.bulkSend({ channel: 'whatsapp', contact_ids: ['c1', 'c2', 'c3'], template_id: 'tmpl1' });
      expect(client.post).toHaveBeenCalledWith('/communications/bulk-send', { channel: 'whatsapp', contact_ids: ['c1', 'c2', 'c3'], template_id: 'tmpl1' });
    });

    it('should return batch info', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { batch_id: 'batch-xyz', total_messages: 10, status: 'queued' } });
      const result = await communicationsApi.bulkSend({ channel: 'sms', contact_ids: ['c1'], message: 'Test' });
      expect(result.data.batch_id).toBe('batch-xyz');
    });
  });

  describe('bulkSendStatus', () => {
    it('should call GET /communications/bulk-send/:batchId/status', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { batch_id: 'b1', status: 'completed', total: 10, sent: 10, failed: 0 } });
      const result = await communicationsApi.bulkSendStatus('b1');
      expect(client.get).toHaveBeenCalledWith('/communications/bulk-send/b1/status');
      expect(result.data.status).toBe('completed');
    });

    it('should return progress info', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { batch_id: 'b2', status: 'processing', total: 100, sent: 50, failed: 2 } });
      const result = await communicationsApi.bulkSendStatus('b2');
      expect(result.data.sent).toBe(50);
      expect(result.data.failed).toBe(2);
    });

    it('should use correct batch id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });
      await communicationsApi.bulkSendStatus('batch-abc');
      expect(client.get).toHaveBeenCalledWith('/communications/bulk-send/batch-abc/status');
    });
  });

  describe('getHistory', () => {
    it('should call GET /communications/history', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await communicationsApi.getHistory();
      expect(client.get).toHaveBeenCalledWith('/communications/history', { params: undefined });
    });

    it('should pass filter params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await communicationsApi.getHistory({ channel: 'email', contact_id: 'c1', status: 'sent' });
      expect(client.get).toHaveBeenCalledWith('/communications/history', { params: { channel: 'email', contact_id: 'c1', status: 'sent' } });
    });

    it('should pass pagination and date range', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await communicationsApi.getHistory({ page: 1, limit: 20, fromDate: '2026-01-01', toDate: '2026-03-31' });
      expect(client.get).toHaveBeenCalledWith('/communications/history', { params: { page: 1, limit: 20, fromDate: '2026-01-01', toDate: '2026-03-31' } });
    });

    it('should return paginated logs', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [{ id: 'log1', channel: 'email' }], pagination: { page: 1 } } });
      const result = await communicationsApi.getHistory();
      expect(result.data.data).toHaveLength(1);
    });
  });

  describe('getLog', () => {
    it('should call GET /communications/log', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await communicationsApi.getLog();
      expect(client.get).toHaveBeenCalledWith('/communications/log', { params: undefined });
    });

    it('should pass all filter params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await communicationsApi.getLog({ channel: 'whatsapp', sentBy: 'u1', contactId: 'c1', leadId: 'l1', search: 'hello' });
      expect(client.get).toHaveBeenCalledWith('/communications/log', { params: { channel: 'whatsapp', sentBy: 'u1', contactId: 'c1', leadId: 'l1', search: 'hello' } });
    });

    it('should pass date range and pagination', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await communicationsApi.getLog({ page: 2, limit: 50, dateFrom: '2026-01-01', dateTo: '2026-06-30' });
      expect(client.get).toHaveBeenCalledWith('/communications/log', { params: { page: 2, limit: 50, dateFrom: '2026-01-01', dateTo: '2026-06-30' } });
    });
  });
});
