import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// GET /api/support/tickets/:id
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const ticket = await db.prepare(`
      SELECT st.*, t.company_name as tenant_name, t.subdomain as tenant_slug,
             sa.name as assignee_name
      FROM support_tickets st
      LEFT JOIN tenants t ON t.id = st.tenant_id
      LEFT JOIN super_admins sa ON sa.id = st.assigned_to
      WHERE st.id = ?
    `).bind(id).first();

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const replies = await db.prepare(`
      SELECT * FROM support_ticket_replies WHERE ticket_id = ? ORDER BY created_at ASC
    `).bind(id).all();

    return NextResponse.json({ ticket, replies: replies.results || [] });
  } catch (err) {
    console.error('Get ticket error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/support/tickets/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json() as {
      status?: string;
      priority?: string;
      assigned_to?: string;
    };
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const sets: string[] = ["updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')"];
    const values: unknown[] = [];

    if (body.status) {
      sets.push('status = ?');
      values.push(body.status);
      if (body.status === 'resolved') {
        sets.push("resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
      }
    }
    if (body.priority) { sets.push('priority = ?'); values.push(body.priority); }
    if (body.assigned_to !== undefined) { sets.push('assigned_to = ?'); values.push(body.assigned_to); }

    values.push(id);
    await db.prepare(`UPDATE support_tickets SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Update ticket error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
