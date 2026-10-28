/**
 * The Twilio Voice browser SDK behind the `Softphone` interface (R307).
 *
 * The SDK is imported when the softphone is first needed, never at load time, so the app, the web build and the
 * unit tests work without a microphone or a network. Only this file knows the SDK's names.
 *
 * Calls reach the agent in two ways, both as an `incoming` call on the Device: a customer ringing the agency's
 * number, and the agent clicking Call (the server rings the agent's app first, then dials the customer; the app
 * answers that agent leg by itself, see controller.ts). `call()` places a call from the app directly and works
 * only when the agency's token carries an outgoing application (it does not today).
 */

import type { Call, Device } from '@twilio/voice-sdk';
import type { Softphone, SoftphoneCallInfo, SoftphoneEvent, SoftphoneKind, SoftphoneListener } from './index';

/** Twilio error codes that mean the person cannot use the phone until something changes (not a blip to retry). */
const FATAL_CODES = new Set([
  20101, 20102, 20103, 20104, 20105, 20106, // access token invalid, expired, malformed, signature
  31201, 31202, // unauthorized / authentication failed
  31204, 31205, 31206, // invalid JWT
  31208, // the user denied access to the microphone
  31003, // connection lost
]);

function infoFor(call: Call, fallback: 'inbound' | 'outbound'): SoftphoneCallInfo {
  const params = (call.parameters ?? {}) as Record<string, string>;
  const direction = call.direction === 'OUTGOING' ? 'outbound' : call.direction === 'INCOMING' ? 'inbound' : fallback;
  return {
    direction,
    from: params.From ?? null,
    to: params.To ?? call.customParameters?.get?.('To') ?? null,
    providerCallId: params.CallSid ?? null,
  };
}

export class TwilioSoftphone implements Softphone {
  readonly kind: SoftphoneKind = 'twilio';
  private device: Device | null = null;
  private current: Call | null = null;
  private listeners = new Set<SoftphoneListener>();
  private held = false;

  private emit(event: SoftphoneEvent): void {
    this.listeners.forEach((l) => l(event));
  }

  async register(token: string): Promise<void> {
    const { Device } = await import('@twilio/voice-sdk');
    this.device?.destroy();
    const device = new Device(token, {
      closeProtection: false,
      logLevel: 'error',
      codecPreferences: ['opus', 'pcmu'] as never,
    });
    this.device = device;

    device.on('registered', () => this.emit({ type: 'registered' }));
    device.on('unregistered', () => this.emit({ type: 'unregistered' }));
    device.on('tokenWillExpire', () => this.emit({ type: 'token_expiring' }));
    device.on('incoming', (call: Call) => {
      if (this.current) {
        // One call at a time: a second caller is turned away rather than ringing under the first.
        call.reject();
        return;
      }
      this.attach(call, 'inbound');
      this.emit({ type: 'incoming', call: infoFor(call, 'inbound') });
    });
    device.on('error', (err: { code?: number; message?: string }) => {
      const code = err.code ?? 0;
      if (!FATAL_CODES.has(code)) return; // warnings and call-level hiccups are not worth interrupting the agent for
      this.emit({ type: 'error', code: String(code), message: err.message ?? 'The phone could not connect.' });
    });

    await device.register();
  }

  private attach(call: Call, fallback: 'inbound' | 'outbound'): void {
    this.current = call;
    this.held = false;
    call.on('accept', () => this.emit({ type: 'connected', call: infoFor(call, fallback) }));
    call.on('disconnect', () => this.finish(call, { type: 'disconnected' }));
    call.on('cancel', () => this.finish(call, { type: 'cancelled' }));
    call.on('reject', () => this.finish(call, { type: 'cancelled' }));
    call.on('mute', (isMuted: boolean) => this.emit({ type: 'muted', muted: isMuted }));
    call.on('error', (err: { code?: number; message?: string }) => {
      this.finish(call, { type: 'error', code: String(err.code ?? 0), message: err.message ?? 'The call failed.' });
    });
  }

  private finish(call: Call, event: SoftphoneEvent): void {
    if (this.current !== call) return;
    this.current = null;
    this.held = false;
    this.emit(event);
  }

  updateToken(token: string): void {
    this.device?.updateToken(token);
  }

  async unregister(): Promise<void> {
    this.current?.disconnect();
    this.current = null;
    if (this.device) {
      try {
        await this.device.unregister();
      } catch {
        // already signed out
      }
    }
  }

  async call(to: string, params: Record<string, string> = {}): Promise<void> {
    if (!this.device) throw new Error('The softphone is not registered');
    const call = await this.device.connect({ params: { To: to, ...params } });
    this.attach(call, 'outbound');
  }

  answer(): void {
    this.current?.accept();
  }

  reject(): void {
    this.current?.reject();
  }

  hangup(): void {
    if (this.current) this.current.disconnect();
  }

  mute(on: boolean): void {
    this.current?.mute(on);
  }

  hold(on: boolean): void {
    if (!this.current) return;
    this.held = on;
    this.current.mute(on);
    this.emit({ type: 'held', held: this.held });
  }

  on(listener: SoftphoneListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    this.listeners.clear();
    this.current = null;
    this.device?.destroy();
    this.device = null;
  }
}
