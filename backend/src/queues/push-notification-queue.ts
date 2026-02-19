import type { Env } from '../types';

export interface PushNotificationJob {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  fcmTokens?: string[]; // If known, send directly; otherwise look up from DB
}

/**
 * Process push notification jobs via Firebase Cloud Messaging.
 * Stub implementation — will be completed in Milestone 10.
 */
export async function handlePushJob(
  job: PushNotificationJob,
  env: Env
): Promise<void> {
  console.log(`[PUSH QUEUE] Sending push to user ${job.userId}: ${job.title}`);

  // TODO (Milestone 10): Implement FCM API call
  // 1. If fcmTokens not provided, look up from push_tokens table
  // 2. Send to FCM via HTTP v1 API:
  // const response = await fetch(
  //   'https://fcm.googleapis.com/v1/projects/<project-id>/messages:send',
  //   {
  //     method: 'POST',
  //     headers: {
  //       'Authorization': `Bearer ${accessToken}`,
  //       'Content-Type': 'application/json',
  //     },
  //     body: JSON.stringify({
  //       message: {
  //         token: fcmToken,
  //         notification: { title: job.title, body: job.body },
  //         data: job.data,
  //       },
  //     }),
  //   }
  // );

  console.log(`[PUSH QUEUE] Push notification job processed (stub)`);
}
