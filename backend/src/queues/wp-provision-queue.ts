import type { Env } from '../types';
import { processSite, type JobOutcome, type WpProvisionJob } from '../services/wordpress/sites';

export type { WpProvisionJob } from '../services/wordpress/sites';

/**
 * Consumer of WP_PROVISION_QUEUE (R309). The message only names the site; the row in wordpress_sites is the
 * source of truth. The work (a signed POST to the provisioner, retries with backoff, status and history) lives in
 * services/wordpress/sites.ts. The returned outcome says whether the message should be redelivered after a delay.
 */
export async function handleWpProvisionJob(job: WpProvisionJob, env: Env): Promise<JobOutcome> {
  if (!job?.siteId) {
    console.error('[WP PROVISION QUEUE] message without siteId ignored');
    return {};
  }
  return processSite(env, job.siteId);
}
