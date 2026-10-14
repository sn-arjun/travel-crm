/**
 * VoIP Webhook Signature Validation Middleware
 *
 * TICKET-366: Validates webhook signatures from VoIP providers.
 * - Twilio: X-Twilio-Signature (HMAC-SHA1)
 * - Plivo: X-Plivo-Signature-V3 (HMAC-SHA256)
 *
 * Automatically detects provider based on request headers.
 */

import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '../types';
import { isTestMode } from '../utils/test-mode';

export const twilioWebhookMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
  // Allow in test mode
  if (isTestMode(c.env)) return next();

  const twilioSig = c.req.header('X-Twilio-Signature');
  const plivoSig = c.req.header('X-Plivo-Signature-V3');
  const plivoNonce = c.req.header('X-Plivo-Signature-V3-Nonce');

  if (!twilioSig && !plivoSig) {
    return c.json({ error: 'Missing webhook signature' }, 403);
  }

  // Get form-encoded body params
  const contentType = c.req.header('Content-Type') || '';
  let params: Record<string, string> = {};

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const body = await c.req.parseBody();
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string') {
        params[key] = value;
      }
    }
  }

  if (twilioSig) {
    // ── Twilio HMAC-SHA1 validation ──────────────────────────
    const authToken = c.env.TWILIO_AUTH_TOKEN;
    if (!authToken) {
      return c.json({ error: 'Twilio auth token not configured' }, 500);
    }

    const url = c.req.url;
    const sortedKeys = Object.keys(params).sort();
    let data = url;
    for (const key of sortedKeys) {
      data += key + params[key];
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(authToken),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));

    if (expected !== twilioSig) {
      return c.json({ error: 'Invalid Twilio signature' }, 403);
    }
  } else if (plivoSig) {
    // ── Plivo HMAC-SHA256 validation ─────────────────────────
    const authToken = c.env.PLIVO_AUTH_TOKEN;
    if (!authToken) {
      return c.json({ error: 'Plivo auth token not configured' }, 500);
    }

    // Plivo V3: HMAC-SHA256 of (url + nonce)
    const url = c.req.url;
    const dataToSign = url + (plivoNonce || '');

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(authToken),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(dataToSign));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));

    if (expected !== plivoSig) {
      return c.json({ error: 'Invalid Plivo signature' }, 403);
    }
  }

  return next();
};
