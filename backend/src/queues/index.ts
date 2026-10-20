import type { Env } from '../types';
import { handleEmailJob, type EmailJob } from './email-queue';
import { handleSmsJob, type SmsJob } from './sms-queue';
import { handlePushJob, type PushNotificationJob } from './push-notification-queue';
import { handleWpProvisionJob, type WpProvisionJob } from './wp-provision-queue';
import { handleImportQueue } from './import-queue';
import { handleExportQueue } from './export-queue';
import { handleCampaignQueue } from './campaign-queue';
import { handleAIExtractionQueue } from './ai-extraction-queue';
import { processWhatsAppCampaign } from './whatsapp-campaign-queue';
import { handleTenantJobs } from './tenant-jobs-queue';

export interface QueueMessage {
  type: 'email' | 'sms' | 'push' | 'wp-provision' | 'import' | 'export_invoices' | 'export_full' | 'whatsapp_campaign' | 'sms_campaign' | 'email_campaign';
  data: any;
}

/**
 * Main queue consumer — routes messages to appropriate handlers.
 * Registered as the queue export from the Worker entry point.
 */
export async function handleQueue(
  batch: MessageBatch<QueueMessage>,
  env: Env
): Promise<void> {

  if (batch.queue === 'travelcrm-tenant-jobs') {
    await handleTenantJobs(batch as any, env);
    return;
  }

  if (batch.queue === 'import-queue' || batch.queue.includes('import')) {
    await handleImportQueue(batch as any, env);
    return;
  }

  if (batch.queue === 'export-queue' || batch.queue.includes('export')) {
    await handleExportQueue(batch as any, env);
    return;
  }

  if (batch.queue === 'travelcrm-campaign-queue' || batch.queue.includes('campaign')) {
    // Check if any messages are the new whatsapp_campaign type
    for (const msg of batch.messages) {
      const body = msg.body as any;
      if (body.type === 'whatsapp_campaign') {
        try {
          await processWhatsAppCampaign(body, env);
          msg.ack();
        } catch (err) {
          console.error('WhatsApp campaign queue failed:', err);
          msg.retry();
        }
        return;
      }
    }
    await handleCampaignQueue(batch as any, env);
    return;
  }

  if (batch.queue.includes('ai-extraction') && !batch.queue.includes('dlq')) {
    await handleAIExtractionQueue(batch as any, env);
    return;
  }

  // legacy / existing handlers for general queue
  for (const msg of batch.messages) {
    try {
      const { type, data } = msg.body;

      switch (type) {
        case 'email':
          await handleEmailJob(data as EmailJob, env);
          break;
        case 'sms':
          await handleSmsJob(data as SmsJob, env);
          break;
        case 'push':
          await handlePushJob(data as PushNotificationJob, env);
          break;
        case 'wp-provision': {
          // R309: the job decides its own retry timing (backoff, polling); an unexpected throw falls to msg.retry() below.
          const outcome = await handleWpProvisionJob(data as WpProvisionJob, env);
          if (outcome.retryInSeconds) {
            msg.retry({ delaySeconds: outcome.retryInSeconds });
            continue;
          }
          break;
        }
        default:
          console.error(`Unknown queue message type: ${type}`);
      }

      msg.ack();
    } catch (error) {
      console.error(`Queue job failed:`, error);
      msg.retry();
    }
  }
}
