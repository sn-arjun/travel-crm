import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// GET /api/wordpress/:id — Get WP site detail
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const site = await db.prepare(`
      SELECT wp.*, t.company_name as tenant_name
      FROM wordpress_sites wp
      LEFT JOIN tenants t ON t.id = wp.tenant_id
      WHERE wp.id = ?
    `).bind(id).first();

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    return NextResponse.json(site);
  } catch (err) {
    console.error('Get WP site error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/wordpress/:id — Suspend/deprovision site
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    await db.prepare(
      "UPDATE wordpress_sites SET status = 'suspended', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?"
    ).bind(id).run();

    return NextResponse.json({ success: true, message: 'Site suspended' });
  } catch (err) {
    console.error('Suspend WP site error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
