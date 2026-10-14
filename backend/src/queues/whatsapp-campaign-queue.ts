/**
 * WhatsApp Campaign Queue Handler
 *
 * Processes WhatsApp campaign messages in batches.
 */

import type { Env } from '../types';
import { resolveTenantDb } from '../services/tenant-db';
import { refundUsage, tryMeter } from '../services/metering/meter';

interface WhatsAppCampaignMessage {
  type: 'whatsapp_campaign';
  campaignId: string;
  tenantId: string;
}

export async function processWhatsAppCampaign(
  message: WhatsAppCampaignMessage,
  env: Env,
): Promise<void> {
  const { campaignId, tenantId } = message;

  // Resolve tenant DB (never MASTER_DB in multi-tenant mode)
  const db = await resolveTenantDb(env, tenantId);
  if (!db) {
    console.error(`Tenant ${tenantId} has no resolvable database; WhatsApp campaign ${campaignId} dropped`);
    return;
  }

  // Get campaign
  const campaign = await db.prepare(
    'SELECT * FROM whatsapp_campaigns WHERE id = ?'
  ).bind(campaignId).first<Record<string, any>>();

  if (!campaign || campaign.status === 'cancelled' || campaign.status === 'paused') {
    return;
  }

  // Process pending recipients in batches of 10
  const batchSize = 10;
  let processed = 0;
  let failed = 0;
  let skipped = 0;
  let capReached = false;

  while (true) {
    const recipients = await db.prepare(`
      SELECT id, phone, name FROM whatsapp_campaign_recipients
      WHERE campaign_id = ? AND status = 'pending'
      LIMIT ?
    `).bind(campaignId, batchSize).all();

    const batch = recipients.results || [];
    if (batch.length === 0) break;

    // Check if campaign was paused/cancelled mid-process
    const currentStatus = await db.prepare(
      'SELECT status FROM whatsapp_campaigns WHERE id = ?'
    ).bind(campaignId).first<{ status: string }>();

    if (currentStatus?.status === 'paused' || currentStatus?.status === 'cancelled') {
      break;
    }

    for (const recipient of batch) {
      // R110: a business-initiated WhatsApp message costs money, so it takes one unit of the monthly allowance
      // before the send. At the cap the remaining recipients are skipped (status skipped_allowance), not failed.
      if (!capReached) {
        const taken = await tryMeter(env, tenantId, 'whatsapp');
        if (!taken.allowed) capReached = true;
      }
      if (capReached) {
        await db.prepare(`
          UPDATE whatsapp_campaign_recipients SET status = 'skipped_allowance', error_message = 'Monthly WhatsApp allowance used up'
          WHERE id = ?
        `).bind((recipient as any).id).run();
        skipped++;
        continue;
      }
      try {
        // Resolve template variables
        const templateContent = campaign.template_content
          .replace(/\{\{name\}\}/gi, (recipient as any).name || 'there')
          .replace(/\{\{phone\}\}/gi, (recipient as any).phone || '');

        // TODO: Send via MessagingProvider when WhatsApp integration is configured
        // For now, mark as sent (simulate)
        await db.prepare(`
          UPDATE whatsapp_campaign_recipients
          SET status = 'sent', sent_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
          WHERE id = ?
        `).bind((recipient as any).id).run();

        processed++;
      } catch (e: any) {
        await refundUsage(env, tenantId, 'whatsapp');
        await db.prepare(`
          UPDATE whatsapp_campaign_recipients
          SET status = 'failed', error_message = ?
          WHERE id = ?
        `).bind(e.message || 'Send failed', (recipient as any).id).run();
        failed++;
      }

      // Rate limit: ~1 msg/sec
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Update campaign counters
    await db.prepare(`
      UPDATE whatsapp_campaigns
      SET sent_count = (SELECT COUNT(*) FROM whatsapp_campaign_recipients WHERE campaign_id = ? AND status IN ('sent', 'delivered', 'read')),
          failed_count = (SELECT COUNT(*) FROM whatsapp_campaign_recipients WHERE campaign_id = ? AND status = 'failed'),
          updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ?
    `).bind(campaignId, campaignId, campaignId).run();
  }

  // Mark campaign as completed if all processed
  const pending = await db.prepare(
    "SELECT COUNT(*) as cnt FROM whatsapp_campaign_recipients WHERE campaign_id = ? AND status = 'pending'"
  ).bind(campaignId).first<{ cnt: number }>();

  if ((pending?.cnt || 0) === 0) {
    await db.prepare(`
      UPDATE whatsapp_campaigns
      SET status = 'sent',
          completed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
          updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ? AND status = 'sending'
    `).bind(campaignId).run();
  }

  console.log(`WhatsApp campaign ${campaignId}: ${processed} sent, ${failed} failed, ${skipped} skipped (allowance)`);
}
