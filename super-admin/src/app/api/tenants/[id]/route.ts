import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// GET /api/tenants/:id — Tenant detail
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const tenant = await db.prepare(`
      SELECT t.*, s.plan as sub_plan, s.amount, s.status as sub_status,
             s.billing_cycle, s.start_date, s.next_billing_date,
             w.id as wp_id, w.subdomain as wp_subdomain, w.status as wp_status
      FROM tenants t
      LEFT JOIN subscriptions s ON t.id = s.tenant_id
      LEFT JOIN wordpress_sites w ON t.id = w.tenant_id
      WHERE t.id = ?
    `).bind(id).first();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Get user count
    const userCount = await db.prepare(
      'SELECT COUNT(*) as cnt FROM tenant_users WHERE tenant_id = ? AND is_active = 1'
    ).bind(id).first<{ cnt: number }>();

    // Parse settings
    let settings: Record<string, string> = {};
    try {
      settings = JSON.parse((tenant.settings as string) || '{}');
    } catch { /* ignore */ }

    return NextResponse.json({
      ...tenant,
      owner_name: settings.ownerName || '',
      owner_email: settings.ownerEmail || '',
      owner_phone: settings.ownerPhone || '',
      country: settings.country || '',
      timezone: settings.timezone || '',
      user_count: userCount?.cnt || 0,
    });
  } catch (err) {
    console.error('Get tenant error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/tenants/:id — Update tenant details
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      company_name?: string;
      owner_email?: string;
      owner_phone?: string;
      country?: string;
      timezone?: string;
    };

    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const existing = await db.prepare('SELECT id, settings FROM tenants WHERE id = ?')
      .bind(id).first<{ id: string; settings: string }>();

    if (!existing) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Update settings JSON
    let settings: Record<string, string> = {};
    try { settings = JSON.parse(existing.settings || '{}'); } catch { /* ignore */ }

    if (body.owner_email) settings.ownerEmail = body.owner_email;
    if (body.owner_phone) settings.ownerPhone = body.owner_phone;
    if (body.country) settings.country = body.country;
    if (body.timezone) settings.timezone = body.timezone;

    const updates: string[] = ["updated_at = datetime('now')"];
    const bindings: (string | number)[] = [];

    if (body.company_name) {
      updates.push('company_name = ?');
      bindings.push(body.company_name);
    }

    updates.push('settings = ?');
    bindings.push(JSON.stringify(settings));

    bindings.push(id);

    await db.prepare(
      `UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...bindings).run();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Update tenant error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/tenants/:id — Soft delete
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const tenant = await db.prepare('SELECT id, status FROM tenants WHERE id = ?')
      .bind(id).first();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    await db.prepare(
      "UPDATE tenants SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?"
    ).bind(id).run();

    return NextResponse.json({ success: true, message: 'Tenant deleted (soft)' });
  } catch (err) {
    console.error('Delete tenant error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
