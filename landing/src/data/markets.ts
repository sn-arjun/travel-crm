/**
 * The five markets the site sells in. Prices are the 2026-10 catalogue (backend/drizzle/master/0026, 0028;
 * docs/PRICING.md section 2): founder price for agencies that sign before 1 April 2027, locked 24 months, then the
 * list price. The page shows these at build time and refreshes them from GET /api/v1/public/plans when the API answers.
 * Payment methods per currency follow backend/src/services/payments/mock-agency.ts (methodsForCurrency).
 */
export type MarketKey = 'IN' | 'UK' | 'EU' | 'US' | 'AU';

export interface Market {
  key: MarketKey;
  /** Catalogue market code for /api/v1/public/plans?market= */
  catalogue: string;
  path: string;
  hreflang: string[];
  name: string;
  /** Short label for the region switch. */
  label: string;
  sym: string;
  currency: string;
  locale: string;
  tax: string;
  note: string;
  /** [founder price, list price, users included, extra user per year] for Basic, Pro, Enterprise. */
  plans: [number, number, number, number][];
  /** AI credit packs: [credits, price]. */
  aiPacks: [number, number][];
  board: { market: string; tax: string; pay: string; lang: string };
  invoice: Invoice;
  seo: { title: string; description: string; hero: string; heroLine: string };
}

export interface Invoice {
  title: string;
  no: string;
  date: string;
  agency: string;
  taxId: string;
  lines: [string, string][];
  totalLabel: string;
  total: string;
  pay: string;
  foot: string;
  stamp: string;
}

