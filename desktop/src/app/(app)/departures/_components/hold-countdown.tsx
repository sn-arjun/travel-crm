'use client';

import * as React from 'react';
import { Clock } from 'lucide-react';

import { Tag } from '@/components/ui';
import { holdCountdownText, holdRemaining } from '@/lib/departures';
import { useT } from '@/lib/i18n';

/** "Hold ends in 5h 10m" for a held booking; ticks every 30 seconds. Nothing for a booking without a hold. */
export function HoldCountdown({ expiresAt }: { expiresAt: string | null | undefined }) {
  const t = useT();
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  const remaining = holdRemaining(expiresAt, now);
  const text = holdCountdownText(expiresAt, now, t);
  if (!remaining || !text) return null;
  const tone = remaining.expired ? 'danger' : remaining.minutes < 120 ? 'warning' : 'neutral';
  return (
    <Tag tone={tone} data-testid="hold-countdown">
      <Clock className="size-3" aria-hidden="true" />
      {text}
    </Tag>
  );
}
