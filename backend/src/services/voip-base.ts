// Shared by the provider implementations. Kept out of voip-provider.ts so that file can import the
// implementations statically without a circular import.
import type { VoipProviderName } from './voip-provider';

/**
 * What went wrong, in terms callers can act on, whatever the provider's own code was:
 *  - not_implemented   the provider adapter does not support this operation (Plivo, future adapters)
 *  - auth              credentials rejected or missing
 *  - invalid_request   a number or parameter the provider refused
 *  - not_found         sub-account, number, call or recording does not exist
 *  - unavailable       number no longer available, or capacity missing
 *  - regulatory        the country needs a regulatory bundle or address before the action
 *  - rate_limited      back off and retry
 *  - provider          anything else the provider reported
 */
export type VoipErrorKind =
  | 'not_implemented'
  | 'auth'
  | 'invalid_request'
  | 'not_found'
  | 'unavailable'
  | 'regulatory'
  | 'rate_limited'
  | 'provider';

export class VoipProviderError extends Error {
  constructor(
    public readonly provider: VoipProviderName,
    public readonly code: number | string,
    message: string,
    public readonly kind: VoipErrorKind = 'provider',
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'VoipProviderError';
  }
}

/** Thrown by an adapter for a contract method it does not implement. */
export class NotImplementedForProvider extends VoipProviderError {
  constructor(provider: VoipProviderName, method: string) {
    super(provider, 'NOT_IMPLEMENTED_FOR_PROVIDER', `${method} is not implemented for this provider`, 'not_implemented');
    this.name = 'NotImplementedForProvider';
  }
}

/** Classify a provider's HTTP status into a VoipErrorKind. */
export function errorKindForStatus(status: number): VoipErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 400 && status < 500) return 'invalid_request';
  return 'provider';
}

/**
 * The ONE naming rule for a user's softphone identity. The access token grant, the `<Client>` in ring markup
 * and the agent leg of a call all use it, so a call rung to `u_...` always reaches the browser that
 * registered with the token. Hyphens are not allowed in a Twilio client name, so they are dropped.
 * Idempotent: an identity already in this form, or the legacy `user_<id>` form, maps to the same result.
 */
export function voipClientIdentity(userId: string): string {
  // The old routing code wrote `user_<id>`; it maps to the same identity as the bare id.
  const bare = userId.replace(/^user_/, '');
  if (/^u_[A-Za-z0-9]+$/.test(bare)) return bare;
  return `u_${bare.replace(/-/g, '').replace(/[^A-Za-z0-9_]/g, '_')}`;
}

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
