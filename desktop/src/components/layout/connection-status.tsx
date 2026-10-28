'use client';

import * as React from 'react';
import { useRealtimeStore } from '@/stores/realtime-store';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

export function ConnectionStatus() {
  const t = useT();
  const connected = useRealtimeStore((s) => s.connected);
  const reconnectAttempts = useRealtimeStore((s) => s.reconnectAttempts);

  const isReconnecting = !connected && reconnectAttempts > 0;

  if (!connected && reconnectAttempts === 0) return null;

  const label = connected
    ? t('shell.connection.connected')
    : isReconnecting
      ? t('shell.connection.reconnecting')
      : t('shell.connection.disconnected');

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span
          role="status"
          tabIndex={0}
          aria-label={label}
          className="flex h-8 w-8 items-center justify-center rounded-ds-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-ring"
        >
          <span
            aria-hidden="true"
            className={cn(
              'h-2 w-2 rounded-ds-full',
              connected
                ? 'bg-ds-success'
                : isReconnecting
                  ? 'bg-ds-warning animate-pulse'
                  : 'bg-ds-danger',
            )}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
