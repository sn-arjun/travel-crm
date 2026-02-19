import type { Context } from 'hono';

export function success<T>(c: Context, data: T, status: number = 200) {
  return c.json(
    {
      success: true,
      data,
    },
    status as any
  );
}

export function created<T>(c: Context, data: T) {
  return success(c, data, 201);
}

export function paginated<T>(
  c: Context,
  data: T[],
  total: number,
  page: number,
  limit: number
) {
  return c.json({
    success: true,
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  });
}

export function error(
  c: Context,
  message: string,
  status: number = 400,
  details?: Record<string, any>
) {
  return c.json(
    {
      success: false,
      error: {
        message,
        ...(details && { details }),
      },
    },
    status as any
  );
}

export function notFound(c: Context, resource: string = 'Resource') {
  return error(c, `${resource} not found`, 404);
}

export function unauthorized(c: Context, message: string = 'Unauthorized') {
  return error(c, message, 401);
}

export function forbidden(c: Context, message: string = 'Forbidden') {
  return error(c, message, 403);
}

export function validationError(
  c: Context,
  details: Record<string, string[]>
) {
  return error(c, 'Validation failed', 422, details);
}
