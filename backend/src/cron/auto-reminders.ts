import type { Env } from '../types';
import { eachRecipient } from './errors';
import { sendOnce, type RecipientClaims } from './recipient-claims';
import { createInAppNotification } from '../services/notification-service';
import { getTenantTimeZone, localDateString, localMonthDay, addDaysLocal, sqlOffsetModifier } from '../utils/tz';

/**
 * Scheduled customer reminders. Jobs are built in the shape the queue consumers read:
 *  - SMS_QUEUE   { type: 'sms',   data: SmsJob }   -> { to, body, channel: 'sms', tenantId, contactId?, templateId }
 *  - EMAIL_QUEUE { type: 'email', data: EmailJob } -> { to, subject, html, text, tenantId, templateId }
 * tenantId makes the consumer take one unit of the agency's monthly allowance before the provider is called
 * (skipped_allowance at the cap). Every send is guarded by a per-recipient claim (recipient-claims.ts) so a
 * retried job never messages the same recipient twice.
 */

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function queueSms(env: Env, tenantId: string, to: string, body: string, templateId: string, contactId?: string): Promise<void> {
  await env.SMS_QUEUE.send({
    type: 'sms',
    data: { to, body, channel: 'sms', tenantId, templateId, ...(contactId ? { contactId } : {}) },
  });
}

async function queueEmail(env: Env, tenantId: string, to: string, subject: string, text: string, templateId: string): Promise<void> {
  await env.EMAIL_QUEUE.send({
    type: 'email',
    data: { to, subject, text, html: `<p>${escapeHtml(text)}</p>`, tenantId, templateId },
  });
}

async function queuePush(env: Env, tenantId: string, userId: string, title: string, body: string, data: Record<string, string>): Promise<void> {
  await env.PUSH_NOTIFICATION_QUEUE.send({ type: 'push', data: { tenantId, userId, title, body, data } });
}

function claims(db: D1Database, tenantId: string, job: string, today: string): RecipientClaims {
  return { db, tenantId, job, period: `day:${today}` };
}

export async function processBirthdaysForTenant(env: Env, db: D1Database, tenantId: string, now: Date = new Date()): Promise<void> {
  // 'today' is the tenant's local calendar day (birthdays are local calendar dates)
  const tz = await getTenantTimeZone(db);
  const monthDay = localMonthDay(tz, now); // MM-DD format
  const c = claims(db, tenantId, 'contacts.birthdays', localDateString(tz, now));

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

  await eachRecipient('Birthdays', birthdayContacts.results, async (contact) => {
    if (contact.phone) {
      await sendOnce(c, `birthday:${contact.id}:sms`, () =>
        queueSms(env, tenantId, contact.phone!, `Happy Birthday ${contact.name}! Wishing you a wonderful day ahead.`, 'birthday_wish', contact.id));
    }

    // Create notification for admins/managers
    const admins = await db
      .prepare(`SELECT id FROM users WHERE role IN ('admin', 'sales_manager') AND is_active = 1`)
      .all<{ id: string }>();

    await eachRecipient('Birthdays', admins.results, async (admin) => {
      await sendOnce(c, `birthday:${contact.id}:notify:${admin.id}`, async () => {
        await createInAppNotification(
          db,
          admin.id,
          `Birthday Reminder: ${contact.name}`,
          `Today is ${contact.name}'s birthday!`,
          'birthday',
          'contact',
          contact.id
        );
      });
    });
  });

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

  await eachRecipient('Birthdays', anniversaryContacts.results, async (contact) => {
    if (contact.phone) {
      await sendOnce(c, `anniversary:${contact.id}:sms`, () =>
        queueSms(env, tenantId, contact.phone!, `Happy Anniversary ${contact.name}! Here's to many more wonderful years.`, 'anniversary_wish', contact.id));
    }
  });
}

interface InvoiceRow { id: string; invoice_number: string; contact_id: string; total: number; due_date: string; created_by?: string }

interface InvoiceStage {
  /** Short label used in the claim key: due3, overdue1, overdue7, overdue14. */
  stage: string;
  dueDate: string;
  sms: (inv: InvoiceRow) => string;
  smsTemplate: string;
  subject: (inv: InvoiceRow) => string;
  emailText: (inv: InvoiceRow) => string;
  emailTemplate: string;
}

