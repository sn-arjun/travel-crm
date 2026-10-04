'use client';

import * as React from 'react';
import { MoreHorizontal, Calendar, IndianRupee } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';

interface PipelineCardProps {
  title: string;
  contactName: string;
  contactAvatar?: string;
  value?: number;
  currency?: string;
  dueDate?: string;
  priority: 'hot' | 'warm' | 'cold';
  stage: string;
  className?: string;
  onDragStart?: () => void;
  onClick?: () => void;
}

export function PipelineCard({
  title,
  contactName,
  contactAvatar,
  value,
  dueDate,
  priority,
  className,
  onClick,
}: PipelineCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        'group relative cursor-pointer rounded-ds-lg border border-ds-border bg-ds-surface p-ds-4 shadow-ds-1',
        'transition-all duration-200 hover:border-ds-primary/30 hover:shadow-ds-2',
        'active:scale-[0.99]',
        'animate-scale-in focus-visible:ring-2 focus-visible:ring-ds-ring focus-visible:ring-offset-2',
        className,
      )}
    >
      {/* Priority indicator strip */}
      <div
        className={cn(
          'absolute left-0 top-3 bottom-3 w-0.5 rounded-full',
          priority === 'hot' && 'bg-ds-danger',
          priority === 'warm' && 'bg-ds-warning',
          priority === 'cold' && 'bg-ds-info',
        )}
      />

      <div className="pl-3">
        {/* Title */}
        <div className="mb-2 flex items-start justify-between gap-2">
          <h4 className="line-clamp-2 text-sm font-semibold leading-snug text-ds-foreground">
            {title}
          </h4>
          <button
            type="button"
            aria-label="More actions"
            className="rounded p-0.5 opacity-0 transition-opacity hover:bg-ds-surface-sunken group-hover:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4 text-ds-foreground-muted" />
          </button>
        </div>

        {/* Contact */}
        <div className="mb-2 flex items-center gap-2">
          <Avatar className="size-5">
            {contactAvatar && <AvatarImage src={contactAvatar} />}
            <AvatarFallback>{getInitials(contactName)}</AvatarFallback>
          </Avatar>
          <span className="truncate text-xs text-ds-foreground-muted">{contactName}</span>
        </div>

        {/* Meta row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            {value !== undefined && (
              <span className="flex items-center gap-1 text-xs font-medium tabular-nums text-ds-foreground">
                <IndianRupee className="h-3.5 w-3.5 text-ds-foreground-muted" />
                {value.toLocaleString('en-IN')}
              </span>
            )}
            {dueDate && (
              <span className="flex items-center gap-1 text-xs text-ds-foreground-muted">
                <Calendar className="h-3.5 w-3.5" />
                {dueDate}
              </span>
            )}
          </div>
          <Badge
            variant="outline"
            className={cn(
              priority === 'hot' && 'border-ds-danger bg-ds-danger-subtle text-ds-danger-on-subtle',
              priority === 'warm' && 'border-ds-warning bg-ds-warning-subtle text-ds-warning-on-subtle',
              priority === 'cold' && 'border-ds-info bg-ds-info-subtle text-ds-info-on-subtle',
            )}
          >
            {priority.charAt(0).toUpperCase() + priority.slice(1)}
          </Badge>
        </div>
      </div>
    </div>
  );
}
