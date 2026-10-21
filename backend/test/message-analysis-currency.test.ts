import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { analyzeWithRules, dateOrderOf, findChildAges, parseTravelDate } from '../src/services/automation/message-analysis';

// R140-B5: the rule reader understands euro, pound, dollar, dirham and rupee amounts and children's ages.
// Pure rules, no AI call.

const base = { channel: 'whatsapp', knownDestinations: ['Paris', 'Dubai'], today: '2026-10-08' };
const read = (text: string, currency?: string, locale?: string) => analyzeWithRules({ ...base, text, currency, locale }).entities;

describe('R140-B5 money in the rule reader', () => {
  const rows: Array<{ agency: string; text: string; expect: { budget?: number; paymentAmount?: number; currency?: string } }> = [
    // euro
    { agency: 'EUR', text: 'I have transferred €400', expect: { paymentAmount: 400, currency: 'EUR' } },
    { agency: 'EUR', text: 'paid EUR 400 this morning', expect: { paymentAmount: 400, currency: 'EUR' } },
    { agency: 'EUR', text: 'We paid 400 euro yesterday', expect: { paymentAmount: 400, currency: 'EUR' } },
    { agency: 'EUR', text: 'Paris for a week, budget EUR 1,800', expect: { budget: 1800, currency: 'EUR' } },
    { agency: 'EUR', text: 'Paris for a week, budget is around 1.800 euro', expect: { budget: 1800, currency: 'EUR' } },
    { agency: 'EUR', text: 'budget €1.800,50', expect: { budget: 1800.5, currency: 'EUR' } },
    { agency: 'EUR', text: 'our budget is 1 800 EUR', expect: { budget: 1800, currency: 'EUR' } },
    { agency: 'EUR', text: 'budget 2k euros', expect: { budget: 2000, currency: 'EUR' } },
    { agency: 'EUR', text: 'budget 1800', expect: { budget: 1800 } },
    { agency: 'EUR', text: 'transferred €400,50 just now', expect: { paymentAmount: 400.5, currency: 'EUR' } },
    { agency: 'EUR', text: '€400 has been transferred', expect: { paymentAmount: 400, currency: 'EUR' } },
    // pound
    { agency: 'GBP', text: 'I paid a £250 deposit', expect: { paymentAmount: 250, currency: 'GBP' } },
    { agency: 'GBP', text: 'sent 250 pounds', expect: { paymentAmount: 250, currency: 'GBP' } },
    { agency: 'GBP', text: 'budget is GBP 3,200 for the two of us', expect: { budget: 3200, currency: 'GBP' } },
    { agency: 'GBP', text: 'budget £3,200', expect: { budget: 3200, currency: 'GBP' } },
    // dollar
    { agency: 'USD', text: 'paid $500 by card', expect: { paymentAmount: 500, currency: 'USD' } },
    { agency: 'USD', text: 'budget USD 4,500', expect: { budget: 4500, currency: 'USD' } },
    { agency: 'USD', text: 'budget 4500 dollars', expect: { budget: 4500, currency: 'USD' } },
    { agency: 'AUD', text: 'budget $4,500', expect: { budget: 4500, currency: 'AUD' } },
    // dirham
    { agency: 'AED', text: 'budget AED 3,000', expect: { budget: 3000, currency: 'AED' } },
    { agency: 'AED', text: 'transferred 3000 dirhams', expect: { paymentAmount: 3000, currency: 'AED' } },
    { agency: 'AED', text: 'budget is 3,000 AED', expect: { budget: 3000, currency: 'AED' } },
    // rupee
    { agency: 'INR', text: 'budget 2 lakh', expect: { budget: 200000 } },
    { agency: 'INR', text: 'budget Rs 2,50,000', expect: { budget: 250000, currency: 'INR' } },
    { agency: 'INR', text: 'budget ₹1.5 lakhs', expect: { budget: 150000, currency: 'INR' } },
    { agency: 'INR', text: 'paid 60000 advance', expect: { paymentAmount: 60000 } },
    { agency: 'INR', text: 'budget INR 80k', expect: { budget: 80000, currency: 'INR' } },
    // a rupee amount sent to a euro agency is kept with its currency
    { agency: 'EUR', text: 'budget Rs 2,50,000', expect: { budget: 250000, currency: 'INR' } },
    { agency: 'EUR', text: 'paid £250 deposit', expect: { paymentAmount: 250, currency: 'GBP' } },
  ];

  for (const row of rows) {
    it(`${row.agency} agency reads "${row.text}"`, () => {
      const e = read(row.text, row.agency);
      expect(e.budget).toBe(row.expect.budget);
      expect(e.paymentAmount).toBe(row.expect.paymentAmount);
      expect(e.currency).toBe(row.expect.currency);
    });
  }

  it('reads lakh only for rupees (or no currency at a rupee agency)', () => {
    expect(read('budget 2 lakh', 'EUR').budget).toBeUndefined();
    expect(read('budget 2 lakh', 'GBP').budget).toBeUndefined();
    expect(read('budget EUR 2 lakh', 'INR').budget).toBeUndefined();
    expect(read('budget 2 lakh', 'INR').budget).toBe(200000);
    expect(read('budget 1.25 crore', 'INR').budget).toBe(12500000);
    // an agency that is not known keeps the earlier behaviour
    expect(read('budget 2 lakh').budget).toBe(200000);
  });

  it('does not read a number that is not money', () => {
    const e = read('4 adults, 5 nights from 18 Dec in Paris', 'EUR');
    expect(e.budget).toBeUndefined();
    expect(e.paymentAmount).toBeUndefined();
    expect(e.currency).toBeUndefined();
    // "tours" ends in rs: not a currency
    expect(read('tours 500 people', 'EUR').budget).toBeUndefined();
  });

  it('a euro payment makes the message a payment', () => {
    const a = analyzeWithRules({ ...base, text: 'I have transferred €400', currency: 'EUR' });
    expect(a.intent).toBe('payment');
    expect(a.entities.paymentAmount).toBe(400);
    expect(analyzeWithRules({ ...base, text: 'paid EUR 400', currency: 'EUR' }).entities.paymentAmount).toBe(400);
  });

  it('a payment wins over a budget in the same message', () => {
    const e = read('We paid £250 deposit, budget is £3,000 in total', 'GBP');
    expect(e.paymentAmount).toBe(250);
    expect(e.budget).toBeUndefined();
  });
});

