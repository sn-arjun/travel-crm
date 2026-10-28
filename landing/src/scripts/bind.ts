/**
 * Every market-dependent string on a page, keyed by the `data-bind` name the markup uses. The server renders these
 * for the page's default market and the browser calls the same function when the visitor picks another market,
 * so the two can never disagree.
 */
export interface MarketView {
  key: string;
  catalogue: string;
  name: string;
  sym: string;
  locale: string;
  tax: string;
  note: string;
  plans: [number, number, number, number][];
  aiPacks: [number, number][];
}

const PLAN_NAMES = ['Basic', 'Pro', 'Enterprise'];
const BEST_FOR = ['retail agencies getting organised', 'growing agencies and tour operators', 'DMCs, B2B sellers and multi-brand groups'];

export function fmt(m: MarketView, n: number): string {
  return m.sym + n.toLocaleString(m.locale);
}

export function bindings(m: MarketView): Record<string, string> {
  const out: Record<string, string> = { tax: m.tax, note: m.note, region: m.name, from: fmt(m, m.plans[0][0]) };
  m.plans.forEach(([founder, list, users, extra], i) => {
    out[`price.${i}`] = fmt(m, founder);
    out[`priceLabel.${i}`] = `${PLAN_NAMES[i]}: ${fmt(m, founder)} per year, founding price`;
    out[`list.${i}`] = fmt(m, list);
    out[`users.${i}`] = `${users} USERS`;
    out[`usersN.${i}`] = String(users);
    out[`extra.${i}`] = fmt(m, extra);
    out[`usersLine.${i}`] = `${users} users included, ${fmt(m, extra)} per extra user a year`;
    out[`bestFor.${i}`] = `Best for ${BEST_FOR[i]}, up to ${users} users included`;
  });
  m.aiPacks.forEach(([credits, price], i) => {
    out[`aiPack.${i}`] = `${credits.toLocaleString('en-GB')} AI credits: ${fmt(m, price)}`;
  });
  return out;
}
