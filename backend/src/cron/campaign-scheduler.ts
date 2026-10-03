/**
 * Campaign Scheduler Cron Job
 * Runs every 5 minutes via wrangler.toml cron trigger.
 * Finds campaigns with status='scheduled' and scheduledAt <= now(),
 * then resolves their segments and queues emails.
 */
import type { Env } from '../types';
import { resolveSegment, type SegmentFilter } from '../services/segment-resolver';
import { generateId } from '../utils/uuid';

/** Single-tenant deployments bind the tenant database as DB (or TENANT_DB). */
interface SchedulerEnv extends Env {
  DB?: D1Database;
  TENANT_DB?: D1Database;
}

interface CampaignRow {
  id: string;
  name: string;
  type: string | null;
  segment_id: string | null;
  email_subject: string | null;
  message_body: string | null;
  template_id: string | null;
}

interface ContactRow {
  id: string;
  email: string | null;
  name: string | null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function processCampaignScheduler(env: Env): Promise<void> {
  // Get tenant DB — for single-tenant setups use DB binding
  const schedulerEnv = env as SchedulerEnv;
  const tenantDb = schedulerEnv.DB || schedulerEnv.TENANT_DB;
  if (!tenantDb) {
    console.error('[CAMPAIGN SCHEDULER] No database available');
    return;
  }

  const now = new Date().toISOString();

  // Find all scheduled campaigns whose time has arrived
  const dueCampaigns = await tenantDb
    .prepare(`
      SELECT * FROM marketing_campaigns
      WHERE status = 'scheduled'
        AND scheduled_at IS NOT NULL
        AND scheduled_at <= ?
      LIMIT 10
    `)
    .bind(now)
    .all<CampaignRow>();

  const campaigns = dueCampaigns.results ?? [];

  if (campaigns.length === 0) {
    console.log('[CAMPAIGN SCHEDULER] No scheduled campaigns due');
    return;
  }

  console.log(`[CAMPAIGN SCHEDULER] Processing ${campaigns.length} scheduled campaign(s)`);

  for (const campaign of campaigns) {
    try {
      // Mark as sending to prevent double-processing
      await tenantDb
        .prepare(`UPDATE marketing_campaigns SET status = 'sending', updated_at = ? WHERE id = ? AND status = 'scheduled'`)
        .bind(now, campaign.id)
        .run();

      // Resolve contacts for this segment via the linked contact_segments record
      let filters: SegmentFilter = {};
      if (campaign.segment_id) {
        const segment = await tenantDb
          .prepare('SELECT filters_json FROM contact_segments WHERE id = ?')
          .bind(campaign.segment_id)
          .first<{ filters_json: string | null }>();
        if (segment?.filters_json) {
          filters = JSON.parse(segment.filters_json) as SegmentFilter;
        }
      }
      const contactIds = await resolveSegment(tenantDb, filters);

      if (contactIds.length === 0) {
        console.warn(`[CAMPAIGN SCHEDULER] Campaign ${campaign.id}: no contacts matched segment`);
        await tenantDb
          .prepare(`UPDATE marketing_campaigns SET status = 'cancelled', updated_at = ? WHERE id = ?`)
          .bind(now, campaign.id)
          .run();
        continue;
      }

      let queuedCount = 0;
      let failureCount = 0;

      for (const contactId of contactIds) {
        try {
          const contact = await tenantDb
            .prepare('SELECT id, email, name FROM contacts WHERE id = ?')
            .bind(contactId)
            .first<ContactRow>();

          if (!contact || !contact.email) {
            failureCount++;
            continue;
          }

          // Insert campaign recipient record
          const logId = generateId();
          await tenantDb
            .prepare(`
              INSERT INTO campaign_recipients (id, campaign_id, contact_id, email, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?)
            `)
            .bind(logId, campaign.id, contactId, contact.email, 'queued', now)
            .run();

          // Queue campaign via CAMPAIGN_QUEUE
          await env.CAMPAIGN_QUEUE.send({
            type: campaign.type || 'email',
            campaignId: campaign.id,
            contactId: contactId,
            to: contact.email,
            subject: campaign.email_subject || campaign.name,
            html: campaign.message_body || undefined,
            templateId: campaign.template_id || undefined,
            templateData: { contactName: contact.name },
          });

          queuedCount++;
        } catch (contactErr: unknown) {
          console.error(`[CAMPAIGN SCHEDULER] Failed to queue for contact ${contactId}:`, errorMessage(contactErr));
          failureCount++;
        }
      }

      // Update campaign to sent
      await tenantDb
        .prepare(`
          UPDATE marketing_campaigns
          SET status = 'sent', total_recipients = ?, sent_count = ?, updated_at = ?
          WHERE id = ?
        `)
        .bind(queuedCount + failureCount, queuedCount, now, campaign.id)
        .run();

      console.log(`[CAMPAIGN SCHEDULER] Campaign ${campaign.id} sent: ${queuedCount} queued, ${failureCount} failed`);
    } catch (err: unknown) {
      console.error(`[CAMPAIGN SCHEDULER] Error processing campaign ${campaign.id}:`, errorMessage(err));
      // Roll back to scheduled so it can be retried
      await tenantDb
        .prepare(`UPDATE marketing_campaigns SET status = 'scheduled', updated_at = ? WHERE id = ?`)
        .bind(now, campaign.id)
        .run();
    }
  }
}
