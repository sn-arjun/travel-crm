/**
 * The softphone state machine, pure so it can be tested without a browser.
 *
 *   unavailable   the agency has no calling, or this user may not call: nothing is registered, nothing shows
 *   idle          not registered yet
 *   registering   token fetched, signing in to the provider
 *   ready         registered, no call
 *   ringing       a call is ringing in the app (Answer / Decline)
 *   connecting    the agent answered (or the app dialled) and the audio is being set up
 *   in_call       talking; `muted`, `held` and `connectedAt` describe it
 *   error         the provider refused or the microphone was denied; `error` says why; a new registration starts over
 */

import type { SoftphoneCallInfo, SoftphoneEvent } from './index';

export type SoftphoneStatus = 'unavailable' | 'idle' | 'registering' | 'ready' | 'ringing' | 'connecting' | 'in_call' | 'error';

export interface SoftphoneState {
  status: SoftphoneStatus;
  call: SoftphoneCallInfo | null;
  muted: boolean;
  held: boolean;
  /** Epoch milliseconds when the audio connected; the in-call timer counts from here. */
  connectedAt: number | null;
  error: { code: string; message: string } | null;
}

export const initialState: SoftphoneState = { status: 'idle', call: null, muted: false, held: false, connectedAt: null, error: null };

/** Things the app does to the softphone (as opposed to what the provider reports). */
export type SoftphoneAction =
  | { type: 'unavailable' }
  | { type: 'register_requested' }
  | { type: 'answer_requested' }
  | { type: 'dial_requested'; call: SoftphoneCallInfo }
  | { type: 'reset' };

const READY: Pick<SoftphoneState, 'call' | 'muted' | 'held' | 'connectedAt'> = { call: null, muted: false, held: false, connectedAt: null };

/** True while a call is ringing, being set up or running: the UI must not tear the softphone down. */
export function isLive(state: SoftphoneState): boolean {
  return state.status === 'ringing' || state.status === 'connecting' || state.status === 'in_call';
}

export function reduce(state: SoftphoneState, input: SoftphoneEvent | SoftphoneAction, now: number = Date.now()): SoftphoneState {
  switch (input.type) {
    case 'unavailable':
      return { ...initialState, status: 'unavailable' };
    case 'reset':
      return initialState;
    case 'register_requested':
      return { ...initialState, status: 'registering' };
    case 'registered':
      // A token refresh re-registers while a call may be running: keep the call.
      return isLive(state) ? state : { ...state, ...READY, status: 'ready', error: null };
    case 'unregistered':
      return isLive(state) ? state : { ...initialState, status: state.status === 'unavailable' ? 'unavailable' : 'idle' };
    case 'incoming':
      // A second call while one is live is turned away by the implementation; the state keeps the first.
      if (isLive(state) || state.status === 'unavailable') return state;
      return { ...state, ...READY, status: 'ringing', call: input.call, error: null };
    case 'answer_requested':
      return state.status === 'ringing' ? { ...state, status: 'connecting' } : state;
    case 'dial_requested':
      return state.status === 'ready' ? { ...state, ...READY, status: 'connecting', call: input.call } : state;
    case 'connected':
      if (state.status === 'unavailable' || state.status === 'idle' || state.status === 'registering') return state;
      return { ...state, status: 'in_call', // The direction the app decided on (an agent-initiated call arrives from the provider as an incoming leg) is kept.
      call: state.call ? { ...input.call, direction: state.call.direction } : input.call, connectedAt: state.connectedAt ?? now, error: null };
    case 'disconnected':
    case 'cancelled':
      return state.status === 'unavailable' ? state : { ...state, ...READY, status: 'ready' };
    case 'muted':
      return state.status === 'in_call' || state.status === 'connecting' ? { ...state, muted: input.muted } : state;
    case 'held':
      return state.status === 'in_call' ? { ...state, held: input.held } : state;
    case 'token_expiring':
      return state;
    case 'error':
      // An error during a call ends it; an error while idle or registering parks the softphone in `error`.
      return { ...state, ...READY, status: 'error', error: { code: input.code, message: input.message } };
  }
}