export async function processInvoiceRemindersForTenant(env: Env, db: D1Database, tenantId: string, now: Date = new Date()): Promise<void> {
  // invoice due dates are local calendar dates: count days on the tenant's calendar
  const today = localDateString(await getTenantTimeZone(db), now); // YYYY-MM-DD

  const stages: InvoiceStage[] = [
    {
      stage: 'due3',
      dueDate: addDaysLocal(today, 3),
      sms: (inv) => `Reminder: Invoice ${inv.invoice_number} for ${inv.total} is due on ${inv.due_date}. Please make payment at your earliest convenience.`,
      smsTemplate: 'invoice_due_reminder',
      subject: (inv) => `Invoice ${inv.invoice_number} - Payment Due in 3 Days`,
      emailText: (inv) => `Reminder: Invoice ${inv.invoice_number} for ${inv.total} is due on ${inv.due_date}. Please make payment at your earliest convenience.`,
      emailTemplate: 'invoice_due_reminder_email',
    },
    {
      stage: 'overdue1',
      dueDate: addDaysLocal(today, -1),
      sms: (inv) => `Invoice ${inv.invoice_number} is now overdue. Please settle the outstanding amount of ${inv.total} immediately.`,
      smsTemplate: 'invoice_overdue_reminder',
      subject: (inv) => `Invoice ${inv.invoice_number} - Payment Overdue`,
      emailText: (inv) => `Invoice ${inv.invoice_number} was due on ${inv.due_date} and is now overdue. Please settle the outstanding amount of ${inv.total}.`,
      emailTemplate: 'invoice_overdue_email',
    },
    {
      stage: 'overdue7',
      dueDate: addDaysLocal(today, -7),
      sms: (inv) => `URGENT: Invoice ${inv.invoice_number} is 7 days overdue. Amount due: ${inv.total}. Immediate payment required.`,
      smsTemplate: 'invoice_urgent_reminder',
      subject: (inv) => `URGENT: Invoice ${inv.invoice_number} - Severely Overdue`,
      emailText: (inv) => `Invoice ${inv.invoice_number} is 7 days overdue. Amount due: ${inv.total}. Immediate payment is required.`,
      emailTemplate: 'invoice_urgent_email',
    },
    {
      stage: 'overdue14',
      dueDate: addDaysLocal(today, -14),
      sms: (inv) => `FINAL NOTICE: Invoice ${inv.invoice_number} is 14 days overdue. Amount: ${inv.total}. Please contact us immediately to avoid service suspension.`,
      smsTemplate: 'invoice_final_notice',
      subject: (inv) => `FINAL NOTICE: Invoice ${inv.invoice_number} - 14 Days Overdue`,
      emailText: (inv) => `FINAL NOTICE: Invoice ${inv.invoice_number} is 14 days overdue. Amount: ${inv.total}. Please contact us immediately to avoid service suspension.`,
      emailTemplate: 'invoice_final_notice_email',
    },
  ];

  for (const st of stages) {
    const c = claims(db, tenantId, `invoices.reminders:${st.stage}`, today);
    const due = await db
      .prepare(`
        SELECT id, invoice_number, contact_id, total, due_date, created_by
        FROM invoices
        WHERE status NOT IN ('paid', 'cancelled')
          AND due_date = ?
      `)
      .bind(st.dueDate)
      .all<InvoiceRow>();

    await eachRecipient('InvoiceReminders', due.results, async (inv) => {
      const contact = await db
        .prepare(`SELECT phone, email FROM contacts WHERE id = ?`)
        .bind(inv.contact_id)
        .first<{ phone?: string; email?: string }>();

      if (contact?.phone) {
        await sendOnce(c, `${inv.id}:sms`, () => queueSms(env, tenantId, contact.phone!, st.sms(inv), st.smsTemplate, inv.contact_id));
      }
      if (contact?.email) {
        await sendOnce(c, `${inv.id}:email`, () => queueEmail(env, tenantId, contact.email!, st.subject(inv), st.emailText(inv), st.emailTemplate));
      }

      if (st.stage === 'overdue7' && inv.created_by) {
        // push to the accountant
        await sendOnce(c, `${inv.id}:push`, () =>
          queuePush(env, tenantId, inv.created_by!, 'Invoice Severely Overdue', `Invoice ${inv.invoice_number} is 7 days overdue. Contact required.`, {
            type: 'invoice_overdue',
            entityType: 'invoice',
            entityId: inv.id,
          }));
      }

      if (st.stage === 'overdue14') {
        // notify all admins
        const admins = await db.prepare(`SELECT id FROM users WHERE role = 'admin' AND is_active = 1`).all<{ id: string }>();
        await eachRecipient('InvoiceReminders', admins.results, async (admin) => {
          await sendOnce(c, `${inv.id}:notify:${admin.id}`, async () => {
            await createInAppNotification(
              db,
              admin.id,
              `Invoice ${inv.invoice_number} - 14 Days Overdue`,
              `Invoice for ${inv.total} is critically overdue (14 days). Immediate action required.`,
              'invoice_overdue',
              'invoice',
              inv.id
            );
          });
        });
      }
    });
  }
}

