import type { Env } from '../types';
import { handleEmailJob, type EmailJob } from './email-queue';
import { handleSmsJob, type SmsJob } from './sms-queue';
import { handlePushJob, type PushNotificationJob } from './push-notification-queue';
import { handleWpProvisionJob, type WpProvisionJob } from './wp-provision-queue';

export interface QueueMessage {
  type: 'email' | 'sms' | 'push' | 'wp-provision';
  data: EmailJob | SmsJob | PushNotificationJob | WpProvisionJob;
}

/**
 * Main queue consumer — routes messages to appropriate handlers.
 * Registered as the queue export from the Worker entry point.
 */
export async function handleQueue(
  batch: MessageBatch<QueueMessage>,
  env: Env
): Promise<void> {
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
        case 'wp-provision':
          await handleWpProvisionJob(data as WpProvisionJob, env);
          break;
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
