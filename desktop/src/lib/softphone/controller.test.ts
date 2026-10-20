import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SoftphoneController } from './controller';
import { MockSoftphone } from './mock-sdk';
import type { Softphone, SoftphoneEvent, SoftphoneListener } from './index';

const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

/** A softphone double that records what the controller asks of it and lets a test raise provider events. */
class FakeSoftphone implements Softphone {
  readonly kind = 'twilio' as const;
  listeners = new Set<SoftphoneListener>();
  calls: string[] = [];
  tokens: string[] = [];
  async register(token: string) { this.tokens.push(token); this.calls.push('register'); this.raise({ type: 'registered' }); }
  updateToken(token: string) { this.tokens.push(token); this.calls.push('updateToken'); }
  async unregister() { this.calls.push('unregister'); }
  async call() { this.calls.push('call'); }
  answer() { this.calls.push('answer'); this.raise({ type: 'connected', call: INCOMING }); }
  reject() { this.calls.push('reject'); this.raise({ type: 'cancelled' }); }
  hangup() { this.calls.push('hangup'); this.raise({ type: 'disconnected' }); }
  mute(on: boolean) { this.calls.push(`mute:${on}`); this.raise({ type: 'muted', muted: on }); }
  hold(on: boolean) { this.calls.push(`hold:${on}`); this.raise({ type: 'held', held: on }); }
  on(l: SoftphoneListener) { this.listeners.add(l); return () => this.listeners.delete(l); }
  destroy() { this.calls.push('destroy'); this.listeners.clear(); }
  raise(e: SoftphoneEvent) { this.listeners.forEach((l) => l(e)); }
}

const INCOMING = { direction: 'inbound' as const, from: '+447700900111', to: '+442030011001', providerCallId: 'CA1' };

