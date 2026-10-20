/** HTTP mapping of the errors the sub-account and number services throw (R304). Shared by routes/voip.ts and routes/admin-voip.ts. */

import type { Context } from 'hono';
import { BillingError } from '../billing/subscriptions';
import { VoipProviderError } from '../voip-base';
import { credentialsAwareErrorHandler } from '../voip-provider';
import { VoipAccountError } from './subaccounts';

function body(c: Context, status: number, message: string, code: string, details?: Record<string, unknown>) {
  return c.json({ success: false, error: { message, code, details: { code, ...(details ?? {}) } } }, status as any);
}

/** Error handler: VoipAccountError and BillingError keep their code and status; a provider failure is 409/400/502 by kind. */
export function voipErrorHandler(err: Error, c: Context): Response {
  if (err instanceof VoipAccountError) return body(c, err.status, err.message, err.code, err.details);
  if (err instanceof BillingError) return body(c, err.status, err.message, err.code);
  if (err instanceof VoipProviderError) {
    if (err.kind === 'unavailable') return body(c, 409, 'That number is not available. Search again.', 'NUMBER_UNAVAILABLE');
    if (err.kind === 'invalid_request') return body(c, 400, err.message, 'PROVIDER_REJECTED');
    return body(c, 502, err.message || 'The phone provider did not respond.', 'PROVIDER_ERROR');
  }
  return credentialsAwareErrorHandler(err, c);
}
