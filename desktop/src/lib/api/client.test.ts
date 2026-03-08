import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the auth store before importing the client
const mockGetState = vi.fn();
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => mockGetState(),
  },
}));

// Mock the config
vi.mock('./config', () => ({
  API_BASE_URL: 'http://localhost:8787/api/v1',
}));

// Now import after mocks
const { client } = await import('./client');

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

      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain('page=2');
      expect(calledUrl).toContain('limit=10');
    });

    it('should skip undefined/null/empty params', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));

      await client.get('/contacts', { params: { search: undefined, status: '', active: true } });

      const calledUrl = fetchMock.mock.calls[0][0] as string;
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

      const callArgs = fetchMock.mock.calls[0];
      expect(callArgs[1].method).toBe('POST');
      expect(callArgs[1].body).toBe(JSON.stringify({ name: 'Test' }));
    });

    it('should make PUT request', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { id: '1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));

      await client.put('/contacts/1', { name: 'Updated' });

      expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
    });

    it('should make PATCH request', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));

      await client.patch('/contacts/1', { name: 'Patched' });
      expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
    });

    it('should make DELETE request', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

      await client.delete('/contacts/1');
      expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
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

      const headers = fetchMock.mock.calls[0][1].headers;
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

      const headers = fetchMock.mock.calls[0][1].headers;
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
});
