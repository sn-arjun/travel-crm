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
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type NavBadgeKey =
  | 'unread_notifications'
  | 'pending_tasks'
  | 'overdue_followups'
  | 'overdue_invoices'
  | 'assistant_suggestions';

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badgeKey?: NavBadgeKey;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navigation: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { title: 'Calendar', href: '/calendar', icon: Calendar },
      { title: 'Tasks', href: '/tasks', icon: CheckSquare, badgeKey: 'pending_tasks' },
    ],
  },
  {
    label: 'CRM',
    items: [
      { title: 'Leads', href: '/leads', icon: Briefcase, badgeKey: 'overdue_followups' },
      { title: 'Contacts', href: '/contacts', icon: Users },
    ],
  },
  {
    label: 'Operations',
    items: [
      { title: 'Fleet', href: '/fleet', icon: Truck },
      { title: 'Fleet Rate Cards', href: '/fleet/rate-cards', icon: Tag },
      { title: 'Itineraries', href: '/itineraries', icon: MapIcon },
      { title: 'Itinerary Templates', href: '/itineraries/templates', icon: Bookmark },
      { title: 'Rate Cards', href: '/rate-cards', icon: Tag },
      { title: 'Suppliers', href: '/suppliers', icon: PackageSearch },
      { title: 'Accounts (Suppliers view)', href: '/accounts', icon: Building2 },
      { title: 'Rate Comparison', href: '/suppliers/compare', icon: BarChart3 },
      { title: 'Visa & Travellers', href: '/visa', icon: Stamp },
      { title: 'Travellers', href: '/travellers', icon: UserRound },
      { title: 'Vouchers', href: '/vouchers', icon: ClipboardList },
    ],
  },
  {
    label: 'Revenue',
    items: [
      { title: 'Invoices', href: '/invoices', icon: Receipt, badgeKey: 'overdue_invoices' },
      { title: 'Payments', href: '/payments', icon: CreditCard },
      { title: 'Credit Notes', href: '/credit-notes', icon: FileText },
      { title: 'Debit Notes', href: '/debit-notes', icon: FileText },
    ],
  },
  {
    label: 'Communication',
    items: [
      { title: 'Inbox', href: '/communication', icon: Inbox },
      { title: 'Call Log', href: '/communication/calls', icon: Phone },
      { title: 'Templates', href: '/communication/templates', icon: MessageSquare },
      { title: 'Bulk Send', href: '/communication/bulk-send', icon: Send },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { title: 'Reports', href: '/reports', icon: BarChart3 },
      // One entry for everything the assistant does. Its suggestions appear on the records themselves;
      // the individual AI tools and the chatbot are reached from the Tools tab of this page.
      { title: 'Assistant', href: '/assistant', icon: Sparkles, badgeKey: 'assistant_suggestions' },
      { title: 'Notifications', href: '/notifications', icon: Bell, badgeKey: 'unread_notifications' },
      { title: 'Documents', href: '/documents', icon: FileText },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { title: 'Dashboard', href: '/marketing', icon: LayoutDashboard },
      { title: 'Campaigns', href: '/marketing/campaigns', icon: Megaphone },
      { title: 'Segments', href: '/marketing/segments', icon: Users },
      { title: 'Flyers', href: '/marketing/flyers', icon: Palette },
      { title: 'Flyer Templates', href: '/marketing/flyers/templates', icon: LayoutTemplate },
      { title: 'Branding', href: '/marketing/branding', icon: Palette },
      { title: 'Festival Offers', href: '/marketing/festivals', icon: CalendarClock },
      { title: 'Opted-Out', href: '/marketing/opted-out', icon: UserCheck },
      { title: 'Social Content', href: '/marketing/social', icon: Megaphone },
      { title: 'WhatsApp Campaigns', href: '/marketing/whatsapp', icon: MessageCircle },
    ],
  },
  {
    label: 'Tools',
    items: [
      { title: 'Follow-ups', href: '/follow-ups', icon: CalendarClock },
      { title: 'Import / Export', href: '/import', icon: Upload },
      { title: 'Bookmarks', href: '/bookmarks', icon: Bookmark },
    ],
  },
];

