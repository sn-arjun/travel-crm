'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { Tenant, User } from '@travelcrm/shared';
import { useAuthStore } from '@/stores/auth-store';
import { usersApi } from '@/lib/api/users';
import { readSupportSession } from '@/lib/support-session';

/**
 * Landing page for a support (impersonation) session started in the operator console.
 * The console opens /support-session#token=<30 minute agency access token>&tenant=<agency name>. The fragment
 * never reaches a server. The token carries the imp claims, so the app shows the support banner everywhere.
 */
export default function SupportSessionPage() {
  const router = useRouter();
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = params.get('token');
    const session = readSupportSession(token);
    // Remove the token from the address bar and history straight away.
    window.history.replaceState(null, '', window.location.pathname);

    if (!token || !session) {
      setError('This link is not a valid support session.');
      return;
    }
    if (session.expiresAt && session.expiresAt <= Date.now()) {
      setError('This support session has already ended.');
      return;
    }

    const store = useAuthStore.getState();
    store.setTokens(token, '');

    usersApi
      .getMe()
      .then((res) => {
        const user = res.data as User;
        const name = params.get('tenant') || 'Agency';
        const tenant = {
          id: session.tenantId,
          name,
          slug: '',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          language: 'en',
          plan: '',
          isActive: true,
        } as Tenant;
        useAuthStore.getState().setAuth({ accessToken: token, refreshToken: '', user, tenant });
        router.replace('/dashboard');
      })
      .catch(() => {
        useAuthStore.getState().clearAuth();
        setError('The support session could not be started. It may have ended.');
      });
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      {error ? (
        <p role="alert" className="text-sm text-ds-danger">{error}</p>
      ) : (
        <p className="flex items-center gap-2 text-sm text-ds-foreground-muted">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Starting support session...
        </p>
      )}
    </main>
  );
}