export async function processVisaPassportForTenant(env: Env, db: D1Database, tenantId: string, now: Date = new Date()): Promise<void> {
  const today = localDateString(await getTenantTimeZone(db), now);
  const in30Days = addDaysLocal(today, 30);
  const in6Months = addDaysLocal(today, 180);
  const c = claims(db, tenantId, 'visa.passport-expiry', today);

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

  await eachRecipient('VisaPassport', visasExpiring.results, async (visa) => {
    if (visa.assigned_to) {
      await sendOnce(c, `visa:${visa.id}:push`, () =>
        queuePush(
          env, tenantId, visa.assigned_to!,
          `Visa Expiring Soon: ${visa.country}`,
          `${visa.first_name} ${visa.last_name}'s visa for ${visa.country} expires in 30 days`,
          { type: 'visa_expiry', entityType: 'visa_application', entityId: visa.id },
        ));
    }
  });

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

  await eachRecipient('VisaPassport', passportsExpiring.results, async (passport) => {
    if (passport.contact_id) {
      const contact = await db.prepare(`SELECT email FROM contacts WHERE id = ?`).bind(passport.contact_id).first<{ email?: string }>();

      if (contact?.email) {
        await sendOnce(c, `passport:${passport.id}:email`, () =>
          queueEmail(
            env, tenantId, contact.email!, 'Passport Renewal Reminder',
            `Dear ${passport.first_name} ${passport.last_name}, your passport expires on ${passport.passport_expiry}. Many countries require six months of validity, so please arrange a renewal soon.`,
            'passport_expiry_reminder',
          ));
      }
    }
  });
}

export async function processMissingVisaDocsForTenant(env: Env, db: D1Database, tenantId: string, now: Date = new Date()): Promise<void> {
  const tz = await getTenantTimeZone(db);
  const today = localDateString(tz, now);
  const sevenDaysAgo = addDaysLocal(today, -7);
  const tzMod = sqlOffsetModifier(tz, now);
  const c = claims(db, tenantId, 'visa.missing-documents', today);

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

  await eachRecipient('MissingVisaDocs', pendingVisas.results, async (visa) => {
    if (visa.email) {
      await sendOnce(c, `visa:${visa.id}:email`, () =>
        queueEmail(
          env, tenantId, visa.email!, `Action Required: Missing Documents for ${visa.country} Visa`,
          `Dear ${visa.first_name} ${visa.last_name}, we are still waiting for some of the documents for your ${visa.country} visa application. Please send them as soon as possible so we can proceed.`,
          'visa_missing_docs_reminder',
        ));
    }
  });
}

export async function processTripRemindersForTenant(env: Env, db: D1Database, tenantId: string, now: Date = new Date()): Promise<void> {
  const today = localDateString(await getTenantTimeZone(db), now);
  const tomorrow = addDaysLocal(today, 1);
  const yesterday = addDaysLocal(today, -1);
  const c = claims(db, tenantId, 'trips.reminders', today);

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

  await eachRecipient('TripReminders', departingTomorrow.results, async (trip) => {
    if (trip.phone) {
      await sendOnce(c, `departure:${trip.id}:sms`, () =>
        queueSms(env, tenantId, trip.phone!, `Ready for your trip? Your journey "${trip.title}" departs tomorrow. Please confirm all arrangements are in place.`, 'trip_departure_reminder', trip.contact_id));
    }

    if (trip.email) {
      await sendOnce(c, `departure:${trip.id}:email`, () =>
        queueEmail(
          env, tenantId, trip.email!, `Your Trip Departs Tomorrow: ${trip.title}`,
          `Your journey "${trip.title}" departs tomorrow. Please confirm all arrangements are in place.`,
          'trip_departure_email',
        ));
    }
  });

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

  await eachRecipient('TripReminders', completedYesterday.results, async (trip) => {
    if (trip.email) {
      await sendOnce(c, `feedback:${trip.id}:email`, () =>
        queueEmail(
          env, tenantId, trip.email!, `How was your trip? Share your feedback for "${trip.title}"`,
          `We hope you enjoyed "${trip.title}". We would love to hear how it went; please reply with your feedback.`,
          'trip_feedback_request',
        ));
    }
  });
}
