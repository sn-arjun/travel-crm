'use client';

import { useT } from '@/lib/i18n';
import { ChevronDown } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';

export interface SplitButtonAction {
  label: string;
  onSelect: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  /** Renders a separator above this item. */
  separatorBefore?: boolean;
  destructive?: boolean;
}

export interface SplitButtonProps {
  /** Label of the default (left-hand) action. */
  label: string;
  onClick: () => void;
  actions: SplitButtonAction[];
  variant?: React.ComponentProps<typeof Button>['variant'];
  size?: React.ComponentProps<typeof Button>['size'];
  disabled?: boolean;
  icon?: React.ReactNode;
  /** Accessible name for the dropdown half. */
  menuLabel?: string;
  className?: string;
}

export function SplitButton({
  label,
  onClick,
  actions,
  variant = 'default',
  size = 'default',
  disabled,
  icon,
  menuLabel,
  className,
}: SplitButtonProps) {
  const t = useT();
  return (
    <div className={cn('inline-flex items-stretch', className)}>
      <Button
        variant={variant}
        size={size}
        onClick={onClick}
        disabled={disabled}
        className="rounded-r-none"
      >
        {icon}
        {label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={variant}
            size={size === 'default' ? 'icon' : 'icon-sm'}
            disabled={disabled}
            aria-label={menuLabel ?? t('ui.common.moreActions')}
            className="rounded-l-none border-l border-ds-border/40"
          >
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {actions.map((action, i) => (
            <React.Fragment key={`${action.label}-${i}`}>
              {action.separatorBefore && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onSelect={action.onSelect}
                disabled={action.disabled}
                variant={action.destructive ? 'destructive' : 'default'}
              >
                {action.icon}
                {action.label}
              </DropdownMenuItem>
            </React.Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
