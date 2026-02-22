import type { Env } from '../types';
import { sendPushNotification } from '../services/fcm';

export interface PushNotificationJob {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  fcmTokens?: string[]; // If known, send directly; otherwise look up from DB
}

/**
 * Process push notification jobs via Firebase Cloud Messaging.
 * Looks up FCM tokens from database if not provided.
 * Handles multi-device support and invalid token cleanup.
 */
export async function handlePushJob(
  job: PushNotificationJob,
  env: Env
): Promise<void> {
  try {
    console.log(`[PUSH QUEUE] Sending push to user ${job.userId}: ${job.title}`);

    // Get all active FCM tokens for the user from all tenant databases
    const tokens = await getAllUserTokens(env, job.userId);

    if (tokens.length === 0) {
      console.warn(`[PUSH QUEUE] No active FCM tokens found for user ${job.userId}`);
      return;
    }

    // Send to all tokens
    for (const tokenData of tokens) {
      await sendPushNotification(env, tokenData.fcmToken, {
        title: job.title,
        body: job.body,
        data: job.data ?? {},
      });
    }

    console.log(`[PUSH QUEUE] Push sent to ${tokens.length} device(s) for user ${job.userId}`);
  } catch (err) {
    console.error(`[PUSH QUEUE] Failed to process push job:`, err);
  }
}

/**
 * Get all active FCM tokens for a user across all tenant databases.
 * This requires searching the MASTER_DB to find tenant bindings.
 */
async function getAllUserTokens(
  env: Env,
  userId: string
): Promise<{ fcmToken: string; dbBinding: string }[]> {
  const allTokens: { fcmToken: string; dbBinding: string }[] = [];

  try {
    // Get all active tenants from master DB
    const tenants = await env.MASTER_DB
      .prepare('SELECT db_binding FROM workspaces WHERE is_active = 1')
      .all<{ db_binding: string }>();

    // Search each tenant for tokens for this user
    for (const tenant of tenants.results) {
      try {
        const tenantDb = ((env as unknown) as Record<string, D1Database>)[tenant.db_binding] as D1Database | undefined;
        if (!tenantDb) continue;

        const result = await tenantDb
          .prepare(`
            SELECT id, fcm_token FROM push_tokens
            WHERE user_id = ? AND is_active = 1
          `)
          .bind(userId)
          .all<{ id: string; fcm_token: string }>();

        if (result.results) {
          for (const row of result.results) {
            allTokens.push({
              fcmToken: row.fcm_token,
              dbBinding: tenant.db_binding,
            });
          }
        }
      } catch (err) {
        console.error(`Failed to query tokens from ${tenant.db_binding}:`, err);
      }
    }
  } catch (err) {
    console.error('Failed to get tenant list from master DB:', err);
  }

  return allTokens;
}

