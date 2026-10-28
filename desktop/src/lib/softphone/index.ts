/**
 * The softphone (R307): the phone inside the app that uses the computer's microphone and speakers.
 *
 * Everything the UI knows about telephony goes through the `Softphone` interface. The provider's browser SDK
 * (Twilio Voice, `provider-sdk.ts`) is loaded lazily behind it, so the app, the web build and the unit tests work
 * without a microphone or a network; `mock-sdk.ts` is the in-memory implementation used when the API reports the
 * mock provider (local stacks and e2e).
 *
 * `state.ts` is the pure state machine, `controller.ts` owns one softphone for the signed-in user (token refresh,
 * auto-answer of the call the server places for the agent) and `use-softphone.ts` is the React hook.
 */

export type SoftphoneKind = 'twilio' | 'mock';

export type CallDirection = 'inbound' | 'outbound';

/** What the softphone knows about a call; the CRM's own call record is found through `providerCallId`. */
export interface SoftphoneCallInfo {
  direction: CallDirection;
  /** The number that is calling (inbound) or the agency's number (outbound). */
  from: string | null;
  /** The number called. */
  to: string | null;
  /** The provider's id for the call (CallSid). */
  providerCallId: string | null;
}

export type SoftphoneEvent =
  | { type: 'registered' }
  | { type: 'unregistered' }
  /** A call is ringing in the app. Answer with `answer()` or turn it down with `reject()`. */
  | { type: 'incoming'; call: SoftphoneCallInfo }
  /** The audio is connected (the agent answered, or the other side picked up). */
  | { type: 'connected'; call: SoftphoneCallInfo }
  /** The call ended, whoever hung up. */
  | { type: 'disconnected' }
  /** The caller gave up before the agent answered, or another device answered. */
  | { type: 'cancelled' }
  | { type: 'muted'; muted: boolean }
  | { type: 'held'; held: boolean }
  /** The token is about to expire: ask the API for a new one and call `updateToken`. */
  | { type: 'token_expiring' }
  | { type: 'error'; code: string; message: string };

export type SoftphoneListener = (event: SoftphoneEvent) => void;

export interface Softphone {
  readonly kind: SoftphoneKind;
  /** Sign in to the provider with a token from GET /voip/token so calls to this agent ring in the app. */
  register(token: string): Promise<void>;
  /** Swap in a fresh token without dropping a call. */
  updateToken(token: string): void;
  unregister(): Promise<void>;
  /** Place a call from the app. Needs a provider application; the app normally lets the server place the call and answers the agent leg. */
  call(to: string, params?: Record<string, string>): Promise<void>;
  answer(): void;
  reject(): void;
  hangup(): void;
  mute(on: boolean): void;
  /** Hold mutes the agent's microphone and marks the call held; the provider SDK has no hold music. */
  hold(on: boolean): void;
  on(listener: SoftphoneListener): () => void;
  destroy(): void;
}

export { initialState, reduce, isLive, type SoftphoneState, type SoftphoneStatus } from './state';
export { SoftphoneController, getSoftphoneController, resetSoftphoneController } from './controller';
export { useSoftphone } from './use-softphone';

export { createSoftphone } from './factory';
