/**
 * Call simulator (R301, test mode only): plays a whole call as the provider would, by posting the same signed
 * form callbacks to the real callback routes in the order a provider sends them. Backend tests and the local
 * stack drive full flows (missed call to call-back task, answered call to metering) without any provider.
 *
 * The caller supplies `send`, which delivers a Request to the app (the worker's own fetch), so nothing here
 * opens a network connection.
 */

import { twilioSignature } from '../../middleware/provider-signature';

export const VOIP_SCENARIOS = [
  'inbound_answered',
  'inbound_missed',
  'inbound_voicemail',
  'outbound_answered',
  'outbound_no_answer',
] as const;
export type VoipScenario = (typeof VOIP_SCENARIOS)[number];

export interface SimulateOptions {
  scenario: VoipScenario;
  /** Inbound: the agency's number. Outbound: the customer. */
  to: string;
  /** Inbound: the caller. Outbound: the agency's number. */
  from: string;
  durationSeconds?: number;
  /** Provider call id. Outbound scenarios should pass the id placeCall returned; otherwise one is made up. */
  callSid?: string;
  /** Origin the provider would call, no trailing slash, e.g. API_PUBLIC_URL or http://localhost. */
  baseUrl: string;
  /** The token the callbacks are signed with: the workspace's provider token, else the platform's. */
  authToken: string;
  send: (request: Request) => Promise<Response>;
}

export interface SimulatedStep {
  path: string;
  fields: Record<string, string>;
  status: number;
}

export interface SimulationResult {
  scenario: VoipScenario;
  callSid: string;
  steps: SimulatedStep[];
}

let simCounter = 0;

/** The ordered callbacks of one scenario (paths are relative to /api/v1/voip). */
export function scenarioSteps(
  scenario: VoipScenario,
  p: { callSid: string; to: string; from: string; durationSeconds: number },
): Array<{ path: string; fields: Record<string, string> }> {
  const { callSid, to, from } = p;
  const base = { CallSid: callSid, To: to, From: from };
  const status = (CallStatus: string, extra: Record<string, string> = {}) => ({
    path: '/status-callback',
    fields: { ...base, CallStatus, ...extra },
  });
  const duration = String(Math.max(0, Math.floor(p.durationSeconds)));

  switch (scenario) {
    case 'inbound_answered':
      return [
        { path: '/twiml/inbound', fields: { ...base, CallStatus: 'ringing', Direction: 'inbound' } },
        status('ringing', { Direction: 'inbound' }),
        status('in-progress', { Direction: 'inbound' }),
        status('completed', { Direction: 'inbound', CallDuration: duration }),
      ];
    case 'inbound_missed':
      return [
        { path: '/twiml/inbound', fields: { ...base, CallStatus: 'ringing', Direction: 'inbound' } },
        status('ringing', { Direction: 'inbound' }),
        status('no-answer', { Direction: 'inbound', CallDuration: '0' }),
      ];
    case 'inbound_voicemail':
      return [
        { path: '/twiml/inbound', fields: { ...base, CallStatus: 'ringing', Direction: 'inbound' } },
        status('ringing', { Direction: 'inbound' }),
        {
          path: '/recording-callback',
          fields: {
            ...base,
            RecordingSid: `RE${callSid.slice(2)}`,
            RecordingUrl: `https://api.twilio.com/2010-04-01/Accounts/ACsim/Recordings/RE${callSid.slice(2)}`,
            RecordingDuration: duration,
          },
        },
        status('completed', { Direction: 'inbound', CallDuration: duration }),
      ];
    case 'outbound_answered':
      return [
        status('queued', { Direction: 'outbound-api' }),
        status('ringing', { Direction: 'outbound-api' }),
        status('in-progress', { Direction: 'outbound-api' }),
        status('completed', { Direction: 'outbound-api', CallDuration: duration }),
      ];
    case 'outbound_no_answer':
      return [
        status('queued', { Direction: 'outbound-api' }),
        status('ringing', { Direction: 'outbound-api' }),
        status('no-answer', { Direction: 'outbound-api', CallDuration: '0' }),
      ];
  }
}

/** Play a scenario against the callback routes, signing every callback, and report what each answered. */
export async function simulateVoipScenario(opts: SimulateOptions): Promise<SimulationResult> {
  const callSid = opts.callSid || `CAsim${String(++simCounter).padStart(8, '0')}${'0'.repeat(20)}`;
  const base = opts.baseUrl.replace(/\/+$/, '');
  const defaultDuration = opts.scenario.endsWith('answered') ? 45 : opts.scenario === 'inbound_voicemail' ? 20 : 0;
  const steps: SimulatedStep[] = [];

  for (const step of scenarioSteps(opts.scenario, {
    callSid,
    to: opts.to,
    from: opts.from,
    durationSeconds: opts.durationSeconds ?? defaultDuration,
  })) {
    const signature = await twilioSignature(`${base}/api/v1/voip${step.path}`, step.fields, opts.authToken);
    const res = await opts.send(
      new Request(`${base}/api/v1/voip${step.path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': signature },
        body: new URLSearchParams(step.fields).toString(),
      }),
    );
    steps.push({ path: step.path, fields: step.fields, status: res.status });
  }
  return { scenario: opts.scenario, callSid, steps };
}
