'use client';

import * as React from 'react';
import { MoreHorizontal, Calendar, DollarSign, User } from 'lucide-react';
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
  currency = 'INR',
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
        'group relative rounded-lg border border-border bg-card p-4 shadow-sm cursor-pointer',
        'transition-all duration-200 hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5',
        'active:scale-[0.99] active:shadow-sm',
        'animate-scale-in focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
    >
      {/* Priority indicator strip */}
      <div
        className={cn(
          'absolute left-0 top-3 bottom-3 w-0.5 rounded-full',
          priority === 'hot' && 'bg-red-500',
          priority === 'warm' && 'bg-amber-500',
          priority === 'cold' && 'bg-blue-500',
        )}
      />

      <div className="pl-3">
        {/* Title */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h4 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
            {title}
          </h4>
          <button className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted">
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Contact */}
        <div className="flex items-center gap-2 mb-2">
          <Avatar className="size-5">
            {contactAvatar && <AvatarImage src={contactAvatar} />}
            <AvatarFallback>{getInitials(contactName)}</AvatarFallback>
          </Avatar>
          <span className="text-xs text-muted-foreground truncate">{contactName}</span>
        </div>

        {/* Meta row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            {value !== undefined && (
              <span className="flex items-center gap-1 text-xs font-medium text-foreground tabular-nums">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                {value.toLocaleString()}
              </span>
            )}
            {dueDate && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                {dueDate}
              </span>
            )}
          </div>
          <Badge
            variant="outline"
            className={cn(
              priority === 'hot' && 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400',
              priority === 'warm' && 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400',
              priority === 'cold' && 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-400',
            )}
          >
            {priority}
          </Badge>
        </div>
      </div>
    </div>
  );
}
