import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the auth store before importing
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
    auth: {
      resolveTenant: '/auth/resolve-tenant',
      login: '/auth/login',
      sendOtp: '/auth/send-otp',
      verifyOtp: '/auth/verify-otp',
      logout: '/auth/logout',
      refreshToken: '/auth/refresh-token',
      forgotPassword: '/auth/forgot-password',
      resetPassword: '/auth/reset-password',
      changePassword: '/auth/change-password',
      sessions: '/auth/sessions',
    },
  },
}));

const { authApi, passwordPolicyError } = await import('./auth');

describe('Auth API Module', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
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

  // ─── Resolve Tenant ─────────────────────────────────────────
  describe('resolveTenant', () => {
    it('should call POST /auth/resolve-tenant with email', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({
          success: true,
          data: { tenants: [{ id: 't1', companyName: 'Acme', logoUrl: null, role: 'admin' }] },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));

      const result = await authApi.resolveTenant({ email: 'admin@test.com' });

      const calledUrl = fetchMock.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/auth/resolve-tenant');
      expect(fetchMock.mock.calls[0]![1].method).toBe('POST');
      expect(fetchMock.mock.calls[0]![1].body).toBe(JSON.stringify({ email: 'admin@test.com' }));
      expect(result.data.tenants).toHaveLength(1);
      expect(result.data.tenants[0]?.companyName).toBe('Acme');
    });
  });

  // ─── Login ───────────────────────────────────────────────────
  describe('login', () => {
    it('should call POST /auth/login with credentials', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({
          success: true,
          data: {
            accessToken: 'jwt-token',
            refreshToken: 'refresh-123',
            user: { id: 'u1', email: 'admin@test.com', name: 'Admin', role: 'admin' },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));

      const result = await authApi.login({
        email: 'admin@test.com',
        password: 'password123',
        tenantId: 'tenant-1',
      });

      const calledUrl = fetchMock.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/auth/login');
      expect(fetchMock.mock.calls[0]![1].method).toBe('POST');
      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body.email).toBe('admin@test.com');
      expect(body.password).toBe('password123');
      expect(body.tenantId).toBe('tenant-1');
      expect(result.data.accessToken).toBe('jwt-token');
      expect(result.data.user.role).toBe('admin');
    });

    it('should reject with error on invalid credentials', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ success: false, error: 'Invalid email or password' }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      ));

      await expect(authApi.login({
        email: 'admin@test.com',
        password: 'wrong',
        tenantId: 'tenant-1',
      })).rejects.toBeDefined();
    });
  });

  // ─── OTP ─────────────────────────────────────────────────────
  describe('sendOtp', () => {
    it('should call POST /auth/send-otp', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ success: true, data: { message: 'OTP sent successfully' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));

      await authApi.sendOtp({ phone: '+919876543210', tenantId: 'tenant-1' });

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body.phone).toBe('+919876543210');
      expect(body.tenantId).toBe('tenant-1');
    });
  });

  describe('verifyOtp', () => {
    it('should call POST /auth/verify-otp', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({
          success: true,
          data: { accessToken: 'jwt', refreshToken: 'refresh', user: { id: 'u1' } },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));

      await authApi.verifyOtp({ phone: '+919876543210', otp: '123456', tenantId: 'tenant-1' });

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body.otp).toBe('123456');
    });
  });

  // ─── Token Refresh ────────────────────────────────────────────
  describe('refreshToken', () => {
    it('should call POST /auth/refresh-token', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({
          success: true,
          data: { accessToken: 'new-jwt', refreshToken: 'new-refresh' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));

      const result = await authApi.refreshToken({ refreshToken: 'old-refresh' });

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body.refreshToken).toBe('old-refresh');
      expect(result.data.accessToken).toBe('new-jwt');
      expect(result.data.refreshToken).toBe('new-refresh');
    });
  });

  // ─── Forgot Password ─────────────────────────────────────────
  describe('forgotPassword', () => {
    it('should call POST /auth/forgot-password', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ success: true, data: { message: 'If an account exists, a reset link has been sent' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));

      await authApi.forgotPassword({ email: 'user@test.com' });

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body.email).toBe('user@test.com');
    });
  });

  // ─── Reset Password ──────────────────────────────────────────
  describe('resetPassword', () => {
    it('should call POST /auth/reset-password', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ success: true, data: { message: 'Password reset' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));

      await authApi.resetPassword({
        token: 'reset-token',
        password: 'NewPass123',
        confirmPassword: 'NewPass123',
      });

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body.token).toBe('reset-token');
      expect(body.password).toBe('NewPass123');
    });
  });

  // ─── Logout ───────────────────────────────────────────────────
  describe('logout', () => {
    it('should call POST /auth/logout', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ success: true, data: null }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));

      await authApi.logout();

      const calledUrl = fetchMock.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/auth/logout');
      expect(fetchMock.mock.calls[0]![1].method).toBe('POST');
    });
  });

  // ─── Sessions ─────────────────────────────────────────────────
  describe('getSessions', () => {
    it('should call GET /auth/sessions', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({
          success: true,
          data: [
            { id: 's1', device: 'desktop', browser: 'Chrome', loginAt: '2026-01-01' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));

      const result = await authApi.getSessions();

      const calledUrl = fetchMock.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/auth/sessions');
      expect(fetchMock.mock.calls[0]![1].method).toBe('GET');
      expect(result.data).toHaveLength(1);
    });
  });

  // ─── Change password (R113) ───────────────────────────────────
  describe('changePassword', () => {
    it('should call POST /auth/change-password with both passwords', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ success: true, data: { message: 'Password changed', accessToken: 'fresh', mustChangePassword: false } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));

      const result = await authApi.changePassword({ currentPassword: 'Temp0rary1234', newPassword: 'Chosen2026pw' });

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url as string).toContain('/auth/change-password');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ currentPassword: 'Temp0rary1234', newPassword: 'Chosen2026pw' });
      expect(result.data.accessToken).toBe('fresh');
    });
  });

  describe('passwordPolicyError', () => {
    it('mirrors the API rule: 10+ characters with a letter and a digit', () => {
      expect(passwordPolicyError('short1A')).toMatch(/at least 10/);
      expect(passwordPolicyError('onlyletterspassword')).toMatch(/digit/);
      expect(passwordPolicyError('12345678901234')).toMatch(/letter/);
      expect(passwordPolicyError('Chosen2026pw')).toBeNull();
    });
  });
});
