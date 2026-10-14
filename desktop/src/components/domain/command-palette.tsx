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
export async function searchEntities(query: string): Promise<EntityHit[]> {
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
    if (id) hits.push({ id, kind: 'contact', label: str(r.name) || 'Unnamed contact', description: str(r.email) || str(r.phone) || undefined, href: `/contacts/${id}` });
  }
  for (const r of rowsOf(leads)) {
    const id = str(r.id);
    if (id) hits.push({ id, kind: 'lead', label: str(r.title) || 'Untitled lead', description: str(r.contactName) || str(r.status) || undefined, href: `/leads/${id}` });
  }
  for (const r of rowsOf(invoices)) {
    const id = str(r.id);
    if (id) hits.push({ id, kind: 'invoice', label: str(r.invoiceNumber) || str(r.invoice_number) || 'Invoice', description: str(r.contactName) || str(r.contact_name) || undefined, href: `/invoices/${id}` });
  }
  return hits;
}

const ENTITY_SECTION: Record<EntityHit['kind'], { section: string; icon: React.ElementType }> = {
  contact: { section: 'Contacts', icon: Users },
  lead: { section: 'Leads', icon: Briefcase },
  invoice: { section: 'Invoices', icon: Receipt },
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
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [selectedIdx, setSelectedIdx] = React.useState(0);

  const commands: CommandItem[] = React.useMemo(() => [
    // Quick Create
    { id: 'new-lead', label: 'New Lead', description: 'Create a new lead', icon: Plus, action: () => router.push('/leads/new'), section: 'Quick Create', keywords: ['create', 'add'] },
    { id: 'new-contact', label: 'New Contact', description: 'Add a new contact', icon: Plus, action: () => router.push('/contacts/new'), section: 'Quick Create', keywords: ['create', 'add', 'person'] },
    { id: 'new-invoice', label: 'New Invoice', description: 'Create a new invoice', icon: Plus, action: () => router.push('/invoices/new'), section: 'Quick Create', keywords: ['create', 'bill'] },
    { id: 'new-trip', label: 'New Trip Assignment', description: 'Assign a new trip', icon: Plus, action: () => router.push('/fleet/trips/new'), section: 'Quick Create', keywords: ['create', 'assign'] },
    { id: 'new-vehicle', label: 'Add Vehicle', description: 'Register a new vehicle', icon: Plus, action: () => router.push('/fleet/vehicles/new'), section: 'Quick Create', keywords: ['create', 'car'] },
    { id: 'new-driver', label: 'Add Driver', description: 'Add a new driver', icon: Plus, action: () => router.push('/fleet/drivers/new'), section: 'Quick Create', keywords: ['create'] },
    { id: 'new-itinerary', label: 'New Itinerary', description: 'Create a travel itinerary', icon: Plus, action: () => router.push('/itineraries/new'), section: 'Quick Create', keywords: ['create', 'trip', 'plan'] },
    { id: 'new-rate-card', label: 'New Rate Card', description: 'Define pricing rates', icon: Plus, action: () => router.push('/fleet/rate-cards/new'), section: 'Quick Create', keywords: ['create', 'price'] },
    // Navigation
    { id: 'nav-dashboard', label: 'Dashboard', description: 'Go to dashboard', icon: LayoutDashboard, action: () => router.push('/dashboard'), section: 'Navigate', keywords: ['home'] },
    { id: 'nav-leads', label: 'Leads', description: 'Manage leads', icon: Briefcase, action: () => router.push('/leads'), section: 'Navigate', keywords: ['pipeline', 'sales'] },
    { id: 'nav-contacts', label: 'Contacts', description: 'Manage contacts', icon: Users, action: () => router.push('/contacts'), section: 'Navigate', keywords: ['people', 'customers'] },
    { id: 'nav-invoices', label: 'Invoices', description: 'View invoices', icon: Receipt, action: () => router.push('/invoices'), section: 'Navigate', keywords: ['bills', 'payments'] },
    { id: 'nav-itineraries', label: 'Itineraries', description: 'Travel itineraries', icon: Plane, action: () => router.push('/itineraries'), section: 'Navigate', keywords: ['travel', 'plans'] },
    { id: 'nav-fleet', label: 'Fleet Dashboard', description: 'Fleet management', icon: Truck, action: () => router.push('/fleet'), section: 'Navigate', keywords: ['vehicles', 'drivers'] },
    { id: 'nav-vehicles', label: 'Vehicles', description: 'Manage vehicles', icon: Truck, action: () => router.push('/fleet/vehicles'), section: 'Navigate', keywords: ['cars', 'fleet'] },
    { id: 'nav-drivers', label: 'Drivers', description: 'Manage drivers', icon: User, action: () => router.push('/fleet/drivers'), section: 'Navigate', keywords: ['fleet'] },
    { id: 'nav-trips', label: 'Trip Assignments', description: 'Manage trip assignments', icon: MapPin, action: () => router.push('/fleet/trips'), section: 'Navigate', keywords: ['fleet'] },
    { id: 'nav-rate-cards', label: 'Rate Cards', description: 'Fleet rate cards', icon: CreditCard, action: () => router.push('/fleet/rate-cards'), section: 'Navigate', keywords: ['pricing', 'fleet'] },
    { id: 'nav-alerts', label: 'Fleet Alerts', description: 'View fleet alerts', icon: AlertTriangle, action: () => router.push('/fleet/alerts'), section: 'Navigate', keywords: ['warnings', 'expiry'] },
    { id: 'nav-settings', label: 'Settings', description: 'App settings', icon: Settings, action: () => router.push('/settings'), section: 'Navigate', keywords: ['preferences', 'config'] },
  ], [router]);

  // Records matching the query; each new query drops the previous request's answer (stale responses are ignored).
  const [hits, setHits] = React.useState<EntityHit[]>([]);
  React.useEffect(() => {
    if (!open || query.trim().length < ENTITY_SEARCH_MIN_CHARS) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchEntities(query)
        .then((found) => { if (!cancelled) setHits(found); })
        .catch(() => { if (!cancelled) setHits([]); });
    }, ENTITY_SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, query]);

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
      section: ENTITY_SECTION[h.kind].section,
    })),
  ], [filteredCommands, hits, router]);

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
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">Search commands, contacts, leads and invoices</DialogDescription>
        <div className="flex items-center border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            className="flex h-11 w-full bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Type a command, or search contacts, leads and invoices..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <kbd className="pointer-events-none text-ds-xs font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {flatItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No results found</p>
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
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>ESC Close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
