/**
 * Request validation with human-readable failures.
 *
 * Every route imports `zValidator` from here instead of '@hono/zod-validator'.
 * The library's default failure response is the raw safeParse result, so
 * clients received `{ error: { name: 'ZodError', message: '[\n {\n "code"...' } }`
 * - a JSON dump inside the message. This wrapper installs a default hook that
 * answers 400 with a single readable sentence plus a per-field map:
 *
 *   {
 *     success: false,
 *     error: { code: 'VALIDATION_ERROR', message: 'source: Invalid option...', fields: { source: ['...'] } },
 *     errors: { source: ['...'] }
 *   }
 *
 * `error.message` is always a plain string (the Flutter apps read exactly that).
 * A route can still pass its own hook as the third argument to override this.
 */
import { zValidator as baseZValidator } from '@hono/zod-validator';
import type { Context } from 'hono';

interface IssueLike {
  path?: ReadonlyArray<PropertyKey>;
  message?: string;
  code?: string;
}

/** Turn a zod issue path ('a', 0, 'b') into 'a.0.b'. */
function pathToField(path: ReadonlyArray<PropertyKey> | undefined): string {
  if (!path || path.length === 0) return '';
  return path.map((p) => String(p)).join('.');
}

/** Zod's wording for a missing value is noisy ("Invalid input: expected string, received undefined"). */
function readableMessage(issue: IssueLike): string {
  const message = (issue.message ?? '').trim();
  if (issue.code === 'invalid_type' && /received undefined$/i.test(message)) return 'Required';
  if (message.length === 0) return 'Invalid value';
  return message;
}

/** Group issues by dotted field path. Root-level issues are grouped under '_'. */
export function groupIssues(issues: ReadonlyArray<IssueLike>): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = pathToField(issue.path) || '_';
    const text = readableMessage(issue);
    const bucket = fields[key] ?? (fields[key] = []);
    if (!bucket.includes(text)) bucket.push(text);
  }
  return fields;
}

/** "<field>: <message>" for the first issue (or just the message for a root-level issue). */
export function firstIssueSentence(issues: ReadonlyArray<IssueLike>): string {
  const first = issues[0];
  if (!first) return 'Invalid request';
  const field = pathToField(first.path);
  const text = readableMessage(first);
  return field ? `${field}: ${text}` : text;
}

/** The body returned for every validation failure. */
export function validationFailureBody(issues: ReadonlyArray<IssueLike>) {
  const fields = groupIssues(issues);
  return {
    success: false as const,
    error: {
      code: 'VALIDATION_ERROR',
      message: firstIssueSentence(issues),
      fields,
    },
    errors: fields,
  };
}

const defaultHook = (result: { success: boolean; error?: unknown }, c: Context) => {
  if (result.success) return;
  const issues = ((result.error as { issues?: IssueLike[] } | undefined)?.issues ?? []) as IssueLike[];
  return c.json(validationFailureBody(issues), 400);
};

/**
 * Drop-in replacement for '@hono/zod-validator' `zValidator(target, schema[, hook])`.
 * Typed exactly like the original so `c.req.valid(...)` inference is unchanged.
 */
export const zValidator = ((target: any, schema: any, hook?: any, options?: any) =>
  baseZValidator(target, schema, hook ?? defaultHook, options)) as typeof baseZValidator;
