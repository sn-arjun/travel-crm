'use client';

import { AlertCircle, Download } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { PageContainer } from '@/components/layout/page-container';
import { useT } from '@/lib/i18n';

import { FilterBar } from './filter-bar';

export interface ListFilter {
  id: string;
  label: string;
  value: string;
}

export interface ListSort {
  column: string;
  direction: 'asc' | 'desc';
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
   * filters so the server does the filtering. The function may be an inline
   * closure: ListPage reads the latest one from a ref and only refetches when
   * the query (search / filters / sort / refreshKey) changes.
   */
  fetcher: (params: {
    page: number;
    limit: number;
    search: string;
    filters: ListFilter[];
    /** Only set when `serverSort` is enabled and a sort column is active. */
    sort?: ListSort;
  }) => Promise<unknown>;

  /** Extracts the row array from the fetcher's response (default: envelope helper). */
  extractItems?: (response: unknown) => T[];
  /** Extracts the total count from the fetcher's response (default: envelope helper). */
  extractTotal?: (response: unknown) => number;

  /**
   * Change this (e.g. bump a counter after a mutation) to reload from page 1.
   * Replaces `key={...}` remounts: the page keeps its search text, selection
   * and scroll position.
   */
  refreshKey?: string | number;
  /**
   * Opt in when `fetcher` honours `params.sort`. Without it the column headers
   * are not clickable, so there are no dead sort controls.
   */
  serverSort?: boolean;
  /** Initial sort, passed to the fetcher when `serverSort` is on. */
  defaultSort?: ListSort;

  // Header
  /** Primary action, e.g. a "New lead" button. */
  primaryAction?: React.ReactNode;
  headerActions?: React.ReactNode;

  // Filtering
  searchPlaceholder?: string;
  /** Controlled search text. Omit to let the list own it; pair with `onSearchChange` to clear it from the page. */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
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
  refreshKey,
  serverSort = false,
  defaultSort,
  primaryAction,
  headerActions,
  searchPlaceholder: searchPlaceholderProp,
  searchValue,
  onSearchChange,
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
  exportLabel: exportLabelProp,
  emptyTitle: emptyTitleProp,
  emptyDescription,
  emptyIcon,
  emptyAction,
  limit = 20,
  className,
}: ListPageProps<T>) {
  const t = useT();
  const searchPlaceholder = searchPlaceholderProp ?? t('ui.listPage.searchPlaceholder');
  const exportLabel = exportLabelProp ?? t('common.export');
  const emptyTitle = emptyTitleProp ?? t('ui.listPage.emptyTitle');
  const [ownSearch, setOwnSearch] = React.useState('');
  const search = searchValue ?? ownSearch;
  const setSearch = React.useCallback(
    (value: string) => {
      setOwnSearch(value);
      onSearchChange?.(value);
    },
    [onSearchChange],
  );
  const debouncedSearch = useDebouncedValue(search, 300);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [detailRow, setDetailRow] = React.useState<T | null>(null);
  const [sortColumn, setSortColumn] = React.useState<string | undefined>(defaultSort?.column);
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>(
    defaultSort?.direction ?? 'asc',
  );
  const [exporting, setExporting] = React.useState(false);

  const sort = React.useMemo<ListSort | undefined>(
    () => (serverSort && sortColumn ? { column: sortColumn, direction: sortDirection } : undefined),
    [serverSort, sortColumn, sortDirection],
  );

  // Page 1 reloads only when the query really changes - never because the
  // parent re-rendered and handed us a fresh inline fetcher.
  const queryKey = React.useMemo(
    () =>
      JSON.stringify({
        search: debouncedSearch,
        filters,
        sort: sort ?? null,
        refreshKey: refreshKey ?? null,
      }),
    [debouncedSearch, filters, sort, refreshKey],
  );

  // Stable wrapper that reads the latest props from a ref.
  const latest = React.useRef({ fetcher, debouncedSearch, filters, sort });
  latest.current = { fetcher, debouncedSearch, filters, sort };
  const boundFetcher = React.useCallback((page: number, pageLimit: number) => {
    const cur = latest.current;
    return cur.fetcher({
      page,
      limit: pageLimit,
      search: cur.debouncedSearch,
      filters: cur.filters,
      ...(cur.sort ? { sort: cur.sort } : {}),
    });
  }, []);

  const {
    items,
    loading,
    loadingMore,
    hasMore,
    total,
    error,
    loadMoreError,
    sentinelRef,
    refetch,
    retryLoadMore,
  } = useInfiniteScroll<T>({
    fetcher: boundFetcher,
    limit,
    extractItems: extractItems as never,
    extractTotal: extractTotal as never,
    queryKey,
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
    } catch {
      toast.error(t('ui.listPage.exportFailed', { title: title.toLowerCase() }));
    } finally {
      setExporting(false);
    }
  };

  const handleRowClick = renderDetail ? (row: T) => setDetailRow(row) : onRowClick;

  return (
    <PageContainer className={className}>
      <PageHeader
        title={title}
        description={description}
        count={loading || error ? undefined : total}
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
            {t('ui.common.selected', { count: selectedIds.size })}
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
            {t('common.clear')}
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
        onSort={
          serverSort
            ? (col, dir) => {
                setSortColumn(col);
                setSortDirection(dir);
              }
            : undefined
        }
        onRowClick={handleRowClick}
        rowActions={rowActions}
        emptyState={
          error ? (
            <Alert variant="destructive" data-testid="list-error">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>{t('ui.listPage.loadFailed', { title: title.toLowerCase() })}</AlertTitle>
              <AlertDescription>
                <p>{error.message}</p>
                <Button variant="outline" size="sm" onClick={refetch}>
                  {t('ui.common.retry')}
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <EmptyState
              icon={emptyIcon}
              title={emptyTitle}
              description={emptyDescription}
              action={emptyAction ?? primaryAction}
            />
          )
        }
        footer={
          hasMore || loadMoreError ? (
            <div ref={sentinelRef} className="flex items-center justify-center gap-ds-3 py-ds-4">
              {loadingMore && <Spinner className="size-5" />}
              {loadMoreError && (
                <>
                  <span className="text-sm text-ds-danger">
                    {t('ui.listPage.loadMoreFailed', { message: loadMoreError.message })}
                  </span>
                  <Button variant="outline" size="sm" onClick={retryLoadMore}>
                    {t('ui.common.retry')}
                  </Button>
                </>
              )}
            </div>
          ) : null
        }
      />

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
    </PageContainer>
  );
}
