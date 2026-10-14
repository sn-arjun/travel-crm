import type { Env } from '../types';

type UrlEnv = Pick<Env, 'APP_URL' | 'QUOTES_URL' | 'EMAIL_FROM' | 'EMAIL_FROM_NAME' | 'PLATFORM_SUPPORT_EMAIL'>;

const DEFAULT_APP_URL = 'http://localhost:3100';
const DEFAULT_FROM_EMAIL = 'noreply@localhost.test';
const DEFAULT_FROM_NAME = 'TravelCRM Pro';

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Address of the web/desktop app, from APP_URL. Never ends with a slash. */
export function appUrl(env: UrlEnv): string {
  return trimSlash(env.APP_URL || DEFAULT_APP_URL);
}

/** Public link to a shared quotation: QUOTES_URL, or `<app>/q`. */
export function quoteUrl(env: UrlEnv, token: string): string {
  const base = env.QUOTES_URL ? trimSlash(env.QUOTES_URL) : `${appUrl(env)}/q`;
  return `${base}/${token}`;
}

/** Sender of every system email. */
export function emailFrom(env: UrlEnv): { email: string; name: string } {
  return { email: env.EMAIL_FROM || DEFAULT_FROM_EMAIL, name: env.EMAIL_FROM_NAME || DEFAULT_FROM_NAME };
}

/** Support contact shown to tenants. Falls back to the sender address. */
export function supportEmail(env: UrlEnv): string {
  return env.PLATFORM_SUPPORT_EMAIL || emailFrom(env).email;
}
