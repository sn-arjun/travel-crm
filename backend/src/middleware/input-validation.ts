import type { Context, Next } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../types';

/**
 * Middleware factory for Zod-based input validation.
 * Validates the request JSON body against the provided schema.
 * Stores the validated body on context as 'validatedBody'.
 */
export function validate<T extends z.ZodSchema>(schema: T) {
  return async (c: Context<AppContext>, next: Next) => {
    try {
      const body = await c.req.json();
      const validated = schema.parse(body);
      c.set('validatedBody' as never, validated as never);
      await next();
    } catch (e) {
      if (e instanceof z.ZodError) {
        return c.json({
          success: false,
          error: 'Validation failed',
          details: e.issues.map((issue: z.ZodIssue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        }, 400);
      }
      throw e;
    }
  };
}

// ============================================================
// Common Validation Schemas
// ============================================================

export const createLeadSchema = z.object({
  contact_id: z.string().optional(),
  title: z.string().min(1).max(200),
  destination: z.string().max(200).optional(),
  travel_dates: z.string().optional(),
  pax_adults: z.number().int().min(0).max(100).optional(),
  pax_children: z.number().int().min(0).max(100).optional(),
  budget: z.number().min(0).optional(),
  notes: z.string().max(5000).optional(),
  source: z.string().max(50).optional(),
  priority: z.enum(['Hot', 'Warm', 'Cold']).optional(),
  status: z.string().max(50).optional(),
  assigned_to: z.string().optional(),
});

export const createContactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(20).optional(),
  company: z.string().max(200).optional(),
  type: z.enum(['customer', 'supplier', 'agent', 'partner']).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  postal_code: z.string().max(20).optional(),
  notes: z.string().max(5000).optional(),
  source: z.string().max(50).optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  sort_by: z.string().max(50).optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
});

export const idParamSchema = z.object({
  id: z.string().min(1).max(100),
});
