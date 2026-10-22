'use client';

import * as React from 'react';
import { ArrowRightLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useT } from '@/lib/i18n';

export interface MoveTarget {
  status: string;
  label: string;
  color: string;
}

/**
 * "Move to…" on a card: the keyboard and screen-reader way to do what a drop does.
 * Opens with Enter or Space, arrow keys choose a column, Enter moves the lead.
 */
export function MoveToMenu({
  title,
  currentLabel,
  targets,
  disabled,
  onMove,
  onOpenChange,
}: {
  title: string;
  currentLabel: string;
  targets: MoveTarget[];
  disabled?: boolean;
  onMove: (status: string) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useT();
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={disabled}
          aria-label={t('pipeline.move.label', { title })}
          title={t('pipeline.move.to')}
          data-testid="lead-card-move"
        >
          <ArrowRightLeft aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel className="text-xs font-normal text-ds-foreground-muted">
          {t('pipeline.move.current', { status: currentLabel })}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {targets.map((target) => (
          <DropdownMenuItem key={target.status} onSelect={() => onMove(target.status)} data-testid={`move-to-${target.status}`}>
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: target.color }} aria-hidden="true" />
            {target.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
