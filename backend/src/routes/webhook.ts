import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppContext } from '../types';
import { generateId } from '../utils/uuid';

const webhookRoutes = new Hono<AppContext>();

// Public CORS for webhooks
webhookRoutes.use('/*', cors({ origin: '*' }));

// POST /api/v1/leads/webhook — Auto-create lead from external source
webhookRoutes.post('/leads/webhook', async (c) => {
  const body = await c.req.json();
  const {
    api_key, source, name, email, phone, destination, travel_dates,
    adults, children, budget, message, utm_source, utm_medium, utm_campaign,
  } = body;

  if (!api_key) {
    return c.json({ error: 'api_key is required' }, 400);
  }

  const masterDb = c.env.MASTER_DB;

  // Validate API key
  const keyRecord = await masterDb.prepare(
    'SELECT tenant_id FROM tenant_api_keys WHERE api_key = ? AND is_active = 1'
  ).bind(api_key).first<{ tenant_id: string }>();

  if (!keyRecord) {
    return c.json({ error: 'Invalid API key' }, 401);
  }

  const tenantId = keyRecord.tenant_id;

  // Rate limiting: max 100 requests per API key per hour
  const recentRequests = await masterDb.prepare(`
    SELECT COUNT(*) as cnt FROM webhook_log
    WHERE api_key = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 hour')
  `).bind(api_key).first<{ cnt: number }>();

  if ((recentRequests?.cnt || 0) >= 100) {
    return c.json({ error: 'Rate limit exceeded (100/hour)' }, 429);
  }

  try {
    // Get tenant D1 database
    const tenant = await masterDb.prepare(
      'SELECT d1_database_id FROM tenants WHERE id = ?'
    ).bind(tenantId).first<{ d1_database_id: string }>();

    if (!tenant?.d1_database_id) {
      return c.json({ error: 'Tenant database not configured' }, 500);
    }

    const cfAccountId = c.env.CF_ACCOUNT_ID;
    const cfApiToken = c.env.CF_API_TOKEN;

    if (!cfAccountId || !cfApiToken) {
      return c.json({ error: 'CF API credentials not configured' }, 500);
    }

    const leadId = generateId();
    const contactId = generateId();
    const leadTitle = `${String(source || 'Website')} - ${String(destination || name || 'New Enquiry')}`;

    // Create contact if phone or email provided (parameterized query)
    if (phone || email) {
      await executeTenantSQL(cfAccountId, cfApiToken, tenant.d1_database_id,
        `INSERT OR IGNORE INTO contacts (id, tenant_id, name, email, phone, source, is_deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
        [contactId, tenantId, String(name || 'Unknown'), String(email || ''), String(phone || ''), String(source || 'website')],
      );
    }

    // Create lead (parameterized query)
    await executeTenantSQL(cfAccountId, cfApiToken, tenant.d1_database_id,
      `INSERT INTO leads (id, tenant_id, contact_id, title, destination, travel_dates,
        pax_adults, pax_children, budget, notes, source, status, priority,
        utm_source, utm_medium, utm_campaign, is_deleted,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', 'Hot', ?, ?, ?, 0,
        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
      [
        leadId, tenantId, phone || email ? contactId : null,
        leadTitle, String(destination || ''), String(travel_dates || ''),
        Number(adults) || 0, Number(children) || 0, Number(budget) || 0,
        String(message || ''), String(source || 'website'),
        String(utm_source || ''), String(utm_medium || ''), String(utm_campaign || ''),
      ],
    );

    // Log success
    await masterDb.prepare(`
      INSERT INTO webhook_log (id, tenant_id, api_key, source, payload, status)
      VALUES (?, ?, ?, ?, ?, 'success')
    `).bind(generateId(), tenantId, api_key, source || 'website', JSON.stringify(body)).run();

    return c.json({ success: true, lead_id: leadId });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);

    // Log error
    await masterDb.prepare(`
      INSERT INTO webhook_log (id, tenant_id, api_key, source, payload, status, error_message)
      VALUES (?, ?, ?, ?, ?, 'error', ?)
    `).bind(generateId(), tenantId, api_key, source || 'website', JSON.stringify(body), errMsg).run();

    return c.json({ error: 'Failed to create lead' }, 500);
  }
});

async function executeTenantSQL(
  accountId: string,
  apiToken: string,
  dbId: string,
  sql: string,
  params: (string | number | null)[] = [],
) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    }
  );
  if (!res.ok) {
    throw new Error(`D1 query failed: ${res.status}`);
  }
  return res.json();
}

export default webhookRoutes;
