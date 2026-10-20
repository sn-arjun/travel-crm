import { totalmem } from 'node:os';

export class ConfigError extends Error {}

export interface ProvisionerConfig {
  secret: string;
  dataDir: string;
  port: number;
  maxSites: number;
  /** 'container' = one WordPress and one database container per agency (what is built). 'shared' = one installation for all agencies (owner question Q9, not built). */
  mode: 'container' | 'shared';
  /** Memory budget used to derive maxSites: WordPress 512 MB plus database 256 MB per agency. */
  perSiteMb: number;
  reserveMb: number;
  caddySitesDir: string;
  caddyContainer: string;
}

const MIN_SECRET_LENGTH = 24;
const WEAK_SECRETS = new Set(['change-me', 'changeme', 'secret', 'password', 'test']);

/** Sites that fit in memory: (total RAM minus the reserve for the host, Docker and Caddy) divided by the per-site budget. */
export function deriveMaxSites(totalBytes: number, reserveMb: number, perSiteMb: number): number {
  const usableMb = totalBytes / (1024 * 1024) - reserveMb;
  return Math.max(0, Math.floor(usableMb / perSiteMb));
}

function positiveInt(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new ConfigError(`${name} must be a whole number, got "${raw}"`);
  return n;
}

/** Reads the environment. Throws ConfigError (the server then exits with code 1) when PROVISIONER_SECRET is missing or weak. */
export function loadConfig(env: Record<string, string | undefined>, totalBytes: number = totalmem()): ProvisionerConfig {
  const secret = env.PROVISIONER_SECRET ?? '';
  if (!secret) {
    throw new ConfigError('PROVISIONER_SECRET is not set. Refusing to start: the provisioner never runs unauthenticated.');
  }
  if (WEAK_SECRETS.has(secret.toLowerCase()) || secret.length < MIN_SECRET_LENGTH) {
    throw new ConfigError(`PROVISIONER_SECRET is too weak (use at least ${MIN_SECRET_LENGTH} random characters, for example the output of: openssl rand -hex 32).`);
  }
  const mode = (env.PROVISIONER_MODE || 'container') as ProvisionerConfig['mode'];
  if (mode !== 'container' && mode !== 'shared') throw new ConfigError(`PROVISIONER_MODE must be container or shared, got "${mode}"`);

  const perSiteMb = positiveInt('SITE_MEMORY_MB', env.SITE_MEMORY_MB, 768) || 768;
  const reserveMb = positiveInt('RESERVE_MB', env.RESERVE_MB, 2048);
  const explicit = env.MAX_SITES;
  const maxSites = explicit !== undefined && explicit !== ''
    ? positiveInt('MAX_SITES', explicit, 0)
    : deriveMaxSites(totalBytes, reserveMb, perSiteMb);

  return {
    secret,
    dataDir: env.DATA_DIR || '/opt/wp-data',
    port: positiveInt('PORT', env.PORT, 9090),
    maxSites,
    mode,
    perSiteMb,
    reserveMb,
    caddySitesDir: env.CADDY_SITES_DIR || '/opt/caddy/sites',
    caddyContainer: env.CADDY_CONTAINER || 'caddy-proxy',
  };
}
