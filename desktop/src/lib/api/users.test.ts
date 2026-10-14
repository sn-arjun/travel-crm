import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGetState = vi.fn();
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => mockGetState(),
    setState: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    persist: { rehydrate: vi.fn() },
  },
}));

vi.mock('./config', () => ({
  API_BASE_URL: 'http://localhost:8787/api/v1',
  getApiBaseUrl: () => 'http://localhost:8787/api/v1',
  API_ENDPOINTS: {
    users: {
      list: '/users',
      me: '/users/me',
      byId: (id: string) => `/users/${id}`,
    },
  },
}));

const { usersApi } = await import('./users');

describe('Users API Module', () => {
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

  describe('list', () => {
    it('should call GET /users', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ success: true, data: [{ id: 'u1', name: 'Admin' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));

      await usersApi.list();

      const calledUrl = fetchMock.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/users');
      expect(fetchMock.mock.calls[0]![1].method).toBe('GET');
    });

    it('should pass query params for search/filter', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ success: true, data: [] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));

      await usersApi.list({ search: 'john', role: 'admin', page: 2 });

      const calledUrl = fetchMock.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('search=john');
      expect(calledUrl).toContain('role=admin');
      expect(calledUrl).toContain('page=2');
    });
  });

  describe('getMe', () => {
    it('should call GET /users/me', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({
          success: true,
          data: { id: 'u1', email: 'admin@test.com', name: 'Admin', role: 'admin' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));

      const result = await usersApi.getMe();

      const calledUrl = fetchMock.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/users/me');
      expect(result.data.email).toBe('admin@test.com');
    });
  });

  describe('getById', () => {
    it('should call GET /users/:id', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({
          success: true,
          data: { id: 'user-123', name: 'Test User' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));

      await usersApi.getById('user-123');

      const calledUrl = fetchMock.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/users/user-123');
    });

    it('should reject on 404', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ success: false, error: 'User not found' }),
        { status: 404, headers: { 'content-type': 'application/json' } },
      ));

      await expect(usersApi.getById('nonexistent')).rejects.toBeDefined();
    });
  });

  describe('update', () => {
    it('should call PUT /users/:id', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({
          success: true,
          data: { id: 'u1', name: 'Updated Name' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));

      await usersApi.update('u1', { firstName: 'Updated' });

      expect(fetchMock.mock.calls[0]![1].method).toBe('PUT');
      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body.firstName).toBe('Updated');
    });
  });

  describe('delete', () => {
    it('should call DELETE /users/:id', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

      await usersApi.delete('u1');

      expect(fetchMock.mock.calls[0]![1].method).toBe('DELETE');
      const calledUrl = fetchMock.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/users/u1');
    });
  });

  describe('authorization', () => {
    it('should include auth token in requests', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ success: true, data: [] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));

      await usersApi.list();

      const headers = fetchMock.mock.calls[0]![1].headers;
      expect(headers['Authorization']).toBe('Bearer admin-token');
    });
  });
});

describe('usersApi.list envelope normalisation', () => {
  const people = Array.from({ length: 5 }, (_, i) => ({ id: `u${i}`, name: `Person ${i}`, email: `p${i}@example.com`, role: i === 0 ? 'admin' : 'salesperson', isActive: i !== 4 }));
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(async () => new Response(
      JSON.stringify({ success: true, data: people }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    global.fetch = fetchMock;
    mockGetState.mockReturnValue({ accessToken: 't', refreshToken: null, logout: vi.fn(), setTokens: vi.fn() });
  });

  it('wraps the unpaginated array in a PaginatedResponse', async () => {
    const r = await usersApi.list();
    expect(r.data).toHaveLength(5);
    expect(r.pagination).toEqual({ page: 1, limit: 5, total: 5, totalPages: 1 });
  });

  it('paginates client-side so infinite scroll terminates', async () => {
    const p1 = await usersApi.list({ page: 1, limit: 2 });
    const p3 = await usersApi.list({ page: 3, limit: 2 });
    expect(p1.data.map((u) => u.id)).toEqual(['u0', 'u1']);
    expect(p3.data.map((u) => u.id)).toEqual(['u4']);
    expect(p1.pagination).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3 });
  });

  it('applies search, role and status filters client-side', async () => {
    expect((await usersApi.list({ search: 'person 3' })).data.map((u) => u.id)).toEqual(['u3']);
    expect((await usersApi.list({ role: 'admin' })).data.map((u) => u.id)).toEqual(['u0']);
    expect((await usersApi.list({ status: 'inactive' })).data.map((u) => u.id)).toEqual(['u4']);
    expect((await usersApi.list({ search: 'nobody', page: 1, limit: 20 })).pagination.total).toBe(0);
  });
});
