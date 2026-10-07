import type { Env } from '../types';
import { generateId } from '../utils/uuid';
import { getTenantTimeZone, localDateString, addDaysLocal } from '../utils/tz';

/**
 * Daily cron job to check for expiring vehicle/driver documents and upcoming maintenance.
 * Sends push notifications and creates in-app notifications for admin/manager roles.
 */
export async function processFleetAlerts(env: Env, now: Date = new Date()) {
  try {
    const tenants = await env.MASTER_DB.prepare('SELECT id FROM tenants WHERE is_active = 1').all();

    for (const tenant of (tenants.results || [])) {
      const tenantId = tenant.id as string;
      const dbKey = `TENANT_DB_${tenantId}` as `TENANT_DB_${string}`;
      const db = env[dbKey];
      if (!db) continue;

      await processFleetAlertsForTenant(env, db, tenantId, now);
    }
  } catch (err) {
    console.error('Fleet alerts cron error:', err);
  }
}

/** One tenant's alerts. `now` is injectable so tests can pin the clock. */
export async function processFleetAlertsForTenant(env: Env, db: D1Database, tenantId: string, now: Date = new Date()) {
  // every date below is the tenant's local calendar day, not the UTC date
  const today = localDateString(await getTenantTimeZone(db), now);
  const alertDays = [30, 15, 7, 1];

  // ── Vehicle document expiry alerts ──────────────────────────
  for (const days of alertDays) {
    const targetDate = addDaysLocal(today, days);

    const expiringVehicleDocs = await db.prepare(`
      SELECT vd.id, vd.type, vd.expiry_date, v.id as vehicle_id, v.registration_number
      FROM vehicle_documents vd
      JOIN vehicles v ON vd.vehicle_id = v.id
      WHERE vd.is_active = 1 AND v.is_deleted = 0 AND vd.expiry_date = ?
    `).bind(targetDate).all();

    for (const doc of (expiringVehicleDocs.results || [])) {
      const alreadySent = await db.prepare(
        "SELECT 1 FROM reminder_log WHERE entity_type = 'vehicle_document' AND entity_id = ? AND sent_date = ?"
      ).bind(doc.id, today).first();
      if (alreadySent) continue;

      const docLabel = (doc.type as string).toUpperCase().replace('_', ' ');
      await env.PUSH_NOTIFICATION_QUEUE.send({
        type: 'fleet_document_expiry',
        title: 'Vehicle Document Expiring',
        body: `Vehicle ${doc.registration_number}: ${docLabel} expires in ${days} day(s)`,
        entityType: 'vehicle',
        entityId: doc.vehicle_id,
        tenantId,
      });

      await db.prepare(
        "INSERT INTO reminder_log (id, entity_type, entity_id, reminder_type, sent_date, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(generateId(), 'vehicle_document', doc.id, `expiry_${days}d`, today, new Date().toISOString()).run();
    }
  }

  // ── Driver document expiry alerts ───────────────────────────
  for (const days of alertDays) {
    const targetDate = addDaysLocal(today, days);

    const expiringDriverDocs = await db.prepare(`
      SELECT dd.id, dd.type, dd.expiry_date, d.id as driver_id, d.name as driver_name
      FROM driver_documents dd
      JOIN drivers d ON dd.driver_id = d.id
      WHERE dd.is_active = 1 AND d.is_deleted = 0 AND dd.expiry_date = ?
    `).bind(targetDate).all();

    for (const doc of (expiringDriverDocs.results || [])) {
      const alreadySent = await db.prepare(
        "SELECT 1 FROM reminder_log WHERE entity_type = 'driver_document' AND entity_id = ? AND sent_date = ?"
      ).bind(doc.id, today).first();
      if (alreadySent) continue;

      const docLabel = (doc.type as string).toUpperCase().replace('_', ' ');
      await env.PUSH_NOTIFICATION_QUEUE.send({
        type: 'fleet_document_expiry',
        title: 'Driver Document Expiring',
        body: `Driver ${doc.driver_name}: ${docLabel} expires in ${days} day(s)`,
        entityType: 'driver',
        entityId: doc.driver_id,
        tenantId,
      });

      await db.prepare(
        "INSERT INTO reminder_log (id, entity_type, entity_id, reminder_type, sent_date, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(generateId(), 'driver_document', doc.id, `expiry_${days}d`, today, new Date().toISOString()).run();
    }
  }

  // ── Expired documents (daily reminder) ──────────────────────
  const expiredVehicleDocs = await db.prepare(`
    SELECT vd.id, vd.type, vd.expiry_date, v.id as vehicle_id, v.registration_number
    FROM vehicle_documents vd
    JOIN vehicles v ON vd.vehicle_id = v.id
    WHERE vd.is_active = 1 AND v.is_deleted = 0 AND vd.expiry_date < ?
  `).bind(today).all();

  for (const doc of (expiredVehicleDocs.results || [])) {
    const alreadySent = await db.prepare(
      "SELECT 1 FROM reminder_log WHERE entity_type = 'vehicle_document' AND entity_id = ? AND reminder_type = 'expired' AND sent_date = ?"
    ).bind(doc.id, today).first();
    if (alreadySent) continue;

    const daysAgo = Math.ceil((new Date(today).getTime() - new Date(doc.expiry_date as string).getTime()) / 86400000);
    const docLabel = (doc.type as string).toUpperCase().replace('_', ' ');
    await env.PUSH_NOTIFICATION_QUEUE.send({
      type: 'fleet_document_expired',
      title: 'Vehicle Document EXPIRED',
      body: `${doc.registration_number}: ${docLabel} EXPIRED ${daysAgo} day(s) ago`,
      entityType: 'vehicle',
      entityId: doc.vehicle_id,
      tenantId,
    });

    await db.prepare(
      "INSERT INTO reminder_log (id, entity_type, entity_id, reminder_type, sent_date, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(generateId(), 'vehicle_document', doc.id, 'expired', today, new Date().toISOString()).run();
  }

  // ── Maintenance due alerts ──────────────────────────────────
  const sevenDays = addDaysLocal(today, 7);
  const maintenanceDue = await db.prepare(`
    SELECT id, registration_number, next_service_due
    FROM vehicles
    WHERE is_deleted = 0 AND next_service_due IS NOT NULL AND next_service_due <= ?
  `).bind(sevenDays).all();

  for (const vehicle of (maintenanceDue.results || [])) {
    const alreadySent = await db.prepare(
      "SELECT 1 FROM reminder_log WHERE entity_type = 'vehicle_maintenance' AND entity_id = ? AND sent_date = ?"
    ).bind(vehicle.id, today).first();
    if (alreadySent) continue;

    await env.PUSH_NOTIFICATION_QUEUE.send({
      type: 'fleet_maintenance_due',
      title: 'Vehicle Maintenance Due',
      body: `${vehicle.registration_number}: Service due by ${vehicle.next_service_due}`,
      entityType: 'vehicle',
      entityId: vehicle.id,
      tenantId,
    });

    await db.prepare(
      "INSERT INTO reminder_log (id, entity_type, entity_id, reminder_type, sent_date, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(generateId(), 'vehicle_maintenance', vehicle.id, 'maintenance_due', today, new Date().toISOString()).run();
  }

  // ── Summary notification ────────────────────────────────────
  const totalExpiring = (expiredVehicleDocs.results?.length || 0);
  const totalMaintenance = (maintenanceDue.results?.length || 0);
  if (totalExpiring > 0 || totalMaintenance > 0) {
    const alreadySent = await db.prepare(
      "SELECT 1 FROM reminder_log WHERE entity_type = 'fleet_summary' AND entity_id = ? AND sent_date = ?"
    ).bind(tenantId, today).first();

    if (!alreadySent) {
      await env.PUSH_NOTIFICATION_QUEUE.send({
        type: 'fleet_daily_summary',
        title: 'Fleet Daily Summary',
        body: `Fleet Alert: ${totalExpiring} document(s) expiring/expired, ${totalMaintenance} maintenance due`,
        entityType: 'fleet',
        entityId: 'dashboard',
        tenantId,
      });

      await db.prepare(
        "INSERT INTO reminder_log (id, entity_type, entity_id, reminder_type, sent_date, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(generateId(), 'fleet_summary', tenantId, 'daily_summary', today, new Date().toISOString()).run();
    }
  }
}
