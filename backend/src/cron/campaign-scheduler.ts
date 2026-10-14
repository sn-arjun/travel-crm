/**
 * Campaign Scheduler (per-agency job, every 5 minutes)
 * Finds this agency's campaigns with status='scheduled' and scheduled_at <= now, creates the recipient
 * rows from the campaign's segment and hands the campaign to CAMPAIGN_QUEUE in the same shape the
 * "send now" route uses (one message per campaign; the queue consumer sends to pending recipients).
 */
import type { Env } from '../types';
import { resolveSegment, type SegmentFilter } from '../services/segment-resolver';
import { generateId } from '../utils/uuid';

interface CampaignRow {
  id: string;
  name: string;
  type: string | null;
}

interface ContactRow {
  id: string;
  email: string | null;
  phone: string | null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function processCampaignScheduler(env: Env, tenantId: string, tenantDb: D1Database, nowDate: Date = new Date()): Promise<void> {
  const now = nowDate.toISOString();

  const dueCampaigns = await tenantDb
    .prepare(`
      SELECT id, name, type, segment_id FROM marketing_campaigns
      WHERE status = 'scheduled'
        AND scheduled_at IS NOT NULL
        AND scheduled_at <= ?
      LIMIT 10
    `)
    .bind(now)
    .all<CampaignRow & { segment_id: string | null }>();

  for (const campaign of dueCampaigns.results ?? []) {
    // Claim the campaign: only the run that flips scheduled -> sending processes it
    const claim = await tenantDb
      .prepare(`UPDATE marketing_campaigns SET status = 'sending', updated_at = ? WHERE id = ? AND status = 'scheduled'`)
      .bind(now, campaign.id)
      .run();
    if (!claim.meta.changes) continue;

    try {
      let filters: SegmentFilter = {};
      if (campaign.segment_id) {
        const segment = await tenantDb
          .prepare('SELECT filters_json FROM contact_segments WHERE id = ?')
          .bind(campaign.segment_id)
          .first<{ filters_json: string | null }>();
        if (segment?.filters_json) filters = JSON.parse(segment.filters_json) as SegmentFilter;
      }
      const contactIds = await resolveSegment(tenantDb, filters);
      const campaignType = campaign.type || 'email';

      let recipients = 0;
      for (const contactId of contactIds) {
        const contact = await tenantDb
          .prepare('SELECT id, email, phone FROM contacts WHERE id = ?')
          .bind(contactId)
          .first<ContactRow>();
        if (!contact) continue;
        if (campaignType === 'email' && !contact.email) continue;
        if ((campaignType === 'sms' || campaignType === 'whatsapp') && !contact.phone) continue;

        await tenantDb
          .prepare(`
            INSERT INTO campaign_recipients (id, campaign_id, contact_id, phone, email, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'pending', ?)
          `)
          .bind(generateId(), campaign.id, contactId, contact.phone || null, contact.email || null, now)
          .run();
        recipients++;
      }

      if (recipients === 0) {
        console.warn(`[CAMPAIGN SCHEDULER] ${tenantId}/${campaign.id}: no contacts matched the segment`);
        await tenantDb
          .prepare(`UPDATE marketing_campaigns SET status = 'cancelled', updated_at = ? WHERE id = ?`)
          .bind(now, campaign.id)
          .run();
        continue;
      }

      await tenantDb
        .prepare(`UPDATE marketing_campaigns SET total_recipients = ?, updated_at = ? WHERE id = ?`)
        .bind(recipients, now, campaign.id)
        .run();

      await env.CAMPAIGN_QUEUE.send({
        type: `${campaignType}_campaign`,
        data: { campaignId: campaign.id, tenantId, campaignType },
      });
    } catch (err: unknown) {
      console.error(`[CAMPAIGN SCHEDULER] ${tenantId}/${campaign.id} failed:`, errorMessage(err));
      // Remove half-created recipients and put the campaign back so the next tick retries it
      await tenantDb.prepare(`DELETE FROM campaign_recipients WHERE campaign_id = ? AND status = 'pending'`).bind(campaign.id).run();
      await tenantDb
        .prepare(`UPDATE marketing_campaigns SET status = 'scheduled', updated_at = ? WHERE id = ?`)
        .bind(now, campaign.id)
        .run();
    }
  }
}
