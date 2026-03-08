import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { generateUUIDv7 } from '@/lib/auth';

// POST /api/support/tickets/:id/reply
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json() as { body: string };
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;
    const adminName = request.headers.get('x-admin-name') || 'Admin';

    await db.prepare(`
      INSERT INTO support_ticket_replies (id, ticket_id, author_type, author_name, body)
      VALUES (?, ?, 'admin', ?, ?)
    `).bind(generateUUIDv7(), id, adminName, body.body).run();

    // Update ticket timestamp
    await db.prepare(
      "UPDATE support_tickets SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?"
    ).bind(id).run();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Reply error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
