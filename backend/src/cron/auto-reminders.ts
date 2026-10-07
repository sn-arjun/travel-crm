import type { Env } from '../types';
import { createInAppNotification } from '../services/notification-service';
import { getTenantTimeZone, localDateString, localMonthDay, addDaysLocal, sqlOffsetModifier } from '../utils/tz';

/**
 * Daily cron job (runs at 8 AM) to check for upcoming birthdays and anniversaries.
 * Sends WhatsApp/SMS birthday wishes to contacts.
 */
export async function checkBirthdayAnniversary(env: Env): Promise<void> {
  try {
    const tenants = await env.MASTER_DB
      .prepare('SELECT db_binding, id FROM workspaces WHERE is_active = 1')
      .all<{ db_binding: string; id: string }>();

    for (const tenant of tenants.results) {
      const tenantDb = ((env as unknown) as Record<string, D1Database>)[tenant.db_binding] as D1Database | undefined;
      if (!tenantDb) continue;

      await processBirthdaysForTenant(env, tenantDb, tenant.id);
    }
  } catch (err) {
    console.error('Birthday/Anniversary check failed:', err);
  }
}

export async function processBirthdaysForTenant(env: Env, db: D1Database, tenantId: string, now: Date = new Date()): Promise<void> {
  try {
    // 'today' is the tenant's local calendar day (birthdays are local calendar dates)
    const monthDay = localMonthDay(await getTenantTimeZone(db), now); // MM-DD format

    // Find contacts with birthdays today
    const birthdayContacts = await db
      .prepare(`
        SELECT id, name, phone, email
        FROM contacts
        WHERE birthday IS NOT NULL
          AND is_deleted = 0
          AND substr(birthday, 6, 5) = ?
      `)
      .bind(monthDay)
      .all<{ id: string; name: string; phone?: string; email?: string }>();

    for (const contact of birthdayContacts.results) {
      // Queue WhatsApp/SMS message (would integrate with Twilio)
      if (contact.phone) {
        await env.SMS_QUEUE.send({
          type: 'sms',
          data: {
            toNumber: contact.phone,
            message: `Happy Birthday ${contact.name}! Wishing you a wonderful day ahead.`,
            templateId: 'birthday_wish',
          },
        });
      }

      // Create notification for admins/managers
      const admins = await db
        .prepare(`SELECT id FROM users WHERE role IN ('admin', 'sales_manager') AND is_active = 1`)
        .all<{ id: string }>();

      for (const admin of admins.results) {
        await createInAppNotification(
          db,
          admin.id,
          `Birthday Reminder: ${contact.name}`,
          `Today is ${contact.name}'s birthday!`,
          'birthday',
          'contact',
          contact.id
        );
      }
    }

    // Find contacts with anniversaries today (similar logic)
    const anniversaryContacts = await db
      .prepare(`
        SELECT id, name, phone, email
        FROM contacts
        WHERE anniversary IS NOT NULL
          AND is_deleted = 0
          AND substr(anniversary, 6, 5) = ?
      `)
      .bind(monthDay)
      .all<{ id: string; name: string; phone?: string; email?: string }>();

    for (const contact of anniversaryContacts.results) {
      if (contact.phone) {
        await env.SMS_QUEUE.send({
          type: 'sms',
          data: {
            toNumber: contact.phone,
            message: `Happy Anniversary ${contact.name}! Here's to many more wonderful years.`,
            templateId: 'anniversary_wish',
          },
        });
      }
    }
  } catch (err) {
    console.error(`Birthday/Anniversary processing failed for tenant ${tenantId}:`, err);
  }
}

/**
 * Daily cron job to check for invoice reminders.
 * - Due in 3 days → email + WhatsApp
 * - Overdue 1 day → email + WhatsApp
 * - Overdue 7 days → email + WhatsApp + push to accountant
 */
