import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, and, or, like, count, sql, inArray } from 'drizzle-orm';
import type { AppContext } from '../types';
import {
  messageLog,
  messageTemplates,
  contacts,
  leads,
  invoices,
  itineraries,
  vouchers,
  users,
} from '../db/tenant-schema';
import { generateId } from '../utils/uuid';
import { success, created, paginated, error, notFound } from '../utils/response';
import { requirePermission } from '../middleware/rbac';
import { substituteVariables, resolveVariables } from '../services/template-engine';

const communicationRoutes = new Hono<AppContext>();

// ============================================================
// Zod Schemas
// ============================================================

const sendMessageSchema = z.object({
  channel: z.enum(['whatsapp', 'sms', 'email']),
  contact_id: z.string().min(1),
  lead_id: z.string().optional(),
  message: z.string().min(1).max(5000),
  media_url: z.string().url().optional(),
});

const sendTemplateSchema = z.object({
  contact_id: z.string().min(1),
  template_id: z.string().min(1),
  variables: z.record(z.string(), z.string()).optional(),
  lead_id: z.string().optional(),
});

const sendDocumentSchema = z.object({
  contact_id: z.string().min(1),
  channel: z.enum(['whatsapp', 'sms', 'email']),
  document_type: z.enum(['itinerary', 'invoice', 'voucher']),
  document_id: z.string().min(1),
  caption: z.string().optional(),
});

const bulkSendSchema = z.object({
  channel: z.enum(['whatsapp', 'sms', 'email']),
  contact_ids: z.array(z.string()).min(1).max(500),
  template_id: z.string().optional(),
  message: z.string().optional(),
});

