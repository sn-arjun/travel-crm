import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { generateUUIDv7 } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-razorpay-signature');

    // Verify webhook signature
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (webhookSecret && signature) {
      const keyData = new TextEncoder().encode(webhookSecret);
      const key = await crypto.subtle.importKey(
        'raw',
        keyData.buffer as ArrayBuffer,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sig = await crypto.subtle.sign(
        'HMAC',
        key,
        (new TextEncoder().encode(body)).buffer as ArrayBuffer,
      );
      const expectedSig = Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, '0')).join('');

      if (signature !== expectedSig) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const event = JSON.parse(body) as {
      event: string;
      payload: {
        subscription?: { entity: { id: string } };
        payment?: { entity: { id: string; amount: number; currency: string } };
      };
    };

    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    switch (event.event) {
      case 'subscription.charged': {
        const razorpaySubId = event.payload.subscription?.entity.id;
        const payment = event.payload.payment?.entity;
        if (!razorpaySubId || !payment) break;

        // Find subscription
        const sub = await db.prepare(
          'SELECT id, tenant_id FROM subscriptions WHERE razorpay_subscription_id = ?'
        ).bind(razorpaySubId).first<{ id: string; tenant_id: string }>();

        if (sub) {
          await db.batch([
            db.prepare(`
              INSERT INTO subscription_payments (id, subscription_id, tenant_id, amount, currency, payment_method, payment_reference, status, gateway_response)
              VALUES (?, ?, ?, ?, ?, 'razorpay', ?, 'success', ?)
            `).bind(
              generateUUIDv7(), sub.id, sub.tenant_id,
              payment.amount / 100, payment.currency,
              payment.id, JSON.stringify(payment)
            ),
            db.prepare(`
              UPDATE subscriptions SET status = 'active',
                current_period_start = datetime('now'),
                current_period_end = datetime('now', '+1 month'),
                updated_at = datetime('now')
              WHERE id = ?
            `).bind(sub.id),
          ]);
        }
        break;
      }

      case 'payment.failed': {
        const razorpaySubId = event.payload.subscription?.entity.id;
        if (razorpaySubId) {
          await db.prepare(
            "UPDATE subscriptions SET status = 'past_due', updated_at = datetime('now') WHERE razorpay_subscription_id = ?"
          ).bind(razorpaySubId).run();
        }
        break;
      }

      case 'subscription.cancelled': {
        const razorpaySubId = event.payload.subscription?.entity.id;
        if (razorpaySubId) {
          await db.prepare(
            "UPDATE subscriptions SET status = 'cancelled', cancelled_at = datetime('now'), updated_at = datetime('now') WHERE razorpay_subscription_id = ?"
          ).bind(razorpaySubId).run();
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Razorpay webhook error:', err);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
