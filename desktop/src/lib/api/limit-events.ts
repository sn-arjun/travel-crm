/**
 * Plan limits (R110). The API answers 402 with code ALLOWANCE_EXHAUSTED (a monthly SMS / WhatsApp / email / login
 * code / call-minute allowance is used up) or SEAT_LIMIT (no free user seat). The API client turns either into a
 * window event; <LimitReachedHost /> (mounted once in the app layout) shows the upgrade / buy-credits dialog.
 */

export const LIMIT_EVENT = 'travelcrm:limit-reached';

export interface LimitPack {
  key: string;
  name: string;
  units: number;
  price: number;
  currency: string;
}

export interface LimitInfo {
  code: 'ALLOWANCE_EXHAUSTED' | 'SEAT_LIMIT';
  message: string;
  channel?: string;
  used?: number;
  allowance?: number;
  limit?: number;
  options: string[];
  upgradeTo?: { key: string; name: string; allowance: number } | null;
  addons: LimitPack[];
}

export function isLimitBody(body: Record<string, unknown>): boolean {
  const code = body.code ?? (body.error as { code?: string } | undefined)?.code;
  return code === 'ALLOWANCE_EXHAUSTED' || code === 'SEAT_LIMIT';
}

export function toLimitInfo(body: Record<string, unknown>): LimitInfo {
  const nested = (body.error ?? {}) as Record<string, unknown>;
  const code = (body.code ?? nested.code) as LimitInfo['code'];
  return {
    code,
    message: String(body.message ?? nested.message ?? 'You have reached a limit of your plan.'),
    channel: body.channel as string | undefined,
    used: body.used as number | undefined,
    allowance: body.allowance as number | undefined,
    limit: body.limit as number | undefined,
    options: Array.isArray(body.options) ? (body.options as string[]) : ['upgrade'],
    upgradeTo: (body.upgradeTo as LimitInfo['upgradeTo']) ?? null,
    addons: Array.isArray(body.addons) ? (body.addons as LimitPack[]) : [],
  };
}

export function emitLimitReached(body: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<LimitInfo>(LIMIT_EVENT, { detail: toLimitInfo(body) }));
}
