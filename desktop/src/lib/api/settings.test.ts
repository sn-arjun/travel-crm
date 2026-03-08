import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGetState = vi.fn();
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => mockGetState(),
  },
}));

vi.mock('./config', () => ({
  API_BASE_URL: 'http://localhost:8787/api/v1',
  API_ENDPOINTS: {
    settings: {
      company: '/settings/company',
      logo: '/settings/logo',
      assignmentRules: '/settings/assignment-rules',
      routingRules: '/settings/routing-rules',
      followUpSequences: '/settings/follow-up-sequences',
    },
  },
}));

const { settingsApi } = await import('./settings');

describe('Settings API Module', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    mockGetState.mockReturnValue({
      accessToken: 'admin-token',
      refreshToken: null,
      logout: vi.fn(),
      setTokens: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('company settings', () => {
    it('should call GET /settings/company', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({
          success: true,
          data: { company_name: 'Test Co', currency: 'INR' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));

      const result = await settingsApi.company.get();

      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/settings/company');
      expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    });

    it('should call PUT /settings/company to update', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ success: true, data: { message: 'Settings updated' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));

      await settingsApi.company.update({
        name: 'Updated Co',
        currency: 'USD',
        timezone: 'UTC',
      });

      expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.name).toBe('Updated Co');
      expect(body.currency).toBe('USD');
    });
  });

  describe('assignment rules', () => {
    it('should list assignment rules', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ success: true, data: [] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));

      await settingsApi.assignmentRules.list();

      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/settings/assignment-rules');
    });

    it('should create assignment rule', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ success: true, data: { id: 'r1' } }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ));

      await settingsApi.assignmentRules.create({
        name: 'Round Robin',
        priority: 1,
        criteria: {},
        assignTo: 'user-1',
      });

      expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    });
  });

  describe('follow-up sequences', () => {
    it('should list sequences', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ success: true, data: [] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));

      await settingsApi.followUpSequences.list();

      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/settings/follow-up-sequences');
    });

    it('should create sequence with steps', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ success: true, data: { id: 'seq1' } }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ));

      await settingsApi.followUpSequences.create({
        name: 'Welcome Sequence',
        steps: [
          { order: 1, delayDays: 0, type: 'email', message: 'Welcome!' },
          { order: 2, delayDays: 3, type: 'call' },
        ],
      });

      expect(fetchMock.mock.calls[0][1].method).toBe('POST');
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.steps).toHaveLength(2);
      expect(body.name).toBe('Welcome Sequence');
    });

    it('should delete sequence', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

      await settingsApi.followUpSequences.delete('seq1');

      expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/settings/follow-up-sequences/seq1');
    });
  });
});
