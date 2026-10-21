'use client';

import * as React from 'react';
import { AlertCircle, Download, FileSpreadsheet, FileText, RotateCcw, Users, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

import { FilterBar } from '@/components/domain/filter-bar';
import {
  Alert, AlertDescription, Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, SectionCard, Skeleton, Spinner,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tag,
} from '@/components/ui';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  departuresApi, type DepartureDetail, type Manifest, type ManifestCell, type ManifestFormat, type ManifestView, type RoomSuggestion, type RoomTypeDef,
} from '@/lib/api/departures';
import { departureErrorText } from '@/lib/departures';
import { useT } from '@/lib/i18n';
import { SimpleSelect } from './simple-select';

const VIEWS: readonly ManifestView[] = ['pickup', 'rooming', 'full'];
const DOCUMENT_STATUSES = ['unknown', 'provided', 'checked', 'problem'] as const;
const DOCS_TONE = { unknown: 'neutral', provided: 'info', checked: 'success', problem: 'danger' } as const;

type Row = Record<string, ManifestCell>;

interface Filters {
  q: string;
  stop: string | null;
  roomType: string | null;
  documents: string | null;
}

const NO_FILTERS: Filters = { q: '', stop: null, roomType: null, documents: null };

/** Rows of a group that pass the filters. `_stop`, `_roomType` and `_documents` are the keys the API adds to every row for this. */
export function filterRows(rows: readonly Row[], f: Filters): Row[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (q && !String(r.name ?? '').toLowerCase().includes(q)) return false;
    if (f.stop && r._stop !== f.stop) return false;
    if (f.roomType && r._roomType !== f.roomType) return false;
    if (f.documents && r._documents !== f.documents) return false;
    return true;
  });
}

