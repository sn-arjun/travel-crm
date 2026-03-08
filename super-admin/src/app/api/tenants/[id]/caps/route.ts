import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { generateUUIDv7 } from '@/lib/auth';

const VALID_CAP_KEYS = [
  'ai_actions_per_day',
  'voip_minutes_per_month',
  'whatsapp_messages_per_month',
  'sms_per_month',
  'storage_gb',
] as const;

// GET /api/tenants/:id/caps — Get usage caps with current usage
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const result = await db.prepare(
      'SELECT * FROM tenant_usage_caps WHERE tenant_id = ? ORDER BY cap_key ASC'
    ).bind(id).all<{
      id: string;
      tenant_id: string;
      cap_key: string;
      cap_value: number;
      current_usage: number;
      reset_period: string;
      last_reset_at: string | null;
      created_at: string;
      updated_at: string;
    }>();

    const caps = (result.results || []).map((r) => ({
      id: r.id,
      capKey: r.cap_key,
      capValue: r.cap_value,
      currentUsage: r.current_usage,
      resetPeriod: r.reset_period,
      lastResetAt: r.last_reset_at,
      usagePercent: r.cap_value > 0 ? Math.round((r.current_usage / r.cap_value) * 100) : 0,
    }));

    return NextResponse.json({ caps });
  } catch (err) {
    console.error('Get caps error:', err);
    return NextResponse.json({ caps: [] });
  }
}

// PUT /api/tenants/:id/caps — Upsert cap values
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      caps: Array<{ capKey: string; capValue: number; resetPeriod?: string }>;
    };
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const stmts = body.caps
      .filter((c) => VALID_CAP_KEYS.includes(c.capKey as any))
      .map((c) =>
        db.prepare(`
          INSERT INTO tenant_usage_caps (id, tenant_id, cap_key, cap_value, reset_period)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (tenant_id, cap_key) DO UPDATE SET
            cap_value = excluded.cap_value,
            reset_period = COALESCE(excluded.reset_period, tenant_usage_caps.reset_period),
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        `).bind(
          generateUUIDv7(),
          id,
          c.capKey,
          c.capValue,
          c.resetPeriod || (c.capKey === 'ai_actions_per_day' ? 'daily' : 'monthly'),
        ),
      );

    if (stmts.length > 0) {
      await db.batch(stmts);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Update caps error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/tenants/:id/caps — Reset usage counters
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { capKey?: string };
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    if (body.capKey) {
      await db.prepare(
        `UPDATE tenant_usage_caps
         SET current_usage = 0,
             last_reset_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE tenant_id = ? AND cap_key = ?`
      ).bind(id, body.capKey).run();
    } else {
      await db.prepare(
        `UPDATE tenant_usage_caps
         SET current_usage = 0,
             last_reset_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE tenant_id = ?`
      ).bind(id).run();
    }

    return NextResponse.json({ success: true, message: 'Usage counters reset' });
  } catch (err) {
    console.error('Reset caps error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
