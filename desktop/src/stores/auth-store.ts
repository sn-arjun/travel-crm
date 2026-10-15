'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { User, Tenant } from '@travelcrm/shared';
import { setLocaleFromTenant } from '@/lib/locale';

interface AuthState {
  // State
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** First login with a temporary password: the app only offers the change-password screen (enforced by the API too). */
  mustChangePassword: boolean;
  /** The agency requires two-factor sign-in and this user has not set it up: only Settings > Security is usable (enforced by the API too). */
  twoFactorSetupRequired: boolean;
  /** Admin onboarding wizard not finished yet. null = not checked this session (never persisted). */
  onboardingPending: boolean | null;

  // Actions
  setAuth: (data: {
    accessToken: string;
    refreshToken: string;
    user: User;
    tenant: Tenant;
    mustChangePassword?: boolean;
    twoFactorSetupRequired?: boolean;
  }) => void;
  setMustChangePassword: (value: boolean) => void;
  setTwoFactorSetupRequired: (value: boolean) => void;
  setOnboardingPending: (value: boolean | null) => void;
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
      mustChangePassword: false,
      twoFactorSetupRequired: false,
      onboardingPending: null,

      setAuth: ({ accessToken, refreshToken, user, tenant, mustChangePassword, twoFactorSetupRequired }) => {
        setLocaleFromTenant(tenant);
        set({
          accessToken,
          refreshToken,
          user,
          tenant,
          isAuthenticated: true,
          isLoading: false,
          mustChangePassword: mustChangePassword === true,
          twoFactorSetupRequired: twoFactorSetupRequired === true,
          onboardingPending: null,
        });
      },

      setMustChangePassword: (mustChangePassword) => set({ mustChangePassword }),

      setTwoFactorSetupRequired: (twoFactorSetupRequired) => set({ twoFactorSetupRequired }),

      setOnboardingPending: (onboardingPending) => set({ onboardingPending }),

      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

      setUser: (user) =>
        set({ user, isAuthenticated: user !== null }),

      setTenant: (tenant) => {
        setLocaleFromTenant(tenant);
        set({ tenant });
      },

      setLoading: (isLoading) =>
        set({ isLoading }),

      logout: () => {
        setLocaleFromTenant(null);
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          tenant: null,
          isAuthenticated: false,
          isLoading: false,
          mustChangePassword: false,
          twoFactorSetupRequired: false,
          onboardingPending: null,
        });
      },

      clearAuth: () => {
        setLocaleFromTenant(null);
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          tenant: null,
          isAuthenticated: false,
          isLoading: false,
          mustChangePassword: false,
          twoFactorSetupRequired: false,
          onboardingPending: null,
        });
      },
    }),
    {
      name: 'travelcrm-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        tenant: state.tenant,
        isAuthenticated: state.isAuthenticated,
        mustChangePassword: state.mustChangePassword,
        twoFactorSetupRequired: state.twoFactorSetupRequired,
      }),
      onRehydrateStorage: () => (state) => {
        // After hydration completes, set isLoading to false
        if (state) {
          setLocaleFromTenant(state.tenant);
          state.isLoading = false;
          useAuthStore.setState({ isLoading: false });
        }
      },
    },
  ),
);
