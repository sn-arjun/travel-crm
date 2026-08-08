'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  /** Key names, e.g. ['Mod', 'K']. 'Mod' resolves to ⌘ on macOS, Ctrl elsewhere. */
  keys?: string[];
}

const GLYPHS: Record<string, string> = {
  Mod: 'Mod',
  Shift: '⇧',
  Alt: '⌥',
  Enter: '↵',
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

export function Kbd({ keys, className, children, ...props }: KbdProps) {
  // Resolved after mount so SSR and client markup agree.
  const [isMac, setIsMac] = React.useState(false);
  React.useEffect(() => {
    setIsMac(typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  const render = (key: string) => (key === 'Mod' ? (isMac ? '⌘' : 'Ctrl') : (GLYPHS[key] ?? key));

  return (
    <kbd
      className={cn(
        'inline-flex items-center gap-0.5 rounded-ds-sm border border-ds-border bg-ds-surface-sunken px-1.5 py-0.5',
        'font-mono text-[11px] font-medium text-ds-foreground-muted',
        className,
      )}
      {...props}
    >
      {keys ? keys.map(render).join(' ') : children}
    </kbd>
  );
}
