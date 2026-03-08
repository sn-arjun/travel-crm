import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, and, or, like, count, inArray } from 'drizzle-orm';
import type { AppContext } from '../types';
import { messageTemplates } from '../db/tenant-schema';
import { generateId } from '../utils/uuid';
import { success, created, paginated, error, notFound } from '../utils/response';
import { requirePermission } from '../middleware/rbac';

const templateRoutes = new Hono<AppContext>();

// ============================================================
// Zod Schemas
// ============================================================

const createTemplateSchema = z.object({
  channel: z.enum(['whatsapp', 'sms', 'email']),
  name: z.string().min(1).max(200),
  subject: z.string().max(200).optional(), // for email
  content: z.string().min(1).max(5000),
  category: z.enum(['greeting', 'follow_up', 'quotation', 'booking', 'reminder', 'wish', 'offer', 'visa']).optional(),
  language: z.string().max(10).optional().default('en'),
});

const updateTemplateSchema = createTemplateSchema.partial();

const listTemplateSchema = z.object({
  channel: z.enum(['whatsapp', 'sms', 'email']).optional(),
  category: z.enum(['greeting', 'follow_up', 'quotation', 'booking', 'reminder', 'wish', 'offer', 'visa']).optional(),
  language: z.string().optional(),
  is_active: z.coerce.boolean().optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

// ============================================================
// POST / — Create template
// ============================================================

templateRoutes.post(
  '/',
  requirePermission('communications', 'create'),
  zValidator('json', createTemplateSchema),
  async (c) => {
    const db = drizzle(c.get('tenantDb'));

    try {
      const body = c.req.valid('json');

      // Extract variables from content (placeholders like {customer_name})
      const variablesSet = new Set<string>();
      const varRegex = /{(\w+)}/g;
      let match;

      while ((match = varRegex.exec(body.content)) !== null) {
        variablesSet.add(match[1]);
      }

      if (body.subject) {
        const subjectVarRegex = /{(\w+)}/g;
        while ((match = subjectVarRegex.exec(body.subject)) !== null) {
          variablesSet.add(match[1]);
        }
      }

      const variables = Array.from(variablesSet);

      // Create template
      const id = generateId();
      const now = new Date().toISOString();

      await db.insert(messageTemplates).values({
        id,
        channel: body.channel,
        name: body.name,
        subject: body.subject || null,
        content: body.content,
        variables: JSON.stringify(variables),
        category: body.category || null,
        language: body.language,
        isActive: 1,
        createdAt: now,
      });

      const template = await db
        .select()
        .from(messageTemplates)
        .where(eq(messageTemplates.id, id))
        .limit(1)
        .then(rows => rows[0]);

      return created(c, {
        ...template,
        variables: variables,
      });
    } catch (err) {
      console.error('Error creating template:', err);
      return error(c, 'Failed to create template', 500);
    }
  }
);

// ============================================================
// GET / — List templates
// ============================================================

templateRoutes.get(
  '/',
  requirePermission('communications', 'view'),
  zValidator('query', listTemplateSchema),
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
        conditions.push(eq(messageTemplates.channel, query.channel));
      }

      if (query.category) {
        conditions.push(eq(messageTemplates.category, query.category));
      }

      if (query.language) {
        conditions.push(eq(messageTemplates.language, query.language));
      }

      // Default to showing only active templates; pass is_active=false to include inactive
      const showActive = query.is_active !== undefined ? query.is_active : true;
      conditions.push(eq(messageTemplates.isActive, showActive ? 1 : 0));

      if (query.search) {
        const searchTerm = `%${query.search}%`;
        conditions.push(
          or(
            like(messageTemplates.name, searchTerm),
            like(messageTemplates.content, searchTerm)
          )
        );
      }

      // Fetch total count
      const [totalResult] = await db
        .select({ count: count() })
        .from(messageTemplates)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const total = totalResult.count;

      // Fetch paginated templates
      const templates = await db
        .select()
        .from(messageTemplates)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(messageTemplates.createdAt))
        .limit(limit)
        .offset(offset);

      const templatesWithVariables = templates.map(t => ({
        ...t,
        variables: t.variables ? JSON.parse(t.variables) : [],
      }));

      return paginated(c, templatesWithVariables, total, page, limit);
    } catch (err) {
      console.error('Error fetching templates:', err);
      return error(c, 'Failed to fetch templates', 500);
    }
  }
);

