import { Hono } from 'hono';
import type { AppContext } from '../types';
import { success, created, error, notFound } from '../utils/response';
import { generateId } from '../utils/uuid';

const pushTokenRoutes = new Hono<AppContext>();

// ============================================================
// POST /api/v1/push-tokens
// Register or update a push token for the current user
// ============================================================

pushTokenRoutes.post('/', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');

  const body = await c.req.json<{
    fcmToken: string;
    deviceType?: string; // android, ios, web
    deviceName?: string;
  }>();

  // Validation
  if (!body.fcmToken) {
    return error(c, 'fcmToken is required', 400);
  }

  const deviceType = body.deviceType || 'web';
  const deviceName = body.deviceName || `${deviceType}_device`;
  const now = new Date().toISOString();

  try {
    // Check if token already exists for this user
    const existing = await tenantDb
      .prepare(`SELECT id FROM push_tokens WHERE user_id = ? AND fcm_token = ?`)
      .bind(userId, body.fcmToken)
      .first<{ id: string }>();

    if (existing) {
      // Update existing token (reactivate if needed)
      await tenantDb
        .prepare(`
          UPDATE push_tokens
          SET device_type = ?, device_name = ?, is_active = 1, updated_at = ?
          WHERE id = ?
        `)
        .bind(deviceType, deviceName, now, existing.id)
        .run();

      return success(c, {
        id: existing.id,
        fcmToken: body.fcmToken,
        deviceType,
        deviceName,
        isActive: 1,
      });
    }

    // Create new token
    const id = generateId();
    await tenantDb
      .prepare(`
        INSERT INTO push_tokens (id, user_id, fcm_token, device_type, device_name, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `)
      .bind(id, userId, body.fcmToken, deviceType, deviceName, now, now)
      .run();

    return created(c, {
      id,
      fcmToken: body.fcmToken,
      deviceType,
      deviceName,
      isActive: 1,
    });
  } catch (err) {
    console.error('Failed to register push token:', err);
    return error(c, 'Failed to register token', 500);
  }
});

// ============================================================
// GET /api/v1/push-tokens
// List all push tokens for the current user
// ============================================================

pushTokenRoutes.get('/', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');

  try {
    const result = await tenantDb
      .prepare(`
        SELECT id, fcm_token, device_type, device_name, is_active, created_at, updated_at
        FROM push_tokens
        WHERE user_id = ?
        ORDER BY created_at DESC
      `)
      .bind(userId)
      .all();

    return success(c, {
      items: result.results ?? [],
      total: result.results?.length ?? 0,
    });
  } catch (err) {
    console.error('Failed to list push tokens:', err);
    return error(c, 'Failed to list tokens', 500);
  }
});

// ============================================================
// DELETE /api/v1/push-tokens/:token
// Deregister a push token (on logout or device removal)
// ============================================================

pushTokenRoutes.delete('/:token', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const token = c.req.param('token');

  try {
    // Check if token exists and belongs to user
    const existing = await tenantDb
      .prepare(`SELECT id FROM push_tokens WHERE id = ? AND user_id = ?`)
      .bind(token, userId)
      .first<{ id: string }>();

    if (!existing) {
      return notFound(c, 'Push token not found');
    }

    // Delete the token
    await tenantDb
      .prepare(`DELETE FROM push_tokens WHERE id = ? AND user_id = ?`)
      .bind(token, userId)
      .run();

    return success(c, { id: token });
  } catch (err) {
    console.error('Failed to delete push token:', err);
    return error(c, 'Failed to delete token', 500);
  }
});

// ============================================================
// DELETE /api/v1/push-tokens/token/:fcmToken
// Deregister by FCM token value (for client logout)
// ============================================================

pushTokenRoutes.delete('/token/:fcmToken', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const fcmToken = c.req.param('fcmToken');

  try {
    const result = await tenantDb
      .prepare(`DELETE FROM push_tokens WHERE user_id = ? AND fcm_token = ?`)
      .bind(userId, fcmToken)
      .run();

    if (result.meta.changes === 0) {
      return notFound(c, 'Push token not found');
    }

    return success(c, { message: 'Token deregistered' });
  } catch (err) {
    console.error('Failed to deregister push token:', err);
    return error(c, 'Failed to deregister token', 500);
  }
});

export default pushTokenRoutes;
