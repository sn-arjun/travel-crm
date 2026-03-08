import { generateUUIDv7 } from './auth';

export async function logAudit(
  db: D1Database,
  adminId: string,
  action: string,
  details: Record<string, unknown>,
  entityType?: string,
  entityId?: string,
  ipAddress?: string,
  userAgent?: string
) {
  await db.prepare(`
    INSERT INTO super_admin_audit_log (id, admin_id, action, entity_type, entity_id, details, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    generateUUIDv7(),
    adminId,
    action,
    entityType || 'system',
    entityId || null,
    JSON.stringify(details),
    ipAddress || 'unknown',
    userAgent || 'unknown'
  ).run();
}
