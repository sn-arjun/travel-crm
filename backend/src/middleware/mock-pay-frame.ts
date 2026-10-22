import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';
import { appUrl } from '../utils/app-urls';
import { isTestMode } from '../utils/test-mode';

/** The test gateway's pay page (R142), under /api[/v1]/webhooks/payments/mock-pay/<tenant key>/<link>. */
const MOCK_PAY_PATH = /^\/api(\/v1)?\/webhooks\/payments\/mock-pay\//;

export const isMockPayPath = (path: string): boolean => MOCK_PAY_PATH.test(path);

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * R164-4: the films show the test gateway's pay page inside a phone frame that lives on the web app's origin, but every API
 * response says X-Frame-Options: SAMEORIGIN. Only in test mode and only for the mock pay page, swap it for a CSP
 * frame-ancestors that allows this API's own origin and the web app's origin (APP_URL). Production keeps its headers untouched
 * (and the mock routes are 404 there). Registered before secureHeaders so it runs after it on the way out.
 */
export const mockPayFrameHeaders: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  await next();
  if (!isMockPayPath(c.req.path) || !isTestMode(c.env)) return;
  const ancestors = [...new Set(["'self'", originOf(c.req.url), originOf(appUrl(c.env))].filter((v): v is string => !!v))];
  c.res.headers.delete('X-Frame-Options');
  c.res.headers.set('Content-Security-Policy', `frame-ancestors ${ancestors.join(' ')}`);
};
