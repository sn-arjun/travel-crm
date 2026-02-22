import { Hono } from 'hono';
import type { AppContext } from '../types';
import { getExchangeRate } from '../services/exchange-rate';
import { success, error } from '../utils/response';

const exchangeRateRoutes = new Hono<AppContext>();

// ============================================================
// GET / — Get exchange rate (TICKET-094)
// ============================================================

exchangeRateRoutes.get('/', async (c) => {
  const url = new URL(c.req.url);
  const from = url.searchParams.get('from') || 'USD';
  const to = url.searchParams.get('to') || 'INR';

  try {
    const rate = await getExchangeRate(from, to, c.env);
    return success(c, {
      from,
      to,
      rate,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return error(c, 'Failed to fetch exchange rate', 500);
  }
});

export default exchangeRateRoutes;
