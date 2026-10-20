import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import type { ProvisionerConfig } from './config.ts';
import { setupWordPress, defaultRunner, type Runner } from './wp-setup.ts';

/**
 * Site lifecycle for the provisioner (R309).
 *
 * Idempotency: one site per slug. POST /sites for a slug that is active or already being built returns the
 * current state and does nothing; for a slug whose last attempt failed it restarts the build, reusing the
 * database password saved in the slug's state file (the database files on disk were created with it).
 * The build runs in the background; the CRM learns the outcome from the POST answer on its next delivery or
 * from GET /sites/:slug.
 *
 * Shapes (owner question Q9): this class is the "container per agency" shape (PROVISIONER_MODE=container).
 * The default shape, one shared WordPress Multisite, is SharedSiteManager in shared-sites.ts: it extends
 * this class, reuses the state files and answers the same state document; the HTTP contract, the signing
 * and the CRM side do not change.
 */

export type SiteStatus = 'provisioning' | 'active' | 'failed' | 'stopped';

export interface SiteState {
  slug: string;
  /** The CRM's wordpress_sites id, echoed back so the CRM can match the answer. */
  siteId: string;
  status: SiteStatus;
  domain: string;
  siteUrl: string;
  adminUrl: string;
  containerId: string;
  port: number | null;
  error: string | null;
  resetEmailSent: boolean | null;
  /** Additive: which driver built the site. Older state files have no value, which means 'container'. */
  mode?: 'container' | 'shared';
  /** Shared mode: the WordPress network's numeric id of the site. */
  blogId?: number | null;
  createdAt: string;
  updatedAt: string;
  /** Never sent to the CRM: stored on disk only. */
  dbPassword?: string;
}

export interface SiteRequest {
  siteId: string;
  slug: string;
  domain: string;
  companyName: string;
  adminEmail: string;
  minimal?: boolean;
}

export class SiteError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;
const HOSTNAME = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function validateRequest(body: unknown): SiteRequest {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === 'string' ? (b[k] as string).trim() : '');
  const req: SiteRequest = {
    siteId: str('siteId'),
    slug: str('slug'),
    domain: str('domain').toLowerCase(),
    companyName: str('companyName'),
    adminEmail: str('adminEmail'),
    minimal: b.minimal === true,
  };
  if (!req.siteId || req.siteId.length > 64) throw new SiteError('siteId is required', 400);
  if (!SLUG.test(req.slug)) throw new SiteError('slug must be 3-40 characters: a-z, 0-9 and hyphens', 400);
  if (!HOSTNAME.test(req.domain)) throw new SiteError('domain must be a host name', 400);
  if (req.companyName.length < 1 || req.companyName.length > 120) throw new SiteError('companyName is required (up to 120 characters)', 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.adminEmail) || req.adminEmail.length > 200 || req.adminEmail.startsWith('-')) throw new SiteError('adminEmail is not a valid address', 400);
  return req;
}

export function publicView(state: SiteState): Omit<SiteState, 'dbPassword'> {
  const { dbPassword: _omit, ...rest } = state;
  return rest;
}

export class SiteManager {
  protected readonly states = new Map<string, SiteState>();
  protected readonly running = new Set<string>();

  protected readonly config: ProvisionerConfig;
  protected readonly run: Runner;
  protected readonly now: () => string;

  constructor(config: ProvisionerConfig, run: Runner = defaultRunner, now: () => string = () => new Date().toISOString()) {
    this.config = config;
    this.run = run;
    this.now = now;
  }

  protected statePath(slug: string): string {
    return `${this.config.dataDir}/${slug}/state.json`;
  }

  protected async load(slug: string): Promise<SiteState | null> {
    const cached = this.states.get(slug);
    if (cached) return cached;
    try {
      const state = JSON.parse(await fs.readFile(this.statePath(slug), 'utf8')) as SiteState;
      // A build that was running when the process died is not running any more.
      if (state.status === 'provisioning' && !this.running.has(slug)) {
        state.status = 'failed';
        state.error = 'Provisioner restarted while building this site';
      }
      this.states.set(slug, state);
      return state;
    } catch {
      return null;
    }
  }

