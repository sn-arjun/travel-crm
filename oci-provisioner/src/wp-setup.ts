import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';

const execFileAsync = promisify(execFile);

/** Runs a program with an argument list (never through a shell, so agency names cannot inject commands). */
export type Runner = (file: string, args: string[]) => Promise<string>;

export const defaultRunner: Runner = async (file, args) => {
  const { stdout } = await execFileAsync(file, args, { maxBuffer: 8 * 1024 * 1024 });
  return stdout.toString().trim();
};

export interface WPSetupConfig {
  slug: string;
  domain: string;
  companyName: string;
  ownerEmail: string;
  /** Plugins to install; failures are logged and skipped. */
  plugins?: string[];
  /** Skip the (slow, network-bound) theme and plugin downloads. Used by the local Docker test. */
  minimal?: boolean;
}

export const ADMIN_USER = 'agency_admin';

/**
 * Installs WordPress inside the already running site container.
 *
 * The admin password is random and never leaves this function: it is not returned, logged or sent to the CRM.
 * The agency admin gets WordPress's own "reset your password" email (retrieve_password), so the credential
 * is set by the person who owns it. That email needs working outbound mail from the container (go-live check);
 * if it cannot be sent the site is still created and the result says so.
 *
 * Safe to run again: a site that is already installed is left alone.
 */
export async function setupWordPress(config: WPSetupConfig, run: Runner = defaultRunner): Promise<{ resetEmailSent: boolean }> {
  const container = `wp-site-${config.slug}`;
  const wp = (...args: string[]) => run('docker', ['exec', container, 'wp', ...args, '--allow-root']);

  await waitForWPReady(container, run, 180);

  let installed = false;
  try {
    await wp('core', 'is-installed');
    installed = true;
  } catch {
    installed = false;
  }
  if (installed) {
    console.log(`WordPress for ${config.domain} is already installed; nothing to do`);
    return { resetEmailSent: false };
  }

  const adminPassword = randomBytes(18).toString('base64url');
  await wp(
    'core', 'install',
    `--url=https://${config.domain}`,
    `--title=${config.companyName}`,
    `--admin_user=${ADMIN_USER}`,
    `--admin_password=${adminPassword}`,
    `--admin_email=${config.ownerEmail}`,
    '--skip-email',
  );

  await wp('rewrite', 'structure', '/%postname%/', '--hard');

  if (!config.minimal) {
    try {
      await wp('theme', 'install', 'flavor', '--activate');
    } catch (e) {
      console.warn('Theme install failed, keeping the default theme:', (e as Error).message);
    }
    for (const plugin of config.plugins ?? ['elementor', 'contact-form-7', 'wordpress-seo', 'wp-fastest-cache', 'updraftplus']) {
      try {
        await wp('plugin', 'install', plugin, '--activate');
      } catch (e) {
        console.warn(`Failed to install plugin ${plugin}:`, (e as Error).message);
      }
    }
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

  let resetEmailSent = false;
  try {
    await wp('eval', `echo is_wp_error( retrieve_password( '${ADMIN_USER}' ) ) ? 'error' : 'sent';`).then((out) => {
      resetEmailSent = out.trim().endsWith('sent');
    });
  } catch (e) {
    console.warn('WordPress password-reset email could not be sent:', (e as Error).message);
  }

  console.log(`WordPress setup complete for ${config.domain}`);
  return { resetEmailSent };
}

async function waitForWPReady(container: string, run: Runner, maxSeconds: number): Promise<void> {
  const deadline = Date.now() + maxSeconds * 1000;
  while (Date.now() < deadline) {
    try {
      // Loading WordPress fails while the database is still starting, and succeeds (installed or not) once it is up.
      await ensureWpCli(container, run);
      await run('docker', ['exec', container, 'wp', 'eval', 'echo "ready";', '--allow-root']);
      return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`WordPress container ${container} did not become ready within ${maxSeconds} seconds`);
}

const WP_CLI_URL = 'https://github.com/wp-cli/wp-cli/releases/download/v2.11.0/wp-cli-2.11.0.phar';

/** The official wordpress image does not ship WP-CLI; fetch the phar into the container once. */
async function ensureWpCli(container: string, run: Runner): Promise<void> {
  try {
    await run('docker', ['exec', container, 'wp', '--info', '--allow-root']);
    return;
  } catch {
    // not installed yet
  }
  await run('docker', [
    'exec', container, 'sh', '-c',
    `curl -fsSL -o /usr/local/bin/wp ${WP_CLI_URL} && chmod +x /usr/local/bin/wp`,
  ]);
}
