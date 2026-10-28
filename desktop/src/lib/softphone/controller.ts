/**
 * One softphone for the signed-in user: it fetches a token, registers, keeps the token fresh, runs the pure state
 * machine and answers the agent's own leg when the agent clicked Call.
 *
 * An agency without calling (or a user who may not call) gets `unavailable`: nothing is registered and the UI
 * shows nothing. The controller is plain TypeScript (no React) so it is unit-tested with a fake softphone.
 */

import { reduce, initialState, type SoftphoneAction, type SoftphoneState } from './state';
import type { Softphone, SoftphoneCallInfo, SoftphoneEvent } from './index';
import type { MockSoftphone } from './mock-sdk';
import { createSoftphone } from './factory';

export interface SoftphoneToken {
  token: string;
  /** 'twilio' | 'mock' */
  provider: string;
  /** Seconds the token lives. */
  expiresIn: number;
}

export interface ControllerDeps {
  fetchToken: () => Promise<SoftphoneToken>;
  create?: (provider: string) => Promise<Softphone>;
  /** Milliseconds before a failed token fetch or registration is tried again. */
  retryMs?: number;
}

/** An API refusal that means "this user has no calling": no retry. */
function isRefusal(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  return status === 403 || status === 404 || status === 409 || status === 422;
}

const MAX_RETRIES = 4;
/** How long after the agent clicked Call the server's ring on the app is treated as theirs and answered for them. */
export const OUTBOUND_ANSWER_WINDOW_MS = 45_000;

export class SoftphoneController {
  private state: SoftphoneState = initialState;
  private listeners = new Set<() => void>();
  private softphone: Softphone | null = null;
  private offSoftphone: (() => void) | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private running = false;
  private generation = 0;
  private autoAnswerUntil = 0;
  private callListeners = new Set<(event: SoftphoneEvent, state: SoftphoneState) => void>();

  constructor(private deps: ControllerDeps) {}

  // ── State ────────────────────────────────────────────────

  getState = (): SoftphoneState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Events as they happen (with the state after them), for components that react to a ringing or ended call. */
  onEvent(listener: (event: SoftphoneEvent, state: SoftphoneState) => void): () => void {
    this.callListeners.add(listener);
    return () => this.callListeners.delete(listener);
  }

  getSoftphone(): Softphone | null {
    return this.softphone;
  }

  private dispatch(input: SoftphoneEvent | SoftphoneAction): void {
    const next = reduce(this.state, input);
    if (next === this.state) return;
    this.state = next;
    this.listeners.forEach((l) => l());
  }

  // ── Life cycle ───────────────────────────────────────────

