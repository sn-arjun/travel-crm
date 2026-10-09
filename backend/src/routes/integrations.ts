/**
 * Integrations settings (admin only).
 *
 *   GET    /integrations/channels        the numbers and mailboxes this workspace receives on
 *   POST   /integrations/channels        register one
 *   DELETE /integrations/channels/:id    stop receiving on one
 *   GET    /integrations/api-keys        website-form keys (masked)
 *   POST   /integrations/api-keys        issue a key (shown in full once)
 *   DELETE /integrations/api-keys/:id    revoke a key
 *
 * Both tables live in MASTER_DB because the public webhooks must find the tenant
 * before any tenant database is known.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '../utils/validator';
import type { AppContext } from '../types';
import { rbac } from '../middleware/rbac';
import { generateId } from '../utils/uuid';
import { success, created, error, notFound } from '../utils/response';
import { normalizeAddress } from '../services/inbound/ingest';

const integrationRoutes = new Hono<AppContext>();

integrationRoutes.use('/*', rbac(['admin']));

// ── Receiving addresses ──────────────────────────────────────

const CHANNELS = ['whatsapp', 'sms', 'email', 'voice'] as const;

const createChannelSchema = z.object({
  channel: z.enum(CHANNELS),
  address: z.string().min(3).max(200),
  provider: z.enum(['twilio', 'plivo', 'sendgrid']).optional(),
  label: z.string().max(80).optional(),
});

interface ChannelRow {
  id: string;
  channel: string;
  address: string;
  provider: string | null;
  label: string | null;
  is_active: number;
  created_at: string;
}

function toChannel(row: ChannelRow) {
  return {
    id: row.id,
    channel: row.channel,
    address: row.address,
    provider: row.provider,
    label: row.label,
    isActive: !!row.is_active,
    createdAt: row.created_at,
  };
}

integrationRoutes.get('/channels', async (c) => {
  const rows = await c.env.MASTER_DB
    .prepare(
      `SELECT id, channel, address, provider, label, is_active, created_at
       FROM tenant_channel_addresses WHERE tenant_id = ? ORDER BY channel, created_at`,
    )
    .bind(c.get('tenantId'))
    .all<ChannelRow>();
  return success(c, rows.results.map(toChannel));
});

integrationRoutes.post('/channels', zValidator('json', createChannelSchema), async (c) => {
  const body = c.req.valid('json');
  const tenantId = c.get('tenantId');
  const address = normalizeAddress(body.channel, body.address);

  const isEmail = body.channel === 'email';
  if (isEmail ? !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address) : !/^\+\d{8,15}$/.test(address)) {
    return error(c, isEmail ? 'Enter a valid email address' : 'Enter a valid phone number with country code', 400);
  }

  const taken = await c.env.MASTER_DB
    .prepare('SELECT tenant_id FROM tenant_channel_addresses WHERE channel = ? AND address = ?')
    .bind(body.channel, address)
    .first<{ tenant_id: string }>();
  if (taken) {
    // Never reveal which workspace holds an address.
    return error(
      c,
      taken.tenant_id === tenantId ? 'This address is already registered' : 'This address is registered to another workspace',
      409,
    );
  }

  const id = generateId();
  await c.env.MASTER_DB
    .prepare(
      `INSERT INTO tenant_channel_addresses (id, tenant_id, channel, address, provider, label) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, tenantId, body.channel, address, body.provider ?? null, body.label?.trim() || null)
    .run();

  const row = await c.env.MASTER_DB
    .prepare('SELECT id, channel, address, provider, label, is_active, created_at FROM tenant_channel_addresses WHERE id = ?')
    .bind(id)
    .first<ChannelRow>();
  return created(c, toChannel(row!));
});

integrationRoutes.delete('/channels/:id', async (c) => {
  const result = await c.env.MASTER_DB
    .prepare('DELETE FROM tenant_channel_addresses WHERE id = ? AND tenant_id = ?')
    .bind(c.req.param('id'), c.get('tenantId'))
    .run();
  if (!result.meta.changes) return notFound(c, 'Address');
  return success(c, { deleted: true });
});

// ── Website-form API keys ────────────────────────────────────

interface ApiKeyRow {
  id: string;
  api_key: string;
  label: string | null;
  is_active: number;
  created_at: string;
}

function maskKey(key: string): string {
  return key.length > 12 ? `${key.slice(0, 8)}…${key.slice(-4)}` : '…';
}

function newApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `tcrm_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

integrationRoutes.get('/api-keys', async (c) => {
  const rows = await c.env.MASTER_DB
    .prepare('SELECT id, api_key, label, is_active, created_at FROM tenant_api_keys WHERE tenant_id = ? AND is_active = 1 ORDER BY created_at')
    .bind(c.get('tenantId'))
    .all<ApiKeyRow>();
  return success(
    c,
    rows.results.map((row) => ({ id: row.id, label: row.label, maskedKey: maskKey(row.api_key), createdAt: row.created_at })),
  );
});

integrationRoutes.post('/api-keys', zValidator('json', z.object({ label: z.string().max(80).optional() })), async (c) => {
  const { label } = c.req.valid('json');
  const id = generateId();
  const apiKey = newApiKey();
  await c.env.MASTER_DB
    .prepare('INSERT INTO tenant_api_keys (id, tenant_id, api_key, label, is_active) VALUES (?, ?, ?, ?, 1)')
    .bind(id, c.get('tenantId'), apiKey, label?.trim() || null)
    .run();
  // The full key is returned only here; afterwards it is shown masked.
  return created(c, { id, label: label?.trim() || null, apiKey, maskedKey: maskKey(apiKey) });
});

integrationRoutes.delete('/api-keys/:id', async (c) => {
  const result = await c.env.MASTER_DB
    .prepare('UPDATE tenant_api_keys SET is_active = 0 WHERE id = ? AND tenant_id = ? AND is_active = 1')
    .bind(c.req.param('id'), c.get('tenantId'))
    .run();
  if (!result.meta.changes) return notFound(c, 'API key');
  return success(c, { revoked: true });
});

export default integrationRoutes;
