'use client';

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  return (
    <div className={cn('space-y-1 animate-fade-in', className)}>
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-[var(--color-text-muted)]">
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight className="h-3 w-3" aria-hidden="true" />}
              {crumb.href ? (
                <a
                  href={crumb.href}
                  className="hover:text-[var(--color-text-primary)] transition-colors"
                >
                  {crumb.label}
                </a>
              ) : (
                <span className="text-[var(--color-text-primary)] font-medium">{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      {/* Title Row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-[-0.02em] truncate">
            {title}
          </h1>
          {badge}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0 animate-slide-in-from-right">
            {actions}
          </div>
        )}
      </div>

      {/* Description */}
      {description && (
        <p className="text-sm text-[var(--color-text-secondary)] max-w-2xl">
          {description}
        </p>
      )}
    </div>
  );
}
