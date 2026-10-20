'use client';

import * as React from 'react';
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';

export interface Column<T> {
  key: string;
  header: string;
  cell?: (row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  selectable?: boolean;
  selectedRows?: Set<string>;
  onSelectRows?: (rows: Set<string>) => void;
  getRowId?: (row: T) => string;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (column: string) => void;
  page?: number;
  pageSize?: number;
  totalItems?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  emptyMessage?: string;
  className?: string;
  onRowClick?: (row: T) => void;
  stickyHeader?: boolean;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading,
  selectable,
  selectedRows = new Set(),
  onSelectRows,
  getRowId = (row) => String(row.id),
  sortColumn,
  sortDirection,
  onSort,
  page = 1,
  pageSize = 20,
  totalItems,
  onPageChange,
  onPageSizeChange,
  emptyMessage: emptyMessageProp,
  className,
  onRowClick,
  stickyHeader = true,
}: DataTableProps<T>) {
  const t = useT();
  const emptyMessage = emptyMessageProp ?? t('ui.dataTable.emptyDefault');
  const allSelected = data.length > 0 && data.every((row) => selectedRows.has(getRowId(row)));
  const someSelected = data.some((row) => selectedRows.has(getRowId(row)));

  const handleSelectAll = () => {
    if (!onSelectRows) return;
    if (allSelected) {
      onSelectRows(new Set());
    } else {
      onSelectRows(new Set(data.map((row) => getRowId(row))));
    }
  };

  const handleSelectRow = (rowId: string) => {
    if (!onSelectRows) return;
    const next = new Set(selectedRows);
    if (next.has(rowId)) {
      next.delete(rowId);
    } else {
      next.add(rowId);
    }
    onSelectRows(next);
  };

  const totalPages = totalItems ? Math.ceil(totalItems / pageSize) : 1;

  return (
    <div className={cn('rounded-ds-lg border border-ds-border bg-ds-surface overflow-hidden animate-fade-in', className)}>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className={cn(stickyHeader && 'sticky top-0 z-10')}>
            <tr className="border-b border-ds-border bg-ds-surface-sunken/50">
              {selectable && (
                <th className="w-12 px-4 py-3" aria-label={t('ui.dataTable.selectAll')}>
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={handleSelectAll}
                    aria-label={t('ui.dataTable.selectAll')}
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-left font-medium text-ds-foreground-muted whitespace-nowrap',
                    col.align === 'center' && 'text-center',
                    col.align === 'right' && 'text-right',
                    col.sortable && 'cursor-pointer select-none hover:text-ds-foreground transition-colors',
                  )}
                  style={{ width: col.width }}
                  onClick={() => col.sortable && onSort?.(col.key)}
                  aria-label={col.sortable ? t('ui.dataTable.sortBy', { column: String(col.header) }) : undefined}
                  role={col.sortable ? 'button' : undefined}
                >
                  <div className={cn('flex items-center gap-1', col.align === 'right' && 'justify-end')}>
                    {col.header}
                    {col.sortable && (
                      <span className="ml-1">
                        {sortColumn === col.key ? (
                          sortDirection === 'asc' ? (
                            <ChevronUp className="h-3.5 w-3.5 text-ds-primary" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-ds-primary" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 opacity-30" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-ds-border">
                    {selectable && (
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-4" />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3">
                        <Skeleton className="h-4 w-full max-w-48" />
                      </td>
                    ))}
                  </tr>
                ))
              : data.length === 0
                ? (
                    <tr>
                      <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-12 text-center text-ds-foreground-muted">
                        {emptyMessage}
                      </td>
                    </tr>
                  )
                : data.map((row, idx) => {
                    const rowId = getRowId(row);
                    const isSelected = selectedRows.has(rowId);
                    return (
                      <tr
                        key={rowId}
                        onClick={() => onRowClick?.(row)}
                        className={cn(
                          'border-b border-ds-border transition-colors',
                          'hover:bg-ds-surface-sunken/50',
                          isSelected && 'bg-ds-primary-subtle',
                          onRowClick && 'cursor-pointer',
                          'animate-fade-in',
                        )}
                        style={{ animationDelay: `${idx * 20}ms`, animationFillMode: 'both' }}
                      >
                        {selectable && (
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={isSelected} onCheckedChange={() => handleSelectRow(rowId)} aria-label={t('ui.dataTable.selectRow', { id: String(rowId) })} />
                          </td>
                        )}
                        {columns.map((col) => (
                          <td
                            key={col.key}
                            className={cn(
                              'px-4 py-3',
                              col.align === 'center' && 'text-center',
                              col.align === 'right' && 'text-right tabular-nums',
                            )}
                          >
                            {col.cell ? col.cell(row, idx) : String(row[col.key] ?? '')}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {(totalItems !== undefined || onPageSizeChange) && (
        <div className="flex items-center justify-between border-t border-ds-border px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-ds-foreground-muted">
            {selectedRows.size > 0 && (
              <span className="font-medium text-ds-primary">{t('ui.common.selected', { count: selectedRows.size })}</span>
            )}
            {totalItems !== undefined && (
              <span>{t('ui.dataTable.total', { count: totalItems })}</span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {onPageSizeChange && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-ds-foreground-muted">{t('ui.dataTable.rowsLabel')}</span>
                <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
                  <SelectTrigger className="h-8 w-16 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50, 100].map((size) => (
                      <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {onPageChange && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-ds-foreground-muted mr-2">
                  {t('ui.pagination.pageOf', { page, total: totalPages })}
                </span>
                <Button variant="outline" size="icon-sm" aria-label={t('ui.pagination.first')} onClick={() => onPageChange(1)} disabled={page <= 1}>
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon-sm" aria-label={t('ui.pagination.previous')} onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon-sm" aria-label={t('ui.pagination.next')} onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon-sm" aria-label={t('ui.pagination.last')} onClick={() => onPageChange(totalPages)} disabled={page >= totalPages}>
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
