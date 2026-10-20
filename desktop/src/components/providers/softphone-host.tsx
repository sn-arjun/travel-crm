'use client';

import * as React from 'react';

import { CallControlsPanel } from '@/components/domain/call-controls-panel';
import { FirstCallMicCheck } from '@/components/domain/mic-check';
import { useAuthStore } from '@/stores/auth-store';
import { useRealtimeStore } from '@/stores/realtime-store';
import { useSoftphoneStore } from '@/stores/softphone-store';
import { appSoftphone, useSoftphone } from '@/lib/softphone/use-softphone';
import type { MockSoftphone } from '@/lib/softphone/mock-sdk';
import type { RingingCall } from '@/components/domain/call-screen-pop';

/** Roles that take calls (the same list the API's token route allows). */
const AGENT_ROLES = new Set(['admin', 'sales_manager', 'salesperson']);

/**
 * Registers the in-app phone for the signed-in agent and shows the in-call panel for calls answered from the
 * screen pop. An agency without calling, or a role that does not take calls, gets nothing: the token request is
 * refused, the phone stays `unavailable` and no UI appears.
 */
export function SoftphoneHost() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);
  const role = useAuthStore((s) => s.user?.role as string | undefined);
  const restricted = useAuthStore((s) => s.mustChangePassword || s.twoFactorSetupRequired);
  const subscribe = useRealtimeStore((s) => s.subscribe);
  const eligible = isAuthenticated && !!userId && !!role && AGENT_ROLES.has(role) && !restricted;

  // Register on sign-in, sign out of the phone on sign-out.
  React.useEffect(() => {
    if (!eligible) return;
    const controller = appSoftphone();
    void controller.start();
    return () => {
      void controller.stop();
    };
  }, [eligible, userId]);

  // The mock provider rings nobody, so the mock phone rings when the realtime room says a call rings for this agent.
  React.useEffect(() => {
    if (!eligible) return;
    return subscribe('call:ringing', (data) => {
      const ring = data as RingingCall;
      const phone = appSoftphone().getSoftphone();
      if (phone?.kind === 'mock') {
        (phone as MockSoftphone).simulateIncoming({ direction: 'inbound', from: ring.from, to: ring.to, providerCallId: ring.callId });
      }
    });
  }, [eligible, subscribe]);

  if (!eligible) return null;
  return (
    <>
      <PhoneStateMarker />
      <InboundCallPanel />
      <FirstCallMicCheck />
    </>
  );
}

/** Invisible: the phone's state for tests and support (`unavailable` for an agency without calling). */
function PhoneStateMarker() {
  const softphone = useSoftphone();
  return <span hidden aria-hidden="true" data-testid="softphone-state" data-softphone-state={softphone.status} data-softphone-kind={softphone.controller.getSoftphone()?.kind ?? ""} />;
}

/** The in-call panel for a call the agent answered in the app. Outbound calls show theirs on the dial page. */
function InboundCallPanel() {
  const softphone = useSoftphone();
  const answered = useSoftphoneStore((s) => s.answered);
  const setAnswered = useSoftphoneStore((s) => s.setAnswered);

  // Nothing is answered any more and no panel is waiting on the call log: forget it.
  React.useEffect(() => {
    if (answered && softphone.status === 'unavailable') setAnswered(null);
  }, [answered, softphone.status, setAnswered]);

  if (!answered) return null;
  return (
    <CallControlsPanel
      key={answered.callId}
      callId={answered.callId}
      callerName={answered.contactName ?? answered.from}
      phoneNumber={answered.from}
      direction="inbound"
      viaSoftphone
      leadId={answered.leadId}
      leadTitle={answered.leadTitle}
      onEndCall={() => setAnswered(null)}
    />
  );
}
