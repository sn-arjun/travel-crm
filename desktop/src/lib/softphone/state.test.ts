import { describe, it, expect } from 'vitest';
import { initialState, reduce, isLive, type SoftphoneState } from './state';
import type { SoftphoneCallInfo } from './index';

const call: SoftphoneCallInfo = { direction: 'inbound', from: '+447700900111', to: '+442030011001', providerCallId: 'CA1' };

function run(events: Parameters<typeof reduce>[1][], start: SoftphoneState = initialState, now = 1_000): SoftphoneState {
  return events.reduce((s, e) => reduce(s, e, now), start);
}

describe('softphone state machine', () => {
  it('goes idle -> registering -> ready', () => {
    expect(run([{ type: 'register_requested' }]).status).toBe('registering');
    expect(run([{ type: 'register_requested' }, { type: 'registered' }]).status).toBe('ready');
  });

  it('a call rings, is answered and connects; the timer starts when the audio connects', () => {
    const ringing = run([{ type: 'register_requested' }, { type: 'registered' }, { type: 'incoming', call }]);
    expect(ringing).toMatchObject({ status: 'ringing', call });
    const connecting = reduce(ringing, { type: 'answer_requested' });
    expect(connecting.status).toBe('connecting');
    expect(connecting.connectedAt).toBeNull();
    const talking = reduce(connecting, { type: 'connected', call }, 5_000);
    expect(talking).toMatchObject({ status: 'in_call', connectedAt: 5_000 });
    // A repeated connected event does not restart the timer.
    expect(reduce(talking, { type: 'connected', call }, 9_000).connectedAt).toBe(5_000);
  });

  it('mute and hold apply only during a call and are cleared when it ends', () => {
    const ready = run([{ type: 'register_requested' }, { type: 'registered' }]);
    expect(reduce(ready, { type: 'muted', muted: true }).muted).toBe(false);
    expect(reduce(ready, { type: 'held', held: true }).held).toBe(false);

    const talking = run([{ type: 'incoming', call }, { type: 'answer_requested' }, { type: 'connected', call }], ready);
    const muted = reduce(talking, { type: 'muted', muted: true });
    const held = reduce(muted, { type: 'held', held: true });
    expect(held).toMatchObject({ muted: true, held: true });
    expect(reduce(held, { type: 'disconnected' })).toMatchObject({ status: 'ready', call: null, muted: false, held: false, connectedAt: null });
  });

  it('a caller who gives up while it rings returns the phone to ready', () => {
    const ready = run([{ type: 'register_requested' }, { type: 'registered' }]);
    const after = run([{ type: 'incoming', call }, { type: 'cancelled' }], ready);
    expect(after).toMatchObject({ status: 'ready', call: null });
  });

  it('a second call while one is live is ignored', () => {
    const talking = run([{ type: 'register_requested' }, { type: 'registered' }, { type: 'incoming', call }, { type: 'answer_requested' }, { type: 'connected', call }]);
    const other = { ...call, from: '+447700900222', providerCallId: 'CA2' };
    expect(reduce(talking, { type: 'incoming', call: other })).toBe(talking);
    expect(isLive(talking)).toBe(true);
  });

  it('answering when nothing rings does nothing', () => {
    const ready = run([{ type: 'register_requested' }, { type: 'registered' }]);
    expect(reduce(ready, { type: 'answer_requested' })).toBe(ready);
  });

  it('a token refresh that re-registers keeps the call that is running', () => {
    const talking = run([{ type: 'register_requested' }, { type: 'registered' }, { type: 'incoming', call }, { type: 'answer_requested' }, { type: 'connected', call }]);
    expect(reduce(talking, { type: 'registered' })).toBe(talking);
    expect(reduce(talking, { type: 'unregistered' })).toBe(talking);
  });

  it('an error parks the phone in error and drops the call; registering again starts over', () => {
    const talking = run([{ type: 'register_requested' }, { type: 'registered' }, { type: 'incoming', call }, { type: 'answer_requested' }, { type: 'connected', call }]);
    const failed = reduce(talking, { type: 'error', code: '31208', message: 'Microphone blocked' });
    expect(failed).toMatchObject({ status: 'error', call: null, error: { code: '31208', message: 'Microphone blocked' } });
    expect(reduce(failed, { type: 'register_requested' })).toMatchObject({ status: 'registering', error: null });
  });

  it('unavailable stays unavailable: no event brings the phone up for an agency without calling', () => {
    const off = reduce(initialState, { type: 'unavailable' });
    expect(off.status).toBe('unavailable');
    expect(reduce(off, { type: 'incoming', call })).toBe(off);
    expect(reduce(off, { type: 'connected', call })).toBe(off);
    expect(reduce(off, { type: 'disconnected' })).toBe(off);
    expect(reduce(off, { type: 'unregistered' }).status).toBe('unavailable');
  });

  it('an outbound dial from the app connects straight away and ends back at ready', () => {
    const ready = run([{ type: 'register_requested' }, { type: 'registered' }]);
    const out = { ...call, direction: 'outbound' as const };
    const dialling = reduce(ready, { type: 'dial_requested', call: out });
    expect(dialling).toMatchObject({ status: 'connecting', call: out });
    expect(reduce(dialling, { type: 'connected', call: out }, 7).status).toBe('in_call');
    expect(reduce(dialling, { type: 'disconnected' }).status).toBe('ready');
  });
});
