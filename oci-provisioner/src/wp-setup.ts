import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface WPSetupConfig {
  subdomain: string;
  domain: string;
  companyName: string;
  ownerEmail: string;
  adminPassword: string;
  template: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  crmWebhookUrl: string;
}

export async function setupWordPress(config: WPSetupConfig) {
  const container = `wp-site-${config.subdomain}`;
  const wp = async (cmd: string) => {
    const { stdout } = await execAsync(`docker exec ${container} wp ${cmd} --allow-root`);
    return stdout.trim();
  };

  // Wait for WP to be ready
  await waitForWPReady(container, 120);

  // Install WordPress
  await wp(`core install \
    --url="https://${config.domain}" \
    --title="${escapeShell(config.companyName)}" \
    --admin_user=admin \
    --admin_password="${escapeShell(config.adminPassword)}" \
    --admin_email="${config.ownerEmail}" \
    --skip-email`);

  // Set permalink structure
  await wp('rewrite structure "/%postname%/" --hard');

  // Install & activate theme
  await wp('theme install flavor --activate');

  // Install plugins
  const plugins = ['elementor', 'contact-form-7', 'wordpress-seo', 'wp-fastest-cache', 'updraftplus'];
  for (const plugin of plugins) {
    try {
      await wp(`plugin install ${plugin} --activate`);
    } catch (e) {
      console.warn(`Failed to install plugin ${plugin}:`, e);
    }
  }

  // Delete default content
  try {
    await wp('post delete 1 2 --force');
    await wp('comment delete 1 --force');
  } catch {
    // May not exist
  }

  // Create pages
  const pages = [
    { title: 'Home', slug: 'home' },
    { title: 'About Us', slug: 'about' },
    { title: 'Tour Packages', slug: 'packages' },
    { title: 'Contact Us', slug: 'contact' },
    { title: 'Enquiry', slug: 'enquiry' },
  ];

  for (const page of pages) {
    await wp(`post create --post_type=page --post_title="${page.title}" --post_name="${page.slug}" --post_status=publish`);
  }

  // Set front page
  await wp('option update show_on_front page');
  const homeId = await wp('post list --post_type=page --name=home --field=ID');
  if (homeId) {
    await wp(`option update page_on_front ${homeId}`);
  }

  // SEO / settings
  await wp('option update blog_public 1');
  await wp('option update timezone_string "Asia/Kolkata"');
  await wp('option update default_comment_status closed');
  await wp('option update default_ping_status closed');

  console.log(`WordPress setup complete for ${config.domain}`);
}

async function waitForWPReady(container: string, maxSeconds: number) {
  const deadline = Date.now() + maxSeconds * 1000;
  while (Date.now() < deadline) {
    try {
      const { stdout } = await execAsync(`docker exec ${container} wp core is-installed --allow-root 2>&1 || echo "not-ready"`);
      if (!stdout.includes('not-ready') && !stdout.includes('Error')) {
        return;
      }
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  // If WP isn't installed yet, that's fine — we'll install it
}

function escapeShell(str: string): string {
  return str.replace(/'/g, "'\\''").replace(/"/g, '\\"');
}
