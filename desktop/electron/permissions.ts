/**
 * Which permission requests the app window may be granted (R307).
 *
 * The softphone needs the microphone and nothing else. The app's own page (the bundled server on the loopback
 * address, or the dev server) may use the microphone; every other permission, and every other origin (an embedded
 * frame, a page opened from a link), is refused. Camera is refused too: calls are audio only.
 */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** The origin of the app's own page: loopback hosts only, with the exact scheme and port the app was loaded from. */
export function appOrigin(appUrl: string): string | null {
  try {
    const url = new URL(appUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!LOOPBACK_HOSTS.has(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isAppOrigin(requestingUrl: string | undefined | null, appUrl: string): boolean {
  const allowed = appOrigin(appUrl);
  if (!allowed || !requestingUrl) return false;
  try {
    return new URL(requestingUrl).origin === allowed;
  } catch {
    return false;
  }
}

export interface PermissionDetails {
  /** Electron's `media` requests say which devices: 'audio' and/or 'video'. */
  mediaTypes?: Array<'audio' | 'video' | 'unknown'>;
  requestingUrl?: string;
}

/**
 * May `permission`, asked by `requestingUrl`, be granted? Only `media` for audio, only for the app's own origin.
 * (A permission *check*, which Electron makes before a request, passes `mediaType` instead of `mediaTypes`.)
 */
export function allowPermission(
  permission: string,
  requestingUrl: string | undefined | null,
  appUrl: string,
  details: PermissionDetails & { mediaType?: 'audio' | 'video' | 'unknown' } = {},
): boolean {
  if (permission !== 'media') return false;
  if (!isAppOrigin(requestingUrl, appUrl)) return false;
  if (details.mediaTypes) return details.mediaTypes.length > 0 && details.mediaTypes.every((t) => t === 'audio');
  if (details.mediaType) return details.mediaType === 'audio';
  return true;
}
