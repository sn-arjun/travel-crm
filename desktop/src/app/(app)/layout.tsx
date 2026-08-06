'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { CommandPalette } from '@/components/ui/command-palette';
import { KeyboardShortcutsProvider } from '@/components/domain/keyboard-shortcuts-provider';
import { useAuthStore } from '@/stores/auth-store';
import { RealtimeProvider } from '@/components/providers/realtime-provider';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <RealtimeProvider>
      <KeyboardShortcutsProvider>
        <AppShell>
          {children}
          <CommandPalette />
        </AppShell>
      </KeyboardShortcutsProvider>
    </RealtimeProvider>
  );
}