  protected async save(state: SiteState): Promise<void> {
    state.updatedAt = this.now();
    this.states.set(state.slug, state);
    await fs.mkdir(`${this.config.dataDir}/${state.slug}`, { recursive: true });
    await fs.writeFile(this.statePath(state.slug), JSON.stringify(state, null, 2), { mode: 0o600 });
  }

  /** True for a host name this provisioner serves: the network's main host or a known agency site. Used by Caddy's on-demand TLS check. */
  async hostKnown(host: string): Promise<boolean> {
    const h = host.trim().toLowerCase();
    if (!h) return false;
    if (this.config.wpHost && h === this.config.wpHost) return true;
    const slug = h.split('.')[0];
    const state = await this.get(slug);
    return !!state && state.domain === h && state.status !== 'failed';
  }

  async get(slug: string): Promise<SiteState | null> {
    if (!SLUG.test(slug)) return null;
    return this.load(slug);
  }

  protected async countLive(excludingSlug: string): Promise<number> {
    let n = 0;
    for (const [slug, s] of this.states) {
      if (slug !== excludingSlug && (s.status === 'active' || s.status === 'provisioning')) n += 1;
    }
    try {
      for (const entry of await fs.readdir(this.config.dataDir)) {
        if (entry === excludingSlug || this.states.has(entry)) continue;
        const s = await this.load(entry);
        if (s && (s.status === 'active' || s.status === 'provisioning')) n += 1;
      }
    } catch {
      // data dir not created yet
    }
    return n;
  }

  /** Create the site, or return what already exists. The second value says whether a build was started by this call. */
  async ensure(req: SiteRequest): Promise<{ state: SiteState; started: boolean }> {
    const existing = await this.load(req.slug);
    if (existing) {
      if (existing.siteId !== req.siteId) {
        throw new SiteError(`slug ${req.slug} already belongs to another site`, 409);
      }
      if (existing.status === 'active' || existing.status === 'stopped' || existing.status === 'provisioning') {
        return { state: existing, started: false };
      }
      // failed: fall through and rebuild
    }
    if ((await this.countLive(req.slug)) >= this.config.maxSites) {
      throw new SiteError(`Site limit reached (${this.config.maxSites}); raise MAX_SITES or add memory`, 503);
    }

    const state: SiteState = {
      slug: req.slug,
      siteId: req.siteId,
      status: 'provisioning',
      domain: req.domain,
      siteUrl: `https://${req.domain}`,
      adminUrl: `https://${req.domain}/wp-admin/`,
      containerId: `wp-site-${req.slug}`,
      mode: 'container',
      port: existing?.port ?? null,
      error: null,
      resetEmailSent: null,
      createdAt: existing?.createdAt ?? this.now(),
      updatedAt: this.now(),
      dbPassword: existing?.dbPassword ?? randomBytes(16).toString('hex'),
    };
    await this.save(state);
    this.running.add(req.slug);
    void this.build(state, req).finally(() => this.running.delete(req.slug));
    return { state, started: true };
  }

  /** Resolves when the background build for this slug has finished (used by tests). */
  async settled(slug: string): Promise<void> {
    while (this.running.has(slug)) await new Promise((r) => setTimeout(r, 10));
  }

  private async build(state: SiteState, req: SiteRequest): Promise<void> {
    const { slug } = state;
    const dataDir = `${this.config.dataDir}/${slug}`;
    try {
      await fs.mkdir(`${dataDir}/db`, { recursive: true });
      await fs.mkdir(`${dataDir}/uploads`, { recursive: true });

      if (state.port === null) state.port = await this.findAvailablePort(8080, 9000);
      await fs.writeFile(`${dataDir}/docker-compose.yml`, composeFile(slug, dataDir, state.port, state.dbPassword as string), { mode: 0o600 });

      await this.run('docker', ['network', 'create', 'wp-network']).catch(() => undefined); // exists already
      await this.run('docker', ['compose', '-f', `${dataDir}/docker-compose.yml`, 'up', '-d']);
      await this.updateCaddy(slug, req.domain, state.port);

      const result = await setupWordPress(
        { slug, domain: req.domain, companyName: req.companyName, ownerEmail: req.adminEmail, minimal: req.minimal },
        this.run,
      );
      state.status = 'active';
      state.error = null;
      state.resetEmailSent = result.resetEmailSent;
    } catch (e) {
      state.status = 'failed';
      state.error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      console.error(`Provisioning ${slug} failed:`, state.error);
    }
    await this.save(state);
  }

