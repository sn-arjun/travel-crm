import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { AiUnavailableError, AI_UNAVAILABLE_CODE, AI_UNAVAILABLE_MESSAGE } from '../services/ai-router';
import { error } from './response';

/** Standard 503 envelope: {success:false,error:{code:'AI_UNAVAILABLE',message}}. */
export function aiUnavailableResponse(c: Context, message: string = AI_UNAVAILABLE_MESSAGE) {
  return c.json(
    { success: false, error: { code: AI_UNAVAILABLE_CODE, message } },
    503,
  );
}

/**
 * Sub-app error handler for every router that calls the AI router. Translates AiUnavailableError into
 * 503 AI_UNAVAILABLE; everything else behaves exactly like the global handler in index.ts.
 * Usage: `app.onError(aiAwareErrorHandler)`.
 */
export function aiAwareErrorHandler(err: Error, c: Context) {
  if (err instanceof AiUnavailableError) return aiUnavailableResponse(c, err.message);
  if (err instanceof HTTPException) {
    if (err.status >= 500) {
      console.error('Unhandled HTTP error:', err);
      return error(c, 'Internal server error', err.status);
    }
    return error(c, err.message || 'Bad request', err.status);
  }
  console.error('Unhandled error:', err);
  return error(c, 'Internal server error', 500);
}
