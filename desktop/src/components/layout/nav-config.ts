import {
  LayoutDashboard,
  Users,
  Briefcase,
  FileText,
  Calendar,
  MessageSquare,
  Settings,
  Map as MapIcon,
  Receipt,
  BarChart3,
  Building2,
  HelpCircle,
  Bell,
  Truck,
  Phone,
  Megaphone,
  PackageSearch,
  CreditCard,
  CheckSquare,
  Stamp,
  Inbox,
  ClipboardList,
  Upload,
  Bookmark,
  Sparkles,
  UserCheck,
  Tag,
  Palette,
  CalendarClock,
  UserRound,
  Send,
  LayoutTemplate,
  MessageCircle,
  CalendarRange,
  Compass,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { tEn, type TranslateFn } from '@/lib/i18n';

export type NavBadgeKey =
  | 'unread_notifications'
  | 'pending_tasks'
  | 'overdue_followups'
  | 'overdue_invoices'
  | 'assistant_suggestions';

export interface NavItem {
  /** Catalogue key of the label (render with t(titleKey)). */
  titleKey: string;
  /** English label, for code that has no translator. */
  title: string;
  href: string;
  icon: LucideIcon;
  badgeKey?: NavBadgeKey;
}

export interface NavGroup {
  labelKey: string;
  label: string;
  items: NavItem[];
}

/** Entries of the group tours area: hidden unless the plan has group departures and the agency switched them on. */
export const GROUP_TOURS_HREFS: ReadonlySet<string> = new Set(['/departures', '/tours']);

function navItem(titleKey: string, href: string, icon: LucideIcon, badgeKey?: NavBadgeKey): NavItem {
  return { titleKey, title: tEn(titleKey), href, icon, ...(badgeKey ? { badgeKey } : {}) };
}

export const navigation: NavGroup[] = [
  {
    labelKey: 'nav.groups.overview',
    label: tEn('nav.groups.overview'),
    items: [
      navItem('nav.items.dashboard', '/dashboard', LayoutDashboard),
      navItem('nav.items.calendar', '/calendar', Calendar),
      navItem('nav.items.tasks', '/tasks', CheckSquare, 'pending_tasks'),
    ],
  },
  {
    labelKey: 'nav.groups.crm',
    label: tEn('nav.groups.crm'),
    items: [
      navItem('nav.items.leads', '/leads', Briefcase, 'overdue_followups'),
      navItem('nav.items.contacts', '/contacts', Users),
    ],
  },
  {
    labelKey: 'nav.groups.operations',
    label: tEn('nav.groups.operations'),
    items: [
      navItem('nav.items.fleet', '/fleet', Truck),
      navItem('nav.items.fleetRateCards', '/fleet/rate-cards', Tag),
      navItem('nav.items.itineraries', '/itineraries', MapIcon),
      navItem('nav.items.itineraryTemplates', '/itineraries/templates', Bookmark),
      // Group tours: shown only when the plan has group departures and the agency switched them on (the sidebar filters GROUP_TOURS_HREFS).
      navItem('nav.items.departures', '/departures', CalendarRange),
      navItem('nav.items.tours', '/tours', Compass),
      navItem('nav.items.rateCards', '/rate-cards', Tag),
      navItem('nav.items.suppliers', '/suppliers', PackageSearch),
      navItem('nav.items.accountsSuppliersView', '/accounts', Building2),
      navItem('nav.items.rateComparison', '/suppliers/compare', BarChart3),
      navItem('nav.items.visaTravellers', '/visa', Stamp),
      navItem('nav.items.travellers', '/travellers', UserRound),
      navItem('nav.items.vouchers', '/vouchers', ClipboardList),
    ],
  },
  {
    labelKey: 'nav.groups.revenue',
    label: tEn('nav.groups.revenue'),
    items: [
      navItem('nav.items.invoices', '/invoices', Receipt, 'overdue_invoices'),
      navItem('nav.items.payments', '/payments', CreditCard),
      navItem('nav.items.creditNotes', '/credit-notes', FileText),
      navItem('nav.items.debitNotes', '/debit-notes', FileText),
    ],
  },
  {
    labelKey: 'nav.groups.communication',
    label: tEn('nav.groups.communication'),
    items: [
      navItem('nav.items.inbox', '/communication', Inbox),
      navItem('nav.items.callLog', '/communication/calls', Phone),
      navItem('nav.items.templates', '/communication/templates', MessageSquare),
      navItem('nav.items.bulkSend', '/communication/bulk-send', Send),
    ],
  },
  {
    labelKey: 'nav.groups.intelligence',
    label: tEn('nav.groups.intelligence'),
    items: [
      navItem('nav.items.reports', '/reports', BarChart3),
      // One entry for everything the assistant does. Its suggestions appear on the records themselves;
      // the individual AI tools and the chatbot are reached from the Tools tab of this page.
      navItem('nav.items.assistant', '/assistant', Sparkles, 'assistant_suggestions'),
      navItem('nav.items.notifications', '/notifications', Bell, 'unread_notifications'),
      navItem('nav.items.documents', '/documents', FileText),
    ],
  },
  {
    labelKey: 'nav.groups.marketing',
    label: tEn('nav.groups.marketing'),
    items: [
      navItem('nav.items.marketingDashboard', '/marketing', LayoutDashboard),
      navItem('nav.items.campaigns', '/marketing/campaigns', Megaphone),
      navItem('nav.items.segments', '/marketing/segments', Users),
      navItem('nav.items.flyers', '/marketing/flyers', Palette),
      navItem('nav.items.flyerTemplates', '/marketing/flyers/templates', LayoutTemplate),
      navItem('nav.items.branding', '/marketing/branding', Palette),
      navItem('nav.items.festivalOffers', '/marketing/festivals', CalendarClock),
      navItem('nav.items.optedOut', '/marketing/opted-out', UserCheck),
      navItem('nav.items.socialContent', '/marketing/social', Megaphone),
      navItem('nav.items.whatsAppCampaigns', '/marketing/whatsapp', MessageCircle),
    ],
  },
  {
    labelKey: 'nav.groups.tools',
    label: tEn('nav.groups.tools'),
    items: [
      navItem('nav.items.followUps', '/follow-ups', CalendarClock),
      navItem('nav.items.importExport', '/import', Upload),
      navItem('nav.items.bookmarks', '/bookmarks', Bookmark),
    ],
  },
];

export const bottomNav: NavItem[] = [
  navItem('nav.items.helpCenter', '/help', HelpCircle),
  navItem('nav.items.settings', '/settings', Settings),
];

/** Every nav href, including the footer entries. */
const allNavItems: NavItem[] = [
  ...navigation.flatMap((group) => group.items),
  ...bottomNav,
];

/**
 * Routes that have no nav item of their own highlight the item that owns them.
 * Prefix match, same rules as the nav hrefs.
 */
const ACTIVE_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ['/campaigns', '/marketing/campaigns'],
  ['/reports', '/reports'],
  ['/onboarding', '/dashboard'],
  ['/contacts/import', '/contacts'],
  ['/contacts/merge', '/contacts'],
  ['/ai', '/assistant'],
  ['/chatbot', '/assistant'],
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function normalise(pathname: string | null | undefined): string {
  if (!pathname) return '/';
  const path = pathname.split(/[?#]/)[0] ?? '/';
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

/**
 * Returns the href of the single nav item that owns `pathname` (longest
 * prefix wins), or null when nothing matches.
 */
export function findActiveHref(pathname: string | null | undefined): string | null {
  const path = normalise(pathname);
  let best: string | null = null;

  for (const item of allNavItems) {
    if (matchesPrefix(path, item.href) && (best === null || item.href.length > best.length)) {
      best = item.href;
    }
  }

  // An alias only wins when it is more specific than the direct nav match.
  let aliasPrefix = '';
  let aliasTarget: string | null = null;
  for (const [prefix, target] of ACTIVE_ALIASES) {
    if (matchesPrefix(path, prefix) && prefix.length > aliasPrefix.length) {
      aliasPrefix = prefix;
      aliasTarget = target;
    }
  }
  if (aliasTarget && (best === null || aliasPrefix.length > best.length)) {
    return aliasTarget;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Page titles
// ---------------------------------------------------------------------------

/** Titles that differ from the nav label, or that have no nav item. */
/** Catalogue keys of the titles that differ from the nav label, or that have no nav item. */
const STATIC_TITLES: Record<string, string> = {
  '/accounts': 'nav.titles.accounts',
  '/fleet': 'nav.titles.fleet',
  '/fleet/vehicles': 'nav.titles.fleetVehicles',
  '/fleet/drivers': 'nav.titles.fleetDrivers',
  '/fleet/trips': 'nav.titles.fleetTrips',
  '/fleet/alerts': 'nav.titles.fleetAlerts',
  '/fleet/rate-cards': 'nav.titles.fleetRateCards',
  '/communication': 'nav.titles.communication',
  '/credit-notes': 'nav.titles.creditNotes',
  '/debit-notes': 'nav.titles.debitNotes',
  '/travellers': 'nav.titles.travellers',
  '/reports/customer': 'nav.titles.reportsCustomer',
  '/reports/team': 'nav.titles.reportsTeam',
  '/reports/visa': 'nav.titles.reportsVisa',
  '/help': 'nav.titles.help',
  '/import': 'nav.titles.import',
  '/onboarding': 'nav.titles.onboarding',
  '/settings': 'nav.titles.settings',
  '/settings/ai-usage': 'nav.titles.settingsAiUsage',
  '/settings/group-tours': 'nav.titles.settingsGroupTours',
  '/campaigns': 'nav.titles.campaigns',
  '/marketing': 'nav.titles.marketing',
  '/assistant': 'nav.titles.assistant',
  '/ai': 'nav.titles.ai',
  '/chatbot': 'nav.titles.chatbot',
};

/** Singular noun used to build "New x", "Edit x" and "x details" titles. */
/** Catalogue keys of the singular noun used to build "New x", "Edit x" and "x details" titles. */
const ENTITY_NOUNS: Record<string, string> = {
  '/leads': 'nav.entity.lead',
  '/contacts': 'nav.entity.contact',
  '/invoices': 'nav.entity.invoice',
  '/payments': 'nav.entity.payment',
  '/itineraries': 'nav.entity.itinerary',
  '/itineraries/templates': 'nav.entity.itineraryTemplate',
  '/tours': 'nav.entity.tour',
  '/departures': 'nav.entity.departure',
  '/suppliers': 'nav.entity.supplier',
  '/travellers': 'nav.entity.traveller',
  '/visa': 'nav.entity.visaApplication',
  '/vouchers': 'nav.entity.voucher',
  '/credit-notes': 'nav.entity.creditNote',
  '/debit-notes': 'nav.entity.debitNote',
  '/campaigns': 'nav.entity.campaign',
  '/marketing/campaigns': 'nav.entity.campaign',
  '/marketing/flyers': 'nav.entity.flyer',
  '/marketing/flyers/templates': 'nav.entity.flyerTemplate',
  '/marketing/segments': 'nav.entity.segment',
  '/marketing/whatsapp': 'nav.entity.whatsAppCampaign',
  '/communication/templates': 'nav.entity.template',
  '/communication/calls': 'nav.entity.call',
  '/fleet/vehicles': 'nav.entity.vehicle',
  '/fleet/drivers': 'nav.entity.driver',
  '/fleet/trips': 'nav.entity.trip',
  '/fleet/rate-cards': 'nav.entity.rateCard',
  '/rate-cards': 'nav.entity.rateCard',
  '/tasks': 'nav.entity.task',
  '/ai/extractions': 'nav.entity.extraction',
  '/ai/lead-score': 'nav.entity.leadScore',
};

const ACRONYMS: Record<string, string> = {
  ai: 'AI',
  bi: 'BI',
  ocr: 'OCR',
  voip: 'VoIP',
  pdf: 'PDF',
  crm: 'CRM',
};

const navTitleKeyByHref = new Map(allNavItems.map((item) => [item.href, item.titleKey]));

function titleCaseSegment(segment: string): string {
  const words = decodeURIComponent(segment)
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => ACRONYMS[word.toLowerCase()] ?? word);
  const text = words.join(' ');
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isIdSegment(segment: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(segment) || (/\d/.test(segment) && segment.length >= 8);
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function staticTitle(path: string, t: TranslateFn): string | undefined {
  const key = STATIC_TITLES[path] ?? navTitleKeyByHref.get(path);
  return key ? t(key) : undefined;
}

/** Title shown in the top bar. Never returns an empty string. Pass the active translator; English without one. */
export function getPageTitle(pathname: string | null | undefined, t: TranslateFn = tEn): string {
  const path = normalise(pathname);
  const direct = staticTitle(path, t);
  if (direct) return direct;

  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return t('nav.items.dashboard');

  const last = segments[segments.length - 1] ?? '';
  const parentOf = (count: number) => `/${segments.slice(0, segments.length - count).join('/')}`;
  const nounOf = (parentPath: string): string | undefined => {
    const key = ENTITY_NOUNS[parentPath];
    return key ? t(key) : undefined;
  };

  if (last === 'new') {
    const noun = nounOf(parentOf(1));
    if (noun) return t('nav.pageTitle.new', { noun });
  }
  if (last === 'edit') {
    const noun = nounOf(parentOf(2));
    if (noun) return t('nav.pageTitle.edit', { noun });
  }
  if (isIdSegment(last)) {
    const noun = nounOf(parentOf(1));
    if (noun) return t('nav.pageTitle.details', { noun: capitalise(noun) });
  }
  if (last === 'new' || last === 'edit') {
    // Unknown entity: fall back to the section title plus the action.
    const sectionPath = last === 'new' ? parentOf(1) : parentOf(2);
    const section = staticTitle(sectionPath, t) ?? titleCaseSegment(segments[Math.max(0, segments.length - (last === 'new' ? 2 : 3))] ?? '');
    return section
      ? t(last === 'new' ? 'nav.pageTitle.new' : 'nav.pageTitle.edit', { noun: section.toLowerCase() })
      : titleCaseSegment(last);
  }

  const fallback = titleCaseSegment(isIdSegment(last) ? (segments[segments.length - 2] ?? last) : last);
  return fallback || t('brand.short');
}