export async function checkInvoiceReminders(env: Env): Promise<void> {
  try {
    const tenants = await env.MASTER_DB
      .prepare('SELECT db_binding, id FROM workspaces WHERE is_active = 1')
      .all<{ db_binding: string; id: string }>();

    for (const tenant of tenants.results) {
      const tenantDb = ((env as unknown) as Record<string, D1Database>)[tenant.db_binding] as D1Database | undefined;
      if (!tenantDb) continue;

      await processInvoiceRemindersForTenant(env, tenantDb);
    }
  } catch (err) {
    console.error('Invoice reminder check failed:', err);
  }
}

export async function processInvoiceRemindersForTenant(env: Env, db: D1Database, now: Date = new Date()): Promise<void> {
  try {
    // invoice due dates are local calendar dates: count days on the tenant's calendar
    const today = localDateString(await getTenantTimeZone(db), now); // YYYY-MM-DD
    const tomorrow = addDaysLocal(today, 1);
    const in3Days = addDaysLocal(today, 3);
    const yesterday = addDaysLocal(today, -1);
    const week1Ago = addDaysLocal(today, -7);

    // Due in 3 days
    const dueIn3Days = await db
      .prepare(`
        SELECT id, invoice_number, contact_id, total, due_date, created_by
        FROM invoices
        WHERE status NOT IN ('paid', 'cancelled')
          AND due_date = ?
      `)
      .bind(in3Days)
      .all<{ id: string; invoice_number: string; contact_id: string; total: number; due_date: string; created_by: string }>();

    for (const inv of dueIn3Days.results) {
      const contact = await db.prepare(`SELECT phone, email FROM contacts WHERE id = ?`).bind(inv.contact_id).first();

      if (contact?.phone) {
        await env.SMS_QUEUE.send({
          type: 'sms',
          data: {
            toNumber: contact.phone,
            message: `Reminder: Invoice ${inv.invoice_number} for ${inv.total} is due on ${inv.due_date}. Please make payment at your earliest convenience.`,
            templateId: 'invoice_due_reminder',
          },
        });
      }

      if (contact?.email) {
        await env.EMAIL_QUEUE.send({
          type: 'email',
          data: {
            toEmail: contact.email,
            subject: `Invoice ${inv.invoice_number} - Payment Due in 3 Days`,
            templateId: 'invoice_due_reminder_email',
          },
        });
      }
    }

    // Overdue 1 day
    const overdue1Day = await db
      .prepare(`
        SELECT id, invoice_number, contact_id, total, due_date
        FROM invoices
        WHERE status NOT IN ('paid', 'cancelled')
          AND due_date = ?
      `)
      .bind(yesterday)
      .all<{ id: string; invoice_number: string; contact_id: string; total: number; due_date: string }>();

    for (const inv of overdue1Day.results) {
      const contact = await db.prepare(`SELECT phone, email FROM contacts WHERE id = ?`).bind(inv.contact_id).first();

      if (contact?.phone) {
        await env.SMS_QUEUE.send({
          type: 'sms',
          data: {
            toNumber: contact.phone,
            message: `Invoice ${inv.invoice_number} is now overdue. Please settle the outstanding amount of ${inv.total} immediately.`,
            templateId: 'invoice_overdue_reminder',
          },
        });
      }

      if (contact?.email) {
        await env.EMAIL_QUEUE.send({
          type: 'email',
          data: {
            toEmail: contact.email,
            subject: `Invoice ${inv.invoice_number} - Payment Overdue`,
            templateId: 'invoice_overdue_email',
          },
        });
      }
    }

    // Overdue 7 days
    const overdue7Days = await db
      .prepare(`
        SELECT id, invoice_number, contact_id, total, due_date, created_by
        FROM invoices
        WHERE status NOT IN ('paid', 'cancelled')
          AND due_date = ?
      `)
      .bind(week1Ago)
      .all<{ id: string; invoice_number: string; contact_id: string; total: number; due_date: string; created_by: string }>();

    for (const inv of overdue7Days.results) {
      const contact = await db.prepare(`SELECT phone, email FROM contacts WHERE id = ?`).bind(inv.contact_id).first();

      if (contact?.phone) {
        await env.SMS_QUEUE.send({
          type: 'sms',
          data: {
            toNumber: contact.phone,
            message: `URGENT: Invoice ${inv.invoice_number} is 7 days overdue. Amount due: ${inv.total}. Immediate payment required.`,
            templateId: 'invoice_urgent_reminder',
          },
        });
      }

      if (contact?.email) {
        await env.EMAIL_QUEUE.send({
          type: 'email',
          data: {
            toEmail: contact.email,
            subject: `URGENT: Invoice ${inv.invoice_number} - Severely Overdue`,
            templateId: 'invoice_urgent_email',
          },
        });
      }

      // Send push to accountant
      if (inv.created_by) {
        await env.PUSH_NOTIFICATION_QUEUE.send({
          type: 'push',
          data: {
            userId: inv.created_by,
            title: 'Invoice Severely Overdue',
            body: `Invoice ${inv.invoice_number} is 7 days overdue. Contact required.`,
            data: {
              type: 'invoice_overdue',
              entityType: 'invoice',
              entityId: inv.id,
            },
          },
        });
      }
    }

    // Overdue 14 days — final escalation
    const week2Ago = addDaysLocal(today, -14);
    const overdue14Days = await db
      .prepare(`
        SELECT id, invoice_number, contact_id, total, due_date, created_by
        FROM invoices
        WHERE status NOT IN ('paid', 'cancelled')
          AND due_date = ?
      `)
      .bind(week2Ago)
      .all<{ id: string; invoice_number: string; contact_id: string; total: number; due_date: string; created_by: string }>();

    for (const inv of overdue14Days.results) {
      const contact = await db.prepare(`SELECT phone, email FROM contacts WHERE id = ?`).bind(inv.contact_id).first();

      if (contact?.phone) {
        await env.SMS_QUEUE.send({
          type: 'sms',
          data: {
            toNumber: contact.phone,
            message: `FINAL NOTICE: Invoice ${inv.invoice_number} is 14 days overdue. Amount: ${inv.total}. Please contact us immediately to avoid service suspension.`,
            templateId: 'invoice_final_notice',
          },
        });
      }

      if (contact?.email) {
        await env.EMAIL_QUEUE.send({
          type: 'email',
          data: {
            toEmail: contact.email,
            subject: `FINAL NOTICE: Invoice ${inv.invoice_number} - 14 Days Overdue`,
            templateId: 'invoice_final_notice_email',
          },
        });
      }

      // Notify all admins
      const admins = await db
        .prepare(`SELECT id FROM users WHERE role = 'admin' AND is_active = 1`)
        .all<{ id: string }>();
      for (const admin of admins.results) {
        await createInAppNotification(
          db,
          admin.id,
          `Invoice ${inv.invoice_number} - 14 Days Overdue`,
          `Invoice for ${inv.total} is critically overdue (14 days). Immediate action required.`,
          'invoice_overdue',
          'invoice',
          inv.id
        );
      }
    }
  } catch (err) {
    console.error('Invoice reminder processing failed:', err);
  }
}

