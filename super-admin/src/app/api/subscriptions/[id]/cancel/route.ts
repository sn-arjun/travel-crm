import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { reason?: string; immediate?: boolean };
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const sub = await db.prepare('SELECT id, tenant_id, status FROM subscriptions WHERE id = ?')
      .bind(id).first<{ id: string; tenant_id: string; status: string }>();

    if (!sub) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    if (sub.status === 'cancelled') {
      return NextResponse.json({ error: 'Already cancelled' }, { status: 400 });
    }

    await db.prepare(`
      UPDATE subscriptions
      SET status = 'cancelled', cancelled_at = datetime('now'),
          cancellation_reason = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(body.reason || 'No reason provided', id).run();

    if (body.immediate) {
      await db.prepare(
        "UPDATE tenants SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?"
      ).bind(sub.tenant_id).run();
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Cancel subscription error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
