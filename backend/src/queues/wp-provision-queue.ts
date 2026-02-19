import type { Env } from '../types';

export interface WpProvisionJob {
  tenantId: string;
  subdomain: string;
  companyName: string;
  adminEmail: string;
  logoUrl?: string;
  primaryColor?: string;
}

/**
 * Process WordPress site provisioning jobs.
 * Stub implementation — will be completed in Milestone 20.
 *
 * Flow:
 * 1. Create DNS record via Cloudflare API
 * 2. SSH into Oracle ARM instance
 * 3. Docker Compose up (WordPress + MariaDB containers)
 * 4. Wait for containers to be ready
 * 5. WP-CLI: install core, theme, plugins, demo content
 * 6. Update wordpress_sites table in master D1
 * 7. Send credentials to tenant admin via email
 */
export async function handleWpProvisionJob(
  job: WpProvisionJob,
  env: Env
): Promise<void> {
  console.log(
    `[WP PROVISION QUEUE] Provisioning WordPress for tenant ${job.tenantId}: ${job.subdomain}`
  );

  // TODO (Milestone 20): Implement full provisioning flow
  // Step 1: Create DNS record
  // Step 2: SSH + Docker Compose
  // Step 3: WP-CLI setup
  // Step 4: Update master DB
  // Step 5: Send email notification

  console.log(`[WP PROVISION QUEUE] WordPress provisioning job processed (stub)`);
}
