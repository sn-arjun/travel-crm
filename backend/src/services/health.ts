import type { Env } from '../types';

export interface HealthCheck {
  ok: boolean;
  ms: number;
}

async function timed(fn: () => Promise<unknown>): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await fn();
    return { ok: true, ms: Date.now() - start };
  } catch {
    // The error text is deliberately not returned: it can carry binding names or internals.
    return { ok: false, ms: Date.now() - start };
  }
}

/** Cheap probe used by the public health endpoint: one SELECT 1 on the registry database. */
export function checkMasterDb(env: Env): Promise<HealthCheck> {
  return timed(async () => {
    const row = await env.MASTER_DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
    if (row?.ok !== 1) throw new Error('unexpected result');
  });
}

export interface DeepHealth {
  status: 'ok' | 'degraded';
  timestamp: string;
  checks: { masterDb: HealthCheck; kv: HealthCheck; r2: HealthCheck };
}

/** Touches MASTER_DB, KV (get + put on a health key) and R2 (head of a health object). */
export async function runDeepHealth(env: Env): Promise<DeepHealth> {
  const [masterDb, kv, r2] = await Promise.all([
    checkMasterDb(env),
    timed(async () => {
      const key = 'health:probe';
      await env.CACHE.put(key, String(Date.now()), { expirationTtl: 60 });
      await env.CACHE.get(key);
    }),
    // head() resolves null for a missing object; only a thrown error means R2 is unreachable.
    timed(async () => {
      await env.FILE_STORAGE.head('health/probe');
    }),
  ]);
  const ok = masterDb.ok && kv.ok && r2.ok;
  return { status: ok ? 'ok' : 'degraded', timestamp: new Date().toISOString(), checks: { masterDb, kv, r2 } };
}