export const bottomNav: NavItem[] = [
  { title: 'Help Center', href: '/help', icon: HelpCircle },
  { title: 'Settings', href: '/settings', icon: Settings },
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
const STATIC_TITLES: Record<string, string> = {
  '/accounts': 'Accounts & Suppliers',
  '/fleet': 'Fleet Management',
  '/fleet/vehicles': 'Vehicles',
  '/fleet/drivers': 'Drivers',
  '/fleet/trips': 'Trips',
  '/fleet/alerts': 'Fleet alerts',
  '/fleet/rate-cards': 'Fleet rate cards',
  '/communication': 'Inbox',
  '/credit-notes': 'Credit notes',
  '/debit-notes': 'Debit notes',
  '/travellers': 'Travellers',
  '/reports/customer': 'Customer report',
  '/reports/team': 'Team report',
  '/reports/visa': 'Visa report',
  '/help': 'Help Center',
  '/import': 'Import',
  '/onboarding': 'Onboarding',
  '/settings': 'Settings',
  '/campaigns': 'Campaigns',
  '/marketing': 'Marketing',
  '/assistant': 'Assistant',
  '/ai': 'AI tools',
  '/chatbot': 'Chatbot',
};

/** Singular noun used to build "New x", "Edit x" and "x details" titles. */
const ENTITY_NOUNS: Record<string, string> = {
  '/leads': 'lead',
  '/contacts': 'contact',
  '/invoices': 'invoice',
  '/payments': 'payment',
  '/itineraries': 'itinerary',
  '/itineraries/templates': 'itinerary template',
  '/suppliers': 'supplier',
  '/travellers': 'traveller',
  '/visa': 'visa application',
  '/vouchers': 'voucher',
  '/credit-notes': 'credit note',
  '/debit-notes': 'debit note',
  '/campaigns': 'campaign',
  '/marketing/campaigns': 'campaign',
  '/marketing/flyers': 'flyer',
  '/marketing/flyers/templates': 'flyer template',
  '/marketing/segments': 'segment',
  '/marketing/whatsapp': 'WhatsApp campaign',
  '/communication/templates': 'template',
  '/communication/calls': 'call',
  '/fleet/vehicles': 'vehicle',
  '/fleet/drivers': 'driver',
  '/fleet/trips': 'trip',
  '/fleet/rate-cards': 'rate card',
  '/rate-cards': 'rate card',
  '/tasks': 'task',
  '/ai/extractions': 'extraction',
  '/ai/lead-score': 'lead score',
};

const ACRONYMS: Record<string, string> = {
  ai: 'AI',
  bi: 'BI',
  ocr: 'OCR',
  voip: 'VoIP',
  pdf: 'PDF',
  crm: 'CRM',
};

const navTitleByHref = new Map(allNavItems.map((item) => [item.href, item.title]));

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

function staticTitle(path: string): string | undefined {
  return STATIC_TITLES[path] ?? navTitleByHref.get(path);
}

/** Title shown in the top bar. Never returns an empty string. */
export function getPageTitle(pathname: string | null | undefined): string {
  const path = normalise(pathname);
  const direct = staticTitle(path);
  if (direct) return direct;

  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return 'Dashboard';

  const last = segments[segments.length - 1] ?? '';
  const parentOf = (count: number) => `/${segments.slice(0, segments.length - count).join('/')}`;

  if (last === 'new') {
    const noun = ENTITY_NOUNS[parentOf(1)];
    if (noun) return `New ${noun}`;
  }
  if (last === 'edit') {
    const noun = ENTITY_NOUNS[parentOf(2)];
    if (noun) return `Edit ${noun}`;
  }
  if (isIdSegment(last)) {
    const noun = ENTITY_NOUNS[parentOf(1)];
    if (noun) return `${capitalise(noun)} details`;
  }
  if (last === 'new' || last === 'edit') {
    // Unknown entity: fall back to the section title plus the action.
    const sectionPath = last === 'new' ? parentOf(1) : parentOf(2);
    const section = staticTitle(sectionPath) ?? titleCaseSegment(segments[Math.max(0, segments.length - (last === 'new' ? 2 : 3))] ?? '');
    return section ? `${last === 'new' ? 'New' : 'Edit'} ${section.toLowerCase()}` : titleCaseSegment(last);
  }

  const fallback = titleCaseSegment(isIdSegment(last) ? (segments[segments.length - 2] ?? last) : last);
  return fallback || 'TravelCRM';
}
