/**
 * Refresh prices from the live catalogue: GET {apiBase}/api/v1/public/plans?market=<catalogue code>. The page keeps
 * the build-time prices when the API is unreachable, slow (6 s) or answers with something unexpected.
 */
import { apiBase } from './config';
import { getMarket, onMarket, updateMarket } from './region';
import type { MarketView } from './bind';

interface LivePlan { yearlyPrice?: number; listYearlyPrice?: number; includedUsers?: number; extraUserYearlyPrice?: number }
const done = new Set<string>();

async function refresh(m: MarketView) {
  if (done.has(m.key) || !('fetch' in window)) return;
  done.add(m.key);
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(`${apiBase()}/api/v1/public/plans?market=${encodeURIComponent(m.catalogue)}`, { headers: { Accept: 'application/json' }, signal: ctl.signal });
    if (!res.ok) return;
    const body = await res.json();
    const plans: LivePlan[] = ((body && body.data && body.data.plans) || []).filter((p: LivePlan) => typeof p.yearlyPrice === 'number');
    if (plans.length < 3) return;
    plans.sort((a, b) => a.yearlyPrice! - b.yearlyPrice!);
    const next = m.plans.map((old, i) => {
      const p = plans[i];
      return [p.yearlyPrice!, p.listYearlyPrice ?? old[1], p.includedUsers ?? old[2], p.extraUserYearlyPrice ?? old[3]] as [number, number, number, number];
    });
    updateMarket(m.key, { plans: next });
  } catch { /* keep the build-time prices */ } finally {
    window.clearTimeout(timer);
  }
}

export function initLivePlans() {
  onMarket((m) => { void refresh(m); });
  const m = getMarket();
  if (m) void refresh(m);
}
