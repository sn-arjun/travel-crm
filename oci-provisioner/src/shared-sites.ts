import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import type { ProvisionerConfig } from './config.ts';
import { defaultRunner, type Runner } from './wp-setup.ts';
import { SiteManager, SiteError, type SiteRequest, type SiteState } from './sites.ts';

/**
 * Shared shape (owner decision 2026-10-21): ONE WordPress Multisite network (subdomain install) in one
 * container, ONE MariaDB for the network. An agency is a site inside it.
 *
 * Same HTTP contract and state document as the container driver (SiteManager):
 *   POST /sites  -> `wp site create` in the shared container + the agency admin; idempotent per slug
 *   stop         -> `wp site archive`      (visitors see the "archived" page; data stays)
 *   start        -> `wp site unarchive`
 *   DELETE       -> `wp site delete --yes` (tables and uploads of that site are removed)
 *
 * Every wp-cli call is `docker exec <container> wp ... ` through the Runner: an argument list, never a
 * shell, so agency names and e-mails cannot inject commands. Values that end up inside PHP (the admin login
 * for the reset e-mail) travel in an environment variable, not in the PHP text. Addresses are validated
 * not to start with "-" so they cannot be read as options.
 *
 * The agency admin's password is never chosen here and never returned: wp-cli gives a new user a random
 * one and WordPress sends the "set your password" e-mail (retrieve_password).
 *
 * Builds run one at a time (a queue): they all touch the one network and its database.
 */
export class SharedSiteManager extends SiteManager {
  private chain: Promise<void> = Promise.resolve();
  private networkReady: Promise<void> | null = null;
  private assetsReady: Promise<void> | null = null;

  constructor(config: ProvisionerConfig, run: Runner = defaultRunner, now: () => string = () => new Date().toISOString()) {
    super(config, run, now);
  }

  private wp(args: string[], url?: string): Promise<string> {
    return this.run('docker', ['exec', this.config.wpContainer, 'wp', ...args, '--allow-root', ...(url ? [`--url=${url}`] : [])]);
  }