describe("R140-B5 children's ages", () => {
  const rows: Array<[string, number[], number | undefined]> = [
    ['Family of four, kids aged 8 and 5', [8, 5], 2],
    ['2 adults, children 8, 5', [8, 5], 2],
    ['We are 2 adults and 2 kids (8 and 5)', [8, 5], 2],
    ['my son is 8 and daughter 5', [8, 5], 2],
    ['two adults, an 8 year old boy and a 5-year-old daughter', [8, 5], 2],
    ['kids aged 3, 7 and 11', [3, 7, 11], 3],
    ['children are aged 12 years', [12], 1],
  ];
  for (const [text, ages, count] of rows) {
    it(`reads "${text}"`, () => {
      const e = read(text, 'EUR');
      expect(e.childAges).toEqual(ages);
      expect(e.paxChildren).toBe(count);
    });
  }

  it('keeps the child count consistent with the ages', () => {
    expect(read('2 adults, 3 kids aged 8 and 5', 'EUR')).toMatchObject({ paxChildren: 3, childAges: [8, 5] });
    expect(read('2 adults, 1 kid aged 8 and 5', 'EUR')).toMatchObject({ paxChildren: 2, childAges: [8, 5] });
    expect(read('Family of four, kids aged 8 and 5', 'EUR')).toMatchObject({ paxAdults: 2, paxChildren: 2 });
  });

  it('does not take nights, adults or dates for ages', () => {
    expect(findChildAges('2 children 5 nights in paris')).toEqual([]);
    expect(findChildAges('kids 4 adults 2')).toEqual([]);
    expect(findChildAges('2 kids from 18 dec')).toEqual([]);
    expect(read('2 adults, 2 kids, 5 nights', 'EUR').childAges).toBeUndefined();
  });

  it('keeps ages in the special requirements text', () => {
    expect(read('2 adults, kids aged 8 and 5', 'EUR').specialRequirements).toContain('Kids aged 8 and 5');
  });
});

