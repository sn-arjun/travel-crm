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
import { chatbotApi, parseAllowedOrigins } from './chatbot';

describe('chatbotApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('config', () => {
    // The backend returns one row per channel (snake_case); the client folds them into one ChatbotConfig.
    const webRow = {
      id: 'cb1',
      channel: 'web',
      enabled: 1,
      greeting: 'Hi there!',
      branding_color: '#0f766e',
      widget_position: 'bottom-right',
      auto_reply: 1,
    };
    const whatsappRow = { id: 'cb2', channel: 'whatsapp', enabled: 0, greeting: 'Welcome on WhatsApp' };

    describe('get', () => {
      it('should call GET /chatbot/config', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [webRow] });
        const result = await chatbotApi.config.get();
        expect(client.get).toHaveBeenCalledWith('/chatbot/config');
        expect(result.data.enabled).toBe(true);
      });

      it('should fold channel rows into one config', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [webRow, whatsappRow] });
        const result = await chatbotApi.config.get();
        expect(result.data).toMatchObject({ id: 'cb1', welcomeMessage: 'Hi there!' });
        expect(result.data.channels).toHaveLength(2);
        expect(result.data.channels[0]).toMatchObject({
          platform: 'web',
          enabled: true,
          config: { primaryColor: '#0f766e', position: 'bottom-right', greetingMessage: 'Hi there!' },
        });
        expect(result.data.channels[1]).toMatchObject({ platform: 'whatsapp', enabled: false });
      });

      it('should fall back to an empty disabled config when no rows exist', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [] });
        const result = await chatbotApi.config.get();
        expect(result.data.enabled).toBe(false);
        expect(result.data.channels).toEqual([]);
      });
    });

    describe('update', () => {
      it('should PUT the web channel config and re-read the config', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: {} });
        vi.mocked(client.get).mockResolvedValue({ data: [{ ...webRow, enabled: 0 }] });
        const result = await chatbotApi.config.update({
          enabled: false,
          welcomeMessage: 'Hi there!',
          channels: [{ platform: 'web', enabled: true, config: { primaryColor: '#0f766e' } }],
        });
        expect(client.put).toHaveBeenCalledWith('/chatbot/config/web', {
          enabled: false,
          greeting: 'Hi there!',
          brandingColor: '#0f766e',
        });
        expect(client.get).toHaveBeenCalledWith('/chatbot/config');
        expect(result.data.enabled).toBe(false);
      });

      it('should PUT the whatsapp channel greeting', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: {} });
        vi.mocked(client.get).mockResolvedValue({ data: [whatsappRow] });
        await chatbotApi.config.update({
          channels: [{ platform: 'whatsapp', enabled: true, config: { greetingMessage: 'Welcome on WhatsApp' } }],
        });
        expect(client.put).toHaveBeenCalledWith('/chatbot/config/whatsapp', {
          enabled: true,
          greeting: 'Welcome on WhatsApp',
        });
      });

      it('should not PUT anything when no channel is supplied', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [webRow] });
        await chatbotApi.config.update({ enabled: true });
        expect(client.put).not.toHaveBeenCalled();
        expect(client.get).toHaveBeenCalledWith('/chatbot/config');
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

      it('should return the reply acknowledgement', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: { replied: true } });
        const result = await chatbotApi.reply.send('conv1', { message: 'Hello' });
        expect(result.data.replied).toBe(true);
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

      it('should return the handoff result', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: { handedOff: true, assignedTo: 'u1' } });
        const result = await chatbotApi.handoff.send('conv1', { assignTo: 'u1' });
        expect(result.data).toEqual({ handedOff: true, assignedTo: 'u1' });
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

describe('chatbotApi.widget (public widget mount, R107)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the key, script URL, snippet and allowed websites from GET /chatbot/widget', async () => {
    vi.mocked(client.get).mockResolvedValue({
      success: true,
      data: {
        widgetKey: 'wk_abc',
        scriptUrl: 'https://api.example.com/api/v1/public/chatbot/wk_abc/widget.js',
        snippet: '<script async src="https://api.example.com/api/v1/public/chatbot/wk_abc/widget.js"></script>',
        allowedOrigins: ['https://www.agency.test'],
      },
    });
    const res = await chatbotApi.widget.get();
    expect(client.get).toHaveBeenCalledWith('/chatbot/widget');
    expect(res.data.snippet).toContain('/public/chatbot/wk_abc/widget.js');
    expect(res.data.snippet).not.toContain('/chatbot/widget.js');
    expect(res.data.allowedOrigins).toEqual(['https://www.agency.test']);
  });

  it('treats a missing allowedOrigins as an empty list', async () => {
    vi.mocked(client.get).mockResolvedValue({ success: true, data: { widgetKey: 'k', scriptUrl: 'u', snippet: 's' } });
    expect((await chatbotApi.widget.get()).data.allowedOrigins).toEqual([]);
  });

  it('saves allowed websites with PUT /chatbot/config/website { allowedOrigins }', async () => {
    vi.mocked(client.put).mockResolvedValue({ success: true, data: {} });
    await chatbotApi.widget.saveAllowedOrigins(['https://a.test']);
    expect(client.put).toHaveBeenCalledWith('/chatbot/config/website', { allowedOrigins: ['https://a.test'] });
  });

  it('no longer exposes the removed authenticated widget.js URL', () => {
    expect((chatbotApi as Record<string, unknown>).widgetUrl).toBeUndefined();
  });
});

describe('parseAllowedOrigins', () => {
  it('reduces addresses to scheme + host + port, one per line or comma separated, without duplicates', () => {
    const { origins, invalid } = parseAllowedOrigins('https://Www.Agency.test/contact\nagency.test, http://localhost:3100/\nhttps://www.agency.test');
    expect(origins).toEqual(['https://www.agency.test', 'https://agency.test', 'http://localhost:3100']);
    expect(invalid).toEqual([]);
  });

  it('an empty text is an empty list (which blocks every website)', () => {
    expect(parseAllowedOrigins('  \n ')).toEqual({ origins: [], invalid: [] });
  });

  it('reports entries that are not website addresses', () => {
    const { origins, invalid } = parseAllowedOrigins('ftp://files.test\nhttps://ok.test\nnot a site');
    expect(origins).toEqual(['https://ok.test']);
    expect(invalid).toEqual(['ftp://files.test', 'not a site']);
  });
});

describe('chatbotApi.conversations: the widget channel', () => {
  it('shows conversations the public widget stored under "website" as the web channel', async () => {
    vi.mocked(client.get).mockResolvedValue({
      data: { data: [{ id: 'c1', visitor_id: 'v1', channel: 'website', status: 'active', messages: '[]' }], pagination: {} },
    });
    const res = await chatbotApi.conversations.list();
    expect(res.data.data[0]?.channel).toBe('web');
  });
});
