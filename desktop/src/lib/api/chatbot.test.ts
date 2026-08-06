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
import { chatbotApi } from './chatbot';

describe('chatbotApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('config', () => {
    describe('get', () => {
      it('should call GET /chatbot/config', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { id: 'cb1', enabled: true, name: 'Travel Bot' } });
        const result = await chatbotApi.config.get();
        expect(client.get).toHaveBeenCalledWith('/chatbot/config');
        expect(result.data.enabled).toBe(true);
      });

      it('should return config data', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { id: 'cb1', name: 'Bot', channels: [] } });
        const result = await chatbotApi.config.get();
        expect(result.data).toHaveProperty('name');
        expect(result.data).toHaveProperty('channels');
      });
    });

    describe('update', () => {
      it('should call PUT /chatbot/config', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: { id: 'cb1' } });
        await chatbotApi.config.update({ enabled: false, name: 'Updated Bot' });
        expect(client.put).toHaveBeenCalledWith('/chatbot/config', { enabled: false, name: 'Updated Bot' });
      });

      it('should pass welcome message', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: {} });
        await chatbotApi.config.update({ welcomeMessage: 'Hello! How can I help?' });
        expect(client.put).toHaveBeenCalledWith('/chatbot/config', { welcomeMessage: 'Hello! How can I help?' });
      });

      it('should return updated config', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: { id: 'cb1', enabled: true } });
        const result = await chatbotApi.config.update({ enabled: true });
        expect(result.data.enabled).toBe(true);
      });
    });
  });

  describe('configChannel', () => {
    describe('get', () => {
      it('should call GET /chatbot/config/:channel', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { enabled: true } });
        await chatbotApi.configChannel.get('whatsapp');
        expect(client.get).toHaveBeenCalledWith('/chatbot/config/whatsapp');
      });

      it('should use correct channel name', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: {} });
        await chatbotApi.configChannel.get('facebook');
        expect(client.get).toHaveBeenCalledWith('/chatbot/config/facebook');
      });
    });

    describe('update', () => {
      it('should call PUT /chatbot/config/:channel', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: {} });
        await chatbotApi.configChannel.update('web', { enabled: true, config: { theme: 'dark' } });
        expect(client.put).toHaveBeenCalledWith('/chatbot/config/web', { enabled: true, config: { theme: 'dark' } });
      });
    });
  });

  describe('conversations', () => {
    describe('list', () => {
      it('should call GET /chatbot/conversations', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await chatbotApi.conversations.list();
        expect(client.get).toHaveBeenCalledWith('/chatbot/conversations', { params: undefined });
      });

      it('should pass filter params', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await chatbotApi.conversations.list({ channel: 'web', status: 'active' });
        expect(client.get).toHaveBeenCalledWith('/chatbot/conversations', { params: { channel: 'web', status: 'active' } });
      });

      it('should pass date range and pagination', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await chatbotApi.conversations.list({ page: 1, limit: 20, fromDate: '2026-01-01', toDate: '2026-03-31' });
        expect(client.get).toHaveBeenCalledWith('/chatbot/conversations', { params: { page: 1, limit: 20, fromDate: '2026-01-01', toDate: '2026-03-31' } });
      });
    });

    describe('getById', () => {
      it('should call GET /chatbot/conversations/:id', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { id: 'conv1', status: 'active' } });
        await chatbotApi.conversations.getById('conv1');
        expect(client.get).toHaveBeenCalledWith('/chatbot/conversations/conv1');
      });
    });

    describe('close', () => {
      it('should call POST /chatbot/conversations/:id/close', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: { id: 'conv1', status: 'closed' } });
        await chatbotApi.conversations.close('conv1');
        expect(client.post).toHaveBeenCalledWith('/chatbot/conversations/conv1/close', undefined);
      });

      it('should pass notes', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: {} });
        await chatbotApi.conversations.close('conv1', { notes: 'Resolved issue' });
        expect(client.post).toHaveBeenCalledWith('/chatbot/conversations/conv1/close', { notes: 'Resolved issue' });
      });
    });
  });

  describe('reply', () => {
    describe('send', () => {
      it('should call POST /chatbot/conversations/:id/reply', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: { id: 'msg1', sender: 'bot' } });
        await chatbotApi.reply.send('conv1', { message: 'Here is the information you requested' });
        expect(client.post).toHaveBeenCalledWith('/chatbot/conversations/conv1/reply', { message: 'Here is the information you requested' });
      });

      it('should pass attachments', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: {} });
        await chatbotApi.reply.send('conv1', { message: 'See attached', attachments: [{ type: 'file', url: 'https://example.com/doc.pdf', name: 'doc.pdf' }] });
        expect(client.post).toHaveBeenCalledWith('/chatbot/conversations/conv1/reply', expect.objectContaining({ attachments: expect.any(Array) }));
      });

      it('should return sent message', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: { id: 'msg2', sender: 'bot', text: 'Hello' } });
        const result = await chatbotApi.reply.send('conv1', { message: 'Hello' });
        expect(result.data.sender).toBe('bot');
      });
    });
  });

  describe('handoff', () => {
    describe('send', () => {
      it('should call POST /chatbot/conversations/:id/handoff', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: { id: 'conv1', status: 'handed_off' } });
        await chatbotApi.handoff.send('conv1', { assignTo: 'u1' });
        expect(client.post).toHaveBeenCalledWith('/chatbot/conversations/conv1/handoff', { assignTo: 'u1' });
      });

      it('should pass reason and note', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: {} });
        await chatbotApi.handoff.send('conv1', { assignTo: 'u1', reason: 'Complex query', note: 'Customer needs special attention' });
        expect(client.post).toHaveBeenCalledWith('/chatbot/conversations/conv1/handoff', { assignTo: 'u1', reason: 'Complex query', note: 'Customer needs special attention' });
      });

      it('should return updated conversation', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: { id: 'conv1', status: 'handed_off', handedOffTo: 'u1' } });
        const result = await chatbotApi.handoff.send('conv1', { assignTo: 'u1' });
        expect(result.data.status).toBe('handed_off');
      });
    });
  });

  describe('analytics', () => {
    describe('get', () => {
      it('should call GET /chatbot/analytics', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { totalConversations: 100, activeConversations: 5 } });
        await chatbotApi.analytics.get();
        expect(client.get).toHaveBeenCalledWith('/chatbot/analytics', { params: undefined });
      });

      it('should pass filter params', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: {} });
        await chatbotApi.analytics.get({ fromDate: '2026-01-01', toDate: '2026-03-31', channel: 'web' });
        expect(client.get).toHaveBeenCalledWith('/chatbot/analytics', { params: { fromDate: '2026-01-01', toDate: '2026-03-31', channel: 'web' } });
      });

      it('should return analytics data', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { totalConversations: 50, handoffRate: 10.5 } });
        const result = await chatbotApi.analytics.get();
        expect(result.data.totalConversations).toBe(50);
      });
    });
  });
});
