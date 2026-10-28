/**
 * VoIP / messaging webhook signature middleware (inbound gateway).
 *
 * - Twilio: X-Twilio-Signature (HMAC-SHA1) against the platform TWILIO_AUTH_TOKEN, validated against the
 *   public URL (API_PUBLIC_URL + path) so a proxy in front of the Worker does not break it.
 * - Plivo: kept compiling (HMAC-SHA256 of url + nonce); no further investment (owner decision 2026-10-14).
 *
 * Outside test mode an unsigned request is always rejected. In test mode an unsigned request passes, but a
 * request that carries a signature is checked either way.
 */

import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '../types';
import { formParams, publicRequestUrl, timingSafeEqual, unsignedAllowed, verifyTwilio } from './provider-signature';

export const twilioWebhookMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
  const twilioSig = c.req.header('X-Twilio-Signature');
  const plivoSig = c.req.header('X-Plivo-Signature-V3');
  const plivoNonce = c.req.header('X-Plivo-Signature-V3-Nonce');

  if (!twilioSig && !plivoSig) {
    if (unsignedAllowed(c.env, null)) return next();
    return c.json({ error: 'Missing webhook signature' }, 403);
  }

  if (twilioSig) {
    const authToken = c.env.TWILIO_AUTH_TOKEN;
    if (!authToken) return c.json({ error: 'Twilio auth token not configured' }, 500);
    const params = await formParams(c);
    if (!(await verifyTwilio(publicRequestUrl(c), params, authToken, twilioSig))) {
      return c.json({ error: 'Invalid Twilio signature' }, 403);
    }
    return next();
  }

  // Plivo V3: HMAC-SHA256 of (url + nonce)
  const authToken = c.env.PLIVO_AUTH_TOKEN;
  if (!authToken) return c.json({ error: 'Plivo auth token not configured' }, 500);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(authToken), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(publicRequestUrl(c) + (plivoNonce || '')));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  if (!timingSafeEqual(expected, plivoSig!)) return c.json({ error: 'Invalid Plivo signature' }, 403);
  return next();
};