// ============================================================
// GET /:id — Get template by ID
// ============================================================

templateRoutes.get('/:id', requirePermission('communications', 'view'), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const id = c.req.param('id');

  try {
    const template = await db
      .select()
      .from(messageTemplates)
      .where(eq(messageTemplates.id, id))
      .limit(1)
      .then(rows => rows[0]);

    if (!template) {
      return notFound(c, 'Template');
    }

    return success(c, {
      ...template,
      variables: template.variables ? JSON.parse(template.variables) : [],
    });
  } catch (err) {
    console.error('Error fetching template:', err);
    return error(c, 'Failed to fetch template', 500);
  }
});

// ============================================================
// PUT /:id — Update template
// ============================================================

templateRoutes.put(
  '/:id',
  requirePermission('communications', 'create'),
  zValidator('json', updateTemplateSchema),
  async (c) => {
    const db = drizzle(c.get('tenantDb'));
    const id = c.req.param('id');
    const body = c.req.valid('json');

    try {
      // Verify template exists
      const existing = await db
        .select()
        .from(messageTemplates)
        .where(eq(messageTemplates.id, id))
        .limit(1)
        .then(rows => rows[0]);

      if (!existing) {
        return notFound(c, 'Template');
      }

      // Extract variables from content
      let variables = existing.variables ? JSON.parse(existing.variables) : [];

      if (body.content || body.subject) {
        const content = body.content || existing.content;
        const subject = body.subject !== undefined ? body.subject : existing.subject;

        const variablesSet = new Set<string>();
        const varRegex = /{(\w+)}/g;
        let match;

        while ((match = varRegex.exec(content)) !== null) {
          variablesSet.add(match[1]);
        }

        if (subject) {
          const subjectVarRegex = /{(\w+)}/g;
          while ((match = subjectVarRegex.exec(subject)) !== null) {
            variablesSet.add(match[1]);
          }
        }

        variables = Array.from(variablesSet);
      }

      // Update template
      await db
        .update(messageTemplates)
        .set({
          channel: body.channel,
          name: body.name,
          subject: body.subject,
          content: body.content,
          variables: JSON.stringify(variables),
          category: body.category,
          language: body.language,
        })
        .where(eq(messageTemplates.id, id));

      const updated = await db
        .select()
        .from(messageTemplates)
        .where(eq(messageTemplates.id, id))
        .limit(1)
        .then(rows => rows[0]);

      return success(c, {
        ...updated,
        variables: variables,
      });
    } catch (err) {
      console.error('Error updating template:', err);
      return error(c, 'Failed to update template', 500);
    }
  }
);

// ============================================================
// DELETE /:id — Soft delete template
// ============================================================

templateRoutes.delete('/:id', requirePermission('communications', 'create'), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const id = c.req.param('id');

  try {
    // Verify template exists
    const existing = await db
      .select()
      .from(messageTemplates)
      .where(eq(messageTemplates.id, id))
      .limit(1)
      .then(rows => rows[0]);

    if (!existing) {
      return notFound(c, 'Template');
    }

    // Soft delete (set is_active to 0)
    await db
      .update(messageTemplates)
      .set({ isActive: 0 })
      .where(eq(messageTemplates.id, id));

    return success(c, { message: 'Template deleted' });
  } catch (err) {
    console.error('Error deleting template:', err);
    return error(c, 'Failed to delete template', 500);
  }
});

export default templateRoutes;