const historyFilterSchema = z.object({
  contact_id: z.string().min(1).optional(),
  channel: z.enum(['whatsapp', 'sms', 'email']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const logFilterSchema = z.object({
  channel: z.enum(['whatsapp', 'sms', 'email']).optional(),
  status: z.enum(['queued', 'sent', 'delivered', 'read', 'failed']).optional(),
  sentBy: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// ============================================================
// POST /send — Send message
// ============================================================

communicationRoutes.post(
  '/send',
  requirePermission('communications', 'create'),
  zValidator('json', sendMessageSchema),
  async (c) => {
    const db = drizzle(c.get('tenantDb'));
    const userId = c.get('userId');
    const body = c.req.valid('json');

    try {
      // Verify contact exists
      const contact = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, body.contact_id))
        .limit(1)
        .then(rows => rows[0]);

      if (!contact) {
        return notFound(c, 'Contact');
      }

      // Verify we have destination info
      let destination = '';
      if (body.channel === 'sms' || body.channel === 'whatsapp') {
        destination = contact.phone || '';
        if (!destination) {
          return error(c, 'Contact has no phone number', 400);
        }
      } else if (body.channel === 'email') {
        destination = contact.email || '';
        if (!destination) {
          return error(c, 'Contact has no email address', 400);
        }
      }

      // Create message log entry
      const messageId = generateId();
      const now = new Date().toISOString();

      await db.insert(messageLog).values({
        id: messageId,
        contactId: body.contact_id,
        leadId: body.lead_id || null,
        channel: body.channel,
        templateId: null,
        subject: null,
        content: body.message,
        status: 'queued',
        externalId: null,
        errorMessage: null,
        sentBy: userId,
        sentAt: null,
        deliveredAt: null,
        readAt: null,
        createdAt: now,
      });

      // Queue message
      await c.env.SMS_QUEUE.send({
        type: body.channel === 'email' ? 'email' : 'sms',
        data: {
          to: destination,
          ...(body.channel === 'email' && { subject: 'Message', html: body.message }),
          ...(body.channel !== 'email' && { body: body.message }),
          messageLogId: messageId,
          contactId: body.contact_id,
          channel: body.channel,
          ...(body.media_url && { mediaUrl: body.media_url }),
        },
      });

      return created(c, {
        message_id: messageId,
        status: 'queued',
      });
    } catch (err) {
      console.error('Error sending message:', err);
      return error(c, 'Failed to send message', 500);
    }
  }
);

// ============================================================
// POST /send-template — Send template message
// ============================================================

communicationRoutes.post(
  '/send-template',
  requirePermission('communications', 'create'),
  zValidator('json', sendTemplateSchema),
  async (c) => {
    const db = drizzle(c.get('tenantDb'));
    const userId = c.get('userId');
    const body = c.req.valid('json');

    try {
      // Fetch template
      const template = await db
        .select()
        .from(messageTemplates)
        .where(eq(messageTemplates.id, body.template_id))
        .limit(1)
        .then(rows => rows[0]);

      if (!template) {
        return notFound(c, 'Template');
      }

      // Verify contact exists
      const contact = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, body.contact_id))
        .limit(1)
        .then(rows => rows[0]);

      if (!contact) {
        return notFound(c, 'Contact');
      }

      // Resolve variables
      const variables = await resolveVariables((db as any).$client as D1Database, body.contact_id, body.lead_id);
      const mergedVariables = { ...variables, ...body.variables };

      // Substitute in template
      const content = substituteVariables(template.content, mergedVariables);
      const subject = template.subject ? substituteVariables(template.subject, mergedVariables) : null;

      // Determine destination
      let destination = '';
      if (template.channel === 'sms' || template.channel === 'whatsapp') {
        destination = contact.phone || '';
        if (!destination) {
          return error(c, 'Contact has no phone number', 400);
        }
      } else if (template.channel === 'email') {
        destination = contact.email || '';
        if (!destination) {
          return error(c, 'Contact has no email address', 400);
        }
      }

      // Create message log entry
      const messageId = generateId();
      const now = new Date().toISOString();

      await db.insert(messageLog).values({
        id: messageId,
        contactId: body.contact_id,
        leadId: body.lead_id || null,
        channel: template.channel,
        templateId: body.template_id,
        subject: subject,
        content: content,
        status: 'queued',
        externalId: null,
        errorMessage: null,
        sentBy: userId,
        sentAt: null,
        deliveredAt: null,
        readAt: null,
        createdAt: now,
      });

      // Queue message
      await c.env.SMS_QUEUE.send({
        type: template.channel === 'email' ? 'email' : 'sms',
        data: {
          to: destination,
          ...(template.channel === 'email' && { subject: subject || 'Message', html: content }),
          ...(template.channel !== 'email' && { body: content }),
          messageLogId: messageId,
          contactId: body.contact_id,
          channel: template.channel,
        },
      });

      return created(c, {
        message_id: messageId,
        status: 'queued',
      });
    } catch (err) {
      console.error('Error sending template:', err);
      return error(c, 'Failed to send template', 500);
    }
  }
);

// ============================================================
// POST /send-document — Send document
// ============================================================

communicationRoutes.post(
  '/send-document',
  requirePermission('communications', 'create'),
  zValidator('json', sendDocumentSchema),
  async (c) => {
    const db = drizzle(c.get('tenantDb'));
    const userId = c.get('userId');
    const body = c.req.valid('json');

    try {
      // Verify contact exists
      const contact = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, body.contact_id))
        .limit(1)
        .then(rows => rows[0]);

      if (!contact) {
        return notFound(c, 'Contact');
      }

      // Build media URL based on document type
      let mediaUrl = '';
      if (body.document_type === 'itinerary') {
        const itinerary = await db
          .select()
          .from(itineraries)
          .where(eq(itineraries.id, body.document_id))
          .limit(1)
          .then(rows => rows[0]);
        if (!itinerary) {
          return notFound(c, 'Itinerary');
        }
        mediaUrl = `/api/v1/itineraries/${body.document_id}/pdf`;
      } else if (body.document_type === 'invoice') {
        const invoice = await db
          .select()
          .from(invoices)
          .where(eq(invoices.id, body.document_id))
          .limit(1)
          .then(rows => rows[0]);
        if (!invoice) {
          return notFound(c, 'Invoice');
        }
        mediaUrl = `/api/v1/invoices/${body.document_id}/pdf`;
      } else if (body.document_type === 'voucher') {
        const voucher = await db
          .select()
          .from(vouchers)
          .where(eq(vouchers.id, body.document_id))
          .limit(1)
          .then(rows => rows[0]);
        if (!voucher) {
          return notFound(c, 'Voucher');
        }
        mediaUrl = `/api/v1/vouchers/${body.document_id}/pdf`;
      }

      // Determine destination
      let destination = '';
      if (body.channel === 'sms' || body.channel === 'whatsapp') {
        destination = contact.phone || '';
        if (!destination) {
          return error(c, 'Contact has no phone number', 400);
        }
      } else if (body.channel === 'email') {
        destination = contact.email || '';
        if (!destination) {
          return error(c, 'Contact has no email address', 400);
        }
      }

      // Create message log entry
      const messageId = generateId();
      const now = new Date().toISOString();
      const caption = body.caption || `${body.document_type} document`;

      await db.insert(messageLog).values({
        id: messageId,
        contactId: body.contact_id,
        leadId: null,
        channel: body.channel,
        templateId: null,
        subject: null,
        content: caption,
        status: 'queued',
        externalId: null,
        errorMessage: null,
        sentBy: userId,
        sentAt: null,
        deliveredAt: null,
        readAt: null,
        createdAt: now,
      });

      // Queue message
      await c.env.SMS_QUEUE.send({
        type: 'sms',
        data: {
          to: destination,
          body: caption,
          messageLogId: messageId,
          contactId: body.contact_id,
          channel: body.channel,
          mediaUrl: mediaUrl,
        },
      });

      return created(c, {
        message_id: messageId,
        status: 'queued',
      });
    } catch (err) {
      console.error('Error sending document:', err);
      return error(c, 'Failed to send document', 500);
    }
  }
);

