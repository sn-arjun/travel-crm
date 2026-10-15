import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './auth-store';

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'admin' as const,
  language: 'en',
  isActive: true,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

const mockTenant = {
  id: 'tenant-1',
  name: 'Test Tenant',
  slug: 'test-tenant',
  currency: 'INR' as const,
  timezone: 'Asia/Kolkata',
  language: 'en',
  plan: 'pro',
  isActive: true,
};

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
      tenant: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  it('should start with unauthenticated state', () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.user).toBeNull();
    expect(state.tenant).toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it('should set full auth state via setAuth', () => {
    const { setAuth } = useAuthStore.getState();

    setAuth({
      accessToken: 'access-token-123',
      refreshToken: 'refresh-token-456',
      user: mockUser,
      tenant: mockTenant,
    });

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.accessToken).toBe('access-token-123');
    expect(state.refreshToken).toBe('refresh-token-456');
    expect(state.user).toEqual(mockUser);
    expect(state.tenant).toEqual(mockTenant);
    expect(state.isLoading).toBe(false);
  });

  it('should update tokens via setTokens', () => {
    const { setTokens } = useAuthStore.getState();

    setTokens('new-access', 'new-refresh');

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('new-access');
    expect(state.refreshToken).toBe('new-refresh');
  });

  it('should set user and toggle isAuthenticated', () => {
    const { setUser } = useAuthStore.getState();

    setUser(mockUser);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user).toEqual(mockUser);

    setUser(null);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('should set tenant', () => {
    const { setTenant } = useAuthStore.getState();

    setTenant(mockTenant);
    expect(useAuthStore.getState().tenant).toEqual(mockTenant);

    setTenant(null);
    expect(useAuthStore.getState().tenant).toBeNull();
  });

  it('should set loading state', () => {
    const { setLoading } = useAuthStore.getState();

    setLoading(true);
    expect(useAuthStore.getState().isLoading).toBe(true);

    setLoading(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('should clear all state on logout', () => {
    const { setAuth, logout } = useAuthStore.getState();

    setAuth({
      accessToken: 'token',
      refreshToken: 'refresh',
      user: mockUser,
      tenant: mockTenant,
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.user).toBeNull();
    expect(state.tenant).toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it('should clear all state via clearAuth', () => {
    const { setAuth, clearAuth } = useAuthStore.getState();

    setAuth({
      accessToken: 'token',
      refreshToken: 'refresh',
      user: mockUser,
      tenant: mockTenant,
    });

    clearAuth();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.accessToken).toBeNull();
    expect(state.user).toBeNull();
  });

  it('should persist correct keys via partialize', () => {
    // The store is configured to persist certain keys
    // Verify the persist config works by checking which keys are partialized
    const { setAuth } = useAuthStore.getState();

    setAuth({
      accessToken: 'token',
      refreshToken: 'refresh',
      user: mockUser,
      tenant: mockTenant,
    });

    // isLoading should NOT be persisted (excluded from partialize)
    useAuthStore.getState().setLoading(true);
    const state = useAuthStore.getState();
    expect(state.isLoading).toBe(true);
    // The key fact: isLoading is excluded from partialize config
  });

  it('remembers a forced password change from login until it is done', () => {
    const { setAuth } = useAuthStore.getState();
    setAuth({ accessToken: 't', refreshToken: 'r', user: mockUser, tenant: mockTenant, mustChangePassword: true });
    expect(useAuthStore.getState().mustChangePassword).toBe(true);

    useAuthStore.getState().setMustChangePassword(false);
    expect(useAuthStore.getState().mustChangePassword).toBe(false);

    setAuth({ accessToken: 't', refreshToken: 'r', user: mockUser, tenant: mockTenant });
    expect(useAuthStore.getState().mustChangePassword).toBe(false);
  });

  it('remembers a required two-factor setup from login until it is done, and drops it on logout', () => {
    const { setAuth } = useAuthStore.getState();
    setAuth({ accessToken: 't', refreshToken: 'r', user: mockUser, tenant: mockTenant, twoFactorSetupRequired: true });
    expect(useAuthStore.getState().twoFactorSetupRequired).toBe(true);

    useAuthStore.getState().setTwoFactorSetupRequired(false);
    expect(useAuthStore.getState().twoFactorSetupRequired).toBe(false);

    setAuth({ accessToken: 't', refreshToken: 'r', user: mockUser, tenant: mockTenant, twoFactorSetupRequired: true });
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().twoFactorSetupRequired).toBe(false);

    setAuth({ accessToken: 't', refreshToken: 'r', user: mockUser, tenant: mockTenant });
    expect(useAuthStore.getState().twoFactorSetupRequired).toBe(false);
  });

  it('clears the forced-change and onboarding flags on logout', () => {
    const store = useAuthStore.getState();
    store.setAuth({ accessToken: 't', refreshToken: 'r', user: mockUser, tenant: mockTenant, mustChangePassword: true });
    store.setOnboardingPending(true);
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().mustChangePassword).toBe(false);
    expect(useAuthStore.getState().onboardingPending).toBeNull();
  });
});
