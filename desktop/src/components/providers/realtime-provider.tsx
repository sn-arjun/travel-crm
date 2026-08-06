'use client';

import * as React from 'react';
import { useRealtimeStore } from '@/stores/realtime-store';
import { useAuthStore } from '@/stores/auth-store';
import { API_BASE_URL } from '@/lib/api/config';

function getWsUrl(): string {
  // Convert http(s) to ws(s)
  const base = API_BASE_URL.replace(/\/api\/v1$/, '');
  const wsBase = base.replace(/^http/, 'ws');
  return `${wsBase}/api/v1/ws`;
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, user, isAuthenticated } = useAuthStore();
  const { connect, disconnect, connected } = useRealtimeStore();

  // Connect when authenticated
  React.useEffect(() => {
    if (isAuthenticated && accessToken && user?.id) {
      const wsUrl = getWsUrl();
      connect(wsUrl, accessToken, user.id);
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, accessToken, user?.id]);

  // Reconnect when tab becomes visible after being hidden
  React.useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isAuthenticated && accessToken && user?.id && !connected) {
        const wsUrl = getWsUrl();
        connect(wsUrl, accessToken, user.id);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isAuthenticated, accessToken, user?.id, connected, connect]);

  return <>{children}</>;
}
