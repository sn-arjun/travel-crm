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
import { voipApi } from './voip';

describe('voipApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── settings ──────────────────────────────────────────────────
  describe('settings', () => {
    describe('get', () => {
      it('should call GET /voip/settings', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { id: 'vs1', provider: 'twilio', connected: true } });
        const result = await voipApi.settings.get();
        expect(client.get).toHaveBeenCalledWith('/voip/settings');
        expect(result.data.connected).toBe(true);
      });

      it('should return settings data', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { id: 'vs1', provider: 'vonage', features: { inboundCalls: true } } });
        const result = await voipApi.settings.get();
        expect(result.data).toHaveProperty('provider');
        expect(result.data).toHaveProperty('features');
      });
    });

    describe('update', () => {
      it('should call PUT /voip/settings', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: { id: 'vs1' } });
        await voipApi.settings.update({ provider: 'twilio', accountSid: 'AC123' });
        expect(client.put).toHaveBeenCalledWith('/voip/settings', { provider: 'twilio', accountSid: 'AC123' });
      });

      it('should pass features', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: {} });
        await voipApi.settings.update({ features: { recording: true, transcription: true } });
        expect(client.put).toHaveBeenCalledWith('/voip/settings', { features: { recording: true, transcription: true } });
      });

      it('should return updated settings', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: { id: 'vs1', provider: 'twilio', connected: true } });
        const result = await voipApi.settings.update({ provider: 'twilio' });
        expect(result.data.provider).toBe('twilio');
      });
    });

    describe('testConnection', () => {
      it('should call POST /voip/test-connection', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: { connected: true, message: 'Success' } });
        const result = await voipApi.settings.testConnection();
        expect(client.post).toHaveBeenCalledWith('/voip/test-connection');
        expect(result.data.connected).toBe(true);
      });

      it('should return connection status', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: { connected: false, message: 'Invalid credentials' } });
        const result = await voipApi.settings.testConnection();
        expect(result.data.connected).toBe(false);
        expect(result.data.message).toBe('Invalid credentials');
      });
    });
  });

  // ─── token ─────────────────────────────────────────────────────
  describe('token', () => {
    describe('get', () => {
      it('should call GET /voip/token', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { token: 'jwt-token-123', expiresIn: 3600 } });
        const result = await voipApi.token.get();
        expect(client.get).toHaveBeenCalledWith('/voip/token');
        expect(result.data.token).toBe('jwt-token-123');
      });

      it('should return token with expiry', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { token: 'abc', expiresIn: 7200 } });
        const result = await voipApi.token.get();
        expect(result.data.expiresIn).toBe(7200);
      });
    });
  });

  // ─── numbers ───────────────────────────────────────────────────
  describe('numbers', () => {
    describe('list', () => {
      it('should call GET /voip/numbers', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [{ id: 'n1', number: '+1234567890' }] });
        await voipApi.numbers.list();
        expect(client.get).toHaveBeenCalledWith('/voip/numbers');
      });

      it('should return numbers list', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [{ id: 'n1', number: '+1234567890', status: 'active', type: 'local' }, { id: 'n2', number: '+0987654321', status: 'inactive', type: 'toll_free' }] });
        const result = await voipApi.numbers.list();
        expect(result.data).toHaveLength(2);
      });

      it('should return empty array when no numbers', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [] });
        const result = await voipApi.numbers.list();
        expect(result.data).toHaveLength(0);
      });
    });
  });

  // ─── calls ─────────────────────────────────────────────────────
  describe('calls', () => {
    describe('list', () => {
      it('should call GET /calls', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await voipApi.calls.list();
        expect(client.get).toHaveBeenCalledWith('/calls', { params: undefined });
      });

      it('should pass filter params', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await voipApi.calls.list({ direction: 'inbound', status: 'completed' });
        expect(client.get).toHaveBeenCalledWith('/calls', { params: { direction: 'inbound', status: 'completed' } });
      });

      it('should pass date range and pagination', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await voipApi.calls.list({ page: 1, limit: 25, fromDate: '2026-01-01', toDate: '2026-03-31', sortBy: 'startTime', sortOrder: 'desc' });
        expect(client.get).toHaveBeenCalledWith('/calls', { params: { page: 1, limit: 25, fromDate: '2026-01-01', toDate: '2026-03-31', sortBy: 'startTime', sortOrder: 'desc' } });
      });

      it('should return calls list', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [{ id: 'c1', from: '+111', to: '+222', status: 'completed' }], pagination: { total: 1 } } });
        const result = await voipApi.calls.list();
        expect(result.data.data).toHaveLength(1);
      });
    });

    describe('getById', () => {
      it('should call GET /calls/:id', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { id: 'c1', from: '+111', to: '+222' } });
        const result = await voipApi.calls.getById('c1');
        expect(client.get).toHaveBeenCalledWith('/calls/c1');
        expect(result.data.from).toBe('+111');
      });

      it('should use correct id', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: {} });
        await voipApi.calls.getById('call-xyz');
        expect(client.get).toHaveBeenCalledWith('/calls/call-xyz');
      });

      it('should return call data', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { id: 'c1', duration: 120, direction: 'outbound', recordingUrl: 'https://example.com/rec.mp3' } });
        const result = await voipApi.calls.getById('c1');
        expect(result.data).toHaveProperty('duration');
        expect(result.data).toHaveProperty('recordingUrl');
      });
    });

    describe('createOutbound', () => {
      it('should call POST /calls/outbound', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: { id: 'c1', status: 'initiated' } });
        await voipApi.calls.createOutbound({ to: '+1234567890' });
        expect(client.post).toHaveBeenCalledWith('/calls/outbound', { to: '+1234567890' });
      });

      it('should pass from and message', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: { id: 'c2' } });
        await voipApi.calls.createOutbound({ to: '+1234567890', from: '+0987654321', message: 'Calling about booking' });
        expect(client.post).toHaveBeenCalledWith('/calls/outbound', { to: '+1234567890', from: '+0987654321', message: 'Calling about booking' });
      });

      it('should pass leadId and contactId', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: { id: 'c3' } });
        await voipApi.calls.createOutbound({ to: '+1234567890', leadId: 'l1', contactId: 'ct1' });
        expect(client.post).toHaveBeenCalledWith('/calls/outbound', { to: '+1234567890', leadId: 'l1', contactId: 'ct1' });
      });

      it('should return created call', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: { id: 'c4', status: 'ringing', direction: 'outbound' } });
        const result = await voipApi.calls.createOutbound({ to: '+111' });
        expect(result.data.status).toBe('ringing');
        expect(result.data.direction).toBe('outbound');
      });
    });
  });

  // ─── analytics ─────────────────────────────────────────────────
  describe('analytics', () => {
    describe('get', () => {
      it('should call GET /calls/analytics', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { totalCalls: 100, missedCalls: 5 } });
        await voipApi.analytics.get();
        expect(client.get).toHaveBeenCalledWith('/calls/analytics', { params: undefined });
      });

      it('should pass period param', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: {} });
        await voipApi.analytics.get({ period: 'monthly' });
        expect(client.get).toHaveBeenCalledWith('/calls/analytics', { params: { period: 'monthly' } });
      });

      it('should pass date range', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: {} });
        await voipApi.analytics.get({ fromDate: '2026-01-01', toDate: '2026-03-31' });
        expect(client.get).toHaveBeenCalledWith('/calls/analytics', { params: { fromDate: '2026-01-01', toDate: '2026-03-31' } });
      });

      it('should return analytics data', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { totalCalls: 200, inboundCalls: 100, outboundCalls: 100, avgDuration: 180 } });
        const result = await voipApi.analytics.get();
        expect(result.data.totalCalls).toBe(200);
        expect(result.data.avgDuration).toBe(180);
      });
    });
  });

  // ─── missedCalls ───────────────────────────────────────────────
  describe('missedCalls', () => {
    describe('list', () => {
      it('should call GET /calls/missed', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await voipApi.missedCalls.list();
        expect(client.get).toHaveBeenCalledWith('/calls/missed', { params: undefined });
      });

      it('should pass filter params', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await voipApi.missedCalls.list({ page: 1, limit: 10, fromDate: '2026-03-01', toDate: '2026-03-31' });
        expect(client.get).toHaveBeenCalledWith('/calls/missed', { params: { page: 1, limit: 10, fromDate: '2026-03-01', toDate: '2026-03-31' } });
      });

      it('should pass sort params', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await voipApi.missedCalls.list({ sortBy: 'missedAt', sortOrder: 'desc' });
        expect(client.get).toHaveBeenCalledWith('/calls/missed', { params: { sortBy: 'missedAt', sortOrder: 'desc' } });
      });

      it('should return missed calls list', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [{ id: 'mc1', from: '+111', missedAt: '2026-03-09T10:00:00Z' }], pagination: { total: 1 } } });
        const result = await voipApi.missedCalls.list();
        expect(result.data.data).toHaveLength(1);
      });
    });
  });

  // ─── transcripts ───────────────────────────────────────────────
  describe('transcripts', () => {
    describe('list', () => {
      it('should call GET /transcripts', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await voipApi.transcripts.list();
        expect(client.get).toHaveBeenCalledWith('/transcripts', { params: undefined });
      });

      it('should pass filter params', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await voipApi.transcripts.list({ callId: 'c1', sentiment: 'positive' });
        expect(client.get).toHaveBeenCalledWith('/transcripts', { params: { callId: 'c1', sentiment: 'positive' } });
      });

      it('should pass pagination and sort', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await voipApi.transcripts.list({ page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' });
        expect(client.get).toHaveBeenCalledWith('/transcripts', { params: { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' } });
      });

      it('should return transcripts list', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [{ id: 't1', callId: 'c1', text: 'Hello, how can I help?' }], pagination: { total: 1 } } });
        const result = await voipApi.transcripts.list();
        expect(result.data.data).toHaveLength(1);
      });
    });

    describe('getByCall', () => {
      it('should call GET /transcripts/:callId', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { id: 't1', callId: 'c1', text: 'Transcript text' } });
        const result = await voipApi.transcripts.getByCall('c1');
        expect(client.get).toHaveBeenCalledWith('/transcripts/c1');
        expect(result.data.text).toBe('Transcript text');
      });

      it('should use correct callId', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: {} });
        await voipApi.transcripts.getByCall('call-xyz');
        expect(client.get).toHaveBeenCalledWith('/transcripts/call-xyz');
      });

      it('should return transcript data', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { id: 't1', callId: 'c1', text: 'Conversation', sentiment: 'positive', keywords: ['booking', 'travel'] } });
        const result = await voipApi.transcripts.getByCall('c1');
        expect(result.data).toHaveProperty('sentiment');
        expect(result.data).toHaveProperty('keywords');
      });
    });
  });
});
