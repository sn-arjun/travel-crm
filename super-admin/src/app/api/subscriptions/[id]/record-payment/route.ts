import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { generateUUIDv7 } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      amount: number;
      method: string;
      reference?: string;
      notes?: string;
    };

    if (!body.amount || !body.method) {
      return NextResponse.json({ error: 'Amount and method are required' }, { status: 400 });
    }

    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const sub = await db.prepare('SELECT id, tenant_id FROM subscriptions WHERE id = ?')
      .bind(id).first<{ id: string; tenant_id: string }>();

    if (!sub) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const paymentId = generateUUIDv7();
    await db.prepare(`
      INSERT INTO subscription_payments (id, subscription_id, tenant_id, amount, payment_method, payment_reference, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, 'success', ?)
    `).bind(paymentId, id, sub.tenant_id, body.amount, body.method, body.reference || null, body.notes || null).run();

    // Ensure subscription is active
    await db.prepare(
      "UPDATE subscriptions SET status = 'active', updated_at = datetime('now') WHERE id = ? AND status != 'active'"
    ).bind(id).run();

    return NextResponse.json({ success: true, paymentId });
  } catch (err) {
    console.error('Record payment error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
