import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latencyMs: number;
  details?: string;
}

async function checkD1Health(db: D1Database): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await db.prepare('SELECT 1 as ok').first();
    const latency = Date.now() - start;
    return {
      name: 'Master D1',
      status: latency > 2000 ? 'degraded' : 'healthy',
      latencyMs: latency,
    };
  } catch (e) {
    return { name: 'Master D1', status: 'down', latencyMs: Date.now() - start, details: String(e) };
  }
}

async function checkR2Health(r2: R2Bucket | undefined): Promise<HealthCheck> {
  if (!r2) return { name: 'R2 Storage', status: 'down', latencyMs: 0, details: 'R2 not configured' };
  const start = Date.now();
  try {
    await r2.list({ limit: 1 });
    const latency = Date.now() - start;
    return {
      name: 'R2 Storage',
      status: latency > 2000 ? 'degraded' : 'healthy',
      latencyMs: latency,
    };
  } catch (e) {
    return { name: 'R2 Storage', status: 'down', latencyMs: Date.now() - start, details: String(e) };
  }
}

async function checkWorkerHealth(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    // This is a self-check — if this code is running, workers are healthy
    return { name: 'API Workers', status: 'healthy', latencyMs: Date.now() - start };
  } catch (e) {
    return { name: 'API Workers', status: 'down', latencyMs: Date.now() - start, details: String(e) };
  }
}

async function checkTenantDbCount(db: D1Database): Promise<{ total: number; active: number }> {
  try {
    const result = await db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('active', 'trial') THEN 1 ELSE 0 END) as active
      FROM tenants
    `).first<{ total: number; active: number }>();
    return { total: result?.total || 0, active: result?.active || 0 };
  } catch {
    return { total: 0, active: 0 };
  }
}

export async function GET(_request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const checks = await Promise.allSettled([
      checkWorkerHealth(),
      checkD1Health(db),
      checkR2Health(env.R2_BUCKET),
    ]);

    const components: HealthCheck[] = checks.map((result) => {
      if (result.status === 'fulfilled') return result.value;
      return { name: 'Unknown', status: 'down' as const, latencyMs: 0, details: String(result.reason) };
    });

    const tenantStats = await checkTenantDbCount(db);

    // Get WP sites status
    const wpSites = await db.prepare(`
      SELECT id, subdomain, status, tenant_id FROM wordpress_sites ORDER BY created_at DESC
    `).all<{ id: string; subdomain: string; status: string; tenant_id: string }>();

    const overallStatus = components.some((c) => c.status === 'down')
      ? 'down'
      : components.some((c) => c.status === 'degraded')
        ? 'degraded'
        : 'healthy';

    return NextResponse.json({
      components,
      overallStatus,
      checkedAt: new Date().toISOString(),
      tenantStats,
      wpSites: wpSites.results || [],
    });
  } catch (err) {
    console.error('System health error:', err);
    return NextResponse.json({
      components: [{ name: 'System', status: 'down', latencyMs: 0, details: String(err) }],
      overallStatus: 'down',
      checkedAt: new Date().toISOString(),
      tenantStats: { total: 0, active: 0 },
      wpSites: [],
    });
  }
}
