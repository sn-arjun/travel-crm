'use client';

import * as React from 'react';
import { LifeBuoy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';
import { readSupportSession } from '@/lib/support-session';
import { useT } from '@/lib/i18n';

/**
 * Persistent banner for a support (impersonation) session: "Support session by <name> - ends <time>".
 * Ending the session signs this browser out. The token has no refresh token, so when it expires the
 * session ends by itself.
 */
export function SupportSessionBanner() {
  const t = useT();
  const accessToken = useAuthStore((s) => s.accessToken);
  const session = React.useMemo(() => readSupportSession(accessToken), [accessToken]);

  const endSession = React.useCallback(() => {
    useAuthStore.getState().logout();
    window.location.href = '/login';
  }, []);

  React.useEffect(() => {
    if (!session?.expiresAt) return;
    const wait = session.expiresAt - Date.now();
    if (wait <= 0) {
      endSession();
      return;
    }
    const timer = setTimeout(endSession, wait);
    return () => clearTimeout(timer);
  }, [session, endSession]);

  if (!session) return null;

  const ends = session.expiresAt
    ? new Date(session.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div
      role="status"
      data-testid="support-session-banner"
      className="flex shrink-0 items-center justify-between gap-3 border-b border-ds-warning bg-ds-warning-subtle px-4 py-1.5 text-ds-warning-on-subtle"
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        <LifeBuoy aria-hidden="true" className="h-4 w-4" />
        {ends ? t('shell.support.sessionEnds', { name: session.name, time: ends }) : t('shell.support.session', { name: session.name })}
      </span>
      <Button type="button" variant="outline" size="sm" onClick={endSession}>
        {t('shell.support.end')}
      </Button>
    </div>
  );
}
