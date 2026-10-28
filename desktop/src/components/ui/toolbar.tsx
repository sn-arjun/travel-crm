'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

import { Separator } from './separator';

export interface ToolbarProps {
  children: React.ReactNode;
  'aria-label': string;
  className?: string;
}

/**
 * Horizontal action bar. Groups are separated with `<Toolbar.Separator />`
 * and pushed apart with `<Toolbar.Spacer />`.
 */
export function Toolbar({ children, className, ...props }: ToolbarProps) {
  return (
    <div
      role="toolbar"
      className={cn('flex items-center gap-ds-2 rounded-ds-md', className)}
      {...props}
    >
      {children}
    </div>
  );
}

Toolbar.Separator = function ToolbarSeparator() {
  return <Separator orientation="vertical" className="mx-ds-1 h-5" />;
};

Toolbar.Spacer = function ToolbarSpacer() {
  return <div className="flex-1" aria-hidden="true" />;
};

Toolbar.Group = function ToolbarGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('flex items-center gap-ds-1', className)}>{children}</div>;
};
