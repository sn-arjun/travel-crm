'use client';

import { useT } from '@/lib/i18n';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

const tagVariants = cva(
  'inline-flex items-center gap-1 rounded-ds-sm border font-medium transition-colors',
  {
    variants: {
      tone: {
        neutral: 'border-ds-border bg-ds-surface-sunken text-ds-foreground-muted',
        primary: 'border-transparent bg-ds-primary-subtle text-ds-primary-on-subtle',
        success: 'border-transparent bg-ds-success-subtle text-ds-success-on-subtle',
        warning: 'border-transparent bg-ds-warning-subtle text-ds-warning-on-subtle',
        danger: 'border-transparent bg-ds-danger-subtle text-ds-danger-on-subtle',
        info: 'border-transparent bg-ds-info-subtle text-ds-info-on-subtle',
      },
      size: {
        sm: 'px-1.5 py-0.5 text-[0.6875rem]',
        md: 'px-2 py-0.5 text-xs',
        lg: 'px-2.5 py-1 text-sm',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
);

export interface TagProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof tagVariants> {
  /** Renders a remove button. Label is derived from the tag's text content. */
  onRemove?: () => void;
  removeLabel?: string;
}

export function Tag({
  className,
  tone,
  size,
  onRemove,
  removeLabel,
  children,
  ...props
}: TagProps) {
  const t = useT();
  return (
    <span className={cn(tagVariants({ tone, size }), onRemove && 'pr-1', className)} {...props}>
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? t('ui.tag.remove')}
          className="rounded-ds-full p-0.5 transition-colors hover:bg-ds-border focus-visible:ring-2 focus-visible:ring-ds-ring focus-visible:outline-none"
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

export { tagVariants };
