'use client';

import {
  Plus, Search, Users, Briefcase, Truck, MapPin, CreditCard,
  Settings, LayoutDashboard, Plane, User, Receipt, AlertTriangle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { contactsApi } from '@/lib/api/contacts';
import { unwrapList } from '@/lib/api/envelope';
import { invoicesApi } from '@/lib/api/invoices';
import { leadsApi } from '@/lib/api/leads';
import { cn } from '@/lib/utils';
import { tEn, useT, type TranslateFn } from '@/lib/i18n';

/** Records are looked up once the query has this many characters. */
export const ENTITY_SEARCH_MIN_CHARS = 2;
export const ENTITY_SEARCH_LIMIT = 5;
const ENTITY_SEARCH_DEBOUNCE_MS = 250;

export interface EntityHit {
  id: string;
  kind: 'contact' | 'lead' | 'invoice';
  label: string;
  description?: string;
  href: string;
}

type Row = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Search contacts, leads and invoices through their existing list endpoints (no dedicated
 * search endpoint). A failing endpoint only drops its own section.
 */
export async function searchEntities(query: string, t: TranslateFn = tEn): Promise<EntityHit[]> {
  const q = query.trim();
  if (q.length < ENTITY_SEARCH_MIN_CHARS) return [];
  const params = { search: q, limit: ENTITY_SEARCH_LIMIT };
  const [contacts, leads, invoices] = await Promise.allSettled([
    contactsApi.list(params),
    leadsApi.list(params),
    invoicesApi.list(params),
  ]);
  const rowsOf = (r: PromiseSettledResult<unknown>): Row[] =>
    r.status === 'fulfilled' ? (unwrapList<Row>(r.value).data ?? []).slice(0, ENTITY_SEARCH_LIMIT) : [];

  const hits: EntityHit[] = [];
  for (const r of rowsOf(contacts)) {
    const id = str(r.id);
    if (id) hits.push({ id, kind: 'contact', label: str(r.name) || t('shell.palette.fallback.contact'), description: str(r.email) || str(r.phone) || undefined, href: `/contacts/${id}` });
  }
  for (const r of rowsOf(leads)) {
    const id = str(r.id);
    if (id) hits.push({ id, kind: 'lead', label: str(r.title) || t('shell.palette.fallback.lead'), description: str(r.contactName) || str(r.status) || undefined, href: `/leads/${id}` });
  }
  for (const r of rowsOf(invoices)) {
    const id = str(r.id);
    if (id) hits.push({ id, kind: 'invoice', label: str(r.invoiceNumber) || str(r.invoice_number) || t('shell.palette.fallback.invoice'), description: str(r.contactName) || str(r.contact_name) || undefined, href: `/invoices/${id}` });
  }
  return hits;
}

const ENTITY_SECTION: Record<EntityHit['kind'], { sectionKey: string; icon: React.ElementType }> = {
  contact: { sectionKey: 'shell.palette.sections.contacts', icon: Users },
  lead: { sectionKey: 'shell.palette.sections.leads', icon: Briefcase },
  invoice: { sectionKey: 'shell.palette.sections.invoices', icon: Receipt },
};

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  action: () => void;
  section: string;
  keywords?: string[];
}