  /** Register for calls. Safe to call again; does nothing while running. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.retries = 0;
    await this.connect();
  }

  private async connect(): Promise<void> {
    const generation = ++this.generation;
    this.dispatch({ type: 'register_requested' });
    let issued: SoftphoneToken;
    try {
      issued = await this.deps.fetchToken();
    } catch (err) {
      if (generation !== this.generation) return;
      if (isRefusal(err)) {
        this.running = false;
        this.dispatch({ type: 'unavailable' });
        return;
      }
      this.fail('token_failed', 'The phone could not get permission to connect.');
      return;
    }
    if (generation !== this.generation) return;

    try {
      const softphone = await (this.deps.create ?? createSoftphone)(issued.provider);
      if (generation !== this.generation) {
        softphone.destroy();
        return;
      }
      this.softphone?.destroy();
      this.offSoftphone?.();
      this.softphone = softphone;
      this.offSoftphone = softphone.on((event) => this.handle(event));
      await softphone.register(issued.token);
      if (generation !== this.generation) return;
      this.retries = 0;
      this.scheduleRefresh(issued.expiresIn);
    } catch (err) {
      if (generation !== this.generation) return;
      this.fail('register_failed', (err as Error)?.message || 'The phone could not connect.');
    }
  }

  private fail(code: string, message: string): void {
    this.dispatch({ type: 'error', code, message });
    this.clearRefresh();
    if (!this.running || this.retries >= MAX_RETRIES) return;
    this.retries += 1;
    const delay = (this.deps.retryMs ?? 15_000) * this.retries;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.running) void this.connect();
    }, delay);
  }

  private clearRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }

  private scheduleRefresh(expiresIn: number): void {
    this.clearRefresh();
    // Ask for a new token well before this one runs out.
    const ms = Math.max(30_000, Math.floor(expiresIn * 1000 * 0.7));
    this.refreshTimer = setTimeout(() => void this.refreshToken(), ms);
  }

  private async refreshToken(): Promise<void> {
    if (!this.running || !this.softphone) return;
    try {
      const issued = await this.deps.fetchToken();
      this.softphone.updateToken(issued.token);
      this.scheduleRefresh(issued.expiresIn);
    } catch (err) {
      if (isRefusal(err)) {
        // Calling was switched off while the app was open: sign out of the phone, unless a call is running.
        await this.stop();
        this.dispatch({ type: 'unavailable' });
        return;
      }
      this.refreshTimer = setTimeout(() => void this.refreshToken(), this.deps.retryMs ?? 15_000);
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    this.generation += 1;
    this.clearRefresh();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.autoAnswerUntil = 0;
    const softphone = this.softphone;
    this.softphone = null;
    this.offSoftphone?.();
    this.offSoftphone = null;
    this.dispatch({ type: 'reset' });
    if (softphone) {
      try {
        await softphone.unregister();
      } catch {
        // already signed out
      }
      softphone.destroy();
    }
  }

  // ── Provider events ──────────────────────────────────────

  private handle(event: SoftphoneEvent): void {
    if (event.type === 'token_expiring') {
      void this.refreshToken();
      return;
    }
    let seen: SoftphoneEvent = event;
    if (event.type === 'incoming' && Date.now() < this.autoAnswerUntil && this.state.status === 'ready') {
      // The agent clicked Call: the server rang the app first. This is their own call, answer it for them.
      this.autoAnswerUntil = 0;
      seen = { type: 'incoming', call: { ...event.call, direction: 'outbound' } };
      this.dispatch(seen);
      this.notify(seen);
      this.answer();
      return;
    }
    this.dispatch(event);
    this.notify(seen);
  }

  private notify(event: SoftphoneEvent): void {
    this.callListeners.forEach((l) => l(event, this.state));
  }

  // ── Actions ──────────────────────────────────────────────

  answer(): void {
    if (this.state.status !== 'ringing') return;
    this.dispatch({ type: 'answer_requested' });
    this.softphone?.answer();
  }

  reject(): void {
    if (this.state.status !== 'ringing') return;
    this.softphone?.reject();
  }

  hangup(): void {
    this.softphone?.hangup();
  }

  setMuted(on: boolean): void {
    this.softphone?.mute(on);
  }

  setHeld(on: boolean): void {
    this.softphone?.hold(on);
  }

  /** The agent started a call from the app: answer the ring the server is about to send to this softphone. */
  expectOutboundCall(info: { to: string; windowMs?: number }): void {
    if (this.state.status !== 'ready') return;
    this.autoAnswerUntil = Date.now() + (info.windowMs ?? OUTBOUND_ANSWER_WINDOW_MS);
    // The mock provider rings nobody, so the mock softphone rings itself.
    const softphone = this.softphone;
    if (softphone?.kind === 'mock') {
      const call: Partial<SoftphoneCallInfo> = { direction: 'outbound', to: info.to };
      setTimeout(() => (softphone as MockSoftphone).simulateIncoming(call), 0);
    }
  }

  /** The call the agent asked for did not start (the server refused): stop waiting for its ring. */
  cancelExpectedCall(): void {
    this.autoAnswerUntil = 0;
  }

  isExpectingCall(): boolean {
    return Date.now() < this.autoAnswerUntil;
  }
}

let shared: SoftphoneController | null = null;

export function getSoftphoneController(deps?: ControllerDeps): SoftphoneController {
  if (!shared) {
    if (!deps) throw new Error('The softphone controller has not been created yet');
    shared = new SoftphoneController(deps);
  }
  return shared;
}

export function hasSoftphoneController(): boolean {
  return shared !== null;
}

export async function resetSoftphoneController(): Promise<void> {
  const current = shared;
  shared = null;
  if (current) await current.stop();
}
