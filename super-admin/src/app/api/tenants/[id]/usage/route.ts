import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { generateUUIDv7 } from '@/lib/auth';

const PLAN_LIMITS: Record<string, { users: number; leads: number; storage_gb: number }> = {
  free: { users: 3, leads: 500, storage_gb: 0.5 },
  trial: { users: 5, leads: 1000, storage_gb: 1 },
  starter: { users: 5, leads: 1000, storage_gb: 1 },
  pro: { users: 20, leads: 10000, storage_gb: 10 },
  enterprise: { users: -1, leads: -1, storage_gb: 100 },
};

async function executeSQLOnD1(
  accountId: string,
  apiToken: string,
  databaseId: string,
  sql: string
): Promise<{ result: Array<{ results: Array<Record<string, number>> }> }> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql }),
    }
  );
  return res.json() as Promise<{ result: Array<{ results: Array<Record<string, number>> }> }>;
}

// GET /api/tenants/:id/usage
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const tenant = await db.prepare(
      'SELECT d1_database_id, plan FROM tenants WHERE id = ?'
    ).bind(id).first<{ d1_database_id: string | null; plan: string }>();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const plan = tenant.plan || 'free';
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    let usage = {
      users: 0,
      leads: 0,
      contacts: 0,
      itineraries: 0,
      invoices: 0,
      total_payments: 0,
      storage_mb: 0,
      api_calls: 0,
    };

    // If tenant has a D1 database, query it via CF API
    const cfAccountId = (env as unknown as Record<string, string>).CF_ACCOUNT_ID;
    const cfApiToken = (env as unknown as Record<string, string>).CF_API_TOKEN;

    if (tenant.d1_database_id && cfAccountId && cfApiToken) {
      const queries = [
        "SELECT COUNT(*) as cnt FROM users WHERE is_active = 1",
        "SELECT COUNT(*) as cnt FROM leads WHERE is_deleted = 0",
        "SELECT COUNT(*) as cnt FROM contacts WHERE is_deleted = 0",
        "SELECT COUNT(*) as cnt FROM itineraries WHERE is_deleted = 0",
        "SELECT COUNT(*) as cnt FROM invoices WHERE is_deleted = 0",
        "SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'success'",
      ];

      const results = await Promise.all(
        queries.map((sql) => executeSQLOnD1(cfAccountId, cfApiToken, tenant.d1_database_id!, sql).catch(() => null))
      );

      usage.users = results[0]?.result?.[0]?.results?.[0]?.cnt || 0;
      usage.leads = results[1]?.result?.[0]?.results?.[0]?.cnt || 0;
      usage.contacts = results[2]?.result?.[0]?.results?.[0]?.cnt || 0;
      usage.itineraries = results[3]?.result?.[0]?.results?.[0]?.cnt || 0;
      usage.invoices = results[4]?.result?.[0]?.results?.[0]?.cnt || 0;
      usage.total_payments = results[5]?.result?.[0]?.results?.[0]?.total || 0;
    } else {
      // Fallback: use latest snapshot
      const snapshot = await db.prepare(
        'SELECT * FROM tenant_usage_snapshots WHERE tenant_id = ? ORDER BY snapshot_date DESC LIMIT 1'
      ).bind(id).first<Record<string, number>>();

      if (snapshot) {
        usage.users = snapshot.users_count || 0;
        usage.leads = snapshot.leads_count || 0;
        usage.contacts = snapshot.contacts_count || 0;
        usage.itineraries = snapshot.itineraries_count || 0;
        usage.invoices = snapshot.invoices_count || 0;
        usage.storage_mb = snapshot.storage_mb || 0;
        usage.api_calls = snapshot.api_calls || 0;
      }
    }

    // R2 storage calculation
    try {
      const r2 = env.R2_BUCKET;
      if (r2) {
        const objects = await r2.list({ prefix: `tenants/${id}/`, limit: 1000 });
        usage.storage_mb = Math.round(
          objects.objects.reduce((sum: number, obj: { size: number }) => sum + obj.size, 0) / (1024 * 1024) * 100
        ) / 100;
      }
    } catch {
      // R2 may not be available locally
    }

    // Trend data (last 30 days)
    const trend = await db.prepare(`
      SELECT snapshot_date, leads_count, contacts_count, invoices_count, users_count
      FROM tenant_usage_snapshots
      WHERE tenant_id = ? AND snapshot_date >= date('now', '-30 days')
      ORDER BY snapshot_date ASC
    `).bind(id).all<{
      snapshot_date: string;
      leads_count: number;
      contacts_count: number;
      invoices_count: number;
      users_count: number;
    }>();

    return NextResponse.json({
      usage,
      limits,
      plan,
      trend: trend.results || [],
    });
  } catch (err) {
    console.error('Usage fetch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/tenants/:id/usage — manually trigger a snapshot
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const tenant = await db.prepare(
      'SELECT d1_database_id, plan FROM tenants WHERE id = ?'
    ).bind(id).first<{ d1_database_id: string | null; plan: string }>();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    let usage = { users: 0, leads: 0, contacts: 0, itineraries: 0, invoices: 0, storage_mb: 0 };

    const cfAccountId = (env as unknown as Record<string, string>).CF_ACCOUNT_ID;
    const cfApiToken = (env as unknown as Record<string, string>).CF_API_TOKEN;

    if (tenant.d1_database_id && cfAccountId && cfApiToken) {
      const queries = [
        "SELECT COUNT(*) as cnt FROM users WHERE is_active = 1",
        "SELECT COUNT(*) as cnt FROM leads WHERE is_deleted = 0",
        "SELECT COUNT(*) as cnt FROM contacts WHERE is_deleted = 0",
        "SELECT COUNT(*) as cnt FROM itineraries WHERE is_deleted = 0",
        "SELECT COUNT(*) as cnt FROM invoices WHERE is_deleted = 0",
      ];

      const results = await Promise.all(
        queries.map((sql) => executeSQLOnD1(cfAccountId, cfApiToken, tenant.d1_database_id!, sql).catch(() => null))
      );

      usage.users = results[0]?.result?.[0]?.results?.[0]?.cnt || 0;
      usage.leads = results[1]?.result?.[0]?.results?.[0]?.cnt || 0;
      usage.contacts = results[2]?.result?.[0]?.results?.[0]?.cnt || 0;
      usage.itineraries = results[3]?.result?.[0]?.results?.[0]?.cnt || 0;
      usage.invoices = results[4]?.result?.[0]?.results?.[0]?.cnt || 0;
    }

    const today = new Date().toISOString().split('T')[0];

    await db.prepare(`
      INSERT INTO tenant_usage_snapshots (id, tenant_id, snapshot_date, users_count, leads_count, contacts_count, itineraries_count, invoices_count, storage_mb)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (tenant_id, snapshot_date) DO UPDATE SET
        users_count = excluded.users_count,
        leads_count = excluded.leads_count,
        contacts_count = excluded.contacts_count,
        itineraries_count = excluded.itineraries_count,
        invoices_count = excluded.invoices_count,
        storage_mb = excluded.storage_mb
    `).bind(
      generateUUIDv7(), id, today,
      usage.users, usage.leads, usage.contacts,
      usage.itineraries, usage.invoices, usage.storage_mb
    ).run();

    return NextResponse.json({ success: true, snapshot_date: today });
  } catch (err) {
    console.error('Snapshot error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
