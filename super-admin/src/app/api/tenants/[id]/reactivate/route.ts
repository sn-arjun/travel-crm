import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const tenant = await db.prepare('SELECT id, status FROM tenants WHERE id = ?')
      .bind(id).first<{ id: string; status: string }>();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    if (tenant.status === 'active') {
      return NextResponse.json({ error: 'Tenant is already active' }, { status: 400 });
    }

    // Remove suspend info from settings
    const existing = await db.prepare('SELECT settings FROM tenants WHERE id = ?')
      .bind(id).first<{ settings: string }>();
    let settings: Record<string, unknown> = {};
    try { settings = JSON.parse(existing?.settings || '{}'); } catch { /* ignore */ }
    delete settings.suspendReason;
    delete settings.suspendedAt;

    await db.prepare(
      "UPDATE tenants SET status = 'active', settings = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(JSON.stringify(settings), id).run();

    return NextResponse.json({ success: true, message: 'Tenant reactivated' });
  } catch (err) {
    console.error('Reactivate tenant error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