/**
 * Daily cron job to check for visa/passport expiry reminders.
 * - Visa expiry 30 days → push to salesperson
 * - Passport expiry 6 months → email to contact
 */
export async function checkVisaPassportExpiry(env: Env): Promise<void> {
  try {
    const tenants = await env.MASTER_DB
      .prepare('SELECT db_binding, id FROM workspaces WHERE is_active = 1')
      .all<{ db_binding: string; id: string }>();

    for (const tenant of tenants.results) {
      const tenantDb = ((env as unknown) as Record<string, D1Database>)[tenant.db_binding] as D1Database | undefined;
      if (!tenantDb) continue;

      await processVisaPassportForTenant(env, tenantDb);
    }
  } catch (err) {
    console.error('Visa/Passport expiry check failed:', err);
  }
}

export async function processVisaPassportForTenant(env: Env, db: D1Database, now: Date = new Date()): Promise<void> {
  try {
    const today = localDateString(await getTenantTimeZone(db), now);
    const in30Days = addDaysLocal(today, 30);
    const in6Months = addDaysLocal(today, 180);

    // Check visa expiries in 30 days
    const visasExpiring = await db
      .prepare(`
        SELECT va.id, va.destination_country as country, t.first_name, t.last_name, l.assigned_to, l.id as lead_id
        FROM visa_applications va
        JOIN travellers t ON va.traveller_id = t.id
        LEFT JOIN leads l ON va.lead_id = l.id
        WHERE va.status = 'approved'
          AND va.visa_expiry_date <= ?
          AND va.visa_expiry_date >= ?
      `)
      .bind(in30Days, today)
      .all<{ id: string; country: string; first_name: string; last_name: string; assigned_to?: string; lead_id?: string }>();

    for (const visa of visasExpiring.results) {
      if (visa.assigned_to) {
        await env.PUSH_NOTIFICATION_QUEUE.send({
          type: 'push',
          data: {
            userId: visa.assigned_to,
            title: `Visa Expiring Soon: ${visa.country}`,
            body: `${visa.first_name} ${visa.last_name}'s visa for ${visa.country} expires in 30 days`,
            data: {
              type: 'visa_expiry',
              entityType: 'visa_application',
              entityId: visa.id,
            },
          },
        });
      }
    }

    // Check passport expiries in 6 months
    const passportsExpiring = await db
      .prepare(`
        SELECT t.id, t.first_name, t.last_name, t.contact_id, t.passport_expiry_date as passport_expiry
        FROM travellers t
        WHERE t.passport_expiry_date IS NOT NULL
          AND t.passport_expiry_date <= ?
          AND t.passport_expiry_date >= ?
      `)
      .bind(in6Months, today)
      .all<{ id: string; first_name: string; last_name: string; contact_id?: string; passport_expiry: string }>();

    for (const passport of passportsExpiring.results) {
      if (passport.contact_id) {
        const contact = await db.prepare(`SELECT email FROM contacts WHERE id = ?`).bind(passport.contact_id).first<{ email?: string }>();

        if (contact?.email) {
          await env.EMAIL_QUEUE.send({
            type: 'email',
            data: {
              toEmail: contact.email,
              subject: 'Passport Renewal Reminder',
              templateId: 'passport_expiry_reminder',
            },
          });
        }
      }
    }
  } catch (err) {
    console.error('Visa/Passport expiry processing failed:', err);
  }
}