  private async blogIdOf(domain: string): Promise<number | null> {
    const out = await this.wp(['site', 'list', '--field=blog_id', `--domain=${domain}`], this.config.wpHost);
    const id = Number(out.split(/\r?\n/)[0]?.trim());
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  override async ensure(req: SiteRequest): Promise<{ state: SiteState; started: boolean }> {
    const { sitesDomain } = this.config;
    if (!sitesDomain) throw new SiteError('WP_SITES_DOMAIN is not set on the provisioner', 503);
    if (req.domain !== `${req.slug}.${sitesDomain}`) {
      throw new SiteError(`domain must be ${req.slug}.${sitesDomain} in shared mode`, 400);
    }
    const existing = await this.load(req.slug);
    if (existing) {
      if (existing.siteId !== req.siteId) throw new SiteError(`slug ${req.slug} already belongs to another site`, 409);
      if (existing.status === 'active' || existing.status === 'stopped' || existing.status === 'provisioning') {
        return { state: existing, started: false };
      }
      // failed: rebuild (the steps skip what already exists)
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
      containerId: this.config.wpContainer,
      mode: 'shared',
      blogId: existing?.blogId ?? null,
      port: null,
      error: null,
      resetEmailSent: null,
      createdAt: existing?.createdAt ?? this.now(),
      updatedAt: this.now(),
    };
    await this.save(state);
    this.running.add(req.slug);
    const job = this.chain.then(() => this.buildShared(state, req));
    this.chain = job.catch(() => undefined);
    void job.finally(() => this.running.delete(req.slug));
    return { state, started: true };
  }

  private async buildShared(state: SiteState, req: SiteRequest): Promise<void> {
    try {
      await this.ensureNetwork();
      if (!req.minimal) await this.ensureNetworkAssets();

      let blogId = await this.blogIdOf(req.domain);
      if (blogId === null) {
        const created = await this.wp(
          ['site', 'create', `--slug=${req.slug}`, `--title=${req.companyName}`, `--email=${req.adminEmail}`, '--porcelain'],
          this.config.wpHost,
        );
        blogId = Number(created.split(/\r?\n/).pop()?.trim());
        if (!Number.isInteger(blogId) || blogId < 1) throw new Error('wp site create did not return a site id');
      }
      state.blogId = blogId;
      const login = (await this.wp(['user', 'get', req.adminEmail, '--field=user_login'], this.config.wpHost)).split(/\r?\n/)[0].trim();
      if (!login) throw new Error('the agency admin user was not created');
      await this.wp(['user', 'set-role', login, 'administrator'], req.domain);

      let seeded = true;
      try {
        await this.wp(['option', 'get', 'travelcrm_seeded'], req.domain);
      } catch {
        seeded = false;
      }
      if (!seeded) {
        await this.seed(req);
        state.resetEmailSent = await this.sendResetEmail(login, req.domain);
        await this.wp(['option', 'update', 'travelcrm_seeded', '1'], req.domain);
      }
      state.status = 'active';
      state.error = null;
    } catch (e) {
      state.status = 'failed';
      state.error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      console.error(`Provisioning ${state.slug} (shared) failed:`, state.error);
    }
    await this.save(state);
  }

  /** Content and settings for a new agency site. Theme and plugins are network-wide (ensureNetworkAssets). */
  private async seed(req: SiteRequest): Promise<void> {
    const site = req.domain;
    const wp = (...args: string[]) => this.wp(args, site);
    await wp('rewrite', 'structure', '/%postname%/', '--hard').catch((e) => console.warn('rewrite failed:', (e as Error).message));
    if (!req.minimal) {
      await wp('theme', 'activate', this.config.theme).catch((e) => console.warn('theme activate failed, keeping default:', (e as Error).message));
    }
    try {
      await wp('post', 'delete', '1', '2', '--force');
      await wp('comment', 'delete', '1', '--force');
    } catch {
      // default content may not exist
    }
    const pages = [
      { title: 'Home', slug: 'home' },
      { title: 'About Us', slug: 'about' },
      { title: 'Tour Packages', slug: 'packages' },
      { title: 'Contact Us', slug: 'contact' },
      { title: 'Enquiry', slug: 'enquiry' },
    ];
    for (const page of pages) {
      await wp('post', 'create', '--post_type=page', `--post_title=${page.title}`, `--post_name=${page.slug}`, '--post_status=publish');
    }
    await wp('option', 'update', 'show_on_front', 'page');
    const homeId = await wp('post', 'list', '--post_type=page', '--name=home', '--field=ID');
    if (homeId) await wp('option', 'update', 'page_on_front', homeId.split(/\r?\n/)[0]);
    await wp('option', 'update', 'blog_public', '1');
    await wp('option', 'update', 'timezone_string', 'Asia/Kolkata');
    await wp('option', 'update', 'default_comment_status', 'closed');
    await wp('option', 'update', 'default_ping_status', 'closed');
  }

  private async sendResetEmail(login: string, site: string): Promise<boolean> {
    try {
      const out = await this.run('docker', [
        'exec', '-e', `PROV_LOGIN=${login}`, this.config.wpContainer, 'wp', 'eval',
        "echo is_wp_error( retrieve_password( getenv( 'PROV_LOGIN' ) ) ) ? 'error' : 'sent';",
        '--allow-root', `--url=${site}`,
      ]);
      return out.trim().endsWith('sent');
    } catch (e) {
      console.warn('WordPress password-reset email could not be sent:', (e as Error).message);
      return false;
    }
  }

  /** The network itself: installed once, converted to a subdomain Multisite. Memoised; a failure is retried by the next build. */
  private ensureNetwork(): Promise<void> {
    if (!this.networkReady) {
      this.networkReady = this.bootstrapNetwork().catch((e) => {
        this.networkReady = null;
        throw e;
      });
    }
    return this.networkReady;
  }

  private async bootstrapNetwork(): Promise<void> {
    const { wpHost, networkAdminEmail } = this.config;
    if (!wpHost) throw new Error('WP_NETWORK_HOST or WP_SITES_DOMAIN is not set');
    await this.waitForWordPress();
    const isMultisite = await this.wp(['core', 'is-installed', '--network']).then(() => true, () => false);
    if (isMultisite) return;
    const isSingle = await this.wp(['core', 'is-installed']).then(() => true, () => false);
    if (!isSingle) {
      if (!networkAdminEmail) throw new Error('WP_NETWORK_ADMIN_EMAIL is not set; it owns the WordPress network');
      await this.wp([
        'core', 'install', `--url=https://${wpHost}`, '--title=TravelCRM Websites', '--admin_user=network_admin',
        `--admin_password=${randomBytes(18).toString('base64url')}`, `--admin_email=${networkAdminEmail}`, '--skip-email',
      ]);
    }
    await this.wp(['core', 'multisite-convert', '--subdomains', '--title=TravelCRM Websites'], wpHost);
  }

  private async waitForWordPress(): Promise<void> {
    const deadline = Date.now() + 180_000;
    for (;;) {
      try {
        await this.wp(['--info']);
        await this.wp(['db', 'check']);
        return;
      } catch (e) {
        if (Date.now() > deadline) throw new Error(`the shared WordPress container ${this.config.wpContainer} is not ready: ${(e as Error).message}`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  /** Theme and plugins, installed once and enabled for the whole network. Failures are logged and skipped. */
  private ensureNetworkAssets(): Promise<void> {
    if (!this.assetsReady) {
      this.assetsReady = (async () => {
        const { wpHost, theme, plugins } = this.config;
        try {
          await this.wp(['theme', 'install', theme], wpHost);
        } catch (e) {
          console.warn('Theme install failed:', (e as Error).message);
        }
        await this.wp(['theme', 'enable', theme, '--network'], wpHost).catch((e) => console.warn('Theme network-enable failed:', (e as Error).message));
        for (const plugin of plugins) {
          await this.wp(['plugin', 'install', plugin, '--activate-network'], wpHost).catch((e) => console.warn(`Plugin ${plugin} failed:`, (e as Error).message));
        }
      })();
    }
    return this.assetsReady;
  }

  private async setArchived(state: SiteState, archived: boolean): Promise<void> {
    const blogId = state.blogId ?? (await this.blogIdOf(state.domain));
    if (blogId === null) throw new SiteError('The site is not in the WordPress network', 409);
    state.blogId = blogId;
    try {
      await this.wp(['site', archived ? 'archive' : 'unarchive', String(blogId)], this.config.wpHost);
    } catch (e) {
      if (!/already/i.test((e as Error).message)) throw e;
    }
  }

  override async stop(slug: string): Promise<SiteState | null> {
    const state = await this.get(slug);
    if (!state) return null;
    if (state.status !== 'stopped') {
      await this.setArchived(state, true);
      state.status = 'stopped';
      await this.save(state);
    }
    return state;
  }

  override async start(slug: string): Promise<SiteState | null> {
    const state = await this.get(slug);
    if (!state) return null;
    if (state.status === 'stopped') {
      await this.setArchived(state, false);
      state.status = 'active';
      await this.save(state);
    }
    return state;
  }

  override async destroy(slug: string): Promise<boolean> {
    const state = await this.get(slug);
    if (!state) return false;
    const blogId = state.blogId ?? (await this.blogIdOf(state.domain).catch(() => null));
    if (blogId !== null) await this.wp(['site', 'delete', String(blogId), '--yes'], this.config.wpHost);
    this.states.delete(slug);
    await fs.rm(this.statePath(slug), { force: true });
    return true;
  }
}

export function createSiteManager(config: ProvisionerConfig, run: Runner = defaultRunner): SiteManager {
  return config.mode === 'shared' ? new SharedSiteManager(config, run) : new SiteManager(config, run);
}
