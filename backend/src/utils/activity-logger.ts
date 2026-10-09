import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { activityLogs } from '../db/tenant-schema';
import { generateId } from './uuid';

export interface ActivityLogParams {
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: string;
  ipAddress?: string;
}

/** `db` may be the Drizzle wrapper or the raw D1 handle; some routes only have the latter. */
export async function logActivity(
  db: DrizzleD1Database | D1Database,
  params: ActivityLogParams
): Promise<void> {
  try {
    const orm = 'insert' in db ? db : drizzle(db);
    await orm.insert(activityLogs).values({
      id: generateId(),
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      details: params.details ?? null,
      ipAddress: params.ipAddress ?? null,
    });
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}
