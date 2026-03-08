/**
 * WhatsApp Campaign Queue Handler
 *
 * Processes WhatsApp campaign messages in batches.
 */

import type { Env } from '../types';

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

  // Resolve tenant DB
  const tenant = await env.MASTER_DB.prepare(
    'SELECT d1_database_id FROM tenants WHERE id = ?'
  ).bind(tenantId).first<{ d1_database_id: string }>();

  if (!tenant?.d1_database_id) {
    console.error(`Tenant ${tenantId} not found or no D1 database`);
    return;
  }

  const db = env[tenant.d1_database_id as keyof Env] as D1Database;
  if (!db) {
    console.error(`D1 database binding ${tenant.d1_database_id} not found`);
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

  // Increment WhatsApp usage cap
  try {
    await env.MASTER_DB.prepare(`
      UPDATE tenant_usage_caps SET current_usage = current_usage + ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE tenant_id = ? AND cap_key = 'whatsapp_messages_per_month'
    `).bind(processed, tenantId).run();
  } catch (_e) { /* non-critical */ }

  console.log(`WhatsApp campaign ${campaignId}: ${processed} sent, ${failed} failed`);
}
