import { env, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pricingDoc from '../../docs/PRICING.md?raw';
import {
  activePriceFrom,
  getAllowance,
  getCatalogue,
  marketForCountry,
  previousPeriodKey,
  type Catalogue,
} from '../src/services/plans/catalogue';
import { MIN_COMM_MARGIN_PCT, activeUnitCost, packSalePriceFrom } from '../src/services/plans/pricing';
import { CHANNEL_SPECS, buildExhaustedBody, packOffers } from '../src/services/metering/meter';
import { buildQuote, saveQuote, type TenantRow } from '../src/services/billing/subscriptions';
import { MIN_COMM_MARGIN_PCT as ADDONS_MIN_MARGIN } from '../src/services/billing/addons';
import migration0026 from '../drizzle/master/0026_pricing_2026_10.sql?raw';

/**
 * R129: the catalogue holds docs/PRICING.md section 7 (step A) exactly, every agency is priced in its own market and
 * currency, the founder price is quoted inside its window and locked for 24 months, packs are offered per market, never
 * sell below the margin floor and live into the month after purchase.
 */

const testEnv = env as any;
const master = (sql: string, ...binds: unknown[]) => (testEnv.MASTER_DB as D1Database).prepare(sql).bind(...binds);
const all = async <T = Record<string, any>>(sql: string, ...binds: unknown[]) => ((await master(sql, ...binds).all()).results ?? []) as T[];

// ---- PRICING.md section 7 parsed from the document itself ----------------------------------------------------------

const docLines = pricingDoc.split(/\r?\n/);
const sectionLines = (from: string, to: string) => docLines.slice(docLines.findIndex((l) => l.startsWith(from)), docLines.findIndex((l) => l.startsWith(to)));
const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
function table(lines: string[], headerStart: string): Array<Record<string, string>> {
  const i = lines.findIndex((l) => l.startsWith(headerStart));
  if (i < 0) throw new Error('table not found: ' + headerStart);
  const header = cells(lines[i]);
  const rows: Array<Record<string, string>> = [];
  for (let j = i + 2; j < lines.length && lines[j].startsWith('|'); j++) {
    const c = cells(lines[j]);
    rows.push(Object.fromEntries(header.map((h, k) => [h, c[k]])));
  }
  return rows;
}
const docPrices = table(sectionLines('### 7.2', '### 7.3'), '| id | plan_key |');
const docCosts = table(sectionLines('### 7.5', '### 7.6'), '| id | channel |');
const docProducts = table(sectionLines('### 7.6', '### 7.7'), '| key | name | kind |');
const docAllowances = table(sectionLines('### 7.3', '### 7.4'), '| plan_key |');
const FOUNDER_FROM = '2026-11-01T00:00:00Z';
const LIST_FROM = '2027-04-01T00:00:00Z';

const MARKET_COUNTRY: Record<string, string> = { IN: 'IN', UK: 'GB', EU: 'DE', ANZ: 'AU', WEST: 'US', SG: 'SG', GULF: 'AE', MY_TH: 'MY', LK_NP_BD: 'LK' };
const MARKET_CURRENCY: Record<string, string> = { IN: 'INR', UK: 'GBP', EU: 'EUR', ANZ: 'AUD', WEST: 'USD', SG: 'USD', GULF: 'USD', MY_TH: 'USD', LK_NP_BD: 'USD' };

let catalogue: Catalogue;

beforeAll(async () => {
  await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
  catalogue = await getCatalogue(testEnv);
});

describe('catalogue rows equal PRICING.md section 7 (step A, with the step B switches of migration 0028)', () => {
  it('plan_prices: all 54 rows, 9 markets x 3 plans x (founder, list), with the document ids, currency, users and dates', async () => {
    expect(docPrices).toHaveLength(54);
    const rows = await all<any>('SELECT * FROM plan_prices');
    for (const d of docPrices) {
      const row = rows.find((r) => r.id === d.id);
      expect(row, `plan_prices ${d.id}`).toBeTruthy();
      expect(row).toMatchObject({
        plan_key: d.plan_key,
        market: d.market,
        currency: d.currency,
        yearly_price: Number(d.yearly_price),
        included_users: Number(d.included_users),
        extra_user_yearly_price: Number(d.extra_user_yearly_price),
        is_active: 1,
        valid_from: d.valid_from,
        price_kind: d.valid_from === FOUNDER_FROM ? 'founder' : 'list',
      });
      expect(d.currency).toBe(MARKET_CURRENCY[d.market]);
    }
    // The three draft paid-plan India rows are switched off; the trial row stays.
    for (const id of ['01a13a7c-5808-7673-bc0d-99f298ff87cb', '01a13a7c-5808-7673-bc0d-99f33173ee8c', '01a13a7c-5808-7673-bc0d-99f4d1d7afbc']) {
      expect((await master('SELECT is_active FROM plan_prices WHERE id = ?', id).first<any>())!.is_active).toBe(0);
    }
    expect((await master('SELECT is_active, included_users FROM plan_prices WHERE id = ?', '01a13a7c-5807-7e56-adc4-d71a10d865a0').first<any>())).toEqual({ is_active: 1, included_users: 3 });
  });

  it('the headline prices of the document, by market', () => {
    const expected: Record<string, [number, number, number]> = {
      IN: [14999, 29999, 74999], UK: [449, 899, 1799], EU: [529, 1059, 2119], ANZ: [849, 1699, 3399], WEST: [590, 1190, 2390],
      SG: [590, 1190, 2390], GULF: [490, 990, 1990], MY_TH: [390, 790, 1590], LK_NP_BD: [190, 390, 790],
    };
    const founder: Record<string, [number, number, number]> = {
      IN: [11999, 23999, 59999], UK: [359, 719, 1439], EU: [419, 849, 1699], ANZ: [679, 1359, 2719], WEST: [470, 950, 1910],
      SG: [470, 950, 1910], GULF: [390, 790, 1590], MY_TH: [310, 630, 1270], LK_NP_BD: [150, 310, 630],
    };
    for (const market of Object.keys(expected)) {
      ['basic', 'pro', 'enterprise'].forEach((plan, i) => {
        expect(activePriceFrom(catalogue, plan, market, new Date('2027-05-01T00:00:00Z'))?.yearlyPrice, `${market} ${plan} list`).toBe(expected[market][i]);
        expect(activePriceFrom(catalogue, plan, market, new Date('2026-12-01T00:00:00Z'))?.yearlyPrice, `${market} ${plan} founder`).toBe(founder[market][i]);
      });
    }
  });

  it('plan_allowances (step B: utility-only whatsapp amounts) and plan_features: the rows and the counts of section 7.3 / 7.4', () => {
    const cols: Array<[string, string]> = [['ai_credits', 'ai_credits'], ['whatsapp', 'whatsapp (step B)'], ['whatsapp_marketing', 'whatsapp_marketing'], ['sms', 'sms'], ['otp', 'otp'], ['email', 'email'], ['call_minutes', 'call_minutes'], ['storage_gb', 'storage_gb'], ['websites', 'websites']];
    for (const d of docAllowances) {
      const plan = catalogue.plans.find((p) => p.key === d.plan_key)!;
      for (const [key, col] of cols) expect(plan.allowances[key], `${d.plan_key} ${key}`).toBe(Number(d[col]));
      expect(Object.keys(plan.allowances)).toHaveLength(cols.length);
    }
    const count = (key: string) => catalogue.plans.find((p) => p.key === key)!.features.length;
    expect([count('trial'), count('basic'), count('pro'), count('enterprise')]).toEqual([21, 11, 23, 41]);
    const features = (key: string) => catalogue.plans.find((p) => p.key === key)!.features;
    expect(features('trial')).not.toContain('voip_calling');
    expect(features('trial')).not.toContain('custom_domain');
    expect(features('basic')).toEqual(expect.arrayContaining(['bulk_whatsapp', 'ai_assistant', 'ai_message_compose']));
    expect(features('pro')).toEqual(expect.arrayContaining(['whatsapp_campaigns', 'ai_intelligence', 'custom_domain']));
    expect(features('basic')).not.toContain('whatsapp_campaigns');
    expect(features('enterprise')).toEqual(expect.arrayContaining(['ai_chatbot', 'api_access', 'ai_coaching']));
  });

  it('plans: the migration writes the names, descriptions, order and visibility of section 7.1', () => {
    // Read from the migration text: other test files edit plan rows in the shared database.
    const docPlans = table(sectionLines('### 7.1', '### 7.2'), '| key |');
    expect(docPlans.map((p) => p.key)).toEqual(['trial', 'basic', 'pro', 'enterprise']);
    for (const p of docPlans) {
      expect(migration0026).toContain(`UPDATE plans SET name = '${p.name}', description = '${p.description}', sort_order = ${p.sort_order}, is_public = ${p.is_public}, trial_days = ${p.trial_days}, is_active = ${p.is_active}`);
    }
    expect(catalogue.plans.map((p) => p.key).sort()).toEqual(['basic', 'enterprise', 'pro', 'trial']);
  });

  it('comm_unit_costs: all rows with the document ids, units, margins; step B rows active, interim WhatsApp rows retired', async () => {
    expect(docCosts.length).toBe(69);
    const rows = await all<any>('SELECT * FROM comm_unit_costs');
    for (const d of docCosts) {
      const row = rows.find((r) => r.id === d.id);
      expect(row, `comm_unit_costs ${d.id}`).toBeTruthy();
      // R130: step B is on. The interim marketing-rate whatsapp rows of step A are off, the step B rows are on.
      const stepB = d.step.startsWith('B');
      const interim = /interim/.test(d.provider);
      expect(row).toMatchObject({ channel: d.channel, market: d.market, unit_cost: Number(d.unit_cost), currency: d.currency, margin_pct: Number(d.margin_pct), effective_from: d.effective_from, is_active: stepB ? 1 : interim ? 0 : Number(d.is_active) });
    }
    // Step B rows are in and switched on (0028).
    for (const d of docCosts.filter((x) => x.step.startsWith('B'))) expect(rows.find((r) => r.id === d.id)!.is_active).toBe(1);
    // Outside India the margin is 30, in India 25.
    for (const r of rows.filter((x) => docCosts.some((d) => d.id === x.id))) {
      expect(r.margin_pct).toBe(r.market === 'IN' ? 25 : 30);
    }
    // The rows they supersede are inactive.
    const old = ['01a13a7c-5809-7633-8fcc-ef0842316a28', '01a2c000-0304-7000-8000-000000000001', '01a2c000-0305-7000-8000-000000000007'];
    for (const id of old) expect(rows.find((r) => r.id === id)!.is_active).toBe(0);
  });

  it('addon_products: 68 new rows, step B marketing packs active, the retired packs switched off', async () => {
    expect(docProducts).toHaveLength(68);
    const rows = await all<any>('SELECT * FROM addon_products');
    for (const d of docProducts) {
      const row = rows.find((r) => r.key === d.key);
      expect(row, `addon_products ${d.key}`).toBeTruthy();
      expect(row).toMatchObject({
        name: d.name, kind: d.kind, channel: d.channel === 'NULL' ? null : d.channel, units: Number(d.units),
        fixed_price: d.fixed_price === 'NULL' ? null : Number(d.fixed_price), currency: d.currency, market: d.market,
        is_active: d.key.startsWith('whatsapp_marketing_') ? 1 : Number(d.is_active), // R130: step B switches the marketing packs on
      });
    }
    for (const key of ['ai_credit_pack_5000', 'email_1000', 'call_minutes_100_west', 'call_minutes_100_sg']) {
      expect(rows.find((r) => r.key === key)!.is_active).toBe(0);
    }
    for (const r of rows.filter((x) => x.key.startsWith('whatsapp_marketing_'))) expect(r.is_active).toBe(1);
    expect(rows.find((r) => r.key === 'extra_user')!.is_active).toBe(1);
  });

  it('login codes stay on SMS: the otp rows are Twilio Verify + SMS, and the trial setting keeps calling off', async () => {
    for (const d of docCosts.filter((x) => x.channel === 'otp')) expect(d.provider).toMatch(/Twilio Verify/);
    // (platform_settings is edited by other test files, so the migration text is checked.)
    expect(migration0026).toContain("INSERT OR IGNORE INTO platform_settings (key, value) VALUES ('voip_calling_on_trial', '0')");
  });

  it('the notes say where the numbers come from', async () => {
    const note = await master(`SELECT value FROM catalogue_notes WHERE key = 'drafts'`).first<any>();
    expect(note!.value).toContain('docs/PRICING.md');
    expect(note!.value).toContain('approved by the owner on 2026-10-21');
  });
});

describe('market split (PRICING.md 8.1)', () => {
  it('maps every country to its market', () => {
    const cases: Array<[string | null, string]> = [
      [null, 'IN'], ['', 'IN'], ['IN', 'IN'], ['India', 'IN'],
      ['GB', 'UK'], ['UK', 'UK'], ['United Kingdom', 'UK'],
      ['DE', 'EU'], ['FR', 'EU'], ['IE', 'EU'], ['NL', 'EU'], ['SE', 'EU'], ['NO', 'EU'], ['IS', 'EU'], ['LI', 'EU'], ['CH', 'EU'],
      ['AU', 'ANZ'], ['NZ', 'ANZ'], ['Australia', 'ANZ'],
      ['US', 'WEST'], ['CA', 'WEST'], ['BR', 'WEST'], ['ZA', 'WEST'],
      ['AE', 'GULF'], ['SA', 'GULF'], ['QA', 'GULF'], ['OM', 'GULF'], ['KW', 'GULF'], ['BH', 'GULF'],
      ['SG', 'SG'], ['MY', 'MY_TH'], ['TH', 'MY_TH'], ['LK', 'LK_NP_BD'], ['NP', 'LK_NP_BD'], ['BD', 'LK_NP_BD'], ['BT', 'LK_NP_BD'], ['MV', 'LK_NP_BD'],
    ];
    for (const [country, market] of cases) expect(marketForCountry(country), String(country)).toBe(market);
  });

  it('GB is no longer priced in USD: its market has GBP prices for all three plans', () => {
    for (const plan of ['basic', 'pro', 'enterprise']) {
      expect(activePriceFrom(catalogue, plan, marketForCountry('GB'))?.currency).toBe('GBP');
      expect(activePriceFrom(catalogue, plan, marketForCountry('DE'))?.currency).toBe('EUR');
      expect(activePriceFrom(catalogue, plan, marketForCountry('NZ'))?.currency).toBe('AUD');
    }
  });
});

describe('quotes per market and currency, founder window and the 24-month lock (PRICING.md 2.2, 6)', () => {
  const tenant = (id: string, country: string, plan = 'trial', status = 'trial'): TenantRow => ({
    id, company_name: `R129 ${id}`, owner_email: `${id}@r129.test`, owner_name: 'Owner', country, settings: null, plan, status,
  });
  const T_LOCK = '0196a129-0000-7000-8000-000000000001';
  const T_LATE = '0196a129-0000-7000-8000-000000000002';
  const T_ABANDON = '0196a129-0000-7000-8000-000000000003';
  const SUB = (t: string) => `sub-${t.slice(-4)}`;

  async function seedTenant(id: string, country: string, subStatus: 'trial' | 'active', plan = 'trial') {
    await master('DELETE FROM subscriptions WHERE tenant_id = ?', id).run();
    await master('DELETE FROM tenants WHERE id = ?', id).run();
    await master(`INSERT INTO tenants (id, company_name, subdomain, plan, status, country, owner_email, max_users) VALUES (?, ?, ?, ?, 'active', ?, ?, 3)`, id, `R129 ${id}`, `r129-${id.slice(-4)}`, plan, country, `${id}@r129.test`).run();
    await master(
      `INSERT INTO subscriptions (id, tenant_id, plan, amount, billing_cycle, start_date, next_billing_date, status) VALUES (?, ?, ?, 0, 'yearly', '2026-11-01T00:00:00Z', '2027-11-01T00:00:00Z', ?)`,
      SUB(id), id, plan, subStatus,
    ).run();
  }

  afterAll(async () => {
    for (const id of [T_LOCK, T_LATE, T_ABANDON]) {
      await master('DELETE FROM subscriptions WHERE tenant_id = ?', id).run();
      await master('DELETE FROM tenants WHERE id = ?', id).run();
    }
  });

  it('every price row of the document is quoted in its market currency, founder inside the window and list after it', async () => {
    for (const d of docPrices) {
      const at = new Date(d.valid_from === FOUNDER_FROM ? '2026-12-15T10:00:00Z' : '2027-05-15T10:00:00Z');
      const q = await buildQuote(testEnv, tenant('r129-q', MARKET_COUNTRY[d.market]), d.plan_key, 2, at);
      expect(q.market, `${d.market} ${d.plan_key}`).toBe(d.market);
      expect(q.currency).toBe(d.currency);
      expect(q.subtotal).toBe(Number(d.yearly_price) + 2 * Number(d.extra_user_yearly_price));
      expect(q.includedUsers).toBe(Number(d.included_users));
      expect(q.priceKind).toBe(d.valid_from === FOUNDER_FROM ? 'founder' : 'list');
      expect(q.lockedUntil !== null).toBe(d.valid_from === FOUNDER_FROM);
    }
  });

  it('the window edges: founder until 2027-03-31 23:59:59 UTC, list from 2027-04-01 00:00:00 UTC', async () => {
    const t = tenant('r129-edge', 'GB');
    const founder = await buildQuote(testEnv, t, 'basic', 0, new Date('2027-03-31T23:59:59Z'));
    expect(founder).toMatchObject({ subtotal: 359, priceKind: 'founder', currency: 'GBP' });
    const list = await buildQuote(testEnv, t, 'basic', 0, new Date('2027-04-01T00:00:00Z'));
    expect(list).toMatchObject({ subtotal: 449, priceKind: 'list', lockedUntil: null });
    const opening = await buildQuote(testEnv, t, 'basic', 0, new Date('2026-11-01T00:00:00Z'));
    expect(opening).toMatchObject({ subtotal: 359, priceKind: 'founder' });
  });

  it('an agency that signs inside the window keeps the founder price for 24 months, on any plan; others pay list', async () => {
    await seedTenant(T_LOCK, 'GB', 'trial');
    const signed = new Date('2026-12-01T09:00:00Z');
    const q = await buildQuote(testEnv, tenant(T_LOCK, 'GB'), 'pro', 0, signed);
    expect(q).toMatchObject({ subtotal: 719, priceKind: 'founder', lockedUntil: '2028-12-01T09:00:00.000Z' });
    await saveQuote(testEnv, SUB(T_LOCK), q, signed);
    let sub = await master('SELECT price_locked_from AS f, price_locked_until AS u FROM subscriptions WHERE id = ?', SUB(T_LOCK)).first<any>();
    expect(sub).toEqual({ f: '2026-12-01T09:00:00.000Z', u: '2028-12-01T09:00:00.000Z' });

    // Not paid yet (still a trial): a late return after the window is a list price and clears the stale lock.
    const late = new Date('2027-05-01T00:00:00Z');
    const lateQuote = await buildQuote(testEnv, tenant(T_LOCK, 'GB'), 'pro', 0, late);
    expect(lateQuote).toMatchObject({ subtotal: 899, priceKind: 'list' });
    await saveQuote(testEnv, SUB(T_LOCK), lateQuote, late);
    sub = await master('SELECT price_locked_from AS f, price_locked_until AS u FROM subscriptions WHERE id = ?', SUB(T_LOCK)).first<any>();
    expect(sub).toEqual({ f: null, u: null });

    // Sign again inside the window and pay: the subscription is active, the lock holds.
    await saveQuote(testEnv, SUB(T_LOCK), q, signed);
    await master(`UPDATE subscriptions SET status = 'active' WHERE id = ?`, SUB(T_LOCK)).run();
    const inLock = new Date('2027-09-01T00:00:00Z');
    expect(await buildQuote(testEnv, tenant(T_LOCK, 'GB', 'pro', 'active'), 'pro', 0, inLock)).toMatchObject({ subtotal: 719, priceKind: 'founder', lockedUntil: '2028-12-01T09:00:00.000Z' });
    // An upgrade and extra seats inside the lock use the founder prices of the new plan.
    expect(await buildQuote(testEnv, tenant(T_LOCK, 'GB', 'pro', 'active'), 'enterprise', 3, inLock)).toMatchObject({ subtotal: 1439 + 3 * 120, priceKind: 'founder' });
    // Another re-quote does not extend the lock.
    await saveQuote(testEnv, SUB(T_LOCK), await buildQuote(testEnv, tenant(T_LOCK, 'GB', 'pro', 'active'), 'pro', 0, inLock), inLock);
    sub = await master('SELECT price_locked_until AS u FROM subscriptions WHERE id = ?', SUB(T_LOCK)).first<any>();
    expect(sub.u).toBe('2028-12-01T09:00:00.000Z');
    // After the 24 months the list price applies.
    expect(await buildQuote(testEnv, tenant(T_LOCK, 'GB', 'pro', 'active'), 'pro', 0, new Date('2028-12-02T00:00:00Z'))).toMatchObject({ subtotal: 899, priceKind: 'list', lockedUntil: null });

    // An agency that signs after the window never had a lock.
    await seedTenant(T_LATE, 'GB', 'active', 'pro');
    expect(await buildQuote(testEnv, tenant(T_LATE, 'GB', 'pro', 'active'), 'pro', 0, inLock)).toMatchObject({ subtotal: 899, priceKind: 'list' });
  });

  it('a lock left by an abandoned checkout is not honoured by an agency that never paid', async () => {
    await seedTenant(T_ABANDON, 'IN', 'trial');
    await master(`UPDATE subscriptions SET price_locked_from = '2027-03-30T00:00:00.000Z', price_locked_until = '2029-03-30T00:00:00.000Z' WHERE id = ?`, SUB(T_ABANDON)).run();
    const q = await buildQuote(testEnv, tenant(T_ABANDON, 'IN'), 'basic', 0, new Date('2027-06-01T00:00:00Z'));
    expect(q).toMatchObject({ subtotal: 14999, priceKind: 'list', currency: 'INR' });
  });
});

describe('pack offers are filtered by market (PRICING.md 8.3)', () => {
  const now = new Date('2026-12-01T00:00:00Z');

  it('lists only the packs of the market, in its currency', () => {
    expect(packOffers(catalogue, 'sms', 'UK', now).map((p) => [p.key, p.currency])).toEqual([['sms_500_uk', 'GBP']]);
    expect(packOffers(catalogue, 'sms', 'IN', now).map((p) => [p.key, p.currency])).toEqual([['sms_100', 'INR']]);
    expect(packOffers(catalogue, 'sms', 'EU', now).map((p) => p.key)).toEqual(['sms_250_eu']);
    expect(packOffers(catalogue, 'sms', 'ANZ', now).map((p) => p.currency)).toEqual(['AUD']);
    expect(packOffers(catalogue, 'sms', 'LK_NP_BD', now)).toEqual([]); // no SMS packs there
    expect(packOffers(catalogue, 'call_minutes', 'IN', now)).toEqual([]); // no calling in India
    expect(packOffers(catalogue, 'call_minutes', 'UK', now).map((p) => p.key)).toEqual(['call_minutes_500_uk']);
    expect(packOffers(catalogue, 'ai_credits', 'GULF', now).map((p) => [p.key, p.units, p.price])).toEqual([['ai_credits_10000_gulf', 10000, 9], ['ai_credits_50000_gulf', 50000, 35]]);
    for (const market of Object.keys(MARKET_CURRENCY)) {
      for (const key of ['ai_credits', 'sms', 'whatsapp', 'otp', 'call_minutes', 'email']) {
        for (const offer of packOffers(catalogue, key, market, now)) {
          expect(offer.currency, `${market} ${offer.key}`).toBe(MARKET_CURRENCY[market]);
          expect(catalogue.addons.find((a) => a.key === offer.key)!.market).toBe(market);
        }
      }
    }
  });

  it('step B marketing packs are offered for their own allowance only; retired packs never', () => {
    expect(packOffers(catalogue, 'whatsapp_marketing', 'IN', now).map((p) => p.key)).toEqual(['whatsapp_marketing_1000_in']);
    expect(packOffers(catalogue, 'whatsapp', 'IN', now).map((p) => p.key)).toEqual(['whatsapp_1000']);
    expect(packOffers(catalogue, 'ai_credits', 'IN', now).map((p) => p.key)).toEqual(['ai_credits_10000_in', 'ai_credits_50000_in']);
    expect(packOffers(catalogue, 'email', 'IN', now).map((p) => p.key)).toEqual(['email_5000_in']);
  });

  it('the 402 body of a UK agency offers its GBP pack and nothing from India', async () => {
    const id = '0196a129-0000-7000-8000-0000000000a1';
    await master('DELETE FROM tenants WHERE id = ?', id).run();
    await master(`INSERT INTO tenants (id, company_name, subdomain, plan, status, country, max_users) VALUES (?, 'R129 UK', 'r129-uk', 'basic', 'active', 'GB', 3)`, id).run();
    try {
      const body = await buildExhaustedBody(testEnv, id, CHANNEL_SPECS.sms, 0, 0);
      expect(body.addons.map((a) => [a.key, a.currency])).toEqual([['sms_500_uk', 'GBP']]);
      expect(body.options).toEqual(['upgrade', 'top_up']);
      await master(`UPDATE tenants SET country = 'IN' WHERE id = ?`, id).run();
      const india = await buildExhaustedBody(testEnv, id, CHANNEL_SPECS.sms, 0, 0);
      expect(india.addons.map((a) => [a.key, a.currency])).toEqual([['sms_100', 'INR']]);
    } finally {
      await master('DELETE FROM tenants WHERE id = ?', id).run();
    }
  });
});

describe('margin floor (PRICING.md 8.7)', () => {
  const now = new Date('2026-12-01T00:00:00Z');

  it('the code floor is 25 and the add-on module exports the same number', () => {
    expect(MIN_COMM_MARGIN_PCT).toBe(25);
    expect(ADDONS_MIN_MARGIN).toBe(25);
  });

  it('every active communication pack nets at least cost x 1.218 after gateway fees (2.36% India, 6.3% elsewhere)', () => {
    const packs = catalogue.addons.filter((a) => a.isActive && a.kind === 'comm_pack');
    expect(packs.length).toBeGreaterThan(30);
    for (const pack of packs) {
      const cost = activeUnitCost(catalogue, pack.channel!, pack.market, now)!;
      expect(cost, `unit cost for ${pack.key}`).toBeTruthy();
      const sale = packSalePriceFrom(catalogue, pack, now)!;
      expect(sale.currency).toBe(cost.currency);
      const fee = pack.market === 'IN' ? 0.0236 : 0.063;
      const net = sale.price * (1 - fee);
      expect(net / (pack.units * cost.unitCost), pack.key).toBeGreaterThanOrEqual(1.218);
    }
  });

  it('the document prices are reproduced: UK 500 SMS 28.16, India 100 SMS 1,018.21, WEST 1,000 call minutes 26.65', () => {
    const price = (key: string) => packSalePriceFrom(catalogue, catalogue.addons.find((a) => a.key === key)!, now)!.price;
    expect(price('sms_500_uk')).toBe(28.16);
    expect(price('sms_100')).toBe(1018.21);
    expect(price('call_minutes_1000_west')).toBe(26.65);
    expect(price('whatsapp_2000_west')).toBe(8.84); // step B: 2,000 at the utility rate (step A was 65, the marketing rate)
    expect(price('whatsapp_marketing_500_west')).toBe(16.25);
    expect(price('phone_number_uk')).toBe(3.52);
  });

  it('a lowered margin or fixed price is lifted to cost x 1.25', () => {
    const lowered: Catalogue = {
      ...catalogue,
      unitCosts: catalogue.unitCosts.map((u) => (u.id === '01a157e5-2f39-748a-b07e-98add8e4dc4a' ? { ...u, marginPct: 2 } : u)),
      addons: catalogue.addons.map((a) => (a.key === 'sms_100' ? { ...a, fixedPrice: 50 } : a)),
    };
    const sms = lowered.addons.find((a) => a.key === 'sms_100')!;
    expect(packSalePriceFrom(lowered, sms, now)!.price).toBe(1018.21);
  });
});

describe('pack validity: the month of purchase and the next (PRICING.md 8.5)', () => {
  const T = '0196a129-0000-7000-8000-0000000000b1';
  const grant = (id: string, period: string, units: number, source = 'purchase') =>
    master(
      `INSERT INTO tenant_addons (id, tenant_id, product_key, quantity, units_granted, period_key, source, reference) VALUES (?, ?, 'sms_100', 1, ?, ?, ?, ?)`,
      id, T, units, period, source, source === 'purchase' ? id : null,
    ).run();
  const history = (period: string, used: number) =>
    master(`INSERT OR REPLACE INTO usage_period_history (tenant_id, cap_key, period_key, used, cap_value) VALUES (?, 'sms_per_month', ?, ?, 0)`, T, period, used).run();

  beforeAll(async () => {
    await master('DELETE FROM tenants WHERE id = ?', T).run();
    // A Pro agency: its own SMS allowance is 20 a month.
    await master(`INSERT INTO tenants (id, company_name, subdomain, plan, status, country, max_users) VALUES (?, 'R129 Packs', 'r129-packs', 'pro', 'active', 'IN', 10)`, T).run();
  });
  afterAll(async () => {
    await master('DELETE FROM tenant_addons WHERE tenant_id = ?', T).run();
    await master('DELETE FROM usage_period_history WHERE tenant_id = ?', T).run();
    await master('DELETE FROM tenant_usage_caps WHERE tenant_id = ?', T).run();
    await master('DELETE FROM tenants WHERE id = ?', T).run();
  });

  it('previousPeriodKey steps back one month across a year end', () => {
    expect(previousPeriodKey('2026-12')).toBe('2026-11');
    expect(previousPeriodKey('2027-01')).toBe('2026-12');
  });

  it('a pack bought in a month is whole in the next month when nothing was used, and gone the month after', async () => {
    await grant('r129-p1', '2026-08', 100);
    expect(await getAllowance(testEnv, T, 'sms', '2026-08')).toBe(120); // 20 plan + 100 pack
    expect(await getAllowance(testEnv, T, 'sms', '2026-09')).toBe(120); // the pack lives on
    expect(await getAllowance(testEnv, T, 'sms', '2026-10')).toBe(20); // but only one more month
    expect(await getAllowance(testEnv, T, 'sms', '2026-07')).toBe(20); // never before it was bought
  });

  it('only what was not used carries over: the plan amount is used first, then the pack', async () => {
    await history('2026-08', 15); // inside the plan amount of 20: the pack is untouched
    expect(await getAllowance(testEnv, T, 'sms', '2026-09')).toBe(120);
    await history('2026-08', 70); // 20 plan + 50 of the pack used
    expect(await getAllowance(testEnv, T, 'sms', '2026-09')).toBe(70); // 20 + 50 left
    await history('2026-08', 120); // all used
    expect(await getAllowance(testEnv, T, 'sms', '2026-09')).toBe(20);
    await history('2026-08', 500); // usage can pass the allowance (a finished call); nothing negative
    expect(await getAllowance(testEnv, T, 'sms', '2026-09')).toBe(20);
  });

  it('packs a super admin granted stay month-only', async () => {
    await grant('r129-g1', '2026-05', 100, 'super_admin_grant');
    expect(await getAllowance(testEnv, T, 'sms', '2026-05')).toBe(120);
    expect(await getAllowance(testEnv, T, 'sms', '2026-06')).toBe(20);
  });

  it('the usage counter moving to a new month writes the old month to usage_period_history', async () => {
    await master(`DELETE FROM tenant_usage_caps WHERE tenant_id = ?`, T).run();
    await master(
      `INSERT INTO tenant_usage_caps (id, tenant_id, cap_key, cap_value, current_usage, reset_period, last_reset_at, period_key) VALUES ('r129-cap', ?, 'sms_per_month', 120, 40, 'monthly', '2026-11-30T00:00:00Z', '2026-11')`,
      T,
    ).run();
    await grant('r129-p2', '2026-11', 100);
    // Before the reset the live counter of the month before is read: 20 plan + 100 pack - 40 used = 80 of the pack left.
    expect(await getAllowance(testEnv, T, 'sms', '2026-12')).toBe(20 + 80);
    // The counter moves to December (what meterUsage / the daily reset do): the trigger keeps November.
    await master(`UPDATE tenant_usage_caps SET current_usage = 0, period_key = '2026-12' WHERE tenant_id = ? AND cap_key = 'sms_per_month'`, T).run();
    expect(await master(`SELECT used FROM usage_period_history WHERE tenant_id = ? AND cap_key = 'sms_per_month' AND period_key = '2026-11'`, T).first()).toEqual({ used: 40 });
    expect(await getAllowance(testEnv, T, 'sms', '2026-12')).toBe(20 + 80);
    // A counter set to the same month, or first stamped, writes nothing.
    await master(`UPDATE tenant_usage_caps SET current_usage = 5 WHERE tenant_id = ? AND cap_key = 'sms_per_month'`, T).run();
    expect((await all('SELECT period_key FROM usage_period_history WHERE tenant_id = ? AND cap_key = ?', T, 'sms_per_month')).map((r: any) => r.period_key).sort()).toEqual(['2026-08', '2026-11']);
  });
});
