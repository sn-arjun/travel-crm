import { Hono } from 'hono';
import type { AppContext } from '../types';
import { success, error } from '../utils/response';
import { saveNotificationPreferences, setQuietHours } from '../services/notification-service';

const preferencesRoutes = new Hono<AppContext>();

// ============================================================
// GET /api/v1/notification-preferences/me
// Get the current user's notification preferences
// ============================================================

preferencesRoutes.get('/me', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');

  try {
    // Get notification preferences
    const prefResult = await tenantDb
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .bind(`notification_prefs_${userId}`)
      .first<{ value: string }>();

    const preferences = prefResult?.value ? JSON.parse(prefResult.value) : getDefaultPreferences();

    // Get quiet hours
    const quietResult = await tenantDb
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .bind(`quiet_hours_${userId}`)
      .first<{ value: string }>();

    const quietHours = quietResult?.value ? JSON.parse(quietResult.value) : { startHour: 22, endHour: 8 };

    return success(c, {
      preferences,
      quietHours,
    });
  } catch (err) {
    console.error('Failed to get notification preferences:', err);
    return error(c, 'Failed to retrieve preferences', 500);
  }
});

// ============================================================
// PUT /api/v1/notification-preferences/me
// Update the current user's notification preferences
// ============================================================

preferencesRoutes.put('/me', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');

  const body = await c.req.json<{
    preferences?: Record<string, { push_enabled?: boolean; in_app_enabled?: boolean; email_enabled?: boolean }>;
    quietHours?: { startHour: number; endHour: number };
  }>();

  try {
    // Update preferences if provided
    if (body.preferences) {
      await saveNotificationPreferences(tenantDb, userId, body.preferences);
    }

    // Update quiet hours if provided
    if (body.quietHours) {
      const { startHour, endHour } = body.quietHours;

      // Validation
      if (typeof startHour !== 'number' || typeof endHour !== 'number' || startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) {
        return error(c, 'Invalid quiet hours. Must be 0-23', 400);
      }

      await setQuietHours(tenantDb, userId, startHour, endHour);
    }

    // Return updated values
    const prefResult = await tenantDb
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .bind(`notification_prefs_${userId}`)
      .first<{ value: string }>();

    const preferences = prefResult?.value ? JSON.parse(prefResult.value) : getDefaultPreferences();

    const quietResult = await tenantDb
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .bind(`quiet_hours_${userId}`)
      .first<{ value: string }>();

    const quietHours = quietResult?.value ? JSON.parse(quietResult.value) : { startHour: 22, endHour: 8 };

    return success(c, {
      preferences,
      quietHours,
      message: 'Preferences updated successfully',
    });
  } catch (err) {
    console.error('Failed to update notification preferences:', err);
    return error(c, 'Failed to update preferences', 500);
  }
});

// ============================================================
// GET /api/v1/notification-preferences/me/quiet-hours
// Get the current user's quiet hours
// ============================================================

preferencesRoutes.get('/me/quiet-hours', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');

  try {
    const result = await tenantDb
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .bind(`quiet_hours_${userId}`)
      .first<{ value: string }>();

    const quietHours = result?.value ? JSON.parse(result.value) : { startHour: 22, endHour: 8 };

    return success(c, quietHours);
  } catch (err) {
    console.error('Failed to get quiet hours:', err);
    return error(c, 'Failed to retrieve quiet hours', 500);
  }
});

// ============================================================
// PUT /api/v1/notification-preferences/me/quiet-hours
// Set the current user's quiet hours
// ============================================================

preferencesRoutes.put('/me/quiet-hours', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');

  const body = await c.req.json<{ startHour: number; endHour: number }>();

  // Validation
  if (typeof body.startHour !== 'number' || typeof body.endHour !== 'number' || body.startHour < 0 || body.startHour > 23 || body.endHour < 0 || body.endHour > 23) {
    return error(c, 'Invalid quiet hours. startHour and endHour must be between 0 and 23', 400);
  }

  try {
    await setQuietHours(tenantDb, userId, body.startHour, body.endHour);

    return success(c, {
      startHour: body.startHour,
      endHour: body.endHour,
      message: 'Quiet hours updated successfully',
    });
  } catch (err) {
    console.error('Failed to set quiet hours:', err);
    return error(c, 'Failed to update quiet hours', 500);
  }
});

/**
 * Get default notification preferences.
 */
function getDefaultPreferences(): Record<
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

export default preferencesRoutes;
