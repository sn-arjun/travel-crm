'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

import { Button } from './button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  /** Extra content on the left, e.g. "3 selected". */
  children?: React.ReactNode;
  className?: string;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  children,
  className,
}: PaginationProps) {
  const t = useT();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label={t('ui.pagination.label')}
      className={cn(
        'flex items-center justify-between gap-ds-4 border-t border-ds-border px-ds-3 py-ds-2',
        className,
      )}
    >
      <div className="flex items-center gap-ds-3 text-xs text-ds-foreground-muted">
        {children}
        <span className="tabular-nums">
          {t('ui.pagination.range', { first, last, total: total.toLocaleString() })}
        </span>
      </div>

      <div className="flex items-center gap-ds-4">
        {onPageSizeChange && (
          <div className="flex items-center gap-ds-2">
            <span className="text-xs text-ds-foreground-muted">{t('ui.pagination.rows')}</span>
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
              <SelectTrigger className="h-8 w-17.5 text-xs" aria-label={t('ui.pagination.rowsPerPage')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center gap-ds-1">
          <span className="mr-ds-2 text-xs tabular-nums text-ds-foreground-muted">
            {t('ui.pagination.pageOf', { page, total: totalPages })}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(1)}
            disabled={page <= 1}
            aria-label={t('ui.pagination.first')}
          >
            <ChevronsLeft aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label={t('ui.pagination.previous')}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label={t('ui.pagination.next')}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages}
            aria-label={t('ui.pagination.last')}
          >
            <ChevronsRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </nav>
  );
}
