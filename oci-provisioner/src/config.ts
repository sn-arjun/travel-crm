import { totalmem } from 'node:os';

export class ConfigError extends Error {}

export interface ProvisionerConfig {
  secret: string;
  dataDir: string;
  port: number;
  maxSites: number;
  /** 'shared' (default, owner decision 2026-10-21) = one WordPress Multisite network and one MariaDB for all agencies. 'container' = one WordPress and one database container per agency. */
  mode: 'container' | 'shared';
  /** Memory budget used to derive maxSites: container mode 512 MB WordPress plus 256 MB database per agency (768); shared mode about 64 MB of cache, database buffer and PHP workers per brochure site. */
  perSiteMb: number;
  reserveMb: number;
  /** Shared mode only: memory held by the one WordPress container and the one database container, whatever the number of sites. */
  sharedBaseMb: number;
  /** Shared mode: agencies get <slug>.<sitesDomain>; the network's main site lives at wpHost. */
  sitesDomain: string;
  wpHost: string;
  /** Shared mode: name of the one WordPress container, and the e-mail that owns the network. */
  wpContainer: string;
  networkAdminEmail: string;
  theme: string;
  /** Plugins network-activated once for every site. */
  plugins: string[];
  caddySitesDir: string;
  caddyContainer: string;
}

const MIN_SECRET_LENGTH = 24;
const WEAK_SECRETS = new Set(['change-me', 'changeme', 'secret', 'password', 'test']);

/** Sites that fit in memory: (total RAM minus the reserve for the host, Docker and Caddy) divided by the per-site budget. */
export function deriveMaxSites(totalBytes: number, reserveMb: number, perSiteMb: number, baseMb = 0): number {
  const usableMb = totalBytes / (1024 * 1024) - reserveMb - baseMb;
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
  const mode = (env.PROVISIONER_MODE || 'shared') as ProvisionerConfig['mode'];
  if (mode !== 'container' && mode !== 'shared') throw new ConfigError(`PROVISIONER_MODE must be container or shared, got "${mode}"`);

  const perSiteMb = positiveInt('SITE_MEMORY_MB', env.SITE_MEMORY_MB, mode === 'shared' ? 64 : 768) || (mode === 'shared' ? 64 : 768);
  const reserveMb = positiveInt('RESERVE_MB', env.RESERVE_MB, 2048);
  const sharedBaseMb = positiveInt('SHARED_BASE_MB', env.SHARED_BASE_MB, 4608);
  const explicit = env.MAX_SITES;
  const maxSites = explicit !== undefined && explicit !== ''
    ? positiveInt('MAX_SITES', explicit, 0)
    : deriveMaxSites(totalBytes, reserveMb, perSiteMb, mode === 'shared' ? sharedBaseMb : 0);
  const sitesDomain = (env.WP_SITES_DOMAIN || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  if (sitesDomain && !/^(?=.{3,200}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(sitesDomain)) {
    throw new ConfigError(`WP_SITES_DOMAIN must be a domain name, got "${env.WP_SITES_DOMAIN}"`);
  }
  const wpHost = (env.WP_NETWORK_HOST || (sitesDomain ? `network.${sitesDomain}` : '')).trim().toLowerCase();

  return {
    secret,
    dataDir: env.DATA_DIR || '/opt/wp-data',
    port: positiveInt('PORT', env.PORT, 9090),
    maxSites,
    mode,
    perSiteMb,
    reserveMb,
    sharedBaseMb,
    sitesDomain,
    wpHost,
    wpContainer: env.WP_CONTAINER || 'wp-shared',
    networkAdminEmail: (env.WP_NETWORK_ADMIN_EMAIL || '').trim(),
    theme: env.WP_THEME || 'astra',
    plugins: (env.WP_PLUGINS ?? 'elementor,contact-form-7,wordpress-seo,wp-fastest-cache').split(',').map((s) => s.trim()).filter((s) => /^[a-z0-9-]+$/.test(s)),
    caddySitesDir: env.CADDY_SITES_DIR || '/opt/caddy/sites',
    caddyContainer: env.CADDY_CONTAINER || 'caddy-proxy',
  };
}
