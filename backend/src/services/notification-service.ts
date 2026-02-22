import type { Env } from '../types';
import { generateId } from '../utils/uuid';

export interface NotificationInput {
  userId: string;
  title: string;
  body: string;
  type?: string; // lead_assigned, lead_status_change, follow_up_reminder, payment_received, task_assigned, birthday, invoice_overdue, announcement
  entityType?: string; // lead, contact, invoice, task
  entityId?: string;
}

/**
 * Central notification service for handling both in-app and push notifications.
 * Respects user preferences and quiet hours.
 */
export async function notify(
  env: Env,
  db: D1Database,
  input: NotificationInput
): Promise<void> {
  try {
    // Create in-app notification (always created)
    await createInAppNotification(db, input.userId, input.title, input.body, input.type, input.entityType, input.entityId);

    // Check user notification preferences
    const prefs = await getNotificationPreferences(db, input.userId);
    const type = input.type || 'announcement';

    // Check if push is enabled for this type
    const prefsForType = prefs[type] || {};
    if (!prefsForType.push_enabled) {
      return;
    }

    // Check quiet hours
    const inQuietHours = await isInQuietHours(db, input.userId);
    if (inQuietHours && type !== 'announcement') {
      // Skip push during quiet hours (but not for announcements)
      return;
    }

    // Queue push notification
    await env.PUSH_NOTIFICATION_QUEUE.send({
      type: 'push',
      data: {
        userId: input.userId,
        title: input.title,
        body: input.body,
        data: {
          type,
          entityType: input.entityType || '',
          entityId: input.entityId || '',
        },
      },
    });
  } catch (err) {
    console.error('Failed to send notification:', err);
  }
}

/**
 * Send notification to multiple users at once.
 */
export async function notifyMultiple(
  env: Env,
  db: D1Database,
  userIds: string[],
  input: Omit<NotificationInput, 'userId'>
): Promise<void> {
  for (const userId of userIds) {
    await notify(env, db, { ...input, userId });
  }
}

/**
 * Create in-app notification record in database.
 */
export async function createInAppNotification(
  db: D1Database,
  userId: string,
  title: string,
  message: string,
  type?: string,
  referenceType?: string,
  referenceId?: string
): Promise<{ id: string }> {
  const id = generateId();
  const now = new Date().toISOString();

  await db
    .prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, reference_type, reference_id, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `)
    .bind(id, userId, title, message, type || 'system', referenceType, referenceId, now)
    .run();

  return { id };
}

/**
 * Get user's notification preferences from settings table.
 * Returns JSON object with preferences for each notification type.
 */
async function getNotificationPreferences(
  db: D1Database,
  userId: string
): Promise<Record<string, { push_enabled?: boolean; in_app_enabled?: boolean; email_enabled?: boolean }>> {
  try {
    const result = await db
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .bind(`notification_prefs_${userId}`)
      .first<{ value: string }>();

    if (!result?.value) {
      // Return defaults
      return getDefaultNotificationPreferences();
    }

    return JSON.parse(result.value);
  } catch (err) {
    console.error('Failed to get notification preferences:', err);
    return getDefaultNotificationPreferences();
  }
}

/**
 * Save notification preferences to settings table.
 */
export async function saveNotificationPreferences(
  db: D1Database,
  userId: string,
  preferences: Record<string, { push_enabled?: boolean; in_app_enabled?: boolean; email_enabled?: boolean }>
): Promise<void> {
  const now = new Date().toISOString();

  await db
    .prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `)
    .bind(`notification_prefs_${userId}`, JSON.stringify(preferences), now)
    .run();
}

/**
 * Get default notification preferences.
 */
function getDefaultNotificationPreferences(): Record<
  string,
  { push_enabled: boolean; in_app_enabled: boolean; email_enabled: boolean }
> {
  return {
    lead_assigned: { push_enabled: true, in_app_enabled: true, email_enabled: false },
    lead_status_change: { push_enabled: true, in_app_enabled: true, email_enabled: false },
    follow_up_reminder: { push_enabled: true, in_app_enabled: true, email_enabled: false },
    payment_received: { push_enabled: true, in_app_enabled: true, email_enabled: false },
    task_assigned: { push_enabled: true, in_app_enabled: true, email_enabled: false },
    birthday: { push_enabled: true, in_app_enabled: true, email_enabled: false },
    invoice_overdue: { push_enabled: true, in_app_enabled: true, email_enabled: false },
    announcement: { push_enabled: true, in_app_enabled: true, email_enabled: false },
  };
}

/**
 * Check if current time falls within user's quiet hours.
 * Quiet hours are stored in settings with key: quiet_hours_{userId}
 * Format: { startHour: 22, endHour: 8 } (24-hour format)
 */
async function isInQuietHours(db: D1Database, userId: string): Promise<boolean> {
  try {
    const result = await db
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .bind(`quiet_hours_${userId}`)
      .first<{ value: string }>();

    if (!result?.value) {
      return false; // No quiet hours configured
    }

    const quietHours = JSON.parse(result.value);
    const now = new Date();
    const currentHour = now.getHours();

    if (quietHours.startHour < quietHours.endHour) {
      // Normal range (e.g., 9-17)
      return currentHour >= quietHours.startHour && currentHour < quietHours.endHour;
    } else {
      // Wrapping range (e.g., 22-8)
      return currentHour >= quietHours.startHour || currentHour < quietHours.endHour;
    }
  } catch (err) {
    console.error('Failed to check quiet hours:', err);
    return false;
  }
}

/**
 * Set quiet hours for a user.
 */
export async function setQuietHours(
  db: D1Database,
  userId: string,
  startHour: number,
  endHour: number
): Promise<void> {
  const now = new Date().toISOString();

  await db
    .prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `)
    .bind(`quiet_hours_${userId}`, JSON.stringify({ startHour, endHour }), now)
    .run();
}
