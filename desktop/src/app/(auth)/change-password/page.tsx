'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { ChangePasswordForm } from '@/components/auth/change-password-form';
import { useAuthStore } from '@/stores/auth-store';
import { authApi } from '@/lib/api/auth';
import { isOnboardingPending, onboardingApi } from '@/lib/api/onboarding';

/** Shown after a first login with a temporary password: nothing else in the app is reachable until this is done. */
export default function ChangePasswordPage() {
  const router = useRouter();
  const isLoading = useAuthStore((s) => s.isLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const mustChange = useAuthStore((s) => s.mustChangePassword);

  React.useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) router.replace('/login');
    else if (!mustChange) router.replace('/settings/security');
  }, [isLoading, isAuthenticated, mustChange, router]);

  // The token now reaches the API: an admin whose agency is not set up yet goes to the wizard.
  async function handleDone() {
    const { user, setOnboardingPending } = useAuthStore.getState();
    if (user?.role === 'admin') {
      try {
        const pending = isOnboardingPending(await onboardingApi.getRaw());
        setOnboardingPending(pending);
        router.replace(pending ? '/onboarding' : '/dashboard');
        return;
      } catch {
        // Fall through: the dashboard shows the setup banner if it still applies.
      }
    }
    router.replace('/dashboard');
  }

  async function signOut() {
    try {
      await authApi.logout();
    } catch {
      // The session is dropped locally either way.
    }
    useAuthStore.getState().logout();
    router.replace('/login');
  }

  if (isLoading || !isAuthenticated || !mustChange) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-ds-foreground-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-ds-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
          Choose your password
        </h2>
        <p className="mt-1 text-sm text-ds-foreground-muted">
          You signed in with a temporary password. Set your own to continue.
        </p>
      </div>

      <ChangePasswordForm currentLabel="Temporary password" onDone={() => void handleDone()} />

      <Button type="button" variant="ghost" className="w-full" onClick={() => void signOut()}>
        Sign out
      </Button>
    </div>
  );
}