// ============================================================
// POST /bulk-send — Bulk send messages
// ============================================================

communicationRoutes.post(
  '/bulk-send',
  requirePermission('communications', 'create'),
  zValidator('json', bulkSendSchema),
  async (c) => {
    const db = drizzle(c.get('tenantDb'));
    const userId = c.get('userId');
    const body = c.req.valid('json');

    try {
      // Determine message content
      let messageContent = '';
      let templateId: string | null = null;

      if (body.template_id) {
        const template = await db
          .select()
          .from(messageTemplates)
          .where(eq(messageTemplates.id, body.template_id))
          .limit(1)
          .then(rows => rows[0]);

        if (!template) {
          return notFound(c, 'Template');
        }

        messageContent = template.content;
        templateId = body.template_id;
      } else if (body.message) {
        messageContent = body.message;
      } else {
        return error(c, 'Either template_id or message is required', 400);
      }

      // Fetch all contacts
      const bulkContacts = await db
        .select()
        .from(contacts)
        .where(inArray(contacts.id, body.contact_ids));

      if (bulkContacts.length === 0) {
        return error(c, 'No valid contacts found', 400);
      }

      // Create batch ID
      const batchId = generateId();
      const now = new Date().toISOString();

      // Create message log entries and queue messages
      const messageIds: string[] = [];

      for (const contact of bulkContacts) {
        // Determine destination
        let destination = '';
        if (body.channel === 'sms' || body.channel === 'whatsapp') {
          destination = contact.phone || '';
        } else if (body.channel === 'email') {
          destination = contact.email || '';
        }

        if (!destination) {
          continue; // Skip contacts without proper destination
        }

        const messageId = generateId();
        messageIds.push(messageId);

        // Resolve and substitute variables for this contact
        const variables = await resolveVariables((db as any).$client as D1Database, contact.id);
        const content = substituteVariables(messageContent, variables);

        await db.insert(messageLog).values({
          id: messageId,
          contactId: contact.id,
          leadId: null,
          channel: body.channel,
          templateId: templateId,
          subject: null,
          content: content,
          status: 'queued',
          externalId: null,
          errorMessage: null,
          sentBy: userId,
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          createdAt: now,
        });

        // Queue message
        await c.env.SMS_QUEUE.send({
          type: body.channel === 'email' ? 'email' : 'sms',
          data: {
            to: destination,
            ...(body.channel === 'email' && { subject: 'Message', html: content }),
            ...(body.channel !== 'email' && { body: content }),
            messageLogId: messageId,
            contactId: contact.id,
            channel: body.channel,
          },
        });
      }

      return created(c, {
        batch_id: batchId,
        total_messages: messageIds.length,
        status: 'queued',
      });
    } catch (err) {
      console.error('Error in bulk send:', err);
      return error(c, 'Failed to bulk send', 500);
    }
  }
);

