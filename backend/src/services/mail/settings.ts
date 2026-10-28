import type { Env } from '../../types';
import { getPlatformSetting, setPlatformSetting } from '../voip/country-policy';

/**
 * R132: runtime email routing settings, editable from the super admin console (Email page) without a deploy.
 *
 * Stored in master platform_settings (R304) under email.* keys:
 *   email.system_provider   'cloudflare' | 'sendgrid'   where platform system mail goes first
 *   email.fallback          '1' | '0'                   when Cloudflare is missing or refuses, send through SendGrid instead
 *   email.inbound_enabled   '1' | '0'                   issue reply+token addresses and accept mail sent to them
 *
 * Resolution order for the provider: console setting, then the EMAIL_SYSTEM_PROVIDER variable (gen-wrangler), then the
 * built-in default 'cloudflare'. 'mock' is only ever set by the variable (local stacks) and cannot be overridden from the console.
 * Fallback and inbound have no variable: console setting, then the built-in default (on).
 *
 * The console values are cached in KV for 60 seconds and the cache is deleted on every write, so a change is live at once
 * on the isolate that took it and within a minute on the others.
 */

export type SystemProvider = 'cloudflare' | 'sendgrid';
export type SettingSource = 'console' | 'env' | 'default';

export const SETTING_KEYS = {
  systemProvider: 'email.system_provider',
  fallback: 'email.fallback',
  inboundEnabled: 'email.inbound_enabled',
} as const;

export const BUILT_IN_DEFAULTS = { systemProvider: 'cloudflare' as SystemProvider, fallback: true, inboundEnabled: true };

const CACHE_KEY = 'email:settings:v1';
export const SETTINGS_CACHE_TTL_SECONDS = 60;

export interface EmailSettings {
  /** 'mock' only when the EMAIL_SYSTEM_PROVIDER variable says so (local stacks). */
  systemProvider: SystemProvider | 'mock';
  fallback: boolean;
  inboundEnabled: boolean;
  source: { systemProvider: SettingSource; fallback: SettingSource; inboundEnabled: SettingSource };
}

interface ConsoleValues {
  systemProvider: string | null;
  fallback: string | null;
  inboundEnabled: string | null;
}

function normalizeProvider(v: string | null | undefined): SystemProvider | 'mock' | null {
  const s = (v ?? '').trim().toLowerCase();
  return s === 'cloudflare' || s === 'sendgrid' || s === 'mock' ? s : null;
}

/** The settings with nothing read from the database: variable, then built-in. Used when no database is reachable and by sync callers. */
export function envEmailSettings(env: Pick<Env, 'EMAIL_SYSTEM_PROVIDER'>): EmailSettings {
  return mergeSettings(env, { systemProvider: null, fallback: null, inboundEnabled: null });
}

function mergeSettings(env: Pick<Env, 'EMAIL_SYSTEM_PROVIDER'>, c: ConsoleValues): EmailSettings {
  const fromEnv = normalizeProvider(env.EMAIL_SYSTEM_PROVIDER);
  const fromConsole = c.systemProvider === 'cloudflare' || c.systemProvider === 'sendgrid' ? c.systemProvider : null;
  let systemProvider: EmailSettings['systemProvider'];
  let providerSource: SettingSource;
  if (fromEnv === 'mock') {
    systemProvider = 'mock';
    providerSource = 'env';
  } else if (fromConsole) {
    systemProvider = fromConsole;
    providerSource = 'console';
  } else if (fromEnv) {
    systemProvider = fromEnv;
    providerSource = 'env';
  } else {
    systemProvider = BUILT_IN_DEFAULTS.systemProvider;
    providerSource = 'default';
  }
  const flag = (raw: string | null, dflt: boolean): { value: boolean; source: SettingSource } =>
    raw === '1' || raw === '0' ? { value: raw === '1', source: 'console' } : { value: dflt, source: 'default' };
  const fb = flag(c.fallback, BUILT_IN_DEFAULTS.fallback);
  const inb = flag(c.inboundEnabled, BUILT_IN_DEFAULTS.inboundEnabled);
  return {
    systemProvider,
    fallback: fb.value,
    inboundEnabled: inb.value,
    source: { systemProvider: providerSource, fallback: fb.source, inboundEnabled: inb.source },
  };
}

async function readConsoleValues(env: Env): Promise<ConsoleValues> {
  if (env.CACHE) {
    try {
      const cached = await env.CACHE.get(CACHE_KEY);
      if (cached) return JSON.parse(cached) as ConsoleValues;
    } catch {
      // read from the database
    }
  }
  const values: ConsoleValues = {
    systemProvider: await getPlatformSetting(env, SETTING_KEYS.systemProvider),
    fallback: await getPlatformSetting(env, SETTING_KEYS.fallback),
    inboundEnabled: await getPlatformSetting(env, SETTING_KEYS.inboundEnabled),
  };
  if (env.CACHE) {
    try {
      await env.CACHE.put(CACHE_KEY, JSON.stringify(values), { expirationTtl: SETTINGS_CACHE_TTL_SECONDS });
    } catch {
      // the next read reloads
    }
  }
  return values;
}

/** The effective settings. Never throws: with no master database the variable and built-in defaults apply. */
export async function getEmailSettings(env: Env): Promise<EmailSettings> {
  if (!env.MASTER_DB) return envEmailSettings(env);
  try {
    return mergeSettings(env, await readConsoleValues(env));
  } catch (err) {
    console.error('[mail] could not read the email settings; using the defaults:', err instanceof Error ? err.message : err);
    return envEmailSettings(env);
  }
}

export interface EmailSettingsPatch {
  systemProvider?: SystemProvider;
  fallback?: boolean;
  inboundEnabled?: boolean;
}

/** Write the given settings and drop the cache. Returns the effective settings before and after. */
export async function updateEmailSettings(env: Env, patch: EmailSettingsPatch, actor: string | null): Promise<{ before: EmailSettings; after: EmailSettings }> {
  const before = await getEmailSettings(env);
  if (patch.systemProvider !== undefined) await setPlatformSetting(env, SETTING_KEYS.systemProvider, patch.systemProvider, actor);
  if (patch.fallback !== undefined) await setPlatformSetting(env, SETTING_KEYS.fallback, patch.fallback ? '1' : '0', actor);
  if (patch.inboundEnabled !== undefined) await setPlatformSetting(env, SETTING_KEYS.inboundEnabled, patch.inboundEnabled ? '1' : '0', actor);
  await invalidateEmailSettings(env);
  return { before, after: await getEmailSettings(env) };
}

export async function invalidateEmailSettings(env: Pick<Env, 'CACHE'>): Promise<void> {
  if (!env.CACHE) return;
  try {
    await env.CACHE.delete(CACHE_KEY);
  } catch {
    // the cached copy expires within a minute
  }
}
