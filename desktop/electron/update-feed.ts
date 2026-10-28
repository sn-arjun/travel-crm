import fs from 'fs';
import path from 'path';

/** The address the builder falls back to when TRAVELCRM_UPDATE_URL was not set at build time. Never a real feed. */
export const PLACEHOLDER_FEED_HOST = 'updates.invalid';

export type FeedSource = 'env' | 'build-config';

export interface ResolvedFeed {
  url: string | null;
  source: FeedSource | null;
}

/** True for an http(s) URL that is not the build placeholder. */
export function isUsableFeedUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const u = new URL(value);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !u.hostname.endsWith(PLACEHOLDER_FEED_HOST);
  } catch {
    return false;
  }
}

function readBuildFeed(buildConfigFile: string): string | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(buildConfigFile, 'utf8'));
    const url = parsed && typeof parsed === 'object' ? (parsed as { updateUrl?: unknown }).updateUrl : undefined;
    return isUsableFeedUrl(url) ? url : null;
  } catch {
    return null;
  }
}

/**
 * The update feed: TRAVELCRM_UPDATE_URL at runtime wins (testing), otherwise the address baked into the
 * installer at build time (electron/dist/build-config.json, written by scripts/prepare-standalone.mjs from
 * TRAVELCRM_UPDATE_URL). Customer PCs have no environment variable, so the baked address is what they use.
 */
export function resolveUpdateFeed(env: NodeJS.ProcessEnv, distDir: string): ResolvedFeed {
  if (isUsableFeedUrl(env.TRAVELCRM_UPDATE_URL)) return { url: env.TRAVELCRM_UPDATE_URL, source: 'env' };
  const baked = readBuildFeed(path.join(distDir, 'build-config.json'));
  return baked ? { url: baked, source: 'build-config' } : { url: null, source: null };
}