export function CommandPalette() {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [selectedIdx, setSelectedIdx] = React.useState(0);

  const commands: CommandItem[] = React.useMemo(() => [
    // Quick Create
    { id: 'new-lead', label: t('shell.palette.commands.new-lead.label'), description: t('shell.palette.commands.new-lead.description'), icon: Plus, action: () => router.push('/leads/new'), section: t('shell.palette.sections.quickCreate'), keywords: ['create', 'add'] },
    { id: 'new-contact', label: t('shell.palette.commands.new-contact.label'), description: t('shell.palette.commands.new-contact.description'), icon: Plus, action: () => router.push('/contacts/new'), section: t('shell.palette.sections.quickCreate'), keywords: ['create', 'add', 'person'] },
    { id: 'new-invoice', label: t('shell.palette.commands.new-invoice.label'), description: t('shell.palette.commands.new-invoice.description'), icon: Plus, action: () => router.push('/invoices/new'), section: t('shell.palette.sections.quickCreate'), keywords: ['create', 'bill'] },
    { id: 'new-trip', label: t('shell.palette.commands.new-trip.label'), description: t('shell.palette.commands.new-trip.description'), icon: Plus, action: () => router.push('/fleet/trips/new'), section: t('shell.palette.sections.quickCreate'), keywords: ['create', 'assign'] },
    { id: 'new-vehicle', label: t('shell.palette.commands.new-vehicle.label'), description: t('shell.palette.commands.new-vehicle.description'), icon: Plus, action: () => router.push('/fleet/vehicles/new'), section: t('shell.palette.sections.quickCreate'), keywords: ['create', 'car'] },
    { id: 'new-driver', label: t('shell.palette.commands.new-driver.label'), description: t('shell.palette.commands.new-driver.description'), icon: Plus, action: () => router.push('/fleet/drivers/new'), section: t('shell.palette.sections.quickCreate'), keywords: ['create'] },
    { id: 'new-itinerary', label: t('shell.palette.commands.new-itinerary.label'), description: t('shell.palette.commands.new-itinerary.description'), icon: Plus, action: () => router.push('/itineraries/new'), section: t('shell.palette.sections.quickCreate'), keywords: ['create', 'trip', 'plan'] },
    { id: 'new-rate-card', label: t('shell.palette.commands.new-rate-card.label'), description: t('shell.palette.commands.new-rate-card.description'), icon: Plus, action: () => router.push('/fleet/rate-cards/new'), section: t('shell.palette.sections.quickCreate'), keywords: ['create', 'price'] },
    // Navigation
    { id: 'nav-dashboard', label: t('shell.palette.commands.nav-dashboard.label'), description: t('shell.palette.commands.nav-dashboard.description'), icon: LayoutDashboard, action: () => router.push('/dashboard'), section: t('shell.palette.sections.navigate'), keywords: ['home'] },
    { id: 'nav-leads', label: t('shell.palette.commands.nav-leads.label'), description: t('shell.palette.commands.nav-leads.description'), icon: Briefcase, action: () => router.push('/leads'), section: t('shell.palette.sections.navigate'), keywords: ['pipeline', 'sales'] },
    { id: 'nav-contacts', label: t('shell.palette.commands.nav-contacts.label'), description: t('shell.palette.commands.nav-contacts.description'), icon: Users, action: () => router.push('/contacts'), section: t('shell.palette.sections.navigate'), keywords: ['people', 'customers'] },
    { id: 'nav-invoices', label: t('shell.palette.commands.nav-invoices.label'), description: t('shell.palette.commands.nav-invoices.description'), icon: Receipt, action: () => router.push('/invoices'), section: t('shell.palette.sections.navigate'), keywords: ['bills', 'payments'] },
    { id: 'nav-itineraries', label: t('shell.palette.commands.nav-itineraries.label'), description: t('shell.palette.commands.nav-itineraries.description'), icon: Plane, action: () => router.push('/itineraries'), section: t('shell.palette.sections.navigate'), keywords: ['travel', 'plans'] },
    { id: 'nav-fleet', label: t('shell.palette.commands.nav-fleet.label'), description: t('shell.palette.commands.nav-fleet.description'), icon: Truck, action: () => router.push('/fleet'), section: t('shell.palette.sections.navigate'), keywords: ['vehicles', 'drivers'] },
    { id: 'nav-vehicles', label: t('shell.palette.commands.nav-vehicles.label'), description: t('shell.palette.commands.nav-vehicles.description'), icon: Truck, action: () => router.push('/fleet/vehicles'), section: t('shell.palette.sections.navigate'), keywords: ['cars', 'fleet'] },
    { id: 'nav-drivers', label: t('shell.palette.commands.nav-drivers.label'), description: t('shell.palette.commands.nav-drivers.description'), icon: User, action: () => router.push('/fleet/drivers'), section: t('shell.palette.sections.navigate'), keywords: ['fleet'] },
    { id: 'nav-trips', label: t('shell.palette.commands.nav-trips.label'), description: t('shell.palette.commands.nav-trips.description'), icon: MapPin, action: () => router.push('/fleet/trips'), section: t('shell.palette.sections.navigate'), keywords: ['fleet'] },
    { id: 'nav-rate-cards', label: t('shell.palette.commands.nav-rate-cards.label'), description: t('shell.palette.commands.nav-rate-cards.description'), icon: CreditCard, action: () => router.push('/fleet/rate-cards'), section: t('shell.palette.sections.navigate'), keywords: ['pricing', 'fleet'] },
    { id: 'nav-alerts', label: t('shell.palette.commands.nav-alerts.label'), description: t('shell.palette.commands.nav-alerts.description'), icon: AlertTriangle, action: () => router.push('/fleet/alerts'), section: t('shell.palette.sections.navigate'), keywords: ['warnings', 'expiry'] },
    { id: 'nav-settings', label: t('shell.palette.commands.nav-settings.label'), description: t('shell.palette.commands.nav-settings.description'), icon: Settings, action: () => router.push('/settings'), section: t('shell.palette.sections.navigate'), keywords: ['preferences', 'config'] },
  ], [router, t]);

  // Records matching the query; each new query drops the previous request's answer (stale responses are ignored).
  const [hits, setHits] = React.useState<EntityHit[]>([]);
  React.useEffect(() => {
    if (!open || query.trim().length < ENTITY_SEARCH_MIN_CHARS) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchEntities(query, t)
        .then((found) => { if (!cancelled) setHits(found); })
        .catch(() => { if (!cancelled) setHits([]); });
    }, ENTITY_SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, query, t]);

  const filteredCommands = React.useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter((cmd) =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.description?.toLowerCase().includes(q) ||
      cmd.keywords?.some((k: string) => k.includes(q))
    );
  }, [query, commands]);

  const filtered = React.useMemo<CommandItem[]>(() => [
    ...filteredCommands,
    ...hits.map((h) => ({
      id: `${h.kind}-${h.id}`,
      label: h.label,
      description: h.description,
      icon: ENTITY_SECTION[h.kind].icon,
      action: () => router.push(h.href),
      section: t(ENTITY_SECTION[h.kind].sectionKey),
    })),
  ], [filteredCommands, hits, router, t]);

  // Group by section
  const sections = React.useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const cmd of filtered) {
      const existing = map.get(cmd.section) || [];
      existing.push(cmd);
      map.set(cmd.section, existing);
    }
    return map;
  }, [filtered]);

  const flatItems = React.useMemo(() => filtered, [filtered]);

  // Keyboard navigation
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    // The top-bar search button asks for the palette through this event.
    function handleOpenRequest() {
      setOpen(true);
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('travelcrm:open-command-palette', handleOpenRequest);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('travelcrm:open-command-palette', handleOpenRequest);
    };
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flatItems[selectedIdx];
      if (item) { item.action(); setOpen(false); setQuery(''); }
    }
  }

  React.useEffect(() => { setSelectedIdx(0); }, [query]);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(''); }}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">{t('shell.palette.title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('shell.palette.description')}</DialogDescription>
        <div className="flex items-center border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            className="flex h-11 w-full bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
            placeholder={t('shell.palette.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <kbd className="pointer-events-none text-ds-xs font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{t('shell.palette.keys.esc')}</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {flatItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">{t('shell.palette.empty')}</p>
          )}
          {Array.from(sections.entries()).map(([section, items]) => {
            return (
              <div key={section}>
                <div className="px-3 py-1.5 text-ds-xs font-semibold text-muted-foreground uppercase tracking-wider">{section}</div>
                {items.map((item) => {
                  const idx = flatItems.indexOf(item);
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent transition-colors',
                        idx === selectedIdx && 'bg-accent'
                      )}
                      onClick={() => { item.action(); setOpen(false); setQuery(''); }}
                      onMouseEnter={() => setSelectedIdx(idx)}
                    >
                      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium">{item.label}</p>
                        {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t px-3 py-2 text-ds-xs text-muted-foreground">
          <span>{t('shell.palette.hint.navigate')}</span>
          <span>{t('shell.palette.hint.select')}</span>
          <span>{t('shell.palette.hint.close')}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
