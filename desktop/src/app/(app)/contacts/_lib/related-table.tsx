'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { PaginatedResponse } from '@/lib/api/client';
import { cn } from '@/lib/utils';

export interface RelatedColumn<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

export interface RelatedQuery<T> {
  data: PaginatedResponse<T> | null;
  loading: boolean;
  error: { message?: string } | null;
  refetch: () => Promise<void>;
}

interface RelatedTableProps<T> {
  query: RelatedQuery<T>;
  columns: RelatedColumn<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyTitle: string;
  emptyDescription: string;
  /** Prefilled create action shown in the empty state. */
  emptyAction?: { label: string; href: string };
  testId: string;
}

/** Skeleton, error + retry, empty state and rows for one server-filtered related list. */
export function RelatedTable<T>({
  query,
  columns,
  rowKey,
  onRowClick,
  emptyTitle,
  emptyDescription,
  emptyAction,
  testId,
}: RelatedTableProps<T>) {
  const { data, loading, error, refetch } = query;

  if (loading) {
    return (
      <div className="flex flex-col gap-ds-2 p-ds-4" data-testid={`${testId}-loading`} aria-busy="true">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="flex flex-col items-center gap-ds-3 p-ds-6 text-center" data-testid={`${testId}-error`}>
        <AlertCircle className="size-6 text-ds-danger" aria-hidden="true" />
        <p className="text-sm text-ds-foreground-muted">{error.message || 'Could not load this list.'}</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const rows = data?.data ?? [];
  if (rows.length === 0) {
    return (
      <div data-testid={`${testId}-empty`}>
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          action={
            emptyAction && (
              <Button asChild size="sm">
                <Link href={emptyAction.href}>{emptyAction.label}</Link>
              </Button>
            )
          }
        />
      </div>
    );
  }

  return (
    <Table data-testid={testId}>
      <TableHeader>
        <TableRow>
          {columns.map((col) => (
            <TableHead key={col.header} className={col.className}>
              {col.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow
            key={rowKey(row)}
            className={cn(onRowClick && 'cursor-pointer')}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            {columns.map((col) => (
              <TableCell key={col.header} className={col.className}>
                {col.cell(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** "View all (N)" link into the full list filtered by this contact; hidden until there is something to view. */
export function ViewAllLink({ href, total }: { href: string; total: number | undefined }) {
  if (!total) return null;
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href={href}>View all ({total})</Link>
    </Button>
  );
}
