import { Hono } from 'hono';
import type { AppContext } from '../types';
import { getExchangeRateInfo } from '../services/exchange-rate';
import { success, error } from '../utils/response';
import { isValidCurrency, loadLocaleContext } from '../utils/money';

const exchangeRateRoutes = new Hono<AppContext>();

// ============================================================
// GET / — Get exchange rate (TICKET-094)
// `to` defaults to the agency's own currency, `from` to USD.
// ============================================================

exchangeRateRoutes.get('/', async (c) => {
  const url = new URL(c.req.url);
  const from = url.searchParams.get('from') || 'USD';
  const to = url.searchParams.get('to') || (await loadLocaleContext(c.get('tenantDb'))).currency;
  if (!isValidCurrency(from) || !isValidCurrency(to)) return error(c, 'from and to must be 3-letter currency codes', 400);

  const info = await getExchangeRateInfo(from, to, c.env);
  return success(c, {
    from: from.toUpperCase(),
    to: to.toUpperCase(),
    rate: info.rate,
    asOf: info.asOf,
    available: info.source !== 'none',
    timestamp: new Date().toISOString(),
  });
});

export default exchangeRateRoutes;