function make(over: Partial<ConstructorParameters<typeof SoftphoneController>[0]> = {}) {
  const phone = new FakeSoftphone();
  const fetchToken = vi.fn().mockResolvedValue({ token: 'tok-1', provider: 'twilio', expiresIn: 900 });
  const controller = new SoftphoneController({ fetchToken, create: async () => phone, retryMs: 1000, ...over });
  return { phone, fetchToken, controller };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('SoftphoneController', () => {
  it('registers with the token it fetched and is ready', async () => {
    const { controller, phone, fetchToken } = make();
    await controller.start();
    expect(fetchToken).toHaveBeenCalledTimes(1);
    expect(phone.tokens).toEqual(['tok-1']);
    expect(controller.getState().status).toBe('ready');
  });

  it('an agency without calling (403) is unavailable: nothing is created, nothing retries', async () => {
    const create = vi.fn();
    const { controller, fetchToken } = make({ fetchToken: vi.fn().mockRejectedValue({ status: 403, message: 'no' }), create });
    await controller.start();
    expect(controller.getState().status).toBe('unavailable');
    expect(create).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(create).not.toHaveBeenCalled();
    void fetchToken;
  });

  it('a network failure is retried with a growing delay, then registers', async () => {
    const fetchToken = vi.fn()
      .mockRejectedValueOnce({ status: 0, message: 'down' })
      .mockResolvedValue({ token: 'tok-2', provider: 'twilio', expiresIn: 900 });
    const { controller, phone } = make({ fetchToken });
    await controller.start();
    expect(controller.getState()).toMatchObject({ status: 'error', error: { code: 'token_failed' } });
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(controller.getState().status).toBe('ready');
    expect(phone.tokens).toEqual(['tok-2']);
  });

  it('asks for a fresh token before the first expires and hands it to the SDK without dropping the call', async () => {
    const fetchToken = vi.fn()
      .mockResolvedValueOnce({ token: 'tok-1', provider: 'twilio', expiresIn: 900 })
      .mockResolvedValue({ token: 'tok-2', provider: 'twilio', expiresIn: 900 });
    const { controller, phone } = make({ fetchToken });
    await controller.start();
    phone.raise({ type: 'incoming', call: INCOMING });
    controller.answer();
    expect(controller.getState().status).toBe('in_call');
    await vi.advanceTimersByTimeAsync(900 * 1000 * 0.7 + 10);
    await flush();
    expect(phone.tokens).toEqual(['tok-1', 'tok-2']);
    expect(controller.getState().status).toBe('in_call');
  });

  it('the SDK saying the token will expire also refreshes it', async () => {
    const fetchToken = vi.fn()
      .mockResolvedValueOnce({ token: 'tok-1', provider: 'twilio', expiresIn: 900 })
      .mockResolvedValue({ token: 'tok-9', provider: 'twilio', expiresIn: 900 });
    const { controller, phone } = make({ fetchToken });
    await controller.start();
    phone.raise({ type: 'token_expiring' });
    await flush();
    expect(phone.tokens).toEqual(['tok-1', 'tok-9']);
  });

  it('calling switched off while the app is open (403 on refresh) signs the phone out', async () => {
    const fetchToken = vi.fn()
      .mockResolvedValueOnce({ token: 'tok-1', provider: 'twilio', expiresIn: 900 })
      .mockRejectedValue({ status: 403, message: 'off' });
    const { controller, phone } = make({ fetchToken });
    await controller.start();
    phone.raise({ type: 'token_expiring' });
    await flush();
    expect(controller.getState().status).toBe('unavailable');
    expect(phone.calls).toContain('unregister');
  });

  it('answer, mute, hold and hang up go to the SDK and the state follows', async () => {
    const { controller, phone } = make();
    await controller.start();
    phone.raise({ type: 'incoming', call: INCOMING });
    expect(controller.getState()).toMatchObject({ status: 'ringing', call: INCOMING });
    controller.answer();
    expect(controller.getState().status).toBe('in_call');
    controller.setMuted(true);
    controller.setHeld(true);
    expect(controller.getState()).toMatchObject({ muted: true, held: true });
    controller.hangup();
    expect(phone.calls).toEqual(['register', 'answer', 'mute:true', 'hold:true', 'hangup']);
    expect(controller.getState()).toMatchObject({ status: 'ready', muted: false, held: false });
  });

  it('declining a ringing call tells the SDK and returns to ready; answer does nothing when nothing rings', async () => {
    const { controller, phone } = make();
    await controller.start();
    controller.answer();
    expect(phone.calls).toEqual(['register']);
    phone.raise({ type: 'incoming', call: INCOMING });
    controller.reject();
    expect(phone.calls).toContain('reject');
    expect(controller.getState().status).toBe('ready');
  });

  it('the ring the server sends after the agent clicked Call is answered for them and counts as outbound', async () => {
    const { controller, phone } = make();
    await controller.start();
    controller.expectOutboundCall({ to: '+447700900999' });
    phone.raise({ type: 'incoming', call: { ...INCOMING, from: '+442030011001', to: '+447700900999' } });
    expect(phone.calls).toContain('answer');
    expect(controller.getState()).toMatchObject({ status: 'in_call', call: expect.objectContaining({ direction: 'outbound' }) });
    // The expectation is used up: the next ring is an ordinary inbound call and waits for Answer.
    controller.hangup();
    phone.raise({ type: 'incoming', call: INCOMING });
    expect(controller.getState().status).toBe('ringing');
  });

  it('an expected outbound ring that never comes does not answer a later customer call', async () => {
    const { controller, phone } = make();
    await controller.start();
    controller.expectOutboundCall({ to: '+447700900999', windowMs: 5000 });
    await vi.advanceTimersByTimeAsync(6000);
    phone.raise({ type: 'incoming', call: INCOMING });
    expect(controller.getState().status).toBe('ringing');
    expect(phone.calls).not.toContain('answer');
  });

  it('cancelExpectedCall stops the auto-answer', async () => {
    const { controller, phone } = make();
    await controller.start();
    controller.expectOutboundCall({ to: '+447700900999' });
    controller.cancelExpectedCall();
    phone.raise({ type: 'incoming', call: INCOMING });
    expect(controller.getState().status).toBe('ringing');
  });

  it('with the mock softphone the expected outbound call rings itself and is answered', async () => {
    const mock = new MockSoftphone();
    const controller = new SoftphoneController({
      fetchToken: async () => ({ token: 'mock.x.sig', provider: 'mock', expiresIn: 900 }),
      create: async () => mock,
    });
    await controller.start();
    controller.expectOutboundCall({ to: '+447700900999' });
    await vi.advanceTimersByTimeAsync(5);
    expect(controller.getState()).toMatchObject({ status: 'in_call', call: { direction: 'outbound', to: '+447700900999' } });
    expect(mock.log).toEqual(['register', 'incoming', 'answer']);
  });

  it('stop signs out, destroys the SDK and goes back to idle', async () => {
    const { controller, phone } = make();
    await controller.start();
    await controller.stop();
    expect(phone.calls).toEqual(['register', 'unregister', 'destroy']);
    expect(controller.getState().status).toBe('idle');
  });

  it('a registration that fails (microphone or credentials) shows as an error and retries', async () => {
    const phone = new FakeSoftphone();
    let attempt = 0;
    phone.register = async (token: string) => {
      attempt += 1;
      phone.tokens.push(token);
      if (attempt === 1) throw new Error('Microphone blocked');
      phone.raise({ type: 'registered' });
    };
    const { controller } = make({ create: async () => phone });
    await controller.start();
    expect(controller.getState()).toMatchObject({ status: 'error', error: { code: 'register_failed', message: 'Microphone blocked' } });
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(controller.getState().status).toBe('ready');
  });

  it('reports each provider event to listeners with the state after it', async () => {
    const { controller, phone } = make();
    await controller.start();
    const seen: string[] = [];
    controller.onEvent((e, s) => seen.push(`${e.type}:${s.status}`));
    phone.raise({ type: 'incoming', call: INCOMING });
    controller.answer();
    controller.hangup();
    expect(seen).toEqual(['incoming:ringing', 'connected:in_call', 'disconnected:ready']);
  });
});
