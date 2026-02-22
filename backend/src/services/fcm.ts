import type { Env } from '../types';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Sends a push notification via FCM (Firebase Cloud Messaging).
 * Never throws — errors are logged to console.
 */
export async function sendPushNotification(
  env: Env,
  fcmToken: string,
  payload: PushPayload
): Promise<void> {
  try {
    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        Authorization: `key=${env.FCM_SERVER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: fcmToken,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`FCM push failed (${response.status}):`, text);
    }
  } catch (err) {
    console.error('Failed to send push notification:', err);
  }
}
