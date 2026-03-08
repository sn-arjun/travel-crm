'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { User, Tenant } from '@travelcrm/shared';

interface AuthState {
  // State
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  setAuth: (data: {
    accessToken: string;
    refreshToken: string;
    user: User;
    tenant: Tenant;
  }) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: User | null) => void;
  setTenant: (tenant: Tenant | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      tenant: null,
      isAuthenticated: false,
      isLoading: true, // Start true until hydration completes

      setAuth: ({ accessToken, refreshToken, user, tenant }) =>
        set({
          accessToken,
          refreshToken,
          user,
          tenant,
          isAuthenticated: true,
          isLoading: false,
        }),

      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

      setUser: (user) =>
        set({ user, isAuthenticated: user !== null }),

      setTenant: (tenant) =>
        set({ tenant }),

      setLoading: (isLoading) =>
        set({ isLoading }),

      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          tenant: null,
          isAuthenticated: false,
          isLoading: false,
        }),

      clearAuth: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          tenant: null,
          isAuthenticated: false,
          isLoading: false,
        }),
    }),
    {
      name: 'travelcrm-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        tenant: state.tenant,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // After hydration completes, set isLoading to false
        if (state) {
          state.isLoading = false;
          useAuthStore.setState({ isLoading: false });
        }
      },
    },
  ),
);