describe('R140-B5 date order follows the agency locale', () => {
  it('day-first for en-GB, nl-NL and en-IN; month-first for en-US', () => {
    expect(dateOrderOf('en-GB')).toBe('dmy');
    expect(dateOrderOf('nl-NL')).toBe('dmy');
    expect(dateOrderOf('en-IN')).toBe('dmy');
    expect(dateOrderOf('en-US')).toBe('mdy');
    expect(dateOrderOf(undefined)).toBe('dmy');
    expect(dateOrderOf('not a locale')).toBe('dmy');
  });

  it('reads 12/11 by the agency order', () => {
    expect(parseTravelDate('arriving 12/11', '2026-10-08', 'dmy')).toBe('2026-11-12');
    expect(parseTravelDate('arriving 12/11', '2026-10-08', 'mdy')).toBe('2026-12-11');
    expect(analyzeWithRules({ ...base, text: 'Trip to Paris on 12/11', locale: 'en-US' }).entities.travelDate).toBe('2026-12-11');
    expect(analyzeWithRules({ ...base, text: 'Trip to Paris on 12/11', locale: 'nl-NL' }).entities.travelDate).toBe('2026-11-12');
  });
});

// ── The inbox recipe: a payment in another currency is offered with a warning ───────────────

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';

async function call(method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

describe('R140-B5 euro agency: payments in the message', () => {
  let admin = '';
  let contactId = '';
  let invoiceId = '';

  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    for (const [k, v] of [['currency', 'EUR'], ['locale', 'nl-NL'], ['country', 'NL'], ['tax_system', 'none']]) {
      await testEnv.MASTER_DB.prepare('DELETE FROM settings WHERE key = ?').bind(k).run();
      await testEnv.MASTER_DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').bind(k, v, new Date().toISOString()).run();
    }
    const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    admin = ((await login.json()) as any).data.accessToken;
    const contact = await call('POST', '/contacts', admin, { name: 'Sanne de Vries', phone: '+31612345678', type: 'customer' });
    contactId = ((await contact.json()) as any).data.id;
    const invoice = await call('POST', '/invoices', admin, { contactId, items: [{ description: 'Trip', quantity: 1, rate: 1800 }] });
    expect(invoice.status).toBe(201);
    invoiceId = ((await invoice.json()) as any).data.id;
  });

  async function inbound(body: string) {
    const res = await call('POST', '/test/inbound', null, { tenantId: TENANT_ID, channel: 'whatsapp', from: '+31612345678', fromName: 'Sanne de Vries', body });
    expect(res.status).toBe(200);
    return ((await res.json()) as any).data.messageId as string;
  }

  async function suggestionFor(messageId: string): Promise<any> {
    const { results } = await testEnv.MASTER_DB.prepare(`SELECT * FROM assistant_suggestions WHERE source_id = ? AND action_type = 'record_payment'`).bind(messageId).all();
    return results[0];
  }

  it("'I have transferred €400' becomes a 400 payment suggestion", async () => {
    const id = await inbound('I have transferred €400');
    const row = await suggestionFor(id);
    expect(row).toBeTruthy();
    expect(JSON.parse(row.params)).toMatchObject({ invoiceId, amount: 400 });
    expect(row.reason).not.toMatch(/Warning/);
  });

  it("'paid EUR 400' produces a 400 payment suggestion too", async () => {
    const id = await inbound('Hi, paid EUR 400 just now');
    expect(JSON.parse((await suggestionFor(id)).params)).toMatchObject({ invoiceId, amount: 400 });
  });

  it("a payment written in pounds is suggested with a warning, not as a euro amount", async () => {
    const id = await inbound('I paid a £250 deposit');
    const row = await suggestionFor(id);
    expect(row).toBeTruthy();
    expect(row.title).toMatch(/Check before recording: GBP 250/);
    expect(row.reason).toMatch(/Customer mentions GBP 250; EUR is the currency here/);
    const stored = (await testEnv.MASTER_DB.prepare('SELECT entities FROM assistant_message_analysis WHERE message_id = ?').bind(id).first()) as any;
    expect(JSON.parse(stored.entities)).toMatchObject({ paymentAmount: 250, currency: 'GBP' });
  });
});
