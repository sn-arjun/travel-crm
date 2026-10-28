'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

import { Badge } from './badge';

export interface Breadcrumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Rendered as a neutral badge next to the title — e.g. a total row count. */
  count?: number;
  /** Status badge shown beside the title (DetailPage uses this). */
  status?: React.ReactNode;
  breadcrumbs?: Breadcrumb[];
  /** Primary/secondary actions, end-aligned. */
  actions?: React.ReactNode;
  /** Back affordance rendered to the left of the title. */
  back?: React.ReactNode;
  /** Sticks to the top of the scroll container — used by EntityForm. */
  sticky?: boolean;
  className?: string;
}

export function PageHeader({
  title,
  description,
  count,
  status,
  breadcrumbs,
  actions,
  back,
  sticky = false,
  className,
}: PageHeaderProps) {
  const t = useT();
  return (
    <header
      className={cn(
        'flex flex-col gap-ds-2 border-b border-ds-border bg-ds-background pb-ds-4',
        sticky && 'sticky top-0 z-(--ds-z-sticky) pt-ds-4',
        className,
      )}
    >
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label={t('ui.breadcrumb')}>
          <ol className="flex items-center gap-ds-2 text-xs text-ds-foreground-muted">
            {breadcrumbs.map((crumb, i) => (
              <li key={`${crumb.label}-${i}`} className="flex items-center gap-ds-2">
                {i > 0 && <span aria-hidden="true">/</span>}
                {crumb.href ? (
                  <a
                    href={crumb.href}
                    className="rounded-ds-sm transition-colors hover:text-ds-foreground focus-visible:ring-2 focus-visible:ring-ds-ring focus-visible:outline-none"
                  >
                    {crumb.label}
                  </a>
                ) : (
                  <span aria-current="page" className="text-ds-foreground">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="flex items-start justify-between gap-ds-4">
        <div className="flex min-w-0 items-center gap-ds-3">
          {back}
          <div className="min-w-0">
            <div className="flex items-center gap-ds-2">
              <h1 className="truncate text-xl font-semibold tracking-tight text-ds-foreground">
                {title}
              </h1>
              {typeof count === 'number' && (
                <Badge variant="secondary" className="tabular-nums">
                  {count.toLocaleString()}
                </Badge>
              )}
              {status}
            </div>
            {description && (
              <p className="mt-0.5 truncate text-sm text-ds-foreground-muted">{description}</p>
            )}
          </div>
        </div>

        {actions && <div className="flex shrink-0 items-center gap-ds-2">{actions}</div>}
      </div>
    </header>
  );
}