// ============================================================
// GET /bulk-send/:batchId/status — Get bulk send progress
// ============================================================

communicationRoutes.get('/bulk-send/:batchId/status', requirePermission('communications', 'view'), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const batchId = c.req.param('batchId');

  try {
    // Note: In a real implementation, you'd have a batch tracking table
    // For now, return a simple response
    return success(c, {
      batch_id: batchId,
      status: 'processing',
      total: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
    });
  } catch (err) {
    console.error('Error fetching batch status:', err);
    return error(c, 'Failed to fetch status', 500);
  }
});

// ============================================================
// GET /history — Communication history for a contact
// ============================================================

communicationRoutes.get(
  '/history',
  requirePermission('communications', 'view'),
  zValidator('query', historyFilterSchema),
  async (c) => {
    const db = drizzle(c.get('tenantDb'));
    const query = c.req.valid('query');

    try {
      // Build query conditions
      const conditions: any[] = [];
      if (query.contact_id) {
        conditions.push(eq(messageLog.contactId, query.contact_id));
      }
      if (query.channel) {
        conditions.push(eq(messageLog.channel, query.channel));
      }

      // Fetch messages
      const messages = await db
        .select()
        .from(messageLog)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(messageLog.createdAt))
        .limit(query.limit)
        .offset(query.offset);

      return success(c, messages);
    } catch (err) {
      console.error('Error fetching history:', err);
      return error(c, 'Failed to fetch history', 500);
    }
  }
);

// ============================================================
// GET /log — All messages log with filters
// ============================================================

communicationRoutes.get(
  '/log',
  requirePermission('communications', 'view'),
  zValidator('query', logFilterSchema),
  async (c) => {
    const db = drizzle(c.get('tenantDb'));
    const query = c.req.valid('query');

    try {
      const page = query.page;
      const limit = query.limit;
      const offset = (page - 1) * limit;

      // Build query conditions
      const conditions: any[] = [];

      if (query.channel) {
        conditions.push(eq(messageLog.channel, query.channel));
      }

      if (query.status) {
        conditions.push(eq(messageLog.status, query.status));
      }

      if (query.sentBy) {
        conditions.push(eq(messageLog.sentBy, query.sentBy));
      }

      if (query.dateFrom) {
        conditions.push(sql`${messageLog.createdAt} >= ${query.dateFrom}`);
      }

      if (query.dateTo) {
        conditions.push(sql`${messageLog.createdAt} <= ${query.dateTo}`);
      }

      if (query.search) {
        const searchTerm = `%${query.search}%`;
        conditions.push(
          or(
            like(messageLog.content, searchTerm),
            like(messageLog.subject, searchTerm)
          )
        );
      }

      // Fetch total count
      const [totalResult] = await db
        .select({ count: count() })
        .from(messageLog)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const total = totalResult.count;

      // Fetch paginated messages
      const messages = await db
        .select()
        .from(messageLog)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(messageLog.createdAt))
        .limit(limit)
        .offset(offset);

      return paginated(c, messages, total, page, limit);
    } catch (err) {
      console.error('Error fetching message log:', err);
      return error(c, 'Failed to fetch message log', 500);
    }
  }
);

export default communicationRoutes;
