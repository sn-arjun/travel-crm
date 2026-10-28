import { isTestMode } from './test-mode';

type CorsEnv = {
  CORS_ORIGINS?: string;
  ALLOW_LOOPBACK_ORIGINS?: string;
  TEST_MODE?: string;
  ENVIRONMENT?: string;
};

const DEV_ENVIRONMENTS = ['development', 'dev', 'local', 'test'];

// scheme http, host 127.0.0.1 or localhost, any port. Nothing else (no wildcards, no https, no other hosts).
const LOOPBACK_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d{1,5}$/;

/**
 * Returns the origin when it may call the API with credentials, otherwise null.
 *
 * - Web origins come from CORS_ORIGINS (comma-separated, exact match; no wildcards).
 * - Loopback origins (localhost / 127.0.0.1, any port) are allowed in development-like environments and
 *   when ALLOW_LOOPBACK_ORIGINS === 'true'. The packaged desktop app serves its UI from
 *   http://127.0.0.1:<random free port>, so production sets ALLOW_LOOPBACK_ORIGINS=true. A loopback origin
 *   can only be a page served from the user's own machine; browsers on other machines cannot use it
 *   to reach this API with someone else's cookies, and the API authenticates with bearer tokens.
 */
export function resolveCorsOrigin(origin: string | undefined, env: CorsEnv | undefined | null): string | null {
  if (!origin) return null;
  const e = env ?? {};
  const configured = (e.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (configured.includes(origin)) return origin;

  const devLike = isTestMode(e) || DEV_ENVIRONMENTS.includes(e.ENVIRONMENT ?? '');
  if ((devLike || e.ALLOW_LOOPBACK_ORIGINS === 'true') && LOOPBACK_ORIGIN.test(origin)) return origin;
  return null;
}
