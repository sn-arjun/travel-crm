import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import * as React from 'react';

vi.mock('@/lib/api/voip', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/voip')>('@/lib/api/voip');
  return {
    ...actual,
    voipApi: {
      ...actual.voipApi,
      token: { get: vi.fn() },
      calls: {
        ...actual.voipApi.calls,
        getById: vi.fn().mockResolvedValue({ data: { status: 'ringing' } }),
        end: vi.fn().mockResolvedValue({ data: { message: 'ok' } }),
        update: vi.fn().mockResolvedValue({ data: {} }),
        list: vi.fn().mockResolvedValue({ data: [] }),
        recordingConsent: vi.fn().mockResolvedValue({ data: { consent: 'given', recording: true } }),
      },
      recordingSettings: { ...actual.voipApi.recordingSettings, get: vi.fn() },
    },
  };
});

import { voipApi } from '@/lib/api/voip';
import { CallScreenPop, type RingingCall } from './call-screen-pop';
import { CallControlsPanel } from './call-controls-panel';
import { getSoftphoneController, resetSoftphoneController } from '@/lib/softphone/controller';
import { MockSoftphone } from '@/lib/softphone/mock-sdk';
import { useRealtimeStore } from '@/stores/realtime-store';
import { useSoftphoneStore } from '@/stores/softphone-store';

const ring: RingingCall = {
  callId: 'call-77',
  from: '+447700900111',
  to: '+442030011001',
  routedTo: 'u1',
  routedToName: 'Priya',
  contact: { id: 'c1', name: 'Anita Rao' },
  lead: { id: 'l1', title: 'Anita Goa trip', status: 'new', value: null },
  lastInteraction: null,
  ringingAt: '2026-10-20T09:30:00Z',
};

function push(type: string, data: unknown) {
  act(() => {
    useRealtimeStore.getState().listeners.get(type)?.forEach((handler) => handler(data));
  });
}

let phone: MockSoftphone;

async function startController(): Promise<void> {
  phone = new MockSoftphone();
  const controller = getSoftphoneController({
    fetchToken: async () => ({ token: 'mock.t.sig', provider: 'mock', expiresIn: 900 }),
    create: async () => phone,
  });
  await act(async () => { await controller.start(); });
}

beforeEach(() => {
  useSoftphoneStore.setState({ answered: null });
  vi.mocked(voipApi.recordingSettings.get).mockResolvedValue({ data: { consentMode: 'announce', effectiveAnnouncement: 'This call may be recorded.' } } as never);
});
afterEach(async () => {
  cleanup(); // unmount first: a mounted component would create a fresh controller when the old one is reset
  await resetSoftphoneController();
  vi.clearAllMocks();
});

describe('screen pop with the in-app phone', () => {
  it('shows Answer when the phone rings, answering connects the audio and hands the call to the in-call panel', async () => {
    await startController();
    render(<CallScreenPop />);
    push('call:ringing', ring);
    expect(screen.queryByTestId('call-pop-answer')).toBeNull(); // the phone has not rung yet

    act(() => phone.simulateIncoming({ direction: 'inbound', from: ring.from, to: ring.to, providerCallId: 'CA77' }));
    expect(screen.getByTestId('call-pop-answer')).toBeTruthy();
    expect(screen.getByTestId('call-pop-decline')).toBeTruthy();

    fireEvent.click(screen.getByTestId('call-pop-answer'));
    expect(phone.log).toContain('answer');
    expect(useSoftphoneStore.getState().answered).toMatchObject({ callId: 'call-77', contactName: 'Anita Rao', leadId: 'l1', leadTitle: 'Anita Goa trip' });
    expect(screen.queryByTestId('call-screen-pop')).toBeNull();
  });

  it('Decline turns the call away and the pop goes quiet', async () => {
    await startController();
    render(<CallScreenPop />);
    push('call:ringing', ring);
    act(() => phone.simulateIncoming({ direction: 'inbound', from: ring.from }));
    fireEvent.click(screen.getByTestId('call-pop-decline'));
    expect(phone.log).toContain('reject');
    expect(screen.queryByTestId('call-screen-pop')).toBeNull();
  });

  it('the pop goes quiet when the caller hangs up before the agent answers', async () => {
    await startController();
    render(<CallScreenPop />);
    push('call:ringing', ring);
    act(() => phone.simulateIncoming({ direction: 'inbound', from: ring.from }));
    expect(screen.getByTestId('call-screen-pop')).toBeTruthy();
    act(() => phone.simulateCancel());
    expect(screen.queryByTestId('call-screen-pop')).toBeNull();
  });

  it('with no phone registered (no calling) there is no Answer and no Decline', () => {
    render(<CallScreenPop />);
    push('call:ringing', ring);
    expect(screen.getByTestId('call-screen-pop')).toBeTruthy();
    expect(screen.queryByTestId('call-pop-answer')).toBeNull();
    expect(screen.queryByTestId('call-pop-decline')).toBeNull();
  });
});