  async stop(slug: string): Promise<SiteState | null> {
    const state = await this.get(slug);
    if (!state) return null;
    await this.run('docker', ['stop', `wp-site-${slug}`, `wp-db-${slug}`]);
    state.status = 'stopped';
    await this.save(state);
    return state;
  }

  async start(slug: string): Promise<SiteState | null> {
    const state = await this.get(slug);
    if (!state) return null;
    await this.run('docker', ['start', `wp-db-${slug}`, `wp-site-${slug}`]);
    state.status = 'active';
    await this.save(state);
    return state;
  }

  /** Removes the containers. The data folder stays (backups, accidental delete); remove it by hand. */
  async destroy(slug: string): Promise<boolean> {
    const state = await this.get(slug);
    if (!state) return false;
    await this.run('docker', ['rm', '-f', `wp-site-${slug}`, `wp-db-${slug}`]);
    try {
      await fs.unlink(`${this.config.caddySitesDir}/${slug}.caddy`);
      await this.run('docker', ['exec', this.config.caddyContainer, 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile']);
    } catch {
      // no Caddy file
    }
    this.states.delete(slug);
    await fs.rm(this.statePath(slug), { force: true });
    return true;
  }

  async liveCount(): Promise<number> {
    return this.countLive('');
  }

  private async findAvailablePort(start: number, end: number): Promise<number> {
    const out = await this.run('docker', ['ps', '--format', '{{.Ports}}']);
    const used = new Set<number>();
    for (const m of out.matchAll(/(?:0\.0\.0\.0|127\.0\.0\.1):(\d+)/g)) used.add(Number(m[1]));
    for (const s of this.states.values()) if (s.port) used.add(s.port);
    for (let port = start; port <= end; port++) if (!used.has(port)) return port;
    throw new Error('No available ports');
  }

  private async updateCaddy(slug: string, domain: string, port: number): Promise<void> {
    const snippet = `${domain} {
  reverse_proxy localhost:${port}
  encode gzip
  header {
    X-Content-Type-Options nosniff
    X-Frame-Options SAMEORIGIN
    Referrer-Policy strict-origin-when-cross-origin
  }
}
`;
    try {
      await fs.mkdir(this.config.caddySitesDir, { recursive: true });
      await fs.writeFile(`${this.config.caddySitesDir}/${slug}.caddy`, snippet);
      await this.run('docker', ['exec', this.config.caddyContainer, 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile']);
    } catch (e) {
      console.warn('Failed to update Caddy config:', (e as Error).message);
    }
  }
}

function composeFile(slug: string, dataDir: string, port: number, dbPassword: string): string {
  return `services:
  db:
    image: mariadb:10.11
    container_name: wp-db-${slug}
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${dbPassword}
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wp_user
      MYSQL_PASSWORD: ${dbPassword}
    volumes:
      - ${dataDir}/db:/var/lib/mysql
    networks:
      - wp-network
    deploy:
      resources:
        limits:
          memory: 256M

  wordpress:
    image: wordpress:6-php8.2-apache
    container_name: wp-site-${slug}
    restart: unless-stopped
    depends_on:
      - db
    environment:
      WORDPRESS_DB_HOST: wp-db-${slug}
      WORDPRESS_DB_USER: wp_user
      WORDPRESS_DB_PASSWORD: ${dbPassword}
      WORDPRESS_DB_NAME: wordpress
    ports:
      - "127.0.0.1:${port}:80"
    volumes:
      - ${dataDir}/uploads:/var/www/html/wp-content/uploads
    networks:
      - wp-network
    deploy:
      resources:
        limits:
          memory: 512M

networks:
  wp-network:
    external: true
`;
}
