'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

export interface SectionCardProps {
  title?: string;
  description?: string;
  /** Right-aligned header actions. */
  actions?: React.ReactNode;
  /** Renders a red asterisk beside the title — used by required form sections. */
  required?: boolean;
  /** Removes body padding, for tables that should bleed to the card edge. */
  flush?: boolean;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function SectionCard({
  title,
  description,
  actions,
  required,
  flush,
  footer,
  className,
  children,
}: SectionCardProps) {
  return (
    <section
      className={cn(
        'rounded-ds-lg border border-ds-border bg-ds-surface shadow-ds-1',
        className,
      )}
    >
      {(title || actions) && (
        <div className="flex items-start justify-between gap-ds-4 border-b border-ds-border px-ds-4 py-ds-3">
          <div className="min-w-0">
            {title && (
              <h2 className="text-sm font-semibold text-ds-foreground">
                {title}
                {required && (
                  <span aria-hidden="true" className="ml-1 text-ds-danger">
                    *
                  </span>
                )}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-ds-foreground-muted">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-ds-2">{actions}</div>}
        </div>
      )}

      <div className={cn(!flush && 'p-ds-4')}>{children}</div>

      {footer && (
        <div className="border-t border-ds-border px-ds-4 py-ds-3">{footer}</div>
      )}
    </section>
  );
}
