import type { Env } from '../../types';
import { RazorpayGateway } from './razorpay';
import { StripeGateway } from './stripe';
import { MockGateway } from './mock';
import { gatewayIdForCountry, isGatewayId, type BillingGateway, type FetchLike, type GatewayId } from './gateway';

/** The gateway implementation for an id. `fetchImpl` lets tests stand in for the provider's REST API. */
export function createGateway(env: Env, id: GatewayId, fetchImpl?: FetchLike): BillingGateway {
  switch (id) {
    case 'stripe': return new StripeGateway(env, fetchImpl);
    case 'razorpay': return new RazorpayGateway(env, fetchImpl);
    case 'mock': return new MockGateway(env);
  }
}

/** The gateway that collects from an agency in this country (Razorpay for India, Stripe elsewhere, BILLING_GATEWAY=mock overrides). */
export function gatewayForCountry(env: Env, country: string | null | undefined, fetchImpl?: FetchLike): BillingGateway {
  return createGateway(env, gatewayIdForCountry(env, country), fetchImpl);
}

export function gatewayFromParam(env: Env, param: string, fetchImpl?: FetchLike): BillingGateway | null {
  return isGatewayId(param) ? createGateway(env, param, fetchImpl) : null;
}
