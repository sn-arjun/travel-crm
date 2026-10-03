import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the auth store before importing the client
const mockGetState = vi.fn();
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => mockGetState(),
    setState: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    persist: { rehydrate: vi.fn() },
  },
}));

// Mock the config
vi.mock('./config', () => ({
  API_BASE_URL: 'http://localhost:8787/api/v1',
}));

// Now import after mocks
const { client, refreshAccessToken, checkProactiveRefresh } = await import('./client');

describe('HttpClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;

    // Default auth state: no auth
    mockGetState.mockReturnValue({
      accessToken: null,
      refreshToken: null,
      logout: vi.fn(),
      setTokens: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('URL building', () => {
    it('should build URL without params', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));

      await client.get('/contacts');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/contacts$/),
        expect.any(Object),
      );
    });

    it('should append query params', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));

      await client.get('/contacts', { params: { page: 2, limit: 10 } });

      const calledUrl = fetchMock.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('page=2');
      expect(calledUrl).toContain('limit=10');
    });

    it('should skip undefined/null/empty params', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));

      await client.get('/contacts', { params: { search: undefined, status: '', active: true } });

      const calledUrl = fetchMock.mock.calls[0]![0] as string;
      expect(calledUrl).not.toContain('search');
      expect(calledUrl).not.toContain('status=');
      expect(calledUrl).toContain('active=true');
    });
  });

  describe('HTTP methods', () => {
    it('should make GET request', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));

      await client.get('/health');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should make POST request with JSON body', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { id: '1' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }));

      await client.post('/contacts', { name: 'Test' });

      const callArgs = fetchMock.mock.calls[0]!;
      expect(callArgs[1].method).toBe('POST');
      expect(callArgs[1].body).toBe(JSON.stringify({ name: 'Test' }));
    });

    it('should make PUT request', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { id: '1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));

      await client.put('/contacts/1', { name: 'Updated' });

      expect(fetchMock.mock.calls[0]![1].method).toBe('PUT');
    });

    it('should make PATCH request', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));

      await client.patch('/contacts/1', { name: 'Patched' });
      expect(fetchMock.mock.calls[0]![1].method).toBe('PATCH');
    });

    it('should make DELETE request', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

      await client.delete('/contacts/1');
      expect(fetchMock.mock.calls[0]![1].method).toBe('DELETE');
    });
  });

  describe('Authorization header', () => {
    it('should include Bearer token when authenticated', async () => {
      mockGetState.mockReturnValue({
        accessToken: 'my-jwt-token',
        refreshToken: null,
        logout: vi.fn(),
        setTokens: vi.fn(),
      });

      fetchMock.mockResolvedValue(new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));

      await client.get('/contacts');

      const headers = fetchMock.mock.calls[0]![1].headers;
      expect(headers['Authorization']).toBe('Bearer my-jwt-token');
    });

    it('should NOT include Authorization header when no token', async () => {
      mockGetState.mockReturnValue({
        accessToken: null,
        refreshToken: null,
        logout: vi.fn(),
        setTokens: vi.fn(),
      });

      fetchMock.mockResolvedValue(new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));

      await client.get('/health');

      const headers = fetchMock.mock.calls[0]![1].headers;
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should reject on non-ok response', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ message: 'Validation failed', code: 'VALIDATION_ERROR' }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ));

      await expect(client.post('/contacts', {})).rejects.toBeDefined();
    });

    it('should reject on 401 response', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ message: 'Unauthorized' }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      ));

      await expect(client.get('/contacts')).rejects.toBeDefined();
    });

    it('should reject on 404 response', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ message: 'Not found' }),
        { status: 404, headers: { 'content-type': 'application/json' } },
      ));

      await expect(client.get('/contacts/nonexistent')).rejects.toBeDefined();
    });

    it('should reject on 500 response', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ message: 'Internal server error' }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      ));

      await expect(client.get('/contacts')).rejects.toBeDefined();
    });

    it('should reject on non-JSON error response', async () => {
      fetchMock.mockResolvedValue(new Response('Bad Gateway', {
        status: 502,
        headers: { 'content-type': 'text/plain' },
      }));

      await expect(client.get('/contacts')).rejects.toBeDefined();
    });

    it('should throw TIMEOUT error on AbortController timeout', async () => {
      fetchMock.mockImplementation(() => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      await expect(client.get('/contacts', { timeout: 1 })).rejects.toEqual(
        expect.objectContaining({
          status: 0,
          message: 'Request timeout',
          code: 'TIMEOUT',
        }),
      );
    });

    it('should throw NETWORK_ERROR on fetch failure', async () => {
      fetchMock.mockRejectedValue(new Error('Failed to fetch'));

      await expect(client.get('/contacts')).rejects.toEqual(
        expect.objectContaining({
          status: 0,
          message: 'Failed to fetch',
          code: 'NETWORK_ERROR',
        }),
      );
    });

    it('should include error properties in thrown error', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ message: 'Bad request' }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ));

      try {
        await client.post('/contacts', {});
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err).toHaveProperty('status');
        expect(err).toHaveProperty('message');
      }
    });
  });

  describe('Response types', () => {
    it('should parse JSON response', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ data: { id: '1', name: 'Test' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));

      const result = await client.get('/contacts/1');
      expect(result).toEqual({ data: { id: '1', name: 'Test' } });
    });

    it('should handle blob responseType', async () => {
      // jsdom Response doesn't support stream-based body; test that the path is called
      const mockBlob = new Blob(['content']);
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/pdf' }),
        blob: vi.fn().mockResolvedValue(mockBlob),
      };
      fetchMock.mockResolvedValue(mockResponse as any);

      const result = await client.get('/documents/1/download', { responseType: 'blob' });
      expect(mockResponse.blob).toHaveBeenCalled();
    });

    it('should return text for text responseType', async () => {
      fetchMock.mockResolvedValue(new Response('plain text content', { status: 200 }));

      const result = await client.get('/export', { responseType: 'text' });
      expect(result).toBe('plain text content');
    });
  });

  describe('Token refresh', () => {
    it('should attempt token refresh on 401 when refresh token exists', async () => {
      const mockSetTokens = vi.fn();
      const mockLogout = vi.fn();

      mockGetState.mockReturnValue({
        accessToken: 'expired-token',
        refreshToken: 'valid-refresh-token',
        logout: mockLogout,
        setTokens: mockSetTokens,
      });

      // Create mock response objects that properly implement the Response interface
      const mock401 = {
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValue({ message: 'Token expired' }),
      };
      const mockRefresh = {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValue({ data: { accessToken: 'new-access', refreshToken: 'new-refresh' } }),
      };
      const mockRetry = {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValue({ data: [{ id: '1' }] }),
      };

      fetchMock
        .mockResolvedValueOnce(mock401 as any)
        .mockResolvedValueOnce(mockRefresh as any)
        .mockResolvedValueOnce(mockRetry as any);

      const result = await client.get('/contacts');

      expect(mockSetTokens).toHaveBeenCalledWith('new-access', 'new-refresh');
      expect(result).toEqual({ data: [{ id: '1' }] });
    });
  });

  describe('Single-flight token refresh', () => {
    interface FakeAuthState {
      accessToken: string | null;
      refreshToken: string | null;
      logout: ReturnType<typeof vi.fn>;
      setTokens: ReturnType<typeof vi.fn>;
    }

    let state: FakeAuthState;
    let refreshCalls: number;

    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });

    const makeJwt = (expOffsetSeconds: number) => {
      const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '');
      const exp = Math.floor(Date.now() / 1000) + expOffsetSeconds;
      return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ exp })}.sig`;
    };

    const persist = (accessToken: string, refreshToken: string) => {
      localStorage.setItem(
        'travelcrm-auth',
        JSON.stringify({ state: { accessToken, refreshToken }, version: 0 }),
      );
    };

    const isRefreshUrl = (input: unknown) => String(input).includes('/auth/refresh-token');
    const authOf = (init: unknown) =>
      (init as { headers?: Record<string, string> } | undefined)?.headers?.['Authorization'];

    beforeEach(() => {
      refreshCalls = 0;
      localStorage.clear();
      state = {
        accessToken: 'old-access',
        refreshToken: 'old-refresh',
        logout: vi.fn(() => {
          state.accessToken = null;
          state.refreshToken = null;
        }),
        setTokens: vi.fn((a: string, r: string) => {
          state.accessToken = a;
          state.refreshToken = r;
        }),
      };
      mockGetState.mockReturnValue(state);
    });

    it('five concurrent 401s trigger exactly one refresh and five retries with the new token', async () => {
      fetchMock.mockImplementation(async (url: unknown, init: unknown) => {
        if (isRefreshUrl(url)) {
          refreshCalls++;
          await new Promise((r) => setTimeout(r, 10));
          return json(200, { data: { accessToken: 'new-access', refreshToken: 'new-refresh' } });
        }
        return authOf(init) === 'Bearer new-access'
          ? json(200, { data: { ok: true } })
          : json(401, { message: 'Token expired' });
      });

      const results = await Promise.all(
        [1, 2, 3, 4, 5].map((n) => client.get(`/contacts/${n}`)),
      );

      expect(results).toHaveLength(5);
      expect(refreshCalls).toBe(1);
      expect(state.setTokens).toHaveBeenCalledTimes(1);
      expect(state.setTokens).toHaveBeenCalledWith('new-access', 'new-refresh');
      expect(state.logout).not.toHaveBeenCalled();
      const retries = fetchMock.mock.calls.filter(
        (c) => !isRefreshUrl(c[0]) && authOf(c[1]) === 'Bearer new-access',
      );
      expect(retries).toHaveLength(5);
    });

    it('adopts tokens persisted by another window when the refresh is rejected as a replay', async () => {
      fetchMock.mockImplementation(async (url: unknown, init: unknown) => {
        if (isRefreshUrl(url)) {
          refreshCalls++;
          // Another window rotated the tokens just before our request reached the server
          persist('other-access', 'other-refresh');
          return json(401, { message: 'Token has already been used (possible replay attack)' });
        }
        return authOf(init) === 'Bearer other-access'
          ? json(200, { data: { ok: true } })
          : json(401, { message: 'Token expired' });
      });

      const result = await client.get('/contacts');

      expect(result).toEqual({ data: { ok: true } });
      expect(refreshCalls).toBe(1);
      expect(state.setTokens).toHaveBeenCalledWith('other-access', 'other-refresh');
      expect(state.logout).not.toHaveBeenCalled();
    });

    it('skips the network call when another window already rotated the refresh token', async () => {
      persist('other-access', 'other-refresh');
      fetchMock.mockImplementation(async (url: unknown, init: unknown) => {
        if (isRefreshUrl(url)) refreshCalls++;
        return authOf(init) === 'Bearer other-access'
          ? json(200, { data: { ok: true } })
          : json(401, { message: 'Token expired' });
      });

      await client.get('/contacts');

      expect(refreshCalls).toBe(0);
      expect(state.setTokens).toHaveBeenCalledWith('other-access', 'other-refresh');
    });

    it('logs out when the refresh token is rejected and nothing newer is persisted', async () => {
      fetchMock.mockImplementation(async (url: unknown) => {
        if (isRefreshUrl(url)) {
          refreshCalls++;
          return json(401, { message: 'Token has already been used (possible replay attack)' });
        }
        return json(401, { message: 'Token expired' });
      });

      await expect(client.get('/contacts')).rejects.toEqual(expect.objectContaining({ status: 401 }));

      expect(refreshCalls).toBe(1);
      expect(state.logout).toHaveBeenCalledTimes(1);
    });

    it('does not log out on a network error during refresh and surfaces the original error', async () => {
      fetchMock.mockImplementation(async (url: unknown) => {
        if (isRefreshUrl(url)) {
          refreshCalls++;
          throw new TypeError('Failed to fetch');
        }
        return json(401, { message: 'Token expired' });
      });

      await expect(client.get('/contacts')).rejects.toEqual(
        expect.objectContaining({ status: 401, message: 'Token expired' }),
      );

      expect(refreshCalls).toBe(1);
      expect(state.logout).not.toHaveBeenCalled();
      expect(state.accessToken).toBe('old-access');
    });

    it('does not log out when the refresh endpoint answers with a 5xx', async () => {
      fetchMock.mockImplementation(async (url: unknown) => {
        if (isRefreshUrl(url)) {
          refreshCalls++;
          return json(503, { message: 'Service unavailable' });
        }
        return json(401, { message: 'Token expired' });
      });

      await expect(client.get('/contacts')).rejects.toBeDefined();

      expect(state.logout).not.toHaveBeenCalled();
    });

    it('retries without a second refresh when the tokens changed while the request was in flight', async () => {
      let releaseFirst: () => void = () => {};
      const firstResponseGate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });

      fetchMock.mockImplementation(async (url: unknown, init: unknown) => {
        if (isRefreshUrl(url)) {
          refreshCalls++;
          return json(200, { data: { accessToken: 'unexpected', refreshToken: 'unexpected' } });
        }
        if (authOf(init) === 'Bearer old-access') {
          await firstResponseGate;
          return json(401, { message: 'Token expired' });
        }
        return json(200, { data: { ok: true } });
      });

      const pending = client.get('/contacts');
      // Another caller refreshed in the meantime
      state.accessToken = 'fresh-access';
      state.refreshToken = 'fresh-refresh';
      releaseFirst();

      await expect(pending).resolves.toEqual({ data: { ok: true } });
      expect(refreshCalls).toBe(0);
      const last = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]!;
      expect(authOf(last[1])).toBe('Bearer fresh-access');
    });

    it('shares one refresh between the proactive timer check and a concurrent 401', async () => {
      state.accessToken = makeJwt(30); // expires within the 120 s window
      const expiring = state.accessToken;

      fetchMock.mockImplementation(async (url: unknown, init: unknown) => {
        if (isRefreshUrl(url)) {
          refreshCalls++;
          await new Promise((r) => setTimeout(r, 20));
          return json(200, { data: { accessToken: 'new-access', refreshToken: 'new-refresh' } });
        }
        return authOf(init) === `Bearer ${expiring}`
          ? json(401, { message: 'Token expired' })
          : json(200, { data: { ok: true } });
      });

      const proactive = checkProactiveRefresh();
      const request = client.get('/contacts');
      await Promise.all([proactive, request]);

      expect(refreshCalls).toBe(1);
      expect(state.setTokens).toHaveBeenCalledTimes(1);
      expect(state.logout).not.toHaveBeenCalled();
    });

    it('proactive check does nothing while the token is still valid', async () => {
      state.accessToken = makeJwt(3600);
      fetchMock.mockImplementation(async (url: unknown) => {
        if (isRefreshUrl(url)) refreshCalls++;
        return json(200, {});
      });

      await checkProactiveRefresh();

      expect(refreshCalls).toBe(0);
    });

    it('refreshAccessToken returns false without a network call when there is no refresh token', async () => {
      state.refreshToken = null;
      fetchMock.mockImplementation(async () => json(200, {}));

      await expect(refreshAccessToken()).resolves.toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