/**
 * Daily cron job to check for missing visa documents.
 * - If > 7 days since application and status is documents_collecting -> Email to contact
 */
export async function checkMissingVisaDocuments(env: Env): Promise<void> {
  try {
    const tenants = await env.MASTER_DB
      .prepare('SELECT db_binding, id FROM workspaces WHERE is_active = 1')
      .all<{ db_binding: string; id: string }>();

    for (const tenant of tenants.results) {
      const tenantDb = ((env as unknown) as Record<string, D1Database>)[tenant.db_binding] as D1Database | undefined;
      if (!tenantDb) continue;

      await processMissingVisaDocsForTenant(env, tenantDb);
    }
  } catch (err) {
    console.error('Missing visa docs check failed:', err);
  }
}

export async function processMissingVisaDocsForTenant(env: Env, db: D1Database, now: Date = new Date()): Promise<void> {
  try {
    const tz = await getTenantTimeZone(db);
    const sevenDaysAgo = addDaysLocal(localDateString(tz, now), -7);
    const tzMod = sqlOffsetModifier(tz, now);

    const pendingVisas = await db
      .prepare(`
        SELECT va.id, va.destination_country as country, t.first_name, t.last_name, c.email
        FROM visa_applications va
        JOIN travellers t ON va.traveller_id = t.id
        LEFT JOIN contacts c ON t.contact_id = c.id
        WHERE va.status = 'documents_collecting'
          AND date(va.created_at, '${tzMod}') <= ?
      `)
      .bind(sevenDaysAgo)
      .all<{ id: string; country: string; first_name: string; last_name: string; email?: string }>();

    for (const visa of pendingVisas.results) {
      if (visa.email) {
        await env.EMAIL_QUEUE.send({
          type: 'email',
          data: {
            toEmail: visa.email,
            subject: `Action Required: Missing Documents for ${visa.country} Visa`,
            templateId: 'visa_missing_docs_reminder',
          }
        });
      }
    }
  } catch (err) {
    console.error('Missing visa docs processing failed:', err);
  }
}