export const MARKETS: Market[] = [
  {
    key: 'IN', catalogue: 'IN', path: '/in/', hreflang: ['en-IN'], name: 'India', label: 'INDIA ₹', sym: '₹', currency: 'INR', locale: 'en-IN',
    tax: '+ GST', note: 'Prices in Indian rupees, excluding GST.',
    plans: [[11999, 14999, 5, 2400], [23999, 29999, 10, 2400], [59999, 74999, 25, 2400]],
    aiPacks: [[10000, 499], [50000, 1999]],
    board: { market: 'INDIA', tax: 'GST + HSN', pay: 'UPI · CARD', lang: 'EN · HI' },
    invoice: { title: 'Tax invoice', no: 'INV-0142', date: '14 Nov 2026', agency: 'Sunrise Holidays · Bengaluru', taxId: 'GSTIN 29XXXXX0000X1Z5',
      lines: [['Goa Family Escape · 5N · 4 pax', '₹80,476'], ['CGST 2.5%', '₹2,012'], ['SGST 2.5%', '₹2,012']], totalLabel: 'Total', total: '₹84,500',
      pay: 'Pay by UPI', foot: 'SAC 998552 · place of supply Karnataka', stamp: 'PAID ✓\n₹84,500\n14 NOV' },
    seo: { title: 'Travel agency CRM for India · GST invoices, WhatsApp, UPI', description: 'TravelCRM Pro for Indian travel agencies and tour operators: WhatsApp enquiries, quotes from your rate cards, GST invoices with HSN/SAC, UPI payments and vouchers. From ₹11,999 a year per agency.',
      hero: 'The travel agency CRM built for India.', heroLine: 'WhatsApp enquiries read and filed, quotes from your own rate cards, GST invoices with HSN/SAC and UPI payment links. One price per agency, five users included.' },
  },
  {
    key: 'UK', catalogue: 'UK', path: '/uk/', hreflang: ['en-GB'], name: 'United Kingdom', label: 'UK £', sym: '£', currency: 'GBP', locale: 'en-GB',
    tax: '+ VAT', note: 'Prices in pounds sterling, excluding VAT.',
    plans: [[359, 449, 3, 96], [719, 899, 5, 120], [1439, 1799, 10, 120]],
    aiPacks: [[10000, 7], [50000, 27]],
    board: { market: 'UK', tax: 'VAT · TOMS', pay: 'CARD · BANK', lang: 'EN' },
    invoice: { title: 'Invoice', no: 'INV-0142', date: '14 Nov 2026', agency: 'Harbour Travel Ltd · Bristol', taxId: 'VAT GB XXX XXXX XX',
      lines: [['Algarve Family Break · 5N · 4 pax', '£2,480'], ['VAT', 'Margin scheme']], totalLabel: 'Total', total: '£2,480',
      pay: 'Pay by card or bank', foot: "Tour Operators' Margin Scheme: VAT is not shown separately", stamp: 'PAID ✓\n£2,480\n14 NOV' },
    seo: { title: 'Travel agency CRM for the UK · VAT, TOMS invoices, WhatsApp', description: 'TravelCRM Pro for UK travel agencies and tour operators: one inbox for WhatsApp and email, quotes from your rate cards, VAT and TOMS margin-scheme invoices, card and bank payments. From £359 a year per agency.',
      hero: 'The travel CRM for UK agencies and tour operators.', heroLine: "Enquiries from WhatsApp, email and your website in one inbox, quotes from your own rates, and invoices under VAT or the Tour Operators' Margin Scheme." },
  },
  {
    key: 'EU', catalogue: 'EU', path: '/eu/', hreflang: ['en-NL', 'en-IE'], name: 'Europe', label: 'EUROPE €', sym: '€', currency: 'EUR', locale: 'en-IE',
    tax: '+ VAT', note: 'Prices in euros, excluding VAT.',
    plans: [[419, 529, 3, 110], [849, 1059, 5, 135], [1699, 2119, 10, 135]],
    aiPacks: [[10000, 8], [50000, 32]],
    board: { market: 'EUROPE', tax: 'VAT · MARGIN', pay: 'iDEAL · CARD · SEPA', lang: 'NL · EN' },
    invoice: { title: 'Factuur', no: 'Factuurnr. 2026-0142', date: '14-11-2026', agency: 'Reisbureau Zon · Utrecht', taxId: 'btw NLXXXXXXXXXB01',
      lines: [['Toscane gezinsreis · 7 nachten · 4 pers.', '€ 3.150'], ['Btw', 'Margeregeling']], totalLabel: 'Totaal', total: '€ 3.150',
      pay: 'Betaal met iDEAL', foot: 'Bijzondere regeling reisbureaus', stamp: 'BETAALD ✓\n€ 3.150\n14 NOV' },
    seo: { title: 'Travel agency CRM for Europe · VAT margin scheme, iDEAL, Dutch', description: 'TravelCRM Pro for European travel agencies and tour operators: margin-scheme invoices, iDEAL, card and SEPA payments, a full Dutch interface, group departures and coach trips. From €419 a year per agency.',
      hero: 'The travel CRM for European tour operators.', heroLine: 'Margin-scheme invoices, iDEAL and SEPA payments, a full Dutch interface, and group departures sold seat by seat.' },
  },
  {
    key: 'US', catalogue: 'WEST', path: '/us/', hreflang: ['en-US'], name: 'United States', label: 'US $', sym: '$', currency: 'USD', locale: 'en-US',
    tax: '+ tax where due', note: 'Prices in US dollars, excluding sales tax.',
    plans: [[470, 590, 3, 120], [950, 1190, 5, 150], [1910, 2390, 10, 150]],
    aiPacks: [[10000, 9], [50000, 35]],
    board: { market: 'US', tax: 'SALES TAX', pay: 'CARD', lang: 'EN' },
    invoice: { title: 'Invoice', no: 'INV-0142', date: 'Nov 14, 2026', agency: 'Trailhead Trips LLC · Denver', taxId: 'EIN XX-XXXXXXX',
      lines: [['Yellowstone Family Trip · 5N · 4 pax', '$4,200'], ['Sales tax (set per state)', '$0.00']], totalLabel: 'Total', total: '$4,200',
      pay: 'Pay by card', foot: 'Sales tax follows the rules you set for each state', stamp: 'PAID ✓\n$4,200\nNOV 14' },
    seo: { title: 'Travel agency CRM for the US · quotes, invoices, group tours', description: 'TravelCRM Pro for US travel agencies and tour operators: one inbox for WhatsApp, SMS and email, quotes from your rate cards, invoices with sales tax per state, card payments and group departures. From $470 a year per agency.',
      hero: 'The travel CRM for US agencies and tour operators.', heroLine: 'Every enquiry in one inbox, quotes from your own rates, invoices with the sales tax you set per state, and group tours sold seat by seat.' },
  },
  {
    key: 'AU', catalogue: 'ANZ', path: '/au/', hreflang: ['en-AU'], name: 'Australia', label: 'AUS A$', sym: 'A$', currency: 'AUD', locale: 'en-AU',
    tax: '+ GST', note: 'Prices in Australian dollars, excluding GST.',
    plans: [[679, 849, 3, 170], [1359, 1699, 5, 215], [2719, 3399, 10, 215]],
    aiPacks: [[10000, 13], [50000, 49]],
    board: { market: 'AUSTRALIA', tax: 'GST', pay: 'CARD', lang: 'EN' },
    invoice: { title: 'Tax invoice', no: 'INV-0142', date: '14/11/2026', agency: 'Coral Coast Tours · Cairns', taxId: 'ABN XX XXX XXX XXX',
      lines: [['Great Barrier Reef Family · 5N · 4 pax', 'A$5,280'], ['GST 10% included', 'A$480']], totalLabel: 'Total incl. GST', total: 'A$5,280',
      pay: 'Pay by card', foot: 'Total includes GST', stamp: 'PAID ✓\nA$5,280\n14 NOV' },
    seo: { title: 'Travel agency CRM for Australia · GST tax invoices, tours', description: 'TravelCRM Pro for Australian travel agencies and tour operators: one inbox for every enquiry, quotes from your rate cards, GST tax invoices, card payments, coach tours and group departures. From A$679 a year per agency.',
      hero: 'The travel CRM for Australian agencies and tour operators.', heroLine: 'Every enquiry in one inbox, quotes from your own rates, GST tax invoices, and coach tours with passenger check-in.' },
  },
];

export const MARKET = Object.fromEntries(MARKETS.map((m) => [m.key, m])) as Record<MarketKey, Market>;

export const PLAN_META = [
  { name: 'Basic', cls: 'ECONOMY', gate: 'B1', ai: 3000, wa: 300, mail: 1000, web: 1, bestFor: 'retail agencies getting organised', extra: 'Everything to sell, quote, invoice and run trips' },
  { name: 'Pro', cls: 'BUSINESS', gate: 'P2', ai: 15000, wa: 950, mail: 5000, web: 1, bestFor: 'growing agencies and tour operators', extra: 'Adds group departures, online booking, campaigns and AI', popular: true },
  { name: 'Enterprise', cls: 'FIRST', gate: 'E3', ai: 30000, wa: 2500, mail: 10000, web: 2, bestFor: 'DMCs, B2B sellers and multi-brand groups', extra: 'Adds the B2B portal, chatbot, API, white label and priority support' },
] as const;

export const money = (m: Market, n: number) => m.sym + n.toLocaleString(m.locale);
export const num = (n: number) => n.toLocaleString('en-GB');
