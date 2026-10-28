import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { usePermission, usePermissions, resetPermissionCache } from './use-permission';
import { useAuthStore } from '@/stores/auth-store';

const getMock = vi.fn();

vi.mock('@/lib/api/client', () => ({
  client: { get: (...args: unknown[]) => getMock(...args) },
}));

function signIn(id: string, role: string) {
  useAuthStore.setState({
    user: { id, email: `${role}@demo.com`, name: role, role } as never,
    isAuthenticated: true,
  });
}

const SALESPERSON = {
  success: true,
  data: { role: 'salesperson', permissions: { leads: ['view', 'create', 'edit'], invoices: ['view'] } },
};

describe('usePermission', () => {
  beforeEach(() => {
    getMock.mockReset();
    resetPermissionCache();
    signIn('user-1', 'salesperson');
  });

  it('answers from the backend permission map', async () => {
    getMock.mockResolvedValue(SALESPERSON);
    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(getMock).toHaveBeenCalledWith('/users/me/permissions');
    expect(result.current.can('leads', 'create')).toBe(true);
    expect(result.current.can('invoices', 'view')).toBe(true);
    expect(result.current.can('invoices', 'create')).toBe(false);
    expect(result.current.can('fleet', 'view')).toBe(false);
  });

  it('denies everything until the map has loaded', () => {
    getMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => usePermission('leads', 'view'));
    expect(result.current).toBe(false);
  });

  it('denies everything when the request fails', async () => {
    getMock.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.can('leads', 'view')).toBe(false);
  });

  it('asks the backend once for the same user across components', async () => {
    getMock.mockResolvedValue(SALESPERSON);
    const first = renderHook(() => usePermission('leads', 'edit'));
    const second = renderHook(() => usePermission('leads', 'delete'));
    await waitFor(() => expect(first.result.current).toBe(true));
    expect(second.result.current).toBe(false);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('does not reuse one user\'s permissions for the next user', async () => {
    getMock.mockResolvedValueOnce(SALESPERSON);
    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.can('leads', 'create')).toBe(true));

    getMock.mockResolvedValueOnce({ success: true, data: { role: 'view_only', permissions: { leads: ['view'] } } });
    act(() => signIn('user-2', 'view_only'));

    expect(result.current.can('leads', 'create')).toBe(false);
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.can('leads', 'view')).toBe(true);
    expect(result.current.can('leads', 'create')).toBe(false);
  });

  it('makes no request when nobody is signed in', () => {
    useAuthStore.setState({ user: null, isAuthenticated: false });
    const { result } = renderHook(() => usePermissions());
    expect(result.current.loaded).toBe(false);
    expect(getMock).not.toHaveBeenCalled();
  });
});
