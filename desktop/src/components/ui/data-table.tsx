'use client';

import { ChevronDown, ChevronUp, ChevronsUpDown, Settings2 } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

import { Button } from './button';
import { Checkbox } from './checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Skeleton } from './skeleton';

/** Row count above which the body switches to windowed rendering. */
export const VIRTUALIZE_THRESHOLD = 200;
const ROW_HEIGHT = 44;
const OVERSCAN = 8;
const DEFAULT_MAX_HEIGHT = 'calc(100dvh - 20rem)';
const FALLBACK_VIEWPORT_PX = 600;

export interface DataTableColumn<T> {
  key: string;
  header: string;
  /** Custom cell renderer. Falls back to `String(row[key])`. */
  cell?: (row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  width?: string;
  /** Tailwind min-width class, e.g. `min-w-48`. */
  minWidth?: string;
  /** Allow cell text to wrap (default: single line). */
  wrap?: boolean;
  align?: 'left' | 'center' | 'right';
  /** Excluded from the column-visibility menu when false. */
  hideable?: boolean;
  /** Hidden by default; user can enable via the column menu. */
  defaultHidden?: boolean;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowId: (row: T) => string;

  loading?: boolean;
  /** Rendered in place of the table body when `data` is empty and not loading. */
  emptyState?: React.ReactNode;

  // Sorting
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (column: string, direction: 'asc' | 'desc') => void;

  // Selection
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;

  // Row interaction
  onRowClick?: (row: T) => void;
  /** Per-row actions revealed on hover / focus-within. */
  rowActions?: (row: T) => React.ReactNode;

  // Chrome
  stickyHeader?: boolean;
  showColumnVisibility?: boolean;
  /** Force windowing on/off. Defaults to `data.length > VIRTUALIZE_THRESHOLD`. */
  virtualize?: boolean;
  /** Max height of the scroll region (CSS value). Defaults to the viewport minus page chrome. */
  maxHeight?: string;
  /** Set false to let the table grow with its rows instead of scrolling inside its card. */
  fillViewport?: boolean;
  /** Rendered inside the scroll region after the table (e.g. the infinite-scroll sentinel). */
  footer?: React.ReactNode;
  className?: string;
  caption?: string;
}

export function DataTable<T>({
  columns,
  data,
  getRowId,
  loading,
  emptyState,
  sortColumn,
  sortDirection = 'asc',
  onSort,
  selectable,
  selectedIds,
  onSelectionChange,
  onRowClick,
  rowActions,
  stickyHeader = true,
  showColumnVisibility = true,
  virtualize,
  maxHeight = DEFAULT_MAX_HEIGHT,
  fillViewport = true,
  footer,
  className,
  caption,
}: DataTableProps<T>) {
  const t = useT();
  const [hiddenColumns, setHiddenColumns] = React.useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)),
  );
  const visibleColumns = React.useMemo(
    () => columns.filter((c) => !hiddenColumns.has(c.key)),
    [columns, hiddenColumns],
  );

  const selection = selectedIds ?? new Set<string>();
  const shouldVirtualize = virtualize ?? data.length > VIRTUALIZE_THRESHOLD;

  // ─── Windowing ───────────────────────────────────────────
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportPx, setViewportPx] = React.useState(FALLBACK_VIEWPORT_PX);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setViewportPx(el.clientHeight || FALLBACK_VIEWPORT_PX);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const { startIndex, endIndex } = React.useMemo(() => {
    if (!shouldVirtualize) return { startIndex: 0, endIndex: data.length };
    const visibleCount = Math.ceil(viewportPx / ROW_HEIGHT);
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const end = Math.min(data.length, start + visibleCount + OVERSCAN * 2);
    return { startIndex: start, endIndex: end };
  }, [shouldVirtualize, data.length, viewportPx, scrollTop]);

  const rows = shouldVirtualize ? data.slice(startIndex, endIndex) : data;
  const padTop = shouldVirtualize ? startIndex * ROW_HEIGHT : 0;
  const padBottom = shouldVirtualize ? (data.length - endIndex) * ROW_HEIGHT : 0;

  // ─── Selection ───────────────────────────────────────────
  const allSelected = data.length > 0 && data.every((r) => selection.has(getRowId(r)));
  const someSelected = !allSelected && data.some((r) => selection.has(getRowId(r)));

  const toggleAll = () => {
    if (!onSelectionChange) return;
    onSelectionChange(allSelected ? new Set() : new Set(data.map(getRowId)));
  };

  const toggleRow = (id: string) => {
    if (!onSelectionChange) return;
    const next = new Set(selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const handleSort = (col: DataTableColumn<T>) => {
    if (!col.sortable || !onSort) return;
    const nextDirection = sortColumn === col.key && sortDirection === 'asc' ? 'desc' : 'asc';
    onSort(col.key, nextDirection);
  };

  const colSpan = visibleColumns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0);

  return (
    <div className={cn('rounded-ds-lg border border-ds-border bg-ds-surface', className)}>
      {showColumnVisibility && columns.some((c) => c.hideable !== false) && (
        <div className="flex justify-end border-b border-ds-border px-ds-3 py-ds-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-ds-2">
                <Settings2 aria-hidden="true" />
                {t('ui.dataTable.columns')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t('ui.dataTable.toggleColumns')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns
                .filter((c) => c.hideable !== false)
                .map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.key}
                    checked={!hiddenColumns.has(col.key)}
                    onCheckedChange={(checked) => {
                      setHiddenColumns((prev) => {
                        const next = new Set(prev);
                        if (checked) next.delete(col.key);
                        else next.add(col.key);
                        return next;
                      });
                    }}
                  >
                    {col.header}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div
        ref={scrollRef}
        data-scroll-region="table"
        onScroll={shouldVirtualize ? handleScroll : undefined}
        className="overflow-auto"
        style={fillViewport ? { maxHeight } : undefined}
      >
        <table className="w-max min-w-full border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className={cn(stickyHeader && 'sticky top-0 z-(--ds-z-sticky) bg-ds-surface-sunken')}>
            <tr className="border-b border-ds-border bg-ds-surface-sunken">
              {selectable && (
                <th scope="col" className="w-12 px-ds-3 py-ds-2">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleAll}
                    aria-label={t('ui.dataTable.selectAll')}
                  />
                </th>
              )}
              {visibleColumns.map((col) => {
                const isSorted = sortColumn === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    style={{ width: col.width }}
                    aria-sort={
                      isSorted ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                    className={cn(
                      'px-ds-3 py-ds-2 text-start text-xs font-medium whitespace-nowrap text-ds-foreground-muted',
                      col.minWidth,
                      col.align === 'center' && 'text-center',
                      col.align === 'right' && 'text-end',
                    )}
                  >
                    {col.sortable && onSort ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-ds-sm transition-colors hover:text-ds-foreground',
                          'focus-visible:ring-2 focus-visible:ring-ds-ring focus-visible:outline-none',
                          col.align === 'right' && 'flex-row-reverse',
                        )}
                      >
                        {col.header}
                        {isSorted ? (
                          sortDirection === 'asc' ? (
                            <ChevronUp className="size-3.5 text-ds-primary" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="size-3.5 text-ds-primary" aria-hidden="true" />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3.5 opacity-40" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
              {rowActions && (
                <th
                  scope="col"
                  className="sticky end-0 w-20 bg-ds-surface-sunken px-ds-3 py-ds-2"
                />
              )}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-ds-border">
                  {selectable && (
                    <td className="px-ds-3 py-ds-2">
                      <Skeleton className="size-4" />
                    </td>
                  )}
                  {visibleColumns.map((col) => (
                    <td key={col.key} className="px-ds-3 py-ds-2">
                      <Skeleton className="h-4 w-full max-w-45" />
                    </td>
                  ))}
                  {rowActions && <td className="px-ds-3 py-ds-2" />}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-ds-3 py-ds-8">
                  {emptyState ?? (
                    <p className="text-center text-sm text-ds-foreground-muted">{t('ui.dataTable.noResults')}</p>
                  )}
                </td>
              </tr>
            ) : (
              <>
                {padTop > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={colSpan} style={{ height: padTop, padding: 0 }} />
                  </tr>
                )}
                {rows.map((row, i) => {
                  const id = getRowId(row);
                  const isSelected = selection.has(id);
                  return (
                    <tr
                      key={id}
                      data-state={isSelected ? 'selected' : undefined}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      onKeyDown={
                        onRowClick
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onRowClick(row);
                              }
                            }
                          : undefined
                      }
                      tabIndex={onRowClick ? 0 : undefined}
                      className={cn(
                        'group border-b border-ds-border transition-colors',
                        'hover:bg-ds-surface-sunken',
                        'focus-visible:ring-2 focus-visible:ring-ds-ring focus-visible:outline-none',
                        isSelected && 'bg-ds-primary-subtle',
                        onRowClick && 'cursor-pointer',
                      )}
                    >
                      {selectable && (
                        <td
                          className="px-ds-3 py-ds-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleRow(id)}
                            aria-label={t('ui.dataTable.selectRow', { id })}
                          />
                        </td>
                      )}
                      {visibleColumns.map((col) => (
                        <td
                          key={col.key}
                          className={cn(
                            'px-ds-3 py-ds-2 text-ds-foreground',
                            col.wrap ? 'whitespace-normal' : 'whitespace-nowrap',
                            col.minWidth,
                            col.align === 'center' && 'text-center',
                            col.align === 'right' && 'text-end tabular-nums',
                          )}
                        >
                          {col.cell
                            ? col.cell(row, startIndex + i)
                            : String((row as Record<string, unknown>)[col.key] ?? '')}
                        </td>
                      ))}
                      {rowActions && (
                        <td
                          className={cn(
                            'sticky end-0 bg-ds-surface px-ds-3 py-ds-2 transition-colors',
                            'group-hover:bg-ds-surface-sunken group-data-[state=selected]:bg-ds-primary-subtle',
                          )}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-ds-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            {rowActions(row)}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {padBottom > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={colSpan} style={{ height: padBottom, padding: 0 }} />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
        {footer}
      </div>
    </div>
  );
}
