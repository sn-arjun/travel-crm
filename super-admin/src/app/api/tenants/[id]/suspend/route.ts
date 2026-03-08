import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { reason?: string };
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const tenant = await db.prepare('SELECT id, status FROM tenants WHERE id = ?')
      .bind(id).first<{ id: string; status: string }>();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    if (tenant.status === 'suspended') {
      return NextResponse.json({ error: 'Tenant is already suspended' }, { status: 400 });
    }

    // Update settings with suspend reason
    const existing = await db.prepare('SELECT settings FROM tenants WHERE id = ?')
      .bind(id).first<{ settings: string }>();
    let settings: Record<string, unknown> = {};
    try { settings = JSON.parse(existing?.settings || '{}'); } catch { /* ignore */ }
    settings.suspendReason = body.reason || 'No reason provided';
    settings.suspendedAt = new Date().toISOString();

    await db.prepare(
      "UPDATE tenants SET status = 'suspended', settings = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(JSON.stringify(settings), id).run();

    return NextResponse.json({ success: true, message: 'Tenant suspended' });
  } catch (err) {
    console.error('Suspend tenant error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