interface ManifestTabProps {
  departure: DepartureDetail;
  canEdit: boolean;
  roomTypes: readonly RoomTypeDef[];
  /** Bumped by the page when bookings or passengers change anywhere: the list is read again. */
  refreshKey: number;
  /** Rooms were saved: the page may refresh what depends on them. */
  onChanged: () => void;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * The manifest of a departure: the pickup list (stops in order, who boards where), the rooming list (rooms and who is not in one
 * yet) and the full list. Filter by pickup point, room type and documents status; export the list that is on screen as CSV or
 * PDF; pair the people who agreed to share into rooms (staff confirm the suggestion before it is saved).
 */
export function ManifestTab({ departure, canEdit, roomTypes, refreshKey, onChanged }: ManifestTabProps) {
  const t = useT();
  const [view, setView] = React.useState<ManifestView>('pickup');
  const [onlyConfirmed, setOnlyConfirmed] = React.useState(false);
  const [manifest, setManifest] = React.useState<Manifest | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState<Filters>(NO_FILTERS);
  const [exporting, setExporting] = React.useState<ManifestFormat | null>(null);
  const [roomsOpen, setRoomsOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setManifest(await departuresApi.manifest(departure.id, view, onlyConfirmed ? 'confirmed' : 'all'));
      setError(null);
    } catch (err) {
      setError(departureErrorText(err, t, 'departures.manifest.loadFailed'));
    }
  }, [departure.id, view, onlyConfirmed, t]);

  React.useEffect(() => {
    void load();
    // Read again when the view, the booking filter or the page's refresh key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departure.id, view, onlyConfirmed, refreshKey]);

  async function exportAs(format: ManifestFormat) {
    setExporting(format);
    try {
      const blob = await departuresApi.downloadManifest(departure.id, view, format, onlyConfirmed ? 'confirmed' : 'all');
      saveBlob(blob, `${departure.code}-${view}.${format}`);
      toast.success(t('departures.manifest.exported', { name: `${departure.code}-${view}.${format}` }));
    } catch (err) {
      toast.error(departureErrorText(err, t, 'departures.manifest.exportFailed'));
    } finally {
      setExporting(null);
    }
  }

  const allRows = React.useMemo(() => (manifest ? manifest.groups.flatMap((g) => g.rows) : []), [manifest]);
  const stopOptions = React.useMemo(
    () => [...new Set(allRows.map((r) => String(r._stop ?? '')).filter(Boolean))].map((s) => ({ value: s, label: s })),
    [allRows],
  );
  const roomTypeOptions = React.useMemo(
    () => [...new Set(allRows.map((r) => String(r._roomType ?? '')).filter(Boolean))].map((k) => ({ value: k, label: roomTypes.find((r) => r.key === k)?.label ?? k })),
    [allRows, roomTypes],
  );
  const docOptions = DOCUMENT_STATUSES.map((s) => ({ value: s, label: t(`departures.passengers.docsStatus.${s}`) }));

  const activeFilters = [
    filters.stop && { id: 'stop', label: t('departures.manifest.filterPickup'), value: filters.stop },
    filters.roomType && { id: 'roomType', label: t('departures.manifest.filterRoomType'), value: roomTypeOptions.find((o) => o.value === filters.roomType)?.label ?? filters.roomType },
    filters.documents && { id: 'documents', label: t('departures.manifest.filterDocuments'), value: docOptions.find((o) => o.value === filters.documents)?.label ?? filters.documents },
  ].filter((f): f is { id: string; label: string; value: string } => Boolean(f));

  const filtering = activeFilters.length > 0 || filters.q.trim() !== '';
  const shown = manifest
    ? manifest.groups
        .map((g) => ({ ...g, rows: filterRows(g.rows, filters) }))
        // A group with nobody left after filtering is hidden unless no filter is set (an empty stop is still a stop of the list).
        .filter((g) => g.rows.length > 0 || (!filtering && Boolean(g.title)))
    : [];
  const shownCount = shown.reduce((n, g) => n + g.rows.length, 0);

  return (
    <SectionCard
      title={t('departures.manifest.title')}
      description={t('departures.manifest.description')}
      actions={
        <div className="flex flex-wrap items-center gap-ds-2">
          {canEdit && view === 'rooming' && (
            <Button size="sm" variant="outline" onClick={() => setRoomsOpen(true)} data-testid="auto-group-rooms">
              <Wand2 aria-hidden="true" /> {t('departures.manifest.autoGroup')}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" disabled={!manifest || exporting !== null} data-testid="manifest-export">
                {exporting ? <Spinner className="size-4" /> : <Download aria-hidden="true" />} {t('departures.manifest.export')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void exportAs('csv')} data-testid="manifest-export-csv">
                <FileSpreadsheet className="size-4" aria-hidden="true" /> {t('departures.manifest.exportCsv')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportAs('pdf')} data-testid="manifest-export-pdf">
                <FileText className="size-4" aria-hidden="true" /> {t('departures.manifest.exportPdf')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      <div className="space-y-ds-4" data-testid="manifest-tab">
        <div className="flex flex-wrap items-center gap-ds-3">
          <div className="inline-flex overflow-hidden rounded-ds-md border border-ds-border text-sm" role="tablist" aria-label={t('departures.manifest.views')}>
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                data-testid={`manifest-view-${v}`}
                className={view === v ? 'bg-ds-primary px-ds-3 py-ds-1 text-ds-primary-foreground' : 'px-ds-3 py-ds-1 hover:bg-ds-surface-sunken'}
                onClick={() => {
                  setView(v);
                  setFilters(NO_FILTERS);
                }}
              >
                {t(`departures.manifest.view.${v}`)}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-ds-2 text-sm">
            <Checkbox checked={onlyConfirmed} onCheckedChange={(c) => setOnlyConfirmed(c === true)} data-testid="manifest-only-confirmed" />
            {t('departures.manifest.onlyConfirmed')}
          </label>
          {manifest && (
            <span className="ms-auto text-sm text-ds-foreground-muted" data-testid="manifest-totals">
              {t('departures.manifest.totals', { passengers: manifest.totals.passengers, seats: manifest.totals.seats })}
            </span>
          )}
        </div>

        <FilterBar
          searchValue={filters.q}
          onSearchChange={(q) => setFilters((f) => ({ ...f, q }))}
          searchPlaceholder={t('departures.manifest.search')}
          activeFilters={activeFilters}
          onRemoveFilter={(id) => setFilters((f) => ({ ...f, [id]: null }))}
          onClearFilters={() => setFilters(NO_FILTERS)}
          actions={
            <>
              <SimpleSelect
                value={filters.stop}
                onChange={(stop) => setFilters((f) => ({ ...f, stop }))}
                options={stopOptions}
                noneLabel={t('departures.manifest.allPickups')}
                placeholder={t('departures.manifest.allPickups')}
                aria-label={t('departures.manifest.filterPickup')}
                className="h-9 w-44"
              />
              <SimpleSelect
                value={filters.roomType}
                onChange={(roomType) => setFilters((f) => ({ ...f, roomType }))}
                options={roomTypeOptions}
                noneLabel={t('departures.manifest.allRoomTypes')}
                placeholder={t('departures.manifest.allRoomTypes')}
                aria-label={t('departures.manifest.filterRoomType')}
                className="h-9 w-40"
              />
              <SimpleSelect
                value={filters.documents}
                onChange={(documents) => setFilters((f) => ({ ...f, documents }))}
                options={docOptions}
                noneLabel={t('departures.manifest.allDocuments')}
                placeholder={t('departures.manifest.allDocuments')}
                aria-label={t('departures.manifest.filterDocuments')}
                className="h-9 w-40"
              />
            </>
          }
        />

        {error && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription className="flex items-center justify-between gap-ds-3">
              {error}
              <Button size="sm" variant="outline" onClick={() => void load()}>
                <RotateCcw aria-hidden="true" /> {t('departures.retry')}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {!manifest && !error && <Skeleton className="h-48 w-full" />}

        {manifest && manifest.totals.passengers === 0 && (
          <EmptyState icon={<Users className="size-8" aria-hidden="true" />} title={t('departures.manifest.emptyTitle')} description={t('departures.manifest.emptyDescription')} />
        )}

        {manifest && manifest.totals.passengers > 0 && shownCount === 0 && filtering && (
          <p className="text-sm text-ds-foreground-muted">{t('departures.manifest.noMatches')}</p>
        )}

        {manifest && manifest.totals.passengers > 0 && (
          <div className="space-y-ds-5">
            {shown.map((g) => (
              <div key={g.key || 'none'} data-testid="manifest-group" data-group={g.title}>
                {g.title && (
                  <div className="mb-ds-2 flex flex-wrap items-center gap-ds-2">
                    {g.time && <span className="font-mono text-sm tabular-nums">{g.time}</span>}
                    <h3 className="text-sm font-semibold">{g.title}</h3>
                    {g.documentsCheck && <Tag tone="info" size="sm">{t('departures.manifest.documentsCheck')}</Tag>}
                    <span className="text-xs text-ds-foreground-muted">{t('departures.manifest.groupCount', { count: g.rows.length })}</span>
                  </div>
                )}
                {g.rows.length === 0 ? (
                  <p className="text-sm text-ds-foreground-muted">{t('departures.manifest.nobodyHere')}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {manifest.columns.map((c) => (
                          <TableHead key={c.key}>{c.label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.rows.map((r, i) => (
                        <TableRow key={i} data-testid="manifest-row">
                          {manifest.columns.map((c) => (
                            <TableCell key={c.key}>
                              {c.key === 'documents' ? (
                                <Tag tone={DOCS_TONE[(String(r._documents ?? 'unknown') as keyof typeof DOCS_TONE)] ?? 'neutral'} size="sm">{String(r[c.key] ?? '')}</Tag>
                              ) : (
                                String(r[c.key] ?? '')
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            ))}
          </div>
        )}

        {view === 'full' && manifest && !manifest.documentNumbersIncluded && (
          <p className="text-xs text-ds-foreground-muted">{t('departures.manifest.noDocumentNumbers')}</p>
        )}
      </div>

      <AutoGroupDialog
        open={roomsOpen}
        onOpenChange={setRoomsOpen}
        departureId={departure.id}
        onSaved={() => {
          setRoomsOpen(false);
          onChanged();
        }}
      />
    </SectionCard>
  );
}

function AutoGroupDialog({
  open, onOpenChange, departureId, onSaved,
}: { open: boolean; onOpenChange: (o: boolean) => void; departureId: string; onSaved: () => void }) {
  const t = useT();
  const [suggestions, setSuggestions] = React.useState<RoomSuggestion[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setSuggestions(null);
    setError(null);
    let cancelled = false;
    departuresApi
      .roomSuggestions(departureId)
      .then((s) => !cancelled && setSuggestions(s))
      .catch((err) => !cancelled && setError(departureErrorText(err, t, 'departures.manifest.suggestFailed')));
    return () => {
      cancelled = true;
    };
  }, [open, departureId, t]);

  async function save() {
    if (!suggestions?.length) return;
    setSaving(true);
    try {
      const res = await departuresApi.saveRooms(
        departureId,
        suggestions.flatMap((s) => s.passengers.map((p) => ({ passengerId: p.id, roomGroup: s.room }))),
      );
      toast.success(t('departures.manifest.roomsSaved', { count: res.updated }));
      onSaved();
    } catch (err) {
      toast.error(departureErrorText(err, t, 'departures.manifest.roomsFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('departures.manifest.autoGroupTitle')}</DialogTitle>
          <DialogDescription>{t('departures.manifest.autoGroupDescription')}</DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!suggestions && !error && <Skeleton className="h-24 w-full" />}
        {suggestions && suggestions.length === 0 && <p className="text-sm text-ds-foreground-muted" data-testid="auto-group-none">{t('departures.manifest.autoGroupNone')}</p>}
        {suggestions && suggestions.length > 0 && (
          <ul className="max-h-72 space-y-ds-2 overflow-auto" data-testid="auto-group-list">
            {suggestions.map((s) => (
              <li key={s.room} className="rounded-ds-md border border-ds-border p-ds-2 text-sm">
                <span className="font-medium">{t('departures.manifest.roomLabel', { room: s.room })}</span>
                <span className="text-ds-foreground-muted"> - {s.passengers.map((p) => p.name).join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('departures.manifest.cancel')}</Button>
          <Button onClick={() => void save()} disabled={!suggestions?.length || saving} data-testid="auto-group-save">
            {saving && <Spinner className="size-4" />} {t('departures.manifest.autoGroupSave')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
