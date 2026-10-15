'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Rocket } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { CommandPalette } from '@/components/domain/command-palette';
import { KeyboardShortcutsProvider } from '@/components/domain/keyboard-shortcuts-provider';
import { useAuthStore } from '@/stores/auth-store';
import { LimitReachedHost } from '@/components/domain/allowance-exhausted-dialog';
import { RealtimeProvider } from '@/components/providers/realtime-provider';
import { CallScreenPop } from '@/components/domain/call-screen-pop';
import { isOnboardingPending, onboardingApi } from '@/lib/api/onboarding';

/** Admin-only reminder while the agency setup wizard is unfinished. */
function FinishSetupBanner() {
  return (
    <div
      data-testid="finish-setup-banner"
      className="flex items-center justify-between gap-ds-3 border-b border-ds-border bg-ds-primary-subtle px-ds-6 py-ds-2 text-sm"
    >
      <span className="flex items-center gap-ds-2 text-ds-foreground">
        <Rocket className="size-4 text-ds-primary" aria-hidden="true" />
        Your workspace setup is not finished yet.
      </span>
      <Link href="/onboarding" className="font-medium text-ds-primary hover:underline">
        Finish setting up
      </Link>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, mustChangePassword, onboardingPending, user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  React.useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) router.replace('/login');
    // The API refuses every data request until the temporary password is replaced; the UI does not even try.
    else if (mustChangePassword) router.replace('/change-password');
  }, [isAuthenticated, isLoading, mustChangePassword, router]);

  // Once per session: is the setup wizard still open? (admins only; a failed check shows no banner)
  React.useEffect(() => {
    if (isLoading || !isAuthenticated || mustChangePassword || !isAdmin || onboardingPending !== null) return;
    let cancelled = false;
    onboardingApi
      .getRaw()
      .then((raw) => {
        if (!cancelled) useAuthStore.getState().setOnboardingPending(isOnboardingPending(raw));
      })
      .catch(() => {
        if (!cancelled) useAuthStore.getState().setOnboardingPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoading, isAuthenticated, mustChangePassword, isAdmin, onboardingPending]);

  if (isLoading || !isAuthenticated || mustChangePassword) {
    return null;
  }

  const showBanner = isAdmin && onboardingPending === true && pathname !== '/onboarding';

  return (
    <RealtimeProvider>
      <KeyboardShortcutsProvider>
        <AppShell>
          {showBanner && <FinishSetupBanner />}
          {children}
          <CommandPalette />
          <LimitReachedHost />
          <CallScreenPop />
        </AppShell>
      </KeyboardShortcutsProvider>
    </RealtimeProvider>
  );
}
