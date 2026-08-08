'use client';

import { Download } from 'lucide-react';
import * as React from 'react';

import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { cn } from '@/lib/utils';

import { FilterBar } from './filter-bar';

export interface ListFilter {
  id: string;
  label: string;
  value: string;
}

export interface BulkAction<T> {
  label: string;
  icon?: React.ReactNode;
  onSelect: (rows: T[]) => void | Promise<void>;
  destructive?: boolean;
}

export interface ListPageProps<T> {
  title: string;
  description?: string;

  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;

  /**
   * Fetches one page. Receives the debounced search term and the active
   * filters so the server does the filtering.
   */
  fetcher: (params: {
    page: number;
    limit: number;
    search: string;
    filters: ListFilter[];
  }) => Promise<unknown>;

  /** Extracts the row array from the fetcher's response. */
  extractItems?: (response: unknown) => T[];
  /** Extracts the total count from the fetcher's response. */
  extractTotal?: (response: unknown) => number;

  // Header
  /** Primary action, e.g. a "New lead" button. */
  primaryAction?: React.ReactNode;
  headerActions?: React.ReactNode;

  // Filtering
  searchPlaceholder?: string;
  filters?: ListFilter[];
  onRemoveFilter?: (id: string) => void;
  onClearFilters?: () => void;
  onOpenFilters?: () => void;

  // Row interaction
  rowActions?: (row: T) => React.ReactNode;
  /** Rendered in a right-hand drawer when a row is clicked. */
  renderDetail?: (row: T) => React.ReactNode;
  detailTitle?: (row: T) => string;
  /** Use instead of `renderDetail` to navigate rather than open a drawer. */
  onRowClick?: (row: T) => void;

  // Bulk
  bulkActions?: BulkAction<T>[];

  // Export
  onExport?: (rows: T[]) => void | Promise<void>;
  exportLabel?: string;

  // Empty state
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: React.ReactNode;
  emptyAction?: React.ReactNode;

  limit?: number;
  className?: string;
}

/**
 * The list archetype: header + count, filter bar, sortable table with hover
 * actions, infinite scroll, detail drawer, bulk selection, and export.
 */
export function ListPage<T>({
  title,
  description,
  columns,
  getRowId,
  fetcher,
  extractItems,
  extractTotal,
  primaryAction,
  headerActions,
  searchPlaceholder = 'Search…',
  filters = [],
  onRemoveFilter,
  onClearFilters,
  onOpenFilters,
  rowActions,
  renderDetail,
  detailTitle,
  onRowClick,
  bulkActions = [],
  onExport,
  exportLabel = 'Export',
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyIcon,
  emptyAction,
  limit = 20,
  className,
}: ListPageProps<T>) {
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [detailRow, setDetailRow] = React.useState<T | null>(null);
  const [sortColumn, setSortColumn] = React.useState<string | undefined>();
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');
  const [exporting, setExporting] = React.useState(false);

  // Re-created whenever the query changes so useInfiniteScroll refetches
  // from page 1 rather than appending to a stale result set.
  const boundFetcher = React.useCallback(
    (page: number, pageLimit: number) =>
      fetcher({ page, limit: pageLimit, search: debouncedSearch, filters }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetcher, debouncedSearch, JSON.stringify(filters)],
  );

  const { items, loading, loadingMore, hasMore, total, sentinelRef } = useInfiniteScroll<T>({
    fetcher: boundFetcher,
    limit,
    extractItems: extractItems as never,
    extractTotal: extractTotal as never,
  });

  // Drop selections for rows that are no longer present.
  React.useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const present = new Set(items.map(getRowId));
      const next = new Set([...prev].filter((id) => present.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items, getRowId]);

  const selectedRows = React.useMemo(
    () => items.filter((r) => selectedIds.has(getRowId(r))),
    [items, selectedIds, getRowId],
  );

  const handleExport = async () => {
    if (!onExport) return;
    setExporting(true);
    try {
      await onExport(selectedRows.length > 0 ? selectedRows : items);
    } finally {
      setExporting(false);
    }
  };

  const handleRowClick = renderDetail ? (row: T) => setDetailRow(row) : onRowClick;

  return (
    <div className={cn('flex flex-col gap-ds-4', className)}>
      <PageHeader
        title={title}
        description={description}
        count={loading ? undefined : total}
        actions={
          <>
            {onExport && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={exporting || items.length === 0}
                className="gap-ds-2"
              >
                {exporting ? <Spinner className="size-4" /> : <Download aria-hidden="true" />}
                {exportLabel}
              </Button>
            )}
            {headerActions}
            {primaryAction}
          </>
        }
      />

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={searchPlaceholder}
        activeFilters={filters}
        onRemoveFilter={onRemoveFilter}
        onClearFilters={onClearFilters}
        onOpenFilters={onOpenFilters}
      />

      {/* Bulk action bar — only present while rows are selected */}
      {selectedIds.size > 0 && bulkActions.length > 0 && (
        <div className="flex items-center gap-ds-3 rounded-ds-md border border-ds-primary bg-ds-primary-subtle px-ds-3 py-ds-2">
          <span className="text-sm font-medium tabular-nums text-ds-primary-on-subtle">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-ds-2">
            {bulkActions.map((action) => (
              <Button
                key={action.label}
                variant={action.destructive ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => void action.onSelect(selectedRows)}
                className="gap-ds-2"
              >
                {action.icon}
                {action.label}
              </Button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto"
          >
            Clear
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={items}
        getRowId={getRowId}
        loading={loading}
        selectable={bulkActions.length > 0}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={(col, dir) => {
          setSortColumn(col);
          setSortDirection(dir);
        }}
        onRowClick={handleRowClick}
        rowActions={rowActions}
        emptyState={
          <EmptyState
            icon={emptyIcon}
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction ?? primaryAction}
          />
        }
      />

      {/* Infinite scroll sentinel */}
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-ds-4">
          {loadingMore && <Spinner className="size-5" />}
        </div>
      )}

      {/* Detail drawer */}
      {renderDetail && (
        <Sheet open={detailRow !== null} onOpenChange={(open) => !open && setDetailRow(null)}>
          <SheetContent className="w-full sm:max-w-xl">
            {detailRow && (
              <>
                <SheetHeader>
                  <SheetTitle>{detailTitle ? detailTitle(detailRow) : title}</SheetTitle>
                </SheetHeader>
                <div className="overflow-y-auto px-ds-4 pb-ds-4">{renderDetail(detailRow)}</div>
              </>
            )}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
