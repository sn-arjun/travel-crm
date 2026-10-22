/** Structured data shared across pages. No aggregateRating: there are no public reviews yet. */
import { MARKETS, PLAN_META } from './markets';
import { FAQS } from './content';

export const ORG_LD = (site: URL) => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'TravelCRM Pro',
  url: site.href,
  logo: new URL('/favicon.svg', site).href,
});

export const SOFTWARE_LD = (site: URL, keys = MARKETS.map((m) => m.key)) => ({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'TravelCRM Pro',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Windows, macOS, Android',
  description: 'CRM for travel agencies and tour operators: one inbox for WhatsApp, email and calls, quotes from your rate cards, tax invoices, vouchers, group departures and a driver app.',
  url: site.href,
  offers: MARKETS.filter((m) => keys.includes(m.key)).flatMap((m) => m.plans.map(([founder], i) => ({
    '@type': 'Offer',
    name: `${PLAN_META[i].name} (${m.name})`,
    price: founder,
    priceCurrency: m.currency,
    priceSpecification: { '@type': 'UnitPriceSpecification', price: founder, priceCurrency: m.currency, unitText: 'per agency per year', valueAddedTaxIncluded: false },
    eligibleRegion: m.name,
    url: new URL(m.path + '#pricing', site).href,
  }))),
});

export const FAQ_LD = (items = FAQS) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
});

export const CRUMBS_LD = (site: URL, trail: [string, string][]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: trail.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: new URL(path, site).href })),
});

/** hreflang alternates shared by the home page and the region pages. */
export const MARKET_ALTERNATES: Record<string, string> = Object.assign(
  { 'x-default': '/' },
  ...MARKETS.map((m) => Object.fromEntries(m.hreflang.map((h) => [h, m.path]))),
);
