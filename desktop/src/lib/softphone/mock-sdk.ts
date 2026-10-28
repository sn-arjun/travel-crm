/**
 * The in-memory softphone used when the API reports the mock provider (VOIP_PROVIDER=mock: local stacks and e2e).
 * It never touches a microphone or the network. A call "rings" when the app calls `simulateIncoming` (the provider
 * component does so when the realtime room says a call is ringing for this agent), exactly where the real SDK
 * would raise its `incoming` event.
 */

import type { CallDirection, Softphone, SoftphoneCallInfo, SoftphoneEvent, SoftphoneKind, SoftphoneListener } from './index';

export class MockSoftphone implements Softphone {
  readonly kind: SoftphoneKind = 'mock';
  private listeners = new Set<SoftphoneListener>();
  private registered = false;
  private ringing: SoftphoneCallInfo | null = null;
  private active: SoftphoneCallInfo | null = null;
  private muted = false;
  private held = false;
  /** Every call made on this instance, newest last: lets tests assert what the UI asked for. */
  readonly log: string[] = [];
  token: string | null = null;

  private emit(event: SoftphoneEvent): void {
    this.listeners.forEach((l) => l(event));
  }

  async register(token: string): Promise<void> {
    this.token = token;
    this.registered = true;
    this.log.push('register');
    this.emit({ type: 'registered' });
  }

  updateToken(token: string): void {
    this.token = token;
    this.log.push('updateToken');
  }

  async unregister(): Promise<void> {
    this.registered = false;
    this.ringing = null;
    this.log.push('unregister');
    this.emit({ type: 'unregistered' });
  }

  async call(to: string): Promise<void> {
    if (!this.registered) throw new Error('The softphone is not registered');
    this.log.push(`call:${to}`);
    this.active = { direction: 'outbound', from: null, to, providerCallId: null };
    this.emit({ type: 'connected', call: this.active });
  }

  /** Test and provider-component hook: a call rings in the app. */
  simulateIncoming(info: Partial<SoftphoneCallInfo> & { direction?: CallDirection } = {}): void {
    if (!this.registered || this.ringing || this.active) return;
    this.ringing = { direction: info.direction ?? 'inbound', from: info.from ?? null, to: info.to ?? null, providerCallId: info.providerCallId ?? null };
    this.log.push('incoming');
    this.emit({ type: 'incoming', call: this.ringing });
  }

  /** Test hook: the caller hangs up before the agent answers. */
  simulateCancel(): void {
    if (!this.ringing) return;
    this.ringing = null;
    this.emit({ type: 'cancelled' });
  }

  answer(): void {
    if (!this.ringing) return;
    this.active = this.ringing;
    this.ringing = null;
    this.log.push('answer');
    this.emit({ type: 'connected', call: this.active });
  }

  reject(): void {
    if (!this.ringing) return;
    this.ringing = null;
    this.log.push('reject');
    this.emit({ type: 'cancelled' });
  }

  hangup(): void {
    this.ringing = null;
    if (!this.active) return;
    this.active = null;
    this.muted = false;
    this.held = false;
    this.log.push('hangup');
    this.emit({ type: 'disconnected' });
  }

  mute(on: boolean): void {
    if (!this.active) return;
    this.muted = on;
    this.log.push(`mute:${on}`);
    this.emit({ type: 'muted', muted: on });
  }

  hold(on: boolean): void {
    if (!this.active) return;
    this.held = on;
    this.log.push(`hold:${on}`);
    this.emit({ type: 'held', held: on });
    this.emit({ type: 'muted', muted: on || this.muted });
  }

  on(listener: SoftphoneListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    this.listeners.clear();
    this.registered = false;
    this.ringing = null;
    this.active = null;
  }
}
