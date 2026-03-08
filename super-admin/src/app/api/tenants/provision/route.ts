import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { hashPassword, generateUUIDv7 } from '@/lib/auth';

interface ProvisionBody {
  company: {
    name: string;
    slug: string;
    ownerName: string;
    ownerEmail: string;
    ownerPhone: string;
    country: string;
    timezone: string;
  };
  plan: {
    name: string;
    monthlyAmount: number;
  };
  admin: {
    password: string;
  };
  wordpress: {
    enabled: boolean;
    subdomain?: string;
    template?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ProvisionBody;
    const { company, plan, admin, wordpress } = body;

    if (!company.name || !company.slug || !company.ownerEmail || !admin.password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;
    const tenantId = generateUUIDv7();

    // Check slug uniqueness
    const existing = await db.prepare('SELECT id FROM tenants WHERE subdomain = ?')
      .bind(company.slug).first();
    if (existing) {
      return NextResponse.json({ error: 'Subdomain already taken' }, { status: 409 });
    }

    // Check email uniqueness
    const existingEmail = await db.prepare('SELECT id FROM tenant_users WHERE email = ?')
      .bind(company.ownerEmail).first();
    if (existingEmail) {
      return NextResponse.json({ error: 'Email already registered with another tenant' }, { status: 409 });
    }

    try {
      // Step 1: Create tenant record
      await db.prepare(`
        INSERT INTO tenants (id, company_name, subdomain, plan, status, max_users, settings)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        tenantId,
        company.name,
        company.slug,
        plan.name,
        plan.name === 'free' ? 'trial' : 'active',
        plan.name === 'enterprise' ? 50 : plan.name === 'pro' ? 15 : plan.name === 'starter' ? 5 : 2,
        JSON.stringify({
          ownerName: company.ownerName,
          ownerPhone: company.ownerPhone,
          country: company.country,
          timezone: company.timezone,
        }),
      ).run();

      // Step 2: Create D1 database via Cloudflare API
      // In development, skip actual CF API call and simulate
      const cfAccountId = process.env.CF_ACCOUNT_ID;
      const cfApiToken = process.env.CF_API_TOKEN;
      let databaseId = `simulated-db-${company.slug}`;

      if (cfAccountId && cfApiToken) {
        const dbResponse = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/d1/database`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${cfApiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: `travelcrm-tenant-${company.slug}` }),
          }
        );
        const dbResult = (await dbResponse.json()) as { success: boolean; result?: { uuid: string }; errors?: { message: string }[] };
        if (!dbResult.success) {
          throw new Error(`D1 creation failed: ${dbResult.errors?.[0]?.message || 'Unknown error'}`);
        }
        databaseId = dbResult.result?.uuid || databaseId;
      }

      // Step 3: Store database_id
      await db.prepare('UPDATE tenants SET d1_database_id = ? WHERE id = ?')
        .bind(databaseId, tenantId).run();

      // Step 4: Create admin user in tenant_users (master DB cross-reference)
      const adminUserId = generateUUIDv7();
      const passwordHash = await hashPassword(admin.password);

      await db.prepare(`
        INSERT INTO tenant_users (id, tenant_id, email, phone, user_id, role)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        generateUUIDv7(),
        tenantId,
        company.ownerEmail,
        company.ownerPhone || null,
        adminUserId,
        'admin',
      ).run();

      // Step 5: Create subscription
      const subscriptionId = generateUUIDv7();
      const now = new Date().toISOString();
      const nextBilling = new Date();
      nextBilling.setMonth(nextBilling.getMonth() + 1);

      await db.prepare(`
        INSERT INTO subscriptions (id, tenant_id, plan, amount, billing_cycle, start_date, next_billing_date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        subscriptionId,
        tenantId,
        plan.name,
        plan.monthlyAmount,
        'monthly',
        now,
        nextBilling.toISOString(),
        plan.name === 'free' ? 'trial' : 'active',
      ).run();

      // Step 6: WordPress provisioning placeholder
      // In production, this would enqueue to a Cloudflare Queue
      let wpSiteId: string | null = null;
      if (wordpress.enabled && wordpress.subdomain) {
        wpSiteId = generateUUIDv7();
        await db.prepare(`
          INSERT INTO wordpress_sites (id, tenant_id, subdomain, status)
          VALUES (?, ?, ?, 'provisioning')
        `).bind(wpSiteId, tenantId, wordpress.subdomain).run();
      }

      return NextResponse.json({
        success: true,
        tenant: {
          id: tenantId,
          slug: company.slug,
          databaseId,
          wpSiteId,
        },
      });
    } catch (err) {
      // Rollback: clean up tenant + related records
      await db.batch([
        db.prepare('DELETE FROM subscriptions WHERE tenant_id = ?').bind(tenantId),
        db.prepare('DELETE FROM tenant_users WHERE tenant_id = ?').bind(tenantId),
        db.prepare('DELETE FROM wordpress_sites WHERE tenant_id = ?').bind(tenantId),
        db.prepare('DELETE FROM tenants WHERE id = ?').bind(tenantId),
      ]);

      const message = err instanceof Error ? err.message : 'Provisioning failed';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
