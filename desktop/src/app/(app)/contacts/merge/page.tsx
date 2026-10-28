'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Merge, Search } from 'lucide-react';
import { toast } from 'sonner';

import { PageContainer } from '@/components/layout/page-container';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import { useApiQuery } from '@/hooks/use-api';
import { contactsApi, type ContactRecord } from '@/lib/api/contacts';
import { unwrapList } from '@/lib/api/envelope';
import { cn, getInitials } from '@/lib/utils';

type Side = 'primary' | 'secondary';

const MERGE_FIELDS: { key: keyof ContactRecord; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'company', label: 'Company' },
  { key: 'type', label: 'Type' },
  { key: 'city', label: 'City' },
  { key: 'notes', label: 'Notes' },
];

function fieldValue(contact: ContactRecord | undefined, key: keyof ContactRecord): string {
  const v = contact?.[key];
  return typeof v === 'string' && v ? v : '-';
}

interface ContactPickerProps {
  side: Side;
  heading: string;
  selected: ContactRecord | undefined;
  excludeId: string;
  onSelect: (id: string) => void;
  onClear: () => void;
}

function ContactPicker({ side, heading, selected, excludeId, onSelect, onClear }: ContactPickerProps) {
  const [search, setSearch] = React.useState('');
  const { data, loading } = useApiQuery(
    () => contactsApi.list({ page: 1, limit: 10, search: search || undefined }),
    [search],
  );
  const results = React.useMemo(
    () => unwrapList<ContactRecord>(data).data.filter((c) => c.id !== excludeId),
    [data, excludeId],
  );

  return (
    <SectionCard
      title={heading}
      actions={<Tag tone={side === 'primary' ? 'info' : 'warning'}>{side === 'primary' ? 'Primary' : 'Secondary'}</Tag>}
    >
      {selected ? (
        <div className="flex items-center gap-ds-3 rounded-ds-md border border-ds-border p-ds-3">
          <Avatar className="size-10">
            <AvatarFallback>{getInitials(selected.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{selected.name}</p>
            <p className="truncate text-xs text-ds-foreground-muted">{selected.email || selected.phone || ''}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { onClear(); setSearch(''); }}>Change</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-ds-2">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ds-foreground-muted" aria-hidden="true" />
            <Input
              aria-label={`Search ${side} contact`}
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 ps-9"
            />
          </div>
          {search && (
            <div className="max-h-48 overflow-auto rounded-ds-md border border-ds-border" role="listbox" aria-label="Matching contacts">
              {loading && <Skeleton className="m-ds-2 h-8" />}
              {!loading && results.length === 0 && (
                <p className="p-ds-3 text-sm text-ds-foreground-muted">No contacts match.</p>
              )}
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => { onSelect(c.id); setSearch(''); }}
                  className="flex w-full items-center gap-ds-3 p-ds-2 text-start hover:bg-ds-surface-sunken"
                >
                  <Avatar className="size-8">
                    <AvatarFallback className="text-xs">{getInitials(c.name)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-ds-foreground-muted">{c.email || c.phone || ''}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function ContactMergePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [primaryId, setPrimaryId] = React.useState(searchParams.get('primary') ?? '');
  const [secondaryId, setSecondaryId] = React.useState(searchParams.get('secondary') ?? '');
  const [selection, setSelection] = React.useState<Record<string, Side>>({});
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const primaryQuery = useApiQuery(
    () => (primaryId ? contactsApi.getById(primaryId) : Promise.resolve(null)),
    [primaryId],
  );
  const secondaryQuery = useApiQuery(
    () => (secondaryId ? contactsApi.getById(secondaryId) : Promise.resolve(null)),
    [secondaryId],
  );

  const primary = primaryId ? primaryQuery.data?.data : undefined;
  const secondary = secondaryId ? secondaryQuery.data?.data : undefined;
  const bothSelected = !!primary && !!secondary;

  React.useEffect(() => {
    if (primary && secondary) {
      setSelection(Object.fromEntries(MERGE_FIELDS.map((f) => [f.key, 'primary' as Side])));
    }
  }, [primary, secondary]);

  async function handleMerge() {
    try {
      const res = await contactsApi.merge({ primaryId, secondaryId, mergeFields: selection });
      toast.success('Contacts merged successfully');
      router.push(`/contacts/${res?.data?.id ?? primaryId}`);
    } catch {
      toast.error('Failed to merge contacts');
      throw new Error('merge failed');
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Merge Contacts"
        description="Select two contacts to merge into one"
        back={
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()} aria-label="Go back">
            <ArrowLeft aria-hidden="true" />
          </Button>
        }
        actions={
          bothSelected && (
            <Button onClick={() => setConfirmOpen(true)}>
              <Merge aria-hidden="true" /> Merge Contacts
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-ds-4">
        <div className="grid gap-ds-4 lg:grid-cols-2">
          <ContactPicker
            side="primary"
            heading="Contact to keep"
            selected={primary}
            excludeId={secondaryId}
            onSelect={setPrimaryId}
            onClear={() => setPrimaryId('')}
          />
          <ContactPicker
            side="secondary"
            heading="Contact to merge"
            selected={secondary}
            excludeId={primaryId}
            onSelect={setSecondaryId}
            onClear={() => setSecondaryId('')}
          />
        </div>

        {bothSelected && (
          <SectionCard title="Field-by-field selection" description="Choose which value to keep for each field." flush>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Field</TableHead>
                  <TableHead>Primary (keep)</TableHead>
                  <TableHead>Secondary (merge)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MERGE_FIELDS.map((f) => (
                  <TableRow key={f.key}>
                    <TableCell className="text-sm font-medium">{f.label}</TableCell>
                    {(['primary', 'secondary'] as const).map((side) => {
                      const chosen = selection[f.key] === side;
                      return (
                        <TableCell key={side} className="p-0">
                          <button
                            type="button"
                            aria-pressed={chosen}
                            onClick={() => setSelection((prev) => ({ ...prev, [f.key]: side }))}
                            className={cn(
                              'flex w-full items-center gap-ds-2 px-ds-4 py-ds-3 text-start text-sm transition-colors',
                              chosen ? 'bg-ds-primary-subtle font-semibold text-ds-primary-on-subtle' : 'hover:bg-ds-surface-sunken',
                            )}
                          >
                            {chosen && <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />}
                            {fieldValue(side === 'primary' ? primary : secondary, f.key)}
                          </button>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SectionCard>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm merge"
        description={`${secondary?.name ?? 'The secondary contact'} will be merged into ${primary?.name ?? 'the primary contact'} and then deleted. Its leads, invoices and follow-ups move to the primary contact. This cannot be undone.`}
        confirmLabel="Confirm Merge"
        tone="destructive"
        onConfirm={handleMerge}
      />
    </PageContainer>
  );
}

export default function ContactMergePageWrapper() {
  return (
    <React.Suspense fallback={<PageContainer><Skeleton className="h-64 w-full" /></PageContainer>}>
      <ContactMergePage />
    </React.Suspense>
  );
}
