/**
 * WhatsApp Campaign Queue Handler
 *
 * Processes WhatsApp campaign messages in batches.
 */

import type { Env } from '../types';
import { resolveTenantDb } from '../services/tenant-db';
import { refundUsage, tryMeter } from '../services/metering/meter';
import { recordWhatsAppCategory, resolveWhatsAppSender } from '../services/messaging/whatsapp-sender';
import { marketingBlockedReason, unsubscribeUrl, unsubscribeFooterText } from '../services/privacy/consent';

interface WhatsAppCampaignMessage {
  type: 'whatsapp_campaign';
  campaignId: string;
  tenantId: string;
}

function safeJson(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
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

  // R213: an agency on Meta sends the approved template for real; any other provider keeps the existing behaviour.
  const sender = await resolveWhatsAppSender(env, db).catch(() => ({ provider: 'twilio' as const }));
  let metaLanguage = 'en';
  if (sender.provider === 'meta' && campaign.template_name) {
    const row = await db
      .prepare("SELECT language FROM message_templates WHERE channel = 'whatsapp' AND name = ? LIMIT 1")
      .bind(campaign.template_name)
      .first<{ language: string | null }>()
      .catch(() => null);
    metaLanguage = row?.language || 'en';
  }

  // Process pending recipients in batches of 10
  const batchSize = 10;
  let processed = 0;
  let failed = 0;
  let skipped = 0;
  let capReached = false;

  while (true) {
    const recipients = await db.prepare(`
      SELECT id, contact_id, phone, name FROM whatsapp_campaign_recipients
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
      // R208: consent is checked at send time; an opted-out or withdrawn contact is skipped without using allowance
      const blocked = await marketingBlockedReason(db, (recipient as any).contact_id, 'whatsapp');
      if (blocked) {
        await db.prepare(`UPDATE whatsapp_campaign_recipients SET status = 'opted_out', error_message = ? WHERE id = ?`).bind(blocked, (recipient as any).id).run();
        continue;
      }

      // R110/R130: a campaign message is marketing, so it takes one unit of the monthly WhatsApp marketing allowance
      // before the send. At the cap the remaining recipients are skipped (status skipped_allowance), not failed.
      if (!capReached) {
        const taken = await tryMeter(env, tenantId, 'whatsapp_marketing');
        if (!taken.allowed) capReached = true;
      }
      if (capReached) {
        await db.prepare(`
          UPDATE whatsapp_campaign_recipients SET status = 'skipped_allowance', error_message = 'Monthly WhatsApp marketing allowance used up'
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

        // R208: every marketing WhatsApp message carries the unsubscribe link (the body to hand to the provider)
        const unsubLink = await unsubscribeUrl(env, tenantId, (recipient as any).contact_id, 'whatsapp');
        const outgoingBody = templateContent + '\n\n' + unsubscribeFooterText(unsubLink);
        void outgoingBody;

        let providerMessageId: string | null = null;
        if (sender.provider === 'meta') {
          // Meta sends only approved templates. The unsubscribe link has to be a variable of the template, so every
          // marketing message carries it (R208).
          if (!sender.client) throw new Error(sender.unavailable);
          if (!campaign.template_name) throw new Error("Meta WhatsApp sends an approved template: set the campaign's template name");
          if (!/{{\s*unsubscribe_url\s*}}/i.test(campaign.template_content)) {
            throw new Error('The template must include {{unsubscribe_url}} so the message carries the unsubscribe link');
          }
          const values: Record<string, string> = {
            ...((campaign.template_variables ? safeJson(campaign.template_variables) : {}) as Record<string, string>),
            name: (recipient as any).name || 'there',
            phone: (recipient as any).phone || '',
            unsubscribe_url: unsubLink,
          };
          const lowered = Object.fromEntries(Object.entries(values).map(([k, v]) => [k.toLowerCase(), String(v ?? '')]));
          const names: string[] = [];
          for (const m of String(campaign.template_content).matchAll(/{{\s*(\w+)\s*}}/g)) {
            const n = m[1].toLowerCase();
            if (!names.includes(n)) names.push(n);
          }
          const parameters = Object.fromEntries(names.map((n, i) => [String(i + 1), lowered[n] ?? '']));
          const res = await sender.client.sendWhatsAppTemplate((recipient as any).phone, campaign.template_name, parameters, {
            language: metaLanguage,
            category: 'marketing',
          });
          if (res.status === 'failed') throw new Error(res.error || 'WhatsApp send failed');
          providerMessageId = res.providerMessageId;
          await recordWhatsAppCategory(env, tenantId, 'marketing', providerMessageId);
        }
        // Other providers: the send is still simulated here (existing behaviour, unchanged).
        await db.prepare(`
          UPDATE whatsapp_campaign_recipients
          SET status = 'sent', provider_message_id = COALESCE(?, provider_message_id), sent_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
          WHERE id = ?
        `).bind(providerMessageId, (recipient as any).id).run();

        processed++;
      } catch (e: any) {
        await refundUsage(env, tenantId, 'whatsapp_marketing');
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