describe('in-call panel on the softphone', () => {
  async function answeredCall() {
    await startController();
    act(() => phone.simulateIncoming({ direction: 'inbound', from: ring.from }));
    act(() => getSoftphoneController().answer());
  }

  it('connects at once for an answered inbound call and counts up; mute and hold act on the phone', async () => {
    await answeredCall();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<CallControlsPanel callId="call-77" callerName="Anita Rao" phoneNumber={ring.from} direction="inbound" viaSoftphone leadId="l1" leadTitle="Anita Goa trip" />);
      await waitFor(() => expect(screen.getByTestId('call-panel').getAttribute('data-call-status')).toBe('connected'));
      expect(screen.getByTestId('call-panel-timer').textContent).toBe('00:00');
      await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
      expect(screen.getByTestId('call-panel-timer').textContent).toBe('00:03');

      fireEvent.click(screen.getByTestId('call-panel-mute'));
      fireEvent.click(screen.getByTestId('call-panel-hold'));
      expect(phone.log).toEqual(expect.arrayContaining(['mute:true', 'hold:true']));
      expect(screen.getByTestId('call-panel').getAttribute('data-call-status')).toBe('on_hold');
    } finally {
      vi.useRealTimers();
    }
  });

  it('links the lead and keeps a note that is saved with the outcome', async () => {
    await answeredCall();
    render(<CallControlsPanel callId="call-77" callerName="Anita Rao" phoneNumber={ring.from} direction="inbound" viaSoftphone leadId="l1" leadTitle="Anita Goa trip" />);
    const link = screen.getByTestId('call-panel-lead') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/leads/l1');
    expect(link.textContent).toContain('Anita Goa trip');

    fireEvent.change(screen.getByTestId('call-panel-note'), { target: { value: 'Wants Goa in March' } });
    fireEvent.click(screen.getByTestId('call-panel-hangup'));
    await waitFor(() => expect(phone.log).toContain('hangup'));
    await waitFor(() => expect(voipApi.calls.end).toHaveBeenCalledWith('call-77'));
    fireEvent.click(await screen.findByRole('button', { name: 'Log & close' }));
    await waitFor(() => expect(voipApi.calls.update).toHaveBeenCalledWith('call-77', expect.objectContaining({ notes: 'Wants Goa in March' })));
  });

  it('the panel ends when the other side hangs up', async () => {
    await answeredCall();
    render(<CallControlsPanel callId="call-77" callerName="Anita Rao" phoneNumber={ring.from} direction="inbound" viaSoftphone />);
    await waitFor(() => expect(screen.getByTestId('call-panel').getAttribute('data-call-status')).toBe('connected'));
    act(() => phone.hangup());
    await waitFor(() => expect(screen.getByTestId('call-panel').getAttribute('data-call-status')).toBe('ended'));
    expect(await screen.findByRole('button', { name: 'Log & close' })).toBeTruthy();
  });

  it('shows the consent tick only in "on request" agencies and starts the recording when ticked', async () => {
    vi.mocked(voipApi.recordingSettings.get).mockResolvedValue({ data: { consentMode: 'on_request', effectiveAnnouncement: 'May we record?' } } as never);
    await answeredCall();
    render(<CallControlsPanel callId="call-77" callerName="Anita Rao" phoneNumber={ring.from} direction="inbound" viaSoftphone />);
    const tick = await screen.findByTestId('call-panel-consent-tick');
    await waitFor(() => expect(tick.hasAttribute('disabled')).toBe(false));
    fireEvent.click(tick);
    await waitFor(() => expect(voipApi.calls.recordingConsent).toHaveBeenCalledWith('call-77'));
  });

  it('an outbound call lets the agent mute as soon as the app is on the line, before the customer picks up; hold waits for the customer', async () => {
    await startController();
    act(() => phone.simulateIncoming({ direction: 'outbound', to: '+447700900999' }));
    act(() => getSoftphoneController().answer());
    render(<CallControlsPanel callId="call-out" callerName="Out Contact" phoneNumber="+447700900999" direction="outbound" viaSoftphone />);
    expect(screen.getByTestId('call-panel').getAttribute('data-call-status')).toBe('connecting');
    const mute = screen.getByTestId('call-panel-mute') as HTMLButtonElement;
    expect(mute.disabled).toBe(false);
    expect((screen.getByTestId('call-panel-hold') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(mute);
    expect(phone.log).toContain('mute:true');
  });

  it('shows no consent tick when the agency announces instead', async () => {
    await answeredCall();
    render(<CallControlsPanel callId="call-77" callerName="Anita Rao" phoneNumber={ring.from} direction="inbound" viaSoftphone />);
    await waitFor(() => expect(voipApi.recordingSettings.get).toHaveBeenCalled());
    expect(screen.queryByTestId('call-panel-consent')).toBeNull();
  });
});
