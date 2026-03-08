import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { generateUUIDv7 } from '@/lib/auth';

// POST /api/wordpress/provision — Manual provisioning trigger
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      tenantId: string;
      subdomain: string;
      template?: string;
    };
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    // Verify tenant exists
    const tenant = await db.prepare('SELECT id, company_name FROM tenants WHERE id = ?')
      .bind(body.tenantId).first<{ id: string; company_name: string }>();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Check for existing site
    const existing = await db.prepare(
      'SELECT id FROM wordpress_sites WHERE tenant_id = ? AND subdomain = ?'
    ).bind(body.tenantId, body.subdomain).first();

    if (existing) {
      // Re-provision: update status
      await db.prepare(
        "UPDATE wordpress_sites SET status = 'queued', error_message = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?"
      ).bind((existing as { id: string }).id).run();

      return NextResponse.json({ success: true, siteId: (existing as { id: string }).id, message: 'Re-provisioning queued' });
    }

    // Create new record
    const siteId = generateUUIDv7();
    const domain = `${body.subdomain}.travelcrmpro.com`;

    await db.prepare(`
      INSERT INTO wordpress_sites (id, tenant_id, subdomain, domain, status, template)
      VALUES (?, ?, ?, ?, 'queued', ?)
    `).bind(siteId, body.tenantId, body.subdomain, domain, body.template || 'travel-starter').run();

    // In production: send to Cloudflare Queue
    // await env.WP_PROVISION_QUEUE.send({ tenantId: body.tenantId, subdomain: body.subdomain, ... });

    return NextResponse.json({ success: true, siteId, message: 'Provisioning queued' });
  } catch (err) {
    console.error('WP provision error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
