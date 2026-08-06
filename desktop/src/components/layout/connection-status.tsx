'use client';

import * as React from 'react';
import { useRealtimeStore } from '@/stores/realtime-store';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function ConnectionStatus() {
  const connected = useRealtimeStore((s) => s.connected);
  const reconnectAttempts = useRealtimeStore((s) => s.reconnectAttempts);

  const isReconnecting = !connected && reconnectAttempts > 0;

  if (!connected && reconnectAttempts === 0) return null;

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <div className="flex items-center justify-center px-3 py-1.5">
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              connected
                ? 'bg-emerald-500'
                : isReconnecting
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-red-500',
            )}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="right">
        {connected
          ? 'Real-time connected'
          : isReconnecting
            ? `Reconnecting... (attempt ${reconnectAttempts})`
            : 'Disconnected'}
      </TooltipContent>
    </Tooltip>
  );
}
