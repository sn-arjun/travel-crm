import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import * as React from 'react';

import { CallScreenPop, type RingingCall } from './call-screen-pop';
import { callEntryTitle, parseCallMeta } from './call-timeline-entry';
import { useRealtimeStore } from '@/stores/realtime-store';

/** Deliver a realtime message the way the socket does: to the handlers subscribed for its type. */
function push(type: string, data: unknown) {
  act(() => {
    useRealtimeStore.getState().listeners.get(type)?.forEach((handler) => handler(data));
  });
}

const known: RingingCall = {
  callId: 'call-1',
  from: '+919000009301',
  to: '+918047183303',
  routedTo: 'u1',
  routedToName: 'Priya',
  contact: { id: 'c1', name: 'Anita Rao' },
  lead: { id: 'l1', title: 'Anita Goa trip', status: 'new', value: 85000 },
  lastInteraction: { kind: 'message', text: 'Can you send the hotel options?', at: '2026-10-15T09:00:00Z' },
  ringingAt: '2026-10-15T09:30:00Z',
};

describe('CallScreenPop', () => {
  it('shows nothing until a call rings', () => {
    render(<CallScreenPop />);
    expect(screen.queryByTestId('call-screen-pop')).toBeNull();
  });

  it('shows the caller, the open lead with stage and value, and the last message', () => {
    render(<CallScreenPop />);
    push('call:ringing', known);
    expect(screen.getByTestId('call-pop-caller').textContent).toBe('Anita Rao');
    expect(screen.getByTestId('call-pop-number').textContent).toBe('+919000009301');
    expect(screen.getByTestId('call-pop-lead').textContent).toContain('Anita Goa trip');
    expect(screen.getByTestId('call-pop-last').textContent).toContain('Can you send the hotel options?');
    expect((screen.getByTestId('call-pop-open-lead') as HTMLAnchorElement).getAttribute('href')).toBe('/leads/l1');
  });

  it('calls an unknown number "Unknown number" and offers no lead link', () => {
    render(<CallScreenPop />);
    push('call:ringing', { ...known, contact: null, lead: null, lastInteraction: null });
    expect(screen.getByTestId('call-pop-caller').textContent).toBe('Unknown number');
    expect(screen.queryByTestId('call-pop-open-lead')).toBeNull();
    expect(screen.queryByTestId('call-pop-open-contact')).toBeNull();
  });

  it('hides Answer until the in-app softphone exists, and Dismiss closes the pop', () => {
    const { rerender } = render(<CallScreenPop />);
    push('call:ringing', known);
    expect(screen.queryByTestId('call-pop-answer')).toBeNull();
    fireEvent.click(screen.getByTestId('call-pop-dismiss'));
    expect(screen.queryByTestId('call-screen-pop')).toBeNull();

    const onAnswer = vi.fn();
    rerender(<CallScreenPop canAnswerInApp onAnswer={onAnswer} />);
    push('call:ringing', known);
    fireEvent.click(screen.getByTestId('call-pop-answer'));
    expect(onAnswer).toHaveBeenCalledWith(known);
  });

  it('other agents only see who it is ringing for', () => {
    render(<CallScreenPop />);
    push('call:ringing_for', { ...known, lastInteraction: null });
    expect(screen.getByTestId('call-ringing-for').textContent).toContain('Ringing for Priya');
    expect(screen.queryByTestId('call-screen-pop')).toBeNull();
  });
});

describe('call timeline entries', () => {
  it('reads the stored (snake_case) and API (camelCase) metadata alike', () => {
    const stored = parseCallMeta(JSON.stringify({ call_id: 'c', direction: 'inbound', result: 'completed', duration_seconds: 45, agent_name: 'Priya', note: null, has_recording: false }));
    const api = parseCallMeta({ callId: 'c', direction: 'inbound', result: 'completed', durationSeconds: 45, agentName: 'Priya', hasRecording: false });
    expect(stored).toEqual(api && { ...api, note: null });
    expect(callEntryTitle(stored!)).toBe('Inbound call, 45 s');
  });

  it('titles an unanswered outbound call and rejects rows that are not calls', () => {
    expect(callEntryTitle(parseCallMeta({ direction: 'outbound', result: 'no_answer' })!)).toBe('Outbound call, not answered');
    expect(parseCallMeta('not json')).toBeNull();
    expect(parseCallMeta({ status: 'x' })).toBeNull();
    expect(callEntryTitle(parseCallMeta({ direction: 'outbound', result: 'completed', durationSeconds: 125 })!)).toBe('Outbound call, 2 min 5 s');
  });
});
