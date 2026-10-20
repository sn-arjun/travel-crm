'use client';

import * as React from 'react';
import Link from 'next/link';
import { Phone, PhoneCall, X } from 'lucide-react';
import { LEAD_STATUS_LABELS } from '@travelcrm/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRealtimeStore } from '@/stores/realtime-store';
import { useSoftphoneStore } from '@/stores/softphone-store';
import { useSoftphone } from '@/lib/softphone/use-softphone';
import { useT } from '@/lib/i18n';
import { voipApi } from '@/lib/api/voip';
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
   * Force the Answer button. By default it shows when the in-app softphone (R307) has this call ringing; without
   * a softphone (no calling, or the call-bridge case) the agent answers on the phone that rings and no button shows.
   */
  canAnswerInApp?: boolean;
  onAnswer?: (call: RingingCall) => void;
}

export function CallScreenPop({ canAnswerInApp, onAnswer }: CallScreenPopProps) {
  const t = useT();
  const softphone = useSoftphone();
  const setAnswered = useSoftphoneStore((s) => s.setAnswered);
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

  // The in-app phone is ringing: the agent can answer here. (If the pop has not arrived over the socket yet, the
  // ring itself is enough to show Answer and the caller's number.)
  const ringing = softphone.status === 'ringing' && softphone.call?.direction === 'inbound';
  const answerable = canAnswerInApp ?? ringing;
  const connecting = softphone.status === 'connecting' || softphone.status === 'in_call';

  // The ring reached the app before (or without) the socket's pop: show what the phone itself knows.
  const unlinked: RingingCall | null = !mine && ringing && softphone.call
    ? { callId: '', from: softphone.call.from ?? '', to: softphone.call.to, routedTo: null, routedToName: null, contact: null, lead: null, lastInteraction: null, ringingAt: new Date().toISOString() }
    : null;
  const popCall = mine ?? unlinked;

  const answer = (call: RingingCall) => {
    const answered = {
      callId: call.callId,
      from: call.from,
      contactName: call.contact?.name ?? null,
      contactId: call.contact?.id ?? null,
      leadId: call.lead?.id ?? null,
      leadTitle: call.lead?.title ?? null,
    };
    setAnswered(answered);
    softphone.answer();
    onAnswer?.(call);
    setMine(null);
    // A ring without a pop has no call record yet in hand: find it by the provider's id.
    const providerId = softphone.call?.providerCallId;
    if (!call.callId && providerId) {
      void voipApi.calls.list({ search: call.from, limit: 10 }).then((res) => {
        const row = (res.data ?? []).find((c) => c.providerCallId === providerId);
        if (row) setAnswered({ ...answered, callId: row.id, contactName: row.contactName ?? null, leadId: row.leadId ?? null, leadTitle: row.leadTitle ?? null });
      }).catch(() => { /* the panel works without the record */ });
    }
  };

  // The caller hung up (or another device answered) while it rang: the pop goes quiet with the ring.
  const wasRinging = React.useRef(false);
  React.useEffect(() => {
    if (ringing) wasRinging.current = true;
    else if (wasRinging.current) {
      wasRinging.current = false;
      if (softphone.status === 'ready') setMine(null);
    }
  }, [ringing, softphone.status]);

  const decline = () => {
    softphone.reject();
    setMine(null);
  };


  return (
    <>
      {others && !popCall && (
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

      {popCall && (
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
                <p className="text-xs font-medium uppercase tracking-wide text-ds-foreground-muted">{t('softphone.pop.incoming')}</p>
                <CardTitle className="truncate text-base" data-testid="call-pop-caller">
                  {popCall.contact?.name ?? t('softphone.pop.unknown')}
                </CardTitle>
                <p className="text-sm text-ds-foreground-muted" data-testid="call-pop-number">{popCall.from}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-ds-3">
            {popCall.lead && (
              <div className="rounded-ds-md bg-ds-surface-sunken p-ds-3 text-sm" data-testid="call-pop-lead">
                <p className="font-medium text-ds-foreground">{popCall.lead.title}</p>
                <p className="text-ds-foreground-muted">
                  {LEAD_STATUS_LABELS[popCall.lead.status as keyof typeof LEAD_STATUS_LABELS] ?? popCall.lead.status.replace(/_/g, ' ')}
                  {popCall.lead.value ? ` - ${formatCurrency(popCall.lead.value)}` : ''}
                </p>
              </div>
            )}
            {popCall.lastInteraction && (
              <p className="text-sm text-ds-foreground-muted" data-testid="call-pop-last">
                <span className="font-medium text-ds-foreground">{popCall.lastInteraction.kind === 'message' ? 'Last message: ' : 'Last call note: '}</span>
                {popCall.lastInteraction.text}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-ds-2">
              {answerable && !connecting && (
                <Button size="sm" onClick={() => answer(popCall)} data-testid="call-pop-answer">
                  {t('softphone.pop.answer')}
                </Button>
              )}
              {answerable && !connecting && ringing && (
                <Button size="sm" variant="outline" onClick={decline} data-testid="call-pop-decline">
                  {t('softphone.pop.decline')}
                </Button>
              )}
              {popCall.lead ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/leads/${popCall.lead.id}`} onClick={() => setMine(null)} data-testid="call-pop-open-lead">Open lead</Link>
                </Button>
              ) : popCall.contact ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/contacts/${popCall.contact.id}`} onClick={() => setMine(null)} data-testid="call-pop-open-contact">Open contact</Link>
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
