'use client';

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  className?: string;
  badge?: React.ReactNode;
}

export function PageHeader({ title, description, breadcrumbs, actions, className, badge }: PageHeaderProps) {
  const t = useT();
  return (
    <div className={cn('space-y-1 animate-fade-in', className)}>
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label={t('ui.breadcrumb')} className="flex items-center gap-1 text-sm text-ds-foreground-muted">
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight className="h-3 w-3" aria-hidden="true" />}
              {crumb.href ? (
                <a
                  href={crumb.href}
                  className="hover:text-ds-foreground transition-colors"
                >
                  {crumb.label}
                </a>
              ) : (
                <span className="text-ds-foreground font-medium">{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      {/* Title Row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-2xl font-bold text-ds-foreground tracking-[-0.02em] truncate">
            {title}
          </h1>
          {badge}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0 animate-slide-in-from-right rtl:animate-slide-in-from-left">
            {actions}
          </div>
        )}
      </div>

      {/* Description */}
      {description && (
        <p className="text-sm text-ds-foreground-muted max-w-2xl">
          {description}
        </p>
      )}
    </div>
  );
}
