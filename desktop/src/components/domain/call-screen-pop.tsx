'use client';

import * as React from 'react';
import Link from 'next/link';
import { Phone, PhoneCall, X } from 'lucide-react';
import { LEAD_STATUS_LABELS } from '@travelcrm/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRealtimeStore } from '@/stores/realtime-store';
import { formatCurrency } from '@/lib/utils';

/** What the API pushes when an inbound call reaches an agent (backend `RingingCallPayload`). */
export interface RingingCall {
  callId: string;
  from: string;
  to: string | null;
  routedTo: string | null;
  routedToName: string | null;
  contact: { id: string; name: string } | null;
  lead: { id: string; title: string; status: string; value: number | null } | null;
  lastInteraction: { kind: 'message' | 'call_note'; text: string; at: string | null } | null;
  ringingAt: string;
}

/** A ringing call goes quiet on its own if no hang-up is ever reported. */
const RING_VISIBLE_MS = 45_000;

export interface CallScreenPopProps {
  /**
   * The in-app softphone (R307) can answer; until it exists the Answer button is hidden and the agent answers on
   * the phone that rings (the call-bridge case).
   */
  canAnswerInApp?: boolean;
  onAnswer?: (call: RingingCall) => void;
}

export function CallScreenPop({ canAnswerInApp = false, onAnswer }: CallScreenPopProps) {
  const subscribe = useRealtimeStore((s) => s.subscribe);
  const [mine, setMine] = React.useState<RingingCall | null>(null);
  const [others, setOthers] = React.useState<RingingCall | null>(null);

  React.useEffect(() => {
    const offMine = subscribe('call:ringing', (data) => setMine(data as RingingCall));
    const offOthers = subscribe('call:ringing_for', (data) => setOthers(data as RingingCall));
    return () => {
      offMine();
      offOthers();
    };
  }, [subscribe]);

  // Quiet again after the ring time.
  React.useEffect(() => {
    if (!mine) return;
    const timer = setTimeout(() => setMine(null), RING_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [mine]);
  React.useEffect(() => {
    if (!others) return;
    const timer = setTimeout(() => setOthers(null), RING_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [others]);

  return (
    <>
      {others && !mine && (
        <div
          data-testid="call-ringing-for"
          role="status"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-ds-2 rounded-ds-lg border border-ds-border bg-ds-surface-raised px-ds-3 py-ds-2 text-sm text-ds-foreground-muted shadow-lg"
        >
          <Phone className="size-4" aria-hidden="true" />
          <span>Ringing for {others.routedToName ?? 'a colleague'}</span>
          <Button variant="ghost" size="icon-sm" aria-label="Hide" onClick={() => setOthers(null)}>
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      {mine && (
        <Card
          data-testid="call-screen-pop"
          role="alertdialog"
          aria-label="Incoming call"
          className="fixed right-6 top-20 z-50 w-96 border-0 bg-ds-surface-raised shadow-lg"
        >
          <CardHeader className="pb-ds-2">
            <div className="flex items-start gap-ds-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-ds-full bg-ds-success-subtle text-ds-success-on-subtle">
                <PhoneCall className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-ds-foreground-muted">Incoming call</p>
                <CardTitle className="truncate text-base" data-testid="call-pop-caller">
                  {mine.contact?.name ?? 'Unknown number'}
                </CardTitle>
                <p className="text-sm text-ds-foreground-muted" data-testid="call-pop-number">{mine.from}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-ds-3">
            {mine.lead && (
              <div className="rounded-ds-md bg-ds-surface-sunken p-ds-3 text-sm" data-testid="call-pop-lead">
                <p className="font-medium text-ds-foreground">{mine.lead.title}</p>
                <p className="text-ds-foreground-muted">
                  {LEAD_STATUS_LABELS[mine.lead.status as keyof typeof LEAD_STATUS_LABELS] ?? mine.lead.status.replace(/_/g, ' ')}
                  {mine.lead.value ? ` - ${formatCurrency(mine.lead.value)}` : ''}
                </p>
              </div>
            )}
            {mine.lastInteraction && (
              <p className="text-sm text-ds-foreground-muted" data-testid="call-pop-last">
                <span className="font-medium text-ds-foreground">{mine.lastInteraction.kind === 'message' ? 'Last message: ' : 'Last call note: '}</span>
                {mine.lastInteraction.text}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-ds-2">
              {canAnswerInApp && (
                <Button size="sm" onClick={() => onAnswer?.(mine)} data-testid="call-pop-answer">
                  Answer
                </Button>
              )}
              {mine.lead ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/leads/${mine.lead.id}`} onClick={() => setMine(null)} data-testid="call-pop-open-lead">Open lead</Link>
                </Button>
              ) : mine.contact ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/contacts/${mine.contact.id}`} onClick={() => setMine(null)} data-testid="call-pop-open-contact">Open contact</Link>
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setMine(null)} data-testid="call-pop-dismiss">
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
