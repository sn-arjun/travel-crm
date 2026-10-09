import type { Env } from '../../types';
import { getRootApp } from '../../app-ref';
import { signAccessToken } from '../../utils/jwt';
import type { ApiCaller } from './types';

export const AUTOMATION_DEPTH_HEADER = 'X-Automation-Depth';
/** Host of in-process API calls; only requests to it may carry an automation depth. */
export const INTERNAL_HOST = 'automation.internal';

/**
 * Build a caller that performs API requests in-process as the owner of `token`.
 * Events raised by those requests are one step deeper in the automation chain.
 */
export function makeApiCaller(env: Env, token: string, depth: number): ApiCaller {
  return async (method, path, body) => {
    const pending: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: (promise: Promise<unknown>) => { pending.push(promise); },
      passThroughOnException: () => {},
    } as unknown as ExecutionContext;

    const response = await getRootApp().fetch(
      new Request(`http://${INTERNAL_HOST}/api/v1${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          [AUTOMATION_DEPTH_HEADER]: String(depth + 1),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
      ctx,
    );
    // Follow-on automations run inside waitUntil; finish them before reporting back.
    await Promise.allSettled(pending);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let json: any = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }

    const failure = json?.error;
    return {
      ok: response.ok,
      status: response.status,
      data: json && typeof json === 'object' && 'data' in json ? json.data : json,
      error: response.ok
        ? undefined
        : typeof failure === 'string'
          ? failure
          : failure?.message ?? json?.message ?? `Request failed (${response.status})`,
    };
  };
}

export interface SystemActor {
  userId: string;
  role: string;
  token: string;
}

/**
 * Who an automatic run acts as: the admin who switched the automation on, else any active admin.
 * Nothing runs with more access than that person has.
 */
export async function systemActor(
  env: Env,
  tenantId: string,
  db: D1Database,
  preferredUserId?: string | null,
): Promise<SystemActor | null> {
  let user: { id: string; role: string; email: string } | null = null;
  if (preferredUserId) {
    user = await db
      .prepare(`SELECT id, role, email FROM users WHERE id = ? AND is_active = 1 AND role = 'admin'`)
      .bind(preferredUserId)
      .first();
  }
  if (!user) {
    user = await db
      .prepare(`SELECT id, role, email FROM users WHERE role = 'admin' AND is_active = 1 ORDER BY created_at LIMIT 1`)
      .first();
  }
  if (!user) return null;

  const token = await signAccessToken({ userId: user.id, tenantId, role: user.role, email: user.email }, env.JWT_SECRET);
  return { userId: user.id, role: user.role, token };
}
