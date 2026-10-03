import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useIsSuperAdmin, resetIsSuperAdminCache } from './use-is-super-admin';
import { useAuthStore } from '@/stores/auth-store';

const getMock = vi.fn();

vi.mock('@/lib/api/client', () => ({
  client: { get: (...args: unknown[]) => getMock(...args) },
}));

function signIn(id: string) {
  useAuthStore.setState({
    user: { id, email: 'admin@demo.com', name: 'Demo Admin', role: 'admin' } as never,
    isAuthenticated: true,
  });
}

describe('useIsSuperAdmin', () => {
  beforeEach(() => {
    getMock.mockReset();
    resetIsSuperAdminCache();
    signIn('user-1');
  });

  it('returns true when whoami says the user is a super admin', async () => {
    getMock.mockResolvedValue({ success: true, data: { isSuperAdmin: true } });
    const { result } = renderHook(() => useIsSuperAdmin());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isSuperAdmin).toBe(true);
    expect(getMock).toHaveBeenCalledWith('/admin/whoami');
  });

  it('stays false when the endpoint 404s, without throwing', async () => {
    getMock.mockRejectedValue({ status: 404, message: 'Not Found' });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useIsSuperAdmin());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isSuperAdmin).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('asks the backend once per session', async () => {
    getMock.mockResolvedValue({ success: true, data: { isSuperAdmin: false } });
    const first = renderHook(() => useIsSuperAdmin());
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    const second = renderHook(() => useIsSuperAdmin());
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('is false and idle when nobody is signed in', () => {
    useAuthStore.setState({ user: null, isAuthenticated: false });
    const { result } = renderHook(() => useIsSuperAdmin());
    expect(result.current).toEqual({ isSuperAdmin: false, loading: false });
    expect(getMock).not.toHaveBeenCalled();
  });
});
