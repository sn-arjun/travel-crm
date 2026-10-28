/**
 * PLACEHOLDER DOMAIN. The owner has not chosen a domain yet (docs/GO-LIVE.md phase 0).
 * This is the ONE place the console names it. Everything else is derived:
 *   - the API address (api.<domain>) when BACKEND_API_URL is not set,
 *   - the agency web app address (app.<domain>) used by "log in as" when NEXT_PUBLIC_DESKTOP_URL is not set,
 *   - the subdomain suffix and example addresses shown in the screens.
 * Override at build time with NEXT_PUBLIC_PLATFORM_DOMAIN instead of editing this file.
 */
export const PLACEHOLDER_DOMAIN = 'YOUR-DOMAIN.example';

export const PLATFORM_DOMAIN: string = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || PLACEHOLDER_DOMAIN;

export function derivedApiUrl(domain: string = PLATFORM_DOMAIN): string {
  return `https://api.${domain}/api/v1`;
}

export function derivedAppUrl(domain: string = PLATFORM_DOMAIN): string {
  return `https://app.${domain}`;
}
