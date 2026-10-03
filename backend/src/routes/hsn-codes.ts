import { Hono } from 'hono';
import { zValidator } from '../utils/validator';
import { z } from 'zod';
import type { AppContext } from '../types';
import { success, created, error } from '../utils/response';
import { generateId } from '../utils/uuid';

const hsnCodeRoutes = new Hono<AppContext>();

// Pre-loaded travel industry HSN/SAC codes
const DEFAULT_HSN_CODES = [
  { code: '996311', description: 'Hotel accommodation services', category: 'accommodation' },
  { code: '996411', description: 'Transport / vehicle rental services', category: 'transport' },
  { code: '998551', description: 'Tour operator services', category: 'tour' },
  { code: '998552', description: 'Tourist guide services', category: 'tour' },
  { code: '996331', description: 'Food & beverage services', category: 'food' },
  { code: '997221', description: 'Air transport - passenger', category: 'flight' },
  { code: '997121', description: 'Visa processing services', category: 'visa' },
  { code: '999799', description: 'Other travel services', category: 'other' },
];

// GET / — List HSN/SAC codes (pre-loaded + custom)
hsnCodeRoutes.get('/', async (c) => {
  const tenantDb = c.get('tenantDb');
  const search = new URL(c.req.url).searchParams.get('search') || '';

  try {
    // Get custom codes from settings
    const customResult = await tenantDb
      .prepare("SELECT value FROM settings WHERE key = 'custom_hsn_codes'")
      .first<{ value: string }>();

    const customCodes = customResult?.value ? JSON.parse(customResult.value) : [];
    const allCodes = [...DEFAULT_HSN_CODES, ...customCodes];

    if (search) {
      const q = search.toLowerCase();
      return success(c, allCodes.filter(
        (h: any) => h.code.includes(q) || h.description.toLowerCase().includes(q)
      ));
    }

    return success(c, allCodes);
  } catch (err) {
    console.error('Error listing HSN codes:', err);
    return error(c, 'Failed to list HSN codes', 500);
  }
});

// POST / — Add custom HSN/SAC code
const createHsnSchema = z.object({
  code: z.string().min(1).max(10),
  description: z.string().min(1).max(200),
  category: z.string().optional(),
});

hsnCodeRoutes.post('/', zValidator('json', createHsnSchema), async (c) => {
  const tenantDb = c.get('tenantDb');
  const role = c.get('role');

  if (role !== 'admin') {
    return error(c, 'Only admin can add custom HSN codes', 403);
  }

  const data = c.req.valid('json');

  try {
    const customResult = await tenantDb
      .prepare("SELECT value FROM settings WHERE key = 'custom_hsn_codes'")
      .first<{ value: string }>();

    const customCodes = customResult?.value ? JSON.parse(customResult.value) : [];
    customCodes.push({ ...data, id: generateId(), isCustom: true });

    await tenantDb
      .prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ('custom_hsn_codes', ?1, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = datetime('now')`
      )
      .bind(JSON.stringify(customCodes))
      .run();

    return created(c, data);
  } catch (err) {
    console.error('Error adding HSN code:', err);
    return error(c, 'Failed to add HSN code', 500);
  }
});

export default hsnCodeRoutes;
