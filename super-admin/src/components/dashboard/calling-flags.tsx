'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface FraudEvent {
  id: string;
  tenantId: string | null;
  companyName: string | null;
  kind: string;
  day: string;
  blocking: boolean;
  occurrences: number;
}

const LABELS: Record<string, string> = {
  daily_minutes: 'Daily minute ceiling reached (outbound blocked)',
  spend_spike: 'Call spend above 3 times the 14-day average',
  platform_ceiling: 'Platform call spend above the daily ceiling',
  velocity: 'Call rate limit hit',
  blocked_destination: 'Premium or not-allowed destination refused',
};

/**
 * Calling fraud flags (R305): every limit that fired and is still open, blocks first. Renders nothing when there are none.
 * A block is lifted from here or from the agency's Calling tab; both are audited.
 */
export function CallingFlags() {
  const [events, setEvents] = useState<FraudEvent[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/voip/fraud-events?status=active');
    if (res.ok) setEvents((await res.json()) as FraudEvent[]);
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const lift = async (id: string) => {
    setBusy(true);
    await fetch(`/api/voip/fraud-events/${id}/lift`, { method: 'POST' });
    setBusy(false);
    await load();
  };

  if (events.length === 0) return null;
  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-base">Calling safety flags</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {events.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={e.blocking ? 'destructive' : 'outline'}>{e.blocking ? 'blocked' : 'flag'}</Badge>
              <span>{LABELS[e.kind] ?? e.kind}</span>
              {e.tenantId ? (
                <Link className="underline" href={`/tenants/${e.tenantId}`}>{e.companyName ?? e.tenantId}</Link>
              ) : (
                <span className="text-muted-foreground">whole platform</span>
              )}
              <span className="text-muted-foreground">{e.day} x{e.occurrences}</span>
            </div>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => lift(e.id)}>
              {e.blocking ? 'Lift block' : 'Dismiss'}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
