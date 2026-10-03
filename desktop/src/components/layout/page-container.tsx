import * as React from 'react';
import { cn } from '@/lib/utils';

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  /** `default` fills up to 2xl, `narrow` suits forms. */
  width?: 'default' | 'narrow';
}

/**
 * Standard page gutter and max width. Archetype pages (list, detail, form)
 * render inside it so every route lines up with the app shell.
 */
export function PageContainer({ children, className, width = 'default' }: PageContainerProps) {
  return (
    <div
      data-slot="page-container"
      className={cn(
        'mx-auto flex w-full min-w-0 flex-col gap-ds-4 px-ds-6 py-ds-5',
        width === 'default' && 'max-w-screen-2xl',
        width === 'narrow' && 'max-w-5xl',
        className,
      )}
    >
      {children}
    </div>
  );
}