/**
 * Daily cron job to check for trip reminders.
 * - Departure tomorrow → WhatsApp + email summary
 * - Completed yesterday → feedback request email
 */
export async function checkTripReminders(env: Env): Promise<void> {
  try {
    const tenants = await env.MASTER_DB
      .prepare('SELECT db_binding, id FROM workspaces WHERE is_active = 1')
      .all<{ db_binding: string; id: string }>();

    for (const tenant of tenants.results) {
      const tenantDb = ((env as unknown) as Record<string, D1Database>)[tenant.db_binding] as D1Database | undefined;
      if (!tenantDb) continue;

      await processTripRemindersForTenant(env, tenantDb);
    }
  } catch (err) {
    console.error('Trip reminder check failed:', err);
  }
}

export async function processTripRemindersForTenant(env: Env, db: D1Database, now: Date = new Date()): Promise<void> {
  try {
    const today = localDateString(await getTenantTimeZone(db), now);
    const tomorrow = addDaysLocal(today, 1);
    const yesterday = addDaysLocal(today, -1);

    // Trips departing tomorrow
    const departingTomorrow = await db
      .prepare(`
        SELECT l.id, l.title, l.contact_id, c.phone, c.email
        FROM leads l
        JOIN contacts c ON l.contact_id = c.id
        WHERE l.status NOT IN ('lost', 'completed')
          AND l.travel_date = ?
      `)
      .bind(tomorrow)
      .all<{ id: string; title: string; contact_id: string; phone?: string; email?: string }>();

    for (const trip of departingTomorrow.results) {
      if (trip.phone) {
        await env.SMS_QUEUE.send({
          type: 'sms',
          data: {
            toNumber: trip.phone,
            message: `Ready for your trip? Your journey "${trip.title}" departs tomorrow. Please confirm all arrangements are in place.`,
            templateId: 'trip_departure_reminder',
          },
        });
      }

      if (trip.email) {
        await env.EMAIL_QUEUE.send({
          type: 'email',
          data: {
            toEmail: trip.email,
            subject: `Your Trip Departs Tomorrow: ${trip.title}`,
            templateId: 'trip_departure_email',
          },
        });
      }
    }

    // Trips completed yesterday - request feedback
    const completedYesterday = await db
      .prepare(`
        SELECT l.id, l.title, l.contact_id, c.phone, c.email
        FROM leads l
        JOIN contacts c ON l.contact_id = c.id
        WHERE l.status = 'completed'
          AND l.return_date = ?
      `)
      .bind(yesterday)
      .all<{ id: string; title: string; contact_id: string; phone?: string; email?: string }>();

    for (const trip of completedYesterday.results) {
      if (trip.email) {
        await env.EMAIL_QUEUE.send({
          type: 'email',
          data: {
            toEmail: trip.email,
            subject: `How was your trip? Share your feedback for "${trip.title}"`,
            templateId: 'trip_feedback_request',
          },
        });
      }
    }
  } catch (err) {
    console.error('Trip reminder processing failed:', err);
  }
}
