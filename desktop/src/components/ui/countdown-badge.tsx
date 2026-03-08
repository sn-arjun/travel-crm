'use client';

import * as React from 'react';
import { AlertTriangle, Shield, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const REF_DATE = Date.now();

export interface CountdownBadgeProps {
  expiryDate: string;
  label?: string;
  showIcon?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function CountdownBadge({ expiryDate, label, showIcon = true, size = 'sm', className }: CountdownBadgeProps) {
  const days = Math.ceil((new Date(expiryDate).getTime() - REF_DATE) / 86400000);

  const isOverdue = days < 0;
  const isUrgent = days >= 0 && days < 7;
  const isWarning = days >= 7 && days < 30;
  const isSafe = days >= 30;

  const colorClass = isOverdue
    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 animate-pulse'
    : isUrgent
    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    : isWarning
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';

  const Icon = isOverdue || isUrgent ? AlertTriangle : isWarning ? Clock : Shield;

  const text = isOverdue
    ? `${Math.abs(days)}d overdue`
    : `${days}d`;

  return (
    <Badge
      variant="outline"
      className={cn(
        'border-transparent font-medium gap-1',
        size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-xs px-2 py-0.5',
        colorClass,
        className
      )}
    >
      {showIcon && <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />}
      {label && <span>{label}:</span>}
      {text}
    </Badge>
  );
}
