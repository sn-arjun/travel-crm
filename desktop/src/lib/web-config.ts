/**
 * Request-time configuration of the agency WEB app (Cloudflare Worker vars, read from process.env).
 * Server-side only. The Electron build never calls these: it gets its API address from the preload/runtime config.
 *
 * PLATFORM_DOMAIN (desktop/wrangler.toml) is the single place the web app names the public domain; the API
 * address and the downloads folder are derived from it unless set explicitly.
 */

export interface WebConfig {
  /** True when the domain is still the placeholder (the owner has not chosen one). */
  domainIsPlaceholder: boolean;
  domain: string;
  apiUrl: string;
  /** Folder that holds latest.yml and the installer, e.g. https://downloads.<domain>/win/ */
  downloadsBase: string;
  installerUrl: string | null;
  driverAppUrl: string | null;
}

export const PLACEHOLDER_DOMAIN = 'YOUR-DOMAIN.example';

const val = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

const httpUrl = (v: string | undefined): string | null => {
  const t = val(v);
  if (!t) return null;
  try {
    const u = new URL(t);
    return u.protocol === 'https:' || u.protocol === 'http:' ? t : null;
  } catch {
    return null;
  }
};

export function readWebConfig(env: Record<string, string | undefined> = process.env): WebConfig {
  const domain = val(env.PLATFORM_DOMAIN) ?? PLACEHOLDER_DOMAIN;
  return {
    domainIsPlaceholder: domain === PLACEHOLDER_DOMAIN,
    domain,
    apiUrl: (httpUrl(env.TRAVELCRM_API_URL) ?? `https://api.${domain}/api/v1`).replace(/\/+$/, ''),
    downloadsBase: `https://downloads.${domain}/win/`,
    installerUrl: httpUrl(env.INSTALLER_URL),
    driverAppUrl: httpUrl(env.DRIVER_APP_URL),
  };
}

/** True in the website build (set by next.config.ts, inlined at build time). */
export const isWebTarget = process.env.NEXT_PUBLIC_TRAVELCRM_TARGET === 'web';
